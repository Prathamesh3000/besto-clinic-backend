'use strict';

const { Schema } = require('mongoose');
const { DENTAL_OBSERVATION_TYPE, CONFIDENCE_LEVEL } = require('../../config/constants');
const { isValidFDI, isValidUS } = require('../../utils/fdiUtils');

const fdiToothValidator = {
  validator: (v) => isValidFDI(v) || isValidUS(v),
  message: '{VALUE} is not a valid FDI (11-48) or US Universal (1-32) tooth number',
};

const observationSchema = new Schema({
  type: {
    type: String,
    enum: Object.values(DENTAL_OBSERVATION_TYPE),
    required: true,
  },
  area:         { type: String },
  toothNumbers: [{ type: Number, validate: fdiToothValidator }],
  confidence: {
    type: String,
    enum: Object.values(CONFIDENCE_LEVEL),
    required: true,
  },
  description: { type: String, required: true },

  // ── NEW: Source angle tracking ──
  sourceAngles:      [{ type: String }], // Which capture angles contributed to this observation
  angleSpecificNotes: { type: Map, of: String }, // e.g., { 'left': 'visible in Q2', 'front': 'confirmed' }
}, { _id: true });

const dentalScanResultSchema = new Schema(
  {
    scan:    { type: Schema.Types.ObjectId, ref: 'DentalScan', required: true },
    patient: { type: Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },

    observations: [observationSchema],

    overallSummary: { type: String, required: true },

    recommendedSpecs: [{ type: String }],

    // Oral health score (computed from observations)
    healthScore: {
      overall:   { type: Number, min: 0, max: 100 },
      teeth:     { type: Number, min: 0, max: 100 },
      gums:      { type: Number, min: 0, max: 100 },
      alignment: { type: Number, min: 0, max: 100 },
      hygiene:   { type: Number, min: 0, max: 100 },
      label:     { type: String },
    },

    disclaimer: {
      type: String,
      default:
        'This is a preliminary visual assessment only. It is not a professional diagnosis. Please consult a licensed dentist for accurate evaluation and treatment.',
    },
    disclaimerAcknowledged: { type: Boolean, default: false },

    // ── NEW: Per-angle breakdown ──
    angleAnalysis: [{
      angle:        { type: String },
      teethVisible: [{ type: Number }],
      quadrants:    [{ type: String }],
      observations: [observationSchema],
      qualityScore: { type: Number, min: 0, max: 100 },
    }],

    // AI metadata
    analysisModel:     { type: String },
    analysisLatencyMs: { type: Number },
    rawAiResponse:     { type: Schema.Types.Mixed, select: false },
  },
  { timestamps: true },
);

// ── Indexes ──────────────────────────────────────────────
dentalScanResultSchema.index({ scan: 1 }, { unique: true });
dentalScanResultSchema.index({ patient: 1, createdAt: -1 });
dentalScanResultSchema.index({ 'observations.type': 1 });

module.exports = dentalScanResultSchema;
