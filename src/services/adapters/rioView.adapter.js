'use strict';

const logger = require('../../utils/logger');

/**
 * RioView API adapter — handles communication with the RioView dental software API.
 * Uses Node 18+ built-in fetch. Each instance is configured per-tenant.
 */
class RioViewAdapter {
  /**
   * @param {object} config - { baseUrl, apiVersion }
   * @param {string} apiKey - decrypted API key
   */
  constructor(config, apiKey) {
    const sanitizedUrl = config.baseUrl.replace(/\/$/, '');

    // Validate URL to prevent SSRF
    RioViewAdapter._validateExternalUrl(sanitizedUrl);

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
      const res = await this._request('GET', '/status');
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
   * Fetch patients from RioView (paginated).
   * @param {object} options - { since, page, limit }
   * @returns {{ patients: object[], hasMore: boolean, total: number }}
   */
  async fetchPatients(options = {}) {
    const { since, page = 1, limit = 100 } = options;
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (since) params.set('modified_since', since.toISOString());

    const res = await this._request('GET', `/patients?${params}`);
    if (!res.ok) throw new Error(`RioView fetchPatients failed: HTTP ${res.status}`);

    const data = await res.json();
    return {
      patients: data.data || data.patients || [],
      hasMore: data.hasMore || false,
      total: data.total || 0,
    };
  }

  /**
   * Fetch treatment records from RioView.
   * @param {object} options - { since, patientExternalId }
   * @returns {{ records: object[], hasMore: boolean }}
   */
  async fetchTreatmentRecords(options = {}) {
    const { since, patientExternalId, page = 1, limit = 100 } = options;
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (since) params.set('modified_since', since.toISOString());
    if (patientExternalId) params.set('patient_id', patientExternalId);

    const res = await this._request('GET', `/treatments?${params}`);
    if (!res.ok) throw new Error(`RioView fetchTreatmentRecords failed: HTTP ${res.status}`);

    const data = await res.json();
    return {
      records: data.data || data.treatments || [],
      hasMore: data.hasMore || false,
    };
  }

  /**
   * Make an authenticated HTTP request to RioView API.
   * @private
   */
  async _request(method, path, body = null) {
    const url = `${this.baseUrl}/api/${this.apiVersion}${path}`;
    const start = Date.now();

    const headers = {
      'Authorization': `Bearer ${this.apiKey}`,
      'Accept': 'application/json',
      'X-Client': 'BestoClinic',
    };

    const opts = { method, headers, signal: AbortSignal.timeout(30000) };

    if (body) {
      headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }

    const res = await fetch(url, opts);

    logger.info('RioView API [%s %s] -> %d (%dms)', method, path.split('?')[0], res.status, Date.now() - start);

    return res;
  }
}

module.exports = RioViewAdapter;
