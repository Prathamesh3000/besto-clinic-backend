import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CalendarDays, Pill, CreditCard, Bell, CalendarPlus, Phone, Share2,
  Upload, Stethoscope, Paperclip, Star, Copy, Eye, ShieldCheck,
  Clock, Video, MessageSquare, ChevronDown, ChevronUp, FileText,
  Activity, Link2, Loader2, X, AlertTriangle, Check, BellRing,
  Wallet, BookOpen, Receipt, ArrowDownLeft, ArrowUpRight, Download,
  CheckCircle2, SkipForward, CircleX, CircleDashed,
} from 'lucide-react';
import {
  getPortalDashboard, listPatientAppointments, cancelPatientAppointment, confirmAttendance,
  rescheduleAppointment, createEmergencyRequest, listPatientPrescriptions, getMedicalHistory,
  listPaymentHistory, initiatePayment, createShareToken, listShareTokens, revokeShareToken,
  listPatientConsents, approveConsent, revokePatientConsent, uploadInsuranceDoc,
  submitReview, getAccessLog, getPatientFinancialSummary, getPatientLedger,
  getPatientCreditNotes, downloadPatientInvoicePdf,
  enablePrescriptionReminders, disablePrescriptionReminders, listCareTasks,
  listTaskReminders, respondToReminder,
  listDependents, createDependent, updateDependentApi, detachDependentApi, removeDependentApi,
  toggleTaskReminder, getDailyCareSchedule, getDependentCompliance, getDependentDailySchedule,
  respondToReminderAsGuardian, toggleDependentTaskReminder,
} from '../api';
import { useSafePatientAuth } from '../../hooks/useSafeAuth';
import BookingWizardModal from '../components/BookingWizardModal';
import { MetricCard, SkeletonLoader, SearchInput, Badge, FileDropzone, EmptyStateIllustration } from '../../components/ui';
import { Modal, TabBar, DataTable, Pagination, ConfirmDialog, StatusBadge } from '../../platform/components/shared';

// ═══════════════════════════════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

const formatDate = (d) =>
  new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

const formatTime = (d) =>
  new Date(d).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

const formatDateTime = (d) => `${formatDate(d)} at ${formatTime(d)}`;

const formatCurrency = (amount) => `\u20B9${(amount || 0).toLocaleString('en-IN')}`;

const todayStr = () => new Date().toISOString().split('T')[0];

// ═══════════════════════════════════════════════════════════════════════════════
//  STYLE CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

const inputCls =
  'w-full px-3 py-2.5 border border-neutral-300/60 rounded-xl text-sm bg-neutral-50/50 text-neutral-900 placeholder:text-neutral-900/25 focus:bg-white focus:border-primary-300 focus:ring-2 focus:ring-primary-400/20 outline-none transition-all dark:bg-primary-800 dark:border-primary-700 dark:text-neutral-100 dark:placeholder:text-neutral-100/30 dark:focus:border-primary-500';

const labelCls = 'block text-xs font-semibold text-neutral-900/50 mb-1.5 dark:text-neutral-100/50';

const btnPrimary =
  'px-5 py-2.5 text-sm font-semibold text-white rounded-xl bg-gradient-to-r from-primary-500 to-primary-600 hover:from-primary-600 hover:to-primary-700 shadow-sm shadow-primary-600/20 transition-all disabled:opacity-50';

const btnSecondary =
  'px-4 py-2.5 text-sm font-medium text-neutral-900/60 bg-neutral-200/80 rounded-xl hover:bg-neutral-300 transition dark:bg-primary-700 dark:text-neutral-100/60 dark:hover:bg-primary-600';

const cardCls =
  'bg-white rounded-2xl border border-neutral-300/60 shadow-[var(--shadow-xs)] dark:bg-neutral-900 dark:border-primary-800';

// Appointment status color mapping
const STATUS_COLOR_MAP = {
  requested: 'yellow',
  confirmed: 'blue',
  checked_in: 'purple',
  in_progress: 'purple',
  completed: 'green',
  cancelled: 'red',
  no_show: 'red',
  active: 'green',
  sent: 'yellow',
  overdue: 'red',
  paid: 'green',
  pending: 'yellow',
  approved: 'green',
  revoked: 'red',
};

const SPRING = { type: 'spring', stiffness: 300, damping: 20 };

const BASE_TABS = [
  { key: 'home', label: 'Home' },
  { key: 'appointments', label: 'Appointments' },
  { key: 'health', label: 'Health' },
  { key: 'payments', label: 'Payments' },
  { key: 'dependents', label: 'Dependents' },
  { key: 'more', label: 'More' },
];

const PAGE_LIMIT = 10;

// ═══════════════════════════════════════════════════════════════════════════════
//  TAB 1: HomeTab
// ═══════════════════════════════════════════════════════════════════════════════

function HomeTab({ activePatientId, activePatient, onSwitchTab, onEmergency }) {
  const navigate = useNavigate();
  const [dashboard, setDashboard] = useState(null);
  const [dashLoading, setDashLoading] = useState(true);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);

  const fetchDashboard = useCallback(async () => {
    if (!activePatientId) return;
    setDashLoading(true);
    try {
      const res = await getPortalDashboard(activePatientId);
      setDashboard(res.data || res);
    } catch {
      setDashboard(null);
    } finally {
      setDashLoading(false);
    }
  }, [activePatientId]);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  const handleCancelNext = async () => {
    if (!dashboard?.nextAppointment?._id) return;
    setCancelLoading(true);
    try {
      await cancelPatientAppointment(activePatientId, dashboard.nextAppointment._id, 'Cancelled from home');
      setShowCancelConfirm(false);
      fetchDashboard();
    } catch {
      // handled silently
    } finally {
      setCancelLoading(false);
    }
  };

  const next = dashboard?.nextAppointment;

  const quickActions = [
    { label: 'Book Appointment', icon: CalendarPlus, color: 'bg-primary-500 dark:bg-primary-600', tab: 'appointments' },
    { label: 'Emergency', icon: Phone, color: 'bg-red-500 dark:bg-red-600', action: onEmergency },
    { label: 'Share Records', icon: Share2, color: 'bg-blue-500 dark:bg-blue-600', tab: 'more', section: 'share' },
    { label: 'Upload Insurance', icon: Upload, color: 'bg-amber-500 dark:bg-amber-600', tab: 'payments', section: 'insurance' },
  ];

  return (
    <div className="space-y-6">
      {/* Greeting */}
      <div>
        <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 font-display">
          {getGreeting()}, {activePatient?.name?.split(' ')[0] || 'Patient'}
        </h1>
        <p className="text-sm text-neutral-900/40 dark:text-neutral-100/40 mt-1">
          Patient ID: {activePatient?.patientId || activePatientId}
        </p>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Upcoming"
          value={dashboard?.upcomingAppointments ?? 0}
          icon={CalendarDays}
          color="primary"
          loading={dashLoading}
        />
        <MetricCard
          title="Prescriptions"
          value={dashboard?.activePrescriptions ?? 0}
          icon={Pill}
          color="green"
          loading={dashLoading}
        />
        <MetricCard
          title="Pending Bills"
          value={formatCurrency(dashboard?.pendingPayments?.total || 0)}
          icon={CreditCard}
          color="yellow"
          loading={dashLoading}
        />
        <MetricCard
          title="Notifications"
          value={dashboard?.unreadNotifications ?? 0}
          icon={Bell}
          color="purple"
          loading={dashLoading}
        />
      </div>

      {/* Next Appointment Card */}
      {dashLoading ? (
        <SkeletonLoader variant="card" count={1} />
      ) : next ? (
        <motion.div
          whileHover={{ y: -2 }}
          transition={SPRING}
          className={`${cardCls} p-5`}
        >
          <div className="flex items-start justify-between mb-3">
            <h3 className="text-sm font-semibold text-neutral-900/50 dark:text-neutral-100/50 uppercase tracking-wide">
              Next Appointment
            </h3>
            <Badge label={next.status} color={STATUS_COLOR_MAP[next.status] || 'gray'} />
          </div>
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-primary-50 dark:bg-primary-900/20 flex items-center justify-center shrink-0">
              <Stethoscope className="h-5 w-5 text-primary-600 dark:text-primary-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
                Dr. {next.doctor?.name || 'Unknown'}
              </p>
              <p className="text-xs text-neutral-900/40 dark:text-neutral-100/40">
                {next.doctor?.specialization || next.type}
              </p>
              <p className="text-sm text-neutral-900/60 dark:text-neutral-100/60 mt-1">
                <CalendarDays className="inline h-3.5 w-3.5 mr-1 -mt-0.5" />
                {formatDateTime(next.scheduledAt)}
              </p>
            </div>
          </div>
          <div className="flex gap-3 mt-4">
            {next.type === 'teleconsult' && ['confirmed', 'checked_in', 'in_progress'].includes(next.status) && (
              <button
                onClick={() => navigate(`/patient/video/${next._id}`)}
                className="px-4 py-2 rounded-xl bg-green-500 text-white text-sm font-medium hover:bg-green-600 transition-colors flex items-center gap-2"
              >
                <Video className="h-4 w-4" />
                Join Video
              </button>
            )}
            <button
              onClick={() => setShowCancelConfirm(true)}
              className="px-4 py-2 rounded-xl text-red-500 hover:text-red-600 text-sm font-medium hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors"
            >
              Cancel
            </button>
          </div>
        </motion.div>
      ) : (
        !dashLoading && (
          <div className={`${cardCls} p-6`}>
            <EmptyStateIllustration
              type="schedule"
              message="No upcoming appointments"
              action="Book Now"
              onAction={() => onSwitchTab('appointments')}
            />
          </div>
        )
      )}

      {/* Quick Actions Grid */}
      <div>
        <h3 className="text-sm font-semibold text-neutral-900/50 dark:text-neutral-100/50 uppercase tracking-wide mb-3">
          Quick Actions
        </h3>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {quickActions.map((qa) => (
            <motion.button
              key={qa.label}
              whileHover={{ y: -2, scale: 1.01 }}
              whileTap={{ scale: 0.98 }}
              transition={SPRING}
              onClick={() => {
                if (qa.action) {
                  qa.action();
                } else {
                  onSwitchTab(qa.tab, qa.section);
                }
              }}
              className={`${cardCls} p-4 flex flex-col items-center gap-3 cursor-pointer hover:shadow-[var(--shadow-sm)] transition-shadow`}
            >
              <div className={`w-11 h-11 rounded-xl ${qa.color} flex items-center justify-center`}>
                <qa.icon className="h-5 w-5 text-white" />
              </div>
              <span className="text-xs font-semibold text-neutral-900 dark:text-neutral-100 text-center">
                {qa.label}
              </span>
            </motion.button>
          ))}
        </div>
      </div>

      {/* Cancel Confirm Dialog */}
      <ConfirmDialog
        open={showCancelConfirm}
        title="Cancel Appointment"
        message={`Are you sure you want to cancel your appointment with Dr. ${next?.doctor?.name || 'Unknown'} on ${next ? formatDateTime(next.scheduledAt) : ''}?`}
        onConfirm={handleCancelNext}
        onCancel={() => setShowCancelConfirm(false)}
        danger
        loading={cancelLoading}
      />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
//  TAB 2: AppointmentsTab
// ═══════════════════════════════════════════════════════════════════════════════

function AppointmentsTab({ activePatientId, activePatient, setToast }) {
  const navigate = useNavigate();
  const [appointments, setAppointments] = useState([]);
  const [apptPage, setApptPage] = useState(1);
  const [apptTotal, setApptTotal] = useState(0);
  const [apptLoading, setApptLoading] = useState(true);
  const [apptFilter, setApptFilter] = useState('upcoming');

  // Book Wizard
  const [showBookModal, setShowBookModal] = useState(false);

  // Cancel Dialog
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [cancelTarget, setCancelTarget] = useState(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelLoading, setCancelLoading] = useState(false);

  // Reschedule Modal
  const [showRescheduleModal, setShowRescheduleModal] = useState(false);
  const [rescheduleTarget, setRescheduleTarget] = useState(null);
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [rescheduleTime, setRescheduleTime] = useState('');
  const [rescheduleSaving, setRescheduleSaving] = useState(false);

  const fetchAppointments = useCallback(async () => {
    if (!activePatientId) return;
    setApptLoading(true);
    try {
      const params = { page: apptPage, limit: PAGE_LIMIT };
      if (apptFilter === 'upcoming') {
        params.from = new Date().toISOString();
        params.statusNin = 'cancelled,completed,no_show';
      } else {
        params.to = new Date().toISOString();
      }
      const res = await listPatientAppointments(activePatientId, params);
      setAppointments(res.data || []);
      setApptTotal(res.total || res.pagination?.total || 0);
    } catch {
      setAppointments([]);
    } finally {
      setApptLoading(false);
    }
  }, [activePatientId, apptPage, apptFilter]);

  useEffect(() => {
    fetchAppointments();
  }, [fetchAppointments]);

  useEffect(() => {
    setApptPage(1);
  }, [apptFilter]);

  const handleCancel = async () => {
    if (!cancelTarget) return;
    setCancelLoading(true);
    try {
      await cancelPatientAppointment(activePatientId, cancelTarget._id, cancelReason);
      setShowCancelDialog(false);
      setCancelTarget(null);
      setCancelReason('');
      setToast({ type: 'success', message: 'Appointment cancelled' });
      fetchAppointments();
    } catch (err) {
      setToast({ type: 'error', message: err.message || 'Failed to cancel' });
    } finally {
      setCancelLoading(false);
    }
  };

  const handleReschedule = async () => {
    if (!rescheduleTarget || !rescheduleDate || !rescheduleTime) return;
    setRescheduleSaving(true);
    try {
      const scheduledAt = new Date(`${rescheduleDate}T${rescheduleTime}`).toISOString();
      await rescheduleAppointment(activePatientId, rescheduleTarget._id, scheduledAt);
      setShowRescheduleModal(false);
      setRescheduleTarget(null);
      setRescheduleDate('');
      setRescheduleTime('');
      setToast({ type: 'success', message: 'Appointment rescheduled' });
      fetchAppointments();
    } catch (err) {
      setToast({ type: 'error', message: err.message || 'Failed to reschedule' });
    } finally {
      setRescheduleSaving(false);
    }
  };

  const [confirmLoading, setConfirmLoading] = useState(null); // appointmentId being processed

  const handleConfirmAttendance = async (appt, status) => {
    setConfirmLoading(appt._id);
    try {
      await confirmAttendance(activePatientId, appt._id, status);
      setToast({ type: 'success', message: status === 'confirmed' ? 'Attendance confirmed' : 'Appointment declined' });
      fetchAppointments();
    } catch (err) {
      setToast({ type: 'error', message: err.message || 'Failed to respond' });
    } finally {
      setConfirmLoading(null);
    }
  };

  const canCancel = (appt) =>
    ['requested', 'confirmed'].includes(appt.status);

  const canReschedule = (appt) =>
    ['requested', 'confirmed'].includes(appt.status);

  const canConfirmAttendance = (appt) =>
    ['requested', 'confirmed'].includes(appt.status) &&
    (!appt.patientConfirmation || appt.patientConfirmation.status === 'pending');

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-neutral-900 dark:text-neutral-100 font-display">
          Appointments
        </h2>
        <button
          onClick={() => setShowBookModal(true)}
          className={`${btnPrimary} hidden md:flex items-center gap-2`}
        >
          <CalendarPlus className="h-4 w-4" />
          Book Appointment
        </button>
      </div>

      {/* Filter Pills */}
      <div className="flex gap-2">
        {['upcoming', 'past'].map((f) => (
          <button
            key={f}
            onClick={() => setApptFilter(f)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
              apptFilter === f
                ? 'bg-primary-500 text-white shadow-sm shadow-primary-600/20'
                : 'bg-neutral-100 text-neutral-900/50 hover:bg-neutral-200 dark:bg-primary-800 dark:text-neutral-100/50 dark:hover:bg-primary-700'
            }`}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {/* Appointment Cards */}
      {apptLoading ? (
        <SkeletonLoader variant="card" count={4} />
      ) : appointments.length === 0 ? (
        <EmptyStateIllustration
          type="schedule"
          message={apptFilter === 'upcoming' ? 'No upcoming appointments' : 'No past appointments found'}
          action={apptFilter === 'upcoming' ? 'Book Now' : undefined}
          onAction={apptFilter === 'upcoming' ? () => setShowBookModal(true) : undefined}
        />
      ) : (
        <div className="space-y-3">
          {appointments.map((appt) => (
            <motion.div
              key={appt._id}
              whileHover={{ y: -1 }}
              transition={SPRING}
              className={`${cardCls} p-4 flex items-center gap-4`}
            >
              <div className="w-12 h-12 rounded-xl bg-primary-50 dark:bg-primary-900/20 flex items-center justify-center shrink-0">
                <Stethoscope className="h-5 w-5 text-primary-600 dark:text-primary-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 truncate">
                  Dr. {appt.doctor?.name || 'Unknown'}
                </p>
                <p className="text-xs text-neutral-900/50 dark:text-neutral-100/40">
                  {formatDate(appt.scheduledAt)} {'\u2022'} {formatTime(appt.scheduledAt)} {'\u2022'} {appt.type?.replace(/_/g, ' ')}
                </p>
                {appt.reason && (
                  <p className="text-xs text-neutral-900/30 dark:text-neutral-100/30 mt-0.5 truncate">
                    {appt.reason}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Badge label={appt.status?.replace(/_/g, ' ')} color={STATUS_COLOR_MAP[appt.status] || 'gray'} />
                {appt.patientConfirmation?.status === 'confirmed' && (
                  <Badge label="Attendance Confirmed" color="green" />
                )}
                {appt.patientConfirmation?.status === 'declined' && (
                  <Badge label="Declined" color="red" />
                )}
              </div>
              <div className="flex gap-2 shrink-0">
                {canConfirmAttendance(appt) && (
                  <>
                    <button
                      onClick={() => handleConfirmAttendance(appt, 'confirmed')}
                      disabled={confirmLoading === appt._id}
                      className="px-3 py-1 rounded-lg bg-emerald-500 text-white text-xs font-medium hover:bg-emerald-600 transition-colors disabled:opacity-50"
                    >
                      {confirmLoading === appt._id ? '...' : "I'll Be There"}
                    </button>
                    <button
                      onClick={() => handleConfirmAttendance(appt, 'declined')}
                      disabled={confirmLoading === appt._id}
                      className="px-3 py-1 rounded-lg bg-red-500 text-white text-xs font-medium hover:bg-red-600 transition-colors disabled:opacity-50"
                    >
                      Can't Make It
                    </button>
                  </>
                )}
                {canCancel(appt) && (
                  <button
                    onClick={() => { setCancelTarget(appt); setShowCancelDialog(true); }}
                    className="text-xs text-red-500 hover:text-red-600 font-medium transition-colors"
                  >
                    Cancel
                  </button>
                )}
                {canReschedule(appt) && (
                  <button
                    onClick={() => {
                      setRescheduleTarget(appt);
                      setRescheduleDate('');
                      setRescheduleTime('');
                      setShowRescheduleModal(true);
                    }}
                    className="text-xs text-primary-500 hover:text-primary-600 font-medium transition-colors"
                  >
                    Reschedule
                  </button>
                )}
                {appt.type === 'teleconsult' && ['confirmed', 'checked_in', 'in_progress'].includes(appt.status) && (
                  <button
                    onClick={() => navigate(`/patient/video/${appt._id}`)}
                    className="px-3 py-1 rounded-lg bg-green-500 text-white text-xs font-medium hover:bg-green-600 transition-colors"
                  >
                    Join Video
                  </button>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {apptTotal > PAGE_LIMIT && (
        <Pagination page={apptPage} limit={PAGE_LIMIT} total={apptTotal} onChange={setApptPage} />
      )}

      {/* FAB for mobile */}
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setShowBookModal(true)}
        className="md:hidden fixed bottom-20 left-6 w-14 h-14 rounded-full bg-primary-500 text-white shadow-lg flex items-center justify-center z-30 hover:bg-primary-600 transition-colors"
      >
        <CalendarPlus className="h-6 w-6" />
      </motion.button>

      {/* Book Appointment Wizard */}
      <BookingWizardModal
        open={showBookModal}
        onClose={() => setShowBookModal(false)}
        activePatientId={activePatientId}
        activePatient={activePatient}
        setToast={setToast}
        onBooked={fetchAppointments}
      />

      {/* Cancel Dialog */}
      <Modal open={showCancelDialog} onClose={() => setShowCancelDialog(false)} title="Cancel Appointment">
        <div className="space-y-4">
          <p className="text-sm text-neutral-900/60 dark:text-neutral-100/60">
            Are you sure you want to cancel your appointment with{' '}
            <span className="font-semibold text-neutral-900 dark:text-neutral-100">
              Dr. {cancelTarget?.doctor?.name || 'Unknown'}
            </span>{' '}
            on {cancelTarget ? formatDateTime(cancelTarget.scheduledAt) : ''}?
          </p>
          <div>
            <label className={labelCls}>Reason for cancellation</label>
            <textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Optional reason..."
              rows={3}
              className={inputCls}
            />
          </div>
          <div className="flex justify-end gap-3">
            <button onClick={() => { setShowCancelDialog(false); setCancelTarget(null); }} className={btnSecondary}>
              Go Back
            </button>
            <button
              onClick={handleCancel}
              disabled={cancelLoading}
              className="px-5 py-2.5 text-sm font-semibold text-white rounded-xl bg-red-600 hover:bg-red-700 transition disabled:opacity-50"
            >
              {cancelLoading ? 'Cancelling...' : 'Confirm Cancel'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Reschedule Modal */}
      <Modal open={showRescheduleModal} onClose={() => setShowRescheduleModal(false)} title="Reschedule Appointment">
        <div className="space-y-4">
          <p className="text-sm text-neutral-900/60 dark:text-neutral-100/60">
            Rescheduling appointment with{' '}
            <span className="font-semibold text-neutral-900 dark:text-neutral-100">
              Dr. {rescheduleTarget?.doctor?.name || 'Unknown'}
            </span>
          </p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>New Date</label>
              <input
                type="date"
                min={todayStr()}
                value={rescheduleDate}
                onChange={(e) => setRescheduleDate(e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>New Time</label>
              <input
                type="time"
                value={rescheduleTime}
                onChange={(e) => setRescheduleTime(e.target.value)}
                className={inputCls}
              />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => { setShowRescheduleModal(false); setRescheduleTarget(null); }} className={btnSecondary}>
              Cancel
            </button>
            <button
              onClick={handleReschedule}
              disabled={rescheduleSaving || !rescheduleDate || !rescheduleTime}
              className={btnPrimary}
            >
              {rescheduleSaving ? 'Rescheduling...' : 'Reschedule'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
//  TAB 3: HealthTab
// ═══════════════════════════════════════════════════════════════════════════════

function HealthTab({ activePatientId, setToast }) {
  const [healthSubTab, setHealthSubTab] = useState('prescriptions');

  return (
    <div className="space-y-5">
      <h2 className="text-lg font-bold text-neutral-900 dark:text-neutral-100 font-display">
        Health Records
      </h2>

      {/* Sub-tab pills */}
      <div className="flex gap-2">
        {['prescriptions', 'daily checklist', 'care tasks', 'records', 'reports'].map((t) => (
          <button
            key={t}
            onClick={() => setHealthSubTab(t)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all capitalize ${
              healthSubTab === t
                ? 'bg-primary-500 text-white shadow-sm shadow-primary-600/20'
                : 'bg-neutral-100 text-neutral-900/50 hover:bg-neutral-200 dark:bg-primary-800 dark:text-neutral-100/50 dark:hover:bg-primary-700'
            }`}
          >
            {t === 'care tasks' ? 'Care Tasks' : t === 'daily checklist' ? 'Daily Checklist' : t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {healthSubTab === 'prescriptions' && (
          <motion.div key="prescriptions" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}>
            <PrescriptionsSubTab activePatientId={activePatientId} />
          </motion.div>
        )}
        {healthSubTab === 'daily checklist' && (
          <motion.div key="daily-checklist" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}>
            <DailyChecklistSubTab activePatientId={activePatientId} setToast={setToast} />
          </motion.div>
        )}
        {healthSubTab === 'care tasks' && (
          <motion.div key="care-tasks" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}>
            <CareTasksSubTab activePatientId={activePatientId} setToast={setToast} />
          </motion.div>
        )}
        {healthSubTab === 'records' && (
          <motion.div key="records" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}>
            <RecordsSubTab activePatientId={activePatientId} />
          </motion.div>
        )}
        {healthSubTab === 'reports' && (
          <motion.div key="reports" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}>
            <ReportsSubTab activePatientId={activePatientId} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── PrescriptionsSubTab ─────────────────────────────

function PrescriptionsSubTab({ activePatientId }) {
  const [prescriptions, setPrescriptions] = useState([]);
  const [rxPage, setRxPage] = useState(1);
  const [rxTotal, setRxTotal] = useState(0);
  const [rxLoading, setRxLoading] = useState(true);
  const [rxFilter, setRxFilter] = useState('active');
  const [expandedRx, setExpandedRx] = useState(null);
  const [togglingReminder, setTogglingReminder] = useState(null);

  const fetchPrescriptions = useCallback(async () => {
    if (!activePatientId) return;
    setRxLoading(true);
    try {
      const params = { page: rxPage, limit: PAGE_LIMIT };
      if (rxFilter) params.status = rxFilter;
      const res = await listPatientPrescriptions(activePatientId, params);
      setPrescriptions(res.data || []);
      setRxTotal(res.total || res.pagination?.total || 0);
    } catch {
      setPrescriptions([]);
    } finally {
      setRxLoading(false);
    }
  }, [activePatientId, rxPage, rxFilter]);

  useEffect(() => {
    fetchPrescriptions();
  }, [fetchPrescriptions]);

  useEffect(() => {
    setRxPage(1);
  }, [rxFilter]);

  const handleToggleReminders = async (rx) => {
    setTogglingReminder(rx._id);
    try {
      if (rx.followUpRemindersEnabled) {
        await disablePrescriptionReminders(activePatientId, rx._id);
      } else {
        await enablePrescriptionReminders(activePatientId, rx._id);
      }
      fetchPrescriptions();
    } catch (err) {
      alert(err.message || 'Failed to toggle reminders');
    } finally {
      setTogglingReminder(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Filter */}
      <div className="flex gap-2">
        {[
          { key: 'active', label: 'Active' },
          { key: 'completed', label: 'Completed' },
          { key: '', label: 'All' },
        ].map((f) => (
          <button
            key={f.key}
            onClick={() => setRxFilter(f.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              rxFilter === f.key
                ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400'
                : 'text-neutral-900/40 hover:text-neutral-900/60 dark:text-neutral-100/40 dark:hover:text-neutral-100/60'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Prescription Cards */}
      {rxLoading ? (
        <SkeletonLoader variant="card" count={3} />
      ) : prescriptions.length === 0 ? (
        <EmptyStateIllustration
          type="consultation"
          message="No prescriptions found"
        />
      ) : (
        <div className="space-y-3">
          {prescriptions.map((rx) => (
            <motion.div
              key={rx._id}
              layout
              transition={SPRING}
              className={`${cardCls} p-4`}
            >
              <div
                className="flex items-center justify-between cursor-pointer"
                onClick={() => setExpandedRx(expandedRx === rx._id ? null : rx._id)}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                    Dr. {rx.doctor?.name || 'Unknown'}
                  </p>
                  <p className="text-xs text-neutral-900/40 dark:text-neutral-100/40">
                    {formatDate(rx.createdAt)} {'\u2022'} {rx.medications?.length || 0} medication{rx.medications?.length !== 1 ? 's' : ''}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <Badge label={rx.status} color={rx.status === 'active' ? 'green' : 'gray'} />
                  {expandedRx === rx._id ? (
                    <ChevronUp className="h-4 w-4 text-neutral-900/30 dark:text-neutral-100/30" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-neutral-900/30 dark:text-neutral-100/30" />
                  )}
                </div>
              </div>

              <AnimatePresence>
                {expandedRx === rx._id && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="mt-3 pt-3 border-t border-neutral-300/40 dark:border-primary-800 space-y-2">
                      {rx.medications?.map((med, i) => (
                        <div key={i} className="flex items-start gap-2 text-xs">
                          <Pill className="h-3.5 w-3.5 text-primary-500 mt-0.5 shrink-0" />
                          <div>
                            <span className="font-medium text-neutral-900 dark:text-neutral-100">{med.name}</span>
                            <span className="text-neutral-900/40 dark:text-neutral-100/40">
                              {' '}&mdash; {med.dosage}, {med.frequency}, {med.duration}
                            </span>
                          </div>
                        </div>
                      ))}
                      {rx.notes && (
                        <p className="text-xs text-neutral-900/40 dark:text-neutral-100/40 mt-2 pt-2 border-t border-neutral-300/30 dark:border-primary-800">
                          <span className="font-medium">Notes:</span> {rx.notes}
                        </p>
                      )}
                      {/* Reminders toggle */}
                      {rx.status === 'active' && (
                        <div className="mt-3 pt-3 border-t border-neutral-300/30 dark:border-primary-800 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <BellRing className="h-3.5 w-3.5 text-primary-500" />
                            <span className="text-xs font-medium text-neutral-900 dark:text-neutral-100">
                              Care Reminders
                            </span>
                          </div>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleToggleReminders(rx); }}
                            disabled={togglingReminder === rx._id}
                            className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                              rx.followUpRemindersEnabled
                                ? 'bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400'
                                : 'bg-primary-50 text-primary-600 hover:bg-primary-100 dark:bg-primary-900/20 dark:text-primary-400'
                            }`}
                          >
                            {togglingReminder === rx._id
                              ? 'Processing...'
                              : rx.followUpRemindersEnabled ? 'Disable' : 'Enable'}
                          </button>
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ))}
        </div>
      )}

      {rxTotal > PAGE_LIMIT && (
        <Pagination page={rxPage} limit={PAGE_LIMIT} total={rxTotal} onChange={setRxPage} />
      )}
    </div>
  );
}

// ─── CareTasksSubTab ─────────────────────────────────

const FREQ_LABELS = {
  once: 'Once daily', twice_daily: 'Twice daily', thrice_daily: '3x daily',
  four_times_daily: '4x daily', after_meals: 'After meals', before_meals: 'Before meals',
  bedtime: 'At bedtime', custom: 'Custom',
};

function CareTasksSubTab({ activePatientId, setToast }) {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('active');
  const [expandedTask, setExpandedTask] = useState(null);
  const [reminders, setReminders] = useState({});
  const [loadingReminders, setLoadingReminders] = useState(null);
  const [responding, setResponding] = useState(null);
  const [toggling, setToggling] = useState(null);

  const handleToggle = async (task) => {
    setToggling(task._id);
    try {
      const res = await toggleTaskReminder(activePatientId, task._id);
      const updated = res.data || {};
      setTasks(prev => prev.map(t =>
        t._id === task._id ? { ...t, isActive: updated.isActive } : t,
      ));
    } catch (err) {
      setToast({ type: 'error', message: err.message || 'Failed to toggle' });
    } finally {
      setToggling(null);
    }
  };

  const fetchTasks = useCallback(async () => {
    if (!activePatientId) return;
    setLoading(true);
    try {
      const res = await listCareTasks(activePatientId, { limit: 50, status: filter || undefined });
      setTasks(res.data || []);
    } catch {
      setTasks([]);
    } finally {
      setLoading(false);
    }
  }, [activePatientId, filter]);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  const handleExpand = async (taskId) => {
    if (expandedTask === taskId) {
      setExpandedTask(null);
      return;
    }
    setExpandedTask(taskId);
    if (!reminders[taskId]) {
      setLoadingReminders(taskId);
      try {
        const res = await listTaskReminders(activePatientId, taskId, { range: 'today' });
        setReminders(prev => ({ ...prev, [taskId]: res.data || [] }));
      } catch {
        setReminders(prev => ({ ...prev, [taskId]: [] }));
      } finally {
        setLoadingReminders(null);
      }
    }
  };

  const handleRespond = async (task, reminderId, status) => {
    setResponding(reminderId);
    try {
      await respondToReminder(activePatientId, task._id, reminderId, { status });
      // Update reminder locally
      setReminders(prev => ({
        ...prev,
        [task._id]: (prev[task._id] || []).map(r =>
          r._id === reminderId ? { ...r, status, respondedAt: new Date().toISOString() } : r,
        ),
      }));
      // Update task counters locally
      setTasks(prev => prev.map(t => {
        if (t._id !== task._id) return t;
        const completedCount = status === 'done' ? (t.completedCount || 0) + 1 : (t.completedCount || 0);
        const skippedCount = status === 'skipped' ? (t.skippedCount || 0) + 1 : (t.skippedCount || 0);
        return {
          ...t,
          completedCount,
          skippedCount,
          remainingReminders: Math.max(0, (t.remainingReminders || 0) - 1),
          completionRate: t.totalReminders > 0 ? Math.round((completedCount / t.totalReminders) * 100) : 0,
        };
      }));
    } catch (err) {
      setToast({ type: 'error', message: err.message || 'Failed to respond' });
    } finally {
      setResponding(null);
    }
  };

  const progressColor = (rate) =>
    rate >= 80 ? 'bg-green-500' : rate >= 50 ? 'bg-amber-500' : 'bg-red-500';

  return (
    <div className="space-y-4">
      {/* Filter */}
      <div className="flex gap-2">
        {[
          { key: 'active', label: 'Active' },
          { key: 'completed', label: 'Completed' },
          { key: '', label: 'All' },
        ].map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              filter === f.key
                ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400'
                : 'text-neutral-900/40 hover:text-neutral-900/60 dark:text-neutral-100/40 dark:hover:text-neutral-100/60'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Task Cards */}
      {loading ? (
        <SkeletonLoader variant="card" count={3} />
      ) : tasks.length === 0 ? (
        <EmptyStateIllustration
          type="consultation"
          message={filter === 'active' ? 'No active care tasks. Enable reminders on a prescription to get started.' : 'No care tasks found'}
        />
      ) : (
        <div className="space-y-3">
          {tasks.map((task) => {
            const taskReminders = reminders[task._id] || [];
            const actionable = taskReminders.filter(r => r.status === 'pending' || r.status === 'sent');
            const responded = taskReminders.filter(r => r.status === 'done' || r.status === 'skipped' || r.status === 'missed');
            const progress = task.totalReminders > 0
              ? Math.min(((task.completedCount + task.skippedCount + (task.missedCount || 0)) / task.totalReminders) * 100, 100)
              : 0;

            return (
              <motion.div key={task._id} layout transition={SPRING} className={`${cardCls} p-4`}>
                <div
                  className="flex items-center justify-between cursor-pointer"
                  onClick={() => handleExpand(task._id)}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                      {task.title}
                    </p>
                    <p className="text-xs text-neutral-900/40 dark:text-neutral-100/40">
                      {FREQ_LABELS[task.frequency] || task.frequency}
                      {' \u2022 '}
                      {formatDate(task.startDate)} &mdash; {formatDate(task.endDate)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {/* Per-task toggle */}
                    <button
                      onClick={(e) => { e.stopPropagation(); handleToggle(task); }}
                      disabled={toggling === task._id}
                      className={`relative w-10 h-5 rounded-full transition-colors ${task.isActive ? 'bg-green-500' : 'bg-gray-300 dark:bg-primary-600'} ${toggling === task._id ? 'opacity-50' : ''}`}
                      title={task.isActive ? 'Disable reminders' : 'Enable reminders'}
                    >
                      <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${task.isActive ? 'translate-x-5' : 'translate-x-0'}`} />
                    </button>
                    <Badge
                      label={task.isActive ? `${task.completionRate || 0}%` : 'Done'}
                      color={task.isActive ? (task.completionRate >= 80 ? 'green' : task.completionRate >= 50 ? 'yellow' : 'red') : 'gray'}
                    />
                    {expandedTask === task._id ? (
                      <ChevronUp className="h-4 w-4 text-neutral-900/30 dark:text-neutral-100/30" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-neutral-900/30 dark:text-neutral-100/30" />
                    )}
                  </div>
                </div>

                {/* Progress bar */}
                <div className="mt-3">
                  <div className="h-1.5 bg-neutral-200 dark:bg-primary-700 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${progressColor(task.completionRate || 0)}`}
                      style={{ width: `${Math.round(progress)}%` }}
                    />
                  </div>
                  <div className="flex justify-between mt-1.5">
                    <span className="text-[10px] text-neutral-900/30 dark:text-neutral-100/30 flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3" /> {task.completedCount || 0}
                    </span>
                    <span className="text-[10px] text-neutral-900/30 dark:text-neutral-100/30 flex items-center gap-1">
                      <SkipForward className="h-3 w-3" /> {task.skippedCount || 0}
                    </span>
                    <span className="text-[10px] text-neutral-900/30 dark:text-neutral-100/30 flex items-center gap-1">
                      <CircleX className="h-3 w-3" /> {task.missedCount || 0}
                    </span>
                    <span className="text-[10px] text-neutral-900/30 dark:text-neutral-100/30 flex items-center gap-1">
                      <CircleDashed className="h-3 w-3" /> {task.remainingReminders || 0} left
                    </span>
                  </div>
                </div>

                {/* Expanded: today's reminders */}
                <AnimatePresence>
                  {expandedTask === task._id && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="mt-3 pt-3 border-t border-neutral-300/40 dark:border-primary-800 space-y-2">
                        {task.instructions && (
                          <p className="text-xs text-neutral-900/50 dark:text-neutral-100/50 mb-2">
                            {task.instructions}
                          </p>
                        )}

                        <p className="text-xs font-semibold text-neutral-900/60 dark:text-neutral-100/60">
                          Today&apos;s Schedule
                        </p>

                        {loadingReminders === task._id ? (
                          <div className="flex justify-center py-4">
                            <Loader2 className="h-4 w-4 animate-spin text-primary-500" />
                          </div>
                        ) : taskReminders.length === 0 ? (
                          <p className="text-xs text-neutral-900/30 dark:text-neutral-100/30 py-2">
                            No reminders scheduled for today
                          </p>
                        ) : (
                          <>
                            {/* Actionable reminders */}
                            {actionable.map((rem) => (
                              <div key={rem._id} className="flex items-center justify-between py-2 px-3 rounded-lg bg-neutral-50 dark:bg-primary-800">
                                <div>
                                  <span className="text-xs font-medium text-neutral-900 dark:text-neutral-100">
                                    {formatTime(rem.scheduledAt)}
                                  </span>
                                  <span className="text-[10px] ml-2 text-neutral-900/30 dark:text-neutral-100/30">
                                    {rem.status === 'sent' ? 'Sent' : 'Pending'}
                                  </span>
                                </div>
                                <div className="flex gap-2">
                                  <button
                                    onClick={() => handleRespond(task, rem._id, 'done')}
                                    disabled={responding !== null}
                                    className="px-3 py-1 rounded-lg text-xs font-medium bg-primary-500 text-white hover:bg-primary-600 transition disabled:opacity-50"
                                  >
                                    {responding === rem._id ? '...' : 'Done'}
                                  </button>
                                  <button
                                    onClick={() => handleRespond(task, rem._id, 'skipped')}
                                    disabled={responding !== null}
                                    className="px-3 py-1 rounded-lg text-xs font-medium bg-neutral-200 text-neutral-900/60 hover:bg-neutral-300 transition dark:bg-primary-700 dark:text-neutral-100/60 disabled:opacity-50"
                                  >
                                    Skip
                                  </button>
                                </div>
                              </div>
                            ))}

                            {/* Responded reminders */}
                            {responded.map((rem) => (
                              <div key={rem._id} className="flex items-center justify-between py-2 px-3 rounded-lg opacity-60">
                                <span className="text-xs text-neutral-900/50 dark:text-neutral-100/50">
                                  {formatTime(rem.scheduledAt)}
                                </span>
                                <Badge
                                  label={rem.status}
                                  color={rem.status === 'done' ? 'green' : rem.status === 'skipped' ? 'yellow' : 'red'}
                                />
                              </div>
                            ))}
                          </>
                        )}

                        {/* Next reminder */}
                        {task.nextReminder && (
                          <p className="text-xs text-neutral-900/30 dark:text-neutral-100/30 pt-2 border-t border-neutral-300/20 dark:border-primary-800">
                            <Bell className="h-3 w-3 inline mr-1" />
                            Next: {formatDateTime(task.nextReminder)}
                          </p>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── DailyChecklistSubTab ────────────────────────────

function DailyChecklistSubTab({ activePatientId, setToast }) {
  const [schedule, setSchedule] = useState(null);
  const [loading, setLoading] = useState(true);
  const [responding, setResponding] = useState(null);

  const fetchSchedule = useCallback(async () => {
    if (!activePatientId) return;
    setLoading(true);
    try {
      const res = await getDailyCareSchedule(activePatientId);
      setSchedule(res.data || null);
    } catch {
      setSchedule(null);
    } finally {
      setLoading(false);
    }
  }, [activePatientId]);

  useEffect(() => { fetchSchedule(); }, [fetchSchedule]);

  const handleRespond = async (reminder, status) => {
    setResponding(reminder._id);
    try {
      await respondToReminder(activePatientId, reminder.task?._id || reminder.task, reminder._id, { status });
      setSchedule(prev => {
        if (!prev) return prev;
        const updated = prev.reminders.map(r =>
          r._id === reminder._id ? { ...r, status, respondedAt: new Date().toISOString() } : r,
        );
        const stats = { total: updated.length, completed: 0, pending: 0, skipped: 0, missed: 0 };
        for (const r of updated) {
          if (r.status === 'done') stats.completed++;
          else if (r.status === 'skipped') stats.skipped++;
          else if (r.status === 'missed') stats.missed++;
          else stats.pending++;
        }
        return { ...prev, reminders: updated, stats };
      });
    } catch (err) {
      setToast({ type: 'error', message: err.message || 'Failed to respond' });
    } finally {
      setResponding(null);
    }
  };

  if (loading) return <SkeletonLoader variant="card" count={3} />;
  if (!schedule) return <EmptyStateIllustration type="consultation" message="Could not load today's schedule" />;

  const { stats, reminders: items } = schedule;
  const actionable = items.filter(r => r.status === 'pending' || r.status === 'sent');
  const responded = items.filter(r => r.status === 'done' || r.status === 'skipped' || r.status === 'missed');

  return (
    <div className="space-y-5">
      {/* Stats Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MetricCard title="Total" value={stats.total} icon={BellRing} color="primary" />
        <MetricCard title="Completed" value={stats.completed} icon={CheckCircle2} color="green" />
        <MetricCard title="Pending" value={stats.pending} icon={CircleDashed} color="yellow" />
        <MetricCard title="Missed" value={stats.missed} icon={CircleX} color="red" />
      </div>

      {items.length === 0 ? (
        <EmptyStateIllustration type="consultation" message="No reminders scheduled for today" />
      ) : (
        <div className="space-y-3">
          {/* Actionable */}
          {actionable.length > 0 && (
            <>
              <p className="text-xs font-semibold text-neutral-900/60 dark:text-neutral-100/60">Pending</p>
              {actionable.map((rem) => (
                <div key={rem._id} className={`${cardCls} p-4 flex items-center justify-between`}>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                      {rem.task?.title || 'Medication'}
                    </p>
                    <p className="text-xs text-neutral-900/40 dark:text-neutral-100/40">
                      {formatTime(rem.scheduledAt)}
                      {rem.task?.prescription?.diagnosis && ` \u2022 ${rem.task.prescription.diagnosis}`}
                    </p>
                    {rem.task?.instructions && (
                      <p className="text-xs text-neutral-900/30 dark:text-neutral-100/30 mt-1">{rem.task.instructions}</p>
                    )}
                  </div>
                  <div className="flex gap-2 ml-3">
                    <button
                      onClick={() => handleRespond(rem, 'done')}
                      disabled={responding !== null}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium bg-primary-500 text-white hover:bg-primary-600 transition disabled:opacity-50"
                    >
                      {responding === rem._id ? '...' : 'Done'}
                    </button>
                    <button
                      onClick={() => handleRespond(rem, 'skipped')}
                      disabled={responding !== null}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium bg-neutral-200 text-neutral-900/60 hover:bg-neutral-300 transition dark:bg-primary-700 dark:text-neutral-100/60 disabled:opacity-50"
                    >
                      Skip
                    </button>
                  </div>
                </div>
              ))}
            </>
          )}

          {/* Responded */}
          {responded.length > 0 && (
            <>
              <p className="text-xs font-semibold text-neutral-900/60 dark:text-neutral-100/60 mt-4">Completed</p>
              {responded.map((rem) => (
                <div key={rem._id} className={`${cardCls} p-4 flex items-center justify-between opacity-60`}>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                      {rem.task?.title || 'Medication'}
                    </p>
                    <p className="text-xs text-neutral-900/40 dark:text-neutral-100/40">{formatTime(rem.scheduledAt)}</p>
                  </div>
                  <Badge
                    label={rem.status}
                    color={rem.status === 'done' ? 'green' : rem.status === 'skipped' ? 'yellow' : 'red'}
                  />
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── RecordsSubTab ───────────────────────────────────

function RecordsSubTab({ activePatientId }) {
  const [records, setRecords] = useState([]);
  const [recordsPage, setRecordsPage] = useState(1);
  const [recordsTotal, setRecordsTotal] = useState(0);
  const [recordsLoading, setRecordsLoading] = useState(true);

  const fetchRecords = useCallback(async () => {
    if (!activePatientId) return;
    setRecordsLoading(true);
    try {
      const res = await getMedicalHistory(activePatientId, { page: recordsPage, limit: PAGE_LIMIT });
      setRecords(res.data || []);
      setRecordsTotal(res.total || res.pagination?.total || 0);
    } catch {
      setRecords([]);
    } finally {
      setRecordsLoading(false);
    }
  }, [activePatientId, recordsPage]);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  if (recordsLoading) return <SkeletonLoader variant="card" count={4} />;

  if (records.length === 0) {
    return (
      <EmptyStateIllustration
        type="consultation"
        message="No medical records found"
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-4">
        {records.map((record) => (
          <motion.div
            key={record._id}
            layout
            transition={SPRING}
            className={`${cardCls} p-4`}
          >
            <div className="flex items-center gap-3 mb-2">
              <div className="w-2 h-2 rounded-full bg-primary-500 shrink-0" />
              <span className="text-xs text-neutral-900/40 dark:text-neutral-100/40">
                {formatDate(record.createdAt)}
              </span>
              <span className="text-xs font-medium text-neutral-900/60 dark:text-neutral-100/60">
                Dr. {record.doctor?.name || 'Unknown'}
              </span>
            </div>
            <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
              {record.diagnosis || record.chiefComplaint || 'General Checkup'}
            </p>
            <p className="text-xs text-neutral-900/50 dark:text-neutral-100/40 mt-1">
              {record.treatment || record.notes || 'No treatment details recorded'}
            </p>
            {record.attachments?.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {record.attachments.map((att, i) => (
                  <a
                    key={i}
                    href={att.fileUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-primary-500 hover:underline flex items-center gap-1"
                  >
                    <Paperclip className="h-3 w-3" />
                    {att.fileName || `Attachment ${i + 1}`}
                  </a>
                ))}
              </div>
            )}
          </motion.div>
        ))}
      </div>

      {recordsTotal > PAGE_LIMIT && (
        <Pagination page={recordsPage} limit={PAGE_LIMIT} total={recordsTotal} onChange={setRecordsPage} />
      )}
    </div>
  );
}

// ─── ReportsSubTab ───────────────────────────────────

function ReportsSubTab({ activePatientId }) {
  const [records, setRecords] = useState([]);
  const [reportsLoading, setReportsLoading] = useState(true);

  useEffect(() => {
    if (!activePatientId) return;
    setReportsLoading(true);
    getMedicalHistory(activePatientId, { page: 1, limit: 50 })
      .then((res) => setRecords(res.data || []))
      .catch(() => setRecords([]))
      .finally(() => setReportsLoading(false));
  }, [activePatientId]);

  if (reportsLoading) return <SkeletonLoader variant="card" count={3} />;

  const allAttachments = records.flatMap((record) =>
    (record.attachments || []).map((att) => ({
      ...att,
      recordDate: record.createdAt,
      doctorName: record.doctor?.name || 'Unknown',
      diagnosis: record.diagnosis || 'General',
    })),
  );

  if (allAttachments.length === 0) {
    return (
      <EmptyStateIllustration
        type="consultation"
        message="No reports or attachments found"
      />
    );
  }

  return (
    <div className="space-y-3">
      {allAttachments.map((att, i) => (
        <motion.div
          key={`${att.fileUrl}-${i}`}
          whileHover={{ y: -1 }}
          transition={SPRING}
          className={`${cardCls} p-4 flex items-center gap-4`}
        >
          <div className="w-10 h-10 rounded-xl bg-primary-50 dark:bg-primary-900/20 flex items-center justify-center shrink-0">
            <FileText className="h-5 w-5 text-primary-600 dark:text-primary-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100 truncate">
              {att.fileName || `Report ${i + 1}`}
            </p>
            <p className="text-xs text-neutral-900/40 dark:text-neutral-100/40">
              Dr. {att.doctorName} {'\u2022'} {formatDate(att.recordDate)} {'\u2022'} {att.diagnosis}
            </p>
          </div>
          <a
            href={att.fileUrl}
            target="_blank"
            rel="noreferrer"
            className={`${btnPrimary} text-xs px-3 py-1.5`}
          >
            Download
          </a>
        </motion.div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
//  TAB 4: PaymentsTab
// ═══════════════════════════════════════════════════════════════════════════════

function PaymentsTab({ activePatientId, setToast }) {
  const [paySubTab, setPaySubTab] = useState('invoices');

  // ── Financial Summary ──
  const [summary, setSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(true);

  // ── Invoices state ──
  const [invoices, setInvoices] = useState([]);
  const [payPage, setPayPage] = useState(1);
  const [payTotal, setPayTotal] = useState(0);
  const [payLoading, setPayLoading] = useState(true);
  const [payFilter, setPayFilter] = useState('');
  const [insuranceUploading, setInsuranceUploading] = useState(false);
  const [payingId, setPayingId] = useState(null);
  const [downloadingId, setDownloadingId] = useState(null);

  // ── Ledger state ──
  const [ledger, setLedger] = useState([]);
  const [ledgerPage, setLedgerPage] = useState(1);
  const [ledgerTotal, setLedgerTotal] = useState(0);
  const [ledgerLoading, setLedgerLoading] = useState(false);

  // ── Credits state ──
  const [credits, setCredits] = useState([]);
  const [creditsPage, setCreditsPage] = useState(1);
  const [creditsTotal, setCreditsTotal] = useState(0);
  const [creditsLoading, setCreditsLoading] = useState(false);

  // ── Fetch financial summary ──
  const fetchSummary = useCallback(async () => {
    if (!activePatientId) return;
    setSummaryLoading(true);
    try {
      const res = await getPatientFinancialSummary(activePatientId);
      setSummary(res.data || res);
    } catch {
      setSummary(null);
    } finally {
      setSummaryLoading(false);
    }
  }, [activePatientId]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  // ── Fetch invoices ──
  const fetchPayments = useCallback(async () => {
    if (!activePatientId) return;
    setPayLoading(true);
    try {
      const params = { page: payPage, limit: PAGE_LIMIT };
      if (payFilter) params.status = payFilter;
      const res = await listPaymentHistory(activePatientId, params);
      setInvoices(res.data || []);
      setPayTotal(res.total || res.pagination?.total || 0);
    } catch {
      setInvoices([]);
    } finally {
      setPayLoading(false);
    }
  }, [activePatientId, payPage, payFilter]);

  useEffect(() => {
    fetchPayments();
  }, [fetchPayments]);

  useEffect(() => {
    setPayPage(1);
  }, [payFilter]);

  // ── Fetch ledger ──
  const fetchLedger = useCallback(async () => {
    if (!activePatientId) return;
    setLedgerLoading(true);
    try {
      const res = await getPatientLedger(activePatientId, { page: ledgerPage, limit: PAGE_LIMIT });
      setLedger(res.data || []);
      setLedgerTotal(res.total || res.pagination?.total || 0);
    } catch {
      setLedger([]);
    } finally {
      setLedgerLoading(false);
    }
  }, [activePatientId, ledgerPage]);

  useEffect(() => {
    if (paySubTab === 'ledger') fetchLedger();
  }, [paySubTab, fetchLedger]);

  // ── Fetch credits ──
  const fetchCredits = useCallback(async () => {
    if (!activePatientId) return;
    setCreditsLoading(true);
    try {
      const res = await getPatientCreditNotes(activePatientId, { page: creditsPage, limit: PAGE_LIMIT });
      setCredits(res.data || []);
      setCreditsTotal(res.total || res.pagination?.total || 0);
    } catch {
      setCredits([]);
    } finally {
      setCreditsLoading(false);
    }
  }, [activePatientId, creditsPage]);

  useEffect(() => {
    if (paySubTab === 'credits') fetchCredits();
  }, [paySubTab, fetchCredits]);

  // ── Razorpay integration (secured: server-side order + verification) ──
  function openRazorpayCheckout({ orderId, amount, currency, key, invoiceId, invoiceNumber, patientName, patientEmail, patientPhone }) {
    const rzp = new window.Razorpay({
      key: key || import.meta.env.VITE_RAZORPAY_KEY_ID,
      amount,
      currency: currency || 'INR',
      order_id: orderId,
      name: 'BestoClinic',
      description: `Invoice ${invoiceNumber}`,
      prefill: { name: patientName, email: patientEmail, contact: patientPhone },
      handler: async (response) => {
        // Verify payment signature server-side before confirming
        try {
          await initiatePayment(activePatientId, invoiceId, {
            razorpay_order_id: response.razorpay_order_id,
            razorpay_payment_id: response.razorpay_payment_id,
            razorpay_signature: response.razorpay_signature,
          });
          setToast({ type: 'success', message: 'Payment successful!' });
          fetchPayments();
          fetchSummary();
        } catch (err) {
          setToast({ type: 'error', message: err.message || 'Payment verification failed' });
        } finally {
          setPayingId(null);
        }
      },
      modal: { ondismiss: () => setPayingId(null) },
    });
    rzp.on('payment.failed', (resp) => {
      setToast({ type: 'error', message: resp.error?.description || 'Payment failed' });
      setPayingId(null);
    });
    rzp.open();
  }

  async function handlePay(invoice) {
    if (payingId) return;
    setPayingId(invoice._id);
    try {
      // Step 1: Create server-side gateway order (amount determined by server)
      const res = await initiatePayment(activePatientId, invoice._id);
      const payData = res.data || res;

      // Step 2: Open Razorpay checkout with server-provided order
      const launchCheckout = () => openRazorpayCheckout({
        orderId: payData.orderId || payData.order_id,
        amount: payData.amount,
        currency: payData.currency,
        key: payData.razorpayKeyId || payData.key,
        invoiceId: invoice._id,
        invoiceNumber: invoice.invoiceNumber,
        patientName: invoice.patient?.name,
        patientEmail: invoice.patient?.email,
        patientPhone: invoice.patient?.phone,
      });

      if (!window.Razorpay) {
        const script = document.createElement('script');
        script.src = 'https://checkout.razorpay.com/v1/checkout.js';
        script.onload = launchCheckout;
        document.body.appendChild(script);
      } else {
        launchCheckout();
      }
    } catch (err) {
      setToast({ type: 'error', message: err.message || 'Failed to initiate payment' });
      setPayingId(null);
    }
  }

  // ── Download PDF ──
  async function handleDownloadPdf(invoice) {
    if (downloadingId) return;
    setDownloadingId(invoice._id);
    try {
      await downloadPatientInvoicePdf(activePatientId, invoice._id);
      setToast({ type: 'success', message: 'Invoice PDF downloaded!' });
    } catch (err) {
      setToast({ type: 'error', message: err.message || 'Failed to download PDF' });
    } finally {
      setDownloadingId(null);
    }
  }

  const handleInsuranceUpload = async (fileData) => {
    setInsuranceUploading(true);
    try {
      await uploadInsuranceDoc(activePatientId, {
        fileName: fileData.name,
        fileSize: fileData.size,
        base64: fileData.base64,
      });
      setToast({ type: 'success', message: 'Insurance document uploaded!' });
    } catch (err) {
      setToast({ type: 'error', message: err.message || 'Upload failed' });
    } finally {
      setInsuranceUploading(false);
    }
  };

  const pendingInvoices = invoices.filter((inv) => ['sent', 'overdue', 'pending'].includes(inv.status));

  const allColumns = [
    {
      key: 'invoiceNumber',
      label: 'Invoice',
      render: (row) => (
        <span className="font-medium text-neutral-900 dark:text-neutral-100">{row.invoiceNumber || '-'}</span>
      ),
    },
    {
      key: 'createdAt',
      label: 'Date',
      render: (row) => formatDate(row.createdAt),
    },
    {
      key: 'totalAmount',
      label: 'Amount',
      render: (row) => (
        <span className="font-semibold text-neutral-900 dark:text-neutral-100">{formatCurrency(row.totalAmount)}</span>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      render: (row) => <Badge label={row.status} color={STATUS_COLOR_MAP[row.status] || 'gray'} />,
    },
    {
      key: 'actions',
      label: '',
      render: (row) => (
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleDownloadPdf(row)}
            disabled={downloadingId === row._id}
            className="p-1.5 rounded-lg hover:bg-neutral-100 dark:hover:bg-primary-800 text-neutral-900/40 dark:text-neutral-100/40 transition-colors disabled:opacity-50"
            title="Download PDF"
          >
            {downloadingId === row._id ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
          </button>
          {['sent', 'overdue', 'pending'].includes(row.status) && (
            <button
              onClick={() => handlePay(row)}
              disabled={payingId === row._id}
              className="px-3 py-1 rounded-lg bg-primary-500 text-white text-xs font-medium hover:bg-primary-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {payingId === row._id ? 'Processing...' : 'Pay'}
            </button>
          )}
        </div>
      ),
    },
  ];

  // ── Credit status color helper ──
  const creditStatusColor = (status) => {
    if (status === 'active' || status === 'available') return 'green';
    if (status === 'used' || status === 'fully_applied') return 'gray';
    if (status === 'expired') return 'red';
    if (status === 'partially_applied') return 'yellow';
    return 'gray';
  };

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-bold text-neutral-900 dark:text-neutral-100 font-display">
        Payments & Billing
      </h2>

      {/* Financial Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Total Billed"
          value={formatCurrency(summary?.totalBilled || 0)}
          icon={Wallet}
          color="primary"
          loading={summaryLoading}
        />
        <MetricCard
          title="Total Paid"
          value={formatCurrency(summary?.totalPaid || 0)}
          icon={CreditCard}
          color="green"
          loading={summaryLoading}
        />
        <MetricCard
          title="Outstanding"
          value={formatCurrency(summary?.outstanding || 0)}
          icon={AlertTriangle}
          color="yellow"
          loading={summaryLoading}
        />
        <MetricCard
          title="Available Credit"
          value={formatCurrency(summary?.availableCredit || 0)}
          icon={BookOpen}
          color="purple"
          loading={summaryLoading}
        />
      </div>

      {/* Sub-tab pills */}
      <div className="flex gap-2">
        {[
          { key: 'invoices', label: 'Invoices' },
          { key: 'ledger', label: 'Ledger' },
          { key: 'credits', label: 'Credits' },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setPaySubTab(t.key)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
              paySubTab === t.key
                ? 'bg-primary-500 text-white shadow-sm shadow-primary-600/20'
                : 'bg-neutral-100 text-neutral-900/50 hover:bg-neutral-200 dark:bg-primary-800 dark:text-neutral-100/50 dark:hover:bg-primary-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {/* ════════ Invoices Sub-tab ════════ */}
        {paySubTab === 'invoices' && (
          <motion.div key="invoices" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}>
            <div className="space-y-6">
              {/* Outstanding Invoices */}
              {payLoading ? (
                <SkeletonLoader variant="card" count={3} />
              ) : pendingInvoices.length > 0 ? (
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-neutral-900/50 dark:text-neutral-100/50 uppercase tracking-wide">
                    Outstanding
                  </h3>
                  {pendingInvoices.map((inv) => (
                    <motion.div
                      key={inv._id}
                      whileHover={{ y: -1 }}
                      transition={SPRING}
                      className={`${cardCls} p-4 flex items-center gap-4`}
                    >
                      <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center shrink-0">
                        <CreditCard className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                          {formatCurrency(inv.totalAmount)}
                        </p>
                        <p className="text-xs text-neutral-900/40 dark:text-neutral-100/40">
                          {inv.invoiceNumber} {'\u2022'} {formatDate(inv.createdAt)}
                        </p>
                      </div>
                      <Badge label={inv.status} color={inv.status === 'overdue' ? 'red' : 'yellow'} />
                      <button
                        onClick={() => handleDownloadPdf(inv)}
                        disabled={downloadingId === inv._id}
                        className="p-2 rounded-lg hover:bg-neutral-100 dark:hover:bg-primary-800 text-neutral-900/40 dark:text-neutral-100/40 transition-colors disabled:opacity-50"
                        title="Download PDF"
                      >
                        {downloadingId === inv._id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                      </button>
                      <button
                        onClick={() => handlePay(inv)}
                        disabled={payingId === inv._id}
                        className="px-4 py-1.5 rounded-lg bg-primary-500 text-white text-xs font-medium hover:bg-primary-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {payingId === inv._id ? 'Processing...' : 'Pay Now'}
                      </button>
                    </motion.div>
                  ))}
                </div>
              ) : null}

              {/* Payment History Table */}
              <div className={`${cardCls} overflow-hidden`}>
                <div className="px-5 py-4 border-b border-neutral-300/40 dark:border-primary-800 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">Payment History</h3>
                  <div className="flex gap-2">
                    {[
                      { key: '', label: 'All' },
                      { key: 'pending', label: 'Pending' },
                      { key: 'paid', label: 'Paid' },
                    ].map((f) => (
                      <button
                        key={f.key}
                        onClick={() => setPayFilter(f.key)}
                        className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                          payFilter === f.key
                            ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400'
                            : 'text-neutral-900/40 hover:text-neutral-900/60 dark:text-neutral-100/40 dark:hover:text-neutral-100/60'
                        }`}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>
                {payLoading ? (
                  <div className="p-5"><SkeletonLoader variant="row" count={5} /></div>
                ) : invoices.length === 0 ? (
                  <EmptyStateIllustration type="revenue" message="No payment records found" />
                ) : (
                  <DataTable columns={allColumns} data={invoices} />
                )}
              </div>

              {payTotal > PAGE_LIMIT && (
                <Pagination page={payPage} limit={PAGE_LIMIT} total={payTotal} onChange={setPayPage} />
              )}

              {/* Insurance Upload Section */}
              <div className={`${cardCls} p-5`}>
                <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 mb-4">
                  Insurance Documents
                </h3>
                <p className="text-xs text-neutral-900/40 dark:text-neutral-100/40 mb-4">
                  Upload your insurance card or claim documents for faster processing.
                </p>
                <FileDropzone
                  onFileSelect={handleInsuranceUpload}
                  accept="image/*,.pdf"
                  maxSizeMB={10}
                  label="Drop insurance document here or click to upload"
                  uploading={insuranceUploading}
                />
              </div>
            </div>
          </motion.div>
        )}

        {/* ════════ Ledger Sub-tab ════════ */}
        {paySubTab === 'ledger' && (
          <motion.div key="ledger" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}>
            <div className="space-y-4">
              {ledgerLoading ? (
                <SkeletonLoader variant="card" count={5} />
              ) : ledger.length === 0 ? (
                <EmptyStateIllustration type="revenue" message="No ledger entries found" />
              ) : (
                <div className="space-y-3">
                  {ledger.map((entry, index) => {
                    const isCredit = entry.type === 'credit';
                    return (
                      <motion.div
                        key={entry._id || index}
                        whileHover={{ y: -1 }}
                        transition={SPRING}
                        className={`${cardCls} p-4 flex items-center gap-4`}
                      >
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                          isCredit
                            ? 'bg-emerald-50 dark:bg-emerald-900/20'
                            : 'bg-red-50 dark:bg-red-900/20'
                        }`}>
                          {isCredit ? (
                            <ArrowDownLeft className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                          ) : (
                            <ArrowUpRight className="h-5 w-5 text-red-600 dark:text-red-400" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100 truncate">
                            {entry.description || (isCredit ? 'Payment Received' : 'Charge')}
                          </p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <Badge
                              label={entry.sourceType?.replace(/_/g, ' ') || (isCredit ? 'payment' : 'invoice')}
                              color={isCredit ? 'green' : 'blue'}
                            />
                            <span className="text-xs text-neutral-900/40 dark:text-neutral-100/40">
                              {formatDate(entry.date || entry.createdAt)}
                            </span>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className={`text-sm font-semibold ${
                            isCredit ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
                          }`}>
                            {isCredit ? '+' : '-'}{formatCurrency(entry.amount)}
                          </p>
                          {entry.runningBalance !== undefined && (
                            <p className="text-xs text-neutral-900/40 dark:text-neutral-100/40 mt-0.5">
                              Bal: {formatCurrency(entry.runningBalance)}
                            </p>
                          )}
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              )}

              {ledgerTotal > PAGE_LIMIT && (
                <Pagination page={ledgerPage} limit={PAGE_LIMIT} total={ledgerTotal} onChange={setLedgerPage} />
              )}
            </div>
          </motion.div>
        )}

        {/* ════════ Credits Sub-tab ════════ */}
        {paySubTab === 'credits' && (
          <motion.div key="credits" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}>
            <div className="space-y-4">
              {creditsLoading ? (
                <SkeletonLoader variant="card" count={4} />
              ) : credits.length === 0 ? (
                <EmptyStateIllustration type="revenue" message="No credit notes found" />
              ) : (
                <div className="space-y-3">
                  {credits.map((cn, index) => (
                    <motion.div
                      key={cn._id || index}
                      whileHover={{ y: -1 }}
                      transition={SPRING}
                      className={`${cardCls} p-4`}
                    >
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-4 min-w-0">
                          <div className="w-10 h-10 rounded-xl bg-purple-50 dark:bg-purple-900/20 flex items-center justify-center shrink-0">
                            <Receipt className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                              {cn.creditNoteNumber || cn.cnNumber || `CN-${String(index + 1).padStart(4, '0')}`}
                            </p>
                            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                              {cn.reason && (
                                <Badge label={cn.reason.replace(/_/g, ' ')} color="blue" />
                              )}
                              <Badge label={cn.status || 'active'} color={creditStatusColor(cn.status)} />
                            </div>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-semibold text-purple-600 dark:text-purple-400">
                            {formatCurrency(cn.amount)}
                          </p>
                          {cn.appliedAmount !== undefined && cn.appliedAmount > 0 && (
                            <p className="text-xs text-neutral-900/40 dark:text-neutral-100/40 mt-0.5">
                              Applied: {formatCurrency(cn.appliedAmount)}
                            </p>
                          )}
                        </div>
                      </div>
                      {cn.validUntil && (
                        <p className="text-xs text-neutral-900/30 dark:text-neutral-100/30 mt-2 pl-14">
                          Valid until {formatDate(cn.validUntil)}
                        </p>
                      )}
                    </motion.div>
                  ))}
                </div>
              )}

              {creditsTotal > PAGE_LIMIT && (
                <Pagination page={creditsPage} limit={PAGE_LIMIT} total={creditsTotal} onChange={setCreditsPage} />
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
//  TAB: DependentsTab (Guardian only)
// ═══════════════════════════════════════════════════════════════════════════════

function DependentsTab({ setToast }) {
  const [dependents, setDependents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingDep, setEditingDep] = useState(null);
  const [detachingDep, setDetachingDep] = useState(null);
  const [confirmRemove, setConfirmRemove] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [careDep, setCareDep] = useState(null);
  const [careData, setCareData] = useState(null);
  const [careLoading, setCareLoading] = useState(false);
  const [guardianResponding, setGuardianResponding] = useState(null);
  const [guardianToggling, setGuardianToggling] = useState(null);

  // Form state for add/edit
  const [form, setForm] = useState({ firstName: '', lastName: '', dateOfBirth: '', gender: '', phone: '', bloodGroup: '' });
  // Detach form state
  const [detachForm, setDetachForm] = useState({ email: '', phone: '', password: '' });

  const fetchDependents = useCallback(async () => {
    try {
      setLoading(true);
      const res = await listDependents();
      setDependents(res.data || []);
    } catch (err) {
      setToast({ type: 'error', message: err.message });
    } finally {
      setLoading(false);
    }
  }, [setToast]);

  useEffect(() => { fetchDependents(); }, [fetchDependents]);

  const resetForm = () => setForm({ firstName: '', lastName: '', dateOfBirth: '', gender: '', phone: '', bloodGroup: '' });

  const handleAdd = async (e) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      await createDependent({
        firstName: form.firstName,
        lastName: form.lastName,
        dateOfBirth: form.dateOfBirth,
        gender: form.gender,
        ...(form.phone && { phone: form.phone }),
        ...(form.bloodGroup && { bloodGroup: form.bloodGroup }),
      });
      setToast({ type: 'success', message: 'Dependent added successfully' });
      setShowAddModal(false);
      resetForm();
      fetchDependents();
    } catch (err) {
      setToast({ type: 'error', message: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = async (e) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      const data = {};
      if (form.firstName) data.firstName = form.firstName;
      if (form.lastName) data.lastName = form.lastName;
      if (form.dateOfBirth) data.dateOfBirth = form.dateOfBirth;
      if (form.gender) data.gender = form.gender;
      if (form.phone) data.phone = form.phone;
      if (form.bloodGroup) data.bloodGroup = form.bloodGroup;
      await updateDependentApi(editingDep._id, data);
      setToast({ type: 'success', message: 'Dependent updated' });
      setEditingDep(null);
      resetForm();
      fetchDependents();
    } catch (err) {
      setToast({ type: 'error', message: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDetach = async (e) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      await detachDependentApi(detachingDep._id, detachForm);
      setToast({ type: 'success', message: 'Dependent is now an independent patient with their own login' });
      setDetachingDep(null);
      setDetachForm({ email: '', phone: '', password: '' });
      fetchDependents();
    } catch (err) {
      setToast({ type: 'error', message: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  const handleRemove = async () => {
    try {
      setSubmitting(true);
      await removeDependentApi(confirmRemove._id);
      setToast({ type: 'success', message: 'Guardian link removed' });
      setConfirmRemove(null);
      fetchDependents();
    } catch (err) {
      setToast({ type: 'error', message: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  const openEdit = (dep) => {
    const nameParts = (dep.name || '').split(' ');
    setForm({
      firstName: nameParts[0] || '',
      lastName: nameParts.slice(1).join(' ') || '',
      dateOfBirth: dep.dateOfBirth ? new Date(dep.dateOfBirth).toISOString().split('T')[0] : '',
      gender: dep.gender || '',
      phone: dep.phone || '',
      bloodGroup: dep.bloodGroup || '',
    });
    setEditingDep(dep);
  };

  const openCare = async (dep) => {
    setCareDep(dep);
    setCareLoading(true);
    setCareData(null);
    try {
      const [compRes, schedRes] = await Promise.all([
        getDependentCompliance(dep._id),
        getDependentDailySchedule(dep._id),
      ]);
      setCareData({ compliance: compRes.data, daily: schedRes.data });
    } catch (err) {
      setToast({ type: 'error', message: err.message || 'Failed to load care data' });
      setCareDep(null);
    } finally {
      setCareLoading(false);
    }
  };

  const handleGuardianRespond = async (dependentId, taskId, reminderId, status) => {
    setGuardianResponding(reminderId);
    try {
      await respondToReminderAsGuardian(dependentId, taskId, reminderId, { status });
      setCareData(prev => {
        if (!prev) return prev;
        const updatedReminders = (prev.daily?.reminders || []).map(r =>
          r._id === reminderId ? { ...r, status, respondedAt: new Date().toISOString() } : r,
        );
        const stats = { ...(prev.daily?.stats || {}) };
        if (status === 'done') stats.completed = (stats.completed || 0) + 1;
        if (status === 'skipped') stats.skipped = (stats.skipped || 0) + 1;
        stats.pending = Math.max(0, (stats.pending || 0) - 1);
        return { ...prev, daily: { ...prev.daily, reminders: updatedReminders, stats } };
      });
    } catch (err) {
      setToast({ type: 'error', message: err.message || 'Failed to respond' });
    } finally {
      setGuardianResponding(null);
    }
  };

  const handleGuardianToggle = async (dependentId, taskId) => {
    setGuardianToggling(taskId);
    try {
      const res = await toggleDependentTaskReminder(dependentId, taskId);
      const updated = res.data || {};
      setCareData(prev => {
        if (!prev) return prev;
        const prescriptions = (prev.compliance?.prescriptions || []).map(rx => ({
          ...rx,
          tasks: (rx.tasks || []).map(t =>
            t._id === taskId ? { ...t, isActive: updated.isActive } : t,
          ),
        }));
        return { ...prev, compliance: { ...prev.compliance, prescriptions } };
      });
    } catch (err) {
      setToast({ type: 'error', message: err.message || 'Failed to toggle' });
    } finally {
      setGuardianToggling(null);
    }
  };

  const genderOptions = ['male', 'female', 'other'];
  const bloodGroups = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

  const renderForm = (onSubmit, isEdit) => (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>First Name *</label>
          <input className={inputCls} value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} required />
        </div>
        <div>
          <label className={labelCls}>Last Name *</label>
          <input className={inputCls} value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} required />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Date of Birth *</label>
          <input type="date" className={inputCls} value={form.dateOfBirth} max={todayStr()} onChange={(e) => setForm({ ...form, dateOfBirth: e.target.value })} required />
        </div>
        <div>
          <label className={labelCls}>Gender *</label>
          <select className={inputCls} value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })} required>
            <option value="">Select</option>
            {genderOptions.map((g) => <option key={g} value={g}>{g.charAt(0).toUpperCase() + g.slice(1)}</option>)}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Phone</label>
          <input className={inputCls} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </div>
        <div>
          <label className={labelCls}>Blood Group</label>
          <select className={inputCls} value={form.bloodGroup} onChange={(e) => setForm({ ...form, bloodGroup: e.target.value })}>
            <option value="">Select</option>
            {bloodGroups.map((bg) => <option key={bg} value={bg}>{bg}</option>)}
          </select>
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <button type="button" className={btnSecondary} onClick={() => { isEdit ? setEditingDep(null) : setShowAddModal(false); resetForm(); }}>Cancel</button>
        <button type="submit" className={btnPrimary} disabled={submitting}>{submitting ? 'Saving...' : isEdit ? 'Update' : 'Add Dependent'}</button>
      </div>
    </form>
  );

  if (loading) return <SkeletonLoader count={3} />;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-neutral-900 dark:text-neutral-100">Dependents</h2>
          <p className="text-sm text-neutral-900/50 dark:text-neutral-100/50">Manage your children and family members</p>
        </div>
        <button onClick={() => { resetForm(); setShowAddModal(true); }} className={btnPrimary}>+ Add Dependent</button>
      </div>

      {/* Dependents List */}
      {dependents.length === 0 ? (
        <div className={`${cardCls} p-12 text-center`}>
          <EmptyStateIllustration title="No dependents yet" subtitle="Add your children or family members to manage their healthcare" />
        </div>
      ) : (
        <div className="grid gap-4">
          {dependents.map((dep) => (
            <div key={dep._id} className={`${cardCls} p-5`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center text-primary-600 dark:text-primary-400 font-bold text-lg">
                    {(dep.name || '?')[0].toUpperCase()}
                  </div>
                  <div>
                    <h3 className="font-semibold text-neutral-900 dark:text-neutral-100">{dep.name}</h3>
                    <div className="flex items-center gap-3 text-sm text-neutral-900/50 dark:text-neutral-100/50">
                      {dep.age !== null && <span>{dep.age} years old</span>}
                      {dep.gender && <span className="capitalize">{dep.gender}</span>}
                      {dep.bloodGroup && <span>{dep.bloodGroup}</span>}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {dep.isMinor === false && (
                    <Badge color="yellow">Adult (18+)</Badge>
                  )}
                  {dep.isMinor === true && (
                    <Badge color="blue">Minor</Badge>
                  )}
                  <button onClick={() => openCare(dep)} className="px-3 py-1.5 text-sm font-medium text-teal-600 bg-teal-50 rounded-lg hover:bg-teal-100 transition dark:bg-teal-900/20 dark:text-teal-400 dark:hover:bg-teal-900/30">Care</button>
                  <button onClick={() => openEdit(dep)} className="px-3 py-1.5 text-sm font-medium text-primary-600 bg-primary-50 rounded-lg hover:bg-primary-100 transition dark:bg-primary-900/20 dark:text-primary-400 dark:hover:bg-primary-900/30">Edit</button>
                  {dep.canDetach && (
                    <button onClick={() => { setDetachForm({ email: '', phone: '', password: '' }); setDetachingDep(dep); }} className="px-3 py-1.5 text-sm font-medium text-amber-600 bg-amber-50 rounded-lg hover:bg-amber-100 transition dark:bg-amber-900/20 dark:text-amber-400 dark:hover:bg-amber-900/30">Detach</button>
                  )}
                  <button onClick={() => setConfirmRemove(dep)} className="px-3 py-1.5 text-sm font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-900/30">Remove</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Modal */}
      <Modal open={showAddModal} onClose={() => { setShowAddModal(false); resetForm(); }} title="Add Dependent">
        {renderForm(handleAdd, false)}
      </Modal>

      {/* Edit Modal */}
      <Modal open={!!editingDep} onClose={() => { setEditingDep(null); resetForm(); }} title={`Edit ${editingDep?.name || 'Dependent'}`}>
        {renderForm(handleEdit, true)}
      </Modal>

      {/* Detach Modal */}
      <Modal open={!!detachingDep} onClose={() => setDetachingDep(null)} title={`Detach ${detachingDep?.name || 'Dependent'}`}>
        <div className="mb-4 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-xl text-sm text-amber-800 dark:text-amber-200">
          <p className="font-medium mb-1">This will create an independent patient account</p>
          <p>The dependent will have their own login credentials and will no longer appear in your dependents list. Their medical history will be preserved.</p>
        </div>
        <form onSubmit={handleDetach} className="space-y-4">
          <div>
            <label className={labelCls}>Email *</label>
            <input type="email" className={inputCls} value={detachForm.email} onChange={(e) => setDetachForm({ ...detachForm, email: e.target.value })} required placeholder="Their new login email" />
          </div>
          <div>
            <label className={labelCls}>Phone *</label>
            <input className={inputCls} value={detachForm.phone} onChange={(e) => setDetachForm({ ...detachForm, phone: e.target.value })} required placeholder="Their phone number" />
          </div>
          <div>
            <label className={labelCls}>Password *</label>
            <input type="password" className={inputCls} value={detachForm.password} onChange={(e) => setDetachForm({ ...detachForm, password: e.target.value })} required minLength={8} placeholder="Min 8 characters" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className={btnSecondary} onClick={() => setDetachingDep(null)}>Cancel</button>
            <button type="submit" className={btnPrimary} disabled={submitting}>{submitting ? 'Processing...' : 'Detach & Create Account'}</button>
          </div>
        </form>
      </Modal>

      {/* Remove Confirmation */}
      <ConfirmDialog
        open={!!confirmRemove}
        onClose={() => setConfirmRemove(null)}
        onConfirm={handleRemove}
        title="Remove Guardian Link"
        message={`Are you sure you want to remove ${confirmRemove?.name} from your dependents? This will only remove the guardian link — their patient record will remain.`}
        confirmLabel={submitting ? 'Removing...' : 'Remove'}
        variant="danger"
      />

      {/* Care Compliance Modal */}
      <Modal open={!!careDep} onClose={() => { setCareDep(null); setCareData(null); }} title={`Care Overview — ${careDep?.name || ''}`} size="lg">
        {careLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-primary-500" />
          </div>
        ) : careData ? (
          <div className="space-y-6">
            {/* Average Compliance */}
            <div className={`${cardCls} p-4`}>
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">Overall Compliance</p>
                <Badge label={`${careData.compliance.averageCompliance}%`} color={careData.compliance.averageCompliance >= 80 ? 'green' : careData.compliance.averageCompliance >= 50 ? 'yellow' : 'red'} />
              </div>
              <div className="h-2 bg-neutral-200 dark:bg-primary-700 rounded-full overflow-hidden">
                <div className={`h-full rounded-full transition-all ${careData.compliance.averageCompliance >= 80 ? 'bg-green-500' : careData.compliance.averageCompliance >= 50 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${careData.compliance.averageCompliance}%` }} />
              </div>
            </div>

            {/* Per-Prescription Breakdown */}
            {careData.compliance.prescriptions.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-neutral-900/60 dark:text-neutral-100/60 mb-3">Per-Prescription</p>
                <div className="space-y-3">
                  {careData.compliance.prescriptions.map((rx) => (
                    <div key={rx._id} className={`${cardCls} p-3`}>
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">{rx.diagnosis || 'Prescription'}</p>
                        <Badge label={`${rx.overallComplianceRate}%`} color={rx.overallComplianceRate >= 80 ? 'green' : rx.overallComplianceRate >= 50 ? 'yellow' : 'red'} />
                      </div>
                      <div className="h-1.5 bg-neutral-200 dark:bg-primary-700 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${rx.overallComplianceRate >= 80 ? 'bg-green-500' : rx.overallComplianceRate >= 50 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${rx.overallComplianceRate}%` }} />
                      </div>
                      <div className="flex gap-4 mt-2 text-[10px] text-neutral-900/30 dark:text-neutral-100/30">
                        <span><CheckCircle2 className="h-3 w-3 inline mr-0.5" />{rx.totalCompleted}</span>
                        <span><SkipForward className="h-3 w-3 inline mr-0.5" />{rx.totalSkipped}</span>
                        <span><CircleX className="h-3 w-3 inline mr-0.5" />{rx.totalMissed}</span>
                      </div>
                      {/* Per-task toggles */}
                      {rx.tasks && rx.tasks.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-neutral-200/60 dark:border-primary-700 space-y-2">
                          {rx.tasks.map((task) => (
                            <div key={task._id} className="flex items-center justify-between py-1">
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-medium text-neutral-900/70 dark:text-neutral-100/70 truncate">{task.title}</p>
                              </div>
                              <button
                                onClick={() => handleGuardianToggle(careDep._id, task._id)}
                                disabled={guardianToggling === task._id}
                                className={`relative w-10 h-5 rounded-full transition-colors ${task.isActive ? 'bg-green-500' : 'bg-gray-300 dark:bg-primary-600'} ${guardianToggling === task._id ? 'opacity-50' : ''}`}
                                title={task.isActive ? 'Disable reminders' : 'Enable reminders'}
                              >
                                <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${task.isActive ? 'translate-x-5' : 'translate-x-0'}`} />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Today's Schedule */}
            {careData.daily && careData.daily.reminders.length > 0 && (() => {
              const actionable = careData.daily.reminders.filter(r => r.status === 'pending' || r.status === 'sent');
              const responded = careData.daily.reminders.filter(r => r.status === 'done' || r.status === 'skipped' || r.status === 'missed');
              return (
                <div>
                  <p className="text-xs font-semibold text-neutral-900/60 dark:text-neutral-100/60 mb-3">Today&apos;s Schedule</p>
                  <div className="space-y-2">
                    {actionable.map((rem) => (
                      <div key={rem._id} className={`${cardCls} p-3 flex items-center justify-between`}>
                        <div>
                          <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">{rem.task?.title || 'Medication'}</p>
                          <p className="text-xs text-neutral-900/40 dark:text-neutral-100/40">
                            {formatTime(rem.scheduledAt)}
                            <span className="ml-2 text-[10px]">{rem.status === 'sent' ? 'Sent' : 'Pending'}</span>
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleGuardianRespond(careDep._id, rem.task?._id || rem.taskId, rem._id, 'done')}
                            disabled={guardianResponding !== null}
                            className="px-3 py-1 rounded-lg text-xs font-medium bg-primary-500 text-white hover:bg-primary-600 transition disabled:opacity-50"
                          >
                            {guardianResponding === rem._id ? '...' : 'Done'}
                          </button>
                          <button
                            onClick={() => handleGuardianRespond(careDep._id, rem.task?._id || rem.taskId, rem._id, 'skipped')}
                            disabled={guardianResponding !== null}
                            className="px-3 py-1 rounded-lg text-xs font-medium bg-neutral-200 text-neutral-900/60 hover:bg-neutral-300 transition dark:bg-primary-700 dark:text-neutral-100/60 disabled:opacity-50"
                          >
                            Skip
                          </button>
                        </div>
                      </div>
                    ))}
                    {responded.map((rem) => (
                      <div key={rem._id} className={`${cardCls} p-3 flex items-center justify-between opacity-60`}>
                        <div>
                          <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">{rem.task?.title || 'Medication'}</p>
                          <p className="text-xs text-neutral-900/40 dark:text-neutral-100/40">{formatTime(rem.scheduledAt)}</p>
                        </div>
                        <Badge label={rem.status} color={rem.status === 'done' ? 'green' : rem.status === 'skipped' ? 'yellow' : 'red'} />
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            {careData.daily && careData.daily.reminders.length === 0 && (
              <p className="text-sm text-neutral-900/40 dark:text-neutral-100/40 text-center py-4">No reminders scheduled for today</p>
            )}
          </div>
        ) : (
          <p className="text-sm text-neutral-900/40 dark:text-neutral-100/40 text-center py-8">No care data available</p>
        )}
      </Modal>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
//  TAB 5: MoreTab
// ═══════════════════════════════════════════════════════════════════════════════

function MoreTab({ activePatientId, setToast, section: initialSection }) {
  const [moreSection, setMoreSection] = useState(initialSection || 'share');

  useEffect(() => {
    if (initialSection) setMoreSection(initialSection);
  }, [initialSection]);

  const sections = [
    { key: 'share', label: 'Share Records', icon: Share2 },
    { key: 'consents', label: 'Consents', icon: ShieldCheck },
    { key: 'reviews', label: 'Reviews', icon: Star },
    { key: 'activity', label: 'Activity Log', icon: Activity },
  ];

  return (
    <div className="space-y-5">
      <h2 className="text-lg font-bold text-neutral-900 dark:text-neutral-100 font-display">
        More
      </h2>

      {/* Section Navigation */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {sections.map((s) => (
          <button
            key={s.key}
            onClick={() => setMoreSection(s.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all ${
              moreSection === s.key
                ? 'bg-primary-500 text-white shadow-sm shadow-primary-600/20'
                : 'bg-neutral-100 text-neutral-900/50 hover:bg-neutral-200 dark:bg-primary-800 dark:text-neutral-100/50 dark:hover:bg-primary-700'
            }`}
          >
            <s.icon className="h-4 w-4" />
            {s.label}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {moreSection === 'share' && (
          <motion.div key="share" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}>
            <ShareRecordsSection activePatientId={activePatientId} setToast={setToast} />
          </motion.div>
        )}
        {moreSection === 'consents' && (
          <motion.div key="consents" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}>
            <ConsentsSection activePatientId={activePatientId} setToast={setToast} />
          </motion.div>
        )}
        {moreSection === 'reviews' && (
          <motion.div key="reviews" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}>
            <ReviewsSection activePatientId={activePatientId} setToast={setToast} />
          </motion.div>
        )}
        {moreSection === 'activity' && (
          <motion.div key="activity" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}>
            <ActivityLogSection activePatientId={activePatientId} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── ShareRecordsSection ─────────────────────────────

function ShareRecordsSection({ activePatientId, setToast }) {
  const [shareTokens, setShareTokens] = useState([]);
  const [shareLoading, setShareLoading] = useState(true);
  const [showShareForm, setShowShareForm] = useState(false);
  const [shareForm, setShareForm] = useState({
    recordType: 'all', expiresInHours: '24', maxAccesses: '5', sharedWith: '',
  });
  const [shareSaving, setShareSaving] = useState(false);

  const fetchTokens = useCallback(async () => {
    if (!activePatientId) return;
    setShareLoading(true);
    try {
      const res = await listShareTokens(activePatientId);
      setShareTokens(res.data || []);
    } catch {
      setShareTokens([]);
    } finally {
      setShareLoading(false);
    }
  }, [activePatientId]);

  useEffect(() => {
    fetchTokens();
  }, [fetchTokens]);

  const handleCreateShare = async () => {
    setShareSaving(true);
    try {
      await createShareToken(activePatientId, {
        recordType: shareForm.recordType,
        expiresInHours: parseInt(shareForm.expiresInHours, 10),
        maxAccesses: parseInt(shareForm.maxAccesses, 10),
        sharedWith: shareForm.sharedWith,
      });
      setShowShareForm(false);
      setShareForm({ recordType: 'all', expiresInHours: '24', maxAccesses: '5', sharedWith: '' });
      setToast({ type: 'success', message: 'Share link created!' });
      fetchTokens();
    } catch (err) {
      setToast({ type: 'error', message: err.message || 'Failed to create share link' });
    } finally {
      setShareSaving(false);
    }
  };

  const handleRevoke = async (tokenId) => {
    try {
      await revokeShareToken(activePatientId, tokenId);
      setToast({ type: 'success', message: 'Share link revoked' });
      fetchTokens();
    } catch (err) {
      setToast({ type: 'error', message: err.message || 'Failed to revoke' });
    }
  };

  const handleCopyLink = (token) => {
    const url = `${window.location.origin}/shared/${token}`;
    navigator.clipboard.writeText(url);
    setToast({ type: 'success', message: 'Link copied to clipboard!' });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-neutral-900/50 dark:text-neutral-100/50">
          Share your medical records securely with other providers.
        </p>
        <button onClick={() => setShowShareForm(true)} className={btnPrimary}>
          <span className="flex items-center gap-2">
            <Link2 className="h-4 w-4" />
            Create Link
          </span>
        </button>
      </div>

      {/* Create Share Form */}
      <AnimatePresence>
        {showShareForm && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className={`${cardCls} p-5 space-y-4`}>
              <h4 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">Create Share Link</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Record Type</label>
                  <select
                    value={shareForm.recordType}
                    onChange={(e) => setShareForm({ ...shareForm, recordType: e.target.value })}
                    className={inputCls}
                  >
                    <option value="all">All Records</option>
                    <option value="prescriptions">Prescriptions</option>
                    <option value="treatments">Treatment Records</option>
                    <option value="reports">Reports</option>
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Shared With (email/name)</label>
                  <input
                    type="text"
                    value={shareForm.sharedWith}
                    onChange={(e) => setShareForm({ ...shareForm, sharedWith: e.target.value })}
                    placeholder="e.g., Dr. Smith or email"
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>Expires In</label>
                  <select
                    value={shareForm.expiresInHours}
                    onChange={(e) => setShareForm({ ...shareForm, expiresInHours: e.target.value })}
                    className={inputCls}
                  >
                    <option value="1">1 hour</option>
                    <option value="6">6 hours</option>
                    <option value="24">24 hours</option>
                    <option value="72">3 days</option>
                    <option value="168">7 days</option>
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Max Accesses</label>
                  <select
                    value={shareForm.maxAccesses}
                    onChange={(e) => setShareForm({ ...shareForm, maxAccesses: e.target.value })}
                    className={inputCls}
                  >
                    <option value="1">1 time</option>
                    <option value="3">3 times</option>
                    <option value="5">5 times</option>
                    <option value="10">10 times</option>
                    <option value="0">Unlimited</option>
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-3">
                <button onClick={() => setShowShareForm(false)} className={btnSecondary}>
                  Cancel
                </button>
                <button onClick={handleCreateShare} disabled={shareSaving} className={btnPrimary}>
                  {shareSaving ? 'Creating...' : 'Create Link'}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Active Tokens List */}
      {shareLoading ? (
        <SkeletonLoader variant="card" count={3} />
      ) : shareTokens.length === 0 ? (
        <EmptyStateIllustration
          type="consultation"
          message="No active share links"
          action="Create Link"
          onAction={() => setShowShareForm(true)}
        />
      ) : (
        <div className="space-y-3">
          {shareTokens.map((tk) => (
            <div key={tk._id} className={`${cardCls} p-4 flex items-center gap-4`}>
              <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center shrink-0">
                <Link2 className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100 truncate">
                  {tk.sharedWith || 'Share Link'}
                </p>
                <p className="text-xs text-neutral-900/40 dark:text-neutral-100/40">
                  {tk.recordType || 'All records'} {'\u2022'} {tk.accessCount || 0}/{tk.maxAccesses || '\u221E'} views {'\u2022'} Expires {formatDate(tk.expiresAt)}
                </p>
              </div>
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={() => handleCopyLink(tk.token)}
                  className="p-2 rounded-lg hover:bg-neutral-100 dark:hover:bg-primary-800 text-neutral-900/40 dark:text-neutral-100/40 transition-colors"
                  title="Copy link"
                >
                  <Copy className="h-4 w-4" />
                </button>
                <button
                  onClick={() => handleRevoke(tk._id)}
                  className="p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/20 text-red-500 transition-colors"
                  title="Revoke link"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── ConsentsSection ─────────────────────────────────

function ConsentsSection({ activePatientId, setToast }) {
  const [consents, setConsents] = useState([]);
  const [consentsLoading, setConsentsLoading] = useState(true);

  const fetchConsents = useCallback(async () => {
    if (!activePatientId) return;
    setConsentsLoading(true);
    try {
      const res = await listPatientConsents(activePatientId);
      setConsents(res.data || []);
    } catch {
      setConsents([]);
    } finally {
      setConsentsLoading(false);
    }
  }, [activePatientId]);

  useEffect(() => {
    fetchConsents();
  }, [fetchConsents]);

  const handleApprove = async (consentId) => {
    try {
      await approveConsent(activePatientId, consentId);
      setToast({ type: 'success', message: 'Consent approved' });
      fetchConsents();
    } catch (err) {
      setToast({ type: 'error', message: err.message || 'Failed to approve consent' });
    }
  };

  const handleRevoke = async (consentId) => {
    try {
      await revokePatientConsent(activePatientId, consentId);
      setToast({ type: 'success', message: 'Consent revoked' });
      fetchConsents();
    } catch (err) {
      setToast({ type: 'error', message: err.message || 'Failed to revoke consent' });
    }
  };

  if (consentsLoading) return <SkeletonLoader variant="card" count={4} />;

  if (consents.length === 0) {
    return (
      <EmptyStateIllustration
        type="consultation"
        message="No consent requests found"
      />
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-neutral-900/50 dark:text-neutral-100/50">
        Manage who has access to your data and treatment consents.
      </p>
      {consents.map((consent) => (
        <motion.div
          key={consent._id}
          whileHover={{ y: -1 }}
          transition={SPRING}
          className={`${cardCls} p-4`}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center shrink-0">
                <ShieldCheck className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                  {consent.type?.replace(/_/g, ' ')}
                </p>
                <p className="text-xs text-neutral-900/40 dark:text-neutral-100/40 mt-0.5">
                  Dr. {consent.doctor?.name || consent.doctorName || 'Unknown'} {'\u2022'} {consent.scope || 'General'}
                </p>
                {consent.description && (
                  <p className="text-xs text-neutral-900/30 dark:text-neutral-100/30 mt-1">
                    {consent.description}
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <Badge
                label={consent.status}
                color={STATUS_COLOR_MAP[consent.status] || 'gray'}
              />
              {consent.status === 'pending' && (
                <button
                  onClick={() => handleApprove(consent._id)}
                  className="px-3 py-1.5 rounded-lg bg-emerald-500 text-white text-xs font-medium hover:bg-emerald-600 transition-colors"
                >
                  Approve
                </button>
              )}
              {consent.status === 'approved' && (
                <button
                  onClick={() => handleRevoke(consent._id)}
                  className="px-3 py-1.5 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 text-xs font-medium transition-colors"
                >
                  Revoke
                </button>
              )}
            </div>
          </div>
        </motion.div>
      ))}
    </div>
  );
}

// ─── ReviewsSection ──────────────────────────────────

function ReviewsSection({ activePatientId, setToast }) {
  const [showReviewForm, setShowReviewForm] = useState(false);
  const [reviewForm, setReviewForm] = useState({
    appointmentId: '', doctor: '', rating: 0, title: '', comment: '', isAnonymous: false,
  });
  const [reviewSaving, setReviewSaving] = useState(false);

  const handleSubmitReview = async () => {
    if (!reviewForm.rating || !reviewForm.comment) return;
    setReviewSaving(true);
    try {
      await submitReview(activePatientId, {
        appointmentId: reviewForm.appointmentId || undefined,
        doctor: reviewForm.doctor || undefined,
        rating: reviewForm.rating,
        title: reviewForm.title,
        comment: reviewForm.comment,
        isAnonymous: reviewForm.isAnonymous,
      });
      setShowReviewForm(false);
      setReviewForm({ appointmentId: '', doctor: '', rating: 0, title: '', comment: '', isAnonymous: false });
      setToast({ type: 'success', message: 'Review submitted! Thank you for your feedback.' });
    } catch (err) {
      setToast({ type: 'error', message: err.message || 'Failed to submit review' });
    } finally {
      setReviewSaving(false);
    }
  };

  // Star Rating Component
  const StarRating = ({ value, onChange }) => (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          onClick={() => onChange(star)}
          className="p-0.5 transition-transform hover:scale-110"
        >
          <Star
            className={`h-6 w-6 transition-colors ${
              star <= value
                ? 'fill-amber-400 text-amber-400'
                : 'text-neutral-300 dark:text-primary-700'
            }`}
          />
        </button>
      ))}
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-neutral-900/50 dark:text-neutral-100/50">
          Help us improve by sharing your experience.
        </p>
        {!showReviewForm && (
          <button onClick={() => setShowReviewForm(true)} className={btnPrimary}>
            <span className="flex items-center gap-2">
              <Star className="h-4 w-4" />
              Write Review
            </span>
          </button>
        )}
      </div>

      <AnimatePresence>
        {showReviewForm && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className={`${cardCls} p-5 space-y-4`}>
              <h4 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">Write a Review</h4>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Appointment ID (optional)</label>
                  <input
                    type="text"
                    value={reviewForm.appointmentId}
                    onChange={(e) => setReviewForm({ ...reviewForm, appointmentId: e.target.value })}
                    placeholder="Enter appointment ID"
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>Doctor Name / ID</label>
                  <input
                    type="text"
                    value={reviewForm.doctor}
                    onChange={(e) => setReviewForm({ ...reviewForm, doctor: e.target.value })}
                    placeholder="Enter doctor name or ID"
                    className={inputCls}
                  />
                </div>
              </div>

              <div>
                <label className={labelCls}>Rating</label>
                <StarRating value={reviewForm.rating} onChange={(r) => setReviewForm({ ...reviewForm, rating: r })} />
              </div>

              <div>
                <label className={labelCls}>Title</label>
                <input
                  type="text"
                  value={reviewForm.title}
                  onChange={(e) => setReviewForm({ ...reviewForm, title: e.target.value })}
                  placeholder="Brief summary of your experience"
                  className={inputCls}
                />
              </div>

              <div>
                <label className={labelCls}>Comment</label>
                <textarea
                  value={reviewForm.comment}
                  onChange={(e) => setReviewForm({ ...reviewForm, comment: e.target.value })}
                  placeholder="Share details about your experience..."
                  rows={4}
                  className={inputCls}
                />
              </div>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={reviewForm.isAnonymous}
                  onChange={(e) => setReviewForm({ ...reviewForm, isAnonymous: e.target.checked })}
                  className="w-4 h-4 rounded border-neutral-300 text-primary-600 focus:ring-primary-500 dark:border-primary-700"
                />
                <span className="text-sm text-neutral-900/60 dark:text-neutral-100/60">Submit anonymously</span>
              </label>

              <div className="flex justify-end gap-3">
                <button onClick={() => setShowReviewForm(false)} className={btnSecondary}>
                  Cancel
                </button>
                <button
                  onClick={handleSubmitReview}
                  disabled={reviewSaving || !reviewForm.rating || !reviewForm.comment}
                  className={btnPrimary}
                >
                  {reviewSaving ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Submitting...
                    </span>
                  ) : (
                    'Submit Review'
                  )}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {!showReviewForm && (
        <div className={`${cardCls} p-8`}>
          <EmptyStateIllustration
            type="consultation"
            message="Your reviews help other patients and improve our service"
            action="Write a Review"
            onAction={() => setShowReviewForm(true)}
          />
        </div>
      )}
    </div>
  );
}

// ─── ActivityLogSection ──────────────────────────────

function ActivityLogSection({ activePatientId }) {
  const [accessLogs, setAccessLogs] = useState([]);
  const [logPage, setLogPage] = useState(1);
  const [logTotal, setLogTotal] = useState(0);
  const [logLoading, setLogLoading] = useState(true);

  const fetchLogs = useCallback(async () => {
    if (!activePatientId) return;
    setLogLoading(true);
    try {
      const res = await getAccessLog(activePatientId, { page: logPage, limit: PAGE_LIMIT });
      setAccessLogs(res.data || []);
      setLogTotal(res.total || res.pagination?.total || 0);
    } catch {
      setAccessLogs([]);
    } finally {
      setLogLoading(false);
    }
  }, [activePatientId, logPage]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  if (logLoading) return <SkeletonLoader variant="row" count={6} />;

  if (accessLogs.length === 0) {
    return (
      <EmptyStateIllustration
        type="consultation"
        message="No activity recorded yet"
      />
    );
  }

  const actionIcons = {
    view: Eye,
    login: Check,
    share: Share2,
    download: FileText,
    update: Activity,
  };

  const actionColors = {
    view: 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400',
    login: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400',
    share: 'bg-purple-50 text-purple-600 dark:bg-purple-900/20 dark:text-purple-400',
    download: 'bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400',
    update: 'bg-primary-50 text-primary-600 dark:bg-primary-900/20 dark:text-primary-400',
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-neutral-900/50 dark:text-neutral-100/50">
        Track who has accessed your records and when.
      </p>

      <div className="space-y-3">
        {accessLogs.map((log, index) => {
          const actionKey = log.action?.toLowerCase() || 'view';
          const Icon = actionIcons[actionKey] || Activity;
          const colorCls = actionColors[actionKey] || actionColors.view;

          return (
            <div key={log._id || index} className={`${cardCls} p-4 flex items-center gap-4`}>
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${colorCls}`}>
                <Icon className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                  {log.description || log.action || 'Activity'}
                </p>
                <p className="text-xs text-neutral-900/40 dark:text-neutral-100/40">
                  {log.performedBy || log.actor || 'System'} {'\u2022'} {formatDateTime(log.createdAt || log.timestamp)}
                </p>
                {log.ipAddress && (
                  <p className="text-xs text-neutral-900/25 dark:text-neutral-100/25 mt-0.5">
                    IP: {log.ipAddress}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {logTotal > PAGE_LIMIT && (
        <Pagination page={logPage} limit={PAGE_LIMIT} total={logTotal} onChange={setLogPage} />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
//  EMERGENCY FAB + MODAL
// ═══════════════════════════════════════════════════════════════════════════════

function EmergencyFAB({ onOpen }) {
  return (
    <motion.button
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      onClick={onOpen}
      className="fixed bottom-20 md:bottom-6 right-6 w-14 h-14 rounded-full bg-red-500 text-white shadow-lg flex items-center justify-center z-40 hover:bg-red-600 transition-colors"
      title="Emergency"
    >
      <Phone className="h-6 w-6" />
    </motion.button>
  );
}

function EmergencyModal({ open, onClose, activePatientId, setToast }) {
  const [emergencyType, setEmergencyType] = useState('chat');
  const [emergencyReason, setEmergencyReason] = useState('');
  const [emergencySaving, setEmergencySaving] = useState(false);

  const handleSubmit = async () => {
    if (!emergencyReason.trim()) return;
    setEmergencySaving(true);
    try {
      await createEmergencyRequest(activePatientId, {
        type: emergencyType,
        reason: emergencyReason,
      });
      setToast({ type: 'success', message: 'Emergency request sent! A doctor will respond shortly.' });
      setEmergencyReason('');
      setEmergencyType('chat');
      onClose();
    } catch (err) {
      setToast({ type: 'error', message: err.message || 'Failed to send emergency request' });
    } finally {
      setEmergencySaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Emergency Request">
      <div className="space-y-4">
        <div className="flex items-center gap-3 p-3 rounded-xl bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/40">
          <AlertTriangle className="h-5 w-5 text-red-500 shrink-0" />
          <p className="text-xs text-red-700 dark:text-red-400">
            For life-threatening emergencies, please call <strong>112</strong> immediately.
            This feature connects you with an available doctor for urgent consultations.
          </p>
        </div>

        <div>
          <label className={labelCls}>Consultation Type</label>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setEmergencyType('chat')}
              className={`p-3 rounded-xl border-2 flex flex-col items-center gap-2 transition-all ${
                emergencyType === 'chat'
                  ? 'border-primary-500 bg-primary-50 dark:bg-primary-950/20 dark:border-primary-600'
                  : 'border-neutral-300/60 dark:border-primary-700 hover:border-neutral-400 dark:hover:border-primary-600'
              }`}
            >
              <MessageSquare className={`h-6 w-6 ${emergencyType === 'chat' ? 'text-primary-600 dark:text-primary-400' : 'text-neutral-900/30 dark:text-neutral-100/30'}`} />
              <span className={`text-xs font-medium ${emergencyType === 'chat' ? 'text-primary-700 dark:text-primary-400' : 'text-neutral-900/50 dark:text-neutral-100/50'}`}>
                Chat
              </span>
            </button>
            <button
              onClick={() => setEmergencyType('video')}
              className={`p-3 rounded-xl border-2 flex flex-col items-center gap-2 transition-all ${
                emergencyType === 'video'
                  ? 'border-primary-500 bg-primary-50 dark:bg-primary-950/20 dark:border-primary-600'
                  : 'border-neutral-300/60 dark:border-primary-700 hover:border-neutral-400 dark:hover:border-primary-600'
              }`}
            >
              <Video className={`h-6 w-6 ${emergencyType === 'video' ? 'text-primary-600 dark:text-primary-400' : 'text-neutral-900/30 dark:text-neutral-100/30'}`} />
              <span className={`text-xs font-medium ${emergencyType === 'video' ? 'text-primary-700 dark:text-primary-400' : 'text-neutral-900/50 dark:text-neutral-100/50'}`}>
                Video Call
              </span>
            </button>
          </div>
        </div>

        <div>
          <label className={labelCls}>Describe your emergency</label>
          <textarea
            value={emergencyReason}
            onChange={(e) => setEmergencyReason(e.target.value)}
            placeholder="Please describe your symptoms or situation..."
            rows={4}
            className={inputCls}
          />
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button onClick={onClose} className={btnSecondary}>
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={emergencySaving || !emergencyReason.trim()}
            className="px-5 py-2.5 text-sm font-semibold text-white rounded-xl bg-red-600 hover:bg-red-700 transition disabled:opacity-50 flex items-center gap-2"
          >
            {emergencySaving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Phone className="h-4 w-4" />
                Send Emergency Request
              </>
            )}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
//  TOAST COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

function Toast({ toast, onDismiss }) {
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(onDismiss, 4000);
    return () => clearTimeout(timer);
  }, [toast, onDismiss]);

  if (!toast) return null;

  const isError = toast.type === 'error';

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 50, scale: 0.9 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 50, scale: 0.9 }}
        transition={{ duration: 0.3 }}
        className={`fixed bottom-24 md:bottom-8 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-2xl shadow-lg text-sm font-medium flex items-center gap-3 max-w-sm ${
          isError
            ? 'bg-red-600 text-white'
            : 'bg-emerald-600 text-white'
        }`}
      >
        {isError ? (
          <X className="h-4 w-4 shrink-0" />
        ) : (
          <Check className="h-4 w-4 shrink-0" />
        )}
        <span className="flex-1">{toast.message}</span>
        <button onClick={onDismiss} className="p-0.5 rounded hover:bg-white/20 transition-colors shrink-0">
          <X className="h-3.5 w-3.5" />
        </button>
      </motion.div>
    </AnimatePresence>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
//  MAIN PATIENT PORTAL
// ═══════════════════════════════════════════════════════════════════════════════

export default function PatientPortal({ initialTab = 'home' }) {
  const { activePatient, activePatientId, isGuardian } = useSafePatientAuth();
  const [activeTab, setActiveTab] = useState(initialTab);
  const [moreSection, setMoreSection] = useState(null);
  const [showEmergencyModal, setShowEmergencyModal] = useState(false);
  const [toast, setToast] = useState(null);

  // Filter tabs — show Dependents only for guardians
  const TABS = isGuardian ? BASE_TABS : BASE_TABS.filter((t) => t.key !== 'dependents');

  // Sync initialTab prop changes
  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  const handleSwitchTab = useCallback((tab, section) => {
    setActiveTab(tab);
    if (section) setMoreSection(section);
  }, []);

  const clearToast = useCallback(() => setToast(null), []);

  const tabVariants = {
    initial: { opacity: 0, x: 20 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: -20 },
  };

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pb-28 md:pb-8">
        {/* Top Navigation Tabs */}
        <div className="sticky top-0 z-20 bg-neutral-50/80 dark:bg-neutral-950/80 backdrop-blur-md pt-4 pb-2 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 border-b border-neutral-300/40 dark:border-primary-800/60">
          <TabBar
            tabs={TABS}
            active={activeTab}
            onChange={(tab) => {
              setActiveTab(tab);
              setMoreSection(null);
            }}
          />
        </div>

        {/* Tab Content */}
        <div className="pt-6">
          <AnimatePresence mode="wait">
            {activeTab === 'home' && (
              <motion.div
                key="home"
                variants={tabVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={{ duration: 0.2 }}
              >
                <HomeTab
                  activePatientId={activePatientId}
                  activePatient={activePatient}
                  onSwitchTab={handleSwitchTab}
                  onEmergency={() => setShowEmergencyModal(true)}
                />
              </motion.div>
            )}

            {activeTab === 'appointments' && (
              <motion.div
                key="appointments"
                variants={tabVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={{ duration: 0.2 }}
              >
                <AppointmentsTab
                  activePatientId={activePatientId}
                  activePatient={activePatient}
                  setToast={setToast}
                />
              </motion.div>
            )}

            {activeTab === 'health' && (
              <motion.div
                key="health"
                variants={tabVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={{ duration: 0.2 }}
              >
                <HealthTab
                  activePatientId={activePatientId}
                  setToast={setToast}
                />
              </motion.div>
            )}

            {activeTab === 'payments' && (
              <motion.div
                key="payments"
                variants={tabVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={{ duration: 0.2 }}
              >
                <PaymentsTab
                  activePatientId={activePatientId}
                  setToast={setToast}
                />
              </motion.div>
            )}

            {activeTab === 'dependents' && isGuardian && (
              <motion.div
                key="dependents"
                variants={tabVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={{ duration: 0.2 }}
              >
                <DependentsTab
                  setToast={setToast}
                />
              </motion.div>
            )}

            {activeTab === 'more' && (
              <motion.div
                key="more"
                variants={tabVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={{ duration: 0.2 }}
              >
                <MoreTab
                  activePatientId={activePatientId}
                  setToast={setToast}
                  section={moreSection}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Emergency FAB */}
      <EmergencyFAB onOpen={() => setShowEmergencyModal(true)} />

      {/* Emergency Modal */}
      <EmergencyModal
        open={showEmergencyModal}
        onClose={() => setShowEmergencyModal(false)}
        activePatientId={activePatientId}
        setToast={setToast}
      />

      {/* Toast Notifications */}
      <Toast toast={toast} onDismiss={clearToast} />
    </div>
  );
}
