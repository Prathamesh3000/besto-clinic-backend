'use strict';

/**
 * Public routes — no authentication required.
 * Used by the mobile app before login (e.g. clinic selection)
 * and by the website for self-service registration.
 */

const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const Clinic = require('../../models/platform/Clinic');
const Plan = require('../../models/platform/Plan');
const ApiResponse = require('../../utils/ApiResponse');
const ApiError = require('../../utils/ApiError');
const { parsePagination } = require('../../utils/pagination');
const asyncHandler = require('../../utils/asyncHandler');
const { registerClinicSchema, checkSlugSchema } = require('./registration.validator');
const registrationService = require('./registration.service');
const { uploadFile } = require('../../services/storage.service');
const razorpay = require('../../utils/razorpay');
const env = require('../../config/env');

const UserDirectory = require('../../models/platform/UserDirectory');
const authService = require('../auth/auth.service');

// Fields safe to expose publicly (no dbUri, superAdmin, subscription, usage, features)
const PUBLIC_FIELDS = 'name slug clinicCode email phone logo address location status isActive createdAt';

// ─── Geocoding Cache (in-memory, 1h TTL) ────────────

const _geocodeCache = new Map();
const GEOCODE_TTL = 60 * 60 * 1000; // 1 hour

function getCachedGeocode(key) {
  const entry = _geocodeCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > GEOCODE_TTL) {
    _geocodeCache.delete(key);
    return null;
  }
  return entry.data;
}

function setCachedGeocode(key, data) {
  _geocodeCache.set(key, { data, ts: Date.now() });
  // Evict old entries if cache grows too large
  if (_geocodeCache.size > 500) {
    const oldest = _geocodeCache.keys().next().value;
    _geocodeCache.delete(oldest);
  }
}

// ─── Nominatim helpers ──────────────────────────────

const NOMINATIM_UA = 'BestoClinic/1.0 (clinic-discovery)';

function extractLocality(addr) {
  return addr.suburb || addr.neighbourhood || addr.city_district || addr.hamlet || addr.village || '';
}

function extractCity(addr) {
  return addr.city || addr.town || addr.county || addr.state_district || '';
}

// ─── Popular Cities (dynamic) ───────────────────────

const POPULAR_CITIES_CACHE_KEY = '_popularCities';

/**
 * GET /api/v1/public/popular-cities?limit=12
 * Returns distinct cities where active clinics exist, sorted by clinic count.
 */
router.get('/popular-cities', async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 12, 20);

    // Check in-memory cache (1-hour TTL, reuse geocode cache)
    const cached = getCachedGeocode(`${POPULAR_CITIES_CACHE_KEY}:${limit}`);
    if (cached) {
      return res.json(ApiResponse.success('Popular cities fetched', cached));
    }

    const cities = await Clinic.aggregate([
      {
        $match: {
          isActive: true,
          status: 'active',
          deletedAt: null,
          'address.city': { $exists: true, $ne: '' },
          'location.coordinates': { $ne: [0, 0] },
        },
      },
      {
        $group: {
          _id: { $toLower: '$address.city' },
          city: { $first: '$address.city' },
          state: { $first: '$address.state' },
          clinicCount: { $sum: 1 },
          coordinates: { $first: '$location.coordinates' },
        },
      },
      { $sort: { clinicCount: -1 } },
      { $limit: limit },
      {
        $project: {
          _id: 0,
          city: 1,
          state: 1,
          clinicCount: 1,
          lat: { $arrayElemAt: ['$coordinates', 1] },
          lon: { $arrayElemAt: ['$coordinates', 0] },
        },
      },
    ]);

    setCachedGeocode(`${POPULAR_CITIES_CACHE_KEY}:${limit}`, cities);
    res.json(ApiResponse.success('Popular cities fetched', cities));
  } catch (err) {
    next(err);
  }
});

// ─── Reverse Geocode ────────────────────────────────

const geocodeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  keyGenerator: (req) => req.ip,
  message: { success: false, message: 'Too many geocoding requests. Please try again later.' },
});

/**
 * GET /api/v1/public/reverse-geocode?lat=X&lon=Y
 * Reverse geocode coordinates to locality + city via Nominatim.
 */
router.get('/reverse-geocode', geocodeLimiter, async (req, res, next) => {
  try {
    const lat = parseFloat(req.query.lat);
    const lon = parseFloat(req.query.lon);
    if (isNaN(lat) || isNaN(lon)) {
      throw ApiError.badRequest('lat and lon are required');
    }

    // Check cache (round to 3 decimal places ≈ ~110m precision)
    const cacheKey = `rev:${lat.toFixed(3)},${lon.toFixed(3)}`;
    const cached = getCachedGeocode(cacheKey);
    if (cached) {
      return res.json(ApiResponse.success('Reverse geocoded (cached)', cached));
    }

    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&zoom=16&addressdetails=1`;
    const response = await fetch(url, {
      headers: { 'User-Agent': NOMINATIM_UA },
    });

    if (!response.ok) {
      throw ApiError.badRequest('Geocoding service unavailable');
    }

    const data = await response.json();
    const addr = data.address || {};

    const locality = extractLocality(addr);
    const city = extractCity(addr);
    const state = addr.state || '';
    const parts = [locality, city].filter(Boolean);
    const displayName = parts.join(', ') || data.display_name || 'Unknown location';

    const result = { locality, city, state, displayName };
    setCachedGeocode(cacheKey, result);

    res.json(ApiResponse.success('Reverse geocoded', result));
  } catch (err) {
    next(err);
  }
});

// ─── Forward Geocode (Area Search) ──────────────────

/**
 * GET /api/v1/public/geocode-search?q=Viman+Nagar+Pune
 * Forward geocode an area name to coordinates via Nominatim.
 */
router.get('/geocode-search', geocodeLimiter, async (req, res, next) => {
  try {
    const q = (req.query.q || '').trim();
    if (!q || q.length < 2) {
      throw ApiError.badRequest('Search query (q) is required (min 2 chars)');
    }

    // Check cache
    const cacheKey = `fwd:${q.toLowerCase()}`;
    const cached = getCachedGeocode(cacheKey);
    if (cached) {
      return res.json(ApiResponse.success('Geocode search (cached)', cached));
    }

    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&addressdetails=1&limit=5&countrycodes=in`;
    const response = await fetch(url, {
      headers: { 'User-Agent': NOMINATIM_UA },
    });

    if (!response.ok) {
      throw ApiError.badRequest('Geocoding service unavailable');
    }

    const items = await response.json();
    const results = items.map((item) => {
      const addr = item.address || {};
      const locality = extractLocality(addr);
      const city = extractCity(addr);
      const state = addr.state || '';
      const parts = [locality, city, state].filter(Boolean);
      return {
        displayName: parts.join(', ') || item.display_name,
        locality,
        city,
        state,
        lat: parseFloat(item.lat),
        lon: parseFloat(item.lon),
      };
    });

    setCachedGeocode(cacheKey, results);

    res.json(ApiResponse.success('Geocode search results', results));
  } catch (err) {
    next(err);
  }
});

// ─── Search Suggestions (Autocomplete) ──────────────

const searchSuggestionsLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  keyGenerator: (req) => req.ip,
  message: { success: false, message: 'Too many requests — slow down' },
});

/**
 * GET /api/v1/public/search-suggestions?q=ortho&limit=3
 * Lightweight autocomplete endpoint returning doctors + clinics matching the query.
 */
router.get('/search-suggestions', searchSuggestionsLimiter, async (req, res, next) => {
  try {
    const q = (req.query.q || '').trim();
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 3, 1), 5);

    if (!q || q.length < 2) {
      return res.json(ApiResponse.success('Search suggestions', { doctors: [], clinics: [] }));
    }

    const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    const FeaturedDoctor = require('../../models/platform/FeaturedDoctor');

    const [doctors, clinics] = await Promise.all([
      FeaturedDoctor.find({
        isActive: true,
        deletedAt: null,
        $or: [
          { name: { $regex: escaped, $options: 'i' } },
          { specializations: { $elemMatch: { $regex: escaped, $options: 'i' } } },
          { clinicName: { $regex: escaped, $options: 'i' } },
        ],
      })
        .select('name specializations clinicName clinicSlug avatar')
        .limit(limit)
        .lean(),

      Clinic.find({
        isActive: true,
        status: 'active',
        deletedAt: null,
        $or: [
          { name: { $regex: escaped, $options: 'i' } },
          { 'address.locality': { $regex: escaped, $options: 'i' } },
          { 'address.city': { $regex: escaped, $options: 'i' } },
          { clinicCode: { $regex: escaped, $options: 'i' } },
        ],
      })
        .select('name slug logo address.city')
        .limit(limit)
        .lean(),
    ]);

    res.json(ApiResponse.success('Search suggestions', { doctors, clinics }));
  } catch (err) {
    next(err);
  }
});

// ─── Existing Tenant Endpoints ───────────────────────

/**
 * GET /api/v1/public/tenants
 * List all active clinics for mobile app clinic selection.
 */
router.get('/tenants', async (req, res, next) => {
  try {
    const { skip, limit, page, sort } = parsePagination(req.query);
    const filter = { isActive: true, status: 'active', deletedAt: null };

    if (req.query.search) {
      const escaped = req.query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = [
        { name: { $regex: escaped, $options: 'i' } },
        { slug: { $regex: escaped, $options: 'i' } },
        { 'address.locality': { $regex: escaped, $options: 'i' } },
        { 'address.city': { $regex: escaped, $options: 'i' } },
        { clinicCode: { $regex: escaped, $options: 'i' } },
      ];
    }

    // City-based filtering: when city is known, filter by name — no radius cap.
    // Coordinates are only used for distance sorting.
    const hasCity = !!req.query.city;
    if (hasCity) {
      const escaped = req.query.city.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter['address.city'] = { $regex: escaped, $options: 'i' };
    }

    const lat = parseFloat(req.query.lat);
    const lon = parseFloat(req.query.lon);
    const radiusKm = hasCity
      ? 500
      : Math.min(Math.max(parseFloat(req.query.radius) || 50, 5), 500);
    const useGeo = !isNaN(lat) && !isNaN(lon);

    if (useGeo) {
      // Proximity-sorted via $geoNear (aggregate bypasses pre-find middleware)
      const geoFilter = { ...filter, 'location.coordinates': { $ne: [0, 0] } };

      // Apply search filter in geo path too
      if (req.query.search) {
        const escaped = req.query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        geoFilter.$or = [
          { name: { $regex: escaped, $options: 'i' } },
          { 'address.locality': { $regex: escaped, $options: 'i' } },
          { 'address.city': { $regex: escaped, $options: 'i' } },
          { clinicCode: { $regex: escaped, $options: 'i' } },
        ];
      }
      const pipeline = [
        {
          $geoNear: {
            near: { type: 'Point', coordinates: [lon, lat] },
            distanceField: 'distanceMeters',
            maxDistance: radiusKm * 1000,
            query: geoFilter,
            spherical: true,
          },
        },
        { $addFields: { distanceKm: { $round: [{ $divide: ['$distanceMeters', 1000] }, 1] } } },
        {
          $project: {
            name: 1, slug: 1, clinicCode: 1, email: 1, phone: 1, logo: 1,
            address: 1, location: 1, status: 1, isActive: 1,
            createdAt: 1, distanceKm: 1,
          },
        },
        { $skip: skip },
        { $limit: limit },
      ];

      const countPipeline = [
        {
          $geoNear: {
            near: { type: 'Point', coordinates: [lon, lat] },
            distanceField: 'distanceMeters',
            maxDistance: radiusKm * 1000,
            query: geoFilter,
            spherical: true,
          },
        },
        { $count: 'total' },
      ];

      const [items, countResult] = await Promise.all([
        Clinic.aggregate(pipeline),
        Clinic.aggregate(countPipeline),
      ]);
      const total = countResult[0]?.total || 0;
      res.json(ApiResponse.paginated('Clinics fetched', items, { page, limit, total }));
    } else {
      const [items, total] = await Promise.all([
        Clinic.find(filter).select(PUBLIC_FIELDS).sort(sort).skip(skip).limit(limit),
        Clinic.countDocuments(filter),
      ]);
      res.json(ApiResponse.paginated('Clinics fetched', items, { page, limit, total }));
    }
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/public/tenants/:slug
 * Get a single clinic's public info by slug.
 */
router.get('/tenants/:slug', async (req, res, next) => {
  try {
    const clinic = await Clinic.findOne({
      slug: req.params.slug,
      isActive: true,
      status: 'active',
    }).select(PUBLIC_FIELDS);

    if (!clinic) {
      return res.status(404).json({ success: false, message: 'Clinic not found' });
    }

    res.json(ApiResponse.success('Clinic fetched', clinic));
  } catch (err) {
    next(err);
  }
});

// ─── Email Lookup (Unified Login Step 1) ──────────────

const emailLookupLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  keyGenerator: (req) => req.ip,
  message: { success: false, message: 'Too many requests. Please try again later.' },
});

/**
 * POST /api/v1/public/lookup-email
 * Given an email, return which clinic(s) the user belongs to.
 * Never returns slugs — only clinicId, clinicName, clinicLogo, clinicCode.
 */
router.post('/lookup-email', emailLookupLimiter, async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email || typeof email !== 'string') {
      throw ApiError.badRequest('Email is required');
    }

    const normalizedEmail = email.toLowerCase().trim();

    const entries = await UserDirectory.find({ email: normalizedEmail })
      .select('clinicId clinicName clinicLogo clinicCode role')
      .lean();

    // Check PlatformPatient for cross-clinic identity
    const PlatformPatient = require('../../models/platform/PlatformPatient');
    const platformPatient = await PlatformPatient.findOne({
      email: normalizedEmail,
      deletedAt: null,
    }).select('_id name').lean();

    if (!entries.length && !platformPatient) {
      return res.json(ApiResponse.success('Lookup complete', { found: false, hasPlatformIdentity: false }));
    }

    let clinics = entries.map((e) => ({
      clinicId: e.clinicId,
      clinicName: e.clinicName,
      clinicLogo: e.clinicLogo || null,
      clinicCode: e.clinicCode,
      role: e.role,
    }));

    // Fallback: if UserDirectory has no entries but PlatformPatient has connectedClinics,
    // use those as the clinic list (covers sync gaps where UserDirectory wasn't populated)
    if (!clinics.length && platformPatient) {
      const fullPP = await PlatformPatient.findById(platformPatient._id)
        .select('connectedClinics')
        .lean();
      const connected = (fullPP?.connectedClinics || []).filter(Boolean);
      if (connected.length) {
        clinics = connected.map((c) => ({
          clinicId: c.clinicId,
          clinicName: c.clinicName,
          clinicLogo: c.clinicLogo || null,
          clinicCode: c.clinicCode,
          role: c.role || 'patient',
        }));
      }
    }

    res.json(ApiResponse.success('Lookup complete', {
      found: clinics.length > 0,
      clinics,
      hasPlatformIdentity: !!platformPatient,
    }));
  } catch (err) {
    next(err);
  }
});

// ─── Clinic Code Resolution ──────────────────────────

const clinicCodeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  keyGenerator: (req) => req.ip,
  message: { success: false, message: 'Too many requests. Please try again later.' },
});

/**
 * POST /api/v1/public/resolve-clinic-code
 * Given a human-readable clinic code, return the clinic's public info.
 * Never returns slug.
 */
router.post('/resolve-clinic-code', clinicCodeLimiter, async (req, res, next) => {
  try {
    const { code } = req.body;
    if (!code || typeof code !== 'string') {
      throw ApiError.badRequest('Clinic code is required');
    }

    const clinic = await Clinic.findOne({
      clinicCode: code.toUpperCase().trim(),
      status: 'active',
      deletedAt: null,
    }).select('_id name logo clinicCode address');

    if (!clinic) {
      return res.json(ApiResponse.success('Lookup complete', { found: false }));
    }

    res.json(ApiResponse.success('Clinic resolved', {
      found: true,
      clinicId: clinic._id,
      clinicName: clinic.name,
      clinicLogo: clinic.logo || null,
      clinicCode: clinic.clinicCode,
      address: clinic.address,
    }));
  } catch (err) {
    next(err);
  }
});

// ─── Unified Public Login (slug-free) ─────────────────

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  keyGenerator: (req) => req.ip,
  message: { success: false, message: 'Too many login attempts. Please try again later.' },
});

/**
 * POST /api/v1/public/login
 * Login using clinicId or clinicCode (never slug). Resolves to slug internally.
 * Body: { clinicId | clinicCode, email, password, deviceId }
 */
router.post('/login', loginLimiter, async (req, res, next) => {
  try {
    const { clinicId, clinicCode, email, password, deviceId } = req.body;
    if ((!clinicId && !clinicCode) || !email || !password) {
      throw ApiError.badRequest('clinicId or clinicCode, email, and password are required');
    }

    // Resolve clinicId or clinicCode → slug internally (slug never leaves the server)
    const query = clinicId
      ? { _id: clinicId, deletedAt: null }
      : { clinicCode: clinicCode.toUpperCase().trim(), deletedAt: null };
    const clinic = await Clinic.findOne(query)
      .select('slug name logo clinicCode')
      .lean();
    if (!clinic) throw ApiError.notFound('Clinic not found');

    const result = await authService.login({ email, password, deviceId }, clinic.slug);

    // Enrich response with clinic context
    // slug is included for x-tenant-id header on subsequent API calls (internal use only, never displayed)
    result.clinic = {
      clinicId: clinic._id,
      slug: clinic.slug,
      clinicName: clinic.name,
      clinicLogo: clinic.logo || null,
      clinicCode: clinic.clinicCode,
    };

    res.json(ApiResponse.success('Login successful', result));
  } catch (err) {
    next(err);
  }
});

// ─── Public Forgot Password (clinicId-based, slug-free) ──

/**
 * POST /api/v1/public/forgot-password
 * Initiate password reset using clinicId (not slug). Resolves clinicId → slug internally.
 * Body: { clinicId, email }
 */
router.post('/forgot-password', loginLimiter, async (req, res, next) => {
  try {
    const { clinicId, email } = req.body;
    if (!clinicId || !email) {
      throw ApiError.badRequest('clinicId and email are required');
    }

    const clinic = await Clinic.findOne({ _id: clinicId, deletedAt: null })
      .select('slug')
      .lean();
    if (!clinic) throw ApiError.notFound('Clinic not found');

    await authService.forgotPassword(email, clinic.slug);

    // Always respond success (don't reveal whether email exists)
    res.json(ApiResponse.success('If an account exists, a reset link has been sent'));
  } catch (err) {
    next(err);
  }
});

// ─── Public Register (clinicId-based, slug-free) ─────

/**
 * POST /api/v1/public/register
 * Register using clinicId (not slug). Resolves clinicId → slug internally.
 * Body: { clinicId, name, email, phone, password, role }
 */
router.post('/register', loginLimiter, async (req, res, next) => {
  try {
    const { clinicId, name, email, phone, password, role, dateOfBirth } = req.body;
    if (!clinicId || !name || !email || !password) {
      throw ApiError.badRequest('clinicId, name, email, and password are required');
    }

    const clinic = await Clinic.findOne({ _id: clinicId, deletedAt: null })
      .select('slug name logo clinicCode')
      .lean();
    if (!clinic) throw ApiError.notFound('Clinic not found');

    // Age is enforced inside authService.register — see _assertSelfRegistrationAge.
    const result = await authService.register(
      { name, email, phone, password, role: role || 'patient', dateOfBirth },
      clinic.slug,
    );

    result.clinic = {
      clinicId: clinic._id,
      slug: clinic.slug,
      clinicName: clinic.name,
      clinicLogo: clinic.logo || null,
      clinicCode: clinic.clinicCode,
    };

    res.status(201).json(ApiResponse.created('Registration successful', result));
  } catch (err) {
    next(err);
  }
});

// ─── Platform Patient Registration (cross-clinic identity) ──

/**
 * POST /api/v1/public/platform-register
 * Register with platform-scoped identity. Creates PlatformPatient + tenant records.
 * If email already exists in PlatformPatient and password matches → auto-connects to clinic.
 * Body: { clinicId, name, email, phone, password, role }
 */
router.post('/platform-register', loginLimiter, async (req, res, next) => {
  try {
    const { clinicId, name, email, phone, password, role, dateOfBirth } = req.body;
    if (!clinicId || !name || !email || !password) {
      throw ApiError.badRequest('clinicId, name, email, and password are required');
    }

    // Age is enforced inside authService.platformRegister — see _assertSelfRegistrationAge.
    const result = await authService.platformRegister(
      { name, email, phone, password, role: role || 'patient', dateOfBirth },
      clinicId,
    );

    res.status(201).json(ApiResponse.created('Registration successful', result));
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/public/connect-to-clinic
 * Connect an existing platform patient to a new clinic.
 * Verifies PlatformPatient credentials, creates tenant User + Patient.
 * Body: { email, password, clinicId }
 */
router.post('/connect-to-clinic', loginLimiter, async (req, res, next) => {
  try {
    const { email, password, clinicId } = req.body;
    if (!email || !password || !clinicId) {
      throw ApiError.badRequest('email, password, and clinicId are required');
    }

    const result = await authService.connectToClinic({ email, password, clinicId });

    res.json(ApiResponse.success('Connected to clinic successfully', result));
  } catch (err) {
    next(err);
  }
});

// ─── Plans ───────────────────────────────────────────

/**
 * GET /api/v1/public/plans
 * List all public, active plans with pricing and features.
 */
router.get('/plans', async (req, res, next) => {
  try {
    const plans = await Plan.find({ isPublic: true, isActive: true })
      .select('name slug description pricing features highlights badge trial displayOrder tier')
      .sort({ displayOrder: 1 });

    res.json(ApiResponse.success('Plans fetched', plans));
  } catch (err) {
    next(err);
  }
});

// ─── Registration Payment ────────────────────────────

/**
 * POST /api/v1/public/create-registration-order
 * Create a Razorpay order for a paid plan during registration.
 * Returns order details for the frontend to use with embedded checkout.
 */
router.post('/create-registration-order', async (req, res, next) => {
  try {
    const { planSlug, billingCycle = 'monthly' } = req.body;

    if (!planSlug) {
      throw ApiError.badRequest('planSlug is required');
    }
    if (!['monthly', 'yearly'].includes(billingCycle)) {
      throw ApiError.badRequest('billingCycle must be "monthly" or "yearly"');
    }

    const plan = await Plan.findOne({ slug: planSlug, isActive: true, isPublic: true });
    if (!plan) {
      throw ApiError.notFound('Plan not found or not available');
    }

    const amount = plan.pricing[billingCycle] || 0;

    // Free plans don't need payment
    if (amount === 0) {
      return res.json(ApiResponse.success('No payment required', { orderRequired: false }));
    }

    const currency = plan.pricing.currency || 'INR';
    const receipt = `reg_${Date.now()}`;

    const gatewayConfig = razorpay.checkConfig();
    if (!gatewayConfig.ok) {
      throw ApiError.serviceUnavailable(`Payment gateway is not configured: ${gatewayConfig.reason}`);
    }

    let order;
    try {
      order = await razorpay.createOrder(
        Math.round(amount * 100), // Razorpay expects paise, as an integer
        currency,
        receipt,
        { planSlug, billingCycle },
      );
    } catch (rzpErr) {
      const msg = rzpErr?.error?.description || rzpErr?.message || 'Payment gateway error';
      throw ApiError.badRequest(`Razorpay: ${msg}`);
    }

    res.json(ApiResponse.success('Order created', {
      orderRequired: true,
      orderId: order.id,
      keyId: env.RAZORPAY_KEY_ID,
      amount,
      currency,
      planName: plan.name,
    }));
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/public/payment-callback
 * Receives the POST redirect from Razorpay Embedded Checkout,
 * then redirects to the frontend with payment params as query string.
 */
router.post('/payment-callback', require('express').urlencoded({ extended: false }), (req, res) => {
  const { razorpay_payment_id, razorpay_order_id, razorpay_signature } = req.body;

  const frontendUrl = env.FRONTEND_URL || 'http://localhost:5173';
  const params = new URLSearchParams();
  if (razorpay_payment_id) params.set('razorpay_payment_id', razorpay_payment_id);
  if (razorpay_order_id) params.set('razorpay_order_id', razorpay_order_id);
  if (razorpay_signature) params.set('razorpay_signature', razorpay_signature);

  res.redirect(302, `${frontendUrl}/register?${params.toString()}`);
});

// ─── Slug Availability ──────────────────────────────

/**
 * GET /api/v1/public/check-slug/:slug
 * Check if a clinic slug/subdomain is available.
 */
router.get('/check-slug/:slug', async (req, res, next) => {
  try {
    const { error } = checkSlugSchema.validate({ slug: req.params.slug });
    if (error) {
      throw ApiError.badRequest(error.details[0].message);
    }

    const result = await registrationService.checkSlugAvailability(req.params.slug);
    res.json(ApiResponse.success('Slug availability checked', result));
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/public/free-plan-eligibility?email=<admin email>
 * Whether this founder may still take the Free plan. The registration endpoint
 * enforces the same rule — this only lets the signup form say so up front
 * instead of failing at the last step.
 */
router.get('/free-plan-eligibility', async (req, res, next) => {
  try {
    const email = String(req.query.email || '').trim();
    if (!email) throw ApiError.badRequest('email is required');

    const result = await registrationService.checkFreePlanEligibility({ adminEmail: email });
    res.json(ApiResponse.success('Free plan eligibility checked', result));
  } catch (err) {
    next(err);
  }
});

// ─── Clinic Registration ────────────────────────────

/**
 * POST /api/v1/public/register-clinic
 * Self-service clinic registration.
 */
router.post('/register-clinic', async (req, res, next) => {
  try {
    const { error, value } = registerClinicSchema.validate(req.body, { abortEarly: false });
    if (error) {
      const messages = error.details.map(d => d.message);
      throw ApiError.badRequest('Validation failed', messages);
    }

    const result = await registrationService.registerClinic(value);
    res.status(201).json(ApiResponse.created('Clinic registered successfully', result));
  } catch (err) {
    next(err);
  }
});

// ─── Provisioning Status ────────────────────────────

/**
 * GET /api/v1/public/provisioning-status/:token
 * Poll provisioning progress using the registration token.
 */
router.get('/provisioning-status/:token', async (req, res, next) => {
  try {
    const result = await registrationService.getProvisioningStatus(req.params.token);
    res.json(ApiResponse.success('Provisioning status fetched', result));
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/public/provisioning-retry/:token
 * Retry a failed provisioning using the registration token.
 */
router.post('/provisioning-retry/:token', async (req, res, next) => {
  try {
    const result = await registrationService.retryProvisioning(req.params.token);
    res.json(ApiResponse.success('Provisioning retry enqueued', result));
  } catch (err) {
    next(err);
  }
});

// ─── Uploads (logo + registration documents) ─────────

/**
 * Both upload endpoints are unauthenticated by design — they run during clinic
 * self-registration, before an account exists. Without a dedicated limiter the
 * only ceiling was the shared global limiter, which let an anonymous caller
 * write to disk until it filled. Registration documents are the evidence the
 * platform approves clinics on, so this path is worth its own budget.
 */
const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  keyGenerator: (req) => req.ip,
  message: { success: false, message: 'Too many uploads. Please try again later.' },
});

/**
 * POST /api/v1/public/upload-logo
 * Upload a clinic logo during registration (base64-encoded).
 * Body: { imageData (base64), mimeType }
 */
router.post('/upload-logo', uploadLimiter, require('express').json({ limit: '3mb' }), async (req, res, next) => {
  try {
    const { imageData, mimeType } = req.body;

    if (!imageData || !mimeType) {
      throw ApiError.badRequest('imageData (base64) and mimeType are required');
    }

    const allowedTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];
    if (!allowedTypes.includes(mimeType)) {
      throw ApiError.badRequest('Only PNG, JPG, WebP, or SVG files are allowed');
    }

    const MAX_SIZE = 2 * 1024 * 1024;
    const estimatedSize = Math.ceil(imageData.length * 0.75);
    if (estimatedSize > MAX_SIZE) {
      throw ApiError.badRequest('Logo must be under 2MB');
    }

    const ext = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp', 'image/svg+xml': '.svg' }[mimeType] || '.png';
    const buffer = Buffer.from(imageData, 'base64');
    const fileInfo = await uploadFile(
      { buffer, originalname: `clinic-logo-${Date.now()}${ext}`, mimetype: mimeType },
      'logos',
    );

    res.status(201).json(ApiResponse.created('Logo uploaded', {
      url: fileInfo.fileUrl,
    }));
  } catch (err) {
    next(err);
  }
});

// ─── Document Upload ────────────────────────────────

/**
 * POST /api/v1/public/upload-document
 * Upload a registration document (base64-encoded).
 * Body: { fileName, mimeType, fileData (base64) }
 */
router.post('/upload-document', uploadLimiter, async (req, res, next) => {
  try {
    const { fileName, mimeType, fileData } = req.body;

    if (!fileName || !mimeType || !fileData) {
      throw ApiError.badRequest('fileName, mimeType, and fileData (base64) are required');
    }

    // Validate file type
    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
    if (!allowedTypes.includes(mimeType)) {
      throw ApiError.badRequest('Only PDF, JPG, and PNG files are allowed');
    }

    // Validate file size (5MB max)
    const MAX_SIZE = 5 * 1024 * 1024;
    const estimatedSize = Math.ceil(fileData.length * 0.75);
    if (estimatedSize > MAX_SIZE) {
      throw ApiError.badRequest('File size exceeds 5MB limit');
    }

    const buffer = Buffer.from(fileData, 'base64');
    const fileInfo = await uploadFile(
      { buffer, originalname: fileName, mimetype: mimeType },
      'registration-documents',
    );

    res.status(201).json(ApiResponse.created('Document uploaded', {
      url: fileInfo.fileUrl,
      originalName: fileName,
      size: buffer.length,
    }));
  } catch (err) {
    next(err);
  }
});

// ─── Featured Doctors (Platform Directory) ────────────────
// Public endpoints for doctor discovery — no auth required.

const FeaturedDoctor = require('../../models/platform/FeaturedDoctor');
const { getTenantConnection } = require('../../db/tenantConnectionManager');

/**
 * GET /api/v1/public/featured-doctors
 * Search featured doctors across all clinics.
 * Query: ?specialization=X&city=Y&search=Z&lat=N&lon=N&radiusKm=N&limit=10&page=1
 */
router.get('/featured-doctors', async (req, res, next) => {
  try {
    const { skip, limit, page } = parsePagination(req.query);
    const filter = { isActive: true, deletedAt: null };

    if (req.query.specialization) {
      const escaped = req.query.specialization.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.specializations = { $elemMatch: { $regex: escaped, $options: 'i' } };
    }

    if (req.query.city) {
      filter.clinicCity = {
        $regex: req.query.city.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
        $options: 'i',
      };
    }

    if (req.query.search) {
      const escaped = req.query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = [
        { name: { $regex: escaped, $options: 'i' } },
        { specializations: { $elemMatch: { $regex: escaped, $options: 'i' } } },
        { clinicName: { $regex: escaped, $options: 'i' } },
      ];
    }

    const lat = parseFloat(req.query.lat);
    const lon = parseFloat(req.query.lon);
    const useGeo = !isNaN(lat) && !isNaN(lon);

    if (useGeo) {
      // ── Doctor-based geo search ──
      // Query FeaturedDoctor directly using its own location field,
      // then group results by clinic sorted by distance.
      //
      // IMPORTANT: $geoNear's `query` param does not reliably support
      // complex operators like $elemMatch on array fields or $or.
      // Keep only simple scalar filters in $geoNear.query; apply
      // specialization/search filters in a separate $match stage.
      // When city is provided, it handles the boundary — no radius cap needed.
      // Coordinates are only used for distance sorting, not filtering.
      const hasCity = !!req.query.city;
      const radiusKm = hasCity
        ? 500
        : Math.min(parseFloat(req.query.radiusKm) || 50, 500);

      // Simple filters safe for $geoNear
      const geoBaseFilter = {
        isActive: true,
        deletedAt: null,
        'location.coordinates': { $ne: [0, 0] },
      };
      if (hasCity) {
        geoBaseFilter.clinicCity = filter.clinicCity;
      }

      // Complex filters (specialization, search) applied after $geoNear
      const postMatch = {};
      if (req.query.specialization) {
        const esc = req.query.specialization.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        postMatch.specializations = { $elemMatch: { $regex: esc, $options: 'i' } };
      }
      if (req.query.search) {
        const esc = req.query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        postMatch.$or = [
          { name: { $regex: esc, $options: 'i' } },
          { specializations: { $elemMatch: { $regex: esc, $options: 'i' } } },
          { clinicName: { $regex: esc, $options: 'i' } },
        ];
      }

      const pipeline = [
        {
          $geoNear: {
            near: { type: 'Point', coordinates: [lon, lat] },
            distanceField: 'distanceMeters',
            maxDistance: radiusKm * 1000,
            query: geoBaseFilter,
            spherical: true,
          },
        },
      ];
      if (Object.keys(postMatch).length > 0) {
        pipeline.push({ $match: postMatch });
      }
      pipeline.push(
        { $addFields: { distanceKm: { $round: [{ $divide: ['$distanceMeters', 1000] }, 1] } } },
        { $sort: { distanceMeters: 1, averageRating: -1 } },
      );

      const doctors = await FeaturedDoctor.aggregate(pipeline);

      if (doctors.length === 0) {
        return res.json(ApiResponse.success('Featured doctors fetched', []));
      }

      // Group doctors by clinic, preserving distance-based order
      const clinicGroups = {};
      const clinicOrder = [];
      for (const doc of doctors) {
        if (!clinicGroups[doc.clinicSlug]) {
          clinicGroups[doc.clinicSlug] = {
            clinicName: doc.clinicName,
            clinicSlug: doc.clinicSlug,
            clinicCity: doc.clinicCity,
            clinicLogo: doc.clinicLogo || '',
            distanceKm: doc.distanceKm,
            doctors: [],
          };
          clinicOrder.push(doc.clinicSlug);
        }
        const { distanceMeters, location, __v, ...docData } = doc;
        clinicGroups[doc.clinicSlug].doctors.push(docData);
      }

      const results = clinicOrder.map(slug => clinicGroups[slug]);

      res.json(ApiResponse.success('Featured doctors fetched', results));
    } else {
      const [items, total] = await Promise.all([
        FeaturedDoctor.find(filter)
          .select('-__v')
          .sort({ averageRating: -1, totalReviews: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        FeaturedDoctor.countDocuments(filter),
      ]);

      // Group into clinic buckets (same format as geo results) for chatbot consistency
      if (req.query.specialization || req.query.search) {
        const clinicGroups = {};
        const clinicOrder = [];
        for (const doc of items) {
          if (!clinicGroups[doc.clinicSlug]) {
            clinicGroups[doc.clinicSlug] = {
              clinicName: doc.clinicName,
              clinicSlug: doc.clinicSlug,
              clinicCity: doc.clinicCity,
              clinicLogo: doc.clinicLogo || '',
              distanceKm: null,
              doctors: [],
            };
            clinicOrder.push(doc.clinicSlug);
          }
          clinicGroups[doc.clinicSlug].doctors.push(doc);
        }
        const grouped = clinicOrder.map(slug => clinicGroups[slug]);
        return res.json(ApiResponse.success('Featured doctors fetched', grouped));
      }

      res.json(ApiResponse.paginated('Featured doctors fetched', items, { page, limit, total }));
    }
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/public/featured-doctors/:id
 * Single featured doctor detail + recent approved reviews from tenant DB.
 */
router.get('/featured-doctors/:id', async (req, res, next) => {
  try {
    const { ObjectId } = require('mongoose').Types;
    if (!ObjectId.isValid(req.params.id)) {
      throw ApiError.badRequest('Invalid doctor ID');
    }

    const doctor = await FeaturedDoctor.findOne({
      _id: req.params.id,
      isActive: true,
    }).lean();
    if (!doctor) throw ApiError.notFound('Doctor not found');

    // Fetch recent approved reviews from tenant DB
    let recentReviews = [];
    try {
      const conn = await getTenantConnection(doctor.clinicSlug);
      const Review = conn.model('Review');
      const Patient = conn.model('Patient');

      const reviews = await Review.find({
        doctor: new ObjectId(doctor.tenantDoctorId),
        status: 'approved',
        deletedAt: null,
      })
        .sort({ createdAt: -1 })
        .limit(10)
        .lean();

      // Attach patient names (respect anonymous)
      const patientIds = reviews.filter((r) => !r.isAnonymous).map((r) => r.patient);
      const patients = patientIds.length
        ? await Patient.find({ _id: { $in: patientIds } }).select('name').lean()
        : [];
      const patientMap = {};
      for (const p of patients) {
        // Format: "FirstName L." (first name + last name initial)
        const nameParts = (p.name || '').trim().split(' ');
        const firstName = nameParts[0] || 'Patient';
        const lastInitial = nameParts.length > 1 ? nameParts[nameParts.length - 1][0] + '.' : '';
        patientMap[String(p._id)] = lastInitial ? `${firstName} ${lastInitial}` : firstName;
      }

      recentReviews = reviews.map((r) => ({
        rating: r.rating,
        title: r.title || '',
        comment: r.comment || '',
        patientName: r.isAnonymous ? 'Anonymous' : (patientMap[String(r.patient)] || 'Patient'),
        createdAt: r.createdAt,
      }));
    } catch (_) {
      // If tenant DB is unreachable, return doctor without reviews
    }

    res.json(ApiResponse.success('Doctor fetched', { ...doctor, recentReviews }));
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/public/clinics/:slug/doctors
 * All featured doctors for a specific clinic.
 */
router.get('/clinics/:slug/doctors', async (req, res, next) => {
  try {
    const doctors = await FeaturedDoctor.find({
      clinicSlug: req.params.slug,
      isActive: true,
    })
      .select('-__v')
      .sort({ averageRating: -1 })
      .lean();

    res.json(ApiResponse.success('Clinic doctors fetched', doctors));
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/public/clinics/:slug/branches
 * All active branches for a clinic, with doctor count per branch.
 */
router.get('/clinics/:slug/branches', async (req, res, next) => {
  try {
    const { slug } = req.params;

    const clinic = await Clinic.findOne({
      slug, isActive: true, status: 'active', deletedAt: null,
    }).select('_id');
    if (!clinic) throw ApiError.notFound('Clinic not found');

    const conn = await getTenantConnection(slug);
    const Branch = conn.model('Branch');
    const User = conn.model('User');

    const branches = await Branch.find({ isActive: true, deletedAt: null })
      .select('name code address phone email operatingHours')
      .lean();

    // Doctor count per branch (single aggregation)
    const doctorCounts = await User.aggregate([
      { $match: { role: 'doctor', isActive: true, deletedAt: null } },
      { $group: { _id: '$branch', count: { $sum: 1 } } },
    ]);
    const countMap = Object.fromEntries(
      doctorCounts.map((d) => [String(d._id), d.count]),
    );

    const result = branches.map((b) => ({
      ...b,
      doctorCount: countMap[String(b._id)] || 0,
    }));

    res.json(ApiResponse.success('Clinic branches fetched', result));
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/public/clinics/:slug/doctors/:doctorId/availability
 * Available time slots for a given date.
 * Query: ?date=YYYY-MM-DD
 * Returns 30-min slots from 9 AM to 6 PM, excluding booked ones.
 */
router.get('/clinics/:slug/doctors/:doctorId/availability', async (req, res, next) => {
  try {
    const { slug, doctorId } = req.params;
    const { date, branch } = req.query;

    const availabilityService = require('../../services/availability.service');
    const result = await availabilityService.getDoctorAvailability(doctorId, date, slug, branch || null);

    res.json(ApiResponse.success('Availability fetched', {
      ...result,
      clinicSlug: slug,
    }));
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/public/clinics/:slug/doctors/:doctorId/availability-summary
 * Monthly availability summary for calendar heat map.
 * Query: ?month=4&year=2026&branch=BRANCH_ID
 */
router.get('/clinics/:slug/doctors/:doctorId/availability-summary', async (req, res, next) => {
  try {
    const { slug, doctorId } = req.params;
    const { month, year, branch } = req.query;

    if (!month || !year) {
      return res.status(400).json(ApiResponse.error('month and year query parameters are required'));
    }

    const availabilityService = require('../../services/availability.service');
    const result = await availabilityService.getMonthlyAvailabilitySummary(
      doctorId,
      parseInt(month, 10),
      parseInt(year, 10),
      slug,
      branch || null,
    );

    res.json(ApiResponse.success('Availability summary fetched', result));
  } catch (err) {
    next(err);
  }
});

// ─── Guest Dental Scan ─────────────────────────────────
// Public endpoints for the website chatbot — no auth required.

const crypto = require('crypto');
const GuestScan = require('../../models/platform/GuestScan');

const GUEST_ANGLES = ['front', 'left', 'right', 'upper', 'lower', 'tongue']; // all valid angles (backward compat)
const GUEST_SCAN_MODE_ANGLES = {
  guided_3pos:    ['left', 'front', 'right', 'tongue'],
  classic_5angle: ['front', 'left', 'right', 'upper', 'lower'],
  enhanced_6pos:  ['front_smile', 'left_lateral', 'right_lateral', 'upper_occlusal', 'lower_occlusal', 'close_smile'], // v2.0
};
function _getGuestRequiredAngles(scanMode) {
  return GUEST_SCAN_MODE_ANGLES[scanMode] || GUEST_SCAN_MODE_ANGLES.guided_3pos;
}

const guestScanInitLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  keyGenerator: (req) => req.ip,
  message: { success: false, message: 'Too many scan requests. Please try again later.' },
});

/**
 * POST /api/v1/public/guest-scan/initiate
 * Start a guest dental scan session. Returns a sessionToken for subsequent calls.
 */
router.post('/guest-scan/initiate', guestScanInitLimiter, async (req, res, next) => {
  try {
    const { consentGiven } = req.body;
    if (consentGiven !== true) {
      throw ApiError.badRequest('Consent is required to proceed');
    }

    const scanMode = req.body.scanMode || 'guided_3pos';
    if (!GUEST_SCAN_MODE_ANGLES[scanMode]) {
      throw ApiError.badRequest(`scanMode must be one of: ${Object.keys(GUEST_SCAN_MODE_ANGLES).join(', ')}`);
    }

    const sessionToken = crypto.randomUUID();
    const scan = await GuestScan.create({
      sessionToken,
      scanMode,
      consentGiven: true,
      consentTimestamp: new Date(),
      consentIp: req.ip,
      userAgent: req.headers['user-agent'] || null,
      referrer: req.headers.referer || null,
    });

    res.status(201).json(ApiResponse.created('Guest scan initiated', {
      sessionToken,
      scanId: scan._id,
      status: scan.status,
    }));
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/v1/public/guest-scan/:token/upload
 * Upload a dental image for a specific angle.
 */
router.put(
  '/guest-scan/:token/upload',
  require('express').json({ limit: '10mb' }),
  async (req, res, next) => {
    try {
      const { token } = req.params;
      const { imageData, angle, mimeType } = req.body;

      if (!imageData) throw ApiError.badRequest('imageData (base64) is required');
      if (!angle || !GUEST_ANGLES.includes(angle)) {
        throw ApiError.badRequest(`angle must be one of: ${GUEST_ANGLES.join(', ')}`);
      }

      const scan = await GuestScan.findOne({ sessionToken: token });
      if (!scan) throw ApiError.notFound('Scan session not found or expired');

      if (scan.status !== 'capturing') {
        throw ApiError.badRequest(`Cannot upload images in "${scan.status}" state`);
      }

      // Validate angle is allowed for this scan's mode
      const allowedAngles = _getGuestRequiredAngles(scan.scanMode);
      if (!allowedAngles.includes(angle)) {
        throw ApiError.badRequest(
          `Angle "${angle}" is not valid for scan mode "${scan.scanMode}". Allowed: ${allowedAngles.join(', ')}`,
        );
      }

      // Check duplicate angle
      if (scan.images.some((img) => img.angle === angle)) {
        throw ApiError.conflict(`Image for "${angle}" has already been uploaded`);
      }

      // Save to storage
      const imageBuffer = Buffer.from(imageData, 'base64');
      const mime = mimeType || 'image/jpeg';
      const ext = { 'image/png': '.png', 'image/webp': '.webp' }[mime] || '.jpg';
      const { fileUrl, fileName } = await uploadFile(
        {
          buffer: imageBuffer,
          originalname: `guest-scan-${angle}-${Date.now()}${ext}`,
          mimetype: mime,
        },
        'guest-scans',
      );

      scan.images.push({
        angle,
        fileUrl,
        fileName,
        fileSize: imageBuffer.length,
        uploadedAt: new Date(),
      });
      await scan.save();

      const uploadedAngles = scan.images.map((img) => img.angle);
      const remaining = _getGuestRequiredAngles(scan.scanMode).filter((a) => !uploadedAngles.includes(a));

      res.json(ApiResponse.success('Image uploaded', {
        uploadedAngles,
        remaining,
        totalUploaded: uploadedAngles.length,
      }));
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/public/guest-scan/:token/validate-frame
 * Lightweight AI validation of a captured dental frame.
 * Used by the immersive scanner to verify angle/quality before proceeding.
 */
router.post(
  '/guest-scan/:token/validate-frame',
  require('express').json({ limit: '5mb' }),
  async (req, res, next) => {
    try {
      const { token } = req.params;
      const { imageData, expectedAngle, mimeType } = req.body;

      if (!imageData) throw ApiError.badRequest('imageData (base64) is required');
      if (!expectedAngle || !['left', 'front', 'right', 'tongue'].includes(expectedAngle)) {
        throw ApiError.badRequest('expectedAngle must be one of: left, front, right, tongue');
      }

      const scan = await GuestScan.findOne({ sessionToken: token });
      if (!scan) throw ApiError.notFound('Scan session not found or expired');

      if (scan.status !== 'capturing') {
        throw ApiError.badRequest(`Cannot validate frames in "${scan.status}" state`);
      }

      const { validateDentalFrame } = require('../../services/aiAnalysis.service');
      const result = await validateDentalFrame(imageData, mimeType || 'image/jpeg', expectedAngle);

      res.json(ApiResponse.success('Frame validated', result));
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/public/guest-scan/:token/detect-teeth
 * Guest counterpart of POST /dental-scans/:id/detect-teeth — reports which teeth
 * are visible in a captured frame so the scanner can label them.
 *
 * The app has always called this; it simply did not exist, so every guest scan
 * silently lost per-tooth detection (useAutoCapture swallows the failure and
 * carries on with an empty tooth list).
 */
router.post(
  '/guest-scan/:token/detect-teeth',
  require('express').json({ limit: '10mb' }),
  async (req, res, next) => {
    try {
      const { token } = req.params;
      const { imageData, angle, mimeType } = req.body;

      if (!imageData) throw ApiError.badRequest('imageData (base64) is required');
      if (!angle || !['left', 'front', 'right', 'tongue'].includes(angle)) {
        throw ApiError.badRequest('angle must be one of: left, front, right, tongue');
      }

      const scan = await GuestScan.findOne({ sessionToken: token });
      if (!scan) throw ApiError.notFound('Scan session not found or expired');

      if (scan.status !== 'capturing') {
        throw ApiError.badRequest(`Cannot detect teeth in "${scan.status}" state`);
      }

      const { detectTeethInFrame } = require('../../services/aiAnalysis.service');
      const result = await detectTeethInFrame(imageData, mimeType || 'image/jpeg', angle);

      res.json(ApiResponse.success('Teeth detected', result));
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/public/guest-scan/:token/upload-frame (Enhanced v2.0)
 * Upload a single frame for a position in enhanced_6pos mode.
 * Supports multi-frame capture (3-5 frames per position).
 */
router.post(
  '/guest-scan/:token/upload-frame',
  require('express').json({ limit: '10mb' }),
  async (req, res, next) => {
    try {
      const { token } = req.params;
      const { positionId, positionIndex, frameIndex, frameCount, imageData, quality, mimeType } = req.body;

      // Validation
      if (!imageData) throw ApiError.badRequest('imageData (base64) is required');
      if (positionId == null) throw ApiError.badRequest('positionId is required');
      if (positionIndex == null) throw ApiError.badRequest('positionIndex is required');
      if (frameIndex == null) throw ApiError.badRequest('frameIndex is required');
      if (!frameCount || frameCount < 1 || frameCount > 10) {
        throw ApiError.badRequest('frameCount must be between 1 and 10');
      }
      if (!quality || typeof quality !== 'object') {
        throw ApiError.badRequest('quality metrics object is required');
      }

      // Find scan
      const scan = await GuestScan.findOne({ sessionToken: token });
      if (!scan) throw ApiError.notFound('Scan session not found or expired');

      if (scan.status !== 'capturing') {
        throw ApiError.badRequest(`Cannot upload frames in "${scan.status}" state`);
      }

      if (scan.scanMode !== 'enhanced_6pos') {
        throw ApiError.badRequest('Multi-frame upload only available for enhanced_6pos mode');
      }

      // Validate positionId
      const allowedPositions = _getGuestRequiredAngles(scan.scanMode);
      if (!allowedPositions.includes(positionId)) {
        throw ApiError.badRequest(
          `Position "${positionId}" not valid. Allowed: ${allowedPositions.join(', ')}`
        );
      }

      // Find or create position entry
      let position = scan.enhancedPositions.find(
        (p) => p.positionId === positionId && p.positionIndex === positionIndex
      );

      if (!position) {
        // Create new position entry
        position = {
          positionId,
          positionIndex,
          frames: [],
          selectedFrameIndex: 0, // Will be updated on finalize
          completedAt: null,
        };
        scan.enhancedPositions.push(position);
      }

      // Check duplicate frame
      if (position.frames.some((f) => f.frameIndex === frameIndex)) {
        throw ApiError.conflict(`Frame ${frameIndex} already uploaded for this position`);
      }

      // Save frame to storage
      const imageBuffer = Buffer.from(imageData, 'base64');
      const mime = mimeType || 'image/jpeg';
      const ext = { 'image/png': '.png', 'image/webp': '.webp' }[mime] || '.jpg';
      const { fileUrl, fileName } = await uploadFile(
        {
          buffer: imageBuffer,
          originalname: `guest-scan-${positionId}-frame${frameIndex}-${Date.now()}${ext}`,
          mimetype: mime,
        },
        'guest-scans'
      );

      // Add frame to position
      position.frames.push({
        frameIndex,
        fileUrl,
        fileName,
        fileSize: imageBuffer.length,
        uploadedAt: new Date(),
        quality: {
          overall: quality.overall || 0,
          blur: quality.blur || 0,
          brightness: quality.brightness || 0,
          contrast: quality.contrast || 0,
          sharpness: quality.sharpness || 0,
        },
      });

      await scan.save();

      res.json(
        ApiResponse.success('Frame uploaded', {
          positionId,
          frameIndex,
          totalFrames: position.frames.length,
          remaining: frameCount - position.frames.length,
          complete: position.frames.length >= frameCount,
        })
      );
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/v1/public/guest-scan/:token/finalize-position (Enhanced v2.0)
 * Finalize a position after all frames uploaded - selects best frame and validates.
 */
router.post('/guest-scan/:token/finalize-position', async (req, res, next) => {
  try {
    const { token } = req.params;
    const { positionId, positionIndex, selectedFrameIndex } = req.body;

    if (positionId == null) throw ApiError.badRequest('positionId is required');
    if (positionIndex == null) throw ApiError.badRequest('positionIndex is required');
    if (selectedFrameIndex == null) throw ApiError.badRequest('selectedFrameIndex is required');

    const scan = await GuestScan.findOne({ sessionToken: token });
    if (!scan) throw ApiError.notFound('Scan session not found or expired');

    if (scan.scanMode !== 'enhanced_6pos') {
      throw ApiError.badRequest('Position finalization only available for enhanced_6pos mode');
    }

    // Find position
    const position = scan.enhancedPositions.find(
      (p) => p.positionId === positionId && p.positionIndex === positionIndex
    );

    if (!position) {
      throw ApiError.notFound(`Position ${positionId} not found`);
    }

    // Validate selectedFrameIndex
    if (selectedFrameIndex < 0 || selectedFrameIndex >= position.frames.length) {
      throw ApiError.badRequest(
        `selectedFrameIndex ${selectedFrameIndex} out of range (0-${position.frames.length - 1})`
      );
    }

    // Update position
    position.selectedFrameIndex = selectedFrameIndex;
    position.completedAt = new Date();

    // Optional: Run server-side validation on selected frame
    // For Phase 1 MVP, we'll skip this and rely on client-side validation
    // In Phase 2, add teeth detection and quality validation here

    await scan.save();

    // Check if all positions complete
    const requiredPositions = _getGuestRequiredAngles(scan.scanMode);
    const completedPositions = scan.enhancedPositions.filter((p) => p.completedAt != null);
    const allComplete = completedPositions.length >= requiredPositions.length;

    // Get next position
    let nextPosition = null;
    if (!allComplete) {
      const completedIds = new Set(completedPositions.map((p) => p.positionId));
      const nextPositionId = requiredPositions.find((id) => !completedIds.has(id));
      if (nextPositionId) {
        const nextIndex = requiredPositions.indexOf(nextPositionId);
        nextPosition = {
          positionId: nextPositionId,
          positionIndex: nextIndex,
        };
      }
    }

    res.json(
      ApiResponse.success('Position finalized', {
        positionId,
        selectedFrameIndex,
        selectedFrame: position.frames[selectedFrameIndex],
        completedPositions: completedPositions.length,
        totalPositions: requiredPositions.length,
        allComplete,
        nextPosition,
      })
    );
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/public/guest-scan/:token/lead
 * Submit lead capture data (name, email, phone).
 */
router.post('/guest-scan/:token/lead', async (req, res, next) => {
  try {
    const { token } = req.params;
    const { name, email, phone } = req.body;

    if (!name || name.trim().length < 2) throw ApiError.badRequest('Name is required (min 2 chars)');
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw ApiError.badRequest('Valid email is required');

    const scan = await GuestScan.findOne({ sessionToken: token });
    if (!scan) throw ApiError.notFound('Scan session not found or expired');

    scan.lead = {
      name: name.trim(),
      email: email.trim().toLowerCase(),
      ...(phone && phone.trim().length >= 7 ? { phone: phone.trim() } : {}),
      capturedAt: new Date(),
    };
    await scan.save();

    res.json(ApiResponse.success('Lead info captured', { status: scan.status }));
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/public/guest-scan/:token/analyze
 * Trigger AI analysis — requires all angles for the scan mode + lead captured.
 */
router.post('/guest-scan/:token/analyze', async (req, res, next) => {
  try {
    const { token } = req.params;

    const scan = await GuestScan.findOne({ sessionToken: token });
    if (!scan) throw ApiError.notFound('Scan session not found or expired');

    if (scan.status !== 'capturing') {
      throw ApiError.badRequest(`Cannot analyze in "${scan.status}" state`);
    }

    // Require at least 1 image
    if (!scan.images || scan.images.length === 0) {
      throw ApiError.badRequest('At least one dental image is required for analysis');
    }

    // Validate lead captured
    if (!scan.lead || !scan.lead.email) {
      throw ApiError.badRequest('Contact information is required before analysis');
    }

    // Save status to MongoDB FIRST, then enqueue job.
    // The worker reads status from DB — must be 'processing' before it picks up the job.
    scan.status = 'processing';
    await scan.save();

    const { guestScanQueue } = require('../../jobs/queues');
    const job = await guestScanQueue.add('analyze-guest-scan', {
      scanId: String(scan._id),
    });
    scan.analysisJobId = String(job.id);
    await scan.save();

    res.status(202).json(ApiResponse.success('Analysis queued', {
      status: scan.status,
    }));
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/public/guest-scan/:token/status
 * Poll scan status and get results when completed.
 */
router.get('/guest-scan/:token/status', async (req, res, next) => {
  try {
    const { token } = req.params;

    const scan = await GuestScan.findOne({ sessionToken: token })
      .select('status result failureReason images lead');
    if (!scan) throw ApiError.notFound('Scan session not found or expired');

    const data = {
      status: scan.status,
      uploadedAngles: scan.images.map((img) => img.angle),
      hasLead: !!(scan.lead && scan.lead.email),
    };

    if (scan.status === 'completed' && scan.result) {
      data.result = scan.result;
      // Expose health score at top level for convenience
      if (scan.result.healthScore) {
        data.healthScore = scan.result.healthScore;
      }
    }

    if (scan.status === 'failed') {
      data.failureReason = scan.failureReason || 'Analysis failed. Please try again.';
    }

    res.json(ApiResponse.success('Scan status', data));
  } catch (err) {
    next(err);
  }
});

// ─── Send Dental Scan Report via Email ──────────────────

const _reportSentMap = new Map(); // token → [timestamps]

router.post('/guest-scan/:token/send-report', async (req, res, next) => {
  try {
    const { token } = req.params;

    // Rate limit: max 3 per token per hour
    const now = Date.now();
    const history = (_reportSentMap.get(token) || []).filter(
      (ts) => now - ts < 3600_000,
    );
    if (history.length >= 3) {
      throw ApiError.tooManyRequests('Report already sent. Please check your inbox.');
    }

    const scan = await GuestScan.findOne({ sessionToken: token });
    if (!scan) throw ApiError.notFound('Scan session not found or expired');
    if (scan.status !== 'completed' || !scan.result) {
      throw ApiError.badRequest('Analysis is not yet complete');
    }
    if (!scan.lead || !scan.lead.email) {
      throw ApiError.badRequest('No contact email on file');
    }

    const reportId = `DS-${scan._id.toString().slice(-8).toUpperCase()}`;

    // Generate PDF
    const { generateDentalScanReport } = require('../../utils/dentalScanPdfGenerator');
    const pdfBuffer = await generateDentalScanReport(scan, reportId);

    // Enqueue email job
    const { emailQueue } = require('../../jobs/queues');
    await emailQueue.add('send-email', {
      type: 'dental-scan-report',
      payload: {
        email: scan.lead.email,
        name: scan.lead.name || 'Patient',
        pdfBuffer: pdfBuffer.toString('base64'),
        reportId,
      },
    });

    // Track for rate limiting
    history.push(now);
    _reportSentMap.set(token, history);

    // Track report sent timestamp for analytics
    if (!scan.reportSentAt) {
      scan.reportSentAt = new Date();
      await scan.save();
    }

    res.json(
      ApiResponse.success('Report queued for delivery', {
        email: scan.lead.email,
        reportId,
      }),
    );
  } catch (err) {
    next(err);
  }
});

// ─── Download Dental Scan Report as PDF ──────────────────

router.get('/guest-scan/:token/download-pdf', async (req, res, next) => {
  try {
    const { token } = req.params;

    const scan = await GuestScan.findOne({ sessionToken: token });
    if (!scan) throw ApiError.notFound('Scan session not found or expired');
    if (scan.status !== 'completed' || !scan.result) {
      throw ApiError.badRequest('Analysis is not yet complete');
    }

    const reportId = `DS-${scan._id.toString().slice(-8).toUpperCase()}`;

    const { generateDentalScanReport } = require('../../utils/dentalScanPdfGenerator');
    const pdfBuffer = await generateDentalScanReport(scan, reportId);

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="dental-scan-report-${reportId}.pdf"`,
      'Content-Length': pdfBuffer.length,
    });
    res.send(pdfBuffer);
  } catch (err) {
    next(err);
  }
});

// ─── Create Share Link for Dental Scan ──────────────────

router.post('/guest-scan/:token/share-link', async (req, res, next) => {
  try {
    const { token } = req.params;

    const scan = await GuestScan.findOne({ sessionToken: token });
    if (!scan) throw ApiError.notFound('Scan session not found or expired');
    if (scan.status !== 'completed' || !scan.result) {
      throw ApiError.badRequest('Analysis is not yet complete');
    }

    // Reuse existing share link if not expired
    if (scan.shareToken && scan.shareExpiresAt && scan.shareExpiresAt > new Date()) {
      const shareUrl = `${env.FRONTEND_URL || req.protocol + '://' + req.get('host')}/scan-results/${scan.shareToken}`;
      return res.json(
        ApiResponse.success('Share link available', {
          shareUrl,
          expiresAt: scan.shareExpiresAt,
        }),
      );
    }

    // Generate new share token
    const shareToken = crypto.randomUUID();
    const shareExpiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000); // 72 hours

    scan.shareToken = shareToken;
    scan.shareExpiresAt = shareExpiresAt;
    scan.shareAccessCount = 0;
    await scan.save();

    const shareUrl = `${env.FRONTEND_URL || req.protocol + '://' + req.get('host')}/scan-results/${shareToken}`;

    res.json(
      ApiResponse.success('Share link created', {
        shareUrl,
        expiresAt: shareExpiresAt,
      }),
    );
  } catch (err) {
    next(err);
  }
});

// ─── View Shared Dental Scan Results ──────────────────

router.get('/shared-scan/:shareToken', async (req, res, next) => {
  try {
    const { shareToken } = req.params;

    const scan = await GuestScan.findOne({ shareToken });
    if (!scan) throw ApiError.notFound('Shared scan not found');

    if (scan.shareExpiresAt && scan.shareExpiresAt < new Date()) {
      throw ApiError.gone('This share link has expired');
    }

    if (scan.status !== 'completed' || !scan.result) {
      throw ApiError.badRequest('Scan results are not available');
    }

    // Increment access count
    scan.shareAccessCount = (scan.shareAccessCount || 0) + 1;
    await scan.save();

    res.json(
      ApiResponse.success('Shared scan results', {
        observations: scan.result.observations || [],
        overallSummary: scan.result.overallSummary,
        healthScore: scan.result.healthScore,
        disclaimer: scan.result.disclaimer,
        recommendedSpecs: scan.result.recommendedSpecs || [],
        createdAt: scan.createdAt,
      }),
    );
  } catch (err) {
    next(err);
  }
});

// ─── Calendar Feed (ICS) ──────────────────────────────
// Public endpoint for external calendar apps — no auth required.

const calendarFeedService = require('../../services/calendarFeed.service');
const icsGenerator = require('../../services/icsGenerator.service');

const calFeedLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { success: false, message: 'Too many calendar requests. Please try again later.' },
});

router.get('/cal/:token.ics', calFeedLimiter, async (req, res, next) => {
  try {
    const token = req.params.token;

    // 1. Resolve token → tenant slug via platform DB
    const tokenDoc = await calendarFeedService.resolveToken(token);
    if (!tokenDoc) {
      return res.status(404).json(ApiResponse.error('Calendar feed not found or disabled'));
    }

    // 2. Load full feed from tenant DB
    const feed = await calendarFeedService.getFullFeed(token, tokenDoc.tenantSlug);
    if (!feed) {
      return res.status(404).json(ApiResponse.error('Calendar feed not found'));
    }

    // 3. Generate ICS content
    const icsText = await icsGenerator.generateDoctorICS(feed.doctor, tokenDoc.tenantSlug, {
      showPatientNames: feed.showPatientNames,
      includeLeaves: feed.includeLeaves,
      branch: feed.branch || null,
    });

    // 4. Record access (fire-and-forget)
    calendarFeedService.recordAccess(feed._id, tokenDoc.tenantSlug);

    // 5. Respond with ICS
    res.set({
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="schedule.ics"',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    });
    res.send(icsText);
  } catch (err) {
    next(err);
  }
});

// ─── Prescription Scanner ───────────────────────────────────────────────────
// Platform-level feature: photograph a handwritten prescription → get clean text.
// No authentication required. Uses Gemini Vision for multi-language handwriting OCR.

const PrescriptionScan = require('../../models/platform/PrescriptionScan');
const { analyzePrescriptionImage, translatePrescriptionText } = require('../../services/aiAnalysis.service');
const { SUPPORTED_LANGUAGES } = require('../../config/constants');
const logger = require('../../utils/logger');

const prescriptionScanLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,                    // 10 scans per hour per IP
  keyGenerator: (req) => req.ip,
  message: { success: false, message: 'Too many scan requests. Please try again later.' },
});

const prescriptionTranslateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  keyGenerator: (req) => req.ip,
  message: { success: false, message: 'Too many translation requests. Please try again later.' },
});

/**
 * POST /api/v1/public/prescription-scan/upload
 * Upload a prescription image and get a transcription back (synchronous).
 * Body: { imageData: base64, mimeType: 'image/jpeg' | 'image/png' | 'image/webp', source?: 'website' | 'mobile_app' }
 */
router.post('/prescription-scan/upload', prescriptionScanLimiter, async (req, res, next) => {
  try {
    const { imageData, mimeType, source } = req.body;

    // Validate input
    if (!imageData || typeof imageData !== 'string') {
      throw ApiError.badRequest('imageData (base64) is required');
    }
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!mimeType || !allowedTypes.includes(mimeType)) {
      throw ApiError.badRequest(`mimeType must be one of: ${allowedTypes.join(', ')}`);
    }

    // Validate file size (base64 is ~33% larger than binary, so 7MB base64 ≈ 5MB image)
    const estimatedBytes = Math.ceil(imageData.length * 0.75);
    if (estimatedBytes > 5 * 1024 * 1024) {
      throw ApiError.badRequest('Image must be under 5MB');
    }

    // 1. Save image to storage
    const ext = mimeType.split('/')[1] === 'jpeg' ? 'jpg' : mimeType.split('/')[1];
    const imageBuffer = Buffer.from(imageData, 'base64');
    const { fileUrl, fileName } = await uploadFile(
      { buffer: imageBuffer, originalname: `prescription-${Date.now()}.${ext}`, mimetype: mimeType },
      'prescription-scans',
    );

    // 2. Create scan document
    const sessionToken = crypto.randomUUID();
    const scan = await PrescriptionScan.create({
      sessionToken,
      status: 'pending',
      image: { fileUrl, fileName, fileSize: imageBuffer.length, mimeType },
      source: source || 'website',
      userAgent: req.get('user-agent'),
    });

    // 3. Call AI transcription (synchronous — typically 2-5 seconds)
    try {
      const aiResult = await analyzePrescriptionImage(imageData, mimeType);

      scan.result = {
        transcription:     aiResult.transcription,
        detectedLanguages: aiResult.detectedLanguages,
        medications:       aiResult.medications,
        patientName:       aiResult.patientName,
        doctorName:        aiResult.doctorName,
        date:              aiResult.date,
        confidence:        aiResult.confidence,
        imageQuality:      aiResult.imageQuality,
        notes:             aiResult.notes,
      };
      scan.modelVersion = aiResult.modelVersion;
      scan.processingMs = aiResult.processingMs;
      scan.status = 'completed';
      await scan.save();
    } catch (aiErr) {
      scan.status = 'failed';
      scan.failureReason = aiErr.message;
      await scan.save();

      logger.error('Prescription AI transcription failed: %s', aiErr.message);

      // Return the scan with failed status (don't throw — the image was saved)
      const userMessage = aiErr.message.includes('GEMINI_API_KEY')
        ? 'AI service is not configured. Please contact support.'
        : aiErr.message.includes('blocked')
          ? 'AI could not process this image due to content policy. Try a different image.'
          : `AI transcription failed: ${aiErr.message}`;

      return res.status(200).json(ApiResponse.success('Prescription scan failed', {
        scanId: scan._id,
        sessionToken: scan.sessionToken,
        status: 'failed',
        image: scan.image,
        failureReason: userMessage,
      }));
    }

    // 4. Return result
    res.status(200).json(ApiResponse.success('Prescription scanned successfully', {
      scanId: scan._id,
      sessionToken: scan.sessionToken,
      status: scan.status,
      image: scan.image,
      result: scan.result,
      modelVersion: scan.modelVersion,
      processingMs: scan.processingMs,
      createdAt: scan.createdAt,
    }));
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/public/prescription-scan/:id/translate
 * Translate a completed prescription transcription to a target language.
 * Body: { targetLanguage: 'English' | 'Hindi' | 'Marathi' | ... }
 */
router.post('/prescription-scan/:id/translate', prescriptionTranslateLimiter, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { targetLanguage } = req.body;

    if (!targetLanguage || !SUPPORTED_LANGUAGES.includes(targetLanguage)) {
      throw ApiError.badRequest(`targetLanguage must be one of: ${SUPPORTED_LANGUAGES.join(', ')}`);
    }

    const scan = await PrescriptionScan.findById(id);
    if (!scan) throw ApiError.notFound('Prescription scan not found');
    if (scan.status !== 'completed' || !scan.result?.transcription) {
      throw ApiError.badRequest('Scan must be completed with a transcription before translating');
    }

    const translationResult = await translatePrescriptionText(scan.result.transcription, targetLanguage);

    scan.translation = {
      translatedText:  translationResult.translatedText,
      targetLanguage:  translationResult.targetLanguage,
      sourceLanguages: translationResult.sourceLanguages,
      translatedAt:    new Date(),
    };
    await scan.save();

    res.status(200).json(ApiResponse.success('Translation completed', {
      scanId: scan._id,
      translation: scan.translation,
    }));
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/public/prescription-scan/:id
 * Retrieve a saved prescription scan by ID.
 */
router.get('/prescription-scan/:id', async (req, res, next) => {
  try {
    const scan = await PrescriptionScan.findById(req.params.id);
    if (!scan) throw ApiError.notFound('Prescription scan not found');

    res.status(200).json(ApiResponse.success('Prescription scan retrieved', {
      scanId: scan._id,
      sessionToken: scan.sessionToken,
      status: scan.status,
      image: scan.image,
      result: scan.result,
      translation: scan.translation,
      modelVersion: scan.modelVersion,
      processingMs: scan.processingMs,
      createdAt: scan.createdAt,
    }));
  } catch (err) {
    next(err);
  }
});

// ═══════════════════════════════════════════════════════════
//  Public Career Portal — Job Listings & Application
// ═══════════════════════════════════════════════════════════

const jobPortalController = require('../jobPortal/jobPortal.controller');
const { validate } = require('../../middleware/validate');
const {
  publicJobQuerySchema,
  applyToJobSchema,
} = require('../jobPortal/jobPortal.validator');

// ─── Public Job Listings (no auth) ──────────────────────

router.get('/jobs', validate(publicJobQuerySchema, { source: 'query' }), asyncHandler(jobPortalController.listPublicJobs));

router.get('/jobs/departments', asyncHandler(jobPortalController.getDistinctDepartments));

router.get('/jobs/:slug', async (req, res, next) => {
  try {
    const jobPortalService = require('../jobPortal/jobPortal.service');
    const posting = await jobPortalService.getPublicJobById(req.params.slug);
    res.json(ApiResponse.success('Job retrieved', posting));
  } catch (err) {
    next(err);
  }
});

// ─── Job Application (no auth — public form submission) ──

router.post(
  '/jobs/:id/apply',
  require('express').json({ limit: '8mb' }),
  validate(applyToJobSchema),
  asyncHandler(jobPortalController.applyToJob),
);

module.exports = router;
