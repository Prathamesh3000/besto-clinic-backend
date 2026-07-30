/**
 * ConsentScreen
 * HIPAA-compliant consent with checkbox and brief terms
 * Clean, professional, formal
 */

import React, { useState } from 'react';
import '../../../styles/chatbotDesignSystem.css';

export default function ConsentScreen({ onAccept, onDecline }) {
  const [agreed, setAgreed] = useState(false);

  const handleSubmit = () => {
    if (agreed) {
      onAccept?.();
    }
  };

  return (
    <div style={{ padding: '32px', maxWidth: '600px', margin: '0 auto' }}>
      {/* Icon */}
      <div style={{ textAlign: 'center', marginBottom: '24px' }}>
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
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            <path d="M9 12l2 2 4-4" />
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
          textAlign: 'center',
          marginBottom: '8px',
        }}
      >
        Medical Consent Required
      </h2>

      {/* Subtitle */}
      <p
        style={{
          fontFamily: 'var(--chatbot-font-body)',
          fontSize: 'var(--chatbot-text-base)',
          color: 'var(--chatbot-text-secondary)',
          textAlign: 'center',
          marginBottom: '32px',
        }}
      >
        BestoClinic's AI Scanner uses advanced imaging technology to analyze your dental health
      </p>

      {/* Consent points */}
      <div style={{ marginBottom: '24px' }}>
        {/* Point 1 */}
        <div
          style={{
            display: 'flex',
            gap: '16px',
            padding: '16px',
            background: 'var(--chatbot-bg-card)',
            borderRadius: 'var(--chatbot-radius-lg)',
            border: '1px solid var(--chatbot-border)',
            marginBottom: '12px',
          }}
        >
          <div
            style={{
              width: '40px',
              height: '40px',
              background: 'rgba(76, 166, 38, 0.1)',
              borderRadius: 'var(--chatbot-radius-md)',
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--chatbot-brand-green)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
              <circle cx="12" cy="13" r="4" />
            </svg>
          </div>
          <div>
            <h4
              style={{
                fontFamily: 'var(--chatbot-font-heading)',
                fontSize: 'var(--chatbot-text-base)',
                fontWeight: 'var(--chatbot-weight-semibold)',
                color: 'var(--chatbot-text-primary)',
                marginBottom: '4px',
              }}
            >
              Photo Capture
            </h4>
            <p
              style={{
                fontFamily: 'var(--chatbot-font-body)',
                fontSize: 'var(--chatbot-text-sm)',
                color: 'var(--chatbot-text-secondary)',
              }}
            >
              4 quick photos (left, front, right, tongue) for comprehensive analysis
            </p>
          </div>
        </div>

        {/* Point 2 */}
        <div
          style={{
            display: 'flex',
            gap: '16px',
            padding: '16px',
            background: 'var(--chatbot-bg-card)',
            borderRadius: 'var(--chatbot-radius-lg)',
            border: '1px solid var(--chatbot-border)',
            marginBottom: '12px',
          }}
        >
          <div
            style={{
              width: '40px',
              height: '40px',
              background: 'rgba(0, 229, 255, 0.1)',
              borderRadius: 'var(--chatbot-radius-md)',
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#00E5FF"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="4" y="4" width="16" height="16" rx="2" ry="2" />
              <path d="M9 9h6M9 13h6M9 17h6" />
            </svg>
          </div>
          <div>
            <h4
              style={{
                fontFamily: 'var(--chatbot-font-heading)',
                fontSize: 'var(--chatbot-text-base)',
                fontWeight: 'var(--chatbot-weight-semibold)',
                color: 'var(--chatbot-text-primary)',
                marginBottom: '4px',
              }}
            >
              AI Analysis
            </h4>
            <p
              style={{
                fontFamily: 'var(--chatbot-font-body)',
                fontSize: 'var(--chatbot-text-sm)',
                color: 'var(--chatbot-text-secondary)',
              }}
            >
              Advanced AI detects cavities, gum issues, and alignment problems
            </p>
          </div>
        </div>

        {/* Point 3 */}
        <div
          style={{
            display: 'flex',
            gap: '16px',
            padding: '16px',
            background: 'var(--chatbot-bg-card)',
            borderRadius: 'var(--chatbot-radius-lg)',
            border: '1px solid var(--chatbot-border)',
          }}
        >
          <div
            style={{
              width: '40px',
              height: '40px',
              background: 'rgba(46, 95, 162, 0.1)',
              borderRadius: 'var(--chatbot-radius-md)',
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--chatbot-brand-blue)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </div>
          <div>
            <h4
              style={{
                fontFamily: 'var(--chatbot-font-heading)',
                fontSize: 'var(--chatbot-text-base)',
                fontWeight: 'var(--chatbot-weight-semibold)',
                color: 'var(--chatbot-text-primary)',
                marginBottom: '4px',
              }}
            >
              HIPAA Compliant
            </h4>
            <p
              style={{
                fontFamily: 'var(--chatbot-font-body)',
                fontSize: 'var(--chatbot-text-sm)',
                color: 'var(--chatbot-text-secondary)',
              }}
            >
              End-to-end encryption. Your data is never shared or sold
            </p>
          </div>
        </div>
      </div>

      {/* Checkbox */}
      <label
        style={{
          display: 'flex',
          alignItems: 'start',
          gap: '12px',
          padding: '16px',
          background: 'var(--chatbot-bg-primary)',
          borderRadius: 'var(--chatbot-radius-md)',
          cursor: 'pointer',
          marginBottom: '24px',
        }}
      >
        <input
          type="checkbox"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
          style={{
            width: '20px',
            height: '20px',
            marginTop: '2px',
            cursor: 'pointer',
            accentColor: 'var(--chatbot-brand-green)',
          }}
        />
        <span
          style={{
            fontFamily: 'var(--chatbot-font-body)',
            fontSize: 'var(--chatbot-text-sm)',
            color: 'var(--chatbot-text-secondary)',
            lineHeight: 'var(--chatbot-leading-relaxed)',
          }}
        >
          I understand and consent to the capture and analysis of my dental images by BestoClinic's AI system. I
          acknowledge that this is for educational and screening purposes only and does not replace a professional
          dental examination.
        </span>
      </label>

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: '12px' }}>
        <button className="chatbot-btn-secondary" onClick={onDecline} style={{ flex: 1 }}>
          Decline
        </button>
        <button className="chatbot-btn-primary" onClick={handleSubmit} disabled={!agreed} style={{ flex: 1 }}>
          I Consent - Start Scan
        </button>
      </div>

      {/* Footer note */}
      <p
        style={{
          fontFamily: 'var(--chatbot-font-body)',
          fontSize: 'var(--chatbot-text-xs)',
          color: 'var(--chatbot-text-tertiary)',
          textAlign: 'center',
          marginTop: '16px',
        }}
      >
        Your privacy is protected. Images are encrypted and automatically deleted after analysis.
      </p>
    </div>
  );
}
