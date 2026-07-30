import { useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion, useInView, AnimatePresence } from 'framer-motion';
import Button from '../common/Button';
import SearchBar from '../common/SearchBar';
import { SPECIALTIES } from '../../constants/specialties';
import {
  ArrowRight, CheckCircle2, Calendar, Users, IndianRupee,
  TrendingUp, Shield, Clock, Stethoscope, Building2,
  Smile, Sparkles, Baby, CircleDot, HeartPulse,
  Microscope, Scissors, BadgeCheck, AlignVerticalSpaceAround,
} from 'lucide-react';

// ── Audience toggle config ────────────────────────────
const audiences = [
  { key: 'patients', label: 'For Patients', icon: Stethoscope },
  { key: 'clinics', label: 'For Clinics', icon: Building2 },
];

// ── B2B trust badges ──────────────────────────────────
const trustBadges = [
  { label: 'HIPAA Compliant', icon: Shield },
  { label: '99.9% Uptime', icon: TrendingUp },
  { label: '30+ Clinics', icon: Users },
  { label: '14-Day Free Trial', icon: Clock },
];

// ── Animations ────────────────────────────────────────
const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: (i = 0) => ({
    opacity: 1, y: 0,
    transition: { duration: 0.6, delay: i * 0.1, ease: [0.25, 0.46, 0.45, 0.94] },
  }),
};
const scaleIn = {
  hidden: { opacity: 0, scale: 0.9 },
  visible: (i = 0) => ({
    opacity: 1, scale: 1,
    transition: { duration: 0.7, delay: 0.3 + i * 0.1, ease: [0.25, 0.46, 0.45, 0.94] },
  }),
};

export default function Hero({ audience, setAudience }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-50px' });

  return (
    <section
      ref={ref}
      className="relative overflow-hidden bg-gradient-to-b from-neutral-100 via-neutral-50 to-white pt-32 lg:pt-40 pb-24 lg:pb-32"
    >
      {/* Background decorations */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-primary-100/20 rounded-full blur-[120px] -translate-y-1/2 translate-x-1/3" />
        <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-accent-100/15 rounded-full blur-[100px] translate-y-1/3 -translate-x-1/4" />
      </div>

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* ── Audience Toggle ── */}
        <motion.div
          variants={fadeUp}
          initial="hidden"
          animate={inView ? 'visible' : 'hidden'}
          custom={0}
          className="flex justify-center mb-10"
        >
          <div className="relative inline-flex items-center bg-neutral-200/80 rounded-2xl p-1 border border-neutral-300/60">
            <motion.div
              className="absolute top-1 bottom-1 rounded-xl bg-white shadow-sm border border-neutral-300/40"
              animate={{
                left: audience === 'patients' ? '4px' : '50%',
                right: audience === 'patients' ? '50%' : '4px',
              }}
              transition={{ type: 'spring', stiffness: 350, damping: 30 }}
            />
            {audiences.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setAudience(key)}
                className={`relative z-10 flex items-center gap-2 px-5 sm:px-6 py-2.5 text-sm font-semibold rounded-xl transition-colors duration-200 cursor-pointer ${
                  audience === key
                    ? 'text-neutral-900'
                    : 'text-neutral-900/40 hover:text-neutral-900/60'
                }`}
              >
                <Icon className="w-4 h-4" />
                {label}
              </button>
            ))}
          </div>
        </motion.div>

        {/* ── Content (animated switch) ── */}
        <AnimatePresence mode="wait">
          {audience === 'patients' ? (
            <PatientHero key="patients" inView={inView} />
          ) : (
            <ClinicHero key="clinics" inView={inView} />
          )}
        </AnimatePresence>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────
// PATIENT HERO — Search-centric marketplace hero
// ─────────────────────────────────────────────────────
const SPECIALTY_STYLE = {
  'General Dentistry':    { icon: Smile, color: 'bg-blue-50 text-blue-600 border-blue-100' },
  'Orthodontics':         { icon: AlignVerticalSpaceAround, color: 'bg-purple-50 text-purple-600 border-purple-100' },
  'Periodontics':         { icon: HeartPulse, color: 'bg-rose-50 text-rose-600 border-rose-100' },
  'Endodontics':          { icon: Microscope, color: 'bg-amber-50 text-amber-600 border-amber-100' },
  'Oral Surgery':         { icon: Scissors, color: 'bg-red-50 text-red-600 border-red-100' },
  'Cosmetic Dentistry':   { icon: Sparkles, color: 'bg-pink-50 text-pink-600 border-pink-100' },
  'Pediatric Dentistry':  { icon: Baby, color: 'bg-emerald-50 text-emerald-600 border-emerald-100' },
  'Prosthodontics':       { icon: CircleDot, color: 'bg-teal-50 text-teal-600 border-teal-100' },
};
const specialties = SPECIALTIES.map((name) => ({ name, ...SPECIALTY_STYLE[name] }));

const trustPoints = [
  { icon: BadgeCheck, label: 'Verified Doctors' },
  { icon: Calendar, label: 'Instant Booking' },
  { icon: Shield, label: 'No Account Needed' },
];

function PatientHero() {
  const navigate = useNavigate();

  const handleSearch = ({ query, location, lat, lon }) => {
    const params = new URLSearchParams();
    if (query) params.set('q', query);
    if (location) params.set('location', location);
    if (lat) params.set('lat', lat);
    if (lon) params.set('lon', lon);
    navigate(`/browse?${params.toString()}`);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.4 }}
      className="max-w-3xl mx-auto text-center"
    >
      <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-neutral-900 font-display leading-[1.08] tracking-tight mb-5">
        Find and book the{' '}
        <span className="bg-gradient-to-r from-primary-600 to-primary-500 bg-clip-text text-transparent">
          best dental care
        </span>
      </h1>

      <p className="text-lg lg:text-xl text-neutral-900/60 leading-relaxed mb-10 max-w-2xl mx-auto">
        Browse top-rated dentists across our growing network of clinics. Book instantly — no account needed.
      </p>

      {/* Search Bar */}
      <SearchBar variant="hero" onSearch={handleSearch} />

      {/* Trust points */}
      <div className="flex items-center justify-center gap-6 mt-6 mb-10">
        {trustPoints.map(({ icon: Icon, label }) => (
          <div key={label} className="flex items-center gap-1.5">
            <Icon className="w-3.5 h-3.5 text-primary-600" />
            <span className="text-xs font-medium text-neutral-900/40">{label}</span>
          </div>
        ))}
      </div>

      {/* Specialty quick-links */}
      <div className="flex flex-wrap justify-center gap-2.5">
        {specialties.map((spec, i) => (
          <motion.button
            key={spec.name}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3, delay: 0.3 + i * 0.04 }}
            onClick={() => navigate(`/browse?specialty=${encodeURIComponent(spec.name)}`)}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-medium transition-all hover:shadow-sm hover:scale-[1.03] cursor-pointer ${spec.color}`}
          >
            <spec.icon className="w-4 h-4" />
            {spec.name}
          </motion.button>
        ))}
      </div>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────
// CLINIC HERO — Platform pitch + dashboard mockup
// ─────────────────────────────────────────────────────
function ClinicHero({ inView }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.4 }}
    >
      <div className="grid lg:grid-cols-2 gap-16 lg:gap-20 items-center">
        {/* Left — Content */}
        <div className="max-w-xl lg:max-w-none">
          <motion.div
            variants={fadeUp} initial="hidden" animate={inView ? 'visible' : 'hidden'} custom={0}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary-50/80 border border-primary-200/40 rounded-full mb-8"
          >
            <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
            <span className="text-sm font-medium text-primary-700">Trusted by dental practices across India</span>
          </motion.div>

          <motion.h1
            variants={fadeUp} initial="hidden" animate={inView ? 'visible' : 'hidden'} custom={1}
            className="text-4xl sm:text-5xl lg:text-[3.5rem] xl:text-6xl font-extrabold text-neutral-900 font-display leading-[1.08] tracking-tight mb-6"
          >
            Elevate Your Dental
            <br />
            <span className="bg-gradient-to-r from-primary-600 to-primary-500 bg-clip-text text-transparent">
              Practice Management
            </span>
          </motion.h1>

          <motion.p
            variants={fadeUp} initial="hidden" animate={inView ? 'visible' : 'hidden'} custom={2}
            className="text-lg lg:text-xl text-neutral-900/60 leading-relaxed mb-10 max-w-lg"
          >
            All-in-one cloud platform for scheduling, billing, patient records, and multi-branch operations — built for modern dental practices.
          </motion.p>

          <motion.div
            variants={fadeUp} initial="hidden" animate={inView ? 'visible' : 'hidden'} custom={3}
            className="flex flex-col sm:flex-row gap-4 mb-4"
          >
            <Button size="lg" to="/contact">
              Book a Demo
              <ArrowRight className="w-5 h-5 ml-2" />
            </Button>
            <Button variant="secondary" size="lg" to="/pricing">
              View Pricing
            </Button>
          </motion.div>

          <motion.p
            variants={fadeUp} initial="hidden" animate={inView ? 'visible' : 'hidden'} custom={3.5}
            className="text-sm text-neutral-900/40 mb-12"
          >
            Already have a clinic account?{' '}
            <Link to="/clinic/login" className="text-primary-600 hover:text-primary-700 font-medium transition-colors">
              Sign in
            </Link>
          </motion.p>

          <motion.div
            variants={fadeUp} initial="hidden" animate={inView ? 'visible' : 'hidden'} custom={4}
            className="grid grid-cols-2 sm:grid-cols-4 gap-4"
          >
            {trustBadges.map(({ label, icon: Icon }) => (
              <div key={label} className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-primary-50 flex items-center justify-center shrink-0">
                  <Icon className="w-4 h-4 text-primary-600" />
                </div>
                <span className="text-xs font-medium text-neutral-900/50 leading-tight">{label}</span>
              </div>
            ))}
          </motion.div>
        </div>

        {/* Right — Dashboard Illustration */}
        <motion.div
          variants={scaleIn} initial="hidden" animate={inView ? 'visible' : 'hidden'} custom={0}
          className="relative hidden lg:block"
        >
          <div className="relative bg-white rounded-3xl shadow-2xl shadow-neutral-900/8 border border-neutral-300/60 overflow-hidden">
            {/* Browser bar */}
            <div className="flex items-center gap-2 px-5 py-3.5 bg-neutral-50 border-b border-neutral-300/40">
              <div className="flex gap-1.5">
                <div className="w-3 h-3 rounded-full bg-red-400/80" />
                <div className="w-3 h-3 rounded-full bg-amber-400/80" />
                <div className="w-3 h-3 rounded-full bg-emerald-400/80" />
              </div>
              <div className="flex-1 mx-8">
                <div className="bg-white rounded-lg border border-neutral-300/60 px-4 py-1.5 text-xs text-neutral-900/30 font-medium">
                  app.bestoclinic.com/dashboard
                </div>
              </div>
            </div>

            {/* Dashboard content */}
            <div className="p-6 space-y-5">
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: "Today's Appointments", value: '24', icon: Calendar, color: 'bg-primary-50 text-primary-600' },
                  { label: 'New Patients', value: '8', icon: Users, color: 'bg-emerald-50 text-emerald-600' },
                  { label: 'Revenue (MTD)', value: '₹4,82,500', icon: IndianRupee, color: 'bg-accent-50 text-accent-600' },
                ].map((stat, i) => (
                  <motion.div
                    key={stat.label}
                    variants={scaleIn} initial="hidden" animate={inView ? 'visible' : 'hidden'} custom={i + 2}
                    className={`rounded-2xl p-4 ${stat.color}`}
                  >
                    <div className="flex items-center gap-1.5 mb-2">
                      <stat.icon className="w-3.5 h-3.5 opacity-60" />
                      <p className="text-[10px] font-medium opacity-60 uppercase tracking-wide">{stat.label}</p>
                    </div>
                    <p className="text-xl font-bold">{stat.value}</p>
                  </motion.div>
                ))}
              </div>

              {/* Chart */}
              <div className="bg-neutral-50 rounded-2xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-xs font-semibold text-neutral-900/50 uppercase tracking-wide">Monthly Revenue</p>
                  <span className="text-[10px] font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">+12.5%</span>
                </div>
                <div className="flex items-end gap-[6px] h-28">
                  {[35, 55, 40, 70, 50, 65, 80, 55, 72, 85, 60, 92].map((h, i) => (
                    <motion.div
                      key={i}
                      initial={{ height: 0 }}
                      animate={inView ? { height: `${h}%` } : { height: 0 }}
                      transition={{ duration: 0.5, delay: 0.8 + i * 0.05, ease: 'easeOut' }}
                      className={`flex-1 rounded-t-md ${i === 11 ? 'bg-primary-500' : 'bg-primary-300/60'}`}
                    />
                  ))}
                </div>
              </div>

              {/* Appointment list */}
              <div className="space-y-2.5">
                {[
                  { time: '9:00 AM', patient: 'Priya S.', type: 'Cleaning', status: 'bg-emerald-500' },
                  { time: '10:30 AM', patient: 'Rahul V.', type: 'Root Canal', status: 'bg-amber-500' },
                  { time: '1:00 PM', patient: 'Anita D.', type: 'Consultation', status: 'bg-primary-500' },
                ].map((apt) => (
                  <div key={apt.time} className="flex items-center justify-between bg-neutral-50 rounded-xl px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-primary-100 rounded-full flex items-center justify-center text-xs font-bold text-primary-700">
                        {apt.patient[0]}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-neutral-900">{apt.patient}</p>
                        <p className="text-[11px] text-neutral-900/40">{apt.type}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`w-1.5 h-1.5 rounded-full ${apt.status}`} />
                      <span className="text-xs font-medium text-neutral-900/40">{apt.time}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Floating card — bottom left */}
          <motion.div
            initial={{ opacity: 0, x: -20, y: 20 }}
            animate={inView ? { opacity: 1, x: 0, y: 0 } : {}}
            transition={{ duration: 0.6, delay: 1.2 }}
            className="absolute -bottom-6 -left-6 bg-white rounded-2xl shadow-lg shadow-neutral-900/8 border border-neutral-300/60 px-5 py-4 flex items-center gap-3"
          >
            <div className="w-11 h-11 bg-emerald-50 rounded-xl flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-neutral-900">No-shows reduced</p>
              <p className="text-xs text-emerald-600 font-medium">-40% this month</p>
            </div>
          </motion.div>

          {/* Floating card — top right */}
          <motion.div
            initial={{ opacity: 0, x: 20, y: -20 }}
            animate={inView ? { opacity: 1, x: 0, y: 0 } : {}}
            transition={{ duration: 0.6, delay: 1.4 }}
            className="absolute -top-4 -right-4 bg-white rounded-2xl shadow-lg shadow-neutral-900/8 border border-neutral-300/60 px-5 py-4 flex items-center gap-3"
          >
            <div className="w-11 h-11 bg-primary-50 rounded-xl flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-primary-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-neutral-900">Revenue up</p>
              <p className="text-xs text-primary-600 font-medium">+28% vs last quarter</p>
            </div>
          </motion.div>
        </motion.div>
      </div>
    </motion.div>
  );
}
