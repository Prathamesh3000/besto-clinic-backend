'use strict';

const mongoose = require('mongoose');

/**
 * Per-clinic "New Patient Registration" form definition — singleton per tenant.
 *
 * Created lazily with defaults on first GET (see patientForm.logic.buildDefaultConfig).
 * `version` is bumped on every PUT so submissions can record which layout they used.
 * `qr.token` is the opaque secret embedded in the clinic's form QR; regenerating
 * it invalidates every previously printed QR.
 */
const optionSchema = new mongoose.Schema(
  {
    value: { type: String, required: true },
    label: { type: String, required: true },
  },
  { _id: false },
);

const fieldSchema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    label: { type: String, required: true },
    type: {
      type: String,
      enum: ['text', 'textarea', 'phone', 'number', 'radio', 'select', 'checkbox', 'signature'],
      required: true,
    },
    builtIn: { type: Boolean, default: false },
    locked: { type: Boolean, default: false },
    enabled: { type: Boolean, default: true },
    required: { type: Boolean, default: false },
    order: { type: Number, default: 0 },
    options: { type: [optionSchema], default: undefined },
  },
  { _id: false },
);

const patientFormConfigSchema = new mongoose.Schema(
  {
    /** Constant marker + unique index = exactly one document per tenant database. */
    singleton: { type: String, default: 'default', immutable: true },

    version: { type: Number, default: 1 },
    title: { type: String, default: 'New Patient Registration' },
    consentText: { type: String, default: '' },
    fields: { type: [fieldSchema], default: [] },

    qr: {
      enabled: { type: Boolean, default: true },
      token: { type: String, required: true },
      regeneratedAt: { type: Date },
    },

    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

patientFormConfigSchema.index({ singleton: 1 }, { unique: true });

module.exports = patientFormConfigSchema;
