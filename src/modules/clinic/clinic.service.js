'use strict';

const ApiError = require('../../utils/ApiError');
const Clinic = require('../../models/platform/Clinic');
const { uploadFile } = require('../../services/storage.service');

/**
 * Get clinic settings from platform DB by slug.
 */
async function getClinicSettings(slug) {
  const clinic = await Clinic.findOne({ slug, isActive: true });
  if (!clinic) throw ApiError.notFound('Clinic not found');
  return clinic;
}

/**
 * Update clinic settings in platform DB.
 */
async function updateClinicSettings(slug, data) {
  const update = {};

  // Whitelist: only allow safe cosmetic/contact fields
  const ALLOWED_FIELDS = ['name', 'email', 'phone', 'logo', 'website'];
  for (const field of ALLOWED_FIELDS) {
    if (data[field] !== undefined) update[field] = data[field];
  }

  if (data.address) {
    const ALLOWED_ADDRESS_FIELDS = ['street', 'city', 'state', 'zipCode', 'country'];
    for (const key of ALLOWED_ADDRESS_FIELDS) {
      if (data.address[key] !== undefined) {
        update[`address.${key}`] = data.address[key];
      }
    }
  }

  // SECURITY: Do NOT allow tenants to update features/usage/subscription/plan
  // Those fields are managed exclusively by the platform admin

  const clinic = await Clinic.findOneAndUpdate(
    { slug, isActive: true },
    { $set: update },
    { new: true, runValidators: true },
  );

  if (!clinic) throw ApiError.notFound('Clinic not found');
  return clinic;
}

/**
 * Upload clinic logo, save to storage, and update the clinic record.
 */
async function uploadClinicLogo(slug, imageData, mimeType) {
  const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];
  if (!ALLOWED_TYPES.includes(mimeType)) {
    throw ApiError.badRequest('Invalid image type. Allowed: PNG, JPEG, WebP, SVG');
  }

  const buffer = Buffer.from(imageData, 'base64');
  if (buffer.length > 5 * 1024 * 1024) {
    throw ApiError.badRequest('Image too large. Maximum size is 5MB');
  }

  const ext = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp', 'image/svg+xml': '.svg' }[mimeType] || '.png';

  const { fileUrl } = await uploadFile(
    { buffer, originalname: `clinic-logo-${slug}${ext}`, mimetype: mimeType },
    'logos',
  );

  const clinic = await Clinic.findOneAndUpdate(
    { slug, isActive: true },
    { $set: { logo: fileUrl } },
    { new: true, runValidators: true },
  );

  if (!clinic) throw ApiError.notFound('Clinic not found');
  return clinic;
}

module.exports = { getClinicSettings, updateClinicSettings, uploadClinicLogo };
