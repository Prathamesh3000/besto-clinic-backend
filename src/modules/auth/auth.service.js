'use strict';

/**
 * Auth service — business logic for register, login, token refresh, logout.
 * Thin on I/O; delegates DB access to dbManager, token ops to tokenHelper.
 */

const crypto = require('crypto');
const ApiError = require('../../utils/ApiError');
const {
  signAccessToken, signRefreshToken, verifyRefreshToken, signPlatformToken, accessTokenTtlSeconds,
} = require('../../utils/tokenHelper');
const { getRedis } = require('../../config/redis');
const { getTenantConnection } = require('../../db/tenantConnectionManager');
const { getPlatformDB } = require('../../db/platformConnection');

const Clinic = require('../../models/platform/Clinic');
const UserDirectory = require('../../models/platform/UserDirectory');
const PlatformPatient = require('../../models/platform/PlatformPatient');
const { getRolePermissions } = require('../role/role.service');
const { calculateAge, MINIMUM_SELF_REGISTRATION_AGE } = require('../../utils/age');
const { TENANT_STATUS } = require('../../config/constants');

const REFRESH_PREFIX = 'auth:refresh:devices';
const ALLOWED_PATIENT_ROLES = ['patient', 'guardian'];

/**
 * Refuse any authentication into a clinic the product owner has suspended or
 * cancelled — nobody belonging to it gets in, whatever their role.
 *
 * Deliberately runs BEFORE the password is checked, for two reasons: a suspended
 * clinic must not double as a password oracle, and the caller should be told why
 * they are locked out rather than "invalid email or password".
 *
 * The suspension reason entered by the product owner is returned verbatim so the
 * client can show it. Applied to login, refresh and registration; the platform
 * (product owner) login is intentionally exempt, since that is how a clinic gets
 * un-suspended.
 */
async function _assertClinicAccessible(tenantSlug) {
  const clinic = await Clinic.findOne({ slug: tenantSlug, deletedAt: null })
    .select('name status isActive suspensionReason')
    .lean();

  if (!clinic) throw ApiError.notFound('Clinic not found');

  const blocked = clinic.isActive === false
    || clinic.status === TENANT_STATUS.SUSPENDED
    || clinic.status === TENANT_STATUS.CANCELLED;

  if (!blocked) return;

  const reason = (clinic.suspensionReason || '').trim();
  throw ApiError.forbidden(
    reason || 'This clinic account has been suspended. Please contact support.',
    {
      code: 'CLINIC_SUSPENDED',
      status: clinic.status,
      clinicName: clinic.name,
      reason: reason || null,
    },
  );
}

/**
 * Under-18s may not hold their own login — a guardian adds them as a dependent
 * instead. Enforced here rather than in the validator because three HTTP entry
 * points reach registration (/auth/register, /public/register,
 * /public/platform-register) and the two public ones hand-roll their checks.
 */
function _assertSelfRegistrationAge(dateOfBirth) {
  if (!dateOfBirth) {
    throw ApiError.badRequest('Date of birth is required to create an account');
  }
  const age = calculateAge(dateOfBirth);
  if (Number.isNaN(age)) {
    throw ApiError.badRequest('Date of birth is not a valid date');
  }
  if (age < 0) {
    throw ApiError.badRequest('Date of birth cannot be in the future');
  }
  if (age < MINIMUM_SELF_REGISTRATION_AGE) {
    throw ApiError.badRequest(
      `You must be at least ${MINIMUM_SELF_REGISTRATION_AGE} to create your own account. ` +
      'Ask a parent or guardian to create an account and add you as a dependent.',
    );
  }
}

/**
 * Resolve permissions from the tenant's Role collection, falling back to static map.
 */
async function _resolvePermissions(role, tenantSlug) {
  return getRolePermissions(role, tenantSlug);
}

/**
 * Register a new patient / guardian in the tenant DB.
 */
async function register({ name, email, phone, password, role, dateOfBirth }, tenantSlug) {
  await _assertClinicAccessible(tenantSlug);
  _assertSelfRegistrationAge(dateOfBirth);

  const normalizedEmail = email.toLowerCase().trim();
  const conn = await getTenantConnection(tenantSlug);
  const User = conn.model('User');

  const existing = await User.findOne({ email: normalizedEmail });
  if (existing) throw ApiError.conflict('Email already registered');

  const ALLOWED_SELF_REGISTER_ROLES = ['patient', 'guardian'];
  const safeRole = ALLOWED_SELF_REGISTER_ROLES.includes(role) ? role : 'patient';
  const user = await User.create({ name, email, phone, password, role: safeRole });

  // Auto-create a Patient record so portal/profiles returns data immediately
  // Guardians also get their own Patient record so they can book for themselves
  if (['patient', 'guardian'].includes(safeRole)) {
    const Patient = conn.model('Patient');
    await Patient.create({ user: user._id, name, email, phone, dateOfBirth });
  }

  const tokens = _issueTokenPair(user, tenantSlug);
  await _storeRefreshToken(user._id, tokens.refreshToken, 'register');

  // Sync to UserDirectory (platform-level email index for unified login)
  _syncUserDirectory(email, tenantSlug, user._id.toString(), safeRole).catch(() => {});

  // Create/update PlatformPatient for cross-clinic identity (fire-and-forget)
  if (ALLOWED_PATIENT_ROLES.includes(safeRole)) {
    _ensurePlatformPatient({ name, email, phone, password }, tenantSlug, user, safeRole).catch(() => {});
  }

  const permissions = await _resolvePermissions(safeRole, tenantSlug);
  return { user: user.toJSON(), permissions, ...tokens };
}

/**
 * Login with email + password.
 */
async function login({ email, password, deviceId }, tenantSlug) {
  await _assertClinicAccessible(tenantSlug);

  const normalizedEmail = email.toLowerCase().trim();
  const conn = await getTenantConnection(tenantSlug);
  const User = conn.model('User');

  const user = await User.findOne({ email: normalizedEmail }).select('+password');
  if (!user || !user.isActive) throw ApiError.unauthorized('Invalid email or password');

  let isMatch = await user.comparePassword(password);

  // Self-heal double-hashed passwords: if tenant password fails,
  // verify against PlatformPatient and re-sync if valid
  if (!isMatch && ALLOWED_PATIENT_ROLES.includes(user.role)) {
    // normalizedEmail, not the raw input — every other query in this function
    // uses the normalised form, so passing raw email made this recovery path
    // fire only when the caller's capitalisation happened to match.
    const pp = await PlatformPatient.findOne({ email: normalizedEmail, deletedAt: null }).select('+password');
    if (pp) {
      const ppMatch = await pp.comparePassword(password);
      if (ppMatch) {
        user.password = pp.password;
        user.$locals.skipPasswordHash = true;
        await user.save();
        isMatch = true;
      }
    }
  }

  if (!isMatch) throw ApiError.unauthorized('Invalid email or password');

  user.lastLoginAt = new Date();
  await user.save();

  // Populate department name for the client
  await user.populate('department', 'name');

  const device = deviceId || 'default';
  const tokens = _issueTokenPair(user, tenantSlug, device);
  await _storeRefreshToken(user._id, tokens.refreshToken, device);

  // Lazy-migrate to PlatformPatient for cross-clinic identity (fire-and-forget)
  if (ALLOWED_PATIENT_ROLES.includes(user.role)) {
    _lazyMigratePlatformPatient(email, user, tenantSlug).catch(() => {});
  }

  const permissions = await _resolvePermissions(user.role, tenantSlug);
  return { user: user.toJSON(), permissions, ...tokens };
}

/**
 * Refresh access token using a valid refresh token.
 */
async function refreshTokens(refreshToken, tenantSlug) {
  // Without this an already-signed-in user keeps minting access tokens for the
  // refresh token's whole lifetime, so suspension would not take effect until it
  // expired. Existing sessions must die at the next refresh.
  await _assertClinicAccessible(tenantSlug);

  const decoded = verifyRefreshToken(refreshToken);

  // Verify tenant match — prevents cross-tenant token reuse
  if (decoded.tenantSlug && decoded.tenantSlug !== tenantSlug) {
    throw ApiError.forbidden('Token does not belong to this tenant');
  }

  const redis = getRedis();

  // Verify token exists in Redis (per-device hash)
  const storedToken = await redis.hget(
    `${REFRESH_PREFIX}:${decoded.userId}`,
    decoded.deviceId || 'default',
  );

  if (storedToken !== refreshToken) {
    // Possible token reuse — revoke all sessions for this user
    await redis.del(`${REFRESH_PREFIX}:${decoded.userId}`);
    throw ApiError.unauthorized('Refresh token invalid or reused — all sessions revoked');
  }

  const conn = await getTenantConnection(tenantSlug);
  const User = conn.model('User');
  const user = await User.findById(decoded.userId);
  if (!user || !user.isActive) throw ApiError.unauthorized('User not found or inactive');

  // The device MUST travel into the new refresh token as well as into Redis.
  // Omitting it made _issueTokenPair default the claim to 'default' while the
  // token was stored under the real device id — so the NEXT refresh looked up
  // the wrong hash field, failed the comparison, and hit the reuse-detection
  // branch below, revoking every session the user had.
  // See docs/BestoClinic_Defect_Register.docx §2.2.
  const device = decoded.deviceId || 'default';
  const tokens = _issueTokenPair(user, tenantSlug, device);
  await _storeRefreshToken(user._id, tokens.refreshToken, device);

  return tokens;
}

/**
 * Logout — blacklist the access token and remove refresh token.
 */
async function logout(accessTokenJti, userId, deviceId = 'default') {
  const redis = getRedis();

  // Blacklist the access token. The TTL is derived from JWT_ACCESS_EXPIRES_IN
  // rather than hardcoded — a hardcoded 900s silently stopped revoking tokens
  // as soon as anyone raised the access-token lifetime above 15m.
  if (accessTokenJti) {
    await redis.set(`auth:blacklist:${accessTokenJti}`, '1', 'EX', accessTokenTtlSeconds());
  }

  // Remove the per-device refresh token.
  //
  // The caller resolves deviceId from the access token (see auth.controller.js),
  // not from the request body. Trusting the body meant a client that logged in
  // with a deviceId but logged out without one cleared only the 'default' field
  // and left its real refresh token live, so the session resumed on next refresh.
  await redis.hdel(`${REFRESH_PREFIX}:${userId}`, deviceId);
}

/**
 * Forgot password — generate reset token, return it (email sent by caller).
 */
async function forgotPassword(email, tenantSlug) {
  const normalizedEmail = email.toLowerCase().trim();
  const conn = await getTenantConnection(tenantSlug);
  const User = conn.model('User');

  const user = await User.findOne({ email: normalizedEmail }).select('+passwordResetToken +passwordResetExpires');
  if (!user) return; // silent — don't reveal whether email exists

  const resetToken = crypto.randomBytes(32).toString('hex');
  user.passwordResetToken = crypto.createHash('sha256').update(resetToken).digest('hex');
  user.passwordResetExpires = Date.now() + 30 * 60 * 1000; // 30 min
  await user.save({ validateModifiedOnly: true });

  return { resetToken, user };
}

/**
 * Reset password using the token from forgotPassword.
 */
async function resetPassword(token, newPassword, tenantSlug) {
  const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

  const conn = await getTenantConnection(tenantSlug);
  const User = conn.model('User');

  const user = await User.findOne({
    passwordResetToken: hashedToken,
    passwordResetExpires: { $gt: Date.now() },
  }).select('+passwordResetToken +passwordResetExpires');

  if (!user) throw ApiError.badRequest('Invalid or expired reset token');

  user.password = newPassword;
  user.passwordResetToken = undefined;
  user.passwordResetExpires = undefined;
  await user.save();

  // Revoke all refresh tokens (force re-login on all devices)
  const redis = getRedis();
  await redis.del(`${REFRESH_PREFIX}:${user._id}`);

  // Sync password to PlatformPatient + other connected clinics (fire-and-forget)
  if (ALLOWED_PATIENT_ROLES.includes(user.role)) {
    _syncPasswordToPlatform(user.email, newPassword, tenantSlug).catch(() => {});
  }

  return user;
}

// ── Helpers ──────────────────────────────────────

function _issueTokenPair(user, tenantSlug, deviceId = 'default') {
  const payload = {
    userId: user._id.toString(),
    role: user.role,
    tenantSlug,
    ...(user.branch ? { branch: user.branch.toString() } : {}),
    ...(user.department ? { department: user.department.toString() } : {}),
  };

  // deviceId is carried on BOTH tokens. It used to sit only on the refresh
  // token, which left logout dependent on the client passing the right device
  // in the request body — see logout() and auth.controller.js.
  return {
    accessToken: signAccessToken({ ...payload, deviceId }),
    refreshToken: signRefreshToken({ ...payload, deviceId }),
  };
}

async function _storeRefreshToken(userId, token, deviceId) {
  const redis = getRedis();
  const key = `${REFRESH_PREFIX}:${userId}`;
  await redis.hset(key, deviceId, token);
  await redis.expire(key, 7 * 24 * 3600); // match refresh token TTL
}

/**
 * Platform login — authenticate product_owner against platform DB.
 */
async function platformLogin({ email, password }) {
  const conn = getPlatformDB();
  const PlatformUser = conn.model('PlatformUser');

  const user = await PlatformUser.findOne({ email }).select('+password');
  if (!user || !user.isActive) throw ApiError.unauthorized('Invalid email or password');

  const isMatch = await user.comparePassword(password);
  if (!isMatch) throw ApiError.unauthorized('Invalid email or password');

  user.lastLoginAt = new Date();
  await user.save();

  const payload = {
    userId: user._id.toString(),
    role: user.role,
    email: user.email,
  };

  const token = signPlatformToken(payload);

  return { user: user.toJSON(), token };
}

/**
 * Login using clinicId instead of slug. Resolves clinicId → slug server-side.
 * Used by the unified login flow where slug is never exposed to the client.
 */
async function loginByClinicId({ clinicId, email, password, deviceId }) {
  const clinic = await Clinic.findOne({ _id: clinicId, deletedAt: null }).select('slug').lean();
  if (!clinic) throw ApiError.notFound('Clinic not found');
  return login({ email, password, deviceId }, clinic.slug);
}

/**
 * Sync a user registration to the platform-level UserDirectory.
 * Fire-and-forget — failures are logged but don't block the auth flow.
 */
async function _syncUserDirectory(email, tenantSlug, userId, role) {
  try {
    const clinic = await Clinic.findOne({ slug: tenantSlug, deletedAt: null })
      .select('_id name logo clinicCode')
      .lean();
    if (!clinic || !clinic.clinicCode) return;

    await UserDirectory.findOneAndUpdate(
      { email: email.toLowerCase(), tenantSlug },
      {
        email: email.toLowerCase(),
        tenantSlug,
        clinicId: clinic._id,
        clinicName: clinic.name,
        clinicLogo: clinic.logo || null,
        clinicCode: clinic.clinicCode,
        userId,
        role,
      },
      { upsert: true },
    );
  } catch (err) {
    // Non-critical — log and continue
    const logger = require('../../utils/logger');
    logger.warn('UserDirectory sync failed for %s@%s: %s', email, tenantSlug, err.message);
  }
}

/**
 * Update the signed-in user's own profile.
 *
 * Self-service by design: it takes the id from the token rather than the URL,
 * so any authenticated user can edit their own record and nobody can edit
 * anyone else's. That is why this lives here and not behind USER_UPDATE in the
 * user module, which only roles that administer *other* people hold.
 *
 * An email change has to touch three places or it half-works:
 *   1. the tenant user record   - what login checks
 *   2. the platform UserDirectory - the email to clinic index behind unified
 *      login; the OLD row must be deleted, or the previous address keeps
 *      resolving to this clinic while the new one does not resolve at all
 *   3. clinics.superAdmin        - a denormalised copy of the owner's identity
 *      shown on the platform tenant page, which otherwise drifts out of date
 */
async function updateProfile(userId, data, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const User = conn.model('User');

  const user = await User.findById(userId);
  if (!user) throw ApiError.unauthorized('Your account is no longer available - please log in again');

  const prevEmail = user.email;
  const nextEmail = data.email ? data.email.toLowerCase().trim() : prevEmail;

  if (nextEmail !== prevEmail) {
    const clash = await User.findOne({ email: nextEmail, _id: { $ne: user._id } });
    if (clash) throw ApiError.conflict('That email is already used by another account in this clinic');
  }

  if (data.name !== undefined) user.name = data.name;
  if (data.phone !== undefined) user.phone = data.phone || null;
  user.email = nextEmail;
  await user.save();

  if (nextEmail !== prevEmail) {
    await removeFromUserDirectory(prevEmail, tenantSlug);
  }
  await _syncUserDirectory(nextEmail, tenantSlug, user._id.toString(), user.role);

  if (user.role === 'super_admin') {
    await Clinic.updateOne(
      { slug: tenantSlug },
      { $set: { 'superAdmin.name': user.name, 'superAdmin.email': user.email } },
    );
  }

  require('../../utils/logger').info('Profile updated for %s (%s)', user.email, tenantSlug);
  return user;
}

/**
 * Remove a user from the UserDirectory (called on soft-delete).
 */
async function removeFromUserDirectory(email, tenantSlug) {
  await UserDirectory.deleteOne({ email: email.toLowerCase(), tenantSlug });
}

// ── Platform Patient Identity ────────────────────────────

/**
 * Register a patient with platform-scoped identity + tenant records in one step.
 * If the email already exists in PlatformPatient:
 *   - Correct password → auto-connect to the new clinic (creates tenant records)
 *   - Wrong password → 409 PLATFORM_EMAIL_EXISTS
 */
async function platformRegister({ name, email, phone, password, role, dateOfBirth }, clinicId) {
  _assertSelfRegistrationAge(dateOfBirth);

  const normalizedEmail = email.toLowerCase().trim();
  const safeRole = ALLOWED_PATIENT_ROLES.includes(role) ? role : 'patient';

  // Resolve clinic
  const clinic = await Clinic.findOne({ _id: clinicId, deletedAt: null })
    .select('slug name logo clinicCode')
    .lean();
  if (!clinic) throw ApiError.notFound('Clinic not found');

  const conn = await getTenantConnection(clinic.slug);
  const User = conn.model('User');

  // Check if already registered at this clinic
  const existingTenantUser = await User.findOne({ email: normalizedEmail });
  if (existingTenantUser) throw ApiError.conflict('Email already registered at this clinic');

  // Check PlatformPatient
  let pp = await PlatformPatient.findOne({ email: normalizedEmail, deletedAt: null }).select('+password');

  if (pp) {
    // Email exists — verify password to auto-connect
    const isMatch = await pp.comparePassword(password);
    if (!isMatch) {
      throw ApiError.conflict('This email is already registered. Please use your existing password to connect to this clinic.', {
        code: 'PLATFORM_EMAIL_EXISTS',
      });
    }
    // Password matches — connect to clinic (fall through to create tenant records)
  } else {
    // New patient — create PlatformPatient
    pp = await PlatformPatient.create({ email: normalizedEmail, password, name, phone });
  }

  // Create tenant User (use PlatformPatient's password hash to keep them in sync)
  const ppWithPw = pp.password
    ? pp
    : await PlatformPatient.findById(pp._id).select('+password');
  const tenantUser = new User({ name, email: normalizedEmail, phone, role: safeRole });
  tenantUser.password = ppWithPw.password; // Already hashed
  tenantUser.$locals.skipPasswordHash = true;
  await tenantUser.save({ validateModifiedOnly: true });

  // Auto-create Patient record (guardians also get one so they can book for themselves)
  let tenantPatientId = null;
  if (['patient', 'guardian'].includes(safeRole)) {
    const Patient = conn.model('Patient');
    const patient = await Patient.create({ user: tenantUser._id, name, email: normalizedEmail, phone, dateOfBirth });
    tenantPatientId = patient._id.toString();
  }

  // Update PlatformPatient.connectedClinics
  await PlatformPatient.updateOne(
    { _id: pp._id },
    {
      $addToSet: {
        connectedClinics: {
          clinicId: clinic._id,
          tenantSlug: clinic.slug,
          clinicName: clinic.name,
          clinicCode: clinic.clinicCode,
          clinicLogo: clinic.logo || null,
          tenantUserId: tenantUser._id.toString(),
          tenantPatientId,
          role: safeRole,
        },
      },
      $set: { lastLoginAt: new Date() },
    },
  );

  // Sync UserDirectory
  _syncUserDirectory(normalizedEmail, clinic.slug, tenantUser._id.toString(), safeRole).catch(() => {});

  // Issue tokens
  const tokens = _issueTokenPair(tenantUser, clinic.slug);
  await _storeRefreshToken(tenantUser._id, tokens.refreshToken, 'register');

  const permissions = await _resolvePermissions(safeRole, clinic.slug);
  return {
    user: tenantUser.toJSON(),
    permissions,
    ...tokens,
    clinic: {
      clinicId: clinic._id,
      slug: clinic.slug,
      clinicName: clinic.name,
      clinicLogo: clinic.logo || null,
      clinicCode: clinic.clinicCode,
    },
    platformPatientId: pp._id.toString(),
  };
}

/**
 * Connect an existing platform patient to a new clinic.
 * Verifies PlatformPatient credentials, then creates tenant User + Patient.
 */
async function connectToClinic({ email, password, clinicId }) {
  const normalizedEmail = email.toLowerCase().trim();

  // Find and verify PlatformPatient
  const pp = await PlatformPatient.findOne({ email: normalizedEmail, deletedAt: null }).select('+password');
  if (!pp) throw ApiError.unauthorized('Invalid email or password');

  const isMatch = await pp.comparePassword(password);
  if (!isMatch) throw ApiError.unauthorized('Invalid email or password');

  // Resolve clinic
  const clinic = await Clinic.findOne({ _id: clinicId, deletedAt: null })
    .select('slug name logo clinicCode')
    .lean();
  if (!clinic) throw ApiError.notFound('Clinic not found');

  // Check if already connected
  const conn = await getTenantConnection(clinic.slug);
  const User = conn.model('User');
  const existingUser = await User.findOne({ email: normalizedEmail });
  if (existingUser) throw ApiError.conflict('Already registered at this clinic');

  // Create tenant User with PlatformPatient's password hash
  const tenantUser = new User({
    name: pp.name,
    email: normalizedEmail,
    phone: pp.phone,
    role: 'patient',
  });
  tenantUser.password = pp.password; // Already hashed
  tenantUser.$locals.skipPasswordHash = true;
  await tenantUser.save({ validateModifiedOnly: true });

  // Auto-create Patient record
  let tenantPatientId = null;
  const Patient = conn.model('Patient');
  const patient = await Patient.create({
    user: tenantUser._id,
    name: pp.name,
    email: normalizedEmail,
    phone: pp.phone,
  });
  tenantPatientId = patient._id.toString();

  // Update PlatformPatient
  await PlatformPatient.updateOne(
    { _id: pp._id },
    {
      $addToSet: {
        connectedClinics: {
          clinicId: clinic._id,
          tenantSlug: clinic.slug,
          clinicName: clinic.name,
          clinicCode: clinic.clinicCode,
          clinicLogo: clinic.logo || null,
          tenantUserId: tenantUser._id.toString(),
          tenantPatientId,
          role: 'patient',
        },
      },
      $set: { lastLoginAt: new Date() },
    },
  );

  // Sync UserDirectory
  _syncUserDirectory(normalizedEmail, clinic.slug, tenantUser._id.toString(), 'patient').catch(() => {});

  // Issue tokens
  const tokens = _issueTokenPair(tenantUser, clinic.slug);
  await _storeRefreshToken(tenantUser._id, tokens.refreshToken, 'connect');

  const permissions = await _resolvePermissions(tenantUser.role, clinic.slug);
  return {
    user: tenantUser.toJSON(),
    permissions,
    ...tokens,
    clinic: {
      clinicId: clinic._id,
      slug: clinic.slug,
      clinicName: clinic.name,
      clinicLogo: clinic.logo || null,
      clinicCode: clinic.clinicCode,
    },
  };
}

/**
 * Ensure a PlatformPatient record exists for this patient.
 * Called fire-and-forget from register() to backfill platform identity.
 */
async function _ensurePlatformPatient({ name, email, phone, password }, tenantSlug, tenantUser, role) {
  const logger = require('../../utils/logger');
  try {
    const normalizedEmail = email.toLowerCase().trim();
    const existing = await PlatformPatient.findOne({ email: normalizedEmail, deletedAt: null });

    const clinic = await Clinic.findOne({ slug: tenantSlug, deletedAt: null })
      .select('_id name logo clinicCode')
      .lean();
    if (!clinic) return;

    const clinicEntry = {
      clinicId: clinic._id,
      tenantSlug,
      clinicName: clinic.name,
      clinicCode: clinic.clinicCode,
      clinicLogo: clinic.logo || null,
      tenantUserId: tenantUser._id.toString(),
      role,
    };

    if (existing) {
      // Add clinic if not already present
      await PlatformPatient.updateOne(
        { _id: existing._id, 'connectedClinics.tenantSlug': { $ne: tenantSlug } },
        { $addToSet: { connectedClinics: clinicEntry } },
      );
    } else {
      // Create PlatformPatient with the same password (already provided as plaintext, will be hashed by pre-save)
      await PlatformPatient.create({
        email: normalizedEmail,
        password,
        name,
        phone,
        connectedClinics: [clinicEntry],
      });
    }
  } catch (err) {
    logger.warn('PlatformPatient ensure failed for %s: %s', email, err.message);
  }
}

/**
 * Lazy-migrate an existing tenant user to PlatformPatient on login.
 * Uses the tenant User's existing password hash (bypasses pre-save hook).
 */
async function _lazyMigratePlatformPatient(email, tenantUser, tenantSlug) {
  const logger = require('../../utils/logger');
  try {
    const normalizedEmail = email.toLowerCase().trim();
    const existing = await PlatformPatient.findOne({ email: normalizedEmail, deletedAt: null });

    const clinic = await Clinic.findOne({ slug: tenantSlug, deletedAt: null })
      .select('_id name logo clinicCode')
      .lean();
    if (!clinic) return;

    const clinicEntry = {
      clinicId: clinic._id,
      tenantSlug,
      clinicName: clinic.name,
      clinicCode: clinic.clinicCode,
      clinicLogo: clinic.logo || null,
      tenantUserId: tenantUser._id.toString(),
      role: tenantUser.role,
    };

    if (existing) {
      // Ensure this clinic is in connectedClinics
      await PlatformPatient.updateOne(
        { _id: existing._id, 'connectedClinics.tenantSlug': { $ne: tenantSlug } },
        { $addToSet: { connectedClinics: clinicEntry } },
      );
      return;
    }

    // Need password hash from tenant User
    const conn = await getTenantConnection(tenantSlug);
    const User = conn.model('User');
    const userWithPw = await User.findById(tenantUser._id).select('+password');
    if (!userWithPw || !userWithPw.password) return;

    // Create PlatformPatient with existing hash (bypass pre-save hook)
    const pp = new PlatformPatient({
      email: normalizedEmail,
      name: tenantUser.name,
      phone: tenantUser.phone,
      connectedClinics: [clinicEntry],
    });
    pp.$locals.skipPasswordHash = true;
    pp.password = userWithPw.password; // Already bcrypt-hashed
    await pp.save();
  } catch (err) {
    // Ignore duplicate key errors (race condition — another login created it first)
    if (err.code === 11000) return;
    logger.warn('PlatformPatient lazy migration failed for %s: %s', email, err.message);
  }
}

/**
 * Sync a password change to PlatformPatient and all other connected tenant Users.
 */
async function _syncPasswordToPlatform(email, newPassword, currentTenantSlug) {
  const logger = require('../../utils/logger');
  try {
    const pp = await PlatformPatient.findOne({ email: email.toLowerCase(), deletedAt: null }).select('+password');
    if (!pp) return;

    // Update PlatformPatient password (pre-save hook will hash it)
    pp.password = newPassword;
    await pp.save();

    // Fan out to other connected tenants (skip the one that just changed)
    for (const clinic of pp.connectedClinics) {
      if (clinic.tenantSlug === currentTenantSlug) continue;
      try {
        const conn = await getTenantConnection(clinic.tenantSlug);
        const User = conn.model('User');
        await User.updateOne(
          { _id: clinic.tenantUserId },
          { password: pp.password }, // Already hashed by pre-save
        );
      } catch (syncErr) {
        logger.warn('Password sync to %s failed: %s', clinic.tenantSlug, syncErr.message);
      }
    }
  } catch (err) {
    logger.warn('Platform password sync failed for %s: %s', email, err.message);
  }
}

/**
 * Register (or update) an FCM device token for push notifications.
 * Replaces existing entry for the same deviceId, pushes new one.
 */
async function registerDeviceToken(userId, { fcmToken, deviceId, platform }, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const User = conn.model('User');

  // Remove any existing entry for this deviceId
  await User.updateOne(
    { _id: userId },
    { $pull: { fcmTokens: { deviceId } } },
  );

  // Push the new token
  await User.updateOne(
    { _id: userId },
    {
      $push: {
        fcmTokens: { token: fcmToken, deviceId, platform, updatedAt: new Date() },
      },
    },
  );
}

/**
 * Update a doctor's default reminder timings.
 * Only doctors can update this setting.
 */
async function updateReminderSettings(userId, { defaultReminderTimings }, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const User = conn.model('User');

  const user = await User.findById(userId).select('role defaultReminderTimings');
  if (!user) throw ApiError.notFound('User not found');

  const STAFF_ROLES = ['doctor', 'admin', 'manager'];
  if (!STAFF_ROLES.includes(user.role)) {
    throw ApiError.forbidden('Only staff members can update reminder settings');
  }

  user.defaultReminderTimings = defaultReminderTimings;
  await user.save({ validateModifiedOnly: true });

  return { defaultReminderTimings: user.defaultReminderTimings };
}

module.exports = {
  register,
  login,
  loginByClinicId,
  platformLogin,
  platformRegister,
  connectToClinic,
  refreshTokens,
  logout,
  forgotPassword,
  resetPassword,
  syncUserDirectory: _syncUserDirectory,
  removeFromUserDirectory,
  updateProfile,
  registerDeviceToken,
  updateReminderSettings,
};
