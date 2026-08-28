'use strict';

/**
 * CalendarFeedToken — cross-tenant token index in the platform DB.
 *
 * Maps a feed token to its tenant slug, enabling the public ICS endpoint
 * to resolve which tenant DB to query without any auth headers.
 * Analogous to UserDirectory (email → tenant) but for calendar feeds.
 *
 * Read-heavy, write-rare: written on feed generate/regenerate,
 * queried on every public ICS fetch.
 */

const mongoose = require('mongoose');

const calendarFeedTokenSchema = new mongoose.Schema(
  {
    /** The UUID token embedded in the public ICS URL */
    token: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    /** Tenant slug for resolving the correct tenant DB */
    tenantSlug: {
      type: String,
      required: true,
      index: true,
    },

    feedType: {
      type: String,
      enum: ['doctor', 'patient'],
      required: true,
    },

    isEnabled: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model('CalendarFeedToken', calendarFeedTokenSchema);
