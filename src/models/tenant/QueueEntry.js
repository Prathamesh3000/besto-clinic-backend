'use strict';

const { Schema } = require('mongoose');
const { QUEUE_STATUS, QUEUE_PRIORITY } = require('../../config/constants');

const queueEntrySchema = new Schema(
  {
    patient:      { type: Schema.Types.ObjectId, ref: 'Patient', required: true },
    doctor:       { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    appointment:  { type: Schema.Types.ObjectId, ref: 'Appointment' },
    branch:       { type: Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
    department:   { type: Schema.Types.ObjectId, ref: 'Department', index: true },
    tokenNumber:  { type: Number, required: true },
    sortOrder:    { type: Number },
    status: {
      type: String,
      enum: Object.values(QUEUE_STATUS),
      default: QUEUE_STATUS.WAITING,
      index: true,
    },
    priority: {
      type: String,
      enum: Object.values(QUEUE_PRIORITY),
      default: QUEUE_PRIORITY.NORMAL,
    },
    room:         { type: Schema.Types.ObjectId, ref: 'ConsultationRoom' },
    checkedInAt:  { type: Date, default: Date.now },
    calledAt:     { type: Date },
    completedAt:  { type: Date },
    estimatedWaitMinutes: { type: Number, default: null },
    notes:        { type: String, trim: true, maxlength: 500 },
    createdBy:    { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

queueEntrySchema.index({ branch: 1, status: 1, sortOrder: 1 });
queueEntrySchema.index({ branch: 1, status: 1, createdAt: 1 });
queueEntrySchema.index({ doctor: 1, status: 1 });
queueEntrySchema.index({ branch: 1, createdAt: 1, tokenNumber: 1 });
queueEntrySchema.index({ appointment: 1, status: 1 });
queueEntrySchema.index({ patient: 1, status: 1, createdAt: 1 });

module.exports = queueEntrySchema;
