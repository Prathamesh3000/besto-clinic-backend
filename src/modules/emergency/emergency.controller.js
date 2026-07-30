'use strict';

const emergencyService = require('./emergency.service');
const ApiResponse = require('../../utils/ApiResponse');

exports.list = async (req, res) => {
  const { items, total, page, limit } = await emergencyService.listSessions(req.query, req.tenantSlug, req.user);
  res.json(ApiResponse.paginated('Emergency sessions retrieved', items, { page, limit, total }));
};

exports.getById = async (req, res) => {
  const session = await emergencyService.getSessionById(req.params.id, req.tenantSlug, req.user);
  res.json(ApiResponse.success('Emergency session retrieved', session));
};

exports.create = async (req, res) => {
  const session = await emergencyService.createSession(req.body, req.tenantSlug, req.user.userId);
  res.status(201).json(ApiResponse.created('Emergency session requested', session));
};

exports.accept = async (req, res) => {
  const session = await emergencyService.acceptSession(req.params.id, req.tenantSlug, req.user.userId);
  res.json(ApiResponse.success('Emergency session accepted', session));
};

exports.decline = async (req, res) => {
  const session = await emergencyService.declineSession(req.params.id, req.tenantSlug, req.user, req.body);
  res.json(ApiResponse.success('Emergency session dismissed from your queue', session));
};

exports.end = async (req, res) => {
  const session = await emergencyService.endSession(req.params.id, req.tenantSlug, req.body);
  res.json(ApiResponse.success('Emergency session ended', session));
};

exports.cancel = async (req, res) => {
  const session = await emergencyService.cancelSession(req.params.id, req.tenantSlug, req.user);
  res.json(ApiResponse.success('Emergency request cancelled', session));
};
