import { useReducer, useCallback, useRef, useEffect } from 'react';
import {
  initiateGuestScan,
  uploadGuestScanImage,
  submitGuestLead,
  triggerGuestAnalysis,
  getGuestScanStatus,
  sendGuestScanReport,
  fetchFeaturedDoctors,
  uploadGuestScanFrame,
  finalizeGuestScanPosition,
} from '../../api/publicApi';
import { getUserLocation } from '../../lib/geolocation';

import { SCAN_POSITIONS, MAX_SCAN_PHOTOS, SCAN_MODE } from '../../constants/dentalScanGuide';

// ── Constants ─────────────────────────────────────────────

// Feature flag: Use enhanced scanner with multi-frame capture + video guides
// Set to false to use legacy ImmersiveScannerCard (guided_3pos)
const USE_ENHANCED_SCANNER = import.meta.env.VITE_USE_ENHANCED_SCANNER === 'true' || false;

const DENTAL_SPECIALIZATIONS = [
  'General Dentistry', 'Periodontics', 'Orthodontics', 'Cosmetic Dentistry',
  'Endodontics', 'Oral Surgery', 'Prosthodontics', 'Pediatric Dentistry',
];

const CITY_COORDS = {
  'Mumbai': { lat: 19.0760, lon: 72.8777 },
  'Pune': { lat: 18.5204, lon: 73.8567 },
  'Bangalore': { lat: 12.9716, lon: 77.5946 },
  'Hyderabad': { lat: 17.3850, lon: 78.4867 },
  'Kolkata': { lat: 22.5726, lon: 88.3639 },
  'Noida': { lat: 28.5355, lon: 77.3910 },
  'Kochi': { lat: 9.9312, lon: 76.2673 },
  'Bhopal': { lat: 23.2599, lon: 77.4126 },
  'Chandigarh': { lat: 30.7333, lon: 76.7794 },
  'Guwahati': { lat: 26.1445, lon: 91.7362 },
};
const AVAILABLE_CITIES = Object.keys(CITY_COORDS);

/** Find nearest city from CITY_COORDS based on user's lat/lon */
function findNearestCity(lat, lon) {
  let nearest = null;
  let minDist = Infinity;
  for (const [city, coords] of Object.entries(CITY_COORDS)) {
    const dlat = lat - coords.lat;
    const dlon = lon - coords.lon;
    const dist = dlat * dlat + dlon * dlon;
    if (dist < minDist) {
      minDist = dist;
      nearest = city;
    }
  }
  return nearest;
}

const TYPING_DELAY = 600;

const STEPS = {
  WELCOME: 'WELCOME',
  CONSENT: 'CONSENT',
  SCAN_INTRO: 'SCAN_INTRO',
  SCANNING: 'SCANNING',
  LEAD_CAPTURE: 'LEAD_CAPTURE',
  ANALYZING: 'ANALYZING',
  RESULTS: 'RESULTS',
  DOCTOR_DISCOVERY: 'DOCTOR_DISCOVERY',
  ERROR: 'ERROR',
  DONE: 'DONE',
};

const POLL_INTERVAL = 3000;
const POLL_TIMEOUT = 120_000; // 2 minutes

const PHASE_PROGRESS = {
  [STEPS.WELCOME]: 0,
  [STEPS.CONSENT]: 10,
  [STEPS.SCAN_INTRO]: 15,
  [STEPS.SCANNING]: 35,
  [STEPS.LEAD_CAPTURE]: 55,
  [STEPS.ANALYZING]: 70,
  [STEPS.RESULTS]: 90,
  [STEPS.DOCTOR_DISCOVERY]: 95,
  [STEPS.DONE]: 100,
  [STEPS.ERROR]: 0,
};

// ── Message helpers ───────────────────────────────────────

let _msgId = 0;
function msg(type, data = {}) {
  return { id: `msg-${++_msgId}`, type, ts: Date.now(), ...data };
}

// ── Helpers ───────────────────────────────────────────────

const INTERACTIVE_TYPES = new Set([
  'bot_action', 'bot_consent', 'bot_scanner', 'bot_immersive_scanner', 'bot_enhanced_scanner',
  'bot_lead_form', 'bot_specializations', 'bot_city_picker', 'bot_location_card',
]);

/** Mark all interactive messages as consumed so they render as disabled */
function consumeInteractives(messages) {
  return messages.map(m =>
    INTERACTIVE_TYPES.has(m.type) && !m.consumed ? { ...m, consumed: true } : m,
  );
}

// ── Reducer ───────────────────────────────────────────────

const INITIAL_STATE = {
  step: STEPS.WELCOME,
  sessionToken: null,
  photoCount: 0,
  uploadedAngles: [],
  capturedPreviews: [],
  result: null,
  error: null,
  leadData: null,
  isLoading: false,
  reportStatus: null, // null | 'sending' | 'sent' | 'failed'
  welcomeKey: 0,
  messages: [
    msg('bot_typing'),
  ],
};

function chatReducer(state, action) {
  switch (action.type) {
    case 'ADD_MESSAGES':
      return { ...state, messages: [...state.messages, ...action.messages] };

    case 'REPLACE_TYPING':
      return {
        ...state,
        messages: [
          ...state.messages.filter(m => m.type !== 'bot_typing'),
          ...action.messages,
        ],
      };

    case 'SET_STEP':
      return { ...state, step: action.step };

    case 'SET_LOADING':
      return { ...state, isLoading: action.loading };

    case 'CONSENT_ACCEPTED':
      return {
        ...state,
        step: STEPS.SCANNING,
        sessionToken: action.sessionToken,
        messages: [
          ...consumeInteractives(
            state.messages.filter(m => !(m.type === 'bot_text' && m.text === 'Setting up your scan session...')),
          ),
          msg('user_reply', { text: 'I consent — Start Scan' }),
          msg(USE_ENHANCED_SCANNER ? 'bot_enhanced_scanner' : 'bot_immersive_scanner'),
        ],
      };

    case 'PHOTO_UPLOADED': {
      const newCount = state.photoCount + 1;
      const newUploaded = [...state.uploadedAngles, action.angle];
      const newPreviews = [...state.capturedPreviews, { angle: action.angle, preview: action.preview }];

      const newMessages = [
        ...state.messages.filter(m =>
          !(m.type === 'bot_upload_status' && !m.done) &&
          !(m.type === 'bot_action' && m.actions?.some(a => a.action === 'analyze_now' || a.action === 'continue_scan'))
        ),
        msg('bot_upload_status', { text: `Photo ${newCount} uploaded`, done: true }),
      ];

      if (newCount < MAX_SCAN_PHOTOS) {
        const nextPos = SCAN_POSITIONS[newCount];
        newMessages.push(
          msg('bot_action', {
            text: `${newCount} of ${MAX_SCAN_PHOTOS} positions captured. Next: ${nextPos?.label || 'done'}.`,
            actions: [
              { label: 'Continue', action: 'continue_scan', variant: 'primary' },
              { label: 'Analyze Now', action: 'analyze_now', variant: 'outline' },
            ],
          }),
        );
      } else {
        const cleaned = consumeInteractives(newMessages.filter(m => m.type !== 'bot_scanner'));
        cleaned.push(
          msg('bot_photo_history', { photos: newPreviews }),
          msg('bot_text', { text: `All ${MAX_SCAN_PHOTOS} positions captured! Now, enter your contact details to see your results.` }),
          msg('bot_lead_form'),
        );
        return {
          ...state,
          photoCount: newCount,
          uploadedAngles: newUploaded,
          capturedPreviews: newPreviews,
          step: STEPS.LEAD_CAPTURE,
          messages: cleaned,
        };
      }

      return {
        ...state,
        photoCount: newCount,
        uploadedAngles: newUploaded,
        capturedPreviews: newPreviews,
        messages: newMessages,
      };
    }

    case 'ALL_PHOTOS_CAPTURED':
      return {
        ...state,
        step: STEPS.LEAD_CAPTURE,
        photoCount: action.photoCount || MAX_SCAN_PHOTOS,
        capturedPreviews: action.previews || state.capturedPreviews,
        messages: [
          ...consumeInteractives(state.messages),
          msg('bot_text', { text: `All ${MAX_SCAN_PHOTOS} positions captured! Now, enter your contact details to see your results.` }),
          msg('bot_lead_form'),
        ],
      };

    case 'ANALYZE_NOW':
      return {
        ...state,
        step: STEPS.LEAD_CAPTURE,
        messages: [
          ...consumeInteractives(
            state.messages.filter(m => m.type !== 'bot_scanner' && m.type !== 'bot_immersive_scanner' && m.type !== 'bot_enhanced_scanner'),
          ),
          msg('user_reply', { text: `Analyze ${state.photoCount} photo${state.photoCount > 1 ? 's' : ''}` }),
          msg('bot_photo_history', { photos: state.capturedPreviews }),
          msg('bot_text', { text: 'Please provide your contact details to receive your scan results.' }),
          msg('bot_lead_form'),
        ],
      };

    case 'CONTINUE_SCAN':
      return {
        ...state,
        messages: [
          ...consumeInteractives(
            state.messages.filter(m =>
              !(m.type === 'bot_action' && m.actions?.some(a => a.action === 'analyze_now' || a.action === 'continue_scan'))
            ),
          ),
          msg('user_reply', { text: 'Capture more' }),
          msg(USE_ENHANCED_SCANNER ? 'bot_enhanced_scanner' : 'bot_immersive_scanner'),
        ],
      };

    case 'LEAD_SUBMITTED':
      return {
        ...state,
        step: STEPS.ANALYZING,
        leadData: action.leadData,
        messages: [
          ...consumeInteractives(
            state.messages.filter(m => m.type !== 'bot_lead_form'),
          ),
          msg('user_reply', { text: `${action.leadData.name} (${action.leadData.email})` }),
          msg('bot_analyzing', { text: 'Our AI is analyzing your dental images. This usually takes 30-60 seconds...' }),
        ],
      };

    case 'ANALYSIS_COMPLETE':
      return {
        ...state,
        step: STEPS.RESULTS,
        result: action.result,
        messages: [
          ...consumeInteractives(
            state.messages.filter(m => m.type !== 'bot_analyzing'),
          ),
          msg('bot_text', { text: 'Analysis complete!' }),
          msg('bot_result_summary', { text: action.result.overallSummary }),
          ...(action.result.healthScore?.overall != null
            ? [msg('bot_health_score', { healthScore: action.result.healthScore })]
            : []),
          msg('bot_dental_chart', { observations: action.result.observations }),
          ...(action.result.observations || []).map((obs) =>
            msg('bot_observation', { observation: obs }),
          ),
          ...(action.result.recommendedSpecs?.length
            ? [
                msg('bot_specializations', { specs: action.result.recommendedSpecs }),
                msg('bot_text', { text: 'Tap a specialization above to browse verified doctors from our partner clinics and book an appointment directly.' }),
              ]
            : []),
          msg('bot_disclaimer', { text: action.result.disclaimer }),
          msg('bot_action', {
            text: 'What would you like to do next?',
            actions: [
              { label: 'Send Report to Email', action: 'send_report', variant: 'primary' },
              { label: 'Start New Scan', action: 'new_scan', variant: 'outline' },
            ],
          }),
        ],
      };

    case 'ANALYSIS_FAILED':
      return {
        ...state,
        step: STEPS.ERROR,
        error: action.error,
        messages: [
          ...consumeInteractives(
            state.messages.filter(m => m.type !== 'bot_analyzing'),
          ),
          msg('bot_text', { text: `Analysis failed: ${action.error}` }),
          msg('bot_action', {
            actions: [
              { label: 'Retry Analysis', action: 'retry_analysis', variant: 'primary' },
              { label: 'Start New Scan', action: 'new_scan', variant: 'outline' },
            ],
          }),
        ],
      };

    case 'RETRY_ANALYSIS':
      return {
        ...state,
        step: STEPS.ANALYZING,
        error: null,
        messages: [
          ...consumeInteractives(state.messages),
          msg('user_reply', { text: 'Retry Analysis' }),
          msg('bot_analyzing', { text: 'Retrying analysis... This usually takes 30-60 seconds.' }),
        ],
      };

    case 'REPORT_SENDING':
      return {
        ...state,
        reportStatus: 'sending',
        messages: [
          ...consumeInteractives(state.messages),
          msg('user_reply', { text: 'Send Report to Email' }),
          msg('bot_text', { text: 'Generating your professional report and sending it to your email...' }),
        ],
      };

    case 'REPORT_SENT':
      return {
        ...state,
        reportStatus: 'sent',
        messages: [
          ...state.messages,
          msg('bot_text', { text: `Report sent! Check your inbox at ${action.email} for your BestoClinic Dental Scan Report (ID: ${action.reportId}).` }),
          ...(state.result?.recommendedSpecs?.length
            ? [msg('bot_text', { text: 'You can also tap a recommended specialization above to find verified doctors and book an appointment.' })]
            : []),
          msg('bot_action', {
            actions: [
              { label: 'Start New Scan', action: 'new_scan', variant: 'outline' },
            ],
          }),
        ],
      };

    case 'REPORT_FAILED':
      return {
        ...state,
        reportStatus: 'failed',
        messages: [
          ...state.messages,
          msg('bot_text', { text: `Failed to send report: ${action.error}` }),
          msg('bot_action', {
            actions: [
              { label: 'Retry Send', action: 'send_report', variant: 'primary' },
              { label: 'Start New Scan', action: 'new_scan', variant: 'outline' },
            ],
          }),
        ],
      };

    // ── Location flow ────────────────────────────────
    case 'SHOW_LOCATION_CARD':
      return {
        ...state,
        step: STEPS.DOCTOR_DISCOVERY,
        messages: [
          ...consumeInteractives(state.messages),
          msg('user_reply', { text: 'Find Nearby Doctors' }),
          msg('bot_location_card'),
        ],
      };

    case 'LOCATION_CHECKING':
      return {
        ...state,
        messages: [
          ...consumeInteractives(state.messages),
          msg('user_reply', { text: 'Use My Location' }),
          msg('bot_typing'),
        ],
      };

    case 'LOCATION_DETECTED':
      return {
        ...state,
        messages: [
          ...state.messages.filter(m => m.type !== 'bot_typing'),
          msg('bot_location_confirmed', { city: action.cityName }),
          msg('bot_text', { text: 'What type of dental specialist are you looking for?' }),
          msg('bot_specializations', { specs: DENTAL_SPECIALIZATIONS, source: 'discovery' }),
        ],
      };

    case 'LOCATION_FAILED':
      return {
        ...state,
        messages: [
          ...state.messages.filter(m => m.type !== 'bot_typing'),
          msg('bot_text', { text: "No worries! Select your city instead." }),
          msg('bot_city_picker', { cities: AVAILABLE_CITIES }),
        ],
      };

    case 'CHOOSE_CITY':
      return {
        ...state,
        messages: [
          ...consumeInteractives(state.messages),
          msg('user_reply', { text: 'Choose City Instead' }),
          msg('bot_text', { text: 'Select your city to find nearby doctors.' }),
          msg('bot_city_picker', { cities: AVAILABLE_CITIES }),
        ],
      };

    case 'CITY_SELECTED':
      return {
        ...state,
        messages: [
          ...consumeInteractives(state.messages),
          msg('user_reply', { text: action.city }),
          msg('bot_location_confirmed', { city: action.city }),
          msg('bot_text', { text: 'What type of dental specialist are you looking for?' }),
          msg('bot_specializations', { specs: DENTAL_SPECIALIZATIONS, source: 'discovery' }),
        ],
      };

    case 'SPEC_CLICKED':
      return {
        ...state,
        step: STEPS.DOCTOR_DISCOVERY,
        messages: [
          ...consumeInteractives(
            state.messages.filter(m =>
              !(m.type === 'bot_action' && m.actions?.some(a => a.action === 'send_report' || a.action === 'new_scan'))
            ),
          ),
          msg('user_reply', { text: action.spec }),
          msg('bot_doctors_loading', { text: action.cityName
            ? `Searching for ${action.spec} specialists near ${action.cityName}...`
            : `Searching for top-rated ${action.spec} specialists...` }),
        ],
      };

    case 'DOCTORS_LOADED': {
      const hasScan = !!state.sessionToken;
      const foundActions = hasScan
        ? [
            { label: 'Send Report to Email', action: 'send_report', variant: 'outline' },
            { label: 'Start New Scan', action: 'new_scan', variant: 'outline' },
          ]
        : [
            { label: 'Browse Other Specializations', action: 'find_doctors', variant: 'outline' },
            { label: 'Start Free Scan', action: 'start_scan', variant: 'outline' },
          ];
      const emptyActions = hasScan
        ? [
            { label: 'Send Report to Email', action: 'send_report', variant: 'primary' },
            { label: 'Start New Scan', action: 'new_scan', variant: 'outline' },
          ]
        : [
            { label: 'Browse Other Specializations', action: 'find_doctors', variant: 'primary' },
            { label: 'Start Free Scan', action: 'start_scan', variant: 'outline' },
          ];

      const clinics = action.clinics;
      const hasResults = clinics && clinics.length > 0;
      const totalDoctors = hasResults ? clinics.reduce((sum, c) => sum + c.doctors.length, 0) : 0;

      return {
        ...state,
        messages: [
          ...state.messages.filter(m => m.type !== 'bot_doctors_loading'),
          ...(hasResults
            ? [
                msg('bot_text', { text: `Found ${totalDoctors} ${action.spec} specialist${totalDoctors > 1 ? 's' : ''} at ${clinics.length} clinic${clinics.length > 1 ? 's' : ''} near you:` }),
                ...clinics.map(clinic => msg('bot_clinic_doctors', { clinic })),
                msg('bot_action', { text: 'Select a doctor above to book, or:', actions: foundActions }),
              ]
            : [
                msg('bot_no_doctors', { spec: action.spec }),
                msg('bot_action', { actions: emptyActions }),
              ]),
        ],
      };
    }

    case 'DOCTORS_LOAD_FAILED': {
      const hasScanSession = !!state.sessionToken;
      return {
        ...state,
        messages: [
          ...state.messages.filter(m => m.type !== 'bot_doctors_loading'),
          msg('bot_text', { text: hasScanSession
            ? 'Could not load doctors at this time. You can still get your report via email.'
            : 'Could not load doctors at this time. Try a different specialization or find a clinic directly.' }),
          msg('bot_action', {
            actions: hasScanSession
              ? [
                  { label: 'Send Report to Email', action: 'send_report', variant: 'primary' },
                  { label: 'Start New Scan', action: 'new_scan', variant: 'outline' },
                ]
              : [
                  { label: 'Browse Other Specializations', action: 'find_doctors', variant: 'primary' },
                  { label: 'Start Free Scan', action: 'start_scan', variant: 'outline' },
                ],
          }),
        ],
      };
    }

    case 'SET_ERROR':
      return {
        ...state,
        error: action.error,
        isLoading: false,
        messages: [
          ...state.messages,
          msg('bot_text', { text: action.error }),
          msg('bot_action', {
            actions: [{ label: 'Try Again', action: 'retry', variant: 'primary' }],
          }),
        ],
      };

    case 'RESET':
      _msgId = 0;
      return { ...INITIAL_STATE, welcomeKey: state.welcomeKey + 1, messages: [msg('bot_typing')] };

    default:
      return state;
  }
}

// ── Hook ──────────────────────────────────────────────────

export function useDentalScanChat() {
  const [state, dispatch] = useReducer(chatReducer, INITIAL_STATE);
  const pollRef = useRef(null);
  const pollStartRef = useRef(null);
  const locationRef = useRef(null);
  const detectedCityRef = useRef(null);

  // Show welcome card after initial typing indicator
  useEffect(() => {
    let active = true;
    setTimeout(() => {
      if (!active) return;
      dispatch({
        type: 'REPLACE_TYPING',
        messages: [msg('bot_welcome_card'), msg('bot_typing')],
      });
    }, TYPING_DELAY);
    setTimeout(() => {
      if (!active) return;
      dispatch({
        type: 'REPLACE_TYPING',
        messages: [
          msg('bot_text', { text: 'How can I help you today?' }),
          msg('bot_action', { actions: [
            { label: 'Start Free Scan', action: 'start_scan', variant: 'primary' },
            { label: 'Find Nearby Doctors', action: 'find_doctors', variant: 'outline' },
          ] }),
        ],
      });
    }, TYPING_DELAY * 2);
    return () => { active = false; };
  }, [state.welcomeKey]);

  // Clean up polling on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const acceptConsent = useCallback(async () => {
    dispatch({ type: 'SET_LOADING', loading: true });
    dispatch({
      type: 'ADD_MESSAGES',
      messages: [msg('bot_text', { text: 'Setting up your scan session...' })],
    });

    try {
      const res = await initiateGuestScan();
      const { sessionToken } = res.data;
      dispatch({ type: 'CONSENT_ACCEPTED', sessionToken });
    } catch (err) {
      dispatch({ type: 'SET_ERROR', error: err.message || 'Failed to start scan session' });
    } finally {
      dispatch({ type: 'SET_LOADING', loading: false });
    }
  }, []);

  const uploadImage = useCallback(async (base64Data, mimeType = 'image/jpeg') => {
    const position = SCAN_POSITIONS[state.photoCount] || SCAN_POSITIONS[0];
    const angle = position.id;

    dispatch({ type: 'SET_LOADING', loading: true });
    dispatch({
      type: 'ADD_MESSAGES',
      messages: [msg('bot_upload_status', { text: `Uploading photo ${state.photoCount + 1}...`, done: false })],
    });

    try {
      await uploadGuestScanImage(state.sessionToken, {
        imageData: base64Data,
        angle,
        mimeType,
      });
      dispatch({ type: 'PHOTO_UPLOADED', angle, preview: base64Data });
    } catch (err) {
      dispatch({ type: 'SET_ERROR', error: err.message || 'Failed to upload image' });
    } finally {
      dispatch({ type: 'SET_LOADING', loading: false });
    }
  }, [state.sessionToken, state.photoCount]);

  const pollFailCountRef = useRef(0);

  const submitLead = useCallback(async (leadData) => {
    dispatch({ type: 'SET_LOADING', loading: true });

    try {
      await submitGuestLead(state.sessionToken, leadData);
      dispatch({ type: 'LEAD_SUBMITTED', leadData });

      try {
        await triggerGuestAnalysis(state.sessionToken);
      } catch (analysisErr) {
        dispatch({
          type: 'ANALYSIS_FAILED',
          error: analysisErr.message || 'Failed to start analysis. Please try again.',
        });
        dispatch({ type: 'SET_LOADING', loading: false });
        return;
      }

      pollFailCountRef.current = 0;
      pollStartRef.current = Date.now();
      pollRef.current = setInterval(async () => {
        try {
          if (Date.now() - pollStartRef.current > POLL_TIMEOUT) {
            clearInterval(pollRef.current);
            pollRef.current = null;
            dispatch({
              type: 'ANALYSIS_FAILED',
              error: 'Analysis timed out. Please try again later.',
            });
            return;
          }

          const res = await getGuestScanStatus(state.sessionToken);
          const { status, result, failureReason } = res.data;
          pollFailCountRef.current = 0; // Reset on success

          if (status === 'completed' && result) {
            clearInterval(pollRef.current);
            pollRef.current = null;
            dispatch({ type: 'ANALYSIS_COMPLETE', result });
          } else if (status === 'failed') {
            clearInterval(pollRef.current);
            pollRef.current = null;
            dispatch({
              type: 'ANALYSIS_FAILED',
              error: failureReason || 'Analysis failed',
            });
          }
        } catch (pollErr) {
          pollFailCountRef.current++;
          console.error('[useDentalScanChat] Poll failed:', pollErr);
          if (pollFailCountRef.current >= 3) {
            clearInterval(pollRef.current);
            pollRef.current = null;
            dispatch({
              type: 'ANALYSIS_FAILED',
              error: 'Unable to check analysis status. Please try again.',
            });
          }
        }
      }, POLL_INTERVAL);
    } catch (err) {
      // Lead submission itself failed — revert to lead capture step
      dispatch({ type: 'SET_ERROR', error: err.message || 'Failed to submit your details. Please try again.' });
    } finally {
      dispatch({ type: 'SET_LOADING', loading: false });
    }
  }, [state.sessionToken]);

  // Called by ImmersiveScannerCard when all 3 positions are auto-captured
  const handleAllCaptured = useCallback((captures) => {
    dispatch({
      type: 'ALL_PHOTOS_CAPTURED',
      photoCount: captures.length,
      previews: captures.map(c => ({ angle: c.angle, preview: c.thumbnailUri })),
    });
  }, []);

  // ── Enhanced Scanner v2.0 handlers ──

  // Upload a single frame for a position (enhanced_3pos mode)
  const uploadFrame = useCallback(async (frameData) => {
    try {
      const res = await uploadGuestScanFrame(state.sessionToken, frameData);
      return res.data;
    } catch (err) {
      throw new Error(err.message || 'Failed to upload frame');
    }
  }, [state.sessionToken]);

  // Finalize a position after all frames uploaded (enhanced_3pos mode)
  const finalizePosition = useCallback(async (positionData) => {
    try {
      const res = await finalizeGuestScanPosition(state.sessionToken, positionData);
      return res.data;
    } catch (err) {
      throw new Error(err.message || 'Failed to finalize position');
    }
  }, [state.sessionToken]);

  // Retry analysis: re-trigger on backend and restart polling (keeps photos + lead data)
  const retryAnalysis = useCallback(async () => {
    if (!state.sessionToken) return;

    dispatch({ type: 'RETRY_ANALYSIS' });

    // Clear any stale poll
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }

    try {
      await triggerGuestAnalysis(state.sessionToken);
    } catch {
      // If re-trigger fails, still start polling (backend may already be processing)
    }

    pollFailCountRef.current = 0;
    pollStartRef.current = Date.now();
    pollRef.current = setInterval(async () => {
      try {
        if (Date.now() - pollStartRef.current > POLL_TIMEOUT) {
          clearInterval(pollRef.current);
          pollRef.current = null;
          dispatch({
            type: 'ANALYSIS_FAILED',
            error: 'Analysis timed out. Please try again later.',
          });
          return;
        }

        const res = await getGuestScanStatus(state.sessionToken);
        const { status, result, failureReason } = res.data;
        pollFailCountRef.current = 0;

        if (status === 'completed' && result) {
          clearInterval(pollRef.current);
          pollRef.current = null;
          dispatch({ type: 'ANALYSIS_COMPLETE', result });
        } else if (status === 'failed') {
          clearInterval(pollRef.current);
          pollRef.current = null;
          dispatch({
            type: 'ANALYSIS_FAILED',
            error: failureReason || 'Analysis failed',
          });
        }
      } catch {
        pollFailCountRef.current++;
        if (pollFailCountRef.current >= 3) {
          clearInterval(pollRef.current);
          pollRef.current = null;
          dispatch({
            type: 'ANALYSIS_FAILED',
            error: 'Unable to check analysis status. Please try again.',
          });
        }
      }
    }, POLL_INTERVAL);
  }, [state.sessionToken]);

  const sendReport = useCallback(async () => {
    dispatch({ type: 'REPORT_SENDING' });
    try {
      const res = await sendGuestScanReport(state.sessionToken);
      dispatch({ type: 'REPORT_SENT', email: res.data.email, reportId: res.data.reportId });
    } catch (err) {
      dispatch({ type: 'REPORT_FAILED', error: err.message || 'Failed to send report' });
    }
  }, [state.sessionToken]);

  // ── Location permission handler ──
  const handleLocationPermission = useCallback(async (choice) => {
    if (choice === 'allow') {
      dispatch({ type: 'LOCATION_CHECKING' });
      try {
        const loc = await getUserLocation();
        locationRef.current = loc;
        const cityName = findNearestCity(loc.lat, loc.lon);
        if (cityName) detectedCityRef.current = cityName;
        dispatch({ type: 'LOCATION_DETECTED', cityName: cityName || 'your area' });
      } catch {
        dispatch({ type: 'LOCATION_FAILED' });
      }
    } else {
      dispatch({ type: 'CHOOSE_CITY' });
    }
  }, []);

  const handleCitySelect = useCallback((city) => {
    const coords = CITY_COORDS[city];
    if (coords) {
      locationRef.current = coords;
      detectedCityRef.current = city;
    }
    dispatch({ type: 'CITY_SELECTED', city });
  }, []);

  const selectSpecialization = useCallback(async (spec) => {
    dispatch({ type: 'SPEC_CLICKED', spec, cityName: detectedCityRef.current });
    try {
      const params = { specialization: spec, limit: 20 };
      if (locationRef.current) {
        params.lat = locationRef.current.lat;
        params.lon = locationRef.current.lon;
      }
      const res = await fetchFeaturedDoctors(params);
      dispatch({ type: 'DOCTORS_LOADED', clinics: res.data || [], spec });
    } catch {
      dispatch({ type: 'DOCTORS_LOAD_FAILED' });
    }
  }, []);

  const bookDoctor = useCallback((doctor) => {
    const params = new URLSearchParams({
      clinic: doctor.clinicSlug,
      doctor: doctor.tenantDoctorId,
      platformId: doctor._id,
    });
    if (state.leadData?.email) params.set('email', state.leadData.email);
    if (state.leadData?.name) params.set('name', state.leadData.name);
    if (state.leadData?.phone) params.set('phone', state.leadData.phone);
    window.location.href = `/patient/register?${params.toString()}`;
  }, [state.leadData]);

  const handleAction = useCallback((action) => {
    switch (action) {
      case 'start_scan':
        dispatch({ type: 'SET_STEP', step: STEPS.CONSENT });
        dispatch({
          type: 'ADD_MESSAGES',
          messages: [
            msg('user_reply', { text: 'Start Free Scan' }),
            msg('bot_consent'),
          ],
        });
        break;
      case 'find_doctors':
        dispatch({ type: 'SHOW_LOCATION_CARD' });
        break;
      case 'analyze_now':
        dispatch({ type: 'ANALYZE_NOW' });
        break;
      case 'continue_scan':
        dispatch({ type: 'CONTINUE_SCAN' });
        break;
      case 'send_report':
        sendReport();
        break;
      case 'retry_analysis':
        retryAnalysis();
        break;
      case 'new_scan':
        if (pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
        dispatch({ type: 'RESET' });
        break;
      case 'retry':
        if (pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
        dispatch({ type: 'RESET' });
        break;
      default:
        break;
    }
  }, [sendReport, retryAnalysis]);

  const reset = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    dispatch({ type: 'RESET' });
  }, []);

  const progress = PHASE_PROGRESS[state.step] ?? 0;

  return {
    ...state,
    photoCount: state.photoCount,
    maxPhotos: MAX_SCAN_PHOTOS,
    progress,
    acceptConsent,
    uploadImage,
    handleAllCaptured,
    uploadFrame,
    finalizePosition,
    submitLead,
    handleAction,
    sendReport,
    selectSpecialization,
    handleLocationPermission,
    handleCitySelect,
    bookDoctor,
    reset,
  };
}

export { STEPS };
