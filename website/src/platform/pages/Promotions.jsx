import { useState, useEffect } from 'react';
import {
  listPromotions, createPromotion, updatePromotion, deletePromotion,
  listRebates, createRebate, updateRebate, deleteRebate,
  getPromotionAnalytics,
} from '../api';
import { StatCard, Modal, TabBar, DataTable, EmptyState, Spinner } from '../components/shared';
import { Plus, Edit2, Trash2, Gift, Percent, TrendingUp } from 'lucide-react';

const TYPE_LABELS = { loyalty: 'Loyalty', volume: 'Volume', referral: 'Referral', annual_commitment: 'Annual' };

export default function Promotions() {
  const [tab, setTab] = useState('promotions');
  const [promos, setPromos] = useState([]);
  const [rebates, setRebates] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);

  // Promo form
  const [promoModal, setPromoModal] = useState(false);
  const [promoEditId, setPromoEditId] = useState(null);
  const [promoForm, setPromoForm] = useState(defaultPromo());

  // Rebate form
  const [rebateModal, setRebateModal] = useState(false);
  const [rebateEditId, setRebateEditId] = useState(null);
  const [rebateForm, setRebateForm] = useState(defaultRebate());

  function defaultPromo() {
    return {
      code: '', name: '', description: '', discountType: 'percentage',
      discountValue: 10, durationMonths: 1,
      startsAt: new Date().toISOString().slice(0, 16),
      expiresAt: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 16),
      maxRedemptions: '', maxPerClinic: 1, isActive: true,
      applicableBillingCycles: ['monthly', 'yearly'],
    };
  }

  function defaultRebate() {
    return {
      name: '', description: '', type: 'loyalty', discountType: 'percentage',
      discountValue: 5, conditions: { minSubscriptionMonths: 0, minDoctors: 0, requiresYearlyBilling: false },
      stackable: false, priority: 0, isActive: true,
    };
  }

  const fetchAll = () => {
    setLoading(true);
    Promise.all([
      listPromotions({}),
      listRebates({}),
      getPromotionAnalytics().catch(() => ({ data: null })),
    ])
      .then(([pRes, rRes, aRes]) => {
        setPromos(Array.isArray(pRes.data) ? pRes.data : pRes.data?.items || []);
        setRebates(Array.isArray(rRes.data) ? rRes.data : rRes.data?.items || []);
        setAnalytics(aRes.data);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchAll(); }, []);

  // ─── Promo CRUD ─────────────────────────────
  const openCreatePromo = () => { setPromoEditId(null); setPromoForm(defaultPromo()); setPromoModal(true); };

  const openEditPromo = (p) => {
    setPromoEditId(p._id);
    setPromoForm({
      code: p.code, name: p.name, description: p.description || '',
      discountType: p.discountType, discountValue: p.discountValue,
      durationMonths: p.durationMonths,
      startsAt: p.startsAt?.slice(0, 16) || '',
      expiresAt: p.expiresAt?.slice(0, 16) || '',
      maxRedemptions: p.maxRedemptions || '',
      maxPerClinic: p.maxPerClinic, isActive: p.isActive,
      applicableBillingCycles: p.applicableBillingCycles || ['monthly', 'yearly'],
    });
    setPromoModal(true);
  };

  const handlePromoSubmit = async (e) => {
    e.preventDefault();
    const payload = {
      ...promoForm,
      maxRedemptions: promoForm.maxRedemptions ? Number(promoForm.maxRedemptions) : null,
      startsAt: new Date(promoForm.startsAt).toISOString(),
      expiresAt: new Date(promoForm.expiresAt).toISOString(),
    };
    try {
      promoEditId ? await updatePromotion(promoEditId, payload) : await createPromotion(payload);
      setPromoModal(false);
      fetchAll();
    } catch { /* handled */ }
  };

  const handleDeletePromo = async (id) => {
    if (!confirm('Deactivate this promotion?')) return;
    await deletePromotion(id);
    fetchAll();
  };

  // ─── Rebate CRUD ────────────────────────────
  const openCreateRebate = () => { setRebateEditId(null); setRebateForm(defaultRebate()); setRebateModal(true); };

  const openEditRebate = (r) => {
    setRebateEditId(r._id);
    setRebateForm({
      name: r.name, description: r.description || '', type: r.type,
      discountType: r.discountType, discountValue: r.discountValue,
      conditions: { ...defaultRebate().conditions, ...r.conditions },
      stackable: r.stackable, priority: r.priority, isActive: r.isActive,
    });
    setRebateModal(true);
  };

  const handleRebateSubmit = async (e) => {
    e.preventDefault();
    try {
      rebateEditId ? await updateRebate(rebateEditId, rebateForm) : await createRebate(rebateForm);
      setRebateModal(false);
      fetchAll();
    } catch { /* handled */ }
  };

  const handleDeleteRebate = async (id) => {
    if (!confirm('Deactivate this rebate?')) return;
    await deleteRebate(id);
    fetchAll();
  };

  if (loading) return <Spinner />;

  const activePromos = promos.filter((p) => p.isActive).length;
  const totalRedemptions = promos.reduce((s, p) => s + (p.currentRedemptions || 0), 0);

  const promoColumns = [
    { key: 'code', label: 'Code', render: (r) => <span className="font-mono font-medium text-sm">{r.code}</span> },
    { key: 'name', label: 'Name' },
    {
      key: 'discount', label: 'Discount', render: (r) => (
        <span>
          {r.discountType === 'percentage' ? `${r.discountValue}%` : `₹${r.discountValue}`}
          <span className="text-neutral-900/40 ml-1 text-xs">for {r.durationMonths}mo</span>
        </span>
      ),
    },
    {
      key: 'redemptions', label: 'Redemptions', render: (r) => {
        const pct = r.maxRedemptions ? ((r.currentRedemptions || 0) / r.maxRedemptions) * 100 : 0;
        return (
          <div className="flex items-center gap-2">
            <span className="text-sm">{r.currentRedemptions || 0}{r.maxRedemptions ? `/${r.maxRedemptions}` : ''}</span>
            {r.maxRedemptions && (
              <div className="w-16 bg-neutral-100 rounded-full h-1.5">
                <div className="bg-primary-500 h-1.5 rounded-full" style={{ width: `${Math.min(pct, 100)}%` }} />
              </div>
            )}
          </div>
        );
      },
    },
    {
      key: 'expires', label: 'Expires', render: (r) => {
        if (!r.expiresAt) return '—';
        const d = new Date(r.expiresAt);
        const daysLeft = Math.ceil((d - Date.now()) / 86400000);
        return (
          <span className={daysLeft < 7 ? 'text-red-600' : 'text-neutral-900/50'}>
            {d.toLocaleDateString()} {daysLeft > 0 ? `(${daysLeft}d)` : '(expired)'}
          </span>
        );
      },
    },
    {
      key: 'status', label: 'Status', render: (r) => (
        <span className={`text-xs px-2 py-1 rounded-full font-medium ${r.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-neutral-100 text-neutral-900/50'}`}>
          {r.isActive ? 'Active' : 'Inactive'}
        </span>
      ),
    },
    {
      key: 'actions', label: '', render: (r) => (
        <div className="flex gap-2 justify-end">
          <button onClick={(e) => { e.stopPropagation(); openEditPromo(r); }} className="text-primary-600 hover:text-primary-700"><Edit2 className="h-4 w-4" /></button>
          {r.isActive && (
            <button onClick={(e) => { e.stopPropagation(); handleDeletePromo(r._id); }} className="text-red-600 hover:text-red-700"><Trash2 className="h-4 w-4" /></button>
          )}
        </div>
      ),
    },
  ];

  const tabs = [
    { key: 'promotions', label: 'Promotions' },
    { key: 'rebates', label: 'Rebates' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold font-display text-neutral-900">Promotions & Rebates</h2>
        <div className="flex gap-2">
          <button onClick={openCreatePromo} className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white text-sm rounded-lg hover:bg-primary-700 transition">
            <Plus className="h-4 w-4" /> New Promotion
          </button>
          <button onClick={openCreateRebate} className="flex items-center gap-2 px-4 py-2 bg-white border border-neutral-300/60 text-neutral-900/70 text-sm rounded-lg hover:bg-neutral-50 transition">
            <Plus className="h-4 w-4" /> New Rebate
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard icon={Gift} title="Active Promos" value={activePromos} color="primary" />
        <StatCard icon={Percent} title="Total Redemptions" value={totalRedemptions} color="green" />
        <StatCard icon={TrendingUp} title="Est. Revenue Impact" value={`₹${(analytics?.totalEstimatedImpact || 0).toLocaleString('en-IN')}`} color="purple" subtitle="Monthly discount value" />
      </div>

      <TabBar tabs={tabs} active={tab} onChange={setTab} />

      {/* Promotions Tab */}
      {tab === 'promotions' && (
        <div className="bg-white rounded-2xl border border-neutral-300/60 overflow-hidden">
          {promos.length === 0 ? (
            <EmptyState icon={Gift} title="No promotions" message="Create your first promotion to get started" />
          ) : (
            <DataTable columns={promoColumns} data={promos} />
          )}
        </div>
      )}

      {/* Rebates Tab */}
      {tab === 'rebates' && (
        <div className="space-y-4">
          {rebates.length === 0 ? (
            <EmptyState title="No rebates" message="Create a rebate rule to get started" />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {rebates.map((r) => (
                <div key={r._id} className={`bg-white rounded-2xl border p-5 ${!r.isActive ? 'opacity-50' : 'border-neutral-300/60'}`}>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold font-display text-neutral-900">{r.name}</h3>
                    <span className="text-xs bg-purple-50 text-purple-700 px-2 py-0.5 rounded-full">{TYPE_LABELS[r.type] || r.type}</span>
                  </div>
                  {r.description && <p className="text-sm text-neutral-900/50 mb-3">{r.description}</p>}
                  <div className="text-sm">
                    <span className="font-medium">{r.discountType === 'percentage' ? `${r.discountValue}% off` : `₹${r.discountValue} off`}</span>
                    {r.conditions?.minSubscriptionMonths > 0 && <span className="text-neutral-900/40 ml-2">after {r.conditions.minSubscriptionMonths} months</span>}
                    {r.stackable && <span className="ml-2 text-xs bg-neutral-100 px-1.5 py-0.5 rounded">Stackable</span>}
                  </div>
                  <div className="mt-3 pt-3 border-t border-neutral-300/30 flex gap-3">
                    <button onClick={() => openEditRebate(r)} className="text-sm text-primary-600 hover:text-primary-700 flex items-center gap-1"><Edit2 className="h-3.5 w-3.5" /> Edit</button>
                    {r.isActive && <button onClick={() => handleDeleteRebate(r._id)} className="text-sm text-red-600 hover:text-red-700 flex items-center gap-1"><Trash2 className="h-3.5 w-3.5" /> Deactivate</button>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Promo Modal */}
      <Modal open={promoModal} onClose={() => setPromoModal(false)} title={promoEditId ? 'Edit Promotion' : 'Create Promotion'} wide>
        <form onSubmit={handlePromoSubmit} className="space-y-4 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-neutral-900/60 mb-1">Code</label>
              <input value={promoForm.code} onChange={(e) => setPromoForm({ ...promoForm, code: e.target.value.toUpperCase() })} required disabled={!!promoEditId} className="w-full px-3 py-2 border border-neutral-300 rounded-lg disabled:bg-neutral-50 font-mono" />
            </div>
            <div>
              <label className="block text-neutral-900/60 mb-1">Name</label>
              <input value={promoForm.name} onChange={(e) => setPromoForm({ ...promoForm, name: e.target.value })} required className="w-full px-3 py-2 border border-neutral-300 rounded-lg" />
            </div>
          </div>
          <div>
            <label className="block text-neutral-900/60 mb-1">Description</label>
            <textarea value={promoForm.description} onChange={(e) => setPromoForm({ ...promoForm, description: e.target.value })} rows={2} className="w-full px-3 py-2 border border-neutral-300 rounded-lg" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-neutral-900/60 mb-1">Discount Type</label>
              <select value={promoForm.discountType} onChange={(e) => setPromoForm({ ...promoForm, discountType: e.target.value })} className="w-full px-3 py-2 border border-neutral-300 rounded-lg">
                <option value="percentage">Percentage</option>
                <option value="flat">Flat Amount</option>
              </select>
            </div>
            <div>
              <label className="block text-neutral-900/60 mb-1">Value</label>
              <input type="number" value={promoForm.discountValue} onChange={(e) => setPromoForm({ ...promoForm, discountValue: +e.target.value })} className="w-full px-3 py-2 border border-neutral-300 rounded-lg" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-neutral-900/60 mb-1">Starts</label>
              <input type="datetime-local" value={promoForm.startsAt} onChange={(e) => setPromoForm({ ...promoForm, startsAt: e.target.value })} required className="w-full px-3 py-2 border border-neutral-300 rounded-lg" />
            </div>
            <div>
              <label className="block text-neutral-900/60 mb-1">Expires</label>
              <input type="datetime-local" value={promoForm.expiresAt} onChange={(e) => setPromoForm({ ...promoForm, expiresAt: e.target.value })} required className="w-full px-3 py-2 border border-neutral-300 rounded-lg" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-neutral-900/60 mb-1">Duration (mo)</label>
              <input type="number" value={promoForm.durationMonths} onChange={(e) => setPromoForm({ ...promoForm, durationMonths: +e.target.value })} min="1" className="w-full px-3 py-2 border border-neutral-300 rounded-lg" />
            </div>
            <div>
              <label className="block text-neutral-900/60 mb-1">Max Uses</label>
              <input type="number" value={promoForm.maxRedemptions} onChange={(e) => setPromoForm({ ...promoForm, maxRedemptions: e.target.value })} placeholder="Unlimited" className="w-full px-3 py-2 border border-neutral-300 rounded-lg" />
            </div>
            <div>
              <label className="block text-neutral-900/60 mb-1">Per Clinic</label>
              <input type="number" value={promoForm.maxPerClinic} onChange={(e) => setPromoForm({ ...promoForm, maxPerClinic: +e.target.value })} min="1" className="w-full px-3 py-2 border border-neutral-300 rounded-lg" />
            </div>
          </div>
          <div>
            <label className="block text-neutral-900/60 mb-1">Applicable Billing Cycles</label>
            <div className="flex gap-3">
              {['monthly', 'yearly'].map((c) => (
                <label key={c} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={promoForm.applicableBillingCycles.includes(c)}
                    onChange={() => {
                      const cycles = promoForm.applicableBillingCycles.includes(c)
                        ? promoForm.applicableBillingCycles.filter((x) => x !== c)
                        : [...promoForm.applicableBillingCycles, c];
                      setPromoForm({ ...promoForm, applicableBillingCycles: cycles });
                    }}
                    className="rounded"
                  />
                  <span className="capitalize">{c}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-3 border-t border-neutral-300/30">
            <button type="button" onClick={() => setPromoModal(false)} className="px-4 py-2 text-neutral-900/70 bg-neutral-100 rounded-lg hover:bg-neutral-200 transition">Cancel</button>
            <button type="submit" className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition">{promoEditId ? 'Update' : 'Create'}</button>
          </div>
        </form>
      </Modal>

      {/* Rebate Modal */}
      <Modal open={rebateModal} onClose={() => setRebateModal(false)} title={rebateEditId ? 'Edit Rebate' : 'Create Rebate'}>
        <form onSubmit={handleRebateSubmit} className="space-y-4 text-sm">
          <div>
            <label className="block text-neutral-900/60 mb-1">Name</label>
            <input value={rebateForm.name} onChange={(e) => setRebateForm({ ...rebateForm, name: e.target.value })} required className="w-full px-3 py-2 border border-neutral-300 rounded-lg" />
          </div>
          <div>
            <label className="block text-neutral-900/60 mb-1">Description</label>
            <textarea value={rebateForm.description} onChange={(e) => setRebateForm({ ...rebateForm, description: e.target.value })} rows={2} className="w-full px-3 py-2 border border-neutral-300 rounded-lg" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-neutral-900/60 mb-1">Type</label>
              <select value={rebateForm.type} onChange={(e) => setRebateForm({ ...rebateForm, type: e.target.value })} className="w-full px-3 py-2 border border-neutral-300 rounded-lg">
                <option value="loyalty">Loyalty</option>
                <option value="volume">Volume</option>
                <option value="referral">Referral</option>
                <option value="annual_commitment">Annual Commitment</option>
              </select>
            </div>
            <div>
              <label className="block text-neutral-900/60 mb-1">Discount Type</label>
              <select value={rebateForm.discountType} onChange={(e) => setRebateForm({ ...rebateForm, discountType: e.target.value })} className="w-full px-3 py-2 border border-neutral-300 rounded-lg">
                <option value="percentage">Percentage</option>
                <option value="flat">Flat</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-neutral-900/60 mb-1">Value</label>
              <input type="number" value={rebateForm.discountValue} onChange={(e) => setRebateForm({ ...rebateForm, discountValue: +e.target.value })} className="w-full px-3 py-2 border border-neutral-300 rounded-lg" />
            </div>
            <div>
              <label className="block text-neutral-900/60 mb-1">Min Months</label>
              <input type="number" value={rebateForm.conditions.minSubscriptionMonths} onChange={(e) => setRebateForm({ ...rebateForm, conditions: { ...rebateForm.conditions, minSubscriptionMonths: +e.target.value } })} className="w-full px-3 py-2 border border-neutral-300 rounded-lg" />
            </div>
          </div>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={rebateForm.stackable} onChange={() => setRebateForm({ ...rebateForm, stackable: !rebateForm.stackable })} className="rounded" />
              <span className="text-neutral-900/60">Stackable</span>
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={rebateForm.conditions.requiresYearlyBilling} onChange={() => setRebateForm({ ...rebateForm, conditions: { ...rebateForm.conditions, requiresYearlyBilling: !rebateForm.conditions.requiresYearlyBilling } })} className="rounded" />
              <span className="text-neutral-900/60">Yearly Only</span>
            </label>
          </div>
          <div className="flex justify-end gap-3 pt-3 border-t border-neutral-300/30">
            <button type="button" onClick={() => setRebateModal(false)} className="px-4 py-2 text-neutral-900/70 bg-neutral-100 rounded-lg hover:bg-neutral-200 transition">Cancel</button>
            <button type="submit" className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition">{rebateEditId ? 'Update' : 'Create'}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
