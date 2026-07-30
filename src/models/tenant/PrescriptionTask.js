'use strict';

const { Schema } = require('mongoose');
const { CARE_TASK_TYPE } = require('../../config/constants');

/** Frequency enum matching SRS prescription frequency mapping */
const TASK_FREQUENCY = [
  'once', 'twice_daily', 'thrice_daily', 'four_times_daily',
  'after_meals', 'before_meals', 'bedtime', 'custom',
];

const prescriptionTaskSchema = new Schema(
  {
    prescription: { type: Schema.Types.ObjectId, ref: 'Prescription', required: true, index: true },
    patient:      { type: Schema.Types.ObjectId, ref: 'Patient', required: true },
    doctor:       { type: Schema.Types.ObjectId, ref: 'User', required: true },

    taskType: {
      type: String,
      enum: Object.values(CARE_TASK_TYPE),
      default: CARE_TASK_TYPE.MEDICATION,
      index: true,
    },
    title:        { type: String, required: true, trim: true, maxlength: 200 },
    instructions: { type: String, trim: true, maxlength: 1000 },

    frequency: {
      type: String,
      enum: TASK_FREQUENCY,
      required: true,
    },
    customTimes:  { type: [String], default: [] }, // e.g., ['08:00', '14:00', '20:00']
    startDate:    { type: Date, required: true },
    endDate:      { type: Date, required: true },

    totalReminders: { type: Number, required: true, min: 1 },
    completedCount: { type: Number, default: 0 },
    skippedCount:   { type: Number, default: 0 },
    missedCount:    { type: Number, default: 0 },

    reminderMode: {
      type: String,
      enum: ['item_wise', 'eod_checklist'],
      default: 'item_wise',
    },
    eodTime: { type: String, default: '20:00' },

    isActive:      { type: Boolean, default: true },
    deactivatedAt: { type: Date, default: null },
    createdBy:     { type: Schema.Types.ObjectId, ref: 'User' },
    deletedAt:     { type: Date, default: null },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } },
);

prescriptionTaskSchema.virtual('completionRate').get(function () {
  if (this.totalReminders === 0) return 0;
  return Math.round((this.completedCount / this.totalReminders) * 100);
});

prescriptionTaskSchema.virtual('remainingReminders').get(function () {
  return Math.max(0, this.totalReminders - (this.completedCount + this.skippedCount + this.missedCount));
});

prescriptionTaskSchema.index({ patient: 1, isActive: 1 });
prescriptionTaskSchema.index({ patient: 1, createdAt: -1 });
prescriptionTaskSchema.index({ deletedAt: 1 });
prescriptionTaskSchema.index({ prescription: 1, isActive: 1 });

prescriptionTaskSchema.pre(/^find/, function () {
  if (!this.getQuery().deletedAt) {
    this.where({ deletedAt: null });
  }
});

module.exports = prescriptionTaskSchema;
