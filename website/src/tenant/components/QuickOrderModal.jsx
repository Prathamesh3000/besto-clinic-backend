/**
 * QuickOrderModal — Shared modal for creating urgent purchase orders.
 *
 * Used by InventoryManagement (pre-filled with a specific low-stock item).
 *
 * Props:
 *   open       - Boolean to show/hide
 *   onClose    - Close handler
 *   onCreated  - Callback after successful creation
 *   prefilledItems - Array of { inventoryItemId, itemName, quantity }
 *   branchId   - Pre-selected branch
 *   defaultUrgent - If true, defaults urgency to 'urgent'
 */

import { useState, useEffect } from 'react';
import { listVendors, createPurchaseOrder } from '../api';
import { ShoppingCart, Loader, X, AlertTriangle } from 'lucide-react';

const inputCls = 'w-full px-3.5 py-2.5 text-sm border border-neutral-200 rounded-xl focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none transition-all';
const selectCls = inputCls;
const labelCls = 'block text-xs font-medium text-neutral-500 mb-1.5';
const btnPrimary = 'inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-xl transition-all shadow-[var(--shadow-sm)]';
const btnGhost = 'inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-neutral-600 hover:bg-neutral-100 rounded-xl transition-all';

export default function QuickOrderModal({ open, onClose, onCreated, prefilledItems = [], branchId = '', defaultUrgent = false }) {
  const [vendors, setVendors] = useState([]);
  const [vendorId, setVendorId] = useState('');
  const [urgency, setUrgency] = useState(defaultUrgent ? 'urgent' : 'normal');
  const [expectedDelivery, setExpectedDelivery] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState(prefilledItems.length > 0
    ? prefilledItems.map(i => ({ inventoryItemId: i.inventoryItemId || i.itemId, itemName: i.itemName, quantity: i.quantity || 1, unitPrice: 0 }))
    : [{ inventoryItemId: '', itemName: '', quantity: 1, unitPrice: 0 }]
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    const params = branchId ? { branch: branchId, limit: 100 } : { limit: 100 };
    listVendors(params)
      .then(r => setVendors(r.data || []))
      .catch(() => {});
  }, [open, branchId]);

  // Reset on open
  useEffect(() => {
    if (open) {
      setError('');
      setVendorId('');
      setUrgency(defaultUrgent ? 'urgent' : 'normal');
      setExpectedDelivery('');
      setNotes('');
      setItems(prefilledItems.length > 0
        ? prefilledItems.map(i => ({ inventoryItemId: i.inventoryItemId || i.itemId, itemName: i.itemName, quantity: i.quantity || 1, unitPrice: 0 }))
        : [{ inventoryItemId: '', itemName: '', quantity: 1, unitPrice: 0 }]
      );
    }
  }, [open, prefilledItems, defaultUrgent]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!vendorId) { setError('Select a vendor'); return; }
    const validItems = items.filter(i => i.inventoryItemId);
    if (validItems.length === 0) { setError('At least one item is required'); return; }

    try {
      setSaving(true);
      setError('');
      await createPurchaseOrder({
        vendorId,
        branch: branchId,
        items: validItems,
        urgency,
        expectedDelivery: expectedDelivery || undefined,
        notes: notes || undefined,
      });
      onCreated?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <form onSubmit={handleSubmit}>
          <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-100">
            <div>
              <h2 className="text-lg font-semibold text-neutral-900">Quick Order</h2>
              <p className="text-xs text-neutral-500 mt-0.5">Create a purchase order and notify the vendor</p>
            </div>
            <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-neutral-100"><X className="h-4 w-4" /></button>
          </div>

          <div className="px-6 py-4 space-y-4">
            {error && (
              <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 p-2.5 rounded-lg">
                <AlertTriangle className="h-4 w-4 shrink-0" /> {error}
              </div>
            )}

            {/* Vendor select */}
            <div>
              <label className={labelCls}>Vendor *</label>
              <select value={vendorId} onChange={e => setVendorId(e.target.value)} className={selectCls} required>
                <option value="">Select vendor...</option>
                {vendors.map(v => <option key={v._id} value={v._id}>{v.name}{v.company ? ` (${v.company})` : ''}</option>)}
              </select>
              {vendors.length === 0 && (
                <p className="text-xs text-amber-600 mt-1">No vendors found. Add vendors in Purchase Orders page first.</p>
              )}
            </div>

            {/* Items */}
            <div>
              <label className={labelCls}>Items</label>
              <div className="space-y-2">
                {items.map((item, idx) => (
                  <div key={idx} className="flex items-center gap-2 p-2.5 bg-neutral-50 rounded-xl">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-neutral-800 truncate">{item.itemName || 'Item'}</p>
                    </div>
                    <input
                      type="number"
                      min="1"
                      value={item.quantity}
                      onChange={e => setItems(prev => prev.map((it, i) => i === idx ? { ...it, quantity: parseInt(e.target.value) || 1 } : it))}
                      className={`${inputCls} w-20 text-center`}
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Urgency</label>
                <select value={urgency} onChange={e => setUrgency(e.target.value)} className={selectCls}>
                  <option value="normal">Normal</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>Expected Delivery</label>
                <input type="date" value={expectedDelivery} onChange={e => setExpectedDelivery(e.target.value)} className={inputCls} />
              </div>
            </div>

            <div>
              <label className={labelCls}>Notes</label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} className={`${inputCls} h-16 resize-none`} placeholder="Special instructions..." />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-neutral-100">
            <button type="button" onClick={onClose} className={btnGhost}>Cancel</button>
            <button type="submit" disabled={saving} className={btnPrimary}>
              {saving ? <Loader className="h-4 w-4 animate-spin" /> : <ShoppingCart className="h-4 w-4" />}
              Place Order
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
