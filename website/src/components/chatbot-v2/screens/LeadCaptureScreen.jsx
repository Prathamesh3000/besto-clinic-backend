/**
 * LeadCaptureScreen
 * Collects name + email before triggering AI analysis.
 * Required by the /analyze endpoint.
 */

import React, { useState } from 'react';
import { Mail, User } from 'lucide-react';
import { submitGuestLead } from '../../../api/publicApi';
import '../../../styles/chatbotDesignSystem.css';

export default function LeadCaptureScreen({ sessionToken, onComplete, onSkip }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const isValidEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
  const canSubmit = name.trim().length > 0 && isValidEmail(email) && !submitting;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;

    setSubmitting(true);
    setError(null);

    try {
      await submitGuestLead(sessionToken, {
        name: name.trim(),
        email: email.trim().toLowerCase(),
      });

      // Await onComplete to catch errors from parent (e.g. triggerGuestAnalysis failing)
      try {
        await onComplete?.();
      } catch (completeErr) {
        console.error('[LeadCapture] Post-submit action failed:', completeErr);
        setError(completeErr.message || 'Failed to start analysis. Please try again.');
        setSubmitting(false);
      }
    } catch (err) {
      console.error('[LeadCapture] Submit failed:', err);
      setError(err.message || 'Failed to save contact info. Please try again.');
      setSubmitting(false);
    }
  };

  return (
    <div style={{ padding: '32px 24px', maxWidth: '440px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: '32px' }}>
        <div
          style={{
            width: '64px',
            height: '64px',
            background: 'rgba(76, 166, 38, 0.1)',
            borderRadius: '50%',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '16px',
          }}
        >
          <Mail size={28} strokeWidth={2} style={{ color: 'var(--chatbot-brand-green)' }} />
        </div>

        <h2
          style={{
            fontFamily: 'var(--chatbot-font-heading)',
            fontSize: 'var(--chatbot-text-xl)',
            fontWeight: 'var(--chatbot-weight-bold)',
            color: 'var(--chatbot-text-primary)',
            marginBottom: '8px',
          }}
        >
          Almost Done!
        </h2>

        <p
          style={{
            fontFamily: 'var(--chatbot-font-body)',
            fontSize: 'var(--chatbot-text-sm)',
            color: 'var(--chatbot-text-secondary)',
            lineHeight: 'var(--chatbot-leading-relaxed)',
          }}
        >
          Enter your details so we can email you the results and connect you with dentists in your area.
        </p>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit}>
        {/* Name */}
        <div style={{ marginBottom: '16px' }}>
          <label
            style={{
              display: 'block',
              fontFamily: 'var(--chatbot-font-body)',
              fontSize: 'var(--chatbot-text-sm)',
              fontWeight: 'var(--chatbot-weight-medium)',
              color: 'var(--chatbot-text-primary)',
              marginBottom: '6px',
            }}
          >
            Your Name
          </label>
          <div style={{ position: 'relative' }}>
            <User
              size={16}
              strokeWidth={2}
              style={{
                position: 'absolute',
                left: '12px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--chatbot-text-tertiary)',
              }}
            />
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="John Doe"
              style={{
                width: '100%',
                padding: '10px 12px 10px 36px',
                fontFamily: 'var(--chatbot-font-body)',
                fontSize: 'var(--chatbot-text-sm)',
                color: 'var(--chatbot-text-primary)',
                background: 'var(--chatbot-bg-card)',
                border: '1px solid var(--chatbot-border)',
                borderRadius: 'var(--chatbot-radius-md)',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>
        </div>

        {/* Email */}
        <div style={{ marginBottom: '24px' }}>
          <label
            style={{
              display: 'block',
              fontFamily: 'var(--chatbot-font-body)',
              fontSize: 'var(--chatbot-text-sm)',
              fontWeight: 'var(--chatbot-weight-medium)',
              color: 'var(--chatbot-text-primary)',
              marginBottom: '6px',
            }}
          >
            Email Address
          </label>
          <div style={{ position: 'relative' }}>
            <Mail
              size={16}
              strokeWidth={2}
              style={{
                position: 'absolute',
                left: '12px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--chatbot-text-tertiary)',
              }}
            />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="john@example.com"
              style={{
                width: '100%',
                padding: '10px 12px 10px 36px',
                fontFamily: 'var(--chatbot-font-body)',
                fontSize: 'var(--chatbot-text-sm)',
                color: 'var(--chatbot-text-primary)',
                background: 'var(--chatbot-bg-card)',
                border: '1px solid var(--chatbot-border)',
                borderRadius: 'var(--chatbot-radius-md)',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>
        </div>

        {/* Error */}
        {error && (
          <p style={{
            fontFamily: 'var(--chatbot-font-body)',
            fontSize: 'var(--chatbot-text-xs)',
            color: 'var(--chatbot-error)',
            marginBottom: '16px',
            textAlign: 'center',
          }}>
            {error}
          </p>
        )}

        {/* Submit button */}
        <button
          type="submit"
          className="chatbot-btn-primary"
          disabled={!canSubmit}
          style={{
            width: '100%',
            opacity: canSubmit ? 1 : 0.5,
            cursor: canSubmit ? 'pointer' : 'not-allowed',
          }}
        >
          {submitting ? 'Saving...' : 'Get My Results'}
        </button>
      </form>

      {/* Privacy note */}
      <p
        style={{
          fontFamily: 'var(--chatbot-font-body)',
          fontSize: 'var(--chatbot-text-xs)',
          color: 'var(--chatbot-text-tertiary)',
          textAlign: 'center',
          marginTop: '16px',
          lineHeight: 'var(--chatbot-leading-relaxed)',
        }}
      >
        We'll only use your email to send the scan report. No spam, ever.
      </p>
    </div>
  );
}
