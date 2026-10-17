'use strict';

/**
 * Treatment plans — courses of treatment spanning several visits.
 *
 * The point of this module is evidential, not administrative. When a patient
 * disputes their treatment the clinic has to be able to show what was agreed,
 * what was done, what the patient missed, and that none of it was edited after
 * the complaint. Everything below is shaped by that.
 */

const ApiError = require('../../utils/ApiError');
const { parsePagination } = require('../../utils/pagination');
const { getTenantConnection } = require('../../db/tenantConnectionManager');
const { TREATMENT_PLAN_STATUS } = require('../../config/constants');
const { ROLE_PERMISSIONS, PERMISSIONS } = require('../../config/permissions');
const logger = require('../../utils/logger');

const WITH_REFS = [
  { path: 'patient', select: 'name patientId opdNumber phone' },
  { path: 'doctor', select: 'name specialization' },
];

/** Full (non-OWN) read access, mirroring the prescription module. */
function _hasFullAccess(user) {
  const perms = ROLE_PERMISSIONS[user.role] || [];
  return perms.includes(PERMISSIONS.RECORD_READ);
}

/** The Patient._id linked to this user, for self-scoped reads. */
async function _linkedPatientId(userId, conn) {
  const patient = await conn.model('Patient').findOne({ user: userId }).select('_id').lean();
  return patient ? patient._id : null;
}

/**
 * Restrict a filter to what this user may see.
 *
 * A patient may read their own plans and nothing else. Returning an empty result
 * for an unlinked user is deliberate — it fails closed.
 */
async function _scopeToUser(filter, user, conn) {
  if (_hasFullAccess(user)) return filter;
  const patientId = await _linkedPatientId(user.userId, conn);
  return { ...filter, patient: patientId || null };
}

async function listPlans(query, tenantSlug, user) {
  const conn = await getTenantConnection(tenantSlug);
  const TreatmentPlan = conn.model('TreatmentPlan');
  const { skip, limit, page, sort } = parsePagination(query);

  let filter = { deletedAt: null };
  if (query.patient) filter.patient = query.patient;
  if (query.doctor) filter.doctor = query.doctor;
  if (query.status) filter.status = query.status;
  filter = await _scopeToUser(filter, user, conn);

  const [items, total] = await Promise.all([
    TreatmentPlan.find(filter).populate(WITH_REFS).sort(sort).skip(skip).limit(limit).lean(),
    TreatmentPlan.countDocuments(filter),
  ]);

  const withProgress = await Promise.all(items.map((p) => _attachProgress(p, conn)));
  return { items: withProgress, meta: { page, limit, total } };
}

async function getPlanById(id, tenantSlug, user) {
  const conn = await getTenantConnection(tenantSlug);
  const TreatmentPlan = conn.model('TreatmentPlan');

  let filter = { _id: id, deletedAt: null };
  filter = await _scopeToUser(filter, user, conn);

  const plan = await TreatmentPlan.findOne(filter).populate(WITH_REFS).lean();
  if (!plan) throw ApiError.notFound('Treatment plan not found');

  return _attachProgress(plan, conn, { includeSittings: true });
}

/**
 * Count what actually happened against what was planned.
 *
 * Attended and missed are counted separately rather than derived from each
 * other, because "3 of 5 done" and "2 missed" answer different questions and a
 * dispute usually turns on the second.
 */
async function _attachProgress(plan, conn, { includeSittings = false } = {}) {
  const TreatmentRecord = conn.model('TreatmentRecord');

  const sittings = await TreatmentRecord.find({ plan: plan._id, deletedAt: null })
    .populate('doctor', 'name')
    .sort({ sittingNumber: 1, createdAt: 1 })
    .lean();

  const attended = sittings.filter((s) => s.patientAttended !== false);
  const missed = sittings.filter((s) => s.patientAttended === false);
  const completed = attended.filter((s) => s.status === 'completed');

  const lastPain = [...sittings]
    .reverse()
    .find((s) => typeof s.painLevel === 'number');

  const openComplaints = sittings.reduce(
    (n, s) => n + (s.complaints || []).filter((c) => !c.resolvedAt).length,
    0,
  );

  return {
    ...plan,
    progress: {
      totalSittings: plan.totalSittings,
      completed: completed.length,
      remaining: Math.max(0, plan.totalSittings - completed.length),
      missed: missed.length,
      percent: plan.totalSittings > 0
        ? Math.round((completed.length / plan.totalSittings) * 100)
        : 0,
      // The clinic needs this surfaced, not buried: a course whose steps are all
      // done while the patient still reports pain is the case that escalates.
      stillInPain: typeof lastPain?.painLevel === 'number' && lastPain.painLevel > 0,
      lastReportedPain: lastPain?.painLevel ?? null,
      openComplaints,
    },
    ...(includeSittings ? { sittings } : {}),
  };
}

async function createPlan(data, tenantSlug, user) {
  const conn = await getTenantConnection(tenantSlug);
  const TreatmentPlan = conn.model('TreatmentPlan');
  const Patient = conn.model('Patient');

  const patient = await Patient.findById(data.patient).select('_id').lean();
  if (!patient) throw ApiError.badRequest('Patient not found');

  // The doctor was previously taken on trust. A plan pointing at a deleted or
  // non-existent user still saves, and then renders as "Unassigned" in the
  // history - which is exactly the wrong answer to "who treated me?".
  const User = conn.model('User');
  const doctor = await User.findOne({ _id: data.doctor, deletedAt: null }).select('_id role isActive').lean();
  if (!doctor) throw ApiError.badRequest('Assigned doctor not found');
  if (doctor.isActive === false) throw ApiError.badRequest('Assigned doctor is deactivated');

  // A step numbered beyond the total would render as "sitting 5 of 4".
  const overflow = (data.plannedSteps || []).find((s) => s.sittingNumber > data.totalSittings);
  if (overflow) {
    throw ApiError.badRequest(
      `Planned step ${overflow.sittingNumber} exceeds the ${data.totalSittings} sittings declared`,
    );
  }

  const plan = await TreatmentPlan.create({
    ...data,
    createdBy: user.userId,
    consent: data.consent
      ? { ...data.consent, recordedBy: user.userId }
      : undefined,
  });

  logger.info('Treatment plan created: %s for patient %s (%s)', plan.title, data.patient, tenantSlug);
  return TreatmentPlan.findById(plan._id).populate(WITH_REFS).lean();
}

/**
 * Update the mutable parts of a plan.
 *
 * `totalSittings`, `plannedSteps` and `patient` are refused once the course is
 * under way: they are what the record is measured against, and rewriting them
 * retrospectively would let a clinic move the goalposts after a complaint.
 */
async function updatePlan(id, data, tenantSlug, user) {
  const conn = await getTenantConnection(tenantSlug);
  const TreatmentPlan = conn.model('TreatmentPlan');

  const plan = await TreatmentPlan.findOne({ _id: id, deletedAt: null });
  if (!plan) throw ApiError.notFound('Treatment plan not found');

  const started = plan.status !== TREATMENT_PLAN_STATUS.PLANNED;
  const frozen = ['patient', 'totalSittings', 'plannedSteps'];
  if (started) {
    const attempted = frozen.filter((f) => data[f] !== undefined);
    if (attempted.length) {
      throw ApiError.badRequest(
        `Cannot change ${attempted.join(', ')} once treatment has started — add an addendum instead`,
      );
    }
  }

  const editable = ['title', 'diagnosis', 'teeth', 'estimatedCost', 'expectedEndDate', 'doctor', 'consent'];
  for (const key of editable) {
    if (data[key] !== undefined) plan[key] = data[key];
  }
  if (!started) {
    for (const key of frozen) {
      if (data[key] !== undefined) plan[key] = data[key];
    }
  }

  plan.updatedBy = user.userId;
  await plan.save();
  return TreatmentPlan.findById(plan._id).populate(WITH_REFS).lean();
}

/** Move a plan through its lifecycle. The model records the transition. */
async function changeStatus(id, { status, reason }, tenantSlug, user) {
  const conn = await getTenantConnection(tenantSlug);
  const TreatmentPlan = conn.model('TreatmentPlan');

  const plan = await TreatmentPlan.findOne({ _id: id, deletedAt: null });
  if (!plan) throw ApiError.notFound('Treatment plan not found');
  if (plan.status === status) return plan.toJSON();

  if (plan.status === TREATMENT_PLAN_STATUS.COMPLETED) {
    throw ApiError.badRequest('A completed plan cannot change status — add an addendum instead');
  }
  if (status === TREATMENT_PLAN_STATUS.ABANDONED && !reason) {
    throw ApiError.badRequest('A reason is required when abandoning a treatment');
  }

  plan.$locals.previousStatus = plan.status;
  plan.$locals.statusReason = reason;
  plan.$locals.statusChangedBy = user.userId;
  plan.status = status;
  if (status === TREATMENT_PLAN_STATUS.COMPLETED) plan.completedAt = new Date();
  if (status === TREATMENT_PLAN_STATUS.ABANDONED) plan.closureReason = reason;

  await plan.save();
  logger.info('Treatment plan %s -> %s (%s)', id, status, tenantSlug);
  return plan.toJSON();
}

/** Append a correction. Nothing already recorded is altered. */
async function addAddendum(id, { note, reason }, tenantSlug, user) {
  const conn = await getTenantConnection(tenantSlug);
  const TreatmentPlan = conn.model('TreatmentPlan');

  const plan = await TreatmentPlan.findOne({ _id: id, deletedAt: null });
  if (!plan) throw ApiError.notFound('Treatment plan not found');

  plan.addenda.push({ note, reason, author: user.userId });
  await plan.save();
  return plan.toJSON();
}

async function deletePlan(id, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const TreatmentPlan = conn.model('TreatmentPlan');
  const TreatmentRecord = conn.model('TreatmentRecord');

  const plan = await TreatmentPlan.findOne({ _id: id, deletedAt: null });
  if (!plan) throw ApiError.notFound('Treatment plan not found');

  // Deleting a plan with recorded sittings would orphan clinical history the
  // clinic may later need to produce.
  const sittings = await TreatmentRecord.countDocuments({ plan: id, deletedAt: null });
  if (sittings > 0) {
    throw ApiError.badRequest(
      `This plan has ${sittings} recorded sitting(s) and cannot be deleted — mark it abandoned instead`,
    );
  }

  plan.deletedAt = new Date();
  await plan.save();
  return { deleted: true };
}

/**
 * Everything recorded for one patient, newest course first.
 *
 * This is what the Treatment History tab renders and what the PDF export prints,
 * so it deliberately includes missed sittings and unresolved complaints rather
 * than only the tidy parts.
 */
async function getPatientTimeline(patientId, tenantSlug, user) {
  const conn = await getTenantConnection(tenantSlug);
  const TreatmentPlan = conn.model('TreatmentPlan');
  const TreatmentRecord = conn.model('TreatmentRecord');
  const Patient = conn.model('Patient');

  if (!_hasFullAccess(user)) {
    const linked = await _linkedPatientId(user.userId, conn);
    if (!linked || String(linked) !== String(patientId)) {
      throw ApiError.forbidden('You can only view your own treatment history');
    }
  }

  const patient = await Patient.findById(patientId)
    .select('name patientId opdNumber phone dateOfBirth gender')
    .lean();
  if (!patient) throw ApiError.notFound('Patient not found');

  const plans = await TreatmentPlan.find({ patient: patientId, deletedAt: null })
    .populate(WITH_REFS)
    .sort({ createdAt: -1 })
    .lean();

  const withSittings = await Promise.all(
    plans.map((p) => _attachProgress(p, conn, { includeSittings: true })),
  );

  // Visits that predate this feature, or one-off treatments, belong to no plan
  // but are still part of the patient's history.
  const unlinked = await TreatmentRecord.find({ patient: patientId, plan: null, deletedAt: null })
    .populate('doctor', 'name')
    .sort({ createdAt: -1 })
    .lean();

  return { patient, plans: withSittings, unlinkedVisits: unlinked };
}

module.exports = {
  listPlans,
  getPlanById,
  createPlan,
  updatePlan,
  changeStatus,
  addAddendum,
  deletePlan,
  getPatientTimeline,
};
