'use strict';

const service = require('./patientRegistration.service');
const ApiResponse = require('../../utils/ApiResponse');

exports.create = async (req, res) => {
  const result = await service.createByStaff(req.body, req.user, req.tenantSlug);
  res.status(201).json(ApiResponse.success('Patient registered', result));
};

exports.list = async (req, res) => {
  const { items, total, page, limit } = await service.listRegistrations(req.query, req.tenantSlug);
  res.json(ApiResponse.paginated('Registrations retrieved', items, { page, limit, total }));
};

exports.getById = async (req, res) => {
  const registration = await service.getRegistrationById(req.params.id, req.tenantSlug);
  res.json(ApiResponse.success('Registration retrieved', registration));
};

exports.stats = async (req, res) => {
  const stats = await service.getStats(req.tenantSlug);
  res.json(ApiResponse.success('Registration stats retrieved', stats));
};
