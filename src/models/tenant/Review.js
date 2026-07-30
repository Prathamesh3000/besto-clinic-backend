'use strict';

const { Schema } = require('mongoose');

const reviewSchema = new Schema(
  {
    patient:     { type: Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
    doctor:      { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    appointment: { type: Schema.Types.ObjectId, ref: 'Appointment', index: true },

    rating:      { type: Number, required: true, min: 1, max: 5 },
    title:       { type: String, trim: true, maxlength: 100 },
    comment:     { type: String, trim: true, maxlength: 1000 },

    isAnonymous: { type: Boolean, default: false },
    status:      {
      type: String,
      enum: ['pending', 'approved', 'flagged'],
      default: 'pending',
      index: true,
    },

    createdBy:   { type: Schema.Types.ObjectId, ref: 'User', required: true },
    deletedAt:   { type: Date, default: null },
  },
  { timestamps: true },
);

reviewSchema.index({ patient: 1, appointment: 1 }, { unique: true });
reviewSchema.index({ doctor: 1, createdAt: -1 });
reviewSchema.index({ deletedAt: 1 });

// Soft-delete filter
reviewSchema.pre(/^find/, function () {
  if (!this.getQuery().deletedAt) {
    this.where({ deletedAt: null });
  }
});

module.exports = reviewSchema;
