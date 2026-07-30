/**
 * ModeSelection Screen
 * Two large cards: AI Dental Scan vs Find Nearby Doctors
 * First screen user sees when opening chatbot
 */

import React from 'react';
import '../../../styles/chatbotDesignSystem.css';

const MODES = {
  DENTAL_SCAN: 'DENTAL_SCAN',
  FIND_DOCTORS: 'FIND_DOCTORS',
  PRESCRIPTION_READER: 'PRESCRIPTION_READER',
};

export default function ModeSelection({ onSelectMode }) {
  return (
    <div style={{ padding: '24px' }}>
      {/* Welcome message */}
      <div style={{ textAlign: 'center', marginBottom: '32px' }}>
        <h3
          style={{
            fontFamily: 'var(--chatbot-font-heading)',
            fontSize: 'var(--chatbot-text-2xl)',
            fontWeight: 'var(--chatbot-weight-semibold)',
            color: 'var(--chatbot-text-primary)',
            marginBottom: '8px',
          }}
        >
          Welcome to BestoClinic AI Assistant
        </h3>
        <p
          style={{
            fontFamily: 'var(--chatbot-font-body)',
            fontSize: 'var(--chatbot-text-base)',
            color: 'var(--chatbot-text-secondary)',
          }}
        >
          How can I help you today?
        </p>
      </div>

      {/* Two cards grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '16px',
        }}
      >
        {/* Card 1: AI Dental Scan */}
        <button
          className="chatbot-card"
          onClick={() => onSelectMode(MODES.DENTAL_SCAN)}
          style={{
            padding: '20px',
            minHeight: '180px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-start',
            textAlign: 'left',
            cursor: 'pointer',
            position: 'relative',
            background: 'var(--chatbot-bg-card)',
          }}
          aria-label="Start AI Dental Scan"
        >
          {/* Content */}
          <div style={{ flex: 1, marginBottom: '12px' }}>
            <h4
              style={{
                fontFamily: 'var(--chatbot-font-heading)',
                fontSize: 'var(--chatbot-text-xl)',
                fontWeight: 'var(--chatbot-weight-semibold)',
                color: 'var(--chatbot-text-primary)',
                marginBottom: '8px',
              }}
            >
              AI Dental Scan
            </h4>
            <p
              style={{
                fontFamily: 'var(--chatbot-font-body)',
                fontSize: 'var(--chatbot-text-sm)',
                color: 'var(--chatbot-text-secondary)',
                lineHeight: 'var(--chatbot-leading-relaxed)',
              }}
            >
              Get instant dental health analysis in 30 seconds. AI detects cavities, gum issues, and alignment problems.
            </p>
          </div>

          {/* Arrow icon bottom-right */}
          <div style={{ alignSelf: 'flex-end' }}>
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--chatbot-text-tertiary)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
          </div>
        </button>

        {/* Card 2: Find Doctors */}
        <button
          className="chatbot-card"
          onClick={() => onSelectMode(MODES.FIND_DOCTORS)}
          style={{
            padding: '20px',
            minHeight: '180px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-start',
            textAlign: 'left',
            cursor: 'pointer',
            position: 'relative',
            background: 'var(--chatbot-bg-card)',
          }}
          aria-label="Find Nearby Dentists"
        >
          {/* Content */}
          <div style={{ flex: 1, marginBottom: '12px' }}>
            <h4
              style={{
                fontFamily: 'var(--chatbot-font-heading)',
                fontSize: 'var(--chatbot-text-xl)',
                fontWeight: 'var(--chatbot-weight-semibold)',
                color: 'var(--chatbot-text-primary)',
                marginBottom: '8px',
              }}
            >
              Find Doctors
            </h4>
            <p
              style={{
                fontFamily: 'var(--chatbot-font-body)',
                fontSize: 'var(--chatbot-text-sm)',
                color: 'var(--chatbot-text-secondary)',
                lineHeight: 'var(--chatbot-leading-relaxed)',
              }}
            >
              Search nearby dentists by specialty and location. View ratings, availability, and book appointments instantly.
            </p>
          </div>

          {/* Arrow icon bottom-right */}
          <div style={{ alignSelf: 'flex-end' }}>
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--chatbot-text-tertiary)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
          </div>
        </button>

        {/* Card 3: Prescription Reader */}
        <button
          className="chatbot-card"
          onClick={() => onSelectMode(MODES.PRESCRIPTION_READER)}
          style={{
            padding: '20px',
            minHeight: '180px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-start',
            textAlign: 'left',
            cursor: 'pointer',
            position: 'relative',
            background: 'var(--chatbot-bg-card)',
          }}
          aria-label="Read Handwritten Prescription"
        >
          {/* Content */}
          <div style={{ flex: 1, marginBottom: '12px' }}>
            <h4
              style={{
                fontFamily: 'var(--chatbot-font-heading)',
                fontSize: 'var(--chatbot-text-xl)',
                fontWeight: 'var(--chatbot-weight-semibold)',
                color: 'var(--chatbot-text-primary)',
                marginBottom: '8px',
              }}
            >
              Prescription Reader
            </h4>
            <p
              style={{
                fontFamily: 'var(--chatbot-font-body)',
                fontSize: 'var(--chatbot-text-sm)',
                color: 'var(--chatbot-text-secondary)',
                lineHeight: 'var(--chatbot-leading-relaxed)',
              }}
            >
              Upload a photo of a handwritten prescription and get clean, readable text. Supports any language with translation to 28+ languages.
            </p>
          </div>

          {/* Arrow icon bottom-right */}
          <div style={{ alignSelf: 'flex-end' }}>
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--chatbot-text-tertiary)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
          </div>
        </button>
      </div>
    </div>
  );
}
