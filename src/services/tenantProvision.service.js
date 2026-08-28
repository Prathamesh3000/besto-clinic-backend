'use strict';

/**
 * Tenant Provisioning Service — idempotent, step-by-step provisioning pipeline.
 *
 * Flow:  pending → creating_db → seeding → creating_admin → applying_plan → completed
 * Each step is recorded in ProvisioningStatus.steps[] for auditability.
 * If a step was already completed (idempotency), it is skipped on retry.
 *
 * Enterprise-grade:
 *  - Atomic initiateProvisioning (findOneAndUpdate + upsert prevents races)
 *  - Deterministic idempotencyKey per slug (not Date.now)
 *  - No double-hash on password (pre-save hook handles hashing)
 *  - Plan features always applied from Plan doc (not gated by schema defaults)
 *  - Rollback updates Clinic status
 *  - Temp password stored in step metadata for platform admin retrieval
 */

const crypto = require('crypto');
const mongoose = require('mongoose');
const logger = require('../utils/logger');
const ApiError = require('../utils/ApiError');
const { getTenantConnection } = require('../db/tenantConnectionManager');
const { seedDefaultData } = require('./seedDefaultData');
const { PROVISIONING_STATUS, TENANT_STATUS } = require('../config/constants');

const ProvisioningStatus = () => mongoose.model('ProvisioningStatus');
const Clinic = () => mongoose.model('Clinic');
const Plan = () => mongoose.model('Plan');
const UserDirectory = () => mongoose.model('UserDirectory');

// ─── Public API ──────────────────────────────────────

/**
 * Initiate provisioning for a clinic.
 * Uses atomic findOneAndUpdate to prevent race conditions and duplicate provisioning.
 * Idempotency key is deterministic per slug — same clinic always gets the same key.
 */
async function initiateProvisioning(clinicId, clinicSlug, performedBy) {
  const idempotencyKey = `prov_${clinicSlug}`;

  // Check for existing non-terminal provisioning to prevent duplicates.
  const existing = await ProvisioningStatus().findOne({
    clinicSlug,
    status: { $nin: [PROVISIONING_STATUS.FAILED, PROVISIONING_STATUS.ROLLED_BACK] },
  });

  if (existing) {
    if (existing.status === PROVISIONING_STATUS.COMPLETED) {
      throw ApiError.conflict(`Tenant "${clinicSlug}" is already provisioned`);
    }
    // Return existing in-progress provisioning (idempotent)
    logger.info('Provisioning already in progress for %s, returning existing', clinicSlug);
    return existing;
  }

  // Atomic create with unique idempotencyKey — if two concurrent calls race
  // past the findOne above, only one will succeed; the other gets a duplicate
  // key error which we catch and return the existing record.
  try {
    const provStatus = await ProvisioningStatus().findOneAndUpdate(
      { idempotencyKey },
      {
        $setOnInsert: {
          clinic: clinicId,
          clinicSlug,
          idempotencyKey,
          status: PROVISIONING_STATUS.PENDING,
          triggeredBy: {
            userId: performedBy.userId || performedBy,
            role: performedBy.role || 'product_owner',
          },
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    logger.info('Provisioning initiated for %s (id: %s)', clinicSlug, provStatus._id);
    return provStatus;
  } catch (err) {
    // Handle duplicate key race (E11000)
    if (err.code === 11000) {
      const fallback = await ProvisioningStatus().findOne({ idempotencyKey });
      if (fallback) return fallback;
    }
    throw err;
  }
}

/**
 * Execute the full provisioning pipeline. Called by the worker.
 */
async function executeProvisioning(provisioningId) {
  const provStatus = await ProvisioningStatus().findById(provisioningId);
  if (!provStatus) throw new Error(`ProvisioningStatus ${provisioningId} not found`);

  const clinic = await Clinic().findById(provStatus.clinic);
  if (!clinic) throw new Error(`Clinic ${provStatus.clinic} not found for provisioning`);

  const steps = [
    { name: 'creating_db', fn: _stepCreateDb },
    { name: 'generating_clinic_code', fn: _stepGenerateClinicCode },
    { name: 'seeding', fn: _stepSeedData },
    { name: 'creating_admin', fn: _stepCreateAdmin },
    { name: 'applying_plan', fn: _stepApplyPlan },
  ];

  // On retry/resume, reset status to the last completed step so the state
  // machine can transition forward to the next incomplete step.
  if (provStatus.status === PROVISIONING_STATUS.FAILED) {
    let resumeStatus = PROVISIONING_STATUS.PENDING;
    for (const step of steps) {
      const done = provStatus.steps.find((s) => s.step === step.name && s.status === 'completed');
      if (done) resumeStatus = step.name;
      else break;
    }
    provStatus.status = resumeStatus; // direct set — bypasses state machine for retry
    await provStatus.save();
    logger.info('Provisioning [%s]: resuming from "%s" for retry', clinic.slug, resumeStatus);
  }

  try {
    for (const step of steps) {
      // Idempotency: skip already completed steps
      const completed = provStatus.steps.find((s) => s.step === step.name && s.status === 'completed');
      if (completed) {
        logger.info('Provisioning [%s]: step "%s" already completed, skipping', clinic.slug, step.name);
        continue;
      }

      // Transition state (skip if already at this state — resume scenario)
      if (provStatus.status !== step.name) {
        provStatus.transition(step.name);
      }

      // Clean up any previous 'started' or 'failed' entry for this step (retry)
      provStatus.steps = provStatus.steps.filter(
        (s) => !(s.step === step.name && (s.status === 'started' || s.status === 'failed')),
      );
      provStatus.steps.push({ step: step.name, status: 'started', startedAt: new Date() });
      await provStatus.save();

      // Execute step
      const stepResult = await step.fn(provStatus, clinic);

      // Mark step completed (with optional metadata from the step)
      const stepLog = provStatus.steps.find((s) => s.step === step.name && s.status === 'started');
      if (stepLog) {
        stepLog.status = 'completed';
        stepLog.completedAt = new Date();
        if (stepResult?.metadata) stepLog.metadata = stepResult.metadata;
      }
      await provStatus.save();

      logger.info('Provisioning [%s]: step "%s" completed', clinic.slug, step.name);
    }

    // All steps done — mark completed
    provStatus.transition(PROVISIONING_STATUS.COMPLETED);
    await provStatus.save();

    // Activate clinic
    if (clinic.status === TENANT_STATUS.PENDING) {
      clinic.status = TENANT_STATUS.ACTIVE;
      clinic.isActive = true;
      clinic.activatedAt = new Date();
      await clinic.save();
    }

    // Enqueue welcome email with clinic code, login link and credentials
    try {
      const { emailQueue } = require('../jobs/queues');
      const env = require('../config/env');
      const loginUrl = `${env.FRONTEND_URL}/clinic/login?clinicCode=${encodeURIComponent(clinic.clinicCode)}&email=${encodeURIComponent(clinic.superAdmin.email)}`;

      // The password generated in _stepCreateAdmin is recorded in that step's
      // metadata. Without passing it on, the welcome email told the new clinic to
      // log in but never gave them a password — leaving the platform admin to dig
      // it out of provisioning metadata and relay it by hand.
      // Absent for a self-service signup, where the owner chose their own password.
      const adminStep = provStatus.steps.find(
        (s) => s.step === 'creating_admin' && s.metadata?.tempPassword,
      );

      await emailQueue.add('send-email', {
        type: 'clinic-welcome',
        payload: {
          email: clinic.superAdmin.email,
          name: clinic.superAdmin.name || `${clinic.name} Admin`,
          clinicName: clinic.name,
          clinicCode: clinic.clinicCode,
          tempPassword: adminStep?.metadata?.tempPassword || null,
          loginUrl,
        },
      });
      logger.info('Provisioning [%s]: welcome email enqueued for %s', clinic.slug, clinic.superAdmin.email);
    } catch (emailErr) {
      // Non-blocking — provisioning succeeded, email is best-effort
      logger.warn('Provisioning [%s]: failed to enqueue welcome email — %s', clinic.slug, emailErr.message);
    }

    logger.info('Provisioning completed for %s', clinic.slug);
    return provStatus;
  } catch (err) {
    logger.error('Provisioning failed for %s at step: %s — %s', clinic.slug, provStatus.status, err.message);

    // Mark current step as failed
    const failedStep = provStatus.steps.find((s) => s.status === 'started');
    if (failedStep) {
      failedStep.status = 'failed';
      failedStep.error = err.message;
      failedStep.completedAt = new Date();
    }

    provStatus.transition(PROVISIONING_STATUS.FAILED, err.message);
    provStatus.attempt += 1;
    await provStatus.save();

    throw err;
  }
}

/**
 * Rollback a failed provisioning — drop tenant DB, mark as rolled back,
 * and update the Clinic status to reflect the failure.
 */
async function rollbackProvisioning(provisioningId) {
  const provStatus = await ProvisioningStatus().findById(provisioningId);
  if (!provStatus) throw ApiError.notFound('Provisioning record not found');

  const clinic = await Clinic().findById(provStatus.clinic);
  if (!clinic) throw ApiError.notFound('Clinic not found');

  try {
    // Attempt to drop the tenant database
    const conn = await getTenantConnection(clinic.slug);
    await conn.dropDatabase();
    logger.warn('Provisioning rollback: dropped tenant DB for %s', clinic.slug);
  } catch (err) {
    logger.warn('Provisioning rollback: could not drop DB for %s — %s', clinic.slug, err.message);
  }

  // Invalidate Redis-cached URI for this tenant
  try {
    const { getRedis } = require('../config/redis');
    const redis = getRedis();
    await redis.del(`tenant:dbUri:${clinic.slug}`);
  } catch (err) {
    logger.warn('Provisioning rollback: could not clear Redis cache for %s — %s', clinic.slug, err.message);
  }

  // Update Clinic status — mark as failed so platform admin knows
  clinic.status = TENANT_STATUS.PENDING;
  clinic.isActive = false;
  await clinic.save();

  provStatus.transition(PROVISIONING_STATUS.ROLLED_BACK);
  await provStatus.save();

  logger.info('Provisioning rolled back for %s', clinic.slug);
  return provStatus;
}

/**
 * Get provisioning status for a clinic.
 */
async function getProvisioningStatus(clinicSlug) {
  const status = await ProvisioningStatus().findOne({ clinicSlug }).sort({ createdAt: -1 });
  if (!status) throw ApiError.notFound('No provisioning record found for this tenant');
  return status;
}

// ─── Internal Steps ─────────────────────────────────

async function _stepCreateDb(_provStatus, clinic) {
  // Opening a connection through the manager automatically creates the DB
  const conn = await getTenantConnection(clinic.slug);
  logger.info('Provisioning [%s]: tenant DB connection established', clinic.slug);
  return { conn };
}

/** Must match the Clinic.clinicCode schema pattern exactly. */
const CLINIC_CODE_RE = /^[A-Z]{3,6}\d{4}$/;

/**
 * Letter prefix for a clinic code — always 3 to 6 uppercase letters.
 *
 * A clinic named "JJ" or "hh" used to yield a 2-letter prefix, producing codes
 * like "HH1234" that the schema pattern rejects. Provisioning then died at this
 * step with a raw Mongoose validation error, so short-named clinics could never
 * be created at all. Short names are padded; a name with no letters falls back
 * to "CLI".
 */
function _clinicCodePrefix(name) {
  const letters = String(name || '').replace(/[^a-zA-Z]/g, '').toUpperCase();
  if (letters.length >= 3) return letters.substring(0, 5);
  return (letters + 'CLINIC').substring(0, 3);
}

/**
 * Generate a human-readable clinic code (e.g. SMILE2847).
 * 3-6 letters from the clinic name + 4 digits, retried on collision.
 */
async function _stepGenerateClinicCode(_provStatus, clinic) {
  // Skip if clinic already has a code (idempotency)
  if (clinic.clinicCode) {
    logger.info('Provisioning [%s]: clinicCode already set (%s), skipping', clinic.slug, clinic.clinicCode);
    return { metadata: { clinicCode: clinic.clinicCode } };
  }

  const prefix = _clinicCodePrefix(clinic.name);

  for (let attempt = 0; attempt < 10; attempt++) {
    // Last attempt derives its digits from the ObjectId so an unlucky run of
    // random collisions still terminates deterministically. Always 4 digits —
    // the old hex-based fallback produced letters and failed validation too.
    const suffix = attempt < 9
      ? Math.floor(1000 + Math.random() * 9000)
      : (parseInt(clinic._id.toString().slice(-6), 16) % 9000) + 1000;

    const code = `${prefix}${suffix}`;
    if (!CLINIC_CODE_RE.test(code)) continue; // never hand the schema a code it will reject

    const exists = await Clinic().findOne({ clinicCode: code });
    if (exists) continue;

    clinic.clinicCode = code;
    try {
      await clinic.save();
    } catch (err) {
      if (err.code === 11000) continue; // lost the race to a concurrent provision
      throw err;
    }
    logger.info('Provisioning [%s]: clinicCode generated — %s', clinic.slug, code);
    return { metadata: { clinicCode: code } };
  }

  throw new Error(
    `Could not generate a unique clinic code for "${clinic.name}" (prefix ${prefix}) after 10 attempts`,
  );
}

async function _stepSeedData(_provStatus, clinic) {
  const conn = await getTenantConnection(clinic.slug);
  const result = await seedDefaultData(conn, {
    clinicName: clinic.name,
    clinicSlug: clinic.slug,
    planSlug: clinic.subscription?.plan,
  });
  return { metadata: result };
}

/**
 * Create the SuperAdmin user in the tenant DB.
 *
 * IMPORTANT: We pass the plain-text password to User.create() because the
 * User schema has a pre('save') hook that automatically bcrypt-hashes it.
 * Manually hashing before create() would result in double-hashing.
 */
async function _stepCreateAdmin(provStatus, clinic) {
  if (!clinic.superAdmin?.email) {
    logger.warn('Provisioning [%s]: no superAdmin email — skipping admin creation', clinic.slug);
    return;
  }

  const conn = await getTenantConnection(clinic.slug);
  const User = conn.model('User');

  // Idempotency: check if admin already exists
  const existing = await User.findOne({ email: clinic.superAdmin.email });
  if (existing) {
    logger.info('Provisioning [%s]: admin user already exists, skipping', clinic.slug);
    return;
  }

  // Check if a user-provided password exists in provisioning metadata
  // (set by self-service registration flow)
  let tempPassword;
  const pwStep = provStatus.steps.find(s => s.step === '_adminPassword' && s.metadata?.adminPassword);
  if (pwStep) {
    tempPassword = pwStep.metadata.adminPassword;
    logger.info('Provisioning [%s]: using user-provided password for admin', clinic.slug);
  } else {
    // Generate temp password — pass as PLAIN TEXT (pre-save hook hashes it)
    tempPassword = crypto.randomBytes(12).toString('base64url');
  }

  const adminUser = await User.create({
    name: clinic.superAdmin.name || `${clinic.name} Admin`,
    email: clinic.superAdmin.email,
    password: tempPassword,
    role: 'super_admin',
    isEmailVerified: true,
  });

  // Store admin userId back on the platform Clinic doc
  clinic.superAdmin.userId = adminUser._id.toString();
  await clinic.save();

  logger.info('Provisioning [%s]: super_admin created (%s)', clinic.slug, clinic.superAdmin.email);

  // Sync to UserDirectory (platform-level email index)
  try {
    await UserDirectory().findOneAndUpdate(
      { email: clinic.superAdmin.email, tenantSlug: clinic.slug },
      {
        email: clinic.superAdmin.email,
        tenantSlug: clinic.slug,
        clinicId: clinic._id,
        clinicName: clinic.name,
        clinicLogo: clinic.logo || null,
        clinicCode: clinic.clinicCode,
        userId: adminUser._id.toString(),
        role: 'super_admin',
      },
      { upsert: true },
    );
    logger.info('Provisioning [%s]: UserDirectory entry created for admin', clinic.slug);
  } catch (dirErr) {
    logger.warn('Provisioning [%s]: UserDirectory sync failed — %s', clinic.slug, dirErr.message);
  }

  // Return temp password in step metadata so platform admin can retrieve it.
  // In production, this should trigger an email via the email queue.
  return { metadata: { tempPassword, adminEmail: clinic.superAdmin.email } };
}

/**
 * Apply the subscription plan's feature limits to the Clinic document.
 *
 * Always applies plan features from the Plan document, overriding schema
 * defaults. The Clinic schema has default values (maxDoctors: 1, etc.) which
 * would cause a naive "only apply if not set" check to never apply real limits.
 */
async function _stepApplyPlan(_provStatus, clinic) {
  const Subscription = mongoose.model('Subscription');
  const planSlug = clinic.subscription?.plan || 'free';

  // Resolve plan (null for free tier)
  const plan = planSlug !== 'free'
    ? await Plan().findOne({ slug: planSlug, isActive: true })
    : null;

  // Apply plan features to Clinic document
  if (plan && plan.features) {
    const planFeatures = plan.features.toObject ? plan.features.toObject() : plan.features;
    for (const [key, value] of Object.entries(planFeatures)) {
      if (value !== undefined && value !== null) {
        clinic.features[key] = value;
      }
    }
    clinic.markModified('features');
    await clinic.save();
    logger.info('Provisioning [%s]: plan "%s" features applied (maxDoctors: %d, maxStaff: %d, maxStorageMB: %d)',
      clinic.slug, plan.slug, clinic.features.maxDoctors, clinic.features.maxStaff, clinic.features.maxStorageMB);
  } else if (!plan) {
    logger.info('Provisioning [%s]: free plan — keeping schema defaults', clinic.slug);
  }

  // ── Check for payment details from registration ────────
  const paymentStep = _provStatus.steps?.find(s => s.step === '_paymentDetails');
  const paymentMeta = paymentStep?.metadata || null;
  const hasPaid = !!paymentMeta?.razorpayPaymentId;

  // ── Create Subscription document (idempotent) ──────────
  const existingSub = await Subscription.findOne({ clinic: clinic._id });
  if (!existingSub) {
    const now = new Date();
    // If already paid, skip trial and go straight to active
    const hasTrial = hasPaid ? false : (plan ? plan.trial?.enabled !== false : false);
    const trialDays = plan?.trial?.durationDays || 14;
    const billingCycle = paymentMeta?.billingCycle || 'monthly';

    const subData = {
      clinic: clinic._id,
      plan: planSlug,
      planRef: plan?._id || null,
      billingCycle,
      status: hasPaid ? 'active' : (hasTrial ? 'trial' : 'active'),
      statusHistory: [{
        from: 'none',
        to: hasPaid ? 'active' : (hasTrial ? 'trial' : 'active'),
        reason: hasPaid ? 'Provisioned with upfront payment' : 'Provisioned via tenant creation',
        triggeredBy: 'system',
        timestamp: now,
      }],
    };

    if (hasTrial && !hasPaid) {
      subData.trialStart = now;
      subData.trialEnd = new Date(now.getTime() + trialDays * 24 * 60 * 60 * 1000);
    } else {
      const periodMs = billingCycle === 'yearly' ? 365 * 86400000 : 30 * 86400000;
      subData.currentPeriodStart = now;
      subData.currentPeriodEnd = new Date(now.getTime() + periodMs);
    }

    // Pricing from plan
    if (plan) {
      const pricing = plan.pricing || {};
      subData.amount = pricing[billingCycle] || 0;
      subData.amountBreakdown = { basePrice: subData.amount, addOns: [], addOnTotal: 0 };
    } else {
      subData.amount = 0;
      subData.amountBreakdown = { basePrice: 0, addOns: [], addOnTotal: 0 };
    }

    // Store Razorpay payment reference
    if (hasPaid) {
      subData.razorpay = {
        paymentMethodId: paymentMeta.razorpayPaymentId,
      };
    }

    await Subscription.create(subData);

    // Sync subscription dates back to Clinic embedded subscription
    const syncUpdate = { 'subscription.status': subData.status };
    if (subData.trialEnd) syncUpdate['subscription.trialEndsAt'] = subData.trialEnd;
    if (subData.currentPeriodEnd) syncUpdate['subscription.currentPeriodEnd'] = subData.currentPeriodEnd;
    await Clinic().findByIdAndUpdate(clinic._id, syncUpdate);

    logger.info('Provisioning [%s]: Subscription document created (status: %s, plan: %s)',
      clinic.slug, subData.status, planSlug);
  } else {
    logger.info('Provisioning [%s]: Subscription document already exists, skipping', clinic.slug);
  }

  return { metadata: { plan: planSlug, features: clinic.features } };
}

module.exports = {
  initiateProvisioning,
  executeProvisioning,
  rollbackProvisioning,
  getProvisioningStatus,
};
