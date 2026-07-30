/**
 * CareTaskChecklist - Timeline view component for care reminder tracking
 *
 * Features:
 * - Status-based visual indicators (completed, skipped, missed, pending)
 * - Response details display
 * - Manual marking for missed reminders
 * - Countdown timer for upcoming reminders
 * - Empty state for no reminders
 *
 * @version 1.0
 * @date April 2026
 */

import { Check, X, AlertCircle, Clock, CheckCircle2 } from 'lucide-react';
import { useState, useEffect } from 'react';

/* ── Helper Functions ──────────────────────────────────── */

function formatDateTime(dateStr) {
  if (!dateStr) return '--';
  const date = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const todayOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const yesterdayOnly = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate());
  const tomorrowOnly = new Date(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate());

  const timeStr = date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });

  if (dateOnly.getTime() === todayOnly.getTime()) {
    return `Today at ${timeStr}`;
  } else if (dateOnly.getTime() === yesterdayOnly.getTime()) {
    return `Yesterday at ${timeStr}`;
  } else if (dateOnly.getTime() === tomorrowOnly.getTime()) {
    return `Tomorrow at ${timeStr}`;
  } else {
    const dateOnlyStr = date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    return `${dateOnlyStr} at ${timeStr}`;
  }
}

function getTimeUntil(scheduledAt) {
  const now = new Date();
  const scheduled = new Date(scheduledAt);
  const diff = scheduled - now;

  if (diff < 0) return null;

  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  if (hours > 24) {
    const days = Math.floor(hours / 24);
    return `in ${days} day${days !== 1 ? 's' : ''}`;
  } else if (hours > 0) {
    return `in ${hours}h ${minutes}m`;
  } else if (minutes > 0) {
    return `in ${minutes}m`;
  } else {
    return 'soon';
  }
}

/* ── Status Configuration ─────────────────────────────── */

const STATUS_CONFIG = {
  completed: {
    icon: CheckCircle2,
    bgColor: 'bg-emerald-50',
    iconColor: 'text-emerald-700',
    badge: 'bg-emerald-100 text-emerald-800',
    label: 'Done',
  },
  skipped: {
    icon: X,
    bgColor: 'bg-neutral-100',
    iconColor: 'text-neutral-600',
    badge: 'bg-neutral-200 text-neutral-700',
    label: 'Skipped',
  },
  missed: {
    icon: AlertCircle,
    bgColor: 'bg-red-50',
    iconColor: 'text-red-700',
    badge: 'bg-red-100 text-red-800',
    label: 'Missed',
  },
  pending: {
    icon: Clock,
    bgColor: 'bg-blue-50',
    iconColor: 'text-blue-700',
    badge: 'bg-blue-100 text-blue-800',
    label: 'Upcoming',
  },
};

/* ── ReminderItem Component ───────────────────────────── */

function ReminderItem({ reminder, onMarkComplete }) {
  const [countdown, setCountdown] = useState('');

  // Update countdown every minute for pending reminders
  useEffect(() => {
    if (reminder.status === 'pending') {
      const updateCountdown = () => {
        const timeUntil = getTimeUntil(reminder.scheduledAt);
        setCountdown(timeUntil || '');
      };

      updateCountdown();
      const interval = setInterval(updateCountdown, 60000); // Update every minute

      return () => clearInterval(interval);
    }
  }, [reminder.scheduledAt, reminder.status]);

  const config = STATUS_CONFIG[reminder.status] || STATUS_CONFIG.pending;
  const Icon = config.icon;

  return (
    <div className="flex items-start gap-3 py-3 border-b border-neutral-200 last:border-0">
      {/* Status Icon */}
      <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${config.bgColor}`}>
        <Icon className={`h-4 w-4 ${config.iconColor}`} />
      </div>

      {/* Reminder Details */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-neutral-900">
            {formatDateTime(reminder.scheduledAt)}
          </span>
          <span className={`text-xs px-2 py-0.5 rounded font-medium ${config.badge}`}>
            {config.label}
          </span>
          {reminder.status === 'pending' && countdown && (
            <span className="text-xs text-blue-600 font-medium">
              {countdown}
            </span>
          )}
        </div>

        {/* Patient Response */}
        {reminder.response && (
          <p className="text-xs text-neutral-600 mt-1">
            <span className="font-semibold">Patient response:</span> {reminder.response}
          </p>
        )}

        {/* Response Timestamp */}
        {reminder.respondedAt && (
          <p className="text-[10px] text-neutral-400 mt-0.5">
            Responded on {formatDateTime(reminder.respondedAt)}
          </p>
        )}
      </div>

      {/* Actions */}
      {reminder.status === 'missed' && onMarkComplete && (
        <button
          type="button"
          onClick={() => onMarkComplete(reminder._id)}
          className="text-xs text-emerald-600 hover:text-emerald-700 font-semibold hover:underline transition-colors shrink-0"
        >
          Mark as Done
        </button>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   Main Component — Care Task Checklist
   ══════════════════════════════════════════════════════════ */

export default function CareTaskChecklist({
  reminders = [],
  onMarkComplete,
  showEmpty = true,
}) {
  // Sort reminders by scheduled time (oldest first)
  const sortedReminders = [...reminders].sort((a, b) => {
    return new Date(a.scheduledAt) - new Date(b.scheduledAt);
  });

  // Group reminders by status category
  const pastReminders = sortedReminders.filter((r) =>
    ['completed', 'skipped', 'missed'].includes(r.status)
  );
  const upcomingReminders = sortedReminders.filter((r) => r.status === 'pending');

  // Empty state
  if (reminders.length === 0) {
    if (!showEmpty) return null;

    return (
      <div className="text-center py-8">
        <div className="w-12 h-12 rounded-full bg-neutral-100 flex items-center justify-center mx-auto mb-3">
          <Clock className="h-6 w-6 text-neutral-400" />
        </div>
        <p className="text-sm font-medium text-neutral-500">No reminders scheduled</p>
        <p className="text-xs text-neutral-400 mt-1">
          Reminders will appear here once scheduled
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Upcoming Reminders Section */}
      {upcomingReminders.length > 0 && (
        <div>
          <h4 className="text-xs font-bold text-neutral-900/60 uppercase tracking-wider mb-3">
            Upcoming ({upcomingReminders.length})
          </h4>
          <div className="space-y-0">
            {upcomingReminders.map((reminder) => (
              <ReminderItem
                key={reminder._id}
                reminder={reminder}
                onMarkComplete={onMarkComplete}
              />
            ))}
          </div>
        </div>
      )}

      {/* Past Reminders Section */}
      {pastReminders.length > 0 && (
        <div>
          <h4 className="text-xs font-bold text-neutral-900/60 uppercase tracking-wider mb-3">
            Past ({pastReminders.length})
          </h4>
          <div className="space-y-0">
            {pastReminders.map((reminder) => (
              <ReminderItem
                key={reminder._id}
                reminder={reminder}
                onMarkComplete={onMarkComplete}
              />
            ))}
          </div>
        </div>
      )}

      {/* Summary Stats */}
      {reminders.length > 0 && (
        <div className="pt-3 border-t border-neutral-200">
          <div className="flex items-center justify-between text-xs">
            <span className="text-neutral-500">Total Reminders:</span>
            <span className="font-semibold text-neutral-900">{reminders.length}</span>
          </div>
          <div className="flex items-center justify-between text-xs mt-1">
            <span className="text-neutral-500">Completion Rate:</span>
            <span className="font-semibold text-emerald-700">
              {Math.round(
                (reminders.filter((r) => r.status === 'completed').length / reminders.length) * 100
              )}%
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
