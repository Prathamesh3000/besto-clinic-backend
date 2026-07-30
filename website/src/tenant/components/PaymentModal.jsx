import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Banknote, Smartphone, CreditCard, Shield, Wallet, Split,
  Plus, Trash2, AlertCircle, CheckCircle, ChevronDown, IndianRupee,
} from 'lucide-react';
import { Modal } from '../../platform/components/shared';
import {
  recordPaymentForInvoice,
  createGatewayOrder,
  verifyGatewayPayment,
} from '../api';

// ─── Design tokens (matching Billing.jsx) ──────
const inputCls =
  'w-full px-3 py-2 border border-neutral-300/60 rounded-xl text-sm text-neutral-900 placeholder:text-neutral-900/30 focus:outline-none focus:ring-2 focus:ring-primary-600/20 focus:border-primary-600 transition';
const labelCls = 'block text-xs font-medium text-neutral-900/60 mb-1.5';
const btnPrimary =
  'px-5 py-2 text-sm font-semibold text-white rounded-xl bg-gradient-to-r from-primary-500 to-primary-600 hover:from-primary-600 hover:to-primary-700 shadow-sm shadow-primary-600/20 transition disabled:opacity-50';
const btnSecondary =
  'px-4 py-2 text-sm font-medium text-neutral-900/60 bg-neutral-200/80 rounded-xl hover:bg-neutral-300 transition';

// ─── Payment mode config ───────────────────────
const PAYMENT_MODES = [
  { key: 'cash',           label: 'Cash',           icon: Banknote },
  { key: 'upi',            label: 'UPI',            icon: Smartphone },
  { key: 'card',           label: 'Card',           icon: CreditCard },
  { key: 'insurance',      label: 'Insurance',      icon: Shield },
  { key: 'credit_balance', label: 'Credit Balance', icon: Wallet },
  { key: 'split',          label: 'Split Payment',  icon: Split },
];

const SPLIT_MODES = PAYMENT_MODES.filter((m) => m.key !== 'split');

const fmt = (n) =>
  Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const EMPTY_SPLIT_LINE = { mode: 'cash', amount: '', reference: '' };

// ─── Mode-selection pill ───────────────────────
function ModePill({ mode, selected, onClick }) {
  const Icon = mode.icon;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-medium border transition ${
        selected
          ? 'border-primary-600 bg-primary-50 text-primary-700 shadow-sm shadow-primary-600/10'
          : 'border-neutral-300/60 bg-white text-neutral-900/60 hover:border-primary-300 hover:text-primary-600'
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
      {mode.label}
    </button>
  );
}

// ─── Main Component ────────────────────────────
export default function PaymentModal({ open, onClose, invoice, onSuccess }) {
  // ── Double-submit prevention ──
  const submittingRef = useRef(false);
  const idempotencyKeyRef = useRef('');

  // ── State ──
  const [mode, setMode] = useState('cash');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  // Partial payment
  const [isPartial, setIsPartial] = useState(false);
  const [customAmount, setCustomAmount] = useState('');

  // Cash-specific
  const [amountTendered, setAmountTendered] = useState('');

  // Card / UPI reference
  const [reference, setReference] = useState('');

  // Insurance
  const [selectedClaim, setSelectedClaim] = useState('');

  // Split payment lines
  const [splitLines, setSplitLines] = useState([{ ...EMPTY_SPLIT_LINE }]);

  // ── Derived values ──
  const invoiceTotal = invoice?.totalAmount ?? invoice?.amount ?? 0;
  const balanceDue = invoice?.balanceDue ?? invoiceTotal;
  const creditAvailable = invoice?.patient?.creditBalance ?? invoice?.creditBalance ?? 0;
  const insuranceClaims = invoice?.insuranceClaims || invoice?.claims || [];

  const payableAmount = useMemo(() => {
    if (isPartial && customAmount) return Number(customAmount);
    return balanceDue;
  }, [isPartial, customAmount, balanceDue]);

  const splitTotal = useMemo(
    () => splitLines.reduce((sum, l) => sum + (Number(l.amount) || 0), 0),
    [splitLines],
  );

  const cashChange = useMemo(() => {
    const tendered = Number(amountTendered) || 0;
    return tendered > payableAmount ? tendered - payableAmount : 0;
  }, [amountTendered, payableAmount]);

  // ── Reset on open ──
  useEffect(() => {
    if (open) {
      setMode('cash');
      setLoading(false);
      setError('');
      setSuccess(false);
      setIsPartial(false);
      setCustomAmount('');
      setAmountTendered('');
      setReference('');
      setSelectedClaim('');
      setSplitLines([{ ...EMPTY_SPLIT_LINE }]);
      submittingRef.current = false;
      idempotencyKeyRef.current = `pay_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    }
  }, [open]);

  // ── Split helpers ──
  const addSplitLine = () => setSplitLines((prev) => [...prev, { ...EMPTY_SPLIT_LINE }]);

  const removeSplitLine = (idx) =>
    setSplitLines((prev) => prev.filter((_, i) => i !== idx));

  const updateSplitLine = (idx, field, value) =>
    setSplitLines((prev) =>
      prev.map((line, i) => (i === idx ? { ...line, [field]: value } : line)),
    );

  // ── Razorpay checkout ──
  const openRazorpay = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const invoiceId = invoice._id || invoice.id;
      const order = await createGatewayOrder({
        invoiceId,
        amount: payableAmount,
      });

      const options = {
        key: order.razorpayKeyId || order.key,
        amount: order.amount,
        currency: order.currency || 'INR',
        name: 'BestoClinic',
        description: `Payment for ${invoice.invoiceNumber || 'Invoice'}`,
        order_id: order.orderId || order.id,
        handler: async (response) => {
          try {
            await verifyGatewayPayment({
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
              invoiceId,
            });
            setSuccess(true);
            setTimeout(() => {
              onSuccess?.();
              onClose();
            }, 1200);
          } catch (err) {
            setError(err.message || 'Payment verification failed');
          } finally {
            setLoading(false);
          }
        },
        modal: {
          ondismiss: () => setLoading(false),
        },
        prefill: {
          name: invoice?.patient?.name || '',
          email: invoice?.patient?.email || '',
          contact: invoice?.patient?.phone || '',
        },
        theme: { color: '#6d5ff5' },
      };

      const rzp = new window.Razorpay(options);
      rzp.on('payment.failed', (resp) => {
        setError(resp.error?.description || 'Payment failed');
        setLoading(false);
      });
      rzp.open();
    } catch (err) {
      setError(err.message || 'Could not initiate payment gateway');
      setLoading(false);
    }
  }, [invoice, payableAmount, onSuccess, onClose]);

  // ── Validate before submit ──
  const validate = useCallback(() => {
    if (payableAmount <= 0) return 'Payment amount must be greater than zero';
    if (isPartial && payableAmount > balanceDue) return 'Amount cannot exceed balance due';

    if (mode === 'split') {
      if (splitLines.length < 2) return 'Split payment requires at least two lines';
      const hasEmpty = splitLines.some((l) => !l.amount || Number(l.amount) <= 0);
      if (hasEmpty) return 'All split lines must have a valid amount';
      if (Math.abs(splitTotal - payableAmount) > 0.01)
        return `Split total (${fmt(splitTotal)}) must equal payment amount (${fmt(payableAmount)})`;
    }

    if ((mode === 'upi' || mode === 'card') && !reference.trim())
      return 'Reference number is required';

    if (mode === 'credit_balance' && payableAmount > creditAvailable)
      return 'Insufficient credit balance';

    return null;
  }, [mode, payableAmount, balanceDue, isPartial, splitLines, splitTotal, reference, creditAvailable]);

  // ── Submit payment ──
  const handleSubmit = async () => {
    // Mutex guard: prevent double-submit even with React async batching
    if (submittingRef.current) return;
    submittingRef.current = true;

    const err = validate();
    if (err) { setError(err); submittingRef.current = false; return; }

    setLoading(true);
    setError('');

    try {
      const invoiceId = invoice._id || invoice.id;

      if (mode === 'card' && !reference.trim()) {
        // For card without manual reference, use Razorpay
        await openRazorpay();
        return;
      }

      const payload = {
        amount: payableAmount,
        mode,
        idempotencyKey: idempotencyKeyRef.current,
        ...(reference.trim() && { reference: reference.trim() }),
        ...(mode === 'insurance' && selectedClaim && { insuranceClaim: selectedClaim }),
        ...(mode === 'cash' && { amountTendered: Number(amountTendered) || payableAmount }),
        ...(mode === 'split' && {
          splitLines: splitLines.map((l) => ({
            mode: l.mode,
            amount: Number(l.amount),
            ...(l.reference.trim() && { reference: l.reference.trim() }),
          })),
        }),
        partial: isPartial,
      };

      await recordPaymentForInvoice(invoiceId, payload);
      setSuccess(true);
      setTimeout(() => {
        onSuccess?.();
        onClose();
      }, 1200);
    } catch (err) {
      setError(err.message || 'Payment recording failed');
    } finally {
      setLoading(false);
      submittingRef.current = false;
    }
  };

  // ─── Render ──────────────────────────────────
  if (!invoice) return null;

  return (
    <Modal open={open} onClose={onClose} title="Record Payment" wide>
      <AnimatePresence mode="wait">
        {success ? (
          <motion.div
            key="success"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center justify-center py-10 gap-3"
          >
            <CheckCircle className="h-12 w-12 text-emerald-500" />
            <p className="text-sm font-semibold text-neutral-900">Payment recorded successfully</p>
          </motion.div>
        ) : (
          <motion.div
            key="form"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-5"
          >
            {/* ── Invoice summary ── */}
            <div className="flex items-center justify-between bg-neutral-50/60 rounded-xl p-3 border border-neutral-300/40">
              <div>
                <p className="text-xs text-neutral-900/50">
                  Invoice {invoice.invoiceNumber || '—'}
                </p>
                <p className="text-sm font-semibold text-neutral-900 mt-0.5">
                  Balance Due: <IndianRupee className="inline h-3.5 w-3.5 -mt-0.5" />
                  {fmt(balanceDue)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-neutral-900/50">Patient</p>
                <p className="text-sm font-medium text-neutral-900 mt-0.5">
                  {invoice.patient?.name || invoice.patientName || 'N/A'}
                </p>
              </div>
            </div>

            {/* ── Partial payment toggle ── */}
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={isPartial}
                  onChange={(e) => setIsPartial(e.target.checked)}
                  className="h-4 w-4 rounded border-neutral-300 text-primary-600 focus:ring-primary-500"
                />
                <span className="text-xs font-medium text-neutral-900/60">Partial payment</span>
              </label>

              {isPartial && (
                <div className="w-36">
                  <input
                    type="number"
                    min="1"
                    max={balanceDue}
                    step="0.01"
                    placeholder="Amount"
                    value={customAmount}
                    onChange={(e) => setCustomAmount(e.target.value)}
                    className={inputCls}
                  />
                </div>
              )}
            </div>

            {/* ── Payment amount display ── */}
            <div className="text-center">
              <p className="text-xs text-neutral-900/40 mb-1">Paying</p>
              <p className="text-2xl font-bold font-display text-neutral-900">
                <IndianRupee className="inline h-5 w-5 -mt-1" />
                {fmt(payableAmount)}
              </p>
            </div>

            {/* ── Mode selector ── */}
            <div>
              <label className={labelCls}>Payment Mode</label>
              <div className="flex flex-wrap gap-2">
                {PAYMENT_MODES.map((m) => (
                  <ModePill
                    key={m.key}
                    mode={m}
                    selected={mode === m.key}
                    onClick={() => setMode(m.key)}
                  />
                ))}
              </div>
            </div>

            {/* ── Mode-specific fields ── */}
            <div className="min-h-[120px]">
              <AnimatePresence mode="wait">
                {/* Cash */}
                {mode === 'cash' && (
                  <motion.div
                    key="cash"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    className="space-y-3"
                  >
                    <div>
                      <label className={labelCls}>Amount Tendered</label>
                      <input
                        type="number"
                        min={payableAmount}
                        step="0.01"
                        placeholder={fmt(payableAmount)}
                        value={amountTendered}
                        onChange={(e) => setAmountTendered(e.target.value)}
                        className={inputCls}
                      />
                    </div>
                    {cashChange > 0 && (
                      <div className="flex items-center justify-between bg-emerald-50/60 rounded-xl px-3 py-2 border border-emerald-200/60">
                        <span className="text-xs font-medium text-emerald-700">Change to return</span>
                        <span className="text-sm font-bold text-emerald-700">
                          <IndianRupee className="inline h-3.5 w-3.5 -mt-0.5" />
                          {fmt(cashChange)}
                        </span>
                      </div>
                    )}
                  </motion.div>
                )}

                {/* UPI */}
                {mode === 'upi' && (
                  <motion.div
                    key="upi"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                  >
                    <label className={labelCls}>UPI Transaction Reference</label>
                    <input
                      placeholder="e.g. 412345678901"
                      value={reference}
                      onChange={(e) => setReference(e.target.value)}
                      className={inputCls}
                    />
                  </motion.div>
                )}

                {/* Card */}
                {mode === 'card' && (
                  <motion.div
                    key="card"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    className="space-y-3"
                  >
                    <div>
                      <label className={labelCls}>Card Reference / Approval Code</label>
                      <input
                        placeholder="Enter reference or use Razorpay below"
                        value={reference}
                        onChange={(e) => setReference(e.target.value)}
                        className={inputCls}
                      />
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-neutral-900/40 mb-2">Or pay online via Razorpay</p>
                      <button
                        type="button"
                        onClick={openRazorpay}
                        disabled={loading}
                        className={`${btnPrimary} inline-flex items-center gap-2`}
                      >
                        <CreditCard className="h-4 w-4" />
                        Pay with Razorpay
                      </button>
                    </div>
                  </motion.div>
                )}

                {/* Insurance */}
                {mode === 'insurance' && (
                  <motion.div
                    key="insurance"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    className="space-y-3"
                  >
                    {insuranceClaims.length > 0 ? (
                      <div>
                        <label className={labelCls}>Select Insurance Claim</label>
                        <div className="relative">
                          <select
                            value={selectedClaim}
                            onChange={(e) => setSelectedClaim(e.target.value)}
                            className={`${inputCls} appearance-none pr-8`}
                          >
                            <option value="">Choose a claim...</option>
                            {insuranceClaims.map((claim) => (
                              <option key={claim._id || claim.id} value={claim._id || claim.id}>
                                {claim.claimNumber || '—'}
                                {' - '}
                                {claim.provider?.name || claim.providerName || 'Unknown provider'}
                                {' ('}INR {fmt(claim.claimAmount || claim.approvedAmount || 0)}{')'}
                              </option>
                            ))}
                          </select>
                          <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-900/30 pointer-events-none" />
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 bg-amber-50/60 rounded-xl px-3 py-3 border border-amber-200/60">
                        <AlertCircle className="h-4 w-4 text-amber-600 shrink-0" />
                        <p className="text-xs text-amber-700">
                          No insurance claims linked to this invoice. Create a claim in the Insurance tab first.
                        </p>
                      </div>
                    )}
                    <div>
                      <label className={labelCls}>Reference / Pre-auth Code (optional)</label>
                      <input
                        placeholder="Pre-authorization or reference code"
                        value={reference}
                        onChange={(e) => setReference(e.target.value)}
                        className={inputCls}
                      />
                    </div>
                  </motion.div>
                )}

                {/* Credit Balance */}
                {mode === 'credit_balance' && (
                  <motion.div
                    key="credit"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    className="space-y-3"
                  >
                    <div className="flex items-center justify-between bg-neutral-50/60 rounded-xl px-3 py-3 border border-neutral-300/40">
                      <span className="text-xs font-medium text-neutral-900/60">Available Credit</span>
                      <span className="text-sm font-bold text-neutral-900">
                        <IndianRupee className="inline h-3.5 w-3.5 -mt-0.5" />
                        {fmt(creditAvailable)}
                      </span>
                    </div>
                    {payableAmount > creditAvailable && (
                      <div className="flex items-center gap-2 bg-red-50/60 rounded-xl px-3 py-2 border border-red-200/60">
                        <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />
                        <p className="text-xs text-red-600">
                          Insufficient credit. Available: INR {fmt(creditAvailable)}, Required: INR {fmt(payableAmount)}
                        </p>
                      </div>
                    )}
                  </motion.div>
                )}

                {/* Split Payment */}
                {mode === 'split' && (
                  <motion.div
                    key="split"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    className="space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <label className={labelCls}>Payment Lines</label>
                      <button
                        type="button"
                        onClick={addSplitLine}
                        className="text-xs text-primary-600 hover:text-primary-700 font-medium flex items-center gap-1"
                      >
                        <Plus className="h-3 w-3" /> Add Line
                      </button>
                    </div>

                    <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                      {splitLines.map((line, idx) => (
                        <div
                          key={idx}
                          className="flex items-center gap-2 bg-neutral-50/50 rounded-xl p-2.5 border border-neutral-300/40"
                        >
                          <div className="relative w-28 shrink-0">
                            <select
                              value={line.mode}
                              onChange={(e) => updateSplitLine(idx, 'mode', e.target.value)}
                              className={`${inputCls} text-xs appearance-none pr-7`}
                            >
                              {SPLIT_MODES.map((m) => (
                                <option key={m.key} value={m.key}>{m.label}</option>
                              ))}
                            </select>
                            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-neutral-900/30 pointer-events-none" />
                          </div>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            placeholder="Amount"
                            value={line.amount}
                            onChange={(e) => updateSplitLine(idx, 'amount', e.target.value)}
                            className={`${inputCls} w-28 shrink-0`}
                          />
                          <input
                            placeholder="Ref (optional)"
                            value={line.reference}
                            onChange={(e) => updateSplitLine(idx, 'reference', e.target.value)}
                            className={`${inputCls} flex-1 min-w-0`}
                          />
                          {splitLines.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeSplitLine(idx)}
                              className="p-1.5 rounded-lg hover:bg-red-50 text-neutral-900/30 hover:text-red-600 transition shrink-0"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>

                    {/* Split total vs required */}
                    <div className="flex items-center justify-between text-xs px-1">
                      <span className="text-neutral-900/50">
                        Split total: <span className="font-semibold text-neutral-900">{fmt(splitTotal)}</span>
                      </span>
                      <span className={`font-medium ${
                        Math.abs(splitTotal - payableAmount) < 0.01 ? 'text-emerald-600' : 'text-red-500'
                      }`}>
                        {Math.abs(splitTotal - payableAmount) < 0.01
                          ? 'Balanced'
                          : `Remaining: ${fmt(payableAmount - splitTotal)}`}
                      </span>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* ── Error ── */}
            {error && (
              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-2 bg-red-50/60 rounded-xl px-3 py-2.5 border border-red-200/60"
              >
                <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />
                <p className="text-xs text-red-600">{error}</p>
              </motion.div>
            )}

            {/* ── Actions ──
                items-center matters: without it the row inherits the flex
                default of items-stretch, and when the modal body is taller than
                its content the Cancel / Record Payment buttons stretch to fill
                the leftover vertical space. */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-neutral-300/40">
              <button type="button" onClick={onClose} disabled={loading} className={btnSecondary}>
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={loading || (mode === 'credit_balance' && payableAmount > creditAvailable)}
                className={`${btnPrimary} inline-flex items-center gap-2`}
              >
                {loading ? (
                  <>
                    <span className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin shrink-0" />
                    Processing...
                  </>
                ) : (
                  <>
                    <CheckCircle className="h-4 w-4" />
                    Record Payment
                  </>
                )}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Modal>
  );
}
