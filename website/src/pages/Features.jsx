import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, CheckCircle2 } from 'lucide-react';
import SEO from '../components/common/SEO';
import Btn from '../components/common/Btn';
import { EASE, VP } from '../components/common/designSystem';
import { featureDetails, featureCategories } from '../data/features';

const ICON_COLORS = {
  Clinical: { bg: 'bg-blue-50', text: 'text-blue-600' },
  Operations: { bg: 'bg-amber-50', text: 'text-amber-600' },
  Security: { bg: 'bg-emerald-50', text: 'text-emerald-600' },
};

export default function Features() {
  const [activeTab, setActiveTab] = useState('all');

  const filtered = activeTab === 'all'
    ? featureDetails
    : featureDetails.filter((f) => f.category === activeTab);

  return (
    <>
      <SEO
        title="Features"
        description="Explore BestoClinic's comprehensive dental practice management features — scheduling, billing, telemedicine, multi-branch, and more."
        keywords="dental features, appointment scheduling, dental billing, telemedicine, multi-branch management"
      />

      {/* Hero */}
      <section
        className="relative overflow-hidden"
        style={{ background: 'linear-gradient(135deg, var(--color-primary-700) 0%, var(--color-primary-950) 100%)' }}
      >
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/4 right-0 w-[600px] h-[600px] bg-primary-500/10 rounded-full blur-[120px]" />
          <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-primary-400/10 rounded-full blur-[100px]" />
        </div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-36 lg:pt-44 pb-20 lg:pb-24">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: EASE }}
            className="max-w-3xl"
          >
            <span className="inline-block px-4 py-1.5 bg-white/10 text-white text-sm font-semibold rounded-full mb-6 tracking-wide uppercase border border-white/20">
              Platform Features
            </span>
            <h1 className="text-4xl sm:text-5xl xl:text-6xl font-bold font-display text-white leading-tight mb-6">
              Everything you need to run a{' '}
              <span className="bg-gradient-to-r from-primary-200 to-primary-300 bg-clip-text text-transparent">
                modern clinic
              </span>
            </h1>
            <p className="text-lg text-primary-100/80 leading-relaxed max-w-2xl mb-8">
              From appointment scheduling to multi-branch management, BestoClinic provides a complete suite of tools designed specifically for dental professionals.
            </p>
            <div className="flex flex-wrap gap-4">
              <Btn variant="ctaWhite" to="/register">
                Start Free Trial <ArrowRight className="w-4 h-4 ml-2" />
              </Btn>
              <Btn variant="heroOutline" to="/pricing">View Pricing</Btn>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Tab Bar */}
      <div className="sticky top-16 lg:top-20 z-40 bg-white border-b border-neutral-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-1 py-3 overflow-x-auto scrollbar-hide">
            {featureCategories.map((cat) => (
              <button
                key={cat.key}
                onClick={() => setActiveTab(cat.key)}
                className={`relative px-5 py-2.5 text-sm font-semibold rounded-xl transition-colors whitespace-nowrap cursor-pointer ${
                  activeTab === cat.key
                    ? 'bg-primary-50 text-primary-700'
                    : 'text-neutral-500 hover:text-neutral-700 hover:bg-neutral-50'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Feature Cards Grid */}
      <section className="py-20 lg:py-28 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              transition={{ duration: 0.3, ease: EASE }}
              className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8"
            >
              {filtered.map((feature, i) => {
                const Icon = feature.icon;
                const colors = ICON_COLORS[feature.category] || ICON_COLORS.Clinical;
                return (
                  <motion.div
                    key={feature.id}
                    initial={{ opacity: 0, y: 24 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={VP}
                    transition={{ duration: 0.5, delay: i * 0.08, ease: EASE }}
                    whileHover={{ y: -4 }}
                    className="group bg-white rounded-2xl p-6 lg:p-8 border border-neutral-200 hover:border-primary-200 hover:shadow-lg hover:shadow-primary-100/50 transition-all duration-300"
                  >
                    <div className={`w-12 h-12 rounded-xl ${colors.bg} flex items-center justify-center mb-5`}>
                      <Icon className={`w-6 h-6 ${colors.text} group-hover:scale-110 transition-transform duration-300`} />
                    </div>
                    <span className="inline-block px-2.5 py-1 bg-neutral-100 text-neutral-500 text-xs font-medium rounded-md mb-3">
                      {feature.category}
                    </span>
                    <h3 className="text-lg font-semibold text-neutral-900 font-display mb-2">{feature.title}</h3>
                    <p className="text-sm text-neutral-600 leading-relaxed mb-4">{feature.description}</p>
                    <ul className="space-y-2">
                      {feature.benefits.slice(0, 3).map((b) => (
                        <li key={b} className="flex items-start gap-2 text-sm text-neutral-600">
                          <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                          {b}
                        </li>
                      ))}
                      {feature.benefits.length > 3 && (
                        <li className="text-xs text-neutral-400 pl-6">
                          +{feature.benefits.length - 3} more capabilities
                        </li>
                      )}
                    </ul>
                  </motion.div>
                );
              })}
            </motion.div>
          </AnimatePresence>
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
              <div className="absolute bottom-0 left-0 w-60 h-60 bg-white/5 rounded-full blur-3xl" />
            </div>
            <div className="relative">
              <h2 className="text-3xl md:text-4xl font-bold font-display text-white mb-4">
                Ready to transform your practice?
              </h2>
              <p className="text-primary-100/80 text-lg max-w-xl mx-auto mb-8">
                Join the clinics already using BestoClinic. Start your free trial today — no credit card required.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Btn variant="ctaWhite" to="/register">
                  Start Free Trial <ArrowRight className="w-4 h-4 ml-2" />
                </Btn>
                <Btn variant="heroOutline" to="/contact">Talk to Sales</Btn>
              </div>
            </div>
          </motion.div>
        </div>
      </section>
    </>
  );
}
