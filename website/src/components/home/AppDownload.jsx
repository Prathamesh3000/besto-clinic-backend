import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Calendar, FileText, CreditCard,
  Bell, Video, ChevronRight,
  Clock, Pill, Activity, Heart, User,
  Smartphone, Shield, Share2,
} from 'lucide-react';

// ── Tab config ────────────────────────────────────────────────
const tabs = [
  { key: 0, icon: Activity, label: 'Home' },
  { key: 1, icon: Calendar, label: 'Appts' },
  { key: 2, icon: FileText, label: 'Records' },
  { key: 3, icon: CreditCard, label: 'Payments' },
  { key: 4, icon: User, label: 'Profile' },
];

// ── Features shown below the phone ────────────────────────────
const highlights = [
  { icon: Calendar, title: 'Smart Scheduling', desc: 'Book & manage appointments with real-time availability' },
  { icon: Pill, title: 'Rx Tracking', desc: 'Active prescriptions, dosage reminders & refill alerts' },
  { img: '/chatbot/dental-chat-bot-icon.svg', title: 'AI Dental Scan', desc: 'Instant AI-powered dental health checkup from your camera' },
  { icon: Video, title: 'Video Consults', desc: 'Connect with your dentist via secure telemedicine' },
  { icon: Shield, title: 'Secure Records', desc: 'HIPAA-compliant storage for your complete dental history' },
  { icon: Share2, title: 'Share Records', desc: 'Share records securely with any healthcare provider' },
];

export default function AppDownload() {
  const [activeTab, setActiveTab] = useState(0);

  return (
    <section className="py-24 bg-white overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* ── Top: Heading + Phone side by side ── */}
        <div className="grid lg:grid-cols-2 gap-16 lg:gap-20 items-center">
          {/* Left column — copy + store badges */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary-50/80 border border-primary-200/40 rounded-full mb-6">
              <Smartphone className="w-4 h-4 text-primary-600" />
              <span className="text-sm font-medium text-primary-700">Mobile App</span>
            </div>

            <h2 className="text-3xl sm:text-4xl lg:text-[2.75rem] font-extrabold font-display text-neutral-900 leading-tight tracking-tight mb-5">
              Your dental care,{' '}
              <span className="bg-gradient-to-r from-primary-600 to-primary-500 bg-clip-text text-transparent">
                one app away
              </span>
            </h2>

            <p className="text-lg text-neutral-900/55 leading-relaxed mb-8 max-w-lg">
              Manage your complete dental journey from one app — book visits, track prescriptions, view records, pay bills, and consult your doctor via video.
            </p>

            {/* Value hooks */}
            <div className="flex flex-wrap gap-3 mb-10">
              {[
                'Book in 60 Seconds', 'Free to Use', '24/7 Access', '100% Secure',
              ].map((s) => (
                <span key={s} className="px-3.5 py-1.5 bg-neutral-100 border border-neutral-300/60 rounded-full text-xs font-semibold text-neutral-900/60">{s}</span>
              ))}
            </div>

            {/* Store badges */}
            <div className="flex gap-3">
              <a href="#" className="flex items-center gap-3 px-5 py-3.5 bg-neutral-900 rounded-2xl hover:bg-primary-800 transition-colors">
                <svg className="w-7 h-7 text-white" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18.71 19.5C17.88 20.74 17 21.95 15.66 21.97C14.32 21.99 13.89 21.18 12.37 21.18C10.84 21.18 10.37 21.95 9.1 21.99C7.79 22.03 6.8 20.68 5.96 19.47C4.25 16.97 2.94 12.45 4.7 9.39C5.57 7.87 7.13 6.91 8.82 6.88C10.1 6.86 11.32 7.75 12.11 7.75C12.89 7.75 14.37 6.68 15.92 6.84C16.57 6.87 18.39 7.1 19.56 8.82C19.47 8.88 17.39 10.1 17.41 12.63C17.44 15.65 20.06 16.66 20.09 16.67C20.06 16.74 19.67 18.11 18.71 19.5ZM13 3.5C13.73 2.67 14.94 2.04 15.94 2C16.07 3.17 15.6 4.35 14.9 5.19C14.21 6.04 13.07 6.7 11.95 6.61C11.8 5.46 12.36 4.26 13 3.5Z"/>
                </svg>
                <div>
                  <p className="text-[10px] text-white/50 leading-none">Download on the</p>
                  <p className="text-sm font-bold text-white leading-tight">App Store</p>
                </div>
              </a>
              <a href="#" className="flex items-center gap-3 px-5 py-3.5 bg-neutral-900 rounded-2xl hover:bg-primary-800 transition-colors">
                <svg className="w-7 h-7" viewBox="0 0 24 24">
                  <path d="M3.18 23.49C2.63 23.2 2.22 22.63 2.22 21.87V2.13C2.22 1.37 2.63.8 3.18.51L13.54 11.99 3.18 23.49Z" fill="#4285F4"/>
                  <path d="M17.05 15.59L13.54 12L17.05 8.41L21.16 10.72C22.07 11.23 22.07 12.77 21.16 13.28L17.05 15.59Z" fill="#FBBC04"/>
                  <path d="M3.18 23.49L13.54 12L17.05 15.59L3.68 23.73C3.5 23.67 3.33 23.59 3.18 23.49Z" fill="#EA4335"/>
                  <path d="M3.18.51C3.33.41 3.5.33 3.68.27L17.05 8.41L13.54 12L3.18.51Z" fill="#34A853"/>
                </svg>
                <div>
                  <p className="text-[10px] text-white/50 leading-none">Get it on</p>
                  <p className="text-sm font-bold text-white leading-tight">Google Play</p>
                </div>
              </a>
            </div>
          </motion.div>

          {/* Right column — iPhone */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="flex justify-center"
          >
            <div className="relative w-[280px] h-[572px]">
              {/* Shadow underneath */}
              <div className="absolute -bottom-4 left-6 right-6 h-8 bg-neutral-900/10 rounded-[50%] blur-xl" />

              {/* iPhone frame — black */}
              <div className="absolute inset-0 rounded-[48px] bg-[#1d1d1f] shadow-2xl shadow-neutral-900/20 p-[2px]">
                <div className="w-full h-full rounded-[46px] bg-[#2c2c2e] p-[2px]">
                  <div className="w-full h-full rounded-[44px] bg-[#1d1d1f] overflow-hidden relative">
                    {/* Dynamic Island */}
                    <div className="absolute top-2.5 left-1/2 -translate-x-1/2 w-[100px] h-[30px] bg-[#1d1d1f] rounded-full z-30">
                      <div className="absolute right-7 top-1/2 -translate-y-1/2 w-[10px] h-[10px] rounded-full bg-[#2c2c2e]" />
                    </div>

                    {/* Status bar */}
                    <div className="absolute top-0 left-0 right-0 h-[52px] z-20 flex items-end justify-between px-8 pb-0.5">
                      <span className="text-[11px] font-semibold text-white">9:41</span>
                      <div className="flex items-center gap-1">
                        <div className="flex gap-[2px] items-end">
                          {[4,6,8,10,12].map((h,i) => (
                            <div key={i} className={`w-[3px] rounded-sm ${i < 4 ? 'bg-white' : 'bg-white/30'}`} style={{ height: `${h}px` }} />
                          ))}
                        </div>
                        <svg className="w-[15px] h-[11px] text-white ml-0.5" fill="currentColor" viewBox="0 0 25 12">
                          <rect x="0" y="1" width="21" height="10" rx="2" stroke="currentColor" strokeWidth="1" fill="none" opacity="0.4"/>
                          <rect x="1.5" y="2.5" width="16" height="7" rx="1" fill="currentColor"/>
                          <path d="M23 4.5v3c.8-.4.8-2.6 0-3z" fill="currentColor" opacity="0.4"/>
                        </svg>
                      </div>
                    </div>

                    {/* Screen content */}
                    <AnimatePresence mode="wait">
                      {activeTab === 0 && <DashboardMockup key="dash" />}
                      {activeTab === 1 && <AppointmentsMockup key="appt" />}
                      {activeTab === 2 && <RecordsMockup key="recs" />}
                      {activeTab === 3 && <PaymentsMockup key="pay" />}
                      {activeTab === 4 && <ProfileMockup key="prof" />}
                    </AnimatePresence>

                    {/* Interactive bottom tab bar */}
                    <div className="absolute bottom-0 left-0 right-0 z-20 bg-white border-t border-gray-200/80">
                      <div className="flex items-center justify-around px-1 pt-1.5 pb-4">
                        {tabs.map((tab) => (
                          <button
                            key={tab.key}
                            onClick={() => setActiveTab(tab.key)}
                            className="flex flex-col items-center gap-[2px] cursor-pointer outline-none w-12"
                          >
                            <div className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all duration-200 ${activeTab === tab.key ? 'bg-primary-500 scale-110' : ''}`}>
                              <tab.icon className={`w-[14px] h-[14px] transition-colors duration-200 ${activeTab === tab.key ? 'text-white' : 'text-gray-400'}`} />
                            </div>
                            <span className={`text-[8px] font-semibold transition-colors duration-200 ${activeTab === tab.key ? 'text-primary-600' : 'text-gray-400'}`}>
                              {tab.label}
                            </span>
                          </button>
                        ))}
                      </div>
                      <div className="absolute bottom-1 left-1/2 -translate-x-1/2 w-[120px] h-[4px] bg-black rounded-full" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>

        {/* ── Bottom: Feature highlights grid ── */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5 mt-20 pt-16 border-t border-neutral-300/60"
        >
          {highlights.map((h) => (
            <div key={h.title} className="flex items-start gap-4 p-1">
              <div className="w-10 h-10 rounded-xl bg-primary-50 flex items-center justify-center shrink-0 overflow-hidden">
                {h.img ? (
                  <img src={h.img} alt={h.title} className="w-9 h-9" />
                ) : (
                  <h.icon className="w-5 h-5 text-primary-600" />
                )}
              </div>
              <div>
                <h4 className="text-sm font-bold text-neutral-900 mb-1">{h.title}</h4>
                <p className="text-sm text-neutral-900/50 leading-relaxed">{h.desc}</p>
              </div>
            </div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────
// MOCKUP SCREENS
// ─────────────────────────────────────────────────────────────

function ScreenWrapper({ children }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="absolute inset-0 pt-[52px] pb-[68px] bg-[#f2f2f7] overflow-hidden"
    >
      {children}
    </motion.div>
  );
}

// ── Dashboard ─────────────────────────────────────────────────
function DashboardMockup() {
  return (
    <ScreenWrapper>
      <div className="bg-gradient-to-br from-primary-500 to-primary-600 px-4 pt-2.5 pb-10">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[9px] text-white/60 font-medium">Good morning</p>
            <p className="text-[13px] font-bold text-white">Sarah</p>
          </div>
          <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center text-[9px] font-bold text-white">S</div>
        </div>
      </div>

      <div className="px-3 -mt-6">
        <div className="grid grid-cols-2 gap-1.5 mb-2">
          {[
            { value: '3', label: 'Upcoming', icon: Calendar, color: 'text-primary-600 bg-primary-50' },
            { value: '2', label: 'Active Rx', icon: Pill, color: 'text-purple-600 bg-purple-50' },
            { value: '1', label: 'Pending', icon: CreditCard, color: 'text-amber-600 bg-amber-50' },
            { value: '5', label: 'Unread', icon: Bell, color: 'text-rose-600 bg-rose-50' },
          ].map((stat) => (
            <div key={stat.label} className="bg-white rounded-lg p-2 shadow-sm">
              <div className="flex items-center gap-1 mb-0.5">
                <div className={`w-4 h-4 rounded ${stat.color} flex items-center justify-center`}>
                  <stat.icon className="w-2.5 h-2.5" />
                </div>
                <span className="text-[8px] text-gray-400 font-medium">{stat.label}</span>
              </div>
              <p className="text-base font-bold text-gray-900 pl-0.5">{stat.value}</p>
            </div>
          ))}
        </div>

        <div className="bg-white rounded-lg p-2.5 shadow-sm mb-2">
          <p className="text-[8px] text-gray-400 font-semibold uppercase tracking-wider mb-1.5">Next Appointment</p>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary-50 flex items-center justify-center text-[9px] font-bold text-primary-600">PC</div>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-semibold text-gray-900">Dr. Priya Chavan</p>
              <p className="text-[9px] text-gray-400">Pediatric Dentistry</p>
            </div>
            <div className="text-right">
              <p className="text-[9px] font-semibold text-primary-600">Tomorrow</p>
              <p className="text-[9px] text-gray-400">10:30 AM</p>
            </div>
          </div>
        </div>

        <div className="flex gap-1.5">
          {[
            { icon: Calendar, label: 'Book', color: 'bg-primary-500' },
            { img: '/chatbot/dental chat bot .svg', label: 'AI Scan', color: 'bg-cyan-500' },
            { icon: Video, label: 'Consult', color: 'bg-emerald-500' },
          ].map((a) => (
            <div key={a.label} className="flex-1 flex flex-col items-center gap-0.5 py-2 rounded-lg bg-white shadow-sm">
              <div className={`w-6 h-6 rounded-md ${a.color} flex items-center justify-center overflow-hidden`}>
                {a.img ? (
                  <img src={a.img} alt={a.label} className="w-6 h-6" />
                ) : (
                  <a.icon className="w-3 h-3 text-white" />
                )}
              </div>
              <span className="text-[8px] font-medium text-gray-500">{a.label}</span>
            </div>
          ))}
        </div>
      </div>
    </ScreenWrapper>
  );
}

// ── Appointments ──────────────────────────────────────────────
function AppointmentsMockup() {
  return (
    <ScreenWrapper>
      <div className="px-4 pt-2 pb-2">
        <p className="text-[15px] font-bold text-gray-900">Appointments</p>
      </div>

      <div className="flex gap-1.5 px-4 mb-2">
        {['All', 'Upcoming', 'Completed'].map((f, i) => (
          <span key={f} className={`px-2.5 py-1 rounded-full text-[9px] font-semibold ${i === 1 ? 'bg-primary-500 text-white' : 'bg-white text-gray-500'}`}>{f}</span>
        ))}
      </div>

      <div className="px-3 space-y-1.5">
        {[
          { doctor: 'Dr. Priya Chavan', spec: 'Pediatric', date: 'Mar 26', time: '10:30 AM', status: 'Confirmed', sColor: 'bg-emerald-500', bColor: 'border-l-emerald-500', ini: 'PC' },
          { doctor: 'Dr. Aditi Mehta', spec: 'Periodontics', date: 'Mar 28', time: '2:00 PM', status: 'Requested', sColor: 'bg-amber-500', bColor: 'border-l-amber-500', ini: 'AM' },
          { doctor: 'Dr. Rajesh Sharma', spec: 'General', date: 'Apr 2', time: '11:00 AM', status: 'Confirmed', sColor: 'bg-emerald-500', bColor: 'border-l-emerald-500', ini: 'RS' },
          { doctor: 'Dr. Sneha Bhosle', spec: 'Orthodontics', date: 'Apr 10', time: '4:00 PM', status: 'Confirmed', sColor: 'bg-emerald-500', bColor: 'border-l-emerald-500', ini: 'SB' },
        ].map((apt) => (
          <div key={apt.doctor} className={`bg-white rounded-lg p-2.5 shadow-sm border-l-[3px] ${apt.bColor}`}>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-primary-50 flex items-center justify-center text-[9px] font-bold text-primary-600 shrink-0">{apt.ini}</div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-semibold text-gray-900 truncate">{apt.doctor}</p>
                <p className="text-[8px] text-gray-400">{apt.spec}</p>
              </div>
              <div className="flex items-center gap-0.5">
                <span className={`w-1.5 h-1.5 rounded-full ${apt.sColor}`} />
                <span className="text-[8px] font-medium text-gray-500">{apt.status}</span>
              </div>
            </div>
            <div className="flex items-center gap-1.5 mt-1.5 pl-10">
              <div className="flex items-center gap-0.5 px-1.5 py-0.5 bg-gray-50 rounded">
                <Calendar className="w-2 h-2 text-gray-400" />
                <span className="text-[8px] text-gray-500 font-medium">{apt.date}</span>
              </div>
              <div className="flex items-center gap-0.5 px-1.5 py-0.5 bg-gray-50 rounded">
                <Clock className="w-2 h-2 text-gray-400" />
                <span className="text-[8px] text-gray-500 font-medium">{apt.time}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="absolute bottom-[76px] right-4 w-10 h-10 rounded-full bg-gradient-to-br from-primary-500 to-primary-600 shadow-lg shadow-primary-500/25 flex items-center justify-center z-10">
        <span className="text-white text-base font-light">+</span>
      </div>
    </ScreenWrapper>
  );
}

// ── Health Records ────────────────────────────────────────────
function RecordsMockup() {
  return (
    <ScreenWrapper>
      <div className="px-4 pt-2 pb-2">
        <p className="text-[15px] font-bold text-gray-900">Health Records</p>
      </div>

      <div className="flex mx-4 mb-2 bg-white rounded-lg p-0.5 shadow-sm">
        {['History', 'Prescriptions', 'Scans'].map((t, i) => (
          <span key={t} className={`flex-1 text-center py-1.5 text-[9px] font-semibold rounded-md ${i === 0 ? 'bg-primary-500 text-white' : 'text-gray-400'}`}>{t}</span>
        ))}
      </div>

      <div className="px-4 relative">
        <div className="absolute left-[26px] top-0 bottom-0 w-[1px] bg-gray-200" />
        <div className="space-y-2">
          {[
            { date: 'Mar 20', title: 'Root Canal Treatment', doctor: 'Dr. Aditi Mehta', color: 'bg-primary-500' },
            { date: 'Feb 14', title: 'Dental Cleaning', doctor: 'Dr. Rajesh Sharma', color: 'bg-emerald-500' },
            { date: 'Jan 08', title: 'Orthodontic Checkup', doctor: 'Dr. Sneha Bhosle', color: 'bg-purple-500' },
            { date: 'Dec 12', title: 'Cavity Filling', doctor: 'Dr. Priya Chavan', color: 'bg-amber-500' },
          ].map((r) => (
            <div key={r.title} className="flex items-start gap-2.5 relative">
              <div className={`w-2.5 h-2.5 rounded-full ${r.color} shrink-0 mt-1.5 ring-2 ring-[#f2f2f7] z-10`} />
              <div className="flex-1 bg-white rounded-lg p-2.5 shadow-sm">
                <div className="flex items-center justify-between mb-0.5">
                  <p className="text-[10px] font-semibold text-gray-900">{r.title}</p>
                  <span className="text-[8px] text-gray-400">{r.date}</span>
                </div>
                <p className="text-[9px] text-gray-400">{r.doctor}</p>
                <div className="flex items-center gap-0.5 mt-1">
                  <ChevronRight className="w-2 h-2 text-primary-400" />
                  <span className="text-[8px] text-primary-500 font-medium">View Details</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </ScreenWrapper>
  );
}

// ── Payments ──────────────────────────────────────────────────
function PaymentsMockup() {
  return (
    <ScreenWrapper>
      <div className="px-4 pt-2 pb-2">
        <p className="text-[15px] font-bold text-gray-900">Payments</p>
      </div>

      <div className="mx-3 mb-2 bg-amber-50 rounded-lg p-2.5 border border-amber-100/80">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-md bg-amber-100 flex items-center justify-center">
              <CreditCard className="w-3.5 h-3.5 text-amber-600" />
            </div>
            <div>
              <p className="text-[9px] text-amber-700 font-medium">Pending Balance</p>
              <p className="text-[13px] font-bold text-amber-800">{'\u20B9'}2,400</p>
            </div>
          </div>
          <span className="px-2 py-1 bg-amber-200/50 rounded-md text-[8px] font-semibold text-amber-800">Pay Now</span>
        </div>
      </div>

      <div className="flex gap-1.5 px-4 mb-2">
        {['All', 'Pending', 'Paid'].map((f, i) => (
          <span key={f} className={`px-2.5 py-1 rounded-full text-[9px] font-semibold ${i === 0 ? 'bg-primary-500 text-white' : 'bg-white text-gray-500'}`}>{f}</span>
        ))}
      </div>

      <div className="px-3 space-y-1.5">
        {[
          { id: 'INV-0042', doctor: 'Dr. Aditi Mehta', amount: `${'\u20B9'}2,400`, date: 'Mar 20', status: 'Pending', color: 'text-amber-600', bg: 'bg-amber-50' },
          { id: 'INV-0041', doctor: 'Dr. Rajesh Sharma', amount: `${'\u20B9'}800`, date: 'Feb 14', status: 'Paid', color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { id: 'INV-0039', doctor: 'Dr. Sneha Bhosle', amount: `${'\u20B9'}15,000`, date: 'Jan 08', status: 'Paid', color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { id: 'INV-0037', doctor: 'Dr. Priya Chavan', amount: `${'\u20B9'}1,200`, date: 'Dec 12', status: 'Paid', color: 'text-emerald-600', bg: 'bg-emerald-50' },
        ].map((inv) => (
          <div key={inv.id} className="bg-white rounded-lg p-2.5 shadow-sm">
            <div className="flex items-center justify-between mb-1">
              <p className="text-[10px] font-semibold text-gray-900">{inv.id}</p>
              <span className={`text-[8px] font-semibold px-1.5 py-0.5 rounded-full ${inv.bg} ${inv.color}`}>{inv.status}</span>
            </div>
            <p className="text-[9px] text-gray-400 mb-0.5">{inv.doctor}</p>
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-bold text-gray-900">{inv.amount}</span>
              <span className="text-[8px] text-gray-400">{inv.date}</span>
            </div>
          </div>
        ))}
      </div>
    </ScreenWrapper>
  );
}

// ── Profile ───────────────────────────────────────────────────
function ProfileMockup() {
  return (
    <ScreenWrapper>
      <div className="bg-gradient-to-br from-primary-500 to-primary-600 px-4 pt-2.5 pb-8">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center text-[15px] font-bold text-white ring-2 ring-white/25">S</div>
          <div>
            <p className="text-[13px] font-bold text-white">Sarah Johnson</p>
            <p className="text-[9px] text-white/50">Patient ID: PT-00284</p>
          </div>
        </div>
      </div>

      <div className="px-3 -mt-3 space-y-2">
        <div className="bg-white rounded-lg p-2.5 shadow-sm">
          <p className="text-[8px] text-gray-400 font-semibold uppercase tracking-wider mb-1.5">Contact Info</p>
          {[
            { label: 'Email', value: 'sarah.j@email.com' },
            { label: 'Phone', value: '+91 98765 43210' },
            { label: 'Blood Group', value: 'O+' },
          ].map((row) => (
            <div key={row.label} className="flex items-center justify-between py-1 border-b border-gray-50 last:border-0">
              <span className="text-[9px] text-gray-400">{row.label}</span>
              <span className="text-[9px] font-medium text-gray-900">{row.value}</span>
            </div>
          ))}
        </div>

        <div className="bg-white rounded-lg shadow-sm divide-y divide-gray-50">
          {[
            { icon: Bell, label: 'Notifications', badge: '5' },
            { icon: FileText, label: 'Medical Records' },
            { icon: Heart, label: 'Insurance' },
            { icon: Share2, label: 'Share Records' },
          ].map((item) => (
            <div key={item.label} className="flex items-center gap-2.5 px-2.5 py-2">
              <div className="w-6 h-6 rounded-md bg-gray-50 flex items-center justify-center">
                <item.icon className="w-3 h-3 text-gray-500" />
              </div>
              <span className="flex-1 text-[10px] font-medium text-gray-900">{item.label}</span>
              {item.badge && (
                <span className="w-4 h-4 rounded-full bg-rose-500 text-white text-[8px] font-bold flex items-center justify-center">{item.badge}</span>
              )}
              <ChevronRight className="w-2.5 h-2.5 text-gray-300" />
            </div>
          ))}
        </div>
      </div>
    </ScreenWrapper>
  );
}
