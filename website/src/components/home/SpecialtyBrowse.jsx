import { motion } from 'framer-motion';
import SectionHeading from '../common/SectionHeading';
import {
  Smile, // General Dentistry
  AlignVerticalSpaceAround, // Orthodontics
  HeartPulse, // Periodontics
  Microscope, // Endodontics
  Scissors, // Oral Surgery
  Sparkles, // Cosmetic
  Baby, // Pediatric
  CircleDot, // Prosthodontics
} from 'lucide-react';

const specialties = [
  { name: 'General Dentistry', icon: Smile, color: 'bg-blue-50 text-blue-600' },
  { name: 'Orthodontics', icon: AlignVerticalSpaceAround, color: 'bg-purple-50 text-purple-600' },
  { name: 'Periodontics', icon: HeartPulse, color: 'bg-rose-50 text-rose-600' },
  { name: 'Endodontics', icon: Microscope, color: 'bg-amber-50 text-amber-600' },
  { name: 'Oral Surgery', icon: Scissors, color: 'bg-red-50 text-red-600' },
  { name: 'Cosmetic Dentistry', icon: Sparkles, color: 'bg-pink-50 text-pink-600' },
  { name: 'Pediatric Dentistry', icon: Baby, color: 'bg-emerald-50 text-emerald-600' },
  { name: 'Prosthodontics', icon: CircleDot, color: 'bg-teal-50 text-teal-600' },
];

export default function SpecialtyBrowse() {
  const openChatbot = () => {
    window.dispatchEvent(new CustomEvent('open-dental-scanner'));
  };

  return (
    <section className="py-20 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeading
          label="Specializations"
          title="Browse by specialty"
          description="Find the right specialist for your dental needs"
        />

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 mt-12">
          {specialties.map((spec, i) => (
            <motion.button
              key={spec.name}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.05 }}
              whileHover={{ y: -4 }}
              onClick={openChatbot}
              className="group flex flex-col items-center gap-3 p-6 rounded-2xl border border-neutral-300/60 bg-white hover:shadow-[var(--shadow-md)] hover:border-primary-200/60 transition-all duration-300 cursor-pointer"
            >
              <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${spec.color} transition-transform duration-300 group-hover:scale-110`}>
                <spec.icon className="w-6 h-6" />
              </div>
              <span className="text-sm font-semibold text-neutral-900 text-center">{spec.name}</span>
            </motion.button>
          ))}
        </div>
      </div>
    </section>
  );
}
