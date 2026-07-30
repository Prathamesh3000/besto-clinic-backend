import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Receipt, FileText, Wallet, TrendingUp, TrendingDown,
  CreditCard, Download, CheckCircle2, AlertCircle, Clock,
  ArrowUpRight, ArrowDownLeft, ShieldCheck, Sparkles,
  ArrowRight, Loader2, AlertTriangle, Ban, RotateCcw,
} from 'lucide-react';
import {
  listPaymentHistory, initiatePayment, downloadPatientInvoicePdf,
  getPatientFinancialSummary, getPatientLedger, getPatientCreditNotes,
} from '../api';
import { useSafePatientAuth } from '../../hooks/useSafeAuth';
import { Pagination } from '../../platform/components/shared.jsx';
import { stripDrPrefix } from '../../utils/doctorName';

/* ─── Shared tokens (matching Dashboard) ───────── */

const PAGE = 10;
const CARD = 'bg-white rounded-2xl border border-neutral-200 shadow-[var(--shadow-sm)]';

function Shimmer({ className = '' }) {
  return <div className={`animate-pulse bg-neutral-200/60 rounded-xl ${className}`} />;
}

/* ─── Formatters ───────────────────────────────── */

const money = (n) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n || 0);

const fmtDate = (d) =>
  new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

const relDate = (d) => {
  if (!d) return '';
  const diff = Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff < 7) return `${diff}d ago`;
  if (diff < 30) return `${Math.floor(diff / 7)}w ago`;
  return fmtDate(d);
};

/* ─── Status configs ───────────────────────────── */

const INVOICE_STATUS = {
  draft:           { label: 'Draft',           bg: 'bg-neutral-100',   text: 'text-neutral-600',   dot: 'bg-neutral-400' },
  sent:            { label: 'Due',             bg: 'bg-amber-50',      text: 'text-amber-700',     dot: 'bg-amber-500' },
  partially_paid:  { label: 'Partial',         bg: 'bg-blue-50',       text: 'text-blue-700',      dot: 'bg-blue-500' },
  paid:            { label: 'Paid',            bg: 'bg-secondary-50',  text: 'text-secondary-700', dot: 'bg-secondary-500' },
  overdue:         { label: 'Overdue',         bg: 'bg-red-50',        text: 'text-red-700',       dot: 'bg-red-500' },
  cancelled:       { label: 'Cancelled',       bg: 'bg-neutral-100',   text: 'text-neutral-500',   dot: 'bg-neutral-400' },
  refunded:        { label: 'Refunded',        bg: 'bg-violet-50',     text: 'text-violet-700',    dot: 'bg-violet-500' },
};

const CREDIT_STATUS = {
  draft:    { label: 'Draft',    bg: 'bg-neutral-100',  text: 'text-neutral-600' },
  issued:   { label: 'Available', bg: 'bg-secondary-50', text: 'text-secondary-700' },
  applied:  { label: 'Applied',  bg: 'bg-neutral-100',  text: 'text-neutral-500' },
  expired:  { label: 'Expired',  bg: 'bg-red-50',       text: 'text-red-600' },
};

const LEDGER_SOURCE_LABEL = {
  payment:      'Payment received',
  refund:       'Refund issued',
  credit_note:  'Credit note',
  advance:      'Advance payment',
  adjustment:   'Adjustment',
  write_off:    'Write-off',
};

const INVOICE_VIEWS = [
  { key: 'outstanding', label: 'Outstanding' },
  { key: 'paid', label: 'Paid' },
  { key: 'all', label: 'All' },
];

/* ═══════════════════════════════════════════════════
   MAIN
   ═══════════════════════════════════════════════════ */

export default function PatientPayments() {
  const navigate = useNavigate();
  const { activePatientId } = useSafePatientAuth();

  /* ── State ── */

  // Summary
  const [summary, setSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(true);

  // Invoices
  const [invoices, setInvoices]         = useState([]);
  const [invoicesLoading, setInvoicesLoading] = useState(true);
  const [invoiceView, setInvoiceView]   = useState('outstanding');
  const [invoicePage, setInvoicePage]   = useState(1);
  const [invoiceTotal, setInvoiceTotal] = useState(0);

  // Ledger
  const [ledger, setLedger]             = useState([]);
  const [ledgerLoading, setLedgerLoading] = useState(true);

  // Credit notes
  const [credits, setCredits]           = useState([]);
  const [creditsLoading, setCreditsLoading] = useState(true);

  // Actions
  const [payingId, setPayingId]     = useState(null);
  const [downloadingId, setDownloadingId] = useState(null);
  const [toast, setToast]           = useState(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  /* ── Fetchers ── */

  const fetchSummary = useCallback(async () => {
    if (!activePatientId) return;
    setSummaryLoading(true);
    try {
      const res = await getPatientFinancialSummary(activePatientId);
      setSummary(res.data || res);
    } catch { /* noop */ }
    finally { setSummaryLoading(false); }
  }, [activePatientId]);

  const fetchInvoices = useCallback(async () => {
    if (!activePatientId) return;
    setInvoicesLoading(true);
    try {
      const p = { page: invoicePage, limit: PAGE };
      const res = await listPaymentHistory(activePatientId, p);
      const d = res.data || res;
      const list = Array.isArray(d) ? d : d.items || d.data || [];
      // Filter client-side by view
      const filtered = list.filter((inv) => {
        if (invoiceView === 'all') return true;
        if (invoiceView === 'paid') return inv.status === 'paid';
        // outstanding
        return ['sent', 'partially_paid', 'overdue'].includes(inv.status);
      });
      setInvoices(filtered);
      setInvoiceTotal(d.total || list.length);
    } catch { setInvoices([]); }
    finally { setInvoicesLoading(false); }
  }, [activePatientId, invoicePage, invoiceView]);

  const fetchLedger = useCallback(async () => {
    if (!activePatientId) return;
    setLedgerLoading(true);
    try {
      const res = await getPatientLedger(activePatientId, { page: 1, limit: 15 });
      const d = res.data || res;
      setLedger(Array.isArray(d) ? d : d.items || d.data || []);
    } catch { setLedger([]); }
    finally { setLedgerLoading(false); }
  }, [activePatientId]);

  const fetchCredits = useCallback(async () => {
    if (!activePatientId) return;
    setCreditsLoading(true);
    try {
      const res = await getPatientCreditNotes(activePatientId, { page: 1, limit: 10 });
      const d = res.data || res;
      setCredits(Array.isArray(d) ? d : d.items || d.data || []);
    } catch { setCredits([]); }
    finally { setCreditsLoading(false); }
  }, [activePatientId]);

  useEffect(() => {
    fetchSummary(); fetchInvoices(); fetchLedger(); fetchCredits();
  }, [fetchSummary, fetchInvoices, fetchLedger, fetchCredits]);

  useEffect(() => { setInvoicePage(1); }, [invoiceView]);

  /* ── Actions ── */

  const handlePay = async (invoice) => {
    setPayingId(invoice._id);
    try {
      const res = await initiatePayment(activePatientId, invoice._id);
      const session = res.data || res;
      // Inline gateway launch would go here. For now signal success and refresh.
      setToast({ type: 'success', msg: `Payment session started for ${session.invoiceNumber || 'invoice'}` });
      // In production: launch Razorpay with session.orderId, then call verification
    } catch (e) {
      setToast({ type: 'error', msg: e?.message || 'Could not start payment' });
    } finally { setPayingId(null); }
  };

  const handleDownload = async (invoice) => {
    setDownloadingId(invoice._id);
    try {
      await downloadPatientInvoicePdf(activePatientId, invoice._id);
      setToast({ type: 'success', msg: 'Invoice downloaded' });
    } catch (e) {
      setToast({ type: 'error', msg: e?.message || 'Could not download' });
    } finally { setDownloadingId(null); }
  };

  /* ── Derived ── */

  const allLoaded = !summaryLoading && !invoicesLoading && !ledgerLoading && !creditsLoading;

  const totalInvoiced   = summary?.totalBilled || summary?.totalInvoiced || 0;
  const totalPaid       = summary?.totalPaid || 0;
  const totalOutstanding = summary?.totalOutstanding || 0;
  const availableCredit = summary?.availableCredit || 0;

  const hasAnyData = (invoices.length > 0) || (ledger.length > 0) || (credits.length > 0) || totalInvoiced > 0;

  const paidPct = totalInvoiced > 0 ? Math.round((totalPaid / totalInvoiced) * 100) : 0;

  const outstandingInvoices = useMemo(
    () => invoices.filter((i) => ['sent', 'partially_paid', 'overdue'].includes(i.status)),
    [invoices],
  );

  /* ═══ RENDER ═══ */

  if (!allLoaded) {
    return (
      <div className="max-w-[1280px] mx-auto w-full space-y-6">
        <Shimmer className="h-10 w-56" />
        <Shimmer className="h-40 w-full" />
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-7"><Shimmer className="h-64 w-full" /></div>
          <div className="lg:col-span-5"><Shimmer className="h-64 w-full" /></div>
        </div>
      </div>
    );
  }

  /* ── Zero-data Welcome ── */
  if (!hasAnyData) {
    return (
      <div className="max-w-[1280px] mx-auto w-full space-y-6">
        {/* Welcome Hero */}
        <div className="bg-gradient-to-br from-primary-600 to-primary-800 rounded-2xl p-8 md:p-10 text-white animate-[fadeUp_0.4s_ease-out_both]">
          <h1 className="text-2xl md:text-3xl font-bold font-display leading-tight">
            Billing, Transparent &amp; Simple
          </h1>
          <p className="text-primary-100 text-sm md:text-base mt-2 max-w-xl leading-relaxed">
            After your visits, all invoices, payments, and receipts live here.
            Pay securely online or review your history any time.
          </p>
          <button
            onClick={() => navigate('/patient/appointments')}
            className="mt-6 h-12 px-7 text-sm font-bold bg-white text-primary-700 rounded-xl hover:bg-primary-50 shadow-[var(--shadow-md)] transition-all duration-200 flex items-center gap-2"
          >
            <ArrowRight className="h-5 w-5" /> Book an Appointment
          </button>
        </div>

        {/* Features */}
        <div className={`${CARD} p-6 animate-[fadeUp_0.4s_ease-out_both]`} style={{ animationDelay: '100ms' }}>
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-primary-50 flex items-center justify-center">
              <Sparkles className="h-5 w-5 text-primary-600" />
            </div>
            <div>
              <h2 className="text-[15px] font-semibold font-display text-neutral-900">What you'll find here</h2>
              <p className="text-xs text-neutral-500">Everything related to your billing, in one place</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              {
                icon: Receipt,
                iconBg: 'bg-primary-50', iconClr: 'text-primary-600',
                title: 'Invoices',
                desc: 'Itemized bills for every visit with tax breakdown and due dates.',
              },
              {
                icon: ShieldCheck,
                iconBg: 'bg-secondary-50', iconClr: 'text-secondary-600',
                title: 'Secure Payments',
                desc: 'Pay online with UPI, cards, or net banking — all protected and verified.',
              },
              {
                icon: TrendingDown,
                iconBg: 'bg-blue-50', iconClr: 'text-blue-600',
                title: 'Payment History',
                desc: 'A complete log of every payment, refund, and adjustment on your account.',
              },
              {
                icon: Wallet,
                iconBg: 'bg-amber-50', iconClr: 'text-amber-600',
                title: 'Credit Notes',
                desc: 'Any refunds or credits show up here — ready to use on your next invoice.',
              },
            ].map((feat) => (
              <div key={feat.title} className="flex items-start gap-3 p-4 rounded-xl bg-neutral-50 border border-neutral-100">
                <div className={`w-10 h-10 rounded-xl ${feat.iconBg} flex items-center justify-center shrink-0`}>
                  <feat.icon className={`h-5 w-5 ${feat.iconClr}`} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-neutral-800">{feat.title}</p>
                  <p className="text-xs text-neutral-500 mt-0.5 leading-relaxed">{feat.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  /* ── Main data view ── */
  return (
    <div className="max-w-[1280px] mx-auto w-full space-y-6">

      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-5 py-3 rounded-xl shadow-[var(--shadow-lg)] text-sm font-medium flex items-center gap-2 ${
          toast.type === 'success' ? 'bg-secondary-600 text-white' : 'bg-red-600 text-white'
        }`}>
          {toast.type === 'success' ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          {toast.msg}
        </div>
      )}

      {/* ═══ ROW 0: Header ═══ */}
      <div className="animate-[fadeUp_0.4s_ease-out_both]">
        <h1 className="text-2xl font-semibold font-display text-neutral-900">Billing &amp; Payments</h1>
        <p className="text-sm text-neutral-600 mt-1">Track invoices, pay online, and review your account history</p>
      </div>

      {/* ═══ ROW 1: Summary Hero ═══ */}
      <div
        className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary-600 via-primary-700 to-primary-800 p-6 md:p-8 text-white animate-[fadeUp_0.4s_ease-out_both]"
        style={{ animationDelay: '100ms' }}
      >
        <div className="absolute -top-16 -right-16 w-48 h-48 rounded-full bg-white/5" />
        <div className="absolute -bottom-12 -left-12 w-36 h-36 rounded-full bg-white/5" />

        <div className="relative z-10 grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
          {/* Outstanding — prominent */}
          <div className="md:col-span-1">
            <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-primary-200">Outstanding</span>
            <p className="mt-1 text-3xl md:text-4xl font-bold font-display tabular-nums">
              {money(totalOutstanding)}
            </p>
            <p className="text-xs text-primary-200 mt-1">
              across {outstandingInvoices.length} invoice{outstandingInvoices.length !== 1 ? 's' : ''}
            </p>
            {totalOutstanding > 0 && outstandingInvoices.length > 0 && (
              <button
                onClick={() => {
                  document.getElementById('invoices-section')?.scrollIntoView({ behavior: 'smooth' });
                  setInvoiceView('outstanding');
                }}
                className="mt-4 h-10 px-5 text-xs font-bold bg-white text-primary-700 rounded-lg hover:bg-primary-50 shadow-[var(--shadow-md)] transition-all duration-200 flex items-center gap-2"
              >
                <CreditCard className="h-4 w-4" /> Pay Now
              </button>
            )}
          </div>

          {/* Stats column */}
          <div className="md:col-span-2 grid grid-cols-2 md:grid-cols-3 gap-4">
            <HeroStat
              label="Paid"
              value={money(totalPaid)}
              Icon={TrendingUp}
            />
            <HeroStat
              label="Invoiced"
              value={money(totalInvoiced)}
              Icon={Receipt}
            />
            <HeroStat
              label="Credit"
              value={money(availableCredit)}
              Icon={Wallet}
            />
            {/* Progress */}
            <div className="col-span-2 md:col-span-3">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] font-medium text-primary-200">Paid progress</span>
                <span className="text-[11px] font-bold tabular-nums">{paidPct}%</span>
              </div>
              <div className="h-2 bg-white/15 rounded-full overflow-hidden">
                <div className="h-full rounded-full bg-white transition-all duration-700" style={{ width: `${paidPct}%` }} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ═══ ROW 2: Invoices ═══ */}
      <div
        id="invoices-section"
        className={`${CARD} p-5 animate-[fadeUp_0.4s_ease-out_both]`}
        style={{ animationDelay: '200ms' }}
      >
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary-50 flex items-center justify-center">
              <Receipt className="h-5 w-5 text-primary-600" />
            </div>
            <div>
              <h2 className="text-[15px] font-semibold font-display text-neutral-900">Invoices</h2>
              <p className="text-xs text-neutral-500">{invoiceTotal || 0} total</p>
            </div>
          </div>
          <div className="flex bg-neutral-100 rounded-lg p-0.5 gap-0.5">
            {INVOICE_VIEWS.map((v) => (
              <button
                key={v.key}
                onClick={() => setInvoiceView(v.key)}
                className={`text-[11px] px-2.5 py-1 rounded-md font-medium transition-all ${
                  invoiceView === v.key
                    ? 'bg-white text-neutral-900 shadow-sm'
                    : 'text-neutral-500 hover:text-neutral-700'
                }`}
              >
                {v.label}
              </button>
            ))}
          </div>
        </div>

        {invoicesLoading ? (
          <div className="space-y-3">
            <Shimmer className="h-20 w-full" />
            <Shimmer className="h-20 w-full" />
            <Shimmer className="h-20 w-full" />
          </div>
        ) : invoices.length === 0 ? (
          <EmptyState
            icon={invoiceView === 'outstanding' ? ShieldCheck : Receipt}
            msg={
              invoiceView === 'outstanding'
                ? 'All caught up — no outstanding invoices'
                : invoiceView === 'paid'
                  ? 'No paid invoices yet'
                  : 'No invoices found'
            }
          />
        ) : (
          <div className="space-y-2">
            {invoices.map((inv) => {
              const st = INVOICE_STATUS[inv.status] || INVOICE_STATUS.draft;
              const remaining = (inv.totalAmount || 0) - (inv.paidAmount || 0);
              const canPay = ['sent', 'partially_paid', 'overdue'].includes(inv.status) && remaining > 0;

              return (
                <div
                  key={inv._id}
                  className="rounded-xl bg-neutral-50 border border-neutral-100 hover:bg-neutral-100/50 hover:border-neutral-200 transition-colors overflow-hidden"
                >
                  <div className="p-4 flex flex-col sm:flex-row sm:items-center gap-4">
                    {/* Invoice info */}
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-white border border-neutral-200 flex items-center justify-center shrink-0">
                        <FileText className="h-5 w-5 text-neutral-400" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-semibold text-neutral-900 truncate">
                            {inv.invoiceNumber}
                          </p>
                          <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full flex items-center gap-1 ${st.bg} ${st.text}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />
                            {st.label}
                          </span>
                        </div>
                        <p className="text-xs text-neutral-500 mt-0.5">
                          {inv.doctor?.name ? `Dr. ${stripDrPrefix(inv.doctor.name)} · ` : ''}{fmtDate(inv.createdAt)}
                          {inv.dueDate && inv.status !== 'paid' && <span> · due {fmtDate(inv.dueDate)}</span>}
                        </p>
                        {(inv.items || []).length > 0 && (
                          <p className="text-[11px] text-neutral-400 mt-0.5 truncate">
                            {(inv.items || []).slice(0, 2).map((i) => i.description).join(' · ')}
                            {inv.items.length > 2 && ` +${inv.items.length - 2} more`}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Amount + actions */}
                    <div className="flex items-center justify-between sm:justify-end gap-4 shrink-0">
                      <div className="text-right">
                        <p className="text-base font-bold font-display tabular-nums text-neutral-900">
                          {money(inv.totalAmount)}
                        </p>
                        {inv.paidAmount > 0 && inv.paidAmount < inv.totalAmount && (
                          <p className="text-[11px] text-amber-700 font-medium tabular-nums">
                            {money(remaining)} due
                          </p>
                        )}
                        {inv.status === 'paid' && (
                          <p className="text-[11px] text-secondary-600 font-medium flex items-center gap-0.5 justify-end">
                            <CheckCircle2 className="h-3 w-3" /> Paid
                          </p>
                        )}
                      </div>

                      <div className="flex gap-1.5">
                        <button
                          onClick={() => handleDownload(inv)}
                          disabled={downloadingId === inv._id}
                          className="w-9 h-9 rounded-lg bg-white border border-neutral-200 flex items-center justify-center text-neutral-400 hover:text-primary-600 hover:border-primary-200 transition disabled:opacity-50"
                          title="Download PDF"
                        >
                          {downloadingId === inv._id
                            ? <Loader2 className="h-4 w-4 animate-spin" />
                            : <Download className="h-4 w-4" />}
                        </button>
                        {canPay && (
                          <button
                            onClick={() => handlePay(inv)}
                            disabled={payingId === inv._id}
                            className="h-9 px-3.5 text-xs font-semibold bg-primary-600 text-white rounded-lg hover:bg-primary-700 shadow-[var(--shadow-sm)] hover:shadow-[var(--shadow-md)] transition-all disabled:opacity-50 inline-flex items-center gap-1.5"
                          >
                            {payingId === inv._id
                              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              : <CreditCard className="h-3.5 w-3.5" />}
                            Pay
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Partial-paid progress */}
                  {inv.paidAmount > 0 && inv.paidAmount < inv.totalAmount && (
                    <div className="h-1 bg-neutral-100">
                      <div
                        className="h-full bg-amber-500 transition-all duration-500"
                        style={{ width: `${Math.round((inv.paidAmount / inv.totalAmount) * 100)}%` }}
                      />
                    </div>
                  )}
                </div>
              );
            })}

            {invoiceTotal > PAGE && (
              <Pagination page={invoicePage} limit={PAGE} total={invoiceTotal} onChange={setInvoicePage} />
            )}
          </div>
        )}
      </div>

      {/* ═══ ROW 3: Activity + Credits ═══ */}
      <div
        className="grid grid-cols-1 lg:grid-cols-12 gap-4 animate-[fadeUp_0.4s_ease-out_both]"
        style={{ animationDelay: '300ms' }}
      >
        {/* Ledger / Activity */}
        <div className="lg:col-span-7">
          <div className={`${CARD} p-5 h-full`}>
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
                <Clock className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <h2 className="text-[15px] font-semibold font-display text-neutral-900">Activity</h2>
                <p className="text-xs text-neutral-500">Payments, refunds &amp; adjustments</p>
              </div>
            </div>

            {ledgerLoading ? (
              <div className="space-y-3">
                <Shimmer className="h-16 w-full" />
                <Shimmer className="h-16 w-full" />
                <Shimmer className="h-16 w-full" />
              </div>
            ) : ledger.length === 0 ? (
              <EmptyState icon={Clock} msg="No activity yet" />
            ) : (
              <div className="space-y-1">
                {ledger.map((entry) => {
                  const isCredit = entry.type === 'credit';
                  const isRefund = entry.source === 'refund';
                  return (
                    <div key={entry._id} className="flex items-start gap-3 py-2.5 px-2 rounded-lg hover:bg-neutral-50 transition-colors">
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                        isCredit ? 'bg-secondary-50' : 'bg-amber-50'
                      }`}>
                        {isCredit
                          ? <ArrowDownLeft className={`h-4 w-4 text-secondary-600`} />
                          : <ArrowUpRight className={`h-4 w-4 text-amber-600`} />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline justify-between gap-2">
                          <p className="text-sm font-medium text-neutral-800 truncate">
                            {LEDGER_SOURCE_LABEL[entry.source] || entry.source || 'Transaction'}
                          </p>
                          <p className={`text-sm font-bold tabular-nums font-display shrink-0 ${
                            isCredit ? 'text-secondary-700' : 'text-amber-700'
                          }`}>
                            {isCredit ? '+' : '−'}{money(entry.amount)}
                          </p>
                        </div>
                        <div className="flex items-center justify-between gap-2 mt-0.5">
                          <p className="text-[11px] text-neutral-500 truncate">
                            {entry.description || (isRefund ? 'Refunded to you' : 'Paid')}
                          </p>
                          <p className="text-[11px] font-mono text-neutral-400 shrink-0">{relDate(entry.createdAt)}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Credit notes */}
        <div className="lg:col-span-5">
          <div className={`${CARD} p-5 h-full`}>
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-xl bg-secondary-50 flex items-center justify-center">
                <Wallet className="h-5 w-5 text-secondary-600" />
              </div>
              <div>
                <h2 className="text-[15px] font-semibold font-display text-neutral-900">Credit Notes</h2>
                <p className="text-xs text-neutral-500">Refunds &amp; credits on your account</p>
              </div>
            </div>

            {creditsLoading ? (
              <div className="space-y-3">
                <Shimmer className="h-20 w-full" />
                <Shimmer className="h-20 w-full" />
              </div>
            ) : credits.length === 0 ? (
              <EmptyState icon={Wallet} msg="No credit notes" />
            ) : (
              <div className="space-y-2">
                {credits.map((cn) => {
                  const st = CREDIT_STATUS[cn.status] || CREDIT_STATUS.draft;
                  const reasonLabel = (cn.reason || 'other').replace(/_/g, ' ');
                  return (
                    <div key={cn._id} className="p-3 rounded-xl bg-neutral-50 border border-neutral-100">
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <p className="text-xs font-semibold text-neutral-700 font-mono truncate">{cn.creditNoteNumber}</p>
                        <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full shrink-0 ${st.bg} ${st.text}`}>
                          {st.label}
                        </span>
                      </div>
                      <p className="text-[11px] text-neutral-500 capitalize">{reasonLabel}</p>
                      <div className="flex items-baseline justify-between mt-2">
                        <span className="text-[11px] text-neutral-400">
                          {cn.validUntil && cn.status === 'issued'
                            ? `Expires ${fmtDate(cn.validUntil)}`
                            : fmtDate(cn.createdAt)}
                        </span>
                        <span className="text-base font-bold font-display tabular-nums text-secondary-700">
                          {money(cn.totalAmount)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Sub-components ───────────────────────────── */

function HeroStat({ label, value, Icon }) {
  return (
    <div className="bg-white/10 backdrop-blur-sm rounded-xl p-3">
      <div className="flex items-center gap-1.5 text-primary-200 mb-1">
        <Icon className="h-3.5 w-3.5" />
        <span className="text-[10px] font-bold uppercase tracking-wider">{label}</span>
      </div>
      <p className="text-base md:text-lg font-bold font-display tabular-nums">{value}</p>
    </div>
  );
}

function EmptyState({ icon: Icon, msg }) {
  return (
    <div className="py-10 flex flex-col items-center gap-3">
      <div className="w-14 h-14 rounded-2xl bg-neutral-50 flex items-center justify-center">
        <Icon className="h-6 w-6 text-neutral-300" />
      </div>
      <p className="text-sm font-medium text-neutral-500">{msg}</p>
    </div>
  );
}
