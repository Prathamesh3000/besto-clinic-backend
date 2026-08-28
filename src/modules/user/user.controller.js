'use strict';

const userService = require('./user.service');
const ApiResponse = require('../../utils/ApiResponse');

exports.list = async (req, res) => {
  const { items, total, page, limit } = await userService.listUsers(req.query, req.tenantSlug);
  res.json(ApiResponse.paginated('Users retrieved', items, { page, limit, total }));
};

exports.getById = async (req, res) => {
  const user = await userService.getUserById(req.params.id, req.tenantSlug);
  res.json(ApiResponse.success('User retrieved', user));
};

exports.create = async (req, res) => {
  const user = await userService.createUser(req.body, req.tenantSlug, req.user);
  res.status(201).json(ApiResponse.created('User created', user));
};

exports.update = async (req, res) => {
  const user = await userService.updateUser(req.params.id, req.body, req.tenantSlug, req.user);
  res.json(ApiResponse.success('User updated', user));
};

exports.remove = async (req, res) => {
  await userService.deactivateUser(req.params.id, req.tenantSlug, req.user?.userId);
  res.json(ApiResponse.deleted('User deactivated'));
};
