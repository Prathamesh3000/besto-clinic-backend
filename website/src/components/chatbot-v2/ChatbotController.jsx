/**
 * ChatbotController - Main Component
 * Manages state, routing between screens, analytics
 * Lazy-loaded for performance
 */

import React, { useState, useCallback, useEffect, useRef, Suspense, lazy } from 'react';
import ChatbotWidget from './ChatbotWidget';
import ChatbotModal from './ChatbotModal';
import { initiateGuestScan, triggerGuestAnalysis } from '../../api/publicApi';
import '../../styles/chatbotDesignSystem.css';

// Lazy load screens for code-splitting
const ModeSelection = lazy(() => import('./screens/ModeSelection'));
const ConsentScreen = lazy(() => import('./screens/ConsentScreen'));
const VoicePermissionPrompt = lazy(() => import('./screens/VoicePermissionPrompt'));
const ScanFlow = lazy(() => import('./screens/ScanFlow'));
const ScanAnalysisLoader = lazy(() => import('./screens/ScanAnalysisLoader'));
const ResultsScreen = lazy(() => import('./screens/ResultsScreen'));
const DoctorRecommendations = lazy(() => import('./screens/DoctorRecommendations'));
const DoctorDiscoveryFlow = lazy(() => import('./screens/DoctorDiscoveryFlow'));
const PrescriptionReaderFlow = lazy(() => import('./screens/PrescriptionReaderFlow'));
const LeadCaptureScreen = lazy(() => import('./screens/LeadCaptureScreen'));

// Screen states
const SCREENS = {
  MODE_SELECTION: 'MODE_SELECTION',
  // Dental Scan Flow
  CONSENT: 'CONSENT',
  VOICE_PERMISSION: 'VOICE_PERMISSION',
  SCANNING: 'SCANNING',
  LEAD_CAPTURE: 'LEAD_CAPTURE',
  ANALYZING: 'ANALYZING',
  RESULTS: 'RESULTS',
  DOCTOR_RECOMMENDATIONS: 'DOCTOR_RECOMMENDATIONS',
  // Doctor Search Flow
  DOCTOR_SEARCH: 'DOCTOR_SEARCH',
  DOCTOR_RESULTS: 'DOCTOR_RESULTS',
  // Prescription Reader Flow
  PRESCRIPTION_READER: 'PRESCRIPTION_READER',
};

// Modes
const MODES = {
  DENTAL_SCAN: 'DENTAL_SCAN',
  FIND_DOCTORS: 'FIND_DOCTORS',
  PRESCRIPTION_READER: 'PRESCRIPTION_READER',
};

export default function ChatbotController() {
  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentScreen, setCurrentScreen] = useState(SCREENS.MODE_SELECTION);
  const [selectedMode, setSelectedMode] = useState(null);

  // Voice state
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [voicePermissionAsked, setVoicePermissionAsked] = useState(false);

  // Guest scan session
  const [sessionToken, setSessionToken] = useState(null);

  // Scan data
  const [scanData, setScanData] = useState({
    consentAccepted: false,
    images: [],
    results: null,
  });

  // Unread count for notification badge
  const [unreadCount] = useState(0);

  /**
   * Open modal - Track analytics
   */
  const handleOpenModal = useCallback(() => {
    setIsModalOpen(true);
    setCurrentScreen(SCREENS.MODE_SELECTION);

    // Analytics: Modal opened
    if (window.gtag) {
      window.gtag('event', 'chatbot_widget_clicked', {
        event_category: 'Chatbot',
        event_label: window.location.pathname,
      });
    }
  }, []);

  /**
   * Listen for custom event from "Start Free Scan" buttons across the site
   */
  useEffect(() => {
    const handleCustomEvent = () => {
      handleOpenModal();
    };

    window.addEventListener('open-dental-scanner', handleCustomEvent);

    const handlePrescriptionEvent = () => {
      setIsModalOpen(true);
      setSelectedMode(MODES.PRESCRIPTION_READER);
      setCurrentScreen(SCREENS.PRESCRIPTION_READER);
    };
    window.addEventListener('open-prescription-scanner', handlePrescriptionEvent);

    // Listen for internal mode switching (e.g. from prescription result CTAs)
    const handleSwitchMode = (e) => {
      const mode = e.detail?.mode;
      if (!mode || !MODES[mode]) return;
      setSelectedMode(mode);
      if (mode === MODES.DENTAL_SCAN) {
        setCurrentScreen(SCREENS.CONSENT);
      } else if (mode === MODES.FIND_DOCTORS) {
        setCurrentScreen(SCREENS.DOCTOR_SEARCH);
      } else if (mode === MODES.PRESCRIPTION_READER) {
        setCurrentScreen(SCREENS.PRESCRIPTION_READER);
      }
    };
    window.addEventListener('chatbot-switch-mode', handleSwitchMode);

    return () => {
      window.removeEventListener('open-dental-scanner', handleCustomEvent);
      window.removeEventListener('open-prescription-scanner', handlePrescriptionEvent);
      window.removeEventListener('chatbot-switch-mode', handleSwitchMode);
    };
  }, [handleOpenModal]);

  /**
   * Close modal - Track analytics with last screen
   */
  const handleCloseModal = useCallback(() => {
    const timeSpent = Date.now(); // TODO: Track actual time

    // Analytics: Modal closed
    if (window.gtag) {
      window.gtag('event', 'chatbot_modal_closed', {
        event_category: 'Chatbot',
        event_label: currentScreen,
        value: Math.floor(timeSpent / 1000),
      });
    }

    setIsModalOpen(false);

    // Reset state after animation completes
    setTimeout(() => {
      setCurrentScreen(SCREENS.MODE_SELECTION);
      setSelectedMode(null);
      setSessionToken(null);
      setScanData({ consentAccepted: false, images: [], results: null });
    }, 300);
  }, [currentScreen]);

  /**
   * Mode selection handler
   */
  const handleModeSelect = useCallback((mode) => {
    setSelectedMode(mode);

    // Analytics: Mode selected
    if (window.gtag) {
      window.gtag('event', 'chatbot_mode_selected', {
        event_category: 'Chatbot',
        event_label: mode === MODES.DENTAL_SCAN ? 'dental_scan' : mode === MODES.PRESCRIPTION_READER ? 'prescription_reader' : 'find_doctors',
      });
    }

    // Navigate to next screen based on mode
    if (mode === MODES.DENTAL_SCAN) {
      setCurrentScreen(SCREENS.CONSENT);
    } else if (mode === MODES.FIND_DOCTORS) {
      setCurrentScreen(SCREENS.DOCTOR_SEARCH);
    } else if (mode === MODES.PRESCRIPTION_READER) {
      setCurrentScreen(SCREENS.PRESCRIPTION_READER);
    }
  }, []);

  /**
   * Consent accepted handler — initiates guest scan session
   */
  const handleConsentAccept = useCallback(async () => {
    setScanData((prev) => ({ ...prev, consentAccepted: true }));

    // Analytics: Consent accepted
    if (window.gtag) {
      window.gtag('event', 'consent_accepted', {
        event_category: 'Chatbot',
        event_label: 'dental_scan_consent',
      });
    }

    // Initiate guest scan session
    try {
      const response = await initiateGuestScan();
      const token = response?.data?.sessionToken || response?.sessionToken;
      if (token) {
        setSessionToken(token);
      } else {
        console.warn('[ChatbotController] No session token received, proceeding without API');
      }
    } catch (err) {
      console.error('[ChatbotController] Failed to initiate scan session:', err);
      // Still proceed — scan flow works offline, just won't upload
    }

    // Ask for voice permission if not asked before
    if (!voicePermissionAsked) {
      setCurrentScreen(SCREENS.VOICE_PERMISSION);
    } else {
      setCurrentScreen(SCREENS.SCANNING);
    }
  }, [voicePermissionAsked]);

  /**
   * Voice permission handler
   */
  const handleVoicePermission = useCallback((enabled) => {
    setVoiceEnabled(enabled);
    setVoicePermissionAsked(true);

    // Analytics: Voice permission
    if (window.gtag) {
      window.gtag('event', 'voice_permission_response', {
        event_category: 'Chatbot',
        event_label: enabled ? 'enabled' : 'disabled',
      });
    }

    // Navigate to scanning
    setCurrentScreen(SCREENS.SCANNING);
  }, []);

  /**
   * Voice toggle (during scan)
   */
  const handleToggleVoice = useCallback(() => {
    setVoiceEnabled((prev) => !prev);
  }, []);

  /**
   * Scan complete handler - all positions captured
   * Goes to lead capture before triggering analysis
   */
  const handleScanComplete = useCallback((images) => {
    setScanData((prev) => ({ ...prev, images }));

    // Analytics: Scan completed
    if (window.gtag) {
      window.gtag('event', 'scan_completed', {
        event_category: 'Chatbot',
        event_label: images.length + '_positions',
      });
    }

    // Navigate to lead capture — analysis is triggered after lead is submitted
    setCurrentScreen(SCREENS.LEAD_CAPTURE);
  }, []);

  /**
   * Lead capture complete — trigger analysis and move to analyzing screen
   */
  const handleLeadCaptureComplete = useCallback(async () => {
    if (!sessionToken) {
      throw new Error('Session expired. Please start a new scan.');
    }

    try {
      await triggerGuestAnalysis(sessionToken);
      // Only navigate to analyzing screen if trigger succeeded
      setCurrentScreen(SCREENS.ANALYZING);
    } catch (err) {
      console.error('[ChatbotController] Failed to trigger analysis:', err);
      // Re-throw so LeadCaptureScreen can show the error in the form
      throw new Error(err.message || 'Failed to start analysis. Please try again.');
    }
  }, [sessionToken]);

  /**
   * Analysis complete — receives real results from polling
   */
  const handleAnalysisComplete = useCallback((results) => {
    setScanData((prev) => ({ ...prev, results }));
    setCurrentScreen(SCREENS.RESULTS);
  }, []);

  /**
   * Re-trigger analysis on the backend (used by ScanAnalysisLoader retry)
   */
  const handleRetriggerAnalysis = useCallback(async () => {
    if (!sessionToken) return;
    await triggerGuestAnalysis(sessionToken);
  }, [sessionToken]);

  /**
   * Analysis error handler — tracks analytics for analysis failures
   */
  const handleAnalysisError = useCallback((errorMsg) => {
    console.error('[ChatbotController] Analysis error:', errorMsg);

    if (window.gtag) {
      window.gtag('event', 'analysis_failed', {
        event_category: 'Chatbot',
        event_label: errorMsg,
      });
    }
  }, []);

  /**
   * Scan error handler
   */
  const handleScanError = useCallback((error) => {
    console.error('[ChatbotController] Scan error:', error);

    // Analytics: Scan failed
    if (window.gtag) {
      window.gtag('event', 'scan_failed', {
        event_category: 'Chatbot',
        event_label: 'camera_error',
      });
    }

    alert('Camera error. Please check permissions and try again.');
  }, []);

  /**
   * View doctors handler (from results screen)
   */
  const handleViewDoctors = useCallback(() => {
    setCurrentScreen(SCREENS.DOCTOR_RECOMMENDATIONS);
  }, []);

  /**
   * Determine if voice control should be shown in header
   */
  const showVoiceControl = currentScreen === SCREENS.SCANNING;

  /**
   * Determine modal title based on screen
   */
  const getModalTitle = () => {
    switch (currentScreen) {
      case SCREENS.MODE_SELECTION:
        return 'BestoClinic AI Assistant';
      case SCREENS.CONSENT:
        return 'Consent Required';
      case SCREENS.VOICE_PERMISSION:
        return 'Voice Guidance';
      case SCREENS.SCANNING:
        return 'Dental Scan';
      case SCREENS.LEAD_CAPTURE:
        return 'Your Details';
      case SCREENS.ANALYZING:
        return 'Analyzing';
      case SCREENS.RESULTS:
        return 'Scan Results';
      case SCREENS.DOCTOR_RECOMMENDATIONS:
        return 'Recommended Dentists';
      case SCREENS.DOCTOR_SEARCH:
        return 'Find Dentists';
      case SCREENS.DOCTOR_RESULTS:
        return 'Recommended Dentists';
      case SCREENS.PRESCRIPTION_READER:
        return 'Prescription Reader';
      default:
        return 'BestoClinic AI Assistant';
    }
  };

  /**
   * Render current screen
   */
  const renderScreen = () => {
    switch (currentScreen) {
      case SCREENS.MODE_SELECTION:
        return <ModeSelection onSelectMode={handleModeSelect} />;

      case SCREENS.CONSENT:
        return <ConsentScreen onAccept={handleConsentAccept} onDecline={handleCloseModal} />;

      case SCREENS.VOICE_PERMISSION:
        return (
          <VoicePermissionPrompt
            onEnable={() => handleVoicePermission(true)}
            onDecline={() => handleVoicePermission(false)}
          />
        );

      case SCREENS.SCANNING:
        return (
          <ScanFlow
            sessionToken={sessionToken}
            voiceEnabled={voiceEnabled}
            onComplete={handleScanComplete}
            onError={handleScanError}
          />
        );

      case SCREENS.LEAD_CAPTURE:
        return (
          <LeadCaptureScreen
            sessionToken={sessionToken}
            onComplete={handleLeadCaptureComplete}
          />
        );

      case SCREENS.ANALYZING:
        return (
          <ScanAnalysisLoader
            sessionToken={sessionToken}
            onComplete={handleAnalysisComplete}
            onError={handleAnalysisError}
            onRetriggerAnalysis={handleRetriggerAnalysis}
          />
        );

      case SCREENS.RESULTS:
        return (
          <ResultsScreen
            results={scanData.results}
            sessionToken={sessionToken}
            onViewDoctors={handleViewDoctors}
            onClose={handleCloseModal}
          />
        );

      case SCREENS.DOCTOR_RECOMMENDATIONS:
        return <DoctorRecommendations onClose={handleCloseModal} />;

      case SCREENS.DOCTOR_SEARCH:
        return <DoctorDiscoveryFlow onClose={handleCloseModal} />;

      case SCREENS.PRESCRIPTION_READER:
        return <PrescriptionReaderFlow onClose={handleCloseModal} />;

      default:
        return <ModeSelection onSelectMode={handleModeSelect} />;
    }
  };

  return (
    <>
      {/* Widget Button */}
      <ChatbotWidget onClick={handleOpenModal} unreadCount={unreadCount} />

      {/* Modal */}
      <ChatbotModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        title={getModalTitle()}
        showVoiceControl={showVoiceControl}
        voiceEnabled={voiceEnabled}
        onToggleVoice={handleToggleVoice}
      >
        <Suspense
          fallback={
            <div style={{ padding: '24px', textAlign: 'center' }}>
              <p>Loading...</p>
            </div>
          }
        >
          {renderScreen()}
        </Suspense>
      </ChatbotModal>
    </>
  );
}
