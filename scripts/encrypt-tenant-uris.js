#!/usr/bin/env node
'use strict';

/**
 * Encrypt tenant database URIs at rest — the fix for sql/FINDINGS.md F-4.
 *
 * The platform `clinics` collection stores each clinic's `dbUri` as a plain
 * `mongodb+srv://user:password@host/db` string. The code intended otherwise:
 * `tenantConnectionManager.js` opened with "Platform DB stores each clinic's
 * encrypted dbUri", but `_resolveTenantUri` encrypted only the copy it wrote to
 * the Redis cache and returned the database value raw. The `select: false` flag
 * on the field was the only protection actually in force — that guards against
 * accidental exposure in an API response, not against anyone who can read the
 * collection.
 *
 * Anyone with read access to the platform database therefore held every tenant's
 * database credentials.
 *
 * Order of operations
 * -------------------
 * The read path must be deployed BEFORE this script runs. `_resolveTenantUri`
 * now calls `decryptIfEncrypted`, which accepts both shapes; running this first
 * against a fleet still on the old code would break every tenant lookup until the
 * deploy caught up.
 *
 * Encryption is at rest only. The value is decrypted in memory on each lookup, so
 * anyone who can run the application can still obtain it — that is inherent to
 * the application needing to connect. What changes is that a database dump, a
 * backup, or a read-only console no longer hands over 27 sets of credentials.
 *
 * Safety
 * ------
 * Dry run by default. `--apply` is required to write, and every original value is
 * saved to a timestamped backup file first, because a wrong or lost
 * APP_ENCRYPTION_KEY would otherwise make every clinic permanently unreachable.
 *
 * Usage:
 *   node scripts/encrypt-tenant-uris.js                 # preview, writes nothing
 *   node scripts/encrypt-tenant-uris.js --apply
 *   node scripts/encrypt-tenant-uris.js --verify        # confirm each value decrypts
 *   node scripts/encrypt-tenant-uris.js --rollback=<backup file>
 */

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
require('dns').setServers(
  (process.env.SQL_DNS_SERVERS || '8.8.8.8,8.8.4.4').split(',').map((s) => s.trim()).filter(Boolean)
);

const {
  encrypt, decrypt, isEncrypted,
} = require('../src/utils/encryption');

const BACKUP_DIR = path.resolve(__dirname, 'backups');

const argv = process.argv.slice(2);
const flag = (n, d = null) => {
  const hit = argv.find((a) => a === `--${n}` || a.startsWith(`--${n}=`));
  if (!hit) return d;
  const eq = hit.indexOf('=');
  return eq === -1 ? true : hit.slice(eq + 1);
};
const write = (s) => process.stdout.write(s);

/** Show enough of a URI to identify it, never enough to use it. */
function redact(uri) {
  return String(uri || '').replace(/\/\/([^:/@]+):([^@]+)@/, '//$1:***@');
}

async function connect() {
  const uri = process.env.PLATFORM_DB_URI;
  if (!uri) throw new Error('PLATFORM_DB_URI is not set.');
  await mongoose.connect(uri);
  return mongoose.connection;
}

function requireKey() {
  const key = process.env.APP_ENCRYPTION_KEY;
  if (!key || !/^[0-9a-f]{64}$/i.test(key)) {
    throw new Error(
      'APP_ENCRYPTION_KEY must be a 64-character hex string (32 bytes). '
      + 'Generate one with:  node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
    );
  }
  return key;
}

/* ── Actions ───────────────────────────────────────────────── */

async function inspect(conn) {
  const clinics = await conn.db.collection('clinics')
    .find({}, { projection: { slug: 1, name: 1, dbUri: 1 } })
    .toArray();

  const plaintext = clinics.filter((c) => c.dbUri && !isEncrypted(c.dbUri));
  const encrypted = clinics.filter((c) => c.dbUri && isEncrypted(c.dbUri));
  const missing = clinics.filter((c) => !c.dbUri);

  return { clinics, plaintext, encrypted, missing };
}

async function apply(conn, key) {
  const { plaintext } = await inspect(conn);
  if (!plaintext.length) return { encrypted: 0, backupFile: null };

  /**
   * The backup is written and flushed before the first update.
   *
   * These are the only copies of credentials that reach the live clinic
   * databases. If the key is later lost or rotated without re-encrypting, every
   * clinic becomes unreachable and there is no way to derive the values back.
   */
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFile = path.join(BACKUP_DIR, `tenant-uris-plaintext-${stamp}.json`);
  fs.writeFileSync(
    backupFile,
    `${JSON.stringify(plaintext.map((c) => ({ _id: String(c._id), slug: c.slug, dbUri: c.dbUri })), null, 2)}\n`,
    { encoding: 'utf8', mode: 0o600 }
  );
  write(`  backup written: ${path.relative(process.cwd(), backupFile)}  (mode 0600)\n`);
  write('  KEEP THIS FILE SAFE, AND DELETE IT ONCE THE ENCRYPTED VALUES ARE CONFIRMED WORKING.\n\n');

  let count = 0;
  for (const clinic of plaintext) {
    const payload = encrypt(clinic.dbUri, key);

    // Verify before writing. An encrypt/decrypt round trip that does not return
    // the original means the value would be unrecoverable the moment it is
    // stored — better to fail here, with the plaintext still in place.
    if (decrypt(payload, key) !== clinic.dbUri) {
      throw new Error(`Round-trip check failed for "${clinic.slug}" — nothing further was written.`);
    }

    await conn.db.collection('clinics').updateOne(
      { _id: clinic._id },
      { $set: { dbUri: payload, dbUriEncryptedAt: new Date() } }
    );
    write(`  encrypted  ${String(clinic.slug).padEnd(28)} ${redact(clinic.dbUri)}\n`);
    count += 1;
  }
  return { encrypted: count, backupFile };
}

/**
 * Prove every stored value still yields a usable URI.
 *
 * Worth running separately from `--apply`, because the failure this catches —
 * a value that encrypts fine and cannot be read back with the key the
 * application actually has — appears at connection time, on a clinic, in
 * production.
 */
async function verify(conn, key) {
  const { clinics } = await inspect(conn);
  const problems = [];

  for (const clinic of clinics) {
    if (!clinic.dbUri) { problems.push(`${clinic.slug}: no dbUri at all`); continue; }
    if (!isEncrypted(clinic.dbUri)) { problems.push(`${clinic.slug}: still plaintext`); continue; }
    try {
      const plain = decrypt(clinic.dbUri, key);
      if (!/^mongodb(\+srv)?:\/\//i.test(plain)) {
        problems.push(`${clinic.slug}: decrypted to something that is not a MongoDB URI`);
      } else {
        write(`  ok         ${String(clinic.slug).padEnd(28)} ${redact(plain)}\n`);
      }
    } catch (err) {
      problems.push(`${clinic.slug}: will not decrypt — ${err.message}`);
    }
  }
  return problems;
}

async function rollback(conn, file) {
  const entries = JSON.parse(fs.readFileSync(file, 'utf8'));
  let count = 0;
  for (const entry of entries) {
    await conn.db.collection('clinics').updateOne(
      { _id: new mongoose.Types.ObjectId(entry._id) },
      { $set: { dbUri: entry.dbUri }, $unset: { dbUriEncryptedAt: '' } }
    );
    write(`  restored   ${String(entry.slug).padEnd(28)} ${redact(entry.dbUri)}\n`);
    count += 1;
  }
  return count;
}

/* ── Main ──────────────────────────────────────────────────── */

(async function main() {
  let conn = null;
  try {
    const key = requireKey();
    conn = await connect();

    const rollbackFile = flag('rollback');
    if (rollbackFile && rollbackFile !== true) {
      write(`\nRolling back from ${rollbackFile}\n${'-'.repeat(70)}\n`);
      const n = await rollback(conn, rollbackFile);
      write(`${'-'.repeat(70)}\n${n} clinic(s) restored to plaintext.\n\n`);
      return;
    }

    if (flag('verify')) {
      write(`\nVerifying stored tenant URIs\n${'-'.repeat(70)}\n`);
      const problems = await verify(conn, key);
      write(`${'-'.repeat(70)}\n`);
      if (problems.length) {
        for (const p of problems) write(`  PROBLEM  ${p}\n`);
        write(`\n${problems.length} problem(s).\n\n`);
        process.exitCode = 1;
      } else {
        write('\nEvery stored URI is encrypted and decrypts to a valid MongoDB URI.\n\n');
      }
      return;
    }

    const { clinics, plaintext, encrypted, missing } = await inspect(conn);

    write(`\nTenant URI encryption at rest  (F-4)\n${'-'.repeat(70)}\n`);
    write(`  clinics            ${clinics.length}\n`);
    write(`  already encrypted  ${encrypted.length}\n`);
    write(`  PLAINTEXT          ${plaintext.length}\n`);
    write(`  no dbUri           ${missing.length}\n\n`);

    if (!plaintext.length) {
      write('Nothing to do — no plaintext URIs remain.\n\n');
      return;
    }

    for (const c of plaintext) {
      write(`  would encrypt  ${String(c.slug).padEnd(28)} ${redact(c.dbUri)}\n`);
    }

    if (!flag('apply')) {
      write(`\n${'-'.repeat(70)}\n`);
      write('DRY RUN — nothing was written.\n\n');
      write('Before running with --apply, confirm both:\n');
      write('  1. The deployed code reads through decryptIfEncrypted (src/db/tenantConnectionManager.js).\n');
      write('     Running this first would break every tenant lookup until that deploy lands.\n');
      write('  2. APP_ENCRYPTION_KEY is the value the application will actually have, and is backed up.\n');
      write('     A lost key makes every clinic permanently unreachable.\n\n');
      write('Then:  node scripts/encrypt-tenant-uris.js --apply\n\n');
      return;
    }

    write(`\n${'-'.repeat(70)}\nApplying\n${'-'.repeat(70)}\n`);
    const { encrypted: n, backupFile } = await apply(conn, key);
    write(`${'-'.repeat(70)}\n${n} clinic(s) encrypted.\n\n`);
    write('Next:\n');
    write('  node scripts/encrypt-tenant-uris.js --verify     confirm every value decrypts\n');
    write('  (then check a real tenant request succeeds, and delete the backup)\n');
    if (backupFile) write(`  rollback: node scripts/encrypt-tenant-uris.js --rollback=${path.relative(process.cwd(), backupFile)}\n`);
    write('\n');
  } catch (err) {
    process.stderr.write(`\n${err.message}\n\n`);
    process.exitCode = 1;
  } finally {
    if (conn) await mongoose.disconnect().catch(() => {});
  }
})();
