#!/usr/bin/env node
/**
 * Sends a test "incoming call" FCM push notification to trigger the
 * full-screen ringing UI on the mobile app. Used for Play Console
 * foreground-service demo video.
 *
 * Usage:
 *   node scripts/send-test-call.js          # auto-picks first user with a token
 *   node scripts/send-test-call.js <token>  # send to a specific FCM token
 */
'use strict';

require('dotenv').config();
const admin = require('firebase-admin');
const mongoose = require('mongoose');
const path = require('path');

const SA_PATH = process.env.FIREBASE_SERVICE_ACCOUNT_PATH || './firebase-service-account.json';

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(require(path.resolve(SA_PATH))),
  });
}

async function findToken() {
  const explicit = process.argv[2];
  if (explicit) return explicit;

  // Search tenant DBs for any user with an FCM token
  const platformUri = process.env.PLATFORM_DB_URI;
  const conn = await mongoose.createConnection(platformUri).asPromise();
  const adminDb = conn.db.admin();
  const { databases } = await adminDb.listDatabases();
  const tenantDbs = databases.filter((d) => d.name.startsWith('bestoclinic_') || d.name.startsWith('tenant_'));

  for (const db of tenantDbs) {
    const tConn = await mongoose.createConnection(
      platformUri.replace(/\/[^/?]+(\?|$)/, `/${db.name}$1`),
    ).asPromise();
    const user = await tConn.db.collection('users').findOne(
      { fcmTokens: { $exists: true, $not: { $size: 0 } } },
      { projection: { name: 1, role: 1, fcmTokens: 1 } },
    );
    await tConn.close();
    if (user?.fcmTokens?.[0]) {
      const raw = user.fcmTokens[0];
      const tok = typeof raw === 'object' ? raw.token : raw;
      if (tok) {
        console.log(`Found token for ${user.name} (${user.role}) in ${db.name}`);
        await conn.close();
        return tok;
      }
    }
  }
  await conn.close();
  return null;
}

async function main() {
  const token = await findToken();
  if (!token) {
    console.error('No FCM token found. Open the app on the emulator and log in first.');
    process.exit(1);
  }

  console.log(`Sending incoming-call push to token: ${token.slice(0, 20)}...`);

  const message = {
    token,
    data: {
      type: 'incoming_call',
      title: 'Incoming Video Call',
      body: 'Dr. Sandeep Jathar is calling',
      callerName: 'Dr. Sandeep Jathar',
      sessionId: '000000000000000000000001',
    },
    android: {
      priority: 'high',
      ttl: 60000,
    },
  };

  try {
    const res = await admin.messaging().send(message);
    console.log('Push sent successfully! Message ID:', res);
    console.log('\n--- Now screen-record the emulator showing the incoming call notification ---');
  } catch (err) {
    console.error('Failed to send push:', err.message);
    if (err.code === 'messaging/registration-token-not-registered') {
      console.error('Token is stale. Re-open the app to get a fresh token.');
    }
  }

  process.exit(0);
}

main();
