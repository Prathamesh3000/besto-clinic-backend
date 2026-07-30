import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPlan, createCustomPlan, listTenants } from '../api';
import { Modal, Spinner } from '../components/shared';
import { Save, Eye, Check, Plus, Trash2, Search } from 'lucide-react';

const BOOL_FEATURES = [
  { key: 'smsEnabled', label: 'SMS Notifications' },
  { key: 'teleHealthEnabled', label: 'TeleHealth' },
  { key: 'customBranding', label: 'Custom Branding' },
  { key: 'apiAccess', label: 'API Access' },
  { key: 'prioritySupport', label: 'Priority Support' },
  { key: 'advancedReports', label: 'Advanced Reports' },
  { key: 'jobPortalEnabled', label: 'Job Portal' },
];

const NUM_FEATURES = [
  { key: 'maxDoctors', label: 'Max Doctors', min: 1, max: 100 },
  { key: 'maxStaff', label: 'Max Staff', min: 1, max: 500 },
  { key: 'maxBranches', label: 'Max Branches', min: 1, max: 50 },
  { key: 'maxStorageMB', label: 'Storage (MB)', min: 100, max: 50000 },
  { key: 'jobPostingCredits', label: 'Job Portal Credits/mo', min: 0, max: 100 },
];

function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export default function CustomPlanBuilder() {
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState({ text: '', type: 'success' });
  const [targetClinic, setTargetClinic] = useState('');
  const [clinicSearch, setClinicSearch] = useState('');
  const [clinicResults, setClinicResults] = useState([]);
  const [searching, setSearching] = useState(false);

  const [plan, setPlan] = useState({
    name: '', slug: '', description: '', tier: 'standard', badge: '',
    pricing: { monthly: 0, yearly: 0, currency: 'INR' },
    features: {
      maxDoctors: 5, maxStaff: 10, maxBranches: 1, maxStorageMB: 1000,
      smsEnabled: false, teleHealthEnabled: false, customBranding: false,
      apiAccess: false, prioritySupport: false, advancedReports: false,
      jobPortalEnabled: false, jobPostingCredits: 0,
    },
    addOns: {
      storage: { pricePerUnit: 50, unitSizeMB: 500, maxUnits: 10 },
      doctors: { pricePerDoctor: 200, maxAdditional: 20 },
    },
    modules: [],
    trial: { enabled: true, durationDays: 14 },
    isPublic: true,
  });

  const updatePlan = (path, value) => {
    setPlan((prev) => {
      const copy = JSON.parse(JSON.stringify(prev));
      const parts = path.split('.');
      let obj = copy;
      for (let i = 0; i < parts.length - 1; i++) obj = obj[parts[i]];
      obj[parts[parts.length - 1]] = value;
      return copy;
    });
  };

  const handleNameChange = (name) => {
    setPlan((prev) => ({ ...prev, name, slug: slugify(name) }));
  };

  const addModule = () => {
    setPlan((prev) => ({
      ...prev,
      modules: [...prev.modules, { name: '', key: '', featureKeys: [], pricing: { monthly: 0, yearly: 0 } }],
    }));
  };

  const updateModule = (idx, field, value) => {
    setPlan((prev) => {
      const modules = [...prev.modules];
      modules[idx] = { ...modules[idx], [field]: value };
      return { ...prev, modules };
    });
  };

  const removeModule = (idx) => {
    setPlan((prev) => ({ ...prev, modules: prev.modules.filter((_, i) => i !== idx) }));
  };

  const searchClinics = async () => {
    if (!clinicSearch) return;
    setSearching(true);
    try {
      const res = await listTenants({ search: clinicSearch, limit: 5 });
      setClinicResults(Array.isArray(res.data) ? res.data : res.data?.items || []);
    } catch { setClinicResults([]); }
    finally { setSearching(false); }
  };

  const flash = (text, type = 'success') => {
    setMsg({ text, type });
    setTimeout(() => setMsg({ text: '', type: 'success' }), 4000);
  };

  const handleSave = async () => {
    if (!plan.name || !plan.slug) { flash('Name and slug are required', 'error'); return; }
    setSaving(true);
    try {
      if (targetClinic) {
        await createCustomPlan(targetClinic, plan);
        flash(`Custom plan created for ${targetClinic}`);
      } else {
        await createPlan(plan);
        flash('Plan created successfully');
      }
      setTimeout(() => navigate('/platform/plans'), 1500);
    } catch (err) { flash(err.message, 'error'); }
    finally { setSaving(false); }
  };

  const monthlyTotal = plan.pricing.monthly
    + plan.modules.reduce((s, m) => s + (m.pricing?.monthly || 0), 0);
  const yearlyTotal = plan.pricing.yearly
    + plan.modules.reduce((s, m) => s + (m.pricing?.yearly || 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold font-display text-neutral-900">Custom Plan Builder</h2>
        <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white text-sm rounded-lg hover:bg-primary-700 disabled:opacity-50 transition">
          <Save className="h-4 w-4" /> {saving ? 'Saving...' : 'Save Plan'}
        </button>
      </div>

      {msg.text && (
        <div className={`px-4 py-2 rounded-lg text-sm ${msg.type === 'error' ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>
          {msg.text}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Builder */}
        <div className="lg:col-span-2 space-y-6">
          {/* Basics */}
          <div className="bg-white rounded-2xl border border-neutral-300/60 p-6 space-y-4">
            <h3 className="font-semibold font-display text-neutral-900">Plan Basics</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-neutral-900/60 mb-1">Name</label>
                <input value={plan.name} onChange={(e) => handleNameChange(e.target.value)} className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm" placeholder="Enterprise Plus" />
              </div>
              <div>
                <label className="block text-sm text-neutral-900/60 mb-1">Slug</label>
                <input value={plan.slug} onChange={(e) => updatePlan('slug', e.target.value)} className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm font-mono" />
              </div>
              <div className="col-span-2">
                <label className="block text-sm text-neutral-900/60 mb-1">Description</label>
                <textarea value={plan.description} onChange={(e) => updatePlan('description', e.target.value)} rows={2} className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-sm text-neutral-900/60 mb-1">Tier</label>
                <select value={plan.tier} onChange={(e) => updatePlan('tier', e.target.value)} className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm">
                  <option value="basic">Basic</option>
                  <option value="standard">Standard</option>
                  <option value="premium">Premium</option>
                  <option value="enterprise">Enterprise</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-neutral-900/60 mb-1">Badge</label>
                <input value={plan.badge} onChange={(e) => updatePlan('badge', e.target.value)} className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm" placeholder="Most Popular" />
              </div>
            </div>
          </div>

          {/* Pricing */}
          <div className="bg-white rounded-2xl border border-neutral-300/60 p-6 space-y-4">
            <h3 className="font-semibold font-display text-neutral-900">Pricing</h3>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm text-neutral-900/60 mb-1">Monthly (₹)</label>
                <input type="number" value={plan.pricing.monthly} onChange={(e) => updatePlan('pricing.monthly', +e.target.value)} className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-sm text-neutral-900/60 mb-1">Yearly (₹)</label>
                <input type="number" value={plan.pricing.yearly} onChange={(e) => updatePlan('pricing.yearly', +e.target.value)} className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-sm text-neutral-900/60 mb-1">Currency</label>
                <input value={plan.pricing.currency} onChange={(e) => updatePlan('pricing.currency', e.target.value)} className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm" />
              </div>
            </div>
          </div>

          {/* Features */}
          <div className="bg-white rounded-2xl border border-neutral-300/60 p-6 space-y-4">
            <h3 className="font-semibold font-display text-neutral-900">Feature Configuration</h3>
            <div className="space-y-3">
              {NUM_FEATURES.map(({ key, label, min, max }) => (
                <div key={key} className="flex items-center gap-4">
                  <span className="text-sm text-neutral-900/70 w-32">{label}</span>
                  <input
                    type="range"
                    min={min}
                    max={max}
                    value={plan.features[key]}
                    onChange={(e) => updatePlan(`features.${key}`, +e.target.value)}
                    className="flex-1 accent-primary-600"
                  />
                  <input
                    type="number"
                    value={plan.features[key]}
                    onChange={(e) => updatePlan(`features.${key}`, +e.target.value)}
                    className="w-20 px-2 py-1 border border-neutral-300 rounded text-sm text-right"
                  />
                </div>
              ))}
              <div className="grid grid-cols-2 gap-3 pt-2">
                {BOOL_FEATURES.map(({ key, label }) => (
                  <div key={key} className="flex items-center justify-between py-1">
                    <span className="text-sm text-neutral-900/70">{label}</span>
                    <button
                      onClick={() => updatePlan(`features.${key}`, !plan.features[key])}
                      className={`relative w-10 h-5 rounded-full transition-colors ${plan.features[key] ? 'bg-emerald-500' : 'bg-gray-300'}`}
                    >
                      <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${plan.features[key] ? 'translate-x-5' : ''}`} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Add-on Pricing */}
          <div className="bg-white rounded-2xl border border-neutral-300/60 p-6 space-y-4">
            <h3 className="font-semibold font-display text-neutral-900">Add-on Pricing</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="border border-neutral-300/30 rounded-lg p-4 space-y-3">
                <p className="text-sm font-medium text-neutral-900/70">Storage Add-on</p>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-neutral-900/50">₹ per unit</span>
                  <input type="number" value={plan.addOns.storage.pricePerUnit} onChange={(e) => updatePlan('addOns.storage.pricePerUnit', +e.target.value)} className="w-20 px-2 py-1 border rounded text-right text-xs" />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-neutral-900/50">Unit size (MB)</span>
                  <input type="number" value={plan.addOns.storage.unitSizeMB} onChange={(e) => updatePlan('addOns.storage.unitSizeMB', +e.target.value)} className="w-20 px-2 py-1 border rounded text-right text-xs" />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-neutral-900/50">Max units</span>
                  <input type="number" value={plan.addOns.storage.maxUnits} onChange={(e) => updatePlan('addOns.storage.maxUnits', +e.target.value)} className="w-20 px-2 py-1 border rounded text-right text-xs" />
                </div>
              </div>
              <div className="border border-neutral-300/30 rounded-lg p-4 space-y-3">
                <p className="text-sm font-medium text-neutral-900/70">Doctor Add-on</p>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-neutral-900/50">₹ per doctor</span>
                  <input type="number" value={plan.addOns.doctors.pricePerDoctor} onChange={(e) => updatePlan('addOns.doctors.pricePerDoctor', +e.target.value)} className="w-20 px-2 py-1 border rounded text-right text-xs" />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-neutral-900/50">Max additional</span>
                  <input type="number" value={plan.addOns.doctors.maxAdditional} onChange={(e) => updatePlan('addOns.doctors.maxAdditional', +e.target.value)} className="w-20 px-2 py-1 border rounded text-right text-xs" />
                </div>
              </div>
            </div>
          </div>

          {/* Modules */}
          <div className="bg-white rounded-2xl border border-neutral-300/60 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold font-display text-neutral-900">Module Config</h3>
              <button onClick={addModule} className="flex items-center gap-1 text-xs text-primary-600 hover:text-primary-700">
                <Plus className="h-3.5 w-3.5" /> Add Module
              </button>
            </div>
            {plan.modules.length === 0 && (
              <p className="text-sm text-neutral-900/40">No modules added. Click "Add Module" to include optional modules.</p>
            )}
            {plan.modules.map((mod, i) => (
              <div key={i} className="border border-neutral-300/30 rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-neutral-900/50">Module {i + 1}</span>
                  <button onClick={() => removeModule(i)} className="text-red-400 hover:text-red-600">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <input value={mod.name} onChange={(e) => updateModule(i, 'name', e.target.value)} placeholder="Module Name" className="px-3 py-2 border border-neutral-300 rounded-lg text-sm" />
                  <input value={mod.key} onChange={(e) => updateModule(i, 'key', e.target.value)} placeholder="module-key" className="px-3 py-2 border border-neutral-300 rounded-lg text-sm font-mono" />
                  <input type="number" value={mod.pricing?.monthly || 0} onChange={(e) => updateModule(i, 'pricing', { ...mod.pricing, monthly: +e.target.value })} placeholder="Monthly ₹" className="px-3 py-2 border border-neutral-300 rounded-lg text-sm" />
                  <input type="number" value={mod.pricing?.yearly || 0} onChange={(e) => updateModule(i, 'pricing', { ...mod.pricing, yearly: +e.target.value })} placeholder="Yearly ₹" className="px-3 py-2 border border-neutral-300 rounded-lg text-sm" />
                </div>
              </div>
            ))}
          </div>

          {/* Trial + Target */}
          <div className="bg-white rounded-2xl border border-neutral-300/60 p-6 space-y-4">
            <h3 className="font-semibold font-display text-neutral-900">Trial & Assignment</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => updatePlan('trial.enabled', !plan.trial.enabled)}
                  className={`relative w-10 h-5 rounded-full transition-colors ${plan.trial.enabled ? 'bg-primary-500' : 'bg-gray-300'}`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${plan.trial.enabled ? 'translate-x-5' : ''}`} />
                </button>
                <span className="text-sm text-neutral-900/70">Trial Period</span>
              </div>
              {plan.trial.enabled && (
                <div>
                  <label className="block text-xs text-neutral-900/50 mb-1">Duration (days)</label>
                  <input type="number" value={plan.trial.durationDays} onChange={(e) => updatePlan('trial.durationDays', +e.target.value)} className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm" />
                </div>
              )}
            </div>
            <div>
              <label className="block text-sm text-neutral-900/60 mb-1">Target Clinic (optional — for custom plan assignment)</label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-900/40" />
                  <input
                    value={clinicSearch}
                    onChange={(e) => setClinicSearch(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), searchClinics())}
                    placeholder="Search clinic by name..."
                    className="w-full pl-10 pr-4 py-2 border border-neutral-300 rounded-lg text-sm"
                  />
                </div>
                <button onClick={searchClinics} className="px-3 py-2 text-sm bg-neutral-100 text-neutral-900/70 rounded-lg hover:bg-neutral-200 transition">
                  {searching ? '...' : 'Search'}
                </button>
              </div>
              {clinicResults.length > 0 && (
                <div className="mt-2 border border-neutral-300/60 rounded-lg overflow-hidden">
                  {clinicResults.map((c) => (
                    <button
                      key={c._id}
                      onClick={() => { setTargetClinic(c.slug); setClinicSearch(c.name); setClinicResults([]); }}
                      className={`w-full text-left px-3 py-2 text-sm hover:bg-neutral-50 border-b last:border-0 ${targetClinic === c.slug ? 'bg-primary-50' : ''}`}
                    >
                      <span className="font-medium">{c.name}</span>
                      <span className="text-neutral-900/40 ml-2 font-mono text-xs">{c.slug}</span>
                    </button>
                  ))}
                </div>
              )}
              {targetClinic && (
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-xs bg-primary-50 text-primary-700 px-2 py-1 rounded-full">Assigning to: {targetClinic}</span>
                  <button onClick={() => { setTargetClinic(''); setClinicSearch(''); }} className="text-xs text-neutral-900/40 hover:text-neutral-900/60">Clear</button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right: Live Preview */}
        <div className="space-y-4">
          <div className="sticky top-6">
            <div className="bg-white rounded-2xl border border-neutral-300/60 p-5 space-y-4">
              <div className="flex items-center gap-2 text-sm text-neutral-900/50 mb-2">
                <Eye className="h-4 w-4" /> Live Preview
              </div>

              {/* Plan Card Preview */}
              <div className="border-2 border-primary-200 rounded-2xl p-5 bg-gradient-to-b from-primary-50/50 to-white relative">
                {plan.badge && (
                  <span className="absolute top-3 right-3 text-[10px] bg-primary-100 text-primary-700 px-2 py-0.5 rounded-full">{plan.badge}</span>
                )}
                <h4 className="font-bold text-neutral-900 text-lg">{plan.name || 'Plan Name'}</h4>
                <p className="text-xs text-neutral-900/40 font-mono">{plan.slug || 'plan-slug'}</p>
                {plan.description && <p className="text-xs text-neutral-900/50 mt-1">{plan.description}</p>}

                <div className="mt-4 flex items-baseline gap-1">
                  <span className="text-3xl font-bold text-neutral-900">₹{monthlyTotal.toLocaleString()}</span>
                  <span className="text-sm text-neutral-900/40">/mo</span>
                </div>
                <p className="text-xs text-neutral-900/40">₹{yearlyTotal.toLocaleString()}/yr</p>

                <div className="mt-4 space-y-2">
                  {NUM_FEATURES.map(({ key, label }) => (
                    <div key={key} className="flex items-center justify-between text-xs">
                      <span className="text-neutral-900/60">{label}</span>
                      <span className="font-medium">{plan.features[key]}</span>
                    </div>
                  ))}
                  <div className="border-t border-neutral-300/30 pt-2 mt-2">
                    {BOOL_FEATURES.map(({ key, label }) => (
                      <div key={key} className="flex items-center gap-2 text-xs py-0.5">
                        {plan.features[key] ? (
                          <Check className="h-3 w-3 text-emerald-500" />
                        ) : (
                          <span className="h-3 w-3 text-neutral-900/30">—</span>
                        )}
                        <span className={plan.features[key] ? 'text-neutral-900/70' : 'text-neutral-900/40'}>{label}</span>
                      </div>
                    ))}
                  </div>

                  {plan.modules.length > 0 && (
                    <div className="border-t border-neutral-300/30 pt-2 mt-2">
                      <p className="text-[10px] uppercase tracking-wider text-neutral-900/40 mb-1">Modules</p>
                      {plan.modules.map((m, i) => (
                        <p key={i} className="text-xs text-neutral-900/60">+ {m.name || 'Unnamed'} (₹{m.pricing?.monthly || 0}/mo)</p>
                      ))}
                    </div>
                  )}

                  {plan.trial.enabled && (
                    <p className="text-xs text-amber-600 mt-2">{plan.trial.durationDays}-day free trial</p>
                  )}
                </div>
              </div>

              {/* Pricing Summary */}
              <div className="bg-neutral-50 rounded-lg p-3 text-xs space-y-1">
                <p className="font-medium text-neutral-900/70">Pricing Summary</p>
                <div className="flex justify-between"><span className="text-neutral-900/50">Base (monthly)</span><span>₹{plan.pricing.monthly}</span></div>
                {plan.modules.map((m, i) => (
                  <div key={i} className="flex justify-between"><span className="text-neutral-900/50">{m.name || 'Module'}</span><span>₹{m.pricing?.monthly || 0}</span></div>
                ))}
                <div className="border-t border-neutral-300/60 pt-1 mt-1 flex justify-between font-medium">
                  <span>Total Monthly</span><span>₹{monthlyTotal.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-neutral-900/50">
                  <span>Total Yearly</span><span>₹{yearlyTotal.toLocaleString()}</span>
                </div>
                {plan.addOns.doctors.pricePerDoctor > 0 && (
                  <p className="text-neutral-900/40 mt-1">+ ₹{plan.addOns.doctors.pricePerDoctor}/additional doctor</p>
                )}
                {plan.addOns.storage.pricePerUnit > 0 && (
                  <p className="text-neutral-900/40">+ ₹{plan.addOns.storage.pricePerUnit}/{plan.addOns.storage.unitSizeMB}MB storage</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
