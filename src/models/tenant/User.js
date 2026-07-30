'use strict';

/**
 * Tenant User schema — clinic staff and patient accounts.
 * Registered on each tenant's isolated Mongoose connection.
 */

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { ROLES } = require('../../config/constants');

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      maxlength: 100,
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
    },
    phone: {
      type: String,
      trim: true,
    },
    password: {
      type: String,
      required: true,
      minlength: 8,
      select: false,
    },
    role: {
      type: String,
      enum: Object.values(ROLES),
      required: true,
    },
    avatar: String,

    /** Organizational placement */
    branch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Branch',
      index: true,
    },
    department: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Department',
      index: true,
    },
    employeeId: {
      type: String,
      trim: true,
    },

    /** Doctor-specific fields */
    specialization: String,
    licenseNumber: String,
    consultationFee: { type: Number, min: 0 },
    /** Default reminder timings for appointments (doctor configurable, minutes-before) */
    defaultReminderTimings: {
      type: [Number],
      default: [1440], // 24h by default; doctor can change to e.g. [1440, 30]
    },

    /** Extended doctor profile (for public-facing platform directory) */
    doctorProfile: {
      bio: { type: String, trim: true, maxlength: 1000 },
      education: [{
        degree: { type: String, trim: true, maxlength: 100 },
        institution: { type: String, trim: true, maxlength: 200 },
        year: { type: Number, min: 1950, max: 2040 },
      }],
      experienceYears: { type: Number, min: 0, max: 60 },
      languages: [{ type: String, trim: true }],
      qualifications: [{ type: String, trim: true }],
      achievements: [{ type: String, trim: true, maxlength: 200 }],
      acceptingNewPatients: { type: Boolean, default: true },
    },

    /** Whether this doctor is published to the platform directory */
    isFeaturedOnPlatform: { type: Boolean, default: false },

    /** Account status */
    isActive: { type: Boolean, default: true },
    isEmailVerified: { type: Boolean, default: false },
    emailVerificationToken: { type: String, select: false },
    passwordResetToken: { type: String, select: false },
    passwordResetExpires: { type: Date, select: false },

    /** FCM push notification tokens (one per device) */
    fcmTokens: [{
      token: { type: String, required: true },
      deviceId: { type: String, required: true },
      platform: { type: String, enum: ['android', 'ios', 'web'], default: 'android' },
      updatedAt: { type: Date, default: Date.now },
    }],

    /**
     * Presence for real-time availability (doctors only — other roles ignore).
     * `status` mirrors the in-memory socket presence map so that REST callers
     * (e.g. receptionist board) see a consistent state even across process restarts.
     */
    presence: {
      status: {
        type: String,
        enum: ['online', 'busy', 'dnd', 'offline'],
        default: 'offline',
      },
      lastSeenAt: { type: Date },
    },

    /** Device tracking for per-device refresh tokens */
    lastLoginAt: Date,
    lastLoginIP: String,

    /** Consent tracking (GDPR/DPDP) */
    consentGiven: { type: Boolean, default: false },
    consentDate: Date,

    deletedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret) {
        delete ret.password;
        delete ret.__v;
        delete ret.emailVerificationToken;
        delete ret.passwordResetToken;
        delete ret.passwordResetExpires;
        return ret;
      },
    },
  },
);

// Indexes
userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ role: 1 });
userSchema.index({ employeeId: 1 }, { unique: true, sparse: true });
userSchema.index({ deletedAt: 1 });
userSchema.index({ 'fcmTokens.token': 1 });

// Soft-delete filter
userSchema.pre(/^find/, function () {
  if (!this.getQuery().deletedAt) {
    this.where({ deletedAt: null });
  }
});

// Hash password before save
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  // Skip hashing if password is already a bcrypt hash (e.g. copied from PlatformPatient)
  if (this.$locals.skipPasswordHash) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// Export the SCHEMA (not a model) — models are registered per-tenant connection
module.exports = userSchema;
