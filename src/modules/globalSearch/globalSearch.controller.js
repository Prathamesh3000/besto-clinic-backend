'use strict';

const ApiResponse = require('../../utils/ApiResponse');
const service = require('./globalSearch.service');
const logger = require('../../utils/logger');

exports.tenantSearch = async (req, res) => {
  try {
    const { q, categories, limit } = req.query;
    const data = await service.tenantSearch(q, req.user, req.tenantSlug, categories, limit);
    res.json(ApiResponse.success('Search results', data));
  } catch (err) {
    logger.error('Tenant global search failed', { error: err.message, stack: err.stack });
    res.status(500).json(ApiResponse.error('Search failed'));
  }
};

exports.patientSearch = async (req, res) => {
  try {
    const { q, categories, limit, patientId } = req.query;
    const data = await service.patientSearch(q, req.user, req.tenantSlug, patientId, categories, limit);
    res.json(ApiResponse.success('Search results', data));
  } catch (err) {
    logger.error('Patient global search failed', { error: err.message, stack: err.stack });
    res.status(500).json(ApiResponse.error('Search failed'));
  }
};

exports.platformSearch = async (req, res) => {
  try {
    const { q, categories, limit } = req.query;
    const data = await service.platformSearch(q, categories, limit);
    res.json(ApiResponse.success('Search results', data));
  } catch (err) {
    logger.error('Platform global search failed', { error: err.message, stack: err.stack });
    res.status(500).json(ApiResponse.error('Search failed'));
  }
};
