import { useState, useEffect } from 'react';
import { listSubscriptions, getExpiringTrials, extendTrial } from '../api';
import { Clock, AlertTriangle } from 'lucide-react';

export default function Subscriptions() {
  const [subs, setSubs] = useState([]);
  const [expiring, setExpiring] = useState([]);
  const [meta, setMeta] = useState({});
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('all');
  const [page, setPage] = useState(1);

  const fetchSubs = () => {
    setLoading(true);
    const status = tab === 'all' ? undefined : tab;
    listSubscriptions({ status, page, limit: 20 })
      .then((res) => { setSubs(res.data); setMeta(res.meta || {}); })
      .finally(() => setLoading(false));
  };

  const fetchExpiring = () => {
    getExpiringTrials(7).then((res) => setExpiring(res.data || [])).catch(() => {});
  };

  useEffect(() => { fetchSubs(); }, [tab, page]);
  useEffect(() => { fetchExpiring(); }, []);

  const handleExtend = async (id) => {
    const days = prompt('Additional trial days:', '7');
    if (!days) return;
    try {
      await extendTrial(id, parseInt(days, 10));
      fetchSubs();
      fetchExpiring();
    } catch { /* handled */ }
  };

  const statusBadge = (status) => {
    const map = {
      active: 'bg-emerald-50 text-emerald-700',
      trial: 'bg-amber-50 text-amber-700',
      past_due: 'bg-red-50 text-red-700',
      suspended: 'bg-red-100 text-red-800',
      cancelled: 'bg-neutral-100 text-neutral-900/60',
    };
    return map[status] || 'bg-neutral-100 text-neutral-900/60';
  };

  const tabs = ['all', 'trial', 'active', 'past_due', 'suspended', 'cancelled'];

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold font-display text-neutral-900">Subscription Management</h2>

      {/* Expiring trials warning */}
      {expiring.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            <h3 className="font-semibold font-display text-amber-800">Expiring Trials ({expiring.length})</h3>
          </div>
          <div className="space-y-2">
            {expiring.slice(0, 5).map((sub) => (
              <div key={sub._id} className="flex items-center justify-between text-sm">
                <div>
                  <span className="font-medium text-neutral-900">{sub.clinic?.name || 'Unknown'}</span>
                  <span className="text-neutral-900/40 ml-2">expires {new Date(sub.trialEnd).toLocaleDateString()}</span>
                </div>
                <button onClick={() => handleExtend(sub._id)} className="text-primary-600 hover:text-primary-700 text-sm font-medium">
                  Extend
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-neutral-100 rounded-lg p-1 w-fit">
        {tabs.map((t) => (
          <button
            key={t}
            onClick={() => { setTab(t); setPage(1); }}
            className={`px-3 py-1.5 text-sm rounded-md capitalize transition-colors ${
              tab === t ? 'bg-white text-neutral-900 font-medium shadow-sm' : 'text-neutral-900/50 hover:text-neutral-900/70'
            }`}
          >
            {t === 'all' ? 'All' : t.replace('_', ' ')}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-neutral-300/60 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 border-b border-neutral-300/60">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-neutral-900/60">Clinic</th>
              <th className="text-left px-4 py-3 font-medium text-neutral-900/60">Plan</th>
              <th className="text-left px-4 py-3 font-medium text-neutral-900/60">Status</th>
              <th className="text-left px-4 py-3 font-medium text-neutral-900/60">Billing</th>
              <th className="text-left px-4 py-3 font-medium text-neutral-900/60">Amount</th>
              <th className="text-left px-4 py-3 font-medium text-neutral-900/60">Period End</th>
              <th className="text-right px-4 py-3 font-medium text-neutral-900/60">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="7" className="text-center py-10 text-neutral-900/40">Loading...</td></tr>
            ) : subs.length === 0 ? (
              <tr><td colSpan="7" className="text-center py-10 text-neutral-900/40">No subscriptions found</td></tr>
            ) : subs.map((s) => (
              <tr key={s._id} className="border-b border-neutral-300/30 hover:bg-neutral-50/50">
                <td className="px-4 py-3 font-medium">{s.clinic?.name || 'N/A'}</td>
                <td className="px-4 py-3 capitalize">{s.plan}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${statusBadge(s.status)}`}>
                    {s.status}
                  </span>
                </td>
                <td className="px-4 py-3 capitalize">{s.billingCycle}</td>
                <td className="px-4 py-3">{s.currency} {s.amount?.toLocaleString()}</td>
                <td className="px-4 py-3 text-neutral-900/50">
                  {s.currentPeriodEnd ? new Date(s.currentPeriodEnd).toLocaleDateString() : 'N/A'}
                </td>
                <td className="px-4 py-3 text-right">
                  {s.status === 'trial' && (
                    <button onClick={() => handleExtend(s._id)} className="text-primary-600 hover:text-primary-700 text-sm flex items-center gap-1 ml-auto">
                      <Clock className="h-3.5 w-3.5" /> Extend
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {meta.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-neutral-300/60">
            <span className="text-sm text-neutral-900/50">Page {meta.page} of {meta.totalPages}</span>
            <div className="flex gap-2">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={!meta.hasPrevPage} className="px-3 py-1 text-sm border rounded-lg disabled:opacity-40 hover:bg-neutral-50">Prev</button>
              <button onClick={() => setPage((p) => p + 1)} disabled={!meta.hasNextPage} className="px-3 py-1 text-sm border rounded-lg disabled:opacity-40 hover:bg-neutral-50">Next</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
