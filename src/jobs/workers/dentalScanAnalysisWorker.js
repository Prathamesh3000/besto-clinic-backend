'use strict';

/**
 * Dental Scan Analysis Worker — processes multi-image dental scans.
 *
 * Handles 'analyze-dental-scan' jobs from the dentalScan queue.
 * Reads images for all required angles, sends them to the AI analysis service,
 * creates a DentalScanResult document, and updates the scan status.
 */

const fs = require('fs');
const path = require('path');
const { Worker } = require('bullmq');
const { getRedis } = require('../../config/redis');
const logger = require('../../utils/logger');
const { analyzeDentalImages } = require('../../services/aiAnalysis.service');
const { getTenantConnection } = require('../../db/tenantConnectionManager');
const { notifyAndEmit } = require('../../utils/notifyAndEmit');
const { DENTAL_SCAN_STATUS } = require('../../config/constants');
const { normalizeToothNumbersToFDI } = require('../../utils/fdiUtils');
const { computeHealthScore } = require('../../utils/healthScoreCalculator');

// ── Helpers ──────────────────────────────────────────────

/**
 * Read a locally-stored file and return its base64 content.
 * Supports both absolute paths and relative /uploads/... URLs.
 */
async function _readFileAsBase64(fileUrl) {
  // Resolve relative /uploads/... URLs to absolute path
  const filePath = fileUrl.startsWith('/')
    ? path.resolve(__dirname, '../../..', fileUrl.replace(/^\//, ''))
    : fileUrl;

  try {
    const buffer = await fs.promises.readFile(filePath);
    return buffer.toString('base64');
  } catch (err) {
    if (err.code === 'ENOENT') {
      throw new Error(`Image file not found: ${filePath}`);
    }
    throw err;
  }
}

/**
 * Infer MIME type from a file URL/path.
 */
function _getMimeType(fileUrl) {
  const ext = path.extname(fileUrl).toLowerCase();
  const mimeMap = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
  };
  return mimeMap[ext] || 'image/jpeg';
}

/**
 * Map an AI confidence value (numeric 0-1 or string) to our enum.
 */
function _normalizeConfidence(confidence) {
  if (typeof confidence === 'string') {
    const lower = confidence.toLowerCase();
    if (['low', 'medium', 'high'].includes(lower)) return lower;
  }
  // Numeric fallback
  if (typeof confidence === 'number') {
    if (confidence >= 0.7) return 'high';
    if (confidence >= 0.4) return 'medium';
    return 'low';
  }
  return 'medium';
}

/**
 * Validate and normalize an observation type to match our enum.
 */
function _normalizeObservationType(type) {
  const validTypes = ['plaque', 'inflammation', 'discoloration', 'misalignment', 'cavity', 'gum_recession', 'other'];
  const normalized = (type || '').toLowerCase().replace(/[\s-]/g, '_');
  return validTypes.includes(normalized) ? normalized : 'other';
}

/**
 * Normalize tooth numbers to FDI notation.
 * Accepts both FDI (11-48) and legacy US Universal (1-32).
 */
function _normalizeToothNumbers(toothNumbers) {
  return normalizeToothNumbersToFDI(toothNumbers);
}

// ── NEW: Per-angle analysis helpers ──────────────────────

/**
 * Infer which angles likely contributed to an observation based on tooth numbers.
 * LEFT angle shows Q2+Q3, FRONT shows anterior, RIGHT shows Q1+Q4.
 */
function _inferSourceAngles(toothNumbers, angleMetadata) {
  if (!toothNumbers || toothNumbers.length === 0) {
    return [];
  }

  const sourceAngles = new Set();

  for (const toothNum of toothNumbers) {
    // Determine quadrant from FDI number
    const quadrant = Math.floor(toothNum / 10); // 1,2,3,4 for Q1,Q2,Q3,Q4

    // Match against angle metadata
    for (const meta of angleMetadata) {
      if (meta.detectedQuadrants.includes(`Q${quadrant}`)) {
        sourceAngles.add(meta.angle);
      }
    }
  }

  return Array.from(sourceAngles);
}

/**
 * Generate angle-specific notes for an observation.
 * Example: { 'left': 'visible in Q2', 'front': 'confirmed' }
 */
function _generateAngleNotes(observation, angleMetadata) {
  const notes = {};

  if (!observation.sourceAngles || observation.sourceAngles.length === 0) {
    return notes;
  }

  for (const angle of observation.sourceAngles) {
    const meta = angleMetadata.find((m) => m.angle === angle);
    if (meta) {
      notes[angle] = `visible in ${meta.detectedQuadrants.join(', ')}`;
    }
  }

  return notes;
}

// ── Worker Factory ───────────────────────────────────────

function createDentalScanAnalysisWorker() {
  const worker = new Worker(
    'dentalScan',
    async (job) => {
      // Only handle the new multi-image job type
      if (job.name !== 'analyze-dental-scan') return;

      const { scanId, tenantSlug, patientUserId } = job.data;

      logger.info(
        'DentalScanAnalysis worker: processing scan %s for tenant %s (job %s)',
        scanId, tenantSlug, job.id,
      );

      const conn = await getTenantConnection(tenantSlug);
      const DentalScan = conn.model('DentalScan');
      const DentalScanResult = conn.model('DentalScanResult');

      // ── 1. Fetch the scan and validate status ─────────
      const scan = await DentalScan.findById(scanId);
      if (!scan) {
        throw new Error(`Dental scan not found: ${scanId}`);
      }

      if (scan.status !== DENTAL_SCAN_STATUS.PROCESSING) {
        logger.warn(
          'DentalScanAnalysis worker: scan %s has status "%s", expected "processing" — skipping',
          scanId, scan.status,
        );
        return;
      }

      if (!scan.images || scan.images.length === 0) {
        throw new Error(`Dental scan ${scanId} has no images`);
      }

      try {
        // ── 2. Load images from disk as base64 ───────────
        const imagePayloads = await Promise.all(scan.images.map(async (img) => ({
          angle: img.angle,
          base64: await _readFileAsBase64(img.fileUrl),
          mimeType: _getMimeType(img.fileUrl),
        })));

        // ── NEW: Extract per-angle metadata ─────────────
        const angleMetadata = scan.images.map((img) => ({
          angle: img.angle,
          detectedTeeth: img.detectedTeeth || [],
          detectedQuadrants: img.detectedQuadrants || [],
          positionConfidence: img.positionConfidence || 0,
        }));

        logger.info(
          'DentalScanAnalysis worker: loaded %d images for scan %s (with angle metadata)',
          imagePayloads.length, scanId,
        );

        // ── 3. Call AI analysis service ──────────────────
        const aiResult = await analyzeDentalImages(imagePayloads);

        logger.info(
          'DentalScanAnalysis worker: AI returned %d observations for scan %s (%dms)',
          aiResult.observations.length, scanId, aiResult.processingMs,
        );

        // ── 4. Map AI response to DentalScanResult schema with angle tracking
        const observations = (aiResult.observations || []).map((obs) => {
          const toothNumbers = _normalizeToothNumbers(obs.toothNumbers);
          let sourceAngles = _inferSourceAngles(toothNumbers, angleMetadata);

          // For tongue/soft-tissue findings with no tooth numbers,
          // attribute to the tongue angle if present
          if (sourceAngles.length === 0) {
            const areaLower = (obs.area || '').toLowerCase();
            const isTongueRelated = areaLower.includes('tongue') || areaLower.includes('soft tissue');
            if (isTongueRelated && angleMetadata.some((m) => m.angle === 'tongue')) {
              sourceAngles = ['tongue'];
            }
          }

          return {
            type: _normalizeObservationType(obs.type),
            area: obs.area || '',
            toothNumbers,
            confidence: _normalizeConfidence(obs.confidence),
            description: obs.description || '',
            // NEW: Source angle tracking
            sourceAngles,
            angleSpecificNotes: _generateAngleNotes({ sourceAngles }, angleMetadata),
          };
        });

        const recommendedSpecs = aiResult.recommendedSpecializations || [];

        // ── 4b. Compute oral health score ────────────────
        const healthScore = computeHealthScore(observations);

        // ── NEW: 4c. Generate per-angle analysis breakdown
        const angleAnalysis = scan.images.map((img, idx) => {
          // Find all observations that came from this angle
          const angleObservations = observations.filter((obs) =>
            obs.sourceAngles && obs.sourceAngles.includes(img.angle),
          );

          return {
            angle: img.angle,
            teethVisible: angleMetadata[idx].detectedTeeth,
            quadrants: angleMetadata[idx].detectedQuadrants,
            observations: angleObservations,
            qualityScore: 0, // Can be computed from image quality metrics if available
          };
        });

        logger.info(
          'DentalScanAnalysis worker: generated per-angle analysis for %d angles',
          angleAnalysis.length,
        );

        // ── 5. Create DentalScanResult document ─────────
        const scanResult = await DentalScanResult.create({
          scan: scan._id,
          patient: scan.patient,
          observations,
          overallSummary: aiResult.overallSummary,
          recommendedSpecs,
          healthScore,
          angleAnalysis, // NEW
          analysisModel: aiResult.modelVersion,
          analysisLatencyMs: aiResult.processingMs,
          rawAiResponse: aiResult.rawResponse,
        });

        // ── 6. Update DentalScan status to completed ────
        scan.status = DENTAL_SCAN_STATUS.COMPLETED;
        scan.completedAt = new Date();
        await scan.save();

        logger.info(
          'DentalScanAnalysis worker: completed scan %s — result %s (%d observations)',
          scanId, scanResult._id, observations.length,
        );

        // ── 7. Notify patient ───────────────────────────
        if (patientUserId) {
          await notifyAndEmit({
            recipient: patientUserId,
            title: 'Dental Scan Analysis Ready',
            message: 'Your dental scan has been analyzed. View your results now or wait for a doctor to review them.',
            type: 'dental_scan',
            metadata: {
              scanId,
              resultId: String(scanResult._id),
              observationCount: observations.length,
              healthScoreOverall: healthScore.overall,
              healthScoreLabel: healthScore.label,
            },
          }, tenantSlug);
        }

        // ── 8. Notify doctors for review ────────────────
        const User = conn.model('User');
        const doctors = await User.find({
          role: { $in: ['doctor', 'admin', 'super_admin'] },
          isActive: true,
          deletedAt: null,
        }).select('_id').lean();

        for (const doc of doctors) {
          await notifyAndEmit({
            recipient: doc._id,
            title: 'Dental Scan Needs Review',
            message: 'A new AI dental scan analysis is ready for your professional review.',
            type: 'dental_scan',
            metadata: {
              scanId,
              resultId: String(scanResult._id),
            },
          }, tenantSlug);
        }
      } catch (err) {
        // ── Failure path ────────────────────────────────
        logger.error(
          'DentalScanAnalysis worker: scan %s failed (attempt %d) — %s',
          scanId, job.attemptsMade + 1, err.message,
        );

        const maxAttempts = job.opts.attempts || 3;
        const isFinalAttempt = job.attemptsMade >= maxAttempts - 1;

        if (isFinalAttempt) {
          // Only mark as FAILED on the last attempt — keeps status as 'processing'
          // for intermediate failures so BullMQ retries can pick the job back up
          scan.status = DENTAL_SCAN_STATUS.FAILED;
          scan.failureReason = err.message;
          await scan.save();

          // Notify patient of failure
          if (patientUserId) {
            await notifyAndEmit({
              recipient: patientUserId,
              title: 'Scan Analysis Failed',
              message: 'We could not analyze your dental scan. Please try again or contact the clinic.',
              type: 'dental_scan',
              metadata: { scanId },
            }, tenantSlug);
          }
        }

        throw err; // Let BullMQ retry (on intermediate attempts, status stays 'processing')
      }
    },
    {
      connection: getRedis(),
      concurrency: 2,
      drainDelay: 30_000, // 30s idle polling (default 5s) — reduces Redis commands
    },
  );

  worker.on('failed', (job, err) => {
    logger.error(
      'DentalScanAnalysis worker: job %s failed (attempt %d/%d) — %s',
      job?.id, job?.attemptsMade, job?.opts?.attempts, err.message,
    );
  });

  return worker;
}

module.exports = createDentalScanAnalysisWorker;
