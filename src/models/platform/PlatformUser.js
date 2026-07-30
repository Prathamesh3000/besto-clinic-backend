'use strict';

/**
 * PlatformUser — product_owner accounts that manage the SaaS platform itself.
 * These users authenticate with JWT_PLATFORM_SECRET (audience: bestoclinic-platform).
 */

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const platformUserSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
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
    role: {
      type: String,
      default: 'product_owner',
      immutable: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    lastLoginAt: Date,
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

// Hash password before save
platformUserSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// Instance method: compare password
platformUserSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('PlatformUser', platformUserSchema);
