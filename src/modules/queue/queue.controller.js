'use strict';

const queueService = require('./queue.service');
const ApiResponse = require('../../utils/ApiResponse');

exports.list = async (req, res) => {
  const { items, total, page, limit } = await queueService.listQueueEntries(req.query, req.tenantSlug);
  res.json(ApiResponse.paginated('Queue entries retrieved', items, { page, limit, total }));
};

exports.getCurrent = async (req, res) => {
  const items = await queueService.getCurrentQueue(req.query, req.tenantSlug);
  res.json(ApiResponse.success('Current queue retrieved', items));
};

exports.getById = async (req, res) => {
  const entry = await queueService.getQueueEntryById(req.params.id, req.tenantSlug);
  res.json(ApiResponse.success('Queue entry retrieved', entry));
};

exports.add = async (req, res) => {
  const entry = await queueService.addToQueue(req.body, req.tenantSlug, req.user.userId);
  res.status(201).json(ApiResponse.created('Patient added to queue', entry));
};

exports.call = async (req, res) => {
  const entry = await queueService.callPatient(req.params.id, req.tenantSlug, req.body?.roomId);
  res.json(ApiResponse.success('Patient called for consultation', entry));
};

exports.complete = async (req, res) => {
  const entry = await queueService.completeConsultation(req.params.id, req.tenantSlug);
  res.json(ApiResponse.success('Consultation completed', entry));
};

exports.cancel = async (req, res) => {
  const entry = await queueService.cancelEntry(req.params.id, req.body, req.tenantSlug);
  res.json(ApiResponse.success('Queue entry cancelled', entry));
};

exports.changePriority = async (req, res) => {
  const entry = await queueService.changePriority(req.params.id, req.body.priority, req.tenantSlug);
  res.json(ApiResponse.success('Priority updated', entry));
};

exports.swap = async (req, res) => {
  const result = await queueService.swapPositions(req.body.entryA, req.body.entryB, req.tenantSlug);
  res.json(ApiResponse.success('Positions swapped', result));
};

exports.move = async (req, res) => {
  const result = await queueService.movePosition(req.params.id, req.body.direction, req.tenantSlug);
  res.json(ApiResponse.success('Position updated', result));
};
