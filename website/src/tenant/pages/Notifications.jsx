import { useState, useEffect, useCallback } from 'react';
import {
  Bell, CalendarDays, CreditCard, Settings, AlertTriangle,
  CheckCheck, Check, Inbox, BellOff,
} from 'lucide-react';
import { EmptyState, Pagination, Spinner, ErrorAlert, TabBar } from '../../platform/components/shared';
import { listNotifications, getUnreadCount, markNotificationRead, markAllNotificationsRead } from '../api';
import { initSocket, getSocket } from '../../lib/socket';

/* ─── Design Tokens ────────────────────────────── */
const cardCls = 'bg-white rounded-2xl border border-neutral-200 shadow-[var(--shadow-sm)]';
const selectCls = 'px-3 py-2 border border-neutral-200 rounded-xl text-sm bg-white text-neutral-700 focus:border-primary-400 focus:ring-2 focus:ring-primary-100 outline-none transition-all cursor-pointer';

// ─── Time helper ────────────────────────────────
function timeAgo(date) {
  const seconds = Math.floor((Date.now() - new Date(date)) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// ─── Type icon mapping (admin-relevant only) ────
const TYPE_CONFIG = {
  appointment: { icon: CalendarDays,  bg: 'bg-blue-50',    text: 'text-blue-600' },
  payment:     { icon: CreditCard,    bg: 'bg-emerald-50', text: 'text-emerald-600' },
  alert:       { icon: AlertTriangle, bg: 'bg-amber-50',   text: 'text-amber-600' },
  system:      { icon: Settings,      bg: 'bg-purple-50',  text: 'text-purple-600' },
};

function getTypeConfig(type) {
  return TYPE_CONFIG[type] || { icon: Bell, bg: 'bg-neutral-100', text: 'text-neutral-500' };
}

// ─── Admin tabs — only relevant types ───────────
const FILTER_TABS = [
  { key: 'all',         label: 'All' },
  { key: 'unread',      label: 'Unread' },
  { key: 'appointment', label: 'Appointments' },
  { key: 'payment',     label: 'Payments' },
  { key: 'alert',       label: 'Alerts' },
  { key: 'system',      label: 'System' },
];

export default function Notifications() {
  // ─── State ──────────────────────────────────────
  const [notifications, setNotifications] = useState([]);
  const [meta, setMeta] = useState({ total: 0, page: 1, limit: 15 });
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('all');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(15);
  const [markingAll, setMarkingAll] = useState(false);
  const [markingId, setMarkingId] = useState(null);

  // ─── Data fetching ────────────────────────────
  const fetchNotifications = useCallback(async () => {
    try {
      const params = { page, limit };
      if (activeTab === 'unread') params.unread = true;
      else if (activeTab !== 'all') params.type = activeTab;

      const res = await listNotifications(params);
      setNotifications(res.data || []);
      setMeta(res.meta || { total: (res.data || []).length, page, limit });
    } catch (err) {
      setError(err.message || 'Failed to load notifications');
    }
  }, [page, limit, activeTab]);

  const fetchUnreadCount = useCallback(async () => {
    try {
      const res = await getUnreadCount();
      setUnreadCount(res.data?.count ?? res.count ?? 0);
    } catch {
      // Silently ignore unread count failures
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchNotifications(), fetchUnreadCount()]).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  // Reset page when tab or limit changes
  useEffect(() => {
    setPage(1);
  }, [activeTab, limit]);

  // ─── Real-time WebSocket updates ──────────────
  useEffect(() => {
    const sock = initSocket() || getSocket();
    if (!sock) return;
    const handleNew = () => {
      fetchNotifications();
      fetchUnreadCount();
    };
    sock.on('notification:new', handleNew);
    return () => { sock.off('notification:new', handleNew); };
  }, [fetchNotifications, fetchUnreadCount]);

  // ─── Actions ──────────────────────────────────
  const handleMarkRead = async (id) => {
    setMarkingId(id);
    try {
      await markNotificationRead(id);
      setNotifications((prev) =>
        prev.map((n) => (n._id || n.id) === id ? { ...n, read: true, isRead: true } : n)
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

  const isUnread = (notification) => !notification.read && !notification.isRead;

  // ─── Loading state ────────────────────────────
  if (loading) return <Spinner />;

  return (
    <div className="max-w-[1280px] mx-auto w-full space-y-6">
      {/* Header */}
      <div
        className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 animate-[fadeUp_0.4s_ease-out_both]"
      >
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold font-display text-neutral-900">Notifications</h1>
            {unreadCount > 0 && (
              <span className="inline-flex items-center justify-center min-w-[22px] h-[22px] px-1.5 rounded-full bg-primary-600 text-white text-[11px] font-bold">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </div>
          <p className="text-sm text-neutral-500 mt-1">Stay updated with clinic activity</p>
        </div>

        <div className="flex items-center gap-3">
          <select value={limit} onChange={(e) => setLimit(Number(e.target.value))} className={selectCls}>
            <option value={15}>15 / page</option>
            <option value={30}>30 / page</option>
            <option value={50}>50 / page</option>
          </select>
          {unreadCount > 0 && (
            <button
              onClick={handleMarkAllRead}
              disabled={markingAll}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-primary-700 bg-primary-50 hover:bg-primary-100 rounded-xl transition disabled:opacity-50"
            >
              <CheckCheck className="h-4 w-4" />
              {markingAll ? 'Marking...' : 'Mark All Read'}
            </button>
          )}
        </div>
      </div>

      {error && <ErrorAlert message={error} />}

      {/* Filter Tabs */}
      <div className="animate-[fadeUp_0.4s_ease-out_both]" style={{ animationDelay: '50ms' }}>
        <TabBar tabs={FILTER_TABS} active={activeTab} onChange={setActiveTab} />
      </div>

      {/* Notification Cards */}
      {notifications.length === 0 ? (
        <EmptyState
          icon={activeTab === 'unread' ? BellOff : Inbox}
          title={activeTab === 'unread' ? 'All caught up!' : 'No notifications'}
          message={
            activeTab === 'unread'
              ? 'You have no unread notifications.'
              : activeTab !== 'all'
                ? `No ${activeTab} notifications found.`
                : 'Notifications will appear here as clinic activity occurs.'
          }
        />
      ) : (
        <div className="space-y-3">
          {notifications.map((notification, index) => {
            const id = notification._id || notification.id;
            const unread = isUnread(notification);
            const config = getTypeConfig(notification.type);
            const Icon = config.icon;

            return (
              <div
                key={id}
                className={`${cardCls} p-4 sm:p-5 transition-all duration-200 hover:shadow-[var(--shadow-md)] animate-[fadeUp_0.4s_ease-out_both] ${
                  unread ? 'border-primary-200' : ''
                }`}
                style={{ animationDelay: `${100 + index * 30}ms` }}
              >
                <div className="flex gap-3 sm:gap-4">
                  {/* Type Icon */}
                  <div className={`p-2.5 rounded-xl shrink-0 self-start ${config.bg}`}>
                    <Icon className={`h-5 w-5 ${config.text}`} />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className={`text-sm ${
                            unread
                              ? 'font-semibold text-neutral-900'
                              : 'font-medium text-neutral-600'
                          }`}>
                            {notification.title}
                          </h3>
                          {unread && (
                            <span className="w-2 h-2 rounded-full bg-primary-500 shrink-0" />
                          )}
                        </div>
                        <p className="text-sm text-neutral-500 mt-1 line-clamp-2">
                          {notification.message || notification.body || notification.preview}
                        </p>
                      </div>

                      {/* Time + Action */}
                      <div className="flex flex-col items-end gap-2 shrink-0">
                        <span className="text-[11px] text-neutral-400 whitespace-nowrap">
                          {timeAgo(notification.createdAt || notification.date)}
                        </span>
                        {unread && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleMarkRead(id);
                            }}
                            disabled={markingId === id}
                            className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-primary-600 hover:text-primary-700 bg-primary-50 hover:bg-primary-100 rounded-lg transition disabled:opacity-50"
                          >
                            <Check className="h-3 w-3" />
                            {markingId === id ? 'Marking...' : 'Mark Read'}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Type tag */}
                    <div className="flex items-center gap-2 mt-2.5">
                      <span className={`inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider px-2 py-0.5 rounded-md ${config.bg} ${config.text}`}>
                        {notification.type || 'general'}
                      </span>
                      {notification.source && (
                        <span className="text-[10px] text-neutral-400">
                          via {notification.source}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {(meta.total || 0) > limit && (
        <div className={`${cardCls} px-5`}>
          <Pagination
            page={page}
            limit={limit}
            total={meta.total || 0}
            onChange={setPage}
          />
        </div>
      )}
    </div>
  );
}
