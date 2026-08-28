'use strict';

/**
 * PlatformPatient — platform-level patient identity for cross-clinic access.
 *
 * Enables the "browse first, register at booking" (Zocdoc) model:
 * - Patient registers once → PlatformPatient + tenant User created in one step
 * - On joining a new clinic → PlatformPatient credentials verified, new tenant records auto-created
 * - Password changes fan out to all connected tenant Users
 *
 * Complements (does NOT replace) UserDirectory:
 * - PlatformPatient: one row per unique patient email (credentials + profile)
 * - UserDirectory: one row per email+tenant pair (fast lookup for unified login)
 */

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const connectedClinicSchema = new mongoose.Schema(
  {
    clinicId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Clinic',
      required: true,
    },
    tenantSlug: { type: String, required: true },
    clinicName: { type: String, required: true },
    clinicCode: { type: String, required: true },
    clinicLogo: { type: String, default: null },
    /** User._id in the tenant DB (cross-DB reference, stored as String) */
    tenantUserId: { type: String, required: true },
    /** Patient._id in the tenant DB (if role is patient) */
    tenantPatientId: { type: String, default: null },
    role: { type: String, default: 'patient' },
    connectedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const platformPatientSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: true,
      minlength: 8,
      select: false,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    phone: {
      type: String,
      trim: true,
      default: null,
    },
    /** Clinics this patient is connected to (denormalized for fast reads) */
    connectedClinics: [connectedClinicSchema],
    isActive: { type: Boolean, default: true },
    lastLoginAt: Date,
    deletedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret) {
        delete ret.password;
        delete ret.__v;
        return ret;
      },
    },
  },
);

// Hash password before save (skip if $locals.skipPasswordHash is set — used for migration)
platformPatientSchema.pre('save', async function (next) {
  if (this.$locals.skipPasswordHash) return next();
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

platformPatientSchema.methods.comparePassword = async function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

// Indexes
platformPatientSchema.index({ deletedAt: 1 });
platformPatientSchema.index({ 'connectedClinics.clinicId': 1 });

module.exports = mongoose.model('PlatformPatient', platformPatientSchema);
