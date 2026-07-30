/**
 * Scanner Sound Effects Manager
 * Medical-grade audio feedback for scanner interactions
 */

class SoundManager {
  constructor() {
    this.sounds = {};
    this.enabled = true;
    this.volume = 0.7;
    this.initialized = false;
  }

  /**
   * Initialize sound manager (call once on user interaction)
   */
  async init() {
    if (this.initialized) return;

    try {
      // Create audio context (requires user gesture)
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();

      // Load sound effects
      await this.loadSounds();

      this.initialized = true;
      console.log('[SoundManager] Initialized successfully');
    } catch (error) {
      console.warn('[SoundManager] Initialization failed:', error);
      this.enabled = false;
    }
  }

  /**
   * Load all sound effect buffers
   */
  async loadSounds() {
    const soundDefinitions = {
      // Countdown sounds
      countdownTick: {
        type: 'oscillator',
        frequency: 800,
        duration: 0.05,
        volume: 0.3,
      },
      countdownFinal: {
        type: 'oscillator',
        frequency: 1200,
        duration: 0.1,
        volume: 0.5,
      },

      // Capture sounds
      shutter: {
        type: 'noise',
        duration: 0.15,
        volume: 0.6,
      },

      // Success sounds
      success: {
        type: 'melody',
        notes: [523, 659, 784], // C, E, G
        duration: 0.15,
        volume: 0.5,
      },
      successChime: {
        type: 'oscillator',
        frequency: 1047,
        duration: 0.3,
        volume: 0.4,
      },

      // Transition sounds
      whoosh: {
        type: 'sweep',
        startFreq: 400,
        endFreq: 200,
        duration: 0.4,
        volume: 0.3,
      },

      // Completion sounds
      complete: {
        type: 'melody',
        notes: [523, 659, 784, 1047], // C, E, G, high C
        duration: 0.2,
        volume: 0.5,
      },

      // Validation feedback
      error: {
        type: 'oscillator',
        frequency: 200,
        duration: 0.2,
        volume: 0.4,
      },
      warning: {
        type: 'oscillator',
        frequency: 400,
        duration: 0.1,
        volume: 0.3,
      },
    };

    // Generate synthetic sounds (no external files needed)
    for (const [name, config] of Object.entries(soundDefinitions)) {
      this.sounds[name] = config;
    }
  }

  /**
   * Play a sound effect by name
   */
  play(soundName) {
    if (!this.enabled || !this.initialized) return;
    if (!this.sounds[soundName]) {
      console.warn(`[SoundManager] Sound not found: ${soundName}`);
      return;
    }

    const config = this.sounds[soundName];
    const ctx = this.audioContext;
    const now = ctx.currentTime;

    try {
      switch (config.type) {
        case 'oscillator':
          this.playOscillator(config, now);
          break;
        case 'noise':
          this.playNoise(config, now);
          break;
        case 'melody':
          this.playMelody(config, now);
          break;
        case 'sweep':
          this.playSweep(config, now);
          break;
        default:
          console.warn(`[SoundManager] Unknown sound type: ${config.type}`);
      }
    } catch (error) {
      console.warn(`[SoundManager] Error playing ${soundName}:`, error);
    }
  }

  /**
   * Play simple oscillator tone
   */
  playOscillator(config, startTime) {
    const ctx = this.audioContext;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.frequency.value = config.frequency;
    osc.type = 'sine';

    gain.gain.setValueAtTime(config.volume * this.volume, startTime);
    gain.gain.exponentialRampToValueAtTime(0.01, startTime + config.duration);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(startTime);
    osc.stop(startTime + config.duration);
  }

  /**
   * Play white noise (for shutter effect)
   */
  playNoise(config, startTime) {
    const ctx = this.audioContext;
    const bufferSize = ctx.sampleRate * config.duration;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);

    // Generate white noise
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const source = ctx.createBufferSource();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    source.buffer = buffer;
    filter.type = 'bandpass';
    filter.frequency.value = 5000;
    filter.Q.value = 2;

    gain.gain.setValueAtTime(config.volume * this.volume, startTime);
    gain.gain.exponentialRampToValueAtTime(0.01, startTime + config.duration);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    source.start(startTime);
  }

  /**
   * Play melody (sequence of notes)
   */
  playMelody(config, startTime) {
    const ctx = this.audioContext;
    const noteDuration = config.duration;
    const noteGap = 0.05;

    config.notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.frequency.value = freq;
      osc.type = 'sine';

      const noteStart = startTime + i * (noteDuration + noteGap);
      gain.gain.setValueAtTime(config.volume * this.volume, noteStart);
      gain.gain.exponentialRampToValueAtTime(0.01, noteStart + noteDuration);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(noteStart);
      osc.stop(noteStart + noteDuration);
    });
  }

  /**
   * Play frequency sweep (for whoosh effect)
   */
  playSweep(config, startTime) {
    const ctx = this.audioContext;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(config.startFreq, startTime);
    osc.frequency.exponentialRampToValueAtTime(
      config.endFreq,
      startTime + config.duration
    );

    gain.gain.setValueAtTime(config.volume * this.volume, startTime);
    gain.gain.exponentialRampToValueAtTime(0.01, startTime + config.duration);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(startTime);
    osc.stop(startTime + config.duration);
  }

  /**
   * Play sequence of sounds
   */
  playSequence(soundNames, interval = 0.2) {
    if (!this.enabled || !this.initialized) return;

    soundNames.forEach((name, i) => {
      setTimeout(() => this.play(name), i * interval * 1000);
    });
  }

  /**
   * Set global volume (0-1)
   */
  setVolume(volume) {
    this.volume = Math.max(0, Math.min(1, volume));
  }

  /**
   * Enable/disable all sounds
   */
  setEnabled(enabled) {
    this.enabled = enabled;
  }

  /**
   * Get enabled state
   */
  isEnabled() {
    return this.enabled && this.initialized;
  }
}

// Export singleton instance
export const soundManager = new SoundManager();

// Convenience functions
export const playSound = (name) => soundManager.play(name);
export const initSounds = () => soundManager.init();
export const setSoundVolume = (volume) => soundManager.setVolume(volume);
export const setSoundEnabled = (enabled) => soundManager.setEnabled(enabled);

// Sound effect presets for common scanner events
export const SCANNER_SOUNDS = {
  COUNTDOWN_TICK: 'countdownTick',
  COUNTDOWN_FINAL: 'countdownFinal',
  CAPTURE: 'shutter',
  SUCCESS: 'success',
  SUCCESS_CHIME: 'successChime',
  TRANSITION: 'whoosh',
  COMPLETE: 'complete',
  ERROR: 'error',
  WARNING: 'warning',
};

export default soundManager;
