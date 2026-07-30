'use strict';

/**
 * Tenant Service — full lifecycle management for tenants (clinics).
 *
 * All operations are performed on the platform DB only.
 * No tenant DB access happens in this module.
 *
 * Capabilities:
 *  - Create tenant with SuperAdmin + auto-generated dbUri
 *  - Activate / Suspend / Cancel / Delete tenants (state machine)
 *  - Assign or reassign SuperAdmin
 *  - View tenant usage (doctors, staff, storage, SMS)
 *  - Track subscription expiry and approaching limits
 *  - Full audit trail via TenantAuditLog
 */

const mongoose = require('mongoose');
const crypto = require('crypto');
const ApiError = require('../../utils/ApiError');
const { parsePagination } = require('../../utils/pagination');
const Clinic = require('../../models/platform/Clinic');
const Subscription = require('../../models/platform/Subscription');
const Plan = require('../../models/platform/Plan');
const TenantAuditLog = require('../../models/platform/TenantAuditLog');
const { TENANT_STATUS, SUBSCRIPTION_STATUS, SUBSCRIPTION_STATUS_LEGACY } = require('../../config/constants');
const { invalidateSubscriptionCache } = require('../../middleware/featureGuard');
const logger = require('../../utils/logger');

// ─── Helpers ────────────────────────────────────────────

/**
 * Build the MongoDB URI for a new tenant database.
 *
 * Tenants live on the SAME cluster as the platform DB, in their own database.
 * The URI is therefore derived from PLATFORM_DB_URI so it inherits the host,
 * credentials and connection options (mongodb+srv, appName, replica set, …).
 *
 * This previously defaulted to `mongodb://localhost:27017/...` whenever
 * TENANT_DB_HOST was unset — which is every deployment that talks to Atlas.
 * Every clinic onboarded through the app therefore got an unreachable URI and
 * provisioning died at the creating_db step with ECONNREFUSED 127.0.0.1:27017,
 * leaving the clinic stuck in `pending`.
 *
 * Database names use underscores (bestoclinic_my_clinic), matching the tenants
 * created by scripts/create-tenant.js and scripts/seed-platform-full.js.
 *
 * TENANT_DB_HOST still overrides, for deployments that put tenants on a
 * separate cluster.
 */
function _generateDbUri(slug) {
  const dbPrefix = process.env.TENANT_DB_PREFIX || 'bestoclinic';
  const dbName = `${dbPrefix}_${slug.replace(/-/g, '_')}`;

  // Explicit override — separate tenant cluster.
  if (process.env.TENANT_DB_HOST) {
    return `mongodb://${process.env.TENANT_DB_HOST}/${dbName}`;
  }

  const platformUri = process.env.PLATFORM_DB_URI;
  if (!platformUri) {
    throw new Error('Cannot derive tenant DB URI: PLATFORM_DB_URI is not set');
  }

  // Swap only the database path segment, preserving credentials and query opts.
  //   mongodb+srv://u:p@host/besto_clinic?appName=X
  //     -> mongodb+srv://u:p@host/bestoclinic_my_clinic?appName=X
  const [base, query] = platformUri.split('?');
  const withoutDb = base.replace(/\/[^/]*$/, '');
  return `${withoutDb}/${dbName}${query ? `?${query}` : ''}`;
}

/**
 * Generate a temporary password for SuperAdmin provisioning.
 * In production this would be sent via email, not returned in API.
 */
function _generateTempPassword() {
  return crypto.randomBytes(12).toString('base64url');
}

/**
 * Log an audit entry. Fire-and-forget — never blocks the caller.
 */
async function _audit(clinic, action, performedBy, opts = {}) {
  try {
    await TenantAuditLog.create({
      clinic: clinic._id,
      clinicSlug: clinic.slug,
      action,
      performedBy: {
        userId: performedBy.userId || performedBy,
        role: performedBy.role || 'product_owner',
      },
      reason: opts.reason || null,
      before: opts.before || null,
      after: opts.after || null,
      metadata: opts.metadata || null,
    });
  } catch (err) {
    logger.error('Failed to write tenant audit log: %s', err.message);
  }
}

// ─── Create Tenant ──────────────────────────────────────

/**
 * Create a new tenant (clinic) with SuperAdmin assignment.
 *
 * Flow:
 *  1. Validate slug uniqueness
 *  2. Generate tenant database URI
 *  3. Create Clinic document (status: pending)
 *  4. Assign SuperAdmin metadata
 *  5. Optionally create initial subscription
 *  6. Log audit entry
 *
 * @param {object} data — tenant creation payload
 * @param {object} performedBy — { userId, role } of the platform admin
 * @returns {object} — { tenant, superAdmin: { tempPassword } }
 */
async function createTenant(data, performedBy) {
  // 1. Check slug uniqueness (including soft-deleted clinics to prevent reuse)
  const existing = await Clinic.findOne({ slug: data.slug }).setOptions({ skipSoftDelete: true });
  if (existing) {
    throw ApiError.conflict(`Tenant with slug "${data.slug}" already exists`);
  }

  // 2. Generate DB URI
  const dbUri = _generateDbUri(data.slug);

  // 3. Resolve plan if provided
  let plan = null;
  if (data.plan) {
    plan = await Plan.findOne({ slug: data.plan, isActive: true });
    if (!plan) throw ApiError.notFound(`Plan "${data.plan}" not found or inactive`);
  }

  // 4. Build SuperAdmin metadata
  const tempPassword = _generateTempPassword();
  const superAdmin = {
    name: data.superAdmin.name,
    email: data.superAdmin.email,
    phone: data.superAdmin.phone || null,
    provisionedAt: new Date(),
  };

  // 5. Create clinic record
  const clinic = await Clinic.create({
    name: data.name,
    slug: data.slug,
    email: data.email,
    phone: data.phone,
    address: data.address || {},
    logo: data.logo || null,
    dbUri,
    status: TENANT_STATUS.PENDING,
    isActive: false, // not active until explicitly activated
    superAdmin,
    subscription: {
      plan: plan ? plan.slug : 'free',
      planRef: plan ? plan._id : undefined,
      status: SUBSCRIPTION_STATUS.TRIAL,
    },
    features: plan ? plan.features : undefined,
    createdBy: mongoose.isValidObjectId(performedBy.userId) ? performedBy.userId : undefined,
  });

  // 6. Audit
  await _audit(clinic, 'tenant_created', performedBy, {
    after: { status: clinic.status, plan: clinic.subscription.plan },
    metadata: { superAdminEmail: superAdmin.email },
  });

  logger.info('Tenant created: %s (slug: %s)', clinic.name, clinic.slug);

  // Enqueue background provisioning
  const provisionService = require('../../services/tenantProvision.service');
  const { provisioningQueue } = require('../../jobs/queues');

  const provStatus = await provisionService.initiateProvisioning(
    clinic._id.toString(),
    clinic.slug,
    performedBy,
  );

  await provisioningQueue.add('provision-tenant', {
    provisioningId: provStatus._id.toString(),
    action: 'provision',
  }, {
    jobId: `provision_${clinic.slug}_${provStatus.idempotencyKey}`,
  });

  logger.info('Provisioning enqueued for %s (provisioningId: %s)', clinic.slug, provStatus._id);

  return {
    tenant: clinic,
    superAdmin: {
      email: superAdmin.email,
    },
    provisioningId: provStatus._id,
  };
}

// ─── Assign SuperAdmin ──────────────────────────────────

/**
 * Assign or reassign a SuperAdmin to a tenant.
 * This records the admin's metadata on the Clinic doc. The actual user
 * provisioning in the tenant DB is handled by a separate onboarding service.
 */
async function assignSuperAdmin(slug, adminData, performedBy) {
  const clinic = await Clinic.findOne({ slug });
  if (!clinic) throw ApiError.notFound('Tenant not found');

  const before = { superAdmin: { ...clinic.superAdmin?.toObject?.() || clinic.superAdmin } };

  clinic.superAdmin = {
    userId: adminData.userId || clinic.superAdmin?.userId,
    name: adminData.name,
    email: adminData.email,
    phone: adminData.phone || null,
    provisionedAt: new Date(),
  };

  await clinic.save();

  await _audit(clinic, 'superadmin_assigned', performedBy, {
    before,
    after: { superAdmin: clinic.superAdmin },
  });

  logger.info('SuperAdmin assigned to %s: %s', slug, adminData.email);

  return clinic;
}

// ─── Activate Tenant ────────────────────────────────────

/**
 * Activate a pending or suspended tenant.
 * Validates that SuperAdmin is assigned before activation.
 */
async function activateTenant(slug, performedBy) {
  const clinic = await Clinic.findOne({ slug });
  if (!clinic) throw ApiError.notFound('Tenant not found');

  // Guard: SuperAdmin must be assigned before activation
  if (!clinic.superAdmin?.email) {
    throw ApiError.badRequest('Cannot activate tenant without a SuperAdmin. Assign one first.');
  }

  const before = { status: clinic.status, isActive: clinic.isActive };

  // Use state machine transition
  clinic.transitionStatus(TENANT_STATUS.ACTIVE);
  await clinic.save();

  // Immediately invalidate Redis cache so subsequent requests see new status
  await invalidateSubscriptionCache(slug);

  const action = before.status === TENANT_STATUS.SUSPENDED ? 'tenant_reactivated' : 'tenant_activated';

  await _audit(clinic, action, performedBy, {
    before,
    after: { status: clinic.status, isActive: clinic.isActive, activatedAt: clinic.activatedAt },
  });

  logger.info('Tenant activated: %s (from: %s)', slug, before.status);

  return clinic;
}

// ─── Suspend Tenant ─────────────────────────────────────

/**
 * Suspend an active tenant. Requires a reason.
 * The tenant's isActive flag is set to false, blocking access.
 */
async function suspendTenant(slug, reason, performedBy) {
  const clinic = await Clinic.findOne({ slug });
  if (!clinic) throw ApiError.notFound('Tenant not found');

  if (!reason || !reason.trim()) {
    throw ApiError.badRequest('Suspension reason is required');
  }

  const before = { status: clinic.status, isActive: clinic.isActive };

  clinic.transitionStatus(TENANT_STATUS.SUSPENDED, reason);
  await clinic.save();

  // Immediately invalidate Redis cache so subsequent requests are blocked
  await invalidateSubscriptionCache(slug);

  await _audit(clinic, 'tenant_suspended', performedBy, {
    reason,
    before,
    after: { status: clinic.status, isActive: clinic.isActive, suspendedAt: clinic.suspendedAt },
  });

  logger.warn('Tenant suspended: %s (reason: %s)', slug, reason);

  return clinic;
}

// ─── Cancel / Delete Tenant ─────────────────────────────

/**
 * Cancel (soft-delete) a tenant. This is a terminal state.
 * Sets deletedAt for the soft-delete pre-find hook, making the
 * tenant invisible to normal queries.
 *
 * Hard-delete is intentionally not supported — tenant records are
 * always preserved for audit and data integrity purposes.
 */
async function deleteTenant(slug, reason, performedBy) {
  const clinic = await Clinic.findOne({ slug });
  if (!clinic) throw ApiError.notFound('Tenant not found');

  const before = { status: clinic.status, isActive: clinic.isActive };

  // Soft delete via state machine
  clinic.transitionStatus(TENANT_STATUS.CANCELLED, reason);
  await clinic.save();

  // Immediately invalidate Redis cache
  await invalidateSubscriptionCache(slug);

  await _audit(clinic, 'tenant_cancelled', performedBy, {
    reason,
    before,
    after: { status: clinic.status, isActive: clinic.isActive, cancelledAt: clinic.cancelledAt },
  });

  logger.info('Tenant cancelled: %s (reason: %s)', slug, reason);

  return { deleted: true, tenant: clinic };
}

// ─── View Tenant Usage ──────────────────────────────────

/**
 * Get comprehensive usage metrics for a tenant.
 * Combines clinic.usage, clinic.features (limits), and subscription data.
 */
async function getTenantUsage(slug) {
  const clinic = await Clinic.findOne({ slug });
  if (!clinic) throw ApiError.notFound('Tenant not found');

  // Get active subscription for additional metrics
  const subscription = await Subscription.findOne({
    clinic: clinic._id,
    status: {
      $in: [
        SUBSCRIPTION_STATUS.ACTIVE,
        SUBSCRIPTION_STATUS.TRIAL,
        SUBSCRIPTION_STATUS.GRACE_PERIOD,
        SUBSCRIPTION_STATUS_LEGACY.PAST_DUE,
      ],
    },
  }).sort({ createdAt: -1 });

  const usage = clinic.usage || {};
  const limits = clinic.features || {};

  return {
    tenant: {
      slug: clinic.slug,
      name: clinic.name,
      status: clinic.status,
    },
    usage: {
      doctors: { used: usage.doctorsCount || 0, limit: limits.maxDoctors || 0 },
      staff: { used: usage.staffCount || 0, limit: limits.maxStaff || 0 },
      branches: { used: usage.branchesCount || 0, limit: limits.maxBranches || 0 },
      patients: { count: usage.patientsCount || 0 },
      storage: {
        usedMB: usage.storageUsedMB || 0,
        limitMB: limits.maxStorageMB || 0,
        usagePercent: limits.maxStorageMB
          ? Math.round(((usage.storageUsedMB || 0) / limits.maxStorageMB) * 100)
          : 0,
      },
      sms: {
        usedThisMonth: usage.smsUsedThisMonth || 0,
        limitPerMonth: limits.maxSmsPerMonth || 0,
      },
      lastSyncedAt: usage.lastSyncedAt || null,
    },
    subscription: subscription
      ? {
        plan: subscription.plan,
        status: subscription.status,
        billingCycle: subscription.billingCycle,
        amount: subscription.amount,
        currentPeriodEnd: subscription.currentPeriodEnd,
        trialEnd: subscription.trialEnd,
      }
      : null,
  };
}

// ─── Track Subscription Expiry ──────────────────────────

/**
 * Get subscription expiry info for a tenant.
 * Includes days remaining, grace period status, and warnings.
 */
async function getSubscriptionExpiry(slug) {
  const clinic = await Clinic.findOne({ slug });
  if (!clinic) throw ApiError.notFound('Tenant not found');

  const subscription = await Subscription.findOne({
    clinic: clinic._id,
    status: {
      $in: [
        SUBSCRIPTION_STATUS.ACTIVE,
        SUBSCRIPTION_STATUS.TRIAL,
        SUBSCRIPTION_STATUS.GRACE_PERIOD,
        SUBSCRIPTION_STATUS_LEGACY.PAST_DUE,
      ],
    },
  }).sort({ createdAt: -1 });

  if (!subscription) {
    return {
      slug: clinic.slug,
      hasActiveSubscription: false,
      message: 'No active subscription found',
    };
  }

  const now = new Date();
  const isTrialing = subscription.status === SUBSCRIPTION_STATUS.TRIAL;
  const endDate = isTrialing ? subscription.trialEnd : subscription.currentPeriodEnd;

  const msRemaining = endDate ? endDate.getTime() - now.getTime() : 0;
  const daysRemaining = Math.max(0, Math.ceil(msRemaining / (24 * 60 * 60 * 1000)));

  let warning = null;
  if (daysRemaining <= 0) {
    warning = isTrialing ? 'Trial has expired' : 'Subscription period has ended';
  } else if (daysRemaining <= 3) {
    warning = `${isTrialing ? 'Trial' : 'Subscription'} expires in ${daysRemaining} day(s)`;
  } else if (daysRemaining <= 7) {
    warning = `${isTrialing ? 'Trial' : 'Subscription'} expires in ${daysRemaining} days`;
  }

  return {
    slug: clinic.slug,
    hasActiveSubscription: true,
    plan: subscription.plan,
    status: subscription.status,
    billingCycle: subscription.billingCycle,
    isTrialing,
    periodEnd: endDate,
    daysRemaining,
    warning,
    gracePeriodEndsAt: subscription.gracePeriodEndsAt || null,
    isInGracePeriod: subscription.status === SUBSCRIPTION_STATUS.GRACE_PERIOD ||
      subscription.status === SUBSCRIPTION_STATUS_LEGACY.PAST_DUE,
  };
}

// ─── Update Usage (called by sync jobs / webhooks) ──────

/**
 * Update denormalised usage counters on the Clinic document.
 * Validates against feature limits and returns warnings.
 */
async function syncTenantUsage(slug, usageData, performedBy) {
  const clinic = await Clinic.findOne({ slug });
  if (!clinic) throw ApiError.notFound('Tenant not found');

  const before = { usage: { ...clinic.usage?.toObject?.() || clinic.usage } };

  const update = { 'usage.lastSyncedAt': new Date() };
  if (usageData.doctorsCount !== undefined) update['usage.doctorsCount'] = usageData.doctorsCount;
  if (usageData.staffCount !== undefined) update['usage.staffCount'] = usageData.staffCount;
  if (usageData.branchesCount !== undefined) update['usage.branchesCount'] = usageData.branchesCount;
  if (usageData.patientsCount !== undefined) update['usage.patientsCount'] = usageData.patientsCount;
  if (usageData.storageUsedMB !== undefined) update['usage.storageUsedMB'] = usageData.storageUsedMB;
  if (usageData.smsUsedThisMonth !== undefined) update['usage.smsUsedThisMonth'] = usageData.smsUsedThisMonth;

  const updated = await Clinic.findOneAndUpdate({ slug }, { $set: update }, { new: true });

  // Check for limit breaches
  const warnings = [];
  const limits = updated.features;
  const u = updated.usage;

  if (limits.maxDoctors > 0 && u.doctorsCount >= limits.maxDoctors) {
    warnings.push(`Doctor limit reached: ${u.doctorsCount}/${limits.maxDoctors}`);
  }
  if (limits.maxStaff > 0 && u.staffCount >= limits.maxStaff) {
    warnings.push(`Staff limit reached: ${u.staffCount}/${limits.maxStaff}`);
  }
  if (limits.maxBranches > 0 && u.branchesCount >= limits.maxBranches) {
    warnings.push(`Branch limit reached: ${u.branchesCount}/${limits.maxBranches}`);
  }
  if (limits.maxStorageMB > 0 && u.storageUsedMB >= limits.maxStorageMB * 0.9) {
    const pct = Math.round((u.storageUsedMB / limits.maxStorageMB) * 100);
    warnings.push(`Storage at ${pct}%: ${u.storageUsedMB}MB / ${limits.maxStorageMB}MB`);
  }
  if (limits.maxSmsPerMonth > 0 && u.smsUsedThisMonth >= limits.maxSmsPerMonth) {
    warnings.push(`SMS limit reached: ${u.smsUsedThisMonth}/${limits.maxSmsPerMonth}`);
  }

  if (performedBy) {
    await _audit(updated, 'usage_synced', performedBy, {
      before,
      after: { usage: updated.usage },
      metadata: { warnings },
    });
  }

  return { tenant: updated, warnings };
}

// ─── List / Query ───────────────────────────────────────

/**
 * List tenants with filtering by tenant status, subscription status,
 * plan, search, and isActive.
 */
async function listTenants(query) {
  const { skip, limit, page, sort } = parsePagination(query);
  // Explicitly exclude soft-deleted records so countDocuments matches find().
  // Mongoose pre(/^find/) middleware adds deletedAt: null to find() but NOT to
  // countDocuments(), causing pagination totals to include deleted records.
  const filter = { deletedAt: null };

  // Tenant-level status filter
  if (query.tenantStatus) filter.status = query.tenantStatus;
  // Subscription-level status filter
  if (query.subscriptionStatus) filter['subscription.status'] = query.subscriptionStatus;
  if (query.plan) filter['subscription.plan'] = query.plan;
  if (query.isActive !== undefined) filter.isActive = query.isActive === 'true';

  if (query.search) {
    const escaped = query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.$or = [
      { name: { $regex: escaped, $options: 'i' } },
      { slug: { $regex: escaped, $options: 'i' } },
      { email: { $regex: escaped, $options: 'i' } },
    ];
  }

  // Expiring soon filter
  if (query.expiringSoon === 'true') {
    const cutoff = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    filter['subscription.currentPeriodEnd'] = { $lte: cutoff, $gte: new Date() };
  }

  const [items, total] = await Promise.all([
    Clinic.find(filter).sort(sort).skip(skip).limit(limit),
    Clinic.countDocuments(filter),
  ]);

  return { items, total, page, limit };
}

/**
 * Get a single tenant by slug.
 */
async function getTenantBySlug(slug) {
  const clinic = await Clinic.findOne({ slug });
  if (!clinic) throw ApiError.notFound('Tenant not found');
  return clinic;
}

/**
 * Update basic tenant info (name, email, phone, address, etc.).
 * Prevents changing slug, dbUri, or status (use dedicated actions instead).
 */
async function updateTenant(slug, data, performedBy) {
  // Prevent changing protected fields
  delete data.slug;
  delete data.dbUri;
  delete data.status;
  delete data.superAdmin;
  delete data.subscription;
  delete data.usage;

  const clinic = await Clinic.findOne({ slug });
  if (!clinic) throw ApiError.notFound('Tenant not found');

  const before = { name: clinic.name, email: clinic.email, phone: clinic.phone };

  const updated = await Clinic.findOneAndUpdate({ slug }, data, {
    new: true,
    runValidators: true,
  });

  if (performedBy) {
    await _audit(updated, 'tenant_updated', performedBy, {
      before,
      after: { name: updated.name, email: updated.email, phone: updated.phone },
    });
  }

  return updated;
}

/**
 * Update feature overrides for a tenant.
 */
async function updateTenantFeatures(slug, features, performedBy) {
  const clinic = await Clinic.findOne({ slug });
  if (!clinic) throw ApiError.notFound('Tenant not found');

  const before = { features: { ...clinic.features?.toObject?.() || clinic.features } };

  const updated = await Clinic.findOneAndUpdate(
    { slug },
    { features },
    { new: true, runValidators: true },
  );

  if (performedBy) {
    await _audit(updated, 'features_updated', performedBy, {
      before,
      after: { features: updated.features },
    });
  }

  return updated;
}

// ─── Audit Trail Query ──────────────────────────────────

/**
 * Get the audit trail for a specific tenant.
 */
async function getTenantAuditLog(slug, query) {
  const clinic = await Clinic.findOne({ slug });
  if (!clinic) throw ApiError.notFound('Tenant not found');

  const { skip, limit, page } = parsePagination(query);
  const filter = { clinic: clinic._id };

  if (query.action) filter.action = query.action;

  const [items, total] = await Promise.all([
    TenantAuditLog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    TenantAuditLog.countDocuments(filter),
  ]);

  return { items, total, page, limit };
}

module.exports = {
  createTenant,
  assignSuperAdmin,
  activateTenant,
  suspendTenant,
  deleteTenant,
  getTenantUsage,
  getSubscriptionExpiry,
  syncTenantUsage,
  listTenants,
  getTenantBySlug,
  updateTenant,
  updateTenantFeatures,
  getTenantAuditLog,
};
