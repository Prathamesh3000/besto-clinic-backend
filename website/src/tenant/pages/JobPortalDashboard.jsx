import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Briefcase, Users, AlertCircle, Plus, Search } from 'lucide-react';
import { listJobs, getJobDashboard, deleteJob } from '../api';
import { useTenantAuth } from '../TenantAuthContext';
import CreditBalanceWidget from '../components/jobs/CreditBalanceWidget';
import JobPostingRow from '../components/jobs/JobPostingRow';
import JobToast from '../components/jobs/JobToast';
import ConfirmDialog from '../components/jobs/ConfirmDialog';

const cardCls = 'bg-white rounded-2xl border border-neutral-200 shadow-[var(--shadow-sm)]';
const btnPrimary = 'px-5 py-2.5 text-sm font-semibold text-white rounded-lg bg-primary-600 hover:bg-primary-700 shadow-[var(--shadow-sm)] transition-all disabled:opacity-50';

export default function JobPortalDashboard() {
  const navigate = useNavigate();
  const { user } = useTenantAuth();
  const [stats, setStats] = useState({ activeListings: 0, totalApplicants: 0, creditBalance: 0 });
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [toast, setToast] = useState(null);
  const [confirmState, setConfirmState] = useState({ open: false, job: null, loading: false });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [dashRes, jobsRes] = await Promise.all([
        getJobDashboard(),
        listJobs({ page, limit: 10, status: statusFilter || undefined }),
      ]);
      setStats(dashRes.data);
      setJobs(jobsRes.data || []);
      setTotal(jobsRes.meta?.total || 0);
    } catch (err) {
      console.error('Failed to load dashboard:', err.message);
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleDelete = (job) => {
    setConfirmState({ open: true, job, loading: false });
  };

  const confirmDelete = async () => {
    const job = confirmState.job;
    if (!job) return;
    setConfirmState((prev) => ({ ...prev, loading: true }));
    try {
      await deleteJob(job._id);
      setConfirmState({ open: false, job: null, loading: false });
      setToast({ type: 'success', message: `"${job.title}" has been deleted.` });
      fetchData();
    } catch (err) {
      setConfirmState({ open: false, job: null, loading: false });
      setToast({ type: 'error', message: err.message || 'Failed to delete the job posting. Please try again.' });
    }
  };

  const statCards = [
    {
      label: 'Active Listings',
      value: stats.activeListings,
      sublabel: 'Currently live',
      icon: Briefcase,
      iconBg: 'bg-primary-50',
      iconColor: 'text-primary-600',
    },
    {
      label: 'Total Applicants',
      value: stats.totalApplicants,
      sublabel: 'Across all roles',
      icon: Users,
      iconBg: 'bg-secondary-50',
      iconColor: 'text-secondary-600',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">Dashboard Overview</h1>
          <p className="text-sm text-neutral-500 mt-1">Manage your job postings and track applications</p>
        </div>
        <div className="flex items-center gap-3">
          <CreditBalanceWidget />
          <button onClick={() => navigate('/clinic/jobs/new')} className={btnPrimary}>
            <span className="flex items-center gap-2">
              <Plus className="w-4 h-4" /> Post New Job
            </span>
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {statCards.map((card) => (
          <div key={card.label} className={`${cardCls} p-5`}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-neutral-500 font-medium">{card.label}</p>
                <p className="text-3xl font-bold text-neutral-900 mt-1">{card.value}</p>
                <p className="text-xs text-neutral-400 mt-1">{card.sublabel}</p>
              </div>
              <div className={`w-12 h-12 rounded-xl ${card.iconBg} flex items-center justify-center`}>
                <card.icon className={`w-6 h-6 ${card.iconColor}`} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Current Postings */}
      <div className={cardCls}>
        <div className="flex items-center justify-between p-5 border-b border-neutral-100">
          <h2 className="text-lg font-semibold text-neutral-900">Current Postings</h2>
          <div className="flex items-center gap-3">
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
              className="px-3 py-2 border border-neutral-200 rounded-xl text-sm bg-white text-neutral-700 focus:border-primary-400 focus:ring-2 focus:ring-primary-100 outline-none"
            >
              <option value="">All Status</option>
              <option value="active">Active</option>
              <option value="draft">Draft</option>
              <option value="closed">Closed</option>
              <option value="filled">Filled</option>
            </select>
          </div>
        </div>

        {loading ? (
          <div className="p-10 text-center text-neutral-400">Loading...</div>
        ) : jobs.length === 0 ? (
          <div className="p-10 text-center">
            <Briefcase className="w-12 h-12 text-neutral-300 mx-auto mb-3" />
            <p className="text-neutral-500">No job postings yet</p>
            <button onClick={() => navigate('/clinic/jobs/new')} className="mt-3 text-sm text-primary-600 hover:text-primary-700 font-medium">
              Create your first listing
            </button>
          </div>
        ) : (
          <div>
            <table className="w-full">
              <thead>
                <tr className="border-b border-neutral-100">
                  <th className="px-5 py-3 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wider">Job Title</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wider">Department</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wider">Applicants</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wider">Status</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wider">Action</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => (
                  <JobPostingRow
                    key={job._id}
                    job={job}
                    onView={(j) => navigate(`/clinic/jobs/${j._id}/applicants`)}
                    onEdit={(j) => navigate(`/clinic/jobs/${j._id}/edit`)}
                    onDelete={handleDelete}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {total > 10 && (
          <div className="flex items-center justify-between p-5 border-t border-neutral-100">
            <p className="text-sm text-neutral-500">
              Showing {(page - 1) * 10 + 1}-{Math.min(page * 10, total)} of {total}
            </p>
            <div className="flex gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
                className="px-3 py-1.5 text-sm border border-neutral-200 rounded-lg hover:bg-neutral-50 disabled:opacity-50"
              >
                Previous
              </button>
              <button
                disabled={page * 10 >= total}
                onClick={() => setPage(page + 1)}
                className="px-3 py-1.5 text-sm border border-neutral-200 rounded-lg hover:bg-neutral-50 disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <JobToast type={toast.type} message={toast.message} onClose={() => setToast(null)} />
      )}

      {/* Delete confirmation dialog */}
      <ConfirmDialog
        open={confirmState.open}
        onClose={() => setConfirmState({ open: false, job: null, loading: false })}
        onConfirm={confirmDelete}
        variant="danger"
        title="Delete Job Posting"
        message={confirmState.job ? `Are you sure you want to delete "${confirmState.job.title}"? This action cannot be undone and all associated data will be permanently removed.` : ''}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        loading={confirmState.loading}
      />
    </div>
  );
}
