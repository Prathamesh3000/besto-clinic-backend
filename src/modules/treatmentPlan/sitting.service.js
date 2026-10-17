'use strict';

/**
 * Sittings — individual visits belonging to a treatment plan.
 *
 * A sitting is a TreatmentRecord with a plan reference and a sitting number. It
 * is written here rather than in the consultation module because the rules are
 * different: consultations are working documents a doctor edits during a visit,
 * whereas a sitting, once signed off, is evidence and must stop changing.
 */

const ApiError = require('../../utils/ApiError');
const { getTenantConnection } = require('../../db/tenantConnectionManager');
const { TREATMENT_PLAN_STATUS } = require('../../config/constants');
const logger = require('../../utils/logger');

/**
 * Record a sitting against a plan.
 *
 * The sitting number is derived, never supplied. Letting a caller choose it
 * invites duplicates and gaps, and the number is exactly what a dispute turns
 * on — "this was sitting 3 of 4" has to be a fact about the record, not a claim.
 */
async function addSitting(planId, data, tenantSlug, user) {
  const conn = await getTenantConnection(tenantSlug);
  const TreatmentPlan = conn.model('TreatmentPlan');
  const TreatmentRecord = conn.model('TreatmentRecord');

  const plan = await TreatmentPlan.findOne({ _id: planId, deletedAt: null });
  if (!plan) throw ApiError.notFound('Treatment plan not found');
  if (plan.status === TREATMENT_PLAN_STATUS.COMPLETED) {
    throw ApiError.badRequest('This treatment is already complete — reopen it before adding a sitting');
  }

  const existing = await TreatmentRecord.countDocuments({ plan: planId, deletedAt: null });
  const sittingNumber = existing + 1;

  if (sittingNumber > plan.totalSittings) {
    throw ApiError.badRequest(
      `All ${plan.totalSittings} planned sittings are recorded. Add an addendum, or revise the plan before continuing.`,
    );
  }

  const attended = data.patientAttended !== false;

  // Whether the sitting is finished is the doctor's call, not an inference. A
  // visit can be started, left part-way (the patient could not tolerate more,
  // the tooth needed settling), and completed at the next visit - recording it
  // as done the moment it is entered would put a claim in the record that the
  // clinician never made.
  //
  // A missed visit is closed immediately: there is nothing left to finish.
  const completed = attended ? data.completed === true : true;

  const record = await TreatmentRecord.create({
    patient: plan.patient,
    doctor: data.doctor || plan.doctor,
    appointment: data.appointment || undefined,
    plan: plan._id,
    sittingNumber,
    patientAttended: attended,
    // A missed visit has no clinical content, but the schema requires both
    // fields - so they are filled explicitly rather than left to fail validation.
    diagnosis: attended ? (data.diagnosis || plan.diagnosis || plan.title) : 'Did not attend',
    treatment: attended ? data.procedure : 'Patient did not attend this sitting',
    procedure: data.procedure,
    notes: data.notes,
    followUpInstructions: data.nextStep,
    teeth: data.teeth || [],
    painLevel: typeof data.painLevel === 'number' ? data.painLevel : null,
    status: completed ? 'completed' : 'in_progress',
    completedAt: completed ? (data.date || new Date()) : null,
    // The visit date is kept regardless, so an unfinished sitting still appears
    // in the right place on the timeline.
    createdAt: data.date || undefined,
    createdBy: user.userId,
  });

  // First recorded sitting moves the plan out of "planned" on its own, so the
  // status cannot drift from what actually happened.
  if (plan.status === TREATMENT_PLAN_STATUS.PLANNED) {
    plan.$locals.previousStatus = plan.status;
    plan.$locals.statusReason = 'First sitting recorded';
    plan.$locals.statusChangedBy = user.userId;
    plan.status = TREATMENT_PLAN_STATUS.IN_PROGRESS;
    await plan.save();
  }

  logger.info('Sitting %d/%d recorded on plan %s (attended: %s, completed: %s)',
    sittingNumber, plan.totalSittings, planId, attended, completed);

  return TreatmentRecord.findById(record._id).populate('doctor', 'name').lean();
}

/**
 * Mark a sitting finished, or reopen one marked finished by mistake.
 *
 * Separate from locking: "the work is done" and "the record is sealed" are
 * different statements, and a doctor should be able to make the first without
 * committing to the second.
 */
async function setSittingCompletion(sittingId, { completed, date }, tenantSlug, user) {
  const conn = await getTenantConnection(tenantSlug);
  const TreatmentRecord = conn.model('TreatmentRecord');

  const record = await TreatmentRecord.findOne({ _id: sittingId, deletedAt: null });
  if (!record) throw ApiError.notFound('Sitting not found');
  if (record.locked) {
    throw ApiError.badRequest('This sitting is signed off and can no longer be changed');
  }
  if (record.patientAttended === false) {
    throw ApiError.badRequest('A missed sitting has nothing to complete');
  }

  record.status = completed ? 'completed' : 'in_progress';
  record.completedAt = completed ? (date ? new Date(date) : new Date()) : null;
  await record.save();

  logger.info('Sitting %s marked %s by %s', sittingId, record.status, user.userId);
  return record.toJSON();
}

/**
 * Lock a sitting. After this it is read-only and corrections become addenda.
 *
 * Deliberately one-way: an unlock would make the lock meaningless, since the
 * question a lock answers is "could this have been altered afterwards?"
 */
async function lockSitting(sittingId, tenantSlug, user) {
  const conn = await getTenantConnection(tenantSlug);
  const TreatmentRecord = conn.model('TreatmentRecord');

  const record = await TreatmentRecord.findOne({ _id: sittingId, deletedAt: null });
  if (!record) throw ApiError.notFound('Sitting not found');
  if (record.locked) return record.toJSON();

  record.locked = true;
  record.lockedAt = new Date();
  await record.save();

  logger.info('Sitting %s locked by %s', sittingId, user.userId);
  return record.toJSON();
}

/**
 * Append a correction to a locked sitting.
 *
 * The original text is never touched. What the doctor wrote at the time and what
 * they corrected later both remain visible, with who and when.
 */
async function addSittingAddendum(sittingId, { note, reason }, tenantSlug, user) {
  const conn = await getTenantConnection(tenantSlug);
  const TreatmentRecord = conn.model('TreatmentRecord');

  const record = await TreatmentRecord.findOne({ _id: sittingId, deletedAt: null });
  if (!record) throw ApiError.notFound('Sitting not found');

  record.addenda.push({ note, reason, author: user.userId });
  await record.save();
  return record.toJSON();
}

/**
 * Record that the patient is still reporting pain.
 *
 * Stored on the sitting rather than the plan so the complaint is anchored to a
 * point in the treatment — "still in pain after sitting 3" is the fact that
 * matters, and a plan-level list would lose it.
 */
async function recordComplaint(sittingId, data, tenantSlug, user) {
  const conn = await getTenantConnection(tenantSlug);
  const TreatmentRecord = conn.model('TreatmentRecord');

  const record = await TreatmentRecord.findOne({ _id: sittingId, deletedAt: null });
  if (!record) throw ApiError.notFound('Sitting not found');

  record.complaints.push({
    painLevel: data.painLevel,
    symptoms: data.symptoms,
    followUpAction: data.followUpAction || 'none',
    actionNotes: data.actionNotes,
    recordedBy: user.userId,
    reportedAt: data.reportedAt || new Date(),
  });

  // Mirrored onto the visit so a pain trend across sittings reads at a glance.
  if (typeof data.painLevel === 'number') record.painLevel = data.painLevel;

  await record.save();
  logger.info('Complaint recorded on sitting %s (pain %s)', sittingId, data.painLevel);
  return record.toJSON();
}

/** Close a complaint once it has been dealt with. */
async function resolveComplaint(sittingId, complaintId, { note }, tenantSlug, user) {
  const conn = await getTenantConnection(tenantSlug);
  const TreatmentRecord = conn.model('TreatmentRecord');

  const record = await TreatmentRecord.findOne({ _id: sittingId, deletedAt: null });
  if (!record) throw ApiError.notFound('Sitting not found');

  const complaint = record.complaints.id(complaintId);
  if (!complaint) throw ApiError.notFound('Complaint not found');
  if (complaint.resolvedAt) throw ApiError.badRequest('This complaint is already resolved');

  complaint.resolvedAt = new Date();
  if (note) complaint.actionNotes = `${complaint.actionNotes || ''}\nResolved: ${note}`.trim();

  await record.save();
  logger.info('Complaint %s resolved on sitting %s by %s', complaintId, sittingId, user.userId);
  return record.toJSON();
}

module.exports = {
  addSitting,
  setSittingCompletion,
  lockSitting,
  addSittingAddendum,
  recordComplaint,
  resolveComplaint,
};
