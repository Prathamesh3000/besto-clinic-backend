/**
 * Voice Guidance — Puter.js TTS wrapper for natural-sounding voice instructions
 *
 * Uses Puter.js free unlimited TTS service instead of Web Speech API
 * - No API keys required
 * - No user gesture requirements
 * - High-quality OpenAI TTS voices
 * - Completely free and unlimited
 *
 * @version 3.0 (Puter.js)
 * @date April 2026
 */

// Current audio instance
let _currentAudio = null;
let _isPlaying = false;

/**
 * Check if Puter.js is available
 */
export function isVoiceSupported() {
  return typeof window !== 'undefined' && typeof window.puter !== 'undefined';
}

/**
 * Initialize voice system (no-op for Puter.js, always ready)
 */
export function initVoices() {
  if (!isVoiceSupported()) {
    console.warn('[VoiceGuidance] Puter.js not loaded. Include https://js.puter.com/v2/ in HTML.');
  }
}

/**
 * Speak text using Puter.js TTS with natural-sounding voice
 *
 * @param {string} text - The text to speak
 * @param {object} options - Optional speech parameters
 * @param {string} options.voice - Voice to use (alloy, echo, fable, onyx, nova, shimmer)
 * @param {string} options.provider - TTS provider (openai, polly, elevenlabs)
 * @param {number} options.speed - Speech speed (0.25-4.0, default: 1.0)
 * @returns {Promise<void>}
 */
export async function speak(text, options = {}) {
  if (!isVoiceSupported() || !text) {
    console.warn('[VoiceGuidance] Puter.js not available or empty text');
    return;
  }

  try {
    // Stop any ongoing speech
    stopSpeaking();

    console.log('[VoiceGuidance] Speaking:', text.substring(0, 50) + '...');

    // Default to OpenAI TTS with "alloy" voice (warm, natural female voice)
    const ttsOptions = {
      provider: options.provider || 'openai',
      voice: options.voice || 'alloy',  // alloy is natural and clear
      speed: options.speed || 1.0,
    };

    // Generate speech audio
    const audio = await window.puter.ai.txt2speech(text, ttsOptions);

    _currentAudio = audio;
    _isPlaying = true;

    // Play audio
    await audio.play();

    // Track when it ends
    audio.addEventListener('ended', () => {
      _isPlaying = false;
      _currentAudio = null;
    });

    audio.addEventListener('error', (err) => {
      console.warn('[VoiceGuidance] Audio playback error:', err);
      _isPlaying = false;
      _currentAudio = null;
    });

  } catch (err) {
    console.warn('[VoiceGuidance] Puter.js TTS failed:', err);
    _isPlaying = false;
    _currentAudio = null;
  }
}

/**
 * Stop any in-progress speech immediately
 */
export function stopSpeaking() {
  if (_currentAudio) {
    try {
      _currentAudio.pause();
      _currentAudio.currentTime = 0;
      _currentAudio = null;
    } catch (err) {
      // Silent fail
    }
  }
  _isPlaying = false;
}

/**
 * Check if speech is currently playing
 */
export function isSpeaking() {
  return _isPlaying;
}

/**
 * Get available voice options (for UI selectors)
 * OpenAI TTS voices available via Puter.js
 */
export function getAvailableVoices() {
  return [
    { id: 'alloy', name: 'Alloy', description: 'Natural, warm female voice (recommended)' },
    { id: 'echo', name: 'Echo', description: 'Male voice, clear and direct' },
    { id: 'fable', name: 'Fable', description: 'British accent, expressive' },
    { id: 'onyx', name: 'Onyx', description: 'Deep male voice' },
    { id: 'nova', name: 'Nova', description: 'Energetic female voice' },
    { id: 'shimmer', name: 'Shimmer', description: 'Soft, friendly female voice' },
  ];
}

/**
 * Preload Puter.js (ensures library is ready)
 */
export function preloadVoiceSystem() {
  if (!isVoiceSupported()) {
    console.warn('[VoiceGuidance] Puter.js not available. TTS will not work.');
    return false;
  }
  console.log('[VoiceGuidance] Puter.js TTS ready ✓');
  return true;
}

// Initialize on import
if (typeof window !== 'undefined') {
  // Wait for Puter.js to load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      setTimeout(preloadVoiceSystem, 100);
    });
  } else {
    setTimeout(preloadVoiceSystem, 100);
  }
}
