import { useState, useEffect, useCallback } from 'react';
import {
  CreditCard, IndianRupee, Search, Eye, Undo2, Wallet, Download,
  Banknote, Smartphone, FileText, Clock, ArrowDownRight, ArrowUpRight,
  User, Printer,
} from 'lucide-react';
import { Modal, DataTable, Pagination, Spinner, ErrorAlert, EmptyState } from '../../platform/components/shared';
import {
  listPayments, createPayment, refundPayment,
  getPatientLedger, listPatients, downloadPaymentReceipt,
} from '../api';
import { useToast } from '../ToastContext';

/* ---- Reusable class strings ----------------------------------- */
const inputCls = 'w-full px-3 py-2.5 border border-neutral-200 rounded-xl text-sm bg-neutral-50 text-neutral-900 placeholder:text-neutral-900/25 focus:bg-white focus:border-primary-300 focus:ring-2 focus:ring-primary-400/20 outline-none transition-all';
const labelCls = 'block text-xs font-semibold text-neutral-900/50 mb-1.5';
const btnPrimary = 'h-11 px-5 text-sm font-semibold bg-primary-600 text-white rounded-lg hover:bg-primary-700 shadow-[var(--shadow-sm)] hover:shadow-[var(--shadow-md)] transition-all duration-200 disabled:opacity-50';
const btnSecondary = 'h-11 px-4 text-sm font-medium text-neutral-600 bg-neutral-100 border border-neutral-200 rounded-lg hover:bg-neutral-200 transition-all duration-200';
const btnDanger = 'h-11 px-5 text-sm font-semibold bg-red-600 text-white rounded-lg hover:bg-red-700 shadow-[var(--shadow-sm)] transition-all duration-200 disabled:opacity-50';

const formatCurrency = (v) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(v || 0);

const formatDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'N/A';
const formatDateTime = (d) => d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'N/A';

/* ---- Status helpers ------------------------------------------- */
const PAYMENT_STATUS_STYLES = {
  completed: { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  refunded:  { bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-500' },
  pending:   { bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500' },
};

function PaymentStatusBadge({ status }) {
  const s = PAYMENT_STATUS_STYLES[status] || { bg: 'bg-neutral-200', text: 'text-neutral-600', dot: 'bg-neutral-400' };
  const label = (status || 'N/A').replace(/_/g, ' ');
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium capitalize ${s.bg} ${s.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {label}
    </span>
  );
}

/* ---- Method icon mapping -------------------------------------- */
const METHOD_ICONS = {
  cash: Banknote,
  card: CreditCard,
  upi: Smartphone,
  net_banking: IndianRupee,
  insurance: FileText,
  credit_balance: Wallet,
  other: IndianRupee,
};

/* ---- Payment methods filter ----------------------------------- */
const PAYMENT_METHOD_FILTER = [
  { value: '', label: 'All Methods' },
  { value: 'cash', label: 'Cash' },
  { value: 'card', label: 'Card' },
  { value: 'upi', label: 'UPI' },
  { value: 'net_banking', label: 'Net Banking' },
  { value: 'insurance', label: 'Insurance' },
  { value: 'credit_balance', label: 'Credit Balance' },
  { value: 'other', label: 'Other' },
];

/* ---- Stat card ------------------------------------------------ */
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

const patientName = (p) => p.name || `${p.firstName || ''} ${p.lastName || ''}`.trim() || 'N/A';

/* ---- Ledger entry type config --------------------------------- */
const LEDGER_TYPE_CONFIG = {
  invoice:     { icon: FileText, bg: 'bg-blue-50', text: 'text-blue-600', label: 'Invoice' },
  payment:     { icon: IndianRupee, bg: 'bg-emerald-50', text: 'text-emerald-600', label: 'Payment' },
  credit_note: { icon: Undo2, bg: 'bg-purple-50', text: 'text-purple-600', label: 'Credit Note' },
  adjustment:  { icon: Clock, bg: 'bg-amber-50', text: 'text-amber-600', label: 'Adjustment' },
  refund:      { icon: Undo2, bg: 'bg-red-50', text: 'text-red-600', label: 'Refund' },
};

/* ================================================================
   MAIN COMPONENT
   ================================================================ */
export default function BillingOfficerPayments() {
  const { showToast } = useToast();

  // ---- List state ---------------------------------------------
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 15;

  // Summary stats
  const [summaryStats, setSummaryStats] = useState({
    totalToday: 0, cash: 0, card: 0, upi: 0,
  });

  // Filters
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [methodFilter, setMethodFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals
  const [viewTarget, setViewTarget] = useState(null);
  const [refundTarget, setRefundTarget] = useState(null);
  const [refunding, setRefunding] = useState(false);
  const [refundReason, setRefundReason] = useState('');
  const [refundAmount, setRefundAmount] = useState('');

  // Patient Ledger
  const [ledgerPage, setLedgerPage] = useState(1);
  const [ledgerPatientSearch, setLedgerPatientSearch] = useState('');
  const [patients, setPatients] = useState([]);
  const [selectedLedgerPatient, setSelectedLedgerPatient] = useState(null);
  const [ledger, setLedger] = useState(null);
  const [ledgerLoading, setLedgerLoading] = useState(false);

  // ---- Fetch payments -----------------------------------------
  const fetchPayments = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = { page, limit };
      if (dateFrom) params.from = new Date(dateFrom).toISOString();
      if (dateTo) params.to = new Date(dateTo + 'T23:59:59').toISOString();
      if (methodFilter) params.mode = methodFilter;
      if (searchQuery.trim()) params.search = searchQuery.trim();

      const res = await listPayments(params);
      const items = res.data?.items || res.data || [];
      const paymentList = Array.isArray(items) ? items : [];
      setPayments(paymentList);
      setTotal(res.data?.total ?? res.meta?.total ?? res.total ?? 0);

      // Compute summary stats from today's payments
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayPayments = paymentList.filter((p) => {
        const pDate = new Date(p.createdAt || p.date);
        return pDate >= today && p.status !== 'refunded';
      });
      setSummaryStats({
        totalToday: todayPayments.reduce((sum, p) => sum + (p.amount ?? 0), 0),
        cash: todayPayments.filter((p) => p.mode === 'cash').reduce((sum, p) => sum + (p.amount ?? 0), 0),
        card: todayPayments.filter((p) => p.mode === 'card').reduce((sum, p) => sum + (p.amount ?? 0), 0),
        upi: todayPayments.filter((p) => p.mode === 'upi').reduce((sum, p) => sum + (p.amount ?? 0), 0),
      });
    } catch (err) {
      setError(err.message || 'Failed to load payments');
    } finally {
      setLoading(false);
    }
  }, [page, dateFrom, dateTo, methodFilter, searchQuery]);

  useEffect(() => { fetchPayments(); }, [fetchPayments]);

  useEffect(() => {
    listPatients({ limit: 200 }).then((r) => setPatients(r.data || [])).catch(() => {});
  }, []);

  // ---- Refund -------------------------------------------------
  const handleRefund = async () => {
    if (!refundTarget) return;
    if (!refundReason.trim()) {
      showToast({ type: 'error', message: 'Please provide a reason for the refund' });
      return;
    }
    const amount = Number(refundAmount) || 0;
    if (amount <= 0 || amount > (refundTarget.amount ?? 0)) {
      showToast({ type: 'error', message: 'Please enter a valid refund amount' });
      return;
    }
    setRefunding(true);
    try {
      await refundPayment(refundTarget._id || refundTarget.id, { amount, reason: refundReason.trim() });
      showToast({ type: 'success', message: 'Refund processed successfully' });
      setRefundTarget(null);
      setRefundReason('');
      setRefundAmount('');
      fetchPayments();
    } catch (err) {
      showToast({ type: 'error', message: err.message || 'Failed to process refund' });
    } finally {
      setRefunding(false);
    }
  };

  // ---- Patient Ledger -----------------------------------------
  const filteredLedgerPatients = ledgerPatientSearch.trim()
    ? patients.filter((p) =>
        patientName(p).toLowerCase().includes(ledgerPatientSearch.toLowerCase()) ||
        (p.patientId || '').toLowerCase().includes(ledgerPatientSearch.toLowerCase())
      )
    : [];

  const handleSelectLedgerPatient = async (patient) => {
    setSelectedLedgerPatient(patient);
    setLedgerPatientSearch(patientName(patient));
    setLedgerPage(1);
    setLedgerLoading(true);
    try {
      const res = await getPatientLedger(patient._id || patient.id, { page: 1, limit: 50 });
      setLedger(res.data || null);
    } catch (err) {
      showToast({ type: 'error', message: err.message || 'Failed to load patient ledger' });
      setLedger(null);
    } finally {
      setLedgerLoading(false);
    }
  };

  // ---- Receipt Download ----------------------------------------
  const handleReceipt = async (payment) => {
    try {
      await downloadPaymentReceipt(payment._id || payment.id);
      showToast({ type: 'success', message: 'Receipt downloaded' });
    } catch (err) {
      showToast({ type: 'error', message: err.message || 'Failed to download receipt' });
    }
  };

  // ---- Table columns ------------------------------------------
  const columns = [
    {
      key: 'date', label: 'Date',
      render: (r) => <span className="text-neutral-700 text-xs">{formatDateTime(r.createdAt || r.date)}</span>,
    },
    {
      key: 'patient', label: 'Patient',
      render: (r) => <span className="text-neutral-700">{r.patient?.name || r.patientName || 'N/A'}</span>,
    },
    {
      key: 'invoice', label: 'Invoice #',
      render: (r) => (
        <span className="font-medium text-neutral-900 font-display text-xs">
          {r.invoice?.invoiceNumber || r.invoiceNumber || '-'}
        </span>
      ),
    },
    {
      key: 'amount', label: 'Amount',
      render: (r) => <span className="font-semibold text-neutral-900">{formatCurrency(r.amount ?? 0)}</span>,
    },
    {
      key: 'mode', label: 'Method',
      render: (r) => {
        const Icon = METHOD_ICONS[r.mode] || IndianRupee;
        return (
          <div className="flex items-center gap-1.5">
            <Icon className="h-3.5 w-3.5 text-neutral-400" />
            <span className="text-sm text-neutral-700 capitalize">{(r.mode || 'N/A').replace(/_/g, ' ')}</span>
          </div>
        );
      },
    },
    {
      key: 'status', label: 'Status',
      render: (r) => <PaymentStatusBadge status={r.status} />,
    },
    {
      key: 'actions', label: 'Actions',
      render: (r) => (
        <div className="flex items-center gap-1">
          <button onClick={(e) => { e.stopPropagation(); setViewTarget(r); }} className="p-1.5 rounded-lg hover:bg-neutral-100 text-neutral-400 hover:text-primary-600 transition" title="View Details">
            <Eye className="h-4 w-4" />
          </button>
          {r.status === 'completed' && (
            <button onClick={(e) => { e.stopPropagation(); handleReceipt(r); }} className="p-1.5 rounded-lg hover:bg-blue-50 text-neutral-400 hover:text-blue-600 transition" title="Print Receipt">
              <Printer className="h-4 w-4" />
            </button>
          )}
          {r.status !== 'refunded' && r.status !== 'pending' && (
            <button onClick={(e) => { e.stopPropagation(); setRefundTarget(r); }} className="p-1.5 rounded-lg hover:bg-red-50 text-neutral-400 hover:text-red-600 transition" title="Refund">
              <Undo2 className="h-4 w-4" />
            </button>
          )}
        </div>
      ),
    },
  ];

  /* ---- Render ------------------------------------------------- */
  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-[fadeUp_0.4s_ease-out_both]">
        <div>
          <h1 className="text-2xl font-semibold font-display text-neutral-900">Payments</h1>
          <p className="text-sm text-neutral-600 mt-1">Track payments, process refunds, and view patient ledgers</p>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <MetricCard icon={IndianRupee} label="Total Today" value={formatCurrency(summaryStats.totalToday)} iconBg="bg-primary-50" iconText="text-primary-600" index={0} />
        <MetricCard icon={Banknote} label="Cash" value={formatCurrency(summaryStats.cash)} iconBg="bg-emerald-50" iconText="text-emerald-600" index={1} />
        <MetricCard icon={CreditCard} label="Card" value={formatCurrency(summaryStats.card)} iconBg="bg-blue-50" iconText="text-blue-600" index={2} />
        <MetricCard icon={Smartphone} label="UPI" value={formatCurrency(summaryStats.upi)} iconBg="bg-purple-50" iconText="text-purple-600" index={3} />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 animate-[fadeUp_0.4s_ease-out_both]" style={{ animationDelay: '100ms' }}>
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
          className="h-11 px-3 border border-neutral-200 rounded-lg text-sm bg-white text-neutral-900 focus:border-primary-300 focus:ring-2 focus:ring-primary-400/20 outline-none transition-all"
        />
        <input
          type="date"
          value={dateTo}
          onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
          className="h-11 px-3 border border-neutral-200 rounded-lg text-sm bg-white text-neutral-900 focus:border-primary-300 focus:ring-2 focus:ring-primary-400/20 outline-none transition-all"
        />
        <select
          value={methodFilter}
          onChange={(e) => { setMethodFilter(e.target.value); setPage(1); }}
          className="h-11 px-3 border border-neutral-200 rounded-lg text-sm bg-white text-neutral-900 focus:border-primary-300 focus:ring-2 focus:ring-primary-400/20 outline-none transition-all"
        >
          {PAYMENT_METHOD_FILTER.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
            placeholder="Search by patient or reference..."
            className="h-11 w-full pl-9 pr-3 border border-neutral-200 rounded-lg text-sm bg-white text-neutral-900 placeholder:text-neutral-400 focus:border-primary-300 focus:ring-2 focus:ring-primary-400/20 outline-none transition-all"
          />
        </div>
      </div>

      {error && <ErrorAlert message={error} />}

      {/* Payment Table */}
      <div className="bg-white rounded-2xl border border-neutral-200 overflow-hidden shadow-[var(--shadow-sm)] animate-[fadeUp_0.4s_ease-out_both]" style={{ animationDelay: '150ms' }}>
        {loading ? (
          <Spinner />
        ) : payments.length === 0 ? (
          <EmptyState icon={CreditCard} title="No payments found" message="Adjust your filters or check back later." />
        ) : (
          <>
            <DataTable columns={columns} data={payments} />
            {total > limit && (
              <div className="px-4 border-t border-neutral-200">
                <Pagination page={page} limit={limit} total={total} onChange={setPage} />
              </div>
            )}
          </>
        )}
      </div>

      {/* ---- Patient Ledger Section ---- */}
      <div className="animate-[fadeUp_0.4s_ease-out_both]" style={{ animationDelay: '200ms' }}>
        <div className="bg-white rounded-2xl border border-neutral-200 shadow-[var(--shadow-sm)] p-5">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center">
              <User className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <h3 className="text-[15px] font-semibold font-display text-neutral-900">Patient Ledger</h3>
              <p className="text-xs text-neutral-500">Search a patient to view their financial history</p>
            </div>
          </div>

          {/* Patient search */}
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
            <input
              type="text"
              placeholder="Search patient by name or ID..."
              value={ledgerPatientSearch}
              onChange={(e) => { setLedgerPatientSearch(e.target.value); setSelectedLedgerPatient(null); setLedger(null); }}
              className={`${inputCls} pl-9`}
            />
          </div>

          {/* Patient dropdown */}
          {ledgerPatientSearch.trim() && !selectedLedgerPatient && (
            <div className="mb-4 border border-neutral-200 rounded-xl max-h-40 overflow-y-auto bg-white shadow-[var(--shadow-sm)]">
              {filteredLedgerPatients.length === 0 ? (
                <p className="text-xs text-neutral-400 p-3 text-center">No patients found</p>
              ) : (
                filteredLedgerPatients.slice(0, 10).map((p) => (
                  <button
                    key={p._id || p.id}
                    type="button"
                    onClick={() => handleSelectLedgerPatient(p)}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-primary-50 transition flex items-center justify-between"
                  >
                    <span className="text-neutral-900">{patientName(p)}</span>
                    {p.phone && <span className="text-xs text-neutral-400">{p.phone}</span>}
                  </button>
                ))
              )}
            </div>
          )}

          {/* Ledger entries */}
          {ledgerLoading && <Spinner />}

          {selectedLedgerPatient && ledger && !ledgerLoading && (
            <div>
              {/* Balance header */}
              <div className="flex items-center justify-between bg-neutral-50 rounded-xl p-4 mb-4 border border-neutral-200">
                <div>
                  <p className="text-xs text-neutral-500">Patient</p>
                  <p className="text-sm font-semibold text-neutral-900">{patientName(selectedLedgerPatient)}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-neutral-500">Outstanding Balance</p>
                  <p className={`text-lg font-bold font-display ${(ledger.balance ?? 0) > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                    {formatCurrency(ledger.balance ?? 0)}
                  </p>
                </div>
              </div>

              {/* Timeline */}
              {(ledger.entries || []).length === 0 ? (
                <p className="text-sm text-neutral-400 text-center py-6">No ledger entries found</p>
              ) : (
                <div className="space-y-3 max-h-[400px] overflow-y-auto">
                  {(ledger.entries || []).map((entry, idx) => {
                    const config = LEDGER_TYPE_CONFIG[entry.type] || LEDGER_TYPE_CONFIG.adjustment;
                    const Icon = config.icon;
                    const isDebit = entry.type === 'invoice' || entry.type === 'adjustment';
                    return (
                      <div key={idx} className="flex items-center gap-3 p-3 rounded-xl border border-neutral-100 hover:bg-neutral-50 transition">
                        <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${config.bg}`}>
                          <Icon className={`h-4 w-4 ${config.text}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-neutral-900 truncate">{entry.description || config.label}</p>
                          <p className="text-xs text-neutral-500">{formatDate(entry.date || entry.createdAt)}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="flex items-center gap-1">
                            {isDebit ? (
                              <ArrowUpRight className="h-3.5 w-3.5 text-red-500" />
                            ) : (
                              <ArrowDownRight className="h-3.5 w-3.5 text-emerald-500" />
                            )}
                            <span className={`text-sm font-semibold ${isDebit ? 'text-red-600' : 'text-emerald-600'}`}>
                              {formatCurrency(entry.amount ?? 0)}
                            </span>
                          </div>
                          {entry.runningBalance != null && (
                            <p className="text-[10px] text-neutral-400 mt-0.5">Bal: {formatCurrency(entry.runningBalance)}</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ---- View Payment Modal ---- */}
      <Modal open={!!viewTarget} onClose={() => setViewTarget(null)} title="Payment Details">
        {viewTarget && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-neutral-500">Patient</span>
                <p className="font-medium text-neutral-900 mt-0.5">{viewTarget.patient?.name || viewTarget.patientName || 'N/A'}</p>
              </div>
              <div>
                <span className="text-neutral-500">Status</span>
                <div className="mt-0.5"><PaymentStatusBadge status={viewTarget.status} /></div>
              </div>
              <div>
                <span className="text-neutral-500">Amount</span>
                <p className="font-semibold text-neutral-900 mt-0.5">{formatCurrency(viewTarget.amount ?? 0)}</p>
              </div>
              <div>
                <span className="text-neutral-500">Method</span>
                <p className="font-medium text-neutral-900 mt-0.5 capitalize">{(viewTarget.mode || 'N/A').replace(/_/g, ' ')}</p>
              </div>
              <div>
                <span className="text-neutral-500">Invoice</span>
                <p className="font-medium text-neutral-900 mt-0.5">{viewTarget.invoice?.invoiceNumber || viewTarget.invoiceNumber || '-'}</p>
              </div>
              <div>
                <span className="text-neutral-500">Date</span>
                <p className="text-neutral-900 mt-0.5">{formatDateTime(viewTarget.createdAt || viewTarget.date)}</p>
              </div>
              {viewTarget.reference && (
                <div className="col-span-2">
                  <span className="text-neutral-500">Reference</span>
                  <p className="font-medium text-neutral-900 mt-0.5">{viewTarget.reference}</p>
                </div>
              )}
            </div>
            {viewTarget.status === 'completed' && (
              <div className="pt-3 border-t border-neutral-200">
                <button
                  onClick={() => handleReceipt(viewTarget)}
                  className="h-11 px-5 text-sm font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 shadow-[var(--shadow-sm)] hover:shadow-[var(--shadow-md)] transition-all duration-200 flex items-center gap-2"
                >
                  <Printer className="h-4 w-4" /> Print Receipt
                </button>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* ---- Refund Confirmation Modal ---- */}
      <Modal open={!!refundTarget} onClose={() => setRefundTarget(null)} title="Process Refund">
        {refundTarget && (
          <div className="space-y-5">
            <div className="bg-red-50 border border-red-200 rounded-xl p-4">
              <div className="flex items-start gap-3">
                <Undo2 className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-red-800">Process refund for this payment</p>
                  <p className="text-sm text-red-700 mt-1">
                    Original payment: <span className="font-semibold">{formatCurrency(refundTarget.amount ?? 0)}</span>
                    {' '}for {refundTarget.patient?.name || refundTarget.patientName || 'this patient'}.
                    This action cannot be undone.
                  </p>
                </div>
              </div>
            </div>
            <div>
              <label className={labelCls}>Refund Amount *</label>
              <input
                type="number"
                value={refundAmount || String(refundTarget.amount ?? 0)}
                onChange={(e) => setRefundAmount(e.target.value)}
                min="0.01"
                max={refundTarget.amount ?? 0}
                step="0.01"
                className={inputCls}
                required
              />
              <p className="text-xs text-neutral-400 mt-1">Max: {formatCurrency(refundTarget.amount ?? 0)}</p>
            </div>
            <div className="bg-neutral-50 rounded-xl p-3 border border-neutral-200 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-neutral-500">Payment Method</span>
                <span className="font-medium text-neutral-900 capitalize">{(refundTarget.mode || 'N/A').replace(/_/g, ' ')}</span>
              </div>
              {refundTarget.reference && (
                <div className="flex items-center justify-between mt-2">
                  <span className="text-neutral-500">Reference</span>
                  <span className="font-medium text-neutral-900">{refundTarget.reference}</span>
                </div>
              )}
            </div>
            <div>
              <label className={labelCls}>Reason for Refund *</label>
              <textarea
                value={refundReason}
                onChange={(e) => setRefundReason(e.target.value)}
                placeholder="Describe the reason for this refund..."
                rows={2}
                className={inputCls}
                required
              />
            </div>
            <div className="flex justify-end gap-3 pt-3 border-t border-neutral-200">
              <button type="button" onClick={() => setRefundTarget(null)} disabled={refunding} className={btnSecondary}>Cancel</button>
              <button type="button" onClick={handleRefund} disabled={refunding} className={`${btnDanger} flex items-center gap-2`}>
                {refunding ? 'Processing...' : <><Undo2 className="h-4 w-4" /> Process Refund</>}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
