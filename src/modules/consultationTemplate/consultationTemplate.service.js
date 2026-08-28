'use strict';

const ApiError = require('../../utils/ApiError');
const { parsePagination } = require('../../utils/pagination');
const { getTenantConnection } = require('../../db/tenantConnectionManager');

async function listTemplates(query, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const ConsultationTemplate = conn.model('ConsultationTemplate');
  const { skip, limit, page, sort } = parsePagination(query);

  const filter = { deletedAt: null };
  if (query.isActive !== undefined) {
    filter.isActive = query.isActive === 'true' || query.isActive === true;
  } else {
    filter.isActive = true;
  }
  if (query.category) filter.category = query.category;
  if (query.search) {
    const escaped = query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.$or = [
      { name: { $regex: escaped, $options: 'i' } },
      { code: { $regex: escaped, $options: 'i' } },
    ];
  }

  const [items, total] = await Promise.all([
    ConsultationTemplate.find(filter)
      .sort(query.sort ? sort : { category: 1, name: 1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    ConsultationTemplate.countDocuments(filter),
  ]);

  return { items, total, page, limit };
}

async function getTemplateById(templateId, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const ConsultationTemplate = conn.model('ConsultationTemplate');

  const template = await ConsultationTemplate.findById(templateId).lean();
  if (!template) throw ApiError.notFound('Consultation template not found');

  return template;
}

async function createTemplate(data, callerId, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const ConsultationTemplate = conn.model('ConsultationTemplate');

  // Check for duplicate code
  const existing = await ConsultationTemplate.findOne({ code: data.code.toUpperCase() }).lean();
  if (existing) throw ApiError.conflict('A template with this code already exists');

  const template = await ConsultationTemplate.create({
    ...data,
    isSystemTemplate: false,
    createdBy: callerId,
  });

  return template;
}

async function updateTemplate(templateId, data, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const ConsultationTemplate = conn.model('ConsultationTemplate');

  const template = await ConsultationTemplate.findById(templateId);
  if (!template) throw ApiError.notFound('Consultation template not found');

  // Prevent editing system templates
  if (template.isSystemTemplate) {
    throw ApiError.forbidden('System templates cannot be modified');
  }

  // Check code uniqueness if code is changing
  if (data.code && data.code.toUpperCase() !== template.code) {
    const existing = await ConsultationTemplate.findOne({ code: data.code.toUpperCase(), _id: { $ne: templateId } }).lean();
    if (existing) throw ApiError.conflict('A template with this code already exists');
  }

  Object.assign(template, data);
  await template.save();
  return template;
}

async function removeTemplate(templateId, tenantSlug) {
  const conn = await getTenantConnection(tenantSlug);
  const ConsultationTemplate = conn.model('ConsultationTemplate');

  const template = await ConsultationTemplate.findById(templateId);
  if (!template) throw ApiError.notFound('Consultation template not found');

  if (template.isSystemTemplate) {
    throw ApiError.forbidden('System templates cannot be deleted');
  }

  template.deletedAt = new Date();
  await template.save();
}

module.exports = {
  listTemplates,
  getTemplateById,
  createTemplate,
  updateTemplate,
  removeTemplate,
};
