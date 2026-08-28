'use strict';

const { Schema } = require('mongoose');

const TEMPLATE_CATEGORY = [
  'general', 'diagnostic', 'preventive', 'restorative',
  'endodontic', 'periodontic', 'orthodontic', 'prosthodontic',
  'surgical', 'cosmetic',
];

const consultationTemplateSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 200 },
    code: { type: String, required: true, uppercase: true, trim: true, maxlength: 30 },
    category: {
      type: String,
      enum: TEMPLATE_CATEGORY,
      required: true,
    },
    description: { type: String, trim: true, maxlength: 1000 },

    /** Template clinical data */
    chiefComplaint: { type: String, trim: true },
    diagnosis: { type: String, trim: true },
    treatment: { type: String, trim: true },
    treatmentPlan: { type: String, trim: true },
    notes: { type: String, trim: true },
    followUpInstructions: { type: String, trim: true },

    /** Default prescriptions */
    defaultPrescriptions: [
      {
        medication: { type: String, required: true, trim: true },
        dosage: { type: String, trim: true },
        frequency: { type: String, trim: true },
        duration: { type: String, trim: true },
        notes: { type: String, trim: true },
      },
    ],

    /** Default care tasks */
    defaultCareTasks: [
      {
        title: { type: String, required: true, trim: true },
        taskType: {
          type: String,
          enum: ['medication', 'hygiene', 'post_care', 'follow_up', 'dietary', 'custom'],
          default: 'custom',
        },
        instructions: { type: String, trim: true },
        frequency: { type: String, default: 'once' },
      },
    ],

    /** Default materials (linked to InventoryItem) — auto-populates materialsUsed on template apply */
    defaultMaterials: [
      {
        item: { type: Schema.Types.ObjectId, ref: 'InventoryItem', required: true },
        itemName: { type: String, required: true, trim: true, maxlength: 200 },
        quantity: { type: Number, required: true, min: 1, default: 1 },
        costPerUnit: { type: Number, default: 0, min: 0 },
      },
    ],

    defaultProcedure: { type: String, trim: true },
    defaultPriority: {
      type: String,
      enum: ['immediate', 'urgent', 'routine', null],
      default: null,
    },

    isSystemTemplate: { type: Boolean, default: false },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    isActive: { type: Boolean, default: true },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

consultationTemplateSchema.index({ code: 1 }, { unique: true });
consultationTemplateSchema.index({ category: 1, isActive: 1 });
consultationTemplateSchema.index({ deletedAt: 1 });

consultationTemplateSchema.pre(/^find/, function () {
  if (!this.getQuery().deletedAt) {
    this.where({ deletedAt: null });
  }
});

module.exports = consultationTemplateSchema;
