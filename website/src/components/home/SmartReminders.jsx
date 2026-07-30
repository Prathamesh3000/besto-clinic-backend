import { motion } from 'framer-motion';
import { Bell, Pill, Clock, CalendarCheck, MessageSquare, Smartphone, TrendingDown, HeartPulse, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import SectionHeading from '../common/SectionHeading';

const fadeIn = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5 } },
};

const stagger = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.12 } },
};

// ── Mock notification cards ──
function NotificationCard({ icon: Icon, color, bgColor, title, subtitle, time }) {
  return (
    <div className="flex items-start gap-3 bg-white rounded-xl p-3.5 border border-neutral-300/60 shadow-[var(--shadow-sm)] hover:shadow-[var(--shadow-md)] transition-shadow duration-200">
      <div className={`w-9 h-9 rounded-lg ${bgColor} flex items-center justify-center shrink-0`}>
        <Icon className={`w-4.5 h-4.5 ${color}`} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-neutral-900 leading-tight">{title}</p>
        <p className="text-xs text-neutral-900/50 mt-0.5">{subtitle}</p>
      </div>
      <span className="text-[10px] text-neutral-900/30 whitespace-nowrap shrink-0">{time}</span>
    </div>
  );
}

// ── Patient-facing section ──
function PatientReminders() {
  return (
    <section className="py-20 bg-gradient-to-b from-neutral-50/50 to-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeading
          label="Stay on Track"
          title="Never miss a dose or appointment again"
          description="BestoClinic keeps you on top of your health with smart appointment reminders and prescription tracking — right on your phone."
        />

        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center mt-12">
          {/* Left: Feature description */}
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-50px' }}
            variants={stagger}
          >
            <motion.div variants={fadeIn} className="flex items-start gap-4 mb-6">
              <div className="w-12 h-12 bg-primary-50/60 rounded-xl flex items-center justify-center shrink-0">
                <Bell className="w-6 h-6 text-primary-600" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-neutral-900 mb-1">Smart Appointment Reminders</h3>
                <p className="text-sm text-neutral-900/60 leading-relaxed">
                  Get notified before every appointment — 24 hours, 2 hours, or 30 minutes before. Never miss a visit with SMS and push notifications.
                </p>
              </div>
            </motion.div>

            <motion.div variants={fadeIn} className="flex items-start gap-4 mb-6">
              <div className="w-12 h-12 bg-emerald-50/80 rounded-xl flex items-center justify-center shrink-0">
                <Pill className="w-6 h-6 text-emerald-600" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-neutral-900 mb-1">Prescription Reminders</h3>
                <p className="text-sm text-neutral-900/60 leading-relaxed">
                  Your doctor's prescription, delivered as timely reminders. Track medication dosages, frequencies, and duration — never skip a dose.
                </p>
              </div>
            </motion.div>

            <motion.div variants={fadeIn} className="flex items-start gap-4">
              <div className="w-12 h-12 bg-purple-50/80 rounded-xl flex items-center justify-center shrink-0">
                <HeartPulse className="w-6 h-6 text-purple-600" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-neutral-900 mb-1">Follow-Up Care</h3>
                <p className="text-sm text-neutral-900/60 leading-relaxed">
                  Automatic follow-up reminders after treatments. Your doctor schedules it, you get reminded — seamless continuity of care.
                </p>
              </div>
            </motion.div>
          </motion.div>

          {/* Right: Notification mockup */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="relative"
          >
            {/* Phone frame */}
            <div className="relative mx-auto max-w-[320px]">
              <div className="bg-neutral-100/80 rounded-[2rem] p-4 border border-neutral-300/60 shadow-[var(--shadow-lg)]">
                {/* Status bar */}
                <div className="flex items-center justify-between px-2 mb-3">
                  <span className="text-[10px] font-semibold text-neutral-900/40">9:41 AM</span>
                  <span className="text-[10px] font-semibold text-neutral-900/40">BestoClinic</span>
                </div>

                <div className="space-y-2.5">
                  <NotificationCard
                    icon={CalendarCheck}
                    color="text-primary-600"
                    bgColor="bg-primary-50"
                    title="Appointment Tomorrow"
                    subtitle="Dr. Kavitha Nair — 10:30 AM"
                    time="Just now"
                  />
                  <NotificationCard
                    icon={Pill}
                    color="text-emerald-600"
                    bgColor="bg-emerald-50"
                    title="Time for your medication"
                    subtitle="Amoxicillin 500mg — Take with food"
                    time="8:00 AM"
                  />
                  <NotificationCard
                    icon={Clock}
                    color="text-amber-600"
                    bgColor="bg-amber-50"
                    title="Appointment in 2 hours"
                    subtitle="Dental cleaning — SmileCare Clinic"
                    time="7:30 AM"
                  />
                  <NotificationCard
                    icon={Pill}
                    color="text-purple-600"
                    bgColor="bg-purple-50"
                    title="Evening medication reminder"
                    subtitle="Ibuprofen 400mg — After dinner"
                    time="Scheduled 8 PM"
                  />
                  <NotificationCard
                    icon={HeartPulse}
                    color="text-rose-600"
                    bgColor="bg-rose-50"
                    title="Follow-up due in 3 days"
                    subtitle="Post root canal check — Dr. Arjun"
                    time="Upcoming"
                  />
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

// ── Clinic-facing section ──

const clinicFeatures = [
  {
    icon: Bell,
    title: 'Automated Appointment Reminders',
    description: 'Configurable SMS & push notifications before every appointment — 24 hours, 2 hours, or custom intervals. Reduce no-shows by up to 40%.',
    color: 'bg-primary-50/60 text-primary-600',
  },
  {
    icon: Pill,
    title: 'Prescription Reminders',
    description: 'When doctors create prescriptions, patients automatically receive medication reminders with dosage, timing, and duration alerts.',
    color: 'bg-emerald-50/80 text-emerald-600',
  },
  {
    icon: MessageSquare,
    title: 'Multi-Channel Delivery',
    description: 'Reach patients via SMS, push notifications, and in-app alerts. Smart fallback ensures every reminder gets through.',
    color: 'bg-blue-50/80 text-blue-600',
  },
];

const clinicStats = [
  { value: '40%', label: 'Fewer No-Shows', icon: TrendingDown, color: 'text-emerald-600' },
  { value: '3x', label: 'Treatment Compliance', icon: HeartPulse, color: 'text-primary-600' },
  { value: '95%', label: 'On-Time Medications', icon: Clock, color: 'text-purple-600' },
  { value: '24/7', label: 'Automated Delivery', icon: Smartphone, color: 'text-blue-600' },
];

function ClinicReminders() {
  return (
    <section className="py-20 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeading
          label="Patient Engagement"
          title="Smart Reminders That Keep Patients Coming Back"
          description="Automated appointment and prescription reminders reduce no-shows, improve treatment compliance, and keep patients engaged between visits."
        />

        {/* Stats bar */}
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-50px' }}
          variants={stagger}
          className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-14"
        >
          {clinicStats.map((stat) => (
            <motion.div
              key={stat.label}
              variants={fadeIn}
              className="bg-neutral-50/80 rounded-2xl p-5 border border-neutral-200/60 text-center"
            >
              <stat.icon className={`w-5 h-5 mx-auto mb-2 ${stat.color}`} />
              <p className={`text-2xl font-extrabold font-display ${stat.color}`}>{stat.value}</p>
              <p className="text-xs text-neutral-900/50 mt-1">{stat.label}</p>
            </motion.div>
          ))}
        </motion.div>

        {/* Feature cards */}
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-50px' }}
          variants={stagger}
          className="grid md:grid-cols-3 gap-6 lg:gap-8"
        >
          {clinicFeatures.map((feature) => {
            const Icon = feature.icon;
            const [bgClass, textClass] = feature.color.split(' ');
            return (
              <motion.div
                key={feature.title}
                variants={fadeIn}
                className="group bg-white rounded-2xl p-6 lg:p-8 border border-neutral-300/60 hover:border-primary-200 hover:shadow-lg hover:shadow-primary-100/50 transition-all duration-300"
              >
                <div className={`w-12 h-12 ${bgClass} rounded-xl flex items-center justify-center mb-5 group-hover:scale-110 transition-transform`}>
                  <Icon className={`w-6 h-6 ${textClass}`} />
                </div>
                <h3 className="text-lg font-semibold text-neutral-900 mb-2">{feature.title}</h3>
                <p className="text-neutral-900/60 text-sm leading-relaxed mb-4">{feature.description}</p>
                <Link
                  to="/features"
                  className="inline-flex items-center text-sm font-medium text-primary-600 hover:text-primary-700 transition-colors"
                >
                  Learn more <ArrowRight className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform" />
                </Link>
              </motion.div>
            );
          })}
        </motion.div>

        {/* How it works mini-flow */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="mt-14 bg-gradient-to-r from-primary-50/60 to-emerald-50/60 rounded-2xl border border-primary-100/50 p-8"
        >
          <h4 className="text-base font-bold text-neutral-900 mb-4 text-center">How Smart Reminders Work</h4>
          <div className="grid md:grid-cols-3 gap-6">
            <div className="text-center">
              <div className="w-10 h-10 mx-auto rounded-full bg-primary-100 flex items-center justify-center text-primary-700 font-extrabold text-sm mb-3">1</div>
              <p className="text-sm font-semibold text-neutral-900">Doctor books or prescribes</p>
              <p className="text-xs text-neutral-900/50 mt-1">Appointments or prescriptions trigger the reminder engine automatically</p>
            </div>
            <div className="text-center">
              <div className="w-10 h-10 mx-auto rounded-full bg-primary-100 flex items-center justify-center text-primary-700 font-extrabold text-sm mb-3">2</div>
              <p className="text-sm font-semibold text-neutral-900">Smart scheduling</p>
              <p className="text-xs text-neutral-900/50 mt-1">Reminders are queued at the right times — configurable per clinic</p>
            </div>
            <div className="text-center">
              <div className="w-10 h-10 mx-auto rounded-full bg-primary-100 flex items-center justify-center text-primary-700 font-extrabold text-sm mb-3">3</div>
              <p className="text-sm font-semibold text-neutral-900">Patient gets notified</p>
              <p className="text-xs text-neutral-900/50 mt-1">SMS, push, or in-app — multi-channel delivery ensures nothing is missed</p>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

// ── Exported component with audience prop ──

export default function SmartReminders({ audience = 'patients' }) {
  return audience === 'clinics' ? <ClinicReminders /> : <PatientReminders />;
}
