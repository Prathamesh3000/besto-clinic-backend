import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Heart, Eye, EyeOff, ArrowRight, ArrowLeft, Mail, Lock,
  CalendarDays, FileText, Pill, Building2, Loader2, CheckCircle2,
} from 'lucide-react';
import { lookupEmail, tenantLoginByClinicId } from '../../tenant/api';
import SEO from '../../components/common/SEO';

const STAFF_ROLES = [
  'admin', 'manager', 'department_manager', 'doctor', 'receptionist',
  'support_staff', 'billing_officer', 'accountant', 'hr_payroll_manager',
  'it_support', 'super_admin',
];

const CAPABILITIES = [
  { icon: CalendarDays, title: 'Appointments', desc: 'Book and manage your dental visits' },
  { icon: FileText, title: 'Health Records', desc: 'Access prescriptions and medical history' },
  { icon: Pill, title: 'Care Reminders', desc: 'Stay on track with medication schedules' },
];

export default function PatientLogin() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [step, setStep] = useState('email'); // 'email' | 'clinic_picker' | 'password'
  const [email, setEmail] = useState(searchParams.get('email') || '');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [clinics, setClinics] = useState([]);
  const [selectedClinic, setSelectedClinic] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Auto-redirect if already authenticated as patient
  useEffect(() => {
    const token = localStorage.getItem('tenant_token');
    const stored = localStorage.getItem('tenant_user');
    if (token && stored) {
      try {
        const user = JSON.parse(stored);
        if (['patient', 'guardian'].includes(user.role)) {
          navigate('/patient', { replace: true });
        }
      } catch { /* ignore */ }
    }
  }, [navigate]);

  // Step 1: Email lookup
  const handleEmailSubmit = async (e) => {
    e.preventDefault();
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError('Please enter a valid email address');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const res = await lookupEmail(trimmed);
      const lookup = res.data || res;
      if (!lookup.found || !lookup.clinics?.length) {
        setError('No account found with this email. Need to register?');
        return;
      }
      // Filter to patient/guardian roles only
      const patientClinics = lookup.clinics.filter(
        (c) => ['patient', 'guardian'].includes(c.role)
      );
      if (patientClinics.length === 0) {
        setError('This email is registered as clinic staff. Please use the Clinic Staff login instead.');
        return;
      }
      setClinics(patientClinics);
      if (patientClinics.length === 1) {
        setSelectedClinic(patientClinics[0]);
        setStep('password');
      } else {
        setStep('clinic_picker');
      }
    } catch (err) {
      setError(err.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  // Step 2: Clinic selection
  const handleClinicSelect = (clinic) => {
    setSelectedClinic(clinic);
    setStep('password');
    setError('');
  };

  // Step 3: Login
  const handleLogin = async (e) => {
    e.preventDefault();
    if (!password) { setError('Please enter your password'); return; }
    if (!selectedClinic) return;

    setError('');
    setLoading(true);
    try {
      const res = await tenantLoginByClinicId(
        email.trim().toLowerCase(), password, selectedClinic.clinicId
      );
      const { accessToken, refreshToken, user, clinic } = res.data;
      const tenantSlug = clinic?.slug || '';

      localStorage.setItem('tenant_token', accessToken);
      localStorage.setItem('tenant_refresh_token', refreshToken);
      localStorage.setItem('tenant_user', JSON.stringify({ ...user, tenantSlug }));
      localStorage.setItem('tenant_slug', tenantSlug);

      // Cross-portal redirect: if user is actually staff, send to clinic portal
      if (STAFF_ROLES.includes(user.role)) {
        navigate(user.role === 'doctor' ? '/clinic/doctor-dashboard' : '/clinic', { replace: true });
        return;
      }

      navigate('/patient', { replace: true });
    } catch (err) {
      setError(err.message || 'Invalid email or password');
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    setError('');
    if (step === 'password') {
      setPassword('');
      setStep(clinics.length > 1 ? 'clinic_picker' : 'email');
    } else if (step === 'clinic_picker') {
      setStep('email');
    }
  };

  const inputClass = (hasError) =>
    `w-full px-4 py-3 rounded-xl border bg-white/80 text-sm text-neutral-900 placeholder:text-neutral-900/30 outline-none transition-all duration-200 focus:ring-2 ${
      hasError
        ? 'border-red-300 focus:border-red-400 focus:ring-red-400/20'
        : 'border-neutral-300/60 focus:border-emerald-400 focus:ring-emerald-400/20'
    }`;

  return (
    <>
      <SEO title="Patient Login" description="Sign in to your BestoClinic patient portal." />
      <div className="min-h-screen flex">
        {/* Left panel -- patient branding (emerald theme) */}
        <div className="hidden lg:flex lg:w-[48%] relative overflow-hidden bg-gradient-to-br from-emerald-800 via-emerald-700 to-emerald-900">
          <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-400/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3" />
          <div className="absolute bottom-0 left-0 w-80 h-80 bg-emerald-300/8 rounded-full blur-3xl translate-y-1/3 -translate-x-1/4" />
          <div className="absolute top-1/2 left-1/2 w-64 h-64 bg-white/5 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2" />
          <div
            className="absolute inset-0 opacity-[0.03]"
            style={{
              backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.8) 1px, transparent 1px)',
              backgroundSize: '32px 32px',
            }}
          />

          <div className="relative flex flex-col justify-between p-12 xl:p-16 w-full">
            <div className="inline-flex items-center gap-3">
              <img src="/platform_admin/logo/Besto Clinic Logo with name.svg" alt="BestoClinic" className="w-10 h-10" />
              <div>
                <span className="text-xl font-bold font-display text-white">BestoClinic</span>
                <span className="ml-2 px-2 py-0.5 rounded-md bg-white/10 text-[10px] font-semibold text-emerald-200 uppercase tracking-wider border border-white/8">
                  Patient
                </span>
              </div>
            </div>

            <div className="flex-1 flex flex-col justify-center max-w-md">
              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/8 backdrop-blur-sm text-xs font-medium text-emerald-200 border border-white/8 mb-6 w-fit">
                <Heart className="h-3.5 w-3.5" /> Patient Portal
              </div>
              <h1 className="text-3xl xl:text-4xl font-bold font-display text-white leading-tight mb-4">
                Your Health, Simplified
              </h1>
              <p className="text-emerald-100/60 text-base leading-relaxed mb-10">
                Access your appointments, prescriptions, health records, and payments — all in one secure portal.
              </p>

              <div className="space-y-5">
                {CAPABILITIES.map((c) => (
                  <div key={c.title} className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-xl bg-white/6 backdrop-blur-sm flex items-center justify-center border border-white/6 shrink-0">
                      <c.icon className="h-5 w-5 text-emerald-300" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-white">{c.title}</p>
                      <p className="text-xs text-emerald-200/50 mt-0.5">{c.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <p className="text-xs text-emerald-300/40">
              Your health data is protected with enterprise-grade encryption.
            </p>
          </div>
        </div>

        {/* Right panel -- login form */}
        <div className="flex-1 flex items-center justify-center bg-neutral-50 px-6 py-6 lg:py-10 relative overflow-y-auto">
          <div className="absolute top-0 right-0 w-72 h-72 bg-emerald-100/20 rounded-full blur-3xl -translate-y-1/2 translate-x-1/4" />
          <div className="absolute bottom-0 left-0 w-56 h-56 bg-emerald-50/30 rounded-full blur-3xl translate-y-1/3" />

          <div className="w-full max-w-[420px] relative">
            {/* Mobile logo */}
            <div className="lg:hidden text-center mb-8">
              <div className="inline-flex items-center justify-center w-14 h-14 bg-gradient-to-br from-emerald-500 to-emerald-700 rounded-2xl mb-3">
                <Heart className="h-7 w-7 text-white" />
              </div>
              <h1 className="text-xl font-bold font-display text-neutral-900">Patient Portal</h1>
              <p className="text-neutral-900/40 text-sm mt-1">BestoClinic</p>
            </div>

            <AnimatePresence mode="wait">
              {/* ── STEP 1: Email ── */}
              {step === 'email' && (
                <motion.div
                  key="email"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.25 }}
                >
                  <div className="mb-8 hidden lg:block">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-11 h-11 bg-gradient-to-br from-emerald-500 to-emerald-700 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-600/20">
                        <Mail className="h-5 w-5 text-white" />
                      </div>
                      <div>
                        <h2 className="text-xl font-bold font-display text-neutral-900">Welcome back</h2>
                        <p className="text-neutral-900/40 text-xs">Enter your email to continue</p>
                      </div>
                    </div>
                  </div>

                  <form onSubmit={handleEmailSubmit} className="bg-white/70 backdrop-blur-xl rounded-2xl border border-neutral-300/60 shadow-[var(--shadow-lg)] p-7 space-y-5">
                    {error && (
                      <div className="flex items-center gap-2.5 bg-red-50 text-red-700 px-4 py-3 rounded-xl text-sm border border-red-100">
                        <div className="w-6 h-6 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                          <span className="text-xs font-bold">!</span>
                        </div>
                        <span>{error}</span>
                      </div>
                    )}

                    <div>
                      <label className="block text-sm font-medium text-neutral-900/70 mb-1.5">Email address</label>
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => { setEmail(e.target.value); setError(''); }}
                        required
                        autoFocus
                        className={inputClass(false)}
                        placeholder="you@example.com"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full py-3 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white font-semibold rounded-xl transition-all duration-300 disabled:opacity-50 shadow-md shadow-emerald-600/20 flex items-center justify-center gap-2"
                    >
                      {loading ? (
                        <><Loader2 className="w-4 h-4 animate-spin" /> Looking up...</>
                      ) : (
                        <>Continue <ArrowRight className="w-4 h-4" /></>
                      )}
                    </button>
                  </form>

                  <div className="mt-6 text-center space-y-3">
                    <p className="text-sm text-neutral-900/40">
                      Are you clinic staff?{' '}
                      <Link to="/clinic/login" className="text-primary-600 hover:text-primary-700 font-semibold">
                        Sign in here
                      </Link>
                    </p>
                    <p className="text-sm text-neutral-900/40">
                      Don't have an account?{' '}
                      <Link to="/patient/register" className="text-emerald-600 hover:text-emerald-700 font-semibold">
                        Register
                      </Link>
                    </p>
                  </div>
                </motion.div>
              )}

              {/* ── STEP 2: Clinic Picker ── */}
              {step === 'clinic_picker' && (
                <motion.div
                  key="picker"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.25 }}
                >
                  <button onClick={handleBack} className="flex items-center gap-1.5 text-sm text-neutral-900/40 hover:text-neutral-900/60 mb-6 transition">
                    <ArrowLeft className="w-4 h-4" /> Back
                  </button>

                  <div className="mb-6">
                    <h2 className="text-xl font-bold font-display text-neutral-900">Choose your clinic</h2>
                    <p className="text-neutral-900/40 text-sm mt-1">Your email is linked to multiple clinics</p>
                  </div>

                  <div className="space-y-3">
                    {clinics.map((clinic) => (
                      <button
                        key={clinic.clinicId}
                        onClick={() => handleClinicSelect(clinic)}
                        className="w-full flex items-center gap-4 p-4 bg-white/70 backdrop-blur-xl rounded-2xl border border-neutral-300/60 hover:border-emerald-200/60 hover:shadow-md transition-all duration-200 text-left"
                      >
                        <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0">
                          {clinic.clinicLogo ? (
                            <img src={clinic.clinicLogo} alt="" className="w-8 h-8 object-contain" />
                          ) : (
                            <Building2 className="w-5 h-5 text-emerald-600" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-neutral-900 truncate">{clinic.clinicName}</p>
                          <p className="text-xs text-neutral-900/30 mt-0.5">{clinic.clinicCode}</p>
                        </div>
                        <ArrowRight className="w-4 h-4 text-neutral-900/20 shrink-0" />
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}

              {/* ── STEP 3: Password ── */}
              {step === 'password' && (
                <motion.div
                  key="password"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.25 }}
                >
                  <button onClick={handleBack} className="flex items-center gap-1.5 text-sm text-neutral-900/40 hover:text-neutral-900/60 mb-6 transition">
                    <ArrowLeft className="w-4 h-4" /> Back
                  </button>

                  <div className="mb-6">
                    <div className="flex items-center gap-3 mb-4 hidden lg:flex">
                      <div className="w-11 h-11 bg-gradient-to-br from-emerald-500 to-emerald-700 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-600/20">
                        <Lock className="h-5 w-5 text-white" />
                      </div>
                      <div>
                        <h2 className="text-xl font-bold font-display text-neutral-900">Enter your password</h2>
                        <p className="text-neutral-900/40 text-xs">Almost there</p>
                      </div>
                    </div>
                    <h2 className="text-xl font-bold font-display text-neutral-900 lg:hidden">Enter your password</h2>

                    {/* Selected clinic banner */}
                    {selectedClinic && (
                      clinics.length > 1 ? (
                        <button
                          onClick={handleBack}
                          className="mt-3 flex items-center gap-3 w-full px-4 py-3 bg-emerald-50 rounded-xl text-left hover:bg-emerald-100/80 transition"
                        >
                          <div className="w-9 h-9 rounded-lg bg-white flex items-center justify-center shrink-0">
                            {selectedClinic.clinicLogo ? (
                              <img src={selectedClinic.clinicLogo} alt="" className="w-6 h-6 object-contain" />
                            ) : (
                              <Building2 className="w-4 h-4 text-emerald-600" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-emerald-800 truncate">{selectedClinic.clinicName}</p>
                            <p className="text-[11px] text-emerald-600/60">{selectedClinic.clinicCode}</p>
                          </div>
                          <span className="text-xs text-emerald-600 font-medium">Change</span>
                        </button>
                      ) : (
                        <div className="mt-3 flex items-center gap-3 w-full px-4 py-3 bg-emerald-50 rounded-xl">
                          <div className="w-9 h-9 rounded-lg bg-white flex items-center justify-center shrink-0">
                            {selectedClinic.clinicLogo ? (
                              <img src={selectedClinic.clinicLogo} alt="" className="w-6 h-6 object-contain" />
                            ) : (
                              <Building2 className="w-4 h-4 text-emerald-600" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-emerald-800 truncate">{selectedClinic.clinicName}</p>
                            <p className="text-[11px] text-emerald-600/60">{selectedClinic.clinicCode}</p>
                          </div>
                          <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                        </div>
                      )
                    )}
                  </div>

                  <form onSubmit={handleLogin} className="bg-white/70 backdrop-blur-xl rounded-2xl border border-neutral-300/60 shadow-[var(--shadow-lg)] p-7 space-y-5">
                    {error && (
                      <div className="flex items-center gap-2.5 bg-red-50 text-red-700 px-4 py-3 rounded-xl text-sm border border-red-100">
                        <div className="w-6 h-6 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                          <span className="text-xs font-bold">!</span>
                        </div>
                        <span>{error}</span>
                      </div>
                    )}

                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="block text-sm font-medium text-neutral-900/70">Password</label>
                        <Link to="#" className="text-xs text-emerald-600 hover:text-emerald-700 font-medium">
                          Forgot password?
                        </Link>
                      </div>
                      <div className="relative">
                        <input
                          type={showPw ? 'text' : 'password'}
                          value={password}
                          onChange={(e) => { setPassword(e.target.value); setError(''); }}
                          required
                          autoFocus
                          className={`${inputClass(false)} pr-11`}
                          placeholder="Enter your password"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPw(!showPw)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-900/30 hover:text-neutral-900/50 transition-colors"
                        >
                          {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full py-3 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white font-semibold rounded-xl transition-all duration-300 disabled:opacity-50 shadow-md shadow-emerald-600/20 flex items-center justify-center gap-2"
                    >
                      {loading ? (
                        <><Loader2 className="w-4 h-4 animate-spin" /> Signing in...</>
                      ) : (
                        <>Sign In <ArrowRight className="w-4 h-4" /></>
                      )}
                    </button>
                  </form>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </>
  );
}
