/**
 * DoctorAppointments — 5-view appointment page matching admin portal design.
 *
 * Views: Calendar, List, Timeline, Board, Tile (4-day lookahead)
 * Reuses existing shared appointment view components.
 */
import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CalendarDays, List, Clock, LayoutGrid, Columns3,
  CalendarCheck, CalendarClock, CheckCircle2, XCircle,
  ChevronLeft, ChevronRight, Search,
} from 'lucide-react';
import { useTenantAuth } from '../TenantAuthContext';
import { getDoctorStats, listAppointments } from '../api';
import AppointmentCalendarView from '../components/appointments/AppointmentCalendarView';
import AppointmentListView from '../components/appointments/AppointmentListView';
import AppointmentTimelineView from '../components/appointments/AppointmentTimelineView';
import AppointmentBoardView from '../components/appointments/AppointmentBoardView';
import AppointmentDrawer from '../components/appointments/AppointmentDrawer';
import {
  cardCls, cardHover, btnPrimary, btnSecondary,
  StatCard, StatCardSkeleton, PageHeader, FilterPill,
  ApptBadge, SkeletonLoader, EmptyState, unwrap, toISODate,
} from '../components/doctor/shared';

// ─── View config ─────────────────────────────────────
const VIEWS = [
  { key: 'calendar', icon: CalendarDays, label: 'Calendar' },
  { key: 'list', icon: List, label: 'List' },
  { key: 'timeline', icon: Clock, label: 'Timeline' },
  { key: 'board', icon: Columns3, label: 'Board' },
  { key: 'tile', icon: LayoutGrid, label: 'Tile' },
];

const STATUS_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'requested', label: 'Requested' },
  { key: 'confirmed', label: 'Confirmed' },
  { key: 'checked_in', label: 'Checked In' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'completed', label: 'Completed' },
  { key: 'cancelled', label: 'Cancelled' },
];

// ═══════════════════════════════════════════════════════
export default function DoctorAppointments() {
  const navigate = useNavigate();
  const { user } = useTenantAuth();
  const userId = user?.userId;

  // ─── State ─────────────────────────────────────────
  const [view, setView] = useState('calendar');
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [stats, setStats] = useState(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  // Drawer state
  const [drawerApptId, setDrawerApptId] = useState(null);

  // Tile view state
  const [tileAppts, setTileAppts] = useState([]);
  const [tileLoading, setTileLoading] = useState(false);

  // ─── Debounced search ─────────────────────────────
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const searchTimer = useRef(null);
  useEffect(() => {
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(searchTimer.current);
  }, [search]);

  // ─── Filters for sub-components ────────────────────
  const filters = useMemo(() => {
    const f = { doctor: userId };
    if (statusFilter !== 'all') f.status = statusFilter;
    if (debouncedSearch) f.search = debouncedSearch;
    return f;
  }, [userId, statusFilter, debouncedSearch]);

  // ─── Fetch stats ───────────────────────────────────
  useEffect(() => {
    setStatsLoading(true);
    getDoctorStats()
      .then((res) => {
        const d = res?.data || res;
        setStats({
          today: d.todayTotal ?? 0,
          week: d.weekTotal ?? 0,
          completed: d.todayCompleted ?? 0,
          booked: d.patientsThisMonth ?? 0,
        });
      })
      .catch(() => {})
      .finally(() => setStatsLoading(false));
  }, []);

  // ─── Tile view: fetch 4 days ───────────────────────
  useEffect(() => {
    if (view !== 'tile') return;
    setTileLoading(true);
    const now = new Date();
    const from = toISODate(now);
    const end = new Date(now);
    end.setDate(end.getDate() + 3);
    const to = toISODate(end);

    const params = { doctor: userId, from, to: `${to}T23:59:59.999Z`, sort: 'scheduledAt', limit: 200 };
    if (statusFilter !== 'all') params.status = statusFilter;

    listAppointments(params)
      .then((res) => {
        const data = res?.data?.appointments || res?.data || [];
        setTileAppts(Array.isArray(data) ? data : []);
      })
      .catch(() => setTileAppts([]))
      .finally(() => setTileLoading(false));
  }, [view, userId, refreshKey, statusFilter]);

  // ─── Handlers ──────────────────────────────────────
  const handleSelectAppointment = useCallback((appt) => {
    setDrawerApptId(appt?._id || appt?.id || appt);
  }, []);

  const handleApptUpdated = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  // ─── Tile view helper ──────────────────────────────
  const tileDays = useMemo(() => {
    const days = [];
    const now = new Date();
    const q = debouncedSearch?.toLowerCase();
    for (let i = 0; i < 4; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() + i);
      const key = toISODate(d);
      let dayAppts = tileAppts.filter((a) => {
        const aDate = toISODate(new Date(a.scheduledAt || a.date || a.appointmentDate));
        return aDate === key;
      });
      if (statusFilter !== 'all') {
        dayAppts = dayAppts.filter((a) => a.status === statusFilter);
      }
      if (q) {
        dayAppts = dayAppts.filter((a) =>
          a.patientName?.toLowerCase().includes(q) ||
          a.patient?.name?.toLowerCase().includes(q) ||
          a.doctor?.name?.toLowerCase().includes(q)
        );
      }
      days.push({ date: d, key, appointments: dayAppts });
    }
    return days;
  }, [tileAppts, statusFilter, debouncedSearch]);

  // ═══════════════════════════════════════════════════
  const now = new Date();

  return (
    <div className="max-w-[1280px] mx-auto w-full space-y-6">

      {/* ── Page Header ────────────────────────────── */}
      <PageHeader
        title="My Appointments"
        subtitle={now.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
      />

      {/* ── Stat Cards ─────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 animate-[fadeUp_0.4s_ease-out_both]" style={{ animationDelay: '50ms' }}>
        {statsLoading ? (
          Array.from({ length: 4 }).map((_, i) => <StatCardSkeleton key={i} />)
        ) : (
          <>
            <StatCard title="Today" value={stats?.today ?? 0} icon={CalendarDays} color="primary" delay={50} />
            <StatCard title="This Week" value={stats?.week ?? 0} icon={CalendarClock} color="blue" delay={100} />
            <StatCard title="Booked This Month" value={stats?.booked ?? 0} icon={CalendarCheck} color="purple" delay={150} />
            <StatCard title="Completed Today" value={stats?.completed ?? 0} icon={CheckCircle2} color="green" delay={200} />
          </>
        )}
      </div>

      {/* ── Toolbar Card ───────────────────────────── */}
      <div className={`${cardCls} p-4 animate-[fadeUp_0.4s_ease-out_both]`} style={{ animationDelay: '150ms' }}>
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          {/* View toggles */}
          <div className="flex items-center gap-1 bg-neutral-100 rounded-lg p-1">
            {VIEWS.map((v) => (
              <button
                key={v.key}
                onClick={() => setView(v.key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                  view === v.key
                    ? 'bg-white text-primary-700 shadow-sm'
                    : 'text-neutral-500 hover:text-neutral-700'
                }`}
              >
                <v.icon className="h-3.5 w-3.5" />
                {v.label}
              </button>
            ))}
          </div>

          {/* Right side: status pills + search */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
              {STATUS_FILTERS.map((sf) => (
                <FilterPill
                  key={sf.key}
                  label={sf.label}
                  active={statusFilter === sf.key}
                  onClick={() => setStatusFilter(sf.key)}
                />
              ))}
            </div>
            <div className="relative shrink-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-neutral-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search..."
                className="w-48 pl-9 pr-3 py-1.5 text-xs border border-neutral-200 rounded-lg bg-white text-neutral-900 placeholder:text-neutral-400 focus:border-primary-300 focus:ring-2 focus:ring-primary-100 outline-none transition-all"
              />
            </div>
          </div>
        </div>
      </div>

      {/* ── Active View Area ───────────────────────── */}
      <div className="animate-[fadeUp_0.4s_ease-out_both]" style={{ animationDelay: '200ms' }}>
        {view === 'calendar' && (
          <AppointmentCalendarView
            filters={filters}
            onSelectAppointment={handleSelectAppointment}
            refreshKey={refreshKey}
            fillHeight
          />
        )}

        {view === 'list' && (
          <AppointmentListView
            filters={filters}
            onSelectAppointment={handleSelectAppointment}
            refreshKey={refreshKey}
            doctorId={userId}
          />
        )}

        {view === 'timeline' && (
          <AppointmentTimelineView
            filters={filters}
            onSelectAppointment={handleSelectAppointment}
            refreshKey={refreshKey}
          />
        )}

        {view === 'board' && (
          <AppointmentBoardView
            filters={filters}
            onSelectAppointment={handleSelectAppointment}
            refreshKey={refreshKey}
          />
        )}

        {view === 'tile' && (
          <TileView
            days={tileDays}
            loading={tileLoading}
            onSelectAppointment={handleSelectAppointment}
          />
        )}
      </div>

      {/* ── Appointment Drawer ─────────────────────── */}
      <AppointmentDrawer
        open={!!drawerApptId}
        appointmentId={drawerApptId}
        onClose={() => setDrawerApptId(null)}
        onUpdated={handleApptUpdated}
        canConsult
        userRole="doctor"
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
            <SkeletonLoader className="h-6 w-24 mb-4" />
            <SkeletonLoader className="h-16 w-full" count={3} />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {days.map((day) => {
        const isToday = toISODate(new Date()) === day.key;
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
                    const _d = new Date(appt.scheduledAt || appt.date);
                    const _h = _d.getUTCHours(); const _m = _d.getUTCMinutes();
                    const time = `${String(_h % 12 || 12).padStart(2,'0')}:${String(_m).padStart(2,'0')} ${_h >= 12 ? 'PM' : 'AM'}`;
                    return (
                      <button
                        key={appt._id || appt.id}
                        onClick={() => onSelectAppointment(appt)}
                        className="w-full text-left p-3 rounded-xl border border-neutral-100 hover:border-primary-200 hover:bg-primary-50/30 transition-all group"
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
                          {appt.patientName || appt.patient?.name || 'Unknown'}
                        </p>
                        <p className="text-[11px] text-neutral-400 capitalize">{appt.type || 'consultation'}</p>
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
