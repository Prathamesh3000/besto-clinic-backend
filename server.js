'use strict';

/**
 * BestoClinic — Server entry point.
 *
 * Boot sequence:
 *   1. Validate environment (env.js — runs on require)
 *   2. Connect to platform MongoDB
 *   3. Connect to Redis
 *   4. Start BullMQ workers
 *   5. Create Express app + HTTP server
 *   6. Initialize WebSocket
 *   7. Start listening
 *   8. Schedule idle connection pruning
 *
 * Shutdown sequence (SIGTERM / SIGINT):
 *   1. Stop accepting new connections
 *   2. Stop BullMQ workers
 *   3. Close all tenant DB connections
 *   4. Disconnect platform DB
 *   5. Disconnect Redis
 *   6. Exit
 */

const http = require('http');
const logger = require('./src/utils/logger');

// Step 1: env validation runs on require (fails fast)
const env = require('./src/config/env');

const { connectPlatformDB, disconnectPlatformDB } = require('./src/db/platformConnection');
const { connectRedis, disconnectRedis } = require('./src/config/redis');
const { initFirebase } = require('./src/config/firebase');
const { closeAllTenantConnections, pruneIdleConnections } = require('./src/db/tenantConnectionManager');
const { startWorkers, stopWorkers } = require('./src/jobs');
const { initWebSocket } = require('./src/websocket');
const createApp = require('./src/app');

// Ensure platform models are registered before anything uses them
require('./src/models/platform/Clinic');
require('./src/models/platform/Subscription');
require('./src/models/platform/PlatformUser');
require('./src/models/platform/ProvisioningStatus');
require('./src/models/platform/Integration');
require('./src/models/platform/GuestScan');
require('./src/models/platform/PrescriptionScan');
require('./src/models/platform/JobPosting');
require('./src/models/platform/JobApplication');
require('./src/models/platform/CreditWallet');
require('./src/models/platform/CreditTransaction');

const SHUTDOWN_TIMEOUT_MS = 28_000;
let server;
let pruneInterval;

const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);

async function boot() {
  try {
    // Step 2: Platform MongoDB
    await connectPlatformDB();

    // Step 3: Redis
    await connectRedis();

    // Step 3b: Ensure upload directories exist (non-fatal — S3 mode doesn't need local dirs)
    const fs = require('fs');
    const path = require('path');
    // Keep in sync with the mkdir list in the Dockerfile. 'resumes' is written by
    // the job portal (jobPortal.service applyToJob) and was missing from both.
    const uploadDirs = ['uploads', 'uploads/logos', 'uploads/prescription-scans', 'uploads/xrays', 'uploads/avatars', 'uploads/documents', 'uploads/resumes'];
    for (const dir of uploadDirs) {
      try {
        fs.mkdirSync(path.resolve(process.cwd(), dir), { recursive: true });
      } catch (err) {
        logger.warn('Could not create %s: %s (uploads may fail if using local storage)', dir, err.message);
      }
    }

    // Step 3c: Firebase Admin SDK (push notifications — graceful if not configured)
    initFirebase();

    // Step 4: BullMQ workers (await readiness before accepting requests)
    await startWorkers();

    // Step 5: Express app
    const app = createApp();
    server = http.createServer(app);

    // Step 6: WebSocket
    initWebSocket(server);

    // Step 7: Listen
    const PORT = env.PORT || 5000;
    server.listen(PORT, () => {
      logger.info('🚀 BestoClinic API running on port %d (%s)', PORT, env.NODE_ENV);
      logger.info('   Health: https://bestoclinic.com/api/v1/health (port %d)', PORT);
    });

    // Step 8: Prune idle tenant connections every 10 min
    pruneInterval = setInterval(pruneIdleConnections, 10 * 60 * 1000);

  } catch (err) {
    logger.error('Boot failed: %s', err.message);
    process.exit(1);
  }
}

// ── Graceful shutdown ───────────────────────────

async function shutdown(signal) {
  logger.info('Shutdown initiated (%s) — closing gracefully…', signal);

  // Force exit if shutdown takes too long
  const forceTimer = setTimeout(() => {
    logger.error('Shutdown timed out after %ds — forcing exit', SHUTDOWN_TIMEOUT_MS / 1000);
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  forceTimer.unref();

  // Clear prune interval
  if (pruneInterval) clearInterval(pruneInterval);

  // Stop HTTP server (stop accepting new connections)
  if (server) {
    await new Promise((resolve) => {
      server.close(() => {
        logger.info('HTTP server closed');
        resolve();
      });
    });
  }

  // Stop workers → close tenant DBs → platform DB → Redis
  try {
    await stopWorkers();
    await closeAllTenantConnections();
    await disconnectPlatformDB();
    await disconnectRedis();
    logger.info('Shutdown complete — goodbye.');
  } catch (err) {
    logger.error('Error during shutdown: %s', err.message);
  }

  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Catch unhandled errors
process.on('unhandledRejection', (err) => {
  logger.error('Unhandled rejection: %s', err?.message || err);
});

process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception: %s', err.message);
  shutdown('uncaughtException');
});

// Launch
boot();
