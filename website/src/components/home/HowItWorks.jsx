import { motion } from 'framer-motion';
import { Search, UserPlus, CalendarCheck, Stethoscope } from 'lucide-react';
import SectionHeading from '../common/SectionHeading';

const steps = [
  {
    number: '01',
    icon: Search,
    title: 'Browse Freely',
    description: 'Explore doctors by specialty, location, or clinic name. View profiles, ratings, and availability — no account needed.',
    color: 'bg-blue-50 text-blue-600 border-blue-100',
  },
  {
    number: '02',
    icon: UserPlus,
    title: 'Register Once',
    description: 'Create one account when you\'re ready to book. Your account works across every clinic on BestoClinic — no re-registering.',
    color: 'bg-emerald-50 text-emerald-600 border-emerald-100',
  },
  {
    number: '03',
    icon: CalendarCheck,
    title: 'Book & Visit',
    description: 'Pick a time slot and confirm instantly. Visit in-person or consult via telemedicine from home — your choice.',
    color: 'bg-purple-50 text-purple-600 border-purple-100',
  },
];

export default function HowItWorks() {
  return (
    <section className="py-20 bg-neutral-50/50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeading
          label="How It Works"
          title="From browsing to booking in 3 steps"
          description="No clinic code needed — browse freely, register when you're ready to book"
        />

        <div className="grid md:grid-cols-3 gap-8 mt-14">
          {steps.map((step, i) => (
            <motion.div
              key={step.number}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.15 }}
              className="relative text-center"
            >
              {/* Connector line */}
              {i < steps.length - 1 && (
                <div className="hidden md:block absolute top-10 left-[60%] w-[80%] h-px border-t-2 border-dashed border-neutral-400/60" />
              )}

              {/* Step card */}
              <div className="relative flex flex-col items-center">
                {/* Number badge */}
                <span className="text-xs font-bold text-primary-500 mb-3 tracking-widest uppercase">
                  Step {step.number}
                </span>

                {/* Icon */}
                <div className={`w-16 h-16 rounded-2xl flex items-center justify-center border ${step.color} mb-5`}>
                  <step.icon className="w-7 h-7" />
                </div>

                <h3 className="text-lg font-bold font-display text-neutral-900 mb-2">
                  {step.title}
                </h3>
                <p className="text-sm text-neutral-900/50 leading-relaxed max-w-xs mx-auto">
                  {step.description}
                </p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
