/**
 * VoicePermissionPrompt Screen
 * Ask user if they want voice guidance during scan
 * Professional, clear benefit statement
 */

import React from 'react';
import '../../../styles/chatbotDesignSystem.css';

export default function VoicePermissionPrompt({ onEnable, onDecline }) {
  return (
    <div style={{ padding: '32px', maxWidth: '500px', margin: '0 auto', textAlign: 'center' }}>
      {/* Icon */}
      <div style={{ marginBottom: '24px' }}>
        <div
          style={{
            width: '80px',
            height: '80px',
            background: 'rgba(76, 166, 38, 0.1)',
            borderRadius: 'var(--chatbot-radius-xl)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <svg
            width="40"
            height="40"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--chatbot-brand-green)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
            <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
            <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
          </svg>
        </div>
      </div>

      {/* Title */}
      <h2
        style={{
          fontFamily: 'var(--chatbot-font-heading)',
          fontSize: 'var(--chatbot-text-2xl)',
          fontWeight: 'var(--chatbot-weight-bold)',
          color: 'var(--chatbot-text-primary)',
          marginBottom: '12px',
        }}
      >
        Enable Voice Guidance?
      </h2>

      {/* Description */}
      <p
        style={{
          fontFamily: 'var(--chatbot-font-body)',
          fontSize: 'var(--chatbot-text-base)',
          color: 'var(--chatbot-text-secondary)',
          lineHeight: 'var(--chatbot-leading-relaxed)',
          marginBottom: '32px',
        }}
      >
        Voice guidance will provide clear instructions during the scan to help you position correctly. This improves
        scan accuracy and makes the process easier.
      </p>

      {/* Benefits list */}
      <div style={{ textAlign: 'left', marginBottom: '32px' }}>
        <div style={{ display: 'flex', gap: '12px', marginBottom: '12px' }}>
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--chatbot-brand-green)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ flexShrink: 0, marginTop: '2px' }}
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
          <span
            style={{
              fontFamily: 'var(--chatbot-font-body)',
              fontSize: 'var(--chatbot-text-sm)',
              color: 'var(--chatbot-text-secondary)',
            }}
          >
            Real-time positioning instructions
          </span>
        </div>

        <div style={{ display: 'flex', gap: '12px', marginBottom: '12px' }}>
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--chatbot-brand-green)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ flexShrink: 0, marginTop: '2px' }}
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
          <span
            style={{
              fontFamily: 'var(--chatbot-font-body)',
              fontSize: 'var(--chatbot-text-sm)',
              color: 'var(--chatbot-text-secondary)',
            }}
          >
            Professional clinical tone
          </span>
        </div>

        <div style={{ display: 'flex', gap: '12px' }}>
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--chatbot-brand-green)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ flexShrink: 0, marginTop: '2px' }}
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
          <span
            style={{
              fontFamily: 'var(--chatbot-font-body)',
              fontSize: 'var(--chatbot-text-sm)',
              color: 'var(--chatbot-text-secondary)',
            }}
          >
            You can mute anytime during the scan
          </span>
        </div>
      </div>

      {/* Action buttons */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <button className="chatbot-btn-primary" onClick={onEnable} style={{ width: '100%' }}>
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ display: 'inline-block', marginRight: '8px', verticalAlign: 'middle' }}
          >
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
            <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
            <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
          </svg>
          Yes, Enable Voice Guidance
        </button>

        <button className="chatbot-btn-secondary" onClick={onDecline} style={{ width: '100%' }}>
          No Thanks, I'll Read
        </button>
      </div>

      {/* Footer note */}
      <p
        style={{
          fontFamily: 'var(--chatbot-font-body)',
          fontSize: 'var(--chatbot-text-xs)',
          color: 'var(--chatbot-text-tertiary)',
          marginTop: '16px',
        }}
      >
        Your preference will be remembered for future scans
      </p>
    </div>
  );
}
