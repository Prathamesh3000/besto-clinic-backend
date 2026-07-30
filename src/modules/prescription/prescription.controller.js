'use strict';

const prescriptionService = require('./prescription.service');
const ApiResponse = require('../../utils/ApiResponse');

exports.list = async (req, res) => {
  const { items, total, page, limit } = await prescriptionService.listPrescriptions(req.query, req.tenantSlug, req.user);
  res.json(ApiResponse.paginated('Prescriptions retrieved', items, { page, limit, total }));
};

exports.getById = async (req, res) => {
  const prescription = await prescriptionService.getPrescriptionById(req.params.id, req.tenantSlug, req.user);
  res.json(ApiResponse.success('Prescription retrieved', prescription));
};

exports.create = async (req, res) => {
  const prescription = await prescriptionService.createPrescription(req.body, req.tenantSlug, req.user.userId);
  res.status(201).json(ApiResponse.created('Prescription created', prescription));
};

exports.update = async (req, res) => {
  const prescription = await prescriptionService.updatePrescription(req.params.id, req.body, req.tenantSlug, req.user);
  res.json(ApiResponse.success('Prescription updated', prescription));
};

exports.cancel = async (req, res) => {
  const prescription = await prescriptionService.cancelPrescription(req.params.id, req.tenantSlug);
  res.json(ApiResponse.success('Prescription cancelled', prescription));
};
