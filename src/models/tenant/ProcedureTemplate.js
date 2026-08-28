'use strict';

const { Schema } = require('mongoose');
const { PROCEDURE_CATEGORY } = require('../../config/constants');

const requiredMaterialSchema = new Schema({
  item:       { type: Schema.Types.ObjectId, ref: 'InventoryItem', required: true },
  itemName:   { type: String, required: true, trim: true },
  quantity:   { type: Number, required: true, min: 1 },
  isOptional: { type: Boolean, default: false },
}, { _id: false });

const procedureTemplateSchema = new Schema(
  {
    name:        { type: String, required: true, trim: true, maxlength: 200 },
    code:        { type: String, required: true, uppercase: true, trim: true, maxlength: 30 },
    category: {
      type: String,
      enum: Object.values(PROCEDURE_CATEGORY),
      required: true,
    },
    description:       { type: String, trim: true, maxlength: 1000 },
    requiredMaterials: { type: [requiredMaterialSchema], default: [] },
    estimatedDuration: { type: Number, min: 10 },
    estimatedCost:     { type: Number, min: 0 },
    department:        { type: Schema.Types.ObjectId, ref: 'Department' },
    isActive:          { type: Boolean, default: true },
    createdBy:         { type: Schema.Types.ObjectId, ref: 'User' },
    deletedAt:         { type: Date, default: null },
  },
  { timestamps: true },
);

procedureTemplateSchema.index({ code: 1 }, { unique: true });
procedureTemplateSchema.index({ category: 1, isActive: 1 });
procedureTemplateSchema.index({ deletedAt: 1 });

procedureTemplateSchema.pre('save', function () {
  if (this.isModified('code')) {
    this.code = this.code.toUpperCase();
  }
});

procedureTemplateSchema.pre(/^find/, function () {
  if (!this.getQuery().deletedAt) {
    this.where({ deletedAt: null });
  }
});

module.exports = procedureTemplateSchema;
