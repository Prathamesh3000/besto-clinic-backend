import { useState, useEffect, useCallback } from 'react';
import {
  CalendarDays, Plus, LayoutGrid, List,
  CalendarCheck, CalendarClock, CheckCircle2,
} from 'lucide-react';
import { listAppointments, listDoctors, listBranches } from '../api';
import { useTenantAuth } from '../TenantAuthContext';
import { initSocket, getSocket } from '../../lib/socket';
import { useToast } from '../ToastContext';

// Sub-components (shared with admin Appointments page)
import AppointmentCalendarView from '../components/appointments/AppointmentCalendarView';
import AppointmentListView from '../components/appointments/AppointmentListView';
import AppointmentDrawer from '../components/appointments/AppointmentDrawer';
import AppointmentCreateModal from '../components/appointments/AppointmentCreateModal';
import LiveQueueBar from '../components/appointments/LiveQueueBar';
import { selectClasses, STATUS_FILTER_CHIPS, TYPE_OPTIONS } from '../components/appointments/appointment-constants';

const VIEWS = [
  { key: 'calendar', label: 'Calendar', Icon: LayoutGrid },
  { key: 'list',     label: 'List',     Icon: List },
];

const COMPACT_SELECT = `${selectClasses} text-xs !py-1.5`;

// ─── Inline Micro-Stat ──────────────────────────────────
function MicroStat({ icon: Icon, label, value }) {
  return (
    <div className="flex items-center gap-1.5 text-xs text-neutral-500">
      <Icon className="h-3.5 w-3.5 text-neutral-400" />
      <span className="font-semibold text-neutral-700">{value}</span>
      <span className="hidden sm:inline">{label}</span>
    </div>
  );
}

// ─── View Toggle ─────────────────────────────────────────
function ViewToggle({ active, onChange }) {
  return (
    <div className="inline-flex items-center bg-neutral-100 rounded-xl p-0.5">
      {VIEWS.map((v) => {
        const isActive = active === v.key;
        return (
          <button
            key={v.key}
            onClick={() => onChange(v.key)}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
              isActive
                ? 'bg-white text-neutral-900 shadow-sm'
                : 'text-neutral-500 hover:text-neutral-700'
            }`}
          >
            <v.Icon className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{v.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// ─── Main Receptionist Appointments Page ─────────────────
export default function ReceptionistAppointments() {
  const { user } = useTenantAuth();
  const { showToast } = useToast();

  // View + UI state
  const [activeView, setActiveView] = useState('calendar');
  const [selectedId, setSelectedId] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [prefillDate, setPrefillDate] = useState(null);
  const [prefillTime, setPrefillTime] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // Filters
  const [filters, setFilters] = useState({
    search: '', doctor: '', status: '', type: '', from: '', to: '', branch: '',
  });

  // Reference data
  const [doctors, setDoctors] = useState([]);
  const [branches, setBranches] = useState([]);
  const [selectedBranch, setSelectedBranch] = useState('');

  // Stats
  const [stats, setStats] = useState({ today: 0, week: 0, confirmed: 0, pending: 0 });

  // Load reference data
  useEffect(() => {
    (async () => {
      try {
        const [br, doc] = await Promise.all([
          listBranches({ limit: 100 }),
          listDoctors({ limit: 100 }),
        ]);
        const branchList = br.data?.branches || br.data || [];
        setBranches(branchList);
        if (branchList.length === 1) setSelectedBranch(branchList[0]._id);
        setDoctors(doc.data?.doctors || doc.data || []);
      } catch {
        // Non-critical
      }
    })();
  }, []);

  // Load stats
  const fetchStats = useCallback(async () => {
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
      const confirmed = todayItems.filter((a) => a.status === 'confirmed').length;
      const pending = todayItems.filter((a) => a.status === 'requested').length;

      setStats({ today: todayTotal, week: weekTotal, confirmed, pending });
    } catch {
      // Stats are non-critical
    }
  }, []);

  useEffect(() => { fetchStats(); }, [fetchStats, refreshKey]);

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
    showToast({ type: 'success', message: 'Appointment created' });
  };

  const handleUpdated = () => {
    setSelectedId(null);
    setRefreshKey((k) => k + 1);
  };

  const set = (key, val) => setFilters((f) => ({ ...f, [key]: val }));

  // ─── Render ────────────────────────────────────
  return (
    <div className="flex flex-col h-[calc(100vh-6.5rem)]">
      {/* ── Row 1: Header — title + inline micro-stats + New button ── */}
      <div className="flex flex-wrap items-center justify-between gap-4 shrink-0 mb-3 animate-[fadeUp_0.4s_ease-out_both]">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-semibold font-display text-neutral-900">Appointments</h1>
          <div className="hidden md:flex items-center gap-3 pl-4 border-l border-neutral-200">
            <MicroStat icon={CalendarDays} label="Today" value={stats.today} />
            <MicroStat icon={CalendarClock} label="This Week" value={stats.week} />
            <MicroStat icon={CalendarCheck} label="Confirmed" value={stats.confirmed} />
            <MicroStat icon={CheckCircle2} label="Pending" value={stats.pending} />
          </div>
        </div>
        <button
          onClick={() => { setPrefillDate(null); setPrefillTime(null); setShowCreate(true); }}
          className="h-11 flex items-center gap-2 px-5 bg-primary-600 hover:bg-primary-700 text-white text-sm font-semibold rounded-lg shadow-[var(--shadow-sm)] transition-all duration-200 hover:shadow-[var(--shadow-md)]"
        >
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">New Appointment</span>
        </button>
      </div>

      {/* ── Row 2: Queue bar (auto-hides when empty) ── */}
      <div className="shrink-0 mb-2">
        <LiveQueueBar branchId={selectedBranch} />
      </div>

      {/* ── Row 3: Unified toolbar — view toggle + filters on one row ── */}
      <div className="flex flex-wrap items-center gap-2 shrink-0 mb-3 animate-[fadeUp_0.4s_ease-out_both]" style={{ animationDelay: '100ms' }}>
        <ViewToggle active={activeView} onChange={setActiveView} />

        <div className="w-px h-6 bg-neutral-200 mx-0.5 hidden sm:block" />

        {/* Filters (shown for non-list views; list has its own filter bar) */}
        {activeView !== 'list' && (
          <>
            <select value={filters.doctor || ''} onChange={(e) => set('doctor', e.target.value)} className={COMPACT_SELECT}>
              <option value="">All Doctors</option>
              {doctors.map((d) => <option key={d._id} value={d._id}>{d.name}</option>)}
            </select>
            <select value={filters.status || ''} onChange={(e) => set('status', e.target.value)} className={COMPACT_SELECT}>
              {STATUS_FILTER_CHIPS.map((s) => <option key={s.value} value={s.value === 'all' ? '' : s.value}>{s.label}</option>)}
            </select>
            <select value={filters.type || ''} onChange={(e) => set('type', e.target.value)} className={COMPACT_SELECT}>
              {TYPE_OPTIONS.map((t) => <option key={t} value={t === 'all' ? '' : t}>{t === 'all' ? 'All Types' : t.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}</option>)}
            </select>
          </>
        )}

        {branches.length > 1 && (
          <select value={selectedBranch} onChange={(e) => setSelectedBranch(e.target.value)} className={COMPACT_SELECT}>
            <option value="">All Branches</option>
            {branches.map((b) => <option key={b._id} value={b._id}>{b.name}</option>)}
          </select>
        )}
      </div>

      {/* ── Main view area — fills all remaining viewport height ── */}
      <div className="flex-1 min-h-0 overflow-hidden">
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
      </div>

      {/* Appointment Drawer */}
      <AppointmentDrawer
        open={!!selectedId}
        appointmentId={selectedId}
        onClose={() => setSelectedId(null)}
        onUpdated={handleUpdated}
        userRole="receptionist"
      />

      {/* Create Modal */}
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
