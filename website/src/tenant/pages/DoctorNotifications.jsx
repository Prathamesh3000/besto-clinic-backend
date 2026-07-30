/**
 * DoctorNotifications — Notification center with filters.
 * Matching admin portal design system.
 */
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell, BellOff, CheckCheck, CalendarDays, Video, AlertTriangle,
  MessageSquare, CreditCard, Pill, Settings, FileText, ChevronDown,
} from 'lucide-react';
import { useTenantAuth } from '../TenantAuthContext';
import { listNotifications, getUnreadCount, markNotificationRead, markAllNotificationsRead } from '../api';
import { initSocket } from '../../lib/socket';
import { Pagination, ErrorAlert } from '../../platform/components/shared';
import {
  cardCls, btnPrimary, btnGhost, PageHeader, FilterPill,
  EmptyState, SkeletonLoader,
} from '../components/doctor/shared';

const TYPE_ICONS = {
  appointment: CalendarDays,
  telemedicine: Video,
  emergency: AlertTriangle,
  message: MessageSquare,
  billing: CreditCard,
  prescription: Pill,
  system: Settings,
  reminder: Bell,
  consultation: FileText,
};

const TYPE_COLORS = {
  appointment: 'bg-primary-50 text-primary-600',
  telemedicine: 'bg-purple-50 text-purple-600',
  emergency: 'bg-red-50 text-red-600',
  message: 'bg-blue-50 text-blue-600',
  billing: 'bg-emerald-50 text-emerald-600',
  prescription: 'bg-amber-50 text-amber-600',
  system: 'bg-neutral-100 text-neutral-600',
  reminder: 'bg-amber-50 text-amber-600',
  consultation: 'bg-purple-50 text-purple-600',
};

const FILTER_TABS = [
  { key: 'all', label: 'All' },
  { key: 'unread', label: 'Unread' },
];

const TYPE_FILTERS = [
  { key: 'all', label: 'All Types' },
  { key: 'appointment', label: 'Appointments' },
  { key: 'emergency', label: 'Emergency' },
  { key: 'telemedicine', label: 'Telemedicine' },
  { key: 'prescription', label: 'Prescriptions' },
  { key: 'message', label: 'Messages' },
];

const LIMIT = 20;

// ═══════════════════════════════════════════════════════
export default function DoctorNotifications() {
  const navigate = useNavigate();
  const { user } = useTenantAuth();

  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [unreadCount, setUnreadCount] = useState(0);
  const [filter, setFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [markingAll, setMarkingAll] = useState(false);

  // ─── Fetch notifications ───────────────────────────
  const fetchNotifications = useCallback(async (pageVal = 1) => {
    setLoading(true);
    setError('');
    try {
      const params = { page: pageVal, limit: LIMIT, sort: '-createdAt' };
      if (filter === 'unread') params.read = 'false';
      if (typeFilter !== 'all') params.type = typeFilter;

      const [notifRes, countRes] = await Promise.allSettled([
        listNotifications(params),
        getUnreadCount(),
      ]);

      if (notifRes.status === 'fulfilled') {
        const d = notifRes.value?.data || notifRes.value;
        const list = d?.notifications || d?.items || d?.data || (Array.isArray(d) ? d : []);
        setNotifications(Array.isArray(list) ? list : []);
        setTotal(d?.total ?? d?.count ?? list.length ?? 0);
      }

      if (countRes.status === 'fulfilled') {
        const c = countRes.value?.data || countRes.value;
        setUnreadCount(c?.count ?? c?.unread ?? (typeof c === 'number' ? c : 0));
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [filter, typeFilter]);

  useEffect(() => {
    fetchNotifications(page);
  }, [fetchNotifications, page]);

  // ─── Socket for real-time ──────────────────────────
  useEffect(() => {
    initSocket();
    // Re-fetch on new notification socket event
    const interval = setInterval(() => {
      getUnreadCount()
        .then((res) => {
          const c = res?.data || res;
          setUnreadCount(c?.count ?? c?.unread ?? (typeof c === 'number' ? c : 0));
        })
        .catch(() => {});
    }, 120_000);
    return () => clearInterval(interval);
  }, []);

  // ─── Mark read ─────────────────────────────────────
  const handleMarkRead = useCallback(async (notif) => {
    const id = notif._id || notif.id;
    if (notif.read) return;
    try {
      await markNotificationRead(id);
      setNotifications((prev) => prev.map((n) => (n._id || n.id) === id ? { ...n, read: true } : n));
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch { /* silent */ }
  }, []);

  const handleMarkAllRead = useCallback(async () => {
    setMarkingAll(true);
    try {
      await markAllNotificationsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch (err) {
      setError(err.message);
    } finally {
      setMarkingAll(false);
    }
  }, []);

  // ─── Navigation based on notification type ─────────
  const handleNotificationClick = useCallback((notif) => {
    handleMarkRead(notif);
    const data = notif.data || notif.metadata || {};
    if (notif.type === 'appointment' && data.appointmentId) {
      navigate(`/clinic/doctor-appointments`);
    } else if (notif.type === 'emergency' && data.sessionId) {
      navigate('/clinic/doctor-virtual-care');
    } else if (notif.type === 'telemedicine') {
      navigate('/clinic/doctor-virtual-care');
    }
  }, [handleMarkRead, navigate]);

  // ─── Filter handlers ───────────────────────────────
  const handleFilterChange = useCallback((f) => {
    setFilter(f);
    setPage(1);
  }, []);

  const handleTypeFilterChange = useCallback((t) => {
    setTypeFilter(t);
    setPage(1);
  }, []);

  // ═══════════════════════════════════════════════════
  return (
    <div className="max-w-[1280px] mx-auto w-full space-y-6">

      <PageHeader
        title="Notifications"
        subtitle={unreadCount > 0 ? `${unreadCount} unread notification${unreadCount !== 1 ? 's' : ''}` : 'All caught up'}
        actions={
          unreadCount > 0 && (
            <button onClick={handleMarkAllRead} disabled={markingAll} className={`${btnGhost} flex items-center gap-2`}>
              <CheckCheck className="h-4 w-4" /> {markingAll ? 'Marking...' : 'Mark All Read'}
            </button>
          )
        }
      />

      {error && <ErrorAlert message={error} />}

      {/* ── Filter Toolbar ──────────────────────────── */}
      <div className={`${cardCls} p-4 animate-[fadeUp_0.4s_ease-out_both]`} style={{ animationDelay: '50ms' }}>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-1.5">
            {FILTER_TABS.map((f) => (
              <FilterPill key={f.key} label={f.key === 'unread' && unreadCount > 0 ? `Unread (${unreadCount})` : f.label} active={filter === f.key} onClick={() => handleFilterChange(f.key)} />
            ))}
          </div>
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            {TYPE_FILTERS.map((tf) => (
              <FilterPill key={tf.key} label={tf.label} active={typeFilter === tf.key} onClick={() => handleTypeFilterChange(tf.key)} />
            ))}
          </div>
        </div>
      </div>

      {/* ── Notification List ──────────────────────── */}
      <div className="animate-[fadeUp_0.4s_ease-out_both]" style={{ animationDelay: '100ms' }}>
        {loading ? (
          <div className="space-y-3"><SkeletonLoader className="h-20 w-full" count={5} /></div>
        ) : notifications.length === 0 ? (
          <EmptyState
            icon={BellOff}
            title={filter === 'unread' ? 'No unread notifications' : 'No notifications'}
            message={filter === 'unread' ? 'You\'re all caught up' : 'Notifications will appear here'}
          />
        ) : (
          <div className="space-y-2">
            {notifications.map((notif, i) => {
              const type = notif.type || 'system';
              const Icon = TYPE_ICONS[type] || Bell;
              const iconCls = TYPE_COLORS[type] || TYPE_COLORS.system;
              const isUnread = !notif.read;

              return (
                <button
                  key={notif._id || notif.id || i}
                  onClick={() => handleNotificationClick(notif)}
                  className={`w-full text-left ${cardCls} p-4 flex items-start gap-4 transition-all hover:shadow-[var(--shadow-md)] hover:-translate-y-0.5 ${
                    isUnread ? 'border-l-2 border-l-primary-500' : ''
                  }`}
                >
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${iconCls}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className={`text-sm ${isUnread ? 'font-semibold text-neutral-900' : 'font-medium text-neutral-700'}`}>
                        {notif.title || notif.subject || 'Notification'}
                      </p>
                      <span className="text-[11px] text-neutral-400 shrink-0">
                        {timeAgo(notif.createdAt)}
                      </span>
                    </div>
                    {notif.message && (
                      <p className="text-xs text-neutral-500 mt-0.5 line-clamp-2">{notif.message}</p>
                    )}
                  </div>
                  {isUnread && (
                    <div className="w-2.5 h-2.5 rounded-full bg-primary-500 shrink-0 mt-1.5" />
                  )}
                </button>
              );
            })}

            {total > LIMIT && (
              <div className="pt-2">
                <Pagination page={page} limit={LIMIT} total={total} onChange={setPage} />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Time ago helper ─────────────────────────────────
function timeAgo(date) {
  if (!date) return '';
  const diff = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (diff < 60) return 'Just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}
