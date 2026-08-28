'use strict';

const ApiError = require('../../utils/ApiError');
const { parsePagination } = require('../../utils/pagination');
const { INVOICE_STATUS, PAYMENT_STATUS } = require('../../config/constants');
const logger = require('../../utils/logger');
const { getTenantConnection } = require('../../db/tenantConnectionManager');
const { ROLE_PERMISSIONS, PERMISSIONS } = require('../../config/permissions');

/** Check if user has full (non-OWN) permission */
function _hasFullAccess(user, permission) {
  const perms = ROLE_PERMISSIONS[user.role] || [];
  return perms.includes(permission);
}

/**
 * Resolve the Patient._id linked to this user (for self-scope filtering).
 * Returns null if no linked patient record exists.
 */
async function _getLinkedPatientId(userId, conn) {
  const Patient = conn.model('Patient');
  const patient = await Patient.findOne({ user: userId }).select('_id').lean();
  return patient ? patient._id : null;
}

/** Round to 2 decimal places for monetary precision */
function _round(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Calculate line-item total and invoice-level totals from raw items.
 */
function _calculateTotals(items) {
  let subtotal = 0;
  let taxAmount = 0;
  let discountAmount = 0;

  const computed = items.map((item) => {
    const lineSubtotal = _round(item.quantity * item.unitPrice);
    const lineDiscount = _round(item.discount || 0);
    const lineTax = _round(item.tax || 0);
    const lineTotal = _round(lineSubtotal - lineDiscount + lineTax);

    subtotal = _round(subtotal + lineSubtotal);
    discountAmount = _round(discountAmount + lineDiscount);
    taxAmount = _round(taxAmount + lineTax);

    return {
      description: item.description,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      discount: lineDiscount,
      tax: lineTax,
      total: Math.max(lineTotal, 0),
    };
  });

  const totalAmount = Math.max(_round(subtotal - discountAmount + taxAmount), 0);

  return { items: computed, subtotal, taxAmount, discountAmount, totalAmount };
}

async function listInvoices(query, user, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const Invoice = conn.model('Invoice');
  const { skip, limit, page, sort } = parsePagination(query);

  const filter = { deletedAt: null };
  if (query.patient) filter.patient = query.patient;
  if (query.status) filter.status = query.status;
  if (query.from || query.to) {
    filter.createdAt = {};
    if (query.from) filter.createdAt.$gte = new Date(query.from);
    if (query.to) filter.createdAt.$lte = new Date(query.to);
  }
  if (query.search) {
    const escaped = query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.$or = [
      { invoiceNumber: { $regex: escaped, $options: 'i' } },
    ];
  }

  // Self-scope: if user only has INVOICE_READ_OWN, restrict to their invoices
  if (!_hasFullAccess(user, PERMISSIONS.INVOICE_READ)) {
    const patientId = await _getLinkedPatientId(user.userId, conn);
    if (patientId) {
      filter.patient = patientId;
    } else {
      // No linked patient record — return empty
      return { items: [], total: 0, page: 1, limit };
    }
  }

  // Start of current month for "paid this month" stat
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [items, total, statsAgg] = await Promise.all([
    Invoice.find(filter)
      .sort(sort).skip(skip).limit(limit)
      .populate('patient', 'name patientId phone')
      .populate('doctor', 'name specialization')
      .populate('createdBy', 'name'),
    Invoice.countDocuments(filter),
    Invoice.aggregate([
      { $match: { deletedAt: null } },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: '$totalAmount' },
          pending: {
            $sum: {
              $cond: [
                { $in: ['$status', ['sent', 'partially_paid', 'draft']] },
                1,
                0,
              ],
            },
          },
          overdue: {
            $sum: {
              $cond: [
                { $eq: ['$status', 'overdue'] },
                1,
                0,
              ],
            },
          },
          paidThisMonth: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ['$status', 'paid'] },
                    { $gte: ['$paidAt', monthStart] },
                  ],
                },
                1,
                0,
              ],
            },
          },
        },
      },
    ]),
  ]);

  const raw = statsAgg[0] || {};
  const stats = {
    totalRevenue: raw.totalRevenue || 0,
    pending: raw.pending || 0,
    overdue: raw.overdue || 0,
    paidThisMonth: raw.paidThisMonth || 0,
  };

  return { items, total, page, limit, stats };
}

async function getInvoiceById(id, user, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const Invoice = conn.model('Invoice');
  const invoice = await Invoice.findById(id)
    .populate('patient', 'name patientId phone email')
    .populate('doctor', 'name specialization')
    .populate('appointment')
    .populate('createdBy', 'name');
  if (!invoice) throw ApiError.notFound('Invoice not found');

  // Self-scope check
  if (!_hasFullAccess(user, PERMISSIONS.INVOICE_READ)) {
    const patientId = await _getLinkedPatientId(user.userId, conn);
    if (!patientId || String(invoice.patient._id || invoice.patient) !== String(patientId)) {
      throw ApiError.forbidden('You can only view your own invoices');
    }
  }

  return invoice;
}

async function createInvoice(data, createdBy, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const Invoice = conn.model('Invoice');

  const totals = _calculateTotals(data.items);

  return Invoice.create({
    ...data,
    items: totals.items,
    subtotal: totals.subtotal,
    taxAmount: totals.taxAmount,
    discountAmount: totals.discountAmount,
    totalAmount: totals.totalAmount,
    createdBy,
  });
}

const ALLOWED_STATUS_TRANSITIONS = Object.freeze({
  draft:          ['sent', 'paid', 'cancelled'],
  sent:           ['paid', 'partially_paid', 'overdue', 'cancelled'],
  partially_paid: ['paid', 'overdue', 'cancelled', 'refunded'],
  overdue:        ['paid', 'partially_paid', 'cancelled'],
  paid:           ['refunded'],
  cancelled:      [],       // terminal
  refunded:       [],       // terminal
});

async function updateInvoice(id, data, user, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const Invoice = conn.model('Invoice');

  const invoice = await Invoice.findById(id);
  if (!invoice) throw ApiError.notFound('Invoice not found');

  // Status transition validation
  if (data.status && data.status !== invoice.status) {
    const allowed = ALLOWED_STATUS_TRANSITIONS[invoice.status] || [];
    if (!allowed.includes(data.status)) {
      throw ApiError.badRequest(
        `Cannot transition invoice from "${invoice.status}" to "${data.status}"`
      );
    }
  }

  // Block item/financial field changes if invoice has any payments
  const hasPaidAmount = (invoice.paidAmount || 0) > 0;
  if (hasPaidAmount && data.items) {
    throw ApiError.badRequest(
      'Cannot modify line items on an invoice that has received payments. Create a credit note instead.',
    );
  }

  // Recalculate totals if items are being updated
  if (data.items) {
    const totals = _calculateTotals(data.items);
    data.items = totals.items;
    data.subtotal = totals.subtotal;
    data.taxAmount = totals.taxAmount;
    data.discountAmount = totals.discountAmount;
    data.totalAmount = totals.totalAmount;
  }

  // Handle status transitions
  if (data.status === INVOICE_STATUS.PAID) {
    data.paidAt = new Date();
    if (!data.paidAmount) {
      data.paidAmount = data.totalAmount || invoice.totalAmount;
    }
  } else if (data.status === INVOICE_STATUS.CANCELLED) {
    data.paidAmount = 0;

    // Cascade: fail PENDING payments when invoice is cancelled
    try {
      const Payment = conn.model('Payment');
      const result = await Payment.updateMany(
        { invoice: id, status: PAYMENT_STATUS.PENDING, deletedAt: null },
        { $set: { status: PAYMENT_STATUS.FAILED, metadata: { failureReason: 'invoice_cancelled' } } },
      );
      if (result.modifiedCount > 0) {
        logger.info('Failed %d pending payment(s) for cancelled invoice %s', result.modifiedCount, id);
      }
    } catch (err) {
      logger.error('Failed to cancel pending payments for invoice %s: %s', id, err.message);
    }
  }

  // Use save() instead of findByIdAndUpdate so the Invoice model's pre('save')
  // immutability guard fires — it blocks financial field changes after payment.
  Object.assign(invoice, data);
  await invoice.save();
  return invoice;
}

async function deleteInvoice(id, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const Invoice = conn.model('Invoice');
  const invoice = await Invoice.findById(id);
  if (!invoice) throw ApiError.notFound('Invoice not found');
  if (invoice.status === 'paid' || invoice.status === 'partially_paid') {
    throw ApiError.badRequest('Cannot void an invoice with payments. Create a refund instead.');
  }
  invoice.deletedAt = new Date();
  await invoice.save();

  // Cascade: fail PENDING payments when invoice is voided
  try {
    const Payment = conn.model('Payment');
    await Payment.updateMany(
      { invoice: id, status: PAYMENT_STATUS.PENDING, deletedAt: null },
      { $set: { status: PAYMENT_STATUS.FAILED, metadata: { failureReason: 'invoice_voided' } } },
    );
  } catch (err) {
    logger.error('Failed to cancel pending payments for voided invoice %s: %s', id, err.message);
  }

  return invoice;
}

/**
 * Get the next sequential invoice number for this tenant.
 */
async function getNextSequenceNumber(tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const Invoice = conn.model('Invoice');
  const result = await Invoice.findOne({}, { sequenceNumber: 1 })
    .sort({ sequenceNumber: -1 })
    .lean();
  return (result?.sequenceNumber || 0) + 1;
}

/**
 * Generate a PDF buffer for an invoice.
 */
async function generateInvoicePdf(id, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const Invoice = conn.model('Invoice');
  const invoice = await Invoice.findById(id)
    .populate('patient', 'name patientId phone email')
    .populate('doctor', 'name specialization')
    .populate('createdBy', 'name');
  if (!invoice) throw ApiError.notFound('Invoice not found');

  // Get clinic settings for the PDF header — extract only the fields the
  // PDF template needs and format the address subdocument into a string.
  let clinic = { name: 'BestoClinic' };
  try {
    const clinicModule = require('../clinic/clinic.service');
    const clinicDoc = await clinicModule.getClinicSettings(tenantSlug);

    const addr = clinicDoc.address || {};
    const addressParts = [addr.street, addr.locality, addr.city, addr.state].filter(Boolean);
    const addressLine = addressParts.join(', ') + (addr.zipCode ? ` - ${addr.zipCode}` : '');

    clinic = {
      name: clinicDoc.name || 'BestoClinic',
      address: addressLine,
      phone: clinicDoc.phone || '',
      email: clinicDoc.email || '',
      gstin: clinicDoc.gstin || '',
      logo: clinicDoc.logo || '',
    };
  } catch {
    // fallback already set above
  }

  const { generateInvoicePdf: genPdf } = require('../../utils/pdfGenerator');
  return genPdf(invoice.toJSON(), clinic);
}

module.exports = {
  listInvoices,
  getInvoiceById,
  createInvoice,
  updateInvoice,
  deleteInvoice,
  getNextSequenceNumber,
  generateInvoicePdf,
};
