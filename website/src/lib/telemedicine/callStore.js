/**
 * Module-scoped telemedicine UI store.
 *
 * Holds two pieces of ambient state that need to be visible from any route:
 *   - incomingCall : the payload of the most recent `video:incoming-call` socket
 *                    event, or null when no call is ringing.
 *   - activeCall   : the session the user is currently inside. The <ActiveCallPill>
 *                    uses this to render "In call • return" when the user
 *                    navigates away from /patient/video/:id.
 *
 * A tiny pub/sub avoids pulling in a state-management dependency for a
 * cross-cutting concern.
 */

const listeners = new Set();
const state = {
  incomingCall: null,
  activeCall: null,
};

function publish() {
  const snapshot = { ...state };
  listeners.forEach((fn) => {
    try { fn(snapshot); } catch (err) { console.error('[callStore] listener error', err); }
  });
}

export function getSnapshot() {
  return { ...state };
}

export function subscribe(fn) {
  listeners.add(fn);
  fn({ ...state });
  return () => listeners.delete(fn);
}

// ── Incoming call ──
export function setIncomingCall(payload) {
  state.incomingCall = payload ? { ...payload, ringingAt: Date.now() } : null;
  publish();
}

export function clearIncomingCall() {
  state.incomingCall = null;
  publish();
}

// ── Active call ──
export function setActiveCall(call) {
  // call shape: { sessionId, roomId, peerName, peerRole, startedAt, type, routePath }
  state.activeCall = call ? { ...call, startedAt: call.startedAt || Date.now() } : null;
  publish();
}

export function clearActiveCall() {
  state.activeCall = null;
  publish();
}
