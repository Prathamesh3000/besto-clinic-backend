'use strict';

const { Schema } = require('mongoose');

const vendorSchema = new Schema(
  {
    name:          { type: String, required: true, trim: true, maxlength: 200 },
    contactPerson: { type: String, trim: true, maxlength: 200 },
    email:         { type: String, trim: true, lowercase: true, maxlength: 100 },
    phone:         { type: String, trim: true, maxlength: 20 },
    company:       { type: String, trim: true, maxlength: 200 },
    address:       { type: String, trim: true, maxlength: 500 },
    city:          { type: String, trim: true, maxlength: 100 },
    gstNumber:     { type: String, trim: true, maxlength: 50 },
    notes:         { type: String, trim: true, maxlength: 1000 },

    branch:    { type: Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
    isActive:  { type: Boolean, default: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

/* ── Indexes ─────────────────────────────────────── */
vendorSchema.index({ branch: 1, isActive: 1 });
vendorSchema.index({ deletedAt: 1 });
vendorSchema.index({ name: 'text', company: 'text' });

/* ── Soft-delete filter ──────────────────────────── */
vendorSchema.pre(/^find/, function () {
  if (this.getFilter().deletedAt === undefined) {
    this.where({ deletedAt: null });
  }
});

module.exports = vendorSchema;
