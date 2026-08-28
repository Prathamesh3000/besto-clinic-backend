'use strict';

const { Schema } = require('mongoose');
const { CARE_REMINDER_STATUS } = require('../../config/constants');

const careReminderSchema = new Schema(
  {
    task:         { type: Schema.Types.ObjectId, ref: 'PrescriptionTask', required: true, index: true },
    patient:      { type: Schema.Types.ObjectId, ref: 'Patient', required: true },
    prescription: { type: Schema.Types.ObjectId, ref: 'Prescription', required: true },

    scheduledAt: { type: Date, required: true, index: true },
    status: {
      type: String,
      enum: Object.values(CARE_REMINDER_STATUS),
      default: CARE_REMINDER_STATUS.PENDING,
      index: true,
    },

    sentAt:      { type: Date, default: null },
    respondedAt: { type: Date, default: null },
    response:     { type: String, trim: true, maxlength: 50 },
    responseNote: { type: String, trim: true, maxlength: 500 },

    deliveryChannel: { type: String, enum: ['push', 'sms', 'email', 'call'], default: 'push' },
    reminderJobId:   { type: String, default: null },
    notificationId:  { type: Schema.Types.ObjectId, ref: 'Notification', default: null },

    /** Who responded (patient vs guardian) */
    respondedBy:     { type: Schema.Types.ObjectId, ref: 'User', default: null },
    respondedByRole: { type: String, enum: ['patient', 'guardian', null], default: null },

    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

careReminderSchema.index({ patient: 1, scheduledAt: -1 });
careReminderSchema.index({ task: 1, scheduledAt: 1 });
careReminderSchema.index({ status: 1, scheduledAt: 1 });
careReminderSchema.index({ reminderJobId: 1 }, { partialFilterExpression: { reminderJobId: { $type: 'string' } } });
careReminderSchema.index({ deletedAt: 1 });
careReminderSchema.index({ status: 1, sentAt: 1 });
careReminderSchema.index({ patient: 1, status: 1, scheduledAt: 1 });

careReminderSchema.pre(/^find/, function () {
  if (!this.getQuery().deletedAt) {
    this.where({ deletedAt: null });
  }
});

module.exports = careReminderSchema;
