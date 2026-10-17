'use strict';

const mongoose = require('mongoose');

const treatmentRecordSchema = new mongoose.Schema(
  {
    patient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Patient',
      required: true,
      index: true,
    },
    doctor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    appointment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Appointment',
    },

    /** Clinical data */
    diagnosis: {
      type: String,
      required: [true, 'Diagnosis is required'],
      trim: true,
    },
    treatment: {
      type: String,
      required: [true, 'Treatment description is required'],
      trim: true,
    },

    /** Subjective */
    chiefComplaint: { type: String, trim: true, maxlength: 2000 },
    medicalHistory: { type: String, trim: true, maxlength: 2000 },
    allergies: { type: String, trim: true, maxlength: 2000 },

    /** Vital signs */
    vitals: {
      bloodPressure: { type: String, trim: true },
      heartRate: { type: String, trim: true },
      temperature: { type: String, trim: true },
      spo2: { type: String, trim: true },
      weight: { type: String, trim: true },
      height: { type: String, trim: true },
      respiratoryRate: { type: String, trim: true },
    },

    /** Examination */
    examination: { type: String, trim: true, maxlength: 2000 },
    oralFindings: { type: String, trim: true, maxlength: 2000 },

    /** Assessment */
    severity: {
      type: String,
      enum: ['mild', 'moderate', 'severe', null],
      default: null,
    },
    assessmentNotes: { type: String, trim: true, maxlength: 2000 },

    /** Plan (separate from treatment description) */
    treatmentPlan: { type: String, trim: true, maxlength: 4000 },
    followUpInstructions: { type: String, trim: true, maxlength: 2000 },

    /** Procedure & Priority */
    procedure: { type: String, trim: true, maxlength: 200 },
    priority: {
      type: String,
      enum: ['immediate', 'urgent', 'routine', null],
      default: null,
    },
    estimatedCost: { type: Number, min: 0 },
    visitType: { type: String, trim: true, maxlength: 100 },

    /** Doctor Signature (canvas draw + auth metadata) */
    doctorSignature: {
      dataUrl: { type: String },
      signedAt: { type: Date },
      signedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      ipAddress: { type: String },
    },

    /** Patient consent acknowledgment */
    patientConsent: { type: String, trim: true, maxlength: 200 },

    /** Dynamic care tasks (replaces hardcoded tasks) */
    careTasks: [
      {
        title: { type: String, required: true, trim: true, maxlength: 200 },
        taskType: {
          type: String,
          enum: ['medication', 'hygiene', 'post_care', 'follow_up', 'dietary', 'custom'],
          default: 'custom',
        },
        instructions: { type: String, trim: true, maxlength: 500 },
        frequency: {
          type: String,
          enum: [
            'once', 'twice_daily', 'thrice_daily', 'four_times_daily',
            'after_meals', 'before_meals', 'bedtime', 'custom',
          ],
          default: 'once',
        },
        customTimes: [{ type: String }],
        enabled: { type: Boolean, default: true },
        reminderEnabled: { type: Boolean, default: true },
      },
    ],

    /** Consultation status */
    /**
     * The course this visit belongs to, when it is part of one.
     *
     * Optional by design: a one-off cleaning or extraction has no course, and
     * forcing a plan onto every visit would add paperwork to routine work -
     * which is how forms end up filled with junk.
     *
     * Named `plan` rather than `treatmentPlan` because that name is already the
     * free-text plan notes for this single visit, written by the consultation
     * form. Two different things; renaming the existing one would break the
     * form and every record already stored.
     */
    plan: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TreatmentPlan',
      default: null,
      index: true,
    },

    /** Which sitting of the plan this is. Derived, not typed by the doctor. */
    sittingNumber: { type: Number, min: 1, default: null },

    /**
     * Whether the patient turned up. Defaults true because a record normally
     * only exists for a visit that happened; a missed sitting is written
     * explicitly so the gap is visible rather than merely absent.
     */
    patientAttended: { type: Boolean, default: true },

    /**
     * Pain the patient reported at this visit, 0-10.
     *
     * Kept on the visit as well as in `complaints` so a plain trend across
     * sittings can be read without unpacking the complaint history - the
     * question "was he still in pain after sitting three" should be one glance.
     */
    painLevel: { type: Number, min: 0, max: 10, default: null },

    /** Complaints raised at or after this visit. Append-only. */
    complaints: [
      {
        reportedAt: { type: Date, default: Date.now },
        painLevel: { type: Number, min: 0, max: 10 },
        symptoms: { type: String, trim: true, maxlength: 1000 },
        followUpAction: {
          type: String,
          enum: ['reexamination', 'extra_sitting', 'medication', 'referral', 'none'],
          default: 'none',
        },
        actionNotes: { type: String, trim: true, maxlength: 1000 },
        recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        resolvedAt: { type: Date, default: null },
      },
    ],

    /**
     * Set once the visit is signed off. A locked record is never edited in
     * place; corrections go into `addenda` below.
     *
     * This is what makes the record usable as evidence. Without it the honest
     * answer to "could this have been changed after my client complained?" is
     * yes, and the record proves nothing.
     */
    locked: { type: Boolean, default: false },
    lockedAt: { type: Date, default: null },

    /** Corrections made after locking, with author and reason. */
    addenda: [
      {
        note: { type: String, required: true, trim: true, maxlength: 2000 },
        reason: { type: String, trim: true, maxlength: 500 },
        author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        createdAt: { type: Date, default: Date.now },
      },
    ],

    status: {
      type: String,
      enum: ['in_progress', 'completed'],
      default: 'in_progress',
    },
    completedAt: { type: Date },

    /** Dental chart — tooth-level conditions */
    teeth: [
      {
        tooth: Number,
        conditions: [{ type: String, trim: true }],
      },
    ],

    /** Prescribed medications (embedded, also saved to Prescription model on complete) */
    prescription: [
      {
        medication: { type: String, required: true },
        dosage: String,
        frequency: String,
        duration: String,
        notes: String,
      },
    ],

    /** Materials actually used during consultation — drives stock deduction on completion */
    materialsUsed: [
      {
        item: { type: mongoose.Schema.Types.ObjectId, ref: 'InventoryItem', required: true },
        itemName: { type: String, required: true, trim: true },
        quantity: { type: Number, required: true, min: 1 },
        costPerUnit: { type: Number, default: 0, min: 0 },
      },
    ],

    /** Attachments (X-rays, photos) */
    attachments: [
      {
        fileName: String,
        fileUrl: String,
        fileType: String,
        uploadedAt: { type: Date, default: Date.now },
      },
    ],

    notes: String,
    followUpDate: Date,

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },

    deletedAt: { type: Date, default: null },

    /** External integration tracking */
    externalId: { type: String, default: null },
    externalSource: {
      type: String,
      enum: ['rioview', 'romexis', null],
      default: null,
    },
    externalLastSyncAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true, transform(_doc, ret) { delete ret.__v; return ret; } },
  },
);

/** Backward-compat: normalize old {number, condition, procedure} teeth to {tooth, conditions} */
treatmentRecordSchema.virtual('teethNormalized').get(function () {
  return (this.teeth || []).map((t) => {
    if (t.number !== undefined && t.conditions === undefined) {
      return { tooth: t.number, conditions: [t.condition, t.procedure].filter(Boolean) };
    }
    return t;
  });
});

treatmentRecordSchema.index({ plan: 1, sittingNumber: 1 });
treatmentRecordSchema.index({ patient: 1, createdAt: -1 });
treatmentRecordSchema.index({ doctor: 1, createdAt: -1 });
treatmentRecordSchema.index({ deletedAt: 1 });
// Unique only among records that actually carry an external id.
//
// This was { unique: true, sparse: true }, which does not do what it looks like.
// A compound sparse index only skips a document when EVERY indexed field is
// missing - but externalId declares `default: null`, so the field is present
// with a null value and the document gets indexed as (null, null). The first
// locally-created record indexed fine; the second collided with it, and the
// clinic could not save a second consultation at all.
//
// partialFilterExpression indexes only documents where externalId is a string,
// which is what sparse was meant to achieve. Matches Patient.js, which already
// uses this pattern for the same pair of fields.
treatmentRecordSchema.index(
  { externalId: 1, externalSource: 1 },
  { unique: true, partialFilterExpression: { externalId: { $type: 'string' } } },
);

treatmentRecordSchema.pre(/^find/, function () {
  if (!this.getQuery().deletedAt) {
    this.where({ deletedAt: null });
  }
});

module.exports = treatmentRecordSchema;
