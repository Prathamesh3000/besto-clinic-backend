/**
 * PrescriptionReaderFlow - Self-contained prescription scanner flow
 * States: UPLOAD → ANALYZING → RESULT
 * Manages its own internal state (no parent screen routing needed)
 */

import React, { useState, useRef, useCallback } from 'react';
import { prescriptionScanUpload, prescriptionScanTranslate, fileToBase64 } from '../../../api/publicApi';
import '../../../styles/chatbotDesignSystem.css';

const STATES = { UPLOAD: 'UPLOAD', ANALYZING: 'ANALYZING', RESULT: 'RESULT', ERROR: 'ERROR' };
const LANGUAGES = [
  'English', 'Hindi', 'Marathi', 'Gujarati', 'Tamil', 'Telugu', 'Kannada', 'Bengali',
  'Punjabi', 'Malayalam', 'Urdu', 'Arabic', 'Spanish', 'French', 'Portuguese',
  'German', 'Japanese', 'Korean', 'Mandarin', 'Russian', 'Thai', 'Vietnamese',
  'Indonesian', 'Turkish', 'Italian', 'Dutch', 'Polish', 'Swahili',
];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

export default function PrescriptionReaderFlow({ onClose }) {
  const [flowState, setFlowState] = useState(STATES.UPLOAD);
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [scanResult, setScanResult] = useState(null);
  const [translation, setTranslation] = useState(null);
  const [translating, setTranslating] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);

  const fileInputRef = useRef(null);

  const handleFileSelect = useCallback((file) => {
    if (!file) return;

    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowed.includes(file.type)) {
      setErrorMsg('Please select a JPEG, PNG, or WebP image.');
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setErrorMsg('Image must be under 5MB.');
      return;
    }

    setErrorMsg('');
    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) handleFileSelect(file);
  }, [handleFileSelect]);

  const handleUpload = useCallback(async () => {
    if (!selectedFile) return;
    setFlowState(STATES.ANALYZING);
    setTranslation(null);

    try {
      const base64 = await fileToBase64(selectedFile);
      const res = await prescriptionScanUpload(base64, selectedFile.type);
      const data = res.data;

      if (data.status === 'failed') {
        setErrorMsg(data.failureReason || 'Could not read the prescription. Try a clearer image.');
        setFlowState(STATES.ERROR);
      } else {
        setScanResult(data);
        setFlowState(STATES.RESULT);
      }
    } catch (err) {
      setErrorMsg(err.message || 'Something went wrong. Please try again.');
      setFlowState(STATES.ERROR);
    }
  }, [selectedFile]);

  const handleTranslate = useCallback(async (lang) => {
    if (!scanResult?.scanId) return;
    setTranslating(true);
    try {
      const res = await prescriptionScanTranslate(scanResult.scanId, lang);
      setTranslation(res.data.translation);
    } catch (err) {
      alert('Translation failed: ' + (err.message || 'Please try again.'));
    } finally {
      setTranslating(false);
    }
  }, [scanResult]);

  const handleCopyText = useCallback(() => {
    const text = scanResult?.result?.transcription;
    if (text) {
      navigator.clipboard.writeText(text);
    }
  }, [scanResult]);

  const reset = useCallback(() => {
    setFlowState(STATES.UPLOAD);
    setSelectedFile(null);
    setPreviewUrl(null);
    setScanResult(null);
    setTranslation(null);
    setErrorMsg('');
  }, []);

  const handleFindDoctor = useCallback(() => {
    // Dispatch event to switch chatbot to FIND_DOCTORS mode
    window.dispatchEvent(new CustomEvent('chatbot-switch-mode', { detail: { mode: 'FIND_DOCTORS' } }));
  }, []);

  const handleDentalScan = useCallback(() => {
    window.dispatchEvent(new CustomEvent('chatbot-switch-mode', { detail: { mode: 'DENTAL_SCAN' } }));
  }, []);

  // Inject spinner keyframes once
  const spinnerStyle = (
    <style>{`@keyframes chatbot-spin { to { transform: rotate(360deg); } }`}</style>
  );

  // ── UPLOAD STATE ──
  if (flowState === STATES.UPLOAD) {
    return (
      <div style={{ padding: '24px' }}>
        {/* Upload Zone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          style={{
            border: `2px dashed ${isDragOver ? 'var(--chatbot-brand-green)' : 'var(--chatbot-border)'}`,
            borderRadius: '16px',
            padding: '40px 24px',
            textAlign: 'center',
            cursor: 'pointer',
            background: isDragOver ? 'var(--chatbot-brand-green-light, rgba(16,185,129,0.05))' : 'var(--chatbot-bg-card)',
            transition: 'all 0.2s',
          }}
        >
          <div style={{ fontSize: '48px', marginBottom: '12px' }}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--chatbot-brand-green)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
              <polyline points="10 9 9 9 8 9" />
            </svg>
          </div>
          <p style={{
            fontFamily: 'var(--chatbot-font-body)',
            fontSize: 'var(--chatbot-text-base)',
            color: 'var(--chatbot-text-secondary)',
            marginBottom: '4px',
          }}>
            {previewUrl ? 'Image selected' : 'Drop a prescription image here or click to browse'}
          </p>
          <p style={{
            fontFamily: 'var(--chatbot-font-body)',
            fontSize: 'var(--chatbot-text-xs)',
            color: 'var(--chatbot-text-tertiary)',
          }}>
            Supports any language — English, Hindi, Arabic, Spanish & 25+ more • JPEG, PNG, WebP
          </p>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => handleFileSelect(e.target.files?.[0])}
            style={{ display: 'none' }}
          />
        </div>

        {/* Preview */}
        {previewUrl && (
          <div style={{ marginTop: '16px', textAlign: 'center' }}>
            <img
              src={previewUrl}
              alt="Prescription preview"
              style={{
                maxWidth: '100%',
                maxHeight: '200px',
                borderRadius: '12px',
                objectFit: 'contain',
                border: '1px solid var(--chatbot-border)',
              }}
            />
          </div>
        )}

        {/* Error */}
        {errorMsg && (
          <p style={{
            color: '#ef4444',
            fontSize: 'var(--chatbot-text-sm)',
            textAlign: 'center',
            marginTop: '12px',
          }}>
            {errorMsg}
          </p>
        )}

        {/* Read Button */}
        <button
          className="chatbot-btn-primary"
          onClick={handleUpload}
          disabled={!selectedFile}
          style={{
            width: '100%',
            marginTop: '20px',
            padding: '12px',
            fontSize: 'var(--chatbot-text-base)',
            opacity: selectedFile ? 1 : 0.5,
            cursor: selectedFile ? 'pointer' : 'not-allowed',
          }}
        >
          Read Prescription
        </button>
      </div>
    );
  }

  // ── ANALYZING STATE ──
  if (flowState === STATES.ANALYZING) {
    return (
      <div style={{ padding: '48px 24px', textAlign: 'center' }}>
        {spinnerStyle}
        {previewUrl && (
          <img
            src={previewUrl}
            alt="Prescription"
            style={{ width: '120px', height: '120px', borderRadius: '12px', objectFit: 'cover', marginBottom: '24px' }}
          />
        )}
        <div style={{
          width: '40px',
          height: '40px',
          margin: '0 auto 16px',
          borderRadius: '50%',
          border: '3px solid transparent',
          borderTopColor: 'var(--chatbot-brand-green)',
          animation: 'chatbot-spin 1s linear infinite',
        }} />
        <p style={{
          fontFamily: 'var(--chatbot-font-body)',
          fontSize: 'var(--chatbot-text-base)',
          color: 'var(--chatbot-text-secondary)',
        }}>
          Reading prescription...
        </p>
        <p style={{
          fontFamily: 'var(--chatbot-font-body)',
          fontSize: 'var(--chatbot-text-xs)',
          color: 'var(--chatbot-text-tertiary)',
          marginTop: '8px',
        }}>
          This may take a few seconds
        </p>
      </div>
    );
  }

  // ── ERROR STATE ──
  if (flowState === STATES.ERROR) {
    return (
      <div style={{ padding: '48px 24px', textAlign: 'center' }}>
        <div style={{ fontSize: '48px', marginBottom: '16px', color: '#ef4444' }}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="15" y1="9" x2="9" y2="15" />
            <line x1="9" y1="9" x2="15" y2="15" />
          </svg>
        </div>
        <p style={{
          fontFamily: 'var(--chatbot-font-body)',
          fontSize: 'var(--chatbot-text-base)',
          color: 'var(--chatbot-text-secondary)',
          marginBottom: '20px',
        }}>
          {errorMsg}
        </p>
        <button className="chatbot-btn-primary" onClick={reset} style={{ padding: '10px 24px' }}>
          Try Again
        </button>
      </div>
    );
  }

  // ── RESULT STATE ──
  const result = scanResult?.result;
  if (!result) return null;

  return (
    <div style={{ padding: '20px', maxHeight: '65vh', overflowY: 'auto' }}>
      {spinnerStyle}

      {/* Conversational intro — chatbot personality */}
      <div style={{
        background: 'var(--chatbot-brand-green-light, rgba(16,185,129,0.06))',
        borderRadius: '16px 16px 16px 4px',
        padding: '14px 16px',
        marginBottom: '16px',
      }}>
        <p style={{
          fontFamily: 'var(--chatbot-font-body)',
          fontSize: 'var(--chatbot-text-sm)',
          color: 'var(--chatbot-text-primary)',
          lineHeight: '1.5',
          margin: 0,
        }}>
          {result.medications?.length > 0
            ? `I found ${result.medications.length} medication${result.medications.length > 1 ? 's' : ''} on this prescription. Here's everything in a readable format:`
            : "I've read your prescription. Here's the text in a clean, readable format:"}
        </p>
      </div>

      {/* Doctor / Patient / Date — context strip */}
      {(result.doctorName || result.patientName || result.date) && (
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '12px',
          marginBottom: '14px',
          padding: '10px 14px',
          background: 'var(--chatbot-bg-card)',
          borderRadius: '10px',
          border: '1px solid var(--chatbot-border)',
        }}>
          {result.doctorName && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--chatbot-text-tertiary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
              <span style={{ fontSize: 'var(--chatbot-text-xs)', color: 'var(--chatbot-text-secondary)' }}>
                Dr. {result.doctorName}
              </span>
            </div>
          )}
          {result.patientName && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--chatbot-text-tertiary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="8.5" cy="7" r="4" />
              </svg>
              <span style={{ fontSize: 'var(--chatbot-text-xs)', color: 'var(--chatbot-text-secondary)' }}>
                {result.patientName}
              </span>
            </div>
          )}
          {result.date && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--chatbot-text-tertiary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
              <span style={{ fontSize: 'var(--chatbot-text-xs)', color: 'var(--chatbot-text-secondary)' }}>
                {result.date}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Complaints & Diagnosis */}
      {(result.complaints || result.diagnosis) && (
        <div style={{
          background: 'var(--chatbot-bg-card)',
          border: '1px solid var(--chatbot-border)',
          borderRadius: '12px',
          padding: '14px 16px',
          marginBottom: '14px',
        }}>
          {result.complaints && (
            <div style={{ marginBottom: result.diagnosis ? '10px' : 0 }}>
              <p style={{ fontSize: 'var(--chatbot-text-xs)', fontWeight: 600, color: 'var(--chatbot-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '3px' }}>
                Complaints
              </p>
              <p style={{ fontSize: 'var(--chatbot-text-sm)', color: 'var(--chatbot-text-primary)', lineHeight: '1.5', margin: 0 }}>
                {result.complaints}
              </p>
            </div>
          )}
          {result.diagnosis && (
            <div>
              <p style={{ fontSize: 'var(--chatbot-text-xs)', fontWeight: 600, color: 'var(--chatbot-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '3px' }}>
                Diagnosis
              </p>
              <p style={{ fontSize: 'var(--chatbot-text-sm)', color: 'var(--chatbot-text-primary)', lineHeight: '1.5', margin: 0 }}>
                {result.diagnosis}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Medications — main highlight */}
      {result.medications?.length > 0 && (
        <div style={{
          background: 'var(--chatbot-bg-card)',
          border: '1px solid var(--chatbot-border)',
          borderRadius: '12px',
          padding: '14px 16px',
          marginBottom: '14px',
        }}>
          <p style={{
            fontFamily: 'var(--chatbot-font-heading)',
            fontSize: 'var(--chatbot-text-sm)',
            fontWeight: 'var(--chatbot-weight-semibold)',
            color: 'var(--chatbot-text-primary)',
            marginBottom: '10px',
          }}>
            Medications
          </p>
          {result.medications.map((med, i) => (
            <div key={i} style={{
              padding: '10px 12px',
              borderRadius: '8px',
              background: 'var(--chatbot-bg-page, #f9fafb)',
              marginBottom: i < result.medications.length - 1 ? '8px' : 0,
            }}>
              <p style={{
                fontWeight: 600,
                fontSize: 'var(--chatbot-text-sm)',
                color: 'var(--chatbot-text-primary)',
                margin: '0 0 4px 0',
              }}>
                {i + 1}. {med.name}
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {med.dosage && (
                  <span style={{
                    fontSize: 'var(--chatbot-text-xs)',
                    color: 'var(--chatbot-text-secondary)',
                    background: 'rgba(0,0,0,0.04)',
                    padding: '2px 8px',
                    borderRadius: '6px',
                  }}>{med.dosage}</span>
                )}
                {med.frequency && (
                  <span style={{
                    fontSize: 'var(--chatbot-text-xs)',
                    color: 'var(--chatbot-text-secondary)',
                    background: 'rgba(0,0,0,0.04)',
                    padding: '2px 8px',
                    borderRadius: '6px',
                  }}>{med.frequency}</span>
                )}
                {med.duration && (
                  <span style={{
                    fontSize: 'var(--chatbot-text-xs)',
                    color: 'var(--chatbot-text-secondary)',
                    background: 'rgba(0,0,0,0.04)',
                    padding: '2px 8px',
                    borderRadius: '6px',
                  }}>{med.duration}</span>
                )}
              </div>
              {med.notes && (
                <p style={{ fontSize: 'var(--chatbot-text-xs)', color: 'var(--chatbot-text-tertiary)', marginTop: '4px', marginBottom: 0, fontStyle: 'italic' }}>
                  {med.notes}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Advice */}
      {result.advice && (
        <div style={{
          background: 'rgba(16,185,129,0.05)',
          border: '1px solid rgba(16,185,129,0.2)',
          borderRadius: '12px',
          padding: '12px 16px',
          marginBottom: '14px',
          display: 'flex',
          gap: '10px',
          alignItems: 'flex-start',
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--chatbot-brand-green)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginTop: '2px', flexShrink: 0 }}>
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
          <p style={{ fontSize: 'var(--chatbot-text-sm)', color: 'var(--chatbot-text-primary)', lineHeight: '1.5', margin: 0 }}>
            {result.advice}
          </p>
        </div>
      )}

      {/* Full transcription — collapsible */}
      {result.transcription && (
        <details style={{ marginBottom: '14px' }}>
          <summary style={{
            fontSize: 'var(--chatbot-text-xs)',
            color: 'var(--chatbot-text-tertiary)',
            cursor: 'pointer',
            padding: '8px 0',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
            View full raw transcription
            <button
              onClick={(e) => { e.preventDefault(); handleCopyText(); }}
              title="Copy to clipboard"
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--chatbot-text-tertiary)',
                padding: '2px',
                marginLeft: 'auto',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
            </button>
          </summary>
          <div style={{
            background: 'var(--chatbot-bg-card)',
            border: '1px solid var(--chatbot-border)',
            borderRadius: '8px',
            padding: '12px',
            marginTop: '6px',
          }}>
            <p style={{
              fontFamily: 'var(--chatbot-font-body)',
              fontSize: 'var(--chatbot-text-xs)',
              color: 'var(--chatbot-text-secondary)',
              lineHeight: '1.6',
              whiteSpace: 'pre-wrap',
              margin: 0,
            }}>
              {result.transcription}
            </p>
          </div>
        </details>
      )}

      {/* Translation section — conversational prompt */}
      <div style={{
        background: 'var(--chatbot-bg-card)',
        border: '1px solid var(--chatbot-border)',
        borderRadius: '12px',
        padding: '14px 16px',
        marginBottom: '14px',
      }}>
        <p style={{
          fontFamily: 'var(--chatbot-font-body)',
          fontSize: 'var(--chatbot-text-sm)',
          color: 'var(--chatbot-text-primary)',
          marginBottom: '10px',
        }}>
          Need this in another language?
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: translation ? '12px' : 0 }}>
          {LANGUAGES.filter((l) => !result.detectedLanguages?.includes(l)).slice(0, 8).map((lang) => (
            <button
              key={lang}
              onClick={() => handleTranslate(lang)}
              disabled={translating}
              style={{
                padding: '5px 12px',
                borderRadius: '16px',
                border: `1px solid ${translation?.targetLanguage === lang ? 'var(--chatbot-brand-green)' : 'var(--chatbot-border)'}`,
                background: translation?.targetLanguage === lang ? 'var(--chatbot-brand-green-light, rgba(16,185,129,0.1))' : 'transparent',
                color: translation?.targetLanguage === lang ? 'var(--chatbot-brand-green)' : 'var(--chatbot-text-secondary)',
                fontSize: 'var(--chatbot-text-xs)',
                cursor: translating ? 'wait' : 'pointer',
                fontFamily: 'var(--chatbot-font-body)',
              }}
            >
              {lang}
            </button>
          ))}
          <details style={{ width: '100%', marginTop: '4px' }}>
            <summary style={{ fontSize: 'var(--chatbot-text-xs)', color: 'var(--chatbot-text-tertiary)', cursor: 'pointer' }}>
              More languages...
            </summary>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px' }}>
              {LANGUAGES.filter((l) => !result.detectedLanguages?.includes(l)).slice(8).map((lang) => (
                <button
                  key={lang}
                  onClick={() => handleTranslate(lang)}
                  disabled={translating}
                  style={{
                    padding: '5px 12px',
                    borderRadius: '16px',
                    border: `1px solid ${translation?.targetLanguage === lang ? 'var(--chatbot-brand-green)' : 'var(--chatbot-border)'}`,
                    background: translation?.targetLanguage === lang ? 'var(--chatbot-brand-green-light, rgba(16,185,129,0.1))' : 'transparent',
                    color: translation?.targetLanguage === lang ? 'var(--chatbot-brand-green)' : 'var(--chatbot-text-secondary)',
                    fontSize: 'var(--chatbot-text-xs)',
                    cursor: translating ? 'wait' : 'pointer',
                    fontFamily: 'var(--chatbot-font-body)',
                  }}
                >
                  {lang}
                </button>
              ))}
            </div>
          </details>
        </div>

        {translating && (
          <div style={{ textAlign: 'center', padding: '12px 0' }}>
            <div style={{
              width: '24px',
              height: '24px',
              margin: '0 auto',
              borderRadius: '50%',
              border: '3px solid transparent',
              borderTopColor: 'var(--chatbot-brand-green)',
              animation: 'chatbot-spin 1s linear infinite',
            }} />
          </div>
        )}

        {translation && !translating && (
          <div style={{
            padding: '12px',
            borderRadius: '8px',
            background: 'var(--chatbot-bg-page, #f9fafb)',
            border: '1px solid var(--chatbot-border)',
          }}>
            <p style={{
              fontSize: 'var(--chatbot-text-xs)',
              fontWeight: 600,
              color: 'var(--chatbot-brand-green)',
              marginBottom: '6px',
            }}>
              Translated to {translation.targetLanguage}
            </p>
            <p style={{
              fontSize: 'var(--chatbot-text-sm)',
              color: 'var(--chatbot-text-primary)',
              lineHeight: '1.6',
              whiteSpace: 'pre-wrap',
              margin: 0,
            }}>
              {translation.translatedText}
            </p>
          </div>
        )}
      </div>

      {/* Engagement CTAs — convert visitors to retainers */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(16,185,129,0.06) 0%, rgba(59,130,246,0.06) 100%)',
        borderRadius: '12px',
        padding: '16px',
        marginBottom: '14px',
      }}>
        <p style={{
          fontFamily: 'var(--chatbot-font-body)',
          fontSize: 'var(--chatbot-text-sm)',
          color: 'var(--chatbot-text-primary)',
          fontWeight: 500,
          marginBottom: '12px',
        }}>
          What would you like to do next?
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <button
            onClick={handleFindDoctor}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '10px 14px',
              borderRadius: '10px',
              border: '1px solid var(--chatbot-border)',
              background: 'var(--chatbot-bg-card)',
              cursor: 'pointer',
              textAlign: 'left',
              width: '100%',
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--chatbot-brand-green)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
            <div>
              <p style={{ fontSize: 'var(--chatbot-text-sm)', fontWeight: 500, color: 'var(--chatbot-text-primary)', margin: 0 }}>
                Find a doctor nearby
              </p>
              <p style={{ fontSize: 'var(--chatbot-text-xs)', color: 'var(--chatbot-text-tertiary)', margin: 0 }}>
                Book an appointment or get a second opinion
              </p>
            </div>
          </button>

          <button
            onClick={handleDentalScan}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '10px 14px',
              borderRadius: '10px',
              border: '1px solid var(--chatbot-border)',
              background: 'var(--chatbot-bg-card)',
              cursor: 'pointer',
              textAlign: 'left',
              width: '100%',
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <path d="M8 14s1.5 2 4 2 4-2 4-2" />
              <line x1="9" y1="9" x2="9.01" y2="9" />
              <line x1="15" y1="9" x2="15.01" y2="9" />
            </svg>
            <div>
              <p style={{ fontSize: 'var(--chatbot-text-sm)', fontWeight: 500, color: 'var(--chatbot-text-primary)', margin: 0 }}>
                Try AI Dental Scan
              </p>
              <p style={{ fontSize: 'var(--chatbot-text-xs)', color: 'var(--chatbot-text-tertiary)', margin: 0 }}>
                Get a free dental health analysis in 30 seconds
              </p>
            </div>
          </button>

          <button
            onClick={reset}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '10px 14px',
              borderRadius: '10px',
              border: '1px solid var(--chatbot-border)',
              background: 'var(--chatbot-bg-card)',
              cursor: 'pointer',
              textAlign: 'left',
              width: '100%',
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--chatbot-text-tertiary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 4 23 10 17 10" />
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
            </svg>
            <div>
              <p style={{ fontSize: 'var(--chatbot-text-sm)', fontWeight: 500, color: 'var(--chatbot-text-primary)', margin: 0 }}>
                Scan another prescription
              </p>
              <p style={{ fontSize: 'var(--chatbot-text-xs)', color: 'var(--chatbot-text-tertiary)', margin: 0 }}>
                Read a different prescription image
              </p>
            </div>
          </button>
        </div>
      </div>

      {/* Disclaimer */}
      <p style={{
        fontSize: 'var(--chatbot-text-xs)',
        color: 'var(--chatbot-text-tertiary)',
        textAlign: 'center',
        margin: 0,
      }}>
        AI-assisted reading — always verify with your pharmacist
      </p>
    </div>
  );
}
