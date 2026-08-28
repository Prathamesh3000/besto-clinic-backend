'use strict';

/**
 * Test tenant helper.
 *
 * Tenant connections are resolved from the platform DB: `getTenantConnection(slug)`
 * looks up a Clinic and uses its `dbUri` (see db/tenantConnectionManager.js
 * `_resolveTenantUri`). Seeding one Clinic that points back at the in-memory
 * server is therefore enough to exercise real tenant-scoped code in tests.
 *
 * Redis is optional there — the resolver falls back to the platform DB when it
 * is unavailable, which is exactly the case under test.
 */

const mongoose = require('mongoose');

// Register the platform Clinic schema. Suites that reach the tenant layer
// directly (rather than through a service) would not otherwise have loaded it,
// and `mongoose.model('Clinic')` would throw MissingSchemaError.
require('../../src/models/platform/Clinic');

const TEST_SLUG = 'test-clinic';

/**
 * Create the Clinic record that backs `TEST_SLUG` and return its slug.
 *
 * Also wipes the tenant database. tests/setup.js only clears collections on the
 * default mongoose connection (the platform DB) — a tenant connection is a
 * separate `mongoose.createConnection`, and the manager pools it by slug, so
 * without this documents leaked between tests and assertions matched records
 * created by an earlier one.
 */
async function seedTestTenant(slug = TEST_SLUG) {
  // The platform URI already points at the in-memory server (tests/setup.js).
  // Give the tenant its own database on the same instance.
  const base = process.env.PLATFORM_DB_URI.replace(/\/[^/?]*(\?.*)?$/, '');
  const dbUri = `${base}/tenant_${slug.replace(/-/g, '_')}`;

  const Clinic = mongoose.model('Clinic');
  await Clinic.create({
    name: 'Test Clinic',
    slug,
    email: `${slug}@example.com`,
    phone: '9999999999',
    clinicCode: 'TEST0001',
    dbUri,
    status: 'active',
  });

  await clearTenantData(slug);

  return slug;
}

/** Drop every collection in the tenant database, leaving the connection pooled. */
async function clearTenantData(slug = TEST_SLUG) {
  const { getTenantConnection } = require('../../src/db/tenantConnectionManager');
  const conn = await getTenantConnection(slug);
  const collections = await conn.db.collections();
  await Promise.all(collections.map((c) => c.deleteMany({})));
  return conn;
}

module.exports = { seedTestTenant, clearTenantData, TEST_SLUG };
