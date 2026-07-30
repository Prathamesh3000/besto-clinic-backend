#!/usr/bin/env node
'use strict';

/**
 * Patch seed: Backfills consultation data for completed appointments.
 *
 * 1. Creates TreatmentRecords for completed appointments that are missing them
 * 2. Patches ALL TreatmentRecords to have the new fields (careTasks, doctorSignature, status, etc.)
 * 3. Migrates old teeth schema {number, condition, procedure} → {tooth, conditions[]}
 *
 * Usage:
 *   node scripts/patch-consultation-data.js [tenantSlug]
 *
 * Default slug: jathar-dental
 */

require('dotenv').config();
const mongoose = require('mongoose');
const { connectPlatformDB } = require('../src/db/platformConnection');
const { connectRedis } = require('../src/config/redis');
const { getTenantConnection } = require('../src/db/tenantConnectionManager');

const SLUG = process.argv[2] || 'jathar-dental';

// ── Reference data ──────────────────────────────────────────────────

const DENTAL_DIAGNOSES = [
  'Dental caries in tooth 36', 'Dental caries in tooth 46', 'Dental caries in tooth 26',
  'Irreversible pulpitis tooth 46', 'Irreversible pulpitis tooth 36',
  'Reversible pulpitis tooth 15', 'Periapical abscess tooth 21',
  'Impacted third molar 38', 'Impacted third molar 48',
  'Chronic generalized periodontitis', 'Gingivitis',
  'Fractured tooth 11', 'Missing tooth 46', 'TMJ dysfunction',
  'Class II malocclusion', 'Dental fluorosis (mild)',
];

const DENTAL_TREATMENTS = [
  'Composite restoration Class I', 'Root canal treatment - single canal',
  'Root canal treatment - multi canal', 'Surgical extraction under LA',
  'Simple extraction under LA', 'Scaling and root planing (full mouth)',
  'Crown preparation (PFM)', 'Crown preparation (Zirconia)',
  'In-office teeth whitening', 'Fluoride varnish application',
  'Porcelain veneer preparation', 'Implant placement (stage 1)',
];

const CHIEF_COMPLAINTS = [
  'Severe toothache, pain radiating to ear',
  'Sensitivity to hot and cold beverages for 2 weeks',
  'Bleeding gums while brushing for the past month',
  'Broken tooth after biting on hard food',
  'Pain and swelling on the lower right side',
  'Routine dental checkup, no specific complaints',
  'Tooth discoloration, desires brighter smile',
  'Loose tooth with pus discharge',
  'Difficulty chewing on the left side',
  'Follow-up after previous dental procedure',
  'Jaw pain and clicking sound while opening mouth',
  'Bad breath despite regular brushing',
];

const TREATMENT_PLANS = [
  'Complete root canal treatment in 2 visits. Post and core + crown after healing.',
  'Extract tooth under LA. Reassess for bridge/implant at follow-up.',
  'Full mouth scaling today. Re-evaluate gingival health in 6 weeks.',
  'Composite filling today. Monitor sensitivity for 2 weeks.',
  'Crown preparation and impression. Cementation in 7-10 days.',
  'Begin orthodontic treatment with fixed brackets. Monthly adjustments.',
  'In-office whitening session. Take-home kit for maintenance.',
  'Surgical extraction + suturing. Suture removal in 7 days.',
  'Periodontal assessment complete. Phase 1 SRP recommended.',
  'Implant assessment done. Schedule CBCT and treatment planning.',
];

const FOLLOW_UP_INSTRUCTIONS = [
  'Avoid chewing on treated side for 24-48 hours. Soft diet recommended.',
  'Take prescribed medications regularly. Complete the full antibiotic course.',
  'Rinse with warm saltwater 3 times daily starting tomorrow.',
  'Apply ice pack to cheek if swelling occurs (20 min on, 20 min off).',
  'Return in 1 week for suture removal and healing assessment.',
  'Brush gently around the treated area. Resume normal brushing after 48 hours.',
  'Avoid hot, spicy, and crunchy foods for 48 hours.',
  'Do not smoke or use straws for 24 hours after the procedure.',
  'Contact the clinic immediately if persistent bleeding or severe pain occurs.',
  'Follow-up appointment scheduled. Bring any previous X-rays.',
];

const DENTAL_MEDICATIONS = [
  { name: 'Amoxicillin', dosage: '500mg', frequency: 'Three times a day', duration: '5 days', notes: 'After meals' },
  { name: 'Ibuprofen', dosage: '400mg', frequency: 'Three times a day', duration: '3 days', notes: 'After meals for pain' },
  { name: 'Metronidazole', dosage: '400mg', frequency: 'Three times a day', duration: '5 days', notes: 'After meals, avoid alcohol' },
  { name: 'Paracetamol', dosage: '650mg', frequency: 'Three times a day', duration: '3 days', notes: 'As needed for pain' },
  { name: 'Chlorhexidine Mouthwash', dosage: '0.2%', frequency: 'Twice a day', duration: '14 days', notes: 'Rinse for 30 seconds' },
  { name: 'Diclofenac Sodium', dosage: '50mg', frequency: 'Twice a day', duration: '3 days', notes: 'After meals' },
];

const CARE_TASK_TEMPLATES = [
  { title: 'Take prescribed antibiotics', taskType: 'medication', instructions: 'Complete the full course as prescribed', frequency: 'thrice_daily' },
  { title: 'Take pain medication', taskType: 'medication', instructions: 'Take after meals for pain relief', frequency: 'thrice_daily' },
  { title: 'Brush teeth gently', taskType: 'hygiene', instructions: 'Use soft-bristled brush, gentle strokes around treated area', frequency: 'twice_daily' },
  { title: 'Saltwater rinse', taskType: 'post_care', instructions: 'Warm saltwater rinse after 24 hours', frequency: 'twice_daily' },
  { title: 'Use chlorhexidine mouthwash', taskType: 'hygiene', instructions: 'Rinse for 30 seconds, do not eat/drink for 30 min after', frequency: 'twice_daily' },
  { title: 'Soft diet', taskType: 'dietary', instructions: 'Avoid hard, crunchy, hot, and spicy foods', frequency: 'once' },
  { title: 'Apply cold compress', taskType: 'post_care', instructions: 'Ice pack to cheek, 20 min on / 20 min off', frequency: 'once' },
  { title: 'Floss daily', taskType: 'hygiene', instructions: 'Floss between all teeth gently before bedtime', frequency: 'once' },
  { title: 'Avoid smoking', taskType: 'post_care', instructions: 'No smoking for at least 48 hours after procedure', frequency: 'once' },
  { title: 'Follow-up appointment', taskType: 'follow_up', instructions: 'Return for scheduled follow-up visit', frequency: 'once' },
];

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

function randomCareTasks() {
  const count = randomInt(2, 5);
  const shuffled = [...CARE_TASK_TEMPLATES].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count).map(t => ({
    ...t,
    enabled: true,
    reminderEnabled: Math.random() > 0.2,
  }));
}

function randomTeeth() {
  const count = randomInt(1, 3);
  const teeth = [];
  const conditions = ['cavity', 'filling', 'pain', 'missing'];
  for (let i = 0; i < count; i++) {
    const tooth = randomInt(11, 48);
    if (!teeth.find(t => t.tooth === tooth)) {
      const numConditions = randomInt(1, 2);
      const conds = [...conditions].sort(() => Math.random() - 0.5).slice(0, numConditions);
      teeth.push({ tooth, conditions: conds });
    }
  }
  return teeth;
}

// Fake base64 signature (a tiny 1x1 transparent PNG — valid dataUrl for seeding)
const FAKE_SIGNATURE_DATA_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGQAAAAyCAYAAACx2VjTAAAABGdBTUEAALGPC/xhBQAAACBjSFJNAAB6JgAAgIQAAPoAAACA6AAAdTAAAOpgAAA6mAAAF3CculE8AAAABmJLR0QA/wD/AP+gvaeTAAAACXBIWXMAAA7DAAAOwwHHb6hkAAAAB3RJTUUH6gQRCBQZlFQo0AAAAFpJREFUeNrt0jERACAQBLDj3z8zLoIKBph0SZXsNrOrqs5tPPzWeoL/GYQYhBiEGIQYhBiEGIQYhBiEGIQYhBiEGIQYhBiEGIQYhBiEGIQYhBiEGIQYhHwDkB4F0c2GAOsAAAAASUVORK5CYII=';

// ── Main ─────────────────────────────────────────────────────────────

async function patch() {
  console.log(`\nPatching consultation data for tenant: ${SLUG}\n`);

  await connectPlatformDB();
  await connectRedis();
  const conn = await getTenantConnection(SLUG);
  const Appointment = conn.model('Appointment');
  const TreatmentRecord = conn.model('TreatmentRecord');

  // ─── Step 1: Find completed appointments missing TreatmentRecords ───

  const completedAppts = await Appointment.find({
    status: 'completed',
    deletedAt: null,
  }).lean();
  console.log(`Found ${completedAppts.length} completed appointments`);

  const existingTRs = await TreatmentRecord.find({
    appointment: { $in: completedAppts.map(a => a._id) },
    deletedAt: null,
  }).lean();
  console.log(`Found ${existingTRs.length} existing treatment records`);

  const existingApptIds = new Set(existingTRs.map(tr => String(tr.appointment)));
  const missingAppts = completedAppts.filter(a => !existingApptIds.has(String(a._id)));
  console.log(`${missingAppts.length} completed appointments have no TreatmentRecord\n`);

  // ─── Step 2: Create TreatmentRecords for missing appointments ───────

  if (missingAppts.length > 0) {
    console.log('Creating TreatmentRecords for missing appointments...');

    // Drop problematic index if it exists
    try {
      await conn.collection('treatmentrecords').dropIndex('externalId_1_externalSource_1');
    } catch (_) {}

    const newDocs = missingAppts.map(appt => {
      const completedAt = appt.completedAt || appt.scheduledAt;
      const meds = [pick(DENTAL_MEDICATIONS)];
      if (Math.random() < 0.5) meds.push(pick(DENTAL_MEDICATIONS));

      return {
        patient: appt.patient,
        doctor: appt.doctor,
        appointment: appt._id,
        chiefComplaint: pick(CHIEF_COMPLAINTS),
        examination: Math.random() < 0.6 ? 'Intraoral examination performed. No extra-oral abnormalities noted.' : '',
        oralFindings: Math.random() < 0.5 ? 'Soft tissue normal. Oral hygiene: fair. Calculus present on lingual surfaces of lower anteriors.' : '',
        diagnosis: pick(DENTAL_DIAGNOSES),
        treatment: pick(DENTAL_TREATMENTS),
        severity: pick(['mild', 'moderate', 'severe', null]),
        assessmentNotes: Math.random() < 0.4 ? 'Radiographic findings consistent with clinical diagnosis.' : '',
        treatmentPlan: pick(TREATMENT_PLANS),
        followUpInstructions: pick(FOLLOW_UP_INSTRUCTIONS),
        procedure: pick(DENTAL_TREATMENTS),
        priority: pick(['routine', 'urgent', null]),
        estimatedCost: Math.random() < 0.5 ? randomInt(500, 15000) : undefined,
        visitType: pick(['Consultation', 'Follow-up', 'Review Visit', 'Check-up']),
        teeth: randomTeeth(),
        prescription: meds.map(m => ({
          medication: m.name,
          dosage: m.dosage,
          frequency: m.frequency,
          duration: m.duration,
          notes: m.notes,
        })),
        careTasks: randomCareTasks(),
        doctorSignature: {
          dataUrl: FAKE_SIGNATURE_DATA_URL,
          signedAt: completedAt,
          signedBy: appt.doctor,
          ipAddress: '127.0.0.1',
        },
        patientConsent: Math.random() < 0.7 ? 'Verbal consent obtained' : '',
        status: 'completed',
        completedAt,
        notes: Math.random() < 0.3 ? 'Patient tolerated procedure well. Post-operative instructions given.' : '',
        followUpDate: Math.random() < 0.4 ? new Date(Date.now() + randomInt(7, 30) * 86400000) : undefined,
        createdBy: appt.doctor,
        createdAt: completedAt,
      };
    });

    const inserted = await TreatmentRecord.insertMany(newDocs);
    console.log(`  ✅ Created ${inserted.length} new TreatmentRecords\n`);
  }

  // ─── Step 3: Patch existing TreatmentRecords with new fields ────────

  console.log('Patching existing TreatmentRecords with new fields...');

  const allTRs = await TreatmentRecord.find({ deletedAt: null });
  let patched = 0;

  for (const tr of allTRs) {
    let changed = false;

    // Migrate old teeth schema: {number, condition, procedure} → {tooth, conditions[]}
    if (tr.teeth && tr.teeth.length > 0) {
      const firstTooth = tr.teeth[0];
      if (firstTooth.number !== undefined && firstTooth.tooth === undefined) {
        tr.teeth = tr.teeth.map(t => ({
          tooth: t.number || t.tooth,
          conditions: [t.condition, t.procedure].filter(Boolean),
        }));
        changed = true;
      }
    }

    // Add chiefComplaint if missing
    if (!tr.chiefComplaint) {
      tr.chiefComplaint = pick(CHIEF_COMPLAINTS);
      changed = true;
    }

    // Add treatmentPlan if missing
    if (!tr.treatmentPlan) {
      tr.treatmentPlan = pick(TREATMENT_PLANS);
      changed = true;
    }

    // Add followUpInstructions if missing
    if (!tr.followUpInstructions) {
      tr.followUpInstructions = pick(FOLLOW_UP_INSTRUCTIONS);
      changed = true;
    }

    // Add careTasks if empty
    if (!tr.careTasks || tr.careTasks.length === 0) {
      tr.careTasks = randomCareTasks();
      changed = true;
    }

    // Add doctorSignature if missing
    if (!tr.doctorSignature || !tr.doctorSignature.dataUrl) {
      tr.doctorSignature = {
        dataUrl: FAKE_SIGNATURE_DATA_URL,
        signedAt: tr.completedAt || tr.createdAt,
        signedBy: tr.doctor,
        ipAddress: '127.0.0.1',
      };
      changed = true;
    }

    // Set status to completed if missing
    if (!tr.status || tr.status !== 'completed') {
      tr.status = 'completed';
      tr.completedAt = tr.completedAt || tr.createdAt;
      changed = true;
    }

    // Add procedure if missing
    if (!tr.procedure) {
      tr.procedure = tr.treatment || pick(DENTAL_TREATMENTS);
      changed = true;
    }

    if (changed) {
      await tr.save();
      patched++;
    }
  }

  console.log(`  ✅ Patched ${patched}/${allTRs.length} existing TreatmentRecords\n`);
  console.log('Done!');
}

patch()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Patch failed:', err);
    process.exit(1);
  });
