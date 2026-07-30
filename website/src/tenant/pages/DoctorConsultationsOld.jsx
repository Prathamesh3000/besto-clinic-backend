/**
 * DoctorConsultations — Modern consultation management dashboard
 *
 * Design: 2025 Redesign with gradient hero, modern cards, smooth animations
 * Features: List view, search, filters, quick actions, status management
 *
 * @version 2.0
 * @date April 2026
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Pagination, Spinner, ErrorAlert, EmptyState,
} from '../../platform/components/shared';
import { listDoctorConsultations, listDoctors } from '../api';
import { useTenantAuth } from '../TenantAuthContext';
import {
  Stethoscope, Search, User, Calendar, Clock, FileText,
  Eye, Activity, ChevronRight, ClipboardList, CheckCircle2, XCircle,
} from 'lucide-react';
import { selectClasses } from '../components/appointments/appointment-constants';

// ─── Status Configuration ─────────────────────────
// ─── Status helpers ────────────────────────────
const STATUS_STYLES = {
  in_progress: { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500', label: 'In Progress' },
  completed:   { bg: 'bg-blue-50',    text: 'text-blue-700',    dot: 'bg-blue-500',    label: 'Completed' },
  cancelled:   { bg: 'bg-red-50',     text: 'text-red-600',     dot: 'bg-red-500',     label: 'Cancelled' },
};

const FILTER_TABS = [
  { key: '',          label: 'All', icon: ClipboardList },
  { key: 'active',    label: 'Active', icon: Activity },
  { key: 'completed', label: 'Completed', icon: CheckCircle2 },
];

// ─── Helper Functions ─────────────────────────────
function calculateAge(dob) {
  if (!dob) return null;
  const diff = Date.now() - new Date(dob).getTime();
  return Math.floor(diff / (365.25 * 24 * 60 * 60 * 1000));
}

function formatDate(d) {
  if (!d) return 'N/A';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatTime(d) {
  if (!d) return '';
  return new Date(d).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

const AVATAR_COLORS = [
  'from-primary-400 to-primary-600',
  'from-emerald-400 to-emerald-600',
  'from-purple-400 to-purple-600',
  'from-amber-400 to-amber-600',
  'from-blue-400 to-blue-600',
  'from-rose-400 to-rose-600',
];

function getAvatarGradient(name) {
  let hash = 0;
  for (let i = 0; i < (name || '').length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function getInitials(name) {
  if (!name) return '?';
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

function StatusBadge({ status }) {
  const s = STATUS_STYLES[status] || { bg: 'bg-gray-100', text: 'text-gray-600', dot: 'bg-gray-400', label: status };
  return (
    <span className={`inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full font-semibold ${s.bg} ${s.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}

// ─── Consultation Card Component ──────────────────
function ConsultationCard({ consultation, onClick }) {
  const patient = consultation.patient || {};
  const doctor = consultation.doctor || {};
  const appt = consultation.appointment || {};
  const apptStatus = appt.status || consultation.status || 'completed';
  const isActive = apptStatus === 'in_progress';
  const age = calculateAge(patient.dateOfBirth);
  const patientName = patient.name || 'Unknown';

  return (
    <div
      onClick={onClick}
      className={`bg-white rounded-2xl border transition-all cursor-pointer group hover:shadow-md ${
        isActive
          ? 'border-emerald-200 shadow-sm shadow-emerald-600/5'
          : 'border-neutral-300/60 hover:border-primary-200'
      }`}
    >
      {/* Card Header */}
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${getAvatarGradient(patientName)} flex items-center justify-center text-white text-sm font-bold shrink-0`}>
              {getInitials(patientName)}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-neutral-900 truncate">{patientName}</p>
              <div className="flex items-center gap-2 mt-0.5">
                {patient.patientId && (
                  <span className="text-[10px] text-neutral-900/30">#{patient.patientId}</span>
                )}
                {age && (
                  <span className="text-[10px] text-neutral-900/30">{age} yrs</span>
                )}
                {patient.gender && (
                  <span className="text-[10px] text-neutral-900/30 capitalize">{patient.gender}</span>
                )}
              </div>
            </div>
          </div>
          <StatusBadge status={apptStatus} />
        </div>
      </div>

      {/* Card Body */}
      <div className="px-4 pb-3 space-y-2">
        {/* Doctor name (if admin view) */}
        {doctor.name && (
          <div className="flex items-center gap-2">
            <Stethoscope className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
            <span className="text-xs text-neutral-600 font-medium truncate">Dr. {doctor.name}</span>
          </div>
        )}

        {/* Diagnosis */}
        {consultation.diagnosis && consultation.diagnosis !== 'In progress' && (
          <div className="flex items-start gap-2">
            <FileText className="h-3.5 w-3.5 text-neutral-900/25 mt-0.5 shrink-0" />
            <p className="text-xs text-neutral-900/60 line-clamp-2">{consultation.diagnosis}</p>
          </div>
        )}

        {/* Schedule info */}
        {appt.scheduledAt && (
          <div className="flex items-center gap-3 text-[11px] text-neutral-900/40">
            <span className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {formatDate(appt.scheduledAt)}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {formatTime(appt.scheduledAt)}
            </span>
          </div>
        )}

        {/* Type badge */}
        {appt.type && (
          <span className="inline-flex text-[10px] px-2 py-0.5 rounded-md bg-neutral-100 text-neutral-900/40 font-medium capitalize">
            {appt.type.replace(/_/g, ' ')}
          </span>
        )}
      </div>

      {/* Card Footer */}
      <div className={`px-4 py-2.5 border-t flex items-center justify-between ${
        isActive ? 'border-emerald-100 bg-emerald-50/30' : 'border-neutral-200/60'
      }`}>
        <span className="text-[10px] text-neutral-900/25">
          {formatDate(consultation.createdAt)}
        </span>
        <span className={`flex items-center gap-1 text-xs font-semibold transition-colors ${
          isActive
            ? 'text-emerald-600 group-hover:text-emerald-700'
            : 'text-primary-500 group-hover:text-primary-600'
        }`}>
          {isActive ? (
            <>
              <Activity className="h-3 w-3" />
              Resume
            </>
          ) : (
            <>
              <Eye className="h-3 w-3" />
              View
            </>
          )}
          <ChevronRight className="h-3 w-3" />
        </span>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────
export default function DoctorConsultations() {
  const navigate = useNavigate();
  const { user } = useTenantAuth();
  const isAdmin = ['admin', 'super_admin', 'manager', 'department_manager'].includes(user?.role);

  const [consultations, setConsultations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 12;
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [doctorFilter, setDoctorFilter] = useState('');
  const [doctors, setDoctors] = useState([]);
  const searchTimerRef = useRef(null);

  // Load doctors list for admin filter
  useEffect(() => {
    if (isAdmin) {
      listDoctors({ limit: 200 }).then((r) => setDoctors(r.data || [])).catch(() => {});
    }
  }, [isAdmin]);

  const fetchConsultations = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const params = { page, limit };
      if (search) params.search = search;
      if (statusFilter) params.status = statusFilter;
      if (isAdmin && doctorFilter) params.doctor = doctorFilter;
      const res = await listDoctorConsultations(params);
      const data = Array.isArray(res.data) ? res.data : res.data?.items || [];
      setConsultations(data);
      setTotal(res.meta?.total ?? res.total ?? data.length);
    } catch (err) {
      setError(err.message || 'Failed to load consultations');
    } finally {
      setLoading(false);
    }
  }, [page, search, statusFilter, isAdmin, doctorFilter]);

  useEffect(() => { fetchConsultations(); }, [fetchConsultations]);

  const handleSearchChange = (e) => {
    const val = e.target.value;
    setSearch(val);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => setPage(1), 400);
  };

  const handleFilterChange = (key) => {
    setStatusFilter(key);
    setPage(1);
  };

  const openConsultation = (consultation) => {
    const apptId = consultation.appointment?._id || consultation.appointment;
    if (apptId) {
      navigate(`/clinic/doctor-consultation/${apptId}`);
    }
  };

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-neutral-900 font-display">Consultations</h1>
          <p className="text-sm text-neutral-900/40 mt-1">
            {isAdmin ? 'View and manage all consultation records' : 'View and manage your consultation records'}
          </p>
        </div>
        {total > 0 && (
          <div className="text-right">
            <p className="text-2xl font-bold text-neutral-900 font-display">{total}</p>
            <p className="text-xs text-neutral-500">Total Records</p>
          </div>
        )}
      </div>

      {/* Toolbar: Search + Filter Tabs + Doctor Filter */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        {/* Filter tabs */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-neutral-100/80 rounded-xl p-1">
            {FILTER_TABS.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.key}
                  onClick={() => handleFilterChange(tab.key)}
                  className={`flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                    statusFilter === tab.key
                      ? 'bg-white text-neutral-900 shadow-sm'
                      : 'text-neutral-900/40 hover:text-neutral-900/60'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Doctor filter (admin only) */}
          {isAdmin && doctors.length > 0 && (
            <select
              value={doctorFilter}
              onChange={(e) => { setDoctorFilter(e.target.value); setPage(1); }}
              className={`${selectClasses} text-xs !py-1.5`}
            >
              <option value="">All Doctors</option>
              {doctors.map((d) => (
                <option key={d._id} value={d._id}>{d.name}</option>
              ))}
            </select>
          )}
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-900/25" />
          <input
            type="text"
            value={search}
            onChange={handleSearchChange}
            placeholder="Search consultations..."
            className="w-full pl-9 pr-4 py-2 text-sm border border-neutral-300/60 rounded-xl bg-white placeholder:text-neutral-900/25 focus:border-primary-400 focus:ring-2 focus:ring-primary-400/20 outline-none transition-all"
          />
        </div>
      </div>

      {/* Error */}
      {error && <ErrorAlert message={error} onClose={() => setError('')} />}

      {/* Loading */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Spinner />
        </div>
      ) : consultations.length === 0 ? (
        <EmptyState
          icon={Stethoscope}
          title="No consultations found"
          description={search || statusFilter || doctorFilter ? 'Try adjusting your filters' : 'Consultations will appear here once they are started from appointments'}
        />
      ) : (
        <>
          {/* Consultation Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {consultations.map((consultation) => (
              <ConsultationCard
                key={consultation._id}
                consultation={consultation}
                onClick={() => openConsultation(consultation)}
              />
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex justify-center pt-2">
              <Pagination
                page={page}
                totalPages={totalPages}
                onPageChange={setPage}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
