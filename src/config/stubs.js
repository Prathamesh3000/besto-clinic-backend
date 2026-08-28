'use strict';

/**
 * Stub registry — every service that can be unconfigured, and what breaks when
 * it is.
 *
 * Why this exists
 * ---------------
 * The defect register found eleven features that were wired end to end, reported
 * success, and did nothing. SMS was the worst of them: it returned
 * `{ success: true }` AND incremented the clinic's paid SMS quota while sending
 * nothing, so a clinic watched its allowance deplete and concluded the feature
 * worked. None of the eleven produced an error or a log line, so none of them
 * were visible to monitoring — they were discovered by customers.
 *
 * The rule this encodes: a feature that cannot work must say so somewhere a
 * human looks. Every entry here surfaces in three places:
 *
 *   1. the boot report (src/config/selfCheck.js)
 *   2. GET /api/v1/monitoring — so it is visible to ops
 *   3. the clinic settings screen — so it is visible to the customer
 *
 * Adding a stub here is not a way to ship an unfinished feature quietly. It is
 * how an unfinished feature announces itself.
 *
 * This file lives in src/config/ deliberately: reading process.env directly is
 * permitted here (see the ESLint override), and this is configuration state.
 */

/**
 * @typedef  {object} StubState
 * @property {boolean} configured  Whether the dependency is usable right now.
 * @property {string}  impact      What a user loses while it is unconfigured.
 * @property {string}  [reason]    Why it is unconfigured, when that is known.
 */

/** @returns {Record<string, StubState>} */
function getStubStates() {
  const turnConfigured = Boolean(
    (process.env.TURN_SERVER_URLS || process.env.TURN_SERVER_URL)
    && (process.env.TURN_USERNAME || process.env.TURN_CREDENTIAL),
  );

  return {
    sms: {
      // No provider is wired. sendSMS() short-circuits on this flag rather than
      // pretending to deliver — flip it when a provider lands, not before.
      configured: false,
      reason: 'No SMS provider is integrated (Twilio / MSG91 / SNS)',
      impact:
        'No SMS is delivered: appointment reminders, check-in confirmations, '
        + 'queue calls, OTP and care reminders are all silently undelivered',
    },

    s3: {
      configured: process.env.STORAGE_PROVIDER === 's3',
      reason: '@aws-sdk/client-s3 is not a dependency; _uploadToS3 throws',
      impact:
        'Uploads are written to local disk. Durable storage requires a mounted '
        + 'volume; setting STORAGE_PROVIDER=s3 disables uploads entirely',
    },

    turn: {
      configured: turnConfigured,
      reason: turnConfigured ? undefined : 'TURN_SERVER_URLS / TURN_USERNAME / TURN_CREDENTIAL are unset',
      impact:
        'WebRTC falls back to STUN only, so teleconsultations fail for any party '
        + 'behind symmetric NAT or a restrictive firewall — with no server-side signal',
    },

    gemini: {
      configured: Boolean(process.env.GEMINI_API_KEY),
      reason: process.env.GEMINI_API_KEY ? undefined : 'GEMINI_API_KEY is unset',
      impact: 'AI dental scan analysis is unavailable',
    },
  };
}

/** True when the named dependency is usable. Unknown names are treated as unconfigured. */
function isConfigured(name) {
  const state = getStubStates()[name];
  return Boolean(state && state.configured);
}

/** Only the unconfigured entries, for the boot report and monitoring payload. */
function listUnconfigured() {
  return Object.entries(getStubStates())
    .filter(([, state]) => !state.configured)
    .map(([name, state]) => ({ name, reason: state.reason, impact: state.impact }));
}

module.exports = { getStubStates, isConfigured, listUnconfigured };
