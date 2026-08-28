'use strict';

const { Schema } = require('mongoose');
const { RESERVATION_STATUS } = require('../../config/constants');

const reservationItemSchema = new Schema({
  item:     { type: Schema.Types.ObjectId, ref: 'InventoryItem', required: true },
  itemName: { type: String, required: true, trim: true },
  quantity: { type: Number, required: true, min: 1 },
  status:   { type: String, enum: ['reserved', 'used', 'released'], default: 'reserved' },
}, { _id: false });

const materialReservationSchema = new Schema(
  {
    appointment: { type: Schema.Types.ObjectId, ref: 'Appointment', required: true, index: true },
    patient:     { type: Schema.Types.ObjectId, ref: 'Patient' },
    procedure:   { type: Schema.Types.ObjectId, ref: 'ProcedureTemplate', required: true },
    items:       { type: [reservationItemSchema], required: true },
    status: {
      type: String,
      enum: Object.values(RESERVATION_STATUS),
      default: RESERVATION_STATUS.RESERVED,
    },
    reservedAt: { type: Date, default: Date.now },
    releasedAt: { type: Date },
    usedAt:     { type: Date },
    reservedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    branch:     { type: Schema.Types.ObjectId, ref: 'Branch', index: true },
    notes:      { type: String, trim: true, maxlength: 500 },
    deletedAt:  { type: Date, default: null },
  },
  { timestamps: true },
);

materialReservationSchema.index({ patient: 1, status: 1 });
materialReservationSchema.index({ branch: 1, status: 1 });
materialReservationSchema.index({ deletedAt: 1 });

materialReservationSchema.pre(/^find/, function () {
  if (!this.getQuery().deletedAt) {
    this.where({ deletedAt: null });
  }
});

module.exports = materialReservationSchema;
