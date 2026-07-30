'use strict';

/**
 * Environment validation — runs once at import time.
 * Fails fast with descriptive errors so bad deployments never start.
 */

const Joi = require('joi');
const path = require('path');

// Load .env ONLY here — no other file should call dotenv
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const schema = Joi.object({
  // Server
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
  PORT: Joi.number().port().default(5000),
  CORS_ORIGINS: Joi.string().default('https://bestoclinic.com'),
  FRONTEND_URL: Joi.string().default('http://localhost:5173'),

  // Platform DB
  PLATFORM_DB_URI: Joi.string().uri().required().messages({
    'any.required': 'PLATFORM_DB_URI is required — provide the MongoDB Atlas connection string',
  }),

  // Redis
  REDIS_URL: Joi.string().required(),

  // JWT — all three secrets must be DIFFERENT
  JWT_ACCESS_SECRET: Joi.string().min(32).required(),
  JWT_REFRESH_SECRET: Joi.string().min(32).required(),
  JWT_PLATFORM_SECRET: Joi.string().min(32).required(),
  JWT_ACCESS_EXPIRES_IN: Joi.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: Joi.string().default('7d'),

  // Encryption
  APP_ENCRYPTION_KEY: Joi.string().hex().length(64).required().messages({
    'string.length': 'APP_ENCRYPTION_KEY must be exactly 64 hex chars (32 bytes for AES-256)',
  }),

  // SMTP
  SMTP_HOST: Joi.string().required(),
  SMTP_PORT: Joi.number().default(587),
  SMTP_USER: Joi.string().required(),
  SMTP_PASS: Joi.string().required(),
  SMTP_FROM: Joi.string().required(),

  // Razorpay
  RAZORPAY_KEY_ID: Joi.string().required(),
  RAZORPAY_KEY_SECRET: Joi.string().required(),
  RAZORPAY_WEBHOOK_SECRET: Joi.string().required(),

  // Storage
  STORAGE_PROVIDER: Joi.string().valid('local', 's3').default('local'),
  AWS_ACCESS_KEY_ID: Joi.string().when('STORAGE_PROVIDER', { is: 's3', then: Joi.required() }),
  AWS_SECRET_ACCESS_KEY: Joi.string().when('STORAGE_PROVIDER', { is: 's3', then: Joi.required() }),
  AWS_REGION: Joi.string().default('ap-south-1'),
  AWS_S3_BUCKET: Joi.string().default('bestoclinic-uploads'),

  // Logging
  LOG_LEVEL: Joi.string().valid('error', 'warn', 'info', 'http', 'debug').default('debug'),
  LOG_TO_FILE: Joi.boolean().default(false),

  // Firebase (push notifications)
  FIREBASE_SERVICE_ACCOUNT_PATH: Joi.string().optional(),
  FIREBASE_SERVICE_ACCOUNT_JSON: Joi.string().optional(), // JSON string for PaaS (Render, etc.)

  // Rate limiting
  RATE_LIMIT_WINDOW_MS: Joi.number().default(900_000),
  RATE_LIMIT_MAX: Joi.number().default(100),
  AUTH_RATE_LIMIT_WINDOW_MS: Joi.number().default(900_000),
  AUTH_RATE_LIMIT_MAX: Joi.number().default(15),
}).unknown(true); // allow other process.env vars

const { error, value } = schema.validate(process.env, {
  abortEarly: false,
  stripUnknown: false,
});

if (error) {
  const messages = error.details.map((d) => `  • ${d.message}`).join('\n');
  // eslint-disable-next-line no-console
  console.error(`\n❌  Environment validation failed:\n${messages}\n`);
  process.exit(1);
}

// Guard: JWT secrets must all be distinct
if (
  value.JWT_ACCESS_SECRET === value.JWT_REFRESH_SECRET ||
  value.JWT_ACCESS_SECRET === value.JWT_PLATFORM_SECRET ||
  value.JWT_REFRESH_SECRET === value.JWT_PLATFORM_SECRET
) {
  // eslint-disable-next-line no-console
  console.error('\n❌  JWT_ACCESS_SECRET, JWT_REFRESH_SECRET, and JWT_PLATFORM_SECRET must all be different.\n');
  process.exit(1);
}

module.exports = Object.freeze(value);
