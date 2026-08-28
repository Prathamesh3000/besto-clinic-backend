'use strict';

/**
 * Tenant enumeration for the migration tooling.
 *
 * Every clinic lives in its own MongoDB database, addressed by a `dbUri` held on
 * the platform `clinics` collection. Anything that has to walk all clinics —
 * profiling, ETL, the CP-4/CP-5 verifiers — needs the same three steps, so they
 * live here once.
 *
 * NOTE ON DUPLICATION: scripts/sql/profile-mongo.js carries its own local copy
 * of `resolveClinicUri`. Both were written concurrently. They should converge on
 * this module; the copy there is the one to delete, not this one, because the
 * verifiers need `listTenants` as well. Left in place for now rather than edited
 * underneath an in-flight session.
 *
 * Everything here is READ-ONLY. No function opens a write path to Mongo.
 */

const mongoose = require('mongoose');
const { mongo } = require('../config');

/**
 * Resolve a clinic's stored `dbUri` to a usable connection string.
 *
 * The field is documented as encrypted but is stored in PLAINTEXT: the
 * connection manager encrypts only on the Redis cache write path
 * (`_resolveTenantUri`), never before persisting to the platform database.
 * Handle both shapes so this keeps working if that is ever corrected — and so
 * it does not quietly break the day it is.
 */
function resolveClinicUri(dbUri, encryptionKey) {
  if (!dbUri) throw new Error('clinic has no dbUri');
  if (/^mongodb(\+srv)?:\/\//i.test(dbUri)) return dbUri;

  // AES-GCM payloads from src/utils/encryption are "iv:tag:ciphertext".
  if (String(dbUri).split(':').length === 3) {
    if (!encryptionKey) {
      throw new Error('dbUri is encrypted but APP_ENCRYPTION_KEY is not set');
    }
    return require('../../src/utils/encryption').decrypt(dbUri, encryptionKey);
  }

  throw new Error('dbUri is neither a MongoDB URI nor an iv:tag:ciphertext payload');
}

/** Open a read-only connection to the platform database. */
async function connectPlatform() {
  if (!mongo.uri) {
    throw new Error('No Mongo source URI — set SQL_SOURCE_MONGO_URI or PLATFORM_DB_URI in .env');
  }
  return mongoose
    .createConnection(mongo.uri, {
      readPreference: mongo.readPreference,
      serverSelectionTimeoutMS: 10000,
    })
    .asPromise();
}

/**
 * Every clinic with a database, newest first.
 * @returns {Promise<Array<{_id: any, slug: string, name: string, dbUri: string}>>}
 */
async function listTenants(platformConn, { slug = null } = {}) {
  const filter = { deletedAt: null };
  if (slug) filter.slug = slug;

  const clinics = await platformConn.db
    .collection('clinics')
    .find(filter, { projection: { slug: 1, name: 1, dbUri: 1 } })
    .toArray();

  return clinics.filter((c) => c.dbUri);
}

/** Open a read-only connection to one clinic's database. */
async function connectTenant(clinic) {
  const uri = resolveClinicUri(clinic.dbUri, process.env.APP_ENCRYPTION_KEY);
  return mongoose
    .createConnection(uri, {
      readPreference: mongo.readPreference,
      serverSelectionTimeoutMS: 10000,
    })
    .asPromise();
}

/**
 * Run `fn(conn, clinic)` against each clinic in turn, closing every connection
 * even on failure. A clinic that cannot be reached is reported and skipped
 * rather than aborting a run that has already done useful work — the caller
 * decides whether partial results are acceptable.
 *
 * Sequential by design: the source is a live cluster and this tooling must not
 * add concurrent scan load to it.
 */
async function forEachTenant(platformConn, fn, { slug = null, onError = null } = {}) {
  const clinics = await listTenants(platformConn, { slug });
  const results = [];

  for (const clinic of clinics) {
    let conn = null;
    try {
      conn = await connectTenant(clinic);
      results.push({ clinic, value: await fn(conn, clinic), error: null });
    } catch (err) {
      if (onError) onError(clinic, err);
      results.push({ clinic, value: null, error: err });
    } finally {
      if (conn) await conn.close().catch(() => {});
    }
  }

  return results;
}

module.exports = { resolveClinicUri, connectPlatform, listTenants, connectTenant, forEachTenant };
