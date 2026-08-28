'use strict';

const patientService = require('./patient.service');
const ApiResponse = require('../../utils/ApiResponse');

exports.list = async (req, res) => {
  const { items, total, page, limit } = await patientService.listPatients(req.query, req.user, req.tenantSlug);
  res.json(ApiResponse.paginated('Patients retrieved', items, { page, limit, total }));
};

exports.stats = async (req, res) => {
  const stats = await patientService.getPatientStats(req.tenantSlug);
  res.json(ApiResponse.success('Patient stats retrieved', stats));
};

exports.getById = async (req, res) => {
  const patient = await patientService.getPatientById(req.params.id, req.user, req.tenantSlug);
  res.json(ApiResponse.success('Patient retrieved', patient));
};

exports.create = async (req, res) => {
  const patient = await patientService.createPatient(req.body, req.user, req.tenantSlug);
  res.status(201).json(ApiResponse.created('Patient created', patient));
};

exports.update = async (req, res) => {
  const patient = await patientService.updatePatient(req.params.id, req.body, req.user, req.tenantSlug);
  res.json(ApiResponse.success('Patient updated', patient));
};

exports.remove = async (req, res) => {
  await patientService.deletePatient(req.params.id, req.user, req.tenantSlug);
  res.json(ApiResponse.deleted('Patient deleted'));
};

exports.bulkCreate = async (req, res) => {
  const result = await patientService.bulkCreatePatients(req.body.rows, req.user, req.tenantSlug);
  res.status(201).json(ApiResponse.created('Bulk import completed', result));
};
