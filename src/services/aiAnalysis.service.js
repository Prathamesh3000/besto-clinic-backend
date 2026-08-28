'use strict';

const { GoogleGenerativeAI } = require('@google/generative-ai');
const logger = require('../utils/logger');

let _genAI = null;
function _getGenAI() {
  if (!_genAI) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY is not set');
    _genAI = new GoogleGenerativeAI(apiKey);
  }
  return _genAI;
}

/**
 * Extract JSON from a Gemini response that may contain markdown code blocks
 * or surrounding text.
 */
function _extractJSON(responseText) {
  const trimmed = responseText.trim();

  // Try 1: direct parse (clean response)
  try {
    return JSON.parse(trimmed);
  } catch { /* continue */ }

  // Try 2: strip markdown code block wrapper (complete block)
  const codeBlockMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    try {
      return JSON.parse(codeBlockMatch[1].trim());
    } catch { /* continue */ }
  }

  // Try 2b: strip UNCLOSED markdown code block (truncated by token limit)
  const unclosedBlockMatch = trimmed.match(/```(?:json)?\s*([\s\S]*)/);
  const jsonCandidate = unclosedBlockMatch ? unclosedBlockMatch[1].trim() : trimmed;

  // Try 3: find first { ... } JSON object in the response
  const firstBrace = jsonCandidate.indexOf('{');
  const lastBrace = jsonCandidate.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try {
      return JSON.parse(jsonCandidate.substring(firstBrace, lastBrace + 1));
    } catch { /* continue */ }
  }

  // Try 4: JSON truncated by token limit — repair by building correct closing sequence
  if (firstBrace !== -1) {
    let candidate = jsonCandidate.substring(firstBrace);

    // Close any open string (odd number of unescaped quotes)
    const quoteCount = (candidate.match(/(?<!\\)"/g) || []).length;
    if (quoteCount % 2 !== 0) {
      // Truncate back to last complete key-value pair for cleaner repair
      const lastCompleteQuote = candidate.lastIndexOf('"');
      if (lastCompleteQuote > 0) {
        candidate = candidate.substring(0, lastCompleteQuote + 1);
      }
      // Recount after trim
      const newCount = (candidate.match(/(?<!\\)"/g) || []).length;
      if (newCount % 2 !== 0) candidate += '"';
    }

    // Remove any trailing comma before we close brackets
    candidate = candidate.replace(/,\s*$/, '');

    // Build closing sequence by tracking bracket/brace stack order
    const stack = [];
    let inString = false;
    let escaped = false;
    for (let i = 0; i < candidate.length; i++) {
      const ch = candidate[i];
      if (escaped) { escaped = false; continue; }
      if (ch === '\\' && inString) { escaped = true; continue; }
      if (ch === '"') { inString = !inString; continue; }
      if (inString) continue;
      if (ch === '{') stack.push('}');
      else if (ch === '[') stack.push(']');
      else if (ch === '}' || ch === ']') stack.pop();
    }

    // Close in reverse order (correct nesting)
    candidate += stack.reverse().join('');

    try {
      return JSON.parse(candidate);
    } catch { /* continue */ }

    // Try 5: more aggressive — strip back to last complete value, then close
    const lastGoodComma = candidate.lastIndexOf(',');
    if (lastGoodComma > 0) {
      let stripped = candidate.substring(0, lastGoodComma);
      const stack2 = [];
      let inStr2 = false;
      let esc2 = false;
      for (let i = 0; i < stripped.length; i++) {
        const ch = stripped[i];
        if (esc2) { esc2 = false; continue; }
        if (ch === '\\' && inStr2) { esc2 = true; continue; }
        if (ch === '"') { inStr2 = !inStr2; continue; }
        if (inStr2) continue;
        if (ch === '{') stack2.push('}');
        else if (ch === '[') stack2.push(']');
        else if (ch === '}' || ch === ']') stack2.pop();
      }
      stripped += stack2.reverse().join('');
      try {
        return JSON.parse(stripped);
      } catch { /* continue */ }
    }
  }

  return null;
}

const DENTAL_ANALYSIS_PROMPT = `You are a dental image analysis assistant integrated into a dental clinic management system.

Analyze the provided intraoral/dental photograph and produce a structured clinical observation report.

CHECK FOR EACH:
1. Caries/Cavities — dark spots, discoloration on tooth surfaces, visible decay
2. Plaque & Calculus — yellow/brown deposits, tartar along gum line
3. Gingival Health — redness, swelling, recession, bleeding signs
4. Tooth Integrity — chips, cracks, fractures, erosion, worn enamel
5. Alignment — crowding, spacing, malocclusion, rotation
6. Discoloration — staining (extrinsic/intrinsic), whiteness irregularities
7. Missing Teeth — gaps, edentulous areas
8. Restorations — existing fillings, crowns, bridges and their condition
9. Soft Tissue — ulcers, lesions, unusual growths on tongue/cheeks/palate
10. Orthodontic — braces, retainers, aligners if visible

SEVERITY: "low" (monitor next visit) | "moderate" (address within 1-3 months) | "high" (needs prompt attention) | "critical" (immediate attention)

IMAGE QUALITY: If blurry, poorly lit, or not a dental image, return empty findings with a summary explaining the issue.

RESPOND WITH ONLY THIS JSON:
{
  "findings": [
    {
      "condition": "dental condition name",
      "confidence": 0.0,
      "severity": "low | moderate | high | critical",
      "location": "tooth number/area (e.g. upper right molar, lower anterior)",
      "description": "brief patient-friendly explanation"
    }
  ],
  "summary": "2-3 sentence plain-language summary for the patient. Always recommend professional dental consultation."
}

RULES:
- Only report what you can ACTUALLY SEE in the image
- Never fabricate findings — if unsure, use low confidence
- If no issues found, return empty findings array with a positive summary
- Use FDI tooth numbering when possible`;

/**
 * Analyze a dental image using Gemini 2.5 Flash vision.
 * @param {string} base64Image - base64-encoded image data (no data: prefix)
 * @param {string} mimeType - e.g. 'image/jpeg', 'image/png'
 * @returns {Promise<{ findings: Array, summary: string, rawResponse: string, modelVersion: string, processingMs: number }>}
 */
async function analyzeDentalImage(base64Image, mimeType) {
  const startMs = Date.now();
  const genAI = _getGenAI();
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

  const result = await model.generateContent([
    DENTAL_ANALYSIS_PROMPT,
    {
      inlineData: {
        data: base64Image,
        mimeType: mimeType || 'image/jpeg',
      },
    },
  ]);

  const responseText = result.response.text();
  const processingMs = Date.now() - startMs;

  // Parse JSON — robust extraction handles code blocks and surrounding text
  const parsed = _extractJSON(responseText);
  if (!parsed) {
    logger.error('Failed to parse Gemini response — raw (%d chars): %s', responseText.length, responseText.substring(0, 300));
    throw new Error('AI analysis returned invalid response format');
  }

  return {
    findings: parsed.findings || [],
    summary: parsed.summary || 'Analysis complete. Please consult your dentist for a professional evaluation.',
    rawResponse: responseText,
    modelVersion: 'gemini-2.5-flash',
    processingMs,
  };
}

// ── Multi-image analysis for dental scan ─────

/** Check if images represent a guided 3-position scan (left, front, right + optional tongue) */
function _is3PosGuided(images) {
  const angles = images.map((img) => img.angle);
  return ['left', 'front', 'right'].every((a) => angles.includes(a));
}

/** Check if the image set includes a tongue capture */
function _hasTongueAngle(images) {
  return images.some((img) => img.angle === 'tongue');
}

/**
 * Build a dynamic prompt based on the actual number of images provided.
 */
function _buildMultiImagePrompt(images) {
  const count = images.length;
  const angleList = images.map((img) => img.angle).join(', ');

  return `You are a dental image analysis assistant integrated into a dental clinic management system.

IMPORTANT: This is a SINGLE, COMPLETE request. ALL ${count} dental image(s) are provided below in this message. Do NOT wait for more images. Analyze what is provided and respond immediately with JSON.

You are given ${count} intraoral/dental photograph${count > 1 ? 's' : ''} from the following angle${count > 1 ? 's' : ''}: ${angleList}.

Analyze ${count > 1 ? 'ALL images together' : 'the image'} to produce a comprehensive clinical observation report.

CHECK FOR EACH:
1. Caries/Cavities — dark spots, discoloration on tooth surfaces, visible decay
2. Plaque & Calculus — yellow/brown deposits, tartar along gum line
3. Gingival Health — redness, swelling, recession, bleeding signs
4. Tooth Integrity — chips, cracks, fractures, erosion, worn enamel
5. Alignment — crowding, spacing, malocclusion, rotation
6. Discoloration — staining (extrinsic/intrinsic), whiteness irregularities
7. Missing Teeth — gaps, edentulous areas
8. Restorations — existing fillings, crowns, bridges and their condition
9. Soft Tissue — ulcers, lesions, unusual growths on tongue/cheeks/palate
10. Orthodontic — braces, retainers, aligners if visible

OBSERVATION TYPES (use ONLY these): "plaque" | "inflammation" | "discoloration" | "misalignment" | "cavity" | "gum_recession" | "other"
CONFIDENCE: "low" | "medium" | "high"

IMAGE QUALITY: If any image is blurry or poorly lit, note it in the summary but still analyze remaining images.

YOU MUST RESPOND WITH ONLY THIS JSON (no other text before or after):
{
  "observations": [
    {
      "type": "one of the observation types above",
      "area": "descriptive area (e.g. upper right molars, lower anterior, upper jaw)",
      "toothNumbers": [11, 12],
      "confidence": "low | medium | high",
      "description": "brief patient-friendly explanation of the finding"
    }
  ],
  "overallSummary": "3-5 sentence plain-language summary for the patient covering all findings. Always recommend professional dental consultation.",
  "recommendedSpecializations": ["General Dentistry", "Orthodontics"]
}

SPECIALIZATION OPTIONS: "General Dentistry" | "Periodontics" | "Orthodontics" | "Cosmetic Dentistry" | "Endodontics" | "Oral Surgery" | "Prosthodontics" | "Pediatric Dentistry"

RULES:
- Only report what you can ACTUALLY SEE in the images
- Never fabricate findings — if unsure, use low confidence
- If no issues found, return empty observations array with a positive summary
- Use FDI tooth numbering (ISO 3950): Q1 Upper Right = 11-18, Q2 Upper Left = 21-28, Q3 Lower Left = 31-38, Q4 Lower Right = 41-48. Each tooth number is two digits: [quadrant 1-4][tooth position 1-8]. Do NOT use US Universal (1-32) numbering.
- Recommend specializations based on the findings — include "General Dentistry" if any routine issues exist
${count > 1 ? '- Cross-reference findings across angles for higher confidence' : ''}
${_is3PosGuided(images) ? '- POSITION-TO-QUADRANT GUIDE: LEFT image (patient\'s head turned right) shows Q2 (upper left 21-28) + Q3 (lower left 31-38). FRONT image shows anterior teeth: Q1 (12,11), Q2 (21,22), Q3 (31,32), Q4 (41,42). RIGHT image (patient\'s head turned left) shows Q1 (upper right 11-18) + Q4 (lower right 41-48).' : ''}
${_hasTongueAngle(images) ? `- TONGUE IMAGE ANALYSIS: The TONGUE image shows the patient's tongue extended toward the camera. Analyze it thoroughly for:
  • Coating — white, yellow, or brown tongue coating indicating oral hygiene issues or infection
  • Discoloration — unusual color changes (use type "discoloration" with area "Tongue")
  • Lesions or ulcers — sores, bumps, or patches (use type "other" with area "Tongue")
  • Inflammation — swelling or redness (use type "inflammation" with area "Tongue")
  • Geographic tongue — irregular patches on the tongue surface
  • Oral thrush — white patches that may indicate fungal infection
  For tongue findings, set area to "Tongue" and leave toothNumbers as an empty array []. This image is CRITICAL for soft tissue evaluation — do NOT skip analyzing it.` : ''}
- RESPOND WITH ONLY VALID JSON — no explanations, no markdown, no commentary`;
}

/**
 * Analyze multiple dental images (1-5 angle scan) using Gemini 2.5 Flash vision.
 * @param {{ angle: string, base64: string, mimeType: string }[]} images - array of image objects
 * @returns {Promise<{ observations: Array, overallSummary: string, recommendedSpecializations: string[], rawResponse: string, modelVersion: string, processingMs: number }>}
 */
async function analyzeDentalImages(images) {
  const startMs = Date.now();
  const genAI = _getGenAI();
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

  // Build content parts: dynamic prompt + all images provided together
  const prompt = _buildMultiImagePrompt(images);
  const parts = [prompt];

  // Add all images with angle labels
  for (const img of images) {
    parts.push({ text: `[${img.angle.toUpperCase()} angle]` });
    parts.push({
      inlineData: {
        data: img.base64,
        mimeType: img.mimeType || 'image/jpeg',
      },
    });
  }

  // Append a final instruction after all images to reinforce JSON-only response
  parts.push({ text: `All ${images.length} image(s) are above. Now respond with ONLY the JSON object as specified.` });

  const result = await model.generateContent(parts);
  const responseText = result.response.text();
  const processingMs = Date.now() - startMs;

  // Extract token usage metadata from Gemini response
  const usage = result.response.usageMetadata;
  logger.info(
    'Gemini token usage — prompt: %d, completion: %d, thinking: %d, total: %d (%dms)',
    usage?.promptTokenCount || 0, usage?.candidatesTokenCount || 0,
    usage?.thoughtsTokenCount || 0, usage?.totalTokenCount || 0, processingMs,
  );

  // Parse JSON — robust extraction handles code blocks and surrounding text
  const parsed = _extractJSON(responseText);
  if (!parsed) {
    logger.error(
      'Failed to parse Gemini multi-image response — raw (%d chars): %s',
      responseText.length, responseText.substring(0, 300),
    );
    throw new Error('AI analysis returned invalid response format');
  }

  return {
    observations: parsed.observations || [],
    overallSummary: parsed.overallSummary || 'Analysis complete. Please consult your dentist for a professional evaluation.',
    recommendedSpecializations: parsed.recommendedSpecializations || [],
    rawResponse: responseText,
    modelVersion: 'gemini-2.5-flash',
    processingMs,
    tokenUsage: {
      promptTokens: usage?.promptTokenCount || 0,
      completionTokens: usage?.candidatesTokenCount || 0,
      thinkingTokens: usage?.thoughtsTokenCount || 0,
      totalTokens: usage?.totalTokenCount || 0,
    },
  };
}

// ── Lightweight frame validation for immersive scanner ─────

const VALIDATE_FRAME_PROMPT_TEMPLATE = `Validate dental scan photo. Expected: {ANGLE} angle.

Check: (1) Head orientation correct? (left=turned right 30-45°, front=direct, right=turned left 30-45°) (2) Teeth visible + open? (3) Not blurred?

JSON only: {"valid":true,"feedback":"Perfect position!","confidence":0.85,"headOrientation":"correct","teethVisible":true,"imageQuality":"good"}

BE FAST - real-time validation.`;

/**
 * Validate a single dental frame for correct angle/quality.
 * Uses a minimal prompt for fast Gemini response (~0.5-1.5s).
 * @param {string} base64Image - base64-encoded image data
 * @param {string} mimeType - e.g. 'image/jpeg'
 * @param {string} expectedAngle - 'left' | 'front' | 'right'
 * @returns {Promise<{ valid: boolean, feedback: string, confidence: number }>}
 */
async function validateDentalFrame(base64Image, mimeType, expectedAngle) {
  const startMs = Date.now();
  const genAI = _getGenAI();
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

  const prompt = VALIDATE_FRAME_PROMPT_TEMPLATE.replace(/\{ANGLE\}/g, expectedAngle);

  const result = await model.generateContent([
    prompt,
    {
      inlineData: {
        data: base64Image,
        mimeType: mimeType || 'image/jpeg',
      },
    },
  ]);

  const responseText = result.response.text();
  const processingMs = Date.now() - startMs;

  logger.info('Frame validation for "%s" completed in %dms', expectedAngle, processingMs);

  const parsed = _extractJSON(responseText);
  if (!parsed) {
    logger.warn('Frame validation returned unparseable response, defaulting to valid');
    return {
      valid: true,
      feedback: 'Unable to verify — proceeding with capture.',
      confidence: 0.5,
      headOrientation: 'unknown',
      teethVisible: true,
      imageQuality: 'unknown',
    };
  }

  return {
    valid: !!parsed.valid,
    feedback: parsed.feedback || (parsed.valid ? 'Perfect position!' : 'Please adjust your position.'),
    confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
    headOrientation: parsed.headOrientation || 'unknown',
    teethVisible: !!parsed.teethVisible,
    imageQuality: parsed.imageQuality || 'unknown',
  };
}

// ── Per-angle tooth detection ─────

const DETECT_TEETH_PROMPT_TEMPLATE = `You are analyzing a dental photo taken from the {ANGLE} angle.

Identify ALL visible teeth using FDI notation (11-48):
- FDI Quadrants: Q1=Upper Right (11-18), Q2=Upper Left (21-28), Q3=Lower Left (31-38), Q4=Lower Right (41-48)
- {ANGLE} angle expected visibility:
  • LEFT (patient turned right): Primarily Q2 + Q3 (left side teeth)
  • FRONT (facing camera): Primarily anterior teeth from all quadrants (11,12,21,22,31,32,41,42 + visible incisors/canines)
  • RIGHT (patient turned left): Primarily Q1 + Q4 (right side teeth)

Respond ONLY with JSON:
{
  "teethVisible": [21,22,23,...],
  "quadrants": ["Q2","Q3"],
  "confidence": 0.9,
  "qualityScore": 85
}

RULES:
- Only list teeth you can ACTUALLY see (even partially)
- Use FDI numbering ONLY (two-digit numbers like 11, 21, 31, 41)
- Quality score: 0-100 based on blur, lighting, focus
- Confidence: 0.0-1.0 based on certainty of tooth identification`;

/**
 * Detect which teeth are visible in a specific angle scan.
 * Used for per-angle tooth number identification during capture.
 * @param {string} base64Image - base64-encoded image data
 * @param {string} mimeType - e.g. 'image/jpeg'
 * @param {string} angle - 'left' | 'front' | 'right'
 * @returns {Promise<{ teethVisible: number[], quadrants: string[], confidence: number, qualityScore: number }>}
 */
async function detectTeethInFrame(base64Image, mimeType, angle) {
  const startMs = Date.now();
  const genAI = _getGenAI();
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

  const prompt = DETECT_TEETH_PROMPT_TEMPLATE.replace(/\{ANGLE\}/g, angle);

  const result = await model.generateContent([
    prompt,
    {
      inlineData: {
        data: base64Image,
        mimeType: mimeType || 'image/jpeg',
      },
    },
  ]);

  const responseText = result.response.text();
  const processingMs = Date.now() - startMs;

  logger.info('Teeth detection for "%s" angle completed in %dms', angle, processingMs);

  const parsed = _extractJSON(responseText);
  if (!parsed) {
    logger.warn('Teeth detection returned unparseable response, defaulting to empty');
    return { teethVisible: [], quadrants: [], confidence: 0, qualityScore: 0 };
  }

  return {
    teethVisible: Array.isArray(parsed.teethVisible) ? parsed.teethVisible : [],
    quadrants: Array.isArray(parsed.quadrants) ? parsed.quadrants : [],
    confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0,
    qualityScore: typeof parsed.qualityScore === 'number' ? parsed.qualityScore : 0,
  };
}

// ── Prescription handwriting parser ─────

const PRESCRIPTION_TRANSCRIPTION_PROMPT = `You are an expert medical prescription parser. You will receive a photograph of a medical/dental prescription pad.

CRITICAL INSTRUCTIONS — WHAT TO IGNORE:
- IGNORE all printed clinic headers, logos, clinic names, addresses, phone numbers
- IGNORE printed doctor credentials (MBBS, MD, etc.) in the header
- IGNORE pre-printed letterhead text in ANY language (Bengali, Hindi, English, Arabic, etc.)
- IGNORE printed footer text, registration numbers, printed watermarks
- IGNORE blank/empty areas of the prescription

FOCUS ONLY ON:
- Handwritten content (the actual prescription body)
- Content in the CENTER and LOWER portion of the image (where doctors write)
- Handwritten patient name, date, symptoms, diagnosis, medications, advice

YOUR EXTRACTION TASK:
1. Identify handwritten patient details (name, age, date) if present
2. Extract complaints/symptoms written by the doctor
3. Extract diagnosis if written
4. Extract ALL medications with dosage, frequency, and duration
5. Extract any advice or follow-up instructions
6. Detect language(s) of the handwritten content

EXPAND MEDICAL ABBREVIATIONS:
- OD → Once daily
- BD → Twice daily
- TDS → Three times daily
- QID → Four times daily
- SOS → As needed
- AC → Before meals
- PC → After meals
- HS → At bedtime
- Stat → Immediately
- Tab → Tablet
- Cap → Capsule
- Syr → Syrup
- Inj → Injection
- ml → milliliters

RESPOND WITH ONLY THIS JSON (keep it concise, under 3000 chars):
{
  "transcription": "Clean formatted text of ALL handwritten content only (single newlines between lines)",
  "detectedLanguages": ["English"],
  "medications": [
    {
      "name": "Corrected medicine name",
      "dosage": "e.g. 500mg, 5ml",
      "frequency": "Expanded form (e.g. Twice daily after meals)",
      "duration": "e.g. 5 days, 2 weeks",
      "notes": "Special instructions if any"
    }
  ],
  "patientName": "if handwritten, else null",
  "doctorName": "if handwritten/signed, else null",
  "date": "if handwritten, else null",
  "complaints": "Patient complaints/symptoms if written",
  "diagnosis": "Diagnosis if written, else null",
  "advice": "Follow-up advice if written, else null",
  "confidence": "low | medium | high",
  "imageQuality": "good | fair | poor",
  "notes": "Any illegible sections or difficulties"
}

RULES:
- Extract ONLY handwritten content — never transcribe printed letterhead
- Correct obvious medicine name spelling (e.g. "Amoxcilin" → "Amoxicillin")
- If a word is truly unreadable, mark as "(uncertain)"
- Expand ALL frequency abbreviations to full readable form
- medications array can be empty if no medicines are identifiable
- Do NOT hallucinate — only report what you can actually read
- If the image is not a prescription, set confidence to "low" and explain in notes
- Keep the entire response CONCISE — no excessive whitespace or padding`;

/**
 * Analyze a prescription image — transcribe handwritten text using Gemini vision.
 * @param {string} base64Image - base64-encoded image data (no data: prefix)
 * @param {string} mimeType - e.g. 'image/jpeg', 'image/png'
 * @returns {Promise<Object>} transcription result
 */
async function analyzePrescriptionImage(base64Image, mimeType) {
  const startMs = Date.now();
  const genAI = _getGenAI();

  const safetySettings = [
    { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
    { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
    { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
    { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
  ];

  const contentParts = [
    PRESCRIPTION_TRANSCRIPTION_PROMPT,
    { inlineData: { data: base64Image, mimeType: mimeType || 'image/jpeg' } },
  ];

  // Model chain — multiple models with separate capacity pools on free tier
  // Each model has its own rate limit, so if one is overloaded another may respond
  const MODELS = ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.5-pro'];
  const MAX_RETRIES_PER_MODEL = 3;
  const BACKOFF_DELAYS_MS = [4000, 8000, 12000]; // 4s, 8s, 12s — generous backoff
  let result;
  let usedModel;

  outer:
  for (const modelName of MODELS) {
    for (let attempt = 1; attempt <= MAX_RETRIES_PER_MODEL; attempt++) {
      try {
        // gemini-2.5-flash/pro are "thinking" models — maxOutputTokens includes BOTH
        // internal reasoning tokens AND visible output tokens. 4096 is far too low —
        // the model uses ~3000-6000 tokens thinking, leaving nothing for the JSON output.
        // 65536 gives ample room for reasoning + a complete structured JSON response.
        const model = genAI.getGenerativeModel({
          model: modelName,
          safetySettings,
          generationConfig: { maxOutputTokens: 65536, temperature: 0.2 },
        });
        result = await model.generateContent(contentParts);
        usedModel = modelName;
        break outer;
      } catch (err) {
        const errMsg = err.message || '';
        const isTransient = errMsg.includes('503') || errMsg.includes('overloaded')
          || errMsg.includes('high demand') || errMsg.includes('Resource has been exhausted')
          || errMsg.includes('RESOURCE_EXHAUSTED') || errMsg.includes('429');
        const isModelGone = errMsg.includes('404') || errMsg.includes('no longer available')
          || errMsg.includes('is not found') || errMsg.includes('not supported');

        // Model deprecated/removed — skip to next model immediately
        if (isModelGone) {
          logger.warn('Prescription scan — model %s unavailable (404), skipping', modelName);
          break;
        }

        // Transient 503/429 — retry with increasing backoff
        if (isTransient && attempt < MAX_RETRIES_PER_MODEL) {
          const delayMs = BACKOFF_DELAYS_MS[attempt - 1] || 8000;
          logger.warn('Prescription scan — %s attempt %d/%d overloaded, retrying in %dms',
            modelName, attempt, MAX_RETRIES_PER_MODEL, delayMs);
          await new Promise((r) => { setTimeout(r, delayMs); });
          continue;
        }

        // Exhausted retries for this model — try next
        if (modelName !== MODELS[MODELS.length - 1]) {
          logger.warn('Prescription scan — %s exhausted retries, moving to next model', modelName);
          break;
        }

        // All models exhausted
        throw new Error(
          'AI service is experiencing high demand. Please wait 30 seconds and try again.',
        );
      }
    }
  }

  if (!result) {
    throw new Error('All AI models unavailable. Please wait 30 seconds and try again.');
  }

  // Check if response was blocked by safety filters
  const response = result.response;
  if (!response.candidates || response.candidates.length === 0) {
    const blockReason = response.promptFeedback?.blockReason;
    logger.error('Prescription scan blocked by Gemini — reason: %s', blockReason || 'unknown');
    throw new Error(`AI response blocked: ${blockReason || 'no candidates returned'}`);
  }

  let responseText;
  try {
    responseText = response.text();
  } catch (textErr) {
    logger.error('Prescription scan — failed to extract text from response: %s, finishReason: %s',
      textErr.message, response.candidates[0]?.finishReason);
    throw new Error(`AI response extraction failed: ${response.candidates[0]?.finishReason || textErr.message}`);
  }

  const processingMs = Date.now() - startMs;
  const finishReason = response.candidates[0]?.finishReason;

  logger.info('Prescription scan completed in %dms via %s (raw %d chars, finishReason: %s)',
    processingMs, usedModel, responseText.length, finishReason);

  // Warn if response was truncated by token limit — _extractJSON repair will attempt recovery
  if (finishReason === 'MAX_TOKENS') {
    logger.warn('Prescription scan response truncated (MAX_TOKENS) — attempting JSON repair');
  }

  // Debug: log raw response (truncated) for troubleshooting
  logger.debug('Prescription raw response: %s', responseText.substring(0, 1000));

  // Clean up bloated responses — collapse 3+ consecutive newlines into 2, trim overall
  const cleanedText = responseText.replace(/\n{3,}/g, '\n\n').trim();

  const parsed = _extractJSON(cleanedText);
  if (!parsed) {
    logger.error(
      'Failed to parse Gemini prescription response — raw (%d chars): %s',
      cleanedText.length, cleanedText.substring(0, 500),
    );
    throw new Error('AI transcription returned invalid response format');
  }

  return {
    transcription: parsed.transcription || '',
    detectedLanguages: Array.isArray(parsed.detectedLanguages) ? parsed.detectedLanguages : [],
    medications: Array.isArray(parsed.medications) ? parsed.medications : [],
    patientName: parsed.patientName || parsed.patient_name || null,
    doctorName: parsed.doctorName || null,
    date: parsed.date || null,
    complaints: parsed.complaints || null,
    diagnosis: parsed.diagnosis || null,
    advice: parsed.advice || null,
    confidence: ['low', 'medium', 'high'].includes(parsed.confidence) ? parsed.confidence : 'low',
    imageQuality: ['good', 'fair', 'poor'].includes(parsed.imageQuality) ? parsed.imageQuality : 'fair',
    notes: parsed.notes || null,
    modelVersion: usedModel,
    processingMs,
  };
}

/**
 * Translate prescription text to a target language using Gemini.
 * Uses multi-model fallback (same as analyzePrescriptionImage) to handle 503 spikes.
 * @param {string} text - the transcribed prescription text
 * @param {string} targetLanguage - e.g. 'English', 'Hindi', 'Marathi'
 * @returns {Promise<{ translatedText: string, sourceLanguages: string[], targetLanguage: string }>}
 */
async function translatePrescriptionText(text, targetLanguage) {
  const startMs = Date.now();
  const genAI = _getGenAI();

  const prompt = `Translate the following prescription text to ${targetLanguage}.
Preserve the formatting (line breaks, sections). For medication names, keep the original name and add the translation in parentheses if applicable.
Medical/pharmaceutical terms should remain in their standard form.

Text to translate:
${text}

Respond with ONLY this JSON:
{
  "translatedText": "the translated text with preserved formatting",
  "sourceLanguages": ["detected source languages"],
  "targetLanguage": "${targetLanguage}"
}`;

  const MODELS = ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.5-pro'];
  const MAX_RETRIES = 2;
  const BACKOFF_MS = [3000, 6000];
  let result;

  outer:
  for (const modelName of MODELS) {
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const model = genAI.getGenerativeModel({
          model: modelName,
          generationConfig: { maxOutputTokens: 8192, temperature: 0.2 },
        });
        result = await model.generateContent([prompt]);
        break outer;
      } catch (err) {
        const errMsg = err.message || '';
        const isTransient = errMsg.includes('503') || errMsg.includes('overloaded')
          || errMsg.includes('high demand') || errMsg.includes('RESOURCE_EXHAUSTED') || errMsg.includes('429');
        const isModelGone = errMsg.includes('404') || errMsg.includes('no longer available')
          || errMsg.includes('is not found');

        if (isModelGone) {
          logger.warn('Translation — model %s unavailable, skipping', modelName);
          break;
        }
        if (isTransient && attempt < MAX_RETRIES) {
          const delay = BACKOFF_MS[attempt - 1] || 4000;
          logger.warn('Translation — %s attempt %d overloaded, retrying in %dms', modelName, attempt, delay);
          await new Promise((r) => { setTimeout(r, delay); });
          continue;
        }
        if (modelName !== MODELS[MODELS.length - 1]) {
          logger.warn('Translation — %s exhausted, trying next model', modelName);
          break;
        }
        throw new Error('Translation service is experiencing high demand. Please try again shortly.');
      }
    }
  }

  if (!result) {
    throw new Error('Translation service unavailable. Please try again shortly.');
  }

  const responseText = result.response.text();
  const processingMs = Date.now() - startMs;

  logger.info('Prescription translation to %s completed in %dms', targetLanguage, processingMs);

  const parsed = _extractJSON(responseText);
  if (!parsed) {
    logger.error('Failed to parse translation response — raw: %s', responseText.substring(0, 300));
    throw new Error('AI translation returned invalid response format');
  }

  return {
    translatedText: parsed.translatedText || text,
    sourceLanguages: Array.isArray(parsed.sourceLanguages) ? parsed.sourceLanguages : [],
    targetLanguage: parsed.targetLanguage || targetLanguage,
    processingMs,
  };
}

module.exports = {
  analyzeDentalImage,
  analyzeDentalImages,
  validateDentalFrame,
  detectTeethInFrame,
  analyzePrescriptionImage,
  translatePrescriptionText,
};
