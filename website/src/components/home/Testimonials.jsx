import { Star, Quote } from 'lucide-react';
import SectionHeading from '../common/SectionHeading';
import { FadeInStagger, FadeInStaggerItem, HoverCard } from '../common/Motion';
import { testimonials } from '../../data/testimonials';

export default function Testimonials({ audience = 'patients' }) {
  const filtered = testimonials.filter(
    (t) => t.audience === audience || t.audience === 'both',
  );

  const heading =
    audience === 'clinics'
      ? { title: 'Trusted by dental professionals nationwide', desc: 'Hear from practitioners who transformed their practice with BestoClinic.' }
      : { title: 'What our patients say', desc: 'Real experiences from people who found their perfect dental care on BestoClinic.' };

  return (
    <section className="py-20 bg-neutral-100/50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeading
          label="Testimonials"
          title={heading.title}
          description={heading.desc}
        />

        <FadeInStagger className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
          {filtered.map((t, i) => (
            <FadeInStaggerItem key={i}>
              <HoverCard className="bg-white rounded-2xl p-6 lg:p-8 border border-neutral-300/60 hover:shadow-lg hover:shadow-primary-100/30 transition-all duration-300">
                <Quote className="w-8 h-8 text-primary-200 mb-4" />
                <div className="flex gap-1 mb-4">
                  {Array.from({ length: t.rating }).map((_, j) => (
                    <Star key={j} className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                  ))}
                </div>
                <p className="text-neutral-900/70 text-sm leading-relaxed mb-6">"{t.text}"</p>
                <div className="flex items-center gap-3 pt-4 border-t border-neutral-300/40">
                  <div className="w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center text-sm font-bold text-primary-700">
                    {t.name.split(' ').map(n => n[0]).join('')}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-neutral-900">{t.name}</p>
                    <p className="text-xs text-neutral-900/50">{t.role} — {t.location}</p>
                  </div>
                </div>
              </HoverCard>
            </FadeInStaggerItem>
          ))}
        </FadeInStagger>
      </div>
    </section>
  );
}
