import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import SEO from '../components/common/SEO';
import Btn from '../components/common/Btn';
import { EASE, VP } from '../components/common/designSystem';
import PricingToggle from '../components/pricing/PricingToggle';
import PricingCard from '../components/pricing/PricingCard';
import ComparisonTable from '../components/pricing/ComparisonTable';
import { fetchPlans } from '../api/publicApi';
import { transformPlan, buildComparisonData, computeAnnualSavings } from '../data/pricing';
import { CheckCircle2, ArrowRight, Loader2 } from 'lucide-react';

export default function Pricing() {
  const [annual, setAnnual] = useState(true);
  const [plans, setPlans] = useState([]);
  const [comparisonData, setComparisonData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function loadPlans() {
      try {
        const res = await fetchPlans();
        if (cancelled) return;

        const raw = res.data || res;
        const sorted = Array.isArray(raw) ? raw : [];

        setPlans(sorted.map(transformPlan));
        setComparisonData(buildComparisonData(sorted));
      } catch (err) {
        if (!cancelled) setError(err.message || 'Failed to load plans');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadPlans();
    return () => { cancelled = true; };
  }, []);

  const savingsPercent = useMemo(() => computeAnnualSavings(plans), [plans]);

  const guarantees = useMemo(() => {
    const items = [];
    const hasTrials = plans.some((p) => p.trial?.enabled);
    const hasFree = plans.some((p) => p.monthlyPrice === 0);

    if (hasTrials) items.push('Free trial on paid plans');
    if (hasFree) items.push('No credit card required');
    items.push('Cancel anytime');
    items.push('Free migration assistance');
    return items;
  }, [plans]);

  return (
    <>
      <SEO
        title="Pricing"
        description="Simple, transparent pricing for clinics of all sizes. Start free and scale as you grow."
        keywords="clinic software pricing, clinic management cost, clinic SaaS pricing"
      />

      {/* Hero */}
      <section
        className="relative overflow-hidden"
        style={{ background: 'linear-gradient(135deg, var(--color-primary-700) 0%, var(--color-primary-950) 100%)' }}
      >
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/4 right-0 w-[600px] h-[600px] bg-primary-500/10 rounded-full blur-[120px]" />
        </div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-36 lg:pt-44 pb-20 lg:pb-24 text-center">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: EASE }}
          >
            <span className="inline-block px-4 py-1.5 bg-white/10 text-white text-sm font-semibold rounded-full mb-6 tracking-wide uppercase border border-white/20">
              Pricing
            </span>
            <h1 className="text-4xl sm:text-5xl xl:text-6xl font-bold font-display text-white leading-tight mb-6">
              Simple, transparent pricing
            </h1>
            <p className="text-lg text-primary-100/80 leading-relaxed max-w-2xl mx-auto mb-10">
              Start free and scale as you grow. Choose the plan that fits your practice.
            </p>

            {!loading && !error && plans.length > 0 && (
              <PricingToggle annual={annual} setAnnual={setAnnual} savingsPercent={savingsPercent} variant="dark" />
            )}
          </motion.div>
        </div>
      </section>

      {/* Cards */}
      <section className="relative pb-20 -mt-4 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <Loader2 className="w-8 h-8 text-primary-500 animate-spin" />
              <p className="text-sm text-neutral-400">Loading plans...</p>
            </div>
          ) : error ? (
            <div className="text-center py-20">
              <p className="text-red-600 mb-4">{error}</p>
              <Btn onClick={() => window.location.reload()} size="sm" variant="outline">
                Retry
              </Btn>
            </div>
          ) : (
            <>
              <div className={`grid gap-6 lg:gap-5 items-start ${
                plans.length <= 3 ? 'md:grid-cols-2 lg:grid-cols-3' : 'md:grid-cols-2 lg:grid-cols-4'
              }`}>
                {plans.map((plan, i) => (
                  <PricingCard key={plan.slug} plan={plan} annual={annual} index={i} />
                ))}
              </div>

              {/* Guarantees */}
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: 0.3 }}
                className="mt-16 flex flex-wrap justify-center gap-x-8 gap-y-3"
              >
                {guarantees.map((item) => (
                  <span key={item} className="flex items-center gap-2 text-sm text-neutral-500">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    {item}
                  </span>
                ))}
              </motion.div>
            </>
          )}
        </div>
      </section>

      {/* Comparison Table */}
      {!loading && !error && plans.length > 0 && (
        <section className="py-8 pb-24 bg-neutral-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <ComparisonTable plans={plans} comparisonData={comparisonData} />

            {/* Bottom CTA */}
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={VP}
              transition={{ duration: 0.5, ease: EASE }}
              className="mt-16"
            >
              <div className="bg-gradient-to-br from-primary-600 via-primary-700 to-primary-800 rounded-3xl p-10 lg:p-14 text-center relative overflow-hidden">
                <div className="absolute inset-0 pointer-events-none">
                  <div className="absolute top-0 right-0 w-80 h-80 bg-white/5 rounded-full blur-3xl" />
                </div>
                <div className="relative">
                  <h3 className="text-2xl font-bold font-display text-white mb-3">
                    Not sure which plan is right?
                  </h3>
                  <p className="text-primary-100/80 mb-8 max-w-lg mx-auto">
                    Talk to our team and we'll help you find the perfect fit for your practice size and needs.
                  </p>
                  <div className="flex flex-col sm:flex-row gap-4 justify-center">
                    <Btn variant="ctaWhite" to="/register">
                      Start Free Trial <ArrowRight className="w-4 h-4 ml-2" />
                    </Btn>
                    <Btn variant="heroOutline" to="/contact">Contact Sales</Btn>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </section>
      )}
    </>
  );
}
