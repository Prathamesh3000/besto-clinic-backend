/**
 * Web-Audio ringtone generator.
 *
 * We synthesize two ringing patterns at runtime so no audio asset needs to
 * ship with the build. Volume is deliberately moderate (0.15 peak) because
 * the call overlay also vibrates + flashes the browser title.
 *
 *   'call'      — classic phone warble, loops every 4s
 *   'emergency' — higher, more urgent beat, loops every 2s
 *
 * Usage:
 *   const stop = playRingtone('call');
 *   // later …
 *   stop();
 */

const PATTERNS = {
  call: {
    // [frequencyHz, durationMs]
    notes: [[440, 350], [0, 120], [480, 350], [0, 2200]],
    peakGain: 0.15,
  },
  emergency: {
    notes: [[880, 180], [0, 80], [880, 180], [0, 80], [1100, 260], [0, 900]],
    peakGain: 0.18,
  },
};

let ctx;

function getCtx() {
  if (ctx) return ctx;
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return null;
  ctx = new AudioCtx();
  return ctx;
}

export function playRingtone(kind = 'call') {
  const audio = getCtx();
  const pattern = PATTERNS[kind] || PATTERNS.call;
  if (!audio) return () => {};

  // Resume if suspended (browser autoplay policy)
  if (audio.state === 'suspended') {
    audio.resume().catch(() => {});
  }

  let cancelled = false;
  let activeOsc = null;
  let activeGain = null;

  const scheduleLoop = async () => {
    while (!cancelled) {
      for (const [freq, dur] of pattern.notes) {
        if (cancelled) break;
        if (freq === 0) {
          await sleep(dur);
          continue;
        }
        await playTone(audio, freq, dur / 1000, pattern.peakGain, (osc, gain) => {
          activeOsc = osc;
          activeGain = gain;
        });
      }
    }
  };

  scheduleLoop();

  return function stop() {
    cancelled = true;
    try {
      activeOsc?.stop();
      activeOsc?.disconnect();
      activeGain?.disconnect();
    } catch { /* already stopped */ }
  };
}

function playTone(audio, freq, seconds, peakGain, onRef) {
  return new Promise((resolve) => {
    const now = audio.currentTime;
    const osc = audio.createOscillator();
    const gain = audio.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now);

    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(peakGain, now + 0.02);
    gain.gain.linearRampToValueAtTime(0, now + seconds);

    osc.connect(gain);
    gain.connect(audio.destination);

    osc.start(now);
    osc.stop(now + seconds + 0.05);

    onRef?.(osc, gain);

    setTimeout(resolve, seconds * 1000);
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export function tryVibrate(pattern = [200, 100, 200, 100, 200]) {
  if (navigator.vibrate) {
    try { navigator.vibrate(pattern); } catch { /* ignore */ }
  }
}

/**
 * Start a title flasher ("Incoming call… · BestoClinic" vs original).
 * Returns a stop() fn that restores the original title.
 */
export function flashDocumentTitle(label = 'Incoming call…') {
  const original = document.title;
  let flipped = false;
  const iv = setInterval(() => {
    document.title = flipped ? original : label;
    flipped = !flipped;
  }, 800);
  return function stop() {
    clearInterval(iv);
    document.title = original;
  };
}
