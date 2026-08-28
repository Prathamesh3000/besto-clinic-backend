'use strict';

const holidayService = require('./holiday.service');
const ApiResponse = require('../../utils/ApiResponse');

exports.list = async (req, res) => {
  const { items, total, page, limit } = await holidayService.listHolidays(
    req.query,
    req.tenantSlug
  );
  res.json(ApiResponse.paginated('Holidays retrieved', items, { page, limit, total }));
};

exports.getById = async (req, res) => {
  const holiday = await holidayService.getHolidayById(
    req.params.id,
    req.tenantSlug
  );
  res.json(ApiResponse.success('Holiday retrieved', holiday));
};

exports.create = async (req, res) => {
  const holiday = await holidayService.createHoliday(
    req.body,
    req.user.userId,
    req.tenantSlug
  );
  res.status(201).json(ApiResponse.created('Holiday created', holiday));
};

exports.update = async (req, res) => {
  const holiday = await holidayService.updateHoliday(
    req.params.id,
    req.body,
    req.tenantSlug
  );
  res.json(ApiResponse.success('Holiday updated', holiday));
};

exports.remove = async (req, res) => {
  await holidayService.deleteHoliday(req.params.id, req.tenantSlug);
  res.json(ApiResponse.deleted('Holiday deleted'));
};
