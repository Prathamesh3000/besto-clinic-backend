import { useState, useEffect, useCallback } from 'react';
import { useParams, useSearchParams, useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Star, MapPin, Clock, UserCheck, GraduationCap, Languages,
  ArrowLeft, Loader2, Calendar, Stethoscope,
  CheckCircle, AlertCircle, Award, Building2, IndianRupee,
  LogIn, UserPlus, ShieldCheck, BadgeCheck, CalendarDays,
} from 'lucide-react';
import { getFeaturedDoctor, getDoctorAvailability, getDoctorAvailabilitySummary } from '../api/publicApi';
import SEO from '../components/common/SEO';
import AvailabilityCalendar from '../components/booking/AvailabilityCalendar';
import TimeSlotPicker from '../components/booking/TimeSlotPicker';

const APPOINTMENT_TYPES = [
  { value: 'consultation', label: 'Consultation', desc: 'First-time or general visit' },
  { value: 'follow_up', label: 'Follow-up', desc: 'Continuing treatment' },
  { value: 'procedure', label: 'Procedure', desc: 'Scheduled dental procedure' },
  { value: 'teleconsult', label: 'Teleconsult', desc: 'Video consultation' },
];

const API_BASE = import.meta.env.VITE_API_URL || 'https://bestoclinic.com/api/v1';
const EASE = [0.25, 0.46, 0.45, 0.94];

/** Strip "Dr." prefix if already present — prevents "Dr. Dr. Arjun" */
function displayName(name) {
  return name?.replace(/^Dr\.?\s*/i, '').trim() || name;
}

function StatBadge({ icon: Icon, label, value, color = 'primary' }) {
  const colors = {
    primary: 'bg-primary-50 text-primary-600',
    amber: 'bg-amber-50 text-amber-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    navy: 'bg-primary-100 text-primary-700',
  };
  return (
    <div className="flex items-center gap-2.5">
      <div className={`w-10 h-10 rounded-xl ${colors[color]} flex items-center justify-center`}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <p className="text-sm font-bold text-neutral-900">{value}</p>
        <p className="text-[11px] text-neutral-900/45">{label}</p>
      </div>
    </div>
  );
}

function StarRating({ rating, size = 'sm' }) {
  const px = size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4';
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={`${px} ${i < Math.round(rating) ? 'text-amber-400 fill-amber-400' : 'text-neutral-300'}`}
        />
      ))}
    </div>
  );
}

export default function DoctorProfile() {
  const { slug, doctorId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const platformId = searchParams.get('platformId') || doctorId;

  const [doctor, setDoctor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Auth state — verify token exists, matches this clinic, and has patient/guardian role
  const [authValid, setAuthValid] = useState(() => {
    const token = localStorage.getItem('tenant_token');
    const storedSlug = localStorage.getItem('tenant_slug');
    if (!token || storedSlug !== slug) return false;
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      if (payload.exp && payload.exp * 1000 < Date.now()) return false;
      return ['patient', 'guardian'].includes(payload.role);
    } catch {
      return false;
    }
  });
  const isAuthenticated = authValid;

  // Booking state
  const [selectedDate, setSelectedDate] = useState('');
  const [slots, setSlots] = useState([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsOnLeave, setSlotsOnLeave] = useState(false);
  const [slotsOffDay, setSlotsOffDay] = useState(false);
  const [leaveReason, setLeaveReason] = useState('');
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [appointmentType, setAppointmentType] = useState('consultation');
  const [reason, setReason] = useState('');
  const [booking, setBooking] = useState(false);
  const [bookingResult, setBookingResult] = useState(null);
  const [bookingError, setBookingError] = useState('');
  const [paymentStatus, setPaymentStatus] = useState(null); // 'paid' | 'pending' | 'failed'

  // Fetch doctor profile 
  useEffect(() => {
    (async () => {
      try {
        const res = await getFeaturedDoctor(platformId);
        setDoctor(res.data);
      } catch (err) {
        setError(err.message || 'Doctor not found');
      } finally {
        setLoading(false);
      }
    })();
  }, [platformId]);

  // Fetch availability when date changes
  useEffect(() => {
    if (!selectedDate || !doctor) return;
    setSlotsLoading(true);
    setSelectedSlot(null);
    setSlotsOnLeave(false);
    setSlotsOffDay(false);
    setLeaveReason('');
    getDoctorAvailability(slug, doctor.tenantDoctorId, selectedDate)
      .then((res) => {
        const d = res.data || {};
        setSlots(d.slots || []);
        setSlotsOnLeave(!!d.isOnLeave);
        setSlotsOffDay(!!d.isOffDay || !!d.isOverrideDayOff || !!d.isBranchClosed || !!d.isBeyondMaxAdvance);
        setLeaveReason(d.leaveReason || d.reason || '');
      })
      .catch(() => setSlots([]))
      .finally(() => setSlotsLoading(false));
  }, [selectedDate, slug, doctor]);

  // Availability summary fetcher for calendar component
  const fetchSummary = useCallback(
    (month, year) => {
      if (!doctor) return Promise.resolve({ data: { dates: {} } });
      return getDoctorAvailabilitySummary(slug, doctor.tenantDoctorId, month, year);
    },
    [slug, doctor],
  );

  // ── Razorpay helpers ──
  const loadRazorpayScript = useCallback(() => {
    return new Promise((resolve) => {
      if (window.Razorpay) return resolve(true);
      const s = document.createElement('script');
      s.src = 'https://checkout.razorpay.com/v1/checkout.js';
      s.onload = () => resolve(true);
      s.onerror = () => resolve(false);
      document.body.appendChild(s);
    });
  }, []);

  const openRazorpayCheckout = useCallback((orderData, token) => {
    const rzp = new window.Razorpay({
      key: orderData.keyId,
      amount: orderData.amount,
      currency: orderData.currency || 'INR',
      order_id: orderData.orderId,
      name: 'BestoClinic',
      description: `Consultation — Dr. ${displayName(doctor?.name)}`,
      handler: async (response) => {
        try {
          const verifyRes = await fetch(`${API_BASE}/portal/appointments/verify-payment`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
              'x-tenant-id': slug,
            },
            body: JSON.stringify({
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
              appointmentId: orderData.appointmentId,
            }),
          });
          if (verifyRes.ok) {
            setPaymentStatus('paid');
          } else {
            setPaymentStatus('failed');
          }
        } catch {
          setPaymentStatus('failed');
        }
      },
      modal: {
        ondismiss: () => setPaymentStatus('pending'),
      },
    });
    rzp.on('payment.failed', () => setPaymentStatus('failed'));
    rzp.open();
  }, [slug, doctor]);

  const handleBook = useCallback(async () => {
    if (!selectedSlot || !isAuthenticated) return;
    setBooking(true);
    setBookingError('');
    setPaymentStatus(null);

    try {
      const token = localStorage.getItem('tenant_token');
      const profileRes = await fetch(`${API_BASE}/portal/profiles`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'x-tenant-id': slug,
        },
      });
      const profileData = await profileRes.json();
      if (!profileRes.ok) throw new Error(profileData.message || 'Failed to load profile');

      // /portal/profiles returns an array of patient profiles
      const profiles = Array.isArray(profileData.data) ? profileData.data : [profileData.data];
      const patient = profiles[0];
      if (!patient?._id) throw new Error('Patient profile not found');

      const apptRes = await fetch(`${API_BASE}/portal/appointments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'x-tenant-id': slug,
        },
        body: JSON.stringify({
          doctor: doctor.tenantDoctorId,
          scheduledAt: selectedSlot.startTime,
          type: appointmentType,
          reason: reason.trim() || undefined,
          source: 'chatbot',
          consultationFee: doctor.consultationFee || undefined,
        }),
      });
      const apptData = await apptRes.json();
      if (!apptRes.ok) throw new Error(apptData.message || 'Failed to book appointment');

      setBookingResult('success');

      // If payment order returned, open Razorpay checkout
      const paymentOrder = apptData.data?.paymentOrder;
      if (paymentOrder) {
        const loaded = await loadRazorpayScript();
        if (loaded) {
          openRazorpayCheckout(
            { ...paymentOrder, appointmentId: apptData.data?._id || apptData.data?.id },
            token,
          );
        } else {
          setPaymentStatus('pending'); // Script failed to load, pay later
        }
      } else {
        setPaymentStatus(null); // No fee, no payment needed
      }
    } catch (err) {
      const msg = err.message || 'Booking failed';
      if (msg.includes('Requires role') || msg.includes('Unauthorized') || msg.includes('expired')) {
        localStorage.removeItem('tenant_token');
        localStorage.removeItem('tenant_user');
        localStorage.removeItem('tenant_slug');
        setAuthValid(false);
        setBookingError('Your session is not valid for booking. Please register or login as a patient.');
        setBookingResult(null);
      } else {
        setBookingError(msg);
        setBookingResult('error');
      }
    } finally {
      setBooking(false);
    }
  }, [selectedSlot, isAuthenticated, slug, doctor, appointmentType, reason, loadRazorpayScript, openRazorpayCheckout]);

  const authUrl = (mode = 'register') =>
    `/patient/register?clinic=${slug}&doctor=${doctor?.tenantDoctorId || doctorId}&platformId=${platformId}&mode=${mode}`;

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-50 flex items-center justify-center">
        <div className="text-center space-y-3">
          <Loader2 className="w-8 h-8 text-primary-600 animate-spin mx-auto" />
          <p className="text-sm text-neutral-900/40">Loading doctor profile...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error || !doctor) {
    return (
      <div className="min-h-screen bg-neutral-50 flex flex-col items-center justify-center gap-4 px-4">
        <div className="w-16 h-16 bg-red-50 rounded-2xl flex items-center justify-center">
          <AlertCircle className="w-8 h-8 text-red-400" />
        </div>
        <p className="text-lg font-semibold text-neutral-900">{error || 'Doctor not found'}</p>
        <p className="text-sm text-neutral-900/50">The doctor profile you're looking for is not available.</p>
        <Link to="/" className="text-primary-600 hover:text-primary-700 font-medium text-sm flex items-center gap-1">
          <ArrowLeft className="w-4 h-4" /> Back to Home
        </Link>
      </div>
    );
  }

  const initials = doctor.name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();

  return (
    <>
      <SEO title={`Dr. ${displayName(doctor.name)} — ${doctor.clinicName}`} />
      <div className="min-h-screen bg-neutral-50/50">

        {/* ─── Hero Section ─── */}
        <div className="relative bg-gradient-to-br from-primary-600 via-primary-700 to-primary-800 overflow-hidden">
          {/* Background decoration */}
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute -top-24 -right-24 w-96 h-96 bg-white/5 rounded-full blur-3xl" />
            <div className="absolute -bottom-32 -left-32 w-80 h-80 bg-primary-400/10 rounded-full blur-3xl" />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary-500/5 rounded-full blur-[100px]" />
          </div>

          {/* Nav */}
          <div className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="py-4 flex items-center gap-3">
              <Link to="/" className="text-white/50 hover:text-white/80 transition">
                <ArrowLeft className="w-5 h-5" />
              </Link>
              <div className="flex items-center gap-2">
                {doctor.clinicLogo && (
                  <img src={doctor.clinicLogo} alt="" className="w-6 h-6 rounded-md object-cover" />
                )}
                <span className="text-sm font-medium text-white/70">{doctor.clinicName}</span>
              </div>
            </div>
          </div>

          {/* Doctor Info */}
          <div className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pb-8 pt-2 sm:pb-12 sm:pt-4">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: EASE }}
              className="flex flex-col sm:flex-row gap-5 sm:gap-6 items-start"
            >
              {/* Avatar */}
              {doctor.avatar ? (
                <img
                  src={doctor.avatar}
                  alt={doctor.name}
                  className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl object-cover border-4 border-white/20 shadow-xl shadow-black/20"
                />
              ) : (
                <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl bg-white/15 backdrop-blur-sm border-4 border-white/20 flex items-center justify-center shadow-xl shadow-black/20">
                  <span className="text-3xl font-bold text-white">{initials}</span>
                </div>
              )}

              <div className="flex-1 min-w-0">
                <h1 className="text-2xl sm:text-3xl font-bold font-display text-white">
                  Dr. {displayName(doctor.name)}
                </h1>

                {/* Specializations */}
                {doctor.specializations?.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2.5">
                    {doctor.specializations.map((s) => (
                      <span
                        key={s}
                        className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium bg-white/15 text-white rounded-full backdrop-blur-sm border border-white/10"
                      >
                        <Stethoscope className="w-3 h-3" />
                        {s}
                      </span>
                    ))}
                  </div>
                )}

                {/* Quick stats row */}
                <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mt-4 text-sm text-white/70">
                  {doctor.averageRating > 0 && (
                    <span className="flex items-center gap-1.5">
                      <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
                      <span className="font-bold text-white">{doctor.averageRating}</span>
                      ({doctor.totalReviews} reviews)
                    </span>
                  )}
                  {doctor.experienceYears > 0 && (
                    <span className="flex items-center gap-1.5">
                      <Clock className="w-4 h-4 text-white/50" />
                      {doctor.experienceYears} years exp.
                    </span>
                  )}
                  <span className="flex items-center gap-1.5">
                    <MapPin className="w-4 h-4 text-white/50" />
                    {doctor.clinicCity || doctor.clinicName}
                  </span>
                  {doctor.acceptingNewPatients && (
                    <span className="flex items-center gap-1.5 text-emerald-300">
                      <UserCheck className="w-4 h-4" />
                      Accepting new patients
                    </span>
                  )}
                </div>

                {/* Fee badge */}
                {doctor.consultationFee > 0 && (
                  <div className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 bg-white/10 rounded-xl backdrop-blur-sm border border-white/10">
                    <IndianRupee className="w-4 h-4 text-white/60" />
                    <span className="text-xl font-bold text-white">{doctor.consultationFee}</span>
                    <span className="text-xs text-white/50">per consultation</span>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        </div>

        {/* ─── Main Content ─── */}
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-12">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">

            {/* ── Left Column: About + Clinic + Reviews ── */}
            <div className="lg:col-span-2 space-y-6">

              {/* Quick Stats Cards */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.1, ease: EASE }}
                className="grid grid-cols-2 sm:grid-cols-4 gap-3"
              >
                {doctor.averageRating > 0 && (
                  <div className="bg-white rounded-xl border border-neutral-300/40 p-4 shadow-sm">
                    <StatBadge icon={Star} label="Rating" value={`${doctor.averageRating}/5`} color="amber" />
                  </div>
                )}
                {doctor.experienceYears > 0 && (
                  <div className="bg-white rounded-xl border border-neutral-300/40 p-4 shadow-sm">
                    <StatBadge icon={Award} label="Experience" value={`${doctor.experienceYears} Years`} color="primary" />
                  </div>
                )}
                {doctor.totalReviews > 0 && (
                  <div className="bg-white rounded-xl border border-neutral-300/40 p-4 shadow-sm">
                    <StatBadge icon={UserCheck} label="Reviews" value={doctor.totalReviews} color="emerald" />
                  </div>
                )}
                {doctor.consultationFee > 0 && (
                  <div className="bg-white rounded-xl border border-neutral-300/40 p-4 shadow-sm">
                    <StatBadge icon={IndianRupee} label="Consultation" value={`\u20B9${doctor.consultationFee}`} color="navy" />
                  </div>
                )}
              </motion.div>

              {/* About Section */}
              {(doctor.bio || doctor.qualifications?.length > 0 || doctor.education?.length > 0 || doctor.languages?.length > 0) && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: 0.15, ease: EASE }}
                  className="bg-white rounded-2xl border border-neutral-300/40 shadow-sm overflow-hidden"
                >
                  {/* Section header */}
                  <div className="px-6 py-4 border-b border-neutral-200/60 flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-primary-50 flex items-center justify-center">
                      <Stethoscope className="w-4 h-4 text-primary-600" />
                    </div>
                    <h2 className="text-base font-bold font-display text-neutral-900">About Dr. {displayName(doctor.name)?.split(' ')[0]}</h2>
                  </div>

                  <div className="p-6 space-y-6">
                    {doctor.bio && (
                      <p className="text-sm text-neutral-900/65 leading-relaxed">{doctor.bio}</p>
                    )}

                    {doctor.qualifications?.length > 0 && (
                      <div>
                        <h3 className="text-xs font-bold text-neutral-900/40 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                          <BadgeCheck className="w-3.5 h-3.5" />
                          Qualifications
                        </h3>
                        <div className="flex flex-wrap gap-2">
                          {doctor.qualifications.map((q, i) => (
                            <span key={i} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-primary-50/60 text-primary-700 rounded-lg border border-primary-100/60">
                              <ShieldCheck className="w-3 h-3" />
                              {q}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {doctor.education?.length > 0 && (
                      <div>
                        <h3 className="text-xs font-bold text-neutral-900/40 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                          <GraduationCap className="w-3.5 h-3.5" />
                          Education
                        </h3>
                        <div className="space-y-3">
                          {doctor.education.map((edu, i) => (
                            <div key={i} className="flex items-start gap-3 bg-neutral-50/60 rounded-xl p-3 border border-neutral-200/40">
                              <div className="w-8 h-8 rounded-lg bg-neutral-200/60 flex items-center justify-center shrink-0 mt-0.5">
                                <GraduationCap className="w-4 h-4 text-neutral-900/40" />
                              </div>
                              <div>
                                <p className="text-sm font-semibold text-neutral-900">{edu.degree}</p>
                                {edu.institution && <p className="text-xs text-neutral-900/50 mt-0.5">{edu.institution}</p>}
                                {edu.year && <p className="text-[11px] text-neutral-900/30 mt-0.5">{edu.year}</p>}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {doctor.languages?.length > 0 && (
                      <div>
                        <h3 className="text-xs font-bold text-neutral-900/40 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                          <Languages className="w-3.5 h-3.5" />
                          Languages
                        </h3>
                        <div className="flex flex-wrap gap-2">
                          {doctor.languages.map((lang) => (
                            <span key={lang} className="px-3 py-1.5 text-xs font-medium bg-neutral-100 text-neutral-900/60 rounded-lg border border-neutral-200/60">
                              {lang}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}

              {/* Clinic Info */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.2, ease: EASE }}
                className="bg-white rounded-2xl border border-neutral-300/40 shadow-sm overflow-hidden"
              >
                <div className="px-6 py-4 border-b border-neutral-200/60 flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center">
                    <Building2 className="w-4 h-4 text-emerald-600" />
                  </div>
                  <h2 className="text-base font-bold font-display text-neutral-900">Clinic Information</h2>
                </div>
                <div className="p-6">
                  <div className="flex items-center gap-4">
                    {doctor.clinicLogo ? (
                      <img src={doctor.clinicLogo} alt={doctor.clinicName} className="w-14 h-14 rounded-xl object-cover border border-neutral-200/60" />
                    ) : (
                      <div className="w-14 h-14 rounded-xl bg-emerald-50 flex items-center justify-center border border-emerald-100">
                        <Building2 className="w-6 h-6 text-emerald-600" />
                      </div>
                    )}
                    <div>
                      <p className="text-sm font-semibold text-neutral-900">{doctor.clinicName}</p>
                      {doctor.clinicCity && (
                        <p className="text-xs text-neutral-900/50 flex items-center gap-1 mt-1">
                          <MapPin className="w-3 h-3" />
                          {doctor.clinicCity}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>

              {/* Reviews */}
              {doctor.recentReviews?.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: 0.25, ease: EASE }}
                  className="bg-white rounded-2xl border border-neutral-300/40 shadow-sm overflow-hidden"
                >
                  <div className="px-6 py-4 border-b border-neutral-200/60 flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center">
                        <Star className="w-4 h-4 text-amber-500" />
                      </div>
                      <h2 className="text-base font-bold font-display text-neutral-900">Patient Reviews</h2>
                    </div>
                    {doctor.averageRating > 0 && (
                      <div className="flex items-center gap-2">
                        <StarRating rating={doctor.averageRating} />
                        <span className="text-sm font-bold text-neutral-900">{doctor.averageRating}</span>
                      </div>
                    )}
                  </div>

                  <div className="divide-y divide-neutral-200/60">
                    {doctor.recentReviews.map((review, i) => (
                      <div key={i} className="px-6 py-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-full bg-neutral-200/60 flex items-center justify-center">
                              <span className="text-xs font-bold text-neutral-900/40">
                                {review.patientName?.charAt(0)?.toUpperCase() || '?'}
                              </span>
                            </div>
                            <div>
                              <p className="text-sm font-medium text-neutral-900">{review.patientName}</p>
                              <p className="text-[10px] text-neutral-900/30">
                                {new Date(review.createdAt).toLocaleDateString('en-IN', {
                                  year: 'numeric', month: 'short', day: 'numeric',
                                })}
                              </p>
                            </div>
                          </div>
                          <StarRating rating={review.rating} />
                        </div>
                        {review.title && (
                          <p className="text-sm font-medium text-neutral-900/80 mt-2">{review.title}</p>
                        )}
                        {review.comment && (
                          <p className="text-xs text-neutral-900/55 mt-1.5 leading-relaxed">{review.comment}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </div>

            {/* ── Right Column: Booking Sidebar ── */}
            <div className="space-y-6">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.2, ease: EASE }}
                className="bg-white rounded-2xl border border-neutral-300/40 shadow-sm sticky top-6 overflow-hidden"
              >
                {/* Booking header */}
                <div className="px-5 py-4 bg-gradient-to-r from-primary-50 to-emerald-50/50 border-b border-neutral-200/60">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-primary-100 flex items-center justify-center">
                      <Calendar className="w-4 h-4 text-primary-600" />
                    </div>
                    <div>
                      <h2 className="text-base font-bold font-display text-neutral-900">Book Appointment</h2>
                      <p className="text-[11px] text-neutral-900/40">Choose a date and time</p>
                    </div>
                  </div>
                </div>

                <div className="p-5">
                  {bookingResult === 'success' ? (
                    /* ── Success state ── */
                    <div className="text-center py-6 space-y-4">
                      <div className="w-16 h-16 bg-emerald-50 rounded-2xl flex items-center justify-center mx-auto">
                        <CheckCircle className="w-8 h-8 text-emerald-500" />
                      </div>
                      <div>
                        <p className="text-base font-bold text-neutral-900">Appointment Confirmed!</p>
                        <p className="text-xs text-neutral-900/50 mt-1 leading-relaxed">
                          {paymentStatus === 'paid'
                            ? 'Your appointment is confirmed and payment has been processed.'
                            : paymentStatus === 'pending' || paymentStatus === 'failed'
                            ? 'Your appointment is confirmed. You can pay later from the Patient Portal.'
                            : 'Your appointment has been confirmed successfully.'}
                        </p>
                      </div>

                      {paymentStatus && (
                        <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full ${
                          paymentStatus === 'paid'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/60'
                            : 'bg-amber-50 text-amber-700 border border-amber-200/60'
                        }`}>
                          {paymentStatus === 'paid' ? (
                            <><CheckCircle className="w-3 h-3" /> Payment Successful</>
                          ) : (
                            <><IndianRupee className="w-3 h-3" /> Payment Pending</>
                          )}
                        </div>
                      )}

                      <div className="bg-neutral-50/60 rounded-xl border border-neutral-200/40 p-3 text-left space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-neutral-900/40">Doctor</span>
                          <span className="font-medium text-neutral-900">Dr. {displayName(doctor.name)}</span>
                        </div>
                        {selectedDate && (
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-neutral-900/40">Date</span>
                            <span className="font-medium text-neutral-900">
                              {new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                            </span>
                          </div>
                        )}
                        {selectedSlot && (
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-neutral-900/40">Time</span>
                            <span className="font-medium text-neutral-900">{selectedSlot.display}</span>
                          </div>
                        )}
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-neutral-900/40">Type</span>
                          <span className="font-medium text-neutral-900 capitalize">{appointmentType.replace('_', ' ')}</span>
                        </div>
                        {doctor.consultationFee > 0 && (
                          <div className="flex items-center justify-between text-xs border-t border-neutral-200/40 pt-1.5 mt-1.5">
                            <span className="text-neutral-900/40">Fee</span>
                            <span className="font-medium text-neutral-900">{'\u20B9'}{doctor.consultationFee}</span>
                          </div>
                        )}
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-neutral-900/40">Status</span>
                          <span className="font-medium text-emerald-600">Confirmed</span>
                        </div>
                      </div>

                      <Link
                        to="/patient/appointments"
                        className="w-full py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-primary-500 to-primary-600 rounded-xl hover:from-primary-600 hover:to-primary-700 transition-all flex items-center justify-center gap-2 shadow-sm shadow-primary-600/20"
                      >
                        <CalendarDays className="w-4 h-4" />
                        View My Appointments
                      </Link>
                      <button
                        onClick={() => {
                          setBookingResult(null);
                          setPaymentStatus(null);
                          setSelectedDate('');
                          setSelectedSlot(null);
                          setReason('');
                        }}
                        className="text-sm text-primary-600 font-semibold hover:text-primary-700 cursor-pointer"
                      >
                        Book Another Appointment
                      </button>
                    </div>
                  ) : (
                    /* ── Booking form — always visible, auth gate at the end ── */
                    <div className="space-y-5">
                      {/* Calendar month view */}
                      <div>
                        <label className="block text-xs font-semibold text-neutral-900/60 mb-2">Select Date</label>
                        <AvailabilityCalendar
                          fetchSummary={fetchSummary}
                          selectedDate={selectedDate}
                          onDateSelect={(d) => setSelectedDate(d)}
                          compact
                        />
                      </div>

                      {/* Grouped time slots */}
                      {selectedDate && (
                        <div>
                          <label className="block text-xs font-semibold text-neutral-900/60 mb-2">Available Time Slots</label>
                          <TimeSlotPicker
                            slots={slots}
                            selectedSlot={selectedSlot}
                            onSlotSelect={setSelectedSlot}
                            loading={slotsLoading}
                            isOnLeave={slotsOnLeave}
                            isOffDay={slotsOffDay}
                            leaveReason={leaveReason}
                            compact
                          />
                        </div>
                      )}

                      {/* Appointment type + reason + action */}
                      {selectedSlot && (
                        <>
                          <div>
                            <label className="block text-xs font-semibold text-neutral-900/60 mb-2">Appointment Type</label>
                            <div className="grid grid-cols-2 gap-1.5">
                              {APPOINTMENT_TYPES.map((t) => (
                                <button
                                  key={t.value}
                                  onClick={() => setAppointmentType(t.value)}
                                  className={`px-3 py-2 text-left rounded-lg transition cursor-pointer border ${
                                    appointmentType === t.value
                                      ? 'bg-primary-50 border-primary-300 text-primary-700'
                                      : 'bg-neutral-50/30 border-neutral-200/60 text-neutral-900/60 hover:border-primary-200'
                                  }`}
                                >
                                  <p className="text-xs font-semibold">{t.label}</p>
                                  <p className="text-[10px] opacity-60 mt-0.5">{t.desc}</p>
                                </button>
                              ))}
                            </div>
                          </div>

                          <div>
                            <label className="block text-xs font-semibold text-neutral-900/60 mb-1.5">Reason for Visit <span className="font-normal text-neutral-900/30">(optional)</span></label>
                            <textarea
                              value={reason}
                              onChange={(e) => setReason(e.target.value)}
                              rows={2}
                              maxLength={500}
                              placeholder="Briefly describe your concern..."
                              className="w-full px-3.5 py-2.5 text-sm border border-neutral-300/60 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-400 transition resize-none bg-neutral-50/30"
                            />
                          </div>

                          {bookingError && (
                            <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200/60 rounded-xl">
                              <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                              <p className="text-xs text-red-700">{bookingError}</p>
                            </div>
                          )}

                          {isAuthenticated ? (
                            /* Authenticated — confirm booking */
                            <button
                              onClick={handleBook}
                              disabled={booking}
                              className="w-full py-3 text-sm font-semibold text-white bg-gradient-to-r from-primary-500 to-primary-600 rounded-xl hover:from-primary-600 hover:to-primary-700 transition-all disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2 shadow-sm shadow-primary-600/20"
                            >
                              {booking ? (
                                <><Loader2 className="w-4 h-4 animate-spin" /> Booking...</>
                              ) : (
                                <><CheckCircle className="w-4 h-4" /> {doctor.consultationFee > 0 ? `Confirm & Pay \u20B9${doctor.consultationFee}` : 'Confirm Booking'}</>
                              )}
                            </button>
                          ) : (
                            /* Not authenticated — sign up / login CTA */
                            <div className="space-y-3 pt-3 border-t border-neutral-200/60">
                              <p className="text-xs text-center text-neutral-900/45">
                                Create an account or sign in to confirm your booking
                              </p>
                              <button
                                onClick={() => navigate(authUrl('register'))}
                                className="w-full py-3 text-sm font-semibold text-white bg-gradient-to-r from-primary-500 to-primary-600 rounded-xl hover:from-primary-600 hover:to-primary-700 transition-all cursor-pointer flex items-center justify-center gap-2 shadow-sm shadow-primary-600/20"
                              >
                                <UserPlus className="w-4 h-4" />
                                Create Account & Book
                              </button>
                              <button
                                onClick={() => navigate(authUrl('login'))}
                                className="w-full py-2.5 text-sm font-medium text-primary-700 bg-primary-50/80 border border-primary-200/50 rounded-xl hover:bg-primary-100/80 transition-all cursor-pointer flex items-center justify-center gap-2"
                              >
                                <LogIn className="w-4 h-4" />
                                Already have an account? Sign In
                              </button>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              </motion.div>

              {/* Trust badges — shown below booking card */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.3, ease: EASE }}
                className="bg-white rounded-2xl border border-neutral-300/40 shadow-sm p-5"
              >
                <div className="space-y-3">
                  <div className="flex items-center gap-2.5 text-sm">
                    <ShieldCheck className="w-4 h-4 text-emerald-500" />
                    <span className="text-neutral-900/60">Verified doctor profile</span>
                  </div>
                  <div className="flex items-center gap-2.5 text-sm">
                    <CheckCircle className="w-4 h-4 text-emerald-500" />
                    <span className="text-neutral-900/60">Instant appointment confirmation</span>
                  </div>
                  <div className="flex items-center gap-2.5 text-sm">
                    <BadgeCheck className="w-4 h-4 text-emerald-500" />
                    <span className="text-neutral-900/60">Secure & private booking</span>
                  </div>
                </div>
              </motion.div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
