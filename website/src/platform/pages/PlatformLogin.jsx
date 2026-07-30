import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { usePlatformAuth } from '../AuthContext';
import { Shield, Eye, EyeOff, Lock, ArrowRight, BarChart3, Building2, Settings } from 'lucide-react';

const fadeUp = { hidden: { opacity: 0, y: 20 }, visible: (i = 0) => ({ opacity: 1, y: 0, transition: { delay: i * 0.1, duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] } }) };

const CAPABILITIES = [
  { icon: Building2, title: 'Tenant Management', desc: 'Onboard, configure & monitor clinics' },
  { icon: BarChart3, title: 'Revenue Analytics', desc: 'MRR, churn, and growth insights' },
  { icon: Settings, title: 'Platform Controls', desc: 'Feature flags, plans & promotions' },
];

export default function PlatformLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [touched, setTouched] = useState({});
  const { login, isAuthenticated, loading: authLoading } = usePlatformAuth();
  const navigate = useNavigate();

  // Auto-redirect if already authenticated
  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      navigate('/platform', { replace: true });
    }
  }, [authLoading, isAuthenticated, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setTouched({ email: true, password: true });
    if (!email || !password) return;
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      navigate('/platform');
    } catch (err) {
      setError(err.message || 'Invalid credentials');
    } finally {
      setLoading(false);
    }
  };

  const getInputClass = (field) => {
    const hasError = field === 'email' ? (touched.email && !email) : (touched.password && !password);
    return `input-base ${hasError ? 'border-red-300 focus:border-red-400 focus:ring-red-400/20' : ''}`;
  };

  return (
    <div className="min-h-screen flex">
      {/* Left panel — dark admin branding */}
      <div className="hidden lg:flex lg:w-[48%] relative overflow-hidden bg-gradient-to-br from-primary-950 via-primary-900 to-primary-950">
        {/* Decorative elements */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-primary-500/8 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3" />
        <div className="absolute bottom-0 left-0 w-80 h-80 bg-primary-400/5 rounded-full blur-3xl translate-y-1/3 -translate-x-1/4" />

        {/* Grid pattern */}
        <div
          className="absolute inset-0 opacity-[0.025]"
          style={{
            backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.8) 1px, transparent 1px)',
            backgroundSize: '32px 32px',
          }}
        />

        <div className="relative flex flex-col justify-between p-12 xl:p-16 w-full">
          {/* Logo */}
          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.6 }}>
            <div className="inline-flex items-center gap-3">
              <img src="/platform_admin/logo/Besto Clinic Logo.svg" alt="BestoClinic" className="w-10 h-10" />
              <div>
                <span className="text-xl font-bold font-display text-white">BestoClinic</span>
                <span className="ml-2 px-2 py-0.5 rounded-md bg-white/10 text-[10px] font-semibold text-primary-300 uppercase tracking-wider border border-white/8">
                  Admin
                </span>
              </div>
            </div>
          </motion.div>

          {/* Center content */}
          <div className="flex-1 flex flex-col justify-center max-w-md">
            <motion.div initial="hidden" animate="visible" variants={{ visible: { transition: { staggerChildren: 0.12 } } }}>
              <motion.div variants={fadeUp} custom={0}>
                <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/8 backdrop-blur-sm text-xs font-medium text-primary-300 border border-white/8 mb-6">
                  <Lock className="h-3.5 w-3.5" /> Restricted Access
                </div>
              </motion.div>
              <motion.h1 variants={fadeUp} custom={1} className="text-3xl xl:text-4xl font-bold font-display text-white leading-tight mb-4">
                Platform Administration Portal
              </motion.h1>
              <motion.p variants={fadeUp} custom={2} className="text-primary-200/60 text-base leading-relaxed mb-10">
                Monitor tenants, manage subscriptions, configure features, and analyze revenue — all from one dashboard.
              </motion.p>

              {/* Capabilities */}
              <div className="space-y-5">
                {CAPABILITIES.map((c, i) => (
                  <motion.div
                    key={c.title}
                    variants={fadeUp}
                    custom={3 + i}
                    className="flex items-start gap-4"
                  >
                    <div className="w-10 h-10 rounded-xl bg-white/6 backdrop-blur-sm flex items-center justify-center border border-white/6 shrink-0">
                      <c.icon className="h-5 w-5 text-primary-400" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-white">{c.title}</p>
                      <p className="text-xs text-primary-300/50 mt-0.5">{c.desc}</p>
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          </div>

          {/* Bottom */}
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8, duration: 0.5 }}
            className="text-xs text-primary-400/40"
          >
            This portal is restricted to authorized platform administrators only.
          </motion.p>
        </div>
      </div>

      {/* Right panel — form */}
      <div className="flex-1 flex items-center justify-center bg-neutral-50 px-6 py-12 relative">
        {/* Background accents */}
        <div className="absolute top-0 right-0 w-72 h-72 bg-primary-100/20 rounded-full blur-3xl -translate-y-1/2 translate-x-1/4" />
        <div className="absolute bottom-0 left-0 w-56 h-56 bg-primary-50/30 rounded-full blur-3xl translate-y-1/3" />

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
          className="w-full max-w-[420px] relative"
        >
          {/* Mobile logo */}
          <div className="lg:hidden text-center mb-8">
            <div className="inline-flex items-center justify-center w-14 h-14 bg-gradient-to-br from-primary-600 to-primary-800 rounded-2xl mb-3">
              <Shield className="h-7 w-7 text-white" />
            </div>
            <h1 className="text-xl font-bold font-display text-neutral-900">Platform Admin</h1>
            <p className="text-neutral-900/40 text-sm mt-1">BestoClinic Product Owner Portal</p>
          </div>

          {/* Form header */}
          <div className="mb-8 hidden lg:block">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-11 h-11 bg-gradient-to-br from-primary-600 to-primary-800 rounded-xl flex items-center justify-center shadow-lg shadow-primary-600/20">
                <Shield className="h-5 w-5 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold font-display text-neutral-900">Admin Sign In</h2>
                <p className="text-neutral-900/40 text-xs">Product Owner Portal</p>
              </div>
            </div>
          </div>

          {/* Glass form card */}
          <form
            onSubmit={handleSubmit}
            className="bg-white/70 backdrop-blur-xl rounded-2xl border border-neutral-300/60 shadow-[var(--shadow-lg)] p-7 space-y-5"
          >
            {/* Error alert */}
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-2.5 bg-red-50 text-red-700 px-4 py-3 rounded-xl text-sm border border-red-100"
              >
                <div className="w-6 h-6 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                  <span className="text-xs font-bold">!</span>
                </div>
                {error}
              </motion.div>
            )}

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
                placeholder="admin@bestoclinic.com"
              />
              {touched.email && !email && (
                <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="text-xs text-red-500 mt-1.5">
                  Email is required
                </motion.p>
              )}
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
              {touched.password && !password && (
                <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="text-xs text-red-500 mt-1.5">
                  Password is required
                </motion.p>
              )}
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-gradient-to-r from-primary-600 to-primary-700 hover:from-primary-700 hover:to-primary-800 text-white font-semibold rounded-xl transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-primary-600/20 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Signing in...
                </>
              ) : (
                <>Sign In <ArrowRight className="w-4 h-4" /></>
              )}
            </button>
          </form>

          {/* Footer */}
          <p className="text-center text-neutral-900/30 text-xs mt-6">
            This portal is restricted to authorized platform administrators only.
          </p>
        </motion.div>
      </div>
    </div>
  );
}
