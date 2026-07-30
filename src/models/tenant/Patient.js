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
patientSchema.index({ patientId: 1 }, { unique: true });
patientSchema.index({ phone: 1 });
patientSchema.index({ name: 'text', email: 'text' });
patientSchema.index({ deletedAt: 1 });
patientSchema.index({ guardian: 1 });
patientSchema.index(
  { externalId: 1, externalSource: 1 },
  { unique: true, partialFilterExpression: { externalId: { $type: 'string' } } },
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

module.exports = patientSchema;
