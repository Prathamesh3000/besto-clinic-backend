import { useState, useEffect } from 'react';
import { listPlans, createPlan, updatePlan, deletePlan } from '../api';
import { Modal, EmptyState, Spinner, TabBar } from '../components/shared';
import { Plus, Edit2, Trash2, Check, X as XIcon, LayoutGrid, Table } from 'lucide-react';

const emptyPlan = {
  name: '', slug: '', description: '', tier: 'standard',
  pricing: { monthly: 0, yearly: 0, currency: 'INR' },
  features: {
    maxDoctors: 1, maxStaff: 5, maxBranches: 1, maxStorageMB: 500,
    smsEnabled: false, teleHealthEnabled: false, customBranding: false,
    apiAccess: false, prioritySupport: false, advancedReports: false,
    jobPortalEnabled: false, jobPostingCredits: 0,
  },
  addOns: { storage: { pricePerUnit: 0, unitSizeMB: 100, maxUnits: 10 }, doctors: { pricePerDoctor: 0, maxAdditional: 10 } },
  trial: { enabled: true, durationDays: 14 },
  displayOrder: 0, isPublic: true, highlights: [], badge: '',
};

const BOOL_FEATURES = ['smsEnabled', 'teleHealthEnabled', 'customBranding', 'apiAccess', 'prioritySupport', 'advancedReports', 'jobPortalEnabled'];
const NUM_FEATURES = ['maxDoctors', 'maxStaff', 'maxBranches', 'maxStorageMB', 'jobPostingCredits'];
const ALL_FEATURES = [...NUM_FEATURES, ...BOOL_FEATURES];

function featureLabel(key) {
  return key.replace(/([A-Z])/g, ' $1').replace(/^max /, '').replace(/^is |^has /i, '').trim();
}

const inputClasses = "input-base";
const inputSmClasses = "w-20 px-2 py-1 border border-neutral-300 rounded-lg bg-neutral-50 text-right text-sm";

export default function Plans() {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({ ...emptyPlan });
  const [view, setView] = useState('cards');

  const fetchPlans = () => {
    setLoading(true);
    listPlans({})
      .then((res) => setPlans(Array.isArray(res.data) ? res.data : res.data?.items || []))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchPlans(); }, []);

  const openCreate = () => {
    setEditId(null);
    setForm(JSON.parse(JSON.stringify(emptyPlan)));
    setShowForm(true);
  };

  const openEdit = (plan) => {
    setEditId(plan._id);
    setForm({
      name: plan.name, slug: plan.slug, description: plan.description || '', tier: plan.tier || 'standard',
      pricing: { monthly: plan.pricing?.monthly || 0, yearly: plan.pricing?.yearly || 0, currency: plan.pricing?.currency || 'INR' },
      features: { ...emptyPlan.features, ...plan.features },
      addOns: {
        storage: { ...emptyPlan.addOns.storage, ...plan.addOns?.storage },
        doctors: { ...emptyPlan.addOns.doctors, ...plan.addOns?.doctors },
      },
      trial: { enabled: plan.trial?.enabled ?? true, durationDays: plan.trial?.durationDays || 14 },
      displayOrder: plan.displayOrder || 0, isPublic: plan.isPublic ?? true,
      highlights: plan.highlights || [], badge: plan.badge || '',
    });
    setShowForm(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editId) await updatePlan(editId, form);
      else await createPlan(form);
      setShowForm(false);
      fetchPlans();
    } catch { /* handled */ }
  };

  const handleDelete = async (id) => {
    if (!confirm('Deactivate this plan?')) return;
    await deletePlan(id);
    fetchPlans();
  };

  const activePlans = plans.filter((p) => p.isActive !== false);

  if (loading) return <Spinner />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold font-display text-neutral-900">Plan Management</h2>
        <div className="flex gap-2">
          <div className="flex bg-neutral-200 rounded-xl p-0.5">
            <button onClick={() => setView('cards')} className={`p-1.5 rounded-lg transition ${view === 'cards' ? 'bg-white shadow-sm' : 'text-neutral-900/40'}`}>
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button onClick={() => setView('compare')} className={`p-1.5 rounded-lg transition ${view === 'compare' ? 'bg-white shadow-sm' : 'text-neutral-900/40'}`}>
              <Table className="h-4 w-4" />
            </button>
          </div>
          <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-primary-500 to-primary-600 text-white text-sm rounded-xl hover:from-primary-600 hover:to-primary-700 transition-all duration-300 shadow-md shadow-primary-600/20">
            <Plus className="h-4 w-4" /> New Plan
          </button>
        </div>
      </div>

      {plans.length === 0 ? (
        <EmptyState title="No plans yet" message="Create your first plan to get started" />
      ) : view === 'cards' ? (
        /* Card View */
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {plans.map((plan) => (
            <div key={plan._id} className={`bg-white rounded-2xl border p-5 relative ${!plan.isActive ? 'opacity-50' : 'border-neutral-300/60'}`}>
              {plan.badge && (
                <span className="absolute top-3 right-3 text-xs bg-primary-100 text-primary-700 px-2 py-0.5 rounded-full">{plan.badge}</span>
              )}
              <h3 className="font-semibold font-display text-neutral-900 text-lg">{plan.name}</h3>
              <p className="text-xs text-neutral-900/40 font-mono">{plan.slug}</p>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-2xl font-bold text-neutral-900">₹{(plan.pricing?.monthly || 0).toLocaleString()}</span>
                <span className="text-sm text-neutral-900/40">/mo</span>
              </div>
              <p className="text-sm text-neutral-900/50 mt-1">₹{(plan.pricing?.yearly || 0).toLocaleString()}/yr</p>
              {plan.description && <p className="text-xs text-neutral-900/40 mt-2">{plan.description}</p>}
              <div className="mt-4 text-xs text-neutral-900/50 space-y-1">
                <p>Doctors: {plan.features?.maxDoctors} | Staff: {plan.features?.maxStaff} | Branches: {plan.features?.maxBranches}</p>
                <p>Storage: {plan.features?.maxStorageMB}MB</p>
                <div className="flex flex-wrap gap-1 mt-2">
                  {BOOL_FEATURES.filter((k) => plan.features?.[k]).map((k) => (
                    <span key={k} className="bg-emerald-50 text-emerald-700 text-[10px] px-1.5 py-0.5 rounded">{featureLabel(k)}</span>
                  ))}
                </div>
                <p className="mt-1">Trial: {plan.trial?.enabled ? `${plan.trial.durationDays} days` : 'None'}</p>
              </div>
              <div className="mt-4 pt-3 border-t border-neutral-300/40 flex gap-3">
                <button onClick={() => openEdit(plan)} className="flex items-center gap-1 text-sm text-primary-600 hover:text-primary-700">
                  <Edit2 className="h-3.5 w-3.5" /> Edit
                </button>
                {plan.isActive && (
                  <button onClick={() => handleDelete(plan._id)} className="flex items-center gap-1 text-sm text-red-600 hover:text-red-700">
                    <Trash2 className="h-3.5 w-3.5" /> Deactivate
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* Comparison Table View */
        <div className="bg-white rounded-2xl border border-neutral-300/60 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-300/60">
                <th className="text-left px-4 py-3 font-semibold text-neutral-900 sticky left-0 bg-white min-w-[160px]">Feature</th>
                {activePlans.map((p) => (
                  <th key={p._id} className="text-center px-4 py-3 font-semibold text-neutral-900 min-w-[140px]">
                    <div>{p.name}</div>
                    {p.badge && <span className="text-[10px] bg-primary-100 text-primary-700 px-1.5 py-0.5 rounded-full font-normal">{p.badge}</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {/* Pricing */}
              <tr className="border-b border-neutral-300/30 bg-neutral-100/50">
                <td className="px-4 py-2.5 font-medium text-neutral-900/70 sticky left-0 bg-neutral-100/50">Monthly Price</td>
                {activePlans.map((p) => (
                  <td key={p._id} className="px-4 py-2.5 text-center font-semibold">₹{(p.pricing?.monthly || 0).toLocaleString()}</td>
                ))}
              </tr>
              <tr className="border-b border-neutral-300/30">
                <td className="px-4 py-2.5 font-medium text-neutral-900/70 sticky left-0 bg-white">Yearly Price</td>
                {activePlans.map((p) => (
                  <td key={p._id} className="px-4 py-2.5 text-center">₹{(p.pricing?.yearly || 0).toLocaleString()}</td>
                ))}
              </tr>
              {/* Numeric features */}
              {NUM_FEATURES.map((key) => (
                <tr key={key} className="border-b border-neutral-300/30">
                  <td className="px-4 py-2.5 text-neutral-900/70 capitalize sticky left-0 bg-white">{featureLabel(key)}</td>
                  {activePlans.map((p) => (
                    <td key={p._id} className="px-4 py-2.5 text-center">{p.features?.[key] || 0}</td>
                  ))}
                </tr>
              ))}
              {/* Boolean features */}
              {BOOL_FEATURES.map((key) => (
                <tr key={key} className="border-b border-neutral-300/30">
                  <td className="px-4 py-2.5 text-neutral-900/70 capitalize sticky left-0 bg-white">{featureLabel(key)}</td>
                  {activePlans.map((p) => (
                    <td key={p._id} className="px-4 py-2.5 text-center">
                      {p.features?.[key] ? (
                        <Check className="h-4 w-4 text-emerald-500 mx-auto" />
                      ) : (
                        <XIcon className="h-4 w-4 text-neutral-400 mx-auto" />
                      )}
                    </td>
                  ))}
                </tr>
              ))}
              {/* Trial */}
              <tr className="border-b border-neutral-300/30 bg-neutral-100/50">
                <td className="px-4 py-2.5 font-medium text-neutral-900/70 sticky left-0 bg-neutral-100/50">Trial Period</td>
                {activePlans.map((p) => (
                  <td key={p._id} className="px-4 py-2.5 text-center">
                    {p.trial?.enabled ? `${p.trial.durationDays} days` : '—'}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Create/Edit Modal */}
      <Modal open={showForm} onClose={() => setShowForm(false)} title={editId ? 'Edit Plan' : 'Create Plan'} wide>
        <form onSubmit={handleSubmit} className="space-y-4 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-neutral-900/60 mb-1">Name</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required className={inputClasses} />
            </div>
            <div>
              <label className="block text-neutral-900/60 mb-1">Slug</label>
              <input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} required disabled={!!editId} className={`${inputClasses} disabled:bg-neutral-200 disabled:opacity-60`} />
            </div>
          </div>

          <div>
            <label className="block text-neutral-900/60 mb-1">Description</label>
            <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} className={inputClasses} />
          </div>

          {/* Pricing */}
          <div>
            <label className="block text-neutral-900/70 font-medium mb-2">Pricing</label>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-neutral-900/50 text-xs mb-1">Monthly</label>
                <input type="number" value={form.pricing.monthly} onChange={(e) => setForm({ ...form, pricing: { ...form.pricing, monthly: +e.target.value } })} className={inputClasses} />
              </div>
              <div>
                <label className="block text-neutral-900/50 text-xs mb-1">Yearly</label>
                <input type="number" value={form.pricing.yearly} onChange={(e) => setForm({ ...form, pricing: { ...form.pricing, yearly: +e.target.value } })} className={inputClasses} />
              </div>
              <div>
                <label className="block text-neutral-900/50 text-xs mb-1">Currency</label>
                <input value={form.pricing.currency} onChange={(e) => setForm({ ...form, pricing: { ...form.pricing, currency: e.target.value } })} className={inputClasses} />
              </div>
            </div>
          </div>

          {/* Features */}
          <div>
            <label className="block text-neutral-900/70 font-medium mb-2">Features</label>
            <div className="grid grid-cols-2 gap-2">
              {NUM_FEATURES.map((k) => (
                <div key={k} className="flex items-center justify-between">
                  <span className="text-neutral-900/50 capitalize">{featureLabel(k)}</span>
                  <input type="number" value={form.features[k] || 0} onChange={(e) => setForm({ ...form, features: { ...form.features, [k]: +e.target.value } })} className={inputSmClasses} />
                </div>
              ))}
              {BOOL_FEATURES.map((k) => (
                <div key={k} className="flex items-center justify-between">
                  <span className="text-neutral-900/50 capitalize">{featureLabel(k)}</span>
                  <button type="button" onClick={() => setForm({ ...form, features: { ...form.features, [k]: !form.features[k] } })}
                    className={`w-10 h-5 rounded-full relative transition-colors ${form.features[k] ? 'bg-emerald-500' : 'bg-neutral-400'}`}>
                    <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${form.features[k] ? 'translate-x-5' : ''}`} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Add-on Pricing */}
          <div>
            <label className="block text-neutral-900/70 font-medium mb-2">Add-on Pricing</label>
            <div className="grid grid-cols-2 gap-4">
              <div className="border border-neutral-300/60 rounded-2xl p-3 space-y-2">
                <p className="text-xs font-medium text-neutral-900/70">Storage Add-on</p>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-neutral-900/50">Price/unit</span>
                  <input type="number" value={form.addOns.storage.pricePerUnit} onChange={(e) => setForm({ ...form, addOns: { ...form.addOns, storage: { ...form.addOns.storage, pricePerUnit: +e.target.value } } })} className={inputSmClasses} />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-neutral-900/50">Unit size (MB)</span>
                  <input type="number" value={form.addOns.storage.unitSizeMB} onChange={(e) => setForm({ ...form, addOns: { ...form.addOns, storage: { ...form.addOns.storage, unitSizeMB: +e.target.value } } })} className={inputSmClasses} />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-neutral-900/50">Max units</span>
                  <input type="number" value={form.addOns.storage.maxUnits} onChange={(e) => setForm({ ...form, addOns: { ...form.addOns, storage: { ...form.addOns.storage, maxUnits: +e.target.value } } })} className={inputSmClasses} />
                </div>
              </div>
              <div className="border border-neutral-300/60 rounded-2xl p-3 space-y-2">
                <p className="text-xs font-medium text-neutral-900/70">Doctor Add-on</p>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-neutral-900/50">Price/doctor</span>
                  <input type="number" value={form.addOns.doctors.pricePerDoctor} onChange={(e) => setForm({ ...form, addOns: { ...form.addOns, doctors: { ...form.addOns.doctors, pricePerDoctor: +e.target.value } } })} className={inputSmClasses} />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-neutral-900/50">Max additional</span>
                  <input type="number" value={form.addOns.doctors.maxAdditional} onChange={(e) => setForm({ ...form, addOns: { ...form.addOns, doctors: { ...form.addOns.doctors, maxAdditional: +e.target.value } } })} className={inputSmClasses} />
                </div>
              </div>
            </div>
          </div>

          {/* Trial + Badge */}
          <div className="grid grid-cols-3 gap-3">
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setForm({ ...form, trial: { ...form.trial, enabled: !form.trial.enabled } })}
                className={`w-10 h-5 rounded-full relative transition-colors ${form.trial.enabled ? 'bg-primary-500' : 'bg-neutral-400'}`}>
                <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${form.trial.enabled ? 'translate-x-5' : ''}`} />
              </button>
              <span className="text-neutral-900/60 text-xs">Trial</span>
            </div>
            <div>
              <label className="block text-neutral-900/50 text-xs mb-1">Trial Days</label>
              <input type="number" value={form.trial.durationDays} onChange={(e) => setForm({ ...form, trial: { ...form.trial, durationDays: +e.target.value } })} className={inputClasses} />
            </div>
            <div>
              <label className="block text-neutral-900/50 text-xs mb-1">Badge</label>
              <input value={form.badge} onChange={(e) => setForm({ ...form, badge: e.target.value })} placeholder="e.g. Popular" className={inputClasses} />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-neutral-300/40">
            <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-neutral-900/70 bg-neutral-200 rounded-xl hover:bg-neutral-300 transition">Cancel</button>
            <button type="submit" className="px-4 py-2 bg-gradient-to-r from-primary-500 to-primary-600 text-white rounded-xl hover:from-primary-600 hover:to-primary-700 transition-all duration-300 shadow-md shadow-primary-600/20">{editId ? 'Update' : 'Create'}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
