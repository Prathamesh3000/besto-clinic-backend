import { Link, useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import { motion } from 'framer-motion';
import SEO from '../components/common/SEO';
import {
  Building2, Heart, ArrowRight, CalendarDays, FileText,
  Stethoscope, Users, Shield,
} from 'lucide-react';

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: (i = 0) => ({
    opacity: 1, y: 0,
    transition: { delay: i * 0.1, duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] },
  }),
};

const cards = [
  {
    to: '/clinic/login',
    icon: Building2,
    gradient: 'from-primary-500 to-primary-700',
    shadow: 'shadow-primary-600/20',
    hoverBorder: 'hover:border-primary-200/60',
    color: 'text-primary-600',
    iconColor: 'text-primary-500',
    title: 'Clinic Staff',
    desc: 'For doctors, administrators, receptionists, and all clinic staff members.',
    features: [
      { icon: CalendarDays, text: 'Manage appointments & schedules' },
      { icon: Users, text: 'Patient records & billing' },
      { icon: Stethoscope, text: 'Clinical workflows & prescriptions' },
    ],
    cta: 'Sign in to Clinic Portal',
  },
  {
    to: '/patient/login',
    icon: Heart,
    gradient: 'from-emerald-500 to-emerald-700',
    shadow: 'shadow-emerald-600/20',
    hoverBorder: 'hover:border-emerald-200/60',
    color: 'text-emerald-600',
    iconColor: 'text-emerald-500',
    title: 'Patient Portal',
    desc: 'For patients and guardians to manage appointments, records, and payments.',
    features: [
      { icon: CalendarDays, text: 'Book & manage appointments' },
      { icon: FileText, text: 'View prescriptions & records' },
      { icon: Shield, text: 'Secure health data access' },
    ],
    cta: 'Sign in to Patient Portal',
  },
];

export default function Login() {
  const navigate = useNavigate();

  // Auto-redirect if already authenticated
  useEffect(() => {
    const token = localStorage.getItem('tenant_token');
    const stored = localStorage.getItem('tenant_user');
    if (token && stored) {
      try {
        const u = JSON.parse(stored);
        if (['patient', 'guardian'].includes(u.role)) navigate('/patient', { replace: true });
        else if (u.role === 'doctor') navigate('/clinic/doctor-dashboard', { replace: true });
        else navigate('/clinic', { replace: true });
      } catch { /* ignore */ }
      return;
    }
    if (localStorage.getItem('platform_token')) {
      navigate('/platform', { replace: true });
    }
  }, [navigate]);

  return (
    <>
      <SEO title="Sign In" description="Sign in to your BestoClinic account." />

      <div className="min-h-screen flex flex-col bg-gradient-to-b from-neutral-100 via-neutral-50 to-white">
        {/* Header */}
        <header className="p-6 lg:p-8">
          <Link to="/" className="inline-flex items-center gap-2.5">
            <img src="/platform_admin/logo/Besto Clinic Logo.svg" alt="BestoClinic" className="w-9 h-9" />
            <span className="text-xl font-bold text-neutral-900">
              Besto<span className="text-secondary-500">Clinic</span>
            </span>
          </Link>
        </header>

        {/* Center content */}
        <div className="flex-1 flex items-center justify-center px-4 pb-16">
          <div className="max-w-3xl w-full">
            {/* Heading */}
            <motion.div variants={fadeUp} initial="hidden" animate="visible" className="text-center mb-12">
              <h1 className="text-3xl lg:text-4xl font-bold font-display text-neutral-900 mb-3">
                Welcome to BestoClinic
              </h1>
              <p className="text-neutral-900/50 text-lg">Choose how you'd like to sign in</p>
            </motion.div>

            {/* Two cards */}
            <div className="grid md:grid-cols-2 gap-6">
              {cards.map((card, i) => (
                <motion.div key={card.to} variants={fadeUp} initial="hidden" animate="visible" custom={i + 1}>
                  <Link
                    to={card.to}
                    className={`block group bg-white/70 backdrop-blur-xl rounded-2xl border border-neutral-300/60 shadow-[var(--shadow-lg)] p-8 hover:shadow-[var(--shadow-xl)] ${card.hoverBorder} transition-all duration-300`}
                  >
                    <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${card.gradient} flex items-center justify-center mb-6 shadow-lg ${card.shadow}`}>
                      <card.icon className="w-7 h-7 text-white" />
                    </div>
                    <h2 className="text-xl font-bold font-display text-neutral-900 mb-2">{card.title}</h2>
                    <p className="text-sm text-neutral-900/50 mb-6 leading-relaxed">{card.desc}</p>

                    <div className="space-y-2.5 mb-8">
                      {card.features.map(({ icon: Icon, text }) => (
                        <div key={text} className="flex items-center gap-2.5">
                          <Icon className={`w-4 h-4 ${card.iconColor} shrink-0`} />
                          <span className="text-xs text-neutral-900/40">{text}</span>
                        </div>
                      ))}
                    </div>

                    <div className={`flex items-center gap-2 ${card.color} font-semibold text-sm group-hover:gap-3 transition-all`}>
                      {card.cta} <ArrowRight className="w-4 h-4" />
                    </div>
                  </Link>
                </motion.div>
              ))}
            </div>

            {/* Bottom links */}
            <motion.div variants={fadeUp} initial="hidden" animate="visible" custom={3} className="text-center mt-8 space-y-3">
              <div className="flex items-center justify-center gap-4 text-sm text-neutral-900/40">
                <Link to="/patient/register" className="text-emerald-600 hover:text-emerald-700 font-semibold">
                  Register as patient
                </Link>
                <span>&middot;</span>
                <Link to="/register" className="text-primary-600 hover:text-primary-700 font-semibold">
                  Register your clinic
                </Link>
              </div>
            </motion.div>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-neutral-900/30 pb-6">
          &copy; {new Date().getFullYear()} BestoClinic. All rights reserved.
        </p>
      </div>
    </>
  );
}
