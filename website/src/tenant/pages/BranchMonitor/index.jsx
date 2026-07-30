import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Stethoscope, Clock, DoorOpen, Users,
  RefreshCw, ChevronDown, X, Filter,
} from 'lucide-react';
import { getBranchCapacity, listBranches } from '../../api';
import { TabBar } from '../../../platform/components/shared';
import { TABS, timeAgo, tabMotion } from './constants';
import PresenceTab from './PresenceTab';
import WaitingTab from './WaitingTab';
import CapacityTab from './CapacityTab';
import RoomsTab from './RoomsTab';
import ActivityTab from './ActivityTab';

export default function BranchMonitor() {
  const [activeTab, setActiveTab] = useState('presence');
  const [branches, setBranches] = useState([]);
  const [selectedBranch, setSelectedBranch] = useState(() => localStorage.getItem('monitor_branch') || '');
  const [capacities, setCapacities] = useState([]);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [pollError, setPollError] = useState(false);
  const timerRef = useRef(null);

  const summary = useMemo(() => {
    if (capacities.length === 0) return null;
    const list = selectedBranch ? capacities.filter((c) => c._id === selectedBranch) : capacities;
    return list.reduce((a, c) => ({
      doctors: (a.doctors || 0) + (c.doctors?.busy || 0) + (c.doctors?.available || 0),
      waiting: (a.waiting || 0) + (c.queue?.waiting || 0),
      consulting: (a.consulting || 0) + (c.queue?.inConsultation || 0),
      rooms: (a.rooms || 0) + (c.rooms?.available || 0),
      roomsTotal: (a.roomsTotal || 0) + (c.rooms?.total || 0),
      utilization: list.length > 0 ? Math.round(list.reduce((s, x) => s + (x.utilization || 0), 0) / list.length) : 0,
    }), {});
  }, [capacities, selectedBranch]);

  useEffect(() => {
    listBranches({ limit: 200 }).then((res) => {
      const items = res.data?.items || res.data || [];
      setBranches(items);
      const stored = localStorage.getItem('monitor_branch');
      if (stored && items.length > 0 && !items.some((b) => (b._id || b.id) === stored)) {
        setSelectedBranch('');
        localStorage.removeItem('monitor_branch');
      }
    }).catch(() => {});
  }, []);

  const fetchCapacity = useCallback(async () => {
    try {
      const res = await getBranchCapacity();
      setCapacities(res.data || []);
      setLastUpdated(new Date());
      setPollError(false);
    } catch {
      setPollError(true);
    }
  }, []);

  useEffect(() => {
    fetchCapacity();
    const iv = setInterval(fetchCapacity, 120_000);
    return () => clearInterval(iv);
  }, [fetchCapacity]);

  const handleBranchChange = (val) => {
    setSelectedBranch(val);
    if (val) localStorage.setItem('monitor_branch', val);
    else localStorage.removeItem('monitor_branch');
  };

  const branchName = useMemo(() => {
    if (!selectedBranch) return null;
    return branches.find((b) => (b._id || b.id) === selectedBranch)?.name || 'Unknown';
  }, [selectedBranch, branches]);

  return (
    <div className="max-w-[1280px] mx-auto w-full space-y-6">

      {/* ── Header ────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold font-display text-neutral-900">Branch Monitor</h1>
            <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wider ${pollError ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600'}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${pollError ? 'bg-amber-400' : 'bg-emerald-500 animate-pulse'}`} />
              {pollError ? 'STALE' : 'LIVE'}
            </span>
          </div>
          <p className="text-sm text-neutral-600 mt-1">
            Real-time operations across your clinic
            {lastUpdated && <span className="text-neutral-400"> · Updated {timeAgo(lastUpdated)}</span>}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <select
              className="appearance-none pl-3 pr-8 py-2.5 text-sm rounded-lg border border-neutral-300 bg-white text-neutral-700 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 outline-none transition-all cursor-pointer font-medium"
              value={selectedBranch}
              onChange={(e) => handleBranchChange(e.target.value)}
            >
              <option value="">All Branches</option>
              {branches.map((b) => (
                <option key={b._id || b.id} value={b._id || b.id}>{b.name}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-neutral-400 pointer-events-none" />
          </div>
          <button
            onClick={fetchCapacity}
            className="h-[42px] w-[42px] rounded-lg border border-neutral-300 flex items-center justify-center hover:bg-neutral-50 text-neutral-400 hover:text-primary-600 transition"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Branch filter chip */}
      {selectedBranch && branchName && (
        <div className="flex items-center gap-2 -mt-2">
          <Filter className="h-3.5 w-3.5 text-primary-500" />
          <span className="text-xs text-neutral-500">
            Filtering: <span className="font-semibold text-primary-600">{branchName}</span>
          </span>
          <button
            onClick={() => handleBranchChange('')}
            className="flex items-center gap-1 text-xs text-neutral-400 hover:text-red-500 transition px-2 py-1 rounded-lg hover:bg-red-50"
          >
            <X className="h-3 w-3" /> Clear
          </button>
        </div>
      )}

      {/* ── Metrics Strip ─────────────────────────── */}
      {summary && (
        <div className="bg-white rounded-2xl border border-neutral-200 shadow-[var(--shadow-sm)] px-6 py-4">
          <div className="flex items-center justify-between gap-6 flex-wrap">
            <Metric icon={Stethoscope} label="Doctors Active" value={summary.doctors} />
            <div className="w-px h-8 bg-neutral-200 hidden sm:block" />
            <Metric icon={Clock} label="Waiting" value={summary.waiting} alert={summary.waiting > 5} />
            <div className="w-px h-8 bg-neutral-200 hidden sm:block" />
            <Metric icon={Users} label="In Consultation" value={summary.consulting} />
            <div className="w-px h-8 bg-neutral-200 hidden sm:block" />
            <Metric icon={DoorOpen} label="Rooms Free" value={summary.rooms} sub={`/ ${summary.roomsTotal}`} />
            <div className="w-px h-8 bg-neutral-200 hidden sm:block" />
            <UtilBar value={summary.utilization} />
          </div>
        </div>
      )}

      {/* ── Tab Bar ───────────────────────────────── */}
      <TabBar tabs={TABS} active={activeTab} onChange={setActiveTab} />

      {/* ── Tab Content ──────────────────────────── */}
      <AnimatePresence mode="wait">
        {activeTab === 'presence' && (
          <motion.div key="presence" {...tabMotion}>
            <PresenceTab branch={selectedBranch} timerRef={timerRef} />
          </motion.div>
        )}
        {activeTab === 'waiting' && (
          <motion.div key="waiting" {...tabMotion}>
            <WaitingTab branch={selectedBranch} timerRef={timerRef} />
          </motion.div>
        )}
        {activeTab === 'capacity' && (
          <motion.div key="capacity" {...tabMotion}>
            <CapacityTab timerRef={timerRef} />
          </motion.div>
        )}
        {activeTab === 'rooms' && (
          <motion.div key="rooms" {...tabMotion}>
            <RoomsTab branch={selectedBranch} branches={branches} timerRef={timerRef} />
          </motion.div>
        )}
        {activeTab === 'activity' && (
          <motion.div key="activity" {...tabMotion}>
            <ActivityTab branch={selectedBranch} timerRef={timerRef} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ── Metric cell ───────────────────────────────── */
function Metric({ icon: Icon, label, value, sub, alert }) {
  return (
    <div className="flex items-center gap-3">
      <Icon className={`h-[18px] w-[18px] ${alert ? 'text-amber-500' : 'text-neutral-400'}`} />
      <div>
        <p className="text-lg font-bold font-display text-neutral-900 leading-none tabular-nums">
          {value}{sub && <span className="text-neutral-300 text-sm font-normal ml-0.5">{sub}</span>}
        </p>
        <p className="text-[11px] text-neutral-500 mt-0.5">{label}</p>
      </div>
    </div>
  );
}

/* ── Utilization bar ──────────────────────────── */
function UtilBar({ value }) {
  const color = value > 80 ? 'text-red-600' : value > 50 ? 'text-amber-600' : 'text-emerald-600';
  const bar = value > 80 ? 'bg-red-500' : value > 50 ? 'bg-amber-500' : 'bg-emerald-500';
  return (
    <div className="min-w-[100px]">
      <div className="flex items-baseline justify-between mb-1">
        <p className="text-[11px] text-neutral-500">Utilization</p>
        <p className={`text-sm font-bold font-display tabular-nums ${color}`}>{value}%</p>
      </div>
      <div className="h-1.5 bg-neutral-100 rounded-full overflow-hidden">
        <div className={`h-full ${bar} rounded-full transition-all duration-700`} style={{ width: `${Math.min(value, 100)}%` }} />
      </div>
    </div>
  );
}
