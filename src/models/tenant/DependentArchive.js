'use strict';

const mongoose = require('mongoose');

const dependentArchiveSchema = new mongoose.Schema(
  {
    /** The guardian who managed this dependent */
    guardian: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    /** The patient record that was detached */
    dependent: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Patient',
      required: true,
    },
    /** When the detach happened */
    detachedAt: {
      type: Date,
      required: true,
    },
    /** Full snapshot of the Patient record at detach time */
    snapshotData: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
    /** Appointment history snapshot */
    appointments: [
      {
        appointmentId: mongoose.Schema.Types.ObjectId,
        scheduledAt: Date,
        doctor: String,
        department: String,
        status: String,
        notes: String,
      },
    ],
    /** Prescription history snapshot */
    prescriptions: [
      {
        prescriptionId: mongoose.Schema.Types.ObjectId,
        diagnosis: String,
        medications: [
          {
            name: String,
            dosage: String,
            frequency: String,
            duration: String,
          },
        ],
        prescribedAt: Date,
      },
    ],
    /** Consent history for this guardianship */
    consentHistory: [
      {
        consentType: String,
        acceptedAt: Date,
        revokedAt: Date,
      },
    ],
  },
  { timestamps: true },
);

dependentArchiveSchema.index({ guardian: 1 });
dependentArchiveSchema.index({ dependent: 1 });

module.exports = dependentArchiveSchema;
