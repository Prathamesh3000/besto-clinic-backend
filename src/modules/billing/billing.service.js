'use strict';

const ApiError = require('../../utils/ApiError');
const { parsePagination } = require('../../utils/pagination');
const {
  INVOICE_STATUS,
  PAYMENT_STATUS,
  PAYMENT_MODE,
  LEDGER_ENTRY_TYPE,
  LEDGER_SOURCE,
  FINANCIAL_AUDIT_ACTION,
  CASH_REGISTER_STATUS,
} = require('../../config/constants');
const { getTenantConnection } = require('../../db/tenantConnectionManager');
const { ROLE_PERMISSIONS, PERMISSIONS } = require('../../config/permissions');

/* ── Helpers ──────────────────────────────────────────────────────── */

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

/** Get next invoice sequence number */
async function _getNextSequenceNumber(conn) {
  const result = await conn.model('Invoice')
    .findOne({}, { sequenceNumber: 1 })
    .sort({ sequenceNumber: -1 })
    .lean();
  return (result?.sequenceNumber || 0) + 1;
}

/* ── Invoice ──────────────────────────────────────────────────────── */

async function createEnhancedInvoice(data, user, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const Invoice = conn.model('Invoice');
  const PatientLedger = conn.model('PatientLedger');
  const FinancialAuditLog = conn.model('FinancialAuditLog');

  // If items have serviceItem IDs, fetch ServiceItem to fill details
  const resolvedItems = [];
  for (const item of data.items) {
    if (item.serviceItem) {
      const ServiceItem = conn.model('ServiceItem');
      const svc = await ServiceItem.findById(item.serviceItem).lean();
      if (!svc) {
        throw ApiError.notFound(`Service item ${item.serviceItem} not found`);
      }
      resolvedItems.push({
        serviceItem: item.serviceItem,
        description: item.description || svc.name,
        quantity: item.quantity || 1,
        unitPrice: item.unitPrice != null ? item.unitPrice : svc.defaultPrice,
        discount: item.discount || 0,
        taxRate: svc.taxRate || 0,
        hsnCode: svc.hsnCode,
        itemType: item.itemType || svc.category,
      });
    } else {
      resolvedItems.push({
        description: item.description,
        quantity: item.quantity || 1,
        unitPrice: item.unitPrice,
        discount: item.discount || 0,
        taxRate: 0,
        itemType: item.itemType || 'other',
      });
    }
  }

  // GST supply type: interstate → IGST only, intrastate → 50/50 CGST+SGST
  const gstType = data.gstType || 'intrastate';

  // Calculate totals per item
  let subtotal = 0;
  let taxAmount = 0;
  let discountAmount = 0;

  const computedItems = resolvedItems.map((item) => {
    const lineSubtotal = _round(item.quantity * item.unitPrice);
    const lineDiscount = _round(item.discount || 0);
    const lineTax = _round((item.taxRate / 100) * (lineSubtotal - lineDiscount));
    const lineTotal = _round(lineSubtotal - lineDiscount + lineTax);

    subtotal = _round(subtotal + lineSubtotal);
    discountAmount = _round(discountAmount + lineDiscount);
    taxAmount = _round(taxAmount + lineTax);

    // GST split based on supply type
    let cgst = 0, sgst = 0, igst = 0;
    if (gstType === 'interstate') {
      igst = lineTax;
    } else {
      cgst = _round(lineTax / 2);
      sgst = _round(lineTax - cgst);
    }

    return {
      serviceItem: item.serviceItem,
      description: item.description,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      discount: lineDiscount,
      tax: lineTax,
      taxRate: item.taxRate,
      cgst,
      sgst,
      igst,
      hsnCode: item.hsnCode,
      itemType: item.itemType,
      total: Math.max(lineTotal, 0),
    };
  });

  // Apply promotion discount if promotionCode provided
  let promotionDiscount = 0;
  if (data.promotionCode) {
    try {
      const Promotion = conn.model('Promotion');
      const promo = await Promotion.findOne({
        code: data.promotionCode.toUpperCase(),
        isActive: true,
      }).lean();
      if (promo) {
        if (promo.discountType === 'percentage') {
          promotionDiscount = _round(subtotal * (promo.discountValue / 100));
        } else {
          promotionDiscount = _round(promo.discountValue);
        }
      }
    } catch (_err) {
      // Promotion model may not exist — skip silently
    }
  }

  // Recalculate tax proportionally after promotion discount
  if (promotionDiscount > 0 && subtotal > 0) {
    const discountRatio = promotionDiscount / subtotal;
    const taxReduction = _round(taxAmount * discountRatio);
    taxAmount = _round(taxAmount - taxReduction);

    // Proportionally reduce per-item GST
    for (const item of computedItems) {
      const itemTaxReduction = _round(item.tax * discountRatio);
      item.tax = _round(item.tax - itemTaxReduction);
      if (gstType === 'interstate') {
        item.igst = item.tax;
      } else {
        item.cgst = _round(item.tax / 2);
        item.sgst = _round(item.tax - item.cgst);
      }
      item.total = Math.max(_round(item.quantity * item.unitPrice - item.discount + item.tax), 0);
    }
  }

  discountAmount = _round(discountAmount + promotionDiscount);
  const totalAmount = Math.max(_round(subtotal - discountAmount + taxAmount), 0);

  // Get next sequence number
  const sequenceNumber = await _getNextSequenceNumber(conn);

  // Aggregate GST details from computed items
  const gstDetails = {
    cgst: _round(computedItems.reduce((sum, i) => sum + i.cgst, 0)),
    sgst: _round(computedItems.reduce((sum, i) => sum + i.sgst, 0)),
    igst: _round(computedItems.reduce((sum, i) => sum + i.igst, 0)),
  };

  // Create Invoice
  const invoice = await Invoice.create({
    patient: data.patient,
    doctor: data.doctor,
    appointment: data.appointment,
    branch: data.branch,
    items: computedItems,
    subtotal,
    taxAmount,
    discountAmount,
    totalAmount,
    gstType,
    gstDetails,
    promotionCode: data.promotionCode,
    promotionDiscount,
    dueDate: data.dueDate,
    notes: data.notes,
    sequenceNumber,
    status: INVOICE_STATUS.DRAFT,
    paidAmount: 0,
    createdBy: user.userId,
  });

  // Create PatientLedger DEBIT entry inside a transaction to avoid race conditions
  const ledgerSession = await conn.startSession();
  try {
    await ledgerSession.startTransaction();

    const lastEntry = await PatientLedger.findOne({ patient: data.patient })
      .sort({ createdAt: -1 })
      .select('balance')
      .session(ledgerSession)
      .lean();
    const previousBalance = lastEntry ? lastEntry.balance : 0;

    await PatientLedger.create(
      [
        {
          patient: data.patient,
          type: LEDGER_ENTRY_TYPE.DEBIT,
          amount: totalAmount,
          balance: _round(previousBalance + totalAmount),
          source: LEDGER_SOURCE.ADJUSTMENT,
          reference: invoice._id,
          description: `Invoice #${sequenceNumber} created`,
          createdBy: user.userId,
        },
      ],
      { session: ledgerSession },
    );

    await ledgerSession.commitTransaction();
  } catch (err) {
    await ledgerSession.abortTransaction();
    throw err;
  } finally {
    await ledgerSession.endSession();
  }

  // Create FinancialAuditLog entry
  await FinancialAuditLog.create({
    action: FINANCIAL_AUDIT_ACTION.INVOICE_CREATED,
    entity: 'Invoice',
    entityId: invoice._id,
    actor: user.userId,
    actorRole: user.role,
    after: {
      patient: data.patient,
      totalAmount,
      sequenceNumber,
      itemCount: computedItems.length,
    },
  });

  return invoice;
}

/* ── Payment ──────────────────────────────────────────────────────── */

async function recordPayment(invoiceId, paymentData, user, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const Invoice = conn.model('Invoice');
  const Payment = conn.model('Payment');
  const PatientLedger = conn.model('PatientLedger');
  const FinancialAuditLog = conn.model('FinancialAuditLog');

  // Idempotency guard — return existing payment if key matches
  if (paymentData.idempotencyKey) {
    const existingPayment = await Payment.findOne({
      idempotencyKey: paymentData.idempotencyKey,
      deletedAt: null,
    }).lean();
    if (existingPayment) {
      const existingInvoice = await Invoice.findById(invoiceId).lean();
      return { payment: existingPayment, invoice: existingInvoice };
    }
  }

  // Use a session to wrap the entire payment flow atomically
  const session = await conn.startSession();
  let payment;
  let finalInvoice;

  try {
    await session.withTransaction(async () => {
      // Atomic guard: verify invoice is payable and amount doesn't exceed remaining balance
      const invoice = await Invoice.findOneAndUpdate(
        {
          _id: invoiceId,
          status: { $nin: [INVOICE_STATUS.CANCELLED, INVOICE_STATUS.REFUNDED] },
          deletedAt: null,
          $expr: {
            $lte: [
              { $add: [{ $ifNull: ['$paidAmount', 0] }, paymentData.amount] },
              '$totalAmount',
            ],
          },
        },
        {}, // no-op update to acquire the document within the transaction
        { session, new: true },
      );

      if (!invoice) {
        // Distinguish: not found vs overpayment vs terminal status
        const raw = await Invoice.findById(invoiceId).session(session).lean();
        if (!raw) throw ApiError.notFound('Invoice not found');
        if (raw.status === INVOICE_STATUS.CANCELLED || raw.status === INVOICE_STATUS.REFUNDED) {
          throw ApiError.badRequest('Cannot record payment for a cancelled or refunded invoice');
        }
        const remaining = _round(raw.totalAmount - (raw.paidAmount || 0));
        throw ApiError.badRequest(
          `Payment amount ${paymentData.amount} exceeds remaining balance ${remaining}`,
        );
      }

      // Create Payment record within the session
      [payment] = await Payment.create(
        [
          {
            invoice: invoiceId,
            patient: invoice.patient,
            amount: paymentData.amount,
            mode: paymentData.mode,
            reference: paymentData.reference,
            notes: paymentData.notes,
            insuranceClaim: paymentData.insuranceClaim,
            idempotencyKey: paymentData.idempotencyKey,
            status: PAYMENT_STATUS.COMPLETED,
            paidAt: new Date(),
            processedBy: user.userId,
          },
        ],
        { session },
      );

      // Update Invoice atomically: $inc paidAmount, $push payment ID and paidVia entry
      const updatedInvoice = await Invoice.findOneAndUpdate(
        { _id: invoiceId },
        {
          $inc: { paidAmount: paymentData.amount },
          $push: {
            payments: payment._id,
            paidVia: {
              mode: paymentData.mode,
              amount: paymentData.amount,
              reference: paymentData.reference,
              paidAt: new Date(),
            },
          },
        },
        { new: true, session },
      );

      // Determine and set invoice status based on new paidAmount
      const newPaidAmount = _round(updatedInvoice.paidAmount);
      const statusUpdate = {};
      if (newPaidAmount >= updatedInvoice.totalAmount) {
        statusUpdate.status = INVOICE_STATUS.PAID;
        statusUpdate.paidAt = new Date();
      } else if (newPaidAmount > 0) {
        statusUpdate.status = INVOICE_STATUS.PARTIALLY_PAID;
      }
      if (Object.keys(statusUpdate).length > 0) {
        await Invoice.updateOne({ _id: invoiceId }, { $set: statusUpdate }, { session });
      }

      finalInvoice = {
        ...updatedInvoice.toJSON(),
        paidAmount: updatedInvoice.paidAmount,
        status: statusUpdate.status || updatedInvoice.status,
      };

      // Create PatientLedger CREDIT entry within the same session
      const lastEntry = await PatientLedger.findOne({ patient: invoice.patient })
        .sort({ createdAt: -1 })
        .select('balance')
        .session(session)
        .lean();
      const previousBalance = lastEntry ? lastEntry.balance : 0;

      await PatientLedger.create(
        [
          {
            patient: invoice.patient,
            type: LEDGER_ENTRY_TYPE.CREDIT,
            amount: paymentData.amount,
            balance: _round(previousBalance - paymentData.amount),
            source: LEDGER_SOURCE.PAYMENT,
            reference: payment._id,
            description: `Payment received via ${paymentData.mode} for invoice ${invoice._id}`,
            createdBy: user.userId,
          },
        ],
        { session },
      );
    });
  } finally {
    await session.endSession();
  }

  // For cash payments: find open CashRegister, update cashIn + transactionCount
  // (outside transaction — non-critical, best-effort)
  if (paymentData.mode === PAYMENT_MODE.CASH) {
    try {
      const CashRegister = conn.model('CashRegister');
      const registerFilter = { status: CASH_REGISTER_STATUS.OPEN };
      if (paymentData.cashRegister) {
        registerFilter._id = paymentData.cashRegister;
      }
      await CashRegister.findOneAndUpdate(
        registerFilter,
        {
          $inc: {
            cashIn: paymentData.amount,
            transactionCount: 1,
          },
        },
      );
    } catch (_err) {
      // CashRegister model may not exist — skip silently
    }
  }

  // Create FinancialAuditLog entries (outside transaction — immutable, append-only)
  await FinancialAuditLog.create({
    action: FINANCIAL_AUDIT_ACTION.PAYMENT_CREATED,
    entity: 'Payment',
    entityId: payment._id,
    actor: user.userId,
    actorRole: user.role,
    after: {
      invoice: invoiceId,
      amount: paymentData.amount,
      mode: paymentData.mode,
    },
  });

  await FinancialAuditLog.create({
    action: FINANCIAL_AUDIT_ACTION.PAYMENT_COMPLETED,
    entity: 'Payment',
    entityId: payment._id,
    actor: user.userId,
    actorRole: user.role,
    after: {
      invoice: invoiceId,
      amount: paymentData.amount,
      invoiceStatus: finalInvoice.status,
      totalPaid: finalInvoice.paidAmount,
    },
  });

  return { payment, invoice: finalInvoice };
}

/* ── Service Items ────────────────────────────────────────────────── */

async function getServiceItems(query, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const ServiceItem = conn.model('ServiceItem');
  const { skip, limit, page, sort } = parsePagination(query);

  const filter = {};
  if (query.category) filter.category = query.category;
  if (query.isActive !== undefined) filter.isActive = query.isActive === 'true';
  if (query.search) {
    filter.name = { $regex: query.search, $options: 'i' };
  }

  const sortOverride = { name: 1, ...sort };

  const [items, total] = await Promise.all([
    ServiceItem.find(filter)
      .sort(sortOverride).skip(skip).limit(limit),
    ServiceItem.countDocuments(filter),
  ]);

  return { items, total, page, limit };
}

async function createServiceItem(data, user, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const ServiceItem = conn.model('ServiceItem');

  const serviceItem = await ServiceItem.create({
    ...data,
    createdBy: user.userId,
  });

  return serviceItem;
}

async function updateServiceItem(id, data, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const ServiceItem = conn.model('ServiceItem');

  const serviceItem = await ServiceItem.findByIdAndUpdate(id, data, {
    new: true,
    runValidators: true,
  });

  if (!serviceItem) {
    throw ApiError.notFound('Service item not found');
  }

  return serviceItem;
}

/* ── Analytics ────────────────────────────────────────────────────── */

async function getRevenueAnalytics(query, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const Invoice = conn.model('Invoice');

  const matchStage = {
    deletedAt: null,
    status: { $in: [INVOICE_STATUS.PAID, INVOICE_STATUS.PARTIALLY_PAID] },
  };

  if (query.from || query.to) {
    matchStage.createdAt = {};
    if (query.from) matchStage.createdAt.$gte = new Date(query.from);
    if (query.to) matchStage.createdAt.$lte = new Date(query.to);
  }
  if (query.branch) matchStage.branch = query.branch;

  // Group by branch
  const byBranch = await Invoice.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: '$branch',
        totalRevenue: { $sum: '$totalAmount' },
        totalCollected: { $sum: '$paidAmount' },
        totalOutstanding: { $sum: { $subtract: ['$totalAmount', '$paidAmount'] } },
        invoiceCount: { $sum: 1 },
      },
    },
  ]);

  // Monthly trend
  const monthlyTrend = await Invoice.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: {
          year: { $year: '$createdAt' },
          month: { $month: '$createdAt' },
        },
        totalRevenue: { $sum: '$totalAmount' },
        totalCollected: { $sum: '$paidAmount' },
        invoiceCount: { $sum: 1 },
      },
    },
    { $sort: { '_id.year': 1, '_id.month': 1 } },
  ]);

  // Totals
  const totalsMatch = { ...matchStage };
  delete totalsMatch.status;

  const totalsAgg = await Invoice.aggregate([
    { $match: { ...totalsMatch, status: { $ne: INVOICE_STATUS.CANCELLED } } },
    {
      $group: {
        _id: null,
        totalInvoiced: { $sum: '$totalAmount' },
        totalCollected: { $sum: '$paidAmount' },
        totalRefunded: {
          $sum: {
            $cond: [{ $eq: ['$status', INVOICE_STATUS.REFUNDED] }, '$totalAmount', 0],
          },
        },
        totalOutstanding: {
          $sum: {
            $cond: [
              { $in: ['$status', [INVOICE_STATUS.SENT, INVOICE_STATUS.OVERDUE, INVOICE_STATUS.PARTIALLY_PAID]] },
              { $subtract: ['$totalAmount', '$paidAmount'] },
              0,
            ],
          },
        },
      },
    },
  ]);

  const totals = totalsAgg[0] || {
    totalInvoiced: 0,
    totalCollected: 0,
    totalRefunded: 0,
    totalOutstanding: 0,
  };

  // --- Revenue breakdown by time period (from completed payments) ---
  const Payment = conn.model('Payment');
  const now = new Date();

  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(now);
  todayEnd.setHours(23, 59, 59, 999);

  const weekStart = new Date(now);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  weekStart.setHours(0, 0, 0, 0);

  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const paymentBase = { status: PAYMENT_STATUS.COMPLETED, deletedAt: null };

  const [todayPayments, weekPayments, monthPayments] = await Promise.all([
    Payment.aggregate([
      { $match: { ...paymentBase, createdAt: { $gte: todayStart, $lte: todayEnd } } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]),
    Payment.aggregate([
      { $match: { ...paymentBase, createdAt: { $gte: weekStart, $lte: todayEnd } } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]),
    Payment.aggregate([
      { $match: { ...paymentBase, createdAt: { $gte: monthStart, $lte: todayEnd } } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]),
  ]);

  return {
    today: todayPayments[0]?.total || 0,
    thisWeek: weekPayments[0]?.total || 0,
    thisMonth: monthPayments[0]?.total || 0,
    byBranch,
    monthlyTrend,
    totals,
  };
}

async function getDoctorRevenueShare(query, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const Invoice = conn.model('Invoice');

  const matchStage = {
    deletedAt: null,
    doctor: { $exists: true, $ne: null },
    status: { $in: [INVOICE_STATUS.PAID, INVOICE_STATUS.PARTIALLY_PAID] },
  };

  if (query.from || query.to) {
    matchStage.createdAt = {};
    if (query.from) matchStage.createdAt.$gte = new Date(query.from);
    if (query.to) matchStage.createdAt.$lte = new Date(query.to);
  }
  if (query.branch) matchStage.branch = query.branch;

  const result = await Invoice.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: '$doctor',
        totalInvoiced: { $sum: '$totalAmount' },
        totalCollected: { $sum: '$paidAmount' },
        invoiceCount: { $sum: 1 },
      },
    },
    {
      $lookup: {
        from: 'users',
        localField: '_id',
        foreignField: '_id',
        as: 'doctorInfo',
      },
    },
    { $unwind: { path: '$doctorInfo', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        doctor: '$_id',
        doctorName: '$doctorInfo.name',
        totalInvoiced: 1,
        totalCollected: 1,
        invoiceCount: 1,
      },
    },
    { $sort: { totalCollected: -1 } },
  ]);

  return result;
}

async function getOutstandingReport(query, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const Invoice = conn.model('Invoice');

  const matchStage = {
    deletedAt: null,
    status: { $in: [INVOICE_STATUS.SENT, INVOICE_STATUS.OVERDUE, INVOICE_STATUS.PARTIALLY_PAID] },
  };

  if (query.branch) matchStage.branch = query.branch;
  if (query.from || query.to) {
    matchStage.createdAt = {};
    if (query.from) matchStage.createdAt.$gte = new Date(query.from);
    if (query.to) matchStage.createdAt.$lte = new Date(query.to);
  }

  const now = new Date();

  const invoices = await Invoice.find(matchStage)
    .populate('patient', 'name patientId phone')
    .populate('doctor', 'name')
    .sort({ createdAt: 1 })
    .lean();

  // Group by aging buckets
  const aging = {
    '0-30': { count: 0, totalOutstanding: 0, invoices: [] },
    '31-60': { count: 0, totalOutstanding: 0, invoices: [] },
    '61-90': { count: 0, totalOutstanding: 0, invoices: [] },
    '90+': { count: 0, totalOutstanding: 0, invoices: [] },
  };

  let totalOutstanding = 0;

  for (const inv of invoices) {
    const daysSince = Math.floor((now - new Date(inv.createdAt)) / (1000 * 60 * 60 * 24));
    const outstanding = _round(inv.totalAmount - (inv.paidAmount || 0));
    totalOutstanding = _round(totalOutstanding + outstanding);

    const entry = { ...inv, outstanding, daysSince };

    if (daysSince <= 30) {
      aging['0-30'].count += 1;
      aging['0-30'].totalOutstanding = _round(aging['0-30'].totalOutstanding + outstanding);
      aging['0-30'].invoices.push(entry);
    } else if (daysSince <= 60) {
      aging['31-60'].count += 1;
      aging['31-60'].totalOutstanding = _round(aging['31-60'].totalOutstanding + outstanding);
      aging['31-60'].invoices.push(entry);
    } else if (daysSince <= 90) {
      aging['61-90'].count += 1;
      aging['61-90'].totalOutstanding = _round(aging['61-90'].totalOutstanding + outstanding);
      aging['61-90'].invoices.push(entry);
    } else {
      aging['90+'].count += 1;
      aging['90+'].totalOutstanding = _round(aging['90+'].totalOutstanding + outstanding);
      aging['90+'].invoices.push(entry);
    }
  }

  // Per-patient grouping
  const patientMap = {};
  for (const inv of invoices) {
    const patientKey = String(inv.patient?._id || inv.patient);
    if (!patientMap[patientKey]) {
      patientMap[patientKey] = {
        patient: inv.patient,
        totalOutstanding: 0,
        invoiceCount: 0,
        oldestInvoiceDate: inv.createdAt,
      };
    }
    const outstanding = _round(inv.totalAmount - (inv.paidAmount || 0));
    patientMap[patientKey].totalOutstanding = _round(patientMap[patientKey].totalOutstanding + outstanding);
    patientMap[patientKey].invoiceCount += 1;
    if (new Date(inv.createdAt) < new Date(patientMap[patientKey].oldestInvoiceDate)) {
      patientMap[patientKey].oldestInvoiceDate = inv.createdAt;
    }
  }

  const byPatient = Object.values(patientMap).sort((a, b) => b.totalOutstanding - a.totalOutstanding);

  return {
    summary: {
      totalOutstanding,
      totalInvoices: invoices.length,
      totalPatients: byPatient.length,
      aging: {
        '0-30': { count: aging['0-30'].count, totalOutstanding: aging['0-30'].totalOutstanding },
        '31-60': { count: aging['31-60'].count, totalOutstanding: aging['31-60'].totalOutstanding },
        '61-90': { count: aging['61-90'].count, totalOutstanding: aging['61-90'].totalOutstanding },
        '90+': { count: aging['90+'].count, totalOutstanding: aging['90+'].totalOutstanding },
      },
    },
    byPatient,
    detail: invoices.map((inv) => ({
      _id: inv._id,
      patient: inv.patient,
      doctor: inv.doctor,
      totalAmount: inv.totalAmount,
      paidAmount: inv.paidAmount || 0,
      outstanding: _round(inv.totalAmount - (inv.paidAmount || 0)),
      status: inv.status,
      createdAt: inv.createdAt,
      dueDate: inv.dueDate,
      daysSince: Math.floor((now - new Date(inv.createdAt)) / (1000 * 60 * 60 * 24)),
    })),
  };
}

/* ── Patient Ledger ───────────────────────────────────────────────── */

async function getPatientLedger(patientId, query, user, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const PatientLedger = conn.model('PatientLedger');
  const { skip, limit, page, sort } = parsePagination(query);

  // Self-scope check
  if (!_hasFullAccess(user, PERMISSIONS.LEDGER_READ)) {
    const linkedId = await _getLinkedPatientId(user.userId, conn);
    if (!linkedId || String(linkedId) !== String(patientId)) {
      throw ApiError.forbidden('You can only view your own ledger');
    }
  }

  const filter = { patient: patientId };
  if (query.from || query.to) {
    filter.createdAt = {};
    if (query.from) filter.createdAt.$gte = new Date(query.from);
    if (query.to) filter.createdAt.$lte = new Date(query.to);
  }

  const [items, total] = await Promise.all([
    PatientLedger.find(filter)
      .sort(sort).skip(skip).limit(limit),
    PatientLedger.countDocuments(filter),
  ]);

  // Get current balance (latest entry's balance field, or 0)
  const latestEntry = await PatientLedger.findOne({ patient: patientId })
    .sort({ createdAt: -1 })
    .select('balance')
    .lean();
  const currentBalance = latestEntry ? latestEntry.balance : 0;

  return { items, total, page, limit, currentBalance };
}

async function recordAdvancePayment(data, user, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const PatientLedger = conn.model('PatientLedger');
  const FinancialAuditLog = conn.model('FinancialAuditLog');

  // Create PatientLedger CREDIT entry inside a transaction to avoid race conditions
  const ledgerSession = await conn.startSession();
  let entry;
  try {
    await ledgerSession.startTransaction();

    const lastEntry = await PatientLedger.findOne({ patient: data.patient })
      .sort({ createdAt: -1 })
      .select('balance')
      .session(ledgerSession)
      .lean();
    const previousBalance = lastEntry ? lastEntry.balance : 0;

    const [created] = await PatientLedger.create(
      [
        {
          patient: data.patient,
          type: LEDGER_ENTRY_TYPE.CREDIT,
          amount: data.amount,
          balance: _round(previousBalance - data.amount),
          source: LEDGER_SOURCE.ADVANCE,
          description: data.notes || `Advance payment via ${data.mode}`,
          createdBy: user.userId,
          branch: data.branch,
        },
      ],
      { session: ledgerSession },
    );
    entry = created;

    await ledgerSession.commitTransaction();
  } catch (err) {
    await ledgerSession.abortTransaction();
    throw err;
  } finally {
    await ledgerSession.endSession();
  }

  // Create FinancialAuditLog
  await FinancialAuditLog.create({
    action: FINANCIAL_AUDIT_ACTION.LEDGER_ENTRY,
    entity: 'PatientLedger',
    entityId: entry._id,
    actor: user.userId,
    actorRole: user.role,
    after: {
      patient: data.patient,
      type: LEDGER_ENTRY_TYPE.CREDIT,
      amount: data.amount,
      source: LEDGER_SOURCE.ADVANCE,
      mode: data.mode,
    },
  });

  return entry;
}

async function adjustLedger(data, user, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const PatientLedger = conn.model('PatientLedger');
  const FinancialAuditLog = conn.model('FinancialAuditLog');

  // Create PatientLedger entry inside a transaction to avoid race conditions
  const ledgerSession = await conn.startSession();
  let entry;
  let previousBalance;
  let newBalance;
  try {
    await ledgerSession.startTransaction();

    const lastEntry = await PatientLedger.findOne({ patient: data.patient })
      .sort({ createdAt: -1 })
      .select('balance')
      .session(ledgerSession)
      .lean();
    previousBalance = lastEntry ? lastEntry.balance : 0;

    // Calculate new balance
    newBalance = data.type === LEDGER_ENTRY_TYPE.CREDIT
      ? _round(previousBalance - data.amount)
      : _round(previousBalance + data.amount);

    const [created] = await PatientLedger.create(
      [
        {
          patient: data.patient,
          type: data.type,
          amount: data.amount,
          balance: newBalance,
          source: LEDGER_SOURCE.ADJUSTMENT,
          description: data.description,
          createdBy: user.userId,
          branch: data.branch,
        },
      ],
      { session: ledgerSession },
    );
    entry = created;

    await ledgerSession.commitTransaction();
  } catch (err) {
    await ledgerSession.abortTransaction();
    throw err;
  } finally {
    await ledgerSession.endSession();
  }

  // Create FinancialAuditLog
  await FinancialAuditLog.create({
    action: FINANCIAL_AUDIT_ACTION.LEDGER_ENTRY,
    entity: 'PatientLedger',
    entityId: entry._id,
    actor: user.userId,
    actorRole: user.role,
    after: {
      patient: data.patient,
      type: data.type,
      amount: data.amount,
      previousBalance,
      newBalance,
      description: data.description,
    },
  });

  return entry;
}

async function getDayEndReport(query, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const Payment = conn.model('Payment');
  const Invoice = conn.model('Invoice');

  const date = query.date ? new Date(query.date) : new Date();
  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(date);
  dayEnd.setHours(23, 59, 59, 999);

  const branchFilter = query.branch ? { branch: query.branch } : {};

  // Collections by payment mode
  const collections = await Payment.aggregate([
    {
      $match: {
        status: PAYMENT_STATUS.COMPLETED,
        createdAt: { $gte: dayStart, $lte: dayEnd },
        deletedAt: null,
        ...branchFilter,
      },
    },
    {
      $group: {
        _id: '$mode',
        count: { $sum: 1 },
        total: { $sum: '$amount' },
      },
    },
  ]);

  // Refunds for the day
  const refunds = await Payment.aggregate([
    {
      $match: {
        status: PAYMENT_STATUS.REFUNDED,
        refundedAt: { $gte: dayStart, $lte: dayEnd },
        deletedAt: null,
        ...branchFilter,
      },
    },
    {
      $group: {
        _id: '$mode',
        count: { $sum: 1 },
        total: { $sum: '$refundAmount' },
      },
    },
  ]);

  // Invoices created today by status
  const invoicesSummary = await Invoice.aggregate([
    {
      $match: {
        createdAt: { $gte: dayStart, $lte: dayEnd },
        deletedAt: null,
        ...branchFilter,
      },
    },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        totalAmount: { $sum: '$totalAmount' },
      },
    },
  ]);

  // Cash register status for the day
  let cashRegister = null;
  try {
    const CashRegister = conn.model('CashRegister');
    cashRegister = await CashRegister.findOne({
      ...branchFilter,
      openedAt: { $gte: dayStart, $lte: dayEnd },
    })
      .sort({ openedAt: -1 })
      .populate('openedBy', 'name')
      .populate('closedBy', 'name')
      .lean();
  } catch {
    // CashRegister model may not exist yet
  }

  const totalCollected = _round(collections.reduce((sum, c) => sum + c.total, 0));
  const totalRefunded = _round(refunds.reduce((sum, r) => sum + r.total, 0));

  return {
    date: dayStart.toISOString().split('T')[0],
    collections: {
      byMode: collections,
      total: totalCollected,
    },
    refunds: {
      byMode: refunds,
      total: totalRefunded,
    },
    netCollection: _round(totalCollected - totalRefunded),
    invoices: invoicesSummary,
    cashRegister,
  };
}

/* ── GST Summary Report ────────────────────────────────────────── */

async function getGstSummary(query, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const Invoice = conn.model('Invoice');

  const matchStage = {
    deletedAt: null,
    status: { $in: [INVOICE_STATUS.PAID, INVOICE_STATUS.PARTIALLY_PAID] },
  };

  if (query.from || query.to) {
    matchStage.createdAt = {};
    if (query.from) matchStage.createdAt.$gte = new Date(query.from);
    if (query.to) matchStage.createdAt.$lte = new Date(query.to);
  }
  if (query.branch) matchStage.branch = query.branch;

  // Period-wise GST totals
  const periodWise = await Invoice.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: {
          year: { $year: '$createdAt' },
          month: { $month: '$createdAt' },
        },
        cgst: { $sum: '$gstDetails.cgst' },
        sgst: { $sum: '$gstDetails.sgst' },
        igst: { $sum: '$gstDetails.igst' },
        totalTax: { $sum: '$taxAmount' },
        invoiceCount: { $sum: 1 },
        taxableAmount: { $sum: { $subtract: ['$subtotal', '$discountAmount'] } },
      },
    },
    { $sort: { '_id.year': 1, '_id.month': 1 } },
  ]);

  // HSN-wise summary (unwind invoice items, group by hsnCode)
  const hsnWise = await Invoice.aggregate([
    { $match: matchStage },
    { $unwind: '$items' },
    { $match: { 'items.hsnCode': { $exists: true, $ne: null, $ne: '' } } },
    {
      $group: {
        _id: '$items.hsnCode',
        description: { $first: '$items.description' },
        totalQuantity: { $sum: '$items.quantity' },
        taxableValue: { $sum: { $subtract: [{ $multiply: ['$items.quantity', '$items.unitPrice'] }, '$items.discount'] } },
        cgst: { $sum: '$items.cgst' },
        sgst: { $sum: '$items.sgst' },
        igst: { $sum: '$items.igst' },
        totalTax: { $sum: '$items.tax' },
      },
    },
    { $sort: { totalTax: -1 } },
  ]);

  // Overall totals
  const totalsAgg = await Invoice.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: null,
        totalCgst: { $sum: '$gstDetails.cgst' },
        totalSgst: { $sum: '$gstDetails.sgst' },
        totalIgst: { $sum: '$gstDetails.igst' },
        totalTax: { $sum: '$taxAmount' },
        totalTaxable: { $sum: { $subtract: ['$subtotal', '$discountAmount'] } },
        invoiceCount: { $sum: 1 },
      },
    },
  ]);

  const totals = totalsAgg[0] || {
    totalCgst: 0, totalSgst: 0, totalIgst: 0, totalTax: 0, totalTaxable: 0, invoiceCount: 0,
  };

  return { periodWise, hsnWise, totals };
}

/* ── Collection Efficiency Metrics ─────────────────────────────── */

async function getCollectionMetrics(query, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const Invoice = conn.model('Invoice');
  const Payment = conn.model('Payment');

  const matchStage = {
    deletedAt: null,
    status: { $ne: INVOICE_STATUS.CANCELLED },
  };

  if (query.from || query.to) {
    matchStage.createdAt = {};
    if (query.from) matchStage.createdAt.$gte = new Date(query.from);
    if (query.to) matchStage.createdAt.$lte = new Date(query.to);
  }
  if (query.branch) matchStage.branch = query.branch;

  // Collection rate
  const invoiceTotals = await Invoice.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: null,
        totalInvoiced: { $sum: '$totalAmount' },
        totalCollected: { $sum: '$paidAmount' },
      },
    },
  ]);

  const inv = invoiceTotals[0] || { totalInvoiced: 0, totalCollected: 0 };
  const collectionRate = inv.totalInvoiced > 0
    ? _round((inv.totalCollected / inv.totalInvoiced) * 100)
    : 0;

  // Average days to payment (from invoice createdAt to paidAt)
  const avgDaysAgg = await Invoice.aggregate([
    { $match: { ...matchStage, paidAt: { $exists: true, $ne: null } } },
    {
      $project: {
        daysToPay: {
          $divide: [
            { $subtract: ['$paidAt', '$createdAt'] },
            1000 * 60 * 60 * 24, // ms → days
          ],
        },
      },
    },
    {
      $group: {
        _id: null,
        avgDays: { $avg: '$daysToPay' },
        minDays: { $min: '$daysToPay' },
        maxDays: { $max: '$daysToPay' },
        count: { $sum: 1 },
      },
    },
  ]);

  const daysStats = avgDaysAgg[0] || { avgDays: 0, minDays: 0, maxDays: 0, count: 0 };

  // Payment mode distribution
  const paymentMatch = { deletedAt: null, status: PAYMENT_STATUS.COMPLETED };
  if (query.from || query.to) {
    paymentMatch.createdAt = {};
    if (query.from) paymentMatch.createdAt.$gte = new Date(query.from);
    if (query.to) paymentMatch.createdAt.$lte = new Date(query.to);
  }

  const modeDistribution = await Payment.aggregate([
    { $match: paymentMatch },
    {
      $group: {
        _id: '$mode',
        count: { $sum: 1 },
        total: { $sum: '$amount' },
      },
    },
    { $sort: { total: -1 } },
  ]);

  return {
    collectionRate,
    totalInvoiced: inv.totalInvoiced,
    totalCollected: inv.totalCollected,
    avgDaysToPayment: _round(daysStats.avgDays),
    minDaysToPayment: _round(daysStats.minDays),
    maxDaysToPayment: _round(daysStats.maxDays),
    paidInvoiceCount: daysStats.count,
    modeDistribution,
  };
}

/* ── Financial Audit Trail ─────────────────────────────────────── */

async function getFinancialAuditTrail(query, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const FinancialAuditLog = conn.model('FinancialAuditLog');
  const { skip, limit, page, sort } = parsePagination(query);

  const filter = {};
  if (query.entity) filter.entity = query.entity;
  if (query.action) filter.action = query.action;
  if (query.entityId) filter.entityId = query.entityId;
  if (query.actor) filter.actor = query.actor;
  if (query.from || query.to) {
    filter.createdAt = {};
    if (query.from) filter.createdAt.$gte = new Date(query.from);
    if (query.to) filter.createdAt.$lte = new Date(query.to);
  }

  const sortOverride = { createdAt: -1, ...sort };

  const [items, total] = await Promise.all([
    FinancialAuditLog.find(filter)
      .populate('actor', 'name email role')
      .sort(sortOverride)
      .skip(skip)
      .limit(limit)
      .lean(),
    FinancialAuditLog.countDocuments(filter),
  ]);

  return { items, total, page, limit };
}

/* ── Write-Off ─────────────────────────────────────────────────── */

async function writeOffInvoice(data, user, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const Invoice = conn.model('Invoice');
  const PatientLedger = conn.model('PatientLedger');
  const FinancialAuditLog = conn.model('FinancialAuditLog');

  const session = await conn.startSession();
  let finalInvoice;

  try {
    await session.withTransaction(async () => {
      // Fetch invoice and validate
      const invoice = await Invoice.findOne({
        _id: data.invoiceId,
        deletedAt: null,
        status: { $nin: [INVOICE_STATUS.CANCELLED, INVOICE_STATUS.REFUNDED] },
      }).session(session);

      if (!invoice) throw ApiError.notFound('Invoice not found or not eligible for write-off');

      const outstanding = _round(invoice.totalAmount - (invoice.paidAmount || 0));
      if (outstanding <= 0) {
        throw ApiError.badRequest('Invoice has no outstanding balance to write off');
      }

      const writeOffAmount = data.amount != null ? data.amount : outstanding;
      if (writeOffAmount > outstanding) {
        throw ApiError.badRequest(`Write-off amount ${writeOffAmount} exceeds outstanding balance ${outstanding}`);
      }

      // Atomically increment paidAmount
      const updated = await Invoice.findOneAndUpdate(
        { _id: data.invoiceId },
        {
          $inc: { paidAmount: writeOffAmount },
        },
        { new: true, session },
      );

      // Update status
      const newPaid = _round(updated.paidAmount);
      const statusUpdate = {};
      if (newPaid >= updated.totalAmount) {
        statusUpdate.status = INVOICE_STATUS.PAID;
        statusUpdate.paidAt = new Date();
      } else if (newPaid > 0) {
        statusUpdate.status = INVOICE_STATUS.PARTIALLY_PAID;
      }
      if (Object.keys(statusUpdate).length > 0) {
        await Invoice.updateOne({ _id: data.invoiceId }, { $set: statusUpdate }, { session });
      }

      finalInvoice = { ...updated.toJSON(), ...statusUpdate };

      // Create ledger entry
      const lastEntry = await PatientLedger.findOne({ patient: invoice.patient })
        .sort({ createdAt: -1 })
        .select('balance')
        .session(session)
        .lean();
      const previousBalance = lastEntry ? lastEntry.balance : 0;

      await PatientLedger.create(
        [
          {
            patient: invoice.patient,
            type: LEDGER_ENTRY_TYPE.CREDIT,
            amount: writeOffAmount,
            balance: _round(previousBalance - writeOffAmount),
            source: LEDGER_SOURCE.WRITE_OFF,
            reference: invoice._id,
            description: data.reason || `Write-off for invoice #${invoice.sequenceNumber}`,
            createdBy: user.userId,
          },
        ],
        { session },
      );
    });
  } finally {
    await session.endSession();
  }

  // Audit log (outside transaction — append-only)
  await FinancialAuditLog.create({
    action: FINANCIAL_AUDIT_ACTION.INVOICE_VOIDED,
    entity: 'Invoice',
    entityId: data.invoiceId,
    actor: user.userId,
    actorRole: user.role,
    after: {
      writeOffAmount: data.amount,
      reason: data.reason,
      newStatus: finalInvoice.status,
      newPaidAmount: finalInvoice.paidAmount,
    },
  });

  return finalInvoice;
}

module.exports = {
  createEnhancedInvoice,
  recordPayment,
  getServiceItems,
  createServiceItem,
  updateServiceItem,
  getRevenueAnalytics,
  getDoctorRevenueShare,
  getOutstandingReport,
  getPatientLedger,
  recordAdvancePayment,
  adjustLedger,
  getDayEndReport,
  getGstSummary,
  getCollectionMetrics,
  getFinancialAuditTrail,
  writeOffInvoice,
};
