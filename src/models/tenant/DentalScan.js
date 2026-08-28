'use strict';

const { Schema } = require('mongoose');
const { DENTAL_SCAN_STATUS, DENTAL_SCAN_ANGLE, DENTAL_SCAN_MODE } = require('../../config/constants');

const validationFeedbackSchema = new Schema({
  timestamp:  { type: Date, default: Date.now },
  valid:      { type: Boolean, required: true },
  feedback:   { type: String },
  confidence: { type: Number, min: 0, max: 1 },
}, { _id: false });

const scanImageSchema = new Schema({
  angle:      { type: String, enum: Object.values(DENTAL_SCAN_ANGLE), required: true },
  fileUrl:    { type: String, required: true },
  fileName:   { type: String },
  fileSize:   { type: Number },
  uploadedAt: { type: Date, default: Date.now },

  // ── NEW: Per-angle tooth detection ──
  detectedTeeth:     [{ type: Number }],  // FDI tooth numbers visible in this angle
  detectedQuadrants: [{ type: String }],  // e.g., ['Q2', 'Q3']
  positionConfidence: { type: Number, min: 0, max: 1 }, // AI confidence for correct angle

  // ── NEW: Real-time validation metadata ──
  validationAttempts: { type: Number, default: 0 },
  validationFeedback: [validationFeedbackSchema],
}, { _id: true });

const doctorReviewSchema = new Schema({
  reviewedBy:       { type: Schema.Types.ObjectId, ref: 'User' },
  reviewedAt:       { type: Date },
  verdict:          { type: String, enum: ['confirmed', 'modified', 'rejected'] },
  clinicalNotes:    { type: String, maxlength: 5000 },
  modifiedFindings: [{
    condition:   { type: String },
    confidence:  { type: Number, min: 0, max: 1 },
    severity:    { type: String, enum: ['low', 'moderate', 'high', 'critical'] },
    location:    { type: String },
    description: { type: String },
  }],
  recommendations:  { type: String, maxlength: 3000 },
  urgency:          { type: String, enum: ['none', 'routine', 'soon', 'urgent'], default: 'routine' },
}, { _id: false });

const dentalScanSchema = new Schema(
  {
    patient: { type: Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },

    status: {
      type: String,
      enum: Object.values(DENTAL_SCAN_STATUS),
      default: DENTAL_SCAN_STATUS.CAPTURING,
      index: true,
    },

    scanType: {
      type: String,
      enum: ['intraoral', 'xray', 'general'],
      default: 'general',
    },

    scanMode: {
      type: String,
      enum: Object.values(DENTAL_SCAN_MODE),
      default: DENTAL_SCAN_MODE.GUIDED_3POS,
    },

    // Guided capture images (3 for guided_3pos, 5 for classic_5angle)
    images: [scanImageSchema],

    // Consent tracking
    consentGiven:     { type: Boolean, required: true, default: false },
    consentTimestamp:  { type: Date },
    consentIp:        { type: String },

    // Timing
    scanStartedAt: { type: Date, default: Date.now },
    completedAt:   { type: Date },

    // Failure tracking
    failureReason: { type: String },

    // BullMQ job reference
    analysisJobId: { type: String },

    // Doctor review (after AI analysis completes)
    doctorReview: { type: doctorReviewSchema, default: null },

    // ── NEW: Voice guidance tracking ──
    voiceGuidanceEnabled:   { type: Boolean, default: true },
    totalVoiceInstructions: { type: Number, default: 0 },

    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },

    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// ── Indexes ──────────────────────────────────────────────
dentalScanSchema.index({ patient: 1, createdAt: -1 });
dentalScanSchema.index({ deletedAt: 1 });

// ── Soft-delete filter ───────────────────────────────────
dentalScanSchema.pre(/^find/, function () {
  if (!this.getQuery().deletedAt) {
    this.where({ deletedAt: null });
  }
});

module.exports = dentalScanSchema;
