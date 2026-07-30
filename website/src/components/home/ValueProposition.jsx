import SectionHeading from '../common/SectionHeading';
import { FadeIn } from '../common/Motion';
import { stats } from '../../data/testimonials';

export default function ValueProposition() {
  return (
    <section className="py-20 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeading
          label="Why BestoClinic"
          title="Everything your dental practice needs, in one platform"
          description="Replace disconnected tools with an all-in-one solution designed specifically for dental professionals. From solo practices to multi-location groups."
        />

        {/* Stats bar */}
        <FadeIn>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 bg-gradient-teal rounded-3xl p-8 lg:p-12">
            {stats.map((stat) => (
              <div key={stat.label} className="text-center">
                <p className="text-3xl lg:text-4xl font-extrabold text-white mb-1">{stat.value}</p>
                <p className="text-sm text-primary-200 font-medium">{stat.label}</p>
              </div>
            ))}
          </div>
        </FadeIn>
      </div>
    </section>
  );
}
