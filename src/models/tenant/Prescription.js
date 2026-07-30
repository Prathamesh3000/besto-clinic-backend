'use strict';

const { Schema } = require('mongoose');
const { PRESCRIPTION_STATUS } = require('../../config/constants');

const medicationSchema = new Schema({
  name:         { type: String, required: true, trim: true },
  dosage:       { type: String, required: true, trim: true },
  frequency:    { type: String, required: true, trim: true },
  duration:     { type: String, trim: true },
  instructions: { type: String, trim: true },
}, { _id: false });

const prescriptionSchema = new Schema(
  {
    patient:     { type: Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
    doctor:      { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    appointment: { type: Schema.Types.ObjectId, ref: 'Appointment' },
    branch:      { type: Schema.Types.ObjectId, ref: 'Branch', index: true },
    diagnosis:   { type: String, trim: true },
    medications: { type: [medicationSchema], required: true, validate: v => v.length > 0 },
    notes:       { type: String, trim: true, maxlength: 2000 },
    status: {
      type: String,
      enum: Object.values(PRESCRIPTION_STATUS),
      default: PRESCRIPTION_STATUS.ACTIVE,
      index: true,
    },
    validUntil:  { type: Date },
    followUpRemindersEnabled: { type: Boolean, default: false },
    reminderOptInAt:          { type: Date, default: null },
    tasksExtracted:           { type: Boolean, default: false },
    createdBy:   { type: Schema.Types.ObjectId, ref: 'User' },
    deletedAt:   { type: Date, default: null },
  },
  { timestamps: true },
);

prescriptionSchema.index({ patient: 1, createdAt: -1 });
prescriptionSchema.index({ doctor: 1, createdAt: -1 });
prescriptionSchema.index({ deletedAt: 1 });

// Soft-delete filter
prescriptionSchema.pre(/^find/, function () {
  if (!this.getQuery().deletedAt) {
    this.where({ deletedAt: null });
  }
});

module.exports = prescriptionSchema;
