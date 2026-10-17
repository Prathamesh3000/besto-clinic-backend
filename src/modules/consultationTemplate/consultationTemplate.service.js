'use strict';

/**
 * Consultation templates — ported to the repository seam (Phase 3).
 *
 * One behaviour is worth naming because it is easy to lose in a port: a system
 * template cannot be edited or deleted. That rule lived in the shape of the old
 * code — load the document, inspect it, then decide — and a port that went
 * straight to `updateById` would drop it silently. Templates would start being
 * editable and nothing would fail.
 *
 * So the read before the write is deliberate here, not a leftover.
 */

const ApiError = require('../../utils/ApiError');
const { parsePagination } = require('../../utils/pagination');
const { repo } = require('../../db/repository');

async function listTemplates(query) {
  const templates = repo('ConsultationTemplate');
  const { skip, limit, page, sort } = parsePagination(query);

  const filter = {};
  if (query.isActive !== undefined) {
    filter.isActive = query.isActive === 'true' || query.isActive === true;
  } else {
    filter.isActive = true;
  }
  if (query.category) filter.category = query.category;

  const { items, total } = await templates.find(filter, {
    // Default order groups templates by category, which is how the picker
    // renders them. Only an explicit ?sort overrides it.
    sort: query.sort ? sort : { category: 1, name: 1 },
    skip,
    limit,
    search: query.search,
    searchFields: ['name', 'code'],
  });

  return { items, total, page, limit };
}

async function getTemplateById(templateId) {
  const template = await repo('ConsultationTemplate').findById(templateId);
  if (!template) throw ApiError.notFound('Consultation template not found');
  return template;
}

/**
 * Codes are compared uppercased because the model uppercases on write.
 * Comparing raw input would let "rct" through alongside an existing "RCT".
 */
async function _codeTaken(templates, code, excludeId) {
  const existing = await templates.findOne({ code: String(code).toUpperCase() });
  if (!existing) return false;
  const id = String(existing._id || existing.id);
  return !excludeId || id !== String(excludeId);
}

async function createTemplate(data, callerId) {
  const templates = repo('ConsultationTemplate');

  if (await _codeTaken(templates, data.code)) {
    throw ApiError.conflict('A template with this code already exists');
  }

  return templates.create({
    ...data,
    // Only seeding creates system templates; anything arriving through the API
    // is a clinic's own, whatever the request body claims.
    isSystemTemplate: false,
    createdBy: callerId,
  });
}

async function updateTemplate(templateId, data) {
  const templates = repo('ConsultationTemplate');

  const template = await templates.findById(templateId);
  if (!template) throw ApiError.notFound('Consultation template not found');
  if (template.isSystemTemplate) {
    throw ApiError.forbidden('System templates cannot be modified');
  }

  if (data.code && String(data.code).toUpperCase() !== template.code) {
    if (await _codeTaken(templates, data.code, templateId)) {
      throw ApiError.conflict('A template with this code already exists');
    }
  }

  return templates.updateById(templateId, data);
}

async function removeTemplate(templateId) {
  const templates = repo('ConsultationTemplate');

  const template = await templates.findById(templateId);
  if (!template) throw ApiError.notFound('Consultation template not found');
  if (template.isSystemTemplate) {
    throw ApiError.forbidden('System templates cannot be deleted');
  }

  await templates.softDeleteById(templateId);
}

module.exports = {
  listTemplates,
  getTemplateById,
  createTemplate,
  updateTemplate,
  removeTemplate,
};
