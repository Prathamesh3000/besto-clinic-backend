/**
 * ChatbotModal - Main Modal Container
 * Adaptive responsive: 700×800px desktop, full-screen mobile
 * Includes header with voice/close controls, scrollable body
 */

import React, { useEffect } from 'react';
import '../../styles/chatbotDesignSystem.css';

export default function ChatbotModal({
  isOpen,
  onClose,
  children,
  title = 'BestoClinic AI Assistant',
  showVoiceControl = false,
  voiceEnabled = false,
  onToggleVoice,
}) {
  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }

    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        onClose?.();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="chatbot-backdrop" onClick={onClose} aria-hidden="true" />

      {/* Modal */}
      <div className="chatbot-modal" role="dialog" aria-modal="true" aria-labelledby="chatbot-modal-title">
        {/* Header */}
        <header className="chatbot-modal-header">
          {/* Title */}
          <h2 id="chatbot-modal-title" className="chatbot-modal-title">
            {title}
          </h2>

          {/* Controls */}
          <div className="chatbot-modal-controls">
            {/* Voice toggle button (only shown during scan) */}
            {showVoiceControl && (
              <button
                className="chatbot-header-button"
                onClick={onToggleVoice}
                aria-label={voiceEnabled ? 'Mute voice guidance' : 'Enable voice guidance'}
                title={voiceEnabled ? 'Mute voice' : 'Enable voice'}
              >
                {voiceEnabled ? (
                  // Volume2 icon (unmuted)
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                    <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                    <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                  </svg>
                ) : (
                  // VolumeX icon (muted)
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                    <line x1="23" y1="9" x2="17" y2="15" />
                    <line x1="17" y1="9" x2="23" y2="15" />
                  </svg>
                )}
              </button>
            )}

            {/* Close button */}
            <button
              className="chatbot-header-button"
              onClick={onClose}
              aria-label="Close chatbot"
              title="Close"
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </header>

        {/* Body (scrollable) */}
        <div className="chatbot-modal-body">{children}</div>
      </div>
    </>
  );
}
