'use strict';

const service = require('../../services/calendarFeed.service');
const ApiResponse = require('../../utils/ApiResponse');

// ── Doctor self-service ─────────────────────────────

exports.generateMyFeed = async (req, res) => {
  const feed = await service.generateFeed(
    'doctor',
    req.user.userId,
    req.tenantSlug,
    req.user.userId,
    req.body,
  );
  const feedUrl = _buildFeedUrl(req, feed.token);
  res.status(201).json(ApiResponse.created('Calendar feed generated', { ...feed.toJSON(), feedUrl }));
};

exports.listMyFeeds = async (req, res) => {
  const feeds = await service.listFeeds(req.user.userId, 'doctor', req.tenantSlug);
  const data = feeds.map((f) => ({ ...f, feedUrl: _buildFeedUrl(req, f.token) }));
  res.json(ApiResponse.success('Calendar feeds retrieved', data));
};

// ── Feed management ─────────────────────────────────

exports.updateFeed = async (req, res) => {
  const feed = await service.updateFeedSettings(req.params.feedId, req.body, req.tenantSlug);
  res.json(ApiResponse.success('Feed settings updated', { ...feed.toJSON(), feedUrl: _buildFeedUrl(req, feed.token) }));
};

exports.revokeFeed = async (req, res) => {
  await service.revokeFeed(req.params.feedId, req.tenantSlug);
  res.json(ApiResponse.deleted('Calendar feed revoked'));
};

exports.regenerateFeed = async (req, res) => {
  const feed = await service.regenerateFeed(req.params.feedId, req.tenantSlug);
  const feedUrl = _buildFeedUrl(req, feed.token);
  res.json(ApiResponse.success('Feed token regenerated', { ...feed.toJSON(), feedUrl }));
};

// ── Admin: manage feeds for a specific doctor ───────

exports.generateDoctorFeed = async (req, res) => {
  const feed = await service.generateFeed(
    'doctor',
    req.params.doctorId,
    req.tenantSlug,
    req.user.userId,
    req.body,
  );
  const feedUrl = _buildFeedUrl(req, feed.token);
  res.status(201).json(ApiResponse.created('Doctor calendar feed generated', { ...feed.toJSON(), feedUrl }));
};

exports.listDoctorFeeds = async (req, res) => {
  const feeds = await service.listFeeds(req.params.doctorId, 'doctor', req.tenantSlug);
  const data = feeds.map((f) => ({ ...f, feedUrl: _buildFeedUrl(req, f.token) }));
  res.json(ApiResponse.success('Doctor calendar feeds retrieved', data));
};

// ── Helpers ─────────────────────────────────────────

function _buildFeedUrl(req, token) {
  const baseUrl = process.env.API_PUBLIC_URL
    || `${req.protocol}://${req.get('host')}`;
  return `${baseUrl}/api/v1/public/cal/${token}.ics`;
}
