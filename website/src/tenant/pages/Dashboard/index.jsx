import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  getAnalyticsSummary, getRevenueTrends, getAppointmentTrends,
  getDoctorPerformance, getPatientGrowth,
  getCurrentQueue, getLowStockItems, getExpiringItems,
  listAppointments, listBranches,
} from '../../api';
import { useSafeTenantAuth } from '../../../hooks/useSafeAuth';
import { Plus } from 'lucide-react';

import DashStatCards from './DashStatCards';
import RevenueChart from './RevenueChart';
import AppointmentBreakdown from './AppointmentBreakdown';
import TodayTimeline from './TodayTimeline';
import LiveQueueMonitor from './LiveQueueMonitor';
import DoctorLeaderboard from './DoctorLeaderboard';
import QuickActionsRow from './QuickActionsRow';
import AlertsPanel from './AlertsPanel';
import EmergencyIndicator from '../../components/EmergencyIndicator';
import { emergencyBus } from '../../../lib/socket';

/* ─── Helpers ──────────────────────────────────── */
const formatCurrency = (n) => '₹' + (n || 0).toLocaleString('en-IN');

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function toISODate(d) {
  return d.toISOString().split('T')[0];
}

function unwrap(result) {
  if (result.status === 'fulfilled') {
    const v = result.value;
    return v?.data ?? v;
  }
  return null;
}

/* ─── Main Dashboard ───────────────────────────── */
export default function Dashboard() {
  const navigate = useNavigate();
  const { user } = useSafeTenantAuth();

  // Section data
  const [summary, setSummary] = useState(null);
  const [revenueTrends, setRevenueTrends] = useState(null);
  const [revenuePeriod, setRevenuePeriod] = useState('monthly');
  const [appointmentTrends, setAppointmentTrends] = useState(null);
  const [apptPeriod, setApptPeriod] = useState('this_month');
  const [todayAppts, setTodayAppts] = useState(null);
  const [queue, setQueue] = useState(null);
  const [doctors, setDoctors] = useState(null);
  const [lowStock, setLowStock] = useState(null);
  const [expiring, setExpiring] = useState(null);
  const [sparklines, setSparklines] = useState({});
  const [emergencyCount, setEmergencyCount] = useState(0);

  // Loading flags
  const [initialLoad, setInitialLoad] = useState(true);
  const [revenueLoading, setRevenueLoading] = useState(false);
  const [apptLoading, setApptLoading] = useState(false);
  const [branchId, setBranchId] = useState(null);

  // Date ranges (stable refs via useMemo would be ideal but these are constant per mount)
  const now = new Date();
  const today = toISODate(now);
  const monthStart = toISODate(new Date(now.getFullYear(), now.getMonth(), 1));
  const sixMonthsAgo = toISODate(new Date(now.getFullYear(), now.getMonth() - 6, 1));
  const fourteenDaysAgo = toISODate(new Date(Date.now() - 14 * 24 * 60 * 60 * 1000));

  /* ─── Initial data fetch ─────────────────────── */
  useEffect(() => {
    let cancelled = false;

    async function fetchAll() {
      // 1. Fetch branches first so we can pass branch to queue
      let primaryBranch = null;
      try {
        const brRes = await listBranches();
        const branches = brRes?.data?.branches || brRes?.data || brRes?.branches || (Array.isArray(brRes) ? brRes : []);
        if (branches.length > 0) {
          primaryBranch = branches[0]._id || branches[0].id;
          if (!cancelled) setBranchId(primaryBranch);
        }
      } catch { /* continue without queue */ }

      // 2. Parallel fetch all sections
      const results = await Promise.allSettled([
        getAnalyticsSummary(),                                                    // 0
        getRevenueTrends({ period: 'monthly', startDate: sixMonthsAgo, endDate: today }), // 1
        getAppointmentTrends({ period: 'monthly', startDate: monthStart, endDate: today }), // 2
        primaryBranch ? getCurrentQueue({ branch: primaryBranch }) : Promise.resolve([]), // 3
        getDoctorPerformance({ startDate: monthStart, endDate: today }),           // 4
        getLowStockItems(),                                                        // 5
        getExpiringItems({ days: 30 }),                                           // 6
        listAppointments({ limit: 20, sort: '-date' }),                           // 7
      ]);

      if (cancelled) return;

      setSummary(unwrap(results[0]));
      setRevenueTrends(unwrap(results[1]));
      setAppointmentTrends(unwrap(results[2]));

      const queueData = unwrap(results[3]);
      setQueue(Array.isArray(queueData) ? queueData : queueData?.data || []);

      const docData = unwrap(results[4]);
      setDoctors(docData?.doctors || (Array.isArray(docData) ? docData : []));

      const lowData = unwrap(results[5]);
      setLowStock(Array.isArray(lowData) ? lowData : lowData?.data || []);

      const expData = unwrap(results[6]);
      setExpiring(Array.isArray(expData) ? expData : expData?.data || []);

      const apptData = unwrap(results[7]);
      const apptList = apptData?.appointments || apptData?.data || (Array.isArray(apptData) ? apptData : []);
      setTodayAppts(apptList);

      // 3. Fetch sparkline data (secondary priority)
      const sparkResults = await Promise.allSettled([
        getRevenueTrends({ period: 'daily', startDate: fourteenDaysAgo, endDate: today }),
        getAppointmentTrends({ period: 'daily', startDate: fourteenDaysAgo, endDate: today }),
        getPatientGrowth({ period: 'daily', startDate: fourteenDaysAgo, endDate: today }),
      ]);

      if (cancelled) return;

      const revSpark = unwrap(sparkResults[0]);
      const apptSpark = unwrap(sparkResults[1]);
      const patSpark = unwrap(sparkResults[2]);

      setSparklines({
        revenue: (revSpark?.dataPoints || []).map((d) => ({ value: d.total || 0 })),
        appointments: (apptSpark?.dataPoints || []).map((d) => ({ value: d.total || 0 })),
        patients: (patSpark?.dataPoints || []).map((d) => ({ value: d.cumulativeTotal || d.newPatients || 0 })),
        noshow: (apptSpark?.dataPoints || []).map((d) => ({ value: d.noShow || 0 })),
      });

      setInitialLoad(false);
    }

    fetchAll();
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ─── Revenue period change ──────────────────── */
  const handleRevenuePeriodChange = useCallback(async (period) => {
    setRevenuePeriod(period);
    setRevenueLoading(true);
    try {
      const res = await getRevenueTrends({ period, startDate: sixMonthsAgo, endDate: today });
      setRevenueTrends(res?.data ?? res);
    } catch {
      // Keep existing data on error
    }
    setRevenueLoading(false);
  }, [sixMonthsAgo, today]);

  /* ─── Appointment period change ─────────────── */
  const handleApptPeriodChange = useCallback(async (period) => {
    setApptPeriod(period);
    setApptLoading(true);
    try {
      const n = new Date();
      let start, end;
      if (period === 'prev_month') {
        start = toISODate(new Date(n.getFullYear(), n.getMonth() - 1, 1));
        end = toISODate(new Date(n.getFullYear(), n.getMonth(), 0)); // last day of prev month
      } else if (period === 'last_3') {
        start = toISODate(new Date(n.getFullYear(), n.getMonth() - 2, 1));
        end = toISODate(n);
      } else {
        start = toISODate(new Date(n.getFullYear(), n.getMonth(), 1));
        end = toISODate(n);
      }
      const res = await getAppointmentTrends({ period: 'monthly', startDate: start, endDate: end });
      setAppointmentTrends(res?.data ?? res);
    } catch {
      // Keep existing data on error
    }
    setApptLoading(false);
  }, []);

  /* ─── Queue polling (every 60s) ──────────────── */
  useEffect(() => {
    if (!branchId) return;
    const interval = setInterval(async () => {
      try {
        const res = await getCurrentQueue({ branch: branchId });
        const data = res?.data ?? res;
        setQueue(Array.isArray(data) ? data : data?.data || []);
      } catch {
        // Silent fail on polling
      }
    }, 60_000);
    return () => clearInterval(interval);
  }, [branchId]);

  /* ─── Emergency socket listeners ─────────────── */
  useEffect(() => {
    const off = emergencyBus.on((event, payload) => {
      if (event === 'emergency:new') {
        setEmergencyCount((prev) => prev + 1);
      } else if (['emergency:accepted', 'emergency:cancelled', 'emergency:ended'].includes(event)) {
        setEmergencyCount((prev) => Math.max(0, prev - 1));
      }
    });
    return off;
  }, []);

  /* ─── Render ─────────────────────────────────── */
  const greeting = getGreeting();
  const displayName = user?.name || 'Admin';
  const todayApptCount = summary?.appointments?.today ?? todayAppts?.length ?? '—';
  const revenueCollected = summary?.revenue?.thisMonth;

  return (
    <div className="max-w-[1280px] mx-auto w-full space-y-6">

      {/* ── Row 0: Greeting + Context ─────────────── */}
      <div
        className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 animate-[fadeUp_0.4s_ease-out_both]"
      >
        <div>
          <h1 className="text-2xl font-semibold font-display text-neutral-900">
            {greeting}, {displayName}
          </h1>
          <p className="text-sm text-neutral-600 mt-1">
            {now.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            {!initialLoad && (
              <>
                {' · '}{todayApptCount} appointment{todayApptCount !== 1 ? 's' : ''} today
                {revenueCollected ? ` · ${formatCurrency(revenueCollected)} this month` : ''}
              </>
            )}
          </p>
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => navigate('/clinic/appointments')}
            className="h-11 px-5 text-sm font-semibold bg-primary-600 text-white rounded-lg hover:bg-primary-700 shadow-[var(--shadow-sm)] hover:shadow-[var(--shadow-md)] transition-all duration-200 flex items-center gap-2"
          >
            <Plus className="h-4 w-4" /> New Appointment
          </button>
          <button
            onClick={() => navigate('/clinic/patients')}
            className="h-11 px-4 text-sm font-medium bg-white text-primary-700 border border-primary-200 rounded-lg hover:bg-primary-50 hover:border-primary-300 transition-all duration-200"
          >
            View Patients
          </button>
        </div>
      </div>

      {/* ── Row 1: Stat Cards ─────────────────────── */}
      <DashStatCards summary={summary} sparklines={sparklines} />

      {/* ── Row 1.5: Emergency Indicator ──────────── */}
      {emergencyCount > 0 && (
        <div
          className="animate-[fadeUp_0.4s_ease-out_both]"
          style={{ animationDelay: '200ms' }}
        >
          <EmergencyIndicator
            variant="list"
            role="admin"
            limit={5}
          />
        </div>
      )}

      {/* ── Row 2: Revenue Chart + Appointment Donut ─ */}
      <div
        className="grid grid-cols-1 lg:grid-cols-12 gap-4 animate-[fadeUp_0.4s_ease-out_both]"
        style={{ animationDelay: '250ms' }}
      >
        <div className="lg:col-span-7">
          <RevenueChart
            data={revenueLoading ? null : revenueTrends}
            activePeriod={revenuePeriod}
            onPeriodChange={handleRevenuePeriodChange}
          />
        </div>
        <div className="lg:col-span-5">
          <AppointmentBreakdown
            data={appointmentTrends}
            loading={apptLoading}
            activePeriod={apptPeriod}
            onPeriodChange={handleApptPeriodChange}
          />
        </div>
      </div>

      {/* ── Row 3: Today's Timeline + Live Queue ──── */}
      <div
        className="grid grid-cols-1 lg:grid-cols-12 gap-4 animate-[fadeUp_0.4s_ease-out_both]"
        style={{ animationDelay: '300ms' }}
      >
        <div className="lg:col-span-7">
          <TodayTimeline appointments={todayAppts} loading={initialLoad} />
        </div>
        <div className="lg:col-span-5">
          <LiveQueueMonitor queue={queue} loading={initialLoad} />
        </div>
      </div>

      {/* ── Row 4: Doctor Performance ─────────────── */}
      <div
        className="animate-[fadeUp_0.4s_ease-out_both]"
        style={{ animationDelay: '350ms' }}
      >
        <DoctorLeaderboard doctors={doctors} loading={initialLoad} />
      </div>

      {/* ── Row 5: Quick Actions + QR Code ────────── */}
      <div
        className="animate-[fadeUp_0.4s_ease-out_both]"
        style={{ animationDelay: '400ms' }}
      >
        <QuickActionsRow />
      </div>

      {/* ── Row 6: Inventory Alerts ───────────────── */}
      <div
        className="animate-[fadeUp_0.4s_ease-out_both]"
        style={{ animationDelay: '450ms' }}
      >
        <AlertsPanel lowStock={lowStock} expiring={expiring} loading={initialLoad} />
      </div>
    </div>
  );
}
