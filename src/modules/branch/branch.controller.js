'use strict';

const branchService = require('./branch.service');
const ApiResponse = require('../../utils/ApiResponse');

exports.list = async (req, res) => {
  const { items, total, page, limit } = await branchService.listBranches(req.query, req.tenantSlug);
  res.json(ApiResponse.paginated('Branches retrieved', items, { page, limit, total }));
};

exports.getById = async (req, res) => {
  const branch = await branchService.getBranchById(req.params.id, req.tenantSlug);
  res.json(ApiResponse.success('Branch retrieved', branch));
};

exports.create = async (req, res) => {
  const branch = await branchService.createBranch(req.body, req.tenantSlug);
  res.status(201).json(ApiResponse.created('Branch created', branch));
};

exports.update = async (req, res) => {
  const branch = await branchService.updateBranch(req.params.id, req.body, req.tenantSlug);
  res.json(ApiResponse.success('Branch updated', branch));
};

exports.remove = async (req, res) => {
  await branchService.deleteBranch(req.params.id, req.tenantSlug);
  res.json(ApiResponse.deleted('Branch deleted'));
};

exports.bulkCreate = async (req, res) => {
  const result = await branchService.bulkCreateBranches(req.body.rows, req.tenantSlug);
  res.status(201).json(ApiResponse.created('Bulk import completed', result));
};

exports.getOverview = async (req, res) => {
  const { getBranchOverview } = require('./branchOverview.service');
  const data = await getBranchOverview(req.tenantSlug, req.query.date);
  res.json(ApiResponse.success('Branch overview retrieved', data));
};

// ── Branch Monitor endpoints ────────────────────
const monitorService = require('./branchMonitor.service');

exports.getDoctorPresence = async (req, res) => {
  const data = await monitorService.getDoctorPresence(req.tenantSlug, req.query.branch);
  res.json(ApiResponse.success('Doctor presence retrieved', data));
};

exports.getWaitingPatients = async (req, res) => {
  const data = await monitorService.getWaitingPatients(req.tenantSlug, req.query.branch);
  res.json(ApiResponse.success('Waiting patients retrieved', data));
};

exports.getBranchCapacity = async (req, res) => {
  const data = await monitorService.getBranchCapacity(req.tenantSlug);
  res.json(ApiResponse.success('Branch capacity retrieved', data));
};

exports.getActivityFeed = async (req, res) => {
  const data = await monitorService.getActivityFeed(
    req.tenantSlug,
    req.query.branch,
    parseInt(req.query.limit, 10) || 50,
  );
  res.json(ApiResponse.success('Activity feed retrieved', data));
};

exports.listRooms = async (req, res) => {
  const data = await monitorService.listRooms(req.tenantSlug, req.query.branch);
  res.json(ApiResponse.success('Rooms retrieved', data));
};

exports.createRoom = async (req, res) => {
  const data = await monitorService.createRoom(req.body, req.tenantSlug);
  res.status(201).json(ApiResponse.created('Room created', data));
};

exports.updateRoom = async (req, res) => {
  const data = await monitorService.updateRoom(req.params.id, req.body, req.tenantSlug);
  res.json(ApiResponse.success('Room updated', data));
};

exports.assignRoom = async (req, res) => {
  const data = await monitorService.assignRoom(req.params.id, req.body, req.tenantSlug);
  res.json(ApiResponse.success('Room assigned', data));
};

exports.releaseRoom = async (req, res) => {
  const data = await monitorService.releaseRoom(req.params.id, req.tenantSlug);
  res.json(ApiResponse.success('Room released', data));
};

exports.deleteRoom = async (req, res) => {
  await monitorService.deleteRoom(req.params.id, req.tenantSlug);
  res.json(ApiResponse.deleted('Room deleted'));
};
