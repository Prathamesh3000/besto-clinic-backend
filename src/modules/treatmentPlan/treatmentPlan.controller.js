'use strict';

const planService = require('./treatmentPlan.service');
const sittingService = require('./sitting.service');
const ApiResponse = require('../../utils/ApiResponse');

exports.list = async (req, res) => {
  const { items, meta } = await planService.listPlans(req.query, req.tenantSlug, req.user);
  res.json(ApiResponse.paginated('Treatment plans retrieved', items, meta));
};

exports.getById = async (req, res) => {
  const plan = await planService.getPlanById(req.params.id, req.tenantSlug, req.user);
  res.json(ApiResponse.success('Treatment plan retrieved', plan));
};

exports.create = async (req, res) => {
  const plan = await planService.createPlan(req.body, req.tenantSlug, req.user);
  res.status(201).json(ApiResponse.created('Treatment plan created', plan));
};

exports.update = async (req, res) => {
  const plan = await planService.updatePlan(req.params.id, req.body, req.tenantSlug, req.user);
  res.json(ApiResponse.success('Treatment plan updated', plan));
};

exports.changeStatus = async (req, res) => {
  const plan = await planService.changeStatus(req.params.id, req.body, req.tenantSlug, req.user);
  res.json(ApiResponse.success('Treatment plan status updated', plan));
};

exports.addAddendum = async (req, res) => {
  const plan = await planService.addAddendum(req.params.id, req.body, req.tenantSlug, req.user);
  res.status(201).json(ApiResponse.created('Addendum added', plan));
};

exports.remove = async (req, res) => {
  const result = await planService.deletePlan(req.params.id, req.tenantSlug);
  res.json(ApiResponse.success('Treatment plan deleted', result));
};

exports.patientTimeline = async (req, res) => {
  const timeline = await planService.getPatientTimeline(req.params.patientId, req.tenantSlug, req.user);
  res.json(ApiResponse.success('Treatment history retrieved', timeline));
};

// ── Sittings ────────────────────────────────────────

exports.addSitting = async (req, res) => {
  const sitting = await sittingService.addSitting(req.params.id, req.body, req.tenantSlug, req.user);
  res.status(201).json(ApiResponse.created('Sitting recorded', sitting));
};

exports.setSittingCompletion = async (req, res) => {
  const sitting = await sittingService.setSittingCompletion(
    req.params.sittingId, req.body, req.tenantSlug, req.user,
  );
  res.json(ApiResponse.success(
    req.body.completed ? 'Sitting marked as done' : 'Sitting reopened', sitting,
  ));
};

exports.lockSitting = async (req, res) => {
  const sitting = await sittingService.lockSitting(req.params.sittingId, req.tenantSlug, req.user);
  res.json(ApiResponse.success('Sitting locked', sitting));
};

exports.addSittingAddendum = async (req, res) => {
  const sitting = await sittingService.addSittingAddendum(
    req.params.sittingId, req.body, req.tenantSlug, req.user,
  );
  res.status(201).json(ApiResponse.created('Addendum added', sitting));
};

exports.recordComplaint = async (req, res) => {
  const sitting = await sittingService.recordComplaint(
    req.params.sittingId, req.body, req.tenantSlug, req.user,
  );
  res.status(201).json(ApiResponse.created('Complaint recorded', sitting));
};

exports.resolveComplaint = async (req, res) => {
  const sitting = await sittingService.resolveComplaint(
    req.params.sittingId, req.params.complaintId, req.body, req.tenantSlug, req.user,
  );
  res.json(ApiResponse.success('Complaint resolved', sitting));
};
