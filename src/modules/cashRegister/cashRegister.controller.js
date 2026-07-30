'use strict';

const cashRegisterService = require('./cashRegister.service');
const ApiResponse = require('../../utils/ApiResponse');

exports.open = async (req, res) => {
  const register = await cashRegisterService.openRegister(req.body, req.user, req.tenantSlug);
  res.status(201).json(ApiResponse.created('Cash register opened', register));
};

exports.close = async (req, res) => {
  const { closingBalance, notes } = req.body;
  const register = await cashRegisterService.closeRegister(req.params.id, closingBalance, notes, req.user, req.tenantSlug);
  res.json(ApiResponse.success('Cash register closed', register));
};

exports.reconcile = async (req, res) => {
  const register = await cashRegisterService.reconcileRegister(req.params.id, req.body, req.user, req.tenantSlug);
  res.json(ApiResponse.success('Cash register reconciled', register));
};

exports.getCurrent = async (req, res) => {
  const register = await cashRegisterService.getCurrentRegister(req.query.branch, req.tenantSlug);
  res.json(ApiResponse.success('Current register retrieved', register));
};

exports.list = async (req, res) => {
  const { items, total, page, limit } = await cashRegisterService.listRegisters(req.query, req.tenantSlug);
  res.json(ApiResponse.paginated('Cash registers retrieved', items, { page, limit, total }));
};

exports.getById = async (req, res) => {
  const { register, transactions } = await cashRegisterService.getRegisterWithTransactions(req.params.id, req.tenantSlug);
  res.json(ApiResponse.success('Cash register retrieved', { register, transactions }));
};

exports.getTransactions = async (req, res) => {
  const { register, transactions } = await cashRegisterService.getRegisterWithTransactions(req.params.id, req.tenantSlug);
  res.json(ApiResponse.success('Cash register transactions retrieved', { register, transactions }));
};
