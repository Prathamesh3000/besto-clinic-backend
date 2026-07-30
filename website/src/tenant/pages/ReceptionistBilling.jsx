import { useState, useEffect, useCallback } from 'react';
import { CreditCard, IndianRupee, Clock, CheckCircle2, Plus, Search, Eye, FileText, Trash2 } from 'lucide-react';
import { Modal, DataTable, Pagination, Spinner, ErrorAlert, EmptyState } from '../../platform/components/shared';
import { listInvoices, createInvoice, recordPaymentForInvoice, listServiceItems, listPatients } from '../api';
import { useToast } from '../ToastContext';

// ─── Reusable form elements (match admin PatientManagement / Billing) ───
const inputCls = 'w-full px-3 py-2.5 border border-neutral-200 rounded-xl text-sm bg-neutral-50 text-neutral-900 placeholder:text-neutral-900/25 focus:bg-white focus:border-primary-300 focus:ring-2 focus:ring-primary-400/20 outline-none transition-all';
const labelCls = 'block text-xs font-semibold text-neutral-900/50 mb-1.5';
const btnPrimary = 'h-11 px-5 text-sm font-semibold bg-primary-600 text-white rounded-lg hover:bg-primary-700 shadow-[var(--shadow-sm)] hover:shadow-[var(--shadow-md)] transition-all duration-200 disabled:opacity-50';
const btnSecondary = 'h-11 px-4 text-sm font-medium text-neutral-600 bg-neutral-100 border border-neutral-200 rounded-lg hover:bg-neutral-200 transition-all duration-200';
const INR = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });

// ─── Status helpers ──────────────────────────────
const STATUS_STYLES = {
  draft:          { bg: 'bg-neutral-200/80', text: 'text-neutral-900/60', dot: 'bg-neutral-900/30' },
  sent:           { bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-500' },
  paid:           { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  overdue:        { bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-500' },
  cancelled:      { bg: 'bg-neutral-200/80', text: 'text-neutral-900/50', dot: 'bg-neutral-900/25' },
  partially_paid: { bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500' },
};

function StatusBadge({ status }) {
  const s = STATUS_STYLES[status] || { bg: 'bg-neutral-200', text: 'text-neutral-900/60', dot: 'bg-neutral-900/30' };
  const label = (status || 'N/A').replace(/_/g, ' ');
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium capitalize ${s.bg} ${s.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {label}
    </span>
  );
}

// ─── Stat card (match DashStatCards) ──────────────
function MetricCard({ icon: Icon, label, value, iconBg, iconText, index = 0 }) {
  return (
    <div
      className="bg-white rounded-2xl border border-neutral-200 p-5 shadow-[var(--shadow-sm)] hover:shadow-[var(--shadow-md)] hover:-translate-y-0.5 transition-all duration-200 animate-[fadeUp_0.4s_ease-out_both]"
      style={{ animationDelay: `${50 + index * 50}ms` }}
    >
      <div className="flex items-start justify-between mb-3">
        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${iconBg}`}>
          <Icon className={`h-6 w-6 ${iconText}`} />
        </div>
      </div>
      <p className="text-[28px] font-bold font-display text-neutral-900 leading-tight">{value}</p>
      <p className="text-xs font-medium text-neutral-500 mt-1">{label}</p>
    </div>
  );
}

const TABS = ['Recent Invoices', 'New Invoice'];
const EMPTY_LINE = { serviceItem: '', description: '', quantity: 1, unitPrice: 0 };
const patientName = (p) => p.name || `${p.firstName || ''} ${p.lastName || ''}`.trim();
const invBalance = (inv) => inv.balanceDue ?? ((inv.totalAmount ?? inv.amount ?? 0) - (inv.paidAmount ?? 0));

export default function ReceptionistBilling() {
  const { showToast } = useToast();
  const [tab, setTab] = useState(0);
  const [invoices, setInvoices] = useState([]);
  const [stats, setStats] = useState({ totalRevenue: 0, paidCount: 0, pendingCount: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 15;

  const [patients, setPatients] = useState([]);
  const [serviceItems, setServiceItems] = useState([]);
  const [patientSearch, setPatientSearch] = useState('');
  const [payTarget, setPayTarget] = useState(null);
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState('cash');
  const [payReference, setPayReference] = useState('');
  const [payLoading, setPayLoading] = useState(false);
  const [form, setForm] = useState({ patient: '', lineItems: [{ ...EMPTY_LINE }], notes: '' });
  const [creating, setCreating] = useState(false);
  const [viewTarget, setViewTarget] = useState(null);

  const fetchInvoices = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await listInvoices({ page, limit });
      const items = res.data?.items || res.data || [];
      setInvoices(items);
      setTotal(res.data?.total ?? res.meta?.total ?? res.total ?? 0);

      // Compute stats from invoice data (API doesn't return stats)
      if (items.length > 0) {
        const paidItems = items.filter((i) => i.status === 'paid');
        const pendingItems = items.filter((i) => ['draft', 'sent', 'overdue', 'partially_paid'].includes(i.status));
        setStats({
          totalRevenue: paidItems.reduce((sum, i) => sum + (i.totalAmount ?? i.amount ?? 0), 0),
          paidCount: paidItems.length,
          pendingCount: pendingItems.length,
        });
      }
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, [page]);

  useEffect(() => { fetchInvoices(); }, [fetchInvoices]);
  useEffect(() => {
    listPatients({ limit: 200 }).then((r) => setPatients(r.data || [])).catch(() => {});
    listServiceItems({ limit: 200 }).then((r) => setServiceItems(r.data || [])).catch(() => {});
  }, []);

  const filteredPatients = patientSearch.trim()
    ? patients.filter((p) => patientName(p).toLowerCase().includes(patientSearch.toLowerCase()) || (p.patientId || '').toLowerCase().includes(patientSearch.toLowerCase()))
    : patients;

  // Line items
  const addLine = () => setForm((f) => ({ ...f, lineItems: [...f.lineItems, { ...EMPTY_LINE }] }));
  const removeLine = (i) => setForm((f) => ({ ...f, lineItems: f.lineItems.filter((_, j) => j !== i) }));
  const updateLine = (i, k, v) => setForm((f) => ({ ...f, lineItems: f.lineItems.map((li, j) => j === i ? { ...li, [k]: v } : li) }));
  const selectService = (i, id) => {
    const item = serviceItems.find((s) => (s._id || s.id) === id);
    if (item) { updateLine(i, 'serviceItem', id); updateLine(i, 'description', item.name || item.description || ''); updateLine(i, 'unitPrice', item.price ?? item.unitPrice ?? 0); }
    else updateLine(i, 'serviceItem', id);
  };
  const invoiceTotal = form.lineItems.reduce((sum, li) => sum + li.quantity * li.unitPrice, 0);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.patient) { showToast({ type: 'error', message: 'Please select a patient' }); return; }
    if (form.lineItems.some((li) => !li.description || li.unitPrice <= 0)) { showToast({ type: 'error', message: 'All items need a description and price' }); return; }
    setCreating(true);
    try {
      await createInvoice({ patient: form.patient, items: form.lineItems.map((li) => ({ description: li.description, quantity: Number(li.quantity), unitPrice: Number(li.unitPrice) })), notes: form.notes || undefined });
      showToast({ type: 'success', message: 'Invoice created successfully' });
      setForm({ patient: '', lineItems: [{ ...EMPTY_LINE }], notes: '' }); setPatientSearch(''); setTab(0); fetchInvoices();
    } catch (err) { showToast({ type: 'error', message: err.message || 'Failed to create invoice' }); }
    finally { setCreating(false); }
  };

  const openPay = (inv) => { setPayTarget(inv); setPayAmount(String(invBalance(inv))); setPayMethod('cash'); setPayReference(''); };
  const handlePay = async () => {
    if (!payTarget || Number(payAmount) <= 0) return;
    setPayLoading(true);
    try {
      await recordPaymentForInvoice(payTarget._id || payTarget.id, { amount: Number(payAmount), mode: payMethod, ...(payReference.trim() && { reference: payReference.trim() }) });
      showToast({ type: 'success', message: 'Payment recorded' }); setPayTarget(null); fetchInvoices();
    } catch (err) { showToast({ type: 'error', message: err.message || 'Failed to record payment' }); }
    finally { setPayLoading(false); }
  };

  const columns = [
    { key: 'invoiceNumber', label: 'Invoice #', render: (r) => <span className="font-semibold text-neutral-900 font-display">{r.invoiceNumber || '—'}</span> },
    { key: 'patient', label: 'Patient', render: (r) => <span className="text-neutral-900/80">{r.patient?.name || r.patientName || 'N/A'}</span> },
    { key: 'amount', label: 'Amount', render: (r) => <span className="font-semibold text-neutral-900">{INR.format(r.totalAmount ?? r.amount ?? 0)}</span> },
    { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status} /> },
    { key: 'date', label: 'Date', render: (r) => <span className="text-neutral-900/50 text-xs">{r.createdAt ? new Date(r.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'N/A'}</span> },
    { key: 'actions', label: 'Actions', render: (r) => (
      <div className="flex items-center gap-2">
        <button onClick={(e) => { e.stopPropagation(); setViewTarget(r); }} className="p-1.5 rounded-lg hover:bg-neutral-100 text-neutral-400 hover:text-primary-600 transition" title="View"><Eye className="h-4 w-4" /></button>
        {['draft', 'sent', 'overdue', 'partially_paid'].includes(r.status) && (
          <button onClick={(e) => { e.stopPropagation(); openPay(r); }} className="p-1.5 rounded-lg hover:bg-emerald-50 text-neutral-400 hover:text-emerald-600 transition" title="Record Payment"><IndianRupee className="h-4 w-4" /></button>
        )}
      </div>
    )},
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-[fadeUp_0.4s_ease-out_both]"
        style={{ animationDelay: '0ms' }}
      >
        <div>
          <h1 className="text-2xl font-semibold font-display text-neutral-900">Billing</h1>
          <p className="text-sm text-neutral-600 mt-1">Manage invoices and collect payments</p>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <MetricCard icon={IndianRupee} label="Total Today" value={INR.format(stats.totalRevenue)} iconBg="bg-primary-50" iconText="text-primary-600" index={0} />
        <MetricCard icon={CheckCircle2} label="Paid" value={stats.paidCount} iconBg="bg-emerald-50" iconText="text-emerald-600" index={1} />
        <MetricCard icon={Clock} label="Pending" value={stats.pendingCount} iconBg="bg-amber-50" iconText="text-amber-600" index={2} />
      </div>

      {/* Tabs */}
      <div
        className="flex gap-1 bg-neutral-100 rounded-xl p-1 animate-[fadeUp_0.4s_ease-out_both]"
        style={{ animationDelay: '200ms' }}
      >
        {TABS.map((t, i) => (
          <button key={t} onClick={() => setTab(i)} className={`flex-1 px-4 py-2 text-sm font-medium rounded-lg transition ${tab === i ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500 hover:text-neutral-700'}`}>{t}</button>
        ))}
      </div>

      {error && <ErrorAlert message={error} />}

      {/* Tab 0: Recent Invoices */}
      {tab === 0 && (
        <div
          className="bg-white rounded-2xl border border-neutral-200 overflow-hidden shadow-[var(--shadow-sm)] animate-[fadeUp_0.4s_ease-out_both]"
          style={{ animationDelay: '250ms' }}
        >
          {loading ? <Spinner /> : invoices.length === 0
            ? <EmptyState icon={FileText} title="No invoices yet" message="Create your first invoice from the New Invoice tab" />
            : <>
                <DataTable columns={columns} data={invoices} />
                {total > limit && <div className="px-4 border-t border-neutral-200"><Pagination page={page} limit={limit} total={total} onChange={setPage} /></div>}
              </>}
        </div>
      )}

      {/* Tab 1: New Invoice */}
      {tab === 1 && (
        <div
          className="bg-white rounded-2xl border border-neutral-200 shadow-[var(--shadow-sm)] p-6 animate-[fadeUp_0.4s_ease-out_both]"
          style={{ animationDelay: '250ms' }}
        >
          <form onSubmit={handleCreate} className="space-y-6">
            {/* Patient search */}
            <div>
              <label className={labelCls}>Patient</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
                <input type="text" placeholder="Search patient by name or ID..." value={patientSearch}
                  onChange={(e) => { setPatientSearch(e.target.value); setForm((f) => ({ ...f, patient: '' })); }} className={`${inputCls} pl-9`} />
              </div>
              {form.patient && <p className="text-xs text-emerald-600 mt-1.5 font-medium">Selected: {patients.find((p) => (p._id || p.id) === form.patient)?.name || 'Patient'}</p>}
              {patientSearch.trim() && !form.patient && (
                <div className="mt-2 border border-neutral-200 rounded-xl max-h-40 overflow-y-auto bg-white shadow-[var(--shadow-sm)]">
                  {filteredPatients.length === 0
                    ? <p className="text-xs text-neutral-400 p-3 text-center">No patients found</p>
                    : filteredPatients.slice(0, 10).map((p) => (
                      <button key={p._id || p.id} type="button"
                        onClick={() => { setForm((f) => ({ ...f, patient: p._id || p.id })); setPatientSearch(patientName(p)); }}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-primary-50 transition flex items-center justify-between">
                        <span className="text-neutral-900">{patientName(p)}</span>
                        {p.phone && <span className="text-xs text-neutral-400">{p.phone}</span>}
                      </button>
                    ))}
                </div>
              )}
            </div>

            {/* Line items */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className={labelCls}>Items</label>
                <button type="button" onClick={addLine} className="text-xs text-primary-600 hover:text-primary-700 font-semibold flex items-center gap-1"><Plus className="h-3 w-3" /> Add Item</button>
              </div>
              <div className="space-y-3">
                {form.lineItems.map((li, idx) => (
                  <div key={idx} className="flex items-start gap-3 bg-neutral-50 rounded-xl p-3 border border-neutral-200">
                    <div className="flex-1 min-w-0 space-y-2">
                      {serviceItems.length > 0 && (
                        <select value={li.serviceItem} onChange={(e) => selectService(idx, e.target.value)} className={inputCls}>
                          <option value="">Select a service (or type below)</option>
                          {serviceItems.map((s) => <option key={s._id || s.id} value={s._id || s.id}>{s.name || s.description} — {INR.format(s.price ?? s.unitPrice ?? 0)}</option>)}
                        </select>
                      )}
                      <input placeholder="Description" value={li.description} onChange={(e) => updateLine(idx, 'description', e.target.value)} required className={inputCls} />
                    </div>
                    <div className="w-20 shrink-0">
                      <input type="number" min="1" placeholder="Qty" value={li.quantity} onChange={(e) => updateLine(idx, 'quantity', Number(e.target.value))} required className={inputCls} />
                    </div>
                    <div className="w-28 shrink-0">
                      <input type="number" min="0" step="0.01" placeholder="Price" value={li.unitPrice} onChange={(e) => updateLine(idx, 'unitPrice', Number(e.target.value))} required className={inputCls} />
                    </div>
                    <div className="w-24 shrink-0 text-right pt-2.5"><p className="text-sm font-semibold text-neutral-900">{INR.format(li.quantity * li.unitPrice)}</p></div>
                    {form.lineItems.length > 1 && (
                      <button type="button" onClick={() => removeLine(idx)} className="p-1.5 rounded-lg hover:bg-red-50 text-neutral-400 hover:text-red-600 transition mt-0.5"><Trash2 className="h-4 w-4" /></button>
                    )}
                  </div>
                ))}
              </div>
              <div className="flex justify-end mt-3"><p className="text-base font-bold text-neutral-900 font-display">Total: {INR.format(invoiceTotal)}</p></div>
            </div>

            <div>
              <label className={labelCls}>Notes (optional)</label>
              <input placeholder="Any additional notes..." value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className={inputCls} />
            </div>
            <div className="flex justify-end">
              <button type="submit" disabled={creating} className={`${btnPrimary} flex items-center gap-2`}>
                {creating ? 'Creating...' : <><CreditCard className="h-4 w-4" /> Generate Invoice</>}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* View Detail Modal */}
      <Modal open={!!viewTarget} onClose={() => setViewTarget(null)} title={`Invoice ${viewTarget?.invoiceNumber || ''}`}>
        {viewTarget && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><span className="text-neutral-500">Patient</span><p className="font-medium text-neutral-900 mt-0.5">{viewTarget.patient?.name || viewTarget.patientName || 'N/A'}</p></div>
              <div><span className="text-neutral-500">Status</span><div className="mt-0.5"><StatusBadge status={viewTarget.status} /></div></div>
              <div><span className="text-neutral-500">Total</span><p className="font-semibold text-neutral-900 mt-0.5">{INR.format(viewTarget.totalAmount ?? viewTarget.amount ?? 0)}</p></div>
              <div><span className="text-neutral-500">Paid</span><p className="font-medium text-emerald-600 mt-0.5">{INR.format(viewTarget.paidAmount ?? 0)}</p></div>
              <div><span className="text-neutral-500">Balance</span><p className="font-medium text-amber-600 mt-0.5">{INR.format(invBalance(viewTarget))}</p></div>
              <div><span className="text-neutral-500">Date</span><p className="text-neutral-900 mt-0.5">{viewTarget.createdAt ? new Date(viewTarget.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'N/A'}</p></div>
            </div>
            {viewTarget.items?.length > 0 && (
              <div className="border border-neutral-200 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead><tr className="bg-neutral-50 text-neutral-500 text-xs">
                    <th className="text-left px-3 py-2 font-medium">Description</th>
                    <th className="text-right px-3 py-2 font-medium">Qty</th>
                    <th className="text-right px-3 py-2 font-medium">Price</th>
                    <th className="text-right px-3 py-2 font-medium">Total</th>
                  </tr></thead>
                  <tbody>{viewTarget.items.map((it, i) => (
                    <tr key={i} className="border-t border-neutral-100">
                      <td className="px-3 py-2 text-neutral-900">{it.description || it.name || 'Item'}</td>
                      <td className="px-3 py-2 text-right text-neutral-600">{it.quantity ?? 1}</td>
                      <td className="px-3 py-2 text-right text-neutral-600">{INR.format(it.unitPrice ?? it.price ?? 0)}</td>
                      <td className="px-3 py-2 text-right font-medium text-neutral-900">{INR.format((it.quantity ?? 1) * (it.unitPrice ?? it.price ?? 0))}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
            {viewTarget.notes && <p className="text-xs text-neutral-500 italic">{viewTarget.notes}</p>}
          </div>
        )}
      </Modal>

      {/* Record Payment Modal */}
      <Modal open={!!payTarget} onClose={() => setPayTarget(null)} title="Record Payment">
        {payTarget && (
          <div className="space-y-5">
            <div className="flex items-center justify-between bg-neutral-50 rounded-xl p-3 border border-neutral-200">
              <div>
                <p className="text-xs text-neutral-500">Invoice {payTarget.invoiceNumber || ''}</p>
                <p className="text-sm font-semibold text-neutral-900 mt-0.5">Balance: {INR.format(invBalance(payTarget))}</p>
              </div>
              <p className="text-sm text-neutral-600">{payTarget.patient?.name || payTarget.patientName || 'N/A'}</p>
            </div>
            <div><label className={labelCls}>Amount</label><input type="number" min="1" step="0.01" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} className={inputCls} /></div>
            <div>
              <label className={labelCls}>Payment Method</label>
              <select value={payMethod} onChange={(e) => setPayMethod(e.target.value)} className={inputCls}>
                <option value="cash">Cash</option><option value="upi">UPI</option><option value="card">Card</option><option value="net_banking">Net Banking</option><option value="insurance">Insurance</option><option value="credit_balance">Credit Balance</option><option value="other">Other</option>
              </select>
            </div>
            {(payMethod === 'upi' || payMethod === 'card' || payMethod === 'net_banking' || payMethod === 'insurance') && (
              <div><label className={labelCls}>Reference / Transaction ID</label><input placeholder="Enter reference number" value={payReference} onChange={(e) => setPayReference(e.target.value)} className={inputCls} /></div>
            )}
            <div className="flex justify-end gap-3 pt-3 border-t border-neutral-200">
              <button type="button" onClick={() => setPayTarget(null)} disabled={payLoading} className={btnSecondary}>Cancel</button>
              <button type="button" onClick={handlePay} disabled={payLoading || Number(payAmount) <= 0} className={`${btnPrimary} flex items-center gap-2`}>
                {payLoading ? 'Processing...' : <><CheckCircle2 className="h-4 w-4" /> Record Payment</>}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
