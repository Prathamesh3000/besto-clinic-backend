'use strict';

const departmentService = require('./department.service');
const ApiResponse = require('../../utils/ApiResponse');

exports.list = async (req, res) => {
  const { items, total, page, limit } = await departmentService.listDepartments(req.query, req.tenantSlug);
  res.json(ApiResponse.paginated('Departments retrieved', items, { page, limit, total }));
};

exports.getById = async (req, res) => {
  const department = await departmentService.getDepartmentById(req.params.id, req.tenantSlug);
  res.json(ApiResponse.success('Department retrieved', department));
};

exports.create = async (req, res) => {
  const department = await departmentService.createDepartment(req.body, req.tenantSlug);
  res.status(201).json(ApiResponse.created('Department created', department));
};

exports.update = async (req, res) => {
  const department = await departmentService.updateDepartment(req.params.id, req.body, req.tenantSlug);
  res.json(ApiResponse.success('Department updated', department));
};

exports.remove = async (req, res) => {
  await departmentService.deleteDepartment(req.params.id, req.tenantSlug);
  res.json(ApiResponse.deleted('Department deleted'));
};

exports.bulkCreate = async (req, res) => {
  const result = await departmentService.bulkCreateDepartments(req.body.rows, req.tenantSlug);
  res.status(201).json(ApiResponse.created('Bulk import completed', result));
};
