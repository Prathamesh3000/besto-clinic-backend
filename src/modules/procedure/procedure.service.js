'use strict';

const ApiError = require('../../utils/ApiError');
const { parsePagination } = require('../../utils/pagination');
const { getTenantConnection } = require('../../db/tenantConnectionManager');

async function createTemplate(data, tenantSlug, userId) {
  const conn = await getTenantConnection(tenantSlug);
  const ProcedureTemplate = conn.model('ProcedureTemplate');

  const existing = await ProcedureTemplate.findOne({ code: data.code.toUpperCase() }).lean();
  if (existing) throw ApiError.conflict('A procedure with this code already exists');

  const template = await ProcedureTemplate.create({ ...data, createdBy: userId });
  return template.toObject();
}

async function listTemplates(query, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const ProcedureTemplate = conn.model('ProcedureTemplate');
  const { skip, limit, page, sort } = parsePagination(query);

  const filter = { deletedAt: null };
  if (query.category) filter.category = query.category;
  if (query.isActive !== undefined) filter.isActive = query.isActive;
  if (query.search) {
    const escaped = query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.$or = [
      { name: { $regex: escaped, $options: 'i' } },
      { code: { $regex: escaped, $options: 'i' } },
    ];
  }

  const [items, total] = await Promise.all([
    ProcedureTemplate.find(filter)
      .populate('department', 'name')
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .lean(),
    ProcedureTemplate.countDocuments(filter),
  ]);

  return { items, total, page, limit };
}

async function updateTemplate(id, data, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const ProcedureTemplate = conn.model('ProcedureTemplate');

  // Prevent changing code
  delete data.code;

  const template = await ProcedureTemplate.findByIdAndUpdate(id, data, {
    new: true,
    runValidators: true,
  }).lean();
  if (!template) throw ApiError.notFound('Procedure template not found');

  return template;
}

async function checkAvailability(id, branch, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const ProcedureTemplate = conn.model('ProcedureTemplate');
  const InventoryItem = conn.model('InventoryItem');

  const template = await ProcedureTemplate.findById(id).lean();
  if (!template) throw ApiError.notFound('Procedure template not found');

  const items = [];
  const missingItems = [];
  let ready = true;

  for (const material of template.requiredMaterials) {
    const inventoryItem = await InventoryItem.findOne({
      _id: material.item,
      branch,
      deletedAt: null,
    }).lean({ virtuals: true });

    const available = inventoryItem
      ? (inventoryItem.currentStock - inventoryItem.reservedStock)
      : 0;
    const sufficient = available >= material.quantity;

    if (!sufficient && !material.isOptional) {
      ready = false;
      missingItems.push({
        item: material.item,
        itemName: material.itemName || (inventoryItem && inventoryItem.name) || 'Unknown',
        required: material.quantity,
        available,
      });
    }

    items.push({
      item: material.item,
      itemName: material.itemName || (inventoryItem && inventoryItem.name) || 'Unknown',
      required: material.quantity,
      available,
      sufficient,
      isOptional: material.isOptional,
    });
  }

  return {
    procedure: { _id: template._id, name: template.name, code: template.code },
    ready,
    items,
    missingItems,
  };
}

module.exports = {
  createTemplate,
  listTemplates,
  updateTemplate,
  checkAvailability,
};
