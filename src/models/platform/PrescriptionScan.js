'use strict';

const mongoose = require('mongoose');

const prescriptionScanSchema = new mongoose.Schema(
  {
    // Session tracking (for anonymous users)
    sessionToken: {
      type: String,
      unique: true,
      sparse: true,
      index: true,
    },

    // For logged-in users (optional)
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      sparse: true,
      index: true,
    },

    status: {
      type: String,
      enum: ['pending', 'completed', 'failed'],
      default: 'pending',
      index: true,
    },

    // Original uploaded image
    image: {
      fileUrl:  { type: String, required: true },
      fileName: { type: String },
      fileSize: { type: Number },
      mimeType: { type: String },
    },

    // AI transcription result
    result: {
      transcription:     { type: String },
      detectedLanguages: [{ type: String }],
      medications: [
        {
          name:      { type: String },
          dosage:    { type: String },
          frequency: { type: String },
          duration:  { type: String },
          notes:     { type: String },
        },
      ],
      patientName:  { type: String },
      doctorName:   { type: String },
      date:         { type: String },
      confidence:   { type: String, enum: ['low', 'medium', 'high'] },
      imageQuality: { type: String, enum: ['good', 'fair', 'poor'] },
      notes:        { type: String },
    },

    // On-demand translation
    translation: {
      translatedText:  { type: String },
      targetLanguage:  { type: String },
      sourceLanguages: [{ type: String }],
      translatedAt:    { type: Date },
    },

    // AI metadata
    modelVersion: { type: String },
    processingMs: { type: Number },

    // Error tracking
    failureReason: { type: String },

    // Analytics
    source: {
      type: String,
      default: 'website',
      enum: ['website', 'mobile_app'],
    },
    userAgent: { type: String },

    // Auto-cleanup (30 days)
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      index: { expireAfterSeconds: 0 },
    },
  },
  { timestamps: true },
);

prescriptionScanSchema.index({ createdAt: -1 });

module.exports = mongoose.model('PrescriptionScan', prescriptionScanSchema);
