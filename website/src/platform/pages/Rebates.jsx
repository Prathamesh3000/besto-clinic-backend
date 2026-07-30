import { useState, useEffect } from 'react';
import { listRebates, createRebate, updateRebate, deleteRebate } from '../api';
import { Modal } from '../components/shared';
import { Plus, Edit2, Trash2 } from 'lucide-react';

export default function Rebates() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({
    name: '', description: '', type: 'loyalty', discountType: 'percentage',
    discountValue: 5, conditions: { minSubscriptionMonths: 0, minDoctors: 0, requiresYearlyBilling: false },
    stackable: false, priority: 0, isActive: true,
  });

  const fetch = () => {
    setLoading(true);
    listRebates({}).then((res) => setItems(res.data)).finally(() => setLoading(false));
  };

  useEffect(() => { fetch(); }, []);

  const openCreate = () => {
    setEditId(null);
    setForm({
      name: '', description: '', type: 'loyalty', discountType: 'percentage',
      discountValue: 5, conditions: { minSubscriptionMonths: 0, minDoctors: 0, requiresYearlyBilling: false },
      stackable: false, priority: 0, isActive: true,
    });
    setShowForm(true);
  };

  const openEdit = (item) => {
    setEditId(item._id);
    setForm({
      name: item.name, description: item.description || '', type: item.type,
      discountType: item.discountType, discountValue: item.discountValue,
      conditions: { ...item.conditions }, stackable: item.stackable,
      priority: item.priority, isActive: item.isActive,
    });
    setShowForm(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      editId ? await updateRebate(editId, form) : await createRebate(form);
      setShowForm(false);
      fetch();
    } catch { /* handled */ }
  };

  const handleDelete = async (id) => {
    if (!confirm('Deactivate this rebate?')) return;
    await deleteRebate(id);
    fetch();
  };

  const typeLabels = { loyalty: 'Loyalty', volume: 'Volume', referral: 'Referral', annual_commitment: 'Annual' };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold font-display text-neutral-900">Rebates</h2>
        <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white text-sm rounded-lg hover:bg-primary-700">
          <Plus className="h-4 w-4" /> New Rebate
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {loading ? (
          <p className="text-neutral-900/40 col-span-full text-center py-10">Loading...</p>
        ) : items.length === 0 ? (
          <p className="text-neutral-900/40 col-span-full text-center py-10">No rebates yet</p>
        ) : items.map((r) => (
          <div key={r._id} className={`bg-white rounded-2xl border p-5 ${!r.isActive ? 'opacity-50' : 'border-neutral-300/60'}`}>
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold font-display text-neutral-900">{r.name}</h3>
              <span className="text-xs bg-purple-50 text-purple-700 px-2 py-0.5 rounded-full">{typeLabels[r.type]}</span>
            </div>
            <p className="text-sm text-neutral-900/50 mb-3">{r.description}</p>
            <div className="text-sm">
              <span className="font-medium">
                {r.discountType === 'percentage' ? `${r.discountValue}% off` : `₹${r.discountValue} off`}
              </span>
              {r.conditions?.minSubscriptionMonths > 0 && (
                <span className="text-neutral-900/40 ml-2">after {r.conditions.minSubscriptionMonths} months</span>
              )}
              {r.stackable && <span className="ml-2 text-xs bg-neutral-100 px-1.5 py-0.5 rounded">Stackable</span>}
            </div>
            <div className="mt-3 flex gap-3">
              <button onClick={() => openEdit(r)} className="text-sm text-primary-600 hover:text-primary-700 flex items-center gap-1">
                <Edit2 className="h-3.5 w-3.5" /> Edit
              </button>
              {r.isActive && (
                <button onClick={() => handleDelete(r._id)} className="text-sm text-red-600 hover:text-red-700 flex items-center gap-1">
                  <Trash2 className="h-3.5 w-3.5" /> Deactivate
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      <Modal open={showForm} onClose={() => setShowForm(false)} title={editId ? 'Edit Rebate' : 'Create Rebate'}>
        <form onSubmit={handleSubmit} className="space-y-3 text-sm">
          <div>
            <label className="block text-neutral-900/60 mb-1">Name</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required className="w-full px-3 py-2 border border-neutral-300 rounded-lg" />
          </div>
          <div>
            <label className="block text-neutral-900/60 mb-1">Type</label>
            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="w-full px-3 py-2 border border-neutral-300 rounded-lg">
              <option value="loyalty">Loyalty</option>
              <option value="volume">Volume</option>
              <option value="referral">Referral</option>
              <option value="annual_commitment">Annual Commitment</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-neutral-900/60 mb-1">Discount Type</label>
              <select value={form.discountType} onChange={(e) => setForm({ ...form, discountType: e.target.value })} className="w-full px-3 py-2 border border-neutral-300 rounded-lg">
                <option value="percentage">Percentage</option>
                <option value="flat">Flat</option>
              </select>
            </div>
            <div>
              <label className="block text-neutral-900/60 mb-1">Value</label>
              <input type="number" value={form.discountValue} onChange={(e) => setForm({ ...form, discountValue: +e.target.value })} className="w-full px-3 py-2 border border-neutral-300 rounded-lg" />
            </div>
          </div>
          <div>
            <label className="block text-neutral-900/60 mb-1">Min Subscription Months</label>
            <input type="number" value={form.conditions.minSubscriptionMonths} onChange={(e) => setForm({ ...form, conditions: { ...form.conditions, minSubscriptionMonths: +e.target.value } })} className="w-full px-3 py-2 border border-neutral-300 rounded-lg" />
          </div>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={form.stackable} onChange={() => setForm({ ...form, stackable: !form.stackable })} className="rounded" />
              <span className="text-neutral-900/60">Stackable</span>
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={form.conditions.requiresYearlyBilling} onChange={() => setForm({ ...form, conditions: { ...form.conditions, requiresYearlyBilling: !form.conditions.requiresYearlyBilling } })} className="rounded" />
              <span className="text-neutral-900/60">Yearly Only</span>
            </label>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 border rounded-lg hover:bg-neutral-50">Cancel</button>
            <button type="submit" className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700">{editId ? 'Update' : 'Create'}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
