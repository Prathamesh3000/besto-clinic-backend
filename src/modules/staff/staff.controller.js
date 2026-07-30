'use strict';

const staffService = require('./staff.service');
const ApiResponse = require('../../utils/ApiResponse');

exports.list = async (req, res) => {
  const { items, total, page, limit } = await staffService.listStaff(req.query, req.tenantSlug);
  res.json(ApiResponse.paginated('Staff retrieved', items, { page, limit, total }));
};

exports.getById = async (req, res) => {
  const staff = await staffService.getStaffById(req.params.id, req.tenantSlug);
  res.json(ApiResponse.success('Staff member retrieved', staff));
};

exports.create = async (req, res) => {
  const staff = await staffService.createStaff(req.body, req.tenantSlug);
  res.status(201).json(ApiResponse.created('Staff member created', staff));
};

exports.update = async (req, res) => {
  const staff = await staffService.updateStaff(req.params.id, req.body, req.tenantSlug);
  res.json(ApiResponse.success('Staff member updated', staff));
};

exports.remove = async (req, res) => {
  await staffService.deactivateStaff(req.params.id, req.tenantSlug);
  res.json(ApiResponse.deleted('Staff member deactivated'));
};

exports.bulkCreate = async (req, res) => {
  const result = await staffService.bulkCreateStaff(req.body.rows, req.tenantSlug);
  res.status(201).json(ApiResponse.created('Bulk import completed', result));
};

exports.changeRole = async (req, res) => {
  const staff = await staffService.changeStaffRole(
    req.params.id,
    req.body.role,
    req.user.userId,
    req.tenantSlug,
  );
  res.json(ApiResponse.success('Staff role updated — user must re-login', staff));
};
