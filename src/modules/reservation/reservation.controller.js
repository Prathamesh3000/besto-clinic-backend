'use strict';

const service = require('./reservation.service');
const ApiResponse = require('../../utils/ApiResponse');

exports.create = async (req, res) => {
  const result = await service.createReservation(req.body, req.tenantSlug, req.user.userId);
  res.status(201).json(ApiResponse.created('Materials reserved', result));
};

exports.getByAppointment = async (req, res) => {
  const result = await service.getReservationByAppointment(req.params.appointmentId, req.tenantSlug);
  res.json(ApiResponse.success('Reservation retrieved', result));
};

exports.release = async (req, res) => {
  const result = await service.releaseReservation(req.params.id, req.tenantSlug, req.user.userId);
  res.json(ApiResponse.success('Reservation released', result));
};
