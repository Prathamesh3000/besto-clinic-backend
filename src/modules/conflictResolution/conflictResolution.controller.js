'use strict';

const service = require('./conflictResolution.service');
const ApiResponse = require('../../utils/ApiResponse');

// ── Conflict detection ──────────────────────────────────────

exports.detectConflicts = async (req, res) => {
  const { doctorId, date, overrideType, overrideSlots, overrideId } = req.body;
  const conflicts = await service.detectConflicts(
    req.tenantSlug, doctorId, date, overrideType, overrideSlots, overrideId,
  );
  res.json(ApiResponse.success('Conflicts detected', { conflicts, count: conflicts.length }));
};

exports.detectLeaveConflicts = async (req, res) => {
  const { doctorId, startDate, endDate, leaveId } = req.body;
  const conflicts = await service.detectLeaveConflicts(
    req.tenantSlug, doctorId, startDate, endDate, leaveId,
  );
  res.json(ApiResponse.success('Leave conflicts detected', { conflicts, count: conflicts.length }));
};

// ── Available slots ─────────────────────────────────────────

exports.getNextAvailableSlots = async (req, res) => {
  const { doctorId, branchId, afterDate, limit } = req.query;
  const slots = await service.getNextAvailableSlots(
    req.tenantSlug, doctorId, branchId, afterDate, parseInt(limit, 10) || 5,
  );
  res.json(ApiResponse.success('Available slots retrieved', slots));
};

// ── Resolution actions ──────────────────────────────────────

exports.rescheduleAppointment = async (req, res) => {
  const { newScheduledAt, reason } = req.body;
  const result = await service.rescheduleAppointment(
    req.tenantSlug, req.params.id, newScheduledAt, req.user.userId, reason,
  );
  res.json(ApiResponse.success('Appointment rescheduled', result));
};

exports.cancelWithRefund = async (req, res) => {
  const { reason } = req.body;
  const result = await service.cancelWithRefund(
    req.tenantSlug, req.params.id, req.user.userId, reason,
  );
  res.json(ApiResponse.success('Appointment cancelled and refund initiated', result));
};

exports.cancelWithCredit = async (req, res) => {
  const { reason } = req.body;
  const result = await service.cancelWithCredit(
    req.tenantSlug, req.params.id, req.user.userId, reason,
  );
  res.json(ApiResponse.success('Appointment cancelled and wallet credited', result));
};

exports.cancelUnpaid = async (req, res) => {
  const { reason } = req.body;
  const result = await service.cancelUnpaid(
    req.tenantSlug, req.params.id, req.user.userId, reason,
  );
  res.json(ApiResponse.success('Appointment cancelled', result));
};

exports.markContacted = async (req, res) => {
  const { notes } = req.body;
  const result = await service.markContacted(
    req.tenantSlug, req.params.id, req.user.userId, notes,
  );
  res.json(ApiResponse.success('Appointment marked as contacted', result));
};

exports.bulkCancelRefund = async (req, res) => {
  const { appointmentIds, reason } = req.body;
  const result = await service.bulkCancelRefund(
    req.tenantSlug, appointmentIds, req.user.userId, reason,
  );
  res.json(ApiResponse.success('Bulk cancel processed', result));
};
