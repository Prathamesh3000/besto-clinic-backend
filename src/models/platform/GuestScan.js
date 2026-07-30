'use strict';

const mongoose = require('mongoose');

const ANGLES = ['front', 'left', 'right', 'upper', 'lower', 'tongue']; // keep all for backward compat + tongue
const SCAN_MODES = ['guided_3pos', 'classic_5angle', 'enhanced_3pos']; // v2.0 multi-frame mode
const ENHANCED_POSITION_IDS = [
  'front_smile', 'left_lateral', 'right_lateral',
];

const OBS_TYPES = [
  'plaque', 'inflammation', 'discoloration', 'misalignment',
  'cavity', 'gum_recession', 'other',
];

const guestScanSchema = new mongoose.Schema(
  {
    // Session tracking (replaces auth)
    sessionToken: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    status: {
      type: String,
      enum: ['capturing', 'processing', 'completed', 'failed'],
      default: 'capturing',
      index: true,
    },

    scanMode: {
      type: String,
      enum: SCAN_MODES,
      default: 'guided_3pos',
    },

    // Legacy: Guided capture images (3 for guided_3pos, 5 for classic_5angle)
    images: [
      {
        angle:      { type: String, enum: ANGLES, required: true },
        fileUrl:    { type: String, required: true },
        fileName:   { type: String },
        fileSize:   { type: Number },
        uploadedAt: { type: Date, default: Date.now },
      },
    ],

    // Enhanced v2.0: Multi-frame positions (for scanMode: 'enhanced_6pos')
    enhancedPositions: [
      {
        positionId: {
          type: String,
          enum: ENHANCED_POSITION_IDS,
          required: true,
        },
        positionIndex: { type: Number, required: true },

        // Multi-frame captures (3-5 frames per position)
        frames: [
          {
            frameIndex:  { type: Number, required: true },
            fileUrl:     { type: String, required: true },
            fileName:    { type: String },
            fileSize:    { type: Number },
            uploadedAt:  { type: Date, default: Date.now },

            // Client-side quality metrics
            quality: {
              overall:     { type: Number, min: 0, max: 1 },
              blur:        { type: Number, min: 0, max: 1 },
              brightness:  { type: Number, min: 0, max: 1 },
              contrast:    { type: Number, min: 0, max: 1 },
              sharpness:   { type: Number, min: 0, max: 1 },
            },
          },
        ],

        // Selected best frame
        selectedFrameIndex: { type: Number, required: true },

        // Server-side validation result
        serverValidation: {
          validated:      { type: Boolean, default: false },
          teethVisible:   { type: Number },
          teethDetected:  [{ type: Number }], // FDI tooth numbers detected
          gumVisible:     { type: Boolean },
          qualityScore:   { type: Number, min: 0, max: 1 },
          feedback:       { type: String },
          validatedAt:    { type: Date },
        },

        // Position completion
        completedAt: { type: Date, default: Date.now },
        retryCount:  { type: Number, default: 0 },
        forced:      { type: Boolean, default: false }, // Manual override
      },
    ],

    // Lead capture
    lead: {
      name:       { type: String, trim: true },
      email:      { type: String, lowercase: true, trim: true },
      phone:      { type: String, trim: true },
      capturedAt: { type: Date },
    },

    // Consent
    consentGiven:     { type: Boolean, required: true, default: false },
    consentTimestamp:  { type: Date },
    consentIp:        { type: String },

    // AI analysis result (embedded)
    result: {
      observations: [
        {
          type:         { type: String, enum: OBS_TYPES },
          area:         { type: String },
          toothNumbers: [{
            type: Number,
            validate: {
              validator: (v) => {
                if (!Number.isInteger(v)) return false;
                // Accept FDI (11-48 valid combos) or legacy US (1-32)
                if (v >= 1 && v <= 32) return true;
                const q = Math.floor(v / 10), t = v % 10;
                return q >= 1 && q <= 4 && t >= 1 && t <= 8;
              },
              message: '{VALUE} is not a valid FDI or US Universal tooth number',
            },
          }],
          confidence:   { type: String, enum: ['low', 'medium', 'high'] },
          description:  { type: String },
        },
      ],
      overallSummary: { type: String },
      recommendedSpecs: [{ type: String }],
      disclaimer: {
        type: String,
        default:
          'This is a preliminary visual assessment only. It is not a professional diagnosis. Please consult a licensed dentist for accurate evaluation and treatment.',
      },
      // Oral health score (computed from observations)
      healthScore: {
        overall:   { type: Number, min: 0, max: 100 },
        teeth:     { type: Number, min: 0, max: 100 },
        gums:      { type: Number, min: 0, max: 100 },
        alignment: { type: Number, min: 0, max: 100 },
        hygiene:   { type: Number, min: 0, max: 100 },
        label:     { type: String },
      },
      analysisModel:     { type: String },
      analysisLatencyMs: { type: Number },
      tokenUsage: {
        promptTokens:     { type: Number, default: 0 },
        completionTokens: { type: Number, default: 0 },
        thinkingTokens:   { type: Number, default: 0 },
        totalTokens:      { type: Number, default: 0 },
      },
    },

    // Report tracking
    reportSentAt: { type: Date },

    // Share link
    shareToken:       { type: String, index: true, sparse: true },
    shareExpiresAt:   { type: Date },
    shareAccessCount: { type: Number, default: 0 },

    // Job tracking
    analysisJobId: { type: String },
    failureReason: { type: String },

    // Analytics
    source:    { type: String, default: 'website_chatbot' },
    userAgent: { type: String },
    referrer:  { type: String },

    // Auto-cleanup (30 days)
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      index: { expireAfterSeconds: 0 },
    },
  },
  { timestamps: true },
);

guestScanSchema.index({ 'lead.email': 1 });
guestScanSchema.index({ createdAt: -1 });

module.exports = mongoose.model('GuestScan', guestScanSchema);
