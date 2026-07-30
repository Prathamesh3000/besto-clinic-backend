import { motion } from 'framer-motion';
import { Camera, Brain, FileText, ArrowRight } from 'lucide-react';
import SectionHeading from '../common/SectionHeading';

const steps = [
  {
    icon: Camera,
    title: 'Snap a Photo',
    description: 'Take a quick photo of your teeth using your phone or webcam.',
    color: 'bg-cyan-50 text-cyan-600',
  },
  {
    icon: Brain,
    title: 'AI Analyzes',
    description: 'Our AI scans for cavities, gum issues, plaque, and more in seconds.',
    color: 'bg-primary-50 text-primary-600',
  },
  {
    icon: FileText,
    title: 'Get Your Report',
    description: 'Receive a detailed dental health report and find the right dentist nearby.',
    color: 'bg-emerald-50 text-emerald-600',
  },
];

const fadeIn = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5 } },
};

const stagger = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.15 } },
};

export default function AIDentalScan() {
  const openScanner = () => {
    window.dispatchEvent(new CustomEvent('open-dental-scanner'));
  };

  return (
    <section className="py-20 bg-gradient-to-b from-white to-neutral-50/50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeading
          label="AI-Powered"
          title="Free AI Dental Scan"
          description="Get an instant AI-powered dental health check — no appointment needed. Just snap, scan, and know."
        />

        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-50px' }}
          variants={stagger}
          className="grid md:grid-cols-3 gap-6 mt-12"
        >
          {steps.map((step, i) => (
            <motion.div
              key={i}
              variants={fadeIn}
              className="relative bg-white rounded-2xl p-7 border border-neutral-300/60 hover:shadow-[var(--shadow-md)] transition-all duration-300"
            >
              {/* Step number */}
              <div className="absolute top-5 right-5 text-4xl font-extrabold font-display text-neutral-200/80">
                {i + 1}
              </div>

              <div className={`w-12 h-12 rounded-xl ${step.color} flex items-center justify-center mb-5`}>
                <step.icon className="w-6 h-6" />
              </div>
              <h3 className="font-display font-bold text-lg text-neutral-900 mb-2">
                {step.title}
              </h3>
              <p className="text-sm text-neutral-900/60 leading-relaxed">
                {step.description}
              </p>
            </motion.div>
          ))}
        </motion.div>

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="text-center mt-12"
        >
          <button
            onClick={openScanner}
            className="inline-flex items-center gap-2.5 px-7 py-3.5 bg-gradient-to-r from-primary-500 to-primary-600 text-white font-semibold rounded-2xl shadow-lg shadow-primary-600/20 hover:shadow-xl hover:shadow-primary-600/30 hover:from-primary-600 hover:to-primary-700 transition-all duration-200 cursor-pointer"
          >
            <img src="/chatbot/dental-chat-bot-icon.svg" alt="Dental Scan" className="w-7 h-7" />
            Start Free Scan
            <ArrowRight className="w-4 h-4" />
          </button>
          <p className="text-xs text-neutral-900/40 mt-3">
            No registration required. Your data stays private.
          </p>
        </motion.div>
      </div>
    </section>
  );
}
