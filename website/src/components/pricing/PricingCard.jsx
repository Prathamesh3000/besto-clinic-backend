import { motion } from 'framer-motion';
import { Check, X, Sparkles } from 'lucide-react';
import Btn from '../common/Btn';

export default function PricingCard({ plan, annual, index = 0 }) {
  const price = annual ? plan.annualPrice : plan.monthlyPrice;
  const isFree = plan.monthlyPrice === 0;
  const isEnterprise = plan.tier >= 30;
  const hasBadge = !!plan.badge;

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 0.5, delay: index * 0.1, ease: [0.25, 0.46, 0.45, 0.94] }}
      whileHover={{ y: -6 }}
      className={`relative rounded-3xl flex flex-col transition-shadow duration-300 ${
        hasBadge
          ? 'bg-gradient-to-br from-primary-600 via-primary-700 to-primary-800 text-white shadow-2xl shadow-primary-600/25 z-10'
          : 'bg-white border border-neutral-200 hover:shadow-lg hover:shadow-primary-100/50 hover:border-primary-200'
      }`}
    >
      {/* Badge (dynamic — set by platform admin) */}
      {hasBadge && (
        <div className="absolute -top-4 left-1/2 -translate-x-1/2">
          <span className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-gradient-to-r from-amber-400 to-yellow-400 text-yellow-900 text-xs font-bold rounded-full uppercase tracking-wide shadow-lg shadow-amber-400/30">
            <Sparkles className="w-3 h-3" />
            {plan.badge}
          </span>
        </div>
      )}

      {/* Card content */}
      <div className={`p-7 lg:p-8 flex flex-col flex-1 ${hasBadge ? 'pt-10' : ''}`}>
        {/* Plan name & description */}
        <div className="mb-6">
          <h3 className={`text-lg font-bold font-display mb-1.5 ${hasBadge ? 'text-white' : 'text-neutral-900'}`}>
            {plan.name}
          </h3>
          <p className={`text-sm leading-relaxed ${hasBadge ? 'text-primary-100' : 'text-neutral-900/50'}`}>
            {plan.description}
          </p>
        </div>

        {/* Price */}
        <div className="mb-8">
          {isFree ? (
            <div>
              <span className={`text-4xl font-extrabold font-display ${hasBadge ? 'text-white' : 'text-neutral-900'}`}>
                Free
              </span>
              <p className={`text-sm mt-1 ${hasBadge ? 'text-primary-100' : 'text-neutral-900/50'}`}>
                No credit card required
              </p>
            </div>
          ) : isEnterprise ? (
            <div>
              <div className="flex items-baseline gap-1">
                <span className={`text-sm font-medium ${hasBadge ? 'text-primary-200' : 'text-neutral-900/40'}`}>₹</span>
                <motion.span
                  key={price}
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                  className={`text-4xl font-extrabold font-display tabular-nums ${hasBadge ? 'text-white' : 'text-neutral-900'}`}
                >
                  {price?.toLocaleString('en-IN')}
                </motion.span>
              </div>
              <p className={`text-sm mt-1 ${hasBadge ? 'text-primary-100' : 'text-neutral-900/50'}`}>
                per month — contact for custom pricing
              </p>
            </div>
          ) : (
            <div>
              <div className="flex items-baseline gap-1">
                <span className={`text-sm font-medium ${hasBadge ? 'text-primary-200' : 'text-neutral-900/40'}`}>₹</span>
                <motion.span
                  key={price}
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                  className={`text-4xl font-extrabold font-display tabular-nums ${hasBadge ? 'text-white' : 'text-neutral-900'}`}
                >
                  {price?.toLocaleString('en-IN')}
                </motion.span>
              </div>
              <p className={`text-sm mt-1 ${hasBadge ? 'text-primary-200' : 'text-neutral-900/40'}`}>
                per month{annual ? ', billed annually' : ''}
              </p>
            </div>
          )}
        </div>

        {/* Trial info */}
        {plan.trial?.enabled && !isFree && (
          <p className={`text-xs font-medium mb-4 -mt-4 ${hasBadge ? 'text-primary-200' : 'text-emerald-600'}`}>
            {plan.trial.durationDays}-day free trial included
          </p>
        )}

        {/* CTA */}
        <Btn
          to={plan.ctaTo}
          variant={hasBadge ? 'white' : 'primary'}
          size="md"
          className="w-full mb-8"
        >
          {plan.cta}
        </Btn>

        {/* Divider */}
        <div className={`border-t mb-6 ${hasBadge ? 'border-white/15' : 'border-neutral-200'}`} />

        {/* Included features (highlights from API) */}
        <div className="flex-1 space-y-3">
          {plan.highlights.map((feature) => (
            <div key={feature} className="flex items-start gap-2.5">
              <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                hasBadge ? 'bg-white/15' : 'bg-emerald-50'
              }`}>
                <Check className={`w-3 h-3 ${hasBadge ? 'text-white' : 'text-emerald-600'}`} />
              </div>
              <span className={`text-sm leading-relaxed ${hasBadge ? 'text-primary-50' : 'text-neutral-900/70'}`}>
                {feature}
              </span>
            </div>
          ))}

          {/* Excluded features (derived from disabled boolean features) */}
          {plan.excluded.map((feature) => (
            <div key={feature} className="flex items-start gap-2.5">
              <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                hasBadge ? 'bg-white/8' : 'bg-neutral-200/60'
              }`}>
                <X className={`w-3 h-3 ${hasBadge ? 'text-white/40' : 'text-neutral-900/25'}`} />
              </div>
              <span className={`text-sm leading-relaxed line-through ${hasBadge ? 'text-white/30' : 'text-neutral-900/30'}`}>
                {feature}
              </span>
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}
