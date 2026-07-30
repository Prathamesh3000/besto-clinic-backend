import SectionHeading from '../common/SectionHeading';
import { FadeInStagger, FadeInStaggerItem } from '../common/Motion';
import { whyChooseUs } from '../../data/features';

export default function WhyChooseUs() {
  return (
    <section className="py-20 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeading
          label="Advantages"
          title="Built different. Built for dental."
          description="We didn't build a generic platform and slap a dental label on it. Every feature was designed with dental workflows in mind."
        />

        <FadeInStagger className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8">
          {whyChooseUs.map((item) => {
            const Icon = item.icon;
            return (
              <FadeInStaggerItem key={item.title} className="text-center">
                <div className="w-16 h-16 bg-primary-50/60 rounded-2xl flex items-center justify-center mx-auto mb-5">
                  <Icon className="w-7 h-7 text-primary-600" />
                </div>
                <h3 className="text-lg font-semibold text-neutral-900 mb-2">{item.title}</h3>
                <p className="text-neutral-900/60 text-sm leading-relaxed">{item.description}</p>
              </FadeInStaggerItem>
            );
          })}
        </FadeInStagger>
      </div>
    </section>
  );
}
