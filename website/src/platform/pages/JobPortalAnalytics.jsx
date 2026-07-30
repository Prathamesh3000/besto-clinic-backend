import { useState, useEffect, useCallback } from 'react';
import { getJobAnalytics, getCreditOverview, listAllJobPostings, adjustClinicCredits, listClinicWallets } from '../api';
import { useNavigate } from 'react-router-dom';
import { StatCard } from '../components/shared';
import {
  Briefcase, Users, CreditCard, TrendingUp, Search,
  ChevronLeft, ChevronRight, DollarSign, ArrowUpRight,
} from 'lucide-react';

const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'postings', label: 'All Postings' },
  { key: 'credits', label: 'Credit Management' },
];

const STATUS_STYLES = {
  active: { bg: 'bg-emerald-50', text: 'text-emerald-700' },
  draft: { bg: 'bg-neutral-100', text: 'text-neutral-600' },
  closed: { bg: 'bg-red-50', text: 'text-red-700' },
  filled: { bg: 'bg-blue-50', text: 'text-blue-700' },
};

export default function JobPortalAnalytics() {
  const navigate = useNavigate();
  const [tab, setTab] = useState('overview');
  const [analytics, setAnalytics] = useState(null);
  const [creditOverview, setCreditOverview] = useState(null);
  const [postings, setPostings] = useState([]);
  const [postingsMeta, setPostingsMeta] = useState({ total: 0 });
  const [postingsPage, setPostingsPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [adjustForm, setAdjustForm] = useState({ slug: '', amount: '', description: '' });
  const [adjustLoading, setAdjustLoading] = useState(false);
  const [adjustMsg, setAdjustMsg] = useState('');
  const [wallets, setWallets] = useState([]);
  const [walletsMeta, setWalletsMeta] = useState({ total: 0 });

  const fetchOverview = useCallback(async () => {
    setLoading(true);
    try {
      const [aRes, cRes] = await Promise.all([
        getJobAnalytics().catch(() => ({ data: {} })),
        getCreditOverview().catch(() => ({ data: {} })),
      ]);
      setAnalytics(aRes.data || aRes);
      setCreditOverview(cRes.data || cRes);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchPostings = useCallback(async () => {
    try {
      const res = await listAllJobPostings({ page: postingsPage, limit: 20 });
      setPostings(res.data || []);
      setPostingsMeta(res.meta || { total: 0 });
    } catch (err) {
      console.error(err);
    }
  }, [postingsPage]);

  const fetchWallets = useCallback(async () => {
    try {
      const res = await listClinicWallets({ limit: 50 });
      setWallets(res.data || []);
      setWalletsMeta(res.meta || { total: 0 });
    } catch (err) { console.error(err); }
  }, []);

  useEffect(() => { fetchOverview(); }, [fetchOverview]);
  useEffect(() => { if (tab === 'postings') fetchPostings(); }, [tab, fetchPostings]);
  useEffect(() => { if (tab === 'credits') fetchWallets(); }, [tab, fetchWallets]);

  const handleAdjust = async (e) => {
    e.preventDefault();
    setAdjustLoading(true);
    setAdjustMsg('');
    try {
      await adjustClinicCredits(adjustForm.slug, {
        amount: Number(adjustForm.amount),
        description: adjustForm.description,
      });
      setAdjustMsg('Credits adjusted successfully');
      setAdjustForm({ slug: '', amount: '', description: '' });
      fetchOverview();
    } catch (err) {
      setAdjustMsg(err.message);
    } finally {
      setAdjustLoading(false);
    }
  };

  const totalPostingsPages = Math.ceil((postingsMeta.total || 0) / 20);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-neutral-900">Job Portal</h1>
        <p className="text-sm text-neutral-500 mt-1">Platform-wide job portal analytics and credit management</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-neutral-100 rounded-xl p-1 w-fit">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === t.key ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500 hover:text-neutral-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading && tab === 'overview' ? (
        <div className="text-center py-20 text-neutral-400">Loading analytics...</div>
      ) : tab === 'overview' ? (
        <div className="space-y-6">
          {/* Stats */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard icon={Briefcase} label="Total Postings" value={analytics?.totalPostings || 0} />
            <StatCard icon={TrendingUp} label="Active Listings" value={analytics?.activeListings || 0} />
            <StatCard icon={Users} label="Total Applications" value={analytics?.totalApplications || 0} />
            <StatCard icon={DollarSign} label="Total Credits Consumed" value={creditOverview?.totalConsumed || 0} />
          </div>

          {/* Credit Overview */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-2xl border border-neutral-200 p-6">
              <h3 className="text-base font-semibold text-neutral-900 mb-4">Credit Economy</h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between py-2 border-b border-neutral-100">
                  <span className="text-sm text-neutral-600">Total Credits Purchased</span>
                  <span className="text-sm font-semibold text-neutral-900">{creditOverview?.totalPurchased || 0}</span>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-neutral-100">
                  <span className="text-sm text-neutral-600">Total Credits Granted (Plans)</span>
                  <span className="text-sm font-semibold text-neutral-900">{creditOverview?.totalGranted || 0}</span>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-neutral-100">
                  <span className="text-sm text-neutral-600">Total Credits Consumed</span>
                  <span className="text-sm font-semibold text-neutral-900">{creditOverview?.totalConsumed || 0}</span>
                </div>
                <div className="flex items-center justify-between py-2">
                  <span className="text-sm text-neutral-600">Active Wallets</span>
                  <span className="text-sm font-semibold text-neutral-900">{creditOverview?.activeWallets || 0}</span>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-neutral-200 p-6">
              <h3 className="text-base font-semibold text-neutral-900 mb-4">Application Funnel</h3>
              <div className="space-y-3">
                {['applied', 'screened', 'interview', 'hired', 'rejected'].map((stage) => {
                  const count = analytics?.stageCounts?.[stage] || 0;
                  const total = analytics?.totalApplications || 1;
                  const pct = Math.round((count / total) * 100);
                  return (
                    <div key={stage} className="flex items-center gap-3">
                      <span className="text-sm text-neutral-600 capitalize w-20">{stage}</span>
                      <div className="flex-1 h-2 bg-neutral-100 rounded-full overflow-hidden">
                        <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-xs text-neutral-500 w-14 text-right">{count} ({pct}%)</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Top Clinics */}
          {analytics?.topClinics?.length > 0 && (
            <div className="bg-white rounded-2xl border border-neutral-200 p-6">
              <h3 className="text-base font-semibold text-neutral-900 mb-4">Top Hiring Clinics</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-neutral-500 border-b border-neutral-100">
                      <th className="text-left py-2 font-medium">Clinic</th>
                      <th className="text-right py-2 font-medium">Active Jobs</th>
                      <th className="text-right py-2 font-medium">Applications</th>
                      <th className="text-right py-2 font-medium">Hired</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analytics.topClinics.map((c) => (
                      <tr key={c.clinicId} className="border-b border-neutral-50">
                        <td className="py-2.5 font-medium text-neutral-900">{c.clinicName}</td>
                        <td className="py-2.5 text-right text-neutral-600">{c.activeJobs}</td>
                        <td className="py-2.5 text-right text-neutral-600">{c.applications}</td>
                        <td className="py-2.5 text-right text-neutral-600">{c.hired}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      ) : tab === 'postings' ? (
        <div className="bg-white rounded-2xl border border-neutral-200">
          <div className="p-4 border-b border-neutral-100">
            <p className="text-sm text-neutral-500">{postingsMeta.total || 0} total postings</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-neutral-500 border-b border-neutral-100">
                  <th className="text-left px-4 py-3 font-medium">Title</th>
                  <th className="text-left px-4 py-3 font-medium">Clinic</th>
                  <th className="text-left px-4 py-3 font-medium">Status</th>
                  <th className="text-right px-4 py-3 font-medium">Applicants</th>
                  <th className="text-right px-4 py-3 font-medium">Views</th>
                  <th className="text-left px-4 py-3 font-medium">Published</th>
                </tr>
              </thead>
              <tbody>
                {postings.map((job) => {
                  const style = STATUS_STYLES[job.status] || STATUS_STYLES.draft;
                  return (
                    <tr key={job._id} className="border-b border-neutral-50 hover:bg-neutral-50">
                      <td className="px-4 py-3">
                        <p className="font-medium text-neutral-900">{job.title}</p>
                        <p className="text-xs text-neutral-400">{job.department}</p>
                      </td>
                      <td className="px-4 py-3 text-neutral-600">{job.clinicName}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${style.bg} ${style.text}`}>
                          {job.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-neutral-600">{job.stats?.applications || 0}</td>
                      <td className="px-4 py-3 text-right text-neutral-600">{job.stats?.views || 0}</td>
                      <td className="px-4 py-3 text-neutral-500">
                        {job.publishedAt ? new Date(job.publishedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                      </td>
                    </tr>
                  );
                })}
                {postings.length === 0 && (
                  <tr><td colSpan={6} className="text-center py-10 text-neutral-400">No postings found</td></tr>
                )}
              </tbody>
            </table>
          </div>
          {totalPostingsPages > 1 && (
            <div className="flex items-center justify-center gap-2 p-4 border-t border-neutral-100">
              <button disabled={postingsPage <= 1} onClick={() => setPostingsPage((p) => p - 1)} className="p-1.5 rounded-lg border border-neutral-200 disabled:opacity-50">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-sm text-neutral-600">Page {postingsPage} of {totalPostingsPages}</span>
              <button disabled={postingsPage >= totalPostingsPages} onClick={() => setPostingsPage((p) => p + 1)} className="p-1.5 rounded-lg border border-neutral-200 disabled:opacity-50">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      ) : (
        /* Credits tab */
        <div className="space-y-6">
          {/* Clinic Wallets Table */}
          <div className="bg-white rounded-2xl border border-neutral-200">
            <div className="p-4 border-b border-neutral-100 flex items-center justify-between">
              <h3 className="text-base font-semibold text-neutral-900">Clinic Credit Wallets</h3>
              <span className="text-sm text-neutral-500">{walletsMeta.total || wallets.length} wallets</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-neutral-500 border-b border-neutral-100">
                    <th className="text-left px-4 py-3 font-medium">Clinic</th>
                    <th className="text-right px-4 py-3 font-medium">Balance</th>
                    <th className="text-right px-4 py-3 font-medium">Purchased</th>
                    <th className="text-right px-4 py-3 font-medium">Consumed</th>
                    <th className="text-center px-4 py-3 font-medium">Portal</th>
                    <th className="text-left px-4 py-3 font-medium">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {wallets.map((w) => (
                    <tr key={w._id} className="border-b border-neutral-50 hover:bg-neutral-50">
                      <td className="px-4 py-3">
                        <button
                          onClick={() => navigate(`/platform/tenants/${w.clinicSlug}`)}
                          className="font-medium text-indigo-600 hover:underline"
                        >
                          {w.clinicName}
                        </button>
                        <p className="text-xs text-neutral-400">{w.clinicSlug}</p>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-neutral-900">{w.balance}</td>
                      <td className="px-4 py-3 text-right text-neutral-600">{w.totalPurchased}</td>
                      <td className="px-4 py-3 text-right text-neutral-600">{w.totalConsumed}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${w.jobPortalEnabled ? 'bg-emerald-50 text-emerald-700' : 'bg-neutral-100 text-neutral-500'}`}>
                          {w.jobPortalEnabled ? 'Active' : 'Off'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => { setTab('credits'); setAdjustForm((f) => ({ ...f, slug: w.clinicSlug })); }}
                          className="text-xs text-indigo-600 hover:underline"
                        >
                          Adjust
                        </button>
                      </td>
                    </tr>
                  ))}
                  {wallets.length === 0 && (
                    <tr><td colSpan={6} className="text-center py-10 text-neutral-400">No wallets found</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Quick Adjust Credits */}
          <div className="bg-white rounded-2xl border border-neutral-200 p-6">
            <h3 className="text-base font-semibold text-neutral-900 mb-4">Adjust Clinic Credits</h3>
            <form onSubmit={handleAdjust} className="flex flex-wrap items-end gap-4">
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">Clinic Slug</label>
                <input
                  type="text"
                  required
                  value={adjustForm.slug}
                  onChange={(e) => setAdjustForm((f) => ({ ...f, slug: e.target.value }))}
                  className="px-3 py-2 border border-neutral-200 rounded-xl text-sm w-48"
                  placeholder="demo-clinic"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">Amount</label>
                <input
                  type="number"
                  required
                  value={adjustForm.amount}
                  onChange={(e) => setAdjustForm((f) => ({ ...f, amount: e.target.value }))}
                  className="px-3 py-2 border border-neutral-200 rounded-xl text-sm w-32"
                  placeholder="5 or -2"
                />
              </div>
              <div className="flex-1 min-w-[200px]">
                <label className="block text-sm font-medium text-neutral-700 mb-1">Reason</label>
                <input
                  type="text"
                  required
                  value={adjustForm.description}
                  onChange={(e) => setAdjustForm((f) => ({ ...f, description: e.target.value }))}
                  className="w-full px-3 py-2 border border-neutral-200 rounded-xl text-sm"
                  placeholder="Admin adjustment — reason"
                />
              </div>
              <button
                type="submit"
                disabled={adjustLoading}
                className="px-5 py-2 bg-indigo-600 text-white font-medium rounded-xl text-sm hover:bg-indigo-700 disabled:opacity-50"
              >
                {adjustLoading ? 'Adjusting...' : 'Adjust'}
              </button>
            </form>
            {adjustMsg && (
              <p className={`mt-3 text-sm ${adjustMsg.includes('success') ? 'text-emerald-600' : 'text-red-600'}`}>{adjustMsg}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
