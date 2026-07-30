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

treatmentRecordSchema.index({ patient: 1, createdAt: -1 });
treatmentRecordSchema.index({ doctor: 1, createdAt: -1 });
treatmentRecordSchema.index({ deletedAt: 1 });
treatmentRecordSchema.index({ externalId: 1, externalSource: 1 }, { unique: true, sparse: true });

treatmentRecordSchema.pre(/^find/, function () {
  if (!this.getQuery().deletedAt) {
    this.where({ deletedAt: null });
  }
});

module.exports = treatmentRecordSchema;
