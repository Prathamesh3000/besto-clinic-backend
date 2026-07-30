import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Pill, Activity, FolderOpen, ChevronDown, CheckCircle2,
  Download, FileText, Loader2, Bell, BellOff,
  Image, File, Paperclip, AlertCircle, Heart,
  SkipForward, CalendarPlus, Stethoscope, Clock,
} from 'lucide-react';
import {
  listPatientPrescriptions, getMedicalHistory, respondToReminder,
  getDailyCareSchedule, enablePrescriptionReminders, disablePrescriptionReminders,
} from '../api';
import { useSafePatientAuth } from '../../hooks/useSafeAuth';
import { Pagination } from '../../platform/components/shared.jsx';
import { stripDrPrefix } from '../../utils/doctorName';

/* ─── Shared tokens (matching Dashboard) ───────── */

const PAGE = 10;
const CARD = 'bg-white rounded-2xl border border-neutral-200 shadow-[var(--shadow-sm)]';

function Shimmer({ className = '' }) {
  return <div className={`animate-pulse bg-neutral-200/60 rounded-xl ${className}`} />;
}

const fmtDate = (d) => {
  const dt = new Date(d); const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${dt.getUTCDate()} ${months[dt.getUTCMonth()]} ${dt.getUTCFullYear()}`;
};

const fmtTime = (d) => {
  const dt = new Date(d); const h = dt.getUTCHours(); const m = dt.getUTCMinutes();
  return `${String(h % 12 || 12).padStart(2,'0')}:${String(m).padStart(2,'0')} ${h >= 12 ? 'PM' : 'AM'}`;
};

function fileKind(name) {
  if (!name) return 'file';
  const ext = name.split('.').pop()?.toLowerCase();
  if (ext === 'pdf') return 'pdf';
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'].includes(ext)) return 'image';
  return 'file';
}

const FILE_ICON = {
  pdf:   { Icon: FileText, bg: 'bg-red-50',     color: 'text-red-500' },
  image: { Icon: Image,    bg: 'bg-blue-50',    color: 'text-blue-500' },
  file:  { Icon: File,     bg: 'bg-neutral-100', color: 'text-neutral-400' },
};

/* ═══════════════════════════════════════════════════
   MAIN
   ═══════════════════════════════════════════════════ */

export default function PatientHealth() {
  const navigate = useNavigate();
  const { activePatientId } = useSafePatientAuth();

  /* ── Tab routing (driven by ?tab=records query param) ── */
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') === 'records' ? 'records' : 'prescriptions';
  const setTab = useCallback((next) => {
    setSearchParams((prev) => {
      const p = new URLSearchParams(prev);
      if (next === 'records') p.set('tab', 'records');
      else p.delete('tab');
      return p;
    }, { replace: true });
  }, [setSearchParams]);

  /* ── State ── */

  // daily pulse
  const [pulse, setPulse]           = useState(null);
  const [pulseLoading, setPulseLoading] = useState(true);

  // prescriptions
  const [rxList, setRxList]         = useState([]);
  const [rxLoading, setRxLoading]   = useState(true);
  const [rxView, setRxView]         = useState('active');
  const [rxPage, setRxPage]         = useState(1);
  const [rxTotal, setRxTotal]       = useState(0);
  const [openRx, setOpenRx]         = useState(null);

  // treatment records
  const [recs, setRecs]             = useState([]);
  const [recLoading, setRecLoading] = useState(true);
  const [recPage, setRecPage]       = useState(1);
  const [recTotal, setRecTotal]     = useState(0);
  const [openRec, setOpenRec]       = useState(null);

  // reports (files from records)
  const [reports, setReports]           = useState([]);
  const [reportsLoading, setReportsLoading] = useState(true);

  // busy + toast
  const [busyId, setBusyId] = useState(null);
  const [toast, setToast]   = useState(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  /* ── Fetchers ── */

  const fetchPulse = useCallback(async () => {
    if (!activePatientId) return;
    setPulseLoading(true);
    try {
      const res = await getDailyCareSchedule(activePatientId);
      setPulse(res.data || res);
    } catch { /* noop */ }
    finally { setPulseLoading(false); }
  }, [activePatientId]);

  const fetchRx = useCallback(async () => {
    if (!activePatientId) return;
    setRxLoading(true);
    try {
      const p = { page: rxPage, limit: PAGE };
      if (rxView !== 'all') p.status = rxView;
      const res = await listPatientPrescriptions(activePatientId, p);
      const d = res.data || res;
      setRxList(Array.isArray(d) ? d : d.data || d.items || []);
      setRxTotal(d.total || 0);
    } catch { setRxList([]); }
    finally { setRxLoading(false); }
  }, [activePatientId, rxPage, rxView]);

  const fetchRecs = useCallback(async () => {
    if (!activePatientId) return;
    setRecLoading(true);
    try {
      const res = await getMedicalHistory(activePatientId, { page: recPage, limit: PAGE });
      const d = res.data || res;
      setRecs(Array.isArray(d) ? d : d.data || d.items || []);
      setRecTotal(d.total || 0);
    } catch { setRecs([]); }
    finally { setRecLoading(false); }
  }, [activePatientId, recPage]);

  const fetchReports = useCallback(async () => {
    if (!activePatientId) return;
    setReportsLoading(true);
    try {
      const res = await getMedicalHistory(activePatientId, { page: 1, limit: 200 });
      const d = res.data || res;
      const allRecs = Array.isArray(d) ? d : d.data || d.items || [];
      const files = [];
      allRecs.forEach((r) =>
        (r.attachments || []).forEach((a) =>
          files.push({ ...a, doctorName: r.doctor?.name, diagnosis: r.diagnosis, recordDate: r.createdAt }),
        ),
      );
      setReports(files);
    } catch { setReports([]); }
    finally { setReportsLoading(false); }
  }, [activePatientId]);

  useEffect(() => { fetchPulse(); fetchRx(); fetchRecs(); fetchReports(); }, [fetchPulse, fetchRx, fetchRecs, fetchReports]);

  /* ── Actions ── */

  const toggleReminder = async (rx) => {
    setBusyId(`rx-${rx._id}`);
    try {
      if (rx.followUpRemindersEnabled) {
        await disablePrescriptionReminders(activePatientId, rx._id);
      } else {
        await enablePrescriptionReminders(activePatientId, rx._id);
      }
      setToast({ type: 'success', msg: rx.followUpRemindersEnabled ? 'Reminders off' : 'Reminders on' });
      fetchRx();
    } catch {
      setToast({ type: 'error', msg: 'Could not update reminders' });
    } finally { setBusyId(null); }
  };

  const markReminder = async (taskId, remId, status) => {
    setBusyId(`rem-${remId}`);
    try {
      await respondToReminder(activePatientId, taskId, remId, { status });
      setToast({ type: 'success', msg: status === 'done' ? 'Marked done' : 'Skipped' });
      fetchPulse();
    } catch {
      setToast({ type: 'error', msg: 'Failed' });
    } finally { setBusyId(null); }
  };

  /* ── Derived ── */

  const stats = pulse?.stats;
  const pending = useMemo(
    () => (pulse?.reminders || []).filter((r) => r.status === 'pending' || r.status === 'sent'),
    [pulse],
  );
  const completed = useMemo(
    () => (pulse?.reminders || []).filter((r) => r.status === 'done' || r.status === 'skipped'),
    [pulse],
  );
  const carePct = stats && stats.total > 0
    ? Math.round((stats.completed / stats.total) * 100) : null;

  const allLoaded = !pulseLoading && !rxLoading && !recLoading && !reportsLoading;
  const isAllEmpty = allLoaded
    && rxList.length === 0 && recs.length === 0 && reports.length === 0
    && (!stats || stats.total === 0);

  /* ═══ RENDER ═══ */

  if (!allLoaded) {
    return (
      <div className="max-w-[1280px] mx-auto w-full space-y-6">
        <Shimmer className="h-10 w-48" />
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-7"><Shimmer className="h-64 w-full" /></div>
          <div className="lg:col-span-5"><Shimmer className="h-64 w-full" /></div>
        </div>
        <Shimmer className="h-48 w-full" />
        <Shimmer className="h-36 w-full" />
      </div>
    );
  }

  if (isAllEmpty) {
    return (
      <div className="max-w-[1280px] mx-auto w-full space-y-6">
        {/* Welcome Hero */}
        <div className="bg-gradient-to-br from-primary-600 to-primary-800 rounded-2xl p-8 md:p-10 text-white animate-[fadeUp_0.4s_ease-out_both]">
          <h1 className="text-2xl md:text-3xl font-bold font-display leading-tight">
            Your Health, One Place
          </h1>
          <p className="text-primary-100 text-sm md:text-base mt-2 max-w-xl leading-relaxed">
            After your first visit, this page becomes your health hub — prescriptions,
            treatment history, care reminders, and medical files all in one view.
          </p>
          <button
            onClick={() => navigate('/patient/appointments')}
            className="mt-6 h-12 px-7 text-sm font-bold bg-white text-primary-700 rounded-xl hover:bg-primary-50 shadow-[var(--shadow-md)] transition-all duration-200 flex items-center gap-2"
          >
            <CalendarPlus className="h-5 w-5" /> Book an Appointment
          </button>
        </div>

        {/* What you'll see */}
        <div className={`${CARD} p-6 animate-[fadeUp_0.4s_ease-out_both]`} style={{ animationDelay: '100ms' }}>
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-primary-50 flex items-center justify-center">
              <Stethoscope className="h-5 w-5 text-primary-600" />
            </div>
            <div>
              <h2 className="text-[15px] font-semibold font-display text-neutral-900">What you'll find here</h2>
              <p className="text-xs text-neutral-500">Everything updates automatically after each visit</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              {
                icon: Pill,
                iconBg: 'bg-secondary-50', iconClr: 'text-secondary-600',
                title: 'Prescriptions',
                desc: 'View medications, dosages, and set follow-up reminders so you never miss a dose.',
              },
              {
                icon: Clock,
                iconBg: 'bg-primary-50', iconClr: 'text-primary-600',
                title: 'Daily Care',
                desc: 'A daily checklist of care tasks and medication reminders assigned by your doctor.',
              },
              {
                icon: Activity,
                iconBg: 'bg-blue-50', iconClr: 'text-blue-600',
                title: 'Treatment Journey',
                desc: 'A timeline of every visit — diagnoses, procedures, teeth treated, and doctor notes.',
              },
              {
                icon: FolderOpen,
                iconBg: 'bg-amber-50', iconClr: 'text-amber-600',
                title: 'Reports & Files',
                desc: 'X-rays, scans, lab reports, and documents attached to your treatment records.',
              },
            ].map((feat) => (
              <div key={feat.title} className="flex items-start gap-3 p-4 rounded-xl bg-neutral-50 border border-neutral-100">
                <div className={`w-10 h-10 rounded-xl ${feat.iconBg} flex items-center justify-center shrink-0`}>
                  <feat.icon className={`h-5 w-5 ${feat.iconClr}`} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-neutral-800">{feat.title}</p>
                  <p className="text-xs text-neutral-500 mt-0.5 leading-relaxed">{feat.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[1280px] mx-auto w-full space-y-6">

      {/* ── Toast ── */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-5 py-3 rounded-xl shadow-[var(--shadow-lg)] text-sm font-medium flex items-center gap-2 ${
          toast.type === 'success' ? 'bg-secondary-600 text-white' : 'bg-red-600 text-white'
        }`}>
          {toast.type === 'success' ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          {toast.msg}
        </div>
      )}

      {/* ═══ ROW 0: Header + Tab Switcher ═══ */}
      <div className="flex flex-col gap-4 animate-[fadeUp_0.4s_ease-out_both]">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold font-display text-neutral-900">
              {activeTab === 'records' ? 'Medical Records' : 'Prescriptions'}
            </h1>
            <p className="text-sm text-neutral-600 mt-1">
              {activeTab === 'records'
                ? 'Your treatment history and medical files — all visits in one timeline.'
                : 'Your active medications and daily care schedule.'}
            </p>
          </div>
          <div className="text-xs text-neutral-400 font-medium">
            {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </div>
        </div>

        {/* Tab pill bar — keeps URL + sidebar in sync via setSearchParams */}
        <div className="inline-flex gap-1 bg-white rounded-2xl border border-neutral-200 shadow-[var(--shadow-sm)] p-1 w-fit">
          {[
            { key: 'prescriptions', label: 'Prescriptions', Icon: Pill, count: rxTotal },
            { key: 'records',       label: 'Medical Records', Icon: FileText, count: recTotal },
          ].map(({ key, label, Icon, count }) => {
            const isActive = activeTab === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-medium transition-all duration-150 ${
                  isActive
                    ? 'bg-primary-50 text-primary-700 shadow-[var(--shadow-sm)]'
                    : 'text-neutral-500 hover:text-neutral-800 hover:bg-neutral-50'
                }`}
              >
                <Icon className={`h-4 w-4 ${isActive ? 'text-primary-600' : 'text-neutral-400'}`} />
                <span>{label}</span>
                {typeof count === 'number' && count > 0 && (
                  <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded-md ${
                    isActive ? 'bg-primary-100 text-primary-700' : 'bg-neutral-100 text-neutral-500'
                  }`}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ═══ PRESCRIPTIONS TAB — Row 1: Prescriptions (7) + Daily Care (5) ═══ */}
      {activeTab === 'prescriptions' && (
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 animate-[fadeUp_0.4s_ease-out_both]" style={{ animationDelay: '100ms' }}>

        {/* ── Prescriptions ── */}
        <div className="lg:col-span-7">
          <div className={`${CARD} p-5 h-full`}>
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-secondary-50 flex items-center justify-center">
                  <Pill className="h-5 w-5 text-secondary-600" />
                </div>
                <div>
                  <h2 className="text-[15px] font-semibold font-display text-neutral-900">Prescriptions</h2>
                  <p className="text-xs text-neutral-500">{rxTotal || 0} total</p>
                </div>
              </div>
              <div className="flex bg-neutral-100 rounded-lg p-0.5 gap-0.5">
                {['active', 'completed'].map((v) => (
                  <button
                    key={v}
                    onClick={() => { setRxView(v); setRxPage(1); }}
                    className={`text-[11px] px-2.5 py-1 rounded-md font-medium capitalize transition-all ${
                      rxView === v
                        ? 'bg-white text-neutral-900 shadow-sm'
                        : 'text-neutral-500 hover:text-neutral-700'
                    }`}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>

            {rxLoading ? (
              <div className="space-y-3">
                <Shimmer className="h-24 w-full" />
                <Shimmer className="h-24 w-full" />
                <Shimmer className="h-24 w-full" />
              </div>
            ) : rxList.length === 0 ? (
              <EmptyState icon={Pill} msg={`No ${rxView} prescriptions`} />
            ) : (
              <div className="space-y-2">
                {rxList.map((rx) => {
                  const expanded = openRx === rx._id;
                  const meds = rx.medications || [];
                  const isActive = rx.status === 'active';
                  return (
                    <div
                      key={rx._id}
                      className="rounded-xl bg-neutral-50 border border-neutral-100 overflow-hidden hover:bg-neutral-100/50 transition-colors"
                    >
                      <div className="px-4 py-3 flex items-start gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center shrink-0 mt-0.5">
                          <span className="text-white font-bold font-display text-sm">
                            {(rx.doctor?.name || 'D')[0]}
                          </span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-semibold text-neutral-900 truncate">
                              Dr. {stripDrPrefix(rx.doctor?.name) || 'Unknown'}
                            </p>
                            <span className={`text-[11px] px-2.5 py-1 rounded-full font-medium shrink-0 ${
                              isActive ? 'bg-secondary-50 text-secondary-700' : 'bg-neutral-200 text-neutral-600'
                            }`}>
                              {isActive ? 'Active' : 'Completed'}
                            </span>
                          </div>
                          <p className="text-xs text-neutral-500 mt-0.5">
                            {fmtDate(rx.createdAt)} · {meds.length} medication{meds.length !== 1 ? 's' : ''}
                          </p>
                          {rx.diagnosis && (
                            <p className="text-xs text-neutral-600 mt-1 italic">Dx: {rx.diagnosis}</p>
                          )}
                        </div>
                      </div>

                      {/* Medication chips */}
                      <div className="px-4 pb-2 flex gap-1.5 overflow-x-auto scrollbar-hide">
                        {(expanded ? meds : meds.slice(0, 3)).map((med, i) => (
                          <span key={i} className="shrink-0 text-[10px] px-2.5 py-1 rounded-full bg-secondary-50 text-secondary-700 border border-secondary-100 font-medium">
                            {med.name}{med.dosage ? ` · ${med.dosage}` : ''}
                          </span>
                        ))}
                        {!expanded && meds.length > 3 && (
                          <button onClick={() => setOpenRx(rx._id)} className="shrink-0 text-[10px] px-2 text-primary-600 font-medium">
                            +{meds.length - 3}
                          </button>
                        )}
                      </div>

                      {/* Expanded details */}
                      {expanded && (
                        <div className="px-4 pb-3 space-y-2">
                          {meds.map((med, i) => (
                            <div key={i} className="text-xs text-neutral-500 pl-2 border-l-2 border-secondary-200">
                              <span className="font-medium text-neutral-700">{med.name}</span>
                              {med.frequency && <span> — {med.frequency}</span>}
                              {med.duration && <span> · {med.duration}</span>}
                              {med.instructions && <p className="text-[11px] text-neutral-400 mt-0.5 italic">{med.instructions}</p>}
                            </div>
                          ))}
                          {rx.notes && (
                            <p className="text-xs text-neutral-500 bg-white rounded-lg px-3 py-2 border border-neutral-100">{rx.notes}</p>
                          )}
                        </div>
                      )}

                      {/* Footer */}
                      <div className="px-4 py-2.5 border-t border-neutral-100 flex items-center justify-between">
                        <button
                          onClick={() => toggleReminder(rx)}
                          disabled={busyId === `rx-${rx._id}`}
                          className={`flex items-center gap-1.5 text-xs font-medium transition ${
                            rx.followUpRemindersEnabled ? 'text-primary-600 hover:text-primary-700' : 'text-neutral-400 hover:text-neutral-600'
                          }`}
                        >
                          {busyId === `rx-${rx._id}` ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : rx.followUpRemindersEnabled ? (
                            <Bell className="h-3.5 w-3.5" />
                          ) : (
                            <BellOff className="h-3.5 w-3.5" />
                          )}
                          {rx.followUpRemindersEnabled ? 'Reminders on' : 'Enable reminders'}
                        </button>
                        <button
                          onClick={() => setOpenRx(expanded ? null : rx._id)}
                          className="text-xs text-neutral-400 hover:text-neutral-600 font-medium flex items-center gap-1 transition"
                        >
                          {expanded ? 'Less' : 'Details'}
                          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`} />
                        </button>
                      </div>
                    </div>
                  );
                })}

                {rxTotal > PAGE && <Pagination page={rxPage} limit={PAGE} total={rxTotal} onChange={setRxPage} />}
              </div>
            )}
          </div>
        </div>

        {/* ── Daily Care ── */}
        <div className="lg:col-span-5">
          <div className={`${CARD} p-5 h-full flex flex-col`}>
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-xl bg-primary-50 flex items-center justify-center">
                <Heart className="h-5 w-5 text-primary-600" />
              </div>
              <div>
                <h2 className="text-[15px] font-semibold font-display text-neutral-900">Daily Care</h2>
                <p className="text-xs text-neutral-500">
                  {stats ? `${stats.completed || 0}/${stats.total || 0} done today` : 'Your daily checklist'}
                </p>
              </div>
            </div>

            {pulseLoading ? (
              <div className="space-y-3 flex-1">
                <Shimmer className="h-16 w-full" />
                <Shimmer className="h-12 w-full" />
                <Shimmer className="h-12 w-full" />
              </div>
            ) : !stats || stats.total === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center py-6 text-center">
                <div className="w-12 h-12 rounded-2xl bg-secondary-50 flex items-center justify-center mb-3">
                  <Heart className="h-5 w-5 text-secondary-400" />
                </div>
                <p className="text-sm font-medium text-neutral-700">No medications today</p>
                <p className="text-xs text-neutral-500 mt-1">You're all clear for today</p>
              </div>
            ) : (
              <div className="flex-1 space-y-1">
                {/* Progress bar */}
                {carePct !== null && (
                  <div className="mb-3 p-3 rounded-xl bg-neutral-50">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-medium text-neutral-600">{stats.completed} of {stats.total} done</span>
                      <span className="text-xs font-bold font-display text-secondary-700">{carePct}%</span>
                    </div>
                    <div className="h-1.5 bg-neutral-200 rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-secondary-500 transition-all duration-500" style={{ width: `${carePct}%` }} />
                    </div>
                  </div>
                )}

                {/* Pending reminders */}
                {pending.slice(0, 5).map((rem) => {
                  const taskObj = typeof rem.task === 'object' ? rem.task : null;
                  const loading = busyId === `rem-${rem._id}`;
                  return (
                    <div key={rem._id} className="flex items-center gap-3 py-2 px-2 rounded-lg hover:bg-neutral-50 transition-colors">
                      <div className="w-7 h-7 rounded-lg bg-primary-50 flex items-center justify-center shrink-0">
                        <Pill className="h-3.5 w-3.5 text-primary-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-neutral-700 truncate">{taskObj?.title || 'Medication'}</p>
                        <p className="text-[10px] font-mono text-neutral-400">{fmtTime(rem.scheduledAt)}</p>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <button
                          onClick={() => markReminder(taskObj?._id || rem.task, rem._id, 'done')}
                          disabled={loading}
                          className="w-7 h-7 rounded-md bg-secondary-50 text-secondary-600 hover:bg-secondary-100 flex items-center justify-center transition-colors disabled:opacity-50"
                          title="Done"
                        >
                          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
                        </button>
                        <button
                          onClick={() => markReminder(taskObj?._id || rem.task, rem._id, 'skipped')}
                          disabled={loading}
                          className="w-7 h-7 rounded-md bg-neutral-100 text-neutral-500 hover:bg-neutral-200 flex items-center justify-center transition-colors disabled:opacity-50"
                          title="Skip"
                        >
                          <SkipForward className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  );
                })}

                {completed.length > 0 && (
                  <div className="pt-2 mt-auto border-t border-neutral-100">
                    <p className="text-[11px] text-neutral-400 flex items-center gap-1.5">
                      <CheckCircle2 className="h-3 w-3 text-secondary-400" />
                      {completed.filter(r => r.status === 'done').length} done, {completed.filter(r => r.status === 'skipped').length} skipped
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
      )}

      {/* ═══ MEDICAL RECORDS TAB — Row 2 & Row 3 ═══ */}
      {activeTab === 'records' && (
      <>
      {/* ═══ ROW 2: Treatment Journey ═══ */}
      <div className={`${CARD} p-5 animate-[fadeUp_0.4s_ease-out_both]`} style={{ animationDelay: '200ms' }}>
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
              <Activity className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-[15px] font-semibold font-display text-neutral-900">Treatment Journey</h2>
              <p className="text-xs text-neutral-500">{recTotal || 0} record{recTotal !== 1 ? 's' : ''}</p>
            </div>
          </div>
        </div>

        {recLoading ? (
          <div className="space-y-3">
            <Shimmer className="h-20 w-full" />
            <Shimmer className="h-20 w-full" />
            <Shimmer className="h-20 w-full" />
          </div>
        ) : recs.length === 0 ? (
          <EmptyState icon={Activity} msg="No treatment records yet" />
        ) : (
          <>
            <div className="relative">
              {/* Timeline spine */}
              <div className="absolute left-5 top-2 bottom-2 w-px bg-neutral-200" />

              <div className="space-y-1">
                {recs.map((rec) => {
                  const expanded = openRec === rec._id;
                  const teeth = rec.teeth || [];
                  const attachments = rec.attachments || [];

                  return (
                    <div key={rec._id} className="relative flex items-start gap-4 py-3 px-2 rounded-lg hover:bg-neutral-50 transition-colors">
                      {/* Timeline dot */}
                      <div className="relative z-10 shrink-0 mt-1.5">
                        <span className="block w-2.5 h-2.5 rounded-full ring-2 ring-white bg-primary-500" />
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <p className="text-sm font-medium text-neutral-800 truncate">{rec.diagnosis || 'Visit'}</p>
                          <span className="text-[11px] font-mono text-neutral-400 shrink-0">{fmtDate(rec.createdAt)}</span>
                        </div>
                        <p className="text-xs text-neutral-500">Dr. {stripDrPrefix(rec.doctor?.name) || 'Unknown'}</p>
                        {rec.treatment && <p className="text-xs text-neutral-600 mt-1 line-clamp-1">{rec.treatment}</p>}

                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {teeth.slice(0, 3).map((t, i) => (
                            <span key={i} className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-100">
                              #{t.number || t.toothNumber} {t.procedure || t.condition || ''}
                            </span>
                          ))}
                          {attachments.length > 0 && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-500 flex items-center gap-1">
                              <Paperclip className="h-2.5 w-2.5" /> {attachments.length} file{attachments.length !== 1 ? 's' : ''}
                            </span>
                          )}
                        </div>

                        {/* Expanded: notes + files */}
                        {expanded && (
                          <div className="mt-3 space-y-2">
                            {rec.notes && (
                              <p className="text-xs text-neutral-500 bg-white rounded-lg px-3 py-2 border border-neutral-100">{rec.notes}</p>
                            )}
                            {attachments.length > 0 && (
                              <div className="space-y-1.5">
                                {attachments.map((att, i) => {
                                  const kind = fileKind(att.fileName);
                                  const fi = FILE_ICON[kind];
                                  return (
                                    <a
                                      key={i}
                                      href={att.fileUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-white border border-neutral-100 hover:border-primary-200 hover:shadow-[var(--shadow-sm)] transition group"
                                    >
                                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${fi.bg}`}>
                                        <fi.Icon className={`h-4 w-4 ${fi.color}`} />
                                      </div>
                                      <span className="text-xs text-neutral-700 truncate flex-1 font-medium">{att.fileName || 'File'}</span>
                                      <Download className="h-3.5 w-3.5 text-neutral-300 group-hover:text-neutral-500 transition" />
                                    </a>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        )}

                        {(rec.notes || attachments.length > 0) && (
                          <button
                            onClick={() => setOpenRec(expanded ? null : rec._id)}
                            className="mt-2 text-xs text-primary-600 hover:text-primary-700 font-medium flex items-center gap-1 transition"
                          >
                            {expanded ? 'Less' : 'View details'}
                            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`} />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {recTotal > PAGE && <Pagination page={recPage} limit={PAGE} total={recTotal} onChange={setRecPage} />}
          </>
        )}
      </div>

      {/* ═══ ROW 3: Reports & Files ═══ */}
      <div className={`${CARD} p-5 animate-[fadeUp_0.4s_ease-out_both]`} style={{ animationDelay: '300ms' }}>
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center">
              <FolderOpen className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <h2 className="text-[15px] font-semibold font-display text-neutral-900">Reports & Files</h2>
              <p className="text-xs text-neutral-500">{reports.length} file{reports.length !== 1 ? 's' : ''} from your records</p>
            </div>
          </div>
        </div>

        {reportsLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {[1, 2, 3, 4, 5, 6].map((i) => <Shimmer key={i} className="h-20 w-full" />)}
          </div>
        ) : reports.length === 0 ? (
          <EmptyState icon={FolderOpen} msg="No reports or files available" />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {reports.map((f, i) => {
              const kind = fileKind(f.fileName);
              const fi = FILE_ICON[kind];
              return (
                <a
                  key={i}
                  href={f.fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-start gap-3 px-4 py-3.5 rounded-xl bg-neutral-50 border border-neutral-100 hover:border-primary-200 hover:shadow-[var(--shadow-sm)] transition-all group"
                >
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${fi.bg}`}>
                    <fi.Icon className={`h-5 w-5 ${fi.color}`} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-neutral-800 truncate group-hover:text-primary-600 transition">{f.fileName || 'File'}</p>
                    <p className="text-[11px] text-neutral-500 mt-0.5 truncate">{f.doctorName && `Dr. ${stripDrPrefix(f.doctorName)}`}</p>
                    <p className="text-[11px] text-neutral-400 mt-0.5">{fmtDate(f.recordDate)}</p>
                  </div>
                  <Download className="h-4 w-4 text-neutral-200 group-hover:text-neutral-400 transition mt-1 shrink-0" />
                </a>
              );
            })}
          </div>
        )}
      </div>
      </>
      )}
    </div>
  );
}

/* ── Empty state ── */
function EmptyState({ icon: Icon, msg }) {
  return (
    <div className="py-10 flex flex-col items-center gap-3">
      <div className="w-14 h-14 rounded-2xl bg-neutral-50 flex items-center justify-center">
        <Icon className="h-6 w-6 text-neutral-300" />
      </div>
      <p className="text-sm font-medium text-neutral-500">{msg}</p>
    </div>
  );
}
