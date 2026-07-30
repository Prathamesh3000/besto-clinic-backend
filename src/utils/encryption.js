'use strict';

/**
 * AES-256-GCM encryption/decryption for sensitive data at rest
 * (e.g. tenant DB URIs stored in Redis).
 *
 * Format: <iv_hex>:<authTag_hex>:<ciphertext_hex>
 */

const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;  // 128-bit
const TAG_LENGTH = 16; // 128-bit

/**
 * @param {string} plaintext
 * @param {string} hexKey - 64-char hex string (32 bytes)
 * @returns {string} iv:tag:ciphertext (all hex)
 */
function encrypt(plaintext, hexKey) {
  const key = Buffer.from(hexKey, 'hex');
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });

  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag().toString('hex');

  return `${iv.toString('hex')}:${tag}:${encrypted}`;
}

/**
 * @param {string} payload - iv:tag:ciphertext (all hex)
 * @param {string} hexKey - 64-char hex string (32 bytes)
 * @returns {string} plaintext
 */
function decrypt(payload, hexKey) {
  const [ivHex, tagHex, ciphertext] = payload.split(':');
  if (!ivHex || !tagHex || !ciphertext) {
    throw new Error('Invalid encrypted payload format');
  }

  const key = Buffer.from(hexKey, 'hex');
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });
  decipher.setAuthTag(tag);

  let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

module.exports = { encrypt, decrypt };
