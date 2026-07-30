import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import ChatbotController from '../components/chatbot-v2/ChatbotController';
import { motion, AnimatePresence } from 'framer-motion';
import Btn from '../components/common/Btn';
import AnimatedCounter from '../components/common/AnimatedCounter';
import { EASE, VP, NAV_LINKS } from '../components/common/designSystem';
import { fetchPlans } from '../api/publicApi';
import { transformPlan, computeAnnualSavings } from '../data/pricing';
import {
  ArrowRight,
  Stethoscope,
  Building2,
  Play,
  Users,
  Activity,
  Clock,
  Puzzle,
  CalendarCheck,
  Receipt,
  Video,
  Shield,
  BarChart3,
  Layers,
  Search,
  Bell,
  Heart,
  Star,
  Smartphone,
  MousePointerClick,
  UserPlus,
  CheckCircle2,
  Plus,
  Check,
  X,
  Sparkles,
  Quote,
  Menu,
  ChevronRight,
  Mail,
  Phone,
  MapPin,
  Facebook,
  Twitter,
  Linkedin,
  Instagram,
  Briefcase,
  FileText,
} from 'lucide-react';

/* ═══════════════════════════════════════════════════════════
   INLINE SEO (landing-page specific — avoids "| BestoClinic" suffix)
   ═══════════════════════════════════════════════════════════ */

function useSEO({ title, description, keywords }) {
  useEffect(() => {
    document.title = title || 'BestoClinic';
    const setMeta = (selector, value) => {
      const el = document.querySelector(selector);
      if (el && value) el.setAttribute('content', value);
    };
    setMeta('meta[name="description"]', description);
    setMeta('meta[name="keywords"]', keywords);
    setMeta('meta[property="og:title"]', title);
    setMeta('meta[property="og:description"]', description);
  }, [title, description, keywords]);
}

/* ═══════════════════════════════════════════════════════════
   STATIC DATA
   ═══════════════════════════════════════════════════════════ */

const STATS = [
  { target: 10, suffix: '+', label: 'Clinics Onboarded', icon: Building2 },
  { target: 10000, suffix: '+', label: 'Patient Records', icon: Users },
  { target: 6, suffix: '+', label: 'Modules', icon: Puzzle },
  { target: 5, suffix: '+', label: 'Integrations', icon: Activity },
];

const CLINIC_FEATURES = [
  { icon: CalendarCheck, title: 'Smart Scheduling', description: 'Multi-view calendar with automated push reminders and online patient booking. Track appointments across doctors and branches.', color: 'bg-blue-50 text-blue-600' },
  { icon: Receipt, title: 'Billing & Invoicing', description: 'GST-ready invoicing, multi-mode payments (UPI, card, cash), insurance claim tracking, and cash register management.', color: 'bg-emerald-50 text-emerald-600' },
  { icon: Video, title: 'Telemedicine', description: 'Secure video consultations with encrypted room tokens, prescriptions, and integrated appointment billing.', color: 'bg-purple-50 text-purple-600' },
  { icon: Layers, title: 'Multi-Branch', description: 'Centralized dashboard for all locations with cross-branch patient records, branch-wise revenue, and reporting.', color: 'bg-amber-50 text-amber-600' },
  { icon: Shield, title: 'Security & Isolation', description: 'AES-256 encryption, isolated database per clinic, comprehensive audit trails, and role-based access control.', color: 'bg-rose-50 text-rose-600' },
  { icon: BarChart3, title: 'Analytics & Reports', description: 'Revenue tracking by doctor and branch, collection metrics, day-end reports, and performance dashboards.', color: 'bg-teal-50 text-teal-600' },
];

const PATIENT_FEATURES = [
  { icon: Search, title: 'Find Doctors', description: 'Search by specialty, location, or clinic. View profiles, ratings, and real-time availability.', color: 'bg-blue-50 text-blue-600' },
  { icon: CalendarCheck, title: 'Instant Booking', description: 'Book appointments in seconds. Pick your preferred time slot and get instant confirmation.', color: 'bg-emerald-50 text-emerald-600' },
  { icon: Heart, title: 'Health Records', description: 'Access your treatment history, prescriptions, and lab reports all in one secure portal.', color: 'bg-rose-50 text-rose-600' },
  { icon: Video, title: 'Video Consultations', description: 'Consult with your doctor from home via secure WebRTC video calls with in-session chat.', color: 'bg-purple-50 text-purple-600' },
  { icon: Bell, title: 'Smart Notifications', description: 'Never miss an appointment with automated push notifications and in-app reminders.', color: 'bg-amber-50 text-amber-600' },
  { icon: Smartphone, title: 'Mobile App', description: 'Full-featured mobile experience for managing appointments, records, and prescriptions on the go.', color: 'bg-teal-50 text-teal-600' },
];

const CLINIC_STEPS = [
  { number: '01', icon: MousePointerClick, title: 'Sign Up', description: 'Create your clinic account in minutes. No credit card required for the free plan or trial.' },
  { number: '02', icon: Layers, title: 'Configure', description: 'Set up branches, departments, staff roles, and customize your booking page. Import legacy data via CSV.' },
  { number: '03', icon: CheckCircle2, title: 'Go Live', description: 'Start accepting appointments, managing patients, and tracking revenue from day one.' },
];

const PATIENT_STEPS = [
  { number: '01', icon: Search, title: 'Browse', description: 'Search doctors by specialty, location, or clinic. View profiles and ratings — no account needed.' },
  { number: '02', icon: UserPlus, title: 'Register Once', description: 'Create one account that works across every clinic on BestoClinic. No re-registering ever.' },
  { number: '03', icon: CalendarCheck, title: 'Book & Visit', description: 'Pick your time, get instant confirmation. Visit in-person or consult via video.' },
];

const TESTIMONIALS = {
  patients: [
    { name: 'Ananya Deshmukh', role: 'Patient', location: 'Pune, MH', rating: 5, text: 'Found an amazing dentist within minutes. The booking process was seamless — picked a time slot, got a confirmation instantly.' },
    { name: 'Vikram Rao', role: 'Patient', location: 'Hyderabad, TG', rating: 5, text: 'I was new to the city and needed an orthodontist urgently. BestoClinic showed me the top-rated ones nearby with real reviews.' },
    { name: 'Meera Joshi', role: 'Patient', location: 'Mumbai, MH', rating: 5, text: 'The reminders are so helpful — I never miss an appointment anymore. Being able to see my treatment history in one place gives me peace of mind.' },
  ],
  clinics: [
    { name: 'Dr. Kavitha Nair', role: 'Owner, Pearl Dental Clinic', location: 'Mumbai, MH', rating: 5, text: 'BestoClinic transformed how we manage our practice. Appointment no-shows dropped by 35% in the first month thanks to automated reminders.' },
    { name: 'Dr. Arjun Mehta', role: 'Managing Partner, Mehta Dental Group', location: 'Bengaluru, KA', rating: 5, text: 'Managing 4 locations used to be a nightmare. The multi-branch dashboard lets me see real-time performance across all clinics.' },
    { name: 'Dr. Sneha Kulkarni', role: 'Founder, Bright Smile Dental', location: 'Pune, MH', rating: 5, text: 'The billing module is a game-changer. Claims that used to take weeks now process in days. Our collection rate improved by 28%.' },
  ],
};

/** Determine which plan card gets the highlighted (dark) treatment */
function isHighlightedPlan(slug) {
  return slug === 'starter';
}

const FAQS = [
  { q: 'How long does it take to set up BestoClinic?', a: 'Most clinics are fully set up within 24 hours. Our team handles data migration, and we provide free onboarding support to get your staff trained quickly.' },
  { q: 'Is my patient data secure?', a: 'Absolutely. All sensitive data is encrypted with AES-256-GCM, and each clinic operates in a completely isolated database. We maintain comprehensive audit trails, role-based access control, and encrypted tenant connections.' },
  { q: 'Can I manage multiple branches?', a: 'Yes! Our Professional and Enterprise plans support multi-branch management with a centralized dashboard, cross-location patient records, and consolidated reporting.' },
  { q: 'Do patients need an account to book?', a: 'Patients can browse doctors and clinics without any account. They only need to create a free account when ready to book — and one account works across all clinics on BestoClinic.' },
  { q: 'Is there a free plan or trial?', a: 'Yes! Our Free plan is completely free forever for solo practitioners — no credit card needed. All paid plans include a free trial (14 days for Starter and Professional, 30 days for Enterprise) so you can explore every feature before committing.' },
  { q: 'What support do you offer?', a: 'All plans include email support. Professional plans get priority support with faster response times, and Enterprise plans include dedicated support with a personal account manager.' },
];

/* NAV_LINKS imported from designSystem.js */

/* ═══════════════════════════════════════════════════════════
   NAVBAR (self-contained)
   ═══════════════════════════════════════════════════════════ */

function LandingNavbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <motion.nav
      initial={{ y: -100 }}
      animate={{ y: 0 }}
      transition={{ duration: 0.6, ease: EASE }}
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? 'bg-white/90 backdrop-blur-xl border-b border-neutral-200/60 shadow-sm'
          : 'bg-transparent'
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 lg:h-20">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2.5">
            <img src="/platform_admin/logo/Besto Clinic Logo.svg" alt="BestoClinic" className="w-9 h-9" />
            <span className={`text-xl font-bold font-display tracking-tight transition-colors ${scrolled ? 'text-neutral-900' : 'text-white'}`}>
              Besto<span className="text-secondary-400">Clinic</span>
            </span>
          </Link>

          {/* Desktop nav */}
          <div className="hidden lg:flex items-center gap-1">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className={`px-4 py-2 text-sm font-medium rounded-xl transition-colors ${
                  scrolled
                    ? 'text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100'
                    : 'text-white/70 hover:text-white hover:bg-white/10'
                }`}
              >
                {link.label}
              </Link>
            ))}
          </div>

          {/* Desktop CTAs */}
          <div className="hidden lg:flex items-center gap-3">
            <Link
              to="/login"
              className={`px-5 py-2.5 text-sm font-semibold rounded-xl transition-colors ${
                scrolled
                  ? 'text-neutral-700 hover:text-neutral-900 hover:bg-neutral-100'
                  : 'text-white/80 hover:text-white hover:bg-white/10'
              }`}
            >
              Log in
            </Link>
            <Link
              to="/register"
              className="px-5 py-2.5 text-sm font-semibold rounded-xl bg-gradient-to-r from-primary-500 to-primary-600 text-white hover:from-primary-600 hover:to-primary-700 shadow-md shadow-primary-600/20 transition-all"
            >
              Get Started Free
            </Link>
          </div>

          {/* Mobile menu toggle */}
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className={`lg:hidden p-2 rounded-xl transition-colors cursor-pointer ${
              scrolled ? 'text-neutral-700 hover:bg-neutral-100' : 'text-white hover:bg-white/10'
            }`}
          >
            <Menu className="w-6 h-6" />
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3, ease: EASE }}
            className="lg:hidden bg-white border-b border-neutral-200 overflow-hidden"
          >
            <div className="px-4 py-4 space-y-1">
              {NAV_LINKS.map((link) => (
                <Link
                  key={link.to}
                  to={link.to}
                  onClick={() => setMobileOpen(false)}
                  className="block px-4 py-3 text-sm font-medium text-neutral-700 hover:bg-neutral-50 rounded-xl"
                >
                  {link.label}
                </Link>
              ))}
              <div className="pt-3 mt-3 border-t border-neutral-200 flex flex-col gap-2">
                <Link
                  to="/login"
                  onClick={() => setMobileOpen(false)}
                  className="block px-4 py-3 text-sm font-semibold text-neutral-700 hover:bg-neutral-50 rounded-xl text-center"
                >
                  Log in
                </Link>
                <Link
                  to="/register"
                  onClick={() => setMobileOpen(false)}
                  className="block px-4 py-3 text-sm font-semibold text-white bg-gradient-to-r from-primary-500 to-primary-600 rounded-xl text-center shadow-md shadow-primary-600/20"
                >
                  Get Started Free
                </Link>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.nav>
  );
}

/* ═══════════════════════════════════════════════════════════
   SECTION 1: HERO
   ═══════════════════════════════════════════════════════════ */

function HeroSection({ audience, setAudience }) {
  const AUDIENCES = [
    { key: 'patients', label: 'For Patients', icon: Stethoscope },
    { key: 'clinics', label: 'For Clinics', icon: Building2 },
  ];

  const heroContent = {
    patients: {
      headline: 'Your Health,',
      highlight: 'Simplified',
      sub: 'Find trusted doctors, book appointments instantly, and manage your health records — all in one place. No more phone calls, no more waiting.',
      primaryCta: { label: 'Find a Doctor', to: '/browse', icon: ArrowRight },
      secondaryCta: { label: 'Patient Portal', to: '/patient/login' },
    },
    clinics: {
      headline: 'The Operating System for',
      highlight: 'Modern Clinics',
      sub: 'All-in-one cloud platform for scheduling, billing, patient records, telemedicine, and multi-branch operations. Start your free trial today.',
      primaryCta: { label: 'Get Started Free', to: '/register', icon: ArrowRight },
      secondaryCta: { label: 'View Pricing', to: '/pricing', icon: Play },
    },
  };

  const content = heroContent[audience];

  const trustBadges = [
    { icon: Shield, label: 'AES-256 Encrypted' },
    { icon: Layers, label: 'Isolated Per Clinic' },
    { icon: Users, label: '10+ Clinics' },
    { icon: Clock, label: '14-Day Free Trial' },
  ];

  return (
    <section className="relative overflow-hidden" style={{ background: 'linear-gradient(135deg, var(--color-primary-700) 0%, var(--color-primary-950) 100%)' }}>
      {/* Background decorations */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-primary-500/10 rounded-full blur-[140px] -translate-y-1/3 translate-x-1/3" />
        <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-secondary-500/8 rounded-full blur-[100px] translate-y-1/3 -translate-x-1/4" />
        <div
          className="absolute inset-0 opacity-30"
          style={{
            backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.04) 1px, transparent 0)',
            backgroundSize: '40px 40px',
          }}
        />
      </div>

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-36 lg:pt-44 pb-28 lg:pb-36">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          {/* Left — Content */}
          <div>
            {/* Audience Toggle */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: EASE }}
              className="mb-8"
            >
              <div className="relative inline-flex items-center bg-white/10 backdrop-blur-sm rounded-2xl p-1 border border-white/20">
                <motion.div
                  className="absolute top-1 bottom-1 rounded-xl bg-white shadow-md"
                  animate={{
                    left: audience === 'patients' ? '4px' : '50%',
                    right: audience === 'patients' ? '50%' : '4px',
                  }}
                  transition={{ type: 'spring', stiffness: 350, damping: 30 }}
                />
                {AUDIENCES.map(({ key, label, icon: Icon }) => (
                  <button
                    key={key}
                    onClick={() => setAudience(key)}
                    className={`relative z-10 flex items-center gap-2 px-6 py-2.5 text-sm font-semibold rounded-xl transition-colors cursor-pointer ${
                      audience === key
                        ? 'text-primary-700'
                        : 'text-white/60 hover:text-white/80'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {label}
                  </button>
                ))}
              </div>
            </motion.div>

            {/* Headline */}
            <AnimatePresence mode="wait">
              <motion.div
                key={audience}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.4, ease: EASE }}
              >
                <h1 className="text-4xl sm:text-5xl xl:text-6xl font-bold font-display text-white leading-tight mb-6">
                  {content.headline}{' '}
                  <span className="bg-gradient-to-r from-secondary-400 to-secondary-300 bg-clip-text text-transparent">
                    {content.highlight}
                  </span>
                </h1>

                <p className="text-lg text-primary-100/80 leading-relaxed max-w-xl mb-8">
                  {content.sub}
                </p>

                {/* CTAs */}
                <div className="flex flex-col sm:flex-row gap-4 mb-10">
                  <Btn variant="white" size="lg" to={content.primaryCta.to}>
                    {content.primaryCta.label}
                    {content.primaryCta.icon && <content.primaryCta.icon className="w-5 h-5 ml-2" />}
                  </Btn>
                  <Btn variant="heroOutline" size="lg" to={content.secondaryCta.to}>
                    {content.secondaryCta.icon && <content.secondaryCta.icon className="w-5 h-5 mr-2" />}
                    {content.secondaryCta.label}
                  </Btn>
                </div>
              </motion.div>
            </AnimatePresence>

            {/* Trust badges */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.5, ease: EASE }}
              className="flex flex-wrap items-center gap-x-6 gap-y-3"
            >
              {trustBadges.map(({ icon: Icon, label }) => (
                <div key={label} className="flex items-center gap-2">
                  <Icon className="w-4 h-4 text-primary-300" />
                  <span className="text-xs font-medium text-primary-200/70">{label}</span>
                </div>
              ))}
            </motion.div>
          </div>

          {/* Right — Visual mockup (desktop only) */}
          <motion.div
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, delay: 0.4, ease: EASE }}
            className="hidden lg:block relative"
          >
            <div className="relative">
              {/* Main dashboard card */}
              <div className="bg-white/10 backdrop-blur-md rounded-3xl border border-white/20 p-6 shadow-2xl">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-3 h-3 rounded-full bg-red-400" />
                  <div className="w-3 h-3 rounded-full bg-yellow-400" />
                  <div className="w-3 h-3 rounded-full bg-green-400" />
                  <span className="ml-3 text-xs text-white/40 font-mono">dashboard.bestoclinic.com</span>
                </div>

                <AnimatePresence mode="wait">
                  {audience === 'clinics' ? (
                    <motion.div
                      key="clinic-mock"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.3 }}
                    >
                      <div className="space-y-4">
                        <div className="grid grid-cols-3 gap-3">
                          {[
                            { label: "Today's Appointments", value: '24', color: 'from-blue-500/20 to-blue-600/20' },
                            { label: 'Revenue (MTD)', value: '4.2L', color: 'from-emerald-500/20 to-emerald-600/20' },
                            { label: 'Active Patients', value: '1,847', color: 'from-purple-500/20 to-purple-600/20' },
                          ].map((card) => (
                            <div key={card.label} className={`bg-gradient-to-br ${card.color} rounded-xl p-3 border border-white/10`}>
                              <p className="text-[10px] text-white/50 mb-1">{card.label}</p>
                              <p className="text-lg font-bold text-white font-display">{card.value}</p>
                            </div>
                          ))}
                        </div>
                        <div className="bg-white/5 rounded-xl p-3 border border-white/10">
                          <p className="text-[10px] text-white/40 mb-2 uppercase tracking-wider">Upcoming</p>
                          {['09:00 — Dr. Nair — Ananya D. — Checkup', '09:30 — Dr. Nair — Vikram R. — Root Canal', '10:00 — Dr. Mehta — Priya S. — Consultation'].map((row) => (
                            <div key={row} className="flex items-center gap-2 py-1.5 border-b border-white/5 last:border-0">
                              <div className="w-1.5 h-1.5 rounded-full bg-secondary-400" />
                              <span className="text-[11px] text-white/60 font-mono">{row}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="patient-mock"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.3 }}
                    >
                      <div className="space-y-4">
                        <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                          <div className="flex items-center gap-3 mb-3">
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center text-white text-xs font-bold">KN</div>
                            <div>
                              <p className="text-sm font-semibold text-white">Dr. Kavitha Nair</p>
                              <p className="text-[11px] text-white/50">Orthodontist - Pearl Dental</p>
                            </div>
                            <div className="ml-auto flex items-center gap-1">
                              <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" />
                              <span className="text-xs text-white/60">4.9</span>
                            </div>
                          </div>
                          <div className="grid grid-cols-4 gap-2">
                            {['9:00', '10:30', '2:00', '4:30'].map((time) => (
                              <div key={time} className="text-center py-1.5 rounded-lg bg-white/10 text-[11px] text-white/70 border border-white/10 hover:bg-secondary-500/20 hover:border-secondary-400/30 transition-colors cursor-pointer">
                                {time}
                              </div>
                            ))}
                          </div>
                        </div>
                        <div className="bg-secondary-500/20 rounded-xl p-3 border border-secondary-400/20">
                          <div className="flex items-center gap-2">
                            <CheckCircle2 className="w-4 h-4 text-secondary-400" />
                            <span className="text-xs text-secondary-300 font-medium">Booking confirmed for Tomorrow, 10:30 AM</span>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Floating accent cards */}
              <motion.div
                initial={{ opacity: 0, x: 40, y: -20 }}
                animate={{ opacity: 1, x: 0, y: 0 }}
                transition={{ duration: 0.6, delay: 1.0, ease: EASE }}
                className="absolute -top-4 -right-4 bg-white/15 backdrop-blur-md rounded-2xl px-4 py-2.5 border border-white/20 shadow-lg"
              >
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-secondary-500/30 flex items-center justify-center">
                    <Activity className="w-3 h-3 text-secondary-300" />
                  </div>
                  <span className="text-[11px] text-white/80 font-semibold">Live: 342 Active Sessions</span>
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, x: -30, y: 20 }}
                animate={{ opacity: 1, x: 0, y: 0 }}
                transition={{ duration: 0.6, delay: 1.2, ease: EASE }}
                className="absolute -bottom-4 -left-4 bg-white/15 backdrop-blur-md rounded-2xl px-4 py-2.5 border border-white/20 shadow-lg"
              >
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-amber-500/30 flex items-center justify-center">
                    <Shield className="w-3 h-3 text-amber-300" />
                  </div>
                  <span className="text-[11px] text-white/80 font-semibold">256-bit Encrypted</span>
                </div>
              </motion.div>
            </div>
          </motion.div>
        </div>
      </div>

      {/* Stats row — inline at bottom of hero */}
      <div className="relative pb-16 lg:pb-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.6, ease: EASE }}
            className="grid grid-cols-2 md:grid-cols-4 gap-6 lg:gap-8 pt-12 lg:pt-16 border-t border-white/10"
          >
            {STATS.map(({ target, suffix, label, icon: Icon, formatAs }) => (
              <div key={label} className="text-center">
                <div className="w-10 h-10 mx-auto mb-3 rounded-xl bg-white/10 flex items-center justify-center">
                  <Icon className="w-5 h-5 text-primary-300" />
                </div>
                <p className="text-3xl lg:text-4xl font-extrabold text-white font-display tabular-nums">
                  <AnimatedCounter target={target} suffix={suffix} formatAs={formatAs} />
                </p>
                <p className="text-sm text-primary-200/60 font-medium mt-1">{label}</p>
              </div>
            ))}
          </motion.div>
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════
   SECTION 3: FEATURES GRID
   ═══════════════════════════════════════════════════════════ */

function FeaturesGrid({ audience }) {
  const features = audience === 'clinics' ? CLINIC_FEATURES : PATIENT_FEATURES;

  return (
    <section className="py-20 lg:py-28 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto text-center mb-16">
          <motion.span
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={VP}
            transition={{ duration: 0.5, ease: EASE }}
            className="inline-block px-4 py-1.5 bg-primary-50/80 text-primary-700 text-sm font-semibold rounded-full mb-4 tracking-wide uppercase border border-primary-200/40"
          >
            {audience === 'clinics' ? 'Platform Features' : 'Patient Features'}
          </motion.span>

          <AnimatePresence mode="wait">
            <motion.div
              key={audience}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              transition={{ duration: 0.35, ease: EASE }}
            >
              <h2 className="text-3xl md:text-4xl font-bold text-neutral-900 font-display mb-4 leading-tight">
                {audience === 'clinics'
                  ? 'Everything to run your practice'
                  : 'Healthcare made effortless'}
              </h2>
              <p className="text-lg text-neutral-600 leading-relaxed">
                {audience === 'clinics'
                  ? 'From scheduling to analytics, manage every aspect of your clinic from one powerful dashboard.'
                  : 'Book appointments, access records, and stay connected with your care team.'}
              </p>
            </motion.div>
          </AnimatePresence>
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={audience}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8"
          >
            {features.map((feature, i) => {
              const Icon = feature.icon;
              return (
                <motion.div
                  key={feature.title}
                  initial={{ opacity: 0, y: 24 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={VP}
                  transition={{ duration: 0.5, delay: i * 0.08, ease: EASE }}
                  whileHover={{ y: -4 }}
                  className="group bg-white rounded-2xl p-6 lg:p-8 border border-neutral-200 hover:border-primary-200 hover:shadow-lg hover:shadow-primary-100/50 transition-all duration-300"
                >
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-5 ${feature.color} group-hover:scale-110 transition-transform duration-300`}>
                    <Icon className="w-6 h-6" />
                  </div>
                  <h3 className="text-lg font-semibold text-neutral-900 font-display mb-2">{feature.title}</h3>
                  <p className="text-sm text-neutral-600 leading-relaxed">{feature.description}</p>
                </motion.div>
              );
            })}
          </motion.div>
        </AnimatePresence>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════
   SECTION 4: HOW IT WORKS
   ═══════════════════════════════════════════════════════════ */

function HowItWorksSection({ audience }) {
  const steps = audience === 'clinics' ? CLINIC_STEPS : PATIENT_STEPS;

  return (
    <section className="py-20 lg:py-28" style={{ background: 'var(--color-neutral-50)' }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto text-center mb-16">
          <motion.span
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={VP}
            transition={{ duration: 0.5, ease: EASE }}
            className="inline-block px-4 py-1.5 bg-secondary-50/80 text-secondary-700 text-sm font-semibold rounded-full mb-4 tracking-wide uppercase border border-secondary-200/40"
          >
            How It Works
          </motion.span>
          <motion.h2
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={VP}
            transition={{ duration: 0.5, delay: 0.1, ease: EASE }}
            className="text-3xl md:text-4xl font-bold text-neutral-900 font-display leading-tight"
          >
            {audience === 'clinics' ? 'Up and running in 3 steps' : 'Your health journey starts here'}
          </motion.h2>
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={audience}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="grid md:grid-cols-3 gap-8 lg:gap-12"
          >
            {steps.map((step, i) => {
              const Icon = step.icon;
              return (
                <motion.div
                  key={step.title}
                  initial={{ opacity: 0, y: 24 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={VP}
                  transition={{ duration: 0.5, delay: i * 0.15, ease: EASE }}
                  className="relative text-center"
                >
                  {i < steps.length - 1 && (
                    <div className="hidden md:block absolute top-10 left-[60%] w-[80%] h-px border-t-2 border-dashed border-neutral-300" />
                  )}
                  <span className="text-xs font-bold text-primary-500 mb-3 tracking-widest uppercase block">
                    Step {step.number}
                  </span>
                  <div className="w-16 h-16 mx-auto rounded-2xl bg-white flex items-center justify-center border border-neutral-200 shadow-sm mb-5">
                    <Icon className="w-7 h-7 text-primary-600" />
                  </div>
                  <h3 className="text-lg font-bold font-display text-neutral-900 mb-2">{step.title}</h3>
                  <p className="text-sm text-neutral-500 leading-relaxed max-w-xs mx-auto">{step.description}</p>
                </motion.div>
              );
            })}
          </motion.div>
        </AnimatePresence>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════
   SECTION 5: TESTIMONIALS
   ═══════════════════════════════════════════════════════════ */

function TestimonialsSection({ audience }) {
  const items = TESTIMONIALS[audience];

  return (
    <section className="py-20 lg:py-28 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto text-center mb-16">
          <motion.span
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={VP}
            transition={{ duration: 0.5, ease: EASE }}
            className="inline-block px-4 py-1.5 bg-amber-50/80 text-amber-700 text-sm font-semibold rounded-full mb-4 tracking-wide uppercase border border-amber-200/40"
          >
            Testimonials
          </motion.span>
          <motion.h2
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={VP}
            transition={{ duration: 0.5, delay: 0.1, ease: EASE }}
            className="text-3xl md:text-4xl font-bold text-neutral-900 font-display leading-tight"
          >
            {audience === 'clinics' ? 'Trusted by leading practices' : 'Loved by patients'}
          </motion.h2>
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={audience}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="grid md:grid-cols-3 gap-6 lg:gap-8"
          >
            {items.map((t, i) => (
              <motion.div
                key={t.name}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={VP}
                transition={{ duration: 0.5, delay: i * 0.1, ease: EASE }}
                whileHover={{ y: -4 }}
                className="bg-white rounded-2xl p-6 lg:p-8 border border-neutral-200 hover:shadow-lg hover:shadow-primary-100/30 transition-all duration-300"
              >
                <Quote className="w-8 h-8 text-primary-200 mb-4" />
                <div className="flex gap-1 mb-4">
                  {Array.from({ length: t.rating }).map((_, j) => (
                    <Star key={j} className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                  ))}
                </div>
                <p className="text-neutral-700 text-sm leading-relaxed mb-6">&ldquo;{t.text}&rdquo;</p>
                <div className="flex items-center gap-3 pt-4 border-t border-neutral-200/60">
                  <div className="w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center text-sm font-bold text-primary-700">
                    {t.name.split(' ').map((n) => n[0]).join('')}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-neutral-900">{t.name}</p>
                    <p className="text-xs text-neutral-500">{t.role} &mdash; {t.location}</p>
                  </div>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </AnimatePresence>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════
   SECTION 6: PRICING PREVIEW
   ═══════════════════════════════════════════════════════════ */

function PricingPreview() {
  const [plans, setPlans] = useState([]);
  const [billing, setBilling] = useState('annual');
  const [savings, setSavings] = useState(0);

  useEffect(() => {
    fetchPlans()
      .then((res) => {
        const raw = res.data || res;
        const sorted = Array.isArray(raw) ? raw : [];
        const transformed = sorted.map(transformPlan);
        setPlans(transformed);
        setSavings(computeAnnualSavings(transformed));
      })
      .catch(() => {});
  }, []);

  return (
    <section className="py-20 lg:py-28" style={{ background: 'var(--color-neutral-50)' }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto text-center mb-12">
          <motion.span
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={VP}
            transition={{ duration: 0.5, ease: EASE }}
            className="inline-block px-4 py-1.5 bg-primary-50/80 text-primary-700 text-sm font-semibold rounded-full mb-4 tracking-wide uppercase border border-primary-200/40"
          >
            Pricing
          </motion.span>
          <motion.h2
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={VP}
            transition={{ duration: 0.5, delay: 0.1, ease: EASE }}
            className="text-3xl md:text-4xl font-bold text-neutral-900 font-display mb-4 leading-tight"
          >
            Simple, transparent pricing
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={VP}
            transition={{ duration: 0.5, delay: 0.15, ease: EASE }}
            className="text-lg text-neutral-600 leading-relaxed"
          >
            Start free, scale as you grow. No hidden fees, cancel anytime.
          </motion.p>
        </div>

        {/* Billing toggle */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={VP}
          transition={{ duration: 0.4, delay: 0.2, ease: EASE }}
          className="flex items-center justify-center gap-3 mb-12"
        >
          <div className="relative inline-flex items-center bg-white rounded-xl p-1 border border-neutral-200 shadow-sm">
            <motion.div
              className="absolute top-1 bottom-1 rounded-lg bg-primary-600 shadow-sm"
              animate={{
                left: billing === 'monthly' ? '4px' : '50%',
                right: billing === 'monthly' ? '50%' : '4px',
              }}
              transition={{ type: 'spring', stiffness: 350, damping: 30 }}
            />
            <button
              onClick={() => setBilling('monthly')}
              className={`relative z-10 px-5 py-2 text-sm font-semibold rounded-lg transition-colors cursor-pointer ${
                billing === 'monthly' ? 'text-white' : 'text-neutral-600 hover:text-neutral-900'
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setBilling('annual')}
              className={`relative z-10 px-5 py-2 text-sm font-semibold rounded-lg transition-colors cursor-pointer ${
                billing === 'annual' ? 'text-white' : 'text-neutral-600 hover:text-neutral-900'
              }`}
            >
              Annual
            </button>
          </div>
          {savings > 0 && (
            <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200/50">
              Save {savings}%
            </span>
          )}
        </motion.div>

        <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-6 lg:gap-5">
          {plans.map((plan, i) => {
            const highlighted = isHighlightedPlan(plan.slug);
            const isFree = plan.monthlyPrice === 0;
            const displayPrice = isFree
              ? 'Free'
              : (billing === 'annual' ? plan.annualPrice : plan.monthlyPrice).toLocaleString('en-IN');
            const trialText = plan.trial?.enabled
              ? `${plan.trial.durationDays}-day free trial`
              : null;

            return (
              <motion.div
                key={plan.slug}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={VP}
                transition={{ duration: 0.5, delay: i * 0.1, ease: EASE }}
                whileHover={{ y: -4 }}
                className={`relative rounded-3xl p-7 transition-all duration-300 flex flex-col ${
                  highlighted
                    ? 'bg-gradient-to-br from-primary-600 via-primary-700 to-primary-800 text-white shadow-2xl shadow-primary-600/25 ring-2 ring-primary-400/30'
                    : 'bg-white border border-neutral-200 hover:shadow-lg hover:border-primary-200/60'
                }`}
              >
                {plan.badge && (
                  <span className={`inline-flex self-start items-center gap-1.5 px-3 py-1 text-xs font-bold rounded-full uppercase tracking-wide mb-5 ${
                    plan.badge === 'Most Popular'
                      ? 'bg-gradient-to-r from-amber-400 to-yellow-400 text-yellow-900 shadow-lg shadow-amber-400/30'
                      : 'bg-gradient-to-r from-emerald-400 to-teal-400 text-teal-900 shadow-lg shadow-emerald-400/30'
                  }`}>
                    <Sparkles className="w-3 h-3" />
                    {plan.badge}
                  </span>
                )}

                <h3 className={`text-xl font-bold font-display mb-1 ${highlighted ? 'text-white' : 'text-neutral-900'}`}>
                  {plan.name}
                </h3>
                <p className={`text-sm mb-5 ${highlighted ? 'text-primary-100' : 'text-neutral-500'}`}>
                  {plan.description}
                </p>

                <div className="mb-2">
                  {!isFree && (
                    <span className={`text-sm ${highlighted ? 'text-primary-200' : 'text-neutral-500'}`}>{'\u20B9'}</span>
                  )}
                  <span className={`text-4xl font-extrabold font-display ${highlighted ? 'text-white' : 'text-neutral-900'}`}>
                    {displayPrice}
                  </span>
                  {!isFree && (
                    <span className={`text-sm ${highlighted ? 'text-primary-200' : 'text-neutral-500'}`}>/mo</span>
                  )}
                </div>
                <p className={`text-xs mb-6 ${highlighted ? 'text-primary-200/70' : 'text-neutral-400'}`}>
                  {isFree
                    ? 'No credit card required'
                    : billing === 'annual'
                      ? 'billed annually'
                      : 'billed monthly'}
                  {trialText && !isFree ? ` \u00B7 ${trialText}` : ''}
                </p>

                <ul className="space-y-2.5 mb-8 flex-1">
                  {plan.highlights.map((f) => (
                    <li key={f} className="flex items-start gap-2.5">
                      <Check className={`w-4 h-4 mt-0.5 flex-shrink-0 ${highlighted ? 'text-secondary-300' : 'text-secondary-500'}`} />
                      <span className={`text-sm ${highlighted ? 'text-primary-50' : 'text-neutral-700'}`}>{f}</span>
                    </li>
                  ))}
                  {plan.excluded.map((f) => (
                    <li key={f} className="flex items-start gap-2.5">
                      <X className={`w-4 h-4 mt-0.5 flex-shrink-0 ${highlighted ? 'text-primary-300/40' : 'text-neutral-300'}`} />
                      <span className={`text-sm line-through ${highlighted ? 'text-primary-200/40' : 'text-neutral-400'}`}>{f}</span>
                    </li>
                  ))}
                </ul>

                <Btn
                  variant={highlighted ? 'ctaWhite' : 'primary'}
                  size="md"
                  to={plan.ctaTo}
                  className="w-full"
                >
                  {plan.cta}
                </Btn>
              </motion.div>
            );
          })}
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={VP}
          transition={{ duration: 0.5, delay: 0.4, ease: EASE }}
          className="text-center mt-10"
        >
          <Link
            to="/pricing"
            className="inline-flex items-center gap-2 text-sm font-semibold text-primary-600 hover:text-primary-700 transition-colors"
          >
            Compare all plan features
            <ArrowRight className="w-4 h-4" />
          </Link>
        </motion.div>
      </div>
    </section>
  );
}


/* ═══════════════════════════════════════════════════════════
   SECTION 7.5: CAREERS BANNER
   ═══════════════════════════════════════════════════════════ */

function CareersBanner() {
  return (
    <section className="py-20 lg:py-28 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={VP}
          transition={{ duration: 0.6, ease: EASE }}
          className="relative overflow-hidden rounded-3xl border border-neutral-200"
          style={{ background: 'linear-gradient(135deg, var(--color-neutral-50) 0%, #eef2ff 50%, var(--color-neutral-50) 100%)' }}
        >
          <div className="absolute top-0 right-0 w-80 h-80 bg-primary-100/40 rounded-full blur-3xl pointer-events-none -translate-y-1/2 translate-x-1/4" />
          <div className="absolute bottom-0 left-0 w-60 h-60 bg-secondary-100/30 rounded-full blur-3xl pointer-events-none translate-y-1/3 -translate-x-1/4" />

          <div className="relative grid md:grid-cols-2 gap-10 items-center p-10 lg:p-16">
            {/* Left — Content */}
            <div>
              <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-primary-100/60 text-primary-700 text-sm font-semibold rounded-full mb-6 border border-primary-200/40">
                <Briefcase className="w-4 h-4" />
                Career Portal
              </div>
              <h2 className="text-3xl md:text-4xl font-bold text-neutral-900 font-display mb-4 leading-tight">
                Find your next
                <span className="bg-gradient-to-r from-primary-600 to-primary-500 bg-clip-text text-transparent"> healthcare career</span>
              </h2>
              <p className="text-lg text-neutral-600 leading-relaxed mb-8">
                Browse open positions at top dental clinics across India. From dentists to dental assistants, receptionists to practice managers — discover opportunities that match your skills.
              </p>
              <div className="flex flex-col sm:flex-row gap-4">
                <Btn variant="primary" size="md" to="/careers">
                  Browse Open Positions
                  <ArrowRight className="w-5 h-5 ml-2" />
                </Btn>
              </div>
            </div>

            {/* Right — Feature highlights */}
            <div className="space-y-4">
              {[
                { icon: Search, title: 'Smart Job Search', description: 'Filter by specialty, location, experience level, and employment type.' },
                { icon: Briefcase, title: 'Quick Apply', description: 'Apply directly from the job page — no account needed. Just fill in your details and submit.' },
                { icon: FileText, title: 'Resume Upload', description: 'Attach your resume and cover letter so the hiring team can review your profile instantly.' },
                { icon: Building2, title: 'Top Clinics', description: 'Connect directly with verified dental practices across 100+ cities.' },
              ].map((item, i) => {
                const Icon = item.icon;
                return (
                  <motion.div
                    key={item.title}
                    initial={{ opacity: 0, x: 20 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={VP}
                    transition={{ duration: 0.4, delay: i * 0.1, ease: EASE }}
                    className="flex items-start gap-4 p-4 bg-white/80 backdrop-blur-sm rounded-2xl border border-neutral-200/60 hover:shadow-md transition-shadow"
                  >
                    <div className="w-10 h-10 rounded-xl bg-primary-50 flex items-center justify-center flex-shrink-0">
                      <Icon className="w-5 h-5 text-primary-600" />
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-neutral-900 mb-0.5">{item.title}</h4>
                      <p className="text-xs text-neutral-500 leading-relaxed">{item.description}</p>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════
   SECTION 8: FAQ
   ═══════════════════════════════════════════════════════════ */

function FAQSection() {
  const [openIndex, setOpenIndex] = useState(null);
  const toggle = (i) => setOpenIndex(openIndex === i ? null : i);

  return (
    <section className="py-20 lg:py-28" style={{ background: 'var(--color-neutral-50)' }}>
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <motion.span
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={VP}
            transition={{ duration: 0.5, ease: EASE }}
            className="inline-block px-4 py-1.5 bg-primary-50/80 text-primary-700 text-sm font-semibold rounded-full mb-4 tracking-wide uppercase border border-primary-200/40"
          >
            FAQ
          </motion.span>
          <motion.h2
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={VP}
            transition={{ duration: 0.5, delay: 0.1, ease: EASE }}
            className="text-3xl md:text-4xl font-bold text-neutral-900 font-display leading-tight"
          >
            Frequently asked questions
          </motion.h2>
        </div>

        <div className="space-y-4">
          {FAQS.map((faq, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={VP}
              transition={{ duration: 0.4, delay: i * 0.05, ease: EASE }}
              className="border border-neutral-200 rounded-2xl overflow-hidden bg-white"
            >
              <button
                onClick={() => toggle(i)}
                className="w-full flex items-center justify-between p-6 text-left cursor-pointer hover:bg-neutral-50/50 transition-colors"
              >
                <span className="text-base font-semibold text-neutral-900 pr-4">{faq.q}</span>
                <motion.div
                  animate={{ rotate: openIndex === i ? 45 : 0 }}
                  transition={{ duration: 0.2 }}
                  className="flex-shrink-0"
                >
                  <Plus className="w-5 h-5 text-primary-600" />
                </motion.div>
              </button>
              <AnimatePresence>
                {openIndex === i && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3, ease: EASE }}
                    className="overflow-hidden"
                  >
                    <div className="px-6 pb-6 text-sm text-neutral-600 leading-relaxed">{faq.a}</div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════
   SECTION 9: FINAL CTA
   ═══════════════════════════════════════════════════════════ */

function FinalCTA({ audience }) {
  return (
    <section className="py-20 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={VP}
          transition={{ duration: 0.6, ease: EASE }}
          className="relative overflow-hidden rounded-3xl p-10 lg:p-16 text-center"
          style={{ background: 'linear-gradient(to bottom right, var(--color-primary-600), var(--color-primary-700), var(--color-primary-800))' }}
        >
          <div className="absolute top-0 right-0 w-64 h-64 bg-primary-500/20 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-48 h-48 bg-primary-400/20 rounded-full blur-3xl pointer-events-none" />

          <div className="relative">
            <AnimatePresence mode="wait">
              <motion.div
                key={audience}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.3 }}
              >
                <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold font-display text-white mb-4 leading-tight">
                  {audience === 'clinics'
                    ? 'Ready to modernize your practice?'
                    : 'Ready to take control of your health?'}
                </h2>
                <p className="text-lg text-primary-100 max-w-2xl mx-auto mb-8 leading-relaxed">
                  {audience === 'clinics'
                    ? 'Join clinics across India switching to BestoClinic. Start with our free plan or try any paid plan with a free trial — no credit card required.'
                    : 'Join patients who found their perfect dental care on BestoClinic. Sign up for free today.'}
                </p>
              </motion.div>
            </AnimatePresence>

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Btn variant="ctaWhite" size="lg" to={audience === 'clinics' ? '/register' : '/browse'}>
                {audience === 'clinics' ? 'Start Free Trial' : 'Find a Doctor'}
                <ArrowRight className="w-5 h-5 ml-2" />
              </Btn>
              <Btn variant="heroOutline" size="lg" to="/contact">
                {audience === 'clinics' ? 'Contact Sales' : 'Contact Us'}
              </Btn>
            </div>

            <p className="text-sm text-primary-200 mt-6">
              {audience === 'clinics'
                ? 'No credit card required \u00b7 Free plan available \u00b7 Cancel anytime'
                : 'Free forever \u00b7 One account for all clinics \u00b7 No hidden fees'}
            </p>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════
   FOOTER (self-contained)
   ═══════════════════════════════════════════════════════════ */

function LandingFooter() {
  const footerSections = [
    {
      title: 'Product',
      links: [
        { label: 'Features', to: '/features' },
        { label: 'Pricing', to: '/pricing' },
        { label: 'Telemedicine', to: '/features' },
        { label: 'Integrations', to: '/features' },
      ],
    },
    {
      title: 'Company',
      links: [
        { label: 'About Us', to: '/about' },
        { label: 'Blog', to: '/blog' },
        { label: 'Careers', to: '/careers' },
        { label: 'Contact', to: '/contact' },
      ],
    },
    {
      title: 'Resources',
      links: [
        { label: 'Help Center', to: '/contact' },
        { label: 'API Docs', to: '/contact' },
        { label: 'Status Page', to: '/contact' },
        { label: 'Security', to: '/features' },
      ],
    },
    {
      title: 'Legal',
      links: [
        { label: 'Privacy Policy', to: '/about' },
        { label: 'Terms of Service', to: '/about' },
        { label: 'HIPAA Compliance', to: '/about' },
        { label: 'Cookie Policy', to: '/about' },
      ],
    },
  ];

  const socials = [
    { icon: Facebook, href: '#' },
    { icon: Twitter, href: '#' },
    { icon: Linkedin, href: '#' },
    { icon: Instagram, href: '#' },
  ];

  return (
    <footer className="bg-neutral-950 text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 lg:pt-20 pb-10">
        {/* Top: Logo + newsletter + links */}
        <div className="grid lg:grid-cols-6 gap-12 lg:gap-8 mb-12 lg:mb-16">
          {/* Brand column */}
          <div className="lg:col-span-2">
            <Link to="/" className="flex items-center gap-2.5 mb-5">
              <img src="/platform_admin/logo/Besto Clinic Logo.svg" alt="BestoClinic" className="w-9 h-9" />
              <span className="text-xl font-bold font-display tracking-tight text-white">
                Besto<span className="text-secondary-400">Clinic</span>
              </span>
            </Link>
            <p className="text-sm text-neutral-400 leading-relaxed mb-6 max-w-sm">
              The modern cloud platform for dental clinics and patients. Scheduling, billing, telemedicine, and more — all in one place.
            </p>
            <div className="flex items-center gap-3">
              {socials.map(({ icon: Icon, href }, i) => (
                <a
                  key={i}
                  href={href}
                  className="w-9 h-9 rounded-xl bg-neutral-800 hover:bg-neutral-700 flex items-center justify-center text-neutral-400 hover:text-white transition-colors"
                >
                  <Icon className="w-4 h-4" />
                </a>
              ))}
            </div>
          </div>

          {/* Link columns */}
          {footerSections.map((section) => (
            <div key={section.title}>
              <h4 className="text-sm font-semibold text-neutral-200 uppercase tracking-wider mb-4">
                {section.title}
              </h4>
              <ul className="space-y-2.5">
                {section.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      to={link.to}
                      className="text-sm text-neutral-400 hover:text-white transition-colors"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom bar */}
        <div className="pt-8 border-t border-neutral-800 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-neutral-500">
            &copy; {new Date().getFullYear()} BestoClinic. All rights reserved.
          </p>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2 text-xs text-neutral-500">
              <Shield className="w-3.5 h-3.5" />
              <span>AES-256 Encrypted</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-neutral-500">
              <Shield className="w-3.5 h-3.5" />
              <span>Isolated Databases</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-neutral-500">
              <Shield className="w-3.5 h-3.5" />
              <span>Full Audit Trails</span>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}

/* ═══════════════════════════════════════════════════════════
   LANDING PAGE — DEFAULT EXPORT
   ═══════════════════════════════════════════════════════════ */

export default function LandingPage() {
  const [audience, setAudience] = useState('patients');

  useSEO(
    audience === 'clinics'
      ? {
          title: 'Modern Clinic Management Software | BestoClinic',
          description: 'Cloud-based clinic management platform. Scheduling, billing, telemedicine, multi-branch — all in one place.',
          keywords: 'clinic management software, dental SaaS, practice management, healthcare ERP',
        }
      : {
          title: 'Find & Book the Best Healthcare Near You | BestoClinic',
          description: 'Search top-rated doctors, book appointments instantly, and manage your health records online.',
          keywords: 'find doctor, book appointment, dental clinic near me, healthcare platform',
        }
  );

  return (
    <div className="min-h-screen bg-white" style={{ fontFamily: "'Inter', system-ui, -apple-system, sans-serif" }}>
      <LandingNavbar />
      <HeroSection audience={audience} setAudience={setAudience} />
      <FeaturesGrid audience={audience} />
      <HowItWorksSection audience={audience} />
      <TestimonialsSection audience={audience} />
      {audience === 'clinics' && <PricingPreview />}
      <CareersBanner />
      <FAQSection />
      <FinalCTA audience={audience} />
      <LandingFooter />
      <ChatbotController />
    </div>
  );
}
