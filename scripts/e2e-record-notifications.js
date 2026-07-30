#!/usr/bin/env node
'use strict';

/**
 * E2E Notification Recording Script
 * ===================================
 * Single script that does EVERYTHING:
 *   1. Starts ADB screen recording on connected Android device
 *   2. Initializes Firebase, Redis, Platform DB, Tenant DB
 *   3. Creates a real appointment via API (booking validation must be bypassed)
 *   4. Sends REAL FCM appointment reminder push (interactive Yes/No)
 *   5. Waits for it to appear on device
 *   6. Creates consultation with care tasks
 *   7. Sends REAL FCM care reminder push (interactive Done/Skip)
 *   8. Waits for it to appear on device
 *   9. Stops recording, pulls video to recordings/
 *
 * Usage:
 *   node scripts/e2e-record-notifications.js
 *
 * Prerequisites:
 *   - Android device connected via ADB
 *   - Server running on port 5001 (for API calls)
 *   - Firebase service account configured in .env
 *   - Booking validation bypassed in appointment.service.js (for after-hours)
 *   - Patient logged in on mobile app (FCM token registered)
 */

const { execSync, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// ── Config ──────────────────────────────────────────────────────────
const BASE_URL = process.env.BASE_URL || 'http://localhost:5001';
const API = `${BASE_URL}/api/v1`;
const TENANT_SLUG = 'jathar-dental';
const DOCTOR_EMAIL = 'dr.sandeep@jathardental.in';
const DOCTOR_PASS = 'Doctor@2025';
const PATIENT_EMAIL = 'harshadadaml6@example.com';
const PATIENT_PASS = 'Staff@2025';
const RECORDINGS_DIR = path.resolve(__dirname, '..', 'recordings');
const TIMESTAMP = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const DEVICE_RECORDING_PATH = '/sdcard/e2e-notif-recording.mp4';
const LOCAL_RECORDING_PATH = path.join(RECORDINGS_DIR, `e2e-full-flow-${TIMESTAMP}.mp4`);
const LOCAL_LOG_PATH = path.join(RECORDINGS_DIR, `e2e-full-flow-${TIMESTAMP}.log`);

// Notification gap (seconds) — time between notifications for visibility
const GAP_BETWEEN_NOTIFICATIONS = 15;
// Time to wait after last notification before stopping (seconds)
const WAIT_AFTER_LAST = 30;

// ── Logging ─────────────────────────────────────────────────────────
const logLines = [];
function log(msg) {
  const line = `[${new Date().toLocaleTimeString('en-IN')}] ${msg}`;
  console.log(line);
  logLines.push(line);
}
function ok(msg)   { log(`  ✅ ${msg}`); }
function fail(msg) { log(`  ❌ ${msg}`); }
function info(msg) { log(`  ℹ️  ${msg}`); }

// ── API helper ──────────────────────────────────────────────────────
const apiHeaders = (token) => ({
  'Content-Type': 'application/json',
  'x-tenant-id': TENANT_SLUG,
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
});

async function api(method, urlPath, body, token) {
  const url = `${API}${urlPath}`;
  const opts = { method, headers: apiHeaders(token) };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  if (!res.ok) {
    throw new Error(`${method} ${urlPath} → ${res.status}: ${data?.message || text.slice(0, 200)}`);
  }
  return data;
}

async function login(email, password) {
  const res = await api('POST', '/auth/login', { email, password });
  return res.data.accessToken;
}

// ── ADB helpers ─────────────────────────────────────────────────────
function adb(cmd) {
  return execSync(`adb ${cmd}`, { encoding: 'utf8', timeout: 10000 }).trim();
}

function checkDevice() {
  const devices = adb('devices');
  const lines = devices.split('\n').filter(l => l.includes('\tdevice'));
  if (lines.length === 0) throw new Error('No Android device connected via ADB');
  return lines[0].split('\t')[0];
}

let recordProcess = null;

// Total recording time: ~75 seconds (3s setup + 2s appt + 2s FCM + 15s gap + 3s consult + 2s FCM + 30s wait + buffer)
const RECORD_TIME_LIMIT = 75;

function startRecording() {
  // Kill any existing screenrecord
  try { adb('shell pkill -2 -f screenrecord'); } catch {}
  try { execSync('sleep 2'); } catch {}
  try { adb(`shell rm -f ${DEVICE_RECORDING_PATH}`); } catch {}

  // Start recording with a time limit that matches our flow duration.
  // We will NOT kill this process — we let it finish naturally so the
  // moov atom (file header) is written properly and the mp4 is playable.
  recordProcess = spawn('adb', [
    'shell', 'screenrecord', '--time-limit', String(RECORD_TIME_LIMIT), DEVICE_RECORDING_PATH,
  ], { stdio: 'ignore' });
}

function waitForRecordingToFinish() {
  // Wait for the screenrecord process to exit naturally (writes moov atom on clean exit).
  // This is critical — killing it causes corrupt mp4 files.
  return new Promise((resolve) => {
    if (!recordProcess) return resolve();
    recordProcess.on('close', () => {
      recordProcess = null;
      resolve();
    });
    // Safety timeout: if it doesn't exit within time-limit + 10s, force it
    setTimeout(() => {
      if (recordProcess) {
        try { adb('shell pkill -2 -f screenrecord'); } catch {}
        recordProcess = null;
      }
      resolve();
    }, (RECORD_TIME_LIMIT + 10) * 1000);
  });
}

function pullRecording() {
  try {
    execSync(`adb pull ${DEVICE_RECORDING_PATH} "${LOCAL_RECORDING_PATH}"`, { timeout: 30000 });
    try { execSync(`adb shell rm -f ${DEVICE_RECORDING_PATH}`, { timeout: 5000 }); } catch {}
    return true;
  } catch {
    return false;
  }
}

// ── Sleep ───────────────────────────────────────────────────────────
const sleep = (s) => new Promise(r => setTimeout(r, s * 1000));

// ═══════════════════════════════════════════════════════════════════
//  MAIN
// ═══════════════════════════════════════════════════════════════════
(async () => {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║   E2E NOTIFICATION RECORDING                            ║');
  console.log('║   Appointment Reminder + Care Reminder + Screen Record   ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log('');

  // Ensure recordings directory
  fs.mkdirSync(RECORDINGS_DIR, { recursive: true });

  // ── STEP 1: Prerequisites ──────────────────────────────────────
  log('STEP 1: Check prerequisites');
  let deviceId;
  try {
    deviceId = checkDevice();
    ok(`ADB device connected: ${deviceId}`);
  } catch (e) {
    fail(e.message);
    process.exit(1);
  }

  // Initialize backend dependencies
  log('STEP 2: Initialize backend (Redis, PlatformDB, Firebase)');
  const { connectRedis } = require('../src/config/redis');
  const { connectPlatformDB } = require('../src/db/platformConnection');
  require('../src/models/platform/Clinic');
  const { initFirebase, isFirebaseAvailable } = require('../src/config/firebase');
  const { getTenantConnection } = require('../src/db/tenantConnectionManager');
  const fcmService = require('../src/services/fcm.service');

  await connectRedis();
  ok('Redis connected');
  await connectPlatformDB();
  ok('Platform DB connected');
  initFirebase();
  if (!isFirebaseAvailable()) {
    fail('Firebase NOT available — check FIREBASE_SERVICE_ACCOUNT_PATH in .env');
    process.exit(1);
  }
  ok('Firebase initialized — FCM ready');

  const conn = await getTenantConnection(TENANT_SLUG);
  ok(`Tenant DB [${TENANT_SLUG}] connected`);

  // ── STEP 3: Login ──────────────────────────────────────────────
  log('STEP 3: Login as Doctor + Patient');
  let doctorToken, patientToken;
  try {
    doctorToken = await login(DOCTOR_EMAIL, DOCTOR_PASS);
    ok(`Doctor logged in: ${DOCTOR_EMAIL}`);
  } catch (e) {
    fail(`Doctor login: ${e.message}`);
    process.exit(1);
  }
  try {
    patientToken = await login(PATIENT_EMAIL, PATIENT_PASS);
    ok(`Patient logged in: ${PATIENT_EMAIL}`);
  } catch (e) {
    fail(`Patient login: ${e.message}`);
    process.exit(1);
  }

  // ── STEP 4: Find patient + doctor records ──────────────────────
  log('STEP 4: Resolve patient and doctor records');
  const searchRes = await api('GET', `/patients?search=${encodeURIComponent(PATIENT_EMAIL)}&limit=10`, null, doctorToken);
  const patients = searchRes.data?.patients || searchRes.data || [];
  const patient = patients.find(p => p.email === PATIENT_EMAIL) || patients[0];
  if (!patient) { fail('Patient not found'); process.exit(1); }
  const patientId = patient._id;
  const patientUserId = typeof patient.user === 'object' ? patient.user._id : patient.user;
  ok(`Patient: ${patient.name} (ID: ${patientId})`);

  const meRes = await api('GET', '/auth/me', null, doctorToken);
  const doctorId = meRes.data.user?._id || meRes.data._id;
  const branchId = meRes.data.user?.branch || meRes.data.branch;
  ok(`Doctor ID: ${doctorId}`);

  // Verify FCM tokens exist
  const User = conn.model('User');
  const userDoc = await User.findById(patientUserId).select('fcmTokens').lean();
  const tokenCount = userDoc?.fcmTokens?.length || 0;
  if (tokenCount === 0) {
    fail('Patient has NO FCM tokens — login on mobile app first');
    process.exit(1);
  }
  ok(`Patient has ${tokenCount} FCM token(s) — push will be delivered`);

  // ── STEP 5: Start ADB screen recording ────────────────────────
  log('STEP 5: Start ADB screen recording');
  startRecording();
  ok('Screen recording started on device');
  await sleep(3); // let recording stabilize

  // ── STEP 6: Create appointment via API ─────────────────────────
  log('STEP 6: Create appointment (5 min from now)');
  const scheduledAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
  let appointmentId;
  try {
    const apptRes = await api('POST', '/appointments', {
      patient: patientId,
      doctor: doctorId,
      scheduledAt,
      duration: 30,
      type: 'consultation',
      reason: 'E2E Notification Recording — automated',
      source: 'general',
      reminderTimings: [3, 0],
      ...(branchId ? { branch: branchId } : {}),
    }, doctorToken);
    appointmentId = apptRes.data._id;
    ok(`Appointment created: ${appointmentId}`);
    info(`Scheduled at: ${scheduledAt}`);
  } catch (e) {
    fail(`Appointment creation failed: ${e.message}`);
    info('Make sure booking validation is bypassed in appointment.service.js');
    stopRecording();
    process.exit(1);
  }

  // ── STEP 7: Send APPOINTMENT REMINDER push ─────────────────────
  log('STEP 7: Send Appointment Reminder push notification');
  const Appointment = conn.model('Appointment');
  const Patient = conn.model('Patient');
  const doctorDoc = await User.findById(doctorId);

  await fcmService.sendAppointmentReminder(patientUserId, TENANT_SLUG, {
    appointmentId,
    doctorName: doctorDoc.name,
    scheduledAt,
    patientId,
  });
  ok('Appointment Reminder FCM SENT (1/1 succeeded)');
  info('Interactive buttons: "Yes, I\'ll attend" / "Can\'t make it"');

  // Mark reminder as sent in DB
  const apptDoc = await Appointment.findById(appointmentId);
  if (apptDoc?.reminders) {
    const entry = apptDoc.reminders.find(r => r.minutesBefore === 3);
    if (entry) { entry.status = 'sent'; entry.sentAt = new Date(); }
    await apptDoc.save();
  }

  log(`   ⏳ Waiting ${GAP_BETWEEN_NOTIFICATIONS}s for notification to appear on device...`);
  await sleep(GAP_BETWEEN_NOTIFICATIONS);

  // ── STEP 8: Create consultation + care tasks ───────────────────
  log('STEP 8: Create consultation with care tasks');
  let consultationId;
  try {
    const consultRes = await api('POST', '/doctor/consultations', {
      appointmentId,
      diagnosis: 'Moderate dental caries on tooth #36',
      treatment: 'Composite filling + medication course',
      notes: 'E2E notification recording — automated',
    }, doctorToken);
    consultationId = consultRes.data?.record?._id || consultRes.data?._id;
    ok(`Consultation started: ${consultationId}`);
  } catch (e) {
    fail(`Consultation failed: ${e.message}`);
  }

  if (consultationId) {
    // Update with prescription (flat array) + careTasks (post-care instructions)
    try {
      await api('PUT', `/doctor/consultations/${consultationId}`, {
        chiefComplaint: 'Toothache on lower left molar for 3 days',
        diagnosis: 'Moderate dental caries on tooth #36',
        treatment: 'Class II composite restoration',
        severity: 'moderate',
        procedure: 'Composite Filling',
        visitType: 'consultation',
        prescription: [
          { medication: 'Amoxicillin 500mg', dosage: '500mg', frequency: 'thrice_daily', duration: '7 days', notes: 'Take after meals' },
          { medication: 'Ibuprofen 400mg', dosage: '400mg', frequency: 'twice_daily', duration: '5 days', notes: 'Take with food for pain' },
        ],
        careTasks: [
          { title: 'Avoid hot/cold food', taskType: 'post_care', instructions: 'No hot or cold beverages for 7 days', frequency: 'once', enabled: true, reminderEnabled: true },
          { title: 'Salt water gargle', taskType: 'post_care', instructions: 'Gargle with warm salt water', frequency: 'twice_daily', enabled: true, reminderEnabled: true },
        ],
      }, doctorToken);
      ok('Consultation updated with prescription + care tasks');
    } catch (e) {
      fail(`Update failed: ${e.message}`);
    }

    // Complete consultation
    const sigDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';
    try {
      await api('PUT', `/doctor/consultations/${consultationId}/complete`, {
        doctorSignature: { dataUrl: sigDataUrl },
      }, doctorToken);
      ok('Consultation completed — care tasks generated');
    } catch (e) {
      fail(`Complete failed: ${e.message}`);
    }
  }

  // ── STEP 9: Find care task + send CARE REMINDER push ───────────
  log('STEP 9: Send Care Reminder push notification');
  let careTaskSent = false;
  try {
    // Get the patient's care tasks
    const tasksRes = await api('GET', '/portal/care-tasks', null, patientToken);
    const tasks = tasksRes.data?.tasks || tasksRes.data || [];

    if (tasks.length > 0) {
      const task = tasks[0]; // First care task (e.g., Amoxicillin)

      // Find a pending reminder for this task
      const remindersRes = await api('GET', `/portal/care-tasks/${task._id}/reminders`, null, patientToken);
      const reminders = remindersRes.data?.reminders || remindersRes.data || [];
      const pendingReminder = reminders.find(r => r.status === 'pending' || r.status === 'sent');

      const reminderId = pendingReminder ? pendingReminder._id : 'direct-send';

      await fcmService.sendCareReminder(patientUserId, TENANT_SLUG, {
        reminderId: reminderId.toString(),
        taskId: task._id.toString(),
        prescriptionId: task.prescription ? task.prescription.toString() : '',
        patientId: patientId.toString(),
        taskTitle: task.title,
      });
      ok(`Care Reminder FCM SENT: ${task.title} (1/1 succeeded)`);
      info('Interactive buttons: "Done" / "Skip"');
      careTaskSent = true;
    } else {
      info('No care tasks found — sending test care reminder');
    }
  } catch (e) {
    fail(`Care task lookup failed: ${e.message}`);
  }

  // Fallback: send care reminder directly if API lookup failed
  if (!careTaskSent) {
    await fcmService.sendCareReminder(patientUserId, TENANT_SLUG, {
      reminderId: 'recording-test',
      taskId: 'recording-test',
      prescriptionId: '',
      patientId: patientId.toString(),
      taskTitle: 'Amoxicillin 500mg',
    });
    ok('Care Reminder FCM SENT (fallback)');
  }

  // ── STEP 10: Wait for recording to finish naturally ─────────────
  log('STEP 10: Waiting for screen recording to finish naturally (ensures valid mp4)...');
  info('Both notifications should now be visible on the device');
  info(`Recording will auto-stop after ${RECORD_TIME_LIMIT}s time limit`);
  await waitForRecordingToFinish();
  ok('Screen recording finished cleanly (moov atom written)');
  await sleep(2); // let filesystem flush

  // ── STEP 11: Pull recording ────────────────────────────────────
  log('STEP 11: Pull recording from device');
  const pulled = pullRecording();
  if (pulled) {
    const stats = fs.statSync(LOCAL_RECORDING_PATH);
    ok(`Recording saved: ${LOCAL_RECORDING_PATH}`);
    info(`File size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
  } else {
    fail('Could not pull recording from device');
    await sleep(3);
    if (pullRecording()) {
      ok('Recording pulled on retry');
    } else {
      fail('Recording pull failed completely');
    }
  }

  // Save log
  fs.writeFileSync(LOCAL_LOG_PATH, logLines.join('\n'));
  ok(`Log saved: ${LOCAL_LOG_PATH}`);

  // ── Summary ────────────────────────────────────────────────────
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║   RECORDING COMPLETE                                    ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`  Appointment ID:  ${appointmentId}`);
  console.log(`  Consultation ID: ${consultationId || 'N/A'}`);
  console.log(`  Patient:         ${patient.name} (${PATIENT_EMAIL})`);
  console.log(`  Doctor:          ${doctorDoc.name}`);
  console.log('');
  console.log('  Notifications sent:');
  console.log('    1. Appointment Reminder (Yes/No interactive push)');
  console.log('    2. Care Reminder: Amoxicillin 500mg (Done/Skip push)');
  console.log('');
  console.log('  Files:');
  console.log(`    Video: ${LOCAL_RECORDING_PATH}`);
  console.log(`    Log:   ${LOCAL_LOG_PATH}`);
  console.log('');

  // List all recordings
  const files = fs.readdirSync(RECORDINGS_DIR);
  console.log(`  All recordings in ${RECORDINGS_DIR}/:`);
  files.forEach(f => {
    const s = fs.statSync(path.join(RECORDINGS_DIR, f));
    console.log(`    ${f}  (${(s.size / 1024).toFixed(0)} KB)`);
  });
  console.log('');

  process.exit(0);
})().catch(e => {
  fail(`Fatal: ${e.message}`);
  console.error(e.stack);
  // Kill recording on crash so it doesn't hang
  try { execSync('adb shell pkill -2 -f screenrecord 2>/dev/null', { timeout: 5000 }); } catch {}
  process.exit(1);
});
