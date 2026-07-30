import { motion } from 'framer-motion';
import { CheckCircle2, Stethoscope, Building2, ArrowRight } from 'lucide-react';
import SEO from '../components/common/SEO';
import Btn from '../components/common/Btn';
import AnimatedCounter from '../components/common/AnimatedCounter';
import { EASE, VP } from '../components/common/designSystem';

const STATS = [
  { target: 30, suffix: '+', label: 'Clinics Onboarded' },
  { target: 2, suffix: 'K+', label: 'Appointments Managed' },
  { target: 99.9, suffix: '%', label: 'Platform Uptime', formatAs: 'decimal' },
  { target: 35, suffix: '%', label: 'Fewer No-Shows' },
];

const VALUES = [
  {
    title: 'Transparency',
    description: 'No hidden fees, no fine print, no surprises. Every feature, every price, every policy is clear from day one. We believe you should always know exactly what you\'re getting.',
  },
  {
    title: 'Trust',
    description: 'Your patients trust you with their health. You should be able to trust your software with your data. Enterprise-grade security isn\'t optional — it\'s the foundation of everything we build.',
  },
  {
    title: 'Simplicity',
    description: 'Technology should remove friction from healthcare, not add it. Every feature starts with the question: does this make life easier for dentists and their patients?',
  },
];

export default function AboutUs() {
  return (
    <>
      <SEO
        title="About BestoClinic"
        description="Learn how BestoClinic is transforming dental practice management across India."
        keywords="about bestoclinic, dental practice management, dental SaaS India"
      />

      {/* Hero */}
      <section
        className="relative overflow-hidden"
        style={{ background: 'linear-gradient(135deg, var(--color-primary-700) 0%, var(--color-primary-950) 100%)' }}
      >
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/4 right-0 w-[600px] h-[600px] bg-primary-500/10 rounded-full blur-[120px]" />
        </div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-36 lg:pt-44 pb-28 lg:pb-36">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: EASE }}
            className="max-w-4xl mx-auto text-center"
          >
            <h1 className="text-5xl sm:text-6xl xl:text-7xl font-bold font-display text-white leading-[1.05] tracking-tight mb-6">
              Making quality dental care{' '}
              <span className="bg-gradient-to-r from-primary-200 to-primary-300 bg-clip-text text-transparent">
                accessible to everyone
              </span>
            </h1>
            <p className="text-xl text-primary-100/80 leading-relaxed max-w-2xl mx-auto">
              BestoClinic is a modern dental platform that connects patients with trusted dentists
              and empowers clinics with powerful practice management tools.
            </p>
          </motion.div>

          {/* Stats Row */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3, ease: EASE }}
            className="grid grid-cols-2 md:grid-cols-4 gap-6 lg:gap-8 mt-16 pt-12 border-t border-white/10"
          >
            {STATS.map((stat) => (
              <div key={stat.label} className="text-center">
                <div className="text-3xl lg:text-4xl font-extrabold font-display text-white mb-1">
                  <AnimatedCounter target={stat.target} suffix={stat.suffix} formatAs={stat.formatAs} />
                </div>
                <div className="text-sm text-primary-200/60 font-medium">{stat.label}</div>
              </div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Value Statements */}
      <section className="py-20 lg:py-28 bg-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          {VALUES.map((value, i) => (
            <motion.div
              key={value.title}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={VP}
              transition={{ duration: 0.5, delay: i * 0.1, ease: EASE }}
              className={`py-14 lg:py-16 text-center ${i < VALUES.length - 1 ? 'border-b border-neutral-200' : ''}`}
            >
              <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold font-display text-neutral-900 leading-tight mb-6">
                {value.title}
              </h2>
              <p className="text-lg text-neutral-600 leading-relaxed max-w-2xl mx-auto">
                {value.description}
              </p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Two Audiences */}
      <section className="py-20 lg:py-28 bg-neutral-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={VP}
            transition={{ duration: 0.5, ease: EASE }}
            className="text-center mb-16"
          >
            <span className="inline-block px-4 py-1.5 bg-primary-50/80 text-primary-700 text-sm font-semibold rounded-full mb-4 tracking-wide uppercase border border-primary-200/40">
              What We Do
            </span>
            <h2 className="text-3xl md:text-4xl font-bold text-neutral-900 font-display leading-tight">
              Two sides, one platform
            </h2>
          </motion.div>

          <div className="grid md:grid-cols-2 gap-8">
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={VP}
              transition={{ duration: 0.5, ease: EASE }}
              className="bg-white rounded-2xl p-8 lg:p-10 border border-neutral-200 hover:border-primary-200 hover:shadow-lg hover:shadow-primary-100/50 transition-all duration-300"
            >
              <div className="w-14 h-14 rounded-2xl bg-emerald-50 flex items-center justify-center mb-6">
                <Stethoscope className="w-7 h-7 text-emerald-600" />
              </div>
              <h3 className="text-2xl font-bold font-display text-neutral-900 mb-3">For Patients</h3>
              <p className="text-neutral-600 mb-6">
                Find trusted dentists, book appointments instantly, and manage your dental health — all from one platform.
              </p>
              <div className="space-y-3">
                {[
                  'Search by specialization or location',
                  'View ratings, reviews, and availability',
                  'Book appointments instantly',
                  'Get reminders and track treatment history',
                ].map((item) => (
                  <div key={item} className="flex items-center gap-2.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span className="text-sm text-neutral-600">{item}</span>
                  </div>
                ))}
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={VP}
              transition={{ duration: 0.5, delay: 0.1, ease: EASE }}
              className="bg-white rounded-2xl p-8 lg:p-10 border border-neutral-200 hover:border-primary-200 hover:shadow-lg hover:shadow-primary-100/50 transition-all duration-300"
            >
              <div className="w-14 h-14 rounded-2xl bg-primary-50 flex items-center justify-center mb-6">
                <Building2 className="w-7 h-7 text-primary-600" />
              </div>
              <h3 className="text-2xl font-bold font-display text-neutral-900 mb-3">For Clinics</h3>
              <p className="text-neutral-600 mb-6">
                Modern cloud-based practice management that handles scheduling, billing, patient records, and multi-branch operations.
              </p>
              <div className="space-y-3">
                {[
                  'Smart scheduling and queue management',
                  'Billing, invoicing, and insurance claims',
                  'Multi-branch dashboard and analytics',
                  'HIPAA-compliant patient data security',
                ].map((item) => (
                  <div key={item} className="flex items-center gap-2.5">
                    <CheckCircle2 className="w-4 h-4 text-primary-600 shrink-0" />
                    <span className="text-sm text-neutral-600">{item}</span>
                  </div>
                ))}
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* CTA Banner */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={VP}
            transition={{ duration: 0.5, ease: EASE }}
            className="bg-gradient-to-br from-primary-600 via-primary-700 to-primary-800 rounded-3xl p-10 lg:p-16 text-center relative overflow-hidden"
          >
            <div className="absolute inset-0 pointer-events-none">
              <div className="absolute top-0 right-0 w-80 h-80 bg-white/5 rounded-full blur-3xl" />
            </div>
            <div className="relative">
              <h2 className="text-3xl md:text-4xl font-bold font-display text-white mb-4">
                Join the future of dental care
              </h2>
              <p className="text-primary-100/80 text-lg max-w-xl mx-auto mb-8">
                Whether you're a patient looking for care or a clinic ready to modernize — BestoClinic is built for you.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Btn variant="ctaWhite" to="/register">
                  Get Started <ArrowRight className="w-4 h-4 ml-2" />
                </Btn>
                <Btn variant="heroOutline" to="/contact">Contact Us</Btn>
              </div>
            </div>
          </motion.div>
        </div>
      </section>
    </>
  );
}
