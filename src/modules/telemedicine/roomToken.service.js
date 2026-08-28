'use strict';

const crypto = require('crypto');

// Encryption key derived from env secret (use first 32 bytes of SHA-256)
const SECRET = process.env.TELEMEDICINE_SECRET || process.env.JWT_SECRET;
if (!SECRET) {
  throw new Error(
    'TELEMEDICINE_SECRET or JWT_SECRET environment variable is required for telemedicine encryption. ' +
    'Set TELEMEDICINE_SECRET in your .env file.',
  );
}
const ALGORITHM = 'aes-256-gcm';

// Cache derived key at module load — avoids re-hashing on every encrypt/decrypt call
const DERIVED_KEY = crypto.createHash('sha256').update(SECRET).digest();

function _deriveKey() {
  return DERIVED_KEY;
}

/**
 * Generate a unique room ID for a video session.
 * Format: tm-{tenantPrefix}-{uuid} — tenant-scoped, unguessable
 */
function generateRoomId(tenantSlug) {
  const prefix = (tenantSlug || 'gen').substring(0, 6).replace(/[^a-z0-9]/gi, '');
  return `tm-${prefix}-${crypto.randomUUID()}`;
}

/**
 * Generate an encrypted room token for a participant.
 * The token encodes: roomId, participantId, role, expiry.
 * Only the server can decrypt — prevents token forgery.
 *
 * @param {Object} params
 * @param {string} params.roomId
 * @param {string} params.participantId - User ID
 * @param {string} params.role - 'doctor' | 'patient'
 * @param {number} params.maxDurationSec - Max session duration in seconds
 * @returns {{ token: string, iv: string, expiresAt: Date }}
 */
function generateRoomToken({ roomId, participantId, role, maxDurationSec = 1800 }) {
  const expiresAt = new Date(Date.now() + maxDurationSec * 1000);

  const payload = JSON.stringify({
    roomId,
    participantId: String(participantId),
    role,
    exp: expiresAt.getTime(),
    iat: Date.now(),
    jti: crypto.randomUUID(),
  });

  const key = _deriveKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(payload, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');

  const token = `${encrypted}.${authTag}`;

  return {
    token,
    iv: iv.toString('hex'),
    expiresAt,
  };
}

/**
 * Decrypt and validate a room token.
 * Throws if expired, tampered, or invalid.
 *
 * @param {string} token - The encrypted token string
 * @param {string} ivHex - The IV in hex
 * @returns {Object} The decoded payload { roomId, participantId, role, exp }
 */
function verifyRoomToken(token, ivHex) {
  const [encryptedHex, authTagHex] = token.split('.');
  if (!encryptedHex || !authTagHex) {
    throw new Error('Invalid token format');
  }

  const key = _deriveKey();
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  const payload = JSON.parse(decrypted);

  // Check expiry
  if (payload.exp < Date.now()) {
    throw new Error('Room token expired');
  }

  return payload;
}

/**
 * Encrypt a chat message for storage.
 * @param {string} plaintext
 * @returns {{ ciphertext: string, iv: string }}
 */
function encryptMessage(plaintext) {
  const key = _deriveKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');

  return {
    ciphertext: `${encrypted}.${authTag}`,
    iv: iv.toString('hex'),
  };
}

/**
 * Decrypt a stored chat message.
 * @param {string} ciphertext
 * @param {string} ivHex
 * @returns {string}
 */
function decryptMessage(ciphertext, ivHex) {
  const [encryptedHex, authTagHex] = ciphertext.split('.');
  if (!encryptedHex || !authTagHex) {
    throw new Error('Invalid ciphertext format');
  }

  const key = _deriveKey();
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

module.exports = {
  generateRoomId,
  generateRoomToken,
  verifyRoomToken,
  encryptMessage,
  decryptMessage,
};
