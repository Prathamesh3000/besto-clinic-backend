'use strict';

const videoService = require('./video.service');
const ApiResponse = require('../../utils/ApiResponse');

exports.list = async (req, res) => {
  const result = await videoService.listSessions(req.query, req.user, req.tenantSlug);
  res.json(ApiResponse.paginated('Video sessions retrieved', result.items, {
    page: result.page, limit: result.limit, total: result.total,
  }));
};

exports.getById = async (req, res) => {
  const session = await videoService.getSessionById(req.params.id, req.user, req.tenantSlug);
  res.json(ApiResponse.success('Video session retrieved', session));
};

exports.create = async (req, res) => {
  const session = await videoService.createSession(req.body, req.user, req.tenantSlug);
  res.status(201).json(ApiResponse.created('Video session created', session));
};

exports.accept = async (req, res) => {
  const session = await videoService.acceptSession(req.params.id, req.user, req.tenantSlug);
  res.json(ApiResponse.success('Video session accepted', session));
};

exports.join = async (req, res) => {
  const data = await videoService.joinSession(req.params.id, req.user, req.tenantSlug);
  res.json(ApiResponse.success('Joined video session', data));
};

exports.end = async (req, res) => {
  const session = await videoService.endSession(req.params.id, req.body, req.user, req.tenantSlug);
  res.json(ApiResponse.success('Video session ended', session));
};

exports.cancel = async (req, res) => {
  const session = await videoService.cancelSession(req.params.id, req.body, req.user, req.tenantSlug);
  res.json(ApiResponse.success('Video session cancelled', session));
};

exports.updateConsent = async (req, res) => {
  const session = await videoService.updateConsent(req.params.id, req.body, req.user, req.tenantSlug);
  res.json(ApiResponse.success('Recording consent updated', session));
};

exports.sendMessage = async (req, res) => {
  const message = await videoService.sendMessage(req.params.id, req.body, req.user, req.tenantSlug);
  res.status(201).json(ApiResponse.created('Message sent', message));
};

exports.getMessages = async (req, res) => {
  const result = await videoService.getMessages(req.params.id, req.query, req.user, req.tenantSlug);
  res.json(ApiResponse.paginated('Messages retrieved', result.items, {
    page: result.page, limit: result.limit, total: result.total,
  }));
};

exports.shareFile = async (req, res) => {
  const session = await videoService.shareFile(req.params.id, req.body, req.user, req.tenantSlug);
  res.json(ApiResponse.success('File shared', session));
};

exports.logEvent = async (req, res) => {
  const result = await videoService.logConnectionEvent(req.params.id, req.body, req.user, req.tenantSlug);
  res.json(ApiResponse.success('Event logged', result));
};

exports.decline = async (req, res) => {
  const session = await videoService.declineSession(req.params.id, req.user, req.tenantSlug, req.body || {});
  res.json(ApiResponse.success('Call declined', session));
};

exports.markMessageRead = async (req, res) => {
  const opts = { upTo: !!(req.body && req.body.upTo) };
  const result = await videoService.markMessageRead(req.params.id, req.params.msgId, req.user, req.tenantSlug, opts);
  res.json(ApiResponse.success('Message marked read', result));
};

exports.setPresence = async (req, res) => {
  const result = await videoService.setPresence(req.body.status, req.user, req.tenantSlug);
  res.json(ApiResponse.success('Presence updated', result));
};

exports.getPresenceSnapshot = async (req, res) => {
  const result = await videoService.getPresenceSnapshot(req.tenantSlug);
  res.json(ApiResponse.success('Presence snapshot retrieved', result));
};

exports.extend = async (req, res) => {
  const result = await videoService.extendSession(req.params.id, req.user, req.tenantSlug);
  res.json(ApiResponse.success('Session extended', result));
};
