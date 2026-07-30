'use strict';

const mongoose = require('mongoose');

/**
 * Clinic-wide booking policy — singleton per tenant.
 *
 * Provides clinic-level defaults for scheduling, cancellation,
 * reschedule, no-show, check-in, and confirmation rules.
 *
 * Resolution chain:
 *   DoctorSchedule field (per-doctor)  →  ClinicBookingPolicy field  →  System default
 *
 * All fields default to `null`, meaning "use system default".
 * Only non-null values are considered explicitly configured.
 */
const clinicBookingPolicySchema = new mongoose.Schema(
  {
    // ── Scheduling Defaults ──────────────────────────────
    slotDuration: {
      type: Number,
      default: null, // system default: 30 min
      min: 10,
      max: 120,
    },
    bufferMinutes: {
      type: Number,
      default: null, // system default: 0
      min: 0,
      max: 60,
    },
    minNoticeMinutes: {
      type: Number,
      default: null, // system default: 60
      min: 0,
      max: 10080, // 7 days
    },
    maxAdvanceDays: {
      type: Number,
      default: null, // system default: 60
      min: 1,
      max: 365,
    },

    // ── Cancellation Policy ──────────────────────────────
    /** Minimum minutes before appointment that cancellation is allowed.
     *  null = no cutoff (can cancel anytime). e.g. 120 = must cancel 2h before. */
    cancellationCutoffMin: {
      type: Number,
      default: null,
      min: 0,
      max: 10080,
    },

    // ── Reschedule Policy ────────────────────────────────
    /** Minimum minutes before appointment that rescheduling is allowed. */
    rescheduleCutoffMin: {
      type: Number,
      default: null,
      min: 0,
      max: 10080,
    },
    /** Max number of reschedules per appointment. null = unlimited. */
    maxReschedulesPerAppt: {
      type: Number,
      default: null,
      min: 1,
      max: 50,
    },

    // ── No-Show Policy ───────────────────────────────────
    /** Block booking when patient.noShowCount >= this value. null = no blocking. */
    noShowBlockThreshold: {
      type: Number,
      default: null,
      min: 1,
      max: 100,
    },

    // ── Check-in Window ──────────────────────────────────
    /** How many minutes before the appointment can a patient check in. */
    checkInWindowBeforeMin: {
      type: Number,
      default: null, // system default: 60
      min: 5,
      max: 1440,
    },
    /** How many minutes after the appointment time is check-in still allowed. */
    checkInWindowAfterMin: {
      type: Number,
      default: null, // system default: 30
      min: 0,
      max: 240,
    },

    // ── Confirmation Mode ────────────────────────────────
    /** true = auto-confirm bookings, false = bookings start as 'requested'. */
    autoConfirm: {
      type: Boolean,
      default: null, // system default: true
    },

    // ── Appointment Type Durations ───────────────────────
    /** Per-type default duration in minutes.
     *  e.g. { consultation: 30, procedure: 60, follow_up: 15, teleconsult: 20 } */
    appointmentTypeDurations: {
      type: Map,
      of: {
        type: Number,
        min: 10,
        max: 240,
      },
      default: null,
    },

    // ── Reminders ────────────────────────────────────────
    /** Default reminder timings (minutes before) for new appointments. */
    defaultReminderTimings: {
      type: [Number],
      default: null, // system default: [1440, 60, 15]
    },

    // ── Metadata ─────────────────────────────────────────
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform(_doc, ret) {
        delete ret.__v;
        return ret;
      },
    },
  },
);

// Singleton: at most one policy document per tenant database
clinicBookingPolicySchema.index({}, { unique: true, partialFilterExpression: {} });

module.exports = clinicBookingPolicySchema;
