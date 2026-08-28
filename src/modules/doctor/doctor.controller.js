'use strict';

const doctorService = require('./doctor.service');
const featuredDoctorService = require('../featuredDoctor/featuredDoctor.service');
const ApiResponse = require('../../utils/ApiResponse');

exports.list = async (req, res) => {
  const { items, total, page, limit } = await doctorService.listDoctors(req.query, req.tenantSlug);
  res.json(ApiResponse.paginated('Doctors retrieved', items, { page, limit, total }));
};

exports.getById = async (req, res) => {
  const doctor = await doctorService.getDoctorById(req.params.id, req.tenantSlug);
  res.json(ApiResponse.success('Doctor retrieved', doctor));
};

exports.create = async (req, res) => {
  const doctor = await doctorService.createDoctor(req.body, req.tenantSlug);
  res.status(201).json(ApiResponse.created('Doctor created', doctor));
};

exports.bulkCreate = async (req, res) => {
  const result = await doctorService.bulkCreateDoctors(req.body.rows, req.tenantSlug);
  res.status(201).json(ApiResponse.created('Bulk import completed', result));
};

exports.update = async (req, res) => {
  const doctor = await doctorService.updateDoctor(req.params.id, req.body, req.tenantSlug);
  res.json(ApiResponse.success('Doctor updated', doctor));
};

exports.remove = async (req, res) => {
  await doctorService.deactivateDoctor(req.params.id, req.tenantSlug);
  res.json(ApiResponse.deleted('Doctor deactivated'));
};

exports.toggleFeature = async (req, res) => {
  const { featured } = req.body;
  const doctor = await featuredDoctorService.toggleFeature(
    req.params.id, !!featured, req.tenantSlug,
  );
  res.json(ApiResponse.success(
    featured ? 'Doctor featured on platform' : 'Doctor removed from platform directory',
    doctor,
  ));
};
