#!/usr/bin/env node
'use strict';

/**
 * Rebuild the missing VideoSession records — sql/FINDINGS.md F-2.
 *
 * Every clinic that has ever held chat data has lost 100% of its video sessions:
 * 77 chat messages point at 18 sessions that no longer exist, and 8 emergency
 * sessions point at 8 more. `ChatMessage.session` is `required: true`, so those
 * messages could not have been written without a session id — the sessions
 * existed and were removed.
 *
 * What this reconstructs, and what it does not
 * -------------------------------------------
 * **Reconstructed from surviving evidence:** that a session existed, its id, who
 * was in it, and when it ran. All of that is recoverable — the id carries its own
 * creation timestamp, the chat messages name the participants and their roles,
 * and the message times bound the session window.
 *
 * **Not invented:** nothing clinical. `diagnosis`, `notes`, `reason`,
 * `recordingUrl`, `prescription` and the consent flags are left empty rather than
 * filled with plausible values. A reconstructed record that looks like a complete
 * clinical record is worse than a missing one, because the next reader cannot
 * tell the difference.
 *
 * Every record is marked. `notes` states the provenance in plain language and
 * `reconstructedAt` records when — so these are always distinguishable from
 * originals, in the database itself and not only in this file.
 *
 * Safety: dry run by default; `--apply` is required to write.
 *
 * Usage:
 *   node scripts/reconstruct-video-sessions.js --slug=jathar-dental
 *   node scripts/reconstruct-video-sessions.js --slug=jathar-dental --apply
 *   node scripts/reconstruct-video-sessions.js --slug=jathar-dental --apply --target=both
 *   node scripts/reconstruct-video-sessions.js --slug=jathar-dental --undo
 */

const path = require('path');
const mongoose = require('mongoose');
const knexLib = require('knex');

require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
require('dns').setServers(
  (process.env.SQL_DNS_SERVERS || '8.8.8.8,8.8.4.4').split(',').map((s) => s.trim()).filter(Boolean)
);

const config = require('../sql/config');
const { schemaFor } = require('../sql/tenant/naming');
const { decryptIfEncrypted } = require('../src/utils/encryption');

const argv = process.argv.slice(2);
const flag = (n, d = null) => {
  const hit = argv.find((a) => a === `--${n}` || a.startsWith(`--${n}=`));
  if (!hit) return d;
  const eq = hit.indexOf('=');
  return eq === -1 ? true : hit.slice(eq + 1);
};
const write = (s) => process.stdout.write(s);

const SLUG = flag('slug', 'jathar-dental');
const APPLY = Boolean(flag('apply'));
const UNDO = Boolean(flag('undo'));
const TARGET = flag('target', 'postgres'); // postgres | mongo | both

/**
 * The marker that makes a reconstructed record self-identifying, forever.
 *
 * Shared with CP-4, which subtracts these rows before comparing MongoDB and
 * PostgreSQL counts — otherwise a deliberate repair reads as a migration failure.
 */
const { RECONSTRUCTED_VIDEO_SESSION: PROVENANCE } = require('../sql/lib/provenance');

const idTimestamp = (id) => new Date(parseInt(String(id).trim().slice(0, 8), 16) * 1000);

function pg() {
  return knexLib({
    client: 'pg',
    connection: {
      host: config.postgres.host,
      port: config.postgres.port,
      database: config.postgres.database,
      user: config.postgres.user,
      password: config.postgres.password,
    },
    pool: { min: 0, max: 4 },
  });
}

/* ── Working out what each session was ─────────────────────── */

/**
 * Build one session per missing id, from whatever evidence names it.
 *
 * PostgreSQL is the source for this analysis even when the write target is Mongo,
 * because the data is already loaded there and the joins are straightforward. The
 * ids are identical on both sides — preserving them is a deliberate decision of
 * the migration — so a session derived here applies equally to either database.
 */
async function derive(knex, schema) {
  const clinicRow = await knex(`${schema}.patients`).select('clinic_id').first();
  const clinicId = clinicRow ? String(clinicRow.clinic_id).trim() : null;

  const sessions = new Map();

  /* From chat messages: participants and the message window. */
  const { rows: chat } = await knex.raw(`
    select cm.session_id,
           count(*)::int                            as message_count,
           min(cm.created_at)                       as first_message,
           max(cm.created_at)                       as last_message,
           min(cm.created_at) filter (where cm.sender_role = 'patient') as first_patient_message,
           (array_agg(distinct cm.sender_id) filter (where cm.sender_role = 'patient'))[1]  as patient_user_id,
           (array_agg(distinct cm.sender_id) filter (where cm.sender_role = 'doctor'))[1]   as doctor_user_id
    from ${schema}.chat_messages cm
    where not exists (select 1 from ${schema}.video_sessions v where v.id = cm.session_id)
    group by cm.session_id
    order by 3
  `);

  for (const r of chat) {
    const sessionId = String(r.session_id).trim();
    const patientUserId = r.patient_user_id ? String(r.patient_user_id).trim() : null;
    const doctorUserId = r.doctor_user_id ? String(r.doctor_user_id).trim() : null;

    // A chat sender is a *user*; VideoSession.patient references a Patient record.
    const patient = patientUserId
      ? await knex(`${schema}.patients`).select('id').where('user_id', patientUserId).first()
      : null;

    sessions.set(sessionId, {
      id: sessionId,
      clinicId,
      source: 'chat_messages',
      evidence: `${r.message_count} chat message(s), ${doctorUserId ? 'doctor and patient' : 'patient only'}`,
      patientId: patient ? String(patient.id).trim() : null,
      patientUserId,
      doctorId: doctorUserId,
      // A chat session between a doctor and a patient is a teleconsultation, not
      // an emergency — `emergency` is reserved for the sessions below, which say
      // so themselves.
      type: 'scheduled',
      status: 'ended',
      createdAt: idTimestamp(sessionId),
      startedAt: r.first_message,
      endedAt: r.last_message,
      messageCount: r.message_count,
    });
  }

  /* From emergency sessions: the participants are on the row itself. */
  const { rows: emergencies } = await knex.raw(`
    select es.id, es.video_session_id, es.patient_id, es.doctor_id, es.status,
           es.created_at, es.started_at, es.ended_at
    from ${schema}.emergency_sessions es
    where es.video_session_id is not null
      and not exists (select 1 from ${schema}.video_sessions v where v.id = es.video_session_id)
  `);

  for (const r of emergencies) {
    const sessionId = String(r.video_session_id).trim();
    const existing = sessions.get(sessionId);

    const derived = {
      id: sessionId,
      clinicId,
      source: existing ? 'chat_messages + emergency_sessions' : 'emergency_sessions',
      evidence: `emergency session ${String(r.id).trim()}`,
      patientId: r.patient_id ? String(r.patient_id).trim() : (existing ? existing.patientId : null),
      doctorId: r.doctor_id ? String(r.doctor_id).trim() : (existing ? existing.doctorId : null),
      type: 'emergency',
      // The emergency session recorded how it ended; that is better evidence than
      // any default, so it is preferred where present.
      status: ['ended', 'cancelled', 'no_show', 'expired'].includes(r.status) ? r.status : 'ended',
      createdAt: r.created_at || idTimestamp(sessionId),
      startedAt: r.started_at || r.created_at,
      endedAt: r.ended_at,
      messageCount: existing ? existing.messageCount : 0,
    };
    sessions.set(sessionId, existing ? { ...existing, ...derived } : derived);
  }

  return [...sessions.values()];
}

/* ── Writing ───────────────────────────────────────────────── */

function toPgRow(s) {
  return {
    id: s.id,
    clinic_id: s.clinicId,
    type: s.type,
    status: s.status,
    patient_id: s.patientId,
    doctor_id: s.doctorId,
    started_at: s.startedAt,
    ended_at: s.endedAt,
    duration: s.startedAt && s.endedAt
      ? Math.max(0, Math.round((new Date(s.endedAt) - new Date(s.startedAt)) / 1000))
      : null,
    notes: PROVENANCE,
    connection_log: '[]',
    shared_files: '[]',
    created_at: s.createdAt,
    updated_at: new Date(),
  };
}

async function writePostgres(knex, schema, sessions) {
  let written = 0;
  for (const s of sessions) {
    // Upsert, so a re-run corrects rather than duplicates.
    await knex(`${schema}.video_sessions`).insert(toPgRow(s)).onConflict(['id']).merge();
    written += 1;
  }
  return written;
}

async function writeMongo(sessions, clinic) {
  const uri = decryptIfEncrypted(clinic.dbUri, process.env.APP_ENCRYPTION_KEY);
  const conn = await mongoose.createConnection(uri).asPromise();
  try {
    const col = conn.db.collection('videosessions');
    let written = 0;
    for (const s of sessions) {
      const doc = {
        _id: new mongoose.Types.ObjectId(s.id),
        type: s.type,
        status: s.status,
        patient: s.patientId ? new mongoose.Types.ObjectId(s.patientId) : null,
        doctor: s.doctorId ? new mongoose.Types.ObjectId(s.doctorId) : null,
        startedAt: s.startedAt || null,
        endedAt: s.endedAt || null,
        notes: PROVENANCE,
        reconstructedAt: new Date(),
        connectionLog: [],
        sharedFiles: [],
        createdAt: s.createdAt,
        updatedAt: new Date(),
      };
      await col.updateOne({ _id: doc._id }, { $set: doc }, { upsert: true });
      written += 1;
    }
    return written;
  } finally {
    await conn.close();
  }
}

/**
 * Remove only what this script created.
 *
 * Matched on the provenance marker rather than on the id list, so it can never
 * delete an original record — including one that is later restored from a backup
 * under the same id.
 */
async function undo(knex, schema, clinic) {
  const n = await knex(`${schema}.video_sessions`).where('notes', PROVENANCE).del();
  write(`  postgres   removed ${n} reconstructed session(s)\n`);

  if (TARGET === 'mongo' || TARGET === 'both') {
    const uri = decryptIfEncrypted(clinic.dbUri, process.env.APP_ENCRYPTION_KEY);
    const conn = await mongoose.createConnection(uri).asPromise();
    try {
      const r = await conn.db.collection('videosessions').deleteMany({ notes: PROVENANCE });
      write(`  mongo      removed ${r.deletedCount} reconstructed session(s)\n`);
    } finally {
      await conn.close();
    }
  }
}

/* ── Main ──────────────────────────────────────────────────── */

(async function main() {
  const schema = schemaFor(SLUG);
  const knex = pg();
  let platform = null;

  try {
    platform = await mongoose.connect(process.env.PLATFORM_DB_URI);
    const clinic = await mongoose.connection.db.collection('clinics')
      .findOne({ slug: SLUG }, { projection: { slug: 1, dbUri: 1 } });
    if (!clinic) throw new Error(`No clinic "${SLUG}" in the platform database.`);

    if (UNDO) {
      write(`\nRemoving reconstructed sessions for ${SLUG}\n${'-'.repeat(72)}\n`);
      await undo(knex, schema, clinic);
      write('\n');
      return;
    }

    const sessions = await derive(knex, schema);

    write(`\nVideoSession reconstruction — ${SLUG}  (F-2)\n${'='.repeat(72)}\n`);
    if (!sessions.length) {
      write('\nNothing to reconstruct: no chat message or emergency session references a missing video session.\n\n');
      return;
    }

    write(`\n${sessions.length} session(s) can be rebuilt from surviving evidence:\n\n`);
    write(`  ${'session id'.padEnd(26)}${'type'.padEnd(11)}${'when'.padEnd(18)}${'patient'.padEnd(10)}${'doctor'.padEnd(9)}evidence\n`);
    write(`  ${'-'.repeat(100)}\n`);
    for (const s of sessions) {
      write(`  ${s.id.padEnd(26)}${s.type.padEnd(11)}`
        + `${(s.createdAt ? s.createdAt.toISOString().slice(0, 16) : '?').padEnd(18)}`
        + `${(s.patientId ? 'yes' : 'MISSING').padEnd(10)}`
        + `${(s.doctorId ? 'yes' : '—').padEnd(9)}${s.evidence}\n`);
    }

    const noPatient = sessions.filter((s) => !s.patientId);
    if (noPatient.length) {
      write(`\n  ! ${noPatient.length} session(s) have no resolvable patient. `);
      write('`patient` is required, so these are skipped rather than written with a placeholder.\n');
    }

    const writable = sessions.filter((s) => s.patientId);

    write(`\n${'-'.repeat(72)}\n`);
    write('What is reconstructed: that the session existed, its id, who was in it, when it ran.\n');
    write('What is NOT: any clinical content. diagnosis, reason, recording and consent stay empty.\n');
    write('Every record carries a provenance note, so it is always distinguishable from an original.\n');

    if (!APPLY) {
      write(`\nDRY RUN — nothing was written. ${writable.length} session(s) would be created.\n\n`);
      write(`Apply with:  node scripts/reconstruct-video-sessions.js --slug=${SLUG} --apply\n`);
      write(`             ... --target=both     to write MongoDB as well as PostgreSQL\n`);
      write(`Undo with:   node scripts/reconstruct-video-sessions.js --slug=${SLUG} --undo\n\n`);
      return;
    }

    write(`\n${'-'.repeat(72)}\nApplying (target: ${TARGET})\n${'-'.repeat(72)}\n`);

    if (TARGET === 'postgres' || TARGET === 'both') {
      const n = await writePostgres(knex, schema, writable);
      write(`  postgres   ${n} session(s) written to ${schema}.video_sessions\n`);
    }
    if (TARGET === 'mongo' || TARGET === 'both') {
      const n = await writeMongo(writable, clinic);
      write(`  mongo      ${n} session(s) written to videosessions\n`);
    }

    /* Report what the reconstruction actually repaired. */
    const { rows: after } = await knex.raw(`
      select
        (select count(*)::int from ${schema}.chat_messages c
          where not exists (select 1 from ${schema}.video_sessions v where v.id = c.session_id)) as chat_orphans,
        (select count(*)::int from ${schema}.emergency_sessions e
          where e.video_session_id is not null
            and not exists (select 1 from ${schema}.video_sessions v where v.id = e.video_session_id)) as emergency_orphans
    `);
    write(`\n  broken chat_messages remaining:      ${after[0].chat_orphans}\n`);
    write(`  broken emergency_sessions remaining: ${after[0].emergency_orphans}\n`);
    write(`\nUndo at any time: node scripts/reconstruct-video-sessions.js --slug=${SLUG} --undo\n\n`);
  } catch (err) {
    process.stderr.write(`\n${err.stack || err.message}\n\n`);
    process.exitCode = 1;
  } finally {
    await knex.destroy();
    if (platform) await mongoose.disconnect().catch(() => {});
  }
})();
