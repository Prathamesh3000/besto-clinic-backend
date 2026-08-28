'use strict';

const { Schema } = require('mongoose');
const { INVENTORY_TRANSACTION_TYPE } = require('../../config/constants');

const inventoryTransactionSchema = new Schema(
  {
    item:   { type: Schema.Types.ObjectId, ref: 'InventoryItem', required: true, index: true },
    type: {
      type: String,
      enum: Object.values(INVENTORY_TRANSACTION_TYPE),
      required: true,
    },
    quantity:         { type: Number, required: true },
    previousStock:    { type: Number, required: true },
    newStock:         { type: Number, required: true },
    previousReserved: { type: Number, default: 0 },
    newReserved:      { type: Number, default: 0 },

    reason:          { type: String, trim: true, maxlength: 500 },
    reference:       { type: Schema.Types.ObjectId },
    referenceModel:  { type: String, trim: true },
    patient:         { type: Schema.Types.ObjectId, ref: 'Patient' },
    branch:          { type: Schema.Types.ObjectId, ref: 'Branch' },
    performedBy:     { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

inventoryTransactionSchema.index({ item: 1, createdAt: -1 });
inventoryTransactionSchema.index({ branch: 1, type: 1 });
inventoryTransactionSchema.index({ createdAt: -1 });

// Immutable — block all updates and deletes
inventoryTransactionSchema.pre(['updateOne', 'updateMany', 'findOneAndUpdate', 'findOneAndReplace'], function () {
  throw new Error('InventoryTransaction records are immutable and cannot be updated');
});

inventoryTransactionSchema.pre(['deleteOne', 'deleteMany', 'findOneAndDelete'], function () {
  throw new Error('InventoryTransaction records are immutable and cannot be deleted');
});

module.exports = inventoryTransactionSchema;
