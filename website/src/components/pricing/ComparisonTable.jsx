import { motion } from 'framer-motion';
import { Check, Minus } from 'lucide-react';

function CellValue({ value }) {
  if (value === true) {
    return (
      <div className="w-6 h-6 rounded-full bg-emerald-50 flex items-center justify-center mx-auto">
        <Check className="w-3.5 h-3.5 text-emerald-600" />
      </div>
    );
  }
  if (value === false) {
    return <Minus className="w-4 h-4 text-neutral-400 mx-auto" />;
  }
  return (
    <span className="text-sm text-neutral-900/70 font-medium">{value}</span>
  );
}

export default function ComparisonTable({ plans, comparisonData }) {
  if (!plans?.length || !comparisonData?.length) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.5 }}
      className="mt-24"
    >
      <div className="text-center mb-12">
        <h3 className="text-2xl md:text-3xl font-bold font-display text-neutral-900 mb-3">
          Compare All Features
        </h3>
        <p className="text-neutral-900/50 text-base">
          Everything you need to know, side by side.
        </p>
      </div>

      <div className="bg-white rounded-3xl border border-neutral-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px]">
            {/* Header — built from API plan names */}
            <thead>
              <tr className="border-b border-neutral-200">
                <th className="text-left py-5 pl-6 pr-4 text-sm font-medium text-neutral-900/40 uppercase tracking-wider w-[30%]">
                  Feature
                </th>
                {plans.map((plan) => (
                  <th key={plan.slug} className="py-5 px-4 text-center">
                    <span className={`text-sm font-bold ${plan.badge ? 'text-primary-600' : 'text-neutral-900'}`}>
                      {plan.name}
                    </span>
                    {plan.badge && (
                      <span className="block text-[10px] font-semibold text-primary-500 mt-0.5 uppercase tracking-wide">
                        {plan.badge}
                      </span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>

            {/* Body — built from dynamic comparison data */}
            <tbody>
              {comparisonData.map((category) => (
                <CategoryGroup key={category.category} category={category} plans={plans} />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </motion.div>
  );
}

function CategoryGroup({ category, plans }) {
  return (
    <>
      {/* Category header */}
      <tr>
        <td
          colSpan={plans.length + 1}
          className="pt-6 pb-3 pl-6 text-xs font-bold text-primary-700 uppercase tracking-wider bg-neutral-50/50"
        >
          {category.category}
        </td>
      </tr>

      {/* Feature rows */}
      {category.features.map((feature) => (
        <tr
          key={feature.name}
          className="border-b border-neutral-200/60 last:border-0 hover:bg-neutral-50/50 transition-colors duration-150"
        >
          <td className="py-3.5 pl-6 pr-4 text-sm text-neutral-900/70">{feature.name}</td>
          {plans.map((plan) => (
            <td
              key={plan.slug}
              className={`py-3.5 px-4 text-center ${plan.badge ? 'bg-primary-50/20' : ''}`}
            >
              <CellValue value={feature[plan.slug]} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
