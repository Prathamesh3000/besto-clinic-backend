'use strict';

const ApiError = require('../../utils/ApiError');
const { parsePagination } = require('../../utils/pagination');
const { getTenantConnection } = require('../../db/tenantConnectionManager');
const { PURCHASE_ORDER_STATUS, PURCHASE_ORDER_TRANSITIONS } = require('../../config/constants');
const { notifyAndEmit } = require('../../utils/notifyAndEmit');
const { notifyAdmins } = require('../../utils/notifyAdmins');
const { notifyFrontDesk } = require('../../utils/notifyFrontDesk');
const { emitToTenant } = require('../../websocket');

/* ── Vendor CRUD ───────────────────────────────── */

async function createVendor(data, tenantSlug, userId) {
  const conn = await getTenantConnection(tenantSlug);
  const Vendor = conn.model('Vendor');
  const vendor = await Vendor.create({ ...data, createdBy: userId });
  return vendor.toObject({ virtuals: true });
}

async function listVendors(query, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const Vendor = conn.model('Vendor');
  const { skip, limit, page, sort } = parsePagination(query);

  const filter = { deletedAt: null };
  if (query.branch) filter.branch = query.branch;
  if (query.isActive !== undefined) filter.isActive = query.isActive;
  if (query.search) filter.$text = { $search: query.search };

  const [vendors, total] = await Promise.all([
    Vendor.find(filter)
      .populate('branch', 'name')
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .lean(),
    Vendor.countDocuments(filter),
  ]);

  return { vendors, total, page, limit };
}

async function getVendorById(id, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const Vendor = conn.model('Vendor');
  const vendor = await Vendor.findById(id).populate('branch', 'name').lean();
  if (!vendor) throw ApiError.notFound('Vendor not found');
  return vendor;
}

async function updateVendor(id, data, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const Vendor = conn.model('Vendor');
  const vendor = await Vendor.findByIdAndUpdate(id, data, { new: true, runValidators: true }).lean();
  if (!vendor) throw ApiError.notFound('Vendor not found');
  return vendor;
}

async function deleteVendor(id, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const Vendor = conn.model('Vendor');
  const vendor = await Vendor.findByIdAndUpdate(id, { deletedAt: new Date() }, { new: true });
  if (!vendor) throw ApiError.notFound('Vendor not found');
  return { deleted: true };
}

/* ── Purchase Order CRUD ───────────────────────── */

async function _generateOrderNumber(conn) {
  const now = new Date();
  const datePart = now.toISOString().slice(0, 10).replace(/-/g, '');
  const PurchaseOrder = conn.model('PurchaseOrder');

  // Find today's highest order number to get next sequence
  const todayPrefix = `PO-${datePart}-`;
  const latest = await PurchaseOrder.findOne(
    { orderNumber: { $regex: `^${todayPrefix}` } },
    { orderNumber: 1 },
    { sort: { orderNumber: -1 } },
  ).lean();

  let seq = 1;
  if (latest) {
    const lastSeq = parseInt(latest.orderNumber.split('-').pop(), 10);
    if (!isNaN(lastSeq)) seq = lastSeq + 1;
  }

  return `PO-${datePart}-${String(seq).padStart(4, '0')}`;
}

async function createPurchaseOrder(data, tenantSlug, userId) {
  const conn = await getTenantConnection(tenantSlug);
  const PurchaseOrder = conn.model('PurchaseOrder');
  const Vendor = conn.model('Vendor');
  const InventoryItem = conn.model('InventoryItem');

  // Validate vendor exists
  const vendor = await Vendor.findOne({ _id: data.vendorId, deletedAt: null }).lean();
  if (!vendor) throw ApiError.notFound('Vendor not found');

  // Validate inventory items exist and populate names
  const items = [];
  let totalAmount = 0;
  for (const item of data.items) {
    const invItem = await InventoryItem.findOne({
      _id: item.inventoryItemId,
      deletedAt: null,
    }).lean();
    if (!invItem) throw ApiError.notFound(`Inventory item ${item.inventoryItemId} not found`);

    const unitPrice = item.unitPrice || invItem.costPerUnit || 0;
    const lineTotal = unitPrice * item.quantity;
    totalAmount += lineTotal;

    items.push({
      inventoryItem: item.inventoryItemId,
      itemName: item.itemName || invItem.name,
      quantity: item.quantity,
      unitPrice,
      receivedQty: 0,
    });
  }

  // Generate order number
  const orderNumber = await _generateOrderNumber(conn);

  const po = await PurchaseOrder.create({
    orderNumber,
    vendor: data.vendorId,
    branch: data.branch,
    items,
    totalAmount,
    status: PURCHASE_ORDER_STATUS.REQUESTED,
    statusHistory: [{
      status: PURCHASE_ORDER_STATUS.REQUESTED,
      changedAt: new Date(),
      changedBy: userId,
      note: 'Purchase order created',
    }],
    expectedDelivery: data.expectedDelivery || null,
    urgency: data.urgency || 'normal',
    notes: data.notes || '',
    requestedBy: data.requestedBy || null,
    patient: data.patient || null,
    createdBy: userId,
  });

  // Resolve patient name for notifications
  let patientLabel = '';
  if (data.patient) {
    const Patient = conn.model('Patient');
    const pat = await Patient.findById(data.patient).select('name patientId').lean();
    if (pat) patientLabel = ` — for ${pat.name} (${pat.patientId})`;
  }

  // Notify requestedBy user (doctor) if present
  if (data.requestedBy) {
    notifyAndEmit({
      recipient: data.requestedBy,
      title: `Purchase Order ${orderNumber}`,
      message: `Your order from ${vendor.name} has been placed${data.urgency === 'urgent' ? ' [URGENT]' : ''}.`,
      type: 'purchase_order',
      metadata: { purchaseOrderId: po._id, orderNumber, status: 'requested' },
    }, tenantSlug).catch(() => {});
  }

  // Notify admins
  notifyAdmins(tenantSlug, {
    title: 'New Purchase Order',
    message: `PO ${orderNumber} created for ${vendor.name}${patientLabel}${data.urgency === 'urgent' ? ' — URGENT' : ''}`,
    type: 'purchase_order',
    metadata: { purchaseOrderId: po._id, orderNumber, status: 'requested', urgency: data.urgency },
  }).catch(() => {});

  // Socket event
  emitToTenant(tenantSlug, 'purchaseOrder:created', {
    poId: po._id,
    orderNumber,
    vendor: vendor.name,
    urgency: data.urgency || 'normal',
  });

  // Populate and return
  const result = await PurchaseOrder.findById(po._id)
    .populate('vendor', 'name email phone company')
    .populate('branch', 'name')
    .populate('patient', 'name patientId')
    .populate('requestedBy', 'name')
    .populate('createdBy', 'name')
    .lean();

  return result;
}

async function updatePurchaseOrder(poId, data, tenantSlug, userId) {
  const conn = await getTenantConnection(tenantSlug);
  const PurchaseOrder = conn.model('PurchaseOrder');

  const po = await PurchaseOrder.findOne({ _id: poId, deletedAt: null });
  if (!po) throw ApiError.notFound('Purchase order not found');

  if (po.status !== PURCHASE_ORDER_STATUS.REQUESTED) {
    throw ApiError.badRequest('Purchase order can only be edited while in "requested" status');
  }

  // Update vendor if provided
  if (data.vendorId) {
    const Vendor = conn.model('Vendor');
    const vendor = await Vendor.findOne({ _id: data.vendorId, deletedAt: null }).lean();
    if (!vendor) throw ApiError.notFound('Vendor not found');
    po.vendor = data.vendorId;
  }

  // Update items if provided — revalidate and recalculate total
  if (data.items) {
    const InventoryItem = conn.model('InventoryItem');
    const items = [];
    let totalAmount = 0;
    for (const item of data.items) {
      const invItem = await InventoryItem.findOne({
        _id: item.inventoryItemId,
        deletedAt: null,
      }).lean();
      if (!invItem) throw ApiError.notFound(`Inventory item ${item.inventoryItemId} not found`);

      const unitPrice = item.unitPrice || invItem.costPerUnit || 0;
      totalAmount += unitPrice * item.quantity;

      items.push({
        inventoryItem: item.inventoryItemId,
        itemName: item.itemName || invItem.name,
        quantity: item.quantity,
        unitPrice,
        receivedQty: 0,
      });
    }
    po.items = items;
    po.totalAmount = totalAmount;
  }

  // Update simple fields
  if (data.branch) po.branch = data.branch;
  if (data.expectedDelivery !== undefined) po.expectedDelivery = data.expectedDelivery;
  if (data.urgency) po.urgency = data.urgency;
  if (data.notes !== undefined) po.notes = data.notes;
  if (data.requestedBy !== undefined) po.requestedBy = data.requestedBy || null;
  if (data.patient !== undefined) po.patient = data.patient || null;

  await po.save();

  return PurchaseOrder.findById(po._id)
    .populate('vendor', 'name email phone company')
    .populate('branch', 'name')
    .populate('patient', 'name patientId')
    .populate('requestedBy', 'name')
    .populate('createdBy', 'name')
    .lean();
}

async function listPurchaseOrders(query, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const PurchaseOrder = conn.model('PurchaseOrder');
  const { skip, limit, page, sort } = parsePagination(query);

  const filter = { deletedAt: null };
  if (query.branch) filter.branch = query.branch;
  if (query.vendor) filter.vendor = query.vendor;
  if (query.status) filter.status = query.status;
  if (query.urgency) filter.urgency = query.urgency;
  if (query.patient) filter.patient = query.patient;
  if (query.search) filter.orderNumber = { $regex: query.search, $options: 'i' };

  const [orders, total] = await Promise.all([
    PurchaseOrder.find(filter)
      .populate('vendor', 'name email phone company')
      .populate('branch', 'name')
      .populate('patient', 'name patientId')
      .populate('requestedBy', 'name')
      .populate('createdBy', 'name')
      .sort(sort || { createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    PurchaseOrder.countDocuments(filter),
  ]);

  return { orders, total, page, limit };
}

async function getPurchaseOrderById(id, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const PurchaseOrder = conn.model('PurchaseOrder');

  const po = await PurchaseOrder.findById(id)
    .populate('vendor', 'name email phone company address city gstNumber')
    .populate('branch', 'name')
    .populate('patient', 'name patientId')
    .populate('requestedBy', 'name')
    .populate('createdBy', 'name')
    .populate('items.inventoryItem', 'name code unit')
    .lean();
  if (!po) throw ApiError.notFound('Purchase order not found');
  return po;
}

async function updatePOStatus(poId, { status, note, items }, tenantSlug, userId) {
  const conn = await getTenantConnection(tenantSlug);
  const PurchaseOrder = conn.model('PurchaseOrder');

  const po = await PurchaseOrder.findOne({ _id: poId, deletedAt: null });
  if (!po) throw ApiError.notFound('Purchase order not found');

  // Validate transition
  const allowed = PURCHASE_ORDER_TRANSITIONS[po.status] || [];
  if (!allowed.includes(status)) {
    throw ApiError.badRequest(`Cannot transition from "${po.status}" to "${status}"`);
  }

  const oldStatus = po.status;
  po.status = status;
  po.statusHistory.push({
    status,
    changedAt: new Date(),
    changedBy: userId,
    note: note || '',
  });

  if (status === PURCHASE_ORDER_STATUS.DELIVERED) {
    po.actualDelivery = new Date();

    // Apply received quantities if provided
    if (items && items.length > 0) {
      for (const received of items) {
        const poItem = po.items.find(
          i => String(i.inventoryItem) === String(received.inventoryItemId),
        );
        if (poItem) poItem.receivedQty = received.receivedQty;
      }
    }

    // Auto-restock inventory items (uses receivedQty if set, else ordered quantity)
    await _autoRestock(conn, po, userId);
  }

  await po.save();

  // Populate vendor for notifications
  const vendor = await conn.model('Vendor').findById(po.vendor).select('name email').lean();
  const vendorName = vendor?.name || 'Unknown vendor';

  // Resolve patient label for delivery notifications
  let patientLabel = '';
  if (po.patient) {
    const Patient = conn.model('Patient');
    const pat = await Patient.findById(po.patient).select('name patientId').lean();
    if (pat) patientLabel = ` — for ${pat.name} (${pat.patientId})`;
  }

  // Notify requestedBy user (doctor)
  if (po.requestedBy) {
    const isDelivery = status === PURCHASE_ORDER_STATUS.DELIVERED;
    notifyAndEmit({
      recipient: po.requestedBy,
      title: isDelivery ? `Order Delivered — ${po.orderNumber}` : `Order Update — ${po.orderNumber}`,
      message: isDelivery
        ? `Your order from ${vendorName} has been delivered${patientLabel}. Schedule the procedure.`
        : `Your order from ${vendorName} is now ${status}.`,
      type: 'purchase_order',
      metadata: { purchaseOrderId: po._id, orderNumber: po.orderNumber, status },
    }, tenantSlug).catch(() => {});
  }

  // Notify admins
  notifyAdmins(tenantSlug, {
    title: 'Purchase Order Update',
    message: `${po.orderNumber} from ${vendorName} — ${oldStatus} → ${status}${patientLabel}`,
    type: 'purchase_order',
    metadata: { purchaseOrderId: po._id, orderNumber: po.orderNumber, status },
  }).catch(() => {});

  // Notify front desk when order arrives (they physically receive packages)
  if (status === PURCHASE_ORDER_STATUS.DELIVERED) {
    notifyFrontDesk(tenantSlug, {
      title: `Order Delivered — ${po.orderNumber}`,
      message: `PO from ${vendorName} has arrived${patientLabel}. Receive and verify the package.`,
      type: 'purchase_order',
      metadata: { purchaseOrderId: po._id, orderNumber: po.orderNumber, status: 'delivered' },
    }).catch(() => {});
  }

  // Socket event
  emitToTenant(tenantSlug, 'purchaseOrder:updated', {
    poId: po._id,
    orderNumber: po.orderNumber,
    status,
    oldStatus,
  });

  return PurchaseOrder.findById(po._id)
    .populate('vendor', 'name email phone company')
    .populate('branch', 'name')
    .populate('patient', 'name patientId')
    .populate('requestedBy', 'name')
    .populate('createdBy', 'name')
    .lean();
}

/* ── Auto-restock on delivery ──────────────────── */

async function _autoRestock(conn, po, changedBy) {
  const InventoryItem = conn.model('InventoryItem');
  const InventoryTransaction = conn.model('InventoryTransaction');

  // Resolve patient name for transaction reason
  let patientName = '';
  if (po.patient) {
    const Patient = conn.model('Patient');
    const pat = await Patient.findById(po.patient).select('name patientId').lean();
    if (pat) patientName = ` for ${pat.name} (${pat.patientId})`;
  }

  for (const item of po.items) {
    const qty = item.receivedQty > 0 ? item.receivedQty : item.quantity;
    const invItem = await InventoryItem.findOneAndUpdate(
      { _id: item.inventoryItem, deletedAt: null },
      {
        $inc: { currentStock: qty },
        lastRestockedAt: new Date(),
        lastRestockedBy: changedBy,
      },
      { new: false },
    ).lean();

    if (invItem) {
      await InventoryTransaction.create({
        item: item.inventoryItem,
        type: 'stock_in',
        quantity: qty,
        previousStock: invItem.currentStock,
        newStock: invItem.currentStock + qty,
        reason: `Auto-restock from PO ${po.orderNumber}${patientName}`,
        reference: po._id,
        referenceModel: 'PurchaseOrder',
        patient: po.patient || undefined,
        branch: po.branch,
        performedBy: changedBy,
      });
    }
  }
}

module.exports = {
  createVendor,
  listVendors,
  getVendorById,
  updateVendor,
  deleteVendor,
  createPurchaseOrder,
  updatePurchaseOrder,
  listPurchaseOrders,
  getPurchaseOrderById,
  updatePOStatus,
};
