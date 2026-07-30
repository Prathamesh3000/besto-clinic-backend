/**
 * Wires the global socket stream into the module-level callStore.
 * Mount this hook ONCE at the app shell level (patient or tenant layout).
 *
 * It handles:
 *   - `video:incoming-call` → setIncomingCall
 *   - `video:call-ended`    → clearIncomingCall + clearActiveCall
 *   - `emergency:accepted`  → when payload.videoSessionId arrives, we treat
 *                             it as an incoming emergency call for the patient
 *                             (doctor ringing them into the auto-created room)
 */
import { useEffect } from 'react';
import {
  onIncomingCall,
  callLife,
  emergencyBus,
} from '../socket';
import {
  setIncomingCall,
  clearIncomingCall,
  clearActiveCall,
  getSnapshot,
} from './callStore';

export function useCallBridge({ currentUserId, enabled = true } = {}) {
  useEffect(() => {
    if (!enabled) return () => {};

    const offIncoming = onIncomingCall((payload) => {
      if (!payload?.sessionId) return;
      const snap = getSnapshot();
      // If this user is already inside that exact call, don't re-ring.
      if (snap.activeCall?.sessionId === payload.sessionId) return;
      // Don't ring at all while in ANY active call — the missed-call
      // path (45s auto-dismiss) handles the caller side gracefully.
      if (snap.activeCall) return;
      setIncomingCall(payload);
    });

    const offLife = callLife.on((event, payload) => {
      if (event === 'video:call-ended') {
        // If the active call just ended, clear it.
        const snap = getSnapshot();
        if (snap.activeCall?.sessionId && payload?.sessionId && snap.activeCall.sessionId === payload.sessionId) {
          clearActiveCall();
        }
        // Also dismiss any stale ringing overlay for the same session.
        if (snap.incomingCall?.sessionId === payload?.sessionId) {
          clearIncomingCall();
        }
      }
    });

    const offEmergency = emergencyBus.on((event, payload) => {
      if (event === 'emergency:accepted' && payload?.videoSessionId) {
        // Doctor just accepted the patient's emergency — ring the patient into
        // the auto-created VideoSession. For the patient it looks like an
        // incoming call from the doctor.
        setIncomingCall({
          sessionId:    payload.videoSessionId,
          roomId:       payload.roomId,
          callerName:   payload.doctor?.name || 'Your clinician',
          callerRole:   'doctor',
          type:         payload.type || 'emergency',
          reason:       payload.reason || 'Emergency consultation',
        });
      }
    });

    return () => {
      offIncoming();
      offLife();
      offEmergency();
    };
    // currentUserId retained for future filtering (e.g. suppress self-initiated calls)
  }, [enabled, currentUserId]);
}
