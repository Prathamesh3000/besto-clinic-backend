'use strict';

const crypto = require('crypto');
const { getTenantConnection } = require('../db/tenantConnectionManager');
const CalendarFeedToken = require('../models/platform/CalendarFeedToken');
const ApiError = require('../utils/ApiError');

/**
 * Generate a new calendar feed for a doctor or patient.
 *
 * Creates both the tenant-scoped CalendarFeed document and the
 * platform-scoped CalendarFeedToken index entry.
 */
async function generateFeed(feedType, targetId, tenantSlug, createdBy, options = {}) {
  const conn = await getTenantConnection(tenantSlug);
  const CalendarFeed = conn.model('CalendarFeed');

  // Check if an active feed already exists
  const query = feedType === 'doctor'
    ? { doctor: targetId, feedType, deletedAt: null }
    : { patient: targetId, feedType, deletedAt: null };

  const existing = await CalendarFeed.findOne(query);
  if (existing) {
    throw ApiError.badRequest('A calendar feed already exists. Revoke it first or regenerate the token.');
  }

  const token = crypto.randomUUID();

  const feed = await CalendarFeed.create({
    [feedType === 'doctor' ? 'doctor' : 'patient']: targetId,
    feedType,
    token,
    isEnabled: true,
    showPatientNames: options.showPatientNames || false,
    includeLeaves: options.includeLeaves !== false,
    branch: options.branch || null,
    createdBy,
  });

  // Sync to platform DB for cross-tenant token resolution
  await CalendarFeedToken.create({
    token,
    tenantSlug,
    feedType,
    isEnabled: true,
  });

  return feed;
}

/**
 * Revoke (soft-delete) a calendar feed.
 */
async function revokeFeed(feedId, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const CalendarFeed = conn.model('CalendarFeed');

  const feed = await CalendarFeed.findById(feedId);
  if (!feed) throw ApiError.notFound('Calendar feed not found');

  // Disable platform token
  await CalendarFeedToken.updateOne(
    { token: feed.token },
    { $set: { isEnabled: false } },
  );

  // Soft-delete tenant feed
  feed.deletedAt = new Date();
  feed.isEnabled = false;
  await feed.save();

  return { message: 'Feed revoked' };
}

/**
 * Regenerate a feed token (old URLs stop working immediately).
 */
async function regenerateFeed(feedId, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const CalendarFeed = conn.model('CalendarFeed');

  const feed = await CalendarFeed.findById(feedId);
  if (!feed) throw ApiError.notFound('Calendar feed not found');

  const oldToken = feed.token;
  const newToken = crypto.randomUUID();

  // Remove old platform token, create new one
  await CalendarFeedToken.deleteOne({ token: oldToken });
  await CalendarFeedToken.create({
    token: newToken,
    tenantSlug,
    feedType: feed.feedType,
    isEnabled: feed.isEnabled,
  });

  feed.token = newToken;
  await feed.save();

  return feed;
}

/**
 * Update feed settings (privacy, enabled state).
 */
async function updateFeedSettings(feedId, settings, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const CalendarFeed = conn.model('CalendarFeed');

  const feed = await CalendarFeed.findById(feedId);
  if (!feed) throw ApiError.notFound('Calendar feed not found');

  const allowed = ['showPatientNames', 'includeLeaves', 'isEnabled'];
  for (const key of allowed) {
    if (settings[key] !== undefined) feed[key] = settings[key];
  }
  await feed.save();

  // Sync isEnabled to platform token
  if (settings.isEnabled !== undefined) {
    await CalendarFeedToken.updateOne(
      { token: feed.token },
      { $set: { isEnabled: settings.isEnabled } },
    );
  }

  return feed;
}

/**
 * List feeds for a specific doctor or patient.
 */
async function listFeeds(targetId, feedType, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const CalendarFeed = conn.model('CalendarFeed');

  const query = feedType === 'doctor'
    ? { doctor: targetId, feedType }
    : { patient: targetId, feedType };

  return CalendarFeed.find(query).sort({ createdAt: -1 }).lean();
}

/**
 * Resolve a public token to its tenant slug (platform DB lookup).
 * Returns null if token is invalid or disabled.
 */
async function resolveToken(token) {
  return CalendarFeedToken.findOne({ token, isEnabled: true }).lean();
}

/**
 * Load the full CalendarFeed document from a tenant DB by token.
 */
async function getFullFeed(token, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const CalendarFeed = conn.model('CalendarFeed');
  return CalendarFeed.findOne({ token, isEnabled: true }).lean();
}

/**
 * Record an access (fire-and-forget, non-blocking).
 */
async function recordAccess(feedId, tenantSlug) {
  try {
    const conn = await getTenantConnection(tenantSlug);
    const CalendarFeed = conn.model('CalendarFeed');
    CalendarFeed.updateOne(
      { _id: feedId },
      { $inc: { accessCount: 1 }, $set: { lastAccessedAt: new Date() } },
    ).exec();
  } catch { /* silent */ }
}

module.exports = {
  generateFeed,
  revokeFeed,
  regenerateFeed,
  updateFeedSettings,
  listFeeds,
  resolveToken,
  getFullFeed,
  recordAccess,
};
