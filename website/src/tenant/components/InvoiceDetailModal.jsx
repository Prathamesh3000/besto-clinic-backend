import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  FileText, User, Calendar, IndianRupee, CheckCircle, Clock,
  CreditCard, AlertCircle, X,
} from 'lucide-react';
import { Modal, Spinner, ErrorAlert } from '../../platform/components/shared';
import { getInvoicePayments } from '../api';

const fmt = (n) =>
  Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const PAYMENT_STATUS_STYLES = {
  pending:    { bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500' },
  processing: { bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-500' },
  completed:  { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  failed:     { bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-500' },
  refunded:   { bg: 'bg-purple-50', text: 'text-purple-700', dot: 'bg-purple-500' },
};

function StatusBadge({ status, styles }) {
  const s = styles[status] || { bg: 'bg-neutral-200', text: 'text-neutral-900/60', dot: 'bg-neutral-900/30' };
  const label = (status || 'N/A').replace(/_/g, ' ');
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium capitalize ${s.bg} ${s.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {label}
    </span>
  );
}

const modeBadge = (mode) => {
  const colors = {
    cash: 'bg-emerald-50 text-emerald-700',
    upi: 'bg-violet-50 text-violet-700',
    card: 'bg-blue-50 text-blue-700',
    insurance: 'bg-amber-50 text-amber-700',
    credit_balance: 'bg-pink-50 text-pink-700',
    split: 'bg-cyan-50 text-cyan-700',
  };
  return (
    <span className={`inline-flex items-center text-xs px-2 py-0.5 rounded-full font-medium capitalize ${colors[mode] || 'bg-neutral-200 text-neutral-900/60'}`}>
      {(mode || 'N/A').replace(/_/g, ' ')}
    </span>
  );
};

export default function InvoiceDetailModal({ open, onClose, invoice }) {
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open && invoice) {
      fetchPayments();
    }
  }, [open, invoice]);

  const fetchPayments = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await getInvoicePayments(invoice._id || invoice.id);
      setPayments(res.data || []);
    } catch (err) {
      setError(err.message || 'Failed to load payment history');
    } finally {
      setLoading(false);
    }
  };

  if (!invoice) return null;

  const totalAmount = invoice.totalAmount ?? invoice.amount ?? 0;
  const paidAmount = invoice.paidAmount ?? 0;
  const balanceDue = invoice.balanceDue ?? (totalAmount - paidAmount);
  const items = invoice.items || [];

  return (
    <Modal open={open} onClose={onClose} title="Invoice Details" wide>
      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h3 className="text-lg font-bold font-display text-neutral-900">
                {invoice.invoiceNumber || '—'}
              </h3>
              <StatusBadge
                status={invoice.status}
                styles={{
                  draft:     { bg: 'bg-neutral-200/80', text: 'text-neutral-900/60', dot: 'bg-neutral-900/30' },
                  sent:      { bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-500' },
                  paid:      { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
                  overdue:   { bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-500' },
                  cancelled: { bg: 'bg-neutral-200/80', text: 'text-neutral-900/50', dot: 'bg-neutral-900/25' },
                  refunded:  { bg: 'bg-purple-50', text: 'text-purple-700', dot: 'bg-purple-500' },
                  partially_paid: { bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500' },
                }}
              />
            </div>
            <div className="flex items-center gap-4 mt-2 text-xs text-neutral-900/50">
              <span className="flex items-center gap-1">
                <User className="h-3 w-3" />
                {invoice.patient?.name || invoice.patientName || 'N/A'}
              </span>
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {invoice.createdAt
                  ? new Date(invoice.createdAt).toLocaleDateString('en-IN', {
                      day: '2-digit', month: 'short', year: 'numeric'
                    })
                  : 'N/A'}
              </span>
            </div>
          </div>
        </div>

        {/* Financial Summary */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-neutral-50/60 rounded-xl p-3 border border-neutral-300/40">
            <p className="text-xs text-neutral-900/50 mb-1">Total Amount</p>
            <p className="text-lg font-bold text-neutral-900">
              <IndianRupee className="inline h-4 w-4 -mt-0.5" />
              {fmt(totalAmount)}
            </p>
          </div>
          <div className="bg-emerald-50/60 rounded-xl p-3 border border-emerald-200/40">
            <p className="text-xs text-emerald-600 mb-1">Paid Amount</p>
            <p className="text-lg font-bold text-emerald-700">
              <IndianRupee className="inline h-4 w-4 -mt-0.5" />
              {fmt(paidAmount)}
            </p>
          </div>
          <div className={`rounded-xl p-3 border ${
            balanceDue > 0
              ? 'bg-amber-50/60 border-amber-200/40'
              : 'bg-emerald-50/60 border-emerald-200/40'
          }`}>
            <p className={`text-xs mb-1 ${balanceDue > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
              Balance Due
            </p>
            <p className={`text-lg font-bold ${balanceDue > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>
              <IndianRupee className="inline h-4 w-4 -mt-0.5" />
              {fmt(balanceDue)}
            </p>
          </div>
        </div>

        {/* Line Items */}
        {items.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold text-neutral-900 mb-2 font-display">Line Items</h4>
            <div className="bg-neutral-50/40 rounded-xl border border-neutral-300/40 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-neutral-100/60 text-xs text-neutral-900/60">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium">Description</th>
                    <th className="text-center px-3 py-2 font-medium w-20">Qty</th>
                    <th className="text-right px-3 py-2 font-medium w-28">Unit Price</th>
                    <th className="text-right px-3 py-2 font-medium w-28">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-300/30">
                  {items.map((item, idx) => {
                    const itemTotal = (item.quantity || 1) * (item.unitPrice || 0);
                    return (
                      <tr key={idx} className="text-neutral-900">
                        <td className="px-3 py-2">{item.description}</td>
                        <td className="text-center px-3 py-2">{item.quantity || 1}</td>
                        <td className="text-right px-3 py-2">{fmt(item.unitPrice || 0)}</td>
                        <td className="text-right px-3 py-2 font-semibold">{fmt(itemTotal)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Payment History */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-semibold text-neutral-900 font-display">Payment History</h4>
            {loading && <Spinner inline className="h-4 w-4" />}
          </div>

          {error && <ErrorAlert message={error} />}

          {!loading && !error && (
            payments.length === 0 ? (
              <div className="bg-neutral-50/40 rounded-xl border border-neutral-300/40 p-6 text-center">
                <CreditCard className="h-8 w-8 text-neutral-900/20 mx-auto mb-2" />
                <p className="text-sm text-neutral-900/50">No payments recorded yet</p>
              </div>
            ) : (
              <div className="space-y-2">
                {payments.map((payment) => (
                  <motion.div
                    key={payment._id || payment.id}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-white rounded-xl border border-neutral-300/40 p-3 hover:border-primary-300/60 transition"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-primary-50 flex items-center justify-center">
                          <CreditCard className="h-4 w-4 text-primary-600" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            {modeBadge(payment.mode)}
                            <StatusBadge status={payment.status} styles={PAYMENT_STATUS_STYLES} />
                          </div>
                          <p className="text-xs text-neutral-900/50 mt-1">
                            {payment.createdAt
                              ? new Date(payment.createdAt).toLocaleString('en-IN', {
                                  day: '2-digit',
                                  month: 'short',
                                  year: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit'
                                })
                              : 'N/A'}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-base font-bold text-neutral-900">
                          <IndianRupee className="inline h-3.5 w-3.5 -mt-0.5" />
                          {fmt(payment.amount)}
                        </p>
                        {payment.gatewayPaymentId && (
                          <p className="text-xs text-neutral-900/40 mt-0.5 font-mono">
                            {payment.gatewayPaymentId.slice(-8)}
                          </p>
                        )}
                        {payment.reference && (
                          <p className="text-xs text-neutral-900/40 mt-0.5">
                            Ref: {payment.reference}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Split payment details */}
                    {payment.mode === 'split' && payment.splitLines && payment.splitLines.length > 0 && (
                      <div className="mt-2 pt-2 border-t border-neutral-300/30">
                        <p className="text-xs text-neutral-900/50 mb-1.5">Split Payment Breakdown:</p>
                        <div className="space-y-1">
                          {payment.splitLines.map((line, idx) => (
                            <div key={idx} className="flex items-center justify-between text-xs">
                              <span className="flex items-center gap-1.5">
                                {modeBadge(line.mode)}
                                {line.reference && (
                                  <span className="text-neutral-900/40">• Ref: {line.reference}</span>
                                )}
                              </span>
                              <span className="font-semibold text-neutral-900">
                                {fmt(line.amount)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </motion.div>
                ))}
              </div>
            )
          )}
        </div>

        {/* Notes */}
        {invoice.notes && (
          <div>
            <h4 className="text-sm font-semibold text-neutral-900 mb-2 font-display">Notes</h4>
            <div className="bg-neutral-50/40 rounded-xl border border-neutral-300/40 p-3">
              <p className="text-sm text-neutral-900/70">{invoice.notes}</p>
            </div>
          </div>
        )}

        {/* Due Date Warning */}
        {invoice.dueDate && balanceDue > 0 && (
          <div className="flex items-center gap-2 bg-amber-50/60 rounded-xl px-3 py-2.5 border border-amber-200/60">
            <Clock className="h-4 w-4 text-amber-600 shrink-0" />
            <p className="text-xs text-amber-700">
              Due date:{' '}
              <span className="font-semibold">
                {new Date(invoice.dueDate).toLocaleDateString('en-IN', {
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric'
                })}
              </span>
            </p>
          </div>
        )}

        {/* Close Button */}
        <div className="flex justify-end pt-3 border-t border-neutral-300/40">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-neutral-900/60 bg-neutral-200/80 rounded-xl hover:bg-neutral-300 transition"
          >
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
}
