'use strict';

/**
 * Pagination helper — extracts page/limit from query, builds Mongoose-compatible
 * skip/limit and a meta object for ApiResponse.paginated().
 *
 * Usage:
 *   const { skip, limit, page } = parsePagination(req.query);
 *   const [items, total] = await Promise.all([
 *     Model.find(filter).skip(skip).limit(limit),
 *     Model.countDocuments(filter),
 *   ]);
 *   res.json(ApiResponse.paginated('Listed', items, { page, limit, total }));
 */

const { PAGINATION } = require('../config/constants');

/**
 * @param {object} query - req.query
 * @returns {{ page: number, limit: number, skip: number, sort: object }}
 */
function parsePagination(query = {}) {
  let page  = parseInt(query.page, 10)  || PAGINATION.DEFAULT_PAGE;
  let limit = parseInt(query.limit, 10) || PAGINATION.DEFAULT_LIMIT;

  if (page < 1) page = 1;
  if (limit < 1) limit = 1;
  if (limit > PAGINATION.MAX_LIMIT) limit = PAGINATION.MAX_LIMIT;

  const skip = (page - 1) * limit;

  // Sort: ?sort=-createdAt,name  →  { createdAt: -1, name: 1 }
  //   or: ?sort=name&order=desc  →  { name: -1 }
  let sort = { createdAt: -1 }; // default newest first
  if (query.sort) {
    // Support "sort=field&order=asc|desc" format from frontend
    if (query.order) {
      sort = { [query.sort]: query.order === 'desc' ? -1 : 1 };
    } else {
      sort = {};
      query.sort.split(',').forEach((field) => {
        if (field.startsWith('-')) {
          sort[field.slice(1)] = -1;
        } else {
          sort[field] = 1;
        }
      });
    }
  }

  return { page, limit, skip, sort };
}

module.exports = { parsePagination };
