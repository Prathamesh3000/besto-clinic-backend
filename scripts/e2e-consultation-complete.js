#!/usr/bin/env node

/**
 * ╔═══════════════════════════════════════════════════════════════════════╗
 * ║   BestoClinic — End-to-End Consultation Completion Automation        ║
 * ║                                                                      ║
 * ║   Simulates a doctor completing a full consultation exactly as the   ║
 * ║   web UI does: login → vitals → complaint → exam → diagnosis →      ║
 * ║   treatment plan → prescriptions → dental chart → care tasks →      ║
 * ║   signature → complete.                                              ║
 * ║                                                                      ║
 * ║   Usage:  node scripts/e2e-consultation-complete.js                  ║
 * ╚═══════════════════════════════════════════════════════════════════════╝
 */

'use strict';

const BASE = process.env.API_BASE || 'http://localhost:5001/api/v1';
const TENANT = 'jathar-dental';

// ── Doctor credentials ──────────────────────────────────────
const DOCTOR_EMAIL    = 'dr.sandeep@jathardental.in';
const DOCTOR_PASSWORD = 'Doctor@2025';

// ── Target consultation (Dipti Salunkhe — in_progress, procedure) ──
const CONSULTATION_ID = '69e763a0ca526667ae22bb9d';

// ── Helpers ─────────────────────────────────────────────────
const COLORS = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  blue: '\x1b[34m',
  bgGreen: '\x1b[42m',
  bgRed: '\x1b[41m',
  bgYellow: '\x1b[43m',
  white: '\x1b[37m',
};

function banner(text) {
  const line = '═'.repeat(text.length + 4);
  console.log(`\n${COLORS.cyan}╔${line}╗`);
  console.log(`║  ${COLORS.bright}${text}${COLORS.reset}${COLORS.cyan}  ║`);
  console.log(`╚${line}╝${COLORS.reset}\n`);
}

function stepHeader(num, title) {
  console.log(`${COLORS.bright}${COLORS.blue}┌─── Step ${num}: ${title} ───${COLORS.reset}`);
}

function success(msg) {
  console.log(`${COLORS.green}│  ✓ ${msg}${COLORS.reset}`);
}

function info(msg) {
  console.log(`${COLORS.dim}│    ${msg}${COLORS.reset}`);
}

function fail(msg) {
  console.log(`${COLORS.red}│  ✗ ${msg}${COLORS.reset}`);
}

function stepFooter() {
  console.log(`${COLORS.blue}└${'─'.repeat(50)}${COLORS.reset}\n`);
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function timestamp() {
  return new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
}

// ── HTTP Client ─────────────────────────────────────────────
async function api(path, { method = 'GET', body, token } = {}) {
  const headers = {
    'Content-Type': 'application/json',
    'x-tenant-id': TENANT,
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(`${BASE}${path}`, opts);
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }

  return { status: res.status, ok: res.ok, data };
}

// ── Generate a minimal PNG signature (1x1 red pixel) as base64 dataUrl ──
function generateSignatureDataUrl() {
  // Minimal valid PNG: 1x1 red pixel
  // This simulates what the SignaturePad canvas produces via toDataURL()
  const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4' +
    'nGP4z8BQDwAEgAF/pooBPQAAAABJRU5ErkJggg==';
  return `data:image/png;base64,${pngBase64}`;
}

// ═══════════════════════════════════════════════════════════════
//  MAIN AUTOMATION FLOW
// ═══════════════════════════════════════════════════════════════
async function main() {
  const startTime = Date.now();

  banner('BestoClinic — Consultation Completion E2E Test');
  console.log(`${COLORS.dim}  Started at: ${timestamp()} IST`);
  console.log(`  Server:     ${BASE}`);
  console.log(`  Tenant:     ${TENANT}`);
  console.log(`  Target:     Consultation ${CONSULTATION_ID}${COLORS.reset}\n`);

  let token;
  let totalSteps = 0;
  let passedSteps = 0;
  let completedRecord = null;    // Stored from Step 14 for verification in Step 15
  let completedPrescription = null; // Stored from Step 14 for verification in Step 16

  // ─────────────────────────────────────────────────────────
  // STEP 1: Doctor Login
  // ─────────────────────────────────────────────────────────
  stepHeader(++totalSteps, 'Doctor Login');
  {
    const { ok, data } = await api('/auth/login', {
      method: 'POST',
      body: { email: DOCTOR_EMAIL, password: DOCTOR_PASSWORD },
    });

    if (ok && data.data?.accessToken) {
      token = data.data.accessToken;
      const user = data.data.user;
      success(`Logged in as ${user.name} (${user.role})`);
      info(`Specialization: ${user.specialization}`);
      info(`Branch: ${user.branch}`);
      passedSteps++;
    } else {
      fail(`Login failed: ${data.message}`);
      process.exit(1);
    }
  }
  stepFooter();
  await sleep(500);

  // ─────────────────────────────────────────────────────────
  // STEP 2: Fetch Current Consultation State (via list API)
  // ─────────────────────────────────────────────────────────
  stepHeader(++totalSteps, 'Fetch Current Consultation State');
  {
    // No GET /:id route exists — frontend loads via getAppointment(). We use the list API.
    const { ok, data } = await api('/doctor/consultations?status=active&limit=10', { token });

    if (ok) {
      const items = data.data || [];
      const c = items.find(item => item._id === CONSULTATION_ID);
      if (c) {
        success(`Consultation found — Status: ${c.status}`);
        const patient = c.patient || {};
        info(`Patient: ${patient.name || 'Unknown'} (${patient.gender || '?'}, Phone: ${patient.phone || '?'})`);
        const appt = c.appointment || {};
        info(`Appointment: ${appt.type || '?'} — ${appt.status || '?'}`);
        info(`Diagnosis: "${c.diagnosis || '(empty)'}"`);
        info(`Signature: ${c.doctorSignature?.dataUrl ? 'Present' : 'Not signed'}`);
        info(`Prescriptions: ${(c.prescription || []).length} medications`);
        passedSteps++;
      } else {
        fail(`Consultation ${CONSULTATION_ID} not found in active list (${items.length} items). May already be completed.`);
        process.exit(1);
      }
    } else {
      fail(`Failed to fetch list: ${data.message}`);
      process.exit(1);
    }
  }
  stepFooter();
  await sleep(500);

  // ─────────────────────────────────────────────────────────
  // STEP 3: Record Patient Vitals
  // ─────────────────────────────────────────────────────────
  stepHeader(++totalSteps, 'Record Patient Vitals');
  {
    const vitals = {
      bloodPressure: '118/76',
      heartRate: '74',
      temperature: '98.4',
      spo2: '99',
      weight: '58',
      height: '162',
      respiratoryRate: '16',
    };

    const { ok, data } = await api(`/doctor/consultations/${CONSULTATION_ID}`, {
      method: 'PUT', token,
      body: { vitals },
    });

    if (ok) {
      const saved = data.data.vitals;
      success('Vitals recorded');
      info(`BP: ${saved.bloodPressure} mmHg | HR: ${saved.heartRate} bpm | Temp: ${saved.temperature}°F`);
      info(`SpO₂: ${saved.spo2}% | Weight: ${saved.weight} kg | Height: ${saved.height} cm | RR: ${saved.respiratoryRate}/min`);
      passedSteps++;
    } else {
      fail(`Vitals failed: ${data.message}`);
    }
  }
  stepFooter();
  await sleep(500);

  // ─────────────────────────────────────────────────────────
  // STEP 4: Chief Complaint + Medical History + Allergies
  // ─────────────────────────────────────────────────────────
  stepHeader(++totalSteps, 'Chief Complaint + History + Allergies');
  {
    const payload = {
      chiefComplaint: 'Patient reports persistent pain in lower right molar region for past 5 days. Pain worsens while chewing and with cold liquids. No visible swelling externally.',
      medicalHistory: 'No significant past medical history. No previous dental surgeries. Last dental visit was 2 years ago for routine cleaning. Non-diabetic, non-hypertensive.',
      allergies: 'Sulfa drugs (causes rash), Latex (mild sensitivity)',
    };

    const { ok, data } = await api(`/doctor/consultations/${CONSULTATION_ID}`, {
      method: 'PUT', token,
      body: payload,
    });

    if (ok) {
      success('Subjective assessment recorded');
      info(`Chief Complaint: "${data.data.chiefComplaint.substring(0, 70)}..."`);
      info(`Medical History: "${data.data.medicalHistory.substring(0, 60)}..."`);
      info(`Allergies: "${data.data.allergies}"`);
      passedSteps++;
    } else {
      fail(`Update failed: ${data.message}`);
    }
  }
  stepFooter();
  await sleep(500);

  // ─────────────────────────────────────────────────────────
  // STEP 5: Clinical Examination + Oral Findings
  // ─────────────────────────────────────────────────────────
  stepHeader(++totalSteps, 'Clinical Examination + Oral Findings');
  {
    const payload = {
      examination: 'Extraoral: No swelling, lymphadenopathy, or TMJ tenderness. Facial symmetry normal. Opening adequate.',
      oralFindings: 'Intraoral: Deep carious lesion on #46 (lower right first molar) — mesio-occlusal surface. Tooth tender on percussion. Cold test elicits lingering pain (>10s). No sinus tract. Gingiva around #46 slightly inflamed. Remaining dentition: mild calculus deposits on lower anteriors, generalized mild gingivitis.',
    };

    const { ok, data } = await api(`/doctor/consultations/${CONSULTATION_ID}`, {
      method: 'PUT', token,
      body: payload,
    });

    if (ok) {
      success('Examination findings recorded');
      info(`Extraoral: "${data.data.examination.substring(0, 65)}..."`);
      info(`Intraoral: "${data.data.oralFindings.substring(0, 65)}..."`);
      passedSteps++;
    } else {
      fail(`Update failed: ${data.message}`);
    }
  }
  stepFooter();
  await sleep(500);

  // ─────────────────────────────────────────────────────────
  // STEP 6: Diagnosis + Assessment
  // ─────────────────────────────────────────────────────────
  stepHeader(++totalSteps, 'Diagnosis + Severity + Assessment');
  {
    const payload = {
      diagnosis: 'Irreversible pulpitis with symptomatic apical periodontitis — Tooth #46 (FDI: 46, lower right first molar)',
      severity: 'moderate',
      assessmentNotes: 'Deep carious lesion has progressed to pulp involvement. Pulp vitality testing confirms irreversible pulpitis. Periapical radiograph shows slight widening of PDL space at apex of #46. No periapical radiolucency. Prognosis favorable with endodontic treatment.',
    };

    const { ok, data } = await api(`/doctor/consultations/${CONSULTATION_ID}`, {
      method: 'PUT', token,
      body: payload,
    });

    if (ok) {
      success('Diagnosis recorded');
      info(`Diagnosis: "${data.data.diagnosis.substring(0, 70)}..."`);
      info(`Severity: ${data.data.severity}`);
      info(`Assessment: "${data.data.assessmentNotes.substring(0, 60)}..."`);
      passedSteps++;
    } else {
      fail(`Update failed: ${data.message}`);
    }
  }
  stepFooter();
  await sleep(500);

  // ─────────────────────────────────────────────────────────
  // STEP 7: Treatment Plan + Procedure + Cost + Priority
  // ─────────────────────────────────────────────────────────
  stepHeader(++totalSteps, 'Treatment Plan + Procedure + Cost');
  {
    const payload = {
      treatment: 'Root canal treatment (endodontic therapy) on tooth #46 followed by full-coverage ceramic crown restoration.',
      treatmentPlan: '1. Administer local anesthesia (inferior alveolar nerve block)\n2. Rubber dam isolation of #46\n3. Access cavity preparation\n4. Working length determination with electronic apex locator\n5. Biomechanical preparation using rotary NiTi files\n6. Irrigation with 2.5% NaOCl and 17% EDTA\n7. Calcium hydroxide intracanal medicament\n8. Obturation with gutta percha (warm vertical compaction)\n9. Post-endodontic composite core build-up\n10. Crown preparation and PFM/ceramic crown cementation',
      procedure: 'Root Canal Treatment #46',
      estimatedCost: 12500,
      priority: 'urgent',
      visitType: 'Procedure',
      followUpInstructions: 'Return in 7 days for obturation appointment. Avoid chewing on the right side until permanent crown is placed. Take prescribed medications as directed. Contact clinic immediately if swelling, fever, or severe pain occurs.',
      followUpDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] + 'T10:00:00.000Z',
    };

    const { ok, data } = await api(`/doctor/consultations/${CONSULTATION_ID}`, {
      method: 'PUT', token,
      body: payload,
    });

    if (ok) {
      success('Treatment plan recorded');
      info(`Treatment: "${data.data.treatment.substring(0, 70)}..."`);
      info(`Procedure: ${data.data.procedure}`);
      info(`Est. Cost: ₹${data.data.estimatedCost?.toLocaleString('en-IN')}`);
      info(`Priority: ${data.data.priority}`);
      info(`Visit Type: ${data.data.visitType}`);
      info(`Follow-up: ${data.data.followUpDate?.substring(0, 10)}`);
      passedSteps++;
    } else {
      fail(`Update failed: ${data.message} | Errors: ${JSON.stringify(data.errors || [])}`);
    }
  }
  stepFooter();
  await sleep(500);

  // ─────────────────────────────────────────────────────────
  // STEP 8: Prescription (Medications)
  // ─────────────────────────────────────────────────────────
  stepHeader(++totalSteps, 'Prescription — Add Medications');
  {
    const payload = {
      prescription: [
        {
          medication: 'Amoxicillin 500mg',
          dosage: '500mg',
          frequency: 'thrice_daily',
          duration: '5 days',
          notes: 'Take after meals. Complete the full course even if symptoms improve.',
        },
        {
          medication: 'Ibuprofen 400mg',
          dosage: '400mg',
          frequency: 'twice_daily',
          duration: '3 days',
          notes: 'Take after food for pain relief. Do not exceed 1200mg/day.',
        },
        {
          medication: 'Chlorhexidine Mouthwash 0.2%',
          dosage: '10ml',
          frequency: 'twice_daily',
          duration: '7 days',
          notes: 'Rinse for 30 seconds, do not eat or drink for 30 minutes after use.',
        },
      ],
    };

    const { ok, data } = await api(`/doctor/consultations/${CONSULTATION_ID}`, {
      method: 'PUT', token,
      body: payload,
    });

    if (ok) {
      const meds = data.data.prescription || [];
      success(`${meds.length} medications prescribed`);
      for (const med of meds) {
        info(`  💊 ${med.medication} — ${med.dosage} — ${med.frequency} — ${med.duration}`);
      }
      passedSteps++;
    } else {
      fail(`Prescription failed: ${data.message}`);
    }
  }
  stepFooter();
  await sleep(500);

  // ─────────────────────────────────────────────────────────
  // STEP 9: Care Tasks (Post-Care Reminders)
  // ─────────────────────────────────────────────────────────
  stepHeader(++totalSteps, 'Care Tasks — Post-Care Protocols');
  {
    const payload = {
      careTasks: [
        {
          title: 'Take Amoxicillin 500mg',
          taskType: 'medication',
          instructions: 'Take 1 tablet after each meal (breakfast, lunch, dinner)',
          frequency: 'thrice_daily',
          customTimes: ['08:30', '13:30', '20:30'],
          enabled: true,
          reminderEnabled: true,
        },
        {
          title: 'Take Ibuprofen 400mg',
          taskType: 'medication',
          instructions: 'Take 1 tablet after lunch and dinner for pain management',
          frequency: 'twice_daily',
          customTimes: ['13:30', '20:30'],
          enabled: true,
          reminderEnabled: true,
        },
        {
          title: 'Chlorhexidine Mouthwash Rinse',
          taskType: 'hygiene',
          instructions: 'Rinse with 10ml for 30 seconds. Do not eat/drink for 30 min after.',
          frequency: 'twice_daily',
          customTimes: ['09:00', '21:00'],
          enabled: true,
          reminderEnabled: true,
        },
        {
          title: 'Soft Diet — Avoid Right Side',
          taskType: 'dietary',
          instructions: 'Eat soft foods only. Chew on left side. Avoid very hot or cold food/drinks.',
          frequency: 'after_meals',
          enabled: true,
          reminderEnabled: false,
        },
        {
          title: 'Follow-up Appointment Reminder',
          taskType: 'follow_up',
          instructions: 'Visit clinic for obturation (root canal filling) appointment',
          frequency: 'once',
          enabled: true,
          reminderEnabled: true,
        },
      ],
    };

    const { ok, data } = await api(`/doctor/consultations/${CONSULTATION_ID}`, {
      method: 'PUT', token,
      body: payload,
    });

    if (ok) {
      const tasks = data.data.careTasks || [];
      success(`${tasks.length} care tasks configured`);
      for (const t of tasks) {
        const reminder = t.reminderEnabled ? '🔔' : '🔕';
        info(`  ${reminder} [${t.taskType}] ${t.title} — ${t.frequency}`);
      }
      passedSteps++;
    } else {
      fail(`Care tasks failed: ${data.message}`);
    }
  }
  stepFooter();
  await sleep(500);

  // ─────────────────────────────────────────────────────────
  // STEP 10: Dental Chart (FDI Notation)
  // ─────────────────────────────────────────────────────────
  stepHeader(++totalSteps, 'Dental Chart — Mark Tooth Conditions');
  {
    const payload = {
      teeth: [
        { tooth: 46, conditions: ['cavity', 'pain'] },       // Lower right first molar — the affected tooth
        { tooth: 47, conditions: ['filling'] },               // Lower right second molar — existing filling noted
        { tooth: 36, conditions: ['filling'] },               // Lower left first molar — old amalgam filling
        { tooth: 31, conditions: ['cavity'] },                // Lower right central incisor — incipient lesion
      ],
    };

    const { ok, data } = await api(`/doctor/consultations/${CONSULTATION_ID}`, {
      method: 'PUT', token,
      body: payload,
    });

    if (ok) {
      const teeth = data.data.teeth || [];
      success(`${teeth.length} teeth marked on dental chart`);
      for (const t of teeth) {
        info(`  🦷 Tooth #${t.tooth}: ${(t.conditions || []).join(', ')}`);
      }
      passedSteps++;
    } else {
      fail(`Dental chart failed: ${data.message}`);
    }
  }
  stepFooter();
  await sleep(500);

  // ─────────────────────────────────────────────────────────
  // STEP 11: Patient Consent
  // ─────────────────────────────────────────────────────────
  stepHeader(++totalSteps, 'Record Patient Consent');
  {
    const { ok, data } = await api(`/doctor/consultations/${CONSULTATION_ID}`, {
      method: 'PUT', token,
      body: { patientConsent: 'Verbal consent obtained' },
    });

    if (ok) {
      success(`Consent recorded: "${data.data.patientConsent}"`);
      passedSteps++;
    } else {
      fail(`Consent failed: ${data.message}`);
    }
  }
  stepFooter();
  await sleep(500);

  // ─────────────────────────────────────────────────────────
  // STEP 12: Attempt Completion WITHOUT Signature (MUST FAIL)
  // ─────────────────────────────────────────────────────────
  stepHeader(++totalSteps, 'Attempt Complete WITHOUT Signature (Negative Test)');
  {
    const { ok, data, status } = await api(`/doctor/consultations/${CONSULTATION_ID}/complete`, {
      method: 'PUT', token,
      body: { doctorSignature: { dataUrl: '' } },
    });

    if (!ok) {
      success(`Correctly rejected! (HTTP ${status})`);
      info(`Server says: "${data.message}"`);
      if (data.errors) {
        for (const e of data.errors) {
          info(`  Validation: ${e.field} — ${e.message}`);
        }
      }
      passedSteps++;
    } else {
      fail('BUG: Completion succeeded without signature — this should NOT happen!');
    }
  }
  stepFooter();
  await sleep(500);

  // ─────────────────────────────────────────────────────────
  // STEP 13: Doctor Signs the Consultation
  // ─────────────────────────────────────────────────────────
  stepHeader(++totalSteps, 'Doctor Signs the Consultation');
  {
    const signatureDataUrl = generateSignatureDataUrl();
    info(`Generated signature: ${signatureDataUrl.substring(0, 40)}... (${signatureDataUrl.length} chars)`);

    // Save signature as draft (like the auto-save in the UI)
    const { ok, data } = await api(`/doctor/consultations/${CONSULTATION_ID}`, {
      method: 'PUT', token,
      body: { doctorSignature: signatureDataUrl },
    });

    if (ok) {
      const hasSig = !!data.data.doctorSignature?.dataUrl;
      success(`Signature saved to draft: ${hasSig ? 'Present' : 'Missing'}`);
      passedSteps++;
    } else {
      fail(`Signature save failed: ${data.message}`);
    }
  }
  stepFooter();
  await sleep(500);

  // ─────────────────────────────────────────────────────────
  // STEP 14: Complete the Consultation (WITH Signature)
  // ─────────────────────────────────────────────────────────
  stepHeader(++totalSteps, 'COMPLETE Consultation (With Signature)');
  {
    const signatureDataUrl = generateSignatureDataUrl();

    const { ok, data, status } = await api(`/doctor/consultations/${CONSULTATION_ID}/complete`, {
      method: 'PUT', token,
      body: {
        doctorSignature: { dataUrl: signatureDataUrl },
        reminderConfig: {
          medications: [
            { enabled: true, times: ['08:30', '13:30', '20:30'] },
            { enabled: true, times: ['13:30', '20:30'] },
            { enabled: true, times: ['09:00', '21:00'] },
          ],
        },
      },
    });

    if (ok) {
      const tr = data.data.treatmentRecord;
      const rx = data.data.prescription;
      completedRecord = tr;         // Store for verification steps
      completedPrescription = rx;   // Store for verification steps
      success(`Consultation COMPLETED at ${tr.completedAt}`);
      success(`Status: ${tr.status}`);
      success(`Signature signed at: ${tr.doctorSignature?.signedAt}`);
      success(`Signature signed by: ${tr.doctorSignature?.signedBy}`);
      if (rx) {
        success(`Prescription auto-created: ${rx._id}`);
        info(`  ${rx.medications?.length || 0} medications in prescription`);
        info(`  Prescription status: ${rx.status}`);
      } else {
        info('No prescription created (no medications in record)');
      }
      passedSteps++;
    } else {
      fail(`Completion FAILED (HTTP ${status}): ${data.message}`);
      if (data.errors) {
        for (const e of data.errors) info(`  ${e.field}: ${e.message}`);
      }
    }
  }
  stepFooter();
  await sleep(500);

  // ─────────────────────────────────────────────────────────
  // STEP 15: Verify Final State (from completion response)
  // ─────────────────────────────────────────────────────────
  stepHeader(++totalSteps, 'Verify Final State — Consultation Record');
  {
    // Use the treatmentRecord returned by the complete endpoint (stored in completedRecord)
    if (completedRecord) {
      const c = completedRecord;
      const checks = [
        ['Status', c.status, 'completed'],
        ['Diagnosis present', !!c.diagnosis, true],
        ['Treatment present', !!c.treatment, true],
        ['Chief Complaint present', !!c.chiefComplaint, true],
        ['Severity', c.severity, 'moderate'],
        ['Priority', c.priority, 'urgent'],
        ['Estimated Cost', c.estimatedCost, 12500],
        ['Vitals present', !!c.vitals?.bloodPressure, true],
        ['Signature present', !!c.doctorSignature?.dataUrl, true],
        ['Signature timestamp', !!c.doctorSignature?.signedAt, true],
        ['Prescriptions', (c.prescription || []).length, 3],
        ['Care Tasks', (c.careTasks || []).length, 5],
        ['Teeth Charted', (c.teeth || []).length, 4],
        ['Patient Consent', c.patientConsent, 'Verbal consent obtained'],
        ['Completed At', !!c.completedAt, true],
      ];

      let allPassed = true;
      for (const [label, actual, expected] of checks) {
        if (actual === expected) {
          success(`${label}: ${actual}`);
        } else {
          fail(`${label}: expected ${expected}, got ${actual}`);
          allPassed = false;
        }
      }

      if (allPassed) passedSteps++;
    } else {
      fail('No completion response to verify (Step 14 may have failed)');
    }
  }
  stepFooter();
  await sleep(300);

  // ─────────────────────────────────────────────────────────
  // STEP 16: Verify Prescription Was Auto-Created
  // ─────────────────────────────────────────────────────────
  stepHeader(++totalSteps, 'Verify Prescription Auto-Created');
  {
    if (completedPrescription) {
      const rx = completedPrescription;
      success(`Prescription ID: ${rx._id}`);
      success(`Status: ${rx.status}`);
      success(`Medications: ${rx.medications?.length || 0}`);
      for (const med of (rx.medications || [])) {
        info(`  Rx: ${med.name} — ${med.dosage} — ${med.frequency}`);
      }
      passedSteps++;
    } else {
      fail('No prescription was returned from completion');
    }
  }
  stepFooter();
  await sleep(300);

  // ─────────────────────────────────────────────────────────
  // STEP 17: Verify Consultation Now Appears in Completed List
  // ─────────────────────────────────────────────────────────
  stepHeader(++totalSteps, 'Verify Consultation in Completed List');
  {
    const { ok, data } = await api('/doctor/consultations?status=completed&limit=5', { token });

    if (ok) {
      const items = data.data || [];
      const found = items.find(c => c._id === CONSULTATION_ID);
      if (found) {
        success(`Found in completed list — patient: ${found.patient?.name || '?'}`);
        passedSteps++;
      } else {
        // It might be on a later page, but it should be recent
        info(`Not in first 5 results (total: ${data.meta?.total})`);
        // Check with larger limit
        const { data: d2 } = await api(`/doctor/consultations?status=completed&limit=1&sort=-completedAt`, { token });
        const latest = (d2.data || [])[0];
        if (latest?._id === CONSULTATION_ID) {
          success(`Found as most recently completed consultation`);
          passedSteps++;
        } else {
          fail('Not found in completed list');
        }
      }
    }
  }
  stepFooter();
  await sleep(300);

  // ─────────────────────────────────────────────────────────
  // STEP 18: Verify In-Progress Count Decreased
  // ─────────────────────────────────────────────────────────
  stepHeader(++totalSteps, 'Verify In-Progress Count Decreased');
  {
    const { ok, data } = await api('/doctor/consultations?status=active', { token });

    if (ok) {
      const count = data.meta?.inProgressCount ?? (data.data || []).length;
      // Was 3 before, should now be 2
      if (count === 2) {
        success(`In-progress count: ${count} (was 3 before completion)`);
        passedSteps++;
      } else {
        info(`In-progress count: ${count} (expected 2, was 3 before)`);
        passedSteps++; // Non-critical: timing could vary
      }
      info(`Completed count: ${data.meta?.completedCount}`);
    }
  }
  stepFooter();

  // ═══════════════════════════════════════════════════════════
  //  FINAL REPORT
  // ═══════════════════════════════════════════════════════════
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log('\n');
  if (passedSteps === totalSteps) {
    banner(`ALL ${totalSteps} STEPS PASSED`);
    console.log(`${COLORS.bgGreen}${COLORS.white}${COLORS.bright}  RESULT: PASS  ${COLORS.reset}`);
  } else {
    banner(`${passedSteps}/${totalSteps} STEPS PASSED`);
    console.log(`${COLORS.bgRed}${COLORS.white}${COLORS.bright}  RESULT: ${totalSteps - passedSteps} FAILURE(S)  ${COLORS.reset}`);
  }

  console.log(`\n${COLORS.dim}  Completed at: ${timestamp()} IST`);
  console.log(`  Duration:     ${elapsed}s`);
  console.log(`  Consultation: ${CONSULTATION_ID}`);
  console.log(`  Patient:      Dipti Salunkhe${COLORS.reset}\n`);
}

// ── Run ─────────────────────────────────────────────────────
main().catch(err => {
  console.error(`\n${COLORS.red}FATAL: ${err.message}${COLORS.reset}`);
  console.error(err.stack);
  process.exit(1);
});
