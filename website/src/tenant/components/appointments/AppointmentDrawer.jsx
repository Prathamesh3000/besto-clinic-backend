import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  User, Stethoscope, Clock, CalendarDays, FileText, Tag, Phone,
  Video, VideoOff, Play, CheckCircle2, XCircle, UserX,
  Receipt, Pill, CalendarPlus, RefreshCw, CreditCard, Wallet, Loader,
} from 'lucide-react';
import { Drawer } from '../../../platform/components/shared';
import {
  getAppointment, updateAppointment, cancelAppointment,
  listVideoSessions, createVideoSession,
  listInvoices, listPrescriptions,
  adminRescheduleAppointment, cancelAppointmentWithRefund,
  cancelAppointmentWithCredit, cancelUnpaidAppointment,
} from '../../api';
import { useToast } from '../../ToastContext';
import { useTenantAuth } from '../../TenantAuthContext';
import RescheduleSlotPicker from '../schedule/RescheduleSlotPicker';
import RoomPickerModal from './RoomPickerModal';
import {
  APPOINTMENT_STATUS_STYLES, SOURCE_STYLES, TYPE_CONFIG,
  STATUS_TRANSITIONS, AppointmentStatusBadge, SourceBadge,
} from './appointment-constants';

const ACTION_ICONS = {
  confirmed: CheckCircle2, checked_in: CheckCircle2, in_progress: Play,
  completed: CheckCircle2, cancelled: XCircle, no_show: UserX,
  navigate_consultation: Stethoscope,
};

const INVOICE_STATUS_STYLE = {
  draft:     { bg: 'bg-amber-50',   text: 'text-amber-700' },
  sent:      { bg: 'bg-blue-50',    text: 'text-blue-700' },
  paid:      { bg: 'bg-emerald-50', text: 'text-emerald-700' },
  partially_paid: { bg: 'bg-orange-50', text: 'text-orange-700' },
  overdue:   { bg: 'bg-red-50',     text: 'text-red-600' },
  cancelled: { bg: 'bg-neutral-100', text: 'text-neutral-500' },
  void:      { bg: 'bg-neutral-100', text: 'text-neutral-500' },
};

const RESCHEDULE_ELIGIBLE = ['requested', 'confirmed', 'checked_in'];

export default function AppointmentDrawer({ open, appointmentId, onClose, onUpdated, canConsult = false, userRole }) {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { hasPermission } = useTenantAuth();

  const canUpdate = hasPermission('appointment:update');
  const canCancel = hasPermission('appointment:cancel');

  const [appt, setAppt] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [updating, setUpdating] = useState(false);
  const [showCancelReason, setShowCancelReason] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [videoSession, setVideoSession] = useState(null);
  const [videoLoading, setVideoLoading] = useState(false);
  const [linkedInvoice, setLinkedInvoice] = useState(null);
  const [linkedPrescription, setLinkedPrescription] = useState(null);
  const [mode, setMode] = useState('actions'); // 'actions' | 'reschedule' | 'cancel-options'
  const [showRoomPicker, setShowRoomPicker] = useState(false);
  const [actionLoading, setActionLoading] = useState(null);

  // Fetch appointment data when opened
  const fetchAppointment = useCallback(async () => {
    if (!appointmentId) return;
    setLoading(true);
    setError('');
    try {
      const res = await getAppointment(appointmentId);
      setAppt(res.data);
    } catch (err) {
      setError(err.message || 'Failed to load appointment');
    } finally {
      setLoading(false);
    }
  }, [appointmentId]);

  useEffect(() => {
    if (open && appointmentId) {
      fetchAppointment();
      setShowCancelReason(false);
      setCancelReason('');
      setVideoSession(null);
      setLinkedInvoice(null);
      setLinkedPrescription(null);
      setMode('actions');
      setActionLoading(null);
    }
  }, [open, appointmentId, fetchAppointment]);

  // Fetch video session for teleconsult appointments
  useEffect(() => {
    if (!appt || appt.type !== 'teleconsult') return;
    if (!['checked_in', 'in_progress', 'completed'].includes(appt.status)) return;
    setVideoLoading(true);
    listVideoSessions({ appointment: appointmentId, limit: 1 })
      .then((res) => {
        const sessions = Array.isArray(res.data) ? res.data : res.data?.items || [];
        setVideoSession(sessions[0] || null);
      })
      .catch(() => setVideoSession(null))
      .finally(() => setVideoLoading(false));
  }, [appt, appointmentId]);

  // Fetch linked invoice & prescription for completed appointments
  useEffect(() => {
    if (!appt || appt.status !== 'completed') {
      setLinkedInvoice(null);
      setLinkedPrescription(null);
      return;
    }
    listInvoices({ appointment: appointmentId, limit: 1 })
      .then((res) => {
        const items = res.data?.items || res.data || [];
        setLinkedInvoice(Array.isArray(items) ? items[0] || null : null);
      })
      .catch(() => setLinkedInvoice(null));
    listPrescriptions({ appointment: appointmentId, limit: 1 })
      .then((res) => {
        const items = res.data?.items || res.data || [];
        setLinkedPrescription(Array.isArray(items) ? items[0] || null : null);
      })
      .catch(() => setLinkedPrescription(null));
  }, [appt, appointmentId]);

  const handleStatusChange = async (nextStatus) => {
    // Doctor/admin consultation navigation — show room picker first
    if (nextStatus === 'navigate_consultation') {
      // If appointment already in_progress, go directly to the editor (resume)
      if (appt?.status === 'in_progress') {
        navigate(`/clinic/doctor-consultation/${appointmentId}`);
      } else {
        setShowRoomPicker(true);
      }
      return;
    }
    // Teleconsult: start or join the video call
    if (nextStatus === 'start_video_call') {
      handleStartVideoCall();
      return;
    }
    if (nextStatus === 'join_video_call') {
      if (videoSession) {
        navigate(`/clinic/telemedicine/${videoSession._id || videoSession.id}`);
      } else {
        handleStartVideoCall();
      }
      return;
    }
    setUpdating(true);
    setError('');
    try {
      if (nextStatus === 'cancelled' && cancelReason) {
        await updateAppointment(appointmentId, { status: 'cancelled', cancelReason });
      } else if (nextStatus === 'cancelled') {
        await cancelAppointment(appointmentId);
      } else {
        const res = await updateAppointment(appointmentId, { status: nextStatus });
        const data = res?.data || res;
        if (nextStatus === 'checked_in' && data?._queueEntry) {
          showToast({ type: 'success', message: `Checked in — Token #${data._queueEntry.tokenNumber}` });
        } else {
          showToast({ type: 'success', message: `Status updated to ${nextStatus.replace(/_/g, ' ')}` });
        }
      }
      if (nextStatus === 'cancelled') {
        showToast({ type: 'warning', message: 'Appointment cancelled' });
      }
      // Refresh local data
      await fetchAppointment();
      onUpdated?.();
      setShowCancelReason(false);
      setCancelReason('');
      // Auto-close for terminal statuses
      if (['cancelled', 'no_show', 'completed'].includes(nextStatus)) {
        setTimeout(() => onClose(), 1200);
      }
    } catch (err) {
      setError(err.message || 'Failed to update');
      showToast({ type: 'error', message: err.message || 'Failed to update' });
    } finally {
      setUpdating(false);
    }
  };

  const handleStartVideoCall = async () => {
    if (!appt) return;
    setVideoLoading(true);
    try {
      const patientId = appt.patient?._id || appt.patient;
      const doctorId = appt.doctor?._id || appt.doctor;
      const res = await createVideoSession({
        type: 'scheduled',
        patient: patientId,
        doctor: doctorId,
        branch: appt.branch?._id || appt.branch || undefined,
        appointment: appointmentId,
      });
      const session = res.data;
      showToast({ type: 'success', message: 'Video session created' });
      navigate(`/clinic/telemedicine/${session._id || session.id}`);
    } catch (err) {
      showToast({ type: 'error', message: err.message || 'Failed to start video call' });
    } finally {
      setVideoLoading(false);
    }
  };

  // ── Reschedule & financial cancel handlers ──────────────
  const handleReschedule = async (newScheduledAt) => {
    setActionLoading('reschedule');
    setError('');
    try {
      await adminRescheduleAppointment(appointmentId, {
        newScheduledAt,
        reason: 'Admin reschedule',
      });
      showToast({ type: 'success', message: 'Appointment rescheduled' });
      await fetchAppointment();
      onUpdated?.();
      setMode('actions');
    } catch (err) {
      setError(err.message || 'Reschedule failed');
      showToast({ type: 'error', message: err.message || 'Reschedule failed' });
    } finally {
      setActionLoading(null);
    }
  };

  const handleCancelRefund = async () => {
    setActionLoading('refund');
    setError('');
    try {
      await cancelAppointmentWithRefund(appointmentId, { reason: cancelReason || 'Admin cancellation' });
      showToast({ type: 'success', message: `Refund of ₹${appt?.payment?.amount || 0} initiated` });
      await fetchAppointment();
      onUpdated?.();
      setMode('actions');
      setCancelReason('');
      setTimeout(() => onClose(), 1200);
    } catch (err) {
      setError(err.message || 'Refund failed');
      showToast({ type: 'error', message: err.message || 'Refund failed' });
    } finally {
      setActionLoading(null);
    }
  };

  const handleCancelCredit = async () => {
    setActionLoading('credit');
    setError('');
    try {
      await cancelAppointmentWithCredit(appointmentId, { reason: cancelReason || 'Admin cancellation' });
      showToast({ type: 'success', message: `₹${appt?.payment?.amount || 0} credited to patient wallet` });
      await fetchAppointment();
      onUpdated?.();
      setMode('actions');
      setCancelReason('');
      setTimeout(() => onClose(), 1200);
    } catch (err) {
      setError(err.message || 'Credit failed');
      showToast({ type: 'error', message: err.message || 'Credit failed' });
    } finally {
      setActionLoading(null);
    }
  };

  const handleCancelUnpaidAction = async () => {
    setActionLoading('cancel-unpaid');
    setError('');
    try {
      await cancelUnpaidAppointment(appointmentId, { reason: cancelReason || 'Admin cancellation' });
      showToast({ type: 'warning', message: 'Appointment cancelled' });
      await fetchAppointment();
      onUpdated?.();
      setMode('actions');
      setCancelReason('');
      setTimeout(() => onClose(), 1200);
    } catch (err) {
      setError(err.message || 'Cancel failed');
      showToast({ type: 'error', message: err.message || 'Cancel failed' });
    } finally {
      setActionLoading(null);
    }
  };

  // Derive display data
  const status = appt?.status || 'requested';
  const actions = STATUS_TRANSITIONS[status] || [];
  const isPaid = !!appt?.payment;
  const paidAmount = appt?.payment?.amount || 0;
  const patientName = appt?.patient?.name || 'Unknown Patient';
  const patientPhone = appt?.patient?.phone || '';
  const doctorName = appt?.doctor?.name || 'Unassigned';
  const doctorSpec = appt?.doctor?.specialization || '';
  const scheduledAt = appt?.scheduledAt ? new Date(appt.scheduledAt) : null;
  const _fmtUtcDate = (d) => {
    const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${days[d.getUTCDay()]}, ${months[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
  };
  const _fmtUtcTime = (d) => {
    const h = d.getUTCHours(); const m = d.getUTCMinutes();
    return `${String(h % 12 || 12).padStart(2,'0')}:${String(m).padStart(2,'0')} ${h >= 12 ? 'PM' : 'AM'}`;
  };
  const dateStr = scheduledAt ? _fmtUtcDate(scheduledAt) : 'N/A';
  const timeStr = scheduledAt ? _fmtUtcTime(scheduledAt) : '';
  const endTime = scheduledAt && appt?.duration
    ? _fmtUtcTime(new Date(scheduledAt.getTime() + appt.duration * 60000))
    : '';
  const typeConfig = TYPE_CONFIG[appt?.type] || TYPE_CONFIG.consultation;
  const isTeleconsult = appt?.type === 'teleconsult';

  // Build status timeline entries
  const timeline = [];
  if (appt?.createdAt) timeline.push({ label: 'Created', time: appt.createdAt, color: 'bg-neutral-400' });
  if (appt?.status !== 'requested' && appt?.createdAt) timeline.push({ label: 'Confirmed', time: appt.createdAt, color: 'bg-blue-500' });
  if (appt?.checkedInAt) timeline.push({ label: 'Checked In', time: appt.checkedInAt, color: 'bg-orange-500' });
  if (appt?.startedAt) timeline.push({ label: 'Started', time: appt.startedAt, color: 'bg-emerald-500' });
  if (appt?.completedAt) timeline.push({ label: 'Completed', time: appt.completedAt, color: 'bg-neutral-400' });
  if (appt?.cancelledAt) timeline.push({ label: 'Cancelled', time: appt.cancelledAt, color: 'bg-red-500' });
  if (appt?.noShowAt) timeline.push({ label: 'No Show', time: appt.noShowAt, color: 'bg-rose-500' });

  // Receptionist-only transitions: confirm, check-in, cancel, no-show (no Start/Complete)
  const RECEPTIONIST_BLOCKED = ['in_progress', 'completed', 'navigate_consultation'];

  // Consultation action overrides (for doctors & admins with canConsult)
  const getDisplayActions = () => {
    let result;

    // Receptionist: strip clinical actions (Start, Complete)
    if (userRole === 'receptionist') {
      result = actions.filter((a) => !RECEPTIONIST_BLOCKED.includes(a.nextStatus));
    } else if (canConsult && status === 'checked_in') {
      result = [
        isTeleconsult
          ? { nextStatus: 'start_video_call', label: 'Start Video Call', style: 'bg-teal-600 hover:bg-teal-700 text-white' }
          : { nextStatus: 'navigate_consultation', label: 'Start Consultation', style: 'bg-primary-600 hover:bg-primary-700 text-white' },
        { nextStatus: 'no_show', label: 'No Show', style: 'bg-red-50 hover:bg-red-100 text-red-600' },
      ];
    } else if (canConsult && status === 'in_progress') {
      result = [
        isTeleconsult
          ? { nextStatus: 'join_video_call', label: 'Join Video Call', style: 'bg-teal-600 hover:bg-teal-700 text-white' }
          : { nextStatus: 'navigate_consultation', label: 'Resume Consultation', style: 'bg-purple-600 hover:bg-purple-700 text-white' },
        { nextStatus: 'completed', label: 'Complete', style: 'bg-secondary-600 hover:bg-secondary-700 text-white' },
      ];
    } else {
      result = [...actions];
    }

    // Permission gate: hide cancel actions if user lacks appointment:cancel
    if (!canCancel) {
      result = result.filter((a) => !['cancelled', 'no_show'].includes(a.nextStatus));
    }

    return result;
  };

  const displayActions = getDisplayActions();
  const showRescheduleBtn = canUpdate && RESCHEDULE_ELIGIBLE.includes(status);
  const showCancelOptionsBtn = canCancel && isPaid && RESCHEDULE_ELIGIBLE.includes(status);

  return (
    <>
    <Drawer open={open} onClose={onClose} title="Appointment Details">
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <span className="w-6 h-6 border-2 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
        </div>
      ) : error && !appt ? (
        <div className="px-6 py-10">
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">{error}</div>
        </div>
      ) : appt ? (
        <div className="flex flex-col h-full">
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
            {/* Status + Source */}
            <div className="flex items-center gap-2">
              <AppointmentStatusBadge status={status} />
              <SourceBadge source={appt.source} />
            </div>

            {/* Patient Card */}
            <div className="bg-neutral-50 rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary-100 to-primary-200 flex items-center justify-center shrink-0">
                  <User className="h-4 w-4 text-primary-700" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-neutral-900">{patientName}</p>
                  {patientPhone && <p className="text-[11px] text-neutral-400">{patientPhone}</p>}
                </div>
              </div>
              {patientPhone && (
                <div className="flex items-center gap-2 text-xs text-neutral-500">
                  <Phone className="h-3.5 w-3.5" /> {patientPhone}
                </div>
              )}
            </div>

            {/* Doctor Card — always visible */}
            <div className="flex items-center gap-3 bg-neutral-50 rounded-xl p-4">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-100 to-emerald-200 flex items-center justify-center shrink-0">
                <Stethoscope className="h-4 w-4 text-emerald-700" />
              </div>
              <div>
                <p className="text-sm font-semibold text-neutral-900">{doctorName}</p>
                {doctorSpec && <p className="text-[11px] text-neutral-400">{doctorSpec}</p>}
              </div>
            </div>

            {/* Schedule */}
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">Schedule</h4>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex items-center gap-2 text-sm text-neutral-700">
                  <CalendarDays className="h-4 w-4 text-neutral-400 shrink-0" /> {dateStr}
                </div>
                <div className="flex items-center gap-2 text-sm text-neutral-700">
                  <Clock className="h-4 w-4 text-neutral-400 shrink-0" /> {timeStr}{endTime ? ` – ${endTime}` : ''}
                </div>
              </div>
              {appt.duration && <p className="text-xs text-neutral-400">{appt.duration} minutes</p>}
            </div>

            {/* Type */}
            <div className="flex items-center gap-2">
              <Tag className="h-4 w-4 text-neutral-400" />
              <span className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg font-medium bg-neutral-50 border border-neutral-200 ${typeConfig.color}`}>
                <typeConfig.Icon className="h-3 w-3" /> {typeConfig.label}
              </span>
            </div>

            {/* Reason / Notes */}
            {(appt.reason || appt.notes) && (
              <div className="space-y-2">
                <h4 className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">Notes</h4>
                {appt.reason && (
                  <div className="flex items-start gap-2">
                    <FileText className="h-3.5 w-3.5 text-neutral-400 mt-0.5 shrink-0" />
                    <p className="text-sm text-neutral-600">{appt.reason}</p>
                  </div>
                )}
                {appt.notes && (
                  <p className="text-sm text-neutral-500 bg-neutral-50 rounded-lg p-3">{appt.notes}</p>
                )}
              </div>
            )}

            {/* Status Timeline */}
            {timeline.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">Timeline</h4>
                <div className="relative pl-5 space-y-3">
                  {/* Connecting line */}
                  <div className="absolute left-[7px] top-1 bottom-1 w-px bg-neutral-200" />
                  {timeline.map((entry, i) => {
                    const t = new Date(entry.time);
                    return (
                      <div key={i} className="relative flex items-center gap-3">
                        <span className={`absolute left-[-13px] w-3.5 h-3.5 rounded-full border-2 border-white ${entry.color}`} />
                        <span className="text-[11px] text-neutral-400 font-mono w-14 shrink-0">
                          {t.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        <span className="text-xs text-neutral-600 font-medium">{entry.label}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Teleconsult Section */}
            {isTeleconsult && ['checked_in', 'in_progress', 'completed'].includes(status) && (
              <div className="space-y-2">
                <h4 className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">Video Call</h4>
                <div className="bg-neutral-50 rounded-xl p-4">
                  {videoLoading ? (
                    <div className="flex items-center gap-2 text-xs text-neutral-500">
                      <span className="w-3.5 h-3.5 border-2 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
                      Checking session...
                    </div>
                  ) : videoSession ? (
                    <div className="space-y-3">
                      {['waiting', 'active', 'requested', 'scheduled'].includes(videoSession.status) ? (
                        <>
                          <div className="flex items-center gap-2 text-xs text-emerald-700">
                            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                            Session {videoSession.status === 'active' ? 'active' : 'waiting'}
                          </div>
                          <button
                            onClick={() => navigate(`/clinic/telemedicine/${videoSession._id || videoSession.id}`)}
                            className="w-full px-4 py-2.5 text-sm font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-xl transition flex items-center justify-center gap-2"
                          >
                            <Video className="h-4 w-4" /> Join Video Call
                          </button>
                        </>
                      ) : (
                        <div className="flex items-center gap-2 text-xs text-neutral-500">
                          <VideoOff className="h-3.5 w-3.5" />
                          Call ended{videoSession.duration ? ` · ${Math.round(videoSession.duration / 60)} min` : ''}
                        </div>
                      )}
                    </div>
                  ) : status !== 'completed' ? (
                    <button
                      onClick={handleStartVideoCall}
                      disabled={videoLoading}
                      className="w-full px-4 py-2.5 text-sm font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-xl transition flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      <Video className="h-4 w-4" /> Start Video Call
                    </button>
                  ) : (
                    <p className="text-xs text-neutral-400">No video session was created for this appointment.</p>
                  )}
                </div>
              </div>
            )}

            {/* Post-Completion Info */}
            {status === 'completed' && (
              <div className="space-y-3">
                <h4 className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">Outcome</h4>

                {/* Invoice */}
                {linkedInvoice ? (
                  <div className="flex items-center justify-between bg-neutral-50 rounded-xl p-3">
                    <div className="flex items-center gap-2">
                      <Receipt className="h-4 w-4 text-neutral-500" />
                      <div>
                        <p className="text-xs font-semibold text-neutral-700">
                          Invoice {linkedInvoice.invoiceNumber ? `#${linkedInvoice.invoiceNumber}` : ''}
                        </p>
                        <p className="text-[11px] text-neutral-400">
                          {'\u20B9'}{linkedInvoice.totalAmount?.toFixed(2)}
                          {' · '}
                          <span className={`${(INVOICE_STATUS_STYLE[linkedInvoice.status] || {}).text || 'text-neutral-500'}`}>
                            {(linkedInvoice.status || 'unknown').replace(/_/g, ' ')}
                          </span>
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => navigate(userRole === 'receptionist' ? '/clinic/receptionist-billing' : '/clinic/billing')}
                      className="text-xs text-primary-600 hover:text-primary-700 font-medium"
                    >
                      View
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-xs text-neutral-400 bg-neutral-50 rounded-xl p-3">
                    <span className="w-3 h-3 border-2 border-neutral-300 border-t-neutral-500 rounded-full animate-spin" />
                    Invoice generating...
                  </div>
                )}

                {/* Prescription */}
                {linkedPrescription && (
                  <div className="flex items-center justify-between bg-neutral-50 rounded-xl p-3">
                    <div className="flex items-center gap-2">
                      <Pill className="h-4 w-4 text-emerald-500" />
                      <div>
                        <p className="text-xs font-semibold text-neutral-700">Prescription Issued</p>
                        <p className="text-[11px] text-neutral-400">
                          {linkedPrescription.medications?.length || 0} medication(s)
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Follow-up */}
                {appt.parentAppointment && (
                  <div className="flex items-center gap-2 bg-violet-50 rounded-xl p-3">
                    <CalendarPlus className="h-4 w-4 text-violet-500" />
                    <p className="text-xs font-medium text-violet-700">Follow-up appointment</p>
                  </div>
                )}
              </div>
            )}

            {/* Cancel Reason (if cancelled) */}
            {status === 'cancelled' && appt.cancelReason && (
              <div className="bg-red-50 rounded-xl p-3">
                <p className="text-xs font-semibold text-red-700 mb-1">Cancellation Reason</p>
                <p className="text-sm text-red-600">{appt.cancelReason}</p>
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">{error}</div>
            )}
          </div>

          {/* Action Footer */}
          {(displayActions.length > 0 || showRescheduleBtn || showCancelOptionsBtn) && (
            <div className="px-6 py-4 border-t border-neutral-200 shrink-0 space-y-3">

              {/* ── Mode: Reschedule (inline slot picker) ── */}
              {mode === 'reschedule' ? (
                <RescheduleSlotPicker
                  appointment={appt}
                  doctorId={appt?.doctor?._id || appt?.doctor}
                  branchId={appt?.branch?._id || appt?.branch}
                  onConfirm={handleReschedule}
                  onBack={() => setMode('actions')}
                  loading={actionLoading === 'reschedule'}
                />

              /* ── Mode: Cancel options for paid appointments ── */
              ) : mode === 'cancel-options' ? (
                <div className="space-y-3">
                  <textarea
                    value={cancelReason}
                    onChange={(e) => setCancelReason(e.target.value)}
                    placeholder="Reason for cancellation (optional)..."
                    rows={2}
                    className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-xl bg-white text-neutral-900 placeholder:text-neutral-400 focus:border-red-300 focus:ring-2 focus:ring-red-100 outline-none transition-all resize-none"
                  />
                  <div className="flex flex-wrap gap-2">
                    {isPaid && (
                      <>
                        <button
                          onClick={handleCancelRefund}
                          disabled={!!actionLoading}
                          className="flex-1 min-w-[120px] px-3 py-2.5 text-xs font-semibold rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                          {actionLoading === 'refund' ? <Loader className="h-3.5 w-3.5 animate-spin" /> : <CreditCard className="h-3.5 w-3.5" />}
                          Refund ₹{paidAmount}
                        </button>
                        <button
                          onClick={handleCancelCredit}
                          disabled={!!actionLoading}
                          className="flex-1 min-w-[120px] px-3 py-2.5 text-xs font-semibold rounded-xl bg-violet-50 hover:bg-violet-100 text-violet-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                          {actionLoading === 'credit' ? <Loader className="h-3.5 w-3.5 animate-spin" /> : <Wallet className="h-3.5 w-3.5" />}
                          Credit ₹{paidAmount}
                        </button>
                      </>
                    )}
                    <button
                      onClick={isPaid ? () => { handleStatusChange('cancelled'); setMode('actions'); } : handleCancelUnpaidAction}
                      disabled={updating || !!actionLoading}
                      className="flex-1 min-w-[100px] px-3 py-2.5 text-xs font-semibold rounded-xl bg-red-50 hover:bg-red-100 text-red-600 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {(updating || actionLoading === 'cancel-unpaid') ? <Loader className="h-3.5 w-3.5 animate-spin" /> : <XCircle className="h-3.5 w-3.5" />}
                      Cancel Only
                    </button>
                  </div>
                  <button
                    onClick={() => { setMode('actions'); setCancelReason(''); }}
                    className="w-full px-3 py-2 text-xs font-medium text-neutral-500 hover:text-neutral-700 transition"
                  >
                    Back
                  </button>
                </div>

              /* ── Mode: Simple cancel reason (unpaid appointments) ── */
              ) : showCancelReason ? (
                <div className="space-y-3">
                  <textarea
                    value={cancelReason}
                    onChange={(e) => setCancelReason(e.target.value)}
                    placeholder="Reason for cancellation (optional)..."
                    rows={2}
                    className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-xl bg-white text-neutral-900 placeholder:text-neutral-400 focus:border-red-300 focus:ring-2 focus:ring-red-100 outline-none transition-all resize-none"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => { setShowCancelReason(false); setCancelReason(''); }}
                      className="flex-1 px-3 py-2 text-xs font-medium text-neutral-600 bg-neutral-100 rounded-xl hover:bg-neutral-200 transition"
                    >
                      Back
                    </button>
                    <button
                      onClick={() => handleStatusChange('cancelled')}
                      disabled={updating}
                      className="flex-1 px-3 py-2 text-xs font-semibold text-white bg-red-600 rounded-xl hover:bg-red-700 transition disabled:opacity-50"
                    >
                      {updating ? 'Cancelling...' : 'Confirm Cancel'}
                    </button>
                  </div>
                </div>

              /* ── Mode: Default actions ── */
              ) : (
                <>
                  {/* Status transition buttons */}
                  {displayActions.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {displayActions.map((action) => {
                        const Icon = ACTION_ICONS[action.nextStatus] || CheckCircle2;
                        return (
                          <button
                            key={action.nextStatus}
                            onClick={() => {
                              if (action.needsReason) {
                                // Paid + can cancel → show financial cancel options
                                if (isPaid && canCancel) {
                                  setMode('cancel-options');
                                } else {
                                  setShowCancelReason(true);
                                }
                              } else {
                                handleStatusChange(action.nextStatus);
                              }
                            }}
                            disabled={updating}
                            className={`flex-1 min-w-[110px] px-4 py-2.5 text-xs font-semibold rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50 ${action.style}`}
                          >
                            {updating ? (
                              <span className="w-4 h-4 border-2 border-current/30 border-t-current rounded-full animate-spin" />
                            ) : (
                              <Icon className="h-4 w-4" />
                            )}
                            {action.label}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* Additional actions: Reschedule + Cancel Options */}
                  {(showRescheduleBtn || showCancelOptionsBtn) && (
                    <>
                      {displayActions.length > 0 && (
                        <div className="border-t border-neutral-100" />
                      )}
                      <div className="flex flex-wrap gap-2">
                        {showRescheduleBtn && (
                          <button
                            onClick={() => setMode('reschedule')}
                            disabled={updating}
                            className="flex-1 min-w-[110px] px-4 py-2.5 text-xs font-semibold rounded-xl bg-primary-50 hover:bg-primary-100 text-primary-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                          >
                            <RefreshCw className="h-4 w-4" />
                            Reschedule
                          </button>
                        )}
                        {showCancelOptionsBtn && (
                          <button
                            onClick={() => setMode('cancel-options')}
                            disabled={updating}
                            className="flex-1 min-w-[110px] px-4 py-2.5 text-xs font-semibold rounded-xl bg-red-50 hover:bg-red-100 text-red-600 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                          >
                            <CreditCard className="h-4 w-4" />
                            Cancel & Refund
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      ) : null}
    </Drawer>

      {/* Room Picker for starting consultation */}
      <RoomPickerModal
        open={showRoomPicker}
        onClose={() => setShowRoomPicker(false)}
        appointmentId={appointmentId}
        branchId={appt?.branch?._id || appt?.branch || null}
      />
    </>
  );
}
