/**
 * SessionChatThread — unified real-time chat for a VideoSession / EmergencySession.
 *
 * Used by:
 *   - PatientVideoCall (in-call chat drawer)
 *   - PatientEmergency (active phase, chat-only variant)
 *   - Tenant VideoCallPanel (doctor side, Wave 3)
 *
 * Features:
 *   - REST backfill on mount (paginated, newest first → reversed for display)
 *   - Live socket.io updates (`chat:message` / `chat:read` / `chat:typing`)
 *   - Outgoing optimistic render + server reconciliation
 *   - Typing indicator (emits chat:typing, auto-clears after 2.5s idle)
 *   - Read receipts (emits chat:read when thread is visible)
 *   - File attachments (images preview inline, other files → download chip)
 *   - Auto-scroll to bottom on new message unless user scrolled up
 *
 * Props:
 *   sessionId           : VideoSession._id
 *   roomId              : the video room ID (required for socket chat:read etc.)
 *   currentUserId       : the logged-in user id (for my-vs-theirs alignment)
 *   currentUserRole     : 'patient' | 'doctor' | 'receptionist' | 'admin' | 'owner'
 *   api                 : { list, send, markRead, shareFile }
 *   variant             : 'drawer' | 'standalone' — affects chrome
 *   accentClassName     : optional tailwind for own-bubble color (default primary)
 *   emptyState          : optional JSX for empty thread
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Send, Paperclip, Check, CheckCheck, FileIcon, Loader2, AlertCircle, Image as ImageIcon, X,
} from 'lucide-react';
import { chatBus, sendTyping, sendChatReadReceipt } from '../socket';

const TYPING_IDLE_MS = 2500;
/** Max raw file size for chat attachments — see handleFilePick for the 10MB JSON-body reasoning. */
const MAX_ATTACHMENT_BYTES = 6 * 1024 * 1024;

export function SessionChatThread({
  sessionId,
  roomId,
  currentUserId,
  currentUserRole = 'patient',
  api,
  variant = 'drawer',
  accentClassName = 'bg-primary-600',
  emptyState = null,
  maxHeight = 'h-full',
}) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [draft, setDraft]       = useState('');
  const [sending, setSending]   = useState(false);
  const [peerTyping, setPeerTyping] = useState(null); // { name, role }
  const [uploading, setUploading]   = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState(null);

  const listRef        = useRef(null);
  const bottomRef      = useRef(null);
  const isAtBottomRef  = useRef(true);
  const typingDebounce = useRef(null);
  const peerTypingTimer = useRef(null);

  // ── Initial backfill ──
  useEffect(() => {
    if (!sessionId || !api?.list) return;
    let cancelled = false;
    setLoading(true);
    setError('');
    api.list(sessionId, { limit: 100 })
      .then((resp) => {
        if (cancelled) return;
        const items = resp?.data || [];
        // Sort explicitly rather than blind-reversing: the list endpoint's order
        // depends on parsePagination's default sort, so a change there would
        // silently flip the thread upside down. Oldest first, newest at bottom.
        setMessages(
          [...items].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)),
        );
      })
      .catch((err) => { if (!cancelled) setError(err.message || 'Failed to load messages'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [sessionId, api]);

  // ── Subscribe to live chat stream ──
  useEffect(() => {
    if (!roomId) return () => {};
    const off = chatBus.on((event, payload) => {
      // The server sends `session`; older builds sent `sessionId`. Accept either —
      // reading only `sessionId` silently discarded every inbound message.
      const payloadSessionId = payload?.sessionId || payload?.session;
      if (!payload || String(payloadSessionId) !== String(sessionId)) return;
      if (event === 'chat:message') {
        setMessages((prev) => {
          const incoming = normalizeServerMessage(payload);
          // Replace optimistic temp with server version (match by clientId), else append
          if (incoming._clientId) {
            const idx = prev.findIndex((m) => m._clientId === incoming._clientId);
            if (idx >= 0) {
              const copy = [...prev];
              copy[idx] = incoming;
              return copy;
            }
          }
          if (incoming._id && prev.some((m) => m._id === incoming._id)) return prev;
          return [...prev, incoming];
        });
      } else if (event === 'chat:delivered') {
        setMessages((prev) => prev.map((m) => (
          m._id === payload.messageId ? { ...m, deliveredAt: payload.deliveredAt } : m
        )));
      } else if (event === 'chat:read') {
        setMessages((prev) => prev.map((m) => (
          m._id === payload.messageId
            ? { ...m, readBy: [...(m.readBy || []), { user: payload.readBy, at: payload.readAt }] }
            : m
        )));
      } else if (event === 'chat:typing') {
        if (String(payload.userId) === String(currentUserId)) return;
        setPeerTyping(payload.isTyping ? { name: null, role: payload.role } : null);
        clearTimeout(peerTypingTimer.current);
        if (payload.isTyping) {
          peerTypingTimer.current = setTimeout(() => setPeerTyping(null), 4000);
        }
      }
    });
    return off;
  }, [roomId, sessionId, currentUserId]);

  // ── Auto-scroll on new messages ──
  useEffect(() => {
    if (isAtBottomRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [messages.length, peerTyping]);

  const onListScroll = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    const threshold = 40;
    isAtBottomRef.current = el.scrollHeight - (el.scrollTop + el.clientHeight) < threshold;
  }, []);

  // ── Auto read-receipt when thread is visible ──
  useEffect(() => {
    if (!roomId) return;
    const unread = messages.filter(
      (m) => String(m.sender) !== String(currentUserId) &&
             !(m.readBy || []).some((r) => String(r.user) === String(currentUserId)) &&
             m._id,
    );
    if (!unread.length) return;
    unread.forEach((m) => {
      sendChatReadReceipt(roomId, m._id);
      // REST for persistence
      api?.markRead?.(sessionId, m._id).catch(() => {});
    });
  }, [messages, sessionId, roomId, currentUserId, api]);

  // ── Typing ──
  const handleTypingChange = (val) => {
    setDraft(val);
    if (!roomId) return;
    sendTyping(roomId, true);
    clearTimeout(typingDebounce.current);
    typingDebounce.current = setTimeout(() => sendTyping(roomId, false), TYPING_IDLE_MS);
  };

  // ── Send a text message ──
  const handleSend = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    const clientId = `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const optimistic = {
      _id: clientId,
      _clientId: clientId,
      _pending: true,
      sessionId,
      content: text,
      type: 'text',
      sender: currentUserId,
      senderRole: currentUserRole,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);
    setDraft('');
    setSending(true);
    try {
      await api.send(sessionId, { content: text, type: 'text', clientId });
    } catch (err) {
      setMessages((prev) => prev.map((m) => (
        m._clientId === clientId ? { ...m, _failed: true, _pending: false } : m
      )));
      setError(err.message || 'Message failed to send');
    } finally {
      setSending(false);
    }
  };

  // ── File upload ──
  const handleFilePick = async (file) => {
    if (!file || !api?.shareFile) return;
    // Files are base64 data-URL encoded into a JSON body, which inflates them by
    // ~4/3, and the API caps JSON bodies at 10MB (express.json in src/app.js).
    // Anything much over 6MB is rejected by the body parser before it reaches the
    // route, so reject it here with a message the user can act on.
    if (file.size > MAX_ATTACHMENT_BYTES) {
      setError(`Files must be under ${Math.floor(MAX_ATTACHMENT_BYTES / (1024 * 1024))}MB`);
      return;
    }
    setUploading(true);
    try {
      // The backend shareFile endpoint currently expects a pre-uploaded URL.
      // For a production rollout we'd pipe through a presigned-URL upload here.
      // For now we data-URL encode the file as a local fallback.
      const payload = {
        name:     file.name,
        mimeType: file.type || 'application/octet-stream',
        size:     file.size,
        url:      await toDataUrl(file),
      };
      await api.shareFile(sessionId, payload);
    } catch (err) {
      setError(err.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const sortedMessages = useMemo(() => messages, [messages]);

  const wrapperClass = variant === 'drawer'
    ? `flex flex-col ${maxHeight} bg-white`
    : `flex flex-col ${maxHeight} bg-white rounded-2xl border border-neutral-200 shadow-[var(--shadow-sm)]`;

  return (
    <div className={wrapperClass}>
      {/* Error banner */}
      {error && (
        <div className="flex items-start gap-2 mx-3 mt-3 p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <div className="flex-1">{error}</div>
          <button onClick={() => setError('')} className="text-rose-500 hover:text-rose-700">×</button>
        </div>
      )}

      {/* Messages list */}
      <div
        ref={listRef}
        onScroll={onListScroll}
        className="flex-1 overflow-y-auto px-4 py-4 space-y-3"
      >
        {loading ? (
          <div className="flex items-center justify-center py-8 text-neutral-400 text-sm">
            <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading messages…
          </div>
        ) : sortedMessages.length === 0 ? (
          emptyState || (
            <div className="text-center py-10 text-sm text-neutral-400">
              No messages yet. Say hello to start the conversation.
            </div>
          )
        ) : (
          sortedMessages.map((m, i) => {
            const senderId = String(m.sender?._id || m.sender);
            const isMine = senderId === String(currentUserId);
            const prev = sortedMessages[i - 1];
            const prevSenderId = prev ? String(prev.sender?._id || prev.sender) : null;
            const showHeader = !prev || prevSenderId !== senderId;
            return (
              <MessageBubble
                key={m._id || i}
                message={m}
                isMine={isMine}
                showHeader={showHeader}
                accentClassName={accentClassName}
                onImageClick={setLightboxUrl}
              />
            );
          })
        )}
        {peerTyping && (
          <div className="flex items-center gap-2 ml-1 text-xs text-neutral-400 animate-[fadeUp_0.2s_ease-out]">
            <TypingDots />
            <span>{peerTyping.role === 'doctor' ? 'Clinician' : 'Peer'} is typing…</span>
          </div>
        )}
        <div ref={bottomRef} />
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

      {/* Composer */}
      <div className="border-t border-neutral-200 bg-neutral-50/60 px-3 py-2.5">
        <div className="flex items-end gap-2">
          <label className="cursor-pointer inline-flex items-center justify-center w-10 h-10 rounded-full bg-white border border-neutral-200 hover:border-primary-300 hover:text-primary-600 text-neutral-500 transition-colors">
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Paperclip className="w-4 h-4" />}
            <input
              type="file"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFilePick(f); e.target.value = ''; }}
              disabled={uploading}
            />
          </label>
          <textarea
            value={draft}
            onChange={(e) => handleTypingChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
            }}
            placeholder="Type a message…"
            rows={1}
            className="flex-1 resize-none rounded-2xl border border-neutral-200 bg-white px-3.5 py-2.5 text-sm placeholder-neutral-400 focus:border-primary-400 focus:ring-2 focus:ring-primary-100 outline-none max-h-32"
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={!draft.trim() || sending}
            aria-label="Send message"
            className={`inline-flex items-center justify-center w-10 h-10 rounded-full text-white disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 transition ${accentClassName}`}
          >
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────

function MessageBubble({ message, isMine, showHeader, accentClassName, onImageClick }) {
  const time = new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const attachment = message.attachment;
  const isImage = attachment && (attachment.mimeType || '').startsWith('image/');

  return (
    <div className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[85%] ${isMine ? 'items-end' : 'items-start'} flex flex-col`}>
        {showHeader && !isMine && (
          <span className="text-[10px] uppercase tracking-wider text-neutral-400 mb-1 ml-1">
            {message.senderName || message.senderRole || 'Peer'}
          </span>
        )}
        <div
          className={`rounded-2xl px-3.5 py-2 text-sm leading-relaxed shadow-sm overflow-hidden ${
            isMine
              ? `${accentClassName} text-white rounded-br-md`
              : 'bg-neutral-100 text-neutral-800 rounded-bl-md'
          } ${message._failed ? 'opacity-60 ring-2 ring-rose-300' : ''}`}
        >
          {isImage ? (
            <button type="button" onClick={() => onImageClick?.(attachment.url)} className="block text-left">
              <img
                src={attachment.url}
                alt={attachment.name}
                className="rounded-lg max-w-full max-h-64 object-cover cursor-pointer hover:opacity-90 transition"
              />
              <div className="mt-1.5 flex items-center gap-1.5 text-[11px] opacity-80">
                <ImageIcon className="w-3 h-3" /> {attachment.name}
              </div>
            </button>
          ) : attachment ? (
            <button
              type="button"
              onClick={() => downloadAttachment(attachment)}
              className={`flex items-center gap-2 -mx-1 px-2 py-1.5 rounded-lg cursor-pointer min-w-0 max-w-full ${isMine ? 'bg-white/10 hover:bg-white/20' : 'bg-white hover:bg-neutral-50'}`}
            >
              <FileIcon className="w-4 h-4 flex-shrink-0" />
              <span className="min-w-0 text-[13px] truncate text-left">{attachment.name}</span>
              {attachment.size != null && (
                <span className="text-[10px] opacity-70 flex-shrink-0">{formatBytes(attachment.size)}</span>
              )}
            </button>
          ) : null}
          {message.content && (
            <p className={attachment ? 'mt-1.5 whitespace-pre-wrap' : 'whitespace-pre-wrap'}>{message.content}</p>
          )}
        </div>
        <div className={`mt-1 flex items-center gap-1.5 text-[10px] text-neutral-400 ${isMine ? 'pr-1' : 'pl-1'}`}>
          <span>{time}</span>
          {isMine && (message._failed ? (
            <span className="text-rose-500">failed</span>
          ) : message._pending ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (message.readBy || []).length > 0 ? (
            <CheckCheck className="w-3 h-3 text-primary-500" />
          ) : message.deliveredAt ? (
            <CheckCheck className="w-3 h-3" />
          ) : (
            <Check className="w-3 h-3" />
          ))}
        </div>
      </div>
    </div>
  );
}

function TypingDots() {
  return (
    <span className="inline-flex items-center gap-1">
      {[0, 150, 300].map((d) => (
        <span
          key={d}
          className="w-1 h-1 rounded-full bg-neutral-400"
          style={{ animation: `typingDot 1s ${d}ms infinite ease-in-out` }}
        />
      ))}
      <style>{`
        @keyframes typingDot {
          0%, 80%, 100% { opacity: 0.25; transform: translateY(0); }
          40% { opacity: 1; transform: translateY(-2px); }
        }
      `}</style>
    </span>
  );
}

/**
 * Download a file attachment — handles both data URLs and HTTP URLs.
 * Browsers block data: URLs opened via target="_blank" (shows about:blank),
 * so we convert to a Blob and trigger a programmatic download.
 */
function downloadAttachment(attachment) {
  if (!attachment?.url) return;
  const url = attachment.url;
  const name = attachment.name || 'download';

  // Data URLs — convert to Blob for download
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
      // Fallback: open raw URL (may fail in some browsers)
      window.open(url, '_blank', 'noopener');
    }
    return;
  }

  // HTTP/HTTPS URLs — standard download
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.target = '_blank';
  a.rel = 'noreferrer';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

function normalizeServerMessage(payload) {
  return {
    _id:         payload.messageId || payload._id,
    _clientId:   payload.clientId,
    sessionId:   payload.sessionId || payload.session,
    sender:      payload.sender,
    senderRole:  payload.senderRole,
    senderName:  payload.senderName,
    type:        payload.type || 'text',
    content:     payload.content,
    attachment:  payload.attachment,
    createdAt:   payload.createdAt || new Date().toISOString(),
    deliveredAt: payload.deliveredAt,
    readBy:      payload.readBy || [],
  };
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

function toDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default SessionChatThread;
