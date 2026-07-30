import { CheckCircle2 } from 'lucide-react';
import { SlideIn } from '../common/Motion';

export default function FeatureDetail({ feature, index }) {
  const Icon = feature.icon;
  const isReversed = index % 2 !== 0;

  return (
    <div
      id={feature.id}
      className={`grid lg:grid-cols-2 gap-12 lg:gap-16 items-center py-16 ${
        index !== 0 ? 'border-t border-neutral-300/40' : ''
      }`}
    >
      <SlideIn direction={isReversed ? 'right' : 'left'} className={isReversed ? 'lg:order-2' : ''}>
        <div className="w-12 h-12 bg-primary-50 rounded-xl flex items-center justify-center mb-5">
          <Icon className="w-6 h-6 text-primary-600" />
        </div>
        <p className="text-sm font-semibold text-primary-600 mb-2 uppercase tracking-wide">
          {feature.subtitle}
        </p>
        <h3 className="text-2xl lg:text-3xl font-bold text-neutral-900 mb-4">
          {feature.title}
        </h3>
        <p className="text-neutral-900/60 leading-relaxed mb-6">
          {feature.description}
        </p>
        <ul className="space-y-3">
          {feature.benefits.map((benefit) => (
            <li key={benefit} className="flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-green-500 mt-0.5 shrink-0" />
              <span className="text-sm text-neutral-900/70">{benefit}</span>
            </li>
          ))}
        </ul>
      </SlideIn>

      <SlideIn direction={isReversed ? 'left' : 'right'} delay={0.15} className={isReversed ? 'lg:order-1' : ''}>
        <div className="bg-gradient-to-br from-primary-50 to-primary-100/50 rounded-2xl p-8 lg:p-12 aspect-[4/3] flex items-center justify-center">
          <div className="bg-white rounded-xl shadow-lg border border-neutral-300/40 p-6 w-full max-w-sm">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-primary-100 rounded-lg flex items-center justify-center">
                <Icon className="w-5 h-5 text-primary-600" />
              </div>
              <div>
                <p className="text-sm font-semibold text-neutral-900">{feature.title}</p>
                <p className="text-xs text-neutral-900/50">Live preview</p>
              </div>
            </div>
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full ${i === 1 ? 'bg-green-400' : i === 2 ? 'bg-primary-400' : 'bg-yellow-400'}`} />
                  <div className="flex-1 h-3 bg-neutral-200 rounded" />
                  <div className="w-16 h-3 bg-neutral-100 rounded" />
                </div>
              ))}
            </div>
            <div className="mt-4 pt-4 border-t border-neutral-300/40">
              <div className="h-20 bg-gradient-to-r from-primary-50 to-accent-50 rounded-lg" />
            </div>
          </div>
        </div>
      </SlideIn>
    </div>
  );
}
