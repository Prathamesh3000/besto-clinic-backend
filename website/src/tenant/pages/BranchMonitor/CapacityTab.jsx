import { useState, useEffect, useCallback, useMemo } from 'react';
import { Building2, RefreshCw, Stethoscope, Clock, CalendarCheck, DoorOpen } from 'lucide-react';
import { getBranchCapacity } from '../../api';
import { ErrorAlert, EmptyState } from '../../../platform/components/shared';
import { CapacitySkeleton } from './skeletons';

export default function CapacityTab({ timerRef }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchCapacity = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await getBranchCapacity();
      setData(res.data || []);
    } catch (err) {
      setError(err.message || 'Failed to load capacity data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCapacity();
    clearInterval(timerRef.current);
    timerRef.current = setInterval(fetchCapacity, 120_000);
    return () => clearInterval(timerRef.current);
  }, [fetchCapacity]);

  if (error) return <ErrorAlert message={error} />;
  if (loading && data.length === 0) return <CapacitySkeleton />;
  if (data.length === 0) return <EmptyState icon={Building2} title="No branches" message="No active branches found." />;

  return (
    <div className="bg-white rounded-2xl border border-neutral-200 shadow-[var(--shadow-sm)] overflow-hidden">
      <div className="px-6 py-4 border-b border-neutral-200 flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold font-display text-neutral-900">Branch Capacity</h3>
          <p className="text-xs text-neutral-500 mt-0.5">{data.length} branch{data.length !== 1 ? 'es' : ''} monitored</p>
        </div>
        <button
          onClick={fetchCapacity}
          disabled={loading}
          className="p-2 rounded-lg hover:bg-neutral-50 text-neutral-400 hover:text-primary-600 transition disabled:opacity-30"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Branch rows */}
      {data.map((b, idx) => {
        const docs = b.doctors || {};
        const q = b.queue || {};
        const appts = b.appointments || {};
        const rooms = b.rooms || {};
        const util = b.utilization || 0;
        const utilColor = util > 80 ? 'text-red-600' : util > 50 ? 'text-amber-600' : 'text-emerald-600';
        const barColor = util > 80 ? 'bg-red-500' : util > 50 ? 'bg-amber-500' : 'bg-emerald-500';
        const isLast = idx === data.length - 1;

        return (
          <div key={b._id} className={`px-6 py-5 ${!isLast ? 'border-b border-neutral-100' : ''}`}>
            {/* Branch header row */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-primary-50 flex items-center justify-center shrink-0">
                  <Building2 className="h-4 w-4 text-primary-600" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-neutral-900">{b.name}</h4>
                  {b.code && <span className="text-[10px] text-neutral-400 font-mono uppercase">{b.code}</span>}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className={`text-lg font-bold font-display tabular-nums ${utilColor}`}>{util}%</span>
                <div className="w-20 h-1.5 bg-neutral-100 rounded-full overflow-hidden">
                  <div className={`h-full ${barColor} rounded-full transition-all duration-700`} style={{ width: `${Math.min(util, 100)}%` }} />
                </div>
              </div>
            </div>

            {/* Stat row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-3">
              <StatItem
                icon={Stethoscope}
                label="Doctors"
                value={<><span className="text-primary-600">{docs.busy || 0}</span> <span className="text-neutral-300">/</span> {docs.scheduled || 0}</>}
                sub={`${docs.available || 0} available`}
              />
              <StatItem
                icon={Clock}
                label="Queue"
                value={q.waiting > 0 ? <span className="text-amber-600">{q.waiting}</span> : <span className="text-emerald-600">0</span>}
                sub={`${q.inConsultation || 0} in consultation`}
              />
              <StatItem
                icon={CalendarCheck}
                label="Appointments"
                value={<><span className="text-emerald-600">{appts.completed || 0}</span> <span className="text-neutral-300">/</span> {appts.total || 0}</>}
                sub={`${appts.upcoming || 0} upcoming`}
              />
              <StatItem
                icon={DoorOpen}
                label="Rooms"
                value={<><span className="text-primary-600">{rooms.occupied || 0}</span> <span className="text-neutral-300">/</span> {rooms.total || 0}</>}
                sub={`${rooms.available || 0} available`}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function StatItem({ icon: Icon, label, value, sub }) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon className="h-3.5 w-3.5 text-neutral-400 mt-0.5 shrink-0" />
      <div>
        <p className="text-[10px] text-neutral-500 uppercase tracking-wide font-medium mb-0.5">{label}</p>
        <p className="text-sm font-semibold text-neutral-900 tabular-nums">{value}</p>
        {sub && <p className="text-[10px] text-neutral-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}
