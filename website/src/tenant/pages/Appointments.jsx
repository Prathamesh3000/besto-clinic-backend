/**
 * Appointments — Clinic owner/admin appointment management page.
 * Matching admin portal design system with card-based layout.
 *
 * 5 views: Calendar, List, Board, Timeline, Tile (4-day lookahead)
 * Stat cards + queue bar + toolbar card + appointment drawer/create modal
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  CalendarDays, Plus, LayoutGrid, List, Columns3, Clock, Grid2X2,
  CalendarCheck, CalendarClock, CheckCircle2, Search,
} from 'lucide-react';
import { listAppointments, listDoctors, listBranches } from '../api';
import { useTenantAuth } from '../TenantAuthContext';
import Can from '../components/Can';
import { initSocket, getSocket } from '../../lib/socket';
import { useToast } from '../ToastContext';
import { stripDrPrefix } from '../../utils/doctorName';
import { useHighlightFromUrl } from '../../hooks/useHighlightFromUrl';

// Sub-components
import AppointmentCalendarView from '../components/appointments/AppointmentCalendarView';
import AppointmentListView from '../components/appointments/AppointmentListView';
import AppointmentBoardView from '../components/appointments/AppointmentBoardView';
import AppointmentTimelineView from '../components/appointments/AppointmentTimelineView';
import AppointmentDrawer from '../components/appointments/AppointmentDrawer';
import AppointmentCreateModal from '../components/appointments/AppointmentCreateModal';
import LiveQueueBar from '../components/appointments/LiveQueueBar';
import { STATUS_FILTER_CHIPS, TYPE_OPTIONS, SOURCE_OPTIONS } from '../components/appointments/appointment-constants';

// Shared design tokens
const cardCls = 'bg-white rounded-2xl border border-neutral-200 shadow-[var(--shadow-sm)]';
const cardHover = 'hover:shadow-[var(--shadow-md)] hover:-translate-y-0.5 transition-all duration-200';
const btnPrimary = 'px-5 py-2.5 text-sm font-semibold text-white rounded-lg bg-primary-600 hover:bg-primary-700 shadow-[var(--shadow-sm)] transition-all disabled:opacity-50';
const selectCls = 'px-3 py-2 border border-neutral-200 rounded-xl text-sm bg-white text-neutral-700 focus:border-primary-400 focus:ring-2 focus:ring-primary-100 outline-none transition-all cursor-pointer';

const VIEWS = [
  { key: 'calendar', icon: LayoutGrid, label: 'Calendar' },
  { key: 'list',     icon: List,       label: 'List' },
  { key: 'board',    icon: Columns3,   label: 'Board' },
  { key: 'timeline', icon: Clock,      label: 'Timeline' },
  { key: 'tile',     icon: Grid2X2,    label: 'Tile' },
];

const STAT_CONFIG = [
  { key: 'today', title: 'Today',          icon: CalendarDays,  color: 'primary' },
  { key: 'week',  title: 'This Week',      icon: CalendarClock, color: 'blue' },
  { key: 'booked', title: 'Booked Today',  icon: CalendarCheck, color: 'purple' },
  { key: 'done',  title: 'Completed Today', icon: CheckCircle2,  color: 'green' },
];

const PALETTE = {
  primary: { iconBg: 'bg-primary-50',  iconText: 'text-primary-600' },
  green:   { iconBg: 'bg-secondary-50', iconText: 'text-secondary-600' },
  purple:  { iconBg: 'bg-purple-50',   iconText: 'text-purple-600' },
  blue:    { iconBg: 'bg-blue-50',     iconText: 'text-blue-600' },
};

// ═══════════════════════════════════════════════════════
export default function Appointments() {
  const { user } = useTenantAuth();
  const toast = useToast();
  const canConsult = ['doctor', 'admin', 'super_admin', 'manager', 'department_manager'].includes(user?.role);

  // Global-search: open drawer directly when highlight param is present
  const { highlightId } = useHighlightFromUrl();

  // View + UI state
  const [activeView, setActiveView] = useState('calendar');
  const [selectedId, setSelectedId] = useState(highlightId);
  useEffect(() => { if (highlightId) setSelectedId(highlightId); }, [highlightId]);
  const [showCreate, setShowCreate] = useState(false);
  const [prefillDate, setPrefillDate] = useState(null);
  const [prefillTime, setPrefillTime] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // Tile view state
  const [tileAppts, setTileAppts] = useState([]);
  const [tileLoading, setTileLoading] = useState(false);

  // Filters
  const [filters, setFilters] = useState({
    search: '', doctor: '', status: '', type: '', source: '', from: '', to: '', branch: '',
  });

  // Reference data
  const [doctors, setDoctors] = useState([]);
  const [branches, setBranches] = useState([]);
  const [selectedBranch, setSelectedBranch] = useState('');

  // Stats
  const [stats, setStats] = useState({ today: 0, week: 0, booked: 0, done: 0 });
  const [statsLoading, setStatsLoading] = useState(true);

  // Load reference data
  useEffect(() => {
    listDoctors({ limit: 200 }).then((r) => setDoctors(r.data || [])).catch(() => {});
    listBranches({ limit: 50 }).then((r) => {
      const b = r.data || [];
      setBranches(b);
      if (b.length === 1) setSelectedBranch(b[0]._id);
    }).catch(() => {});
  }, []);

  // Load stats
  const fetchStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);

      const [todayRes, weekRes] = await Promise.all([
        listAppointments({ from: today, to: today, limit: 1 }),
        listAppointments({ from: weekStart.toISOString().split('T')[0], to: weekEnd.toISOString().split('T')[0], limit: 1 }),
      ]);

      const todayTotal = todayRes.meta?.total || 0;
      const weekTotal = weekRes.meta?.total || 0;

      const todayFull = await listAppointments({ from: today, to: today, limit: 200 });
      const todayItems = todayFull.data || [];
      const booked = todayItems.filter((a) => ['requested', 'confirmed'].includes(a.status)).length;
      const done = todayItems.filter((a) => a.status === 'completed').length;

      setStats({ today: todayTotal, week: weekTotal, booked, done });
    } catch {
      // Stats are non-critical
    } finally {
      setStatsLoading(false);
    }
  }, []);

  useEffect(() => { fetchStats(); }, [fetchStats, refreshKey]);

  // Tile view: fetch 4 days
  useEffect(() => {
    if (activeView !== 'tile') return;
    setTileLoading(true);
    const now = new Date();
    const from = now.toISOString().split('T')[0];
    const end = new Date(now);
    end.setDate(end.getDate() + 3);
    const to = end.toISOString().split('T')[0];
    const params = { from, to: `${to}T23:59:59.999Z`, sort: 'scheduledAt', limit: 200 };
    if (filters.doctor) params.doctor = filters.doctor;
    if (filters.branch) params.branch = filters.branch;

    listAppointments(params)
      .then((res) => {
        const data = res?.data || [];
        setTileAppts(Array.isArray(data) ? data : []);
      })
      .catch(() => setTileAppts([]))
      .finally(() => setTileLoading(false));
  }, [activeView, refreshKey, filters.doctor, filters.branch]);

  // Tile days computation
  const tileDays = useMemo(() => {
    const days = [];
    const now = new Date();
    for (let i = 0; i < 4; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() + i);
      const key = d.toISOString().split('T')[0];
      let dayAppts = tileAppts.filter((a) => {
        const aDate = new Date(a.scheduledAt).toISOString().split('T')[0];
        return aDate === key;
      });
      if (filters.status) dayAppts = dayAppts.filter((a) => a.status === filters.status);
      if (filters.type) dayAppts = dayAppts.filter((a) => a.type === filters.type);
      days.push({ date: d, key, appointments: dayAppts });
    }
    return days;
  }, [tileAppts, filters.status, filters.type]);

  // WebSocket real-time updates
  useEffect(() => {
    const sock = initSocket() || getSocket();
    if (!sock) return;
    const refresh = () => setRefreshKey((k) => k + 1);
    sock.on('appointment:update', refresh);
    sock.on('queue:update', refresh);
    return () => {
      sock.off('appointment:update', refresh);
      sock.off('queue:update', refresh);
    };
  }, []);

  // Sync branch filter
  useEffect(() => {
    if (selectedBranch) setFilters((f) => ({ ...f, branch: selectedBranch }));
  }, [selectedBranch]);

  // Handlers
  const handleSlotClick = ({ date, startTime }) => {
    setPrefillDate(date);
    setPrefillTime(startTime);
    setShowCreate(true);
  };

  const handleCreated = () => {
    setShowCreate(false);
    setPrefillDate(null);
    setPrefillTime(null);
    setRefreshKey((k) => k + 1);
    toast?.success?.('Appointment created');
  };

  const handleUpdated = () => {
    setSelectedId(null);
    setRefreshKey((k) => k + 1);
  };

  const set = (key, val) => setFilters((f) => ({ ...f, [key]: val }));

  // ═══════════════════════════════════════════════════
  const now = new Date();

  return (
    <div className="max-w-[1280px] mx-auto w-full space-y-6">

      {/* ── Page Header ────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 animate-[fadeUp_0.4s_ease-out_both]">
        <div>
          <h1 className="text-2xl font-semibold font-display text-neutral-900">Appointments</h1>
          <p className="text-sm text-neutral-500 mt-1">
            {now.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>
        <Can permission="appointment:create">
          <button
            onClick={() => { setPrefillDate(null); setPrefillTime(null); setShowCreate(true); }}
            className={`${btnPrimary} flex items-center gap-2`}
          >
            <Plus className="h-4 w-4" />
            New Appointment
          </button>
        </Can>
      </div>

      {/* ── Stat Cards ─────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 animate-[fadeUp_0.4s_ease-out_both]" style={{ animationDelay: '50ms' }}>
        {statsLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className={`${cardCls} p-5`}>
              <div className="flex items-start justify-between mb-3">
                <div className="w-12 h-12 rounded-2xl bg-neutral-100 animate-pulse" />
              </div>
              <div className="h-8 w-24 bg-neutral-100 rounded-lg animate-pulse mb-2" />
              <div className="h-3 w-32 bg-neutral-100 rounded animate-pulse" />
            </div>
          ))
        ) : (
          STAT_CONFIG.map((s, i) => {
            const p = PALETTE[s.color] || PALETTE.primary;
            return (
              <div
                key={s.key}
                className={`${cardCls} ${cardHover} p-5 animate-[fadeUp_0.4s_ease-out_both]`}
                style={{ animationDelay: `${50 + i * 50}ms` }}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${p.iconBg}`}>
                    <s.icon className={`h-6 w-6 ${p.iconText}`} />
                  </div>
                </div>
                <p className="text-[28px] font-bold font-display text-neutral-900 leading-tight">{stats[s.key]}</p>
                <p className="text-xs font-medium text-neutral-500 mt-1">{s.title}</p>
              </div>
            );
          })
        )}
      </div>

      {/* ── Queue Bar (auto-hides when empty) ───────── */}
      <div className="animate-[fadeUp_0.4s_ease-out_both]" style={{ animationDelay: '100ms' }}>
        <LiveQueueBar branchId={selectedBranch} />
      </div>

      {/* ── Toolbar Card ──────────────────────────── */}
      <div className={`${cardCls} p-4 animate-[fadeUp_0.4s_ease-out_both]`} style={{ animationDelay: '150ms' }}>
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          {/* View toggle */}
          <div className="flex items-center gap-1 bg-neutral-100 rounded-lg p-1">
            {VIEWS.map((v) => (
              <button
                key={v.key}
                onClick={() => setActiveView(v.key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                  activeView === v.key
                    ? 'bg-white text-primary-700 shadow-sm'
                    : 'text-neutral-500 hover:text-neutral-700'
                }`}
              >
                <v.icon className="h-3.5 w-3.5" />
                {v.label}
              </button>
            ))}
          </div>

          {/* Filters */}
          <div className="flex flex-col gap-3">
            {/* Status filter pills — given their own full-width row. As a flex
                item next to the selects the row had no width to scroll within,
                so overflow-x-auto clipped the trailing chips instead. */}
            {activeView !== 'list' && (
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none w-full min-w-0">
                {STATUS_FILTER_CHIPS.map((s) => {
                  const isActive = (s.value === 'all' && !filters.status) || filters.status === s.value;
                  return (
                    <button
                      key={s.value}
                      onClick={() => set('status', s.value === 'all' ? '' : s.value)}
                      className={`px-3.5 py-1.5 text-xs font-medium rounded-full border transition-all whitespace-nowrap ${
                        isActive
                          ? 'bg-primary-600 text-white border-primary-600 shadow-sm'
                          : 'bg-white text-neutral-600 border-neutral-200 hover:border-neutral-300 hover:bg-neutral-50'
                      }`}
                    >
                      {s.label}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Dropdowns on their own row so they wrap together and stay aligned */}
            <div className="flex items-center gap-3 flex-wrap">
            {/* Dropdown filters for non-list views */}
            {activeView !== 'list' && (
              <>
                <select value={filters.doctor || ''} onChange={(e) => set('doctor', e.target.value)} className={selectCls}>
                  <option value="">All Doctors</option>
                  {doctors.map((d) => <option key={d._id} value={d._id}>{d.name}</option>)}
                </select>
                <select value={filters.type || ''} onChange={(e) => set('type', e.target.value)} className={selectCls}>
                  {TYPE_OPTIONS.map((t) => (
                    <option key={t} value={t === 'all' ? '' : t}>
                      {t === 'all' ? 'All Types' : t.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                    </option>
                  ))}
                </select>
                <select value={filters.source || ''} onChange={(e) => set('source', e.target.value)} className={selectCls}>
                  {SOURCE_OPTIONS.map((s) => (
                    <option key={s} value={s === 'all' ? '' : s}>
                      {s === 'all' ? 'All Sources' : s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                    </option>
                  ))}
                </select>
              </>
            )}

            {branches.length > 1 && (
              <select value={selectedBranch} onChange={(e) => setSelectedBranch(e.target.value)} className={selectCls}>
                <option value="">All Branches</option>
                {branches.map((b) => <option key={b._id} value={b._id}>{b.name}</option>)}
              </select>
            )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Active View Area ───────────────────────── */}
      <div className="animate-[fadeUp_0.4s_ease-out_both]" style={{ animationDelay: '200ms' }}>
        {activeView === 'calendar' && (
          <AppointmentCalendarView
            filters={filters}
            onSelectAppointment={setSelectedId}
            onSlotClick={handleSlotClick}
            refreshKey={refreshKey}
            fillHeight
          />
        )}
        {activeView === 'list' && (
          <AppointmentListView
            filters={filters}
            onFilterChange={setFilters}
            onSelectAppointment={setSelectedId}
            refreshKey={refreshKey}
          />
        )}
        {activeView === 'board' && (
          <AppointmentBoardView
            filters={filters}
            onSelectAppointment={setSelectedId}
            refreshKey={refreshKey}
          />
        )}
        {activeView === 'timeline' && (
          <AppointmentTimelineView
            filters={filters}
            onSelectAppointment={setSelectedId}
            refreshKey={refreshKey}
          />
        )}
        {activeView === 'tile' && (
          <TileView
            days={tileDays}
            loading={tileLoading}
            onSelectAppointment={setSelectedId}
          />
        )}
      </div>

      {/* ── Appointment Drawer ─────────────────────── */}
      <AppointmentDrawer
        open={!!selectedId}
        appointmentId={selectedId}
        onClose={() => setSelectedId(null)}
        onUpdated={handleUpdated}
        canConsult={canConsult}
        userRole={user?.role}
      />

      {/* ── Create Modal ──────────────────────────── */}
      <AppointmentCreateModal
        open={showCreate}
        onClose={() => { setShowCreate(false); setPrefillDate(null); setPrefillTime(null); }}
        onCreated={handleCreated}
        prefillDate={prefillDate}
        prefillTime={prefillTime}
      />
    </div>
  );
}

// ─── Tile View Component ─────────────────────────────
function TileView({ days, loading, onSelectAppointment }) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className={`${cardCls} p-4`}>
            <div className="h-6 w-24 bg-neutral-100 rounded animate-pulse mb-4" />
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((__, j) => (
                <div key={j} className="h-16 bg-neutral-100 rounded-xl animate-pulse" />
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {days.map((day) => {
        const todayKey = new Date().toISOString().split('T')[0];
        const isToday = todayKey === day.key;
        return (
          <div key={day.key} className={`${cardCls} flex flex-col ${isToday ? 'ring-2 ring-primary-200' : ''}`}>
            {/* Day header */}
            <div className={`px-4 py-3 border-b border-neutral-100 ${isToday ? 'bg-primary-50/50' : 'bg-neutral-50/50'}`}>
              <p className={`text-sm font-semibold ${isToday ? 'text-primary-700' : 'text-neutral-900'}`}>
                {day.date.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}
              </p>
              <p className="text-[11px] text-neutral-400">{day.appointments.length} appointment{day.appointments.length !== 1 ? 's' : ''}</p>
            </div>

            {/* Appointment cards */}
            <div className="flex-1 p-3 space-y-2 max-h-[400px] overflow-y-auto">
              {day.appointments.length === 0 ? (
                <p className="text-xs text-neutral-400 text-center py-8">No appointments</p>
              ) : (
                day.appointments
                  .sort((a, b) => new Date(a.scheduledAt || 0) - new Date(b.scheduledAt || 0))
                  .map((appt) => {
                    const _d = new Date(appt.scheduledAt);
                    const _h = _d.getUTCHours(); const _m = _d.getUTCMinutes();
                    const time = `${String(_h % 12 || 12).padStart(2,'0')}:${String(_m).padStart(2,'0')} ${_h >= 12 ? 'PM' : 'AM'}`;
                    return (
                      <button
                        key={appt._id}
                        onClick={() => onSelectAppointment(appt._id)}
                        className="w-full text-left p-3 rounded-xl border border-neutral-100 hover:border-primary-200 hover:bg-primary-50/30 transition-all"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-xs font-mono text-neutral-500">{time}</p>
                          <span className={`w-2 h-2 rounded-full shrink-0 mt-1 ${
                            appt.status === 'completed' ? 'bg-emerald-500' :
                            appt.status === 'in_progress' ? 'bg-purple-500 animate-pulse' :
                            appt.status === 'cancelled' ? 'bg-red-400' :
                            appt.status === 'checked_in' ? 'bg-blue-500' :
                            'bg-primary-400'
                          }`} />
                        </div>
                        <p className="text-sm font-medium text-neutral-900 truncate mt-1">
                          {appt.patient?.name || 'Unknown'}
                        </p>
                        <p className="text-[11px] text-neutral-500 truncate">
                          Dr. {stripDrPrefix(appt.doctor?.name || 'Unassigned')}
                        </p>
                        <p className="text-[10px] text-neutral-400 capitalize mt-0.5">{appt.type || 'consultation'}</p>
                      </button>
                    );
                  })
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
