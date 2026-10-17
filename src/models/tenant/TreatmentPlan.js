'use strict';

/**
 * TreatmentPlan — a course of treatment spanning several visits.
 *
 * A TreatmentRecord is one visit. This is the thing those visits belong to: the
 * root canal that needs four sittings, of which the patient has attended three.
 *
 * It exists because the clinic has to be able to answer a specific question when
 * a patient disputes their treatment — how many sittings were planned, how many
 * did the patient actually attend, and which did they miss. Before this, that
 * answer had to be reconstructed by opening every appointment in turn, and
 * missed visits were invisible.
 *
 * Two deliberate properties:
 *
 * - `plannedSteps` is captured up front and never rewritten, so what was agreed
 *   at the start can be compared against what happened.
 * - `statusHistory` and `addenda` are append-only. A plan is evidence; silently
 *   editing it after a complaint is exactly what it must not permit.
 */

const mongoose = require('mongoose');
const { TREATMENT_PLAN_STATUS } = require('../../config/constants');

/** One step of the course as agreed at the outset. */
const plannedStepSchema = new mongoose.Schema(
  {
    sittingNumber: { type: Number, required: true, min: 1 },
    description: { type: String, required: true, trim: true, maxlength: 500 },
    estimatedCost: { type: Number, min: 0 },
  },
  { _id: false },
);

/**
 * A correction made after the fact.
 *
 * Records are never edited in place once the plan is under way, so anything that
 * needs changing is appended here with its author and reason. The original text
 * stays visible, which is what makes the record defensible rather than merely
 * current.
 */
const addendumSchema = new mongoose.Schema(
  {
    note: { type: String, required: true, trim: true, maxlength: 2000 },
    reason: { type: String, trim: true, maxlength: 500 },
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true },
);

const statusChangeSchema = new mongoose.Schema(
  {
    from: { type: String },
    to: { type: String, required: true },
    reason: { type: String, trim: true, maxlength: 500 },
    changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    changedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const treatmentPlanSchema = new mongoose.Schema(
  {
    patient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Patient',
      required: true,
      index: true,
    },

    /** The doctor responsible for the course. Individual sittings may differ. */
    doctor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    /** What is being treated, in the words the patient would recognise. */
    title: {
      type: String,
      required: [true, 'Treatment title is required'],
      trim: true,
      maxlength: 200,
    },

    diagnosis: { type: String, trim: true, maxlength: 2000 },

    /** Teeth this course concerns, FDI notation, matching TreatmentRecord. */
    teeth: [{ type: Number }],

    totalSittings: {
      type: Number,
      required: [true, 'Total sittings is required'],
      min: [1, 'A treatment needs at least one sitting'],
      max: 100,
    },

    plannedSteps: { type: [plannedStepSchema], default: [] },

    estimatedCost: { type: Number, min: 0 },
    startDate: { type: Date, default: Date.now },
    expectedEndDate: { type: Date },

    status: {
      type: String,
      enum: Object.values(TREATMENT_PLAN_STATUS),
      default: TREATMENT_PLAN_STATUS.PLANNED,
      index: true,
    },
    statusHistory: { type: [statusChangeSchema], default: [] },

    /** Consent for the course as a whole, separate from per-visit consent. */
    consent: {
      given: { type: Boolean, default: false },
      date: { type: Date },
      notes: { type: String, trim: true, maxlength: 1000 },
      recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    },

    addenda: { type: [addendumSchema], default: [] },

    completedAt: { type: Date },
    /** Why the course stopped, when it was abandoned rather than finished. */
    closureReason: { type: String, trim: true, maxlength: 1000 },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    /** Who last amended the plan. Edits are restricted once treatment starts,
     *  but the ones still permitted should remain attributable. */
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    deletedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true, transform(_doc, ret) { delete ret.__v; return ret; } },
    toObject: { virtuals: true },
  },
);

treatmentPlanSchema.index({ patient: 1, createdAt: -1 });
treatmentPlanSchema.index({ doctor: 1, status: 1 });
treatmentPlanSchema.index({ deletedAt: 1 });

/** Soft-delete filter, matching every other tenant model. */
treatmentPlanSchema.pre(/^find/, function applySoftDelete() {
  if (!this.getQuery().deletedAt) {
    this.where({ deletedAt: null });
  }
});

/**
 * Record every status transition automatically.
 *
 * Doing this in the model rather than the service means no future call site can
 * change a plan's status without leaving a trace — which is the whole point of
 * keeping the history.
 */
treatmentPlanSchema.pre('save', function trackStatusChange(next) {
  if (this.isNew) {
    this.statusHistory.push({ to: this.status, changedBy: this.createdBy });
  } else if (this.isModified('status')) {
    const previous = this.$locals.previousStatus;
    this.statusHistory.push({
      from: previous,
      to: this.status,
      reason: this.$locals.statusReason,
      changedBy: this.$locals.statusChangedBy,
    });
  }
  next();
});

module.exports = treatmentPlanSchema;
