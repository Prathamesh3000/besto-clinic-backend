'use strict';

const { Schema } = require('mongoose');
const { PURCHASE_ORDER_STATUS, PURCHASE_ORDER_URGENCY } = require('../../config/constants');

const poItemSchema = new Schema(
  {
    inventoryItem: { type: Schema.Types.ObjectId, ref: 'InventoryItem', required: true },
    itemName:      { type: String, trim: true, maxlength: 200 },
    quantity:      { type: Number, required: true, min: 1 },
    unitPrice:     { type: Number, default: 0, min: 0 },
    receivedQty:   { type: Number, default: 0, min: 0 },
  },
  { _id: false },
);

const statusHistorySchema = new Schema(
  {
    status:    { type: String, required: true },
    changedAt: { type: Date, default: Date.now },
    changedBy: { type: String },               // userId
    note:      { type: String, trim: true, maxlength: 500 },
  },
  { _id: false },
);

const purchaseOrderSchema = new Schema(
  {
    orderNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      maxlength: 30,
    },

    vendor: { type: Schema.Types.ObjectId, ref: 'Vendor', required: true, index: true },
    branch: { type: Schema.Types.ObjectId, ref: 'Branch', required: true },

    items:       [poItemSchema],
    totalAmount: { type: Number, default: 0, min: 0 },

    status: {
      type: String,
      enum: Object.values(PURCHASE_ORDER_STATUS),
      default: PURCHASE_ORDER_STATUS.REQUESTED,
      index: true,
    },
    statusHistory: [statusHistorySchema],

    expectedDelivery: { type: Date },
    actualDelivery:   { type: Date },

    urgency: {
      type: String,
      enum: Object.values(PURCHASE_ORDER_URGENCY),
      default: PURCHASE_ORDER_URGENCY.NORMAL,
    },

    notes:       { type: String, trim: true, maxlength: 1000 },
    requestedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    createdBy:   { type: Schema.Types.ObjectId, ref: 'User' },
    patient:     { type: Schema.Types.ObjectId, ref: 'Patient', default: null },

    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

/* ── Indexes ─────────────────────────────────────── */
purchaseOrderSchema.index({ vendor: 1, status: 1 });
purchaseOrderSchema.index({ branch: 1, createdAt: -1 });
purchaseOrderSchema.index({ status: 1, createdAt: -1 });
purchaseOrderSchema.index({ patient: 1, createdAt: -1 });
purchaseOrderSchema.index({ deletedAt: 1 });

/* ── Soft-delete filter ──────────────────────────── */
purchaseOrderSchema.pre(/^find/, function () {
  if (this.getFilter().deletedAt === undefined) {
    this.where({ deletedAt: null });
  }
});

module.exports = purchaseOrderSchema;
