'use strict';

const mongoose = require('mongoose');

const patientSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },
    patientId: {
      type: String,
      unique: true,
      required: true,
    },

    /**
     * OPD number — the clinic-facing patient number, e.g. OPD-000001.
     *
     * Sequential per clinic and assigned once at registration, so it stays with
     * the patient for life. Distinct from patientId above, which is an internal
     * opaque identifier; this is the number staff read out and write on a file.
     *
     * Sparse-unique rather than required: records created before this field
     * existed carry null until the backfill runs, and a plain unique index would
     * reject the second such null.
     */
    opdNumber: {
      type: String,
      trim: true,
      default: null,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      lowercase: true,
      trim: true,
    },
    phone: {
      type: String,
      required: true,
      trim: true,
    },
    dateOfBirth: Date,
    gender: {
      type: String,
      enum: ['male', 'female', 'other', 'prefer_not_to_say'],
    },
    bloodGroup: String,

    address: {
      street: String,
      city: String,
      state: String,
      zipCode: String,
      country: { type: String, default: 'IN' },
    },

    /** Medical info */
    medicalHistory: {
      allergies: [String],
      medications: [String],
      conditions: [String],
      notes: String,
    },

    /** Insurance */
    insurance: {
      provider: String,
      policyNumber: String,
      groupNumber: String,
      validTill: Date,
    },

    /** Emergency contact */
    emergencyContact: {
      name: String,
      phone: String,
      relationship: String,
    },

    /** Guardian (for minors) */
    guardian: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },

    /** Whether guardian receives duplicate push notifications for this dependent */
    guardianNotifications: {
      enabled: { type: Boolean, default: true },
    },

    /**
     * When the guardian was told this dependent reached 18 and can be detached.
     * Set by the dependentMajorityScan job purely to stop it notifying twice —
     * it does not gate detaching.
     */
    guardianMajorityNotifiedAt: Date,

    /** Assigned primary doctor */
    primaryDoctor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },

    /** Consent tracking */
    consentGiven: { type: Boolean, default: false },
    consentDate: Date,

    /** Preferred notification channel for care reminders */
    preferredReminderChannel: {
      type: String,
      enum: ['push', 'sms', 'email'],
      default: 'push',
    },

    /** Appointment reliability tracking */
    noShowCount: { type: Number, default: 0 },

    isActive: { type: Boolean, default: true },
    deletedAt: { type: Date, default: null },

    /** External integration tracking */
    externalId: { type: String },
    externalSource: {
      type: String,
      enum: ['rioview', 'romexis', null],
    },
    externalLastSyncAt: { type: Date },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true, transform(_doc, ret) { delete ret.__v; return ret; } },
  },
);

// Indexes
patientSchema.index({ phone: 1 });
patientSchema.index({ name: 'text', email: 'text' });
patientSchema.index({ deletedAt: 1 });
patientSchema.index({ guardian: 1 });
patientSchema.index(
  { externalId: 1, externalSource: 1 },
  { unique: true, partialFilterExpression: { externalId: { $type: 'string' } } },
);
// Unique only among documents that actually have an OPD number, so pre-backfill
// nulls do not collide with each other.
patientSchema.index(
  { opdNumber: 1 },
  { unique: true, partialFilterExpression: { opdNumber: { $type: 'string' } } },
);

// Soft-delete filter
patientSchema.pre(/^find/, function () {
  if (!this.getQuery().deletedAt) {
    this.where({ deletedAt: null });
  }
});

// Auto-generate patientId
patientSchema.pre('validate', function (next) {
  if (!this.patientId) {
    const ts = Date.now().toString(36).toUpperCase();
    const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
    this.patientId = `PAT-${ts}-${rand}`;
  }
  next();
});

/**
 * Assign the OPD number on first save.
 *
 * Deliberately a save hook rather than something the patient service calls:
 * patients are created from four separate places — the staff form, bulk import,
 * public self-registration and a guardian adding a dependant — and all four go
 * through Model.create(), which runs this. Putting the logic in one service
 * would have left the other three without a number.
 */
patientSchema.pre('save', async function assignOpdNumber(next) {
  if (!this.isNew || this.opdNumber) return next();

  try {
    const { nextSequence } = require('./Counter');
    const seq = await nextSequence(this.constructor.db, 'opd');
    this.opdNumber = `OPD-${String(seq).padStart(6, '0')}`;
  } catch (err) {
    // Registering the patient matters more than numbering them, so this does not
    // block the save — but it must be loud, because a silent miss would leave a
    // gap nobody notices. scripts/backfill-opd-numbers.js fills any gaps.
    require('../../utils/logger').error(
      'OPD number assignment failed for patient %s — record saved without one: %s',
      this.patientId, err.message,
    );
  }
  return next();
});

module.exports = patientSchema;
