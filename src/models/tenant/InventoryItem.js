'use strict';

const { Schema } = require('mongoose');
const { INVENTORY_CATEGORY } = require('../../config/constants');

const supplierSchema = new Schema({
  name:         { type: String, trim: true, maxlength: 200 },
  contactPhone: { type: String, trim: true, maxlength: 20 },
  contactEmail: { type: String, trim: true, lowercase: true, maxlength: 100 },
  leadTimeDays: { type: Number, min: 0 },
}, { _id: false });

const inventoryItemSchema = new Schema(
  {
    name:             { type: String, required: true, trim: true, maxlength: 200 },
    code:             { type: String, required: true, uppercase: true, trim: true, maxlength: 30 },
    category: {
      type: String,
      enum: Object.values(INVENTORY_CATEGORY),
      required: true,
      index: true,
    },
    description:      { type: String, trim: true, maxlength: 1000 },
    unit:             { type: String, trim: true, default: 'piece' },

    currentStock:     { type: Number, default: 0, min: 0 },
    minimumThreshold: { type: Number, default: 5, min: 0 },

    costPerUnit:      { type: Number, min: 0 },
    currency:         { type: String, default: 'INR', maxlength: 5 },
    supplier:         { type: supplierSchema, default: () => ({}) },

    expiryDate:       { type: Date },
    branch:           { type: Schema.Types.ObjectId, ref: 'Branch', index: true },

    lastRestockedAt:  { type: Date },
    lastRestockedBy:  { type: Schema.Types.ObjectId, ref: 'User' },
    isActive:         { type: Boolean, default: true },
    createdBy:        { type: Schema.Types.ObjectId, ref: 'User' },
    deletedAt:        { type: Date, default: null },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } },
);

inventoryItemSchema.virtual('availableStock').get(function () {
  return this.currentStock;
});

inventoryItemSchema.virtual('isLowStock').get(function () {
  return this.currentStock <= this.minimumThreshold;
});

inventoryItemSchema.virtual('isExpiringSoon').get(function () {
  if (!this.expiryDate) return false;
  const thirtyDays = 30 * 24 * 60 * 60 * 1000;
  return this.expiryDate.getTime() - Date.now() <= thirtyDays;
});

inventoryItemSchema.index({ code: 1 }, { unique: true });
inventoryItemSchema.index({ branch: 1, category: 1 });
inventoryItemSchema.index({ branch: 1, isActive: 1 });
inventoryItemSchema.index({ expiryDate: 1 });
inventoryItemSchema.index({ deletedAt: 1 });
inventoryItemSchema.index({ name: 'text', description: 'text' });

inventoryItemSchema.pre('save', function () {
  if (this.isModified('code')) {
    this.code = this.code.toUpperCase();
  }
});

inventoryItemSchema.pre(/^find/, function () {
  if (!this.getQuery().deletedAt) {
    this.where({ deletedAt: null });
  }
});

module.exports = inventoryItemSchema;
