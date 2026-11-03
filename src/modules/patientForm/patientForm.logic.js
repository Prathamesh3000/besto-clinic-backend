'use strict';

/**
 * Pure (database-free) logic for the New Patient Registration form:
 * default config, config validation, answer validation, duplicate-key helpers.
 */

const crypto = require('crypto');

const MAX_FIELDS = 30;
const MAX_SIGNATURE_BYTES = 300 * 1024;
const SIGNATURE_PREFIX = 'data:image/png;base64,';
const CUSTOM_KEY_RE = /^custom_[a-z0-9_]{1,40}$/;
const OPTION_VALUE_RE = /^[A-Za-z0-9_-]{1,50}$/;

const GENDER_VALUES = ['male', 'female', 'other'];
const REFERRAL_VALUES = ['self', 'google', 'friend_relative', 'doctor', 'social_media'];
const CUSTOM_TYPES = ['text', 'textarea', 'select', 'checkbox'];

const DEFAULT_CONSENT_TEXT =
  'I confirm that the details provided are correct and I consent to examination and treatment at this clinic.';

/** Built-in field catalogue, in default display order. */
const BUILT_IN_FIELDS = [
  { key: 'name', label: 'Patient Name', type: 'text', locked: true, required: true },
  { key: 'phone', label: 'Phone Number', type: 'phone', locked: true, required: true },
  { key: 'age', label: 'Age', type: 'number', required: true },
  {
    key: 'gender', label: 'Gender', type: 'radio', required: true,
    options: [
      { value: 'male', label: 'Male' },
      { value: 'female', label: 'Female' },
      { value: 'other', label: 'Other' },
    ],
  },
  { key: 'address', label: 'Address', type: 'textarea', required: false },
  {
    key: 'referralSource', label: 'Referred By', type: 'radio', required: true,
    options: [
      { value: 'self', label: 'Self' },
      { value: 'google', label: 'Google' },
      { value: 'friend_relative', label: 'Friend / Relative' },
      { value: 'doctor', label: 'Doctor' },
      { value: 'social_media', label: 'Social Media' },
    ],
  },
  { key: 'chiefComplaint', label: 'Chief Complaint', type: 'textarea', required: true },
  { key: 'signature', label: 'Signature', type: 'signature', required: true },
];

const BUILT_IN_BY_KEY = Object.fromEntries(BUILT_IN_FIELDS.map((f) => [f.key, f]));

/** Option values a built-in select-like field may use (keeps Patient enums safe). */
const BUILT_IN_OPTION_VALUES = { gender: GENDER_VALUES, referralSource: REFERRAL_VALUES };

function generateQrToken() {
  return crypto.randomBytes(24).toString('base64url'); // 32 chars
}

/** Default config (without `qr`; the service adds the token). */
function buildDefaultConfig() {
  return {
    version: 1,
    title: 'New Patient Registration',
    consentText: DEFAULT_CONSENT_TEXT,
    fields: BUILT_IN_FIELDS.map((f, i) => ({
      key: f.key,
      label: f.label,
      type: f.type,
      builtIn: true,
      locked: !!f.locked,
      enabled: true,
      required: !!f.required,
      order: i,
      ...(f.options ? { options: f.options.map((o) => ({ ...o })) } : {}),
    })),
  };
}

// ─── Config validation ────────────────────────────────

const _isStr = (v) => typeof v === 'string';

/**
 * Validate + normalise an admin-submitted config (PUT body).
 * @returns {{ errors: {field:string,message:string}[], value: {title,consentText,fields}|null }}
 */
function validateConfigInput(input) {
  const errors = [];
  const err = (field, message) => errors.push({ field, message });
  const body = input && typeof input === 'object' ? input : {};

  const title = _isStr(body.title) ? body.title.trim() : '';
  if (!title || title.length > 120) err('title', 'Title is required (max 120 characters)');

  const consentText = _isStr(body.consentText) ? body.consentText.trim() : '';
  if (consentText.length > 2000) err('consentText', 'Consent text must be at most 2000 characters');

  const rawFields = Array.isArray(body.fields) ? body.fields : null;
  if (!rawFields) {
    err('fields', 'fields must be a list');
    return { errors, value: null };
  }
  if (rawFields.length > MAX_FIELDS) err('fields', `A form can have at most ${MAX_FIELDS} fields`);

  const seen = new Set();
  const out = [];

  rawFields.slice(0, MAX_FIELDS + 1).forEach((f, i) => {
    const at = `fields.${i}`;
    if (!f || typeof f !== 'object') return err(at, 'Invalid field');
    const key = _isStr(f.key) ? f.key.trim() : '';
    const builtIn = BUILT_IN_BY_KEY[key];

    if (!builtIn && !CUSTOM_KEY_RE.test(key)) {
      return err(`${at}.key`, `Invalid field key "${key}" (custom keys look like custom_my_field)`);
    }
    if (seen.has(key)) return err(`${at}.key`, `Duplicate field key "${key}"`);
    seen.add(key);

    const label = _isStr(f.label) ? f.label.trim() : '';
    if (!label || label.length > 100) err(`${at}.label`, `Label for "${key}" is required (max 100 characters)`);

    const type = builtIn ? builtIn.type : f.type;
    if (builtIn && f.type !== undefined && f.type !== builtIn.type) {
      err(`${at}.type`, `Built-in field "${key}" must keep type "${builtIn.type}"`);
    }
    if (!builtIn && !CUSTOM_TYPES.includes(type)) {
      err(`${at}.type`, `Custom field type must be one of: ${CUSTOM_TYPES.join(', ')}`);
    }

    const enabled = f.enabled !== false;
    const required = f.required === true;
    if (builtIn && builtIn.locked && (!enabled || !required)) {
      err(at, `"${key}" is a locked field and must stay enabled and required`);
    }

    const field = {
      key,
      label,
      type,
      builtIn: !!builtIn,
      locked: !!(builtIn && builtIn.locked),
      enabled,
      required,
      order: Number.isFinite(Number(f.order)) ? Number(f.order) : i,
    };

    if (type === 'select' || type === 'radio') {
      const opts = Array.isArray(f.options) ? f.options : [];
      if (opts.length < 1 || opts.length > 20) {
        err(`${at}.options`, `"${key}" needs 1 to 20 options`);
      }
      const vals = new Set();
      field.options = [];
      opts.slice(0, 21).forEach((o, j) => {
        const value = o && _isStr(o.value) ? o.value.trim() : '';
        const olabel = o && _isStr(o.label) ? o.label.trim() : '';
        if (!OPTION_VALUE_RE.test(value) || !olabel || olabel.length > 100) {
          return err(`${at}.options.${j}`, `Invalid option on "${key}"`);
        }
        if (vals.has(value)) return err(`${at}.options.${j}`, `Duplicate option value "${value}" on "${key}"`);
        vals.add(value);
        const allowed = BUILT_IN_OPTION_VALUES[key];
        if (allowed && !allowed.includes(value)) {
          return err(`${at}.options.${j}`, `Option "${value}" is not allowed on "${key}"`);
        }
        field.options.push({ value, label: olabel });
      });
    }
    out.push(field);
  });

  for (const k of Object.keys(BUILT_IN_BY_KEY)) {
    if (!seen.has(k)) err('fields', `Built-in field "${k}" is missing (disable it instead of removing it)`);
  }

  if (errors.length) return { errors, value: null };

  // Stable sort by requested order, then renumber 0..n-1.
  out.sort((a, b) => a.order - b.order);
  out.forEach((f, i) => { f.order = i; });
  return { errors, value: { title, consentText, fields: out } };
}

// ─── Answer validation ────────────────────────────────

const _isBlank = (v) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '');

/** Approximate decoded byte size of a base64 string. */
function base64Bytes(b64) {
  const padding = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
  return Math.floor((b64.length * 3) / 4) - padding;
}

/** @returns {string|null} error message, or null when the signature is acceptable */
function validateSignature(signature) {
  if (!_isStr(signature) || !signature.startsWith(SIGNATURE_PREFIX)) {
    return 'Signature must be a PNG data URL';
  }
  const b64 = signature.slice(SIGNATURE_PREFIX.length);
  if (!b64 || !/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) return 'Signature is not valid base64';
  if (base64Bytes(b64) > MAX_SIGNATURE_BYTES) return 'Signature is too large (max 300 KB)';
  return null;
}

function _validateValue(field, raw) {
  const { key, type, label } = field;
  switch (type) {
    case 'text':
    case 'textarea': {
      if (!_isStr(raw)) return { error: `${label} must be text` };
      const v = raw.trim();
      const max = type === 'text' ? (key === 'name' ? 100 : 200) : 2000;
      const min = key === 'name' ? 2 : 1;
      if (v.length < min) return { error: `${label} must be at least ${min} characters` };
      if (v.length > max) return { error: `${label} must be at most ${max} characters` };
      return { value: v };
    }
    case 'phone': {
      if (!_isStr(raw)) return { error: `${label} must be text` };
      const v = raw.trim();
      if (v.length < 10 || v.length > 15 || !/^\+?[0-9][0-9\s\-()]*$/.test(v)
        || v.replace(/\D/g, '').length < 10) {
        return { error: `${label} must be a valid phone number (10-15 characters)` };
      }
      return { value: v };
    }
    case 'number': {
      const n = typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : raw;
      if (typeof n !== 'number' || !Number.isInteger(n) || n < 0 || n > 120) {
        return { error: `${label} must be a whole number between 0 and 120` };
      }
      return { value: n };
    }
    case 'radio':
    case 'select': {
      const opts = (field.options || []).map((o) => o.value);
      if (!_isStr(raw) || !opts.includes(raw)) return { error: `${label} has an invalid choice` };
      return { value: raw };
    }
    case 'checkbox':
      if (typeof raw !== 'boolean') return { error: `${label} must be true or false` };
      return { value: raw };
    default:
      return { error: `${label} cannot be answered here` };
  }
}

/**
 * Validate a submission against the CURRENT config.
 * `signature` is the top-level data URL (the signature field's answer).
 * @returns {{ errors: {field:string,message:string}[], clean: object, signature: string|null }}
 */
function validateAnswers(config, answers, signature) {
  const errors = [];
  const clean = {};
  const fields = (config && config.fields) || [];
  const active = fields.filter((f) => f.enabled);
  const byKey = new Map(active.map((f) => [f.key, f]));

  if (!answers || typeof answers !== 'object' || Array.isArray(answers)) {
    return { errors: [{ field: 'answers', message: 'answers must be an object' }], clean, signature: null };
  }

  for (const k of Object.keys(answers)) {
    if (!byKey.has(k) || byKey.get(k).type === 'signature') {
      errors.push({ field: `answers.${k}`, message: `Unknown or disabled field: ${k}` });
    }
  }

  for (const f of active) {
    if (f.type === 'signature') continue;
    const raw = answers[f.key];
    // An unticked optional checkbox is the same as "not answered".
    const blank = _isBlank(raw) || (f.type === 'checkbox' && raw === false && !f.required);
    if (blank) {
      if (f.required) errors.push({ field: `answers.${f.key}`, message: `${f.label} is required` });
      continue;
    }
    const res = _validateValue(f, raw);
    if (res.error) {
      errors.push({ field: `answers.${f.key}`, message: res.error });
    } else if (f.type === 'checkbox' && f.required && res.value !== true) {
      errors.push({ field: `answers.${f.key}`, message: `${f.label} is required` });
    } else {
      clean[f.key] = res.value;
    }
  }

  let cleanSignature = null;
  const sigField = byKey.get('signature');
  if (!sigField) {
    if (!_isBlank(signature)) errors.push({ field: 'signature', message: 'This form does not accept a signature' });
  } else if (_isBlank(signature)) {
    if (sigField.required) errors.push({ field: 'signature', message: `${sigField.label} is required` });
  } else {
    const msg = validateSignature(signature);
    if (msg) errors.push({ field: 'signature', message: msg });
    else cleanSignature = signature;
  }

  return { errors, clean, signature: cleanSignature };
}

// ─── Duplicate-detection helpers ──────────────────────

/** Digits only; for numbers longer than 10 digits keep the last 10 (drops +91 / 0 prefixes). */
function normalisePhone(raw) {
  const digits = String(raw == null ? '' : raw).replace(/\D/g, '');
  return digits.length > 10 ? digits.slice(-10) : digits;
}

/** Case-insensitive, whitespace-collapsed name key. */
function normaliseName(raw) {
  return String(raw == null ? '' : raw).trim().replace(/\s+/g, ' ').toLowerCase();
}

/** Mongo regex source matching a stored phone with the same digits, however it is formatted. */
function phoneMatchRegexSource(raw) {
  return normalisePhone(raw).split('').join('\\D*');
}

function isSamePerson(patient, phone, name) {
  return normalisePhone(patient.phone) === normalisePhone(phone)
    && normaliseName(patient.name) === normaliseName(name);
}

/** Approximate DOB (`age` years before today) for patients registered with an age only. */
function approximateDob(age, now = new Date()) {
  const d = new Date(now);
  d.setFullYear(d.getFullYear() - age);
  return d;
}

/** Fields captured in the registration's formSnapshot (enabled ones only). */
function buildSnapshot(config) {
  return (config.fields || []).filter((f) => f.enabled).map((f) => ({
    key: f.key,
    label: f.label,
    type: f.type,
    required: !!f.required,
    order: f.order,
    ...(f.options && f.options.length ? { options: f.options.map((o) => ({ value: o.value, label: o.label })) } : {}),
  }));
}

/** Constant-time token comparison; false for anything but two non-empty strings. */
function tokensMatch(expected, provided) {
  if (!_isStr(expected) || !_isStr(provided) || !expected || !provided) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  if (a.length !== b.length) {
    crypto.timingSafeEqual(a, a); // keep timing roughly uniform
    return false;
  }
  return crypto.timingSafeEqual(a, b);
}

module.exports = {
  MAX_FIELDS,
  MAX_SIGNATURE_BYTES,
  SIGNATURE_PREFIX,
  REFERRAL_VALUES,
  GENDER_VALUES,
  BUILT_IN_FIELDS,
  generateQrToken,
  buildDefaultConfig,
  validateConfigInput,
  validateAnswers,
  validateSignature,
  normalisePhone,
  normaliseName,
  phoneMatchRegexSource,
  isSamePerson,
  approximateDob,
  buildSnapshot,
  tokensMatch,
};
