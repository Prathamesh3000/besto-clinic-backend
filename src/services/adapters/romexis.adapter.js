'use strict';

const logger = require('../../utils/logger');

/**
 * Romexis API adapter — handles communication with the Planmeca Romexis API.
 * Uses Node 18+ built-in fetch. Each instance is configured per-tenant.
 */
class RomexisAdapter {
  /**
   * @param {object} config - { baseUrl, apiVersion }
   * @param {string} apiKey - decrypted API key
   */
  constructor(config, apiKey) {
    const sanitizedUrl = config.baseUrl.replace(/\/$/, '');

    // Validate URL to prevent SSRF
    RomexisAdapter._validateExternalUrl(sanitizedUrl);

    this.baseUrl = sanitizedUrl;
    this.apiVersion = config.apiVersion || 'v1';
    this.apiKey = apiKey;
  }

  /** Block requests to internal/private networks */
  static _validateExternalUrl(urlStr) {
    let parsed;
    try {
      parsed = new URL(urlStr);
    } catch {
      throw new Error('Invalid integration URL');
    }

    // Must be HTTPS in production
    if (process.env.NODE_ENV === 'production' && parsed.protocol !== 'https:') {
      throw new Error('Integration URL must use HTTPS');
    }

    // Block private/internal hostnames and IPs
    const hostname = parsed.hostname.toLowerCase();
    const blockedPatterns = [
      /^localhost$/i,
      /^127\./,
      /^10\./,
      /^172\.(1[6-9]|2\d|3[01])\./,
      /^192\.168\./,
      /^169\.254\./,
      /^0\./,
      /^\[::1\]$/,
      /^\[fe80:/i,
      /^\[fc00:/i,
      /^\[fd00:/i,
      /\.local$/i,
      /\.internal$/i,
      /\.localhost$/i,
    ];

    if (blockedPatterns.some(pattern => pattern.test(hostname))) {
      throw new Error('Integration URL cannot point to internal/private networks');
    }
  }

  /** Test if the connection is valid */
  async testConnection() {
    const start = Date.now();
    try {
      const res = await this._request('GET', '/ping');
      return {
        success: res.ok,
        message: res.ok ? 'Connection successful' : `HTTP ${res.status}`,
        latencyMs: Date.now() - start,
      };
    } catch (err) {
      return {
        success: false,
        message: err.message,
        latencyMs: Date.now() - start,
      };
    }
  }

  /**
   * Fetch patients from Romexis (paginated).
   * @param {object} options - { since, page, limit }
   * @returns {{ patients: object[], hasMore: boolean, total: number }}
   */
  async fetchPatients(options = {}) {
    const { since, page = 1, limit = 100 } = options;
    const params = new URLSearchParams({ offset: String((page - 1) * limit), count: String(limit) });
    if (since) params.set('updatedAfter', since.toISOString());

    const res = await this._request('GET', `/patients?${params}`);
    if (!res.ok) throw new Error(`Romexis fetchPatients failed: HTTP ${res.status}`);

    const data = await res.json();
    return {
      patients: data.items || data.patients || [],
      hasMore: data.hasMore ?? (data.items?.length === limit),
      total: data.totalCount || 0,
    };
  }

  /**
   * Fetch treatment records from Romexis.
   * @param {object} options - { since, patientExternalId }
   * @returns {{ records: object[], hasMore: boolean }}
   */
  async fetchTreatmentRecords(options = {}) {
    const { since, patientExternalId, page = 1, limit = 100 } = options;
    const params = new URLSearchParams({ offset: String((page - 1) * limit), count: String(limit) });
    if (since) params.set('updatedAfter', since.toISOString());
    if (patientExternalId) params.set('patientId', patientExternalId);

    const res = await this._request('GET', `/examinations?${params}`);
    if (!res.ok) throw new Error(`Romexis fetchTreatmentRecords failed: HTTP ${res.status}`);

    const data = await res.json();
    return {
      records: data.items || data.examinations || [],
      hasMore: data.hasMore ?? (data.items?.length === limit),
    };
  }

  /**
   * Make an authenticated HTTP request to Romexis API.
   * @private
   */
  async _request(method, path, body = null) {
    const url = `${this.baseUrl}/api/${this.apiVersion}${path}`;
    const start = Date.now();

    const headers = {
      'X-API-Key': this.apiKey,
      'Accept': 'application/json',
      'X-Client': 'BestoClinic',
    };

    const opts = { method, headers, signal: AbortSignal.timeout(30000) };

    if (body) {
      headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }

    const res = await fetch(url, opts);

    logger.info('Romexis API [%s %s] -> %d (%dms)', method, path.split('?')[0], res.status, Date.now() - start);

    return res;
  }
}

module.exports = RomexisAdapter;
