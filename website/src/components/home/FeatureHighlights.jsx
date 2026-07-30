import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import SectionHeading from '../common/SectionHeading';
import { FadeInStagger, FadeInStaggerItem, HoverCard } from '../common/Motion';
import { featureHighlights } from '../../data/features';

export default function FeatureHighlights() {
  return (
    <section className="py-20 bg-neutral-100/50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeading
          label="Features"
          title="Powerful tools for every aspect of your practice"
          description="From patient management to multi-branch operations, BestoClinic gives you everything you need under one roof."
        />

        <FadeInStagger className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
          {featureHighlights.map((feature) => {
            const Icon = feature.icon;
            return (
              <FadeInStaggerItem key={feature.title}>
                <HoverCard className="group bg-white rounded-2xl p-6 lg:p-8 border border-neutral-300/60 hover:border-primary-200 hover:shadow-lg hover:shadow-primary-100/50 transition-all duration-300">
                  <div className="w-12 h-12 bg-primary-50/60 rounded-xl flex items-center justify-center mb-5 group-hover:bg-primary-100 transition-colors">
                    <Icon className="w-6 h-6 text-primary-600" />
                  </div>
                  <h3 className="text-lg font-semibold text-neutral-900 mb-2">{feature.title}</h3>
                  <p className="text-neutral-900/60 text-sm leading-relaxed mb-4">{feature.description}</p>
                  <Link
                    to="/features"
                    className="inline-flex items-center text-sm font-medium text-primary-600 hover:text-primary-700 transition-colors"
                  >
                    Learn more <ArrowRight className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform" />
                  </Link>
                </HoverCard>
              </FadeInStaggerItem>
            );
          })}
        </FadeInStagger>
      </div>
    </section>
  );
}
