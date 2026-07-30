'use strict';

/**
 * Firebase Admin SDK — lazy-initialized singleton.
 *
 * Usage:
 *   const { initFirebase, getMessaging } = require('./firebase');
 *   await initFirebase();          // call once at startup
 *   const messaging = getMessaging(); // returns admin.messaging()
 */

const path = require('path');
const fs = require('fs');
const admin = require('firebase-admin');
const logger = require('../utils/logger');

let app = null;
let messaging = null;

/**
 * Initialize Firebase Admin. Safe to call multiple times.
 * Gracefully degrades if service account path is not configured.
 */
function initFirebase() {
  if (app) return;

  const env = require('./env');
  const serviceAccountPath = env.FIREBASE_SERVICE_ACCOUNT_PATH;
  const serviceAccountJson = env.FIREBASE_SERVICE_ACCOUNT_JSON;

  if (!serviceAccountPath && !serviceAccountJson) {
    logger.warn('Firebase: no service account configured — push notifications disabled');
    logger.warn('Firebase: set FIREBASE_SERVICE_ACCOUNT_PATH (file) or FIREBASE_SERVICE_ACCOUNT_JSON (env var)');
    return;
  }

  try {
    let serviceAccount;

    if (serviceAccountJson) {
      // PaaS mode: parse JSON from environment variable (Render, Railway, etc.)
      serviceAccount = JSON.parse(serviceAccountJson);
    } else {
      // Local mode: load from file path (resolve relative to project root, not this file)
      const resolved = path.resolve(process.cwd(), serviceAccountPath);
      serviceAccount = JSON.parse(fs.readFileSync(resolved, 'utf8'));
    }

    app = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });

    messaging = app.messaging();
    logger.info('Firebase: initialized');
  } catch (err) {
    logger.error(`Firebase: init failed — ${err.message}`);
  }
}

/**
 * Get Firebase Cloud Messaging instance.
 * Returns null if Firebase is not configured (graceful degradation).
 * @returns {admin.messaging.Messaging|null}
 */
function getMessaging() {
  return messaging;
}

/**
 * Check if Firebase is available.
 * @returns {boolean}
 */
function isFirebaseAvailable() {
  return messaging !== null;
}

module.exports = { initFirebase, getMessaging, isFirebaseAvailable };
