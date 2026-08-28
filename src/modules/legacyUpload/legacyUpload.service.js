'use strict';

const mongoose = require('mongoose');
const ApiError = require('../../utils/ApiError');
const { parsePagination } = require('../../utils/pagination');
const { getTenantConnection } = require('../../db/tenantConnectionManager');

async function listUploads(query, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const LegacyUpload = conn.model('LegacyUpload');
  const { skip, limit, page, sort } = parsePagination(query);

  const filter = {};
  if (query.entityType) filter.entityType = query.entityType;
  if (query.status) filter.status = query.status;

  const [items, total] = await Promise.all([
    LegacyUpload.find(filter)
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .populate('uploadedBy', 'name email'),
    LegacyUpload.countDocuments(filter),
  ]);

  return { items, total, page, limit };
}

async function getUploadById(id, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const LegacyUpload = conn.model('LegacyUpload');

  const upload = await LegacyUpload.findById(id)
    .populate('uploadedBy', 'name email');
  if (!upload) throw ApiError.notFound('Upload not found');

  return upload;
}

async function createUpload(data, userId, tenantSlug) {
  // ── Enforce storage limit ───────────────────────────
  const Clinic = mongoose.model('Clinic');
  const clinic = await Clinic.findOne({ slug: tenantSlug })
    .select('features.maxStorageMB usage.storageUsedMB')
    .lean();

  const fileSizeMB = (data.fileSize || 0) / (1024 * 1024);

  if (
    clinic?.features?.maxStorageMB &&
    (clinic.usage?.storageUsedMB || 0) + fileSizeMB > clinic.features.maxStorageMB
  ) {
    throw ApiError.forbidden('Storage limit reached. Upgrade your plan.');
  }

  // ── Parse CSV content (base64) to count rows ───────
  // Pre-decode size check — base64 adds ~33% overhead, so 50MB decoded ≈ 67MB base64
  const MAX_BASE64_SIZE = 70 * 1024 * 1024; // 70MB base64 limit
  if (!data.content || data.content.length > MAX_BASE64_SIZE) {
    throw ApiError.badRequest('Content missing or exceeds maximum upload size');
  }

  let csvContent;
  try {
    csvContent = Buffer.from(data.content, 'base64').toString('utf-8');
  } catch {
    throw ApiError.badRequest('Invalid base64-encoded content');
  }

  // Limit decoded content size (50MB)
  if (Buffer.byteLength(csvContent, 'utf-8') > 50 * 1024 * 1024) {
    throw ApiError.badRequest('CSV content exceeds 50MB limit');
  }

  const lines = csvContent.split('\n').filter((line) => line.trim());
  const totalRows = Math.max(0, lines.length - 1); // exclude header

  // ── Create the upload record ───────────────────────
  const conn = await getTenantConnection(tenantSlug);
  const LegacyUpload = conn.model('LegacyUpload');

  const upload = await LegacyUpload.create({
    fileName: data.fileName,
    originalName: data.originalName,
    fileSize: data.fileSize,
    fileType: data.fileType,
    entityType: data.entityType,
    columnMapping: data.columnMapping,
    status: 'pending',
    totalRows,
    uploadedBy: userId,
  });

  // ── Update clinic storage usage ────────────────────
  await Clinic.findOneAndUpdate(
    { slug: tenantSlug },
    { $inc: { 'usage.storageUsedMB': fileSizeMB } },
  );

  return upload;
}

async function processUpload(id, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const LegacyUpload = conn.model('LegacyUpload');

  const upload = await LegacyUpload.findById(id);
  if (!upload) throw ApiError.notFound('Upload not found');

  if (upload.status !== 'pending') {
    throw ApiError.badRequest('Only pending uploads can be processed');
  }

  upload.status = 'processing';
  upload.startedAt = new Date();
  await upload.save();

  const modelMap = {
    patients: 'Patient',
    appointments: 'Appointment',
    invoices: 'Invoice',
    doctors: 'User',
    staff: 'User',
  };

  const modelName = modelMap[upload.entityType];
  if (!modelName) {
    upload.status = 'failed';
    upload.errors.push({ row: 0, field: 'entityType', message: `Unknown entity type: ${upload.entityType}` });
    await upload.save();
    throw ApiError.badRequest(`Unknown entity type: ${upload.entityType}`);
  }

  let notImplemented;
  try {
    // Prove the target model is reachable before reporting anything about it.
    conn.model(modelName);

    // This endpoint cannot import rows, and says so.
    //
    // The upload record stores metadata only — the CSV itself is never persisted,
    // so by the time processing runs there is no data left to read. A real
    // implementation would put the file in object storage (S3/GCS) and stream it
    // back here, which is not built.
    //
    // It previously marked the upload 'completed' with successCount 0, which read
    // as a successful import of nothing: a clinic migrating its register would be
    // told the job was done and only discover the empty database later. Failing
    // loudly is the only honest outcome until the storage path exists.
    //
    // The working import path is POST /patients/bulk (and the matching /bulk
    // routes for doctors, staff and inventory), which the Bulk Uploads screen
    // uses — it parses the CSV in the browser and posts the rows.
    notImplemented = 'Legacy upload processing is not implemented: the CSV is not stored, '
      + 'so there are no rows to import. Use POST /patients/bulk instead.';
  } catch (err) {
    notImplemented = err.message;
  }

  upload.status = 'failed';
  upload.completedAt = new Date();
  upload.processedRows = 0;
  upload.successCount = 0;
  upload.failedCount = upload.totalRows || 0;
  upload.errors.push({ row: 0, field: '_general', message: notImplemented });
  await upload.save();

  throw ApiError.notImplemented(notImplemented);
}

async function deleteUpload(id, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const LegacyUpload = conn.model('LegacyUpload');

  const upload = await LegacyUpload.findByIdAndUpdate(
    id,
    { deletedAt: new Date() },
    { new: true },
  );
  if (!upload) throw ApiError.notFound('Upload not found');

  return upload;
}

module.exports = { listUploads, getUploadById, createUpload, processUpload, deleteUpload };
