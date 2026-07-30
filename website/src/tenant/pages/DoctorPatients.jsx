/**
 * DoctorPatients — Combined Patients & Prescriptions page.
 * Table with search/filters + PatientDrawer side panel.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, Search, ChevronDown } from 'lucide-react';
import { useTenantAuth } from '../TenantAuthContext';
import { listDoctorPatients } from '../api';
import { DataTable, Pagination } from '../../platform/components/shared';
import PatientDrawer from '../components/doctor/PatientDrawer';
import {
  cardCls, PageHeader, Badge, SkeletonLoader, EmptyState,
  SearchInput, FilterPill, StatCard, StatCardSkeleton,
} from '../components/doctor/shared';

const LIMIT = 15;

const GENDER_FILTERS = [
  { key: 'all', label: 'All Genders' },
  { key: 'male', label: 'Male' },
  { key: 'female', label: 'Female' },
  { key: 'other', label: 'Other' },
];

const COLUMNS = [
  {
    key: 'name',
    label: 'Name',
    render: (row) => (
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary-100 to-primary-200 flex items-center justify-center text-xs font-bold text-primary-700 shrink-0">
          {(row.firstName || row.name || '?')[0].toUpperCase()}
        </div>
        <div className="min-w-0">
          <span className="text-sm font-medium text-neutral-900 block truncate">
            {row.firstName ? `${row.firstName} ${row.lastName || ''}` : row.name || 'Unknown'}
          </span>
          {row.phone && <span className="text-[11px] text-neutral-400">{row.phone}</span>}
        </div>
      </div>
    ),
  },
  {
    key: 'gender',
    label: 'Gender',
    render: (row) => {
      const g = row.gender || 'other';
      const colors = { male: 'blue', female: 'purple', other: 'amber' };
      return <Badge color={colors[g] || 'primary'}>{g}</Badge>;
    },
  },
  {
    key: 'age',
    label: 'Age',
    render: (row) => {
      if (row.dateOfBirth) {
        const age = Math.floor((Date.now() - new Date(row.dateOfBirth)) / 31536000000);
        return <span className="text-sm text-neutral-700">{age} yrs</span>;
      }
      return <span className="text-sm text-neutral-400">{row.age ? `${row.age} yrs` : '--'}</span>;
    },
  },
  {
    key: 'lastVisit',
    label: 'Last Visit',
    render: (row) => {
      const d = row.lastVisitDate || row.lastAppointment;
      return d
        ? <span className="text-xs text-neutral-500">{new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
        : <span className="text-xs text-neutral-400">--</span>;
    },
  },
];

// ═══════════════════════════════════════════════════════
export default function DoctorPatients() {
  const navigate = useNavigate();
  const { user } = useTenantAuth();
  const userId = user?.userId;

  // ─���─ State ─────────────────────────────────────────
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [genderFilter, setGenderFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const searchTimer = useRef(null);

  // Drawer state
  const [selectedPatient, setSelectedPatient] = useState(null);

  // ─── Fetch patients ────────────────────────────────
  const fetchPatients = useCallback(async (searchVal = '', pageVal = 1, gender = 'all') => {
    setLoading(true);
    setError('');
    try {
      const params = { search: searchVal, page: pageVal, limit: LIMIT };
      if (gender !== 'all') params.gender = gender;
      const res = await listDoctorPatients(params);
      const d = res?.data || res;
      // ApiResponse.paginated puts items in `data` and counts in `meta`
      const list = Array.isArray(d) ? d : (d.patients || d.data || d.items || []);
      setPatients(Array.isArray(list) ? list : []);
      setTotal(res?.meta?.total ?? res?.pagination?.total ?? (typeof d === 'object' && !Array.isArray(d) ? d.total : null) ?? list.length ?? 0);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchPatients('', 1, 'all');
  }, [fetchPatients]);

  // ─── Handlers ──────────────────────────────────────
  const handleSearch = useCallback((value) => {
    setSearch(value);
    setPage(1);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      fetchPatients(value, 1, genderFilter);
    }, 400);
  }, [fetchPatients, genderFilter]);

  const handleGenderFilter = useCallback((g) => {
    setGenderFilter(g);
    setPage(1);
    fetchPatients(search, 1, g);
  }, [fetchPatients, search]);

  const handlePageChange = useCallback((newPage) => {
    setPage(newPage);
    fetchPatients(search, newPage, genderFilter);
  }, [fetchPatients, search, genderFilter]);

  const handleRowClick = useCallback((patient) => {
    setSelectedPatient(patient);
  }, []);

  const handleStartConsultation = useCallback((appt) => {
    navigate(`/clinic/doctor-consultation/${appt._id || appt.id}`);
  }, [navigate]);

  // ═══════════════════════════════════════════════════
  return (
    <div className="max-w-[1280px] mx-auto w-full space-y-6">

      {/* ── Page Header ────────────────────────────── */}
      <PageHeader
        title="My Patients"
        subtitle={`${total} patient${total !== 1 ? 's' : ''} total`}
      />

      {/* ── Toolbar ────────────────────────────────── */}
      <div className={`${cardCls} p-4 animate-[fadeUp_0.4s_ease-out_both]`} style={{ animationDelay: '50ms' }}>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-1.5">
            {GENDER_FILTERS.map((gf) => (
              <FilterPill
                key={gf.key}
                label={gf.label}
                active={genderFilter === gf.key}
                onClick={() => handleGenderFilter(gf.key)}
              />
            ))}
          </div>
          <div className="w-full sm:w-72">
            <SearchInput value={search} onChange={handleSearch} placeholder="Search by name, ID, phone..." />
          </div>
        </div>
      </div>

      {/* ── Patient Table ──────────────────────────── */}
      <div className={`${cardCls} animate-[fadeUp_0.4s_ease-out_both]`} style={{ animationDelay: '100ms' }}>
        {error ? (
          <div className="p-6">
            <div className="flex items-center gap-3 bg-red-50 text-red-700 px-5 py-4 rounded-2xl text-sm border border-red-100">
              <p>{error}</p>
            </div>
            <button onClick={() => fetchPatients(search, page, genderFilter)} className="mt-3 px-4 py-2 text-sm font-medium text-primary-600 hover:text-primary-700">
              Retry
            </button>
          </div>
        ) : loading ? (
          <div className="p-6 space-y-3">
            <SkeletonLoader className="h-12 w-full" count={6} />
          </div>
        ) : patients.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={Users}
              title={search || genderFilter !== 'all' ? 'No patients found' : 'No patients yet'}
              message={search ? 'Try adjusting your search terms' : 'Patients you have consulted will appear here'}
            />
          </div>
        ) : (
          <>
            <DataTable columns={COLUMNS} data={patients} onRowClick={handleRowClick} />
            {total > LIMIT && (
              <div className="px-6 pb-4">
                <Pagination page={page} limit={LIMIT} total={total} onChange={handlePageChange} />
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Patient Drawer ─────────────────────────── */}
      <PatientDrawer
        open={!!selectedPatient}
        patient={selectedPatient}
        userId={userId}
        onClose={() => setSelectedPatient(null)}
        onStartConsultation={handleStartConsultation}
      />
    </div>
  );
}
