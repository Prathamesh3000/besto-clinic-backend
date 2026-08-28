#!/usr/bin/env node
'use strict';

/**
 * Seed system consultation templates for a tenant.
 *
 * Usage:
 *   node scripts/seed-consultation-templates.js <tenantSlug>
 *
 * Example:
 *   node scripts/seed-consultation-templates.js jathar-dental
 */

require('dotenv').config();
const mongoose = require('mongoose');
const { connectPlatformDB } = require('../src/db/platformConnection');
const { connectRedis } = require('../src/config/redis');
const { getTenantConnection } = require('../src/db/tenantConnectionManager');

/**
 * Maps each consultation template code → the ProcedureTemplate code it corresponds to.
 * When the inventory seed has already been run, this links them automatically.
 */
const PROCEDURE_LINK = {
  RCT:     'PROC-END-001',   // Root Canal Treatment → Root Canal (Single Canal)
  SEXT:    'PROC-SUR-001',   // Simple Extraction → Tooth Extraction (Simple)
  SUREXT:  'PROC-SUR-002',   // Surgical Extraction → Surgical Extraction (Impacted)
  CFILL:   'PROC-COS-001',   // Composite Filling → Composite Filling (Direct)
  SCALE:   'PROC-PER-001',   // Scaling & Polishing → Scaling & Root Planing
  CRPREP:  'PROC-PRO-001',   // Crown Preparation → PFM Crown Placement
  ORTHCON: 'PROC-ORT-001',   // Orthodontic Consultation → Metal Braces Installation
  IMPCON:  'PROC-IMP-001',   // Implant Consultation → Dental Implant Placement
  WHITE:   'PROC-COS-002',   // Teeth Whitening → Teeth Whitening (In-Office)
  // PERIASS — no direct procedure template (it's purely assessment)
};

const TEMPLATES = [
  {
    name: 'Root Canal Treatment',
    code: 'RCT',
    category: 'endodontic',
    description: 'Standard root canal therapy for infected or inflamed pulp',
    chiefComplaint: 'Severe toothache, sensitivity to hot/cold, swelling',
    diagnosis: 'Irreversible pulpitis / Periapical abscess',
    treatment: 'Root canal treatment — access opening, pulp extirpation, biomechanical preparation, obturation',
    treatmentPlan: 'Complete RCT in 1-2 visits. Post & core + crown after healing assessment.',
    followUpInstructions: 'Avoid chewing on treated side for 24-48 hours. Follow up in 1 week for assessment. Crown placement recommended within 4 weeks.',
    defaultProcedure: 'Root Canal Treatment',
    defaultPriority: 'urgent',
    defaultPrescriptions: [
      { medication: 'Amoxicillin 500mg', dosage: '500mg', frequency: 'Thrice daily', duration: '5 days', notes: 'Take after meals' },
      { medication: 'Ibuprofen 400mg', dosage: '400mg', frequency: 'Thrice daily', duration: '3 days', notes: 'Take after meals for pain relief' },
    ],
    defaultCareTasks: [
      { title: 'Take prescribed antibiotics', taskType: 'medication', instructions: 'Complete the full course of antibiotics as prescribed', frequency: 'thrice_daily' },
      { title: 'Take pain medication', taskType: 'medication', instructions: 'Take ibuprofen as needed for pain', frequency: 'thrice_daily' },
      { title: 'Saltwater rinse', taskType: 'post_care', instructions: 'Gently rinse with warm saltwater after 24 hours', frequency: 'twice_daily' },
      { title: 'Soft diet', taskType: 'dietary', instructions: 'Eat soft foods and avoid chewing on the treated side', frequency: 'once' },
    ],
  },
  {
    name: 'Simple Extraction',
    code: 'SEXT',
    category: 'surgery',
    description: 'Non-surgical tooth extraction for visible, erupted teeth',
    chiefComplaint: 'Decayed / damaged tooth, pain',
    diagnosis: 'Grossly decayed tooth — non-restorable',
    treatment: 'Simple extraction under local anesthesia',
    treatmentPlan: 'Extract tooth. Assess for prosthetic replacement at follow-up.',
    followUpInstructions: 'Bite on gauze for 30 min. No spitting, rinsing, or using straws for 24 hours. Soft foods for 48 hours.',
    defaultProcedure: 'Simple Extraction',
    defaultPriority: 'routine',
    defaultPrescriptions: [
      { medication: 'Ibuprofen 400mg', dosage: '400mg', frequency: 'Thrice daily', duration: '3 days', notes: 'Take after meals for pain and inflammation' },
    ],
    defaultCareTasks: [
      { title: 'Apply gauze pressure', taskType: 'post_care', instructions: 'Bite on gauze pad for 30-45 minutes to control bleeding', frequency: 'once' },
      { title: 'Cold compress', taskType: 'post_care', instructions: 'Apply ice pack to cheek (20 min on, 20 min off) for first 24 hours', frequency: 'once' },
      { title: 'Soft diet', taskType: 'dietary', instructions: 'Eat soft foods and avoid hot, spicy, or crunchy foods for 48 hours', frequency: 'once' },
      { title: 'Take pain medication', taskType: 'medication', instructions: 'Take ibuprofen as prescribed for pain', frequency: 'thrice_daily' },
    ],
  },
  {
    name: 'Surgical Extraction',
    code: 'SUREXT',
    category: 'surgery',
    description: 'Surgical removal of impacted or broken teeth',
    chiefComplaint: 'Impacted tooth, pain, recurrent infection around wisdom tooth',
    diagnosis: 'Impacted third molar / Impacted tooth requiring surgical removal',
    treatment: 'Surgical extraction — flap elevation, bone removal if needed, tooth sectioning, extraction, suturing',
    treatmentPlan: 'Surgical extraction under LA. Suture removal in 7-10 days.',
    followUpInstructions: 'Apply cold compress for first 24 hours. Suture removal in 7-10 days. Avoid smoking and using straws.',
    defaultProcedure: 'Surgical Extraction',
    defaultPriority: 'urgent',
    defaultPrescriptions: [
      { medication: 'Amoxicillin 500mg', dosage: '500mg', frequency: 'Thrice daily', duration: '5 days', notes: 'Complete the full course' },
      { medication: 'Ibuprofen 400mg', dosage: '400mg', frequency: 'Thrice daily', duration: '5 days', notes: 'Take after meals' },
      { medication: 'Chlorhexidine Mouthwash', dosage: '10ml', frequency: 'Twice daily', duration: '7 days', notes: 'Start rinsing after 24 hours' },
    ],
    defaultCareTasks: [
      { title: 'Take antibiotics', taskType: 'medication', instructions: 'Complete the full course of Amoxicillin', frequency: 'thrice_daily' },
      { title: 'Take pain medication', taskType: 'medication', instructions: 'Take ibuprofen for pain management', frequency: 'thrice_daily' },
      { title: 'Cold compress', taskType: 'post_care', instructions: 'Apply ice pack externally for 20 min on/off', frequency: 'once' },
      { title: 'Use chlorhexidine rinse', taskType: 'hygiene', instructions: 'Gently rinse with chlorhexidine mouthwash (start after 24 hours)', frequency: 'twice_daily' },
      { title: 'Soft diet', taskType: 'dietary', instructions: 'Soft diet for 3-5 days, avoid hot and spicy foods', frequency: 'once' },
    ],
  },
  {
    name: 'Composite Filling',
    code: 'CFILL',
    category: 'cosmetic',
    description: 'Tooth-colored composite resin restoration',
    chiefComplaint: 'Cavity / tooth sensitivity / chipped tooth',
    diagnosis: 'Dental caries — Class I/II/III/IV/V',
    treatment: 'Caries removal and direct composite restoration',
    treatmentPlan: 'Remove decay, restore with composite resin. Single visit.',
    followUpInstructions: 'Avoid eating on the restored side for 2 hours. Mild sensitivity is normal for 1-2 weeks.',
    defaultProcedure: 'Composite Filling',
    defaultPriority: 'routine',
    defaultPrescriptions: [
      { medication: 'Ibuprofen 200mg', dosage: '200mg', frequency: 'As needed', duration: '2 days', notes: 'Only if experiencing sensitivity or discomfort' },
    ],
    defaultCareTasks: [
      { title: 'Avoid hard foods', taskType: 'dietary', instructions: 'Avoid biting on hard or sticky foods on the restored tooth for 24 hours', frequency: 'once' },
      { title: 'Maintain oral hygiene', taskType: 'hygiene', instructions: 'Brush gently around the restored area. Resume normal brushing after 24 hours.', frequency: 'twice_daily' },
    ],
  },
  {
    name: 'Scaling & Polishing',
    code: 'SCALE',
    category: 'periodontal',
    description: 'Professional dental cleaning — supragingival and subgingival scaling',
    chiefComplaint: 'Tartar buildup, bleeding gums, bad breath',
    diagnosis: 'Gingivitis / Calculus deposits',
    treatment: 'Ultrasonic scaling and polishing',
    treatmentPlan: 'Full mouth scaling and polishing. Re-evaluate gingival health in 4-6 weeks.',
    followUpInstructions: 'Mild sensitivity and bleeding may persist for 1-2 days. Maintain twice-daily brushing and daily flossing.',
    defaultProcedure: 'Scaling & Polishing',
    defaultPriority: 'routine',
    defaultPrescriptions: [],
    defaultCareTasks: [
      { title: 'Brush twice daily', taskType: 'hygiene', instructions: 'Use a soft-bristled toothbrush, brush for 2 minutes each time', frequency: 'twice_daily' },
      { title: 'Floss daily', taskType: 'hygiene', instructions: 'Floss between all teeth once daily before bedtime', frequency: 'once' },
      { title: 'Saltwater rinse', taskType: 'post_care', instructions: 'Rinse with warm saltwater if gums feel sore', frequency: 'twice_daily' },
    ],
  },
  {
    name: 'Crown Preparation',
    code: 'CRPREP',
    category: 'prosthetic',
    description: 'Full crown preparation, impression, and temporary crown placement',
    chiefComplaint: 'Broken / weakened tooth, post-RCT restoration needed',
    diagnosis: 'Structurally compromised tooth requiring full coverage restoration',
    treatment: 'Tooth preparation for PFM/zirconia crown, impression, temporary crown cementation',
    treatmentPlan: 'Visit 1: Prep and impression. Visit 2: Permanent crown cementation (7-10 days later).',
    followUpInstructions: 'Avoid sticky foods on the temporary crown. Return in 7-10 days for permanent crown.',
    defaultProcedure: 'Crown Preparation',
    defaultPriority: 'routine',
    defaultPrescriptions: [
      { medication: 'Ibuprofen 200mg', dosage: '200mg', frequency: 'As needed', duration: '2 days', notes: 'For any post-preparation sensitivity' },
    ],
    defaultCareTasks: [
      { title: 'Protect temporary crown', taskType: 'post_care', instructions: 'Avoid sticky and hard foods on the temporary crown side', frequency: 'once' },
      { title: 'Gentle brushing', taskType: 'hygiene', instructions: 'Brush gently around the temporary crown; floss carefully', frequency: 'twice_daily' },
    ],
  },
  {
    name: 'Orthodontic Consultation',
    code: 'ORTHCON',
    category: 'orthodontic',
    description: 'Initial orthodontic assessment and treatment planning',
    chiefComplaint: 'Misaligned teeth, crowding, spacing, bite issues',
    diagnosis: 'Malocclusion — Class I/II/III',
    treatment: 'Orthodontic assessment — clinical examination, diagnostic records, treatment planning',
    treatmentPlan: 'Take impressions / intraoral scan. Present treatment options (braces/aligners) with timeline and cost estimate at next visit.',
    followUpInstructions: 'Treatment plan discussion at next appointment. Bring any previous dental records or X-rays.',
    defaultProcedure: 'Orthodontic Assessment',
    defaultPriority: 'routine',
    defaultPrescriptions: [],
    defaultCareTasks: [
      { title: 'Follow-up appointment', taskType: 'follow_up', instructions: 'Schedule follow-up for treatment plan discussion', frequency: 'once' },
    ],
  },
  {
    name: 'Periodontal Assessment',
    code: 'PERIASS',
    category: 'periodontal',
    description: 'Comprehensive periodontal examination with pocket charting',
    chiefComplaint: 'Bleeding gums, loose teeth, gum recession, persistent bad breath',
    diagnosis: 'Chronic periodontitis — mild/moderate/severe',
    treatment: 'Full periodontal charting, pocket depth measurement, assessment of attachment loss and mobility',
    treatmentPlan: 'Phase 1: Scaling and root planing. Re-evaluate in 4-6 weeks. Phase 2: Surgical intervention if needed.',
    followUpInstructions: 'Maintain strict oral hygiene. Use prescribed mouthwash. Follow up for SRP appointment.',
    defaultProcedure: 'Periodontal Assessment',
    defaultPriority: 'routine',
    defaultPrescriptions: [
      { medication: 'Chlorhexidine Mouthwash', dosage: '10ml', frequency: 'Twice daily', duration: '14 days', notes: 'Rinse for 30 seconds, do not eat/drink for 30 min after' },
    ],
    defaultCareTasks: [
      { title: 'Use chlorhexidine rinse', taskType: 'hygiene', instructions: 'Rinse with chlorhexidine mouthwash twice daily', frequency: 'twice_daily' },
      { title: 'Interdental cleaning', taskType: 'hygiene', instructions: 'Use interdental brushes or floss daily to clean between teeth', frequency: 'once' },
      { title: 'Follow-up for SRP', taskType: 'follow_up', instructions: 'Schedule scaling and root planing appointment', frequency: 'once' },
    ],
  },
  {
    name: 'Implant Consultation',
    code: 'IMPCON',
    category: 'prosthetic',
    description: 'Dental implant assessment and treatment planning',
    chiefComplaint: 'Missing tooth/teeth, desire for fixed replacement',
    diagnosis: 'Edentulous ridge — single/multiple tooth loss',
    treatment: 'Clinical and radiographic assessment for implant placement. Evaluate bone volume, soft tissue, and occlusion.',
    treatmentPlan: 'CBCT scan for bone assessment. Present implant treatment plan with timeline (3-6 months) and cost at next visit.',
    followUpInstructions: 'CBCT scan appointment to be scheduled. Bring any existing prosthetics to next visit.',
    defaultProcedure: 'Implant Assessment',
    defaultPriority: 'routine',
    defaultPrescriptions: [],
    defaultCareTasks: [
      { title: 'Schedule CBCT scan', taskType: 'follow_up', instructions: 'Book CBCT scan for implant planning', frequency: 'once' },
      { title: 'Follow-up appointment', taskType: 'follow_up', instructions: 'Schedule follow-up for treatment plan discussion after CBCT', frequency: 'once' },
    ],
  },
  {
    name: 'Teeth Whitening',
    code: 'WHITE',
    category: 'cosmetic',
    description: 'In-office professional teeth whitening treatment',
    chiefComplaint: 'Tooth discoloration, desire for brighter smile',
    diagnosis: 'Extrinsic / intrinsic tooth staining',
    treatment: 'In-office bleaching with hydrogen peroxide / carbamide peroxide gel, light activation',
    treatmentPlan: 'Single session in-office whitening. Optional take-home kit for maintenance.',
    followUpInstructions: 'Avoid dark-colored foods and beverages (coffee, tea, red wine, berries) for 48 hours. Sensitivity is normal for 1-3 days.',
    defaultProcedure: 'Teeth Whitening',
    defaultPriority: null,
    defaultPrescriptions: [
      { medication: 'Desensitizing Toothpaste', dosage: 'Pea-sized amount', frequency: 'Twice daily', duration: '14 days', notes: 'Use for any post-whitening sensitivity' },
    ],
    defaultCareTasks: [
      { title: 'White diet', taskType: 'dietary', instructions: 'Avoid coffee, tea, red wine, berries, and dark sauces for 48 hours', frequency: 'once' },
      { title: 'Use desensitizing toothpaste', taskType: 'hygiene', instructions: 'Use desensitizing toothpaste if experiencing sensitivity', frequency: 'twice_daily' },
      { title: 'No smoking', taskType: 'post_care', instructions: 'Avoid smoking for at least 48 hours after treatment', frequency: 'once' },
    ],
  },
];

async function seed(tenantSlug) {
  console.log(`Seeding consultation templates for tenant: ${tenantSlug}`);

  await connectPlatformDB();
  await connectRedis();
  const conn = await getTenantConnection(tenantSlug);
  const ConsultationTemplate = conn.model('ConsultationTemplate');
  const ProcedureTemplate = conn.model('ProcedureTemplate');

  // Pre-load ProcedureTemplate lookup for linking
  const procTemplates = await ProcedureTemplate.find({ deletedAt: null }).select('_id code').lean();
  const procByCode = {};
  for (const pt of procTemplates) {
    procByCode[pt.code] = pt._id;
  }
  if (procTemplates.length) {
    console.log(`  Found ${procTemplates.length} procedure templates for linking`);
  } else {
    console.log(`  No procedure templates found — run seed-inventory.js first to enable linking`);
  }

  let created = 0;
  let skipped = 0;
  let linked = 0;

  for (const tpl of TEMPLATES) {
    const existing = await ConsultationTemplate.findOne({ code: tpl.code, deletedAt: null }).lean();
    if (existing) {
      // Update existing template with procedureTemplate link if missing
      if (!existing.procedureTemplate && PROCEDURE_LINK[tpl.code] && procByCode[PROCEDURE_LINK[tpl.code]]) {
        await ConsultationTemplate.findByIdAndUpdate(existing._id, {
          procedureTemplate: procByCode[PROCEDURE_LINK[tpl.code]],
        });
        console.log(`  LINK  ${tpl.code} → ${PROCEDURE_LINK[tpl.code]}`);
        linked++;
      } else {
        console.log(`  SKIP  ${tpl.code} — "${tpl.name}" (already exists)`);
      }
      skipped++;
      continue;
    }

    // Resolve procedureTemplate link
    const procCode = PROCEDURE_LINK[tpl.code];
    const procedureTemplate = procCode ? procByCode[procCode] || null : null;

    await ConsultationTemplate.create({
      ...tpl,
      procedureTemplate,
      isSystemTemplate: true,
      isActive: true,
    });
    console.log(`  OK    ${tpl.code} — "${tpl.name}"${procedureTemplate ? ` → ${procCode}` : ''}`);
    created++;
  }

  console.log(`\nDone: ${created} created, ${skipped} skipped, ${linked} linked`);
}

// ── CLI entry ────────────────────────────────────────────────────────

const slug = process.argv[2];
if (!slug) {
  console.error('Usage: node scripts/seed-consultation-templates.js <tenantSlug>');
  process.exit(1);
}

seed(slug)
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  });
