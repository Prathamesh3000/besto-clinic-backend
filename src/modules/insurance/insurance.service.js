'use strict';

const ApiError = require('../../utils/ApiError');
const { parsePagination } = require('../../utils/pagination');
const { INSURANCE_CLAIM_TRANSITIONS } = require('../../config/constants');
const { getTenantConnection } = require('../../db/tenantConnectionManager');

// ── Insurance Providers ──────────────────────────────────────────────

async function listProviders(query, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const InsuranceProvider = conn.model('InsuranceProvider');
  const { skip, limit, page, sort } = parsePagination(query);

  const filter = {};
  if (query.isActive !== undefined) filter.isActive = query.isActive === 'true';
  if (query.search) {
    filter.name = { $regex: query.search, $options: 'i' };
  }

  const [items, total] = await Promise.all([
    InsuranceProvider.find(filter).sort(sort).skip(skip).limit(limit),
    InsuranceProvider.countDocuments(filter),
  ]);

  return { items, total, page, limit };
}

async function getProviderById(id, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const InsuranceProvider = conn.model('InsuranceProvider');
  const provider = await InsuranceProvider.findById(id);
  if (!provider) throw ApiError.notFound('Insurance provider not found');
  return provider;
}

async function createProvider(data, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const InsuranceProvider = conn.model('InsuranceProvider');
  return InsuranceProvider.create(data);
}

async function updateProvider(id, data, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const InsuranceProvider = conn.model('InsuranceProvider');
  const provider = await InsuranceProvider.findByIdAndUpdate(id, data, {
    new: true,
    runValidators: true,
  });
  if (!provider) throw ApiError.notFound('Insurance provider not found');
  return provider;
}

async function deleteProvider(id, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const InsuranceProvider = conn.model('InsuranceProvider');
  const provider = await InsuranceProvider.findByIdAndUpdate(
    id,
    { deletedAt: new Date() },
    { new: true },
  );
  if (!provider) throw ApiError.notFound('Insurance provider not found');
  return provider;
}

// ── Insurance Claims ─────────────────────────────────────────────────

async function listClaims(query, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const InsuranceClaim = conn.model('InsuranceClaim');
  const { skip, limit, page, sort } = parsePagination(query);

  const filter = {};
  if (query.patient) filter.patient = query.patient;
  if (query.status) filter.status = query.status;
  if (query.provider) filter.provider = query.provider;

  const [items, total] = await Promise.all([
    InsuranceClaim.find(filter)
      .sort(sort).skip(skip).limit(limit)
      .populate('patient', 'name')
      .populate('provider', 'name')
      .populate('invoice'),
    InsuranceClaim.countDocuments(filter),
  ]);

  return { items, total, page, limit };
}

async function getClaimById(id, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const InsuranceClaim = conn.model('InsuranceClaim');
  const claim = await InsuranceClaim.findById(id)
    .populate('patient')
    .populate('provider')
    .populate('invoice')
    .populate('appointment');
  if (!claim) throw ApiError.notFound('Insurance claim not found');
  return claim;
}

async function createClaim(data, userId, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);

  // Validate patient exists
  const Patient = conn.model('Patient');
  const patient = await Patient.findById(data.patient);
  if (!patient) throw ApiError.notFound('Patient not found');

  // Validate provider exists
  const InsuranceProvider = conn.model('InsuranceProvider');
  const provider = await InsuranceProvider.findById(data.provider);
  if (!provider) throw ApiError.notFound('Insurance provider not found');

  data.createdBy = userId;

  const InsuranceClaim = conn.model('InsuranceClaim');
  return InsuranceClaim.create(data);
}

async function updateClaimStatus(id, statusData, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const InsuranceClaim = conn.model('InsuranceClaim');

  const claim = await InsuranceClaim.findById(id);
  if (!claim) throw ApiError.notFound('Insurance claim not found');

  // Validate transition
  const allowed = INSURANCE_CLAIM_TRANSITIONS[claim.status];
  if (!allowed || !allowed.includes(statusData.status)) {
    throw ApiError.badRequest(
      `Cannot transition from "${claim.status}" to "${statusData.status}"`,
    );
  }

  // Update status
  claim.status = statusData.status;

  // Update status-specific fields
  if (statusData.status === 'submitted') {
    claim.submittedAt = new Date();
  }
  if (statusData.status === 'approved') {
    claim.approvedAt = new Date();
    if (statusData.approvedAmount !== undefined) {
      claim.approvedAmount = statusData.approvedAmount;
    }
  }
  if (statusData.status === 'rejected') {
    if (statusData.rejectionReason) {
      claim.rejectionReason = statusData.rejectionReason;
    }
  }
  if (statusData.status === 'settled') {
    claim.settledAt = new Date();
    if (statusData.settledAmount !== undefined) {
      claim.settledAmount = statusData.settledAmount;
    }
  }

  if (statusData.notes) {
    claim.notes = statusData.notes;
  }

  await claim.save();
  return claim;
}

async function deleteClaim(id, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const InsuranceClaim = conn.model('InsuranceClaim');
  const claim = await InsuranceClaim.findByIdAndUpdate(
    id,
    { deletedAt: new Date() },
    { new: true },
  );
  if (!claim) throw ApiError.notFound('Insurance claim not found');
  return claim;
}

/**
 * Record pre-authorization for a claim.
 */
async function recordPreAuthorization(claimId, data, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const InsuranceClaim = conn.model('InsuranceClaim');
  const claim = await InsuranceClaim.findById(claimId);
  if (!claim) throw ApiError.notFound('Insurance claim not found');

  claim.preAuthNumber = data.preAuthNumber;
  claim.preAuthAmount = data.preAuthAmount;
  claim.preAuthStatus = data.preAuthStatus || 'pending';
  await claim.save();
  return claim;
}

/**
 * Calculate co-payment for a claim.
 * Co-pay = percentage of approved amount that patient must pay.
 */
async function calculateCoPayment(claimId, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const InsuranceClaim = conn.model('InsuranceClaim');
  const claim = await InsuranceClaim.findById(claimId).populate('provider');
  if (!claim) throw ApiError.notFound('Insurance claim not found');

  const approved = claim.approvedAmount || claim.claimAmount;
  const coPayPercent = claim.coPayPercent || claim.provider?.plans?.[0]?.copayPercent || 0;
  const coPayAmount = Math.round((coPayPercent / 100) * approved * 100) / 100;
  const patientResponsibility = coPayAmount;

  claim.coPayPercent = coPayPercent;
  claim.coPayAmount = coPayAmount;
  claim.patientResponsibility = patientResponsibility;
  await claim.save();

  return { coPayPercent, coPayAmount, patientResponsibility, approvedAmount: approved };
}

/**
 * Reconcile an insurance settlement.
 */
async function reconcileSettlement(claimId, data, user, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const InsuranceClaim = conn.model('InsuranceClaim');
  const FinancialAuditLog = conn.model('FinancialAuditLog');

  const claim = await InsuranceClaim.findById(claimId);
  if (!claim) throw ApiError.notFound('Insurance claim not found');

  const before = claim.toJSON();
  claim.settledAmount = data.settledAmount || claim.approvedAmount;
  claim.settledAt = new Date();
  claim.reconciledAt = new Date();
  claim.reconciledBy = user.userId;
  claim.status = 'settled';
  if (data.notes) claim.notes = data.notes;
  await claim.save();

  await FinancialAuditLog.create({
    action: 'insurance_claim_updated',
    entity: 'InsuranceClaim',
    entityId: claim._id,
    actor: user.userId,
    actorRole: user.role,
    before,
    after: claim.toJSON(),
  });

  return claim;
}

module.exports = {
  listProviders,
  getProviderById,
  createProvider,
  updateProvider,
  deleteProvider,
  listClaims,
  getClaimById,
  createClaim,
  updateClaimStatus,
  deleteClaim,
  recordPreAuthorization,
  calculateCoPayment,
  reconcileSettlement,
};
