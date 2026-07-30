#!/usr/bin/env node
'use strict';

/**
 * E2E Push Notification Verification Script
 * ==========================================
 * Tests the full lifecycle of:
 *   1. Appointment Reminders (interactive Yes/No push)
 *   2. Care Reminders (interactive Done/Skip push)
 *
 * Usage:
 *   node scripts/e2e-notifications.js
 *
 * Prerequisites:
 *   - Backend running at BASE_URL (default: http://localhost:5001)
 *   - Redis running (BullMQ workers depend on it)
 *   - Notification workers enabled in src/jobs/index.js
 */

const BASE_URL = process.env.BASE_URL || 'http://localhost:5001';
const API = `${BASE_URL}/api/v1`;
const TENANT_SLUG = 'jathar-dental';

// Doctor credentials (super_admin role — can create appointments + consultations)
const DOCTOR_EMAIL = 'dr.sandeep@jathardental.in';
const DOCTOR_PASS = 'Doctor@2025';

// Known patient credentials for Jathar Dental
const PATIENT_EMAIL_OVERRIDE = 'harshadadaml6@example.com';
const PATIENT_PASS = 'Staff@2025';

// ── Helpers ─────────────────────────────────────────────────────────

const headers = (token) => ({
  'Content-Type': 'application/json',
  'x-tenant-id': TENANT_SLUG,
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
});

async function api(method, path, body, token) {
  const url = `${API}${path}`;
  const opts = {
    method,
    headers: headers(token),
  };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(url, opts);
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }

  if (!res.ok) {
    const msg = typeof data === 'object' ? (data.message || data.error || JSON.stringify(data)) : data;
    throw new Error(`${method} ${path} → ${res.status}: ${msg}`);
  }
  return data;
}

async function login(email, password) {
  const res = await api('POST', '/auth/login', { email, password });
  return res.data.accessToken;
}

function step(num, label) {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`  STEP ${num}: ${label}`);
  console.log('─'.repeat(60));
}

function ok(msg) { console.log(`  ✅ ${msg}`); }
function info(msg) { console.log(`  ℹ️  ${msg}`); }
function warn(msg) { console.log(`  ⚠️  ${msg}`); }
function fail(msg) { console.error(`  ❌ ${msg}`); }

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Main ────────────────────────────────────────────────────────────

async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║   E2E PUSH NOTIFICATION VERIFICATION                   ║');
  console.log('║   Appointment Reminders + Care Reminders                ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  let doctorToken, patientToken, patientEmail, patientId, patientUserId;
  let appointmentId, consultationId;

  // ═════════════════════════════════════════════════════════════════
  //  PART A: APPOINTMENT REMINDER FLOW
  // ═════════════════════════════════════════════════════════════════

  console.log('\n📋 PART A: APPOINTMENT REMINDER FLOW');
  console.log('═'.repeat(60));

  // Step 1: Login as doctor
  step(1, 'Login as Doctor');
  try {
    doctorToken = await login(DOCTOR_EMAIL, DOCTOR_PASS);
    ok(`Doctor logged in (token: ${doctorToken.slice(0, 20)}...)`);
  } catch (err) {
    fail(`Doctor login failed: ${err.message}`);
    process.exit(1);
  }

  // Step 2: Login as patient first (so we know which email works)
  step(2, 'Login as Patient');
  try {
    patientToken = await login(PATIENT_EMAIL_OVERRIDE, PATIENT_PASS);
    patientEmail = PATIENT_EMAIL_OVERRIDE;
    ok(`Patient logged in as ${patientEmail} (token: ${patientToken.slice(0, 20)}...)`);
  } catch (err) {
    fail(`Patient login failed (${PATIENT_EMAIL_OVERRIDE}): ${err.message}`);
    patientToken = null;
  }

  // Step 3: Find the patient record matching the logged-in email
  step(3, 'Find Patient Record');
  try {
    // Search by the known email
    const searchUrl = `/patients?search=${encodeURIComponent(PATIENT_EMAIL_OVERRIDE)}&limit=50`;
    const patientsRes = await api('GET', searchUrl, null, doctorToken);
    const patients = patientsRes.data?.patients || patientsRes.data || [];

    // Find exact match
    let patient = patients.find(p => p.email === PATIENT_EMAIL_OVERRIDE);
    if (!patient && patients.length > 0) {
      patient = patients[0]; // fallback to first result
    }
    if (!patient) throw new Error(`No patient found with email ${PATIENT_EMAIL_OVERRIDE}`);

    patientId = patient._id;
    patientUserId = typeof patient.user === 'object' ? patient.user._id : patient.user;

    ok(`Patient found: ${patient.name} (${patient.email})`);
    info(`Patient ID: ${patientId}`);
    info(`User ID: ${patientUserId}`);
  } catch (err) {
    fail(`Failed to find patient: ${err.message}`);
    process.exit(1);
  }

  // Step 4: Get doctor info for appointment creation
  step(4, 'Get Doctor Info');
  let doctorId, branchId;
  try {
    const meRes = await api('GET', '/auth/me', null, doctorToken);
    const me = meRes.data;
    doctorId = me.user?._id || me._id;
    branchId = me.user?.branch || me.branch;
    ok(`Doctor ID: ${doctorId}`);
    info(`Branch: ${branchId}`);
  } catch (err) {
    fail(`Failed to get doctor info: ${err.message}`);
    process.exit(1);
  }

  // Step 5: Create appointment (5 min from now — validation bypassed for testing)
  step(5, 'Create Appointment (reminder fires immediately)');
  const scheduledAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
  info(`Booking at: ${scheduledAt} (UTC)`);
  try {
    const apptRes = await api('POST', '/appointments', {
      patient: patientId,
      doctor: doctorId,
      scheduledAt,
      duration: 30,
      type: 'consultation',
      reason: 'E2E Notification Test — automated verification',
      source: 'general',
      reminderTimings: [3, 0], // 3-min = fires now, 0-min = fires at appointment time
      ...(branchId ? { branch: branchId } : {}),
    }, doctorToken);

    const appt = apptRes.data;
    appointmentId = appt._id;
    ok(`Appointment created: ${appointmentId}`);
    info(`Scheduled at: ${scheduledAt}`);
    info(`Status: ${appt.status}`);
    info(`Reminders: ${JSON.stringify(appt.reminders || [])}`);

    // Check reminder scheduling
    const reminders = appt.reminders || [];
    const scheduled = reminders.filter(r => r.status === 'scheduled');
    if (scheduled.length > 0) {
      ok(`${scheduled.length} reminder(s) scheduled with BullMQ`);
      scheduled.forEach(r => info(`  → ${r.minutesBefore}min before, jobId: ${r.jobId}`));
    } else {
      warn('No reminders were scheduled (may have been skipped as past)');
    }
  } catch (err) {
    fail(`Failed to create appointment: ${err.message}`);
    process.exit(1);
  }

  // Step 6: Poll appointment for reminder status change
  step(6, 'Poll Appointment — Wait for Reminder to be Sent');
  let reminderSent = false;
  for (let i = 0; i < 20; i++) {
    await sleep(5000); // Check every 5 seconds
    try {
      const apptRes = await api('GET', `/appointments/${appointmentId}`, null, doctorToken);
      const appt = apptRes.data;
      const reminders = appt.reminders || [];
      const sent = reminders.filter(r => r.status === 'sent');

      if (sent.length > 0) {
        ok(`Reminder sent! (${sent.length}/${reminders.length})`);
        sent.forEach(r => info(`  → ${r.minutesBefore}min reminder sent at ${r.sentAt}`));
        reminderSent = true;
        break;
      }

      const statuses = reminders.map(r => `${r.minutesBefore}min:${r.status}`).join(', ');
      info(`Poll ${i + 1}/20 — reminders: [${statuses}]`);
    } catch (err) {
      warn(`Poll error: ${err.message}`);
    }
  }

  if (!reminderSent) {
    warn('Reminder not sent within polling window (100s)');
    info('This may be because the BullMQ worker has not processed the job yet');
    info('Check server logs for worker activity');
  }

  // Step 7: Simulate patient confirming attendance
  step(7, 'Patient Confirms Attendance');
  if (patientToken) {
    try {
      const confirmRes = await api('PUT',
        `/portal/appointments/${appointmentId}/confirm-attendance`,
        { status: 'confirmed' },
        patientToken,
      );
      ok('Patient confirmed attendance via portal API');
      info(`Response: ${JSON.stringify(confirmRes.data?.patientConfirmation || confirmRes.data || {})}`);
    } catch (err) {
      fail(`Confirm attendance failed: ${err.message}`);
      info('This may be a permissions issue — patient may not own this appointment');
    }
  } else {
    warn('No patient token — skipping attendance confirmation');
  }

  // Step 8: Verify confirmation is recorded
  step(8, 'Verify Patient Confirmation Recorded');
  try {
    const apptRes = await api('GET', `/appointments/${appointmentId}`, null, doctorToken);
    const appt = apptRes.data;
    const confirmation = appt.patientConfirmation || {};

    if (confirmation.status === 'confirmed') {
      ok(`patientConfirmation.status = '${confirmation.status}'`);
      ok(`respondedAt = ${confirmation.respondedAt}`);
      ok(`method = ${confirmation.method}`);
    } else if (confirmation.status === 'declined') {
      ok(`Patient declined (status: ${confirmation.status})`);
    } else {
      warn(`patientConfirmation.status = '${confirmation.status || 'pending'}' — not yet responded`);
    }
  } catch (err) {
    fail(`Failed to verify confirmation: ${err.message}`);
  }

  // ═════════════════════════════════════════════════════════════════
  //  PART B: CARE REMINDER FLOW
  // ═════════════════════════════════════════════════════════════════

  console.log('\n\n📋 PART B: CARE REMINDER FLOW');
  console.log('═'.repeat(60));

  // Step 9: Start consultation on the appointment
  step(9, 'Start Consultation');
  try {
    const consultRes = await api('POST', '/doctor/consultations', {
      appointmentId,
      diagnosis: 'Moderate dental caries on tooth #36',
      treatment: 'Composite filling + medication course',
      notes: 'E2E notification test — automated',
    }, doctorToken);

    // Response: { data: { record: { _id, ... }, room: ... } }
    consultationId = consultRes.data?.record?._id || consultRes.data?._id;
    ok(`Consultation started: ${consultationId}`);
    info(`Full response keys: ${JSON.stringify(Object.keys(consultRes.data || {}))}`);
  } catch (err) {
    fail(`Failed to start consultation: ${err.message}`);
    info('Continuing with care reminder verification using existing data...');
  }

  // Step 10: Update consultation with care tasks + prescription
  if (consultationId) {
    step(10, 'Update Consultation — Add Care Tasks + Prescription');
    try {
      await api('PUT', `/doctor/consultations/${consultationId}`, {
        chiefComplaint: 'Toothache on lower left molar for 3 days',
        diagnosis: 'Moderate dental caries on tooth #36 — composite filling indicated',
        treatment: 'Class II composite restoration',
        oralFindings: 'Carious lesion on occlusal surface of #36',
        severity: 'moderate',
        treatmentPlan: 'Composite filling today, follow-up in 7 days',
        procedure: 'Composite Filling',
        visitType: 'consultation',
        teeth: [{ tooth: 36, conditions: ['caries'] }],
        prescription: [
          {
            medication: 'Amoxicillin 500mg',
            dosage: '500mg',
            frequency: 'thrice daily',
            duration: '5 days',
            notes: 'Take after meals',
          },
          {
            medication: 'Ibuprofen 400mg',
            dosage: '400mg',
            frequency: 'twice daily',
            duration: '3 days',
            notes: 'Take for pain relief after meals',
          },
        ],
        careTasks: [
          {
            title: 'Amoxicillin 500mg',
            taskType: 'medication',
            instructions: 'Take one capsule after each meal (breakfast, lunch, dinner)',
            frequency: 'thrice_daily',
            enabled: true,
            reminderEnabled: true,
          },
          {
            title: 'Ibuprofen 400mg',
            taskType: 'medication',
            instructions: 'Take one tablet after breakfast and dinner for pain',
            frequency: 'twice_daily',
            enabled: true,
            reminderEnabled: true,
          },
          {
            title: 'Avoid hot/cold food',
            taskType: 'post_care',
            instructions: 'Avoid extremely hot or cold food and drinks for 48 hours',
            frequency: 'once',
            enabled: true,
            reminderEnabled: true,
          },
          {
            title: 'Salt water gargle',
            taskType: 'hygiene',
            instructions: 'Gargle with warm salt water twice daily',
            frequency: 'twice_daily',
            enabled: true,
            reminderEnabled: true,
          },
        ],
        notes: 'Patient to return in 7 days for follow-up check',
      }, doctorToken);

      ok('Consultation updated with care tasks and prescription');
    } catch (err) {
      fail(`Failed to update consultation: ${err.message}`);
    }

    // Step 11: Complete consultation with signature
    step(11, 'Complete Consultation (with doctor signature)');

    // Generate a minimal valid signature data URL (1x1 transparent PNG)
    const sigDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';

    try {
      const completeRes = await api('PUT',
        `/doctor/consultations/${consultationId}/complete`,
        {
          doctorSignature: {
            dataUrl: sigDataUrl,
          },
        },
        doctorToken,
      );

      ok('Consultation completed successfully');
      info(`Result: ${JSON.stringify(completeRes.data?.status || completeRes.message || 'completed')}`);
    } catch (err) {
      fail(`Failed to complete consultation: ${err.message}`);
      info('Care reminders require consultation to be completed');
    }
  }

  // Step 12: Verify PrescriptionTasks were created
  step(12, 'Verify PrescriptionTask Records');
  let prescriptionTasks = [];
  if (patientToken) {
    try {
      const tasksRes = await api('GET', '/portal/care-tasks?status=active', null, patientToken);
      prescriptionTasks = tasksRes.data?.tasks || tasksRes.data || [];

      if (prescriptionTasks.length > 0) {
        ok(`${prescriptionTasks.length} PrescriptionTask(s) found`);
        prescriptionTasks.forEach(t => {
          info(`  → ${t.title} | freq: ${t.frequency} | total: ${t.totalReminders} | completed: ${t.completedCount || 0}`);
        });
      } else {
        warn('No PrescriptionTasks found — they may not have been created yet');
      }
    } catch (err) {
      fail(`Failed to fetch care tasks: ${err.message}`);
    }
  } else {
    info('No patient token — checking via doctor compliance API');
    try {
      const complianceRes = await api('GET', `/doctor/patients/${patientId}/compliance`, null, doctorToken);
      const compliance = complianceRes.data || {};
      ok(`Compliance data: ${JSON.stringify(compliance).slice(0, 200)}`);
    } catch (err) {
      warn(`Compliance check failed: ${err.message}`);
    }
  }

  // Step 13: Check daily care schedule
  step(13, 'Check Daily Care Schedule');
  if (patientToken) {
    try {
      const scheduleRes = await api('GET', '/portal/care/today', null, patientToken);
      const schedule = scheduleRes.data;

      if (schedule && (schedule.reminders?.length > 0 || schedule.groups?.length > 0 || schedule.tasks?.length > 0)) {
        ok('Daily care schedule has entries');
        const entries = schedule.reminders || schedule.groups || schedule.tasks || [];
        info(`  → ${entries.length} entries for today`);
        entries.slice(0, 5).forEach(e => {
          info(`    - ${e.title || e.taskTitle || 'untitled'} @ ${e.scheduledAt || e.time || 'N/A'} [${e.status || 'pending'}]`);
        });
      } else {
        warn('No care schedule entries for today');
        info('Reminders are scheduled based on frequency times — next ones may be tomorrow');
      }
    } catch (err) {
      fail(`Failed to fetch daily schedule: ${err.message}`);
    }
  } else {
    info('No patient token — skipping daily schedule check');
  }

  // Step 14: Simulate patient responding to a care reminder (Done)
  step(14, 'Patient Responds to Care Reminder — Mark as Done');
  if (patientToken && prescriptionTasks.length > 0) {
    const firstTask = prescriptionTasks[0];
    const taskId = firstTask._id;

    // Get reminders for this task
    try {
      const remindersRes = await api('GET',
        `/portal/care-tasks/${taskId}/reminders`,
        null, patientToken,
      );
      const reminders = remindersRes.data?.reminders || remindersRes.data || [];

      if (reminders.length > 0) {
        // Find first pending or sent reminder
        const targetReminder = reminders.find(r => r.status === 'pending' || r.status === 'sent');

        if (targetReminder) {
          ok(`Found reminder to respond to: ${targetReminder._id} (status: ${targetReminder.status})`);

          // Respond with "done"
          const respondRes = await api('PUT',
            `/portal/care-tasks/${taskId}/reminders/${targetReminder._id}`,
            { status: 'done', note: 'Taken after lunch — E2E test' },
            patientToken,
          );
          ok('Patient marked care reminder as DONE');
          info(`Response: ${JSON.stringify(respondRes.data || respondRes.message || {})}`);
        } else {
          warn('No pending/sent reminders found for this task');
          info('All reminders may have already been responded to or are scheduled for later');
        }
      } else {
        warn('No reminders found for this task');
      }
    } catch (err) {
      fail(`Failed to respond to care reminder: ${err.message}`);
    }
  } else {
    info('No patient token or no tasks — skipping care reminder response');
  }

  // Step 15: Simulate patient skipping a care reminder
  step(15, 'Patient Responds to Care Reminder — Mark as Skipped');
  if (patientToken && prescriptionTasks.length > 1) {
    const secondTask = prescriptionTasks[1];
    const taskId = secondTask._id;

    try {
      const remindersRes = await api('GET',
        `/portal/care-tasks/${taskId}/reminders`,
        null, patientToken,
      );
      const reminders = remindersRes.data?.reminders || remindersRes.data || [];
      const targetReminder = reminders.find(r => r.status === 'pending' || r.status === 'sent');

      if (targetReminder) {
        const respondRes = await api('PUT',
          `/portal/care-tasks/${taskId}/reminders/${targetReminder._id}`,
          { status: 'skipped', note: 'Feeling nauseous — E2E test' },
          patientToken,
        );
        ok('Patient marked care reminder as SKIPPED');
        info(`Response: ${JSON.stringify(respondRes.data || respondRes.message || {})}`);
      } else {
        warn('No pending/sent reminders found for second task');
      }
    } catch (err) {
      fail(`Failed to skip care reminder: ${err.message}`);
    }
  } else {
    info('Fewer than 2 tasks or no patient token — skipping');
  }

  // Step 16: Verify compliance data reflects responses
  step(16, 'Verify Compliance Data (Doctor View)');
  try {
    const complianceRes = await api('GET',
      `/doctor/patients/${patientId}/compliance`,
      null, doctorToken,
    );
    const compliance = complianceRes.data;

    if (compliance) {
      ok('Compliance data retrieved');
      if (Array.isArray(compliance)) {
        compliance.forEach(c => {
          info(`  → ${c.title || c.taskTitle}: completed=${c.completedCount || 0}, skipped=${c.skippedCount || 0}, missed=${c.missedCount || 0}, rate=${c.completionRate || 0}%`);
        });
      } else {
        info(`  ${JSON.stringify(compliance).slice(0, 300)}`);
      }
    }
  } catch (err) {
    warn(`Compliance check failed: ${err.message}`);
  }

  // Step 17: Verify updated daily schedule
  step(17, 'Verify Updated Daily Schedule After Responses');
  if (patientToken) {
    try {
      const scheduleRes = await api('GET', '/portal/care/today', null, patientToken);
      const schedule = scheduleRes.data;
      const entries = schedule?.reminders || schedule?.groups || schedule?.tasks || [];

      if (entries.length > 0) {
        ok(`Daily schedule: ${entries.length} entries`);
        const done = entries.filter(e => e.status === 'done').length;
        const skipped = entries.filter(e => e.status === 'skipped').length;
        const pending = entries.filter(e => e.status === 'pending' || e.status === 'sent').length;
        info(`  Done: ${done} | Skipped: ${skipped} | Pending: ${pending}`);
      }
    } catch (err) {
      warn(`Schedule check failed: ${err.message}`);
    }
  }

  // Step 18: Get doctor's overall compliance summary
  step(18, 'Doctor Compliance Summary (All Patients)');
  try {
    const summaryRes = await api('GET', '/doctor/compliance-summary', null, doctorToken);
    const summary = summaryRes.data;
    if (summary) {
      ok('Compliance summary retrieved');
      info(`  ${JSON.stringify(summary).slice(0, 300)}`);
    }
  } catch (err) {
    warn(`Compliance summary failed: ${err.message}`);
  }

  // ═════════════════════════════════════════════════════════════════
  //  SUMMARY
  // ═════════════════════════════════════════════════════════════════

  console.log('\n\n╔══════════════════════════════════════════════════════════╗');
  console.log('║   E2E VERIFICATION COMPLETE                             ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log(`
  Test Appointment ID:   ${appointmentId || 'N/A'}
  Consultation ID:       ${consultationId || 'N/A'}
  Doctor:                ${DOCTOR_EMAIL}
  Patient:               ${patientEmail || 'N/A'}
  Patient ID:            ${patientId || 'N/A'}

  Reminder Flow:         appointment → reminder job → FCM push → patient responds
  Care Flow:             consultation → prescriptionTask → careReminder → patient responds

  Next Steps:
    1. Check server logs for FCM push delivery
    2. Check mobile device for notification display
    3. Run Maestro flow for mobile screen recording
    4. Run Puppeteer script for web portal verification
  `);
}

main().catch(err => {
  console.error('\n❌ E2E script crashed:', err);
  process.exit(1);
});
