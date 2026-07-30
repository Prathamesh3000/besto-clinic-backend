'use strict';

const service = require('./inventory.service');
const ApiResponse = require('../../utils/ApiResponse');

exports.create = async (req, res) => {
  const result = await service.createItem(req.body, req.tenantSlug, req.user.userId);
  res.status(201).json(ApiResponse.created('Inventory item created', result));
};

exports.list = async (req, res) => {
  const result = await service.listItems(req.query, req.tenantSlug);
  const { items, total, page, limit } = result;
  res.json(ApiResponse.paginated('Inventory items retrieved', items, { total, page, limit }));
};

exports.getById = async (req, res) => {
  const result = await service.getItemById(req.params.id, req.tenantSlug);
  res.json(ApiResponse.success('Inventory item retrieved', result));
};

exports.update = async (req, res) => {
  const result = await service.updateItem(req.params.id, req.body, req.tenantSlug, req.user.userId);
  res.json(ApiResponse.success('Inventory item updated', result));
};

exports.delete = async (req, res) => {
  await service.deleteItem(req.params.id, req.tenantSlug);
  res.json(ApiResponse.deleted('Inventory item deleted'));
};

exports.restock = async (req, res) => {
  const result = await service.restockItem(req.params.id, req.body, req.tenantSlug, req.user.userId);
  res.json(ApiResponse.success('Item restocked successfully', result));
};

exports.lowStock = async (req, res) => {
  const result = await service.getLowStockItems(req.tenantSlug, req.query.branch);
  res.json(ApiResponse.success('Low stock items retrieved', result));
};

exports.expiring = async (req, res) => {
  const result = await service.getExpiringItems(req.tenantSlug, req.query);
  res.json(ApiResponse.success('Expiring items retrieved', result));
};

exports.reports = async (req, res) => {
  const result = await service.getReports(req.tenantSlug, req.query);
  res.json(ApiResponse.success('Inventory report generated', result));
};

exports.bulkCreate = async (req, res) => {
  const result = await service.bulkCreateItems(req.body.rows, req.tenantSlug, req.user.userId);
  res.status(201).json(ApiResponse.created('Bulk import completed', result));
};

