/**
 * Multi-Frame Capture Service — Auto-capture multiple frames per position and select best quality.
 *
 * Features:
 * - Capture 3-5 frames with configurable interval (1000ms default)
 * - Real-time quality validation per frame
 * - Auto-select best quality frame
 * - Frame buffer management
 * - Progressive JPEG compression
 * - Canvas-based image processing
 *
 * @version 2.0
 * @date April 2026
 */

import { QualityValidator } from '../utils/qualityValidator';

/**
 * @typedef {Object} CaptureFrame
 * @property {number} index - Frame index (0-based)
 * @property {string} imageData - Base64 encoded image
 * @property {string} thumbnailData - Base64 encoded thumbnail (256x256)
 * @property {number} timestamp - Capture timestamp (ms)
 * @property {Object} quality - Quality metrics
 * @property {number} quality.overall - Overall quality score (0-1)
 * @property {number} quality.blur - Blur score (lower = sharper)
 * @property {number} quality.brightness - Brightness (0-1)
 * @property {number} quality.contrast - Contrast (0-1)
 * @property {number} quality.sharpness - Sharpness (0-1)
 * @property {Object|null} faceData - Face detection data (if available)
 */

/**
 * @typedef {Object} MultiFrameResult
 * @property {CaptureFrame[]} frames - All captured frames
 * @property {number} selectedFrameIndex - Index of best quality frame
 * @property {CaptureFrame} selectedFrame - Best quality frame
 * @property {number} averageQuality - Average quality across all frames
 * @property {number} captureDuration - Total capture time (ms)
 */

/**
 * @typedef {Object} CaptureConfig
 * @property {number} frameCount - Number of frames to capture (3-5)
 * @property {number} captureInterval - Interval between frames (ms)
 * @property {number} minFrameQuality - Minimum quality to accept (0-1)
 * @property {number} compressionQuality - JPEG quality (0-1, default 0.85)
 * @property {boolean} generateThumbnails - Whether to generate thumbnails
 * @property {number} thumbnailSize - Thumbnail dimension (default 256)
 */

export class MultiFrameCaptureService {
  /**
   * @param {HTMLVideoElement} videoElement - Video stream element
   */
  constructor(videoElement) {
    this.videoElement = videoElement;
    this.qualityValidator = new QualityValidator();
    this.frameBuffer = [];
    this.isCapturing = false;
    this.captureStartTime = 0;

    // Canvas for image processing (created lazily)
    this.canvas = null;
    this.ctx = null;
    this.thumbnailCanvas = null;
    this.thumbnailCtx = null;
  }

  /**
   * Initialize canvas elements for image processing
   * @private
   */
  _initializeCanvas() {
    if (!this.canvas) {
      this.canvas = document.createElement('canvas');
      this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    }
    if (!this.thumbnailCanvas) {
      this.thumbnailCanvas = document.createElement('canvas');
      this.thumbnailCtx = this.thumbnailCanvas.getContext('2d', { willReadFrequently: true });
    }
  }

  /**
   * Capture a single frame from video stream
   * @param {number} frameIndex - Frame index
   * @param {CaptureConfig} config - Capture configuration
   * @returns {Promise<CaptureFrame>}
   * @private
   */
  async _captureFrame(frameIndex, config) {
    this._initializeCanvas();

    // Set canvas size to video dimensions
    const width = this.videoElement.videoWidth;
    const height = this.videoElement.videoHeight;
    this.canvas.width = width;
    this.canvas.height = height;

    // Draw current video frame to canvas
    this.ctx.drawImage(this.videoElement, 0, 0, width, height);

    // Get full-quality image data
    const imageData = this.canvas.toDataURL('image/jpeg', config.compressionQuality);

    // Generate thumbnail if requested
    let thumbnailData = null;
    if (config.generateThumbnails) {
      const thumbSize = config.thumbnailSize || 256;
      this.thumbnailCanvas.width = thumbSize;
      this.thumbnailCanvas.height = thumbSize;

      // Calculate crop dimensions (center crop)
      const scale = Math.max(thumbSize / width, thumbSize / height);
      const scaledWidth = width * scale;
      const scaledHeight = height * scale;
      const offsetX = (thumbSize - scaledWidth) / 2;
      const offsetY = (thumbSize - scaledHeight) / 2;

      this.thumbnailCtx.drawImage(
        this.canvas,
        0, 0, width, height,
        offsetX, offsetY, scaledWidth, scaledHeight
      );

      thumbnailData = this.thumbnailCanvas.toDataURL('image/jpeg', 0.7);
    }

    // Get raw pixel data for quality analysis
    const rawImageData = this.ctx.getImageData(0, 0, width, height);

    // Validate quality
    const quality = await this.qualityValidator.validateFrame(rawImageData);

    return {
      index: frameIndex,
      imageData,
      thumbnailData,
      timestamp: Date.now(),
      quality,
      faceData: null, // Will be populated by face detector if available
    };
  }

  /**
   * Capture multiple frames for a position
   * @param {CaptureConfig} config - Capture configuration
   * @param {Function} [onFrameCaptured] - Callback after each frame (frame, progress)
   * @returns {Promise<MultiFrameResult>}
   */
  async capturePosition(config, onFrameCaptured = null) {
    if (this.isCapturing) {
      throw new Error('Capture already in progress');
    }

    // Validate config
    const finalConfig = {
      frameCount: config.frameCount || 3,
      captureInterval: config.captureInterval || 1000,
      minFrameQuality: config.minFrameQuality || 0.5,
      compressionQuality: config.compressionQuality ?? 0.85,
      generateThumbnails: config.generateThumbnails ?? true,
      thumbnailSize: config.thumbnailSize || 256,
    };

    if (finalConfig.frameCount < 1 || finalConfig.frameCount > 10) {
      throw new Error('Frame count must be between 1 and 10');
    }

    this.isCapturing = true;
    this.captureStartTime = Date.now();
    this.frameBuffer = [];

    try {
      // Capture frames sequentially with interval
      for (let i = 0; i < finalConfig.frameCount; i++) {
        // Capture frame
        const frame = await this._captureFrame(i, finalConfig);
        this.frameBuffer.push(frame);

        // Notify progress
        if (onFrameCaptured) {
          const progress = ((i + 1) / finalConfig.frameCount) * 100;
          onFrameCaptured(frame, progress);
        }

        // Wait for interval (except after last frame)
        if (i < finalConfig.frameCount - 1) {
          await this._sleep(finalConfig.captureInterval);
        }
      }

      // Select best frame
      const selectedFrameIndex = this._selectBestFrame(this.frameBuffer, finalConfig);
      const selectedFrame = this.frameBuffer[selectedFrameIndex];

      // Calculate average quality
      const averageQuality = this.frameBuffer.reduce(
        (sum, frame) => sum + frame.quality.overall,
        0
      ) / this.frameBuffer.length;

      const captureDuration = Date.now() - this.captureStartTime;

      return {
        frames: [...this.frameBuffer],
        selectedFrameIndex,
        selectedFrame,
        averageQuality,
        captureDuration,
      };

    } catch (error) {
      console.error('[MultiFrameCapture] Capture failed:', error);
      throw error;
    } finally {
      this.isCapturing = false;
    }
  }

  /**
   * Select best quality frame from buffer
   * @param {CaptureFrame[]} frames - Captured frames
   * @param {CaptureConfig} config - Capture configuration
   * @returns {number} - Index of best frame
   * @private
   */
  _selectBestFrame(frames, config) {
    if (frames.length === 0) {
      throw new Error('No frames to select from');
    }

    if (frames.length === 1) {
      return 0;
    }

    // Filter frames that meet minimum quality
    const validFrames = frames.filter(
      frame => frame.quality.overall >= config.minFrameQuality
    );

    // If no frames meet minimum, select highest quality anyway
    if (validFrames.length === 0) {
      console.warn('[MultiFrameCapture] No frames meet minimum quality, selecting best available');
      return this._findHighestQualityIndex(frames);
    }

    // Scoring algorithm (weighted)
    const scores = validFrames.map(frame => {
      return (
        frame.quality.overall * 0.4 +        // Overall quality (40%)
        frame.quality.sharpness * 0.3 +      // Sharpness (30%)
        (1 - frame.quality.blur) * 0.2 +     // Low blur (20%)
        frame.quality.contrast * 0.1         // Contrast (10%)
      );
    });

    // Find highest scoring frame
    let bestIndex = 0;
    let bestScore = scores[0];
    for (let i = 1; i < scores.length; i++) {
      if (scores[i] > bestScore) {
        bestScore = scores[i];
        bestIndex = i;
      }
    }

    // Map back to original frame index
    return frames.indexOf(validFrames[bestIndex]);
  }

  /**
   * Find index of highest quality frame
   * @param {CaptureFrame[]} frames
   * @returns {number}
   * @private
   */
  _findHighestQualityIndex(frames) {
    let bestIndex = 0;
    let bestQuality = frames[0].quality.overall;
    for (let i = 1; i < frames.length; i++) {
      if (frames[i].quality.overall > bestQuality) {
        bestQuality = frames[i].quality.overall;
        bestIndex = i;
      }
    }
    return bestIndex;
  }

  /**
   * Get current frame buffer
   * @returns {CaptureFrame[]}
   */
  getFrameBuffer() {
    return [...this.frameBuffer];
  }

  /**
   * Clear frame buffer
   */
  clearBuffer() {
    this.frameBuffer = [];
  }

  /**
   * Check if currently capturing
   * @returns {boolean}
   */
  isCurrentlyCapturing() {
    return this.isCapturing;
  }

  /**
   * Get estimated time remaining for current capture
   * @param {number} frameCount - Total frames to capture
   * @param {number} captureInterval - Interval between frames (ms)
   * @returns {number} - Estimated time remaining (ms)
   */
  getEstimatedTimeRemaining(frameCount, captureInterval) {
    if (!this.isCapturing) {
      return 0;
    }
    const framesRemaining = frameCount - this.frameBuffer.length;
    return framesRemaining * captureInterval;
  }

  /**
   * Cancel ongoing capture
   */
  cancelCapture() {
    if (this.isCapturing) {
      this.isCapturing = false;
      console.log('[MultiFrameCapture] Capture cancelled');
    }
  }

  /**
   * Sleep utility
   * @param {number} ms - Milliseconds to sleep
   * @returns {Promise<void>}
   * @private
   */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(() => resolve(), ms));
  }

  /**
   * Cleanup resources
   */
  dispose() {
    this.cancelCapture();
    this.clearBuffer();
    this.canvas = null;
    this.ctx = null;
    this.thumbnailCanvas = null;
    this.thumbnailCtx = null;
    this.qualityValidator = null;
  }
}

/**
 * Create a multi-frame capture service instance
 * @param {HTMLVideoElement} videoElement - Video stream element
 * @returns {MultiFrameCaptureService}
 */
export function createMultiFrameCaptureService(videoElement) {
  return new MultiFrameCaptureService(videoElement);
}
