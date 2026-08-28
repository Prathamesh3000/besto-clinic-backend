'use strict';

const mongoose = require('mongoose');
const { SERVICE_ITEM_CATEGORY } = require('../../config/constants');

const serviceItemSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      maxlength: 50,
    },
    category: {
      type: String,
      enum: Object.values(SERVICE_ITEM_CATEGORY),
      required: true,
    },
    description: { type: String, trim: true },
    defaultPrice: { type: Number, required: true, min: 0 },
    taxRate: { type: Number, default: 0, min: 0, max: 100 },
    taxType: {
      type: String,
      enum: ['inclusive', 'exclusive'],
      default: 'exclusive',
    },
    hsnCode: { type: String, trim: true },
    unit: { type: String, default: 'unit', trim: true },
    isActive: { type: Boolean, default: true },
    branch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Branch',
    },
    department: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Department',
    },
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
serviceItemSchema.index({ category: 1, isActive: 1 });
serviceItemSchema.index({ name: 'text' });
serviceItemSchema.index({ deletedAt: 1 });

// Soft-delete filter
serviceItemSchema.pre(/^find/, function () {
  if (!this.getQuery().deletedAt) {
    this.where({ deletedAt: null });
  }
});

// Uppercase code before save
serviceItemSchema.pre('save', function (next) {
  if (this.code) {
    this.code = this.code.toUpperCase();
  }
  next();
});

module.exports = serviceItemSchema;
