'use strict';

const mongoose = require('mongoose');

const timeSlotSchema = new mongoose.Schema(
  {
    startTime: { type: String, required: true }, // "HH:mm"
    endTime: { type: String, required: true },
    label: { type: String, default: null }, // e.g. "Morning OPD", "Evening OPD"
  },
  { _id: false },
);

const dayScheduleSchema = new mongoose.Schema(
  {
    day: {
      type: String,
      required: true,
      enum: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'],
    },
    isWorking: { type: Boolean, default: true },
    slots: { type: [timeSlotSchema], default: [] }, // Multi-slot per day
    // Legacy fields — auto-populated from slots for backward compat
    startTime: { type: String, default: '09:00' }, // "HH:mm"
    endTime: { type: String, default: '18:00' },
    breakStart: { type: String, default: null },
    breakEnd: { type: String, default: null },
  },
  { _id: false },
);

const doctorScheduleSchema = new mongoose.Schema(
  {
    doctor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Doctor is required'],
    },
    branch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Branch',
      required: [true, 'Branch is required'],
    },
    slotDuration: {
      type: Number,
      default: 30,
      min: 10,
      max: 120,
    },
    bufferMinutes: {
      type: Number,
      default: 0,
      min: 0,
      max: 60,
    },
    minNoticeMinutes: {
      type: Number,
      default: 60,
      min: 0,
      max: 10080, // 7 days
    },
    maxAdvanceDays: {
      type: Number,
      default: 60,
      min: 1,
      max: 365,
    },
    weeklySchedule: {
      type: [dayScheduleSchema],
      default: () => {
        const defaultSlots = [
          { startTime: '09:00', endTime: '13:00', label: 'Morning' },
          { startTime: '14:00', endTime: '18:00', label: 'Afternoon' },
        ];
        const satSlots = [{ startTime: '09:00', endTime: '13:00', label: 'Morning' }];
        return [
          { day: 'monday', isWorking: true, slots: defaultSlots, startTime: '09:00', endTime: '18:00' },
          { day: 'tuesday', isWorking: true, slots: defaultSlots, startTime: '09:00', endTime: '18:00' },
          { day: 'wednesday', isWorking: true, slots: defaultSlots, startTime: '09:00', endTime: '18:00' },
          { day: 'thursday', isWorking: true, slots: defaultSlots, startTime: '09:00', endTime: '18:00' },
          { day: 'friday', isWorking: true, slots: defaultSlots, startTime: '09:00', endTime: '18:00' },
          { day: 'saturday', isWorking: true, slots: satSlots, startTime: '09:00', endTime: '13:00' },
          { day: 'sunday', isWorking: false, slots: [], startTime: '09:00', endTime: '18:00' },
        ];
      },
    },
    isActive: { type: Boolean, default: true },
    deletedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true, transform(_doc, ret) { delete ret.__v; return ret; } },
  },
);

doctorScheduleSchema.index(
  { doctor: 1, branch: 1 },
  { unique: true, partialFilterExpression: { isActive: true, deletedAt: null } },
);
doctorScheduleSchema.index({ doctor: 1, branch: 1, isActive: 1 });
doctorScheduleSchema.index({ deletedAt: 1 });

doctorScheduleSchema.pre(/^find/, function () {
  if (!this.getQuery().deletedAt) {
    this.where({ deletedAt: null });
  }
});

module.exports = doctorScheduleSchema;
