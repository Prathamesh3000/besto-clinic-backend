import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bell, CalendarDays, CreditCard, AlertTriangle, Clock, ScanLine,
  CheckCheck, Check, Inbox, BellOff, Video, Siren, MessageCircle,
  PhoneMissed, Sparkles, ChevronRight, Radio,
  Zap, RefreshCw, Activity, ArrowRight, PhoneIncoming,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Pagination, ErrorAlert } from '../../platform/components/shared';
import { listNotifications, getUnreadCount, markNotificationRead, markAllNotificationsRead } from '../api';
import { initSocket, getSocket, onUnreadCount, offUnreadCount, requestUnreadCount } from '../../lib/socket';

// ═══════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════

function timeAgo(date) {
  const seconds = Math.floor((Date.now() - new Date(date)) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
}

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function isSameDay(a, b) {
  return startOfDay(a).getTime() === startOfDay(b).getTime();
}

function dayBucket(date) {
  const now = new Date();
  const d = new Date(date);
  const today = startOfDay(now);
  const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
  const weekAgo = new Date(today); weekAgo.setDate(weekAgo.getDate() - 6);

  if (isSameDay(d, now)) return 'today';
  if (isSameDay(d, yesterday)) return 'yesterday';
  if (d >= weekAgo) return 'week';
  return 'earlier';
}

const BUCKET_META = {
  today:     { label: 'Today',       icon: Sparkles },
  yesterday: { label: 'Yesterday',   icon: Clock },
  week:      { label: 'This Week',   icon: CalendarDays },
  earlier:   { label: 'Earlier',     icon: Activity },
};

// ─── Type config (colors, icons, tone) ──
const TYPE_CONFIG = {
  appointment:  { icon: CalendarDays,  bg: 'bg-blue-50',     text: 'text-blue-600',    stripe: 'bg-blue-500',     label: 'Appointment' },
  payment:      { icon: CreditCard,    bg: 'bg-emerald-50',  text: 'text-emerald-600', stripe: 'bg-emerald-500',  label: 'Payment' },
  reminder:     { icon: Clock,         bg: 'bg-primary-50',  text: 'text-primary-600', stripe: 'bg-primary-500',  label: 'Reminder' },
  dental_scan:  { icon: ScanLine,      bg: 'bg-teal-50',     text: 'text-teal-600',    stripe: 'bg-teal-500',     label: 'Dental Scan' },
  video_call:   { icon: Video,         bg: 'bg-indigo-50',   text: 'text-indigo-600',  stripe: 'bg-indigo-500',   label: 'Video Call' },
  chat_message: { icon: MessageCircle, bg: 'bg-violet-50',   text: 'text-violet-600',  stripe: 'bg-violet-500',   label: 'Message' },
  emergency:    { icon: Siren,         bg: 'bg-rose-50',     text: 'text-rose-600',    stripe: 'bg-rose-500',     label: 'Emergency' },
  alert:        { icon: AlertTriangle, bg: 'bg-amber-50',    text: 'text-amber-600',   stripe: 'bg-amber-500',    label: 'Alert' },
};

function getTypeConfig(type) {
  return TYPE_CONFIG[type] || { icon: Bell, bg: 'bg-neutral-100', text: 'text-neutral-500', stripe: 'bg-neutral-300', label: 'General' };
}

// ─── Filter chips ──
const FILTER_CHIPS = [
  { key: 'all',         label: 'All',          icon: Bell },
  { key: 'unread',      label: 'Unread',       icon: Radio },
  { key: 'calls',       label: 'Calls',        icon: Video,         types: ['video_call'] },
  { key: 'messages',    label: 'Messages',     icon: MessageCircle, types: ['chat_message'] },
  { key: 'emergencies', label: 'Emergencies',  icon: Siren,         types: ['emergency'] },
  { key: 'appointment', label: 'Appointments', icon: CalendarDays,  types: ['appointment'] },
  { key: 'reminder',    label: 'Reminders',    icon: Clock,         types: ['reminder'] },
  { key: 'payment',     label: 'Payments',     icon: CreditCard,    types: ['payment'] },
  { key: 'dental_scan', label: 'Dental Scans', icon: ScanLine,      types: ['dental_scan'] },
];

// ─── Missed call detection ──
function isMissedCall(n) {
  if (n?.type !== 'video_call') return false;
  if (n?.read || n?.isRead) return false;
  if (n?.data?.missed === true || n?.metadata?.missed === true) return true;
  const created = new Date(n?.createdAt || n?.date || 0).getTime();
  if (!created) return false;
  return Date.now() - created > 60 * 1000;
}

// ═══════════════════════════════════════════════════════════════
// Page
// ═══════════════════════════════════════════════════════════════

export default function PatientNotifications() {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [meta, setMeta] = useState({ total: 0, page: 1, limit: 15 });
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeChip, setActiveChip] = useState('all');
  const [page, setPage] = useState(1);
  const [markingAll, setMarkingAll] = useState(false);
  const [markingId, setMarkingId] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [pulse, setPulse] = useState(false); // brief glow on live update

  const activeChipMeta = useMemo(
    () => FILTER_CHIPS.find((c) => c.key === activeChip) || FILTER_CHIPS[0],
    [activeChip],
  );

  const fetchNotifications = useCallback(async () => {
    try {
      const params = { page, limit: 15 };
      if (activeChip === 'unread') params.unread = true;
      else if (activeChipMeta.types?.length) {
        params.type = activeChipMeta.types.join(',');
      }

      const res = await listNotifications(params);
      setNotifications(res.data || []);
      setMeta(res.meta || { total: (res.data || []).length, page, limit: 15 });
    } catch (err) {
      setError(err.message || 'Failed to load notifications');
    }
  }, [page, activeChip, activeChipMeta]);

  const fetchUnreadCount = useCallback(async () => {
    try {
      const res = await getUnreadCount();
      setUnreadCount(res.data?.count ?? res.count ?? 0);
    } catch {
      /* silent */
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchNotifications(), fetchUnreadCount()]).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { fetchNotifications(); }, [fetchNotifications]);
  useEffect(() => { setPage(1); }, [activeChip]);

  // ─── Real-time WS updates ──
  useEffect(() => {
    const sock = initSocket() || getSocket();
    if (!sock) return undefined;

    const handleNew = () => {
      fetchNotifications();
      requestUnreadCount();
      setPulse(true);
      setTimeout(() => setPulse(false), 1200);
    };
    const handleCount = (count) => {
      if (typeof count === 'number' && count >= 0) setUnreadCount(count);
    };
    const handleReconnect = () => { requestUnreadCount(); fetchNotifications(); };

    sock.on('notification:new', handleNew);
    sock.io?.on?.('reconnect', handleReconnect);
    onUnreadCount(handleCount);

    requestUnreadCount();

    return () => {
      sock.off('notification:new', handleNew);
      sock.io?.off?.('reconnect', handleReconnect);
      offUnreadCount(handleCount);
    };
  }, [fetchNotifications]);

  const handleMarkRead = async (id) => {
    setMarkingId(id);
    try {
      await markNotificationRead(id);
      setNotifications((prev) =>
        prev.map((n) => (n._id || n.id) === id ? { ...n, read: true, isRead: true } : n),
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch (err) {
      setError(err.message || 'Failed to mark notification as read');
    } finally {
      setMarkingId(null);
    }
  };

  const handleMarkAllRead = async () => {
    setMarkingAll(true);
    try {
      await markAllNotificationsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true, isRead: true })));
      setUnreadCount(0);
    } catch (err) {
      setError(err.message || 'Failed to mark all notifications as read');
    } finally {
      setMarkingAll(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([fetchNotifications(), fetchUnreadCount()]);
    } finally {
      setRefreshing(false);
    }
  };

  const isUnread = (notification) => !notification.read && !notification.isRead;

  const resolveDeepLink = (n) => {
    const d = n?.data || n?.metadata || {};
    switch (n?.type) {
      case 'video_call':
        return d.sessionId ? `/patient/video/${d.sessionId}` : d.appointmentId ? `/patient/video/${d.appointmentId}` : '/patient/appointments';
      case 'chat_message':
        return d.sessionId ? `/patient/video/${d.sessionId}` : '/patient/appointments';
      case 'emergency':  return '/patient/emergency';
      case 'appointment':
      case 'reminder':   return '/patient/appointments';
      case 'payment':    return '/patient/payments';
      case 'dental_scan':return '/patient/health';
      default:           return null;
    }
  };

  const handleNotificationClick = async (n) => {
    const id = n._id || n.id;
    const target = resolveDeepLink(n);
    if (isUnread(n) && id) handleMarkRead(id).catch(() => {});
    if (target) navigate(target);
  };

  // ─── Derived data ──
  const todayCount = useMemo(() => {
    const today = startOfDay(new Date()).getTime();
    return notifications.filter((n) => new Date(n.createdAt || 0).getTime() >= today).length;
  }, [notifications]);

  // 7-day activity spark (from currently loaded page — best-effort visualization)
  const activityBars = useMemo(() => {
    const buckets = Array.from({ length: 7 }, () => 0);
    const today = startOfDay(new Date()).getTime();
    notifications.forEach((n) => {
      const d = startOfDay(new Date(n.createdAt || 0)).getTime();
      const diffDays = Math.round((today - d) / (24 * 60 * 60 * 1000));
      if (diffDays >= 0 && diffDays < 7) buckets[6 - diffDays] += 1;
    });
    const max = Math.max(1, ...buckets);
    return buckets.map((v) => ({ count: v, pct: Math.round((v / max) * 100) }));
  }, [notifications]);

  // Category counts for the tile grid (based on what's on-screen)
  const categoryCounts = useMemo(() => {
    return notifications.reduce((acc, n) => {
      acc[n.type] = (acc[n.type] || 0) + 1;
      return acc;
    }, {});
  }, [notifications]);

  // Segment missed calls (Calls tab)
  const { missedCalls, otherNotifications } = useMemo(() => {
    if (activeChip !== 'calls') {
      return { missedCalls: [], otherNotifications: notifications };
    }
    const missed = [];
    const rest = [];
    notifications.forEach((n) => {
      if (isMissedCall(n)) missed.push(n);
      else rest.push(n);
    });
    return { missedCalls: missed, otherNotifications: rest };
  }, [activeChip, notifications]);

  // Group non-missed notifications by time bucket
  const groupedByTime = useMemo(() => {
    const groups = { today: [], yesterday: [], week: [], earlier: [] };
    otherNotifications.forEach((n) => {
      const b = dayBucket(n.createdAt || n.date || Date.now());
      groups[b].push(n);
    });
    return groups;
  }, [otherNotifications]);

  // ─── Render ──

  return (
    <div className="space-y-6 pb-6">
      {/* ═══════════════════════════════════════════ */}
      {/* HERO — gradient, live pulse, stats, CTA     */}
      {/* ═══════════════════════════════════════════ */}
      <motion.section
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary-600 via-primary-700 to-primary-800 text-white shadow-[0_24px_60px_-20px_rgba(46,106,184,0.55)]"
      >
        {/* Decorative orbs */}
        <div className="pointer-events-none absolute -top-24 -right-24 w-80 h-80 rounded-full bg-white/10 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-32 -left-24 w-80 h-80 rounded-full bg-white/5 blur-3xl" />
        <div className="pointer-events-none absolute top-8 right-16 w-3 h-3 rounded-full bg-white/40 animate-ping" />
        <div className="pointer-events-none absolute bottom-10 right-40 w-2 h-2 rounded-full bg-white/30" />

        {/* Pulse flash on live event */}
        <AnimatePresence>
          {pulse && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4 }}
              className="pointer-events-none absolute inset-0 bg-white/10"
            />
          )}
        </AnimatePresence>

        <div className="relative px-6 md:px-10 py-8 md:py-10 grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
          {/* Left — greeting */}
          <div className="md:col-span-7">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 border border-white/20 backdrop-blur-sm mb-4">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-300 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
              </span>
              <span className="text-[11px] font-semibold tracking-wider uppercase text-white/90">Live Inbox</span>
            </div>

            <h1 className="text-3xl md:text-4xl font-bold font-display leading-tight">
              {unreadCount > 0 ? (
                <>You have <span className="text-amber-300">{unreadCount}</span> new update{unreadCount !== 1 ? 's' : ''}</>
              ) : (
                <>You&apos;re all caught up <Sparkles className="inline h-7 w-7 md:h-8 md:w-8 -mt-1" /></>
              )}
            </h1>
            <p className="text-primary-100 text-sm md:text-base mt-2 max-w-xl leading-relaxed">
              Your clinic activity in one place — appointments, reminders, payments, calls and more, updated in real time.
            </p>

            {/* Hero action row */}
            <div className="mt-5 flex flex-wrap items-center gap-2.5">
              {unreadCount > 0 ? (
                <button
                  onClick={handleMarkAllRead}
                  disabled={markingAll}
                  className="h-11 px-5 text-sm font-bold bg-white text-primary-700 rounded-xl hover:bg-primary-50 shadow-[var(--shadow-sm)] hover:shadow-[var(--shadow-md)] transition-all flex items-center gap-2 disabled:opacity-60"
                >
                  <CheckCheck className="h-4 w-4" />
                  {markingAll ? 'Marking all read...' : 'Mark all as read'}
                </button>
              ) : (
                <button
                  onClick={handleRefresh}
                  disabled={refreshing}
                  className="h-11 px-5 text-sm font-bold bg-white/15 text-white border border-white/25 rounded-xl hover:bg-white/25 transition-all flex items-center gap-2 disabled:opacity-60"
                >
                  <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
                  Refresh
                </button>
              )}
              <button
                onClick={() => setActiveChip('unread')}
                className="h-11 px-5 text-sm font-semibold bg-white/10 text-white border border-white/20 rounded-xl hover:bg-white/15 transition-all flex items-center gap-2"
              >
                <Radio className="h-4 w-4" />
                Show unread only
              </button>
            </div>
          </div>

          {/* Right — stat tiles + spark */}
          <div className="md:col-span-5">
            <div className="grid grid-cols-3 gap-2.5">
              <StatTile label="Unread"  value={unreadCount}           highlight={unreadCount > 0} />
              <StatTile label="Today"   value={todayCount} />
              <StatTile label="Visible" value={notifications.length} />
            </div>

            {/* Activity spark — 7-day rhythm */}
            <div className="mt-4 rounded-2xl bg-white/10 backdrop-blur-sm border border-white/15 px-4 py-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5">
                  <Activity className="h-3.5 w-3.5 text-white/70" />
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-white/70">7-day rhythm</span>
                </div>
                <span className="text-[10px] text-white/50 font-mono tabular-nums">
                  {activityBars.reduce((s, b) => s + b.count, 0)} events
                </span>
              </div>
              <div className="flex items-end justify-between h-10 gap-1.5">
                {activityBars.map((b, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center justify-end">
                    <div
                      className={`w-full rounded-full transition-all duration-500 ${b.count > 0 ? 'bg-amber-300' : 'bg-white/20'}`}
                      style={{ height: `${Math.max(8, b.pct)}%`, minHeight: 4 }}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </motion.section>

      {error && <ErrorAlert message={error} />}

      {/* ═══════════════════════════════════════════ */}
      {/* CATEGORY TILES — quick filter                */}
      {/* ═══════════════════════════════════════════ */}
      <CategoryTiles
        counts={categoryCounts}
        activeChip={activeChip}
        onSelect={(key) => setActiveChip(key)}
      />

      {/* ═══════════════════════════════════════════ */}
      {/* FILTER CHIPS                                 */}
      {/* ═══════════════════════════════════════════ */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1 }}
        className="relative"
      >
        <div className="flex items-center gap-2 overflow-x-auto scrollbar-thin pb-1 -mx-1 px-1">
          {FILTER_CHIPS.map(({ key, label, icon: ChipIcon }) => {
            const active = activeChip === key;
            return (
              <button
                key={key}
                onClick={() => setActiveChip(key)}
                className={`shrink-0 inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full text-[12px] font-semibold border transition-all ${
                  active
                    ? 'bg-primary-600 text-white border-primary-600 shadow-[var(--shadow-sm)] scale-[1.02]'
                    : 'bg-white text-neutral-600 border-neutral-200 hover:bg-neutral-50 hover:border-neutral-300'
                }`}
              >
                <ChipIcon className="h-3.5 w-3.5" />
                {label}
              </button>
            );
          })}
        </div>
      </motion.div>

      {/* ═══════════════════════════════════════════ */}
      {/* BODY — loader / empty / timeline             */}
      {/* ═══════════════════════════════════════════ */}
      {loading ? (
        <NotificationSkeleton />
      ) : notifications.length === 0 ? (
        <CelebrationEmpty activeChip={activeChip} label={activeChipMeta.label} onReset={() => setActiveChip('all')} />
      ) : (
        <div className="space-y-8">
          {/* Missed calls appear first on Calls tab */}
          {activeChip === 'calls' && missedCalls.length > 0 && (
            <TimelineGroup
              title="Missed calls"
              subtitle={`${missedCalls.length} missed`}
              icon={PhoneMissed}
              tone="rose"
            >
              {missedCalls.map((n, i) => (
                <NotificationCard
                  key={n._id || n.id}
                  n={n}
                  index={i}
                  variant="missed"
                  markingId={markingId}
                  onClick={handleNotificationClick}
                  onMarkRead={handleMarkRead}
                />
              ))}
            </TimelineGroup>
          )}

          {/* Time-bucketed groups */}
          {['today', 'yesterday', 'week', 'earlier'].map((bucket) => {
            const list = groupedByTime[bucket];
            if (!list || list.length === 0) return null;
            const bucketMeta = BUCKET_META[bucket];
            return (
              <TimelineGroup
                key={bucket}
                title={bucketMeta.label}
                subtitle={`${list.length} update${list.length !== 1 ? 's' : ''}`}
                icon={bucketMeta.icon}
                tone="primary"
              >
                {list.map((n, i) => (
                  <NotificationCard
                    key={n._id || n.id}
                    n={n}
                    index={i}
                    markingId={markingId}
                    onClick={handleNotificationClick}
                    onMarkRead={handleMarkRead}
                  />
                ))}
              </TimelineGroup>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {(meta.total || 0) > 15 && (
        <div className="bg-white rounded-2xl border border-neutral-200 shadow-[var(--shadow-sm)] px-5">
          <Pagination
            page={page}
            limit={meta.limit || 15}
            total={meta.total || 0}
            onChange={setPage}
          />
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// StatTile — glass card inside hero
// ═══════════════════════════════════════════════════════════════

function StatTile({ label, value, highlight }) {
  return (
    <div className={`rounded-2xl px-3 py-3 text-center border backdrop-blur-sm transition-all ${
      highlight
        ? 'bg-amber-300/20 border-amber-300/40'
        : 'bg-white/10 border-white/15'
    }`}>
      <div className={`text-2xl md:text-[26px] font-bold font-display tabular-nums leading-none ${
        highlight ? 'text-amber-300' : 'text-white'
      }`}>
        {value}
      </div>
      <div className="text-[10px] uppercase tracking-wider font-semibold text-white/70 mt-1">
        {label}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// CategoryTiles — quick type filter
// ═══════════════════════════════════════════════════════════════

const CATEGORY_ORDER = ['appointment', 'reminder', 'payment', 'video_call', 'chat_message', 'dental_scan', 'emergency', 'alert'];

function CategoryTiles({ counts, activeChip, onSelect }) {
  // Map type → chip key
  const TYPE_TO_CHIP = {
    video_call:   'calls',
    chat_message: 'messages',
    emergency:    'emergencies',
    appointment:  'appointment',
    reminder:     'reminder',
    payment:      'payment',
    dental_scan:  'dental_scan',
    alert:        'all',
  };

  const visible = CATEGORY_ORDER.filter((t) => (counts[t] || 0) > 0);
  if (visible.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: 0.05 }}
      className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3"
    >
      {visible.slice(0, 8).map((type) => {
        const cfg = getTypeConfig(type);
        const Icon = cfg.icon;
        const chipKey = TYPE_TO_CHIP[type] || 'all';
        const active = activeChip === chipKey;
        return (
          <button
            key={type}
            onClick={() => onSelect(chipKey)}
            className={`group relative text-left bg-white rounded-2xl border transition-all overflow-hidden p-4 hover:-translate-y-0.5 ${
              active
                ? 'border-primary-300 shadow-[0_8px_24px_-8px_rgba(46,106,184,0.35)] ring-2 ring-primary-200'
                : 'border-neutral-200 shadow-[var(--shadow-sm)] hover:shadow-[var(--shadow-md)]'
            }`}
          >
            {/* Tile color stripe */}
            <div className={`absolute top-0 left-0 right-0 h-1 ${cfg.stripe}`} />

            <div className="flex items-center justify-between">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${cfg.bg}`}>
                <Icon className={`h-5 w-5 ${cfg.text}`} />
              </div>
              <ChevronRight className={`h-4 w-4 text-neutral-300 group-hover:text-neutral-500 transition-colors`} />
            </div>
            <div className="mt-3">
              <div className="text-2xl font-bold font-display text-neutral-900 tabular-nums leading-none">
                {counts[type]}
              </div>
              <div className="text-xs font-medium text-neutral-500 mt-1">
                {cfg.label}
              </div>
            </div>
          </button>
        );
      })}
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════
// TimelineGroup — section header + spine-aligned cards
// ═══════════════════════════════════════════════════════════════

function TimelineGroup({ title, subtitle, icon: Icon, tone = 'primary', children }) {
  const toneClass = {
    primary: { box: 'bg-primary-50 text-primary-600', line: 'from-primary-200 via-primary-100' },
    rose:    { box: 'bg-rose-50 text-rose-600',       line: 'from-rose-200 via-rose-100' },
  }[tone] || { box: 'bg-primary-50 text-primary-600', line: 'from-primary-200 via-primary-100' };

  return (
    <section>
      <div className="flex items-center gap-3 mb-4">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${toneClass.box}`}>
          <Icon className="h-4 w-4" />
        </div>
        <div>
          <h2 className="text-[15px] font-semibold font-display text-neutral-900 leading-tight">{title}</h2>
          <p className="text-[11px] text-neutral-500 font-medium">{subtitle}</p>
        </div>
        <div className={`flex-1 h-px bg-gradient-to-r to-transparent ${toneClass.line}`} />
      </div>
      <div className="space-y-2.5">{children}</div>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════════
// NotificationCard — the hero of this page
// ═══════════════════════════════════════════════════════════════

function NotificationCard({ n, index = 0, variant = 'default', markingId, onClick, onMarkRead }) {
  const id = n._id || n.id;
  const unread = !n.read && !n.isRead;
  const config = getTypeConfig(n.type);
  const Icon = config.icon;
  const isMissed = variant === 'missed';

  // Quick action per type
  const quickAction = (() => {
    if (isMissed) return { label: 'Call back', icon: PhoneIncoming };
    switch (n.type) {
      case 'chat_message': return { label: 'Reply', icon: MessageCircle };
      case 'video_call':   return { label: 'Join', icon: Video };
      case 'appointment':  return { label: 'View', icon: ArrowRight };
      case 'payment':      return { label: 'Pay now', icon: CreditCard };
      case 'emergency':    return { label: 'Open', icon: Zap };
      default:             return { label: 'Open', icon: ArrowRight };
    }
  })();
  const QuickIcon = quickAction.icon;

  return (
    <motion.button
      type="button"
      onClick={() => onClick?.(n)}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: Math.min(index * 0.04, 0.3), ease: 'easeOut' }}
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.995 }}
      className={`group relative w-full text-left bg-white rounded-2xl border overflow-hidden transition-shadow ${
        isMissed
          ? 'border-rose-200 shadow-[var(--shadow-xs)] hover:shadow-[0_8px_24px_-8px_rgba(244,63,94,0.3)]'
          : unread
            ? 'border-primary-200 shadow-[var(--shadow-xs)] hover:shadow-[0_8px_24px_-8px_rgba(46,106,184,0.3)]'
            : 'border-neutral-200 hover:shadow-[var(--shadow-md)]'
      }`}
    >
      {/* Left color stripe (full height) */}
      <div className={`absolute left-0 top-0 bottom-0 w-1 ${
        isMissed ? 'bg-rose-500' : unread ? config.stripe : 'bg-neutral-200'
      }`} />

      {/* Unread glow pulse (subtle) */}
      {unread && !isMissed && (
        <div className="pointer-events-none absolute top-4 right-4 flex h-2.5 w-2.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-primary-500 ring-2 ring-white" />
        </div>
      )}

      <div className="p-4 sm:p-5 pl-5 sm:pl-6 flex gap-3 sm:gap-4">
        {/* Icon box */}
        <div
          className={`relative w-11 h-11 rounded-xl shrink-0 flex items-center justify-center ${
            isMissed ? 'bg-rose-50 text-rose-600' : `${config.bg} ${config.text}`
          }`}
        >
          {isMissed ? <PhoneMissed className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1 pr-6">
              <h3 className={`text-sm leading-snug ${
                unread ? 'font-semibold text-neutral-900' : 'font-medium text-neutral-700'
              }`}>
                {n.title || (isMissed ? 'Missed video call' : 'Notification')}
              </h3>
              {(n.message || n.body || n.preview) && (
                <p className="text-[13px] text-neutral-500 mt-1 line-clamp-2 leading-relaxed">
                  {n.message || n.body || n.preview}
                </p>
              )}
            </div>

            <div className="flex flex-col items-end gap-1.5 shrink-0">
              <span className="text-[11px] text-neutral-400 whitespace-nowrap font-medium tabular-nums">
                {timeAgo(n.createdAt || n.date)}
              </span>
            </div>
          </div>

          {/* Footer row — type pill + actions */}
          <div className="mt-3 flex items-center justify-between gap-2">
            <span
              className={`inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-md ${
                isMissed ? 'bg-rose-50 text-rose-600' : `${config.bg} ${config.text}`
              }`}
            >
              {isMissed ? 'Missed · Call' : config.label}
            </span>

            <div className="flex items-center gap-1.5">
              {unread && (
                <span
                  onClick={(e) => { e.stopPropagation(); onMarkRead?.(id); }}
                  role="button"
                  tabIndex={0}
                  aria-label="Mark as read"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.stopPropagation();
                      onMarkRead?.(id);
                    }
                  }}
                  className={`inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded-lg transition ${
                    markingId === id
                      ? 'bg-neutral-100 text-neutral-400 cursor-wait'
                      : 'text-neutral-500 hover:text-primary-700 hover:bg-primary-50'
                  }`}
                >
                  <Check className="h-3 w-3" />
                  {markingId === id ? 'Marking...' : 'Mark read'}
                </span>
              )}
              <span className={`inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold rounded-lg transition-all ${
                isMissed
                  ? 'bg-rose-600 text-white group-hover:bg-rose-700'
                  : 'bg-neutral-900 text-white opacity-0 group-hover:opacity-100 translate-x-2 group-hover:translate-x-0'
              }`}>
                <QuickIcon className="h-3 w-3" />
                {quickAction.label}
              </span>
            </div>
          </div>
        </div>
      </div>
    </motion.button>
  );
}

// ═══════════════════════════════════════════════════════════════
// CelebrationEmpty — rich empty state
// ═══════════════════════════════════════════════════════════════

function CelebrationEmpty({ activeChip, label, onReset }) {
  const isAll = activeChip === 'all';
  const isUnread = activeChip === 'unread';

  const headline = isUnread ? "You're all caught up!" : isAll ? 'Nothing here yet' : `No ${label.toLowerCase()}`;
  const body = isUnread
    ? 'Every update is read. Enjoy a moment of calm — we\'ll notify you the moment anything new arrives.'
    : isAll
      ? 'Your clinic activity — appointments, reminders, payments and messages — will stream in here as soon as it happens.'
      : `We couldn't find any notifications in "${label}" right now. Try a different filter or check back later.`;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      className="relative overflow-hidden bg-white rounded-3xl border border-neutral-200 shadow-[var(--shadow-sm)] py-14 px-6 md:px-10 text-center"
    >
      <div className="pointer-events-none absolute -top-10 -right-10 w-40 h-40 rounded-full bg-primary-50/80" />
      <div className="pointer-events-none absolute -bottom-14 -left-14 w-48 h-48 rounded-full bg-secondary-50/60" />

      <div className="relative">
        <div className="w-20 h-20 mx-auto rounded-3xl bg-gradient-to-br from-primary-100 to-primary-50 flex items-center justify-center mb-5 shadow-[var(--shadow-sm)]">
          {isUnread
            ? <Sparkles className="h-9 w-9 text-primary-600" />
            : <Inbox className="h-9 w-9 text-primary-600" />}
        </div>

        <h3 className="text-xl md:text-2xl font-bold font-display text-neutral-900">{headline}</h3>
        <p className="text-sm text-neutral-500 mt-2 max-w-md mx-auto leading-relaxed">{body}</p>

        {!isAll && (
          <button
            onClick={onReset}
            className="mt-6 inline-flex items-center gap-2 h-10 px-5 text-sm font-semibold bg-primary-600 text-white rounded-xl hover:bg-primary-700 shadow-[var(--shadow-sm)] hover:shadow-[var(--shadow-md)] transition-all"
          >
            <BellOff className="h-4 w-4" />
            View all notifications
          </button>
        )}
      </div>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Skeleton
// ═══════════════════════════════════════════════════════════════

function NotificationSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="bg-white rounded-2xl border border-neutral-200 p-4">
            <div className="flex items-center justify-between">
              <div className="w-10 h-10 rounded-xl bg-neutral-200 animate-pulse" />
              <div className="w-4 h-4 rounded bg-neutral-100 animate-pulse" />
            </div>
            <div className="mt-3 h-7 w-10 bg-neutral-200 rounded animate-pulse" />
            <div className="mt-1 h-3 w-20 bg-neutral-100 rounded animate-pulse" />
          </div>
        ))}
      </div>
      <div className="space-y-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="bg-white rounded-2xl border border-neutral-200 p-5 flex gap-4">
            <div className="w-11 h-11 rounded-xl bg-neutral-200 animate-pulse" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-3/4 bg-neutral-200 rounded animate-pulse" />
              <div className="h-3 w-5/6 bg-neutral-100 rounded animate-pulse" />
              <div className="h-3 w-1/2 bg-neutral-100 rounded animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
