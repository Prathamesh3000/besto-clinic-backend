'use strict';

const service = require('./schedule.service');
const ApiResponse = require('../../utils/ApiResponse');
const { emitToTenant } = require('../../websocket');

// ── Admin-facing (for doctor management) ────────────────────────

exports.getSchedule = async (req, res) => {
  const schedules = await service.getSchedules(req.params.id, req.tenantSlug);
  res.json(ApiResponse.success('Doctor schedules retrieved', schedules));
};

exports.updateSchedule = async (req, res) => {
  const schedule = await service.upsertSchedule(req.params.id, req.body, req.tenantSlug);
  res.json(ApiResponse.success('Doctor schedule updated', schedule));
  try { emitToTenant(req.tenantSlug, 'availability:invalidated', { doctorId: req.params.id, reason: 'schedule_updated' }); } catch (_) {}
};

exports.getAllSchedules = async (req, res) => {
  const result = await service.getAllSchedules(req.query, req.tenantSlug);
  res.json(ApiResponse.paginated('All schedules retrieved', result.items, {
    page: result.page,
    limit: result.limit,
    total: result.total,
  }));
};

exports.getAllLeaves = async (req, res) => {
  const result = await service.getAllLeaves(req.query, req.tenantSlug);
  res.json(ApiResponse.paginated('All leaves retrieved', result.items, {
    page: result.page,
    limit: result.limit,
    total: result.total,
  }));
};

exports.listLeaves = async (req, res) => {
  const result = await service.listLeaves(req.params.id, req.tenantSlug, req.query);
  res.json(ApiResponse.paginated('Leaves retrieved', result.items, {
    page: result.page,
    limit: result.limit,
    total: result.total,
  }));
};

exports.createLeave = async (req, res) => {
  const leave = await service.createLeave(req.params.id, req.body, req.tenantSlug);
  res.status(201).json(ApiResponse.created('Leave created', leave));
  try { emitToTenant(req.tenantSlug, 'availability:invalidated', { doctorId: req.params.id, reason: 'leave_created' }); } catch (_) {}
};

exports.deleteLeave = async (req, res) => {
  await service.deleteLeave(req.params.id, req.params.leaveId, req.tenantSlug);
  res.json(ApiResponse.success('Leave deleted'));
  try { emitToTenant(req.tenantSlug, 'availability:invalidated', { doctorId: req.params.id, reason: 'leave_deleted' }); } catch (_) {}
};

// ── Doctor self-service ─────────────────────────────────────────

exports.getOwnSchedule = async (req, res) => {
  const schedules = await service.getSchedules(req.user.userId, req.tenantSlug);
  res.json(ApiResponse.success('Your schedules retrieved', schedules));
};

exports.getOwnLeaves = async (req, res) => {
  const result = await service.listLeaves(req.user.userId, req.tenantSlug, req.query);
  res.json(ApiResponse.paginated('Your leaves retrieved', result.items, {
    page: result.page,
    limit: result.limit,
    total: result.total,
  }));
};

exports.requestLeave = async (req, res) => {
  const leave = await service.createLeave(req.user.userId, { ...req.body, status: 'pending' }, req.tenantSlug);
  res.status(201).json(ApiResponse.created('Leave request submitted', leave));
  try { emitToTenant(req.tenantSlug, 'availability:invalidated', { doctorId: req.user.userId, reason: 'leave_requested' }); } catch (_) {}
};

exports.deleteOwnLeave = async (req, res) => {
  await service.deleteLeave(req.user.userId, req.params.leaveId, req.tenantSlug);
  res.json(ApiResponse.success('Leave cancelled'));
  try { emitToTenant(req.tenantSlug, 'availability:invalidated', { doctorId: req.user.userId, reason: 'leave_deleted' }); } catch (_) {}
};

// ── Leave approval ───────────────────────────────────────────────

exports.approveLeave = async (req, res) => {
  const result = await service.approveLeave(req.params.id, req.params.leaveId, req.tenantSlug);
  const { leave, conflicts = [] } = result;
  res.json(ApiResponse.success('Leave approved', { leave, conflicts, conflictCount: conflicts.length }));
  try { emitToTenant(req.tenantSlug, 'availability:invalidated', { doctorId: req.params.id, reason: 'leave_approved' }); } catch (_) {}
};

exports.rejectLeave = async (req, res) => {
  const leave = await service.rejectLeave(req.params.id, req.params.leaveId, req.tenantSlug);
  res.json(ApiResponse.success('Leave rejected', leave));
};

// ── Schedule Override CRUD ─────────────────────────────────

exports.listOverrides = async (req, res) => {
  const result = await service.listOverrides(req.params.id, req.tenantSlug, req.query);
  res.json(ApiResponse.paginated('Overrides retrieved', result.items, {
    page: result.page,
    limit: result.limit,
    total: result.total,
  }));
};

exports.createOverride = async (req, res) => {
  const result = await service.createOverride(req.params.id, req.body, req.tenantSlug);
  const { override, conflicts = [] } = result;
  res.status(201).json(ApiResponse.created('Override created', { override, conflicts, conflictCount: conflicts.length }));
  try { emitToTenant(req.tenantSlug, 'availability:invalidated', { doctorId: req.params.id, reason: 'override_created' }); } catch (_) {}
};

exports.updateOverride = async (req, res) => {
  const override = await service.updateOverride(req.params.id, req.params.overrideId, req.body, req.tenantSlug);
  res.json(ApiResponse.success('Override updated', override));
  try { emitToTenant(req.tenantSlug, 'availability:invalidated', { doctorId: req.params.id, reason: 'override_updated' }); } catch (_) {}
};

exports.deleteOverride = async (req, res) => {
  await service.deleteOverride(req.params.id, req.params.overrideId, req.tenantSlug);
  res.json(ApiResponse.success('Override deleted'));
  try { emitToTenant(req.tenantSlug, 'availability:invalidated', { doctorId: req.params.id, reason: 'override_deleted' }); } catch (_) {}
};

// ── Doctor self-service overrides ─────────────────────────

exports.getOwnOverrides = async (req, res) => {
  const result = await service.listOverrides(req.user.userId, req.tenantSlug, req.query);
  res.json(ApiResponse.paginated('Your overrides retrieved', result.items, {
    page: result.page, limit: result.limit, total: result.total,
  }));
};

exports.createOwnOverride = async (req, res) => {
  const result = await service.createOverride(req.user.userId, req.body, req.tenantSlug);
  const { override, conflicts = [] } = result;
  res.status(201).json(ApiResponse.created('Override created', { override, conflicts, conflictCount: conflicts.length }));
  try { emitToTenant(req.tenantSlug, 'availability:invalidated', { doctorId: req.user.userId, reason: 'override_created' }); } catch (_) {}
};

exports.deleteOwnOverride = async (req, res) => {
  await service.deleteOverride(req.user.userId, req.params.overrideId, req.tenantSlug);
  res.json(ApiResponse.success('Override deleted'));
  try { emitToTenant(req.tenantSlug, 'availability:invalidated', { doctorId: req.user.userId, reason: 'override_deleted' }); } catch (_) {}
};

// ── Doctor self-service availability summary ─────────────────
exports.getAvailabilitySummary = async (req, res) => {
  const { month, year, branch } = req.query;
  if (!month || !year) {
    return res.status(400).json(ApiResponse.error('month and year query parameters are required'));
  }
  const availabilityService = require('../../services/availability.service');
  const result = await availabilityService.getMonthlyAvailabilitySummary(
    req.user.userId,
    parseInt(month, 10),
    parseInt(year, 10),
    req.tenantSlug,
    branch || null,
  );
  res.json(ApiResponse.success('Availability summary fetched', result));
};
