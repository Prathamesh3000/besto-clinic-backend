import { useState, useEffect } from 'react';
import {
  listFeatureFlags, createFeatureFlag, updateFeatureFlag,
  setTenantOverride, removeTenantOverride, deleteFeatureFlag, resolveFlags,
} from '../api';
import { Modal, TabBar, EmptyState, Spinner } from '../components/shared';
import { Plus, Settings2, Trash2, Search, ChevronDown, ChevronUp, Eye } from 'lucide-react';

const CATEGORIES = ['all', 'core', 'communication', 'billing', 'clinical', 'integration', 'ui'];

export default function FeatureFlags() {
  const [flags, setFlags] = useState([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState('all');
  const [showCreate, setShowCreate] = useState(false);
  const [expandedFlag, setExpandedFlag] = useState(null);
  const [overrideSlug, setOverrideSlug] = useState('');
  const [overrideValue, setOverrideValue] = useState('');
  const [resolveSlug, setResolveSlug] = useState('');
  const [resolvedFlags, setResolvedFlags] = useState(null);
  const [resolving, setResolving] = useState(false);
  const [form, setForm] = useState({
    key: '', name: '', description: '', valueType: 'boolean', defaultValue: false, category: 'core',
  });

  const fetchFlags = () => {
    setLoading(true);
    listFeatureFlags()
      .then((res) => setFlags(Array.isArray(res.data) ? res.data : []))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchFlags(); }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    let val = form.defaultValue;
    if (form.valueType === 'boolean') val = val === true || val === 'true';
    if (form.valueType === 'number') val = Number(val);
    try {
      await createFeatureFlag({ ...form, defaultValue: val });
      setShowCreate(false);
      fetchFlags();
    } catch { /* handled */ }
  };

  const handleToggle = async (flag) => {
    if (flag.valueType !== 'boolean') return;
    await updateFeatureFlag(flag._id, { defaultValue: !flag.defaultValue });
    fetchFlags();
  };

  const handleDeleteFlag = async (id) => {
    if (!confirm('Delete this feature flag?')) return;
    try {
      await deleteFeatureFlag(id);
      fetchFlags();
    } catch { /* handled */ }
  };

  const handleAddOverride = async (flagId) => {
    if (!overrideSlug) return;
    const flag = flags.find((f) => f._id === flagId);
    let val = overrideValue;
    if (flag?.valueType === 'boolean') val = val === 'true';
    if (flag?.valueType === 'number') val = Number(val);
    try {
      await setTenantOverride({ flagId, clinicSlug: overrideSlug, value: val });
      setOverrideSlug('');
      setOverrideValue('');
      fetchFlags();
    } catch { /* handled */ }
  };

  const handleRemoveOverride = async (flagId, clinicSlug) => {
    try {
      await removeTenantOverride({ flagId, clinicSlug });
      fetchFlags();
    } catch { /* handled */ }
  };

  const handleResolve = async () => {
    if (!resolveSlug) return;
    setResolving(true);
    try {
      const res = await resolveFlags(resolveSlug);
      setResolvedFlags(res.data);
    } catch { setResolvedFlags(null); }
    finally { setResolving(false); }
  };

  const getOverrides = (flag) => {
    if (!flag.tenantOverrides) return [];
    if (flag.tenantOverrides instanceof Map) return Array.from(flag.tenantOverrides.entries());
    if (typeof flag.tenantOverrides === 'object') return Object.entries(flag.tenantOverrides);
    return [];
  };

  const filtered = category === 'all' ? flags : flags.filter((f) => f.category === category);
  const categories = [...new Set(flags.map((f) => f.category))].sort();

  if (loading) return <Spinner />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold font-display text-neutral-900">Feature Flags</h2>
        <button onClick={() => { setForm({ key: '', name: '', description: '', valueType: 'boolean', defaultValue: false, category: 'core' }); setShowCreate(true); }} className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white text-sm rounded-lg hover:bg-primary-700 transition">
          <Plus className="h-4 w-4" /> New Flag
        </button>
      </div>

      {/* Category Tabs */}
      <TabBar
        tabs={CATEGORIES.map((c) => ({ key: c, label: c === 'all' ? 'All' : c.charAt(0).toUpperCase() + c.slice(1) }))}
        active={category}
        onChange={setCategory}
      />

      {/* Resolve for Tenant */}
      <div className="bg-white rounded-2xl border border-neutral-300/60 p-4">
        <div className="flex items-center gap-3">
          <Eye className="h-4 w-4 text-neutral-900/40" />
          <span className="text-sm text-neutral-900/60">Resolve flags for tenant:</span>
          <input
            value={resolveSlug}
            onChange={(e) => setResolveSlug(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleResolve()}
            placeholder="clinic-slug"
            className="px-3 py-1.5 border border-neutral-300 rounded-lg text-sm font-mono flex-1 max-w-xs"
          />
          <button onClick={handleResolve} disabled={resolving} className="px-3 py-1.5 text-xs font-medium bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 transition">
            {resolving ? 'Resolving...' : 'Resolve'}
          </button>
          {resolvedFlags && (
            <button onClick={() => setResolvedFlags(null)} className="text-xs text-neutral-900/40 hover:text-neutral-900/60">Clear</button>
          )}
        </div>
        {resolvedFlags && (
          <div className="mt-3 bg-neutral-50 rounded-lg p-3 max-h-48 overflow-y-auto">
            <p className="text-xs font-medium text-neutral-900/50 mb-2">Resolved values for "{resolveSlug}":</p>
            <div className="grid grid-cols-2 gap-1">
              {Object.entries(resolvedFlags).map(([key, val]) => (
                <div key={key} className="flex items-center justify-between text-xs py-0.5">
                  <span className="font-mono text-neutral-900/60">{key}</span>
                  <span className={`font-medium ${val === true ? 'text-emerald-600' : val === false ? 'text-neutral-900/40' : 'text-neutral-900/70'}`}>
                    {String(val)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Flag List */}
      {filtered.length === 0 ? (
        <EmptyState title="No feature flags" message={category === 'all' ? 'Create your first feature flag' : `No flags in ${category} category`} />
      ) : (
        <div className="bg-white rounded-2xl border border-neutral-300/60 divide-y divide-neutral-300/30">
          {filtered.map((flag) => {
            const overrides = getOverrides(flag);
            const isExpanded = expandedFlag === flag._id;

            return (
              <div key={flag._id}>
                <div className="px-5 py-4 flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-neutral-900">{flag.name}</span>
                      <code className="text-xs bg-neutral-100 px-1.5 py-0.5 rounded text-neutral-900/50">{flag.key}</code>
                      <span className="text-[10px] uppercase tracking-wider text-neutral-900/40 bg-neutral-50 px-1.5 py-0.5 rounded">{flag.valueType}</span>
                      {overrides.length > 0 && (
                        <span className="text-[10px] bg-amber-50 text-amber-600 px-1.5 py-0.5 rounded-full">{overrides.length} override{overrides.length !== 1 ? 's' : ''}</span>
                      )}
                    </div>
                    {flag.description && <p className="text-xs text-neutral-900/40 mt-0.5">{flag.description}</p>}
                  </div>
                  <div className="flex items-center gap-3">
                    {flag.valueType === 'boolean' ? (
                      <button
                        onClick={() => handleToggle(flag)}
                        className={`relative w-10 h-5 rounded-full transition-colors ${flag.defaultValue ? 'bg-emerald-500' : 'bg-gray-300'}`}
                      >
                        <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${flag.defaultValue ? 'translate-x-5' : ''}`} />
                      </button>
                    ) : (
                      <span className="text-sm font-mono bg-neutral-50 px-2 py-1 rounded">{String(flag.defaultValue)}</span>
                    )}
                    <button
                      onClick={() => setExpandedFlag(isExpanded ? null : flag._id)}
                      className="text-neutral-900/40 hover:text-neutral-900/60"
                      title="Overrides"
                    >
                      <Settings2 className="h-4 w-4" />
                    </button>
                    <button onClick={() => handleDeleteFlag(flag._id)} className="text-neutral-900/30 hover:text-red-500" title="Delete">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {/* Expanded Override Panel */}
                {isExpanded && (
                  <div className="px-5 pb-4 bg-neutral-50/50 border-t border-neutral-300/30">
                    <div className="pt-3 space-y-3">
                      {/* Current Overrides */}
                      {overrides.length > 0 && (
                        <div>
                          <p className="text-xs font-medium text-neutral-900/50 mb-2">Current Overrides</p>
                          <div className="space-y-1">
                            {overrides.map(([slug, val]) => (
                              <div key={slug} className="flex items-center justify-between bg-white rounded-lg px-3 py-2 border border-neutral-300/30">
                                <span className="text-xs font-mono text-neutral-900/60">{slug}</span>
                                <div className="flex items-center gap-2">
                                  <span className={`text-xs font-medium ${val === true ? 'text-emerald-600' : val === false ? 'text-red-500' : 'text-neutral-900/70'}`}>
                                    {String(val)}
                                  </span>
                                  <button onClick={() => handleRemoveOverride(flag._id, slug)} className="text-neutral-900/30 hover:text-red-500">
                                    <Trash2 className="h-3 w-3" />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Add Override */}
                      <div>
                        <p className="text-xs font-medium text-neutral-900/50 mb-2">Add Override</p>
                        <div className="flex gap-2">
                          <input
                            value={overrideSlug}
                            onChange={(e) => setOverrideSlug(e.target.value)}
                            placeholder="clinic-slug"
                            className="flex-1 px-3 py-1.5 border border-neutral-300 rounded-lg text-xs font-mono"
                          />
                          {flag.valueType === 'boolean' ? (
                            <select value={overrideValue} onChange={(e) => setOverrideValue(e.target.value)} className="px-3 py-1.5 border border-neutral-300 rounded-lg text-xs">
                              <option value="">Value...</option>
                              <option value="true">true</option>
                              <option value="false">false</option>
                            </select>
                          ) : (
                            <input
                              value={overrideValue}
                              onChange={(e) => setOverrideValue(e.target.value)}
                              placeholder="value"
                              className="w-24 px-3 py-1.5 border border-neutral-300 rounded-lg text-xs"
                            />
                          )}
                          <button
                            onClick={() => handleAddOverride(flag._id)}
                            disabled={!overrideSlug}
                            className="px-3 py-1.5 text-xs font-medium bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 transition"
                          >
                            Add
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Create Flag Modal */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Create Feature Flag">
        <form onSubmit={handleCreate} className="space-y-4 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-neutral-900/60 mb-1">Key</label>
              <input value={form.key} onChange={(e) => setForm({ ...form, key: e.target.value })} required placeholder="camelCaseKey" className="w-full px-3 py-2 border border-neutral-300 rounded-lg font-mono" />
            </div>
            <div>
              <label className="block text-neutral-900/60 mb-1">Name</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required className="w-full px-3 py-2 border border-neutral-300 rounded-lg" />
            </div>
          </div>
          <div>
            <label className="block text-neutral-900/60 mb-1">Description</label>
            <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} className="w-full px-3 py-2 border border-neutral-300 rounded-lg" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-neutral-900/60 mb-1">Type</label>
              <select value={form.valueType} onChange={(e) => setForm({ ...form, valueType: e.target.value })} className="w-full px-3 py-2 border border-neutral-300 rounded-lg">
                <option value="boolean">Boolean</option>
                <option value="number">Number</option>
                <option value="string">String</option>
              </select>
            </div>
            <div>
              <label className="block text-neutral-900/60 mb-1">Default Value</label>
              {form.valueType === 'boolean' ? (
                <select value={String(form.defaultValue)} onChange={(e) => setForm({ ...form, defaultValue: e.target.value })} className="w-full px-3 py-2 border border-neutral-300 rounded-lg">
                  <option value="false">false</option>
                  <option value="true">true</option>
                </select>
              ) : (
                <input value={form.defaultValue} onChange={(e) => setForm({ ...form, defaultValue: e.target.value })} className="w-full px-3 py-2 border border-neutral-300 rounded-lg" />
              )}
            </div>
          </div>
          <div>
            <label className="block text-neutral-900/60 mb-1">Category</label>
            <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="w-full px-3 py-2 border border-neutral-300 rounded-lg">
              {CATEGORIES.filter((c) => c !== 'all').map((c) => (
                <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-3 pt-3 border-t border-neutral-300/30">
            <button type="button" onClick={() => setShowCreate(false)} className="px-4 py-2 text-neutral-900/70 bg-neutral-100 rounded-lg hover:bg-neutral-200 transition">Cancel</button>
            <button type="submit" className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition">Create</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
