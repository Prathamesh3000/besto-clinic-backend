'use strict';

/**
 * Guest Scan Worker — processes guest (public/unauthenticated) dental scans.
 *
 * Handles 'analyze-guest-scan' jobs from the guestScan queue.
 * Reads images from storage, sends them to AI analysis, and embeds
 * results directly in the GuestScan document (platform DB).
 */

const fs = require('fs');
const path = require('path');
const { Worker } = require('bullmq');
const { getRedis } = require('../../config/redis');
const logger = require('../../utils/logger');
const { analyzeDentalImages } = require('../../services/aiAnalysis.service');
const GuestScan = require('../../models/platform/GuestScan');
const { normalizeToothNumbersToFDI } = require('../../utils/fdiUtils');
const { computeHealthScore } = require('../../utils/healthScoreCalculator');

// ── Helpers (reused from dentalScanAnalysisWorker) ──────

async function _readFileAsBase64(fileUrl) {
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

function _normalizeConfidence(confidence) {
  if (typeof confidence === 'string') {
    const lower = confidence.toLowerCase();
    if (['low', 'medium', 'high'].includes(lower)) return lower;
  }
  if (typeof confidence === 'number') {
    if (confidence >= 0.7) return 'high';
    if (confidence >= 0.4) return 'medium';
    return 'low';
  }
  return 'medium';
}

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

// ── Worker Factory ───────────────────────────────────────

function createGuestScanWorker() {
  const worker = new Worker(
    'guestScan',
    async (job) => {
      if (job.name !== 'analyze-guest-scan') return;

      const { scanId } = job.data;

      logger.info(
        'GuestScan worker: processing scan %s (job %s)',
        scanId, job.id,
      );

      const scan = await GuestScan.findById(scanId);
      if (!scan) {
        throw new Error(`Guest scan not found: ${scanId}`);
      }

      if (scan.status !== 'processing') {
        logger.warn(
          'GuestScan worker: scan %s has status "%s", expected "processing" — skipping',
          scanId, scan.status,
        );
        return;
      }

      if (!scan.images || scan.images.length === 0) {
        throw new Error(`Guest scan ${scanId} has no images`);
      }

      try {
        // Load images from disk as base64
        const imagePayloads = await Promise.all(scan.images.map(async (img) => ({
          angle: img.angle,
          base64: await _readFileAsBase64(img.fileUrl),
          mimeType: _getMimeType(img.fileUrl),
        })));

        logger.info(
          'GuestScan worker: loaded %d images for scan %s',
          imagePayloads.length, scanId,
        );

        // Call AI analysis (same Gemini multi-image service)
        const aiResult = await analyzeDentalImages(imagePayloads);

        logger.info(
          'GuestScan worker: AI returned %d observations for scan %s (%dms)',
          aiResult.observations.length, scanId, aiResult.processingMs,
        );

        // Embed result directly in GuestScan document
        const observations = (aiResult.observations || []).map((obs) => ({
          type: _normalizeObservationType(obs.type),
          area: obs.area || '',
          toothNumbers: _normalizeToothNumbers(obs.toothNumbers),
          confidence: _normalizeConfidence(obs.confidence),
          description: obs.description || '',
        }));

        // Compute oral health score
        const healthScore = computeHealthScore(observations);

        scan.result = {
          observations,
          overallSummary: aiResult.overallSummary,
          recommendedSpecs: aiResult.recommendedSpecializations || [],
          healthScore,
          analysisModel: aiResult.modelVersion,
          analysisLatencyMs: aiResult.processingMs,
          tokenUsage: aiResult.tokenUsage || { promptTokens: 0, completionTokens: 0, thinkingTokens: 0, totalTokens: 0 },
        };
        scan.status = 'completed';
        scan.completedAt = new Date();
        await scan.save();

        logger.info(
          'GuestScan worker: completed scan %s (%d observations)',
          scanId, observations.length,
        );
      } catch (err) {
        logger.error(
          'GuestScan worker: scan %s failed (attempt %d) — %s',
          scanId, job.attemptsMade + 1, err.message,
        );

        const maxAttempts = job.opts.attempts || 3;
        const isFinalAttempt = job.attemptsMade >= maxAttempts - 1;

        if (isFinalAttempt) {
          // Only mark as FAILED on the last attempt — keeps status as 'processing'
          // for intermediate failures so BullMQ retries can pick the job back up
          scan.status = 'failed';
          scan.failureReason = err.message;
          await scan.save();
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
      'GuestScan worker: job %s failed (attempt %d/%d) — %s',
      job?.id, job?.attemptsMade, job?.opts?.attempts, err.message,
    );
  });

  return worker;
}

module.exports = createGuestScanWorker;
