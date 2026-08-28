'use strict';

const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const Clinic = require('../../models/platform/Clinic');
const ProvisioningStatus = require('../../models/platform/ProvisioningStatus');
const ApiError = require('../../utils/ApiError');
const razorpay = require('../../utils/razorpay');
const logger = require('../../utils/logger');

// ─── Slug Utilities ──────────────────────────────────

/**
 * Generate a URL-safe slug from a clinic name.
 * e.g. "Jathar's Dental Clinic" → "jathars-dental-clinic"
 */
function slugify(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[''"]/g, '')              // remove apostrophes/quotes
    .replace(/[^a-z0-9]+/g, '-')        // replace non-alphanumeric with hyphens
    .replace(/^-+|-+$/g, '')            // trim leading/trailing hyphens
    .substring(0, 60);
}

/**
 * Append a short random suffix to make a slug unique.
 */
function _appendSuffix(slug) {
  const suffix = Math.random().toString(36).substring(2, 6);
  return `${slug}-${suffix}`.substring(0, 60);
}

/**
 * Check if a slug is available (including soft-deleted clinics).
 * Returns { available, suggestion? }
 */
async function checkSlugAvailability(slug) {
  const normalised = slug.toLowerCase().trim();

  // Check including soft-deleted records to prevent reuse
  const existing = await Clinic.findOne({ slug: normalised }).setOptions({ skipSoftDelete: true });

  if (!existing) {
    return { available: true };
  }

  // Generate a suggestion
  let suggestion = _appendSuffix(normalised);
  let attempts = 0;
  while (attempts < 5) {
    const taken = await Clinic.findOne({ slug: suggestion }).setOptions({ skipSoftDelete: true });
    if (!taken) break;
    suggestion = _appendSuffix(normalised);
    attempts++;
  }

  return { available: false, suggestion };
}

// ─── Free plan eligibility ───────────────────────────

const FREE_PLAN = 'free';

/** Tenant roles that mean "this person founded that clinic", not "works there". */
const FOUNDER_ROLES = ['super_admin', 'owner', 'admin'];

/**
 * The Free plan is a first-clinic offer, not a tier anyone can keep coming back
 * to. Someone who has already registered a clinic must pick a paid plan for the
 * next one — and no clinic can move *back* onto Free later (enforced separately
 * in the subscription self-serve flow).
 *
 * "Already registered" is matched on the founder's email, checked in two places
 * because neither is complete on its own: UserDirectory misses clinics whose
 * sync never ran, and Clinic.email only holds the clinic's contact address.
 *
 * @returns {Promise<{ eligible: boolean, reason?: string }>}
 */
async function checkFreePlanEligibility({ adminEmail, clinicEmail }) {
  const emails = [adminEmail, clinicEmail]
    .filter(Boolean)
    .map((e) => String(e).toLowerCase().trim());

  if (!emails.length) return { eligible: true };

  const UserDirectory = require('../../models/platform/UserDirectory');
  const [directoryHit, clinicHit] = await Promise.all([
    UserDirectory.findOne({ email: { $in: emails }, role: { $in: FOUNDER_ROLES } }).lean(),
    Clinic.findOne({ email: { $in: emails } }).setOptions({ skipSoftDelete: true }).lean(),
  ]);

  if (directoryHit || clinicHit) {
    return {
      eligible: false,
      reason: 'The Free plan is only available for your first clinic. '
        + 'Choose a paid plan to register another one.',
    };
  }

  return { eligible: true };
}

// ─── Registration ────────────────────────────────────

/**
 * Register a new clinic via self-service.
 * Orchestrates: slug generation → tenant creation → provisioning → registration token.
 *
 * @param {object} data — validated registration payload
 * @returns {object} — { clinic, provisioningId, registrationToken }
 */
async function registerClinic(data) {
  // 1. Determine slug
  let slug = data.subdomain || slugify(data.clinicName);

  const { available } = await checkSlugAvailability(slug);
  if (!available) {
    // Try with suffix
    slug = _appendSuffix(slug);
    const retry = await checkSlugAvailability(slug);
    if (!retry.available) {
      throw ApiError.conflict(`Slug "${slug}" is not available. Try a different clinic name or subdomain.`);
    }
  }

  // 2. Free plan is a one-per-founder offer — check before taking any payment
  //    or creating anything.
  const planSlug = data.plan || FREE_PLAN;
  if (planSlug === FREE_PLAN) {
    const eligibility = await checkFreePlanEligibility({
      adminEmail: data.adminEmail,
      clinicEmail: data.email,
    });
    if (!eligibility.eligible) {
      logger.info('Free plan refused for %s — already registered a clinic', data.adminEmail);
      throw ApiError.badRequest(eligibility.reason);
    }
  }

  // 3. Verify Razorpay payment for paid plans
  if (planSlug !== FREE_PLAN) {
    const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = data;
    if (!razorpayPaymentId || !razorpaySignature) {
      throw ApiError.badRequest('Payment details are required for paid plans');
    }

    if (!razorpayOrderId) {
      throw ApiError.badRequest('Razorpay order ID is required');
    }

    const isValid = razorpay.verifyPaymentSignature(razorpayOrderId, razorpayPaymentId, razorpaySignature);
    if (!isValid) {
      throw ApiError.badRequest('Payment verification failed. Please try again.');
    }

    logger.info('Payment verified for registration: order=%s payment=%s', razorpayOrderId, razorpayPaymentId);
  }

  // 3. Create tenant via existing service (reuse the full pipeline)
  const tenantService = require('../productOwner/tenant.service');

  let result;
  try {
    result = await tenantService.createTenant(
      {
        name: data.clinicName,
        slug,
        email: data.email,
        phone: data.phone || null,
        address: data.address || {},
        logo: data.logo || null,
        plan: data.plan || 'free',
        superAdmin: {
          name: data.adminName,
          email: data.adminEmail,
          phone: null,
        },
      },
      { userId: 'self-service', role: 'self_service' },
    );
  } catch (err) {
    logger.error('Self-service registration failed for "%s": %s', data.clinicName, err.message);
    throw err;
  }

  const clinic = result.tenant;

  // 4. Store user-provided password + payment details in provisioning metadata
  const provStatus = await ProvisioningStatus.findById(result.provisioningId);
  if (provStatus) {
    provStatus.steps.push({
      step: '_adminPassword',
      status: 'completed',
      metadata: { adminPassword: data.adminPassword },
    });

    // Store payment details so _stepApplyPlan can set them on the Subscription
    if (data.razorpayPaymentId) {
      provStatus.steps.push({
        step: '_paymentDetails',
        status: 'completed',
        metadata: {
          razorpayOrderId: data.razorpayOrderId || undefined,
          razorpayPaymentId: data.razorpayPaymentId,
          billingCycle: data.billingCycle || 'monthly',
        },
      });
    }

    await provStatus.save();
  }

  // 4. Update clinic with self-service specific fields
  clinic.subdomain = slug;
  clinic.registrationSource = 'self_service';
  if (data.documents && data.documents.length > 0) {
    clinic.documents = data.documents;
  }
  await clinic.save();

  // 5. Generate registration token for provisioning status polling
  const env = require('../../config/env');
  const registrationToken = jwt.sign(
    { slug, clinicId: clinic._id.toString(), purpose: 'provisioning_status' },
    env.JWT_ACCESS_SECRET,
    { expiresIn: '2h', issuer: 'bestoclinic', jwtid: uuidv4() },
  );

  logger.info('Self-service registration complete for "%s" (slug: %s)', data.clinicName, slug);

  return {
    clinic: {
      name: clinic.name,
      slug: clinic.slug,
      subdomain: clinic.subdomain,
    },
    provisioningId: result.provisioningId,
    registrationToken,
  };
}

/**
 * Get provisioning status from a registration token.
 * Strips sensitive metadata (passwords) from the response.
 */
async function getProvisioningStatus(token) {
  const env = require('../../config/env');

  let decoded;
  try {
    decoded = jwt.verify(token, env.JWT_ACCESS_SECRET, {
      issuer: 'bestoclinic',
      algorithms: ['HS256'],
    });
  } catch {
    throw ApiError.unauthorized('Invalid or expired registration token');
  }

  if (decoded.purpose !== 'provisioning_status') {
    throw ApiError.unauthorized('Invalid token purpose');
  }

  const provStatus = await ProvisioningStatus.findOne({ clinicSlug: decoded.slug })
    .sort({ createdAt: -1 });

  if (!provStatus) {
    throw ApiError.notFound('Provisioning status not found');
  }

  // Strip sensitive metadata
  const safeSteps = provStatus.steps
    .filter(s => s.step !== '_adminPassword')
    .map(s => {
      const step = s.toObject ? s.toObject() : { ...s };
      if (step.metadata) {
        delete step.metadata.tempPassword;
        delete step.metadata.adminPassword;
      }
      return step;
    });

  // Fetch clinic details so the frontend gets clinicCode + clinicName (never slug)
  const clinic = await Clinic.findOne({ slug: decoded.slug, deletedAt: null })
    .select('name clinicCode')
    .lean();

  return {
    status: provStatus.status,
    steps: safeSteps,
    completedAt: provStatus.completedAt,
    lastError: provStatus.lastError,
    clinicCode: clinic?.clinicCode || null,
    clinicName: clinic?.name || null,
  };
}

/**
 * Retry a failed provisioning using the registration token.
 * Re-enqueues the provisioning job for a failed/stuck record.
 */
async function retryProvisioning(token) {
  const env = require('../../config/env');

  let decoded;
  try {
    decoded = jwt.verify(token, env.JWT_ACCESS_SECRET, {
      issuer: 'bestoclinic',
      algorithms: ['HS256'],
    });
  } catch {
    throw ApiError.unauthorized('Invalid or expired registration token');
  }

  if (decoded.purpose !== 'provisioning_status') {
    throw ApiError.unauthorized('Invalid token purpose');
  }

  const provStatus = await ProvisioningStatus.findOne({ clinicSlug: decoded.slug })
    .sort({ createdAt: -1 });

  if (!provStatus) {
    throw ApiError.notFound('Provisioning status not found');
  }

  if (provStatus.status === 'completed') {
    throw ApiError.conflict('Provisioning is already completed');
  }

  if (provStatus.attempt >= provStatus.maxAttempts) {
    throw ApiError.badRequest('Maximum retry attempts reached. Please contact support.');
  }

  // Allow retry from failed or any stuck intermediate state
  const retryableStates = ['failed', 'creating_db', 'generating_clinic_code', 'seeding', 'creating_admin', 'applying_plan'];
  if (!retryableStates.includes(provStatus.status)) {
    throw ApiError.badRequest(`Cannot retry from status "${provStatus.status}"`);
  }

  // If stuck in an intermediate state (not failed), force to failed first so the
  // executeProvisioning retry logic (failed → pending reset) can handle it
  if (provStatus.status !== 'failed') {
    provStatus.status = 'failed';
    provStatus.lastError = 'Retried by user';
    await provStatus.save();
  }

  // Re-enqueue the provisioning job
  const { provisioningQueue } = require('../../jobs/queues');
  await provisioningQueue.add('provision-tenant', {
    provisioningId: provStatus._id.toString(),
    action: 'provision',
  }, {
    jobId: `provision_${decoded.slug}_retry_${Date.now()}`,
  });

  logger.info('Provisioning retry enqueued for %s (attempt %d)', decoded.slug, provStatus.attempt + 1);

  return { status: 'retrying', attempt: provStatus.attempt + 1 };
}

module.exports = {
  slugify,
  checkSlugAvailability,
  checkFreePlanEligibility,
  registerClinic,
  getProvisioningStatus,
  retryProvisioning,
};
