import { useState, useEffect, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  CalendarPlus, Phone, Heart, CreditCard, Stethoscope, Video,
  Clock, Loader2, ArrowRight, CheckCircle2, SkipForward, Pill,
  FileText, Activity, CalendarDays, Share2, ChevronRight, User,
  Building2, CircleDot,
} from 'lucide-react';
import {
  getPortalDashboard, getPatientProfile,
  getDailyCareSchedule, getMedicalHistory,
  getPatientFinancialSummary, listPatientAppointments,
  listPaymentHistory, cancelPatientAppointment,
  confirmAttendance, respondToReminder, initiatePayment,
  listDoctors, listDepartments,
} from '../api';
import { useSafePatientAuth } from '../../hooks/useSafeAuth';
import { ConfirmDialog } from '../../platform/components/shared';
import BookingWizardModal from '../components/BookingWizardModal';
import BookingIntentHub from '../components/BookingIntentHub';
import { stripDrPrefix } from '../../utils/doctorName';

/* ─── Helpers ──────────────────────────────────── */

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

const fmtDate = (d) => {
  const dt = new Date(d); const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${dt.getUTCDate()} ${months[dt.getUTCMonth()]} ${dt.getUTCFullYear()}`;
};

const fmtTime = (d) => {
  const dt = new Date(d); const h = dt.getUTCHours(); const m = dt.getUTCMinutes();
  return `${String(h % 12 || 12).padStart(2,'0')}:${String(m).padStart(2,'0')} ${h >= 12 ? 'PM' : 'AM'}`;
};

const fmtDateTime = (d) => `${fmtDate(d)}, ${fmtTime(d)}`;

const fmtCurrency = (n) => `\u20B9${(n || 0).toLocaleString('en-IN')}`;

function daysUntil(dateStr) {
  const diff = Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000);
  if (diff <= 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  return `In ${diff} days`;
}

const STATUS_CLS = {
  requested: 'bg-primary-50 text-primary-700',
  confirmed: 'bg-blue-50 text-blue-700',
  checked_in: 'bg-purple-50 text-purple-700',
  in_progress: 'bg-purple-50 text-purple-700',
  completed: 'bg-secondary-50 text-secondary-700',
  cancelled: 'bg-red-50 text-red-600',
  no_show: 'bg-amber-50 text-amber-700',
};

const CARD = 'bg-white rounded-2xl border border-neutral-200 shadow-[var(--shadow-sm)]';

/* ─── Inline Shimmer ───────────────────────────── */

function Shimmer({ className = '' }) {
  return <div className={`animate-pulse bg-neutral-200/60 rounded-xl ${className}`} />;
}

/* ═══════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════ */

export default function PatientDashboard() {
  const navigate = useNavigate();
  const { activePatient, activePatientId } = useSafePatientAuth();

  /* ── State ─────────────────────────────────────── */
  const [dashboard, setDashboard] = useState(null);
  const [profile, setProfile] = useState(null);
  const [careSchedule, setCareSchedule] = useState(null);
  const [treatments, setTreatments] = useState([]);
  const [financials, setFinancials] = useState(null);
  const [appointments, setAppointments] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [departments, setDepartments] = useState([]);

  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);

  const [showBookModal, setShowBookModal] = useState(false);
  const [bookContext, setBookContext] = useState({ step: 0, dept: null, doctor: null, intent: 'visit' });
  const [intentHubOpen, setIntentHubOpen] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [cancelTarget, setCancelTarget] = useState(null);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [confirmingId, setConfirmingId] = useState(null);
  const [respondingId, setRespondingId] = useState(null);
  const [payingId, setPayingId] = useState(null);

  /* ── Data Fetching ─────────────────────────────── */

  const fetchAll = useCallback(async () => {
    if (!activePatientId) return;
    setLoading(true);

    // Phase 1: core data (determines new vs returning)
    const core = await Promise.allSettled([
      getPortalDashboard(activePatientId),
      getPatientProfile(activePatientId),
      getMedicalHistory(activePatientId, { limit: 4, page: 1 }),
    ]);

    const unwrap = (r) => r.status === 'fulfilled' ? (r.value?.data ?? r.value) : null;

    const dashData = unwrap(core[0]);
    const profileData = unwrap(core[1]);
    const treatmentData = unwrap(core[2]) || [];

    setDashboard(dashData);
    setProfile(profileData);
    setTreatments(Array.isArray(treatmentData) ? treatmentData : []);

    const hasHistory = (dashData?.upcomingAppointments || 0) > 0
      || (Array.isArray(treatmentData) ? treatmentData : []).length > 0
      || !!dashData?.nextAppointment;

    if (hasHistory) {
      // Phase 2: returning patient data
      const extra = await Promise.allSettled([
        getDailyCareSchedule(activePatientId),
        getPatientFinancialSummary(activePatientId),
        listPatientAppointments(activePatientId, {
          from: new Date().toISOString(), statusNin: 'cancelled,completed,no_show', limit: 10, page: 1,
        }),
        listPaymentHistory(activePatientId, { status: 'pending', limit: 10, page: 1 }),
      ]);

      setCareSchedule(unwrap(extra[0]));
      setFinancials(unwrap(extra[1]));
      setAppointments(unwrap(extra[2]) || []);
      const allInv = unwrap(extra[3]) || [];
      setInvoices(allInv.filter(i => ['sent', 'overdue', 'pending'].includes(i.status)));
    } else {
      // Phase 2: new patient data (browse doctors & departments)
      const browse = await Promise.allSettled([
        listDoctors(),
        listDepartments(),
      ]);

      const docData = unwrap(browse[0]);
      setDoctors(Array.isArray(docData) ? docData : docData?.doctors || []);
      const deptData = unwrap(browse[1]);
      setDepartments(Array.isArray(deptData) ? deptData : deptData?.departments || []);
    }

    setLoading(false);
  }, [activePatientId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  /* ── Actions ───────────────────────────────────── */

  // Open the booking wizard with optional pre-seeded context.
  // Passing { step: 2, doctor, dept } jumps straight to the schedule picker.
  // Passing { step: 1, dept } jumps to the doctor list for that department.
  const openBookModal = (ctx = {}) => {
    setBookContext({
      step: ctx.step ?? 0,
      dept: ctx.dept ?? null,
      doctor: ctx.doctor ?? null,
      intent: ctx.intent ?? 'visit',
    });
    setShowBookModal(true);
  };

  const closeBookModal = () => {
    setShowBookModal(false);
    setBookContext({ step: 0, dept: null, doctor: null, intent: 'visit' });
  };

  // Open the intent hub — first step of the new differentiated booking flow.
  const openIntentHub = () => setIntentHubOpen(true);

  const handleIntentChosen = ({ intent }) => {
    setIntentHubOpen(false);
    if (intent === 'emergency') {
      navigate('/patient/emergency');
      return;
    }
    // Both 'visit' and 'video' continue to the wizard
    openBookModal({ intent });
  };

  const handleCancelAppt = async () => {
    if (!cancelTarget) return;
    setCancelLoading(true);
    try {
      await cancelPatientAppointment(activePatientId, cancelTarget._id, 'Cancelled from dashboard');
      setShowCancelConfirm(false); setCancelTarget(null);
      setToast({ type: 'success', msg: 'Appointment cancelled' });
      fetchAll();
    } catch (err) {
      setToast({ type: 'error', msg: err.message || 'Failed to cancel' });
    } finally { setCancelLoading(false); }
  };

  const handleConfirm = async (appt, status) => {
    setConfirmingId(appt._id);
    try {
      await confirmAttendance(activePatientId, appt._id, status);
      setToast({ type: 'success', msg: status === 'confirmed' ? 'Confirmed' : 'Declined' });
      fetchAll();
    } catch (err) {
      setToast({ type: 'error', msg: err.message || 'Failed' });
    } finally { setConfirmingId(null); }
  };

  const handleCareRespond = async (rem, status) => {
    setRespondingId(rem._id);
    try {
      await respondToReminder(activePatientId, rem.task?._id || rem.task, rem._id, { status });
      fetchAll();
    } catch (err) {
      setToast({ type: 'error', msg: err.message || 'Failed' });
    } finally { setRespondingId(null); }
  };

  const handlePay = async (inv) => {
    if (payingId) return;
    setPayingId(inv._id);
    try {
      const res = await initiatePayment(activePatientId, inv._id);
      const pd = res.data || res;
      const launch = () => {
        const rzp = new window.Razorpay({
          key: pd.razorpayKeyId || pd.key || import.meta.env.VITE_RAZORPAY_KEY_ID,
          amount: pd.amount, currency: pd.currency || 'INR',
          order_id: pd.orderId || pd.order_id,
          name: 'BestoClinic', description: `Invoice ${inv.invoiceNumber}`,
          handler: async (r) => {
            try {
              await initiatePayment(activePatientId, inv._id, { razorpay_order_id: r.razorpay_order_id, razorpay_payment_id: r.razorpay_payment_id, razorpay_signature: r.razorpay_signature });
              setToast({ type: 'success', msg: 'Payment successful!' }); fetchAll();
            } catch (e) { setToast({ type: 'error', msg: e.message || 'Verification failed' }); }
            finally { setPayingId(null); }
          },
          modal: { ondismiss: () => setPayingId(null) },
        });
        rzp.on('payment.failed', (r) => { setToast({ type: 'error', msg: r.error?.description || 'Payment failed' }); setPayingId(null); });
        rzp.open();
      };
      if (!window.Razorpay) { const s = document.createElement('script'); s.src = 'https://checkout.razorpay.com/v1/checkout.js'; s.onload = launch; document.body.appendChild(s); } else { launch(); }
    } catch (err) { setToast({ type: 'error', msg: err.message || 'Failed' }); setPayingId(null); }
  };

  /* ── Derived ───────────────────────────────────── */

  const nextAppt = dashboard?.nextAppointment;
  const careReminders = careSchedule?.reminders || [];
  const pendingCare = careReminders.filter(r => r.status === 'pending' || r.status === 'sent');
  const completedCare = careReminders.filter(r => r.status === 'done' || r.status === 'skipped');
  const careStats = careSchedule?.stats;
  const now = new Date();

  const canConfirmAttendance = (a) =>
    ['requested', 'confirmed'].includes(a.status) && (!a.patientConfirmation || a.patientConfirmation.status === 'pending');

  const isNewPatient = !loading && (
    (dashboard?.upcomingAppointments || 0) === 0 &&
    treatments.length === 0 &&
    !dashboard?.nextAppointment
  );

  // Profile completeness check for onboarding steps
  const profileComplete = profile && profile.phone && profile.dateOfBirth && profile.gender;

  const carePct = careStats && careStats.total > 0
    ? Math.round((careStats.completed / careStats.total) * 100) : null;

  /* ── Render ────────────────────────────────────── */

  if (loading) {
    return (
      <div className="max-w-[1280px] mx-auto w-full space-y-6">
        <Shimmer className="h-52 w-full rounded-2xl" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Shimmer className="h-24" /><Shimmer className="h-24" /><Shimmer className="h-24" />
        </div>
        <Shimmer className="h-64 w-full rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="max-w-[1280px] mx-auto w-full space-y-6">

      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-5 py-3 rounded-xl shadow-[var(--shadow-lg)] text-sm font-medium flex items-center gap-2 ${
          toast.type === 'success' ? 'bg-secondary-600 text-white' : 'bg-red-600 text-white'
        }`}>
          {toast.type === 'success' ? <CheckCircle2 className="h-4 w-4" /> : <CircleDot className="h-4 w-4" />}
          {toast.msg}
        </div>
      )}

      {isNewPatient ? (
        /* ═════════════════════════════════════════════
           NEW PATIENT EXPERIENCE
           ═════════════════════════════════════════════ */
        <>
          {/* Welcome Hero */}
          <div className="bg-gradient-to-br from-primary-600 to-primary-800 rounded-2xl p-8 md:p-10 text-white animate-[fadeUp_0.4s_ease-out_both]">
            <h1 className="text-2xl md:text-3xl font-bold font-display leading-tight">
              Welcome to your health portal{activePatient?.name ? `, ${activePatient.name.split(' ')[0]}` : ''}
            </h1>
            <p className="text-primary-100 text-sm md:text-base mt-2 max-w-xl leading-relaxed">
              You're all set! Get started by booking your first appointment with one of our doctors.
              We're here to take care of your dental health.
            </p>
            <button
              onClick={() => openIntentHub()}
              className="mt-6 h-12 px-7 text-sm font-bold bg-white text-primary-700 rounded-xl hover:bg-primary-50 shadow-[var(--shadow-md)] transition-all duration-200 flex items-center gap-2"
            >
              <CalendarPlus className="h-5 w-5" /> Book Your First Appointment
            </button>
          </div>

          {/* Getting Started Steps */}
          <div className={`${CARD} p-6 animate-[fadeUp_0.4s_ease-out_both]`} style={{ animationDelay: '100ms' }}>
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-secondary-50 flex items-center justify-center">
                <CheckCircle2 className="h-5 w-5 text-secondary-600" />
              </div>
              <div>
                <h2 className="text-[15px] font-semibold font-display text-neutral-900">Getting Started</h2>
                <p className="text-xs text-neutral-500">Complete these steps to get the most out of your portal</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Step 1: Account Created ✓ */}
              <div className="flex items-start gap-3 p-4 rounded-xl bg-secondary-50/50 border border-secondary-100">
                <div className="w-8 h-8 rounded-full bg-secondary-500 flex items-center justify-center shrink-0 mt-0.5">
                  <CheckCircle2 className="h-4 w-4 text-white" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-secondary-800">Account Created</p>
                  <p className="text-xs text-secondary-600 mt-0.5">Your profile is ready</p>
                </div>
              </div>

              {/* Step 2: Complete Profile */}
              <div
                className={`flex items-start gap-3 p-4 rounded-xl border cursor-pointer transition-all duration-200 ${
                  profileComplete
                    ? 'bg-secondary-50/50 border-secondary-100'
                    : 'bg-white border-neutral-200 hover:border-primary-300 hover:shadow-[var(--shadow-sm)]'
                }`}
                onClick={() => !profileComplete && navigate('/patient/profile')}
              >
                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                  profileComplete ? 'bg-secondary-500' : 'bg-neutral-200'
                }`}>
                  {profileComplete
                    ? <CheckCircle2 className="h-4 w-4 text-white" />
                    : <span className="text-xs font-bold text-neutral-500">2</span>
                  }
                </div>
                <div>
                  <p className={`text-sm font-semibold ${profileComplete ? 'text-secondary-800' : 'text-neutral-800'}`}>
                    Complete Your Profile
                  </p>
                  <p className={`text-xs mt-0.5 ${profileComplete ? 'text-secondary-600' : 'text-neutral-500'}`}>
                    {profileComplete ? 'Profile is complete' : 'Add your date of birth, gender & phone'}
                  </p>
                </div>
              </div>

              {/* Step 3: Book Appointment */}
              <div
                className="flex items-start gap-3 p-4 rounded-xl border border-neutral-200 bg-white cursor-pointer hover:border-primary-300 hover:shadow-[var(--shadow-sm)] transition-all duration-200"
                onClick={() => openIntentHub()}
              >
                <div className="w-8 h-8 rounded-full bg-neutral-200 flex items-center justify-center shrink-0 mt-0.5">
                  <span className="text-xs font-bold text-neutral-500">3</span>
                </div>
                <div>
                  <p className="text-sm font-semibold text-neutral-800">Book First Appointment</p>
                  <p className="text-xs text-neutral-500 mt-0.5">Find a doctor & pick a time</p>
                </div>
              </div>
            </div>
          </div>

          {/* Our Doctors */}
          {doctors.length > 0 && (
            <div className="animate-[fadeUp_0.4s_ease-out_both]" style={{ animationDelay: '200ms' }}>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary-50 flex items-center justify-center">
                    <Stethoscope className="h-5 w-5 text-primary-600" />
                  </div>
                  <div>
                    <h2 className="text-[15px] font-semibold font-display text-neutral-900">Our Doctors</h2>
                    <p className="text-xs text-neutral-500">{doctors.length} doctor{doctors.length !== 1 ? 's' : ''} available</p>
                  </div>
                </div>
                <Link to="/patient/appointments" className="text-xs font-medium text-primary-600 hover:text-primary-700 flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-primary-50 transition-colors">
                  View All <ArrowRight className="h-3 w-3" />
                </Link>
              </div>

              <div className="flex gap-4 overflow-x-auto pb-2 snap-x snap-mandatory lg:grid lg:grid-cols-4 lg:overflow-visible lg:pb-0">
                {doctors.slice(0, 8).map((doc) => {
                  const openForDoc = () => openBookModal({ step: 2, doctor: doc, dept: doc.department });
                  return (
                    <div
                      key={doc._id}
                      role="button"
                      tabIndex={0}
                      onClick={openForDoc}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openForDoc(); } }}
                      className={`${CARD} p-5 min-w-[240px] snap-start flex-shrink-0 lg:min-w-0 cursor-pointer group hover:shadow-[var(--shadow-md)] hover:-translate-y-0.5 active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-primary-300 focus:ring-offset-2 transition-all duration-200`}
                    >
                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center shrink-0">
                          <span className="text-white font-bold font-display text-base">
                            {(doc.name || 'D')[0].toUpperCase()}
                          </span>
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-neutral-900 truncate">Dr. {stripDrPrefix(doc.name)}</p>
                          <p className="text-xs text-neutral-500 truncate">{doc.specialization || doc.department?.name || 'General'}</p>
                        </div>
                      </div>
                      {doc.consultationFee && (
                        <p className="text-xs text-neutral-600 mb-3">
                          Consultation: <span className="font-semibold font-display text-neutral-800">{fmtCurrency(doc.consultationFee)}</span>
                        </p>
                      )}
                      <div className="flex items-center justify-between pt-3 border-t border-neutral-100">
                        <span className="text-xs font-semibold text-primary-700">See availability</span>
                        <ChevronRight className="h-4 w-4 text-primary-600 group-hover:translate-x-0.5 transition-transform" />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Departments */}
          {departments.length > 0 && (
            <div className={`${CARD} p-5 animate-[fadeUp_0.4s_ease-out_both]`} style={{ animationDelay: '300ms' }}>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
                  <Building2 className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <h2 className="text-[15px] font-semibold font-display text-neutral-900">Departments</h2>
                  <p className="text-xs text-neutral-500">Explore our specialties</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {departments.map((dept) => (
                  <button
                    key={dept._id}
                    type="button"
                    onClick={() => openBookModal({ step: 1, dept })}
                    className="text-xs font-medium px-3.5 py-2 rounded-lg bg-neutral-50 text-neutral-700 border border-neutral-200 hover:bg-primary-50 hover:text-primary-700 hover:border-primary-200 focus:outline-none focus:ring-2 focus:ring-primary-300 transition-colors"
                  >
                    {dept.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        /* ═════════════════════════════════════════════
           RETURNING PATIENT EXPERIENCE
           ═════════════════════════════════════════════ */
        <>
          {/* ROW 0: Greeting Bar */}
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 animate-[fadeUp_0.4s_ease-out_both]">
            <div>
              <h1 className="text-2xl font-semibold font-display text-neutral-900">
                {getGreeting()}, {activePatient?.name?.split(' ')[0] || 'Patient'}
              </h1>
              <p className="text-sm text-neutral-600 mt-1">
                {now.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                {activePatient?.patientId && (
                  <> &middot; <span className="font-mono text-neutral-500">{activePatient.patientId}</span></>
                )}
              </p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => openIntentHub()}
                className="h-11 px-5 text-sm font-semibold bg-primary-600 text-white rounded-lg hover:bg-primary-700 shadow-[var(--shadow-sm)] hover:shadow-[var(--shadow-md)] transition-all duration-200 flex items-center gap-2">
                <CalendarPlus className="h-4 w-4" /> Book Appointment
              </button>
              <button onClick={() => navigate('/patient/health')}
                className="h-11 px-4 text-sm font-medium bg-white text-primary-700 border border-primary-200 rounded-lg hover:bg-primary-50 hover:border-primary-300 transition-all duration-200">
                View Health
              </button>
            </div>
          </div>

          {/* ROW 1: Next Appointment + Active Care */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 animate-[fadeUp_0.4s_ease-out_both]" style={{ animationDelay: '100ms' }}>

            {/* Next Appointment */}
            <div className="lg:col-span-7">
              <div className={`${CARD} p-5 h-full`}>
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-10 h-10 rounded-xl bg-primary-50 flex items-center justify-center">
                    <Stethoscope className="h-5 w-5 text-primary-600" />
                  </div>
                  <div>
                    <h2 className="text-[15px] font-semibold font-display text-neutral-900">Next Appointment</h2>
                    <p className="text-xs text-neutral-500">{nextAppt ? daysUntil(nextAppt.scheduledAt) : 'Nothing scheduled'}</p>
                  </div>
                </div>

                {nextAppt ? (
                  <>
                    <div className="flex items-start gap-4 p-4 rounded-xl bg-neutral-50 border border-neutral-100">
                      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center shrink-0">
                        <span className="text-white font-bold font-display text-lg">{(nextAppt.doctor?.name || 'D')[0]}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-neutral-900">Dr. {stripDrPrefix(nextAppt.doctor?.name) || 'Unknown'}</p>
                        <p className="text-xs text-neutral-500">{nextAppt.doctor?.specialization || nextAppt.type}</p>
                        <p className="text-xs text-neutral-600 mt-2 flex items-center gap-1.5">
                          <Clock className="h-3.5 w-3.5 text-neutral-400" />
                          <span className="font-mono">{fmtDateTime(nextAppt.scheduledAt)}</span>
                        </p>
                        <div className="flex items-center gap-2 mt-2">
                          <span className={`text-[11px] px-2.5 py-1 rounded-full font-medium capitalize ${STATUS_CLS[nextAppt.status] || 'bg-neutral-100 text-neutral-600'}`}>
                            {(nextAppt.status || 'scheduled').replace(/_/g, ' ')}
                          </span>
                          {nextAppt.type === 'teleconsult' && (
                            <span className="text-[11px] px-2.5 py-1 rounded-full font-medium bg-secondary-50 text-secondary-700">Teleconsult</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2 mt-4">
                      {canConfirmAttendance(nextAppt) && (
                        <>
                          <button onClick={() => handleConfirm(nextAppt, 'confirmed')} disabled={confirmingId === nextAppt._id}
                            className="h-9 px-4 text-xs font-semibold bg-secondary-600 text-white rounded-lg hover:bg-secondary-700 transition-all disabled:opacity-50">
                            {confirmingId === nextAppt._id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "I'll Be There"}
                          </button>
                          <button onClick={() => handleConfirm(nextAppt, 'declined')} disabled={confirmingId === nextAppt._id}
                            className="h-9 px-4 text-xs font-semibold bg-white text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-all disabled:opacity-50">
                            Can't Make It
                          </button>
                        </>
                      )}
                      {nextAppt.type === 'teleconsult' && ['confirmed', 'checked_in', 'in_progress'].includes(nextAppt.status) && (
                        <button onClick={() => navigate(`/patient/video/${nextAppt._id}`)}
                          className="h-9 px-4 text-xs font-semibold bg-secondary-600 text-white rounded-lg hover:bg-secondary-700 transition-all flex items-center gap-1.5">
                          <Video className="h-3.5 w-3.5" /> Join Video
                        </button>
                      )}
                      <button onClick={() => { setCancelTarget(nextAppt); setShowCancelConfirm(true); }}
                        className="h-9 px-4 text-xs font-medium text-neutral-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all">
                        Cancel
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="text-center py-8">
                    <div className="w-14 h-14 rounded-2xl bg-primary-50 flex items-center justify-center mx-auto mb-3">
                      <CalendarDays className="h-6 w-6 text-primary-400" />
                    </div>
                    <p className="text-sm font-medium text-neutral-700">No upcoming appointments</p>
                    <p className="text-xs text-neutral-500 mt-1">Book an appointment with your doctor</p>
                    <button onClick={() => openIntentHub()}
                      className="mt-4 h-9 px-5 text-xs font-semibold bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-all">
                      Book Now
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Active Care Plan */}
            <div className="lg:col-span-5">
              <div className={`${CARD} p-5 h-full flex flex-col`}>
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-10 h-10 rounded-xl bg-secondary-50 flex items-center justify-center">
                    <Pill className="h-5 w-5 text-secondary-600" />
                  </div>
                  <div>
                    <h2 className="text-[15px] font-semibold font-display text-neutral-900">Active Care</h2>
                    <p className="text-xs text-neutral-500">{careStats ? `${careStats.completed || 0}/${careStats.total || 0} done today` : 'Daily checklist'}</p>
                  </div>
                  <Link to="/patient/health" className="ml-auto text-xs font-medium text-primary-600 hover:text-primary-700 flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-primary-50 transition-colors">
                    <ArrowRight className="h-3 w-3" />
                  </Link>
                </div>

                {careReminders.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center py-6 text-center">
                    <div className="w-12 h-12 rounded-2xl bg-secondary-50 flex items-center justify-center mb-3">
                      <Heart className="h-5 w-5 text-secondary-400" />
                    </div>
                    <p className="text-sm font-medium text-neutral-700">No medications today</p>
                    <p className="text-xs text-neutral-500 mt-1">You're all clear for today</p>
                  </div>
                ) : (
                  <div className="flex-1 space-y-1">
                    {/* Progress */}
                    {carePct !== null && (
                      <div className="mb-3 p-3 rounded-xl bg-neutral-50">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-xs font-medium text-neutral-600">{careStats.completed} of {careStats.total} done</span>
                          <span className="text-xs font-bold font-display text-secondary-700">{carePct}%</span>
                        </div>
                        <div className="h-1.5 bg-neutral-200 rounded-full overflow-hidden">
                          <div className="h-full rounded-full bg-secondary-500 transition-all duration-500" style={{ width: `${carePct}%` }} />
                        </div>
                      </div>
                    )}

                    {/* Pending reminders */}
                    {pendingCare.slice(0, 4).map((rem) => (
                      <div key={rem._id} className="flex items-center gap-3 py-2 px-2 rounded-lg hover:bg-neutral-50 transition-colors">
                        <div className="w-7 h-7 rounded-lg bg-primary-50 flex items-center justify-center shrink-0">
                          <Pill className="h-3.5 w-3.5 text-primary-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-neutral-700 truncate">{rem.task?.title || 'Medication'}</p>
                          <p className="text-[10px] font-mono text-neutral-400">{fmtTime(rem.scheduledAt)}</p>
                        </div>
                        <div className="flex gap-1 shrink-0">
                          <button onClick={() => handleCareRespond(rem, 'done')} disabled={respondingId !== null}
                            className="w-7 h-7 rounded-md bg-secondary-50 text-secondary-600 hover:bg-secondary-100 flex items-center justify-center transition-colors disabled:opacity-50" title="Done">
                            {respondingId === rem._id ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
                          </button>
                          <button onClick={() => handleCareRespond(rem, 'skipped')} disabled={respondingId !== null}
                            className="w-7 h-7 rounded-md bg-neutral-100 text-neutral-500 hover:bg-neutral-200 flex items-center justify-center transition-colors disabled:opacity-50" title="Skip">
                            <SkipForward className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    ))}

                    {completedCare.length > 0 && (
                      <div className="pt-2 mt-auto border-t border-neutral-100">
                        <p className="text-[11px] text-neutral-400 flex items-center gap-1.5">
                          <CheckCircle2 className="h-3 w-3 text-secondary-400" />
                          {completedCare.filter(r => r.status === 'done').length} done, {completedCare.filter(r => r.status === 'skipped').length} skipped
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ROW 2: Treatment Journey */}
          {treatments.length > 0 && (
            <div className={`${CARD} p-5 animate-[fadeUp_0.4s_ease-out_both]`} style={{ animationDelay: '200ms' }}>
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
                    <FileText className="h-5 w-5 text-blue-600" />
                  </div>
                  <div>
                    <h2 className="text-[15px] font-semibold font-display text-neutral-900">Treatment Journey</h2>
                    <p className="text-xs text-neutral-500">{treatments.length} recent visit{treatments.length !== 1 ? 's' : ''}</p>
                  </div>
                </div>
                <Link to="/patient/health?tab=records" className="text-xs font-medium text-primary-600 hover:text-primary-700 flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-primary-50 transition-colors">
                  All Records <ArrowRight className="h-3 w-3" />
                </Link>
              </div>

              <div className="relative">
                <div className="absolute left-5 top-2 bottom-2 w-px bg-neutral-200" />

                <div className="space-y-1">
                  {treatments.slice(0, 4).map((tr, idx) => {
                    const teeth = tr.teeth || [];
                    const firstRx = (tr.prescription || [])[0];
                    return (
                      <div key={tr._id || idx} className="relative flex items-start gap-4 py-3 px-2 rounded-lg hover:bg-neutral-50 transition-colors">
                        <div className="relative z-10 shrink-0 mt-1.5">
                          <span className="block w-2.5 h-2.5 rounded-full ring-2 ring-white bg-primary-500" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <p className="text-sm font-medium text-neutral-800 truncate">{tr.diagnosis || 'Visit'}</p>
                            <span className="text-[11px] font-mono text-neutral-400 shrink-0">{fmtDate(tr.createdAt)}</span>
                          </div>
                          <p className="text-xs text-neutral-500">Dr. {stripDrPrefix(tr.doctor?.name) || 'Unknown'}</p>
                          {tr.treatment && <p className="text-xs text-neutral-600 mt-1 line-clamp-1">{tr.treatment}</p>}
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {teeth.slice(0, 3).map((t, i) => (
                              <span key={i} className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-100">
                                #{t.number || t.toothNumber} {t.procedure || t.condition || ''}
                              </span>
                            ))}
                            {firstRx && (
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-secondary-50 text-secondary-700 border border-secondary-100 flex items-center gap-1">
                                <Pill className="h-2.5 w-2.5" /> {firstRx.medication || firstRx.name}
                              </span>
                            )}
                          </div>
                          {tr.followUpDate && (
                            <p className={`text-[11px] mt-1.5 flex items-center gap-1 ${new Date(tr.followUpDate) <= new Date(Date.now() + 7 * 86400000) ? 'text-amber-600 font-medium' : 'text-neutral-400'}`}>
                              <CalendarDays className="h-3 w-3" /> Follow-up: {fmtDate(tr.followUpDate)}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ROW 3: Quick Actions + Account Overview */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 animate-[fadeUp_0.4s_ease-out_both]" style={{ animationDelay: '300ms' }}>

            {/* Quick Actions */}
            <div className="lg:col-span-7">
              <div className={`${CARD} p-5`}>
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-10 h-10 rounded-xl bg-primary-50 flex items-center justify-center">
                    <Activity className="h-5 w-5 text-primary-600" />
                  </div>
                  <div>
                    <h2 className="text-[15px] font-semibold font-display text-neutral-900">Quick Actions</h2>
                    <p className="text-xs text-neutral-500">Common tasks at your fingertips</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {[
                    { label: 'Book Appointment', icon: CalendarPlus, iconBg: 'bg-primary-50', iconText: 'text-primary-600', onClick: () => openIntentHub() },
                    { label: 'Emergency', icon: Phone, iconBg: 'bg-red-50', iconText: 'text-red-600', onClick: () => navigate('/patient/emergency') },
                    { label: 'My Health', icon: Heart, iconBg: 'bg-secondary-50', iconText: 'text-secondary-600', onClick: () => navigate('/patient/health') },
                    // PatientHealth defaults to the Prescriptions tab; ?tab=records
                    // is what actually opens Medical Records (see its tab routing).
                    { label: 'Medical Records', icon: FileText, iconBg: 'bg-blue-50', iconText: 'text-blue-600', onClick: () => navigate('/patient/health?tab=records') },
                    { label: 'Share Records', icon: Share2, iconBg: 'bg-purple-50', iconText: 'text-purple-600', onClick: () => navigate('/patient/share-records') },
                    { label: 'Payments', icon: CreditCard, iconBg: 'bg-amber-50', iconText: 'text-amber-600', onClick: () => navigate('/patient/payments') },
                  ].map((qa) => (
                    <button key={qa.label} onClick={qa.onClick}
                      className="flex flex-col items-center gap-3 p-4 rounded-xl border border-neutral-200 bg-white hover:shadow-[var(--shadow-md)] hover:-translate-y-0.5 active:scale-[0.97] transition-all duration-200">
                      <div className={`w-11 h-11 rounded-xl ${qa.iconBg} flex items-center justify-center`}>
                        <qa.icon className={`h-5 w-5 ${qa.iconText}`} />
                      </div>
                      <span className="text-xs font-semibold text-neutral-700 text-center leading-tight">{qa.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Account Overview */}
            <div className="lg:col-span-5">
              <div className={`${CARD} p-5 h-full`}>
                <div className="flex items-center justify-between mb-5">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-neutral-100 flex items-center justify-center">
                      <User className="h-5 w-5 text-neutral-600" />
                    </div>
                    <div>
                      <h2 className="text-[15px] font-semibold font-display text-neutral-900">Account Overview</h2>
                      <p className="text-xs text-neutral-500">Your portal summary</p>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  {[
                    { label: 'Upcoming Appointments', value: dashboard?.upcomingAppointments ?? 0, color: 'text-primary-700', icon: CalendarDays, iconBg: 'bg-primary-50', iconClr: 'text-primary-600' },
                    { label: 'Active Prescriptions', value: dashboard?.activePrescriptions ?? 0, color: 'text-secondary-700', icon: Pill, iconBg: 'bg-secondary-50', iconClr: 'text-secondary-600' },
                    { label: 'Outstanding Balance', value: fmtCurrency(financials?.totalOutstanding || financials?.outstanding || dashboard?.pendingPayments?.total || 0), color: (financials?.totalOutstanding || dashboard?.pendingPayments?.total) > 0 ? 'text-red-600' : 'text-secondary-700', icon: CreditCard, iconBg: 'bg-amber-50', iconClr: 'text-amber-600' },
                    { label: 'Total Paid', value: financials ? fmtCurrency(financials.totalPaid || 0) : '--', color: 'text-secondary-700', icon: CheckCircle2, iconBg: 'bg-secondary-50', iconClr: 'text-secondary-600' },
                  ].map((row) => (
                    <div key={row.label} className="flex items-center gap-3 py-2.5 px-3 rounded-lg bg-neutral-50">
                      <div className={`w-8 h-8 rounded-lg ${row.iconBg} flex items-center justify-center shrink-0`}>
                        <row.icon className={`h-4 w-4 ${row.iconClr}`} />
                      </div>
                      <span className="text-xs font-medium text-neutral-600 flex-1">{row.label}</span>
                      <span className={`text-sm font-bold font-display ${row.color}`}>{row.value}</span>
                    </div>
                  ))}
                </div>

                {invoices.length > 0 && (
                  <Link to="/patient/payments"
                    className="mt-4 w-full h-9 text-xs font-semibold bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-all flex items-center justify-center gap-1.5">
                    View Payments <ArrowRight className="h-3 w-3" />
                  </Link>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── Dialogs ──────────────────────────────── */}
      <ConfirmDialog
        open={showCancelConfirm}
        title="Cancel Appointment"
        message={`Cancel your appointment with Dr. ${stripDrPrefix(cancelTarget?.doctor?.name) || 'Unknown'} on ${cancelTarget ? fmtDateTime(cancelTarget.scheduledAt) : ''}?`}
        onConfirm={handleCancelAppt}
        onCancel={() => { setShowCancelConfirm(false); setCancelTarget(null); }}
        danger loading={cancelLoading}
      />

      <BookingWizardModal
        open={showBookModal}
        onClose={closeBookModal}
        activePatientId={activePatientId}
        activePatient={activePatient}
        setToast={(t) => setToast({ type: t.type, msg: t.message })}
        onBooked={fetchAll}
        initialStep={bookContext.step}
        initialDept={bookContext.dept}
        initialDoctor={bookContext.doctor}
        intent={bookContext.intent}
      />

      <BookingIntentHub
        open={intentHubOpen}
        onClose={() => setIntentHubOpen(false)}
        onChoose={handleIntentChosen}
      />
    </div>
  );
}
