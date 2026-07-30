import { useState } from 'react';
import { displayDate, displayTime } from '../../../utils/fakeUtcTime';
import {
  User, Clock, Calendar, CreditCard, Wallet, Phone,
  ArrowRight, CheckCircle2, Loader, RefreshCw, XCircle, Stethoscope,
  RotateCcw, Activity, AlertTriangle, Video,
} from 'lucide-react';
import {
  adminRescheduleAppointment,
  cancelAppointmentWithRefund,
  cancelAppointmentWithCredit,
  cancelUnpaidAppointment,
  markAppointmentContacted,
} from '../../api';
import RescheduleSlotPicker from './RescheduleSlotPicker';

const TYPE_CONFIG = {
  consultation: { label: 'Consultation', Icon: Stethoscope, color: 'text-primary-600' },
  follow_up: { label: 'Follow Up', Icon: RotateCcw, color: 'text-blue-600' },
  procedure: { label: 'Procedure', Icon: Activity, color: 'text-purple-600' },
  emergency: { label: 'Emergency', Icon: AlertTriangle, color: 'text-red-600' },
  teleconsult: { label: 'Teleconsult', Icon: Video, color: 'text-teal-600' },
};

const STATUS_BADGE = {
  requested: { bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500', label: 'Requested' },
  confirmed: { bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-500', label: 'Confirmed' },
  checked_in: { bg: 'bg-orange-50', text: 'text-orange-700', dot: 'bg-orange-500', label: 'Checked In' },
};

const RESOLUTION_BADGE = {
  rescheduled: { bg: 'bg-emerald-50', text: 'text-emerald-700', icon: RefreshCw, label: 'Rescheduled' },
  refunded: { bg: 'bg-blue-50', text: 'text-blue-700', icon: CreditCard, label: 'Refunded' },
  credited: { bg: 'bg-violet-50', text: 'text-violet-700', icon: Wallet, label: 'Wallet Credited' },
  contacted: { bg: 'bg-neutral-100', text: 'text-neutral-600', icon: Phone, label: 'Contacted' },
};

function calculateAge(dob) {
  if (!dob) return null;
  const diff = Date.now() - new Date(dob).getTime();
  return Math.floor(diff / (365.25 * 24 * 60 * 60 * 1000));
}

function getInitials(name) {
  return (name || 'P').split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
}

const gradients = [
  'from-blue-500 to-blue-600',
  'from-violet-500 to-violet-600',
  'from-teal-500 to-teal-600',
  'from-amber-500 to-amber-600',
  'from-rose-500 to-rose-600',
];

export default function ConflictAppointmentCard({ appointment, overrideReason, branchId, onResolved }) {
  const [mode, setMode] = useState('actions'); // 'actions' | 'reschedule' | 'confirm'
  const [actionLoading, setActionLoading] = useState(null); // 'reschedule' | 'refund' | 'credit' | 'cancel' | 'contacted'
  const [resolved, setResolved] = useState(appointment.conflictResolution?.status || null);
  const [error, setError] = useState('');

  const patient = appointment.patient || {};
  const payment = appointment.payment;
  const isPaid = !!payment;
  const paidAmount = payment?.amount || 0;
  const age = calculateAge(patient.dateOfBirth);
  const typeConfig = TYPE_CONFIG[appointment.type] || TYPE_CONFIG.consultation;
  const statusBadge = STATUS_BADGE[appointment.status] || STATUS_BADGE.requested;
  const grad = gradients[(patient.name || '').charCodeAt(0) % gradients.length];

  const reason = overrideReason || 'Doctor schedule change';

  const handleReschedule = async (newScheduledAt) => {
    setActionLoading('reschedule');
    setError('');
    try {
      await adminRescheduleAppointment(appointment._id, { newScheduledAt, reason });
      setResolved('rescheduled');
      onResolved?.(appointment._id, 'rescheduled');
    } catch (err) {
      setError(err.message || 'Reschedule failed');
    } finally {
      setActionLoading(null);
    }
  };

  const handleRefund = async () => {
    setActionLoading('refund');
    setError('');
    try {
      await cancelAppointmentWithRefund(appointment._id, { reason });
      setResolved('refunded');
      onResolved?.(appointment._id, 'refunded');
    } catch (err) {
      setError(err.message || 'Refund failed');
    } finally {
      setActionLoading(null);
    }
  };

  const handleCredit = async () => {
    setActionLoading('credit');
    setError('');
    try {
      await cancelAppointmentWithCredit(appointment._id, { reason });
      setResolved('credited');
      onResolved?.(appointment._id, 'credited');
    } catch (err) {
      setError(err.message || 'Credit failed');
    } finally {
      setActionLoading(null);
    }
  };

  const handleCancelUnpaid = async () => {
    setActionLoading('cancel');
    setError('');
    try {
      await cancelUnpaidAppointment(appointment._id, { reason });
      setResolved('refunded');
      onResolved?.(appointment._id, 'cancelled');
    } catch (err) {
      setError(err.message || 'Cancel failed');
    } finally {
      setActionLoading(null);
    }
  };

  const handleContacted = async () => {
    setActionLoading('contacted');
    setError('');
    try {
      await markAppointmentContacted(appointment._id, { notes: `Contacted regarding: ${reason}` });
      setResolved('contacted');
      onResolved?.(appointment._id, 'contacted');
    } catch (err) {
      setError(err.message || 'Failed');
    } finally {
      setActionLoading(null);
    }
  };

  const TypeIcon = typeConfig.Icon;
  const resolutionInfo = resolved ? RESOLUTION_BADGE[resolved] : null;
  const ResIcon = resolutionInfo?.icon;

  return (
    <div className={`rounded-2xl border p-4 transition-all ${
      resolved ? 'border-emerald-200 bg-emerald-50/30' : 'border-neutral-200 bg-white'
    }`}>
      {/* Header row: patient info + appointment meta */}
      <div className="flex items-start gap-3">
        {/* Avatar */}
        <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${grad} flex items-center justify-center flex-shrink-0`}>
          <span className="text-xs font-bold text-white">{getInitials(patient.name)}</span>
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-neutral-900">{patient.name || 'Unknown Patient'}</span>
            {age != null && <span className="text-xs text-neutral-400">{age}y</span>}
            {patient.gender && <span className="text-xs text-neutral-400 capitalize">{patient.gender}</span>}
          </div>

          <div className="flex items-center gap-3 mt-1 flex-wrap">
            <span className="inline-flex items-center gap-1 text-xs text-neutral-500">
              <Calendar className="h-3 w-3" />
              {displayDate(appointment.scheduledAt)}
            </span>
            <span className="inline-flex items-center gap-1 text-xs text-neutral-500">
              <Clock className="h-3 w-3" />
              {displayTime(appointment.scheduledAt)}
            </span>
            <span className={`inline-flex items-center gap-1 text-xs font-medium ${typeConfig.color}`}>
              <TypeIcon className="h-3 w-3" />
              {typeConfig.label}
            </span>
          </div>

          {/* Status + Payment row */}
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <span className={`inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full font-medium ${statusBadge.bg} ${statusBadge.text}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${statusBadge.dot}`} />
              {statusBadge.label}
            </span>
            {isPaid ? (
              <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium bg-emerald-50 text-emerald-700">
                <CreditCard className="h-3 w-3" />
                Paid ₹{paidAmount}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium bg-neutral-100 text-neutral-500">
                No payment
              </span>
            )}
          </div>
        </div>

        {/* Resolution badge */}
        {resolved && resolutionInfo && (
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl ${resolutionInfo.bg}`}>
            <CheckCircle2 className={`h-4 w-4 ${resolutionInfo.text}`} />
            <span className={`text-xs font-semibold ${resolutionInfo.text}`}>{resolutionInfo.label}</span>
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="mt-3 px-3 py-2 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700">{error}</div>
      )}

      {/* Actions / Reschedule picker */}
      {!resolved && (
        <div className="mt-4">
          {mode === 'actions' && (
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setMode('reschedule')}
                disabled={!!actionLoading}
                className="px-3 py-2 text-xs font-medium rounded-xl bg-primary-600 hover:bg-primary-700 text-white transition-all disabled:opacity-50"
              >
                <span className="flex items-center gap-1.5">
                  <RefreshCw className="h-3.5 w-3.5" />
                  Reschedule
                </span>
              </button>

              {isPaid && (
                <>
                  <button
                    onClick={handleRefund}
                    disabled={!!actionLoading}
                    className="px-3 py-2 text-xs font-medium rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 transition-all disabled:opacity-50"
                  >
                    <span className="flex items-center gap-1.5">
                      {actionLoading === 'refund' ? <Loader className="h-3.5 w-3.5 animate-spin" /> : <CreditCard className="h-3.5 w-3.5" />}
                      Refund ₹{paidAmount}
                    </span>
                  </button>
                  <button
                    onClick={handleCredit}
                    disabled={!!actionLoading}
                    className="px-3 py-2 text-xs font-medium rounded-xl bg-violet-50 hover:bg-violet-100 text-violet-700 transition-all disabled:opacity-50"
                  >
                    <span className="flex items-center gap-1.5">
                      {actionLoading === 'credit' ? <Loader className="h-3.5 w-3.5 animate-spin" /> : <Wallet className="h-3.5 w-3.5" />}
                      Credit ₹{paidAmount}
                    </span>
                  </button>
                </>
              )}

              {!isPaid && (
                <button
                  onClick={handleCancelUnpaid}
                  disabled={!!actionLoading}
                  className="px-3 py-2 text-xs font-medium rounded-xl bg-red-50 hover:bg-red-100 text-red-600 transition-all disabled:opacity-50"
                >
                  <span className="flex items-center gap-1.5">
                    {actionLoading === 'cancel' ? <Loader className="h-3.5 w-3.5 animate-spin" /> : <XCircle className="h-3.5 w-3.5" />}
                    Cancel
                  </span>
                </button>
              )}

              <button
                onClick={handleContacted}
                disabled={!!actionLoading}
                className="px-3 py-2 text-xs font-medium rounded-xl border border-neutral-200 hover:bg-neutral-50 text-neutral-600 transition-all disabled:opacity-50"
              >
                <span className="flex items-center gap-1.5">
                  {actionLoading === 'contacted' ? <Loader className="h-3.5 w-3.5 animate-spin" /> : <Phone className="h-3.5 w-3.5" />}
                  Contacted
                </span>
              </button>
            </div>
          )}

          {mode === 'reschedule' && (
            <RescheduleSlotPicker
              appointment={appointment}
              doctorId={appointment.doctor?._id || appointment.doctor}
              branchId={branchId || appointment.branch}
              onConfirm={handleReschedule}
              onBack={() => setMode('actions')}
              loading={actionLoading === 'reschedule'}
            />
          )}
        </div>
      )}
    </div>
  );
}
