'use strict';

const mongoose = require('mongoose');
const { UPLOAD_STATUS, UPLOAD_ENTITY_TYPE } = require('../../config/constants');

const legacyUploadSchema = new mongoose.Schema(
  {
    fileName: {
      type: String,
      required: [true, 'File name is required'],
      trim: true,
    },
    originalName: { type: String, trim: true },
    fileSize: { type: Number, min: 0 }, // bytes
    fileType: {
      type: String,
      enum: ['csv', 'xlsx'],
      default: 'csv',
    },

    entityType: {
      type: String,
      enum: Object.values(UPLOAD_ENTITY_TYPE),
      required: [true, 'Entity type is required'],
    },

    status: {
      type: String,
      enum: Object.values(UPLOAD_STATUS),
      default: UPLOAD_STATUS.PENDING,
    },

    totalRows: { type: Number, default: 0, min: 0 },
    processedRows: { type: Number, default: 0, min: 0 },
    successCount: { type: Number, default: 0, min: 0 },
    failedCount: { type: Number, default: 0, min: 0 },

    errors: {
      type: [
        {
          row: Number,
          field: String,
          message: String,
        },
      ],
      default: [],
      validate: [
        function (val) { return val.length <= 100; },
        'Error log capped at 100 entries',
      ],
    },

    columnMapping: { type: mongoose.Schema.Types.Mixed },

    startedAt: Date,
    completedAt: Date,

    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    deletedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true, transform(_doc, ret) { delete ret.__v; return ret; } },
  },
);

// Indexes
legacyUploadSchema.index({ entityType: 1, status: 1 });
legacyUploadSchema.index({ uploadedBy: 1 });
legacyUploadSchema.index({ deletedAt: 1 });

// Soft-delete filter
legacyUploadSchema.pre(/^find/, function () {
  if (!this.getQuery().deletedAt) {
    this.where({ deletedAt: null });
  }
});

module.exports = legacyUploadSchema;
