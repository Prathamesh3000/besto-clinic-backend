'use strict';

const mongoose = require('mongoose');
const { VIDEO_SESSION_STATUS, VIDEO_SESSION_TYPE } = require('../../config/constants');

const videoSessionSchema = new mongoose.Schema(
  {
    /** Session type */
    type: {
      type: String,
      enum: Object.values(VIDEO_SESSION_TYPE),
      required: true,
    },

    /** Status lifecycle */
    status: {
      type: String,
      enum: Object.values(VIDEO_SESSION_STATUS),
      default: VIDEO_SESSION_STATUS.REQUESTED,
    },

    /** Participants */
    patient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Patient',
      required: true,
      index: true,
    },
    doctor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },
    branch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Branch',
    },
    appointment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Appointment',
    },

    /** Room & tokens */
    roomId: {
      type: String,
      unique: true,
      sparse: true,
    },
    roomToken: String,        // encrypted TURN/room token for doctor
    patientToken: String,     // encrypted TURN/room token for patient
    signalingServer: String,  // WebRTC signaling URL

    /** Scheduling */
    scheduledAt: Date,
    startedAt: Date,
    endedAt: Date,
    duration: { type: Number, default: 0 },           // seconds
    maxDuration: { type: Number, default: 1800 },      // 30 min default
    extensions: { type: Number, default: 0 },          // number of times extended
    expiresAt: {
      type: Date,
      // NOTE: TTL auto-delete removed to prevent permanent loss of medical session data.
      // Expired sessions should be cleaned up via a scheduled job that soft-deletes them.
    },

    /** Consent */
    recordingConsent: {
      patient: { type: Boolean, default: false },
      doctor: { type: Boolean, default: false },
    },
    isRecorded: { type: Boolean, default: false },
    recordingUrl: String,

    /** Session details */
    reason: { type: String, trim: true, maxlength: 1000 },
    notes: { type: String, trim: true, maxlength: 5000 },
    diagnosis: String,
    prescription: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Prescription',
    },

    /** Connection quality tracking */
    connectionLog: [{
      participant: String,     // 'doctor' or 'patient'
      event: String,           // 'joined', 'left', 'reconnected', 'disconnected'
      timestamp: { type: Date, default: Date.now },
      metadata: mongoose.Schema.Types.Mixed,
    }],

    /** File sharing */
    sharedFiles: [{
      name: String,
      url: String,
      mimeType: String,
      size: Number,
      uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      uploadedAt: { type: Date, default: Date.now },
    }],

    /** Metadata */
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
videoSessionSchema.index({ status: 1, scheduledAt: 1 });
videoSessionSchema.index({ patient: 1, createdAt: -1 });
videoSessionSchema.index({ doctor: 1, status: 1 });
videoSessionSchema.index({ roomId: 1 }, { unique: true, sparse: true });
videoSessionSchema.index({ appointment: 1 }, { sparse: true });
videoSessionSchema.index({ deletedAt: 1 });

// Soft-delete filter
videoSessionSchema.pre(/^find/, function () {
  if (!this.getQuery().deletedAt) {
    this.where({ deletedAt: null });
  }
});

module.exports = videoSessionSchema;
