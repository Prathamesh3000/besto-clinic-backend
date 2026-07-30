import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell, CalendarDays, CreditCard, Settings, AlertTriangle, Clock,
  CheckCheck, ExternalLink,
} from 'lucide-react';
import { onNotification, offNotification, emitNotificationAck } from '../lib/socket';

// ─── Type icon/color mapping ──
const TYPE_CONFIG = {
  appointment: { icon: CalendarDays, bg: 'bg-primary-50',    text: 'text-primary-600' },
  payment:     { icon: CreditCard,   bg: 'bg-secondary-50',  text: 'text-secondary-600' },
  system:      { icon: Settings,     bg: 'bg-purple-50',     text: 'text-purple-600' },
  alert:       { icon: AlertTriangle, bg: 'bg-amber-50',     text: 'text-amber-600' },
  reminder:    { icon: Clock,        bg: 'bg-blue-50',       text: 'text-blue-600' },
};

function getTypeConfig(type) {
  return TYPE_CONFIG[type] || { icon: Bell, bg: 'bg-neutral-100', text: 'text-neutral-500' };
}

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

/**
 * NotificationBell — bell icon with unread badge + dropdown panel.
 */
export default function NotificationBell({ apiModule, viewAllPath }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  const dropdownRef = useRef(null);

  // Fetch unread count on mount
  useEffect(() => {
    apiModule.getUnreadCount()
      .then((res) => setUnreadCount(res.data?.count ?? res.count ?? 0))
      .catch(() => {});
  }, [apiModule]);

  // Fetch recent notifications when dropdown opens
  const fetchRecent = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiModule.listNotifications({ page: 1, limit: 5 });
      setNotifications(res.data || []);
    } catch {
      // silently ignore
    } finally {
      setLoading(false);
    }
  }, [apiModule]);

  useEffect(() => {
    if (open) fetchRecent();
  }, [open, fetchRecent]);

  // Listen for real-time notifications via WebSocket
  useEffect(() => {
    const handler = (notification) => {
      setUnreadCount((prev) => prev + 1);
      setNotifications((prev) => [notification, ...prev].slice(0, 5));
    };
    onNotification(handler);
    return () => offNotification(handler);
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [open]);

  const handleMarkRead = async (id) => {
    try {
      await apiModule.markNotificationRead(id);
      emitNotificationAck(id);
      setNotifications((prev) =>
        prev.map((n) => (n._id || n.id) === id ? { ...n, isRead: true } : n),
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch {
      // silently ignore
    }
  };

  const handleMarkAllRead = async () => {
    setMarkingAll(true);
    try {
      await apiModule.markAllNotificationsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch {
      // silently ignore
    } finally {
      setMarkingAll(false);
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell button */}
      <button
        onClick={() => setOpen(!open)}
        className="p-2 rounded-lg hover:bg-neutral-100 text-neutral-400 hover:text-neutral-600 relative transition"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold shadow-sm">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white rounded-[12px] shadow-[var(--shadow-lg)] border border-neutral-200 z-[100] overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-neutral-900">Notifications</h3>
              {unreadCount > 0 && (
                <span className="inline-flex items-center justify-center min-w-[20px] h-[20px] px-1.5 rounded-full bg-primary-600 text-white text-[10px] font-bold">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                disabled={markingAll}
                className="flex items-center gap-1 text-[11px] font-medium text-primary-600 hover:text-primary-700 disabled:opacity-50 transition"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                {markingAll ? 'Marking...' : 'Mark all read'}
              </button>
            )}
          </div>

          {/* Notification list */}
          <div className="max-h-80 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <div className="w-5 h-5 border-2 border-neutral-200 border-t-primary-600 rounded-full animate-spin" />
              </div>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-neutral-400">
                <Bell className="h-8 w-8 mb-2" />
                <p className="text-sm">No notifications yet</p>
              </div>
            ) : (
              notifications.map((notification) => {
                const id = notification._id || notification.id;
                const unread = !notification.isRead && !notification.read;
                const config = getTypeConfig(notification.type);
                const Icon = config.icon;

                return (
                  <div
                    key={id}
                    className={`flex gap-3 px-4 py-3 transition-colors cursor-pointer hover:bg-neutral-50 ${
                      unread ? 'bg-primary-50/30' : ''
                    }`}
                    onClick={() => {
                      if (unread) handleMarkRead(id);
                      // Previously this only marked the item read, so tapping a
                      // notification appeared to do nothing. Close the dropdown
                      // and open the full notifications view.
                      setOpen(false);
                      if (viewAllPath) navigate(viewAllPath);
                    }}
                  >
                    <div className={`p-1.5 rounded-lg shrink-0 self-start ${config.bg}`}>
                      <Icon className={`h-4 w-4 ${config.text}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className={`text-[13px] leading-snug line-clamp-2 ${
                          unread
                            ? 'font-semibold text-neutral-900'
                            : 'font-medium text-neutral-600'
                        }`}>
                          {notification.title}
                        </p>
                        {unread && (
                          <span className="w-2 h-2 rounded-full bg-primary-500 shrink-0 mt-1" />
                        )}
                      </div>
                      {notification.message && (
                        <p className="text-[12px] text-neutral-400 mt-0.5 line-clamp-1">
                          {notification.message}
                        </p>
                      )}
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[10px] text-neutral-400">
                          {timeAgo(notification.createdAt || notification.date)}
                        </span>
                        <span className={`text-[9px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded ${config.bg} ${config.text}`}>
                          {notification.type || 'general'}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-neutral-200">
            <button
              onClick={() => {
                setOpen(false);
                navigate(viewAllPath);
              }}
              className="w-full flex items-center justify-center gap-1.5 px-4 py-2.5 text-sm font-medium text-primary-600 hover:bg-neutral-50 transition"
            >
              View All Notifications
              <ExternalLink className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
