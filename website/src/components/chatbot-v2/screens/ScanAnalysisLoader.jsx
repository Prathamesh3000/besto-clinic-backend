/**
 * ScanAnalysisLoader Screen
 * Step-by-step status updates during AI analysis
 * Polls real API for status while showing animated progress steps
 */

import React, { useState, useEffect, useRef } from 'react';
import { Lock, RefreshCw } from 'lucide-react';
import { getGuestScanStatus } from '../../../api/publicApi';
import '../../../styles/chatbotDesignSystem.css';

const ANALYSIS_STEPS = [
  {
    id: 'detecting',
    label: 'Detecting teeth',
    duration: 3000,
  },
  {
    id: 'cavities',
    label: 'Analyzing cavities',
    duration: 4000,
  },
  {
    id: 'gums',
    label: 'Checking gum health',
    duration: 4000,
  },
  {
    id: 'alignment',
    label: 'Assessing alignment',
    duration: 3000,
  },
  {
    id: 'report',
    label: 'Generating report',
    duration: 2000,
  },
];

const MIN_DISPLAY_MS = 5000;
const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 120000; // 2 minutes max polling

export default function ScanAnalysisLoader({ sessionToken, onComplete, onError, onRetriggerAnalysis }) {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [completedSteps, setCompletedSteps] = useState([]);
  const [apiResult, setApiResult] = useState(null);
  const [error, setError] = useState(null);
  const [pollKey, setPollKey] = useState(0); // Increment to restart polling

  const mountTimeRef = useRef(Date.now());
  const deliveredRef = useRef(false);

  // ── Poll API for real results ──
  // pollKey is incremented on retry to restart this effect
  useEffect(() => {
    if (!sessionToken || deliveredRef.current) return;

    let cancelled = false;
    let consecutiveErrors = 0;
    const MAX_CONSECUTIVE_ERRORS = 5;

    const poll = async () => {
      try {
        const response = await getGuestScanStatus(sessionToken);
        if (cancelled) return;

        consecutiveErrors = 0; // Reset on success
        const data = response?.data || response;
        if (data.status === 'completed' && data.result) {
          setApiResult(data.result);
        } else if (data.status === 'failed') {
          const failureMsg = data.failureReason || 'Analysis failed. Please try again.';
          setError(failureMsg);
          onError?.(failureMsg);
        }
      } catch (err) {
        consecutiveErrors++;
        if (!cancelled && consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
          const errMsg = 'Unable to reach the server. Please check your connection and try again.';
          setError(errMsg);
          onError?.(errMsg);
        }
      }
    };

    // Initial poll
    poll();

    const intervalId = setInterval(poll, POLL_INTERVAL_MS);

    // Timeout — stop polling after 2 minutes
    const timeoutId = setTimeout(() => {
      if (!cancelled && !deliveredRef.current) {
        const timeoutMsg = 'Analysis is taking longer than expected. Please try again.';
        setError(timeoutMsg);
        onError?.(timeoutMsg);
      }
    }, POLL_TIMEOUT_MS);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
      clearTimeout(timeoutId);
    };
  }, [sessionToken, pollKey, onError]);

  // ── Animation step progression ──
  useEffect(() => {
    if (currentStepIndex >= ANALYSIS_STEPS.length) return;

    const currentStep = ANALYSIS_STEPS[currentStepIndex];
    const timer = setTimeout(() => {
      setCompletedSteps((prev) => [...prev, currentStep.id]);
      setCurrentStepIndex((prev) => prev + 1);
    }, currentStep.duration);

    return () => clearTimeout(timer);
  }, [currentStepIndex]);

  // Derived state — no ref needed. React will re-run effects when this changes.
  const animationsDone = currentStepIndex >= ANALYSIS_STEPS.length;

  // ── Deliver results when BOTH animations done AND API result ready AND min time elapsed ──
  useEffect(() => {
    if (deliveredRef.current || !apiResult || !animationsDone) return;

    const elapsed = Date.now() - mountTimeRef.current;
    const remaining = Math.max(0, MIN_DISPLAY_MS - elapsed);

    const timer = setTimeout(() => {
      deliveredRef.current = true;
      onComplete?.(apiResult);
    }, remaining);

    return () => clearTimeout(timer);
  }, [apiResult, animationsDone, onComplete]);

  // ── If animations finish but API is still processing, hold on last step ──
  // (the animation loop stops naturally; polling continues)

  const handleRetry = async () => {
    setError(null);
    setApiResult(null);
    setCurrentStepIndex(0);
    setCompletedSteps([]);
    mountTimeRef.current = Date.now();
    deliveredRef.current = false;

    // Re-trigger analysis on the backend before restarting polling
    if (onRetriggerAnalysis) {
      try {
        await onRetriggerAnalysis();
      } catch {
        // If re-trigger fails, still restart polling in case backend is already processing
      }
    }

    // Increment pollKey to restart the polling effect
    setPollKey((k) => k + 1);
  };

  const isStepComplete = (stepId) => completedSteps.includes(stepId);
  const isStepCurrent = (index) => index === currentStepIndex;
  const waitingForApi = animationsDone && !apiResult && !error;

  // ── Error state ──
  if (error) {
    return (
      <div style={{ padding: '48px 32px', maxWidth: '500px', margin: '0 auto', textAlign: 'center' }}>
        <div
          style={{
            width: '80px',
            height: '80px',
            background: 'rgba(239, 68, 68, 0.1)',
            borderRadius: '50%',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '24px',
          }}
        >
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--chatbot-error)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="15" y1="9" x2="9" y2="15" />
            <line x1="9" y1="9" x2="15" y2="15" />
          </svg>
        </div>
        <h2 style={{ fontFamily: 'var(--chatbot-font-heading)', fontSize: 'var(--chatbot-text-xl)', fontWeight: 'var(--chatbot-weight-bold)', color: 'var(--chatbot-text-primary)', marginBottom: '8px' }}>
          Analysis Failed
        </h2>
        <p style={{ fontFamily: 'var(--chatbot-font-body)', fontSize: 'var(--chatbot-text-sm)', color: 'var(--chatbot-text-secondary)', marginBottom: '24px' }}>
          {error}
        </p>
        <button className="chatbot-btn-primary" onClick={handleRetry} style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
          <RefreshCw size={16} strokeWidth={2} />
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div style={{ padding: '48px 32px', maxWidth: '500px', margin: '0 auto', textAlign: 'center' }}>
      {/* Icon */}
      <div style={{ marginBottom: '32px' }}>
        <div
          style={{
            width: '100px',
            height: '100px',
            background: 'rgba(76, 166, 38, 0.1)',
            borderRadius: '50%',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
          }}
        >
          {/* Rotating ring */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: '50%',
              border: '3px solid transparent',
              borderTopColor: 'var(--chatbot-brand-green)',
              animation: 'chatbot-spin 1s linear infinite',
            }}
          />

          {/* Brain/AI icon */}
          <svg
            width="48"
            height="48"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--chatbot-brand-green)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2Z" />
            <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3A2.5 2.5 0 0 0 14.5 2Z" />
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
          marginBottom: '8px',
        }}
      >
        Analyzing Your Dental Health
      </h2>

      {/* Subtitle */}
      <p
        style={{
          fontFamily: 'var(--chatbot-font-body)',
          fontSize: 'var(--chatbot-text-base)',
          color: 'var(--chatbot-text-secondary)',
          marginBottom: '40px',
        }}
      >
        {waitingForApi
          ? 'Almost there — finalizing your results...'
          : 'Our AI is processing your scan images.'}
      </p>

      {/* Step-by-step status */}
      <div style={{ textAlign: 'left', marginBottom: '32px' }}>
        {ANALYSIS_STEPS.map((step, index) => {
          const isComplete = isStepComplete(step.id);
          const isCurrent = isStepCurrent(index);
          const isPending = !isComplete && !isCurrent;

          return (
            <div
              key={step.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '16px',
                padding: '12px 0',
                opacity: isPending ? 0.4 : 1,
                transition: 'opacity 0.3s ease',
              }}
            >
              {/* Status icon */}
              <div
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  background: isComplete
                    ? 'var(--chatbot-brand-green)'
                    : isCurrent
                    ? 'rgba(76, 166, 38, 0.2)'
                    : 'var(--chatbot-bg-primary)',
                  border: isComplete ? 'none' : '2px solid var(--chatbot-border)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                {isComplete ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                ) : isCurrent ? (
                  <div
                    style={{
                      width: '16px',
                      height: '16px',
                      border: '2px solid var(--chatbot-brand-green)',
                      borderTopColor: 'transparent',
                      borderRadius: '50%',
                      animation: 'chatbot-spin 0.8s linear infinite',
                    }}
                  />
                ) : null}
              </div>

              {/* Label */}
              <div style={{ flex: 1 }}>
                <p
                  style={{
                    fontFamily: 'var(--chatbot-font-body)',
                    fontSize: 'var(--chatbot-text-base)',
                    fontWeight: isCurrent ? 'var(--chatbot-weight-semibold)' : 'var(--chatbot-weight-normal)',
                    color: isComplete || isCurrent ? 'var(--chatbot-text-primary)' : 'var(--chatbot-text-secondary)',
                  }}
                >
                  {step.label}
                  {isCurrent && '...'}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Waiting for API indicator (after animations finish) */}
      {waitingForApi && (
        <div style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
          <span
            style={{
              width: '14px',
              height: '14px',
              border: '2px solid var(--chatbot-brand-green)',
              borderTopColor: 'transparent',
              borderRadius: '50%',
              animation: 'chatbot-spin 0.8s linear infinite',
              display: 'inline-block',
              flexShrink: 0,
            }}
          />
          <span style={{ fontFamily: 'var(--chatbot-font-body)', fontSize: 'var(--chatbot-text-sm)', color: 'var(--chatbot-text-secondary)' }}>
            Waiting for AI to finish...
          </span>
        </div>
      )}

      {/* Progress bar */}
      <div
        style={{
          height: '6px',
          background: 'var(--chatbot-bg-primary)',
          borderRadius: 'var(--chatbot-radius-full)',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        <div
          style={{
            height: '100%',
            background: 'var(--chatbot-brand-green)',
            borderRadius: 'var(--chatbot-radius-full)',
            width: `${(Math.min(currentStepIndex + 1, ANALYSIS_STEPS.length) / ANALYSIS_STEPS.length) * 100}%`,
            transition: 'width 0.5s ease',
          }}
        />
      </div>

      {/* Footer note */}
      <p
        style={{
          fontFamily: 'var(--chatbot-font-body)',
          fontSize: 'var(--chatbot-text-xs)',
          color: 'var(--chatbot-text-tertiary)',
          marginTop: '24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '6px',
        }}
      >
        <Lock size={14} strokeWidth={2} />
        Your images are encrypted and will be automatically deleted after analysis
      </p>
    </div>
  );
}
