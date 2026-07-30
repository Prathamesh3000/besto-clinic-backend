import { useState, useCallback, useRef, useEffect } from 'react';
import { AlertTriangle, X, Loader, CheckCircle2, XCircle } from 'lucide-react';
import { bulkCancelRefundAppointments } from '../../api';
import ConflictAppointmentCard from './ConflictAppointmentCard';

export default function ConflictResolutionModal({ open, onClose, conflicts = [], overrideReason, branchId }) {
  const overlayRef = useRef(null);
  const [resolvedMap, setResolvedMap] = useState({});
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkResult, setBulkResult] = useState(null);

  // Escape key handler
  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  const handleResolved = useCallback((appointmentId, action) => {
    setResolvedMap((prev) => ({ ...prev, [appointmentId]: action }));
  }, []);

  const resolvedCount = Object.keys(resolvedMap).length;
  const totalCount = conflicts.length;
  const allResolved = resolvedCount >= totalCount;

  // Paid but unresolved appointments (for bulk action)
  const unresolvedPaid = conflicts.filter(
    (a) => !resolvedMap[a._id] && a.payment,
  );

  const handleBulkCancel = async () => {
    if (unresolvedPaid.length === 0) return;
    setBulkLoading(true);
    setBulkResult(null);
    try {
      const res = await bulkCancelRefundAppointments({
        appointmentIds: unresolvedPaid.map((a) => a._id),
        reason: overrideReason || 'Doctor schedule change — bulk cancellation',
      });
      const data = res.data || res;
      setBulkResult(data);
      // Mark succeeded as resolved
      for (const s of (data.succeeded || [])) {
        setResolvedMap((prev) => ({ ...prev, [s.appointmentId]: 'refunded' }));
      }
    } catch (err) {
      setBulkResult({ error: err.message || 'Bulk operation failed' });
    } finally {
      setBulkLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-950/50 backdrop-blur-sm"
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
    >
      <div className="bg-white rounded-[20px] shadow-[var(--shadow-xl)] w-full mx-4 max-w-4xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-5 border-b border-neutral-200">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center flex-shrink-0 mt-0.5">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold font-display text-neutral-900">
                Schedule Conflict — {totalCount} Appointment{totalCount !== 1 ? 's' : ''} Affected
              </h3>
              {overrideReason && (
                <p className="text-sm text-neutral-500 mt-0.5">{overrideReason}</p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-neutral-100 text-neutral-500 hover:text-neutral-700 transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Progress bar */}
        <div className="px-6 py-3 border-b border-neutral-100 bg-neutral-50/50">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-neutral-600">
              Resolution Progress
            </span>
            <span className="text-xs font-semibold text-neutral-900">
              {resolvedCount}/{totalCount} resolved
            </span>
          </div>
          <div className="w-full h-2 rounded-full bg-neutral-200 overflow-hidden">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all duration-500 ease-out"
              style={{ width: `${totalCount > 0 ? (resolvedCount / totalCount) * 100 : 0}%` }}
            />
          </div>
        </div>

        {/* Appointment cards */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          <div className="space-y-4">
            {conflicts.map((appointment) => (
              <ConflictAppointmentCard
                key={appointment._id}
                appointment={appointment}
                overrideReason={overrideReason}
                branchId={branchId}
                onResolved={handleResolved}
              />
            ))}
          </div>
        </div>

        {/* Bulk result */}
        {bulkResult && (
          <div className="px-6 py-3 border-t border-neutral-100">
            {bulkResult.error ? (
              <div className="flex items-center gap-2 text-sm text-red-600">
                <XCircle className="h-4 w-4" />
                {bulkResult.error}
              </div>
            ) : (
              <div className="flex items-center gap-4 text-sm">
                {bulkResult.succeeded?.length > 0 && (
                  <span className="flex items-center gap-1 text-emerald-600">
                    <CheckCircle2 className="h-4 w-4" />
                    {bulkResult.succeeded.length} refunded
                  </span>
                )}
                {bulkResult.failed?.length > 0 && (
                  <span className="flex items-center gap-1 text-red-600">
                    <XCircle className="h-4 w-4" />
                    {bulkResult.failed.length} failed
                  </span>
                )}
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-neutral-200 bg-neutral-50/30">
          {unresolvedPaid.length > 0 && !allResolved ? (
            <button
              onClick={handleBulkCancel}
              disabled={bulkLoading}
              className="px-4 py-2.5 text-sm font-medium rounded-xl bg-red-50 hover:bg-red-100 text-red-600 transition-all disabled:opacity-50 flex items-center gap-2"
            >
              {bulkLoading && <Loader className="h-4 w-4 animate-spin" />}
              Cancel & Refund All ({unresolvedPaid.length})
            </button>
          ) : (
            <div />
          )}

          <button
            onClick={onClose}
            className={`px-5 py-2.5 text-sm font-medium rounded-xl transition-all ${
              allResolved
                ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                : 'border border-neutral-200 text-neutral-700 hover:bg-neutral-50'
            }`}
          >
            {allResolved ? 'All Resolved — Close' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  );
}
