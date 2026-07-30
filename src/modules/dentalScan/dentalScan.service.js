'use strict';

const ApiError = require('../../utils/ApiError');
const { parsePagination } = require('../../utils/pagination');
const { DENTAL_SCAN_STATUS, DENTAL_SCAN_ANGLE, SCAN_MODE_ANGLES, DENTAL_SCAN_MODE } = require('../../config/constants');
const { getTenantConnection } = require('../../db/tenantConnectionManager');
const { ROLE_PERMISSIONS, PERMISSIONS } = require('../../config/permissions');
const { uploadFile } = require('../../services/storage.service');
const { notifyAndEmit } = require('../../utils/notifyAndEmit');

/** Get required angles for a scan based on its mode */
function _getRequiredAngles(scanMode) {
  return SCAN_MODE_ANGLES[scanMode] || SCAN_MODE_ANGLES[DENTAL_SCAN_MODE.GUIDED_3POS];
}

/** Map observation types to dental specializations */
const OBSERVATION_SPECIALIZATION_MAP = {
  plaque:         'General Dentistry',
  cavity:         'General Dentistry',
  inflammation:   'Periodontics',
  gum_recession:  'Periodontics',
  misalignment:   'Orthodontics',
  discoloration:  'Cosmetic Dentistry',
};

/** Confidence-level boost values */
const CONFIDENCE_BOOST_VALUES = {
  high:   0.3,
  medium: 0.2,
  low:    0.1,
};

// ── Helpers ──────────────────────────────────────────────

/** Check if user has full (non-OWN) read permission */
function _hasFullAccess(user) {
  const perms = ROLE_PERMISSIONS[user.role] || [];
  return perms.includes(PERMISSIONS.DENTAL_SCAN_READ);
}

/** Resolve the Patient._id linked to this user */
async function _getLinkedPatientId(userId, conn) {
  const Patient = conn.model('Patient');
  const patient = await Patient.findOne({ user: userId }).select('_id').lean();
  return patient ? patient._id : null;
}

// ── Service Functions ────────────────────────────────────

/**
 * Step 1: Initiate a dental scan — creates a scan record with consent tracking.
 */
async function initiateScan(data, tenantSlug, user) {
  const conn = await getTenantConnection(tenantSlug);
  const DentalScan = conn.model('DentalScan');

  // Get the patient linked to this user
  const patientId = await _getLinkedPatientId(user.userId, conn);
  if (!patientId) throw ApiError.badRequest('No patient profile linked to your account');

  const scan = await DentalScan.create({
    patient:          patientId,
    createdBy:        user.userId,
    status:           DENTAL_SCAN_STATUS.CAPTURING,
    consentGiven:     true,
    consentTimestamp:  new Date(),
    consentIp:        data.ip || null,
    scanType:         data.scanType || 'general',
    scanMode:         data.scanMode || DENTAL_SCAN_MODE.GUIDED_3POS,
    scanStartedAt:    new Date(),
  });

  return scan;
}

/**
 * Step 2: Upload a single image for a specific angle.
 */
async function uploadImage(scanId, data, tenantSlug, user) {
  const conn = await getTenantConnection(tenantSlug);
  const DentalScan = conn.model('DentalScan');

  const scan = await DentalScan.findById(scanId);
  if (!scan) throw ApiError.notFound('Dental scan not found');

  // Self-scope check
  if (!_hasFullAccess(user)) {
    const patientId = await _getLinkedPatientId(user.userId, conn);
    if (!patientId || String(scan.patient) !== String(patientId)) {
      throw ApiError.forbidden('You can only upload images to your own dental scans');
    }
  }

  // Must be in capturing status
  if (scan.status !== DENTAL_SCAN_STATUS.CAPTURING) {
    throw ApiError.badRequest(`Cannot upload images to a scan with status "${scan.status}"`);
  }

  // Validate angle is allowed for this scan's mode
  const allowedAngles = _getRequiredAngles(scan.scanMode);
  if (!allowedAngles.includes(data.angle)) {
    throw ApiError.badRequest(
      `Angle "${data.angle}" is not valid for scan mode "${scan.scanMode}". Allowed: ${allowedAngles.join(', ')}`,
    );
  }

  // Check for duplicate angle
  const existingAngle = scan.images.find((img) => img.angle === data.angle);
  if (existingAngle) {
    throw ApiError.conflict(`Image for angle "${data.angle}" has already been uploaded`);
  }

  // Save image to storage
  const imageBuffer = Buffer.from(data.imageData, 'base64');
  const { fileUrl, fileName } = await uploadFile(
    {
      buffer: imageBuffer,
      originalname: `dental-scan-${data.angle}-${Date.now()}.jpg`,
      mimetype: data.mimeType || 'image/jpeg',
    },
    'dental-scans',
  );

  // Push to images array
  scan.images.push({
    angle:      data.angle,
    fileUrl,
    fileName,
    fileSize:   imageBuffer.length,
    uploadedAt: new Date(),
  });
  await scan.save();

  return scan;
}

/**
 * Step 3: Trigger AI analysis — validates all 5 angles are uploaded.
 */
async function triggerAnalysis(scanId, tenantSlug, user) {
  const conn = await getTenantConnection(tenantSlug);
  const DentalScan = conn.model('DentalScan');

  const scan = await DentalScan.findById(scanId);
  if (!scan) throw ApiError.notFound('Dental scan not found');

  // Self-scope check
  if (!_hasFullAccess(user)) {
    const patientId = await _getLinkedPatientId(user.userId, conn);
    if (!patientId || String(scan.patient) !== String(patientId)) {
      throw ApiError.forbidden('You can only trigger analysis for your own dental scans');
    }
  }

  // Cannot re-analyze if already processing or completed
  if ([DENTAL_SCAN_STATUS.PROCESSING, DENTAL_SCAN_STATUS.COMPLETED].includes(scan.status)) {
    throw ApiError.conflict(`Scan is already "${scan.status}"`);
  }

  // Must be in capturing status
  if (scan.status !== DENTAL_SCAN_STATUS.CAPTURING) {
    throw ApiError.badRequest(`Cannot trigger analysis for a scan with status "${scan.status}"`);
  }

  // Validate all required angles are captured (mode-aware)
  const requiredAngles = _getRequiredAngles(scan.scanMode);
  const uploadedAngles = scan.images.map((img) => img.angle);
  const missingAngles = requiredAngles.filter((a) => !uploadedAngles.includes(a));
  if (missingAngles.length > 0) {
    throw ApiError.badRequest(
      `All ${requiredAngles.length} angles must be captured before analysis. Missing: ${missingAngles.join(', ')}`,
    );
  }

  // Update status to processing
  scan.status = DENTAL_SCAN_STATUS.PROCESSING;

  // Enqueue AI analysis job
  const { dentalScanQueue } = require('../../jobs/queues');
  const job = await dentalScanQueue.add('analyze-dental-scan', {
    scanId:        String(scan._id),
    tenantSlug,
    images:        scan.images.map((img) => ({
      angle:   img.angle,
      fileUrl: img.fileUrl,
    })),
    patientUserId: user.userId,
  });

  scan.analysisJobId = String(job.id);
  await scan.save();

  return scan;
}

/**
 * Step 4: Get the DentalScanResult for a completed scan.
 */
async function getScanResult(scanId, tenantSlug, user) {
  const conn = await getTenantConnection(tenantSlug);
  const DentalScanResult = conn.model('DentalScanResult');

  const result = await DentalScanResult.findOne({ scan: scanId })
    .populate('patient', 'name patientId');

  if (!result) throw ApiError.notFound('Scan result not found');

  // Self-scope check
  if (!_hasFullAccess(user)) {
    const patientId = await _getLinkedPatientId(user.userId, conn);
    if (!patientId || String(result.patient._id || result.patient) !== String(patientId)) {
      throw ApiError.forbidden('You can only view your own scan results');
    }
  }

  return result;
}

/**
 * Step 5: Get doctor recommendations based on scan result observations.
 */
async function getRecommendations(scanId, query, tenantSlug, user) {
  const conn = await getTenantConnection(tenantSlug);
  const DentalScanResult = conn.model('DentalScanResult');
  const User = conn.model('User');

  // Fetch scan result
  const result = await DentalScanResult.findOne({ scan: scanId });
  if (!result) throw ApiError.notFound('Scan result not found');

  // Self-scope check
  if (!_hasFullAccess(user)) {
    const patientId = await _getLinkedPatientId(user.userId, conn);
    if (!patientId || String(result.patient) !== String(patientId)) {
      throw ApiError.forbidden('You can only view recommendations for your own scans');
    }
  }

  const observations = result.observations || [];
  if (observations.length === 0) {
    return [];
  }

  // Determine required specializations from observations
  const specSet = new Set();
  for (const obs of observations) {
    const spec = OBSERVATION_SPECIALIZATION_MAP[obs.type];
    if (spec) specSet.add(spec);

    // Cavity with high confidence or severe → Endodontics
    if (obs.type === 'cavity' && (obs.confidence === 'high')) {
      specSet.add('Endodontics');
    }
  }
  const requiredSpecs = [...specSet];

  if (requiredSpecs.length === 0) {
    return [];
  }

  // Query doctors with matching specializations
  const doctorFilter = {
    role: 'doctor',
    isActive: true,
    specialization: { $in: requiredSpecs },
  };
  if (query.branch) {
    doctorFilter.branch = query.branch;
  }

  const doctors = await User.find(doctorFilter)
    .select('name specialization rating branch')
    .lean();

  if (doctors.length === 0) {
    return [];
  }

  // Compute relevance score for each doctor
  const totalObservations = observations.length;

  const scoredDoctors = doctors.map((doctor) => {
    // Find observations matching this doctor's specialization
    const matchedObservations = observations.filter((obs) => {
      const obsSpec = OBSERVATION_SPECIALIZATION_MAP[obs.type];
      // Also check Endodontics for severe cavity
      if (obs.type === 'cavity' && obs.confidence === 'high' && doctor.specialization === 'Endodontics') {
        return true;
      }
      return obsSpec === doctor.specialization;
    });

    const relevanceScore = matchedObservations.length / totalObservations;

    // Compute confidence boost (average of matched observations' confidence boosts)
    const confidenceBoost = matchedObservations.length > 0
      ? matchedObservations.reduce((sum, obs) => sum + (CONFIDENCE_BOOST_VALUES[obs.confidence] || 0), 0) / matchedObservations.length
      : 0;

    // Final score: relevanceScore * 0.5 + confidenceBoost * 0.3 + (rating/5 || 0) * 0.2
    const ratingScore = (doctor.rating || 0) / 5;
    const finalScore = (relevanceScore * 0.5) + (confidenceBoost * 0.3) + (ratingScore * 0.2);

    return {
      doctor,
      matchedObservations: matchedObservations.map((obs) => ({
        type:       obs.type,
        area:       obs.area,
        confidence: obs.confidence,
      })),
      relevanceScore: Math.round(relevanceScore * 100) / 100,
      finalScore:     Math.round(finalScore * 1000) / 1000,
      nextAvailableSlot: null, // placeholder — populated by scheduling service if available
    };
  });

  // Sort by finalScore DESC, limit 5
  scoredDoctors.sort((a, b) => b.finalScore - a.finalScore);

  return scoredDoctors.slice(0, 5);
}

/**
 * List dental scans — patients see own, doctors/admins see all.
 */
async function listScans(query, tenantSlug, user) {
  const conn = await getTenantConnection(tenantSlug);
  const DentalScan = conn.model('DentalScan');
  const { skip, limit, page, sort } = parsePagination(query);

  const filter = {};
  if (query.status) filter.status = query.status;

  // Self-scope: patients only see their own scans
  if (!_hasFullAccess(user)) {
    const patientId = await _getLinkedPatientId(user.userId, conn);
    if (patientId) {
      filter.patient = patientId;
    } else {
      return { items: [], total: 0, page: 1, limit };
    }
  }

  // Doctors can filter to only pending_review (completed but not yet reviewed)
  if (query.pendingReview === 'true') {
    filter.status = DENTAL_SCAN_STATUS.COMPLETED;
    filter['doctorReview.verdict'] = { $exists: false };
  }

  // Filter for scans that HAVE been reviewed by a doctor
  if (query.hasReview === 'true') {
    filter.status = DENTAL_SCAN_STATUS.COMPLETED;
    filter['doctorReview.verdict'] = { $exists: true };
  }

  const [items, total] = await Promise.all([
    DentalScan.find(filter)
      .sort(sort).skip(skip).limit(limit)
      .populate('patient', 'name patientId')
      .populate('createdBy', 'name'),
    DentalScan.countDocuments(filter),
  ]);

  return { items, total, page, limit };
}

/**
 * Get a single dental scan by ID.
 */
async function getScanById(id, tenantSlug, user) {
  const conn = await getTenantConnection(tenantSlug);
  const DentalScan = conn.model('DentalScan');

  const scan = await DentalScan.findById(id)
    .populate('patient', 'name patientId phone email')
    .populate('createdBy', 'name');

  if (!scan) throw ApiError.notFound('Dental scan not found');

  // Self-scope check
  if (!_hasFullAccess(user)) {
    const patientId = await _getLinkedPatientId(user.userId, conn);
    if (!patientId || String(scan.patient._id || scan.patient) !== String(patientId)) {
      throw ApiError.forbidden('You can only view your own dental scans');
    }
  }

  return scan;
}

/**
 * Doctor submits review for a dental scan.
 */
async function reviewScan(id, reviewData, tenantSlug, user) {
  const conn = await getTenantConnection(tenantSlug);
  const DentalScan = conn.model('DentalScan');

  const scan = await DentalScan.findById(id);
  if (!scan) throw ApiError.notFound('Dental scan not found');

  // Only completed scans can be reviewed
  if (scan.status !== DENTAL_SCAN_STATUS.COMPLETED) {
    throw ApiError.badRequest(`Cannot review a scan with status "${scan.status}"`);
  }

  // Prevent overwriting an existing review
  if (scan.doctorReview?.verdict) {
    throw ApiError.conflict('This scan has already been reviewed');
  }

  scan.doctorReview = {
    reviewedBy:       user.userId,
    reviewedAt:       new Date(),
    verdict:          reviewData.verdict,
    clinicalNotes:    reviewData.clinicalNotes,
    modifiedFindings: reviewData.verdict === 'modified' ? reviewData.modifiedFindings : undefined,
    recommendations:  reviewData.recommendations,
    urgency:          reviewData.urgency,
  };
  await scan.save();

  // Notify the patient that review is complete
  const Patient = conn.model('Patient');
  const patient = await Patient.findById(scan.patient).select('user name').lean();
  if (patient?.user) {
    const User = conn.model('User');
    const doctor = await User.findById(user.userId).select('name').lean();
    await notifyAndEmit({
      recipient: patient.user,
      title: 'Scan Review Complete',
      message: `Dr. ${doctor?.name || 'Your doctor'} has reviewed your dental scan.`,
      type: 'dental_scan',
      metadata: {
        scanId: id,
        verdict: reviewData.verdict,
        urgency: reviewData.urgency,
      },
    }, tenantSlug);
  }

  return scan;
}

// ── NEW: Real-time validation and tooth detection ──

/**
 * Validate a frame in real-time during positioning (pre-capture).
 * Lightweight AI check for head orientation + teeth visibility.
 */
async function validateFrame(scanId, data, tenantSlug, user) {
  const conn = await getTenantConnection(tenantSlug);
  const DentalScan = conn.model('DentalScan');
  const { validateDentalFrame } = require('../../services/aiAnalysis.service');

  const scan = await DentalScan.findById(scanId);
  if (!scan) throw ApiError.notFound('Dental scan not found');

  // Self-scope check
  if (!_hasFullAccess(user)) {
    const patientId = await _getLinkedPatientId(user.userId, conn);
    if (!patientId || String(scan.patient) !== String(patientId)) {
      throw ApiError.forbidden('You can only validate frames for your own dental scans');
    }
  }

  // Must be in capturing status
  if (scan.status !== DENTAL_SCAN_STATUS.CAPTURING) {
    throw ApiError.badRequest(`Cannot validate frames for a scan with status "${scan.status}"`);
  }

  // Call AI validation service (fast ~0.5-1.5s)
  const result = await validateDentalFrame(data.imageData, data.mimeType, data.expectedAngle);

  // Optionally track validation attempts (can be added to scan.images later when uploaded)
  // For now, just return the validation result

  return result;
}

/**
 * Detect which teeth are visible in a captured frame (per-angle analysis).
 * Used after capture to identify tooth numbers for this specific angle.
 */
async function detectTeeth(scanId, data, tenantSlug, user) {
  const conn = await getTenantConnection(tenantSlug);
  const DentalScan = conn.model('DentalScan');
  const { detectTeethInFrame } = require('../../services/aiAnalysis.service');

  const scan = await DentalScan.findById(scanId);
  if (!scan) throw ApiError.notFound('Dental scan not found');

  // Self-scope check
  if (!_hasFullAccess(user)) {
    const patientId = await _getLinkedPatientId(user.userId, conn);
    if (!patientId || String(scan.patient) !== String(patientId)) {
      throw ApiError.forbidden('You can only detect teeth for your own dental scans');
    }
  }

  // Call AI tooth detection service
  const result = await detectTeethInFrame(data.imageData, data.mimeType, data.angle);

  // Store detection results in the corresponding image (if already uploaded)
  const imageIndex = scan.images.findIndex((img) => img.angle === data.angle);
  if (imageIndex !== -1) {
    scan.images[imageIndex].detectedTeeth = result.teethVisible;
    scan.images[imageIndex].detectedQuadrants = result.quadrants;
    scan.images[imageIndex].positionConfidence = result.confidence;
    await scan.save();
  }

  return result;
}

module.exports = {
  initiateScan,
  uploadImage,
  triggerAnalysis,
  getScanResult,
  getRecommendations,
  listScans,
  getScanById,
  reviewScan,
  validateFrame,
  detectTeeth,
};
