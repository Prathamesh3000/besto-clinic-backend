/**
 * useVoiceCoach Hook - Natural voice guidance with timing synchronization
 * Manages TTS playback, voice state, and visual sync for immersive experience
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { speak as speakVoice, stopSpeaking, isVoiceSupported } from '../../../lib/voiceGuidance';

export function useVoiceCoach(enabled = true) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentMessage, setCurrentMessage] = useState('');
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);

  const timeoutRef = useRef(null);
  const intervalRef = useRef(null);
  const startTimeRef = useRef(0);

  /**
   * Speak a message with natural voice and track state
   * Now uses async Puter.js TTS
   */
  const speak = useCallback(async (message, options = {}) => {
    if (!enabled || !isVoiceSupported()) {
      console.warn('[VoiceCoach] Voice not supported or disabled');
      return Promise.resolve();
    }

    // Stop any ongoing speech
    stop();

    // Set new message
    setCurrentMessage(message);
    setIsPlaying(true);
    setProgress(0);

    // Estimate duration (rough: ~150 words per minute)
    const wordCount = message.split(' ').length;
    const estimatedDuration = (wordCount / 150) * 60 * 1000; // milliseconds
    setDuration(estimatedDuration);

    // Start progress tracking
    startTimeRef.current = Date.now();
    intervalRef.current = setInterval(() => {
      const elapsed = Date.now() - startTimeRef.current;
      const newProgress = Math.min(1, elapsed / estimatedDuration);
      setProgress(newProgress);

      if (newProgress >= 1) {
        clearInterval(intervalRef.current);
      }
    }, 50);

    // Speak with Puter.js TTS (async)
    try {
      await speakVoice(message, options);
    } catch (err) {
      console.warn('[VoiceCoach] TTS failed:', err);
    } finally {
      // Cleanup after speech completes
      setIsPlaying(false);
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    }
  }, [enabled]);

  /**
   * Stop current speech
   */
  const stop = useCallback(() => {
    stopSpeaking();
    setIsPlaying(false);
    setCurrentMessage('');
    setProgress(0);

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  /**
   * Speak with natural variation (adds random encouragement prefix)
   */
  const speakNatural = useCallback((message, variableEncouragement = true) => {
    if (!variableEncouragement) {
      return speak(message);
    }

    const encouragements = [
      'Great! ',
      'Excellent! ',
      'Perfect! ',
      'Wonderful! ',
      'Awesome! ',
      '', // Sometimes no prefix
    ];

    const prefix = Math.random() > 0.5
      ? encouragements[Math.floor(Math.random() * encouragements.length)]
      : '';

    return speak(prefix + message);
  }, [speak]);

  /**
   * Speak a sequence of messages with delays
   */
  const speakSequence = useCallback(async (messages, delayBetween = 500) => {
    for (const message of messages) {
      await speak(message);
      if (delayBetween > 0) {
        await new Promise(resolve => setTimeout(resolve, delayBetween));
      }
    }
  }, [speak]);

  /**
   * Quick feedback sound (short message, higher priority)
   */
  const speakFeedback = useCallback((message) => {
    // Interrupt current speech for feedback
    stopSpeaking();
    return speak(message);
  }, [speak]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stop();
    };
  }, [stop]);

  return {
    // State
    isPlaying,
    currentMessage,
    progress,
    duration,
    isSupported: isVoiceSupported(),

    // Actions
    speak,
    speakNatural,
    speakSequence,
    speakFeedback,
    stop,
  };
}

export default useVoiceCoach;
