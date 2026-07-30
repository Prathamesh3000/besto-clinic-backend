import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BarChart3, DollarSign, Calendar, Users, RefreshCw,
} from 'lucide-react';
import {
  getAnalyticsSummary, getRevenueTrends, getAppointmentTrends,
  getDoctorPerformance, getNoShowAnalysis, getInsuranceClaimTrends,
  getTelemedicineUsage, getPatientGrowth,
} from '../../api';
import {
  SELECT_CLS, PeriodToggle, ErrorMessage,
  formatPeriodLabel, buildPaymentModeBreakdown, getDefaultDateRange, unwrap,
} from './analytics-shared';
import OverviewPanel from './OverviewPanel';
import FinancialPanel from './FinancialPanel';
import ClinicalPanel from './ClinicalPanel';
import PatientsPanel from './PatientsPanel';


/* ─── Constants ───────────────────────────────── */
const TABS = [
  { key: 'overview', label: 'Overview', icon: BarChart3 },
  { key: 'financial', label: 'Financial', icon: DollarSign },
  { key: 'clinical', label: 'Clinical', icon: Calendar },
  { key: 'patients', label: 'Patients', icon: Users },

];

const PERIODS = [
  { key: 'daily', label: 'Daily' },
  { key: 'weekly', label: 'Weekly' },
  { key: 'monthly', label: 'Monthly' },
];

const tabMotion = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.3 } },
  exit: { opacity: 0, y: -8, transition: { duration: 0.15 } },
};

/* ─── Main Component ──────────────────────────── */
export default function AnalyticsDashboard() {
  const [summary, setSummary] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [period, setPeriod] = useState('monthly');
  const [dateRange, setDateRange] = useState(getDefaultDateRange);
  const [tabData, setTabData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tabLoading, setTabLoading] = useState(false);
  const [error, setError] = useState('');

  /* Cache: key → data */
  const cacheRef = useRef({});

  /* Invalidate cache when period or date range changes */
  useEffect(() => {
    cacheRef.current = {};
  }, [period, dateRange]);

  /* ── Build cache key ── */
  const cacheKey = `${activeTab}_${period}_${dateRange.startDate}_${dateRange.endDate}`;

  /* ── Fetch summary (global stats for header / overview) ── */
  const fetchSummary = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const res = await getAnalyticsSummary({
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
      });
      setSummary(unwrap(res));
    } catch (err) {
      setError(err.message || 'Failed to load analytics summary');
    } finally {
      setLoading(false);
    }
  }, [dateRange]);

  /* ── Fetch tab-specific data with caching ── */
  const fetchTabData = useCallback(async () => {
    const key = `${activeTab}_${period}_${dateRange.startDate}_${dateRange.endDate}`;

    /* Return cached data instantly */
    if (cacheRef.current[key]) {
      setTabData(cacheRef.current[key]);
      return;
    }

    const params = {
      period,
      startDate: dateRange.startDate,
      endDate: dateRange.endDate,
    };

    try {
      setTabLoading(true);
      setError('');
      let data = null;

      switch (activeTab) {
        /* ── Overview ── */
        case 'overview': {
          const [revRaw, apptRaw, , teleRaw, insRaw] = await Promise.all([
            getRevenueTrends(params).catch(() => ({})),
            getAppointmentTrends(params).catch(() => ({})),
            getNoShowAnalysis(params).catch(() => ({})),
            getTelemedicineUsage(params).catch(() => ({})),
            getInsuranceClaimTrends(params).catch(() => ({})),
          ]);
          const rev = unwrap(revRaw);
          const appt = unwrap(apptRaw);
          const tele = unwrap(teleRaw);
          const ins = unwrap(insRaw);
          data = {
            revenueTrends: (rev?.dataPoints || []).map((d) => ({ ...d, label: formatPeriodLabel(d.period) })),
            appointmentTrends: (appt?.dataPoints || []).map((d) => ({ ...d, label: formatPeriodLabel(d.period) })),
            quickStats: {
              telemedicine: { sessionsThisMonth: tele?.summary?.totalSessions || 0 },
              insurance: { approvalRate: ins?.summary?.approvalRate || 0, totalClaims: ins?.summary?.totalClaims || 0 },
            },
          };
          break;
        }

        /* ── Financial (Revenue + Insurance) ── */
        case 'financial': {
          const [revRaw, insRaw] = await Promise.all([
            getRevenueTrends(params),
            getInsuranceClaimTrends(params),
          ]);
          const rev = unwrap(revRaw);
          const ins = unwrap(insRaw);
          const insPoints = (ins?.dataPoints || []).map((d) => ({ ...d, label: formatPeriodLabel(d.period) }));
          data = {
            revenueTrends: (rev?.dataPoints || []).map((d) => ({
              ...d,
              label: formatPeriodLabel(d.period),
              ...(d.byMode || {}),
            })),
            revenueTotals: rev?.totals || {},
            paymentModeBreakdown: buildPaymentModeBreakdown(rev?.dataPoints || []),
            insuranceTrends: insPoints,
            insuranceStats: {
              totalClaims: ins?.summary?.totalClaims || 0,
              approvalRate: ins?.summary?.approvalRate || 0,
              avgProcessingDays: ins?.summary?.avgProcessingDays || '--',
              totalSettled: ins?.summary?.totalSettled || 0,
              pendingAmount: ins?.summary?.totalPending || 0,
            },
            approvalRateTrend: insPoints.map((d) => ({
              label: d.label,
              rate: d.submitted > 0 ? (d.approved / d.submitted) * 100 : 0,
            })),
          };
          break;
        }

        /* ── Clinical (Appointments + Doctors + No-Shows) ── */
        case 'clinical': {
          const [apptRaw, docRaw, noShowRaw] = await Promise.all([
            getAppointmentTrends(params),
            getDoctorPerformance(params),
            getNoShowAnalysis(params).catch(() => ({})),
          ]);
          const appt = unwrap(apptRaw);
          const doc = unwrap(docRaw);
          const ns = unwrap(noShowRaw);
          const apptPoints = (appt?.dataPoints || []).map((d) => ({ ...d, label: formatPeriodLabel(d.period) }));
          data = {
            appointmentTrends: apptPoints,
            appointmentStats: appt?.summary || {},
            completionRateTrend: apptPoints.map((d) => ({
              label: d.label,
              rate: d.total > 0 ? (d.completed / d.total) * 100 : 0,
            })),
            doctors: (doc?.doctors || []).map((d) => ({
              ...d,
              name: d.doctorName || d.name,
              appointments: d.totalAppointments,
              noShows: d.noShowCount,
            })),
            noShowAnalysis: {
              overall: ns?.overall || {},
              byDayOfWeek: ns?.byDayOfWeek || [],
              byHour: ns?.byHour || [],
              byDoctor: ns?.byDoctor || [],
            },
          };
          break;
        }

        /* ── Patients (Growth + Telemedicine) ── */
        case 'patients': {
          const [patRaw, teleRaw] = await Promise.all([
            getPatientGrowth(params),
            getTelemedicineUsage(params),
          ]);
          const pat = unwrap(patRaw);
          const tele = unwrap(teleRaw);
          const patPoints = (pat?.dataPoints || []).map((d) => ({ ...d, label: formatPeriodLabel(d.period) }));
          const telePoints = (tele?.dataPoints || []).map((d) => ({ ...d, label: formatPeriodLabel(d.period) }));
          data = {
            growth: patPoints,
            cumulative: patPoints.map((d) => ({ label: d.label, total: d.cumulativeTotal || 0 })),
            patientStats: {
              total: pat?.summary?.totalPatients || 0,
              newThisMonth: pat?.summary?.newThisMonth || 0,
              retentionRate: pat?.summary?.retentionRate || 0,
              avgNewPerMonth: pat?.summary?.avgNewPerMonth || 0,
              growthPercent: pat?.summary?.growthPercent,
            },
            telemedicineTrends: telePoints,
            telemedicineStats: tele?.summary || {},
            telemedicineByType: tele?.summary?.byType
              ? Object.entries(tele.summary.byType).map(([name, value]) => ({
                  name: name.charAt(0).toUpperCase() + name.slice(1),
                  value,
                }))
              : [],
          };
          break;
        }



        default:
          break;
      }

      /* Store in cache */
      if (data) cacheRef.current[key] = data;
      setTabData(data);
    } catch (err) {
      setError(err.message || 'Failed to load tab data');
    } finally {
      setTabLoading(false);
    }
  }, [activeTab, period, dateRange]);

  useEffect(() => { fetchSummary(); }, [fetchSummary]);
  useEffect(() => { fetchTabData(); }, [fetchTabData]);

  const handleRefresh = () => {
    cacheRef.current = {};
    fetchSummary();
    fetchTabData();
  };

  const handleDateChange = (field, value) => {
    setDateRange((prev) => ({ ...prev, [field]: value }));
  };

  /* ── Render active panel ── */
  const renderPanel = () => {
    if (error && !tabLoading) {
      return <ErrorMessage message={error} onRetry={handleRefresh} />;
    }

    switch (activeTab) {
      case 'overview':
        return <OverviewPanel summary={summary} data={tabData} loading={tabLoading || loading} />;
      case 'financial':
        return <FinancialPanel data={tabData} loading={tabLoading} />;
      case 'clinical':
        return <ClinicalPanel data={tabData} loading={tabLoading} />;
      case 'patients':
        return <PatientsPanel data={tabData} loading={tabLoading} />;


      default:
        return null;
    }
  };

  return (
    <div className="max-w-[1280px] mx-auto w-full space-y-6">
      {/* ─── Header ──────────────────────────── */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 animate-[fadeUp_0.4s_ease-out_both]">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900 font-display">Clinic Analytics</h1>
          <p className="text-sm text-neutral-500 mt-1">Comprehensive performance insights and trends</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <PeriodToggle periods={PERIODS} active={period} onChange={setPeriod} />

          <div className="flex items-center gap-2">
            <input
              type="date"
              value={dateRange.startDate}
              onChange={(e) => handleDateChange('startDate', e.target.value)}
              className={SELECT_CLS}
            />
            <span className="text-xs text-neutral-400">to</span>
            <input
              type="date"
              value={dateRange.endDate}
              onChange={(e) => handleDateChange('endDate', e.target.value)}
              className={SELECT_CLS}
            />
          </div>

          <button
            onClick={handleRefresh}
            disabled={loading || tabLoading}
            className="p-2 rounded-xl border border-neutral-200 text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100 transition disabled:opacity-50"
            title="Refresh data"
          >
            <RefreshCw className={`h-4 w-4 ${(loading || tabLoading) ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* ─── Tab Bar ─────────────────────────── */}
      <div
        className="-mx-4 px-4 overflow-x-auto scrollbar-hide animate-[fadeUp_0.4s_ease-out_both]"
        style={{ animationDelay: '50ms' }}
      >
        <div className="flex gap-1 min-w-max border-b border-neutral-200">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition ${
                  isActive
                    ? 'border-primary-600 text-primary-700'
                    : 'border-transparent text-neutral-400 hover:text-neutral-600 hover:border-neutral-300'
                }`}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ─── Tab Content with AnimatePresence ─ */}
      <AnimatePresence mode="wait">
        <motion.div key={activeTab} {...tabMotion}>
          {renderPanel()}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
