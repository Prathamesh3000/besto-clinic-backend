'use strict';

const mongoose = require('mongoose');

const consultationRoomSchema = new mongoose.Schema(
  {
    branch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Branch',
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    code: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
      maxlength: 20,
    },
    type: {
      type: String,
      enum: ['consultation', 'procedure', 'emergency', 'general'],
      default: 'consultation',
    },
    floor: {
      type: String,
      trim: true,
      maxlength: 20,
    },
    // Current assignment
    currentDoctor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    currentPatient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Patient',
      default: null,
    },
    currentAppointment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Appointment',
      default: null,
    },
    status: {
      type: String,
      enum: ['available', 'occupied', 'cleaning', 'maintenance', 'reserved'],
      default: 'available',
      index: true,
    },
    occupiedSince: {
      type: Date,
      default: null,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

consultationRoomSchema.index({ branch: 1, code: 1 }, { unique: true });
consultationRoomSchema.index({ branch: 1, status: 1 });
consultationRoomSchema.index({ currentDoctor: 1 });
consultationRoomSchema.index({ deletedAt: 1 });

consultationRoomSchema.pre(/^find/, function () {
  if (this.getFilter().deletedAt === undefined) {
    this.where({ deletedAt: null });
  }
});

module.exports = consultationRoomSchema;
