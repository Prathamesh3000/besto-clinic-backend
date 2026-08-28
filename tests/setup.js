'use strict';

/**
 * Jest global setup — spins up an in-memory MongoDB and sets env vars
 * before any test suite runs.
 */

const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');

let mongoServer;

/**
 * Integration tests get 30s per test and hook, not Jest's default 5s.
 *
 * These suites start an in-memory MongoDB, provision a tenant and open a real
 * tenant connection inside `beforeEach`. That takes ~3.7s on an idle machine —
 * comfortably under the default until the rest of the suite is running beside it,
 * at which point it crosses 5s and `patientScope.test.js` fails with
 * "Exceeded timeout of 5000 ms for a hook" while passing in isolation.
 *
 * That flakiness is worth fixing rather than tolerating, because CP-7 is the gate
 * asserting the migration has not degraded the running product. A gate that goes
 * red for reasons unrelated to what it tests trains people to ignore it, and this
 * one is the only thing watching the live application.
 *
 * This applies only to the integration project — `setupFilesAfterEach` is not
 * loaded for unit tests, which keep the strict default.
 */
jest.setTimeout(30_000);

beforeAll(async () => {
  // In-memory MongoDB for isolated tests
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();

  // Set env vars that config/env.js needs
  process.env.NODE_ENV = 'test';
  process.env.PLATFORM_DB_URI = uri;
  process.env.REDIS_URL = 'redis://127.0.0.1:6379';
  process.env.JWT_ACCESS_SECRET = 'test-access-secret-that-is-at-least-32-chars';
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-that-is-at-least-32-chars';
  process.env.JWT_PLATFORM_SECRET = 'test-platform-secret-that-is-at-least-32-chars';
  process.env.APP_ENCRYPTION_KEY = 'a'.repeat(64);
  process.env.SMTP_HOST = 'localhost';
  process.env.SMTP_PORT = '2525';
  process.env.SMTP_USER = 'test';
  process.env.SMTP_PASS = 'test';
  process.env.SMTP_FROM = 'test@test.com';
  process.env.RAZORPAY_KEY_ID = 'rzp_test_000000000000';
  process.env.RAZORPAY_KEY_SECRET = 'test_secret';
  process.env.RAZORPAY_WEBHOOK_SECRET = 'test_webhook_secret';

  await mongoose.connect(uri);
});

afterAll(async () => {
  await mongoose.disconnect();
  if (mongoServer) await mongoServer.stop();
});

afterEach(async () => {
  // Clean all collections between tests
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }
});
