import { useState, useEffect, useCallback } from 'react';
import { Activity, RefreshCw, CircleDot } from 'lucide-react';
import { getActivityFeed } from '../../api';
import { ErrorAlert, EmptyState } from '../../../platform/components/shared';
import { FEED_ICONS, FEED_STYLES, formatTime } from './constants';
import { ActivitySkeleton } from './skeletons';

export default function ActivityTab({ branch, timerRef }) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchActivity = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = { limit: 60 };
      if (branch) params.branch = branch;
      const res = await getActivityFeed(params);
      setEvents(res.data || []);
    } catch (err) {
      setError(err.message || 'Failed to load activity feed');
    } finally {
      setLoading(false);
    }
  }, [branch]);

  useEffect(() => {
    fetchActivity();
    clearInterval(timerRef.current);
    timerRef.current = setInterval(fetchActivity, 60_000);
    return () => clearInterval(timerRef.current);
  }, [fetchActivity]);

  if (error) return <ErrorAlert message={error} />;
  if (loading && events.length === 0) return <ActivitySkeleton />;

  return (
    <div className="bg-white rounded-2xl border border-neutral-200 shadow-[var(--shadow-sm)] overflow-hidden">
      <div className="px-6 py-4 border-b border-neutral-200 flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold font-display text-neutral-900">Activity Feed</h3>
          <p className="text-xs text-neutral-500 mt-0.5">
            {events.length > 0 ? `${events.length} events today` : 'No events yet'}
          </p>
        </div>
        <button
          onClick={fetchActivity}
          disabled={loading}
          className="p-2 rounded-lg hover:bg-neutral-50 text-neutral-400 hover:text-primary-600 transition disabled:opacity-30"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {events.length === 0 ? (
        <div className="py-16">
          <EmptyState icon={Activity} title="No activity yet" message="Events will appear here as the clinic day progresses." />
        </div>
      ) : (
        <div className="divide-y divide-neutral-100">
          {events.map((event, idx) => {
            const Icon = FEED_ICONS[event.icon] || CircleDot;
            const iconStyle = FEED_STYLES[event.type] || 'bg-neutral-100 text-neutral-400';

            return (
              <div
                key={`${event.type}-${event.timestamp}-${idx}`}
                className="px-6 py-3.5 flex items-start gap-3.5 hover:bg-neutral-50/50 transition-colors"
              >
                <div className={`w-7 h-7 rounded-lg ${iconStyle} flex items-center justify-center shrink-0 mt-0.5`}>
                  <Icon className="h-3.5 w-3.5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-neutral-700">{event.message}</p>
                  {event.branch?.name && (
                    <p className="text-[10px] text-neutral-400 mt-0.5">{event.branch.name}</p>
                  )}
                </div>
                <div className="shrink-0 text-right">
                  <span className="text-[11px] text-neutral-400 tabular-nums">{formatTime(event.timestamp)}</span>
                  {event.priority === 'emergency' && (
                    <p className="text-[9px] text-red-500 font-semibold uppercase mt-0.5">Urgent</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
