import { useState, useEffect, useCallback } from 'react';
import {
  Search, X, Calendar as CalendarIcon, User, Filter,
} from 'lucide-react';
import { DataTable, Pagination, Spinner, EmptyState, ErrorAlert } from '../../../platform/components/shared';
import { listAppointments, listDoctors } from '../../api';
import {
  AppointmentStatusBadge, SourceBadge, TypeBadge,
  STATUS_FILTER_CHIPS, TYPE_OPTIONS, SOURCE_OPTIONS,
  selectClasses,
} from './appointment-constants';
import { displayDate, displayTime } from '../../../utils/fakeUtcTime';

// ─── Filter Bar ──────────────────────────────────────────
function FilterBar({ filters, onChange, doctors }) {
  const set = (key, val) => onChange({ ...filters, [key]: val });

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Search */}
      <div className="relative flex-1 min-w-[200px] max-w-xs">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
        <input
          type="text"
          placeholder="Search patient or doctor..."
          value={filters.search || ''}
          onChange={(e) => set('search', e.target.value)}
          className="w-full pl-9 pr-3 py-2 border border-neutral-200 rounded-xl text-sm bg-white text-neutral-900 placeholder:text-neutral-400 focus:border-primary-400 focus:ring-2 focus:ring-primary-100 outline-none transition-all"
        />
      </div>

      {/* Doctor */}
      <select value={filters.doctor || ''} onChange={(e) => set('doctor', e.target.value)} className={selectClasses}>
        <option value="">All Doctors</option>
        {doctors.map((d) => (
          <option key={d._id} value={d._id}>{d.name}</option>
        ))}
      </select>

      {/* Status */}
      <select value={filters.status || ''} onChange={(e) => set('status', e.target.value)} className={selectClasses}>
        {STATUS_FILTER_CHIPS.map((s) => (
          <option key={s.value} value={s.value === 'all' ? '' : s.value}>{s.label}</option>
        ))}
      </select>

      {/* Type */}
      <select value={filters.type || ''} onChange={(e) => set('type', e.target.value)} className={selectClasses}>
        {TYPE_OPTIONS.map((t) => (
          <option key={t} value={t === 'all' ? '' : t}>
            {t === 'all' ? 'All Types' : t.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
          </option>
        ))}
      </select>

      {/* Source */}
      <select value={filters.source || ''} onChange={(e) => set('source', e.target.value)} className={selectClasses}>
        {SOURCE_OPTIONS.map((s) => (
          <option key={s} value={s === 'all' ? '' : s}>
            {s === 'all' ? 'All Sources' : s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
          </option>
        ))}
      </select>

      {/* Date From */}
      <div className="relative">
        <CalendarIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-neutral-400 pointer-events-none" />
        <input
          type="date"
          value={filters.from || ''}
          onChange={(e) => set('from', e.target.value)}
          className={`${selectClasses} pl-8`}
          title="From date"
        />
      </div>

      {/* Date To */}
      <div className="relative">
        <CalendarIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-neutral-400 pointer-events-none" />
        <input
          type="date"
          value={filters.to || ''}
          onChange={(e) => set('to', e.target.value)}
          className={`${selectClasses} pl-8`}
          title="To date"
        />
      </div>

      {/* Clear */}
      {Object.values(filters).some(Boolean) && (
        <button
          onClick={() => onChange({ search: '', doctor: '', status: '', type: '', source: '', from: '', to: '' })}
          className="flex items-center gap-1 px-3 py-2 text-xs font-medium text-neutral-500 hover:text-red-600 transition-colors"
        >
          <X className="h-3.5 w-3.5" /> Clear
        </button>
      )}
    </div>
  );
}

// ─── Main List View ──────────────────────────────────────
export default function AppointmentListView({ filters, onFilterChange, onSelectAppointment, refreshKey, doctorId }) {
  const [data, setData] = useState([]);
  const [meta, setMeta] = useState({ total: 0, page: 1, limit: 15 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [doctors, setDoctors] = useState([]);
  const [sortKey, setSortKey] = useState('scheduledAt');
  const [sortDir, setSortDir] = useState('desc');

  // Load doctors for filter dropdown
  useEffect(() => {
    if (!doctorId) listDoctors({ limit: 200 }).then((r) => setDoctors(r.data || [])).catch(() => {});
  }, [doctorId]);

  const fetchData = useCallback(async (page = 1) => {
    setLoading(true);
    setError(null);
    try {
      const params = { page, limit: meta.limit, sort: `${sortDir === 'desc' ? '-' : ''}${sortKey}` };
      if (filters.doctor) params.doctor = filters.doctor;
      if (doctorId) params.doctor = doctorId;
      if (filters.status) params.status = filters.status;
      if (filters.from) params.from = filters.from;
      if (filters.to) params.to = filters.to;
      if (filters.branch) params.branch = filters.branch;

      const res = await listAppointments(params);
      let items = res.data || [];

      // Client-side filters for fields not supported by backend
      if (filters.type) items = items.filter((a) => a.type === filters.type);
      if (filters.source) items = items.filter((a) => a.source === filters.source);
      if (filters.search) {
        const q = filters.search.toLowerCase();
        items = items.filter((a) =>
          a.patient?.name?.toLowerCase().includes(q) ||
          a.doctor?.name?.toLowerCase().includes(q) ||
          a.patient?.patientId?.toLowerCase().includes(q)
        );
      }

      setData(items);
      setMeta((prev) => ({ ...prev, total: res.meta?.total || items.length, page }));
    } catch (err) {
      setError(err.message || 'Failed to load appointments');
    } finally {
      setLoading(false);
    }
  }, [filters, meta.limit, sortKey, sortDir, doctorId]);

  useEffect(() => { fetchData(1); }, [fetchData, refreshKey]);

  const handleSort = (key) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('asc'); }
  };

  // ─── Column Definitions ────────────────────────
  const columns = [
    {
      key: 'patient',
      label: 'Patient',
      sortable: false,
      render: (row) => {
        const p = row.patient;
        return (
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-primary-50 flex items-center justify-center text-primary-600 text-xs font-bold shrink-0">
              {p?.name?.charAt(0) || '?'}
            </div>
            <div>
              <p className="text-sm font-medium text-neutral-900">{p?.name || 'Unknown'}</p>
            </div>
          </div>
        );
      },
    },
    {
      key: 'doctor',
      label: 'Doctor',
      sortable: false,
      render: (row) => (
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-secondary-50 flex items-center justify-center">
            <User className="h-3 w-3 text-secondary-600" />
          </div>
          <div>
            <p className="text-sm text-neutral-700">{row.doctor?.name || 'Unassigned'}</p>
            <p className="text-[11px] text-neutral-400">{row.doctor?.specialization || ''}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'scheduledAt',
      label: 'Date & Time',
      sortable: true,
      render: (row) => {
        if (!row.scheduledAt) return <span className="text-neutral-400">—</span>;
        // scheduledAt is fake-UTC (IST wall clock + Z) — local formatting would add +5:30
        return (
          <div>
            <p className="text-sm text-neutral-700">{displayDate(row.scheduledAt)}</p>
            <p className="text-[11px] text-neutral-400">{displayTime(row.scheduledAt)} · {row.duration || 30}min</p>
          </div>
        );
      },
    },
    {
      key: 'type',
      label: 'Type',
      sortable: false,
      render: (row) => <TypeBadge type={row.type} />,
    },
    {
      key: 'source',
      label: 'Source',
      sortable: false,
      render: (row) => <SourceBadge source={row.source} />,
    },
    {
      key: 'status',
      label: 'Status',
      sortable: false,
      render: (row) => <AppointmentStatusBadge status={row.status} />,
    },
  ];

  // Hide doctor column if doctor-scoped
  const visibleColumns = doctorId ? columns.filter((c) => c.key !== 'doctor') : columns;

  if (error) return <ErrorAlert message={error} />;

  return (
    <div className="space-y-4">
      {!doctorId && <FilterBar filters={filters} onChange={onFilterChange} doctors={doctors} />}

      {loading ? (
        <Spinner />
      ) : data.length === 0 ? (
        <EmptyState icon={Filter} title="No appointments found" message="Try adjusting your filters or date range" />
      ) : (
        <>
          <DataTable
            columns={visibleColumns}
            data={data}
            onRowClick={(row) => onSelectAppointment(row._id)}
            sortKey={sortKey}
            sortDir={sortDir}
            onSort={handleSort}
          />
          <Pagination
            page={meta.page}
            limit={meta.limit}
            total={meta.total}
            onChange={(p) => fetchData(p)}
          />
        </>
      )}
    </div>
  );
}
