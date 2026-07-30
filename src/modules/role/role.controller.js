'use strict';

const roleService = require('./role.service');
const ApiResponse = require('../../utils/ApiResponse');

exports.list = async (req, res) => {
  const { items, total, page, limit } = await roleService.listRoles(req.query, req.tenantSlug);
  res.json(ApiResponse.paginated('Roles retrieved', items, { page, limit, total }));
};

exports.getBySlug = async (req, res) => {
  const role = await roleService.getRoleBySlug(req.params.slug, req.tenantSlug);
  res.json(ApiResponse.success('Role retrieved', role));
};

exports.create = async (req, res) => {
  const role = await roleService.createRole(req.body, req.tenantSlug);
  res.status(201).json(ApiResponse.created('Role created', role));
};

exports.update = async (req, res) => {
  const role = await roleService.updateRole(req.params.slug, req.body, req.tenantSlug);
  res.json(ApiResponse.success('Role updated', role));
};

exports.remove = async (req, res) => {
  await roleService.deleteRole(req.params.slug, req.tenantSlug);
  res.json(ApiResponse.deleted('Role deleted'));
};
