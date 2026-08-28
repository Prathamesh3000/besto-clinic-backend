'use strict';

const dashboardService = require('./dashboard.service');
const ApiResponse = require('../../utils/ApiResponse');

exports.getStats = async (req, res) => {
  const stats = await dashboardService.getClinicDashboard(req.tenantSlug);
  res.json(ApiResponse.success('Dashboard stats retrieved', stats));
};
