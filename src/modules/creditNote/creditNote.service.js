'use strict';

const ApiError = require('../../utils/ApiError');
const { parsePagination } = require('../../utils/pagination');
const { CREDIT_NOTE_STATUS, INVOICE_STATUS, LEDGER_ENTRY_TYPE, LEDGER_SOURCE, FINANCIAL_AUDIT_ACTION } = require('../../config/constants');
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

/**
 * Calculate line-item totals and credit-note-level totals from raw items.
 */
function _calculateCreditNoteTotals(items) {
  let subtotal = 0;
  let taxAmount = 0;

  const computed = items.map((item) => {
    const lineSubtotal = _round(item.quantity * item.unitPrice);
    const lineTax = _round(item.tax || 0);
    const lineTotal = _round(lineSubtotal + lineTax);

    subtotal = _round(subtotal + lineSubtotal);
    taxAmount = _round(taxAmount + lineTax);

    return {
      description: item.description,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      tax: lineTax,
      total: Math.max(lineTotal, 0),
    };
  });

  const totalAmount = Math.max(_round(subtotal + taxAmount), 0);

  return { items: computed, subtotal, taxAmount, totalAmount };
}

/**
 * Create a ledger entry inside a transaction (race-condition-safe).
 * Uses the same balance convention as payment.service.js:
 *   CREDIT = previousBalance - amount  (patient paid / gains credit → reduces what they owe)
 *   DEBIT  = previousBalance + amount  (patient charged / credit used → increases what they owe)
 */
async function _createLedgerEntry(conn, { patient, type, amount, source, reference, referenceModel, description, createdBy }) {
  const PatientLedger = conn.model('PatientLedger');

  const session = await conn.startSession();
  try {
    let ledgerEntry;

    await session.withTransaction(async () => {
      const lastEntry = await PatientLedger.findOne({ patient })
        .sort({ createdAt: -1 })
        .select('balance')
        .session(session)
        .lean();

      const previousBalance = lastEntry ? lastEntry.balance : 0;
      const balance = type === LEDGER_ENTRY_TYPE.CREDIT
        ? _round(previousBalance - amount)
        : _round(previousBalance + amount);

      const created = await PatientLedger.create(
        [{
          patient,
          type,
          amount,
          balance,
          source,
          reference,
          referenceModel,
          description,
          createdBy,
        }],
        { session },
      );
      ledgerEntry = created[0];
    });

    return ledgerEntry;
  } finally {
    await session.endSession();
  }
}

/* ── Service Functions ────────────────────────────────────────────── */

async function createCreditNote(data, user, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const CreditNote = conn.model('CreditNote');
  const Invoice = conn.model('Invoice');
  const FinancialAuditLog = conn.model('FinancialAuditLog');

  // Verify source invoice exists
  const sourceInvoice = await Invoice.findById(data.invoice);
  if (!sourceInvoice) {
    throw ApiError.notFound('Source invoice not found');
  }

  // Calculate totals
  const totals = _calculateCreditNoteTotals(data.items);

  // Validate credit note total does not exceed source invoice total
  if (totals.totalAmount > sourceInvoice.totalAmount) {
    throw ApiError.badRequest(
      `Credit note total (${totals.totalAmount}) cannot exceed source invoice total (${sourceInvoice.totalAmount})`,
    );
  }

  // Create credit note with status 'draft'
  const creditNote = await CreditNote.create({
    ...data,
    items: totals.items,
    subtotal: totals.subtotal,
    taxAmount: totals.taxAmount,
    totalAmount: totals.totalAmount,
    status: CREDIT_NOTE_STATUS.DRAFT,
    appliedAmount: 0,
    createdBy: user.userId,
  });

  // Create audit log entry (use correct field names: entity, actor)
  await FinancialAuditLog.create({
    action: FINANCIAL_AUDIT_ACTION.CREDIT_NOTE_CREATED,
    entity: 'CreditNote',
    entityId: creditNote._id,
    actor: user.userId,
    actorRole: user.role,
    after: {
      invoice: data.invoice,
      patient: data.patient,
      reason: data.reason,
      totalAmount: totals.totalAmount,
    },
  });

  return creditNote;
}

async function issueCreditNote(id, user, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const CreditNote = conn.model('CreditNote');
  const FinancialAuditLog = conn.model('FinancialAuditLog');

  const creditNote = await CreditNote.findById(id);
  if (!creditNote) {
    throw ApiError.notFound('Credit note not found');
  }

  if (creditNote.status !== CREDIT_NOTE_STATUS.DRAFT) {
    throw ApiError.badRequest(
      `Cannot issue credit note with status "${creditNote.status}". Only draft credit notes can be issued.`,
    );
  }

  // Update status to 'issued'
  creditNote.status = CREDIT_NOTE_STATUS.ISSUED;
  creditNote.issuedAt = new Date();
  creditNote.approvedBy = user.userId;
  await creditNote.save();

  // Create PatientLedger CREDIT entry inside transaction (patient gains credit → reduces what they owe)
  await _createLedgerEntry(conn, {
    patient: creditNote.patient,
    type: LEDGER_ENTRY_TYPE.CREDIT,
    amount: creditNote.totalAmount,
    source: LEDGER_SOURCE.CREDIT_NOTE,
    reference: creditNote._id,
    referenceModel: 'CreditNote',
    description: `Credit note issued — ${creditNote.reason}`,
    createdBy: user.userId,
  });

  // Create audit log (use correct field names)
  await FinancialAuditLog.create({
    action: FINANCIAL_AUDIT_ACTION.CREDIT_NOTE_APPLIED, // closest available action for issuance
    entity: 'CreditNote',
    entityId: creditNote._id,
    actor: user.userId,
    actorRole: user.role,
    after: {
      status: CREDIT_NOTE_STATUS.ISSUED,
      totalAmount: creditNote.totalAmount,
    },
  });

  return creditNote;
}

async function applyCreditNote(id, data, user, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const CreditNote = conn.model('CreditNote');
  const Invoice = conn.model('Invoice');
  const FinancialAuditLog = conn.model('FinancialAuditLog');

  const creditNote = await CreditNote.findById(id);
  if (!creditNote) {
    throw ApiError.notFound('Credit note not found');
  }

  if (creditNote.status !== CREDIT_NOTE_STATUS.ISSUED) {
    throw ApiError.badRequest(
      `Cannot apply credit note with status "${creditNote.status}". Only issued credit notes can be applied.`,
    );
  }

  // Verify amount does not exceed remaining credit
  const remainingCredit = _round(creditNote.totalAmount - creditNote.appliedAmount);
  if (data.amount > remainingCredit) {
    throw ApiError.badRequest(
      `Amount ${data.amount} exceeds remaining credit ${remainingCredit}`,
    );
  }

  // Find target invoice
  const targetInvoice = await Invoice.findById(data.invoiceId);
  if (!targetInvoice) {
    throw ApiError.notFound('Target invoice not found');
  }

  if (targetInvoice.status === INVOICE_STATUS.CANCELLED || targetInvoice.status === INVOICE_STATUS.REFUNDED) {
    throw ApiError.badRequest('Cannot apply credit to a cancelled or refunded invoice');
  }

  // Validate that the credit note's patient matches the target invoice's patient
  if (String(creditNote.patient) !== String(targetInvoice.patient)) {
    throw ApiError.badRequest('Credit note patient does not match target invoice patient');
  }

  // Update credit note
  creditNote.appliedToInvoice = data.invoiceId;
  creditNote.appliedAmount = _round(creditNote.appliedAmount + data.amount);
  creditNote.appliedAt = new Date();

  // If fully applied, mark as 'applied'
  if (creditNote.appliedAmount >= creditNote.totalAmount) {
    creditNote.status = CREDIT_NOTE_STATUS.APPLIED;
  }

  await creditNote.save();

  // Update target invoice atomically: $inc paidAmount (no read-modify-write race)
  const updatedInvoice = await Invoice.findOneAndUpdate(
    { _id: data.invoiceId },
    { $inc: { paidAmount: data.amount } },
    { new: true },
  );

  // Determine and set invoice status based on new paidAmount
  if (updatedInvoice) {
    const newPaidAmount = _round(updatedInvoice.paidAmount);
    const statusUpdate = {};
    if (newPaidAmount >= updatedInvoice.totalAmount) {
      statusUpdate.status = INVOICE_STATUS.PAID;
      statusUpdate.paidAt = new Date();
    } else if (newPaidAmount > 0) {
      statusUpdate.status = INVOICE_STATUS.PARTIALLY_PAID;
    }
    if (Object.keys(statusUpdate).length > 0) {
      await Invoice.updateOne({ _id: data.invoiceId }, { $set: statusUpdate });
    }
  }

  // Create PatientLedger DEBIT entry inside transaction (credit used → increases what patient owes)
  await _createLedgerEntry(conn, {
    patient: creditNote.patient,
    type: LEDGER_ENTRY_TYPE.DEBIT,
    amount: data.amount,
    source: LEDGER_SOURCE.CREDIT_NOTE,
    reference: creditNote._id,
    referenceModel: 'CreditNote',
    description: `Credit note applied to invoice ${targetInvoice._id}`,
    createdBy: user.userId,
  });

  // Create audit log (use correct field names)
  await FinancialAuditLog.create({
    action: FINANCIAL_AUDIT_ACTION.CREDIT_NOTE_APPLIED,
    entity: 'CreditNote',
    entityId: creditNote._id,
    actor: user.userId,
    actorRole: user.role,
    after: {
      targetInvoice: data.invoiceId,
      amountApplied: data.amount,
      remainingCredit: _round(creditNote.totalAmount - creditNote.appliedAmount),
    },
  });

  return creditNote;
}

async function listCreditNotes(query, user, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const CreditNote = conn.model('CreditNote');
  const { skip, limit, page, sort } = parsePagination(query);

  const filter = {};
  if (query.patient) filter.patient = query.patient;
  if (query.status) filter.status = query.status;
  if (query.invoice) filter.invoice = query.invoice;
  if (query.from || query.to) {
    filter.createdAt = {};
    if (query.from) filter.createdAt.$gte = new Date(query.from);
    if (query.to) filter.createdAt.$lte = new Date(query.to);
  }

  // Self-scope: if user only has PAYMENT_READ_OWN, restrict to their credit notes
  if (!_hasFullAccess(user, PERMISSIONS.CREDIT_NOTE_READ)) {
    const patientId = await _getLinkedPatientId(user.userId, conn);
    if (patientId) {
      filter.patient = patientId;
    } else {
      return { items: [], total: 0, page: 1, limit };
    }
  }

  const [items, total] = await Promise.all([
    CreditNote.find(filter)
      .sort(sort).skip(skip).limit(limit)
      .populate('invoice', 'totalAmount status')
      .populate('patient', 'name patientId phone'),
    CreditNote.countDocuments(filter),
  ]);

  return { items, total, page, limit };
}

async function getCreditNoteById(id, user, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const CreditNote = conn.model('CreditNote');

  const creditNote = await CreditNote.findById(id)
    .populate('invoice', 'totalAmount status paidAmount')
    .populate('patient', 'name patientId phone email')
    .populate('approvedBy', 'name')
    .populate('createdBy', 'name');
  if (!creditNote) throw ApiError.notFound('Credit note not found');

  // Self-scope check
  if (!_hasFullAccess(user, PERMISSIONS.CREDIT_NOTE_READ)) {
    const patientId = await _getLinkedPatientId(user.userId, conn);
    if (!patientId || String(creditNote.patient._id || creditNote.patient) !== String(patientId)) {
      throw ApiError.forbidden('You can only view your own credit notes');
    }
  }

  return creditNote;
}

async function getCreditNotesForPatient(patientId, query, user, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const CreditNote = conn.model('CreditNote');
  const { skip, limit, page, sort } = parsePagination(query);

  const filter = { patient: patientId };
  if (query.status) filter.status = query.status;
  if (query.from || query.to) {
    filter.createdAt = {};
    if (query.from) filter.createdAt.$gte = new Date(query.from);
    if (query.to) filter.createdAt.$lte = new Date(query.to);
  }

  const [items, total] = await Promise.all([
    CreditNote.find(filter)
      .sort(sort).skip(skip).limit(limit)
      .populate('invoice', 'totalAmount status')
      .populate('patient', 'name patientId phone'),
    CreditNote.countDocuments(filter),
  ]);

  return { items, total, page, limit };
}

module.exports = {
  createCreditNote,
  issueCreditNote,
  applyCreditNote,
  listCreditNotes,
  getCreditNoteById,
  getCreditNotesForPatient,
};
