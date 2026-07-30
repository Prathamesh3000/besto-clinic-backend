import { useState, useEffect, useCallback, useMemo } from 'react';
import { Users, Clock, AlertTriangle, RefreshCw } from 'lucide-react';
import { getWaitingPatients } from '../../api';
import { ErrorAlert, EmptyState } from '../../../platform/components/shared';
import { formatTime } from './constants';
import { WaitingSkeleton } from './skeletons';
import { stripDrPrefix } from '../../../utils/doctorName';

export default function WaitingTab({ branch, timerRef }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchWaiting = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = {};
      if (branch) params.branch = branch;
      const res = await getWaitingPatients(params);
      setData(res.data || []);
    } catch (err) {
      setError(err.message || 'Failed to load waiting patients');
    } finally {
      setLoading(false);
    }
  }, [branch]);

  useEffect(() => {
    fetchWaiting();
    clearInterval(timerRef.current);
    timerRef.current = setInterval(fetchWaiting, 60_000);
    return () => clearInterval(timerRef.current);
  }, [fetchWaiting]);

  const stats = useMemo(() => {
    const critical = data.filter((p) => p.severity === 'critical').length;
    const warning = data.filter((p) => p.severity === 'warning').length;
    const avgWait = data.length > 0
      ? Math.round(data.reduce((sum, p) => sum + (p.waitMinutes || 0), 0) / data.length)
      : 0;
    const maxWait = data.length > 0 ? Math.max(...data.map((p) => p.waitMinutes || 0)) : 0;
    return { critical, warning, avgWait, maxWait };
  }, [data]);

  if (error) return <ErrorAlert message={error} />;
  if (loading && data.length === 0) return <WaitingSkeleton />;

  return (
    <div className="space-y-4">
      {/* Critical alert */}
      {stats.critical > 0 && (
        <div className="px-4 py-3 bg-red-50 rounded-xl flex items-center gap-3">
          <AlertTriangle className="h-4 w-4 text-red-500 shrink-0 animate-pulse" />
          <span className="text-sm text-red-700 font-medium">
            {stats.critical} patient{stats.critical > 1 ? 's' : ''} waiting over 45 minutes
          </span>
        </div>
      )}
      {stats.warning > 0 && stats.critical === 0 && (
        <div className="px-4 py-3 bg-amber-50 rounded-xl flex items-center gap-3">
          <Clock className="h-4 w-4 text-amber-500 shrink-0" />
          <span className="text-sm text-amber-700 font-medium">
            {stats.warning} patient{stats.warning > 1 ? 's' : ''} waiting over 25 minutes
          </span>
        </div>
      )}

      {/* Main table panel */}
      <div className="bg-white rounded-2xl border border-neutral-200 shadow-[var(--shadow-sm)] overflow-hidden">
        <div className="px-6 py-4 border-b border-neutral-200 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <div>
              <h3 className="text-base font-semibold font-display text-neutral-900">Waiting Room</h3>
              <p className="text-xs text-neutral-500 mt-0.5">
                {data.length > 0 ? `${data.length} patient${data.length > 1 ? 's' : ''} waiting` : 'No patients waiting'}
              </p>
            </div>
            {data.length > 0 && (
              <div className="hidden sm:flex items-center gap-4 text-xs text-neutral-500">
                <span>Avg: <span className="font-semibold text-neutral-700 tabular-nums">{stats.avgWait}m</span></span>
                <span>Longest: <span className={`font-semibold tabular-nums ${stats.maxWait >= 45 ? 'text-red-600' : stats.maxWait >= 25 ? 'text-amber-600' : 'text-neutral-700'}`}>{stats.maxWait}m</span></span>
              </div>
            )}
          </div>
          <button
            onClick={fetchWaiting}
            disabled={loading}
            className="p-2 rounded-lg hover:bg-neutral-50 text-neutral-400 hover:text-primary-600 transition disabled:opacity-30"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {data.length === 0 ? (
          <div className="py-16">
            <EmptyState icon={Users} title="All clear" message="No patients are currently waiting." />
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-neutral-200 bg-neutral-50">
                <th className="text-left py-3 px-6 text-[11px] font-semibold text-neutral-500 uppercase tracking-wide w-12">#</th>
                <th className="text-left py-3 px-3 text-[11px] font-semibold text-neutral-500 uppercase tracking-wide">Patient</th>
                <th className="text-left py-3 px-3 text-[11px] font-semibold text-neutral-500 uppercase tracking-wide hidden sm:table-cell">Doctor</th>
                <th className="text-left py-3 px-3 text-[11px] font-semibold text-neutral-500 uppercase tracking-wide hidden md:table-cell">Branch</th>
                <th className="text-left py-3 px-3 text-[11px] font-semibold text-neutral-500 uppercase tracking-wide">Priority</th>
                <th className="text-right py-3 px-6 text-[11px] font-semibold text-neutral-500 uppercase tracking-wide">Wait</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {data.map((p, i) => {
                const waitColor = p.severity === 'critical' ? 'text-red-600' : p.severity === 'warning' ? 'text-amber-600' : 'text-neutral-700';
                return (
                  <tr key={p._id} className="hover:bg-neutral-50/50 transition-colors">
                    <td className="py-3.5 px-6 text-xs text-neutral-400 tabular-nums">{p.tokenNumber || i + 1}</td>
                    <td className="py-3.5 px-3">
                      <p className="text-sm font-medium text-neutral-900">{p.patient?.name || 'Patient'}</p>
                    </td>
                    <td className="py-3.5 px-3 hidden sm:table-cell">
                      <span className="text-xs text-neutral-600">Dr. {stripDrPrefix(p.doctor?.name || '\u2014')}</span>
                    </td>
                    <td className="py-3.5 px-3 hidden md:table-cell">
                      <span className="text-xs text-neutral-500">{p.branch?.name || '\u2014'}</span>
                    </td>
                    <td className="py-3.5 px-3">
                      {p.priority === 'emergency' ? (
                        <span className="text-[10px] bg-red-50 text-red-600 px-2 py-0.5 rounded-full font-semibold uppercase">Urgent</span>
                      ) : p.priority === 'high' ? (
                        <span className="text-[10px] bg-amber-50 text-amber-600 px-2 py-0.5 rounded-full font-semibold uppercase">High</span>
                      ) : (
                        <span className="text-[10px] text-neutral-400">Normal</span>
                      )}
                    </td>
                    <td className="py-3.5 px-6 text-right">
                      <p className={`text-sm font-bold font-display tabular-nums ${waitColor}`}>{p.waitMinutes}m</p>
                      <p className="text-[10px] text-neutral-400">{formatTime(p.waitingSince)}</p>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
