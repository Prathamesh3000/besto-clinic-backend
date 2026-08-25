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

/**
 * Does this value look like an `iv:tag:ciphertext` payload?
 *
 * Shape-checked rather than guessed: three colon-separated parts, the first two
 * hex and of exactly the right length. A MongoDB URI also contains colons
 * (`mongodb+srv://user:pass@host`), so a looser test would misread a plaintext
 * URI as ciphertext and fail to connect.
 */
function isEncrypted(value) {
  if (typeof value !== 'string') return false;
  const parts = value.split(':');
  if (parts.length !== 3) return false;
  const [iv, tag, ciphertext] = parts;
  return new RegExp(`^[0-9a-f]{${IV_LENGTH * 2}}$`, 'i').test(iv)
    && new RegExp(`^[0-9a-f]{${TAG_LENGTH * 2}}$`, 'i').test(tag)
    && /^[0-9a-f]+$/i.test(ciphertext);
}

/**
 * Decrypt if the value is encrypted, pass it through if it is not.
 *
 * The migration to encryption-at-rest cannot be atomic across a live system: the
 * code that reads a value has to deploy before the data is rewritten, or every
 * lookup fails in the window between the two. Accepting both shapes is what makes
 * the rollout safe in either order, and it keeps working if a single record is
 * ever restored from an older backup.
 *
 * This is deliberately NOT a silent fallback for a *failed* decryption — a value
 * that looks encrypted and will not decrypt throws, because that means the key is
 * wrong and returning the ciphertext as if it were a URI would produce a far more
 * confusing failure somewhere else.
 */
function decryptIfEncrypted(value, hexKey) {
  if (!isEncrypted(value)) return value;
  return decrypt(value, hexKey);
}

module.exports = {
  encrypt, decrypt, isEncrypted, decryptIfEncrypted,
};
