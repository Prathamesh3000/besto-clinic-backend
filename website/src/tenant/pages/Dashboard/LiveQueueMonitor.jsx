import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ListOrdered, ArrowRight, ChevronDown } from 'lucide-react';
import { QueueSkeleton } from './skeletons';

const INITIAL_SHOW = 5;

const STATUS_CONFIG = {
  waiting:          { bg: 'bg-amber-50',  text: 'text-amber-700',  label: 'Waiting' },
  called:           { bg: 'bg-blue-50',   text: 'text-blue-700',   label: 'Called' },
  in_consultation:  { bg: 'bg-purple-50', text: 'text-purple-700', label: 'In Consult' },
  completed:        { bg: 'bg-secondary-50', text: 'text-secondary-700', label: 'Done' },
  no_show:          { bg: 'bg-red-50',    text: 'text-red-600',    label: 'No Show' },
  cancelled:        { bg: 'bg-neutral-100', text: 'text-neutral-500', label: 'Cancelled' },
};

function formatWait(createdAt) {
  if (!createdAt) return '';
  const diff = Math.round((Date.now() - new Date(createdAt).getTime()) / 60000);
  if (diff < 1) return 'Just now';
  if (diff < 60) return `${diff}m`;
  return `${Math.floor(diff / 60)}h ${diff % 60}m`;
}

export default function LiveQueueMonitor({ queue, loading }) {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(false);

  const stats = useMemo(() => {
    if (!queue?.length) return { waiting: 0, inConsult: 0, completed: 0, avgWait: 0 };
    const waiting = queue.filter((q) => q.status === 'waiting').length;
    const inConsult = queue.filter((q) => q.status === 'in_consultation').length;
    const completed = queue.filter((q) => q.status === 'completed').length;
    const waitEntries = queue.filter((q) => q.status === 'waiting' && q.createdAt);
    const avgWait = waitEntries.length > 0
      ? Math.round(waitEntries.reduce((sum, q) => sum + (Date.now() - new Date(q.createdAt).getTime()) / 60000, 0) / waitEntries.length)
      : 0;
    return { waiting, inConsult, completed, avgWait };
  }, [queue]);

  if (loading) return <QueueSkeleton />;

  const activeQueue = (queue || []).filter((q) => q.status !== 'completed' && q.status !== 'cancelled');
  const hasQueue = queue && queue.length > 0;
  const visible = expanded ? activeQueue : activeQueue.slice(0, INITIAL_SHOW);
  const hasMore = activeQueue.length > INITIAL_SHOW;

  return (
    <div className="bg-white rounded-2xl border border-neutral-200 shadow-[var(--shadow-sm)] p-5 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center">
            <ListOrdered className="h-5 w-5 text-amber-600" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-[15px] font-semibold font-display text-neutral-900">Live Queue</h3>
              {activeQueue.length > 0 && (
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-secondary-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-secondary-500" />
                </span>
              )}
            </div>
            <p className="text-xs text-neutral-500">
              {activeQueue.length > 0 ? `${activeQueue.length} active` : 'No one in queue'}
            </p>
          </div>
        </div>
        <button
          onClick={() => navigate('/clinic/queue')}
          className="text-xs font-medium text-primary-600 hover:text-primary-700 flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-primary-50 transition-colors"
        >
          Manage <ArrowRight className="h-3 w-3" />
        </button>
      </div>

      {/* Queue List */}
      <div className="flex-1 space-y-2">
        {!hasQueue ? (
          <div className="flex flex-col items-center justify-center py-10 text-neutral-400">
            <ListOrdered className="h-8 w-8 mb-2 opacity-50" />
            <p className="text-xs font-medium">No patients in queue</p>
            <p className="text-[11px] text-neutral-400 mt-0.5">Queue will update in real-time</p>
          </div>
        ) : (
          visible.map((entry, i) => {
            const sc = STATUS_CONFIG[entry.status] || STATUS_CONFIG.waiting;
            const patientName = entry.patient?.name || 'Unknown';
            const doctorName = entry.doctor?.name || '';
            return (
              <div
                key={entry._id || i}
                className={`flex items-center gap-3 p-3 rounded-xl transition-colors ${
                  entry.status === 'in_consultation' ? 'bg-purple-50/50' : 'bg-neutral-50 hover:bg-neutral-100'
                }`}
              >
                {/* Token */}
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                  entry.priority === 'emergency' ? 'bg-red-100 text-red-700' :
                  entry.priority === 'high' ? 'bg-amber-100 text-amber-700' :
                  'bg-primary-100 text-primary-700'
                }`}>
                  {entry.tokenNumber || i + 1}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-neutral-800 truncate">{patientName}</p>
                  <p className="text-[11px] text-neutral-500 truncate">
                    {doctorName}{entry.createdAt ? ` · ${formatWait(entry.createdAt)}` : ''}
                  </p>
                </div>

                {/* Status */}
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium shrink-0 ${sc.bg} ${sc.text}`}>
                  {sc.label}
                </span>
              </div>
            );
          })
        )}
      </div>

      {/* View More */}
      {hasMore && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-2 w-full flex items-center justify-center gap-1 text-xs font-medium text-primary-600 hover:text-primary-700 transition-colors"
        >
          {expanded ? 'Show Less' : `View ${activeQueue.length - INITIAL_SHOW} More`}
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </button>
      )}

      {/* Footer stats */}
      {hasQueue && (
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-neutral-100 text-[11px] text-neutral-500">
          <span><span className="font-semibold text-amber-600">{stats.waiting}</span> waiting</span>
          <span><span className="font-semibold text-purple-600">{stats.inConsult}</span> in consult</span>
          <span><span className="font-semibold text-secondary-600">{stats.completed}</span> done</span>
          {stats.avgWait > 0 && <span>Avg wait: <span className="font-semibold text-neutral-700">{stats.avgWait}m</span></span>}
        </div>
      )}
    </div>
  );
}
