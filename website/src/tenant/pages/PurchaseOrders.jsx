/**
 * PurchaseOrders — Vendor management + purchase order tracking.
 *
 * Two-tab layout:
 * - Tab 1: Orders — DataTable of POs with create/status-update modals
 * - Tab 2: Vendors — DataTable of vendors with CRUD modals
 */

import { useState, useEffect, useCallback } from 'react';
import { useTenantAuth } from '../TenantAuthContext';
import { initSocket } from '../../lib/socket';
import {
  listVendors, createVendor, updateVendor, deleteVendor,
  listPurchaseOrders, getPurchaseOrder, createPurchaseOrder, updatePurchaseOrder,
  updatePOStatus, cancelPurchaseOrder,
  listInventory, listBranches, listDoctors, listPatients,
} from '../api';
import {
  ShoppingCart, Plus, Search, Truck, Package, CheckCircle2, XCircle, Clock,
  Building2, User, Phone, Mail, MapPin, Edit3, Trash2, ChevronDown, AlertTriangle,
  Loader, ExternalLink, X, FileText, Eye,
} from 'lucide-react';

const cardCls = 'bg-white rounded-2xl border border-neutral-200 shadow-[var(--shadow-sm)]';
const btnPrimary = 'inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-xl transition-all shadow-[var(--shadow-sm)]';
const btnGhost = 'inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-neutral-600 hover:bg-neutral-100 rounded-xl transition-all';
const inputCls = 'w-full px-3.5 py-2.5 text-sm border border-neutral-200 rounded-xl focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none transition-all';
const labelCls = 'block text-xs font-medium text-neutral-500 mb-1.5';
const selectCls = inputCls;

const STATUS_CONFIG = {
  requested:  { label: 'Requested',  color: 'bg-amber-50 text-amber-700 border-amber-200', icon: Clock },
  confirmed:  { label: 'Confirmed',  color: 'bg-blue-50 text-blue-700 border-blue-200', icon: CheckCircle2 },
  shipped:    { label: 'Shipped',    color: 'bg-indigo-50 text-indigo-700 border-indigo-200', icon: Truck },
  delivered:  { label: 'Delivered',  color: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: Package },
  cancelled:  { label: 'Cancelled',  color: 'bg-red-50 text-red-700 border-red-200', icon: XCircle },
};

const TRANSITIONS = {
  requested: ['confirmed', 'cancelled'],
  confirmed: ['shipped', 'cancelled'],
  shipped:   ['delivered'],
  delivered: [],
  cancelled: [],
};

/* ── StatusBadge ───────────────────────────────── */

function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.requested;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg border ${cfg.color}`}>
      <Icon className="h-3 w-3" />
      {cfg.label}
    </span>
  );
}

/* ── Main Component ────────────────────────────── */

export default function PurchaseOrders() {
  const { user, hasPermission } = useTenantAuth();
  const [tab, setTab] = useState('orders');

  // ── Shared state ──
  const [branches, setBranches] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [doctors, setDoctors] = useState([]);

  // ── Orders state ──
  const [orders, setOrders] = useState([]);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [ordersTotal, setOrdersTotal] = useState(0);
  const [ordersPage, setOrdersPage] = useState(1);
  const [ordersSearch, setOrdersSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // ── Vendors state ──
  const [vendorList, setVendorList] = useState([]);
  const [vendorsLoading, setVendorsLoading] = useState(true);
  const [vendorsTotal, setVendorsTotal] = useState(0);
  const [vendorsPage, setVendorsPage] = useState(1);
  const [vendorsSearch, setVendorsSearch] = useState('');

  // ── Modals ──
  const [createOrderOpen, setCreateOrderOpen] = useState(false);
  const [vendorModalOpen, setVendorModalOpen] = useState(false);
  const [editingVendor, setEditingVendor] = useState(null);
  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [editingOrder, setEditingOrder] = useState(null);
  const [detailOrder, setDetailOrder] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const canCreate = hasPermission('purchaseOrder:create');
  const canUpdate = hasPermission('purchaseOrder:update');
  const canCancel = hasPermission('purchaseOrder:cancel');
  const canManageVendors = hasPermission('vendor:create');

  // ── Data fetching ──

  const fetchOrders = useCallback(async (page = 1) => {
    try {
      setOrdersLoading(true);
      const params = { page, limit: 20 };
      if (ordersSearch) params.search = ordersSearch;
      if (statusFilter) params.status = statusFilter;
      const res = await listPurchaseOrders(params);
      setOrders(res.data || []);
      setOrdersTotal(res.pagination?.total || 0);
    } catch (err) {
      setError(err.message);
    } finally {
      setOrdersLoading(false);
    }
  }, [ordersSearch, statusFilter]);

  const fetchVendors = useCallback(async (page = 1) => {
    try {
      setVendorsLoading(true);
      const params = { page, limit: 20 };
      if (vendorsSearch) params.search = vendorsSearch;
      const res = await listVendors(params);
      setVendorList(res.data || []);
      setVendorsTotal(res.pagination?.total || 0);
    } catch (err) {
      setError(err.message);
    } finally {
      setVendorsLoading(false);
    }
  }, [vendorsSearch]);

  const fetchAllVendors = useCallback(async () => {
    try {
      const res = await listVendors({ limit: 100 });
      setVendors(res.data || []);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { fetchOrders(ordersPage); }, [fetchOrders, ordersPage]);
  useEffect(() => { fetchVendors(vendorsPage); }, [fetchVendors, vendorsPage]);
  useEffect(() => {
    fetchAllVendors();
    listBranches().then(r => setBranches(r.data || [])).catch(() => {});
    listDoctors({ limit: 200 }).then(r => setDoctors(r.data || [])).catch(() => {});
  }, [fetchAllVendors]);

  // ── Socket auto-refresh ──
  useEffect(() => {
    const sock = initSocket();
    if (!sock) return;
    const refresh = () => { fetchOrders(ordersPage); };
    sock.on('purchaseOrder:created', refresh);
    sock.on('purchaseOrder:updated', refresh);
    return () => {
      sock.off('purchaseOrder:created', refresh);
      sock.off('purchaseOrder:updated', refresh);
    };
  }, [fetchOrders, ordersPage]);

  // ── Stat cards ──
  const stats = {
    total: ordersTotal,
    pending: orders.filter(o => ['requested', 'confirmed'].includes(o.status)).length,
    inTransit: orders.filter(o => o.status === 'shipped').length,
    delivered: orders.filter(o => o.status === 'delivered').length,
  };

  // ── Handlers ──

  const handleStatusUpdate = async (orderId, status, note, items) => {
    try {
      setSaving(true);
      const payload = { status, note };
      if (items) payload.items = items;
      await updatePOStatus(orderId, payload);
      setStatusModalOpen(false);
      setSelectedOrder(null);
      fetchOrders(ordersPage);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleCancelOrder = async (orderId) => {
    if (!confirm('Are you sure you want to cancel this order?')) return;
    try {
      await cancelPurchaseOrder(orderId);
      fetchOrders(ordersPage);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDeleteVendor = async (id) => {
    if (!confirm('Delete this vendor? This action cannot be undone.')) return;
    try {
      await deleteVendor(id);
      fetchVendors(vendorsPage);
      fetchAllVendors();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold font-display text-neutral-900">Purchase Orders</h1>
          <p className="text-sm text-neutral-500 mt-0.5">Manage vendors and track material orders</p>
        </div>
        <div className="flex items-center gap-2">
          {canManageVendors && tab === 'vendors' && (
            <button onClick={() => { setEditingVendor(null); setVendorModalOpen(true); }} className={btnPrimary}>
              <Plus className="h-4 w-4" /> Add Vendor
            </button>
          )}
          {canCreate && tab === 'orders' && (
            <button onClick={() => setCreateOrderOpen(true)} className={btnPrimary}>
              <Plus className="h-4 w-4" /> New Order
            </button>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
          <button onClick={() => setError('')} className="ml-auto"><X className="h-4 w-4" /></button>
        </div>
      )}

      {/* Stat Cards */}
      {tab === 'orders' && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'Total Orders', value: stats.total, icon: FileText, color: 'text-primary-600 bg-primary-50' },
            { label: 'Pending', value: stats.pending, icon: Clock, color: 'text-amber-600 bg-amber-50' },
            { label: 'In Transit', value: stats.inTransit, icon: Truck, color: 'text-indigo-600 bg-indigo-50' },
            { label: 'Delivered', value: stats.delivered, icon: Package, color: 'text-emerald-600 bg-emerald-50' },
          ].map(s => (
            <div key={s.label} className={`${cardCls} p-4`}>
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${s.color}`}>
                  <s.icon className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-2xl font-semibold text-neutral-900">{s.value}</p>
                  <p className="text-xs text-neutral-500">{s.label}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-neutral-100 rounded-xl w-fit">
        {['orders', 'vendors'].map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
              tab === t ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500 hover:text-neutral-700'
            }`}
          >
            {t === 'orders' ? 'Orders' : 'Vendors'}
          </button>
        ))}
      </div>

      {/* ── Orders Tab ── */}
      {tab === 'orders' && (
        <div className={`${cardCls} overflow-hidden`}>
          {/* Toolbar */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 border-b border-neutral-100">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
              <input
                type="text"
                placeholder="Search orders..."
                value={ordersSearch}
                onChange={e => { setOrdersSearch(e.target.value); setOrdersPage(1); }}
                className={`${inputCls} pl-9`}
              />
            </div>
            <select
              value={statusFilter}
              onChange={e => { setStatusFilter(e.target.value); setOrdersPage(1); }}
              className={`${selectCls} w-auto min-w-[140px]`}
            >
              <option value="">All Statuses</option>
              {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
          </div>

          {/* Table */}
          {ordersLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader className="h-6 w-6 text-primary-600 animate-spin" />
            </div>
          ) : orders.length === 0 ? (
            <div className="py-16 text-center">
              <ShoppingCart className="h-12 w-12 text-neutral-300 mx-auto mb-3" />
              <p className="text-sm text-neutral-500">No purchase orders found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-neutral-100 bg-neutral-50/50">
                    <th className="px-4 py-3 text-left font-medium text-neutral-500">Order #</th>
                    <th className="px-4 py-3 text-left font-medium text-neutral-500">Vendor</th>
                    <th className="px-4 py-3 text-left font-medium text-neutral-500">Patient</th>
                    <th className="px-4 py-3 text-left font-medium text-neutral-500">Items</th>
                    <th className="px-4 py-3 text-left font-medium text-neutral-500">Total</th>
                    <th className="px-4 py-3 text-left font-medium text-neutral-500">Status</th>
                    <th className="px-4 py-3 text-left font-medium text-neutral-500">Urgency</th>
                    <th className="px-4 py-3 text-left font-medium text-neutral-500">Expected</th>
                    <th className="px-4 py-3 text-right font-medium text-neutral-500">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map(order => (
                    <tr key={order._id} className="border-b border-neutral-50 hover:bg-neutral-50/50 transition-colors">
                      <td className="px-4 py-3">
                        <button
                          onClick={async () => {
                            try {
                              const res = await getPurchaseOrder(order._id);
                              setDetailOrder(res.data);
                            } catch (err) { setError(err.message); }
                          }}
                          className="font-medium text-primary-600 hover:text-primary-700 hover:underline transition-colors"
                        >
                          {order.orderNumber}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-neutral-700">{order.vendor?.name || '—'}</td>
                      <td className="px-4 py-3">
                        {order.patient ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium text-violet-700 bg-violet-50 border border-violet-200 rounded-md">
                            <User className="h-3 w-3" />{order.patient.name}
                          </span>
                        ) : (
                          <span className="text-xs text-neutral-300">General</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-neutral-600">{order.items?.length || 0} items</td>
                      <td className="px-4 py-3 text-neutral-700 font-medium">₹{(order.totalAmount || 0).toLocaleString('en-IN')}</td>
                      <td className="px-4 py-3"><StatusBadge status={order.status} /></td>
                      <td className="px-4 py-3">
                        {order.urgency === 'urgent' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-md">
                            <AlertTriangle className="h-3 w-3" /> Urgent
                          </span>
                        ) : (
                          <span className="text-xs text-neutral-400">Normal</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-neutral-600 text-xs">
                        {order.expectedDelivery ? new Date(order.expectedDelivery).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '—'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {canUpdate && order.status === 'requested' && (
                            <button
                              onClick={() => setEditingOrder(order)}
                              className="px-2.5 py-1.5 text-xs font-medium text-neutral-600 hover:bg-neutral-100 rounded-lg transition-all"
                            >
                              <Edit3 className="h-3 w-3 inline mr-1" />Edit
                            </button>
                          )}
                          {canUpdate && (TRANSITIONS[order.status] || []).length > 0 && (
                            <button
                              onClick={() => { setSelectedOrder(order); setStatusModalOpen(true); }}
                              className="px-2.5 py-1.5 text-xs font-medium text-primary-700 bg-primary-50 hover:bg-primary-100 rounded-lg transition-all"
                            >
                              Update
                            </button>
                          )}
                          {canCancel && order.status !== 'cancelled' && order.status !== 'delivered' && (
                            <button
                              onClick={() => handleCancelOrder(order._id)}
                              className="px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 rounded-lg transition-all"
                            >
                              Cancel
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
          {ordersTotal > 20 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-neutral-100">
              <p className="text-xs text-neutral-500">
                Page {ordersPage} of {Math.ceil(ordersTotal / 20)}
              </p>
              <div className="flex gap-1">
                <button disabled={ordersPage <= 1} onClick={() => setOrdersPage(p => p - 1)} className={btnGhost}>Prev</button>
                <button disabled={ordersPage >= Math.ceil(ordersTotal / 20)} onClick={() => setOrdersPage(p => p + 1)} className={btnGhost}>Next</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Vendors Tab ── */}
      {tab === 'vendors' && (
        <div className={`${cardCls} overflow-hidden`}>
          <div className="flex items-center gap-3 p-4 border-b border-neutral-100">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
              <input
                type="text"
                placeholder="Search vendors..."
                value={vendorsSearch}
                onChange={e => { setVendorsSearch(e.target.value); setVendorsPage(1); }}
                className={`${inputCls} pl-9`}
              />
            </div>
          </div>

          {vendorsLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader className="h-6 w-6 text-primary-600 animate-spin" />
            </div>
          ) : vendorList.length === 0 ? (
            <div className="py-16 text-center">
              <Building2 className="h-12 w-12 text-neutral-300 mx-auto mb-3" />
              <p className="text-sm text-neutral-500">No vendors yet</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
              {vendorList.map(v => (
                <div key={v._id} className="border border-neutral-200 rounded-xl p-4 hover:shadow-sm transition-all">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="text-sm font-semibold text-neutral-900">{v.name}</h3>
                      {v.company && <p className="text-xs text-neutral-500 mt-0.5">{v.company}</p>}
                    </div>
                    {canManageVendors && (
                      <div className="flex items-center gap-1">
                        <button onClick={() => { setEditingVendor(v); setVendorModalOpen(true); }} className="p-1.5 rounded-lg hover:bg-neutral-100 transition-colors">
                          <Edit3 className="h-3.5 w-3.5 text-neutral-500" />
                        </button>
                        <button onClick={() => handleDeleteVendor(v._id)} className="p-1.5 rounded-lg hover:bg-red-50 transition-colors">
                          <Trash2 className="h-3.5 w-3.5 text-red-400" />
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="mt-3 space-y-1.5">
                    {v.email && (
                      <div className="flex items-center gap-2 text-xs text-neutral-600">
                        <Mail className="h-3.5 w-3.5 text-neutral-400" /> {v.email}
                      </div>
                    )}
                    {v.phone && (
                      <div className="flex items-center gap-2 text-xs text-neutral-600">
                        <Phone className="h-3.5 w-3.5 text-neutral-400" /> {v.phone}
                      </div>
                    )}
                    {v.city && (
                      <div className="flex items-center gap-2 text-xs text-neutral-600">
                        <MapPin className="h-3.5 w-3.5 text-neutral-400" /> {v.city}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {vendorsTotal > 20 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-neutral-100">
              <p className="text-xs text-neutral-500">Page {vendorsPage} of {Math.ceil(vendorsTotal / 20)}</p>
              <div className="flex gap-1">
                <button disabled={vendorsPage <= 1} onClick={() => setVendorsPage(p => p - 1)} className={btnGhost}>Prev</button>
                <button disabled={vendorsPage >= Math.ceil(vendorsTotal / 20)} onClick={() => setVendorsPage(p => p + 1)} className={btnGhost}>Next</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Create Order Modal ── */}
      {createOrderOpen && (
        <CreateOrderModal
          vendors={vendors}
          branches={branches}
          doctors={doctors}
          onClose={() => setCreateOrderOpen(false)}
          onCreated={() => { setCreateOrderOpen(false); fetchOrders(ordersPage); fetchAllVendors(); }}
        />
      )}

      {/* ── Vendor Create/Edit Modal ── */}
      {vendorModalOpen && (
        <VendorModal
          vendor={editingVendor}
          branches={branches}
          onClose={() => { setVendorModalOpen(false); setEditingVendor(null); }}
          onSaved={() => { setVendorModalOpen(false); setEditingVendor(null); fetchVendors(vendorsPage); fetchAllVendors(); }}
        />
      )}

      {/* ── Status Update Modal ── */}
      {statusModalOpen && selectedOrder && (
        <StatusUpdateModal
          order={selectedOrder}
          saving={saving}
          onUpdate={handleStatusUpdate}
          onClose={() => { setStatusModalOpen(false); setSelectedOrder(null); }}
        />
      )}

      {/* ── Edit Order Modal ── */}
      {editingOrder && (
        <CreateOrderModal
          vendors={vendors}
          branches={branches}
          doctors={doctors}
          editOrder={editingOrder}
          onClose={() => setEditingOrder(null)}
          onCreated={() => { setEditingOrder(null); fetchOrders(ordersPage); }}
        />
      )}

      {/* ── Order Detail Modal ── */}
      {detailOrder && (
        <OrderDetailModal
          order={detailOrder}
          onClose={() => setDetailOrder(null)}
        />
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════
   Sub-Components (Modals)
   ══════════════════════════════════════════════════ */

function ModalOverlay({ children, onClose, wide }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className={`bg-white rounded-2xl shadow-xl w-full ${wide ? 'max-w-2xl' : 'max-w-lg'} max-h-[90vh] overflow-y-auto`} onClick={e => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

/* ── Create Order Modal ── */

function CreateOrderModal({ vendors, branches, doctors, onClose, onCreated, editOrder }) {
  const isEdit = !!editOrder;
  const [form, setForm] = useState({
    vendorId: editOrder?.vendor?._id || editOrder?.vendor || '',
    branch: editOrder?.branch?._id || editOrder?.branch || (branches.length === 1 ? branches[0]._id : ''),
    urgency: editOrder?.urgency || 'normal',
    expectedDelivery: editOrder?.expectedDelivery ? new Date(editOrder.expectedDelivery).toISOString().split('T')[0] : '',
    notes: editOrder?.notes || '',
    requestedBy: editOrder?.requestedBy?._id || editOrder?.requestedBy || '',
    patient: editOrder?.patient?._id || editOrder?.patient || '',
  });
  const [items, setItems] = useState(
    editOrder?.items?.length > 0
      ? editOrder.items.map(i => ({
          inventoryItemId: i.inventoryItem?._id || i.inventoryItem,
          itemName: i.itemName,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
        }))
      : [{ inventoryItemId: '', itemName: '', quantity: 1, unitPrice: 0 }],
  );
  const [inventoryItems, setInventoryItems] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Patient search
  const [patientQuery, setPatientQuery] = useState('');
  const [patientResults, setPatientResults] = useState([]);
  const [patientLoading, setPatientLoading] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState(editOrder?.patient?._id ? editOrder.patient : null);

  useEffect(() => {
    if (form.branch) {
      listInventory({ branch: form.branch, limit: 200 })
        .then(r => setInventoryItems(r.data || []))
        .catch(() => setInventoryItems([]));
    } else {
      setInventoryItems([]);
    }
  }, [form.branch]);

  // Debounced patient search
  useEffect(() => {
    if (!patientQuery.trim() || patientQuery.trim().length < 2) { setPatientResults([]); return; }
    setPatientLoading(true);
    const t = setTimeout(() => {
      listPatients({ search: patientQuery.trim(), limit: 10 })
        .then(r => setPatientResults(r.data || []))
        .catch(() => setPatientResults([]))
        .finally(() => setPatientLoading(false));
    }, 400);
    return () => { clearTimeout(t); setPatientLoading(false); };
  }, [patientQuery]);

  const addItem = () => setItems(prev => [...prev, { inventoryItemId: '', itemName: '', quantity: 1, unitPrice: 0 }]);
  const removeItem = (idx) => setItems(prev => prev.filter((_, i) => i !== idx));
  const updateItem = (idx, field, value) => {
    setItems(prev => prev.map((item, i) => {
      if (i !== idx) return item;
      const updated = { ...item, [field]: value };
      if (field === 'inventoryItemId') {
        const inv = inventoryItems.find(it => it._id === value);
        if (inv) {
          updated.itemName = inv.name;
          updated.unitPrice = inv.costPerUnit || 0;
        }
      }
      return updated;
    }));
  };

  const totalAmount = items.reduce((sum, i) => sum + (i.quantity * i.unitPrice), 0);
  const selectedVendor = vendors.find(v => v._id === form.vendorId);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.vendorId || !form.branch) { setError('Vendor and branch are required'); return; }
    if (!items.some(i => i.inventoryItemId)) { setError('Add at least one item'); return; }

    try {
      setSaving(true);
      setError('');
      const payload = { ...form, patient: form.patient || null, items: items.filter(i => i.inventoryItemId) };
      if (isEdit) {
        await updatePurchaseOrder(editOrder._id, payload);
      } else {
        await createPurchaseOrder(payload);
      }
      onCreated();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalOverlay onClose={onClose} wide>
      <form onSubmit={handleSubmit}>
        {/* Header */}
        <div className="px-7 py-5 border-b border-neutral-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary-50 flex items-center justify-center">
                <FileText className="h-5 w-5 text-primary-600" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-neutral-900">{isEdit ? 'Edit Purchase Order' : 'New Purchase Order'}</h2>
                <p className="text-xs text-neutral-400 mt-0.5">{isEdit ? 'Update order details — only editable while in requested status' : 'Fill in order details and add items from your inventory'}</p>
              </div>
            </div>
            <button type="button" onClick={onClose} className="p-2 rounded-xl hover:bg-neutral-100 transition-colors">
              <X className="h-4 w-4 text-neutral-400" />
            </button>
          </div>
        </div>

        <div className="px-7 py-6 space-y-6">
          {error && <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-100 p-3 rounded-xl"><AlertTriangle className="h-4 w-4 shrink-0" />{error}</div>}

          {/* Urgency banner */}
          {form.urgency === 'urgent' && (
            <div className="flex items-center gap-2 px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-700 font-medium">
              <AlertTriangle className="h-4 w-4" /> This order is marked as urgent
            </div>
          )}

          {/* Section: Vendor & Branch */}
          <div>
            <p className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-3">Vendor & Location</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Vendor *</label>
                <select value={form.vendorId} onChange={e => setForm(f => ({ ...f, vendorId: e.target.value }))} className={selectCls} required>
                  <option value="">Select vendor</option>
                  {vendors.map(v => <option key={v._id} value={v._id}>{v.name}{v.company ? ` — ${v.company}` : ''}</option>)}
                </select>
                {selectedVendor && (selectedVendor.phone || selectedVendor.email) && (
                  <p className="text-xs text-neutral-400 mt-1.5 flex items-center gap-3">
                    {selectedVendor.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{selectedVendor.phone}</span>}
                    {selectedVendor.email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{selectedVendor.email}</span>}
                  </p>
                )}
              </div>
              <div>
                <label className={labelCls}>Branch *</label>
                <select value={form.branch} onChange={e => setForm(f => ({ ...f, branch: e.target.value }))} className={selectCls} required>
                  <option value="">Select branch</option>
                  {branches.map(b => <option key={b._id} value={b._id}>{b.name}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* Section: Schedule & Priority */}
          <div>
            <p className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-3">Schedule & Priority</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Expected Delivery</label>
                <input type="date" value={form.expectedDelivery} onChange={e => setForm(f => ({ ...f, expectedDelivery: e.target.value }))} className={inputCls} min={new Date().toISOString().split('T')[0]} />
              </div>
              <div>
                <label className={labelCls}>Urgency</label>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setForm(f => ({ ...f, urgency: 'normal' }))} className={`flex-1 py-2.5 text-sm font-medium rounded-xl border transition-all ${form.urgency === 'normal' ? 'bg-primary-600 text-white border-primary-600' : 'bg-white text-neutral-600 border-neutral-200 hover:bg-neutral-50'}`}>
                    Normal
                  </button>
                  <button type="button" onClick={() => setForm(f => ({ ...f, urgency: 'urgent' }))} className={`flex-1 py-2.5 text-sm font-medium rounded-xl border transition-all ${form.urgency === 'urgent' ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-neutral-600 border-neutral-200 hover:bg-neutral-50'}`}>
                    Urgent
                  </button>
                </div>
              </div>
            </div>
            {doctors.length > 0 && (
              <div className="mt-4">
                <label className={labelCls}>Requested By</label>
                <select value={form.requestedBy} onChange={e => setForm(f => ({ ...f, requestedBy: e.target.value }))} className={selectCls}>
                  <option value="">None — ordered by clinic</option>
                  {doctors.map(d => <option key={d._id} value={d._id}>Dr. {d.name}</option>)}
                </select>
                <p className="text-[11px] text-neutral-400 mt-1">Doctor who requested this order — they'll get status notifications</p>
              </div>
            )}

            {/* Patient (optional) */}
            <div className="mt-4">
              <label className={labelCls}>Patient (optional)</label>
              {selectedPatient ? (
                <div className="flex items-center gap-2 px-3.5 py-2.5 border border-violet-200 bg-violet-50 rounded-xl">
                  <User className="h-4 w-4 text-violet-500" />
                  <span className="text-sm font-medium text-violet-800">{selectedPatient.name}</span>
                  <span className="text-xs text-violet-400">{selectedPatient.patientId}</span>
                  <button type="button" onClick={() => { setSelectedPatient(null); setForm(f => ({ ...f, patient: '' })); setPatientQuery(''); }} className="ml-auto p-1 rounded-lg hover:bg-violet-100 transition-colors">
                    <X className="h-3.5 w-3.5 text-violet-400" />
                  </button>
                </div>
              ) : (
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
                  <input type="text" placeholder="Search patient by name, phone, or ID..." value={patientQuery} onChange={e => setPatientQuery(e.target.value)} className={`${inputCls} pl-9`} />
                  {patientLoading && <Loader className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-300 animate-spin" />}
                </div>
              )}
              {patientQuery.trim().length >= 2 && !selectedPatient && (
                <div className="mt-1.5 border border-neutral-200 rounded-xl max-h-40 overflow-y-auto bg-white shadow-[var(--shadow-sm)]">
                  {patientResults.length === 0 && !patientLoading ? (
                    <p className="text-xs text-neutral-400 p-3 text-center">No patients found</p>
                  ) : (
                    patientResults.map(p => (
                      <button key={p._id} type="button" onClick={() => { setSelectedPatient(p); setForm(f => ({ ...f, patient: p._id })); setPatientQuery(''); setPatientResults([]); }} className="w-full flex items-center gap-3 px-3.5 py-2.5 text-left hover:bg-neutral-50 transition-colors border-b border-neutral-50 last:border-0">
                        <User className="h-4 w-4 text-neutral-400 shrink-0" />
                        <div>
                          <p className="text-sm font-medium text-neutral-800">{p.name}</p>
                          <p className="text-xs text-neutral-400">{p.patientId}{p.phone ? ` · ${p.phone}` : ''}</p>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              )}
              <p className="text-[11px] text-neutral-400 mt-1">For patient-specific items (crowns, implants). Leave empty for general restocking.</p>
            </div>
          </div>

          {/* Section: Order Items */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">Order Items</p>
              <button type="button" onClick={addItem} className="inline-flex items-center gap-1 text-xs font-semibold text-primary-600 hover:text-primary-700 transition-colors">
                <Plus className="h-3.5 w-3.5" /> Add Item
              </button>
            </div>

            {!form.branch && (
              <div className="text-sm text-neutral-400 bg-neutral-50 border border-dashed border-neutral-200 rounded-xl p-4 text-center">
                Select a branch first to load inventory items
              </div>
            )}

            {form.branch && (
              <div className="border border-neutral-200 rounded-xl overflow-hidden">
                {/* Table header */}
                <div className="grid grid-cols-[1fr_80px_100px_36px] gap-3 px-4 py-2.5 bg-neutral-50 border-b border-neutral-100">
                  <span className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">Item</span>
                  <span className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider text-center">Qty</span>
                  <span className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider text-right">Unit Price</span>
                  <span />
                </div>
                {/* Item rows */}
                <div className="divide-y divide-neutral-100">
                  {items.map((item, idx) => (
                    <div key={idx} className="grid grid-cols-[1fr_80px_100px_36px] gap-3 px-4 py-3 items-center hover:bg-neutral-50/50 transition-colors">
                      <select
                        value={item.inventoryItemId}
                        onChange={e => updateItem(idx, 'inventoryItemId', e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none bg-white"
                      >
                        <option value="">Select item...</option>
                        {inventoryItems.map(i => <option key={i._id} value={i._id}>{i.name} ({i.code})</option>)}
                      </select>
                      <input
                        type="number"
                        min="1"
                        value={item.quantity}
                        onChange={e => updateItem(idx, 'quantity', parseInt(e.target.value) || 1)}
                        className="w-full px-2.5 py-2 text-sm text-center border border-neutral-200 rounded-lg focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none"
                      />
                      <div className="relative">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-neutral-400">&#8377;</span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={item.unitPrice}
                          onChange={e => updateItem(idx, 'unitPrice', parseFloat(e.target.value) || 0)}
                          className="w-full pl-6 pr-2.5 py-2 text-sm text-right border border-neutral-200 rounded-lg focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => items.length > 1 && removeItem(idx)}
                        className={`p-1.5 rounded-lg transition-colors ${items.length > 1 ? 'hover:bg-red-50 text-neutral-300 hover:text-red-400' : 'text-neutral-200 cursor-default'}`}
                        disabled={items.length <= 1}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
                {/* Total row */}
                {totalAmount > 0 && (
                  <div className="flex items-center justify-between px-4 py-3 bg-neutral-50 border-t border-neutral-200">
                    <span className="text-sm font-medium text-neutral-500">{items.filter(i => i.inventoryItemId).length} item{items.filter(i => i.inventoryItemId).length !== 1 ? 's' : ''}</span>
                    <span className="text-sm font-semibold text-neutral-900">Total: &#8377;{totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Section: Notes */}
          <div>
            <label className={labelCls}>Notes / Special Instructions</label>
            <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className={`${inputCls} h-20 resize-none`} placeholder="Delivery preferences, packaging notes, etc." />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-7 py-4 border-t border-neutral-100 bg-neutral-50/50">
          <div className="text-xs text-neutral-400">
            {totalAmount > 0 && <span>Order total: <strong className="text-neutral-700">&#8377;{totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong></span>}
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onClose} className={btnGhost}>Cancel</button>
            <button type="submit" disabled={saving} className={btnPrimary}>
              {saving ? <Loader className="h-4 w-4 animate-spin" /> : <ShoppingCart className="h-4 w-4" />}
              {isEdit ? 'Save Changes' : 'Place Order'}
            </button>
          </div>
        </div>
      </form>
    </ModalOverlay>
  );
}

/* ── Vendor Create/Edit Modal ── */

function VendorModal({ vendor, branches, onClose, onSaved }) {
  const [form, setForm] = useState({
    name: vendor?.name || '',
    contactPerson: vendor?.contactPerson || '',
    email: vendor?.email || '',
    phone: vendor?.phone || '',
    company: vendor?.company || '',
    address: vendor?.address || '',
    city: vendor?.city || '',
    gstNumber: vendor?.gstNumber || '',
    notes: vendor?.notes || '',
    branch: vendor?.branch?._id || vendor?.branch || (branches.length === 1 ? branches[0]._id : ''),
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name || !form.branch) { setError('Name and branch are required'); return; }

    try {
      setSaving(true);
      setError('');
      if (vendor?._id) {
        await updateVendor(vendor._id, form);
      } else {
        await createVendor(form);
      }
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const set = (field) => (e) => setForm(f => ({ ...f, [field]: e.target.value }));

  return (
    <ModalOverlay onClose={onClose} wide>
      <form onSubmit={handleSubmit}>
        {/* Header */}
        <div className="px-7 py-5 border-b border-neutral-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary-50 flex items-center justify-center">
                <Building2 className="h-5 w-5 text-primary-600" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-neutral-900">{vendor ? 'Edit Vendor' : 'Add New Vendor'}</h2>
                <p className="text-xs text-neutral-400 mt-0.5">{vendor ? 'Update vendor contact and business details' : 'Add a supplier to your vendor directory'}</p>
              </div>
            </div>
            <button type="button" onClick={onClose} className="p-2 rounded-xl hover:bg-neutral-100 transition-colors">
              <X className="h-4 w-4 text-neutral-400" />
            </button>
          </div>
        </div>

        <div className="px-7 py-6 space-y-6">
          {error && <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-100 p-3 rounded-xl"><AlertTriangle className="h-4 w-4 shrink-0" />{error}</div>}

          {/* Section: Basic Info */}
          <div>
            <p className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-3">Basic Information</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Vendor / Supplier Name *</label>
                <input value={form.name} onChange={set('name')} className={inputCls} placeholder="e.g. MedSupply India" required />
              </div>
              <div>
                <label className={labelCls}>Company Name</label>
                <input value={form.company} onChange={set('company')} className={inputCls} placeholder="Legal entity name" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 mt-4">
              <div>
                <label className={labelCls}>Branch *</label>
                <select value={form.branch} onChange={set('branch')} className={selectCls} required>
                  <option value="">Select branch</option>
                  {branches.map(b => <option key={b._id} value={b._id}>{b.name}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>GST Number</label>
                <input value={form.gstNumber} onChange={set('gstNumber')} className={inputCls} placeholder="e.g. 29ABCDE1234F1Z5" />
              </div>
            </div>
          </div>

          {/* Section: Contact Details */}
          <div>
            <p className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-3">Contact Details</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Contact Person</label>
                <input value={form.contactPerson} onChange={set('contactPerson')} className={inputCls} placeholder="Primary contact name" />
              </div>
              <div>
                <label className={labelCls}>Phone</label>
                <input value={form.phone} onChange={set('phone')} className={inputCls} placeholder="+91 98765 43210" />
              </div>
            </div>
            <div className="mt-4">
              <label className={labelCls}>Email</label>
              <input type="email" value={form.email} onChange={set('email')} className={inputCls} placeholder="vendor@example.com" />
            </div>
          </div>

          {/* Section: Address */}
          <div>
            <p className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-3">Address</p>
            <div className="grid grid-cols-3 gap-4">
              <div className="col-span-2">
                <label className={labelCls}>Street Address</label>
                <input value={form.address} onChange={set('address')} className={inputCls} placeholder="Building, street, area" />
              </div>
              <div>
                <label className={labelCls}>City</label>
                <input value={form.city} onChange={set('city')} className={inputCls} placeholder="City" />
              </div>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className={labelCls}>Notes</label>
            <textarea value={form.notes} onChange={set('notes')} className={`${inputCls} h-20 resize-none`} placeholder="Payment terms, delivery preferences, areas of supply..." />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-7 py-4 border-t border-neutral-100 bg-neutral-50/50">
          <button type="button" onClick={onClose} className={btnGhost}>Cancel</button>
          <button type="submit" disabled={saving} className={btnPrimary}>
            {saving ? <Loader className="h-4 w-4 animate-spin" /> : <Building2 className="h-4 w-4" />}
            {vendor ? 'Save Changes' : 'Add Vendor'}
          </button>
        </div>
      </form>
    </ModalOverlay>
  );
}

/* ── Status Update Modal ── */

function StatusUpdateModal({ order, saving, onUpdate, onClose }) {
  const allowed = TRANSITIONS[order.status] || [];
  const [status, setStatus] = useState(allowed[0] || '');
  const [note, setNote] = useState('');
  const [receivedItems, setReceivedItems] = useState(
    (order.items || []).map(item => ({
      inventoryItemId: item.inventoryItem?._id || item.inventoryItem,
      itemName: item.itemName || item.inventoryItem?.name || 'Unknown',
      orderedQty: item.quantity,
      receivedQty: item.quantity,
    })),
  );

  if (allowed.length === 0) return null;

  const handleConfirm = () => {
    const items = status === 'delivered'
      ? receivedItems.map(i => ({ inventoryItemId: i.inventoryItemId, receivedQty: i.receivedQty }))
      : undefined;
    onUpdate(order._id, status, note, items);
  };

  return (
    <ModalOverlay onClose={onClose}>
      <div className="px-6 py-4 border-b border-neutral-100">
        <h2 className="text-lg font-semibold text-neutral-900">Update Status — {order.orderNumber}</h2>
        <p className="text-sm text-neutral-500 mt-0.5">Current: <StatusBadge status={order.status} /></p>
      </div>
      <div className="px-6 py-4 space-y-4">
        <div>
          <label className={labelCls}>New Status</label>
          <select value={status} onChange={e => setStatus(e.target.value)} className={selectCls}>
            {allowed.map(s => (
              <option key={s} value={s}>{STATUS_CONFIG[s]?.label || s}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>Note (optional)</label>
          <textarea value={note} onChange={e => setNote(e.target.value)} className={`${inputCls} h-20 resize-none`} placeholder="Add a note..." />
        </div>

        {/* Received quantities — only when marking as delivered */}
        {status === 'delivered' && receivedItems.length > 0 && (
          <div>
            <label className={labelCls}>Received Quantities</label>
            <p className="text-xs text-neutral-400 mb-2">Enter how many of each item were actually received.</p>
            <div className="border border-neutral-200 rounded-xl overflow-hidden">
              <div className="grid grid-cols-[1fr_80px_80px] gap-3 px-4 py-2.5 bg-neutral-50 border-b border-neutral-100">
                <span className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">Item</span>
                <span className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider text-center">Ordered</span>
                <span className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider text-center">Received</span>
              </div>
              <div className="divide-y divide-neutral-100">
                {receivedItems.map((item, idx) => (
                  <div key={idx} className="grid grid-cols-[1fr_80px_80px] gap-3 px-4 py-3 items-center">
                    <span className="text-sm text-neutral-700 truncate">{item.itemName}</span>
                    <span className="text-sm text-neutral-500 text-center">{item.orderedQty}</span>
                    <input
                      type="number"
                      min="0"
                      max={item.orderedQty}
                      value={item.receivedQty}
                      onChange={e => {
                        const val = parseInt(e.target.value) || 0;
                        setReceivedItems(prev => prev.map((it, i) =>
                          i === idx ? { ...it, receivedQty: Math.min(val, it.orderedQty) } : it,
                        ));
                      }}
                      className="w-full px-2.5 py-1.5 text-sm text-center border border-neutral-200 rounded-lg focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none"
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
      <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-neutral-100">
        <button onClick={onClose} className={btnGhost}>Cancel</button>
        <button onClick={handleConfirm} disabled={saving} className={btnPrimary}>
          {saving ? <Loader className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
          {status === 'delivered' ? 'Confirm Delivery' : 'Update Status'}
        </button>
      </div>
    </ModalOverlay>
  );
}

/* ── Order Detail Modal ── */

function OrderDetailModal({ order, onClose }) {
  if (!order) return null;

  return (
    <ModalOverlay onClose={onClose} wide>
      {/* Header */}
      <div className="px-7 py-5 border-b border-neutral-100">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary-50 flex items-center justify-center">
              <FileText className="h-5 w-5 text-primary-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-neutral-900">{order.orderNumber}</h2>
              <div className="flex items-center gap-2 mt-0.5">
                <StatusBadge status={order.status} />
                {order.urgency === 'urgent' && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-md">
                    <AlertTriangle className="h-3 w-3" /> Urgent
                  </span>
                )}
              </div>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-neutral-100 transition-colors">
            <X className="h-4 w-4 text-neutral-400" />
          </button>
        </div>
      </div>

      <div className="px-7 py-6 space-y-6 max-h-[65vh] overflow-y-auto">
        {/* Order Info */}
        <div>
          <p className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-3">Order Information</p>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2.5">
              <div>
                <p className="text-xs text-neutral-500">Vendor</p>
                <p className="text-sm font-medium text-neutral-900">{order.vendor?.name || '—'}</p>
                {order.vendor?.company && <p className="text-xs text-neutral-500">{order.vendor.company}</p>}
                {order.vendor?.phone && <p className="text-xs text-neutral-400 flex items-center gap-1 mt-1"><Phone className="h-3 w-3" />{order.vendor.phone}</p>}
                {order.vendor?.email && <p className="text-xs text-neutral-400 flex items-center gap-1"><Mail className="h-3 w-3" />{order.vendor.email}</p>}
              </div>
            </div>
            <div className="space-y-2.5">
              <div>
                <p className="text-xs text-neutral-500">Branch</p>
                <p className="text-sm font-medium text-neutral-900">{order.branch?.name || '—'}</p>
              </div>
              {order.patient && (
                <div>
                  <p className="text-xs text-neutral-500">Patient</p>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium text-violet-700 bg-violet-50 border border-violet-200 rounded-md">
                    <User className="h-3 w-3" />{order.patient.name} ({order.patient.patientId})
                  </span>
                </div>
              )}
              {order.requestedBy && (
                <div>
                  <p className="text-xs text-neutral-500">Requested By</p>
                  <p className="text-sm text-neutral-700">Dr. {order.requestedBy.name}</p>
                </div>
              )}
              <div>
                <p className="text-xs text-neutral-500">Expected Delivery</p>
                <p className="text-sm text-neutral-700">
                  {order.expectedDelivery ? new Date(order.expectedDelivery).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                </p>
              </div>
              {order.actualDelivery && (
                <div>
                  <p className="text-xs text-neutral-500">Actual Delivery</p>
                  <p className="text-sm text-emerald-700 font-medium">
                    {new Date(order.actualDelivery).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Items Table */}
        <div>
          <p className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-3">Items</p>
          <div className="border border-neutral-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-neutral-50 border-b border-neutral-100">
                  <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">Item</th>
                  <th className="px-4 py-2.5 text-center text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">Ordered</th>
                  <th className="px-4 py-2.5 text-center text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">Received</th>
                  <th className="px-4 py-2.5 text-right text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">Unit Price</th>
                  <th className="px-4 py-2.5 text-right text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">Line Total</th>
                </tr>
              </thead>
              <tbody>
                {(order.items || []).map((item, idx) => (
                  <tr key={idx} className="border-b border-neutral-50">
                    <td className="px-4 py-3 text-neutral-800">{item.itemName || item.inventoryItem?.name || '—'}</td>
                    <td className="px-4 py-3 text-center text-neutral-600">{item.quantity}</td>
                    <td className="px-4 py-3 text-center">
                      {order.status === 'delivered' ? (
                        <span className={item.receivedQty < item.quantity ? 'text-amber-600 font-medium' : 'text-emerald-600 font-medium'}>
                          {item.receivedQty}
                        </span>
                      ) : (
                        <span className="text-neutral-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-neutral-600">&#8377;{(item.unitPrice || 0).toLocaleString('en-IN')}</td>
                    <td className="px-4 py-3 text-right font-medium text-neutral-800">&#8377;{(item.quantity * (item.unitPrice || 0)).toLocaleString('en-IN')}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-neutral-50 border-t border-neutral-200">
                  <td colSpan={4} className="px-4 py-3 text-right text-sm font-medium text-neutral-500">Total</td>
                  <td className="px-4 py-3 text-right text-sm font-semibold text-neutral-900">&#8377;{(order.totalAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* Notes */}
        {order.notes && (
          <div>
            <p className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-2">Notes</p>
            <p className="text-sm text-neutral-600 bg-neutral-50 border border-neutral-100 rounded-xl p-3">{order.notes}</p>
          </div>
        )}

        {/* Status History Timeline */}
        {order.statusHistory?.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-3">Status History</p>
            <div className="space-y-0">
              {order.statusHistory.slice().reverse().map((entry, idx) => {
                const cfg = STATUS_CONFIG[entry.status] || STATUS_CONFIG.requested;
                const Icon = cfg.icon;
                return (
                  <div key={idx} className="flex gap-3 py-2.5">
                    <div className="flex flex-col items-center">
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${idx === 0 ? 'bg-primary-100 text-primary-600' : 'bg-neutral-100 text-neutral-400'}`}>
                        <Icon className="h-3.5 w-3.5" />
                      </div>
                      {idx < (order.statusHistory.length - 1) && (
                        <div className="w-px flex-1 bg-neutral-200 mt-1" />
                      )}
                    </div>
                    <div className="flex-1 pb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-neutral-800">{cfg.label}</span>
                        <span className="text-[11px] text-neutral-400">
                          {new Date(entry.changedAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      {entry.note && <p className="text-xs text-neutral-500 mt-0.5">{entry.note}</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-end px-7 py-4 border-t border-neutral-100 bg-neutral-50/50">
        <button onClick={onClose} className={btnGhost}>Close</button>
      </div>
    </ModalOverlay>
  );
}
