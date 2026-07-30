import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useTenantAuth } from '../TenantAuthContext';
import {
  getVideoSession, joinVideoSession, endVideoSession,
  sendVideoMessage, getVideoMessages, updateVideoConsent,
  shareVideoFile, logVideoEvent, extendVideoSession,
} from '../api';
import {
  Video, VideoOff, Mic, MicOff, Phone, PhoneOff,
  MessageSquare, X, Send, Paperclip, Shield, Clock,
  AlertCircle, Wifi, WifiOff, Maximize, Minimize,
  FileText, Camera, CameraOff, MonitorUp, Pause, Play,
  ChevronDown, ClipboardList, TimerReset, Plus, Loader2,
  Image as ImageIcon,
} from 'lucide-react';
import {
  initSocket, joinVideoRoom, leaveVideoRoom,
  sendVideoOffer, sendVideoAnswer, sendIceCandidate,
  sendMediaToggle, onVideoEvent, offVideoEvent,
  chatBus,
} from '../../lib/socket';

/* ── ICE Configuration ──────────────────────────────────────── */
const ICE_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

/* ── Status Badge ───────────────────────────────────────────── */
const STATUS_STYLES = {
  requested: 'bg-amber-50 text-amber-700 border-amber-200',
  scheduled: 'bg-blue-50 text-blue-700 border-blue-200',
  waiting:   'bg-purple-50 text-purple-700 border-purple-200',
  active:    'bg-emerald-50 text-emerald-700 border-emerald-200',
  paused:    'bg-orange-50 text-orange-700 border-orange-200',
  ended:     'bg-gray-50 text-gray-600 border-gray-200',
  cancelled: 'bg-red-50 text-red-600 border-red-200',
  expired:   'bg-gray-50 text-gray-400 border-gray-200',
};

function StatusBadge({ status }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${STATUS_STYLES[status] || STATUS_STYLES.ended}`}>
      {status}
    </span>
  );
}

/* ── Duration Timer ─────────────────────────────────────────── */
function DurationTimer({ startedAt, isActive }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!startedAt || !isActive) return;
    const start = new Date(startedAt).getTime();
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - start) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [startedAt, isActive]);

  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;
  return (
    <div className="flex items-center gap-1.5 text-sm font-mono">
      <Clock className="h-4 w-4" />
      <span>{String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}</span>
    </div>
  );
}

/* ── Download helper (handles data-URL → Blob for PDFs etc.) ── */
function downloadAttachment(attachment) {
  if (!attachment?.url) return;
  const url = attachment.url;
  const name = attachment.name || 'download';

  if (url.startsWith('data:')) {
    try {
      const [header, b64] = url.split(',');
      const mime = (header.match(/data:(.*?);/) || [])[1] || 'application/octet-stream';
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const blob = new Blob([bytes], { type: mime });
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } catch {
      const a = document.createElement('a');
      a.href = url; a.download = name; a.target = '_blank'; a.rel = 'noreferrer';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
    }
    return;
  }

  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.target = '_blank';
  a.rel = 'noreferrer';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

/* ── Chat Panel ─────────────────────────────────────────────── */
function ChatPanel({ sessionId, isOpen, onClose }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [sendError, setSendError] = useState(null);
  const [lightboxUrl, setLightboxUrl] = useState(null);
  const bottomRef = useRef(null);
  const isAtBottomRef = useRef(true);
  const listRef = useRef(null);
  const { user } = useTenantAuth();

  const fetchMessages = useCallback(async () => {
    try {
      const res = await getVideoMessages(sessionId, { limit: 100 });
      const items = res.data || [];
      // Server returns newest first — reverse for chronological display (oldest at top)
      setMessages([...items].reverse());
    } catch { /* ignore */ }
  }, [sessionId]);

  useEffect(() => {
    if (!isOpen || !sessionId) return;
    fetchMessages();
    const interval = setInterval(fetchMessages, 5000);

    const unsub = chatBus.on((_event, payload) => {
      if (payload?.session === sessionId || payload?.sessionId === sessionId) {
        const id = payload.messageId || payload._id;
        setMessages((prev) => {
          if (prev.some((m) => m._id === id)) return prev;
          return [...prev, { ...payload, _id: id }];
        });
      }
    });
    return () => { clearInterval(interval); unsub(); };
  }, [isOpen, sessionId, fetchMessages]);

  useEffect(() => {
    if (isAtBottomRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages.length]);

  const onListScroll = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    isAtBottomRef.current = el.scrollHeight - (el.scrollTop + el.clientHeight) < 40;
  }, []);

  const handleSend = async () => {
    if (!input.trim()) return;
    setLoading(true);
    setSendError(null);
    try {
      await sendVideoMessage(sessionId, { content: input.trim(), type: 'text' });
      setInput('');
      fetchMessages();
    } catch (err) {
      setSendError(err.message || 'Failed to send message');
    }
    setLoading(false);
  };

  if (!isOpen) return null;

  return (
    <div className="w-80 bg-white border-l border-neutral-200 flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-100">
        <div className="flex items-center gap-2">
          <span className="w-7 h-7 rounded-lg bg-primary-50 text-primary-600 flex items-center justify-center">
            <MessageSquare className="h-3.5 w-3.5" />
          </span>
          <h3 className="text-sm font-semibold text-neutral-900">In-call chat</h3>
        </div>
        <button onClick={onClose} className="p-1 rounded-lg hover:bg-neutral-100 text-neutral-400">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Messages */}
      <div ref={listRef} onScroll={onListScroll} className="flex-1 overflow-y-auto p-3 space-y-2">
        {messages.length === 0 && (
          <p className="text-center text-xs text-neutral-400 py-8">No messages yet. Say hello.</p>
        )}
        {messages.map((msg, i) => {
          const senderId = String(msg.sender?._id || msg.sender);
          const userId = String(user?.id || user?._id);
          const isOwn = senderId === userId;
          const isImage = msg.attachment?.mimeType?.startsWith('image/');
          return (
            <div key={msg._id || i} className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[75%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed shadow-sm overflow-hidden ${
                msg.type === 'system'
                  ? 'bg-neutral-100 text-neutral-500 text-center w-full text-xs italic'
                  : isOwn
                    ? 'bg-primary-600 text-white rounded-br-md'
                    : 'bg-neutral-100 text-neutral-800 rounded-bl-md'
              }`}>
                {msg.attachment ? (
                  isImage ? (
                    <div>
                      <button type="button" onClick={() => setLightboxUrl(msg.attachment.url)} className="block">
                        <img src={msg.attachment.url} alt={msg.attachment.name} className="max-w-full rounded-lg max-h-48 object-cover cursor-pointer hover:opacity-90 transition" />
                      </button>
                      <p className="text-[11px] mt-1.5 opacity-70 truncate flex items-center gap-1">
                        <ImageIcon className="w-3 h-3" /> {msg.attachment.name}
                      </p>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => downloadAttachment(msg.attachment)}
                      className={`flex items-center gap-2 -mx-1 px-2 py-1.5 rounded-lg cursor-pointer min-w-0 max-w-full ${isOwn ? 'bg-white/10 hover:bg-white/20' : 'bg-white hover:bg-neutral-50'}`}>
                      <FileText className="h-4 w-4 shrink-0" />
                      <span className="min-w-0 truncate text-[13px]">{msg.attachment.name}</span>
                    </button>
                  )
                ) : (
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                )}
                <p className={`text-[10px] mt-1 ${isOwn ? 'text-white/50' : 'text-neutral-400'}`}>
                  {msg.senderRole} · {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="p-3 border-t border-neutral-100 bg-neutral-50/60">
        {sendError && (
          <p className="text-xs text-rose-600 mb-1.5 px-1">{sendError}</p>
        )}
        <div className="flex items-center gap-2">
          <input
            value={input}
            onChange={(e) => { setInput(e.target.value); setSendError(null); }}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
            placeholder="Type a message..."
            className="flex-1 px-3 py-2 text-sm border border-neutral-200 rounded-xl bg-white focus:ring-2 focus:ring-primary-100 focus:border-primary-400 outline-none"
          />
          <button
            onClick={handleSend}
            disabled={loading || !input.trim()}
            className="p-2 rounded-xl bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-40 transition"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Image lightbox */}
      {lightboxUrl && (
        <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setLightboxUrl(null)}>
          <button onClick={() => setLightboxUrl(null)} className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white">
            <X className="h-5 w-5" />
          </button>
          <img src={lightboxUrl} alt="Preview" className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl" onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </div>
  );
}

/* ── Main VideoCallPage ─────────────────────────────────────── */
export default function VideoCallPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useTenantAuth();

  // Session state
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [roomData, setRoomData] = useState(null);

  // Media state
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [screenSharing, setScreenSharing] = useState(false);
  const [connectionState, setConnectionState] = useState('new');
  const [peerInRoom, setPeerInRoom] = useState(false);
  const [remoteAudioEnabled, setRemoteAudioEnabled] = useState(true);
  const [remoteVideoEnabled, setRemoteVideoEnabled] = useState(true);
  const [streamReady, setStreamReady] = useState(false);

  // UI state
  const [chatOpen, setChatOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [recordingConsent, setRecordingConsent] = useState(false);
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [isOnHold, setIsOnHold] = useState(false);
  const [disconnectedFatal, setDisconnectedFatal] = useState(false);

  // Device selection
  const [devices, setDevices] = useState({ cameras: [], mics: [] });
  const [selectedCamera, setSelectedCamera] = useState('');
  const [selectedMic, setSelectedMic] = useState('');
  const [showExpiryBanner, setShowExpiryBanner] = useState(false);
  const [extending, setExtending] = useState(false);

  // Preview (pre-join) state
  const [previewStream, setPreviewStream] = useState(null);
  const [previewLevel, setPreviewLevel] = useState(0);
  const [permissionError, setPermissionError] = useState(null);

  // Refs
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const previewVideoRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteStreamRef = useRef(null);
  const screenStreamRef = useRef(null);
  const screenSharingRef = useRef(false);
  const reconnectTimerRef = useRef(null);
  const reconnectCountRef = useRef(0);
  const videoListenerRef = useRef(null);
  const roomIdRef = useRef(null);
  const pendingCandidatesRef = useRef([]);
  const analyserRef = useRef(null);
  const levelRafRef = useRef(null);

  // ── Preview media (pre-join camera + audio meter) ──
  useEffect(() => {
    let cancelled = false;
    let audioCtx;
    let localStream; // accessible in cleanup
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
          audio: { echoCancellation: true, noiseSuppression: true },
        });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        localStream = stream;
        setPreviewStream(stream);
        // Note: previewVideoRef.current is likely null here because the <video>
        // is conditionally rendered on previewStream. A separate useEffect below
        // handles connecting srcObject after React re-renders the element.

        // Enumerate available devices for picker
        try {
          const devs = await navigator.mediaDevices.enumerateDevices();
          const cameras = devs.filter((d) => d.kind === 'videoinput');
          const mics = devs.filter((d) => d.kind === 'audioinput');
          if (!cancelled) setDevices({ cameras, mics });
        } catch { /* device enumeration best-effort */ }
        // Audio level analyser
        audioCtx = new AudioContext();
        if (audioCtx.state === 'suspended') await audioCtx.resume();
        const src = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.5;
        src.connect(analyser);
        analyserRef.current = analyser;
        const data = new Uint8Array(analyser.frequencyBinCount);
        const tick = () => {
          analyser.getByteFrequencyData(data);
          const sum = data.reduce((a, b) => a + b, 0);
          setPreviewLevel(sum / data.length / 255);
          levelRafRef.current = requestAnimationFrame(tick);
        };
        tick();
      } catch {
        if (!cancelled) setPermissionError('Camera or microphone access denied.');
      }
    })();
    return () => {
      cancelled = true;
      if (levelRafRef.current) cancelAnimationFrame(levelRafRef.current);
      if (audioCtx) audioCtx.close().catch(() => {});
      // Stop preview tracks if not handed off to the live call
      if (localStream && localStream !== localStreamRef.current) {
        localStream.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  // Sync previewStream to the video element after React renders the conditional <video>
  useEffect(() => {
    if (previewVideoRef.current && previewStream) {
      previewVideoRef.current.srcObject = previewStream;
    }
  }, [previewStream]);

  // ── Fetch Session ──────────────────────────────
  useEffect(() => {
    fetchSession();
  }, [id]);

  const fetchSession = async () => {
    try {
      setLoading(true);
      const res = await getVideoSession(id);
      setSession(res.data || res);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // ── Join Session ───────────────────────────────
  const handleJoin = async () => {
    try {
      setError(null);
      const res = await joinVideoSession(id);
      const data = res.data || res;
      setRoomData(data);

      // Update session with latest status
      setSession((prev) => ({ ...prev, ...data.session, status: data.session?.status || 'active' }));

      // Start local media
      await startLocalMedia();
      setConnectionState('connecting');
      setupPeerConnection(data);

      // Connect Socket.IO and join signaling room
      roomIdRef.current = data.roomId;
      initSocket();
      joinVideoRoom(data.roomId, data.token, data.iv);
    } catch (err) {
      setError(err.message);
    }
  };

  // ── Local Media ────────────────────────────────
  const startLocalMedia = async () => {
    // Stop preview audio level analyser
    if (levelRafRef.current) { cancelAnimationFrame(levelRafRef.current); levelRafRef.current = null; }

    // Reuse preview stream if available, otherwise request new
    let stream = previewStream;
    if (!stream) {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
          audio: { echoCancellation: true, noiseSuppression: true },
        });
      } catch (err) {
        setError('Camera/microphone access denied. Please allow access and try again.');
        return;
      }
    }
    localStreamRef.current = stream;
    setStreamReady(true);
    setPreviewStream(null); // preview no longer needed
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = stream;
    }
  };

  // ── WebRTC Peer Connection ─────────────────────
  const setupPeerConnection = (data) => {
    const iceConfig = data.iceServers?.length ? { iceServers: data.iceServers } : ICE_CONFIG;
    const pc = new RTCPeerConnection(iceConfig);
    peerConnectionRef.current = pc;

    // Add local tracks
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        pc.addTrack(track, localStreamRef.current);
      });
    }

    // Handle remote tracks — store stream in ref so sync effect can pick it up
    // even if the <video> element hasn't mounted yet.
    pc.ontrack = (event) => {
      const stream = event.streams?.[0];
      if (stream) {
        remoteStreamRef.current = stream;
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = stream;
        }
      }
    };

    // Send ICE candidates to remote peer via signaling
    pc.onicecandidate = (event) => {
      if (event.candidate && roomIdRef.current) {
        sendIceCandidate(roomIdRef.current, event.candidate);
      }
    };

    // Connection state
    pc.onconnectionstatechange = () => {
      setConnectionState(pc.connectionState);
      logVideoEvent(id, {
        event: pc.connectionState === 'connected' ? 'reconnected' : 'disconnected',
        metadata: { state: pc.connectionState },
      }).catch(() => {});

      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        scheduleReconnect();
      }
    };

    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'connected') setConnectionState('connected');
    };

    // Register signaling event listener
    if (videoListenerRef.current) offVideoEvent(videoListenerRef.current);
    const listener = async (eventName, payload) => {
      const currentPc = peerConnectionRef.current;
      if (!currentPc) return;
      const roomId = roomIdRef.current;

      switch (eventName) {
        case 'video:user-joined':
        case 'video:peer-joined': {
          setPeerInRoom(true);
          // Promote status to 'active' — server already did this atomically when 2nd participant joined
          setSession((prev) => prev && prev.status === 'waiting' ? { ...prev, status: 'active' } : prev);
          if (eventName === 'video:peer-joined') break; // informational only
          // Only create offer on user-joined (sent to others only — no self-echo).
          // Guard: skip if we already have a pending local description (glare prevention).
          try {
            if (currentPc.signalingState !== 'stable') {
              console.warn('[WebRTC] Skipping offer — signalingState:', currentPc.signalingState);
              break;
            }
            const offer = await currentPc.createOffer();
            await currentPc.setLocalDescription(offer);
            sendVideoOffer(roomId, offer);
          } catch (err) {
            console.error('[WebRTC] createOffer failed:', err);
          }
          break;
        }
        case 'video:offer': {
          try {
            await currentPc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
            // Flush buffered ICE candidates now that remote description is set
            for (const c of pendingCandidatesRef.current) {
              try { await currentPc.addIceCandidate(c); } catch {}
            }
            pendingCandidatesRef.current = [];
            const answer = await currentPc.createAnswer();
            await currentPc.setLocalDescription(answer);
            sendVideoAnswer(roomId, answer);
          } catch (err) {
            console.error('[WebRTC] handleOffer failed:', err);
          }
          break;
        }
        case 'video:answer': {
          try {
            await currentPc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
            // Flush buffered ICE candidates now that remote description is set
            for (const c of pendingCandidatesRef.current) {
              try { await currentPc.addIceCandidate(c); } catch {}
            }
            pendingCandidatesRef.current = [];
          } catch (err) {
            console.error('[WebRTC] handleAnswer failed:', err);
          }
          break;
        }
        case 'video:ice-candidate': {
          try {
            if (payload.candidate) {
              const candidate = new RTCIceCandidate(payload.candidate);
              if (!currentPc.remoteDescription) {
                pendingCandidatesRef.current.push(candidate);
              } else {
                await currentPc.addIceCandidate(candidate);
              }
            }
          } catch (err) {
            console.error('[WebRTC] addIceCandidate failed:', err);
          }
          break;
        }
        case 'video:user-left':
        case 'video:peer-left': {
          if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
          remoteStreamRef.current = null;
          setPeerInRoom(false);
          setConnectionState('disconnected');
          break;
        }
        case 'video:toggle-media':
        case 'video:media-state': {
          // Guard: ignore own media-state echo (io.to sends to everyone including sender)
          if (payload.userId && String(payload.userId) === String(user?.id || user?._id)) break;
          if (payload.mediaType === 'audio') setRemoteAudioEnabled(payload.enabled);
          if (payload.mediaType === 'video') setRemoteVideoEnabled(payload.enabled);
          break;
        }
        case 'video:call-ended': {
          cleanup();
          setConnectionState('disconnected');
          setError('The call has ended');
          break;
        }
        case 'video:session-extended': {
          setSession((prev) => prev ? { ...prev, expiresAt: payload.expiresAt, maxDuration: payload.maxDuration, extensions: payload.extensionsUsed } : prev);
          setShowExpiryBanner(false);
          break;
        }
        case 'video:error': {
          setError(payload.message || 'Signaling error');
          break;
        }
      }
    };
    videoListenerRef.current = listener;
    onVideoEvent(listener);
  };

  // ── Reconnection Logic ─────────────────────────
  const MAX_RECONNECT_ATTEMPTS = 5;
  const scheduleReconnect = () => {
    if (reconnectTimerRef.current) return;
    if (reconnectCountRef.current >= MAX_RECONNECT_ATTEMPTS) {
      setDisconnectedFatal(true);
      setConnectionState('disconnected');
      return;
    }
    const attempt = reconnectCountRef.current;
    const delay = Math.min(3000 * Math.pow(1.5, attempt), 15000); // exponential backoff, max 15s
    reconnectCountRef.current = attempt + 1;
    setConnectionState('reconnecting');
    reconnectTimerRef.current = setTimeout(async () => {
      reconnectTimerRef.current = null;
      try {
        await handleJoin();
        reconnectCountRef.current = 0;
        setDisconnectedFatal(false);
      } catch { /* ignore */ }
    }, delay);
  };

  // ── Rejoin (manual, after auto-reconnect exhausted) ──
  const handleRejoin = async () => {
    setDisconnectedFatal(false);
    setError(null);
    reconnectCountRef.current = 0;
    // Tear down stale peer connection
    if (peerConnectionRef.current) { peerConnectionRef.current.close(); peerConnectionRef.current = null; }
    if (localStreamRef.current) { localStreamRef.current.getTracks().forEach((t) => t.stop()); localStreamRef.current = null; }
    if (screenStreamRef.current) { screenStreamRef.current.getTracks().forEach((t) => t.stop()); screenStreamRef.current = null; }
    setStreamReady(false);
    setScreenSharing(false);
    try {
      await handleJoin();
    } catch (err) {
      setError(err.message || 'Rejoin failed. Please try again.');
    }
  };

  // ── Toggle Controls ────────────────────────────
  const toggleVideo = async () => {
    if (screenSharingRef.current) return; // no-op while sharing screen
    if (!localStreamRef.current) return;

    const track = localStreamRef.current.getVideoTracks()[0];
    const next = !videoEnabled;

    // If the track is dead (e.g. ended after screen share), re-acquire
    if (!track || track.readyState === 'ended') {
      if (!next) {
        // Turning off — just update state, nothing to disable
        setVideoEnabled(false);
        if (roomIdRef.current) sendMediaToggle(roomIdRef.current, 'video', false);
        return;
      }
      try {
        const freshStream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
          audio: false,
        });
        const freshTrack = freshStream.getVideoTracks()[0];
        // Swap dead track for live one in the local stream
        if (track) localStreamRef.current.removeTrack(track);
        localStreamRef.current.addTrack(freshTrack);
        // Replace in peer connection
        if (peerConnectionRef.current) {
          const sender = peerConnectionRef.current.getSenders().find((s) => s.track?.kind === 'video');
          if (sender) await sender.replaceTrack(freshTrack);
        }
        if (localVideoRef.current) localVideoRef.current.srcObject = localStreamRef.current;
        freshTrack.enabled = true;
        setVideoEnabled(true);
        if (roomIdRef.current) sendMediaToggle(roomIdRef.current, 'video', true);
      } catch {
        setError('Could not re-start camera.');
      }
      return;
    }

    track.enabled = next;
    setVideoEnabled(next);
    if (roomIdRef.current) sendMediaToggle(roomIdRef.current, 'video', next);
  };

  const toggleAudio = () => {
    if (localStreamRef.current) {
      const next = !audioEnabled;
      localStreamRef.current.getAudioTracks().forEach((t) => { t.enabled = next; });
      setAudioEnabled(next);
      if (roomIdRef.current) sendMediaToggle(roomIdRef.current, 'audio', next);
    }
  };

  /**
   * Restore the camera track after screen sharing ends.
   * If the original camera track died, re-acquires a fresh one via getUserMedia.
   */
  const restoreCameraFromScreenShare = async () => {
    if (!screenSharingRef.current) return; // already reverted

    // Stop screen tracks
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((t) => t.stop());
      screenStreamRef.current = null;
    }

    // Get the camera track — re-acquire if dead
    let cameraTrack = localStreamRef.current?.getVideoTracks()[0];
    if (!cameraTrack || cameraTrack.readyState === 'ended') {
      try {
        const freshStream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
          audio: false,
        });
        const freshTrack = freshStream.getVideoTracks()[0];
        if (localStreamRef.current) {
          // Remove dead track if present
          const deadTrack = localStreamRef.current.getVideoTracks()[0];
          if (deadTrack) localStreamRef.current.removeTrack(deadTrack);
          localStreamRef.current.addTrack(freshTrack);
        }
        cameraTrack = freshTrack;
      } catch {
        /* Camera re-acquire failed — user may have revoked permission */
      }
    }

    // Replace screen track with camera track in peer connection
    if (peerConnectionRef.current && cameraTrack) {
      const sender = peerConnectionRef.current.getSenders().find((s) => s.track?.kind === 'video');
      if (sender) {
        await sender.replaceTrack(cameraTrack).catch(() => {});
        cameraTrack.enabled = videoEnabled;
      }
    }

    // Restore PiP to camera stream
    if (localVideoRef.current && localStreamRef.current) {
      localVideoRef.current.srcObject = localStreamRef.current;
    }

    screenSharingRef.current = false;
    setScreenSharing(false);
  };

  const toggleScreenShare = async () => {
    if (screenSharingRef.current) {
      // Stop screen sharing
      await restoreCameraFromScreenShare();
    } else {
      try {
        if (!peerConnectionRef.current) {
          setError('Cannot share screen — peer connection not established yet.');
          return;
        }
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        screenStreamRef.current = screenStream;
        const screenTrack = screenStream.getVideoTracks()[0];

        // Replace video track in peer connection
        const sender = peerConnectionRef.current.getSenders().find((s) => s.track?.kind === 'video');
        if (sender) {
          await sender.replaceTrack(screenTrack);
        } else {
          screenStream.getTracks().forEach((t) => t.stop());
          setError('Cannot share screen — no video sender found.');
          return;
        }

        // Show screen share in local preview
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = screenStream;
        }

        // When the browser's native "Stop sharing" fires, revert directly
        // (avoids stale closure — uses ref instead of state)
        screenTrack.onended = () => {
          restoreCameraFromScreenShare();
        };

        screenSharingRef.current = true;
        setScreenSharing(true);
      } catch (err) {
        if (err.name !== 'AbortError' && err.name !== 'NotAllowedError') {
          setError('Screen sharing failed: ' + err.message);
        }
        // user cancelled or permission denied — do nothing
      }
    }
  };

  // ── Hold / Resume ─────────────────────────────
  const toggleHold = () => {
    if (!localStreamRef.current) return;
    const next = !isOnHold;
    localStreamRef.current.getTracks().forEach((t) => { t.enabled = !next; });
    setIsOnHold(next);
    setAudioEnabled(!next);
    setVideoEnabled(!next);
    if (roomIdRef.current) {
      sendMediaToggle(roomIdRef.current, 'audio', !next);
      sendMediaToggle(roomIdRef.current, 'video', !next);
    }
  };

  // ── Switch Device ────────────────────────────
  const switchDevice = async (kind, deviceId) => {
    if (kind === 'videoinput') setSelectedCamera(deviceId);
    else setSelectedMic(deviceId);
    // Replace stream tracks with the new device
    try {
      const constraints = kind === 'videoinput'
        ? { video: { deviceId: { exact: deviceId } }, audio: false }
        : { video: false, audio: { deviceId: { exact: deviceId }, echoCancellation: true, noiseSuppression: true } };
      const newStream = await navigator.mediaDevices.getUserMedia(constraints);
      const newTrack = newStream.getTracks()[0];
      const stream = localStreamRef.current || previewStream;
      if (!stream) { newTrack.stop(); return; }
      const oldTrack = stream.getTracks().find((t) => t.kind === newTrack.kind);
      if (oldTrack) { stream.removeTrack(oldTrack); oldTrack.stop(); }
      stream.addTrack(newTrack);
      // Replace in peer connection if active
      if (peerConnectionRef.current) {
        const sender = peerConnectionRef.current.getSenders().find((s) => s.track?.kind === newTrack.kind);
        if (sender) sender.replaceTrack(newTrack);
      }
      // Update video preview if camera changed
      if (kind === 'videoinput') {
        if (localVideoRef.current) localVideoRef.current.srcObject = stream;
        if (previewVideoRef.current) previewVideoRef.current.srcObject = stream;
      }
    } catch { /* device switch failed — stay on current device */ }
  };

  // ── Expiry warning ─────────────────────────────
  useEffect(() => {
    if (!session?.expiresAt) return undefined;
    const expires = new Date(session.expiresAt).getTime();
    const t = setInterval(() => {
      const remaining = expires - Date.now();
      if (remaining > 0 && remaining <= 5 * 60 * 1000 && !showExpiryBanner) {
        setShowExpiryBanner(true);
      }
    }, 15000);
    return () => clearInterval(t);
  }, [session?.expiresAt, showExpiryBanner]);

  const handleExtendSession = async () => {
    if (!id) return;
    setExtending(true);
    try {
      await extendVideoSession(id);
      setShowExpiryBanner(false);
      setSession((prev) => prev ? { ...prev, extensions: (prev.extensions || 0) + 1 } : prev);
    } catch (err) {
      setError(err?.message || 'Failed to extend session.');
    } finally {
      setExtending(false);
    }
  };

  // ── End Call ────────────────────────────────────
  const handleEndCall = async () => {
    try {
      await endVideoSession(id, {});
      cleanup();
      navigate('/clinic/telemedicine');
    } catch (err) {
      setError(err.message);
    }
  };

  // ── Cleanup ────────────────────────────────────
  const cleanup = () => {
    if (roomIdRef.current) { leaveVideoRoom(roomIdRef.current); roomIdRef.current = null; }
    if (videoListenerRef.current) { offVideoEvent(videoListenerRef.current); videoListenerRef.current = null; }
    if (localStreamRef.current) { localStreamRef.current.getTracks().forEach((t) => t.stop()); localStreamRef.current = null; }
    if (screenStreamRef.current) { screenStreamRef.current.getTracks().forEach((t) => t.stop()); screenStreamRef.current = null; }
    screenSharingRef.current = false;
    remoteStreamRef.current = null;
    if (peerConnectionRef.current) { peerConnectionRef.current.close(); peerConnectionRef.current = null; }
    if (reconnectTimerRef.current) { clearTimeout(reconnectTimerRef.current); reconnectTimerRef.current = null; }
  };

  useEffect(() => {
    return () => cleanup();
  }, []);

  // Sync local/remote streams to their <video> elements after mount.
  // handleJoin sets srcObject before the video elements exist, so the
  // refs are null at that point. This runs after the re-render.
  const hasJoined = !!roomData;
  useEffect(() => {
    if (hasJoined) {
      if (localVideoRef.current && localStreamRef.current) {
        localVideoRef.current.srcObject = localStreamRef.current;
      }
      if (remoteVideoRef.current && remoteStreamRef.current) {
        remoteVideoRef.current.srcObject = remoteStreamRef.current;
      }
    }
  }, [hasJoined]);

  // ── Recording Consent ──────────────────────────
  const handleConsentToggle = () => {
    const next = !recordingConsent;
    setRecordingConsent(next);
    // Fire-and-forget — toggle is optimistic so UI responds immediately
    updateVideoConsent(id, { consent: next }).catch(() => {});
  };

  // ── Fullscreen ─────────────────────────────────
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setFullscreen(false);
    }
  };

  // ── Loading / Error ────────────────────────────
  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-950">
        <div className="animate-spin h-8 w-8 border-4 border-primary-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (error && !session) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-neutral-950 gap-4">
        <AlertCircle className="h-12 w-12 text-red-400" />
        <p className="text-red-600">{error}</p>
        <button onClick={() => navigate('/clinic/telemedicine')} className="text-sm text-primary-600 hover:underline">
          Back to Sessions
        </button>
      </div>
    );
  }

  const isActive = session?.status === 'active' || session?.status === 'waiting';
  const canJoin = ['requested', 'scheduled', 'waiting', 'active'].includes(session?.status);

  return (
    <div className="fixed inset-0 z-50 flex bg-neutral-950 overflow-hidden">
      {/* Main Video Area */}
      <div className="flex-1 flex flex-col min-h-0">
        {/* Top Bar */}
        <div className="flex items-center justify-between px-4 py-2 bg-neutral-900/80">
          <div className="flex items-center gap-3">
            <StatusBadge status={session?.status} />
            <span className="text-sm text-white/70">
              {session?.patient?.name || 'Patient'} — {session?.doctor?.name || 'Doctor'}
            </span>
            {session?.type === 'emergency' && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-500 text-white animate-pulse">
                EMERGENCY
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            {isActive && session?.startedAt && (
              <DurationTimer startedAt={session.startedAt} isActive={isActive} />
            )}
            <div className="flex items-center gap-1.5">
              {connectionState === 'connected' ? (
                <Wifi className="h-4 w-4 text-emerald-400" />
              ) : connectionState === 'connecting' ? (
                <Wifi className="h-4 w-4 text-amber-400 animate-pulse" />
              ) : (
                <WifiOff className="h-4 w-4 text-red-400" />
              )}
              <span className="text-xs text-white/50">{connectionState}</span>
            </div>
          </div>
        </div>

        {/* Video Grid */}
        <div className="flex-1 relative min-h-0">
          {hasJoined ? (
            <>
              {/* Remote Video (large) */}
              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                className="w-full h-full object-cover bg-neutral-900"
              />
              {/* Remote camera off overlay */}
              {connectionState === 'connected' && !remoteVideoEnabled && (
                <div className="absolute inset-0 flex items-center justify-center bg-neutral-950/85">
                  <div className="text-center">
                    <div className="mx-auto mb-3 w-20 h-20 rounded-full bg-white/10 ring-2 ring-white/15 flex items-center justify-center">
                      <CameraOff className="h-8 w-8 text-white/50" />
                    </div>
                    <p className="text-white/70 text-sm font-medium">{session?.patient?.name || 'Patient'} camera is off</p>
                    <p className="text-white/40 text-xs mt-1">Audio is still active</p>
                  </div>
                </div>
              )}
              {/* Remote muted badge */}
              {connectionState === 'connected' && !remoteAudioEnabled && (
                <div className="absolute top-3 left-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-500/80 text-white text-xs">
                  <MicOff className="h-3.5 w-3.5" /> Muted
                </div>
              )}
              {/* Disconnected — manual rejoin overlay */}
              {disconnectedFatal && (
                <div className="absolute inset-0 z-30 flex items-center justify-center bg-neutral-950/90 backdrop-blur-sm">
                  <div className="text-center max-w-xs">
                    <WifiOff className="h-12 w-12 text-red-400 mx-auto mb-3" />
                    <p className="text-white text-lg font-semibold">Connection lost</p>
                    <p className="text-white/60 text-sm mt-2 mb-5">
                      Unable to reconnect automatically. The session is still active.
                    </p>
                    <button
                      onClick={handleRejoin}
                      className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full bg-primary-600 hover:bg-primary-700 text-white font-semibold text-sm shadow-lg transition-all"
                    >
                      <Video className="h-4 w-4" />
                      Rejoin Call
                    </button>
                    <button
                      onClick={handleEndCall}
                      className="block mx-auto mt-3 text-sm text-white/50 hover:text-white/80 transition"
                    >
                      End Call Instead
                    </button>
                  </div>
                </div>
              )}
              {/* Connecting / waiting / reconnecting overlay */}
              {connectionState !== 'connected' && !disconnectedFatal && (
                <div className="absolute inset-0 flex items-center justify-center bg-neutral-950/80">
                  <div className="text-center">
                    <div className="relative mx-auto mb-3 w-20 h-20">
                      <span className="absolute inset-0 rounded-full bg-primary-500/30 animate-ping" />
                      <div className="relative w-20 h-20 rounded-full bg-primary-600 flex items-center justify-center shadow-lg">
                        {connectionState === 'reconnecting'
                          ? <WifiOff className="w-8 h-8 text-white" />
                          : <Video className="w-8 h-8 text-white" />}
                      </div>
                    </div>
                    <p className="text-white text-sm font-semibold">
                      {connectionState === 'reconnecting'
                        ? 'Reconnecting…'
                        : peerInRoom ? 'Connecting…' : 'Waiting for patient…'}
                    </p>
                    <p className="text-white/50 text-xs mt-1">
                      {connectionState === 'reconnecting'
                        ? 'Attempting to restore connection'
                        : peerInRoom
                          ? 'Patient joined · establishing secure connection'
                          : "Ringing securely \u00b7 they\u2019ll join shortly"}
                    </p>
                  </div>
                </div>
              )}
              {/* Local Video (PiP) */}
              <div className="absolute bottom-4 right-4 w-48 h-36 rounded-xl overflow-hidden border-2 border-white/20 shadow-lg bg-neutral-900">
                <video
                  ref={localVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />
                {!videoEnabled && (
                  <div className="absolute inset-0 flex items-center justify-center bg-primary-800">
                    <CameraOff className="h-6 w-6 text-white/40" />
                  </div>
                )}
              </div>
            </>
          ) : (
            /* Pre-join screen — BestoClinic design system */
            <div className="absolute inset-0 overflow-y-auto bg-neutral-50">
              <div className="min-h-full flex items-center justify-center p-4 sm:p-6">
                <div className="w-full max-w-md animate-[fadeUp_0.4s_ease-out_both]">

                  {/* Patient info card */}
                  <div className="rounded-2xl border border-neutral-200 bg-white shadow-[var(--shadow-sm)] p-5 mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-xl bg-primary-50 flex items-center justify-center">
                        <Video className="w-5 h-5 text-primary-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] font-bold text-neutral-500 uppercase tracking-wide">
                          {session?.type === 'emergency' ? 'Emergency session' : 'Teleconsultation'}
                        </p>
                        <h2 className="text-lg font-semibold font-display text-neutral-900 truncate">
                          {session?.patient?.name || 'Patient'}
                        </h2>
                      </div>
                    </div>
                    {session?.reason && (
                      <p className="mt-2.5 text-sm text-neutral-600 bg-neutral-50 rounded-xl px-3 py-2 line-clamp-2">
                        {session.reason}
                      </p>
                    )}
                  </div>

                  {/* Camera + audio card */}
                  <div className="rounded-2xl border border-neutral-200 bg-white shadow-[var(--shadow-sm)] overflow-hidden mb-4">
                    <div className="px-5 py-3 border-b border-neutral-100 flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center">
                        <Camera className="w-4 h-4 text-emerald-600" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-neutral-900">Device check</p>
                        <p className="text-[11px] text-neutral-500">Verify your camera and microphone</p>
                      </div>
                    </div>

                    {/* Camera preview */}
                    <div className="relative aspect-video w-full bg-neutral-900">
                      {previewStream && (
                        <video
                          ref={previewVideoRef}
                          autoPlay playsInline muted
                          className="h-full w-full object-cover"
                        />
                      )}
                      {!previewStream && !permissionError && (
                        <div className="flex h-full items-center justify-center">
                          <Loader2 className="mr-2 h-5 w-5 text-white/50 animate-spin" />
                          <span className="text-sm text-white/60">Initialising camera...</span>
                        </div>
                      )}
                      {permissionError && (
                        <div className="flex h-full items-center justify-center px-6 text-center">
                          <div>
                            <CameraOff className="mx-auto mb-2 h-8 w-8 text-rose-400" />
                            <p className="text-sm text-white/80">{permissionError}</p>
                            <p className="mt-1 text-xs text-white/50">Allow camera & microphone access in your browser.</p>
                          </div>
                        </div>
                      )}
                      {previewStream && (
                        <div className="absolute left-3 top-3 rounded-full bg-black/50 px-2.5 py-1 text-[11px] font-semibold text-white/90 backdrop-blur">
                          {user?.name || 'You'}
                        </div>
                      )}
                    </div>

                    {/* Audio meter */}
                    <div className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-primary-50 flex items-center justify-center shrink-0">
                          <Mic className="h-4 w-4 text-primary-600" />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-[3px]">
                            {Array.from({ length: 20 }).map((_, i) => (
                              <span
                                key={i}
                                className={`h-2 flex-1 rounded-sm transition-all ${
                                  i < Math.round(previewLevel * 20)
                                    ? i < 12 ? 'bg-emerald-400' : i < 17 ? 'bg-amber-400' : 'bg-rose-400'
                                    : 'bg-neutral-200'
                                }`}
                              />
                            ))}
                          </div>
                          <p className="text-[11px] text-neutral-500 mt-1">
                            {previewLevel > 0.02 ? 'Voice detected' : 'Speak to test your microphone'}
                          </p>
                        </div>
                      </div>

                      {/* Device selectors */}
                      {(devices.cameras.length > 1 || devices.mics.length > 1) && (
                        <div className="mt-3 space-y-2 pt-3 border-t border-neutral-100">
                          {devices.cameras.length > 1 && (
                            <div className="flex items-center gap-2">
                              <Camera className="h-3.5 w-3.5 text-neutral-400 shrink-0" />
                              <div className="relative flex-1">
                                <select
                                  value={selectedCamera}
                                  onChange={(e) => switchDevice('videoinput', e.target.value)}
                                  className="w-full appearance-none bg-neutral-100/60 border border-transparent text-neutral-700 text-xs rounded-lg px-3 py-2 pr-8 focus:bg-white focus:border-primary-400 focus:ring-2 focus:ring-primary-100 outline-none transition-all"
                                >
                                  {devices.cameras.map((d) => (
                                    <option key={d.deviceId} value={d.deviceId}>
                                      {d.label || `Camera ${devices.cameras.indexOf(d) + 1}`}
                                    </option>
                                  ))}
                                </select>
                                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-neutral-400 pointer-events-none" />
                              </div>
                            </div>
                          )}
                          {devices.mics.length > 1 && (
                            <div className="flex items-center gap-2">
                              <Mic className="h-3.5 w-3.5 text-neutral-400 shrink-0" />
                              <div className="relative flex-1">
                                <select
                                  value={selectedMic}
                                  onChange={(e) => switchDevice('audioinput', e.target.value)}
                                  className="w-full appearance-none bg-neutral-100/60 border border-transparent text-neutral-700 text-xs rounded-lg px-3 py-2 pr-8 focus:bg-white focus:border-primary-400 focus:ring-2 focus:ring-primary-100 outline-none transition-all"
                                >
                                  {devices.mics.map((d) => (
                                    <option key={d.deviceId} value={d.deviceId}>
                                      {d.label || `Microphone ${devices.mics.indexOf(d) + 1}`}
                                    </option>
                                  ))}
                                </select>
                                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-neutral-400 pointer-events-none" />
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Consent + CTA card */}
                  <div className="rounded-2xl border border-neutral-200 bg-white shadow-[var(--shadow-sm)] p-5">
                    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-neutral-200 bg-neutral-50/60 p-3.5 transition hover:border-primary-300 hover:bg-primary-50/40">
                      <input
                        type="checkbox"
                        checked={recordingConsent}
                        onChange={handleConsentToggle}
                        className="mt-0.5 h-4 w-4 rounded border-neutral-300 text-primary-600 focus:ring-primary-500 focus:ring-offset-0"
                      />
                      <div className="flex-1">
                        <p className="flex items-center gap-1.5 text-sm font-semibold text-neutral-900">
                          <Shield className="h-4 w-4 text-primary-600" />
                          Recording consent
                        </p>
                        <p className="mt-0.5 text-xs leading-relaxed text-neutral-500">
                          This session may be recorded for medical records. The patient has been informed.
                        </p>
                      </div>
                    </label>

                    <div className="mt-4 flex items-center gap-3">
                      <button
                        onClick={() => navigate('/clinic/telemedicine')}
                        className="flex-1 px-4 py-2.5 rounded-lg text-sm font-medium text-neutral-700 bg-white border border-neutral-200 hover:bg-neutral-50 hover:border-neutral-300 transition-all"
                      >
                        Cancel
                      </button>
                      {canJoin ? (
                        <button
                          onClick={handleJoin}
                          disabled={!previewStream && !permissionError}
                          className="flex-[2] inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-primary-600 hover:bg-primary-700 text-white font-semibold text-sm shadow-[var(--shadow-sm)] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <Video className="w-4 h-4" />
                          Join session
                        </button>
                      ) : (
                        <div className="flex-[2] rounded-lg bg-neutral-100 text-neutral-500 text-xs text-center py-2.5">
                          Session is <span className="font-medium text-neutral-700">{session?.status}</span>
                        </div>
                      )}
                    </div>

                    {error && (
                      <p className="mt-3 text-xs text-rose-600 flex items-center gap-1.5 justify-center">
                        <AlertCircle className="w-3.5 h-3.5" /> {error}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Controls Bar */}
        {hasJoined && (
          <div className="flex items-center justify-center gap-3 px-4 py-3 bg-neutral-900/80">
            {/* Audio */}
            <button
              onClick={toggleAudio}
              disabled={!streamReady}
              className={`p-3 rounded-full transition ${!streamReady ? 'bg-neutral-700 text-neutral-500 cursor-not-allowed' : audioEnabled ? 'bg-primary-800 hover:bg-primary-700 text-white' : 'bg-red-500 hover:bg-red-600 text-white'}`}
              title={!streamReady ? 'Waiting for media…' : audioEnabled ? 'Mute' : 'Unmute'}
            >
              {audioEnabled ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
            </button>

            {/* Video */}
            <button
              onClick={toggleVideo}
              disabled={!streamReady}
              className={`p-3 rounded-full transition ${!streamReady ? 'bg-neutral-700 text-neutral-500 cursor-not-allowed' : videoEnabled ? 'bg-primary-800 hover:bg-primary-700 text-white' : 'bg-red-500 hover:bg-red-600 text-white'}`}
              title={!streamReady ? 'Waiting for media…' : videoEnabled ? 'Turn off camera' : 'Turn on camera'}
            >
              {videoEnabled ? <Camera className="h-5 w-5" /> : <CameraOff className="h-5 w-5" />}
            </button>

            {/* Screen Share */}
            <button
              onClick={toggleScreenShare}
              disabled={!streamReady}
              className={`p-3 rounded-full transition ${!streamReady ? 'bg-neutral-700 text-neutral-500 cursor-not-allowed' : screenSharing ? 'bg-primary-500 hover:bg-primary-600 text-white' : 'bg-primary-800 hover:bg-primary-700 text-white'}`}
              title={!streamReady ? 'Waiting for media…' : screenSharing ? 'Stop sharing' : 'Share screen'}
            >
              <MonitorUp className="h-5 w-5" />
            </button>

            {/* Hold / Resume */}
            <button
              onClick={toggleHold}
              disabled={!streamReady}
              className={`p-3 rounded-full transition ${!streamReady ? 'bg-neutral-700 text-neutral-500 cursor-not-allowed' : isOnHold ? 'bg-amber-500 hover:bg-amber-600 text-white animate-pulse' : 'bg-primary-800 hover:bg-primary-700 text-white'}`}
              title={isOnHold ? 'Resume call' : 'Hold call'}
            >
              {isOnHold ? <Play className="h-5 w-5" /> : <Pause className="h-5 w-5" />}
            </button>

            {/* Chat */}
            <button
              onClick={() => setChatOpen((v) => !v)}
              className={`p-3 rounded-full transition ${chatOpen ? 'bg-primary-500 text-white' : 'bg-primary-800 hover:bg-primary-700 text-white'}`}
              title="Toggle chat"
            >
              <MessageSquare className="h-5 w-5" />
            </button>

            {/* Fullscreen */}
            <button
              onClick={toggleFullscreen}
              className="p-3 rounded-full bg-primary-800 hover:bg-primary-700 text-white transition"
              title={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
            >
              {fullscreen ? <Minimize className="h-5 w-5" /> : <Maximize className="h-5 w-5" />}
            </button>

            {/* End Call */}
            <button
              onClick={() => setShowEndConfirm(true)}
              className="p-3 rounded-full bg-red-500 hover:bg-red-600 text-white transition ml-4"
              title="End call"
            >
              <PhoneOff className="h-5 w-5" />
            </button>
          </div>
        )}

        {/* Expiry banner */}
        {showExpiryBanner && hasJoined && (
          <div className="absolute top-16 left-1/2 z-30 w-full max-w-md -translate-x-1/2 px-4">
            <div className="flex items-center gap-2 rounded-xl bg-amber-500/95 px-3 py-2 text-white text-xs font-medium shadow-lg ring-1 ring-amber-300/30 backdrop-blur-md">
              <TimerReset className="h-4 w-4 flex-shrink-0" />
              <span className="flex-1">Session ends in under 5 minutes.</span>
              {(session?.extensions || 0) < 2 && (
                <button
                  type="button"
                  onClick={handleExtendSession}
                  disabled={extending}
                  className="flex items-center gap-1 rounded-lg bg-white/20 hover:bg-white/30 px-2.5 py-1 text-[11px] font-semibold transition disabled:opacity-50"
                >
                  {extending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                  Extend 15 min
                </button>
              )}
              <button type="button" onClick={() => setShowExpiryBanner(false)} className="text-white/80 hover:text-white">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* End Call Confirmation */}
      {showEndConfirm && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-sm mx-4 rounded-2xl bg-neutral-800 border border-neutral-700 p-6 shadow-2xl">
            <h3 className="text-lg font-semibold text-white mb-1">End this consultation?</h3>
            <p className="text-sm text-white/60 mb-4">Review before ending:</p>
            <ul className="space-y-2.5 mb-5">
              <li className="flex items-center gap-2.5 text-sm text-white/80">
                <ClipboardList className="h-4 w-4 text-white/40 shrink-0" />
                Notes documented
              </li>
              <li className="flex items-center gap-2.5 text-sm text-white/80">
                <FileText className="h-4 w-4 text-white/40 shrink-0" />
                Prescription added (if needed)
              </li>
              <li className="flex items-center gap-2.5 text-sm text-white/80">
                <Clock className="h-4 w-4 text-white/40 shrink-0" />
                Follow-up scheduled (if needed)
              </li>
            </ul>
            <div className="flex gap-3">
              <button
                onClick={() => setShowEndConfirm(false)}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium text-white/70 bg-neutral-700 hover:bg-neutral-600 transition"
              >
                Continue call
              </button>
              <button
                onClick={() => { setShowEndConfirm(false); handleEndCall(); }}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-rose-500 hover:bg-rose-600 transition"
              >
                End call
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Chat Sidebar */}
      {hasJoined && <ChatPanel sessionId={id} isOpen={chatOpen} onClose={() => setChatOpen(false)} />}

      {/* Hold overlay — covers entire view (video + chat + controls) */}
      {isOnHold && hasJoined && (
        <div className="absolute inset-0 z-40 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div className="relative text-center">
            <Pause className="h-12 w-12 text-amber-400 mx-auto mb-3 animate-pulse" />
            <p className="text-white text-lg font-semibold">Call on hold</p>
            <p className="text-white/50 text-sm mt-2 mb-4">The call is paused</p>
            <button
              onClick={toggleHold}
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full bg-amber-500 hover:bg-amber-600 text-white font-semibold text-sm shadow-lg transition-all"
            >
              <Play className="h-4 w-4" />
              Resume Call
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
