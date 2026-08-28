'use strict';

/**
 * UserDirectory — cross-tenant email index in the platform DB.
 *
 * Maps an email address to every tenant it exists in. This enables
 * email-first login: user enters email → we look up which clinic(s)
 * they belong to → they pick one → authenticate against that tenant DB.
 *
 * Read-heavy, write-rare: written on register/provision, queried on login.
 */

const mongoose = require('mongoose');

const userDirectorySchema = new mongoose.Schema(
  {
    /** User's email (lowercase, indexed for fast lookup) */
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      index: true,
    },

    /** Internal tenant slug — never exposed to clients */
    tenantSlug: {
      type: String,
      required: true,
    },

    /** Reference to the Clinic document in platform DB */
    clinicId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Clinic',
      required: true,
    },

    /** Denormalized clinic name for fast reads (avoids join on every login) */
    clinicName: {
      type: String,
      required: true,
    },

    /** Denormalized clinic logo URL */
    clinicLogo: {
      type: String,
      default: null,
    },

    /** Human-readable clinic code (e.g. SMILE2847) */
    clinicCode: {
      type: String,
      required: true,
    },

    /** User's _id in the tenant DB (stored as String since it's cross-DB) */
    userId: {
      type: String,
      required: true,
    },

    /** User's role in the tenant (patient, doctor, super_admin, etc.) */
    role: {
      type: String,
      required: true,
    },
  },
  { timestamps: true },
);

// Compound unique: one entry per email+tenant pair
userDirectorySchema.index({ email: 1, tenantSlug: 1 }, { unique: true });

module.exports = mongoose.model('UserDirectory', userDirectorySchema);
