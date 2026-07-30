'use strict';

/**
 * File storage service — supports local disk (dev) and S3 (prod).
 * Used for X-rays, patient photos, clinic logos, etc.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const logger = require('../utils/logger');

/**
 * Upload a file.
 * @param {{ buffer: Buffer, originalname: string, mimetype: string }} file
 * @param {string} folder — e.g. 'avatars', 'xrays', 'documents'
 * @returns {{ fileUrl: string, fileName: string, fileType: string }}
 */
async function uploadFile(file, folder = 'uploads') {
  const env = require('../config/env');

  if (env.STORAGE_PROVIDER === 's3') {
    return _uploadToS3(file, folder);
  }

  return _uploadToLocal(file, folder);
}

/**
 * Delete a file.
 */
async function deleteFile(fileUrl) {
  const env = require('../config/env');

  if (env.STORAGE_PROVIDER === 's3') {
    return _deleteFromS3(fileUrl);
  }

  return _deleteFromLocal(fileUrl);
}

// ── Local storage ───────────────────────────────────

async function _uploadToLocal(file, folder) {
  // Use process.cwd() for consistency with app.js static serving
  const uploadsDir = path.resolve(process.cwd(), 'uploads', folder);

  const ext = path.extname(file.originalname);
  const fileName = `${crypto.randomUUID()}${ext}`;
  const filePath = path.join(uploadsDir, fileName);

  try {
    fs.mkdirSync(uploadsDir, { recursive: true });
    fs.writeFileSync(filePath, file.buffer);
  } catch (err) {
    // A raw "EACCES: permission denied, open '/app/uploads/...'" used to reach
    // the end user verbatim. It almost always means the uploads path is a
    // mounted volume the container user does not own, not a code fault.
    if (err.code === 'EACCES' || err.code === 'EPERM' || err.code === 'EROFS') {
      logger.error(
        'Upload failed — %s is not writable by uid %s (%s). Check volume ownership or the Dockerfile mkdir/chown step.',
        uploadsDir, typeof process.getuid === 'function' ? process.getuid() : 'n/a', err.code,
      );
      throw new Error('File storage is not writable on the server. Please contact support.');
    }
    logger.error('Upload failed for %s: %s', uploadsDir, err.message);
    throw new Error('Could not save the uploaded file. Please try again.');
  }

  logger.info('File uploaded (local): %s/%s', folder, fileName);

  return {
    fileUrl: `/uploads/${folder}/${fileName}`,
    fileName,
    fileType: file.mimetype,
  };
}

async function _deleteFromLocal(fileUrl) {
  const filePath = path.resolve(process.cwd(), fileUrl.replace(/^\//, ''));
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    logger.info('File deleted (local): %s', fileUrl);
  }
}

// ── S3 storage ──────────────────────────────────────
// NOT IMPLEMENTED. @aws-sdk/client-s3 is not a dependency of this project, so
// setting STORAGE_PROVIDER=s3 disables uploads entirely rather than moving them
// off local disk. Until this is written, durable uploads require mounting a
// persistent volume at ./uploads that is writable by the runtime user.

async function _uploadToS3(_file, _folder) {
  // TODO: implement with @aws-sdk/client-s3
  throw new Error('S3 upload not implemented — set STORAGE_PROVIDER=local or implement S3 client');
}

async function _deleteFromS3(_fileUrl) {
  // TODO: implement with @aws-sdk/client-s3
  throw new Error('S3 delete not implemented');
}

module.exports = { uploadFile, deleteFile };
