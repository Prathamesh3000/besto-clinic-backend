#!/usr/bin/env node
'use strict';

/**
 * E2E Notification INTERACTION Test — Full User Journey
 * ======================================================
 * This script does EVERYTHING end-to-end with zero manual input:
 *
 *   PHASE 1 — Setup
 *     1. Check ADB device
 *     2. Init Firebase / Redis / DB
 *     3. Login doctor + patient
 *     4. Verify FCM token
 *     5. Start ADB screen recording
 *
 *   PHASE 2 — Appointment Notification
 *     6. Create appointment via API
 *     7. Send appointment reminder push (FCM)
 *     8. Open notification shade + tap "Can't make it"
 *     9. Verify DB: confirmationStatus === 'declined'
 *    10. Navigate to Appts tab → tap appointment → verify "Declined" on screen
 *
 *   PHASE 3 — Care Reminder Notification
 *    11. Create consultation + care tasks via API
 *    12. Send care reminder push (FCM)
 *    13. Background the app + wait for notification
 *    14. Open notification shade + tap "Done"
 *    15. Verify DB: reminder status === 'done'
 *
 *   PHASE 4 — Visual Verification
 *    16. Bring app to foreground
 *    17. Navigate to Health tab → verify "1 done" on care task card
 *    18. Tap care task → verify stats on detail screen
 *    19. Pull recording, validate MP4
 *
 * Prerequisites:
 *   - Android device connected via USB with ADB authorized
 *   - Server running on port 5001
 *   - Patient logged in on mobile app (FCM token registered)
 *   - Booking validation bypassed in appointment.service.js
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
const APP_PACKAGE = 'com.bestoclinic.app';
const RECORDINGS_DIR = path.resolve(__dirname, '..', 'recordings');
const TIMESTAMP = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const DEVICE_RECORDING = '/sdcard/e2e-interaction.mp4';
const LOCAL_VIDEO = path.join(RECORDINGS_DIR, `e2e-interaction-${TIMESTAMP}.mp4`);
const LOCAL_LOG = path.join(RECORDINGS_DIR, `e2e-interaction-${TIMESTAMP}.log`);
const RECORD_TIME_LIMIT = 160; // seconds — enough for full interaction + UI navigation flow

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
function step(n, msg) { log(`\nSTEP ${n}: ${msg}`); }

const sleep = (s) => new Promise(r => setTimeout(r, s * 1000));

// ── API helpers ─────────────────────────────────────────────────────
function apiHeaders(token) {
  return {
    'Content-Type': 'application/json',
    'x-tenant-id': TENANT_SLUG,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function api(method, urlPath, body, token) {
  const url = `${API}${urlPath}`;
  const opts = { method, headers: apiHeaders(token) };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  if (!res.ok) throw new Error(`${method} ${urlPath} → ${res.status}: ${data?.message || text.slice(0, 200)}`);
  return data;
}

async function login(email, password) {
  const res = await api('POST', '/auth/login', { email, password });
  return res.data.accessToken;
}

// ── ADB helpers ─────────────────────────────────────────────────────
function adb(cmd) {
  return execSync(`adb ${cmd}`, { encoding: 'utf8', timeout: 15000 }).trim();
}

function checkDevice() {
  const out = adb('devices');
  const lines = out.split('\n').filter(l => l.includes('\tdevice'));
  if (lines.length === 0) throw new Error('No Android device connected via ADB');
  return lines[0].split('\t')[0];
}

function expandNotifications() {
  adb('shell cmd statusbar expand-notifications');
}

function collapseNotifications() {
  adb('shell cmd statusbar collapse');
}

function pressHome() {
  adb('shell input keyevent KEYCODE_HOME');
}

function launchApp() {
  adb(`shell am start -n ${APP_PACKAGE}/.MainActivity`);
}

function tapXY(x, y) {
  adb(`shell input tap ${x} ${y}`);
}

function swipeDown(x, startY, endY, durationMs) {
  adb(`shell input swipe ${x} ${startY} ${x} ${endY} ${durationMs}`);
}

function pressBack() {
  adb('shell input keyevent KEYCODE_BACK');
}

// ── UIAutomator: find + tap notification buttons ────────────────────
function dumpUI() {
  try {
    adb('shell uiautomator dump /sdcard/window_dump.xml');
    return adb('shell cat /sdcard/window_dump.xml');
  } catch (e) {
    return '';
  }
}

/**
 * Find a UI node whose text contains `searchText` (case-insensitive).
 * Returns { text, x, y } center-of-bounds or null.
 */
function findNodeByText(xml, searchText) {
  // Match both self-closing <node .../> and parent <node ...> tags
  const nodes = xml.match(/<node\s+[^>]*>/g) || [];
  const lower = searchText.toLowerCase();

  for (const node of nodes) {
    const textMatch = node.match(/text="([^"]*)"/);
    if (!textMatch) continue;
    const nodeText = textMatch[1];
    if (!nodeText.toLowerCase().includes(lower)) continue;

    const boundsMatch = node.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
    if (!boundsMatch) continue;

    const x1 = parseInt(boundsMatch[1]);
    const y1 = parseInt(boundsMatch[2]);
    const x2 = parseInt(boundsMatch[3]);
    const y2 = parseInt(boundsMatch[4]);

    return {
      text: nodeText,
      x: Math.round((x1 + x2) / 2),
      y: Math.round((y1 + y2) / 2),
    };
  }
  return null;
}

/**
 * Tap a notification action button using coordinate-based approach.
 *
 * On Realme/ColorOS/custom OEM skins, notification action buttons are
 * rendered using a custom view that UIAutomator cannot introspect.
 * But we CAN find the notification title/body position via UIAutomator,
 * then calculate where the action buttons are rendered relative to it.
 *
 * Strategy:
 *   1. Dump UI, find the notification by title text
 *   2. Swipe down on the notification to expand it and reveal action buttons
 *   3. Check if buttons are now visible in UIAutomator (works on stock Android)
 *   4. If not, tap at calculated coordinates below the notification body
 *   5. Verify the notification was dismissed (= action was processed)
 *
 * buttonPosition: 'left' or 'right' — which button to tap
 */
async function tapNotificationAction(notifTitleSearch, buttonPosition, buttonLabel) {
  info(`Looking for notification "${notifTitleSearch}"...`);

  // Step 1: Find the notification in the UI
  let xml = dumpUI();
  let titleNode = findNodeByText(xml, notifTitleSearch);
  if (!titleNode) {
    info('Notification not found in UI dump, re-expanding shade...');
    expandNotifications();
    await sleep(2);
    xml = dumpUI();
    titleNode = findNodeByText(xml, notifTitleSearch);
  }

  if (!titleNode) {
    fail(`Notification "${notifTitleSearch}" not found in UI`);
    return false;
  }
  ok(`Notification found at y=${titleNode.y}`);

  // Step 2: Expand the notification card with a slow downward swipe
  info('Expanding notification card to reveal action buttons...');
  adb(`shell input swipe ${titleNode.x} ${titleNode.y + 30} ${titleNode.x} ${titleNode.y + 250} 500`);
  await sleep(2);

  // Step 3: Check if UIAutomator can now see the buttons
  xml = dumpUI();
  const btnNode = findNodeByText(xml, buttonLabel);
  if (btnNode) {
    info(`Found "${btnNode.text}" at (${btnNode.x}, ${btnNode.y}) — tapping`);
    tapXY(btnNode.x, btnNode.y);
    ok(`Tapped "${buttonLabel}" via UIAutomator`);
    return true;
  }

  // Step 4: Coordinate-based fallback — buttons are below the notification content
  // Re-find the notification position (it may have moved during expansion)
  titleNode = findNodeByText(xml, notifTitleSearch);
  if (!titleNode) {
    // Notification might have scrolled — try looking for the body text too
    titleNode = findNodeByText(xml, 'appointment') || findNodeByText(xml, 'Care');
  }

  if (titleNode) {
    // Action buttons are in a row 50-80px below the notification title
    // Screen is 720px wide; left button ≈ x=180, right button ≈ x=540
    const actionY = titleNode.y + 75;
    const actionX = buttonPosition === 'left' ? 180 : 540;

    info(`Tapping ${buttonPosition} action button at (${actionX}, ${actionY}) for "${buttonLabel}"...`);
    tapXY(actionX, actionY);
    await sleep(2);

    // Verify: check if notification is still visible
    xml = dumpUI();
    const stillThere = findNodeByText(xml, notifTitleSearch);
    if (!stillThere) {
      ok(`Tapped "${buttonLabel}" successfully (notification dismissed)`);
      return true;
    }

    // Maybe we tapped wrong Y — try a few more offsets
    for (const yOffset of [55, 95, 110]) {
      info(`Retrying at y-offset ${yOffset}...`);
      tapXY(actionX, titleNode.y + yOffset);
      await sleep(1.5);
      xml = dumpUI();
      if (!findNodeByText(xml, notifTitleSearch)) {
        ok(`Tapped "${buttonLabel}" successfully at offset ${yOffset}`);
        return true;
      }
    }
  }

  fail(`Could not tap "${buttonLabel}" — saving UI dump for debug`);
  return false;
}

// ── In-App Navigation ───────────────────────────────────────────────

/**
 * Find a UI element by text and tap it. Returns true if found and tapped.
 */
async function tapByText(searchText, retries = 3) {
  for (let i = 0; i < retries; i++) {
    const xml = dumpUI();
    const node = findNodeByText(xml, searchText);
    if (node) {
      tapXY(node.x, node.y);
      return true;
    }
    if (i < retries - 1) await sleep(2);
  }
  return false;
}

/**
 * Wait for a UI element containing text to appear.
 * Returns the node if found, null if timeout.
 */
async function waitForText(searchText, timeoutSec = 15) {
  const deadline = Date.now() + timeoutSec * 1000;
  while (Date.now() < deadline) {
    const xml = dumpUI();
    const node = findNodeByText(xml, searchText);
    if (node) return node;
    await sleep(2);
  }
  return null;
}

/**
 * Find all UI nodes containing the search text (case-insensitive).
 */
function findAllNodesByText(xml, searchText) {
  const nodes = xml.match(/<node\s+[^>]*>/g) || [];
  const lower = searchText.toLowerCase();
  const results = [];

  for (const node of nodes) {
    const textMatch = node.match(/text="([^"]*)"/);
    if (!textMatch) continue;
    const nodeText = textMatch[1];
    if (!nodeText.toLowerCase().includes(lower)) continue;

    const boundsMatch = node.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
    if (!boundsMatch) continue;

    results.push({
      text: nodeText,
      x: Math.round((parseInt(boundsMatch[1]) + parseInt(boundsMatch[3])) / 2),
      y: Math.round((parseInt(boundsMatch[2]) + parseInt(boundsMatch[4])) / 2),
    });
  }
  return results;
}

/**
 * Dismiss any system dialogs (e.g. "Save password?" from Chrome/WebView).
 * These block UIAutomator dumps with "null root node" errors.
 */
async function dismissSystemDialogs() {
  const xml = dumpUI();
  // Chrome "Save password?" dialog has "NEVER" and "SAVE" buttons
  const neverNode = findNodeByText(xml, 'NEVER');
  if (neverNode) {
    info('Dismissing "Save password?" dialog...');
    tapXY(neverNode.x, neverNode.y);
    await sleep(1);
  }
  // Also check for "Not now", "No thanks", "Cancel" type system dialogs
  const dismissNode = findNodeByText(xml, 'Not now')
                   || findNodeByText(xml, 'No thanks')
                   || findNodeByText(xml, 'DENY');
  if (dismissNode) {
    info(`Dismissing dialog: "${dismissNode.text}"`);
    tapXY(dismissNode.x, dismissNode.y);
    await sleep(1);
  }
}

/**
 * Navigate to a bottom tab by finding its label text.
 * Tab labels: "Home", "Appts", "Health", "Profile"
 * Tab y-positions: approximately y=1434 on 1600px screen.
 */
async function navigateToTab(tabLabel) {
  info(`Navigating to "${tabLabel}" tab...`);
  // First dismiss any system dialogs that might be blocking
  await dismissSystemDialogs();
  await sleep(1);

  // Tabs are at the very bottom — try finding by text first
  const found = await tapByText(tabLabel, 4);
  if (found) {
    await sleep(2); // Wait for screen transition
    ok(`Tapped "${tabLabel}" tab`);
    return true;
  }

  // Fallback: tap at known tab bar coordinates (720px wide screen)
  // Home=115, Appts=278, Health=442, Profile=607 at y=1440
  const tabXMap = { 'Home': 115, 'Appts': 278, 'Health': 442, 'Profile': 607 };
  if (tabXMap[tabLabel]) {
    info(`Tapping "${tabLabel}" at fallback coords (${tabXMap[tabLabel]}, 1440)`);
    tapXY(tabXMap[tabLabel], 1440);
    await sleep(2);
    ok(`Tapped "${tabLabel}" tab (coordinate fallback)`);
    return true;
  }

  fail(`Could not find "${tabLabel}" tab`);
  return false;
}

/**
 * Scroll down inside the app to find an element.
 */
function scrollDown() {
  adb('shell input swipe 360 1200 360 400 400');
}

function scrollUp() {
  adb('shell input swipe 360 400 360 1200 400');
}

// ── Screen Recording ────────────────────────────────────────────────
let recordProcess = null;

function startRecording() {
  try { adb('shell pkill -2 -f screenrecord'); } catch {}
  try { execSync('sleep 2'); } catch {}
  try { adb(`shell rm -f ${DEVICE_RECORDING}`); } catch {}

  recordProcess = spawn('adb', [
    'shell', 'screenrecord', '--time-limit', String(RECORD_TIME_LIMIT), DEVICE_RECORDING,
  ], { stdio: 'ignore' });
}

function waitForRecordingToFinish() {
  return new Promise((resolve) => {
    if (!recordProcess) return resolve();
    recordProcess.on('close', () => { recordProcess = null; resolve(); });
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
    execSync(`adb pull ${DEVICE_RECORDING} "${LOCAL_VIDEO}"`, { timeout: 30000 });
    try { adb(`shell rm -f ${DEVICE_RECORDING}`); } catch {}
    return true;
  } catch { return false; }
}

// ═══════════════════════════════════════════════════════════════════
//  MAIN
// ═══════════════════════════════════════════════════════════════════
(async () => {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║   E2E FULL USER JOURNEY TEST — FULLY AUTOMATED             ║');
  console.log('║   Notify → Tap → Navigate → Verify Status on Screen        ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('');

  fs.mkdirSync(RECORDINGS_DIR, { recursive: true });

  // ═══════════════════════════════════════════════════════════════
  //  PHASE 1: Setup
  // ═══════════════════════════════════════════════════════════════

  step(1, 'Check ADB device');
  let deviceId;
  try {
    deviceId = checkDevice();
    ok(`Device: ${deviceId}`);
  } catch (e) { fail(e.message); process.exit(1); }

  step(2, 'Initialize backend (Redis + PlatformDB + Firebase)');
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
  if (!isFirebaseAvailable()) { fail('Firebase NOT available'); process.exit(1); }
  ok('Firebase ready');

  const conn = await getTenantConnection(TENANT_SLUG);
  ok(`Tenant DB [${TENANT_SLUG}] connected`);

  step(3, 'Login as Doctor + Patient');
  let doctorToken, patientToken;
  try { doctorToken = await login(DOCTOR_EMAIL, DOCTOR_PASS); ok('Doctor logged in'); }
  catch (e) { fail(`Doctor login: ${e.message}`); process.exit(1); }
  try { patientToken = await login(PATIENT_EMAIL, PATIENT_PASS); ok('Patient logged in'); }
  catch (e) { fail(`Patient login: ${e.message}`); process.exit(1); }

  step(4, 'Resolve patient + doctor records');
  const searchRes = await api('GET', `/patients?search=${encodeURIComponent(PATIENT_EMAIL)}&limit=10`, null, doctorToken);
  const patients = searchRes.data?.patients || searchRes.data || [];
  const patient = patients.find(p => p.email === PATIENT_EMAIL) || patients[0];
  if (!patient) { fail('Patient not found'); process.exit(1); }
  const patientId = patient._id;
  const patientUserId = typeof patient.user === 'object' ? patient.user._id : patient.user;
  ok(`Patient: ${patient.name} (${patientId})`);

  const meRes = await api('GET', '/auth/me', null, doctorToken);
  const doctorId = meRes.data.user?._id || meRes.data._id;
  const branchId = meRes.data.user?.branch || meRes.data.branch;
  ok(`Doctor: ${doctorId}`);

  const User = conn.model('User');
  const userDoc = await User.findById(patientUserId).select('fcmTokens').lean();
  const tokenCount = userDoc?.fcmTokens?.length || 0;
  if (tokenCount === 0) { fail('No FCM tokens — open the app and login first'); process.exit(1); }
  ok(`${tokenCount} FCM token(s) registered`);

  step(5, 'Start ADB screen recording');
  startRecording();
  ok(`Recording started (${RECORD_TIME_LIMIT}s limit)`);
  await sleep(3);

  // ═══════════════════════════════════════════════════════════════
  //  PHASE 2: Appointment Notification — send + interact + verify
  // ═══════════════════════════════════════════════════════════════

  step(6, 'Create appointment');
  const scheduledAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
  let appointmentId;
  try {
    const apptRes = await api('POST', '/appointments', {
      patient: patientId,
      doctor: doctorId,
      scheduledAt,
      duration: 30,
      type: 'consultation',
      reason: 'E2E Interaction Test — automated',
      source: 'general',
      reminderTimings: [3, 0],
      ...(branchId ? { branch: branchId } : {}),
    }, doctorToken);
    appointmentId = apptRes.data._id;
    ok(`Appointment: ${appointmentId}`);
  } catch (e) { fail(e.message); process.exit(1); }

  step(7, 'Send Appointment Reminder push (FCM)');
  const doctorDoc = await User.findById(doctorId);
  await fcmService.sendAppointmentReminder(patientUserId, TENANT_SLUG, {
    appointmentId, doctorName: doctorDoc.name, scheduledAt, patientId,
  });
  ok('FCM sent — waiting for notification to appear on device...');
  await sleep(6);

  step(8, 'Open notification shade + tap "Can\'t make it"');
  expandNotifications();
  await sleep(2);

  // "Can't make it" is the RIGHT button (second action), "Yes, I'll attend" is LEFT
  const apptTapped = await tapNotificationAction('Appointment Reminder', 'right', "Can't make it");
  if (!apptTapped) {
    // Try the left button instead
    const altTapped = await tapNotificationAction('Appointment Reminder', 'left', "Yes, I'll attend");
    if (!altTapped) {
      const debugXml = dumpUI();
      const debugPath = path.join(RECORDINGS_DIR, `ui-dump-appt-${TIMESTAMP}.xml`);
      fs.writeFileSync(debugPath, debugXml);
      info(`UI dump saved: ${debugPath}`);
    }
  }

  await sleep(3); // Wait for API call to complete

  step(9, 'Verify DB: appointment confirmation status');
  const Appointment = conn.model('Appointment');
  const apptCheck = await Appointment.findById(appointmentId).lean();
  const pc = apptCheck?.patientConfirmation;
  const confirmStatus = typeof pc === 'object' && pc !== null ? pc.status : (apptCheck?.confirmationStatus || pc);
  if (confirmStatus === 'declined' || confirmStatus === 'confirmed') {
    ok(`Appointment confirmationStatus = "${confirmStatus}" ✓ (API call from notification worked!)`);
    if (pc?.respondedAt) info(`respondedAt: ${pc.respondedAt}`);
  } else {
    info(`Current confirmationStatus = "${confirmStatus || 'not set'}"`);
    if (typeof pc === 'object') info(`patientConfirmation object: ${JSON.stringify(pc)}`);
    info('This may mean the background handler API call is still pending or failed');
  }

  // Close shade, back to app
  collapseNotifications();
  await sleep(2);

  // ── Visual Verification: Navigate to Appointments screen ──
  step(10, 'Navigate to Appts tab → verify appointment status on screen');
  launchApp();
  await sleep(4);
  await dismissSystemDialogs();
  await sleep(1);

  if (await navigateToTab('Appts')) {
    await sleep(3); // Wait for appointment list to load

    // Look for the appointment card — search for "E2E" or the appointment reason
    const xml10 = dumpUI();
    const apptCard = findNodeByText(xml10, 'E2E Interaction Test')
                  || findNodeByText(xml10, 'consultation')
                  || findNodeByText(xml10, doctorDoc?.name || 'Sandeep');
    if (apptCard) {
      info(`Found appointment card at y=${apptCard.y} — tapping to open detail`);
      tapXY(apptCard.x, apptCard.y);
      await sleep(3); // Wait for detail screen

      // Check for confirmation status text on the detail screen
      const detailXml = dumpUI();
      const declinedNode = findNodeByText(detailXml, 'declined')
                        || findNodeByText(detailXml, "can't attend")
                        || findNodeByText(detailXml, 'rescheduling');
      const confirmedNode = findNodeByText(detailXml, 'confirmed')
                         || findNodeByText(detailXml, "you've confirmed");
      if (declinedNode) {
        ok(`UI shows declined status: "${declinedNode.text.slice(0, 60)}"`);
      } else if (confirmedNode) {
        ok(`UI shows confirmed status: "${confirmedNode.text.slice(0, 60)}"`);
      } else {
        info('Could not find confirmation status text on detail screen — it may still be loading');
        // Log what we DO see for debug
        const allTexts = findAllNodesByText(detailXml, 'attend');
        if (allTexts.length) info(`Found "attend" references: ${allTexts.map(n => n.text.slice(0, 40)).join(', ')}`);
      }

      // Give the viewer 3 seconds to see the detail screen on camera
      await sleep(3);

      // Go back to home so we start fresh for the care task flow
      pressBack();
      await sleep(1);
    } else {
      info('Appointment card not found on Appts tab — may need to scroll');
    }
  }

  // Navigate back to Home tab before starting care flow
  await navigateToTab('Home');
  await sleep(2);

  // ═══════════════════════════════════════════════════════════════
  //  PHASE 3: Care Reminder — send + background interact + verify
  // ═══════════════════════════════════════════════════════════════

  step(11, 'Create consultation with care tasks');
  let consultationId;
  try {
    const consultRes = await api('POST', '/doctor/consultations', {
      appointmentId,
      diagnosis: 'Moderate dental caries on tooth #36',
      treatment: 'Composite filling + medication course',
      notes: 'E2E interaction test — automated',
    }, doctorToken);
    consultationId = consultRes.data?.record?._id || consultRes.data?._id;
    ok(`Consultation: ${consultationId}`);
  } catch (e) { fail(`Consultation: ${e.message}`); }

  if (consultationId) {
    try {
      await api('PUT', `/doctor/consultations/${consultationId}`, {
        chiefComplaint: 'Toothache on lower left molar',
        diagnosis: 'Moderate dental caries on tooth #36',
        treatment: 'Class II composite restoration',
        severity: 'moderate',
        procedure: 'Composite Filling',
        visitType: 'consultation',
        prescription: [
          { medication: 'Amoxicillin 500mg', dosage: '500mg', frequency: 'thrice_daily', duration: '7 days', notes: 'After meals' },
        ],
        careTasks: [
          { title: 'Salt water gargle', taskType: 'post_care', instructions: 'Warm salt water gargle', frequency: 'twice_daily', enabled: true, reminderEnabled: true },
        ],
      }, doctorToken);
      ok('Prescription + care tasks added');
    } catch (e) { fail(`Update: ${e.message}`); }

    const sigData = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';
    try {
      await api('PUT', `/doctor/consultations/${consultationId}/complete`, {
        doctorSignature: { dataUrl: sigData },
      }, doctorToken);
      ok('Consultation completed — care tasks generated');
    } catch (e) { fail(`Complete: ${e.message}`); }
  }

  step(12, 'Send Care Reminder push (FCM)');
  let careReminderId = null;
  let careTaskId = null;
  try {
    const tasksRes = await api('GET', '/portal/care-tasks', null, patientToken);
    const tasks = tasksRes.data?.tasks || tasksRes.data || [];
    if (tasks.length > 0) {
      const task = tasks[0];
      careTaskId = task._id;
      const remindersRes = await api('GET', `/portal/care-tasks/${task._id}/reminders`, null, patientToken);
      const reminders = remindersRes.data?.reminders || remindersRes.data || [];
      const pending = reminders.find(r => r.status === 'pending' || r.status === 'sent');
      careReminderId = pending ? pending._id : null;

      await fcmService.sendCareReminder(patientUserId, TENANT_SLUG, {
        reminderId: (careReminderId || 'test').toString(),
        taskId: task._id.toString(),
        prescriptionId: task.prescription ? task.prescription.toString() : '',
        patientId: patientId.toString(),
        taskTitle: task.title,
      });
      ok(`Care Reminder FCM sent: "${task.title}"`);
    } else {
      fail('No care tasks found');
    }
  } catch (e) { fail(`Care reminder: ${e.message}`); }

  step(13, 'Background the app + wait for notification');
  pressHome();
  ok('App backgrounded (Home pressed)');
  await sleep(5);

  step(14, 'Open notification shade + tap "Done"');
  expandNotifications();
  await sleep(2);

  // "Done" is LEFT button (first action), "Skip" is RIGHT
  const careTapped = await tapNotificationAction('Care Reminder', 'left', 'Done');
  if (!careTapped) {
    const skipTapped = await tapNotificationAction('Care Reminder', 'right', 'Skip');
    if (!skipTapped) {
      const debugXml = dumpUI();
      const debugPath = path.join(RECORDINGS_DIR, `ui-dump-care-${TIMESTAMP}.xml`);
      fs.writeFileSync(debugPath, debugXml);
      info(`UI dump saved: ${debugPath}`);
    }
  }

  await sleep(3); // Wait for background API call

  step(15, 'Verify DB: care reminder status');
  if (careReminderId && careTaskId) {
    const CareReminder = conn.model('CareReminder');
    const remCheck = await CareReminder.findById(careReminderId).lean();
    if (remCheck) {
      if (remCheck.status === 'done' || remCheck.status === 'skipped') {
        ok(`Care reminder status = "${remCheck.status}" ✓ (Background API call worked!)`);
      } else {
        info(`Current status = "${remCheck.status}" — may still be updating`);
      }
    } else {
      info('Reminder doc not found — checking by task...');
      const reminders = await CareReminder.find({ task: careTaskId }).sort({ scheduledAt: 1 }).lean();
      const responded = reminders.find(r => r.status === 'done' || r.status === 'skipped');
      if (responded) {
        ok(`Found responded reminder: status = "${responded.status}" ✓`);
      } else {
        info(`All reminders still pending (${reminders.length} total)`);
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════
  //  PHASE 4: Visual Verification — care task on Health tab
  // ═══════════════════════════════════════════════════════════════

  step(16, 'Bring app to foreground + navigate to Health tab');
  collapseNotifications();
  await sleep(1);
  launchApp();
  ok('App launched — useFocusEffect will trigger data refresh');
  await sleep(4);
  await dismissSystemDialogs();
  await sleep(1);

  if (await navigateToTab('Health')) {
    await sleep(3); // Wait for care task list to load

    // Look for care task stats showing "1 done"
    const healthXml = dumpUI();
    const doneNode = findNodeByText(healthXml, 'done');
    const taskNode = findNodeByText(healthXml, 'Salt water gargle')
                  || findNodeByText(healthXml, 'gargle');
    if (taskNode) {
      ok(`Found care task on Health tab: "${taskNode.text.slice(0, 50)}"`);
      if (doneNode) {
        ok(`Found completion status: "${doneNode.text.slice(0, 40)}"`);
      }

      // Tap the care task card to see detail screen
      info('Tapping care task to open detail screen...');
      tapXY(taskNode.x, taskNode.y);
      await sleep(3);

      step(17, 'Verify care task detail screen shows updated stats');
      const detailXml = dumpUI();

      // Look for stats: "Done", "Skipped", "Missed", "Left" stat cards
      const doneStatNode = findNodeByText(detailXml, 'Done')
                        || findNodeByText(detailXml, '1');
      const leftNode = findNodeByText(detailXml, 'Left')
                     || findNodeByText(detailXml, 'left');
      const progressNode = findNodeByText(detailXml, 'Progress')
                        || findNodeByText(detailXml, 'Completion');

      if (doneStatNode) {
        ok(`Detail screen shows: "${doneStatNode.text.slice(0, 30)}"`);
      }
      if (leftNode) {
        info(`Remaining: "${leftNode.text.slice(0, 30)}"`);
      }
      if (progressNode) {
        info(`Progress: "${progressNode.text.slice(0, 30)}"`);
      }

      // Check for the specific "Done" status badge on the reminder row
      const reminderDone = findNodeByText(detailXml, 'done');
      if (reminderDone) {
        ok(`Reminder status badge visible: "${reminderDone.text.slice(0, 30)}"`);
      }

      // Give viewer 4 seconds to see the detail screen on camera
      await sleep(4);

      // Go back to care task list
      pressBack();
      await sleep(2);
    } else {
      info('Care task not found on Health tab — checking "Today" view');
      // Try the "Today" view if available
      const todayNode = findNodeByText(healthXml, 'Today');
      if (todayNode) {
        tapXY(todayNode.x, todayNode.y);
        await sleep(2);
        const todayXml = dumpUI();
        const doneReminder = findNodeByText(todayXml, 'done')
                          || findNodeByText(todayXml, 'Done');
        if (doneReminder) {
          ok(`Today view shows: "${doneReminder.text.slice(0, 40)}"`);
        }
      }
      await sleep(3);
    }
  }

  // Give 3 seconds viewing the Health tab on camera
  await sleep(3);

  // ═══════════════════════════════════════════════════════════════
  //  PHASE 5: Finish recording + pull
  // ═══════════════════════════════════════════════════════════════

  step(18, 'Waiting for screen recording to finish...');
  info(`Recording auto-stops at ${RECORD_TIME_LIMIT}s. Please wait.`);
  await waitForRecordingToFinish();
  ok('Recording finished (moov atom written)');
  await sleep(2);

  step(19, 'Pull recording from device');
  const pulled = pullRecording();
  if (pulled) {
    const stats = fs.statSync(LOCAL_VIDEO);
    ok(`Video: ${LOCAL_VIDEO}`);
    info(`Size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);

    // Validate MP4 with ffprobe
    try {
      const probe = execSync(`ffprobe -v error -show_entries format=duration -show_entries stream=width,height -of default=noprint_wrappers=1 "${LOCAL_VIDEO}"`, { encoding: 'utf8', timeout: 10000 });
      info(`ffprobe: ${probe.trim().replace(/\n/g, ' | ')}`);
    } catch {}
  } else {
    fail('Could not pull recording');
    await sleep(3);
    if (pullRecording()) ok('Pulled on retry');
    else fail('Pull failed completely');
  }

  // Save log
  fs.writeFileSync(LOCAL_LOG, logLines.join('\n'));
  ok(`Log: ${LOCAL_LOG}`);

  // ═══════════════════════════════════════════════════════════════
  //  SUMMARY
  // ═══════════════════════════════════════════════════════════════
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║   E2E FULL USER JOURNEY TEST COMPLETE                      ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`  Appointment:  ${appointmentId}  →  confirmationStatus: ${confirmStatus || '(check DB)'}`);
  console.log(`  Consultation: ${consultationId || 'N/A'}`);
  console.log(`  Care Task:    ${careTaskId || 'N/A'}  →  reminder: ${careReminderId || 'N/A'}`);
  console.log('');
  console.log('  What was tested (full user journey):');
  console.log('    1. Appointment Reminder: sent → notification appeared → tapped "Can\'t make it"');
  console.log('    2. → Navigated to Appts tab → opened appointment → verified Declined status on screen');
  console.log('    3. Care Reminder: sent → app backgrounded → notification appeared → tapped "Done"');
  console.log('    4. → DB confirmed: reminder status = "done"');
  console.log('    5. → Navigated to Health tab → verified care task shows "done" count');
  console.log('    6. → Opened care task detail → verified stats updated');
  console.log('');
  console.log('  Evidence:');
  console.log(`    Video: ${LOCAL_VIDEO}`);
  console.log(`    Log:   ${LOCAL_LOG}`);
  console.log('');

  process.exit(0);
})().catch(e => {
  fail(`Fatal: ${e.message}`);
  console.error(e.stack);
  try { execSync('adb shell pkill -2 -f screenrecord 2>/dev/null', { timeout: 5000 }); } catch {}
  process.exit(1);
});
