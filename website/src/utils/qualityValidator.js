/**
 * Quality Validator — Client-side image quality analysis for dental scans.
 *
 * Implements:
 * - Blur detection (Laplacian variance)
 * - Brightness analysis (histogram)
 * - Contrast detection (standard deviation)
 * - Sharpness detection (edge detection)
 * - Overall quality scoring (weighted composite)
 *
 * @version 2.0
 * @date April 2026
 */

/**
 * @typedef {Object} QualityMetrics
 * @property {number} overall - Overall quality score (0-1, higher is better)
 * @property {number} blur - Blur score (0-1, lower is sharper)
 * @property {number} brightness - Brightness (0-1, 0.4-0.6 optimal)
 * @property {number} contrast - Contrast (0-1, higher is better)
 * @property {number} sharpness - Sharpness (0-1, higher is better)
 * @property {Object} details - Detailed analysis
 * @property {number} details.laplacianVariance - Raw Laplacian variance
 * @property {number} details.meanBrightness - Mean pixel brightness
 * @property {number} details.stdDeviation - Pixel standard deviation
 * @property {number} details.edgeStrength - Edge detection strength
 */

export class QualityValidator {
  constructor() {
    // Quality thresholds for classification
    this.thresholds = {
      blur: {
        excellent: 100,   // Laplacian variance > 100 = very sharp
        good: 50,
        acceptable: 20,
        poor: 10
      },
      brightness: {
        min: 0.3,         // Too dark
        optimal_min: 0.4,
        optimal_max: 0.6,
        max: 0.8          // Too bright
      },
      contrast: {
        excellent: 60,    // Std dev > 60 = high contrast
        good: 40,
        acceptable: 25,
        poor: 15
      },
      sharpness: {
        excellent: 0.7,   // Edge strength > 0.7 = very sharp
        good: 0.5,
        acceptable: 0.3,
        poor: 0.2
      }
    };
  }

  /**
   * Validate frame quality
   * @param {ImageData} imageData - Raw image data from canvas
   * @returns {Promise<QualityMetrics>}
   */
  async validateFrame(imageData) {
    const data = imageData.data;
    const width = imageData.width;
    const height = imageData.height;

    // Convert to grayscale for analysis
    const grayscale = this._toGrayscale(data, width, height);

    // Run all quality checks in parallel
    const [blur, brightness, contrast, sharpness] = await Promise.all([
      this._detectBlur(grayscale, width, height),
      this._checkBrightness(grayscale),
      this._checkContrast(grayscale),
      this._detectSharpness(grayscale, width, height)
    ]);

    // Calculate overall quality (weighted average)
    const overall = this._calculateOverall({
      blur: blur.normalized,
      brightness: brightness.normalized,
      contrast: contrast.normalized,
      sharpness: sharpness.normalized
    });

    return {
      overall,
      blur: blur.normalized,
      brightness: brightness.normalized,
      contrast: contrast.normalized,
      sharpness: sharpness.normalized,
      details: {
        laplacianVariance: blur.raw,
        meanBrightness: brightness.raw,
        stdDeviation: contrast.raw,
        edgeStrength: sharpness.raw
      }
    };
  }

  /**
   * Detect blur using Laplacian variance
   * @param {Uint8Array} grayscale - Grayscale pixel data
   * @param {number} width - Image width
   * @param {number} height - Image height
   * @returns {Promise<{raw: number, normalized: number}>}
   * @private
   */
  async _detectBlur(grayscale, width, height) {
    // Laplacian kernel (edge detection)
    // [ 0  1  0 ]
    // [ 1 -4  1 ]
    // [ 0  1  0 ]

    let sumSquares = 0;
    let count = 0;

    // Apply Laplacian kernel (skip border pixels)
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = y * width + x;

        const center = grayscale[idx];
        const top = grayscale[(y - 1) * width + x];
        const bottom = grayscale[(y + 1) * width + x];
        const left = grayscale[y * width + (x - 1)];
        const right = grayscale[y * width + (x + 1)];

        const laplacian = top + bottom + left + right - 4 * center;
        sumSquares += laplacian * laplacian;
        count++;
      }
    }

    const variance = count > 0 ? sumSquares / count : 0;

    // Normalize to 0-1 (inverse - lower blur score = sharper)
    // variance > 100 = excellent, < 10 = poor
    const normalized = this._normalizeInverse(
      variance,
      this.thresholds.blur.poor,
      this.thresholds.blur.excellent
    );

    return { raw: variance, normalized };
  }

  /**
   * Check brightness using histogram analysis
   * @param {Uint8Array} grayscale - Grayscale pixel data
   * @returns {Promise<{raw: number, normalized: number}>}
   * @private
   */
  async _checkBrightness(grayscale) {
    let sum = 0;
    const length = grayscale.length;

    for (let i = 0; i < length; i++) {
      sum += grayscale[i];
    }

    const mean = sum / length;
    const brightness = mean / 255; // Normalize to 0-1

    // Optimal brightness is 0.4-0.6 (not too dark, not too bright)
    let normalized;
    if (brightness < this.thresholds.brightness.optimal_min) {
      // Too dark
      normalized = brightness / this.thresholds.brightness.optimal_min;
    } else if (brightness > this.thresholds.brightness.optimal_max) {
      // Too bright
      normalized = 1 - ((brightness - this.thresholds.brightness.optimal_max) /
                        (1 - this.thresholds.brightness.optimal_max));
    } else {
      // Optimal range
      normalized = 1;
    }

    return { raw: brightness, normalized: Math.max(0, Math.min(1, normalized)) };
  }

  /**
   * Check contrast using standard deviation
   * @param {Uint8Array} grayscale - Grayscale pixel data
   * @returns {Promise<{raw: number, normalized: number}>}
   * @private
   */
  async _checkContrast(grayscale) {
    const length = grayscale.length;

    // Calculate mean
    let sum = 0;
    for (let i = 0; i < length; i++) {
      sum += grayscale[i];
    }
    const mean = sum / length;

    // Calculate standard deviation
    let sumSquaredDiff = 0;
    for (let i = 0; i < length; i++) {
      const diff = grayscale[i] - mean;
      sumSquaredDiff += diff * diff;
    }
    const stdDev = Math.sqrt(sumSquaredDiff / length);

    // Normalize to 0-1 (std dev > 60 = excellent contrast)
    const normalized = this._normalize(
      stdDev,
      this.thresholds.contrast.poor,
      this.thresholds.contrast.excellent
    );

    return { raw: stdDev, normalized };
  }

  /**
   * Detect sharpness using Sobel edge detection
   * @param {Uint8Array} grayscale - Grayscale pixel data
   * @param {number} width - Image width
   * @param {number} height - Image height
   * @returns {Promise<{raw: number, normalized: number}>}
   * @private
   */
  async _detectSharpness(grayscale, width, height) {
    // Sobel kernels for edge detection
    // Gx = [-1  0  1]    Gy = [-1 -2 -1]
    //      [-2  0  2]         [ 0  0  0]
    //      [-1  0  1]         [ 1  2  1]

    let sumEdgeStrength = 0;
    let count = 0;

    // Apply Sobel operator (skip border pixels)
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        // Get 3x3 neighborhood
        const tl = grayscale[(y - 1) * width + (x - 1)];
        const tc = grayscale[(y - 1) * width + x];
        const tr = grayscale[(y - 1) * width + (x + 1)];
        const ml = grayscale[y * width + (x - 1)];
        const mr = grayscale[y * width + (x + 1)];
        const bl = grayscale[(y + 1) * width + (x - 1)];
        const bc = grayscale[(y + 1) * width + x];
        const br = grayscale[(y + 1) * width + (x + 1)];

        // Calculate gradients
        const gx = -tl + tr - 2 * ml + 2 * mr - bl + br;
        const gy = -tl - 2 * tc - tr + bl + 2 * bc + br;

        // Edge magnitude
        const magnitude = Math.sqrt(gx * gx + gy * gy);
        sumEdgeStrength += magnitude;
        count++;
      }
    }

    const avgEdgeStrength = count > 0 ? sumEdgeStrength / count : 0;

    // Normalize to 0-1 (edge strength 0-255 range)
    const normalized = Math.min(avgEdgeStrength / 255, 1);

    return { raw: normalized, normalized };
  }

  /**
   * Calculate overall quality score (weighted)
   * @param {Object} scores - Individual normalized scores
   * @returns {number} - Overall score (0-1)
   * @private
   */
  _calculateOverall(scores) {
    // Weighted average
    const weights = {
      blur: 0.3,        // 30% - Sharpness most important
      brightness: 0.2,  // 20% - Proper exposure
      contrast: 0.2,    // 20% - Good contrast
      sharpness: 0.3    // 30% - Edge clarity
    };

    return (
      (1 - scores.blur) * weights.blur +       // Invert blur (lower is better)
      scores.brightness * weights.brightness +
      scores.contrast * weights.contrast +
      scores.sharpness * weights.sharpness
    );
  }

  /**
   * Convert RGBA to grayscale
   * @param {Uint8ClampedArray} data - RGBA pixel data
   * @param {number} width - Image width
   * @param {number} height - Image height
   * @returns {Uint8Array} - Grayscale pixel data
   * @private
   */
  _toGrayscale(data, width, height) {
    const grayscale = new Uint8Array(width * height);

    for (let i = 0, j = 0; i < data.length; i += 4, j++) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];

      // Luminosity method (weighted average)
      grayscale[j] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
    }

    return grayscale;
  }

  /**
   * Normalize value to 0-1 range
   * @param {number} value - Raw value
   * @param {number} min - Minimum threshold
   * @param {number} max - Maximum threshold
   * @returns {number} - Normalized (0-1)
   * @private
   */
  _normalize(value, min, max) {
    if (value <= min) return 0;
    if (value >= max) return 1;
    return (value - min) / (max - min);
  }

  /**
   * Normalize value to 0-1 range (inverse - lower is better)
   * @param {number} value - Raw value
   * @param {number} min - Minimum threshold
   * @param {number} max - Maximum threshold
   * @returns {number} - Normalized (0-1)
   * @private
   */
  _normalizeInverse(value, min, max) {
    if (value <= min) return 0;
    if (value >= max) return 1;
    return 1 - (value - min) / (max - min);
  }

  /**
   * Get quality classification
   * @param {number} score - Quality score (0-1)
   * @returns {string} - 'excellent' | 'good' | 'acceptable' | 'poor'
   */
  getQualityClass(score) {
    if (score >= 0.8) return 'excellent';
    if (score >= 0.65) return 'good';
    if (score >= 0.5) return 'acceptable';
    return 'poor';
  }

  /**
   * Get user-friendly feedback based on quality metrics
   * @param {QualityMetrics} metrics - Quality metrics
   * @returns {string} - Feedback message
   */
  getFeedback(metrics) {
    const issues = [];

    if (metrics.blur > 0.3) {
      issues.push('Image is blurry - hold camera steady');
    }
    if (metrics.brightness < 0.5) {
      issues.push('Image is too dark - improve lighting');
    } else if (metrics.brightness > 0.8) {
      issues.push('Image is too bright - reduce lighting');
    }
    if (metrics.contrast < 0.5) {
      issues.push('Low contrast - adjust lighting angle');
    }
    if (metrics.sharpness < 0.5) {
      issues.push('Edges not sharp - hold camera still');
    }

    if (issues.length === 0) {
      return 'Excellent quality!';
    }

    return issues.join('. ');
  }
}

/**
 * Create a quality validator instance
 * @returns {QualityValidator}
 */
export function createQualityValidator() {
  return new QualityValidator();
}
