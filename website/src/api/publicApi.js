/**
 * Public API client — no authentication required.
 * Used for self-service clinic registration, plan fetching, etc.
 */

// Local Development URL
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5001/api/v1';

async function request(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  // res.json() throws on an empty body (204 No Content / 304 Not Modified),
  // which surfaces to the user as a bogus error on a request that succeeded.
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || `Request failed (${res.status})`);
  return data;
}

// ─── Plans ───────────────────────────────────────

/** Fetch all public, active plans */
export const fetchPlans = () => request('/public/plans');

/** Create a Razorpay order for paid plan registration */
export const createRegistrationOrder = (data) =>
  request('/public/create-registration-order', { method: 'POST', body: data });

// ─── Slug ────────────────────────────────────────

/** Check if a slug/subdomain is available */
export const checkSlug = (slug) => request(`/public/check-slug/${slug}`);

// ─── Registration ────────────────────────────────

/** Register a new clinic (self-service) */
export const registerClinic = (data) =>
  request('/public/register-clinic', { method: 'POST', body: data });

// ─── Provisioning ────────────────────────────────

/** Poll provisioning status */
export const getProvisioningStatus = (token) =>
  request(`/public/provisioning-status/${token}`);

/** Retry a failed provisioning */
export const retryProvisioning = (token) =>
  request(`/public/provisioning-retry/${token}`, { method: 'POST' });

// ─── Logo Upload ─────────────────────────────────

/**
 * Upload a clinic logo during registration.
 * Converts the File object to base64 before sending.
 */
export async function uploadLogo(file) {
  const base64 = await fileToBase64(file);

  return request('/public/upload-logo', {
    method: 'POST',
    body: {
      imageData: base64,
      mimeType: file.type,
    },
  });
}

// ─── Document Upload ─────────────────────────────

/**
 * Upload a registration document.
 * Converts the File object to base64 before sending.
 */
export async function uploadDocument(file) {
  const base64 = await fileToBase64(file);

  return request('/public/upload-document', {
    method: 'POST',
    body: {
      fileName: file.name,
      mimeType: file.type,
      fileData: base64,
    },
  });
}

// ─── Guest Dental Scan ──────────────────────────

/** Initiate a guest dental scan session */
export const initiateGuestScan = () =>
  request('/public/guest-scan/initiate', { method: 'POST', body: { consentGiven: true } });

/** Upload a dental image for a specific angle */
export const uploadGuestScanImage = (token, { imageData, angle, mimeType }) =>
  request(`/public/guest-scan/${token}/upload`, {
    method: 'PUT',
    body: { imageData, angle, mimeType },
  });

/** Submit lead capture data */
export const submitGuestLead = (token, leadData) =>
  request(`/public/guest-scan/${token}/lead`, { method: 'POST', body: leadData });

/** Trigger AI analysis */
export const triggerGuestAnalysis = (token) =>
  request(`/public/guest-scan/${token}/analyze`, { method: 'POST' });

/** Poll scan status and results */
export const getGuestScanStatus = (token) =>
  request(`/public/guest-scan/${token}/status`);

/** Validate a captured dental frame for correct angle/quality */
export const validateGuestFrame = (token, { imageData, expectedAngle, mimeType }) =>
  request(`/public/guest-scan/${token}/validate-frame`, {
    method: 'POST',
    body: { imageData, expectedAngle, mimeType },
  });

/** Send dental scan report to email */
export const sendGuestScanReport = (token) =>
  request(`/public/guest-scan/${token}/send-report`, { method: 'POST' });

/** Download dental scan report as PDF (returns Blob) */
export async function downloadGuestScanPdf(token) {
  const res = await fetch(`${API_BASE}/public/guest-scan/${token}/download-pdf`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'PDF download failed');
  }
  return res.blob();
}

/** Create a shareable link for scan results */
export const createGuestScanShareLink = (token) =>
  request(`/public/guest-scan/${token}/share-link`, { method: 'POST' });

// ─── Enhanced Scanner v2.0 (multi-frame) ───────

/** Upload a single frame for a position (enhanced_3pos mode) */
export const uploadGuestScanFrame = (token, frameData) =>
  request(`/public/guest-scan/${token}/upload-frame`, {
    method: 'POST',
    body: frameData, // { positionId, positionIndex, frameIndex, frameCount, imageData, quality, mimeType }
  });

/** Finalize a position after all frames uploaded (enhanced_3pos mode) */
export const finalizeGuestScanPosition = (token, positionData) =>
  request(`/public/guest-scan/${token}/finalize-position`, {
    method: 'POST',
    body: positionData, // { positionId, positionIndex, selectedFrameIndex }
  });

// ─── Tenants / Clinics ──────────────────────────

/** Fetch tenants/clinics (supports geo-search with lat, lon, limit) */
export const fetchTenants = (params) => {
  const qs = new URLSearchParams(
    Object.fromEntries(Object.entries(params || {}).filter(([, v]) => v != null && v !== '')),
  ).toString();
  return request(`/public/tenants${qs ? `?${qs}` : ''}`);
};

/** Fetch cities where active clinics exist, sorted by clinic count */
export const fetchPopularCities = () => request('/public/popular-cities');

// ─── Featured Doctors ───────────────────────────

/** Search featured doctors across all clinics */
export const fetchFeaturedDoctors = (params) => {
  const qs = new URLSearchParams(
    Object.fromEntries(Object.entries(params || {}).filter(([, v]) => v != null && v !== '')),
  ).toString();
  return request(`/public/featured-doctors${qs ? `?${qs}` : ''}`);
};

/** Get a single featured doctor's full profile + recent reviews */
export const getFeaturedDoctor = (id) => request(`/public/featured-doctors/${id}`);

/** Get all featured doctors for a specific clinic */
export const getClinicDoctors = (slug) => request(`/public/clinics/${slug}/doctors`);

/** Get all branches for a specific clinic */
export const getClinicBranches = (slug) => request(`/public/clinics/${slug}/branches`);

/** Get available time slots for a doctor on a given date */
export const getDoctorAvailability = (slug, doctorId, date) =>
  request(`/public/clinics/${slug}/doctors/${doctorId}/availability?date=${date}`);

/** Get monthly availability summary for calendar heat map */
export const getDoctorAvailabilitySummary = (slug, doctorId, month, year, branchId) =>
  request(`/public/clinics/${slug}/doctors/${doctorId}/availability-summary?month=${month}&year=${year}${branchId ? `&branch=${branchId}` : ''}`);

/** Get a single clinic's public profile by slug */
export const fetchTenant = (slug) => request(`/public/tenants/${slug}`);

// ─── Geocoding ──────────────────────────────────

/** Reverse geocode coordinates to locality + city */
export const reverseGeocode = (lat, lon) =>
  request(`/public/reverse-geocode?lat=${lat}&lon=${lon}`);

/** Forward geocode area name to coordinates */
export const geocodeSearch = (q) =>
  request(`/public/geocode-search?q=${encodeURIComponent(q)}`);

// ─── Search Suggestions ─────────────────────────

/** Fetch autocomplete suggestions (doctors + clinics) */
export const fetchSearchSuggestions = (q, signal) =>
  request(`/public/search-suggestions?q=${encodeURIComponent(q)}&limit=3`, { signal });

// ─── Prescription Scanner ────────────────────────

/** Upload prescription image and get transcription (synchronous) */
export const prescriptionScanUpload = (imageData, mimeType) =>
  request('/public/prescription-scan/upload', {
    method: 'POST',
    body: { imageData, mimeType },
  });

/** Translate prescription transcription to target language */
export const prescriptionScanTranslate = (scanId, targetLanguage) =>
  request(`/public/prescription-scan/${scanId}/translate`, {
    method: 'POST',
    body: { targetLanguage },
  });

/** Retrieve a saved prescription scan */
export const getPrescriptionScan = (scanId) =>
  request(`/public/prescription-scan/${scanId}`);

/** Convert a File/Blob to base64 string (without the data URI prefix) */
export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      // Strip the "data:...;base64," prefix
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
