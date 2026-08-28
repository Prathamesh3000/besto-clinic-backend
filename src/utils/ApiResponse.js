'use strict';

/**
 * Standardized API response formatter.
 *
 * Every successful response follows this shape:
 *   { success: true, message: '...', data: {}, meta?: {} }
 *
 * Usage:
 *   res.status(200).json(ApiResponse.success('Patients fetched', patients, { page: 1 }));
 *   res.status(201).json(ApiResponse.created('Patient created', patient));
 */

class ApiResponse {
  /**
   * Generic success response.
   * @param {string} message
   * @param {*} data
   * @param {object} [meta] - pagination, counts, etc.
   */
  static success(message, data = null, meta = undefined) {
    const body = { success: true, message };
    if (data !== null && data !== undefined) body.data = data;
    if (meta) body.meta = meta;
    return body;
  }

  /** 201 — resource created */
  static created(message, data = null) {
    return ApiResponse.success(message, data);
  }

  /** 204-style (but we return 200 with confirmation message) */
  static deleted(message = 'Resource deleted') {
    return { success: true, message };
  }

  /**
   * Paginated list response.
   * @param {string} message
   * @param {Array} items
   * @param {{ page: number, limit: number, total: number }} pagination
   */
  static paginated(message, items, { page, limit, total }) {
    return {
      success: true,
      message,
      data: items,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNextPage: page * limit < total,
        hasPrevPage: page > 1,
      },
    };
  }
}

module.exports = ApiResponse;
