'use strict';

/**
 * dbManager — high-level facade over platform + tenant connections.
 *
 * Controllers/services call:
 *   const db = require('../db/dbManager');
 *   const Patient = db.getTenantModel(req, 'Patient');
 *   const clinics = await db.platformModel('Clinic').find();
 *
 * This keeps the data-access concern out of business logic and makes
 * it trivial to swap the underlying connection strategy.
 */

const mongoose = require('mongoose');
const { getTenantConnection } = require('./tenantConnectionManager');

/**
 * Get a Mongoose model scoped to the requesting tenant's database.
 *
 * @param {import('express').Request} req - must have req.tenantSlug (set by tenantResolver middleware)
 * @param {string} modelName - e.g. 'Patient', 'Appointment'
 * @returns {Promise<mongoose.Model>}
 */
async function getTenantModel(req, modelName) {
  if (!req.tenantSlug) {
    throw new Error('Tenant not resolved — is tenantResolver middleware applied?');
  }
  const conn = await getTenantConnection(req.tenantSlug);
  return conn.model(modelName);
}

/**
 * Get a platform-scoped model (Clinic, Subscription, PlatformUser).
 * These live on the default mongoose connection.
 *
 * @param {string} modelName
 * @returns {mongoose.Model}
 */
function platformModel(modelName) {
  return mongoose.model(modelName);
}

/**
 * Execute a callback with a tenant connection (useful for transactions).
 *
 * @param {string} slug
 * @param {(conn: mongoose.Connection) => Promise<*>} cb
 */
async function withTenantConnection(slug, cb) {
  const conn = await getTenantConnection(slug);
  return cb(conn);
}

module.exports = {
  getTenantModel,
  platformModel,
  withTenantConnection,
};
