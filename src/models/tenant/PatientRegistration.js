'use strict';

const mongoose = require('mongoose');

/**
 * One submission of the clinic's New Patient Registration form (a "visit").
 * Created by reception (source 'reception') or by a patient scanning the
 * clinic's form QR (source 'qr'). The same Patient may have many registrations.
 *
 * The signature is stored inline as a capped PNG data URL (<= 300 KB) and is
 * `select: false` so list queries never load or return it.
 */
const registrationSchema = new mongoose.Schema(
  {
    patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true },
    source: { type: String, enum: ['reception', 'qr'], required: true },
    /** Staff member who entered the form — null for QR submissions */
    registeredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    /** Patient account the submission was linked to (QR + valid Bearer token only) */
    linkedUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

    formVersion: { type: Number, required: true },
    /** Config fields (enabled ones) as they were when submitted */
    formSnapshot: { type: [mongoose.Schema.Types.Mixed], default: [] },
    answers: { type: mongoose.Schema.Types.Mixed, default: {} },

    chiefComplaint: { type: String },
    referralSource: {
      type: String,
      enum: ['self', 'google', 'friend_relative', 'doctor', 'social_media'],
    },

    hasSignature: { type: Boolean, default: false },
    signature: { type: String, select: false },

    consentText: { type: String },
    consentAcceptedAt: { type: Date },

    /** True when the submission matched (and reused) an existing patient */
    isExistingPatient: { type: Boolean, default: false },

    /** Client IP — QR submissions only */
    ip: { type: String },
  },
  { timestamps: true },
);

registrationSchema.index({ createdAt: -1 });
registrationSchema.index({ source: 1, createdAt: -1 });
registrationSchema.index({ patient: 1 });

module.exports = registrationSchema;
