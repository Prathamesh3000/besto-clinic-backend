'use strict';

const ApiError = require('../../utils/ApiError');
const { parsePagination } = require('../../utils/pagination');
const { getTenantConnection } = require('../../db/tenantConnectionManager');
const { logAccess } = require('../../utils/logAccess');
const formService = require('../patientForm/patientForm.service');
const logic = require('../patientForm/patientForm.logic');
const rangeLogic = require('./patientRegistration.logic');

const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Shared submission pipeline for reception and QR entries.
 *
 * @param {object}  p
 * @param {string}  p.tenantSlug
 * @param {object}  p.config        current form config (plain object / doc)
 * @param {object}  p.body          { formVersion?, answers, signature? }
 * @param {'reception'|'qr'} p.source
 * @param {string}  [p.registeredBy]   staff user id (reception)
 * @param {string}  [p.linkedUserId]   verified patient account id (qr)
 * @param {string}  [p.ip]             client IP (qr)
 * @param {object}  [p.actor]          req.user, for the access log (reception)
 */
async function submitRegistration({ tenantSlug, config, body, source, registeredBy, linkedUserId, ip, actor }) {
  const { errors, clean, signature } = logic.validateAnswers(config, body.answers, body.signature);
  if (errors.length) throw ApiError.badRequest(errors[0].message, errors);

  const conn = await getTenantConnection(tenantSlug);
  const Patient = conn.model('Patient');
  const Registration = conn.model('PatientRegistration');
  const now = new Date();

  // ── Duplicate rule: same phone AND same name (case-insensitive) => reuse ──
  const candidates = await Patient.find({
    deletedAt: null,
    phone: { $regex: logic.phoneMatchRegexSource(clean.phone) },
  }).limit(50);
  let patient = candidates.find((c) => logic.isSamePerson(c, clean.phone, clean.name)) || null;
  const isExistingPatient = !!patient;

  let linkedUser = null;
  if (linkedUserId) {
    linkedUser = linkedUserId;
    if (patient && !patient.user) {
      patient.user = linkedUserId;
      await patient.save();
    }
  }

  if (!patient) {
    const doc = {
      name: clean.name,
      phone: clean.phone,
      registrationSource: source,
      ...(clean.age !== undefined ? { age: clean.age, dateOfBirth: logic.approximateDob(clean.age, now) } : {}),
      ...(clean.gender ? { gender: clean.gender } : {}),
      ...(clean.address ? { address: { street: clean.address } } : {}),
      ...(clean.referralSource ? { referralSource: clean.referralSource } : {}),
      ...(registeredBy ? { registeredBy } : {}),
    };
    // Link the account to the new record only if the account has no patient record yet.
    if (linkedUserId && !(await Patient.exists({ user: linkedUserId }))) doc.user = linkedUserId;
    patient = await Patient.create(doc);
  }

  const registration = await Registration.create({
    patient: patient._id,
    source,
    registeredBy: registeredBy || null,
    linkedUser,
    formVersion: config.version,
    formSnapshot: logic.buildSnapshot(config),
    answers: clean,
    chiefComplaint: clean.chiefComplaint,
    referralSource: clean.referralSource,
    hasSignature: !!signature,
    signature: signature || undefined,
    consentText: config.consentText || undefined,
    consentAcceptedAt: now,
    isExistingPatient,
    ip: source === 'qr' ? ip : undefined,
  });

  if (actor) {
    logAccess(conn, {
      patient: patient._id,
      accessedBy: actor.userId,
      accessType: 'create',
      resource: 'profile',
      resourceId: patient._id,
      description: `${actor.role} registered patient via form`,
    });
  }

  return {
    patientId: String(patient._id),
    patientCode: patient.patientId,
    registrationId: String(registration._id),
    isExistingPatient,
    linkedToAccount: !!linkedUser,
  };
}

/** Reception submit (authenticated). */
async function createByStaff(body, user, tenantSlug) {
  const doc = await formService.getOrCreateConfigDoc(tenantSlug);
  return submitRegistration({
    tenantSlug,
    config: doc.toObject(),
    body,
    source: 'reception',
    registeredBy: user.userId,
    actor: user,
  });
}

// ─── List / detail ────────────────────────────────────

const PATIENT_FIELDS = 'name phone age gender patientId';

function toListItem(r) {
  return {
    _id: r._id,
    id: String(r._id),
    patient: r.patient,
    source: r.source,
    registeredBy: r.registeredBy || null,
    linkedUser: r.linkedUser || null,
    formVersion: r.formVersion,
    answers: r.answers,
    chiefComplaint: r.chiefComplaint,
    referralSource: r.referralSource,
    hasSignature: !!r.hasSignature,
    isExistingPatient: !!r.isExistingPatient,
    createdAt: r.createdAt,
  };
}

async function listRegistrations(query, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const Registration = conn.model('PatientRegistration');
  const Patient = conn.model('Patient');
  const { skip, limit, page } = parsePagination({ page: query.page, limit: query.limit });

  const filter = {};
  if (query.source) {
    if (!['reception', 'qr'].includes(query.source)) throw ApiError.badRequest('Invalid source filter');
    filter.source = query.source;
  }
  if (query.referralSource) {
    if (!logic.REFERRAL_VALUES.includes(query.referralSource)) throw ApiError.badRequest('Invalid referralSource filter');
    filter.referralSource = query.referralSource;
  }

  const range = rangeLogic.parseDateRange(query.from, query.to);
  if (range.invalid) throw ApiError.badRequest('Invalid from/to date');
  if (range.from || range.to) {
    filter.createdAt = {};
    if (range.from) filter.createdAt.$gte = range.from;
    if (range.to) filter.createdAt.$lt = range.to;
  }

  if (query.search && String(query.search).trim()) {
    const rx = escapeRegex(String(query.search).trim().slice(0, 100));
    const digits = String(query.search).replace(/\D/g, '');
    const or = [{ name: { $regex: rx, $options: 'i' } }, { patientId: { $regex: rx, $options: 'i' } }];
    if (digits.length >= 3) or.push({ phone: { $regex: digits.split('').join('\\D*') } });
    const matches = await Patient.find({ $or: or }).select('_id').limit(500).lean();
    filter.patient = { $in: matches.map((m) => m._id) };
  }

  const [rows, total] = await Promise.all([
    Registration.find(filter)
      .select('-signature -formSnapshot')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('patient', PATIENT_FIELDS)
      .populate('registeredBy', 'name')
      .lean(),
    Registration.countDocuments(filter),
  ]);

  return { items: rows.map(toListItem), total, page, limit };
}

async function getRegistrationById(id, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const r = await conn.model('PatientRegistration')
    .findById(id)
    .select('+signature')
    .populate('patient', PATIENT_FIELDS)
    .populate('registeredBy', 'name')
    .lean();
  if (!r) throw ApiError.notFound('Registration not found');
  return {
    ...toListItem(r),
    formSnapshot: r.formSnapshot,
    consentText: r.consentText,
    consentAcceptedAt: r.consentAcceptedAt,
    signature: r.signature || null,
    updatedAt: r.updatedAt,
  };
}

// ─── Stats ────────────────────────────────────────────

async function _countBetween(Registration, { start, end }) {
  return Registration.countDocuments({ createdAt: { $gte: start, $lt: end } });
}

/** Today / this week / this month counts (shared by /stats and the clinic dashboard). */
async function getNewPatientCounts(conn, now = new Date()) {
  const Registration = conn.model('PatientRegistration');
  const r = rangeLogic.computeStatsRanges(now);
  const [today, thisWeek, thisMonth] = await Promise.all([
    _countBetween(Registration, r.today),
    _countBetween(Registration, r.thisWeek),
    _countBetween(Registration, r.thisMonth),
  ]);
  return { today, thisWeek, thisMonth };
}

async function getStats(tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const Registration = conn.model('PatientRegistration');
  const now = new Date();
  const r = rangeLogic.computeStatsRanges(now);
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

  const [current, pToday, pWeek, pMonth, bySourceRows, byReferralRows, dailyRows] = await Promise.all([
    getNewPatientCounts(conn, now),
    _countBetween(Registration, r.previous.today),
    _countBetween(Registration, r.previous.thisWeek),
    _countBetween(Registration, r.previous.thisMonth),
    Registration.aggregate([
      { $match: { createdAt: { $gte: r.thisMonth.start, $lt: r.thisMonth.end } } },
      { $group: { _id: '$source', count: { $sum: 1 } } },
    ]),
    Registration.aggregate([
      { $match: { createdAt: { $gte: r.thisMonth.start, $lt: r.thisMonth.end } } },
      { $group: { _id: { $ifNull: ['$referralSource', 'unknown'] }, count: { $sum: 1 } } },
    ]),
    Registration.aggregate([
      { $match: { createdAt: { $gte: r.dailyStart, $lt: r.today.end } } },
      {
        $group: {
          _id: {
            date: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: tz } },
            source: '$source',
          },
          count: { $sum: 1 },
        },
      },
    ]),
  ]);

  const bySource = { reception: 0, qr: 0 };
  bySourceRows.forEach((x) => { if (x._id in bySource) bySource[x._id] = x.count; });
  const byReferral = {};
  byReferralRows.forEach((x) => { byReferral[x._id] = x.count; });

  return {
    ...current,
    previous: { today: pToday, thisWeek: pWeek, thisMonth: pMonth },
    bySource,
    byReferral,
    daily: rangeLogic.buildDailySeries(dailyRows, now, 30),
  };
}

module.exports = {
  submitRegistration,
  createByStaff,
  listRegistrations,
  getRegistrationById,
  getStats,
  getNewPatientCounts,
};
