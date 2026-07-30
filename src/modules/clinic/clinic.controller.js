'use strict';

const clinicService = require('./clinic.service');
const ApiResponse = require('../../utils/ApiResponse');

exports.get = async (req, res) => {
  const clinic = await clinicService.getClinicSettings(req.tenantSlug);
  res.json(ApiResponse.success('Clinic settings retrieved', clinic));
};

exports.update = async (req, res) => {
  const clinic = await clinicService.updateClinicSettings(req.tenantSlug, req.body);
  res.json(ApiResponse.success('Clinic settings updated', clinic));
};

exports.uploadLogo = async (req, res) => {
  const { imageData, mimeType } = req.body;
  const clinic = await clinicService.uploadClinicLogo(req.tenantSlug, imageData, mimeType);
  res.json(ApiResponse.success('Logo uploaded', { logo: clinic.logo }));
};
