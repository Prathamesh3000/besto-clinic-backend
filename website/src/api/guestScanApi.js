/**
 * Guest Scan API - Wrapper for immersive scanner endpoints
 * Extends publicApi with additional scanner-specific methods
 */

import {
  initiateGuestScan,
  uploadGuestScanImage,
  validateGuestFrame as validateGuestFrameApi,
  triggerGuestAnalysis,
  getGuestScanStatus,
  submitGuestLead,
  sendGuestScanReport,
} from './publicApi';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5001/api/v1';

/**
 * Initialize scanner session
 */
export const initiateScan = initiateGuestScan;

/**
 * Validate a frame in real-time during positioning
 */
export const validateFrame = validateGuestFrameApi;

/**
 * Detect teeth in a captured frame (per-angle tooth detection)
 */
export const detectTeeth = async (token, { imageData, angle, mimeType }) => {
  const res = await fetch(`${API_BASE}/public/guest-scan/${token}/detect-teeth`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ imageData, angle, mimeType }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Teeth detection failed');
  return data;
};

/**
 * Upload captured image for a position
 */
export const uploadImage = uploadGuestScanImage;

/**
 * Trigger final AI analysis
 */
export const analyzeScans = triggerGuestAnalysis;

/**
 * Get scan status and results
 */
export const getScanStatus = getGuestScanStatus;

/**
 * Submit lead capture data
 */
export const submitLead = submitGuestLead;

/**
 * Send report to email
 */
export const sendReport = sendGuestScanReport;

/**
 * Export as named object for convenience
 */
export const guestScanApi = {
  initiateScan,
  validateFrame,
  detectTeeth,
  uploadImage,
  analyzeScans,
  getScanStatus,
  submitLead,
  sendReport,
};

export default guestScanApi;
