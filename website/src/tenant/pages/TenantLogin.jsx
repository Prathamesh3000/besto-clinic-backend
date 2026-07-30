import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useTenantAuth } from '../TenantAuthContext';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Building2, Eye, EyeOff, Lock, ArrowRight, ArrowLeft, CalendarDays,
  Users, Stethoscope, Mail, Loader2, Heart,
} from 'lucide-react';
import { resolveAssetUrl } from '../../lib/assetUrl';

const CAPABILITIES = [
  { icon: CalendarDays, title: 'Appointment Management', desc: 'Schedule, track & manage patient appointments' },
  { icon: Users, title: 'Patient Records', desc: 'Centralized patient data & medical history' },
  { icon: Stethoscope, title: 'Doctor & Staff Portal', desc: 'Manage your clinical team efficiently' },
];

function redirectByRole(userData, navigate) {
  if (['patient', 'guardian'].includes(userData.role)) {
    navigate('/patient', { replace: true });
  } else if (userData.role === 'doctor') {
    navigate('/clinic/doctor-dashboard', { replace: true });
  } else {
    navigate('/clinic', { replace: true });
  }
}

export default function TenantLogin() {
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [clinicCode, setClinicCode] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [touched, setTouched] = useState({});
  const { login, loginByClinicId, lookupEmail, isAuthenticated, user: authUser, loading: authLoading } = useTenantAuth();
  const navigate = useNavigate();

  // Auto-redirect if already authenticated
  useEffect(() => {
    if (!authLoading && isAuthenticated && authUser) {
      redirectByRole(authUser, navigate);
    }
  }, [authLoading, isAuthenticated, authUser, navigate]);

  // ─── Email-first mode state ──────────────────
  const [loginMode, setLoginMode] = useState('code'); // 'code' | 'email'
  const [emailStep, setEmailStep] = useState('input'); // 'input' | 'clinic_picker' | 'password'
  const [clinics, setClinics] = useState([]);
  const [selectedClinic, setSelectedClinic] = useState(null);

  // Auto-fill from URL params (e.g. after registration redirect)
  useEffect(() => {
    const code = searchParams.get('clinicCode');
    const emailParam = searchParams.get('email');
    if (code) {
      setClinicCode(code);
      setLoginMode('code');
    }
    if (emailParam) setEmail(emailParam);
  }, [searchParams]);

  // ─── Clinic Code login (existing flow) ───────
  const handleCodeSubmit = async (e) => {
    e.preventDefault();
    setTouched({ email: true, password: true, clinicCode: true });
    if (!email || !password || !clinicCode) return;
    setError('');
    setLoading(true);
    try {
      const userData = await login(email, password, clinicCode);
      redirectByRole(userData, navigate);
    } catch (err) {
      setError(err.message || 'Invalid credentials or clinic not found');
    } finally {
      setLoading(false);
    }
  };

  // ─── Email-first: Step 1 – Lookup email ──────
  const handleEmailLookup = async (e) => {
    e.preventDefault();
    if (!email) {
      setTouched((p) => ({ ...p, email: true }));
      return;
    }
    setError('');
    setLoading(true);
    try {
      const data = await lookupEmail(email);
      if (!data.found || !data.clinics?.length) {
        setError('No account found with this email. Please check and try again.');
        return;
      }

      // Filter to staff/admin roles (exclude patient/guardian — they should use patient login)
      const staffClinics = data.clinics.filter(
        (c) => !['patient', 'guardian'].includes(c.role)
      );

      if (staffClinics.length === 0) {
        setError('This email is registered as a patient. Please use the Patient Portal login instead.');
        return;
      }

      setClinics(staffClinics);
      if (staffClinics.length === 1) {
        setSelectedClinic(staffClinics[0]);
        setEmailStep('password');
      } else {
        setEmailStep('clinic_picker');
      }
    } catch (err) {
      setError(err.message || 'Failed to look up email');
    } finally {
      setLoading(false);
    }
  };

  // ─── Email-first: Step 2 – Select clinic ─────
  const handleSelectClinic = (clinic) => {
    setSelectedClinic(clinic);
    setEmailStep('password');
    setError('');
  };

  // ─── Email-first: Step 3 – Password login ────
  const handleEmailPasswordSubmit = async (e) => {
    e.preventDefault();
    if (!password) {
      setTouched((p) => ({ ...p, password: true }));
      return;
    }
    setError('');
    setLoading(true);
    try {
      const userData = await loginByClinicId(email, password, selectedClinic.clinicId);
      redirectByRole(userData, navigate);
    } catch (err) {
      setError(err.message || 'Invalid credentials');
    } finally {
      setLoading(false);
    }
  };

  // ─── Mode/step reset ─────────────────────────
  const switchMode = (mode) => {
    setLoginMode(mode);
    setError('');
    setEmailStep('input');
    setClinics([]);
    setSelectedClinic(null);
    setPassword('');
    setTouched({});
  };

  const goBackEmailStep = () => {
    setError('');
    setPassword('');
    if (emailStep === 'password' && clinics.length > 1) {
      setEmailStep('clinic_picker');
      setSelectedClinic(null);
    } else {
      setEmailStep('input');
      setClinics([]);
      setSelectedClinic(null);
    }
  };

  const getInputClass = (field) => {
    const validators = {
      email: touched.email && !email,
      password: touched.password && !password,
      clinicCode: touched.clinicCode && !clinicCode,
    };
    const hasError = validators[field];
    return `w-full px-4 py-3 rounded-xl border bg-white/80 text-sm text-neutral-900 placeholder:text-neutral-900/30 outline-none transition-all duration-200 focus:ring-2 ${
      hasError
        ? 'border-red-300 focus:border-red-400 focus:ring-red-400/20'
        : 'border-neutral-300/60 focus:border-primary-400 focus:ring-primary-400/20'
    }`;
  };

  // ─── Animation variants ──────────────────────
  const fadeSlide = {
    initial: { opacity: 0, x: 20 },
    animate: { opacity: 1, x: 0, transition: { duration: 0.25, ease: 'easeOut' } },
    exit: { opacity: 0, x: -20, transition: { duration: 0.15 } },
  };

  // ─── Render form based on mode ───────────────
  const renderForm = () => {
    if (loginMode === 'code') {
      return (
        <motion.form key="code-form" {...fadeSlide} onSubmit={handleCodeSubmit} className="space-y-5">
          {/* Clinic Code */}
          <div>
            <label className="block text-sm font-medium text-neutral-900/70 mb-1.5">Clinic Code</label>
            <div className="relative">
              <input
                type="text"
                value={clinicCode}
                onChange={(e) => {
                  setClinicCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''));
                  if (error) setError('');
                }}
                onBlur={() => setTouched((p) => ({ ...p, clinicCode: true }))}
                required
                className={getInputClass('clinicCode')}
                placeholder="e.g. SMILE2847"
              />
              <Building2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-900/20" />
            </div>
            {touched.clinicCode && !clinicCode ? (
              <p className="text-xs text-red-500 mt-1.5">Clinic code is required</p>
            ) : (
              <p className="text-[11px] text-neutral-900/30 mt-1.5">The unique code provided during registration</p>
            )}
          </div>

          {/* Email */}
          <div>
            <label className="block text-sm font-medium text-neutral-900/70 mb-1.5">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); if (error) setError(''); }}
              onBlur={() => setTouched((p) => ({ ...p, email: true }))}
              required
              className={getInputClass('email')}
              placeholder="admin@yourclinic.com"
            />
            {touched.email && !email && <p className="text-xs text-red-500 mt-1.5">Email is required</p>}
          </div>

          {/* Password */}
          <div>
            <label className="block text-sm font-medium text-neutral-900/70 mb-1.5">Password</label>
            <div className="relative">
              <input
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={(e) => { setPassword(e.target.value); if (error) setError(''); }}
                onBlur={() => setTouched((p) => ({ ...p, password: true }))}
                required
                className={`${getInputClass('password')} pr-11`}
                placeholder="Enter password"
              />
              <button
                type="button"
                onClick={() => setShowPw(!showPw)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-900/30 hover:text-neutral-900/50 transition-colors"
                aria-label="Toggle password visibility"
              >
                {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {touched.password && !password && <p className="text-xs text-red-500 mt-1.5">Password is required</p>}
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-gradient-to-r from-primary-600 to-primary-700 hover:from-primary-700 hover:to-primary-800 text-white font-semibold rounded-xl transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-primary-600/20 flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Signing in...
              </>
            ) : (
              <>
                Sign In <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </motion.form>
      );
    }

    // ─── Email-first mode ────────────────────────
    if (emailStep === 'input') {
      return (
        <motion.form key="email-input" {...fadeSlide} onSubmit={handleEmailLookup} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-neutral-900/70 mb-1.5">Email Address</label>
            <div className="relative">
              <input
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); if (error) setError(''); }}
                onBlur={() => setTouched((p) => ({ ...p, email: true }))}
                required
                autoFocus
                className={getInputClass('email')}
                placeholder="your.email@example.com"
              />
              <Mail className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-900/20" />
            </div>
            {touched.email && !email && <p className="text-xs text-red-500 mt-1.5">Email is required</p>}
            <p className="text-[11px] text-neutral-900/30 mt-1.5">We'll find your clinic automatically</p>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-gradient-to-r from-primary-600 to-primary-700 hover:from-primary-700 hover:to-primary-800 text-white font-semibold rounded-xl transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-primary-600/20 flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Looking up...
              </>
            ) : (
              <>
                Continue <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </motion.form>
      );
    }

    if (emailStep === 'clinic_picker') {
      return (
        <motion.div key="clinic-picker" {...fadeSlide} className="space-y-4">
          <div>
            <button
              type="button"
              onClick={goBackEmailStep}
              className="flex items-center gap-1 text-xs text-neutral-900/40 hover:text-neutral-900/60 transition-colors mb-3"
            >
              <ArrowLeft className="h-3 w-3" /> Back
            </button>
            <p className="text-sm text-neutral-900/60 mb-1">
              Signed in as <span className="font-medium text-neutral-900">{email}</span>
            </p>
            <p className="text-xs text-neutral-900/40">Select a clinic to continue</p>
          </div>

          <div className="space-y-2 max-h-[240px] overflow-y-auto">
            {clinics.map((clinic) => (
              <button
                key={clinic.clinicId}
                type="button"
                onClick={() => handleSelectClinic(clinic)}
                className="w-full flex items-center gap-3 p-3 rounded-xl border border-neutral-300/60 bg-white/80 hover:bg-primary-50/50 hover:border-primary-200 transition-all text-left group"
              >
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-100 to-primary-200 flex items-center justify-center text-primary-700 font-bold text-sm shrink-0">
                  {clinic.clinicLogo ? (
                    <img src={resolveAssetUrl(clinic.clinicLogo)} alt="" className="w-10 h-10 rounded-xl object-cover" />
                  ) : (
                    (clinic.clinicName || 'C')[0].toUpperCase()
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-neutral-900 group-hover:text-primary-700 transition-colors truncate">
                    {clinic.clinicName}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[11px] text-neutral-900/40">{clinic.clinicCode}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-primary-50 text-primary-600 font-medium capitalize">
                      {clinic.role}
                    </span>
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 text-neutral-900/20 group-hover:text-primary-500 transition-colors shrink-0" />
              </button>
            ))}
          </div>
        </motion.div>
      );
    }

    if (emailStep === 'password') {
      return (
        <motion.form key="email-password" {...fadeSlide} onSubmit={handleEmailPasswordSubmit} className="space-y-5">
          <div>
            <button
              type="button"
              onClick={goBackEmailStep}
              className="flex items-center gap-1 text-xs text-neutral-900/40 hover:text-neutral-900/60 transition-colors mb-3"
            >
              <ArrowLeft className="h-3 w-3" /> Back
            </button>

            {/* Selected clinic banner */}
            <div className="flex items-center gap-3 p-3 rounded-xl bg-primary-50/50 border border-primary-100 mb-4">
              <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-primary-100 to-primary-200 flex items-center justify-center text-primary-700 font-bold text-sm shrink-0">
                {selectedClinic?.clinicLogo ? (
                  <img src={selectedClinic.clinicLogo} alt="" className="w-9 h-9 rounded-lg object-cover" />
                ) : (
                  (selectedClinic?.clinicName || 'C')[0].toUpperCase()
                )}
              </div>
              <div>
                <p className="text-sm font-semibold text-neutral-900">{selectedClinic?.clinicName}</p>
                <p className="text-[11px] text-neutral-900/40">{email}</p>
              </div>
            </div>
          </div>

          {/* Password */}
          <div>
            <label className="block text-sm font-medium text-neutral-900/70 mb-1.5">Password</label>
            <div className="relative">
              <input
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={(e) => { setPassword(e.target.value); if (error) setError(''); }}
                onBlur={() => setTouched((p) => ({ ...p, password: true }))}
                required
                autoFocus
                className={`${getInputClass('password')} pr-11`}
                placeholder="Enter password"
              />
              <button
                type="button"
                onClick={() => setShowPw(!showPw)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-900/30 hover:text-neutral-900/50 transition-colors"
                aria-label="Toggle password visibility"
              >
                {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {touched.password && !password && <p className="text-xs text-red-500 mt-1.5">Password is required</p>}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-gradient-to-r from-primary-600 to-primary-700 hover:from-primary-700 hover:to-primary-800 text-white font-semibold rounded-xl transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-primary-600/20 flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Signing in...
              </>
            ) : (
              <>
                Sign In <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </motion.form>
      );
    }

    return null;
  };

  return (
    <div className="min-h-screen flex">
      {/* Left panel -- clinic branding */}
      <div className="hidden lg:flex lg:w-[48%] relative overflow-hidden bg-gradient-to-br from-primary-800 via-primary-700 to-primary-900">
        {/* Decorative elements */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-primary-400/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3" />
        <div className="absolute bottom-0 left-0 w-80 h-80 bg-primary-300/8 rounded-full blur-3xl translate-y-1/3 -translate-x-1/4" />
        <div className="absolute top-1/2 left-1/2 w-64 h-64 bg-white/5 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2" />

        {/* Grid pattern */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.8) 1px, transparent 1px)',
            backgroundSize: '32px 32px',
          }}
        />

        <div className="relative flex flex-col justify-between p-12 xl:p-16 w-full">
          {/* Logo */}
          <div>
            <div className="inline-flex items-center gap-3">
              <img
                src="/platform_admin/logo/Besto Clinic Logo with name.svg"
                alt="BestoClinic"
                className="w-10 h-10"
              />
              <span className="text-xl font-bold font-display text-white">BestoClinic</span>
            </div>
          </div>

          {/* Center content */}
          <div className="flex-1 flex flex-col justify-center max-w-md">
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/8 backdrop-blur-sm text-xs font-medium text-primary-200 border border-white/8 mb-6 w-fit">
              <Building2 className="h-3.5 w-3.5" /> Clinic Administration
            </div>
            <h1 className="text-3xl xl:text-4xl font-bold font-display text-white leading-tight mb-4">
              Clinic Admin Portal
            </h1>
            <p className="text-primary-100/60 text-base leading-relaxed mb-10">
              Manage your clinic operations, appointments, patients, billing, and staff -- all from
              a single, powerful dashboard.
            </p>

            {/* Capabilities */}
            <div className="space-y-5">
              {CAPABILITIES.map((c) => (
                <div key={c.title} className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-xl bg-white/6 backdrop-blur-sm flex items-center justify-center border border-white/6 shrink-0">
                    <c.icon className="h-5 w-5 text-primary-300" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white">{c.title}</p>
                    <p className="text-xs text-primary-200/50 mt-0.5">{c.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Bottom */}
          <p className="text-xs text-primary-300/40">
            Access is restricted to authorized clinic administrators and staff.
          </p>
        </div>
      </div>

      {/* Right panel -- login form */}
      <div className="flex-1 flex items-center justify-center bg-neutral-50 px-6 py-6 lg:py-10 relative overflow-y-auto">
        {/* Background accents */}
        <div className="absolute top-0 right-0 w-72 h-72 bg-primary-100/20 rounded-full blur-3xl -translate-y-1/2 translate-x-1/4" />
        <div className="absolute bottom-0 left-0 w-56 h-56 bg-primary-50/30 rounded-full blur-3xl translate-y-1/3" />

        <div className="w-full max-w-[420px] relative">
          {/* Mobile logo */}
          <div className="lg:hidden text-center mb-8">
            <div className="inline-flex items-center justify-center w-14 h-14 bg-gradient-to-br from-primary-600 to-primary-800 rounded-2xl mb-3">
              <Building2 className="h-7 w-7 text-white" />
            </div>
            <h1 className="text-xl font-bold font-display text-neutral-900">Clinic Admin Portal</h1>
            <p className="text-neutral-900/40 text-sm mt-1">BestoClinic Management</p>
          </div>

          {/* Form header */}
          <div className="mb-6 hidden lg:block">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-11 h-11 bg-gradient-to-br from-primary-600 to-primary-800 rounded-xl flex items-center justify-center shadow-lg shadow-primary-600/20">
                <Lock className="h-5 w-5 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold font-display text-neutral-900">Clinic Sign In</h2>
                <p className="text-neutral-900/40 text-xs">Clinic Admin Portal</p>
              </div>
            </div>
          </div>

          {/* Mode toggle */}
          <div className="flex bg-neutral-200/60 rounded-xl p-1 mb-5">
            <button
              type="button"
              onClick={() => switchMode('code')}
              className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all duration-200 flex items-center justify-center gap-1.5 ${
                loginMode === 'code'
                  ? 'bg-white text-neutral-900 shadow-sm'
                  : 'text-neutral-900/40 hover:text-neutral-900/60'
              }`}
            >
              <Building2 className="h-3.5 w-3.5" /> Clinic Code
            </button>
            <button
              type="button"
              onClick={() => switchMode('email')}
              className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all duration-200 flex items-center justify-center gap-1.5 ${
                loginMode === 'email'
                  ? 'bg-white text-neutral-900 shadow-sm'
                  : 'text-neutral-900/40 hover:text-neutral-900/60'
              }`}
            >
              <Mail className="h-3.5 w-3.5" /> Email Address
            </button>
          </div>

          {/* Glass form card */}
          <div className="bg-white/70 backdrop-blur-xl rounded-2xl border border-neutral-300/60 shadow-[var(--shadow-lg)] p-7">
            {/* Error alert */}
            {error && (
              <div className="flex items-center gap-2.5 bg-red-50 text-red-700 px-4 py-3 rounded-xl text-sm border border-red-100 mb-5">
                <div className="w-6 h-6 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                  <span className="text-xs font-bold">!</span>
                </div>
                {error}
              </div>
            )}

            <AnimatePresence mode="wait">
              {renderForm()}
            </AnimatePresence>
          </div>

          {/* Footer */}
          <div className="text-center mt-6 space-y-2">
            <p className="text-neutral-900/30 text-xs">
              Access is restricted to authorized clinic administrators and staff.
            </p>
            <p className="text-xs text-neutral-900/40">
              Looking for the Patient Portal?{' '}
              <Link to="/patient/login" className="text-primary-600 hover:text-primary-700 font-medium transition-colors inline-flex items-center gap-1">
                <Heart className="h-3 w-3" /> Sign in here
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
