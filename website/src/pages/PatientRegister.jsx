import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Heart, UserPlus, Eye, EyeOff, ArrowRight, ArrowLeft, Search, Lock,
  CalendarDays, FileText, Shield, Building2, Loader2, CheckCircle2, User, Users,
} from 'lucide-react';
import {
  tenantRegister, resolveClinicCode, platformRegister, connectToClinic, lookupEmail,
} from '../tenant/api';
import SEO from '../components/common/SEO';

const VALUE_PROPS = [
  { icon: CalendarDays, title: 'Book Appointments', desc: 'Schedule visits with your preferred doctors' },
  { icon: FileText, title: 'Access Health Records', desc: 'View prescriptions and medical history anytime' },
  { icon: Shield, title: 'Secure & Private', desc: 'Your data is encrypted and protected' },
];

export default function PatientRegister() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  // Chatbot funnel params
  const clinicSlug = searchParams.get('clinic') || '';
  const doctorId = searchParams.get('doctor') || '';
  const platformId = searchParams.get('platformId') || '';
  const isFunnelMode = !!(clinicSlug && doctorId);

  // Steps: 'find_clinic' | 'register' | 'connect'
  const [step, setStep] = useState(isFunnelMode ? 'register' : 'find_clinic');

  // Clinic state
  const [clinicCode, setClinicCode] = useState('');
  const [clinic, setClinic] = useState(null);

  // Connect mode state (existing platform patient joining new clinic)
  const [connectEmail, setConnectEmail] = useState('');

  // Role state (patient registers for themselves, guardian manages dependents)
  const [role, setRole] = useState('patient');

  // Form state
  const [form, setForm] = useState({
    name: searchParams.get('name') || '',
    email: searchParams.get('email') || '',
    phone: searchParams.get('phone') || '',
    password: '',
    confirmPassword: '',
  });
  const [showPw, setShowPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);
  const [errors, setErrors] = useState({});
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

  // Store tokens + redirect after successful auth
  const handleAuthSuccess = (data) => {
    const { accessToken, refreshToken, user, clinic: resClinic } = data;
    const slug = resClinic?.slug || clinicSlug;

    localStorage.setItem('tenant_token', accessToken);
    localStorage.setItem('tenant_refresh_token', refreshToken);
    localStorage.setItem('tenant_user', JSON.stringify({ ...user, tenantSlug: slug }));
    localStorage.setItem('tenant_slug', slug);
    localStorage.setItem('platform_patient_email', (user.email || form.email).toLowerCase());

    if (isFunnelMode) {
      navigate(
        `/clinics/${clinicSlug}/doctors/${doctorId}${platformId ? `?platformId=${platformId}` : ''}`,
        { replace: true },
      );
    } else {
      navigate('/patient', { replace: true });
    }
  };

  // Step 1: Resolve clinic code
  const handleFindClinic = async (e) => {
    e.preventDefault();
    const code = clinicCode.trim();
    if (!code || code.length < 4) {
      setError('Please enter a valid clinic code (e.g. SMILE2847)');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const res = await resolveClinicCode(code);
      if (!res.data?.found) {
        setError('No clinic found with this code. Please check and try again.');
        return;
      }
      setClinic(res.data);

      // Check if user has a platform identity (for connect flow)
      const storedEmail = localStorage.getItem('platform_patient_email');
      if (storedEmail) {
        setConnectEmail(storedEmail);
        setStep('connect');
      } else {
        setStep('register');
      }
    } catch (err) {
      setError(err.message || 'Could not find clinic. Please check the code.');
    } finally {
      setLoading(false);
    }
  };

  // Validate registration form
  const validate = () => {
    const e = {};
    if (!form.name.trim() || form.name.trim().length < 2) e.name = 'Name is required (min 2 characters)';
    if (!form.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = 'Valid email is required';
    if (!form.phone.trim() || form.phone.replace(/\D/g, '').length < 10) e.phone = 'Valid phone number required (min 10 digits)';
    if (!form.password || form.password.length < 8) e.password = 'Password must be at least 8 characters';
    if (form.password !== form.confirmPassword) e.confirmPassword = 'Passwords do not match';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  // Register (platform-aware)
  const handleRegister = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    setError('');
    setLoading(true);

    try {
      const payload = {
        name: form.name.trim(),
        email: form.email.trim().toLowerCase(),
        phone: form.phone.trim(),
        password: form.password,
        role,
      };

      let res;
      if (isFunnelMode) {
        // Chatbot funnel: use slug-based register for backward compat
        res = await tenantRegister(payload, clinicSlug);
      } else {
        // Standalone: use platform-aware register
        res = await platformRegister({ ...payload, clinicId: clinic.clinicId });
      }

      handleAuthSuccess(res.data);
    } catch (err) {
      // If PLATFORM_EMAIL_EXISTS, switch to connect mode
      if (err.code === 'PLATFORM_EMAIL_EXISTS') {
        setConnectEmail(form.email.trim().toLowerCase());
        setStep('connect');
        setError('');
        return;
      }
      setError(err.message || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Connect existing patient to new clinic
  const handleConnect = async (e) => {
    e.preventDefault();
    if (!form.password) { setError('Please enter your password'); return; }

    setError('');
    setLoading(true);

    try {
      const clinicId = clinic?.clinicId;
      if (!clinicId) { setError('Please select a clinic first'); return; }

      const res = await connectToClinic({
        email: connectEmail,
        password: form.password,
        clinicId,
      });

      handleAuthSuccess(res.data);
    } catch (err) {
      setError(err.message || 'Could not connect to clinic. Please check your password.');
    } finally {
      setLoading(false);
    }
  };

  const set = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: '' }));
  };

  const inputClass = (hasError) =>
    `w-full px-4 py-3 rounded-xl border bg-white/80 text-sm text-neutral-900 placeholder:text-neutral-900/30 outline-none transition-all duration-200 focus:ring-2 ${
      hasError
        ? 'border-red-300 focus:border-red-400 focus:ring-red-400/20'
        : 'border-neutral-300/60 focus:border-emerald-400 focus:ring-emerald-400/20'
    }`;

  // Clinic banner component
  const ClinicBanner = ({ clickable }) => {
    if (isFunnelMode) {
      return (
        <div className="mt-3 flex items-center gap-3 px-4 py-3 bg-emerald-50 rounded-xl">
          <div className="w-9 h-9 rounded-lg bg-white flex items-center justify-center shrink-0">
            <Building2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-emerald-800 truncate">
              {clinicSlug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
            </p>
          </div>
          <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
        </div>
      );
    }
    if (!clinic) return null;
    const content = (
      <>
        <div className="w-9 h-9 rounded-lg bg-white flex items-center justify-center shrink-0">
          {clinic.clinicLogo ? (
            <img src={clinic.clinicLogo} alt="" className="w-6 h-6 object-contain" />
          ) : (
            <Building2 className="w-4 h-4 text-emerald-600" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-emerald-800 truncate">{clinic.clinicName}</p>
          <p className="text-[11px] text-emerald-600/60">{clinic.clinicCode}</p>
        </div>
        {clickable && <span className="text-xs text-emerald-600 font-medium">Change</span>}
        {!clickable && <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />}
      </>
    );
    if (clickable) {
      return (
        <button
          onClick={() => { setStep('find_clinic'); setError(''); setErrors({}); }}
          className="mt-3 flex items-center gap-3 w-full px-4 py-3 bg-emerald-50 rounded-xl text-left hover:bg-emerald-100/80 transition"
        >
          {content}
        </button>
      );
    }
    return <div className="mt-3 flex items-center gap-3 px-4 py-3 bg-emerald-50 rounded-xl">{content}</div>;
  };

  return (
    <>
      <SEO title="Patient Registration — BestoClinic" description="Create your patient account to access your clinic's health portal." />
      <div className="min-h-screen flex">
        {/* ── Left Panel (emerald branding) ── */}
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
                <Heart className="h-3.5 w-3.5" /> Patient Registration
              </div>
              <h1 className="text-3xl xl:text-4xl font-bold font-display text-white leading-tight mb-4">
                Join Your Clinic's Portal
              </h1>
              <p className="text-emerald-100/60 text-base leading-relaxed mb-10">
                Create your account to book appointments, access health records, and manage your care — all in one secure place.
              </p>

              <div className="space-y-5">
                {VALUE_PROPS.map((v) => (
                  <div key={v.title} className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-xl bg-white/6 backdrop-blur-sm flex items-center justify-center border border-white/6 shrink-0">
                      <v.icon className="h-5 w-5 text-emerald-300" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-white">{v.title}</p>
                      <p className="text-xs text-emerald-200/50 mt-0.5">{v.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <p className="text-xs text-emerald-300/40">
              Your data is encrypted and protected with enterprise-grade security.
            </p>
          </div>
        </div>

        {/* ── Right Panel (form) ── */}
        <div className="flex-1 flex items-center justify-center bg-neutral-50 px-6 py-6 lg:py-10 relative overflow-y-auto">
          <div className="absolute top-0 right-0 w-72 h-72 bg-emerald-100/20 rounded-full blur-3xl -translate-y-1/2 translate-x-1/4" />
          <div className="absolute bottom-0 left-0 w-56 h-56 bg-emerald-50/30 rounded-full blur-3xl translate-y-1/3" />

          <div className="w-full max-w-[420px] relative">
            {/* Mobile logo */}
            <div className="lg:hidden text-center mb-8">
              <div className="inline-flex items-center justify-center w-14 h-14 bg-gradient-to-br from-emerald-500 to-emerald-700 rounded-2xl mb-3">
                <UserPlus className="h-7 w-7 text-white" />
              </div>
              <h1 className="text-xl font-bold font-display text-neutral-900">Create Account</h1>
              <p className="text-neutral-900/40 text-sm mt-1">BestoClinic Patient Portal</p>
            </div>

            <AnimatePresence mode="wait">
              {/* ── STEP 1: Find Clinic ── */}
              {step === 'find_clinic' && (
                <motion.div
                  key="find_clinic"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.25 }}
                >
                  <div className="mb-8 hidden lg:block">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-11 h-11 bg-gradient-to-br from-emerald-500 to-emerald-700 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-600/20">
                        <Search className="h-5 w-5 text-white" />
                      </div>
                      <div>
                        <h2 className="text-xl font-bold font-display text-neutral-900">Find your clinic</h2>
                        <p className="text-neutral-900/40 text-xs">Enter the clinic code provided by your clinic</p>
                      </div>
                    </div>
                  </div>

                  <form onSubmit={handleFindClinic} className="bg-white/70 backdrop-blur-xl rounded-2xl border border-neutral-300/60 shadow-[var(--shadow-lg)] p-7 space-y-5">
                    {error && (
                      <div className="flex items-center gap-2.5 bg-red-50 text-red-700 px-4 py-3 rounded-xl text-sm border border-red-100">
                        <div className="w-6 h-6 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                          <span className="text-xs font-bold">!</span>
                        </div>
                        <span>{error}</span>
                      </div>
                    )}

                    <div>
                      <label className="block text-sm font-medium text-neutral-900/70 mb-1.5">Clinic Code</label>
                      <input
                        type="text"
                        value={clinicCode}
                        onChange={(e) => { setClinicCode(e.target.value.toUpperCase()); setError(''); }}
                        autoFocus
                        className={`${inputClass(!!error)} uppercase tracking-widest font-mono text-center text-base`}
                        placeholder="e.g. SMILE2847"
                        maxLength={12}
                      />
                      <p className="text-xs text-neutral-900/30 mt-2">
                        Ask your clinic's reception desk for your clinic code, or{' '}
                        <Link to="/browse" className="text-emerald-600 hover:text-emerald-700 font-medium">browse doctors near you</Link>.
                      </p>
                    </div>

                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full py-3 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white font-semibold rounded-xl transition-all duration-300 disabled:opacity-50 shadow-md shadow-emerald-600/20 flex items-center justify-center gap-2"
                    >
                      {loading ? (
                        <><Loader2 className="w-4 h-4 animate-spin" /> Finding clinic...</>
                      ) : (
                        <>Find My Clinic <ArrowRight className="w-4 h-4" /></>
                      )}
                    </button>
                  </form>

                  <div className="mt-6 text-center space-y-3">
                    <p className="text-sm text-neutral-900/40">
                      Already have an account?{' '}
                      <Link to="/patient/login" className="text-emerald-600 hover:text-emerald-700 font-semibold">
                        Sign in
                      </Link>
                    </p>
                    <p className="text-sm text-neutral-900/40">
                      Are you clinic staff?{' '}
                      <Link to="/clinic/login" className="text-primary-600 hover:text-primary-700 font-semibold">
                        Staff login
                      </Link>
                    </p>
                  </div>
                </motion.div>
              )}

              {/* ── STEP 2: Registration Form ── */}
              {step === 'register' && (
                <motion.div
                  key="register"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.25 }}
                >
                  {!isFunnelMode && (
                    <button
                      onClick={() => { setStep('find_clinic'); setError(''); setErrors({}); }}
                      className="flex items-center gap-1.5 text-sm text-neutral-900/40 hover:text-neutral-900/60 mb-6 transition"
                    >
                      <ArrowLeft className="w-4 h-4" /> Change clinic
                    </button>
                  )}

                  {isFunnelMode && (
                    <Link
                      to={`/clinics/${clinicSlug}/doctors/${doctorId}${platformId ? `?platformId=${platformId}` : ''}`}
                      className="inline-flex items-center gap-1.5 text-sm text-neutral-900/40 hover:text-neutral-900/60 mb-6 transition"
                    >
                      <ArrowLeft className="w-4 h-4" /> Back to Doctor Profile
                    </Link>
                  )}

                  <div className="mb-6">
                    <div className="flex items-center gap-3 mb-4 hidden lg:flex">
                      <div className="w-11 h-11 bg-gradient-to-br from-emerald-500 to-emerald-700 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-600/20">
                        <UserPlus className="h-5 w-5 text-white" />
                      </div>
                      <div>
                        <h2 className="text-xl font-bold font-display text-neutral-900">Create your account</h2>
                        <p className="text-neutral-900/40 text-xs">Fill in your details to get started</p>
                      </div>
                    </div>
                    <ClinicBanner clickable={!isFunnelMode} />
                  </div>

                  <form onSubmit={handleRegister} className="bg-white/70 backdrop-blur-xl rounded-2xl border border-neutral-300/60 shadow-[var(--shadow-lg)] p-7 space-y-4">
                    {/* Role picker */}
                    <div>
                      <label className="block text-sm font-medium text-neutral-900/70 mb-2">I am registering</label>
                      <div className="grid grid-cols-2 gap-3">
                        <button
                          type="button"
                          onClick={() => setRole('patient')}
                          className={`p-3.5 rounded-xl border-2 text-left transition-all duration-200 ${
                            role === 'patient'
                              ? 'border-emerald-500 bg-emerald-50/80 shadow-sm shadow-emerald-100'
                              : 'border-neutral-200 hover:border-neutral-300 bg-white/60'
                          }`}
                        >
                          <User className={`w-4.5 h-4.5 mb-1.5 ${role === 'patient' ? 'text-emerald-600' : 'text-neutral-400'}`} />
                          <p className={`font-semibold text-sm ${role === 'patient' ? 'text-emerald-800' : 'text-neutral-700'}`}>For myself</p>
                          <p className="text-[11px] text-neutral-500 mt-0.5">I am a patient</p>
                        </button>
                        <button
                          type="button"
                          onClick={() => setRole('guardian')}
                          className={`p-3.5 rounded-xl border-2 text-left transition-all duration-200 ${
                            role === 'guardian'
                              ? 'border-emerald-500 bg-emerald-50/80 shadow-sm shadow-emerald-100'
                              : 'border-neutral-200 hover:border-neutral-300 bg-white/60'
                          }`}
                        >
                          <Users className={`w-4.5 h-4.5 mb-1.5 ${role === 'guardian' ? 'text-emerald-600' : 'text-neutral-400'}`} />
                          <p className={`font-semibold text-sm ${role === 'guardian' ? 'text-emerald-800' : 'text-neutral-700'}`}>For my family</p>
                          <p className="text-[11px] text-neutral-500 mt-0.5">Managing a dependent</p>
                        </button>
                      </div>
                    </div>

                    {error && (
                      <div className="flex items-center gap-2.5 bg-red-50 text-red-700 px-4 py-3 rounded-xl text-sm border border-red-100">
                        <div className="w-6 h-6 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                          <span className="text-xs font-bold">!</span>
                        </div>
                        <span>
                          {error}
                          {error.toLowerCase().includes('already registered') && (
                            <>
                              {' '}<Link to="/patient/login" className="text-emerald-600 font-semibold underline">Sign in instead</Link>
                            </>
                          )}
                        </span>
                      </div>
                    )}

                    <div>
                      <label className="block text-sm font-medium text-neutral-900/70 mb-1.5">Full Name</label>
                      <input type="text" value={form.name} onChange={(e) => set('name', e.target.value)} className={inputClass(!!errors.name)} placeholder="John Doe" autoFocus={isFunnelMode} />
                      {errors.name && <p className="text-xs text-red-600 mt-1">{errors.name}</p>}
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-neutral-900/70 mb-1.5">Email</label>
                      <input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} className={inputClass(!!errors.email)} placeholder="you@example.com" />
                      {errors.email && <p className="text-xs text-red-600 mt-1">{errors.email}</p>}
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-neutral-900/70 mb-1.5">Phone</label>
                      <input type="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)} className={inputClass(!!errors.phone)} placeholder="+91 9876543210" />
                      {errors.phone && <p className="text-xs text-red-600 mt-1">{errors.phone}</p>}
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-neutral-900/70 mb-1.5">Password</label>
                      <div className="relative">
                        <input type={showPw ? 'text' : 'password'} value={form.password} onChange={(e) => set('password', e.target.value)} className={`${inputClass(!!errors.password)} pr-11`} placeholder="Min 8 characters" />
                        <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-900/30 hover:text-neutral-900/50 transition-colors">
                          {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                      {errors.password && <p className="text-xs text-red-600 mt-1">{errors.password}</p>}
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-neutral-900/70 mb-1.5">Confirm Password</label>
                      <div className="relative">
                        <input type={showConfirmPw ? 'text' : 'password'} value={form.confirmPassword} onChange={(e) => set('confirmPassword', e.target.value)} className={`${inputClass(!!errors.confirmPassword)} pr-11`} placeholder="Re-enter password" />
                        <button type="button" onClick={() => setShowConfirmPw(!showConfirmPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-900/30 hover:text-neutral-900/50 transition-colors">
                          {showConfirmPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                      {errors.confirmPassword && <p className="text-xs text-red-600 mt-1">{errors.confirmPassword}</p>}
                    </div>

                    <button type="submit" disabled={loading} className="w-full py-3 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white font-semibold rounded-xl transition-all duration-300 disabled:opacity-50 shadow-md shadow-emerald-600/20 flex items-center justify-center gap-2 mt-2">
                      {loading ? (
                        <><Loader2 className="w-4 h-4 animate-spin" /> Creating account...</>
                      ) : (
                        <>{isFunnelMode ? 'Create Account & Book' : 'Create Account'} <ArrowRight className="w-4 h-4" /></>
                      )}
                    </button>
                  </form>

                  <div className="mt-6 text-center space-y-3">
                    <p className="text-sm text-neutral-900/40">
                      Already have an account?{' '}
                      <Link to="/patient/login" className="text-emerald-600 hover:text-emerald-700 font-semibold">Sign in</Link>
                    </p>
                    <p className="text-sm text-neutral-900/40">
                      Are you clinic staff?{' '}
                      <Link to="/clinic/login" className="text-primary-600 hover:text-primary-700 font-semibold">Staff login</Link>
                    </p>
                  </div>
                </motion.div>
              )}

              {/* ── STEP 3: Connect (existing platform patient → new clinic) ── */}
              {step === 'connect' && (
                <motion.div
                  key="connect"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.25 }}
                >
                  <button
                    onClick={() => { setStep('find_clinic'); setError(''); }}
                    className="flex items-center gap-1.5 text-sm text-neutral-900/40 hover:text-neutral-900/60 mb-6 transition"
                  >
                    <ArrowLeft className="w-4 h-4" /> Change clinic
                  </button>

                  <div className="mb-6">
                    <div className="flex items-center gap-3 mb-4 hidden lg:flex">
                      <div className="w-11 h-11 bg-gradient-to-br from-emerald-500 to-emerald-700 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-600/20">
                        <Lock className="h-5 w-5 text-white" />
                      </div>
                      <div>
                        <h2 className="text-xl font-bold font-display text-neutral-900">Welcome back!</h2>
                        <p className="text-neutral-900/40 text-xs">Enter your password to connect to this clinic</p>
                      </div>
                    </div>
                    <ClinicBanner clickable={false} />
                  </div>

                  <form onSubmit={handleConnect} className="bg-white/70 backdrop-blur-xl rounded-2xl border border-neutral-300/60 shadow-[var(--shadow-lg)] p-7 space-y-5">
                    {error && (
                      <div className="flex items-center gap-2.5 bg-red-50 text-red-700 px-4 py-3 rounded-xl text-sm border border-red-100">
                        <div className="w-6 h-6 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                          <span className="text-xs font-bold">!</span>
                        </div>
                        <span>{error}</span>
                      </div>
                    )}

                    <div>
                      <label className="block text-sm font-medium text-neutral-900/70 mb-1.5">Email</label>
                      <input
                        type="email"
                        value={connectEmail}
                        readOnly
                        className={`${inputClass(false)} bg-neutral-100/60 text-neutral-900/60`}
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-neutral-900/70 mb-1.5">Password</label>
                      <div className="relative">
                        <input
                          type={showPw ? 'text' : 'password'}
                          value={form.password}
                          onChange={(e) => { set('password', e.target.value); setError(''); }}
                          autoFocus
                          className={`${inputClass(false)} pr-11`}
                          placeholder="Enter your existing password"
                        />
                        <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-900/30 hover:text-neutral-900/50 transition-colors">
                          {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>

                    <button type="submit" disabled={loading} className="w-full py-3 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white font-semibold rounded-xl transition-all duration-300 disabled:opacity-50 shadow-md shadow-emerald-600/20 flex items-center justify-center gap-2">
                      {loading ? (
                        <><Loader2 className="w-4 h-4 animate-spin" /> Connecting...</>
                      ) : (
                        <>Connect to Clinic <ArrowRight className="w-4 h-4" /></>
                      )}
                    </button>
                  </form>

                  <div className="mt-6 text-center">
                    <p className="text-sm text-neutral-900/40">
                      Not your account?{' '}
                      <button
                        onClick={() => {
                          setConnectEmail('');
                          localStorage.removeItem('platform_patient_email');
                          setStep('register');
                          setError('');
                        }}
                        className="text-emerald-600 hover:text-emerald-700 font-semibold"
                      >
                        Register with a different email
                      </button>
                    </p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </>
  );
}
