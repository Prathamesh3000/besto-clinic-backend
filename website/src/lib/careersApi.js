/**
 * Public Career Portal API client — no auth needed for browsing or applying.
 */

const API_BASE = import.meta.env.VITE_API_URL || 'https://bestoclinic.com/api/v1';

function qs(params) {
  const filtered = Object.fromEntries(
    Object.entries(params || {}).filter(([, v]) => v !== '' && v != null),
  );
  const s = new URLSearchParams(filtered).toString();
  return s ? `?${s}` : '';
}

async function publicRequest(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const data = await res.json().catch(() => ({ message: 'Invalid response' }));
  if (!res.ok) {
    const err = new Error(data.message || 'Request failed');
    if (data.errors) err.errors = data.errors;
    throw err;
  }
  return data;
}

// ─── Public Job Listings ─────────────────────────────────
export const listPublicJobs = (params) => publicRequest(`/public/jobs${qs(params)}`);
export const getPublicJob = (slug) => publicRequest(`/public/jobs/${slug}`);
export const getPublicDepartments = () => publicRequest('/public/jobs/departments');

// ─── Job Application (no auth) ──────────────────────────
export const applyToJob = (jobId, data) =>
  publicRequest(`/public/jobs/${jobId}/apply`, { method: 'POST', body: data });
