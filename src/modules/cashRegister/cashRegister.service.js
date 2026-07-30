'use strict';

const ApiError = require('../../utils/ApiError');
const { parsePagination } = require('../../utils/pagination');
const { getTenantConnection } = require('../../db/tenantConnectionManager');
const {
  CASH_REGISTER_STATUS,
  FINANCIAL_AUDIT_ACTION,
} = require('../../config/constants');

/* ── Internal helpers ──────────────────────────────────────────────── */

/** Round to 2 decimal places for monetary precision */
function _round(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Create a FinancialAuditLog entry.
 */
async function _createAuditLog(conn, { action, entity, entityId, actor, actorRole, before, after, metadata, branch }) {
  const FinancialAuditLog = conn.model('FinancialAuditLog');
  return FinancialAuditLog.create({
    action,
    entity,
    entityId,
    actor,
    actorRole,
    before,
    after,
    metadata,
    branch,
  });
}

/* ── openRegister ──────────────────────────────────────────────────── */

async function openRegister(data, user, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const CashRegister = conn.model('CashRegister');

  // Create CashRegister with status 'open'
  // Unique partial index on { branch, status: 'open' } prevents duplicates atomically.
  // We wrap in try/catch to handle the duplicate key error gracefully.
  let register;
  try {
    register = await CashRegister.create({
      branch: data.branch,
      openingBalance: _round(data.openingBalance),
      openedBy: user.userId,
      openedAt: new Date(),
      status: CASH_REGISTER_STATUS.OPEN,
      notes: data.notes,
    });
  } catch (err) {
    if (err.code === 11000) {
      throw ApiError.conflict('A cash register is already open for this branch');
    }
    throw err;
  }

  // Create FinancialAuditLog (cash_register_opened)
  await _createAuditLog(conn, {
    action: FINANCIAL_AUDIT_ACTION.CASH_REGISTER_OPENED,
    entity: 'CashRegister',
    entityId: register._id,
    actor: user.userId,
    actorRole: user.role,
    after: {
      openingBalance: register.openingBalance,
      status: register.status,
      branch: register.branch,
    },
    branch: register.branch,
  });

  return register;
}

/* ── closeRegister ─────────────────────────────────────────────────── */

async function closeRegister(id, closingBalance, notes, user, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const CashRegister = conn.model('CashRegister');

  // Read register first for calculations and audit snapshot
  const registerSnapshot = await CashRegister.findById(id).lean();
  if (!registerSnapshot) throw ApiError.notFound('Cash register not found');
  if (registerSnapshot.status !== CASH_REGISTER_STATUS.OPEN) {
    throw ApiError.badRequest('Only an open register can be closed');
  }

  // Snapshot before state for audit
  const before = {
    status: registerSnapshot.status,
    openingBalance: registerSnapshot.openingBalance,
    cashIn: registerSnapshot.cashIn,
    cashOut: registerSnapshot.cashOut,
  };

  // Calculate expected balance and variance
  const expectedBalance = _round(registerSnapshot.openingBalance + (registerSnapshot.cashIn || 0) - (registerSnapshot.cashOut || 0));
  const variance = _round(closingBalance - expectedBalance);

  // If Math.abs(variance) > 100 (Rs.100 threshold): managerApproval.required = true
  const managerApprovalRequired = Math.abs(variance) > 100;

  // Atomically close register — CAS: only if still OPEN (prevents double-close race)
  const register = await CashRegister.findOneAndUpdate(
    { _id: id, status: CASH_REGISTER_STATUS.OPEN },
    {
      $set: {
        closingBalance: _round(closingBalance),
        expectedBalance,
        variance,
        status: CASH_REGISTER_STATUS.CLOSED,
        closedBy: user.userId,
        closedAt: new Date(),
        ...(notes ? { notes } : {}),
        ...(managerApprovalRequired ? { 'managerApproval.required': true } : {}),
      },
    },
    { new: true },
  );
  if (!register) {
    throw ApiError.conflict('Register has already been closed by another user');
  }

  // Create FinancialAuditLog (cash_register_closed) with before/after snapshots
  await _createAuditLog(conn, {
    action: FINANCIAL_AUDIT_ACTION.CASH_REGISTER_CLOSED,
    entity: 'CashRegister',
    entityId: register._id,
    actor: user.userId,
    actorRole: user.role,
    before,
    after: {
      status: register.status,
      closingBalance: register.closingBalance,
      expectedBalance: register.expectedBalance,
      variance: register.variance,
      managerApprovalRequired,
    },
    metadata: { transactionCount: register.transactionCount },
    branch: register.branch,
  });

  return register;
}

/* ── reconcileRegister ─────────────────────────────────────────────── */

async function reconcileRegister(id, data, user, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const CashRegister = conn.model('CashRegister');

  // Read snapshot for audit log (lean for performance)
  const snapshot = await CashRegister.findById(id).lean();
  if (!snapshot) throw ApiError.notFound('Cash register not found');
  if (snapshot.status !== CASH_REGISTER_STATUS.CLOSED) {
    throw ApiError.badRequest('Only a closed register can be reconciled');
  }

  const before = { status: snapshot.status, variance: snapshot.variance };

  // Atomic CAS: only succeeds if status is still CLOSED (prevents double-reconcile race)
  const now = new Date();
  const register = await CashRegister.findOneAndUpdate(
    { _id: id, status: CASH_REGISTER_STATUS.CLOSED },
    {
      $set: {
        status: CASH_REGISTER_STATUS.RECONCILED,
        reconciledBy: user.userId,
        reconciledAt: now,
        'managerApproval.approvedBy': user.userId,
        'managerApproval.approvedAt': now,
        'managerApproval.notes': data.notes || '',
      },
    },
    { new: true },
  );
  if (!register) {
    throw ApiError.conflict('Register has already been reconciled by another user');
  }

  // Create audit log with correct reconciliation action
  await _createAuditLog(conn, {
    action: FINANCIAL_AUDIT_ACTION.CASH_REGISTER_RECONCILED,
    entity: 'CashRegister',
    entityId: register._id,
    actor: user.userId,
    actorRole: user.role,
    before,
    after: {
      status: register.status,
      reconciledBy: register.reconciledBy,
      reconciledAt: register.reconciledAt,
    },
    branch: register.branch,
  });

  return register;
}

/* ── getCurrentRegister ────────────────────────────────────────────── */

async function getCurrentRegister(branchId, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const CashRegister = conn.model('CashRegister');

  const register = await CashRegister.findOne({
    branch: branchId,
    status: CASH_REGISTER_STATUS.OPEN,
  })
    .populate('openedBy', 'name');

  return register || null;
}

/* ── listRegisters ─────────────────────────────────────────────────── */

async function listRegisters(query, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const CashRegister = conn.model('CashRegister');
  const { skip, limit, page } = parsePagination(query);

  const filter = {};
  if (query.branch) filter.branch = query.branch;
  if (query.status) filter.status = query.status;
  if (query.from || query.to) {
    filter.openedAt = {};
    if (query.from) filter.openedAt.$gte = new Date(query.from);
    if (query.to) filter.openedAt.$lte = new Date(query.to);
  }

  const sort = { openedAt: -1 };

  const [items, total] = await Promise.all([
    CashRegister.find(filter)
      .sort(sort).skip(skip).limit(limit)
      .populate('openedBy', 'name')
      .populate('closedBy', 'name')
      .populate('reconciledBy', 'name'),
    CashRegister.countDocuments(filter),
  ]);

  return { items, total, page, limit };
}

/* ── getRegisterWithTransactions ───────────────────────────────────── */

async function getRegisterWithTransactions(id, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const CashRegister = conn.model('CashRegister');
  const Payment = conn.model('Payment');

  const register = await CashRegister.findById(id)
    .populate('openedBy', 'name')
    .populate('closedBy', 'name')
    .populate('reconciledBy', 'name');
  if (!register) throw ApiError.notFound('Cash register not found');

  // Find all Payment records where cashRegister = id, sort by createdAt
  const transactions = await Payment.find({ cashRegister: id })
    .sort({ createdAt: 1 })
    .populate('invoice', 'invoiceNumber totalAmount')
    .populate('patient', 'name patientId phone');

  return { register, transactions };
}

module.exports = {
  openRegister,
  closeRegister,
  reconcileRegister,
  getCurrentRegister,
  listRegisters,
  getRegisterWithTransactions,
};
