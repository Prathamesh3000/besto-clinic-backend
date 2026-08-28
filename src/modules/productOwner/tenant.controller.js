'use strict';

/**
 * Tenant Controller — full lifecycle management endpoints.
 *
 * Delegates all business logic to tenant.service.js.
 * req.user is populated by platformAuthenticate() middleware.
 */

const tenantService = require('./tenant.service');
const ApiResponse = require('../../utils/ApiResponse');

// ─── Create ─────────────────────────────────────────────

exports.createTenant = async (req, res) => {
  const result = await tenantService.createTenant(req.body, {
    userId: req.user.userId,
    role: req.user.role,
  });
  res.status(201).json(ApiResponse.created('Tenant created', result));
};

// ─── Read ───────────────────────────────────────────────

exports.listTenants = async (req, res) => {
  const { items, total, page, limit } = await tenantService.listTenants(req.query);
  res.json(ApiResponse.paginated('Tenants retrieved', items, { page, limit, total }));
};

exports.getTenant = async (req, res) => {
  const tenant = await tenantService.getTenantBySlug(req.params.slug);
  res.json(ApiResponse.success('Tenant retrieved', tenant));
};

// ─── Update ─────────────────────────────────────────────

exports.updateTenant = async (req, res) => {
  const tenant = await tenantService.updateTenant(req.params.slug, req.body, {
    userId: req.user.userId,
    role: req.user.role,
  });
  res.json(ApiResponse.success('Tenant updated', tenant));
};

exports.updateTenantFeatures = async (req, res) => {
  const tenant = await tenantService.updateTenantFeatures(req.params.slug, req.body.features, {
    userId: req.user.userId,
    role: req.user.role,
  });
  res.json(ApiResponse.success('Tenant features updated', tenant));
};

// ─── SuperAdmin Assignment ──────────────────────────────

exports.assignSuperAdmin = async (req, res) => {
  const tenant = await tenantService.assignSuperAdmin(req.params.slug, req.body, {
    userId: req.user.userId,
    role: req.user.role,
  });
  res.json(ApiResponse.success('SuperAdmin assigned', tenant));
};

// ─── Lifecycle Actions ──────────────────────────────────

exports.activateTenant = async (req, res) => {
  const tenant = await tenantService.activateTenant(req.params.slug, {
    userId: req.user.userId,
    role: req.user.role,
  });
  res.json(ApiResponse.success('Tenant activated', tenant));
};

exports.suspendTenant = async (req, res) => {
  const tenant = await tenantService.suspendTenant(req.params.slug, req.body.reason, {
    userId: req.user.userId,
    role: req.user.role,
  });
  res.json(ApiResponse.success('Tenant suspended', tenant));
};

exports.deleteTenant = async (req, res) => {
  const result = await tenantService.deleteTenant(
    req.params.slug,
    req.body.reason,
    { userId: req.user.userId, role: req.user.role },
  );
  res.json(ApiResponse.success('Tenant cancelled', result));
};

// ─── Usage & Expiry ─────────────────────────────────────

exports.getTenantUsage = async (req, res) => {
  const usage = await tenantService.getTenantUsage(req.params.slug);
  res.json(ApiResponse.success('Tenant usage retrieved', usage));
};

exports.getSubscriptionExpiry = async (req, res) => {
  const expiry = await tenantService.getSubscriptionExpiry(req.params.slug);
  res.json(ApiResponse.success('Subscription expiry info', expiry));
};

exports.syncTenantUsage = async (req, res) => {
  const result = await tenantService.syncTenantUsage(req.params.slug, req.body, {
    userId: req.user.userId,
    role: req.user.role,
  });
  res.json(ApiResponse.success('Usage synced', result));
};

// ─── Audit Trail ────────────────────────────────────────

exports.getTenantAuditLog = async (req, res) => {
  const { items, total, page, limit } = await tenantService.getTenantAuditLog(
    req.params.slug,
    req.query,
  );
  res.json(ApiResponse.paginated('Audit log retrieved', items, { page, limit, total }));
};

// ─── Logo Upload ────────────────────────────────────

exports.uploadLogo = async (req, res) => {
  const { slug } = req.params;
  const { imageData, mimeType } = req.body;

  const { uploadFile } = require('../../services/storage.service');

  const ext = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp', 'image/svg+xml': '.svg' }[mimeType] || '.png';
  const buffer = Buffer.from(imageData, 'base64');

  const { fileUrl } = await uploadFile(
    { buffer, originalname: `clinic-logo-${slug}${ext}`, mimetype: mimeType },
    'logos',
  );

  const tenant = await tenantService.updateTenant(slug, { logo: fileUrl }, {
    userId: req.user.userId,
    role: req.user.role,
  });

  res.json(ApiResponse.success('Logo uploaded', { logo: tenant.logo }));
};

// ─── Provisioning ───────────────────────────────────

const provisionService = require('../../services/tenantProvision.service');
const queues = require('../../jobs/queues');

exports.getProvisioningStatus = async (req, res) => {
  const status = await provisionService.getProvisioningStatus(req.params.slug);
  res.json(ApiResponse.success('Provisioning status retrieved', status));
};

exports.retryProvisioning = async (req, res) => {
  const provStatus = await provisionService.getProvisioningStatus(req.params.slug);

  if (provStatus.status !== 'failed' && provStatus.status !== 'rolled_back') {
    return res.status(400).json({ success: false, message: 'Can only retry failed or rolled-back provisioning' });
  }

  if (provStatus.attempt >= provStatus.maxAttempts) {
    return res.status(400).json({ success: false, message: 'Max retry attempts reached' });
  }

  // Use the state machine transition (failed→pending and rolled_back→pending are both allowed)
  provStatus.transition('pending');
  await provStatus.save();

  await queues.provisioningQueue.add('provision-tenant', {
    provisioningId: provStatus._id.toString(),
    action: 'provision',
  }, {
    jobId: `provision_${req.params.slug}_retry_${Date.now()}`,
  });

  res.json(ApiResponse.success('Provisioning retry enqueued', provStatus));
};

exports.rollbackProvisioning = async (req, res) => {
  const provStatus = await provisionService.getProvisioningStatus(req.params.slug);

  if (provStatus.status !== 'failed') {
    return res.status(400).json({ success: false, message: 'Can only rollback failed provisioning' });
  }

  await queues.provisioningQueue.add('rollback-tenant', {
    provisioningId: provStatus._id.toString(),
    action: 'rollback',
  }, {
    jobId: `rollback_${req.params.slug}_${Date.now()}`,
  });

  res.json(ApiResponse.success('Provisioning rollback enqueued'));
};
