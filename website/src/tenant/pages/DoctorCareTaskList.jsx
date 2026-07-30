/**
 * DoctorCareTaskList — View ALL active care tasks across patients.
 * Table with filters, progress bars, and "Send Summary" action.
 */
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ClipboardList, Search, Send, ChevronLeft, ChevronRight, Filter, Eye } from 'lucide-react';
import { getDoctorCareTasks, sendPatientCareSummary } from '../api';
import { useTenantAuth } from '../TenantAuthContext';
import { useToast } from '../ToastContext';
import PatientDrawer from '../components/doctor/PatientDrawer';

const LIMIT = 20;

const STATUS_OPTIONS = [
  { key: '', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'completed', label: 'Completed' },
];

const TYPE_OPTIONS = [
  { key: '', label: 'All Types' },
  { key: 'medication', label: 'Medication' },
  { key: 'post_care', label: 'Post-care' },
  { key: 'custom', label: 'Custom' },
];

function ProgressBar({ completed, skipped, missed, total }) {
  if (!total) return <span className="text-xs text-neutral-400">--</span>;
  const pct = Math.round((completed / total) * 100);
  const color = pct >= 80 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div className="flex items-center gap-2 min-w-[140px]">
      <div className="flex-1 h-2 bg-neutral-100 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-medium text-neutral-600 whitespace-nowrap">
        {completed}/{total}
      </span>
    </div>
  );
}

function TaskTypeBadge({ type }) {
  const styles = {
    medication: 'bg-blue-50 text-blue-700',
    post_care: 'bg-purple-50 text-purple-700',
    custom: 'bg-neutral-100 text-neutral-600',
  };
  const labels = { medication: 'Medication', post_care: 'Post-care', custom: 'Custom' };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium ${styles[type] || styles.custom}`}>
      {labels[type] || type}
    </span>
  );
}

function StatusBadge({ status }) {
  const isActive = status === 'active';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium ${
      isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-neutral-100 text-neutral-500'
    }`}>
      {isActive ? 'Active' : 'Completed'}
    </span>
  );
}

export default function DoctorCareTaskList() {
  const navigate = useNavigate();
  const { user } = useTenantAuth();
  const toast = useToast();
  const [tasks, setTasks] = useState([]);
  const [pagination, setPagination] = useState({ total: 0, page: 1, pages: 1 });
  const [loading, setLoading] = useState(true);
  const [sendingFor, setSendingFor] = useState(null);
  const [filters, setFilters] = useState({ status: 'active', taskType: '', search: '' });
  const [page, setPage] = useState(1);
  const [selectedPatient, setSelectedPatient] = useState(null);

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, limit: LIMIT };
      if (filters.status) params.status = filters.status;
      if (filters.taskType) params.taskType = filters.taskType;
      if (filters.search) params.patientId = filters.search;
      const res = await getDoctorCareTasks(params);
      setTasks(res.data || []);
      setPagination(res.meta || { total: 0, page: 1, pages: 1 });
    } catch (err) {
      toast?.error?.(err.message || 'Failed to load care tasks');
    } finally {
      setLoading(false);
    }
  }, [page, filters, toast]);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  const handleSendSummary = async (patientId, patientName) => {
    setSendingFor(patientId);
    try {
      await sendPatientCareSummary(patientId);
      toast?.success?.(`Care summary sent to ${patientName}`);
    } catch (err) {
      toast?.error?.(err.message || 'Failed to send summary');
    } finally {
      setSendingFor(null);
    }
  };

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
    setPage(1);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary-50 rounded-xl">
            <ClipboardList className="h-6 w-6 text-primary-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-neutral-900">Care Tasks</h1>
            <p className="text-sm text-neutral-500">All patient care tasks across your practice</p>
          </div>
        </div>
        <span className="text-sm text-neutral-500">{pagination.total} task{pagination.total !== 1 ? 's' : ''}</span>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        {STATUS_OPTIONS.map(opt => (
          <button
            key={opt.key}
            onClick={() => handleFilterChange('status', opt.key)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
              filters.status === opt.key
                ? 'bg-primary-100 text-primary-700'
                : 'bg-white text-neutral-600 hover:bg-neutral-50 border border-neutral-200'
            }`}
          >
            {opt.label}
          </button>
        ))}
        <div className="h-6 w-px bg-neutral-200" />
        <select
          value={filters.taskType}
          onChange={(e) => handleFilterChange('taskType', e.target.value)}
          className="px-3 py-1.5 rounded-lg text-sm border border-neutral-200 bg-white text-neutral-700 focus:outline-none focus:ring-2 focus:ring-primary-200"
        >
          {TYPE_OPTIONS.map(opt => (
            <option key={opt.key} value={opt.key}>{opt.label}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-neutral-200 overflow-hidden">
        {loading ? (
          <div className="p-8 space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-12 bg-neutral-100 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : tasks.length === 0 ? (
          <div className="p-12 text-center">
            <ClipboardList className="h-12 w-12 text-neutral-300 mx-auto mb-3" />
            <p className="text-neutral-500 font-medium">No care tasks found</p>
            <p className="text-sm text-neutral-400 mt-1">Tasks will appear here after completing consultations with care plans</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-neutral-100 bg-neutral-50/50">
                  <th className="px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Patient</th>
                  <th className="px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Task</th>
                  <th className="px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Type</th>
                  <th className="px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Frequency</th>
                  <th className="px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Progress</th>
                  <th className="px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Last Response</th>
                  <th className="px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {tasks.map((task) => (
                  <tr key={task._id} className="hover:bg-neutral-50/50 transition">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-primary-100 to-primary-200 flex items-center justify-center text-[11px] font-bold text-primary-700 shrink-0">
                          {(task.patient?.name || '?')[0].toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <span className="text-sm font-medium text-neutral-900 block truncate">{task.patient?.name || 'Unknown'}</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-neutral-800">{task.title}</span>
                      {task.instructions && (
                        <span className="block text-[11px] text-neutral-400 truncate max-w-[200px]">{task.instructions}</span>
                      )}
                    </td>
                    <td className="px-4 py-3"><TaskTypeBadge type={task.taskType} /></td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-neutral-600 capitalize">{task.frequency?.replace(/_/g, ' ') || '--'}</span>
                    </td>
                    <td className="px-4 py-3">
                      <ProgressBar {...(task.progress || {})} />
                    </td>
                    <td className="px-4 py-3">
                      {task.lastResponse ? (
                        <div>
                          <span className={`text-xs font-medium capitalize ${
                            task.lastResponse.status === 'done' ? 'text-emerald-600' :
                            task.lastResponse.status === 'skipped' ? 'text-amber-600' :
                            task.lastResponse.status === 'missed' ? 'text-red-600' : 'text-neutral-500'
                          }`}>
                            {task.lastResponse.status}
                          </span>
                          {task.lastResponse.at && (
                            <span className="block text-[10px] text-neutral-400">
                              {new Date(task.lastResponse.at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-neutral-400">--</span>
                      )}
                    </td>
                    <td className="px-4 py-3"><StatusBadge status={task.status} /></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        {task.patient?._id && (
                          <button
                            onClick={() => setSelectedPatient(task.patient)}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-neutral-100 text-neutral-700 hover:bg-neutral-200 transition"
                            title="View patient details"
                          >
                            <Eye className="h-3 w-3" />
                            View
                          </button>
                        )}
                        {task.patient?._id && task.status === 'active' && (
                          <button
                            onClick={() => handleSendSummary(task.patient._id, task.patient.name)}
                            disabled={sendingFor === task.patient._id}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-primary-50 text-primary-700 hover:bg-primary-100 transition disabled:opacity-50"
                            title="Send care summary notification"
                          >
                            <Send className="h-3 w-3" />
                            {sendingFor === task.patient._id ? 'Sending...' : 'Summary'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {pagination.pages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-neutral-100">
            <span className="text-sm text-neutral-500">
              Page {pagination.page} of {pagination.pages}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="p-1.5 rounded-lg hover:bg-neutral-100 disabled:opacity-30 transition"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                onClick={() => setPage(p => Math.min(pagination.pages, p + 1))}
                disabled={page >= pagination.pages}
                className="p-1.5 rounded-lg hover:bg-neutral-100 disabled:opacity-30 transition"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Patient Drawer */}
      <PatientDrawer
        open={!!selectedPatient}
        patient={selectedPatient}
        userId={user?.userId}
        onClose={() => setSelectedPatient(null)}
        onStartConsultation={(appt) => navigate(`/clinic/doctor-consultation/${appt._id || appt.id}`)}
      />
    </div>
  );
}
