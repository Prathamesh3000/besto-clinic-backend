/**
 * ResultsScreen
 * Shows real AI scan results: Health score + Dental chart + Observations + Export options
 * Supports tongue/soft-tissue findings
 * Leads into doctor recommendations
 */

import React, { useState } from 'react';
import { AlertTriangle, CircleDot, Syringe, Ruler, FileText, Mail, Link2, CheckCircle, Loader, Eye } from 'lucide-react';
import DentalChart from '../components/DentalChart';
import { downloadGuestScanPdf, sendGuestScanReport, createGuestScanShareLink } from '../../../api/publicApi';
import '../../../styles/chatbotDesignSystem.css';

// Map API confidence levels to display severity colors
const CONFIDENCE_COLORS = {
  low: 'var(--chatbot-info)',
  medium: 'var(--chatbot-warning)',
  high: 'var(--chatbot-error)',
};

// Observation type labels (including tongue/soft-tissue)
const TYPE_LABELS = {
  plaque: 'Plaque Buildup',
  inflammation: 'Gum Inflammation',
  discoloration: 'Tooth Discoloration',
  misalignment: 'Misalignment',
  cavity: 'Cavity / Decay',
  gum_recession: 'Gum Recession',
  other: 'Other Finding',
};

// Helper function to get icon component based on observation type
const getTypeIcon = (type) => {
  const iconProps = { size: 24, strokeWidth: 2 };

  switch (type) {
    case 'cavity':
      return <CircleDot {...iconProps} />;
    case 'inflammation':
    case 'gum_recession':
      return <Syringe {...iconProps} />;
    case 'misalignment':
      return <Ruler {...iconProps} />;
    case 'other':
      return <Eye {...iconProps} />;
    default:
      return <CircleDot {...iconProps} />;
  }
};

// Detect if an observation is a tongue/soft-tissue finding (area-based, not type-based)
const isTongueFinding = (obs) => {
  const areaLower = (obs.area || '').toLowerCase();
  return areaLower.includes('tongue') || areaLower.includes('soft tissue');
};

export default function ResultsScreen({ results, sessionToken, onViewDoctors, onClose }) {
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [exportState, setExportState] = useState({ pdf: null, email: null, share: null }); // null | 'loading' | 'success' | 'error'
  const [shareUrl, setShareUrl] = useState(null);

  // Handle missing results gracefully
  if (!results) {
    return (
      <div style={{ padding: '48px 32px', textAlign: 'center' }}>
        <p style={{ color: 'var(--chatbot-text-secondary)', marginBottom: '16px' }}>No results available.</p>
        <button className="chatbot-btn-primary" onClick={onClose}>Close</button>
      </div>
    );
  }

  const observations = results.observations || [];
  const healthScore = results.healthScore || {};
  const overallSummary = results.overallSummary || 'Your dental scan analysis is complete.';

  // ── Export handlers ──

  const handleExportPdf = async () => {
    if (!sessionToken) return;
    setExportState((prev) => ({ ...prev, pdf: 'loading' }));
    try {
      const blob = await downloadGuestScanPdf(sessionToken);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `dental-scan-report.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setExportState((prev) => ({ ...prev, pdf: 'success' }));
    } catch (err) {
      console.error('[ResultsScreen] PDF download failed:', err);
      setExportState((prev) => ({ ...prev, pdf: 'error' }));
    }
    setExportMenuOpen(false);
  };

  const handleExportEmail = async () => {
    if (!sessionToken) return;
    setExportState((prev) => ({ ...prev, email: 'loading' }));
    try {
      await sendGuestScanReport(sessionToken);
      setExportState((prev) => ({ ...prev, email: 'success' }));
    } catch (err) {
      console.error('[ResultsScreen] Email send failed:', err);
      setExportState((prev) => ({ ...prev, email: 'error' }));
    }
    setExportMenuOpen(false);
  };

  const handleExportShare = async () => {
    if (!sessionToken) return;
    setExportState((prev) => ({ ...prev, share: 'loading' }));
    try {
      const response = await createGuestScanShareLink(sessionToken);
      const url = response?.data?.shareUrl || response?.shareUrl;
      if (url) {
        setShareUrl(url);
        await navigator.clipboard.writeText(url);
      }
      setExportState((prev) => ({ ...prev, share: 'success' }));
    } catch (err) {
      console.error('[ResultsScreen] Share link failed:', err);
      setExportState((prev) => ({ ...prev, share: 'error' }));
    }
    setExportMenuOpen(false);
  };

  const handleExport = (method) => {
    if (window.gtag) {
      window.gtag('event', 'results_exported', {
        event_category: 'Chatbot',
        event_label: method,
      });
    }

    if (method === 'pdf') handleExportPdf();
    else if (method === 'email') handleExportEmail();
    else if (method === 'share_link') handleExportShare();
  };

  const handleViewDoctors = () => {
    if (window.gtag) {
      window.gtag('event', 'doctor_clicked', {
        event_category: 'Chatbot',
        event_label: 'from_scan_results',
      });
    }
    onViewDoctors?.();
  };

  // Render export button status indicator
  const renderExportStatus = (type) => {
    const state = exportState[type];
    if (state === 'loading') return <Loader size={14} strokeWidth={2} style={{ animation: 'chatbot-spin 1s linear infinite' }} />;
    if (state === 'success') return <CheckCircle size={14} strokeWidth={2} style={{ color: 'var(--chatbot-success)' }} />;
    return null;
  };

  return (
    <div style={{ padding: '24px' }}>
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: '24px' }}>
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
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--chatbot-brand-green)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>

        <h2
          style={{
            fontFamily: 'var(--chatbot-font-heading)',
            fontSize: 'var(--chatbot-text-2xl)',
            fontWeight: 'var(--chatbot-weight-bold)',
            color: 'var(--chatbot-text-primary)',
            marginBottom: '8px',
          }}
        >
          Scan Complete
        </h2>

        <p
          style={{
            fontFamily: 'var(--chatbot-font-body)',
            fontSize: 'var(--chatbot-text-base)',
            color: 'var(--chatbot-text-secondary)',
          }}
        >
          {overallSummary}
        </p>
      </div>

      {/* Health Score */}
      {healthScore.overall != null && (
        <div
          style={{
            background: 'var(--chatbot-bg-card)',
            border: '1px solid var(--chatbot-border)',
            borderRadius: 'var(--chatbot-radius-lg)',
            padding: '20px',
            marginBottom: '24px',
            textAlign: 'center',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '16px', marginBottom: '16px' }}>
            <div
              style={{
                width: '72px',
                height: '72px',
                borderRadius: '50%',
                border: `4px solid ${healthScore.overall >= 70 ? 'var(--chatbot-success)' : healthScore.overall >= 40 ? 'var(--chatbot-warning)' : 'var(--chatbot-error)'}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'column',
              }}
            >
              <span style={{ fontFamily: 'var(--chatbot-font-heading)', fontSize: 'var(--chatbot-text-2xl)', fontWeight: 'var(--chatbot-weight-bold)', color: 'var(--chatbot-text-primary)', lineHeight: 1 }}>
                {healthScore.overall}
              </span>
              <span style={{ fontFamily: 'var(--chatbot-font-body)', fontSize: '10px', color: 'var(--chatbot-text-tertiary)' }}>/ 100</span>
            </div>
            {healthScore.label && (
              <span style={{ fontFamily: 'var(--chatbot-font-heading)', fontSize: 'var(--chatbot-text-lg)', fontWeight: 'var(--chatbot-weight-semibold)', color: 'var(--chatbot-text-primary)' }}>
                {healthScore.label}
              </span>
            )}
          </div>

          {/* Sub-scores */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
            {[
              { label: 'Teeth', value: healthScore.teeth },
              { label: 'Gums', value: healthScore.gums },
              { label: 'Alignment', value: healthScore.alignment },
              { label: 'Hygiene', value: healthScore.hygiene },
            ].filter((s) => s.value != null).map((sub) => (
              <div key={sub.label} style={{ padding: '8px', background: 'var(--chatbot-bg-primary)', borderRadius: 'var(--chatbot-radius-sm)' }}>
                <p style={{ fontFamily: 'var(--chatbot-font-body)', fontSize: 'var(--chatbot-text-xs)', color: 'var(--chatbot-text-tertiary)', marginBottom: '2px' }}>{sub.label}</p>
                <p style={{ fontFamily: 'var(--chatbot-font-heading)', fontSize: 'var(--chatbot-text-base)', fontWeight: 'var(--chatbot-weight-semibold)', color: 'var(--chatbot-text-primary)' }}>{sub.value}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Dental Chart */}
      {observations.length > 0 && (
        <div style={{ marginBottom: '24px' }}>
          <DentalChart findings={observations} />
        </div>
      )}

      {/* Observations */}
      <div style={{ marginBottom: '24px' }}>
        <h3
          style={{
            fontFamily: 'var(--chatbot-font-heading)',
            fontSize: 'var(--chatbot-text-lg)',
            fontWeight: 'var(--chatbot-weight-semibold)',
            color: 'var(--chatbot-text-primary)',
            marginBottom: '12px',
          }}
        >
          {observations.length > 0 ? `Findings (${observations.length})` : 'Findings'}
        </h3>

        {observations.length === 0 ? (
          <div style={{
            background: 'rgba(76, 166, 38, 0.05)',
            border: '1px solid var(--chatbot-success)',
            borderRadius: 'var(--chatbot-radius-md)',
            padding: '20px',
            textAlign: 'center',
          }}>
            <CheckCircle size={32} strokeWidth={2} style={{ color: 'var(--chatbot-success)', marginBottom: '8px' }} />
            <p style={{ fontFamily: 'var(--chatbot-font-body)', fontSize: 'var(--chatbot-text-base)', color: 'var(--chatbot-text-primary)', fontWeight: 'var(--chatbot-weight-semibold)' }}>
              No issues detected
            </p>
            <p style={{ fontFamily: 'var(--chatbot-font-body)', fontSize: 'var(--chatbot-text-sm)', color: 'var(--chatbot-text-secondary)', marginTop: '4px' }}>
              Your dental health looks great! Keep up the good routine.
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {observations.map((obs, index) => {
              const isTongue = isTongueFinding(obs);
              const rawLabel = TYPE_LABELS[obs.type] || obs.type?.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase()) || 'Finding';
              // For tongue findings: keep type label (e.g. 'Discoloration', 'Inflammation') unless it's 'Other Finding'
              const typeLabel = isTongue && obs.type === 'other' ? 'Soft Tissue' : rawLabel;
              const confidenceColor = CONFIDENCE_COLORS[obs.confidence] || 'var(--chatbot-info)';

              return (
                <div
                  key={obs.id || index}
                  style={{
                    background: 'var(--chatbot-bg-card)',
                    border: `1px solid var(--chatbot-border)`,
                    borderLeft: `4px solid ${confidenceColor}`,
                    borderRadius: 'var(--chatbot-radius-md)',
                    padding: '16px',
                  }}
                >
                  {/* Header */}
                  <div style={{ display: 'flex', alignItems: 'start', gap: '12px', marginBottom: '8px' }}>
                    <div style={{ color: 'var(--chatbot-text-secondary)', lineHeight: 1 }}>
                      {isTongue ? (
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M12 2C7 2 3 6 3 11c0 3.5 2 6 4 7.5V21h10v-2.5c2-1.5 4-4 4-7.5 0-5-4-9-9-9z" />
                          <path d="M10 15c0 1.1.9 2 2 2s2-.9 2-2v-3h-4v3z" />
                        </svg>
                      ) : getTypeIcon(obs.type)}
                    </div>

                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
                        <h4
                          style={{
                            fontFamily: 'var(--chatbot-font-heading)',
                            fontSize: 'var(--chatbot-text-base)',
                            fontWeight: 'var(--chatbot-weight-semibold)',
                            color: 'var(--chatbot-text-primary)',
                          }}
                        >
                          {typeLabel}
                        </h4>

                        <span
                          style={{
                            fontFamily: 'var(--chatbot-font-body)',
                            fontSize: 'var(--chatbot-text-xs)',
                            fontWeight: 'var(--chatbot-weight-medium)',
                            color: confidenceColor,
                            background: `${confidenceColor}15`,
                            padding: '2px 8px',
                            borderRadius: 'var(--chatbot-radius-sm)',
                            textTransform: 'capitalize',
                          }}
                        >
                          {obs.confidence}
                        </span>

                        {isTongue && (
                          <span
                            style={{
                              fontFamily: 'var(--chatbot-font-body)',
                              fontSize: 'var(--chatbot-text-xs)',
                              fontWeight: 'var(--chatbot-weight-medium)',
                              color: 'var(--chatbot-text-tertiary)',
                              background: 'var(--chatbot-bg-primary)',
                              padding: '2px 8px',
                              borderRadius: 'var(--chatbot-radius-sm)',
                            }}
                          >
                            Tongue
                          </span>
                        )}
                      </div>

                      {/* Area */}
                      {obs.area && (
                        <p style={{ fontFamily: 'var(--chatbot-font-body)', fontSize: 'var(--chatbot-text-xs)', color: 'var(--chatbot-text-tertiary)', marginBottom: '4px' }}>
                          Area: {obs.area}
                        </p>
                      )}

                      {/* Tooth numbers */}
                      {obs.toothNumbers && obs.toothNumbers.length > 0 && (
                        <p style={{ fontFamily: 'var(--chatbot-font-body)', fontSize: 'var(--chatbot-text-xs)', color: 'var(--chatbot-text-tertiary)', marginBottom: '8px' }}>
                          Teeth: {obs.toothNumbers.join(', ')}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Description */}
                  <p
                    style={{
                      fontFamily: 'var(--chatbot-font-body)',
                      fontSize: 'var(--chatbot-text-sm)',
                      color: 'var(--chatbot-text-secondary)',
                      lineHeight: 'var(--chatbot-leading-relaxed)',
                    }}
                  >
                    {obs.description}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Export options */}
      <div style={{ marginBottom: '24px' }}>
        {/* Export status toasts */}
        {exportState.pdf === 'success' && (
          <div style={{ padding: '8px 12px', background: 'rgba(76, 166, 38, 0.1)', borderRadius: 'var(--chatbot-radius-sm)', marginBottom: '8px', fontSize: 'var(--chatbot-text-sm)', color: 'var(--chatbot-success)', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <CheckCircle size={14} /> PDF downloaded
          </div>
        )}
        {exportState.email === 'success' && (
          <div style={{ padding: '8px 12px', background: 'rgba(76, 166, 38, 0.1)', borderRadius: 'var(--chatbot-radius-sm)', marginBottom: '8px', fontSize: 'var(--chatbot-text-sm)', color: 'var(--chatbot-success)', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <CheckCircle size={14} /> Report sent to your email
          </div>
        )}
        {exportState.share === 'success' && (
          <div style={{ padding: '8px 12px', background: 'rgba(76, 166, 38, 0.1)', borderRadius: 'var(--chatbot-radius-sm)', marginBottom: '8px', fontSize: 'var(--chatbot-text-sm)', color: 'var(--chatbot-success)', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <CheckCircle size={14} /> Share link copied to clipboard
          </div>
        )}
        {(exportState.pdf === 'error' || exportState.email === 'error' || exportState.share === 'error') && (
          <div style={{ padding: '8px 12px', background: 'rgba(239, 68, 68, 0.1)', borderRadius: 'var(--chatbot-radius-sm)', marginBottom: '8px', fontSize: 'var(--chatbot-text-sm)', color: 'var(--chatbot-error)', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <AlertTriangle size={14} /> Export failed. Please try again.
          </div>
        )}

        <div style={{ position: 'relative' }}>
          <button
            className="chatbot-btn-secondary"
            onClick={() => setExportMenuOpen(!exportMenuOpen)}
            style={{ width: '100%', justifyContent: 'center', display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Export Results
          </button>

          {/* Export menu dropdown */}
          {exportMenuOpen && (
            <div
              style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                right: 0,
                marginTop: '8px',
                background: 'var(--chatbot-bg-card)',
                border: '1px solid var(--chatbot-border)',
                borderRadius: 'var(--chatbot-radius-md)',
                boxShadow: 'var(--chatbot-shadow-lg)',
                overflow: 'hidden',
                zIndex: 10,
              }}
            >
              <button
                onClick={() => handleExport('pdf')}
                disabled={exportState.pdf === 'loading'}
                style={{
                  width: '100%', padding: '12px 16px', textAlign: 'left', background: 'transparent',
                  border: 'none', cursor: exportState.pdf === 'loading' ? 'wait' : 'pointer',
                  fontFamily: 'var(--chatbot-font-body)', fontSize: 'var(--chatbot-text-sm)',
                  color: 'var(--chatbot-text-primary)', transition: 'background 0.15s ease',
                  display: 'flex', alignItems: 'center', gap: '8px',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--chatbot-bg-primary)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <FileText size={16} strokeWidth={2} />
                Download PDF
                {renderExportStatus('pdf')}
              </button>

              <button
                onClick={() => handleExport('email')}
                disabled={exportState.email === 'loading'}
                style={{
                  width: '100%', padding: '12px 16px', textAlign: 'left', background: 'transparent',
                  border: 'none', borderTop: '1px solid var(--chatbot-border)',
                  cursor: exportState.email === 'loading' ? 'wait' : 'pointer',
                  fontFamily: 'var(--chatbot-font-body)', fontSize: 'var(--chatbot-text-sm)',
                  color: 'var(--chatbot-text-primary)', transition: 'background 0.15s ease',
                  display: 'flex', alignItems: 'center', gap: '8px',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--chatbot-bg-primary)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <Mail size={16} strokeWidth={2} />
                Email Results
                {renderExportStatus('email')}
              </button>

              <button
                onClick={() => handleExport('share_link')}
                disabled={exportState.share === 'loading'}
                style={{
                  width: '100%', padding: '12px 16px', textAlign: 'left', background: 'transparent',
                  border: 'none', borderTop: '1px solid var(--chatbot-border)',
                  cursor: exportState.share === 'loading' ? 'wait' : 'pointer',
                  fontFamily: 'var(--chatbot-font-body)', fontSize: 'var(--chatbot-text-sm)',
                  color: 'var(--chatbot-text-primary)', transition: 'background 0.15s ease',
                  display: 'flex', alignItems: 'center', gap: '8px',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--chatbot-bg-primary)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <Link2 size={16} strokeWidth={2} />
                Share Link
                {renderExportStatus('share')}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* CTA: Find Doctors */}
      <div
        style={{
          background: 'var(--chatbot-bg-card)',
          border: '1px solid var(--chatbot-border)',
          borderRadius: 'var(--chatbot-radius-lg)',
          padding: '20px',
          textAlign: 'center',
        }}
      >
        <h3
          style={{
            fontFamily: 'var(--chatbot-font-heading)',
            fontSize: 'var(--chatbot-text-lg)',
            fontWeight: 'var(--chatbot-weight-semibold)',
            color: 'var(--chatbot-text-primary)',
            marginBottom: '8px',
          }}
        >
          Ready to get treatment?
        </h3>

        <p
          style={{
            fontFamily: 'var(--chatbot-font-body)',
            fontSize: 'var(--chatbot-text-sm)',
            color: 'var(--chatbot-text-secondary)',
            marginBottom: '16px',
          }}
        >
          Find qualified dentists near you who can address these findings
        </p>

        <button className="chatbot-btn-primary" onClick={handleViewDoctors} style={{ width: '100%' }}>
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
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          Find Recommended Dentists
        </button>
      </div>

      {/* Disclaimer */}
      <p
        style={{
          fontFamily: 'var(--chatbot-font-body)',
          fontSize: 'var(--chatbot-text-xs)',
          color: 'var(--chatbot-text-tertiary)',
          textAlign: 'center',
          marginTop: '24px',
          lineHeight: 'var(--chatbot-leading-relaxed)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '6px',
        }}
      >
        <AlertTriangle size={14} strokeWidth={2} />
        {results.disclaimer || 'This AI analysis is for educational and screening purposes only. It does not replace a professional dental examination. Please consult a licensed dentist for proper diagnosis and treatment.'}
      </p>
    </div>
  );
}
