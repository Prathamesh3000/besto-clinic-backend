'use strict';

const mongoose = require('mongoose');
const { APPOINTMENT_STATUS } = require('../../config/constants');

const appointmentSchema = new mongoose.Schema(
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
      index: true,
    },
    scheduledAt: {
      type: Date,
      required: [true, 'Scheduled date/time is required'],
    },
    duration: {
      type: Number,
      default: 30, // minutes
      min: 10,
      max: 240,
    },
    type: {
      type: String,
      enum: ['consultation', 'follow_up', 'emergency', 'teleconsult'],
      default: 'consultation',
    },
    status: {
      type: String,
      enum: Object.values(APPOINTMENT_STATUS),
      default: APPOINTMENT_STATUS.REQUESTED,
    },
    branch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Branch',
      index: true,
    },
    source: {
      type: String,
      enum: ['general', 'chatbot', 'walk_in', 'portal', 'follow_up', 'doctor_mobile'],
      default: 'general',
    },
    reason: {
      type: String,
      trim: true,
      maxlength: 500,
    },
    notes: {
      type: String,
      trim: true,
    },

    /** Link to parent appointment (for follow-ups) */
    parentAppointment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Appointment',
    },

    /** Number of times this appointment has been rescheduled */
    rescheduleCount: {
      type: Number,
      default: 0,
    },

    /** Check-in / completion timestamps */
    checkedInAt: Date,
    startedAt: Date,
    completedAt: Date,
    cancelledAt: Date,
    noShowAt: Date,
    cancelReason: String,

    /** Configurable reminder timings — array of minutes-before values */
    reminderTimings: {
      type: [Number],
      default: [1440], // 24 hours = 1440 minutes (backward compatible)
    },

    /** Tracks each individual reminder send */
    reminders: [{
      minutesBefore: { type: Number, required: true },
      jobId: String,
      sentAt: Date,
      status: { type: String, enum: ['scheduled', 'sent', 'cancelled'], default: 'scheduled' },
    }],

    /** Legacy fields — kept for backward compat with existing appointments */
    reminderSent: { type: Boolean, default: false },
    reminderSentAt: Date,
    reminderJobId: String,

    /** Patient attendance confirmation (after reminder) */
    patientConfirmation: {
      status: { type: String, enum: ['pending', 'confirmed', 'declined'], default: 'pending' },
      respondedAt: Date,
      method: { type: String, enum: ['app', 'email', 'sms'] },
    },

    /** Linked invoice */
    invoice: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Invoice',
    },

    /** Schedule conflict resolution tracking */
    conflictResolution: {
      status: { type: String, enum: ['pending', 'rescheduled', 'refunded', 'credited', 'contacted'] },
      resolvedAt: Date,
      resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      overrideId: { type: mongoose.Schema.Types.ObjectId, ref: 'DoctorScheduleOverride' },
      leaveId: { type: mongoose.Schema.Types.ObjectId, ref: 'DoctorLeave' },
      reason: String,
      refundAmount: Number,
      creditAmount: Number,
    },

    /** Original scheduledAt before conflict-driven reschedule */
    previousScheduledAt: Date,

    /** Human-readable reason for schedule-change-driven updates */
    scheduleChangeReason: String,

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },

    deletedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true, transform(_doc, ret) { delete ret.__v; return ret; } },
  },
);

// Indexes
appointmentSchema.index({ doctor: 1, scheduledAt: 1 });
appointmentSchema.index({ patient: 1, scheduledAt: 1 });
appointmentSchema.index({ status: 1 });
appointmentSchema.index({ scheduledAt: 1, reminderSent: 1 });
appointmentSchema.index({ 'reminders.status': 1, scheduledAt: 1 });
appointmentSchema.index({ deletedAt: 1 });
appointmentSchema.index({ 'patientConfirmation.status': 1 });
appointmentSchema.index({ branch: 1, status: 1, scheduledAt: -1 });
appointmentSchema.index({ status: 1, scheduledAt: 1 });
// Supports the New/Old OPD split, which groups attended appointments by
// patient and compares each patient's earliest check-in against today.
appointmentSchema.index({ patient: 1, checkedInAt: 1 });

// Soft-delete filter
appointmentSchema.pre(/^find/, function () {
  if (!this.getQuery().deletedAt) {
    this.where({ deletedAt: null });
  }
});

module.exports = appointmentSchema;
