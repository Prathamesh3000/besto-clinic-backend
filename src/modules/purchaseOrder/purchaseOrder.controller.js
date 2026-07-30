'use strict';

const service = require('./purchaseOrder.service');
const ApiResponse = require('../../utils/ApiResponse');

/* ── Vendor controllers ────────────────────────── */

exports.createVendor = async (req, res) => {
  const result = await service.createVendor(req.body, req.tenantSlug, req.user.userId);
  res.status(201).json(ApiResponse.created('Vendor created', result));
};

exports.listVendors = async (req, res) => {
  const result = await service.listVendors(req.query, req.tenantSlug);
  const { vendors, total, page, limit } = result;
  res.json(ApiResponse.paginated('Vendors retrieved', vendors, { total, page, limit }));
};

exports.getVendor = async (req, res) => {
  const result = await service.getVendorById(req.params.id, req.tenantSlug);
  res.json(ApiResponse.success('Vendor retrieved', result));
};

exports.updateVendor = async (req, res) => {
  const result = await service.updateVendor(req.params.id, req.body, req.tenantSlug);
  res.json(ApiResponse.success('Vendor updated', result));
};

exports.deleteVendor = async (req, res) => {
  await service.deleteVendor(req.params.id, req.tenantSlug);
  res.json(ApiResponse.deleted('Vendor deleted'));
};

/* ── Purchase Order controllers ────────────────── */

exports.createPO = async (req, res) => {
  const result = await service.createPurchaseOrder(req.body, req.tenantSlug, req.user.userId);
  res.status(201).json(ApiResponse.created('Purchase order created', result));
};

exports.listPOs = async (req, res) => {
  const result = await service.listPurchaseOrders(req.query, req.tenantSlug);
  const { orders, total, page, limit } = result;
  res.json(ApiResponse.paginated('Purchase orders retrieved', orders, { total, page, limit }));
};

exports.getPO = async (req, res) => {
  const result = await service.getPurchaseOrderById(req.params.id, req.tenantSlug);
  res.json(ApiResponse.success('Purchase order retrieved', result));
};

exports.updatePO = async (req, res) => {
  const result = await service.updatePurchaseOrder(req.params.id, req.body, req.tenantSlug, req.user.userId);
  res.json(ApiResponse.success('Purchase order updated', result));
};

exports.updatePOStatus = async (req, res) => {
  const result = await service.updatePOStatus(req.params.id, req.body, req.tenantSlug, req.user.userId);
  res.json(ApiResponse.success('Purchase order status updated', result));
};

exports.cancelPO = async (req, res) => {
  const result = await service.updatePOStatus(req.params.id, { status: 'cancelled', note: 'Cancelled by admin' }, req.tenantSlug, req.user.userId);
  res.json(ApiResponse.success('Purchase order cancelled', result));
};
