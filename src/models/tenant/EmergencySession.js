'use strict';

const { Schema } = require('mongoose');
const { EMERGENCY_SESSION_TYPE, EMERGENCY_SESSION_STATUS } = require('../../config/constants');

const emergencySessionSchema = new Schema(
  {
    patient:   { type: Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
    doctor:    { type: Schema.Types.ObjectId, ref: 'User', index: true },
    branch:    { type: Schema.Types.ObjectId, ref: 'Branch', index: true },
    type: {
      type: String,
      enum: Object.values(EMERGENCY_SESSION_TYPE),
      required: true,
    },
    status: {
      type: String,
      enum: Object.values(EMERGENCY_SESSION_STATUS),
      default: EMERGENCY_SESSION_STATUS.REQUESTED,
      index: true,
    },
    roomId:    { type: String, trim: true },
    reason:    { type: String, trim: true, maxlength: 1000 },
    /**
     * Triage payload captured at request time.
     * - symptoms: free-form tag chips chosen by the patient
     * - pain:     0-10 pain scale
     * - priority: computed from triage (critical > high > medium > low)
     */
    symptoms: [{ type: String, trim: true, maxlength: 120 }],
    pain:     { type: Number, min: 0, max: 10 },
    priority: {
      type: String,
      enum: ['low', 'medium', 'high', 'critical'],
      default: 'medium',
      index: true,
    },
    /**
     * Auto-created VideoSession linked once a doctor accepts.
     * Covers both type:'video' and type:'chat' — chat emergencies use the
     * linked VideoSession as the unified chat container.
     */
    videoSession: { type: Schema.Types.ObjectId, ref: 'VideoSession', index: true },
    acceptedAt:  { type: Date },
    cancelledAt: { type: Date },
    cancelledBy: { type: Schema.Types.ObjectId, ref: 'User' },
    cancelReason:{ type: String, trim: true, maxlength: 500 },
    /**
     * Audit trail of doctors who dismissed this emergency from their queue
     * without accepting. Does not block other doctors from picking it up.
     */
    declinedBy: [
      {
        doctor: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        at:     { type: Date, default: Date.now },
        reason: { type: String, trim: true, maxlength: 500 },
      },
    ],
    startedAt: { type: Date },
    endedAt:   { type: Date },
    duration:  { type: Number }, // seconds
    notes:     { type: String, trim: true, maxlength: 2000 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

emergencySessionSchema.index({ patient: 1, createdAt: -1 });
emergencySessionSchema.index({ doctor: 1, status: 1 });
emergencySessionSchema.index({ status: 1, createdAt: -1 });

module.exports = emergencySessionSchema;
