/**
 * Resolve a backend asset path (e.g. `/uploads/logos/x.png`) to a full URL.
 *
 * In dev, the website runs on a different port than the API, so relative
 * `/uploads/` paths need the API origin prepended.
 *
 * In production behind nginx, uploads are served from the same origin,
 * so the path is returned as-is.
 *
 * Usage:
 *   import { resolveAssetUrl } from '@/lib/assetUrl';
 *   <img src={resolveAssetUrl(clinic.logo)} />
 */

let _baseUrl = null;

function getBaseUrl() {
  if (_baseUrl !== null) return _baseUrl;

  const apiUrl = import.meta.env.VITE_API_URL || '';

  // Strip `/api/v1` (or any `/api/...` suffix) to get the server origin
  _baseUrl = apiUrl.replace(/\/api\/v\d+\/?$/, '');

  return _baseUrl;
}

/**
 * @param {string|null|undefined} path — asset path from the backend (e.g. `/uploads/logos/x.png`)
 * @returns {string} full URL in dev, passthrough in production
 */
export function resolveAssetUrl(path) {
  if (!path) return '';

  // Already a full URL (https://, http://, data:, blob:) — return as-is
  if (/^(https?:|data:|blob:)/.test(path)) return path;

  // Relative backend path — prepend API origin (only needed in dev;
  // in production behind nginx this will be empty string, so path stays relative)
  return `${getBaseUrl()}${path}`;
}
