import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Star, Clock, CheckCircle2, AlertCircle, Sparkles,
  MessageSquare, Stethoscope, CalendarDays, ArrowRight,
  EyeOff, AlertTriangle, Loader2,
} from 'lucide-react';
import { listPatientReviews } from '../api';
import { useSafePatientAuth } from '../../hooks/useSafeAuth';
import { Pagination } from '../../platform/components/shared';
import { stripDrPrefix } from '../../utils/doctorName';

/* ─── Shared design tokens ────────────────────── */

const PAGE = 10;
const CARD = 'bg-white rounded-2xl border border-neutral-200 shadow-[var(--shadow-sm)]';

function Shimmer({ className = '' }) {
  return <div className={`animate-pulse bg-neutral-200/60 rounded-xl ${className}`} />;
}

/* ─── Formatters ──────────────────────────────── */

const fmtDate = (d) =>
  new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

const TYPE_LABEL = {
  consultation: 'Consultation',
  follow_up: 'Follow-up',
  procedure: 'Procedure',
  teleconsult: 'Teleconsult',
};

/* ─── Config ──────────────────────────────────── */

const STATUS = {
  pending:  { label: 'Pending',  bg: 'bg-amber-50',     text: 'text-amber-700',     dot: 'bg-amber-500' },
  approved: { label: 'Published', bg: 'bg-secondary-50', text: 'text-secondary-700', dot: 'bg-secondary-500' },
  flagged:  { label: 'Flagged',  bg: 'bg-red-50',       text: 'text-red-600',       dot: 'bg-red-400' },
};

const VIEWS = [
  { key: 'all',      label: 'All' },
  { key: 'pending',  label: 'Pending' },
  { key: 'approved', label: 'Published' },
];

const AVATAR_GRADIENTS = [
  'from-blue-500 to-indigo-600',
  'from-emerald-500 to-teal-600',
  'from-violet-500 to-purple-600',
  'from-rose-500 to-pink-600',
  'from-amber-500 to-orange-600',
  'from-cyan-500 to-sky-600',
];

function avatarGradient(id) {
  if (!id) return AVATAR_GRADIENTS[0];
  let h = 0;
  for (let i = 0; i < id.length; i++) h = id.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_GRADIENTS[Math.abs(h) % AVATAR_GRADIENTS.length];
}

/* ═══════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════ */

export default function PatientReviews() {
  const navigate = useNavigate();
  const { activePatientId } = useSafePatientAuth();

  /* ── State ── */
  const [reviews, setReviews] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('all');

  /* ── Fetch ── */

  const fetchReviews = useCallback(async () => {
    if (!activePatientId) return;
    setLoading(true);
    try {
      const params = { page, limit: PAGE };
      if (view !== 'all') params.status = view;
      const res = await listPatientReviews(activePatientId, params);
      const d = res.data || res;
      const list = Array.isArray(d) ? d : d.items || d.data || [];
      setReviews(list);
      setTotal(d.total || d.meta?.total || list.length);
    } catch {
      setReviews([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [activePatientId, page, view]);

  useEffect(() => {
    fetchReviews();
  }, [fetchReviews]);

  useEffect(() => { setPage(1); }, [view]);

  /* ── Derived ── */

  const avgRating = reviews.length > 0
    ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1)
    : '—';

  /* ═══ RENDER ═══ */

  if (loading && reviews.length === 0) {
    return (
      <div className="max-w-[1280px] mx-auto w-full space-y-6">
        <Shimmer className="h-10 w-56" />
        <Shimmer className="h-24 w-full" />
        <Shimmer className="h-64 w-full" />
      </div>
    );
  }

  // Zero-data welcome
  if (!loading && total === 0 && view === 'all') {
    return (
      <div className="max-w-[1280px] mx-auto w-full space-y-6">
        <div className="bg-gradient-to-br from-primary-600 to-primary-800 rounded-2xl p-8 md:p-10 text-white animate-[fadeUp_0.4s_ease-out_both]">
          <h1 className="text-2xl md:text-3xl font-bold font-display leading-tight">
            Your Reviews
          </h1>
          <p className="text-primary-100 text-sm md:text-base mt-2 max-w-xl leading-relaxed">
            After a completed appointment, you can share your experience by rating your doctor.
            Your feedback helps other patients and helps doctors improve their care.
          </p>
          <button
            onClick={() => navigate('/patient/appointments')}
            className="mt-6 h-12 px-7 text-sm font-bold bg-white text-primary-700 rounded-xl hover:bg-primary-50 shadow-[var(--shadow-md)] transition-all duration-200 flex items-center gap-2"
          >
            <ArrowRight className="h-5 w-5" /> View Appointments
          </button>
        </div>

        <div className={`${CARD} p-6 animate-[fadeUp_0.4s_ease-out_both]`} style={{ animationDelay: '100ms' }}>
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center">
              <Sparkles className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <h2 className="text-[15px] font-semibold font-display text-neutral-900">How reviews work</h2>
              <p className="text-xs text-neutral-500">Simple, fair, and transparent</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              {
                icon: CalendarDays,
                iconBg: 'bg-blue-50', iconClr: 'text-blue-600',
                title: 'Complete a visit',
                desc: 'Reviews are available only after your appointment is marked as completed.',
              },
              {
                icon: Star,
                iconBg: 'bg-amber-50', iconClr: 'text-amber-600',
                title: 'Rate & comment',
                desc: 'Give 1–5 stars, add a title, and write about your experience.',
              },
              {
                icon: CheckCircle2,
                iconBg: 'bg-secondary-50', iconClr: 'text-secondary-600',
                title: 'Published after review',
                desc: 'The clinic reviews your feedback before it goes public. You can stay anonymous.',
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

      {/* Header */}
      <div className="animate-[fadeUp_0.4s_ease-out_both]">
        <h1 className="text-2xl font-semibold font-display text-neutral-900">Reviews</h1>
        <p className="text-sm text-neutral-600 mt-1">Your feedback on past appointments</p>
      </div>

      {/* Summary */}
      <div
        className="grid grid-cols-2 sm:grid-cols-3 gap-3 animate-[fadeUp_0.4s_ease-out_both]"
        style={{ animationDelay: '100ms' }}
      >
        <SummaryCard label="Total Reviews" value={total} Icon={MessageSquare} iconBg="bg-amber-50" iconClr="text-amber-600" />
        <SummaryCard label="Avg. Rating" value={avgRating} Icon={Star} iconBg="bg-amber-50" iconClr="text-amber-500" />
        <SummaryCard
          label="Pending"
          value={reviews.filter((r) => r.status === 'pending').length}
          Icon={Clock}
          iconBg="bg-neutral-100"
          iconClr="text-neutral-500"
          className="col-span-2 sm:col-span-1"
        />
      </div>

      {/* Filter + List */}
      <div
        className={`${CARD} p-5 animate-[fadeUp_0.4s_ease-out_both]`}
        style={{ animationDelay: '200ms' }}
      >
        {/* Tabs */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center">
              <Star className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <h2 className="text-[15px] font-semibold font-display text-neutral-900">Your Reviews</h2>
              <p className="text-xs text-neutral-500">{total} total</p>
            </div>
          </div>
          <div className="flex bg-neutral-100 rounded-lg p-0.5 gap-0.5">
            {VIEWS.map((v) => (
              <button
                key={v.key}
                onClick={() => setView(v.key)}
                className={`text-[11px] px-2.5 py-1 rounded-md font-medium transition-all ${
                  view === v.key
                    ? 'bg-white text-neutral-900 shadow-sm'
                    : 'text-neutral-500 hover:text-neutral-700'
                }`}
              >
                {v.label}
              </button>
            ))}
          </div>
        </div>

        {/* List */}
        {loading ? (
          <div className="space-y-3">
            <Shimmer className="h-28 w-full" />
            <Shimmer className="h-28 w-full" />
            <Shimmer className="h-28 w-full" />
          </div>
        ) : reviews.length === 0 ? (
          <EmptyState msg={`No ${view === 'all' ? '' : view + ' '}reviews`} />
        ) : (
          <div className="space-y-2">
            {reviews.map((review) => (
              <ReviewRow key={review._id} review={review} />
            ))}

            {total > PAGE && (
              <Pagination page={page} limit={PAGE} total={total} onChange={setPage} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Sub-components ──────────────────────────── */

function SummaryCard({ label, value, Icon, iconBg, iconClr, className = '' }) {
  return (
    <div className={`${CARD} p-4 flex items-center gap-3 ${className}`}>
      <div className={`w-10 h-10 rounded-xl ${iconBg} flex items-center justify-center shrink-0`}>
        <Icon className={`h-5 w-5 ${iconClr}`} />
      </div>
      <div>
        <p className="text-xl font-bold font-display tabular-nums text-neutral-900">{value}</p>
        <p className="text-[11px] font-medium text-neutral-500">{label}</p>
      </div>
    </div>
  );
}

function ReviewRow({ review }) {
  const st = STATUS[review.status] || STATUS.pending;
  const doctor = review.doctor;
  const appt = review.appointment;
  const grad = avatarGradient(doctor?._id || review._id);

  return (
    <div className="rounded-xl bg-neutral-50 border border-neutral-100 hover:bg-neutral-100/50 hover:border-neutral-200 transition-colors">
      <div className="p-4">
        {/* Top: Doctor + Status */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-3">
            {/* Doctor avatar */}
            {doctor?.profilePhoto ? (
              <img src={doctor.profilePhoto} alt="" className="w-10 h-10 rounded-xl object-cover" />
            ) : (
              <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${grad} flex items-center justify-center text-white text-sm font-bold`}>
                {(doctor?.name || '?')[0]}
              </div>
            )}
            <div>
              <p className="text-sm font-semibold text-neutral-900">
                {doctor?.name ? `Dr. ${stripDrPrefix(doctor.name)}` : 'Doctor'}
              </p>
              <p className="text-[11px] text-neutral-500">
                {doctor?.specializations?.length > 0 && (
                  <span>{doctor.specializations[0]} · </span>
                )}
                {appt?.type && <span>{TYPE_LABEL[appt.type] || appt.type} · </span>}
                {appt?.scheduledAt && fmtDate(appt.scheduledAt)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {review.isAnonymous && (
              <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-500 flex items-center gap-1">
                <EyeOff className="h-3 w-3" /> Anonymous
              </span>
            )}
            <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full flex items-center gap-1 ${st.bg} ${st.text}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />
              {st.label}
            </span>
          </div>
        </div>

        {/* Stars */}
        <div className="flex items-center gap-1 mb-2">
          {[1, 2, 3, 4, 5].map((n) => (
            <Star
              key={n}
              className={`h-4 w-4 ${
                n <= review.rating
                  ? 'text-amber-400 fill-amber-400'
                  : 'text-neutral-200'
              }`}
            />
          ))}
          <span className="text-xs font-bold text-neutral-700 ml-1 tabular-nums">{review.rating}.0</span>
        </div>

        {/* Title + Comment */}
        {review.title && (
          <p className="text-sm font-semibold text-neutral-800 mb-0.5">{review.title}</p>
        )}
        {review.comment && (
          <p className="text-xs text-neutral-600 leading-relaxed">{review.comment}</p>
        )}

        {/* Footer */}
        <p className="text-[11px] text-neutral-400 mt-2">
          Submitted {fmtDate(review.createdAt)}
          {review.status === 'pending' && (
            <span className="ml-2 text-amber-600 inline-flex items-center gap-0.5">
              <Clock className="h-3 w-3" /> Awaiting moderation
            </span>
          )}
          {review.status === 'flagged' && (
            <span className="ml-2 text-red-500 inline-flex items-center gap-0.5">
              <AlertTriangle className="h-3 w-3" /> Under review by clinic
            </span>
          )}
        </p>
      </div>
    </div>
  );
}

function EmptyState({ msg }) {
  return (
    <div className="py-10 flex flex-col items-center gap-3">
      <div className="w-14 h-14 rounded-2xl bg-neutral-50 flex items-center justify-center">
        <Star className="h-6 w-6 text-neutral-300" />
      </div>
      <p className="text-sm font-medium text-neutral-500">{msg}</p>
    </div>
  );
}
