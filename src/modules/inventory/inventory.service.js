'use strict';

const ApiError = require('../../utils/ApiError');
const { parsePagination } = require('../../utils/pagination');
const { getTenantConnection } = require('../../db/tenantConnectionManager');

async function createItem(data, tenantSlug, userId) {
  const conn = await getTenantConnection(tenantSlug);
  const InventoryItem = conn.model('InventoryItem');
  const InventoryTransaction = conn.model('InventoryTransaction');

  // Check unique code per branch
  const existing = await InventoryItem.findOne({
    code: data.code.toUpperCase(),
    branch: data.branch,
  }).lean();
  if (existing) throw ApiError.conflict('An item with this code already exists in this branch');

  const item = await InventoryItem.create({ ...data, createdBy: userId });

  // If initial stock > 0, create a stock_in transaction
  if (item.currentStock > 0) {
    await InventoryTransaction.create({
      item: item._id,
      type: 'stock_in',
      quantity: item.currentStock,
      previousStock: 0,
      newStock: item.currentStock,
      reason: 'Initial stock',
      branch: item.branch,
      performedBy: userId,
    });
  }

  return item.toObject({ virtuals: true });
}

async function listItems(query, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const InventoryItem = conn.model('InventoryItem');
  const { skip, limit, page, sort } = parsePagination(query);

  const filter = { deletedAt: null };
  if (query.branch) filter.branch = query.branch;
  if (query.category) filter.category = query.category;
  if (query.search) {
    const escaped = query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.$or = [
      { name: { $regex: escaped, $options: 'i' } },
      { code: { $regex: escaped, $options: 'i' } },
    ];
  }
  if (query.lowStock) {
    filter.$expr = { $lte: ['$currentStock', '$minimumThreshold'] };
  }
  if (query.expiring) {
    const thirtyDays = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    filter.expiryDate = { $lte: thirtyDays, $gt: new Date() };
  }

  const [items, total] = await Promise.all([
    InventoryItem.find(filter)
      .populate('branch', 'name')
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .lean({ virtuals: true }),
    InventoryItem.countDocuments(filter),
  ]);

  return { items, total, page, limit };
}

async function getItemById(id, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const InventoryItem = conn.model('InventoryItem');
  const InventoryTransaction = conn.model('InventoryTransaction');

  const item = await InventoryItem.findById(id)
    .populate('branch', 'name')
    .populate('lastRestockedBy', 'name')
    .lean({ virtuals: true });
  if (!item) throw ApiError.notFound('Inventory item not found');

  // Get recent transactions
  const recentTransactions = await InventoryTransaction.find({ item: id })
    .populate('performedBy', 'name')
    .sort({ createdAt: -1 })
    .limit(10)
    .lean();

  return { ...item, recentTransactions };
}

async function updateItem(id, data, tenantSlug, userId) {
  const conn = await getTenantConnection(tenantSlug);
  const InventoryItem = conn.model('InventoryItem');

  // Prevent modifying stock directly
  delete data.currentStock;
  delete data.code;

  const item = await InventoryItem.findByIdAndUpdate(id, data, { new: true, runValidators: true })
    .lean({ virtuals: true });
  if (!item) throw ApiError.notFound('Inventory item not found');

  return item;
}

async function deleteItem(id, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const InventoryItem = conn.model('InventoryItem');

  const item = await InventoryItem.findByIdAndUpdate(id, { deletedAt: new Date() }, { new: true });
  if (!item) throw ApiError.notFound('Inventory item not found');

  return { deleted: true };
}

async function restockItem(id, { quantity, reason }, tenantSlug, userId) {
  const conn = await getTenantConnection(tenantSlug);
  const InventoryItem = conn.model('InventoryItem');
  const InventoryTransaction = conn.model('InventoryTransaction');

  const item = await InventoryItem.findOneAndUpdate(
    { _id: id, deletedAt: null },
    {
      $inc: { currentStock: quantity },
      lastRestockedAt: new Date(),
      lastRestockedBy: userId,
    },
    { new: false }, // return old doc for previousStock
  ).lean();
  if (!item) throw ApiError.notFound('Inventory item not found');

  await InventoryTransaction.create({
    item: id,
    type: 'stock_in',
    quantity,
    previousStock: item.currentStock,
    newStock: item.currentStock + quantity,
    reason: reason || 'Restock',
    branch: item.branch,
    performedBy: userId,
  });

  const updated = await InventoryItem.findById(id).lean({ virtuals: true });
  return updated;
}

async function getLowStockItems(tenantSlug, branch) {
  const conn = await getTenantConnection(tenantSlug);
  const InventoryItem = conn.model('InventoryItem');

  const filter = {
    isActive: true,
    deletedAt: null,
    $expr: { $lte: ['$currentStock', '$minimumThreshold'] },
  };
  if (branch) filter.branch = branch;

  const items = await InventoryItem.find(filter)
    .populate('branch', 'name')
    .lean({ virtuals: true });
  return items;
}

async function getExpiringItems(tenantSlug, { days = 30, branch } = {}) {
  const conn = await getTenantConnection(tenantSlug);
  const InventoryItem = conn.model('InventoryItem');

  const cutoff = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  const filter = {
    isActive: true,
    deletedAt: null,
    expiryDate: { $lte: cutoff, $gt: new Date() },
  };
  if (branch) filter.branch = branch;

  const items = await InventoryItem.find(filter)
    .populate('branch', 'name')
    .sort({ expiryDate: 1 })
    .lean({ virtuals: true });
  return items;
}

async function getReports(tenantSlug, { type = 'usage', from, to, branch } = {}) {
  const conn = await getTenantConnection(tenantSlug);
  const InventoryTransaction = conn.model('InventoryTransaction');

  const matchStage = {};
  if (branch) matchStage.branch = conn.base.Types.ObjectId.createFromHexString(branch);
  if (from || to) {
    matchStage.createdAt = {};
    if (from) matchStage.createdAt.$gte = new Date(from);
    if (to) matchStage.createdAt.$lte = new Date(to);
  }

  if (type === 'usage') {
    const result = await InventoryTransaction.aggregate([
      { $match: { ...matchStage, type: 'stock_out' } },
      {
        $group: {
          _id: {
            month: { $dateToString: { format: '%Y-%m', date: '$createdAt' } },
            type: '$type',
          },
          totalQuantity: { $sum: '$quantity' },
          count: { $sum: 1 },
        },
      },
      { $sort: { '_id.month': -1 } },
    ]);
    return { type: 'usage', data: result };
  }

  if (type === 'wastage') {
    const result = await InventoryTransaction.aggregate([
      { $match: { ...matchStage, type: { $in: ['expired', 'damaged'] } } },
      {
        $group: {
          _id: { item: '$item' },
          totalQuantity: { $sum: '$quantity' },
          count: { $sum: 1 },
        },
      },
      {
        $lookup: {
          from: 'inventoryitems',
          localField: '_id.item',
          foreignField: '_id',
          as: 'itemInfo',
        },
      },
      { $unwind: '$itemInfo' },
      { $sort: { totalQuantity: -1 } },
    ]);
    return { type: 'wastage', data: result };
  }

  return { type, data: [] };
}


async function bulkCreateItems(rows, tenantSlug, userId) {
  const conn = await getTenantConnection(tenantSlug);
  const Branch = conn.model('Branch');
  const results = { totalReceived: rows.length, successCount: 0, errorCount: 0, errors: [], created: [] };

  // Pre-resolve branchCodes to ObjectIDs
  const branchCodes = [...new Set(rows.map((r) => r.branchCode).filter(Boolean))];
  const branchMap = {};
  if (branchCodes.length > 0) {
    const branches = await Branch.find({ code: { $in: branchCodes }, deletedAt: null });
    for (const b of branches) branchMap[b.code] = b._id.toString();
  }

  for (let i = 0; i < rows.length; i++) {
    try {
      const row = { ...rows[i] };
      // Resolve branchCode → branch ObjectId
      if (row.branchCode && !row.branch) {
        const resolved = branchMap[row.branchCode.toUpperCase()] || branchMap[row.branchCode];
        if (!resolved) throw new Error(`Branch code "${row.branchCode}" not found`);
        row.branch = resolved;
      }
      delete row.branchCode;

      if (!row.branch) throw new Error('Branch or Branch Code is required');

      const item = await createItem(row, tenantSlug, userId);
      results.successCount++;
      results.created.push(item);
    } catch (err) {
      results.errorCount++;
      results.errors.push({ row: i + 1, message: err.message || 'Unknown error' });
    }
  }

  return results;
}

module.exports = {
  createItem,
  listItems,
  getItemById,
  updateItem,
  deleteItem,
  restockItem,
  getLowStockItems,
  getExpiringItems,
  getReports,
  bulkCreateItems,
};
