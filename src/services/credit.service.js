'use strict';

/**
 * Credit Service — manages per-clinic credit wallets for the job portal.
 *
 * All operations are atomic (findOneAndUpdate with $inc) to prevent race conditions.
 * Every movement creates an immutable CreditTransaction record with a running balance snapshot.
 */

const CreditWallet = require('../models/platform/CreditWallet');
const CreditTransaction = require('../models/platform/CreditTransaction');
const ApiError = require('../utils/ApiError');
const { parsePagination } = require('../utils/pagination');
const {
  CREDIT_TRANSACTION_TYPE,
  CREDIT_ACTION,
  CREDIT_PACKS,
} = require('../config/constants');

// ─── Wallet Operations ──────────────────────────────────

/**
 * Get or create a credit wallet for a clinic.
 * @param {string} clinicId — Clinic ObjectId
 * @returns {Promise<CreditWallet>}
 */
async function getOrCreateWallet(clinicId) {
  let wallet = await CreditWallet.findOne({ clinic: clinicId });
  if (!wallet) {
    wallet = await CreditWallet.create({ clinic: clinicId });
  }
  return wallet;
}

/**
 * Get current credit balance for a clinic.
 * @param {string} clinicId
 * @returns {Promise<{ balance, totalPurchased, totalConsumed }>}
 */
async function getBalance(clinicId) {
  const wallet = await getOrCreateWallet(clinicId);
  return {
    balance: wallet.balance,
    totalPurchased: wallet.totalPurchased,
    totalConsumed: wallet.totalConsumed,
    lastTopUpAt: wallet.lastTopUpAt,
    lastDeductionAt: wallet.lastDeductionAt,
  };
}

// ─── Credit Movements ───────────────────────────────────

/**
 * Deduct credits from a clinic's wallet.
 * Throws 403 if insufficient balance.
 *
 * @param {string} clinicId
 * @param {number} amount — positive number of credits to deduct
 * @param {string} action — CREDIT_ACTION value
 * @param {object} [reference] — { jobPosting, razorpayPaymentId, razorpayOrderId }
 * @param {string} performedBy — userId or 'system'
 * @param {string} [description]
 * @returns {Promise<CreditTransaction>}
 */
async function deductCredits(clinicId, amount, action, reference = {}, performedBy, description) {
  if (amount <= 0) throw ApiError.badRequest('Deduction amount must be positive');

  const wallet = await getOrCreateWallet(clinicId);
  if (wallet.balance < amount) {
    throw ApiError.forbidden('Insufficient credits', {
      required: amount,
      available: wallet.balance,
    });
  }

  // Atomic deduction
  const updated = await CreditWallet.findOneAndUpdate(
    { _id: wallet._id, balance: { $gte: amount } },
    {
      $inc: { balance: -amount, totalConsumed: amount },
      $set: { lastDeductionAt: new Date() },
    },
    { new: true },
  );

  if (!updated) {
    throw ApiError.forbidden('Insufficient credits (concurrent deduction)');
  }

  const transaction = await CreditTransaction.create({
    wallet: wallet._id,
    clinic: clinicId,
    type: CREDIT_TRANSACTION_TYPE.DEDUCTION,
    amount: -amount,
    balanceAfter: updated.balance,
    action,
    reference,
    description: description || `Deducted ${amount} credit(s) — ${action}`,
    performedBy,
  });

  return transaction;
}

/**
 * Add credits to a clinic's wallet.
 *
 * @param {string} clinicId
 * @param {number} amount — positive number of credits to add
 * @param {string} type — CREDIT_TRANSACTION_TYPE value
 * @param {string} action — CREDIT_ACTION value
 * @param {object} [reference]
 * @param {string} performedBy
 * @param {string} [description]
 * @returns {Promise<CreditTransaction>}
 */
async function addCredits(clinicId, amount, type, action, reference = {}, performedBy, description) {
  if (amount <= 0) throw ApiError.badRequest('Credit amount must be positive');

  const wallet = await getOrCreateWallet(clinicId);

  const updated = await CreditWallet.findByIdAndUpdate(
    wallet._id,
    {
      $inc: { balance: amount, totalPurchased: amount },
      $set: { lastTopUpAt: new Date() },
    },
    { new: true },
  );

  const transaction = await CreditTransaction.create({
    wallet: wallet._id,
    clinic: clinicId,
    type,
    amount,
    balanceAfter: updated.balance,
    action,
    reference,
    description: description || `Added ${amount} credit(s) — ${action}`,
    performedBy,
  });

  return transaction;
}

// ─── Plan Grant ─────────────────────────────────────────

/**
 * Grant monthly plan credits to a clinic.
 * Called by the monthly cron job.
 */
async function grantMonthlyCredits(clinicId, amount) {
  if (amount <= 0) return null;

  return addCredits(
    clinicId,
    amount,
    CREDIT_TRANSACTION_TYPE.PLAN_GRANT,
    CREDIT_ACTION.PLAN_MONTHLY_GRANT,
    {},
    'system',
    `Monthly plan grant — ${amount} credits`,
  );
}

// ─── Credit Pack Purchase ───────────────────────────────

/**
 * Validate a credit pack and return its details.
 * @param {string} packId
 * @returns {object} pack
 */
function getCreditPack(packId) {
  const pack = CREDIT_PACKS.find((p) => p.id === packId);
  if (!pack) throw ApiError.badRequest('Invalid credit pack');
  return pack;
}

/**
 * Complete a credit pack purchase after Razorpay payment verification.
 */
async function purchaseCredits(clinicId, packId, razorpayPaymentId, razorpayOrderId) {
  const pack = getCreditPack(packId);

  return addCredits(
    clinicId,
    pack.credits,
    CREDIT_TRANSACTION_TYPE.PURCHASE,
    CREDIT_ACTION.CREDIT_PACK_PURCHASE,
    { razorpayPaymentId, razorpayOrderId },
    'system',
    `Purchased ${pack.label}`,
  );
}

/**
 * Refund credits back to a clinic (e.g. when closing a job early).
 */
async function refundCredits(clinicId, amount, jobPostingId, performedBy, description) {
  return addCredits(
    clinicId,
    amount,
    CREDIT_TRANSACTION_TYPE.REFUND,
    CREDIT_ACTION.JOB_POST_REFUND,
    { jobPosting: jobPostingId },
    performedBy,
    description || `Refunded ${amount} credit(s)`,
  );
}

/**
 * Admin adjustment (add or subtract credits).
 */
async function adminAdjustCredits(clinicId, amount, performedBy, description) {
  if (amount > 0) {
    return addCredits(
      clinicId,
      amount,
      CREDIT_TRANSACTION_TYPE.PLAN_GRANT,
      CREDIT_ACTION.ADMIN_ADJUSTMENT,
      {},
      performedBy,
      description || `Admin adjustment: +${amount} credits`,
    );
  }

  return deductCredits(
    clinicId,
    Math.abs(amount),
    CREDIT_ACTION.ADMIN_ADJUSTMENT,
    {},
    performedBy,
    description || `Admin adjustment: ${amount} credits`,
  );
}

// ─── Transaction History ────────────────────────────────

/**
 * Get paginated transaction history for a clinic.
 */
async function getTransactionHistory(clinicId, query = {}) {
  const { skip, limit, page } = parsePagination(query);

  const filter = { clinic: clinicId };
  if (query.type) filter.type = query.type;

  const [items, total] = await Promise.all([
    CreditTransaction.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    CreditTransaction.countDocuments(filter),
  ]);

  return { items, total, page, limit };
}

module.exports = {
  getOrCreateWallet,
  getBalance,
  deductCredits,
  addCredits,
  grantMonthlyCredits,
  getCreditPack,
  purchaseCredits,
  refundCredits,
  adminAdjustCredits,
  getTransactionHistory,
};
