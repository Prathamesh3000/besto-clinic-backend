import { motion } from 'framer-motion';

export default function PricingToggle({ annual, setAnnual, savingsPercent = 0, variant = 'light' }) {
  const isDark = variant === 'dark';

  return (
    <div className="flex items-center justify-center gap-2 mb-14">
      <div className={`relative inline-flex items-center rounded-2xl p-1 border ${
        isDark
          ? 'bg-white/10 border-white/20'
          : 'bg-neutral-100 border-neutral-200'
      }`}>
        {/* Sliding pill */}
        <motion.div
          className={`absolute top-1 bottom-1 rounded-xl shadow-sm ${
            isDark
              ? 'bg-white border border-white/20'
              : 'bg-white border border-neutral-200/40'
          }`}
          animate={{ left: annual ? '50%' : '4px', right: annual ? '4px' : '50%' }}
          transition={{ type: 'spring', stiffness: 350, damping: 30 }}
        />

        <button
          onClick={() => setAnnual(false)}
          className={`relative z-10 px-6 py-2.5 text-sm font-semibold rounded-xl transition-colors duration-200 cursor-pointer ${
            !annual
              ? isDark ? 'text-primary-700' : 'text-neutral-900'
              : isDark ? 'text-white/50 hover:text-white/70' : 'text-neutral-400 hover:text-neutral-600'
          }`}
        >
          Monthly
        </button>
        <button
          onClick={() => setAnnual(true)}
          className={`relative z-10 px-6 py-2.5 text-sm font-semibold rounded-xl transition-colors duration-200 cursor-pointer ${
            annual
              ? isDark ? 'text-primary-700' : 'text-neutral-900'
              : isDark ? 'text-white/50 hover:text-white/70' : 'text-neutral-400 hover:text-neutral-600'
          }`}
        >
          Annual
        </button>
      </div>

      {annual && savingsPercent > 0 && (
        <motion.span
          initial={{ opacity: 0, scale: 0.8, x: -8 }}
          animate={{ opacity: 1, scale: 1, x: 0 }}
          className="px-3 py-1.5 bg-emerald-50 text-emerald-700 text-xs font-bold rounded-full border border-emerald-200/50"
        >
          Save {savingsPercent}%
        </motion.span>
      )}
    </div>
  );
}
