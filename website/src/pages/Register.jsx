import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import SEO from '../components/common/SEO';
import Button from '../components/common/Button';
import {
  ArrowRight, ArrowLeft, Check, Eye, EyeOff, Building2, User, CreditCard,
  Globe, FileText, ClipboardList, Upload, X, Loader2, CheckCircle2,
  AlertCircle, Sparkles, Database, Shield, Zap, ImagePlus, Trash2,
} from 'lucide-react';
import { fetchPlans, createRegistrationOrder, checkSlug, registerClinic, getProvisioningStatus, retryProvisioning, uploadDocument, uploadLogo } from '../api/publicApi';
import { resolveAssetUrl } from '../lib/assetUrl';

// ─── Animations ──────────────────────────────────────

const fadeUp = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] } },
  exit: { opacity: 0, y: -16, transition: { duration: 0.25 } },
};

// ─── Step Indicator ──────────────────────────────────

const STEPS = [
  { label: 'Clinic Details', icon: Building2 },
  { label: 'Choose Plan', icon: CreditCard },
  { label: 'Payment', icon: CreditCard },
  { label: 'Admin Account', icon: User },
  { label: 'Domain Setup', icon: Globe },
  { label: 'Documents', icon: FileText },
  { label: 'Review', icon: ClipboardList },
];

function StepIndicator({ current, onStepClick }) {
  return (
    <div className="flex items-center justify-center gap-1 mb-8">
      {STEPS.map((step, i) => {
        const isActive = i === current;
        const isComplete = i < current;
        const isClickable = i !== current;
        const Icon = step.icon;
        return (
          <div key={step.label} className="flex items-center">
            <div className="flex flex-col items-center">
              <button
                type="button"
                onClick={() => isClickable && onStepClick(i)}
                className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold transition-all duration-300 ${
                  isComplete
                    ? 'bg-emerald-500 text-white hover:bg-emerald-600'
                    : isActive
                      ? 'bg-primary-600 text-white shadow-md shadow-primary-600/30'
                      : 'bg-neutral-200/60 text-neutral-900/30 hover:bg-neutral-300/60 hover:text-neutral-900/50'
                } ${isClickable ? 'cursor-pointer' : 'cursor-default'}`}
              >
                {isComplete ? <Check className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
              </button>
              <span
                onClick={() => isClickable && onStepClick(i)}
                className={`text-[10px] mt-1.5 font-medium whitespace-nowrap hidden sm:block ${
                  isClickable ? 'cursor-pointer' : ''
                } ${isActive ? 'text-primary-700' : isComplete ? 'text-emerald-600' : 'text-neutral-900/30'}`}
              >
                {step.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={`w-6 sm:w-10 h-0.5 mx-1 rounded-full transition-colors ${
                i < current ? 'bg-emerald-400' : 'bg-neutral-200'
              }`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Shared Input ────────────────────────────────────

function Input({ label, error, className = '', ...props }) {
  return (
    <div className={className}>
      {label && <label className="block text-sm font-medium text-neutral-900/70 mb-1.5">{label}</label>}
      <input
        className={`input-base ${error ? 'border-red-300 focus:border-red-400 focus:ring-red-400/20' : ''}`}
        {...props}
      />
      {error && (
        <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="text-xs text-red-500 mt-1.5">
          {error}
        </motion.p>
      )}
    </div>
  );
}

// ─── Slugify ─────────────────────────────────────────

function slugify(name) {
  return name.toLowerCase().trim().replace(/[''"]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').substring(0, 60);
}

// ─── Step 1: Clinic Details ──────────────────────────

function Step1ClinicDetails({ data, onChange, errors }) {
  const slugTimeout = useRef(null);
  const [slugStatus, setSlugStatus] = useState(null); // null | 'checking' | 'available' | 'taken'
  const logoInputRef = useRef(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoError, setLogoError] = useState('');
  const [logoPreview, setLogoPreview] = useState('');

  const handleLogoSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowedTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];
    if (!allowedTypes.includes(file.type)) {
      setLogoError('Only PNG, JPG, WebP, or SVG files are allowed');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setLogoError('Logo must be under 2MB');
      return;
    }

    setLogoError('');
    // Show instant local preview
    setLogoPreview(URL.createObjectURL(file));
    setLogoUploading(true);
    try {
      const res = await uploadLogo(file);
      onChange({ logo: res.data.url });
    } catch (err) {
      setLogoError(err.message || 'Logo upload failed');
      setLogoPreview('');
    } finally {
      setLogoUploading(false);
      if (logoInputRef.current) logoInputRef.current.value = '';
    }
  };

  const handleClinicNameChange = (e) => {
    const name = e.target.value;
    const newSlug = slugify(name);
    onChange({ clinicName: name, subdomain: newSlug });

    // Auto-check slug availability
    clearTimeout(slugTimeout.current);
    if (newSlug.length >= 2) {
      slugTimeout.current = setTimeout(async () => {
        setSlugStatus('checking');
        try {
          const res = await checkSlug(newSlug);
          setSlugStatus(res.data.available ? 'available' : 'taken');
        } catch {
          setSlugStatus(null);
        }
      }, 600);
    } else {
      setSlugStatus(null);
    }
  };

  return (
    <motion.div {...fadeUp} className="space-y-4">
      <Input
        label="Clinic Name *"
        value={data.clinicName}
        onChange={handleClinicNameChange}
        placeholder="Bright Smile Dental"
        error={errors.clinicName}
      />

      {/* Auto-generated slug preview (read-only) */}
      {data.subdomain && (
        <div className="bg-neutral-100/60 rounded-xl px-4 py-3 border border-neutral-200 flex items-center justify-between">
          <div>
            <p className="text-[11px] text-neutral-900/40 mb-0.5">Clinic Identifier (auto-generated)</p>
            <p className="text-sm font-medium text-neutral-900 font-mono">{data.subdomain}</p>
          </div>
          <div>
            {slugStatus === 'checking' && <Loader2 className="w-4 h-4 text-neutral-900/30 animate-spin" />}
            {slugStatus === 'available' && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
            {slugStatus === 'taken' && <AlertCircle className="w-4 h-4 text-amber-500" />}
          </div>
        </div>
      )}

      {/* Clinic Logo */}
      <div>
        <label className="block text-sm font-medium text-neutral-900/70 mb-1.5">Clinic Logo</label>
        <div className="flex items-center gap-4">
          {(data.logo || logoPreview) ? (
            <div className="relative group">
              <img
                src={logoPreview || resolveAssetUrl(data.logo)}
                alt="Clinic logo"
                className="w-16 h-16 object-contain rounded-xl border border-neutral-200 bg-white p-1"
              />
              {logoUploading && (
                <div className="absolute inset-0 bg-white/60 rounded-xl flex items-center justify-center">
                  <Loader2 className="w-5 h-5 text-primary-500 animate-spin" />
                </div>
              )}
              <button
                type="button"
                onClick={() => { onChange({ logo: '' }); setLogoPreview(''); }}
                className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ) : (
            <div
              onClick={() => !logoUploading && logoInputRef.current?.click()}
              className="w-16 h-16 rounded-xl border-2 border-dashed border-neutral-300 flex flex-col items-center justify-center cursor-pointer hover:border-primary-300 transition-colors bg-neutral-50/50"
            >
              {logoUploading ? (
                <Loader2 className="w-5 h-5 text-primary-500 animate-spin" />
              ) : (
                <ImagePlus className="w-5 h-5 text-neutral-900/25" />
              )}
            </div>
          )}
          <div className="flex-1">
            <input
              ref={logoInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              onChange={handleLogoSelect}
              className="hidden"
            />
            {!data.logo && !logoPreview && (
              <button
                type="button"
                onClick={() => logoInputRef.current?.click()}
                disabled={logoUploading}
                className="text-sm font-medium text-primary-600 hover:text-primary-700 transition-colors disabled:opacity-50"
              >
                Upload logo
              </button>
            )}
            <p className="text-[11px] text-neutral-900/30 mt-0.5">PNG, JPG, WebP, or SVG — Max 2MB</p>
            {logoError && <p className="text-xs text-red-500 mt-1">{logoError}</p>}
          </div>
        </div>
      </div>

      <Input
        label="Clinic Email *"
        type="email"
        value={data.email}
        onChange={(e) => onChange({ email: e.target.value })}
        placeholder="info@yourclinic.com"
        error={errors.email}
      />

      <Input
        label="Phone *"
        type="tel"
        value={data.phone}
        onChange={(e) => onChange({ phone: e.target.value })}
        placeholder="+91 98765 43210"
        error={errors.phone}
      />

      <div className="grid grid-cols-2 gap-3">
        <Input label="City" value={data.city} onChange={(e) => onChange({ city: e.target.value })} placeholder="Mumbai" />
        <Input label="State" value={data.state} onChange={(e) => onChange({ state: e.target.value })} placeholder="Maharashtra" />
      </div>
      <Input label="Locality / Area" value={data.locality} onChange={(e) => onChange({ locality: e.target.value })} placeholder="e.g. Viman Nagar, Andheri West" />
      <Input label="Street Address" value={data.street} onChange={(e) => onChange({ street: e.target.value })} placeholder="123 Main Street" />
      <Input label="ZIP Code" value={data.zipCode} onChange={(e) => onChange({ zipCode: e.target.value })} placeholder="400001" />
    </motion.div>
  );
}

// ─── Step 2: Plan Selection ──────────────────────────

function Step2PlanSelection({ data, onChange }) {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [billing, setBilling] = useState('monthly');

  useEffect(() => {
    (async () => {
      try {
        const res = await fetchPlans();
        if (res.data && res.data.length > 0) {
          setPlans(res.data);
        }
      } catch {
        // Fallback: plans will be empty, user can still proceed with 'free'
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <motion.div {...fadeUp} className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 text-primary-500 animate-spin" />
        <span className="ml-2 text-sm text-neutral-900/50">Loading plans...</span>
      </motion.div>
    );
  }

  const displayPlans = plans.length > 0 ? plans : [
    { slug: 'free', name: 'Free', pricing: { monthly: 0, yearly: 0 }, features: { maxDoctors: 1, maxStaff: 2, maxBranches: 1 }, highlights: ['1 Doctor', '2 Staff Members', 'Basic Patient Management', '250 MB Storage'], badge: null, trial: { enabled: false, durationDays: 0 } },
  ];

  return (
    <motion.div {...fadeUp} className="space-y-6">
      {/* Billing toggle */}
      {plans.length > 0 && (
        <div className="flex items-center justify-center gap-3">
          <span className={`text-sm font-medium ${billing === 'monthly' ? 'text-neutral-900' : 'text-neutral-900/40'}`}>Monthly</span>
          <button
            type="button"
            onClick={() => setBilling(b => b === 'monthly' ? 'yearly' : 'monthly')}
            className={`relative w-12 h-6 rounded-full transition-colors ${billing === 'yearly' ? 'bg-primary-500' : 'bg-neutral-300'}`}
          >
            <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${billing === 'yearly' ? 'translate-x-6' : 'translate-x-0.5'}`} />
          </button>
          <span className={`text-sm font-medium ${billing === 'yearly' ? 'text-neutral-900' : 'text-neutral-900/40'}`}>
            Yearly <span className="text-emerald-600 text-xs font-semibold">Save 20%</span>
          </span>
        </div>
      )}

      <div className="grid gap-4">
        {displayPlans.map((plan) => {
          const isSelected = data.plan === plan.slug;
          const price = billing === 'yearly' ? plan.pricing?.yearly : plan.pricing?.monthly;
          const isEnterprise = plan.slug === 'enterprise' || price === null;

          return (
            <button
              key={plan.slug}
              type="button"
              onClick={() => {
                if (isEnterprise) {
                  window.open('/contact', '_blank');
                  return;
                }
                onChange({ plan: plan.slug, billingCycle: billing });
              }}
              className={`relative text-left p-5 rounded-2xl border-2 transition-all duration-200 ${
                isSelected
                  ? 'border-primary-500 bg-primary-50/50 shadow-md shadow-primary-600/10'
                  : 'border-neutral-200 bg-white/60 hover:border-neutral-300 hover:bg-white/80'
              }`}
            >
              {plan.badge && (
                <span className="absolute -top-2.5 right-4 px-2.5 py-0.5 bg-primary-500 text-white text-[10px] font-bold rounded-full uppercase">
                  {plan.badge}
                </span>
              )}
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-base font-bold text-neutral-900">{plan.name}</h3>
                  {plan.description && <p className="text-xs text-neutral-900/40 mt-0.5">{plan.description}</p>}
                </div>
                <div className="text-right">
                  {isEnterprise ? (
                    <span className="text-sm font-semibold text-neutral-900/60">Custom</span>
                  ) : (
                    <>
                      <span className="text-xl font-bold text-neutral-900">
                        {price === 0 ? 'Free' : `₹${price?.toLocaleString('en-IN')}`}
                      </span>
                      {price > 0 && <span className="text-xs text-neutral-900/40">/{billing === 'yearly' ? 'yr' : 'mo'}</span>}
                    </>
                  )}
                </div>
              </div>

              {/* Feature highlights */}
              {(plan.highlights || []).length > 0 && (
                <div className="flex flex-wrap gap-2 mt-3">
                  {plan.highlights.map((h) => (
                    <span key={h} className="px-2.5 py-1 bg-neutral-100 text-neutral-900/60 text-xs rounded-lg">{h}</span>
                  ))}
                </div>
              )}

              {/* Feature limits */}
              {plan.features && (
                <div className="flex gap-4 mt-3 text-xs text-neutral-900/50">
                  {plan.features.maxDoctors != null && <span><Database className="w-3 h-3 inline mr-0.5" /> {plan.features.maxDoctors} Doctor{plan.features.maxDoctors !== 1 ? 's' : ''}</span>}
                  {plan.features.maxStaff != null && <span>{plan.features.maxStaff} Staff</span>}
                  {plan.features.maxBranches != null && <span>{plan.features.maxBranches} Branch{plan.features.maxBranches !== 1 ? 'es' : ''}</span>}
                </div>
              )}

              {/* Selected indicator */}
              {isSelected && (
                <div className="absolute top-4 right-4">
                  <div className="w-6 h-6 rounded-full bg-primary-500 flex items-center justify-center">
                    <Check className="w-3.5 h-3.5 text-white" />
                  </div>
                </div>
              )}
            </button>
          );
        })}
      </div>
    </motion.div>
  );
}

// ─── Step 3: Payment ─────────────────────────────────

function Step3Payment({ data, onChange }) {
  const [loading, setLoading] = useState(false);
  const [paymentError, setPaymentError] = useState('');

  const isFree = !data.plan || data.plan === 'free';
  const isPaid = !!data.razorpayPaymentId;

  if (isFree) {
    return (
      <motion.div {...fadeUp} className="text-center py-8">
        <div className="w-16 h-16 mx-auto bg-emerald-100 rounded-full flex items-center justify-center mb-4">
          <CheckCircle2 className="w-8 h-8 text-emerald-500" />
        </div>
        <h3 className="text-lg font-bold text-neutral-900 mb-1">Free Plan Selected</h3>
        <p className="text-sm text-neutral-900/50">No payment required. Click Next to continue.</p>
      </motion.div>
    );
  }

  if (isPaid) {
    return (
      <motion.div {...fadeUp} className="text-center py-8">
        <div className="w-16 h-16 mx-auto bg-emerald-100 rounded-full flex items-center justify-center mb-4">
          <CheckCircle2 className="w-8 h-8 text-emerald-500" />
        </div>
        <h3 className="text-lg font-bold text-neutral-900 mb-1">Payment Successful</h3>
        <p className="text-sm text-neutral-900/50">Your payment has been verified. Click Next to continue.</p>
      </motion.div>
    );
  }

  const loadRazorpayScript = () => {
    return new Promise((resolve) => {
      if (window.Razorpay) return resolve(true);
      const s = document.createElement('script');
      s.src = 'https://checkout.razorpay.com/v1/checkout.js';
      s.onload = () => resolve(true);
      s.onerror = () => resolve(false);
      document.body.appendChild(s);
    });
  };

  const handlePay = async () => {
    setLoading(true);
    setPaymentError('');

    try {
      const orderRes = await createRegistrationOrder({
        planSlug: data.plan,
        billingCycle: data.billingCycle || 'monthly',
      });

      if (!orderRes.data.orderRequired) {
        setLoading(false);
        return;
      }

      const { orderId, keyId, amount, currency } = orderRes.data;

      const scriptLoaded = await loadRazorpayScript();
      if (!scriptLoaded) {
        setPaymentError('Failed to load payment gateway. Please try again.');
        setLoading(false);
        return;
      }

      const rzp = new window.Razorpay({
        key: keyId,
        amount: amount * 100, // backend returns rupees, Razorpay expects paise
        currency: currency || 'INR',
        order_id: orderId,
        name: 'BestoClinic',
        description: `${(data.plan || '').charAt(0).toUpperCase() + (data.plan || '').slice(1)} Plan — ${data.billingCycle || 'monthly'}`,
        image: `${window.location.origin}/platform_admin/logo/Besto Clinic Logo.svg`,
        prefill: {
          name: data.clinicName || '',
          email: data.email || '',
          contact: data.phone || '',
        },
        theme: { color: '#14b8a6' },
        handler(response) {
          onChange({
            razorpayOrderId: response.razorpay_order_id,
            razorpayPaymentId: response.razorpay_payment_id,
            razorpaySignature: response.razorpay_signature,
          });
          setLoading(false);
        },
      });

      rzp.on('payment.failed', (resp) => {
        setPaymentError(resp.error?.description || 'Payment failed. Please try again.');
        setLoading(false);
      });

      rzp.on('modal.closed', () => {
        setLoading(false);
      });

      rzp.open();
    } catch (err) {
      setPaymentError(err.message || 'Could not initiate payment');
      setLoading(false);
    }
  };

  const billingCycle = data.billingCycle || 'monthly';

  return (
    <motion.div {...fadeUp} className="space-y-6">
      {/* Order summary */}
      <div className="bg-neutral-100/60 rounded-xl p-5 border border-neutral-200">
        <div className="flex items-center gap-3 mb-4 pb-3 border-b border-neutral-200">
          <img src="/platform_admin/logo/Besto Clinic Logo.svg" alt="BestoClinic" className="w-8 h-8" />
          <div>
            <h4 className="text-sm font-bold text-neutral-900">BestoClinic</h4>
            <p className="text-[11px] text-neutral-900/40">Clinic Management Platform</p>
          </div>
        </div>
        <div className="flex justify-between py-2 border-b border-neutral-200/60">
          <span className="text-sm text-neutral-900/60">Clinic</span>
          <span className="text-sm font-medium text-neutral-900 truncate ml-4">{data.clinicName || '—'}</span>
        </div>
        <div className="flex justify-between py-2 border-b border-neutral-200/60">
          <span className="text-sm text-neutral-900/60">Plan</span>
          <span className="text-sm font-medium text-neutral-900 capitalize">{data.plan}</span>
        </div>
        <div className="flex justify-between py-2">
          <span className="text-sm text-neutral-900/60">Billing Cycle</span>
          <span className="text-sm font-medium text-neutral-900 capitalize">{billingCycle}</span>
        </div>
      </div>

      {paymentError && (
        <div className="flex items-center gap-2 bg-red-50 text-red-700 px-4 py-3 rounded-xl text-sm border border-red-100">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {paymentError}
        </div>
      )}

      <button
        type="button"
        onClick={handlePay}
        disabled={loading}
        className="w-full py-3.5 bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {loading ? (
          <><Loader2 className="w-4 h-4 animate-spin" /> Preparing Checkout...</>
        ) : (
          <><CreditCard className="w-4 h-4" /> Proceed to Payment</>
        )}
      </button>

      <div className="flex items-center justify-center gap-2 text-xs text-neutral-900/40">
        <Shield className="w-3.5 h-3.5" />
        <span>Secured by Razorpay. Payment opens in a secure popup.</span>
      </div>
    </motion.div>
  );
}

// ─── Step 4: Admin Account ──────────────────────────

function Step4AdminAccount({ data, onChange, errors }) {
  const [showPw, setShowPw] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  return (
    <motion.div {...fadeUp} className="space-y-4">
      <p className="text-sm text-neutral-900/50 mb-2">
        Create the administrator account for your clinic dashboard.
      </p>

      <Input
        label="Full Name *"
        value={data.adminName}
        onChange={(e) => onChange({ adminName: e.target.value })}
        placeholder="Dr. Priya Sharma"
        error={errors.adminName}
      />

      <Input
        label="Admin Email *"
        type="email"
        value={data.adminEmail}
        onChange={(e) => onChange({ adminEmail: e.target.value })}
        placeholder="admin@yourclinic.com"
        error={errors.adminEmail}
      />

      <div>
        <label className="block text-sm font-medium text-neutral-900/70 mb-1.5">Password *</label>
        <div className="relative">
          <input
            type={showPw ? 'text' : 'password'}
            className={`input-base pr-11 ${errors.adminPassword ? 'border-red-300' : ''}`}
            value={data.adminPassword}
            onChange={(e) => onChange({ adminPassword: e.target.value })}
            placeholder="Minimum 8 characters"
          />
          <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-900/30 hover:text-neutral-900/50 transition-colors">
            {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
        {errors.adminPassword && <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="text-xs text-red-500 mt-1.5">{errors.adminPassword}</motion.p>}
      </div>

      <div>
        <label className="block text-sm font-medium text-neutral-900/70 mb-1.5">Confirm Password *</label>
        <div className="relative">
          <input
            type={showConfirm ? 'text' : 'password'}
            className={`input-base pr-11 ${errors.confirmPassword ? 'border-red-300' : ''}`}
            value={data.confirmPassword}
            onChange={(e) => onChange({ confirmPassword: e.target.value })}
            placeholder="Re-enter password"
          />
          <button type="button" onClick={() => setShowConfirm(!showConfirm)} className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-900/30 hover:text-neutral-900/50 transition-colors">
            {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
        {errors.confirmPassword && <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="text-xs text-red-500 mt-1.5">{errors.confirmPassword}</motion.p>}
      </div>
    </motion.div>
  );
}

// ─── Step 4: Domain Setup ────────────────────────────

function Step5DomainSetup({ data, onChange }) {
  const domainType = data.domainType || 'subdomain';
  const [slugStatus, setSlugStatus] = useState(null);
  const slugTimeout = useRef(null);

  const handleSubdomainChange = (e) => {
    const val = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '');
    onChange({ subdomain: val });
    clearTimeout(slugTimeout.current);
    if (val.length >= 2) {
      slugTimeout.current = setTimeout(async () => {
        setSlugStatus('checking');
        try {
          const res = await checkSlug(val);
          setSlugStatus(res.data.available ? 'available' : 'taken');
        } catch {
          setSlugStatus(null);
        }
      }, 600);
    } else {
      setSlugStatus(null);
    }
  };

  return (
    <motion.div {...fadeUp} className="space-y-5">
      <p className="text-sm text-neutral-900/50">
        Choose how your clinic will be accessed online. Our team will handle all the domain configuration for you.
      </p>

      {/* Domain type selection */}
      <div className="space-y-3">
        {/* Subdomain option */}
        <div
          onClick={() => onChange({ domainType: 'subdomain', customDomain: '' })}
          className={`w-full text-left p-4 rounded-2xl border-2 transition-all duration-200 cursor-pointer ${
            domainType === 'subdomain'
              ? 'border-primary-500 bg-primary-50/50 shadow-md shadow-primary-600/10'
              : 'border-neutral-200 bg-white/60 hover:border-neutral-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-sm font-semibold text-neutral-900">BestoClinic Subdomain</h4>
              <p className="text-xs text-neutral-900/40 mt-0.5">Free subdomain on our platform</p>
            </div>
            {domainType === 'subdomain' && (
              <div className="w-6 h-6 rounded-full bg-primary-500 flex items-center justify-center shrink-0">
                <Check className="w-3.5 h-3.5 text-white" />
              </div>
            )}
          </div>

          {/* Editable subdomain input (shown when selected) */}
          {domainType === 'subdomain' && (
            <div className="mt-3" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center">
                <div className="relative flex-1">
                  <input
                    className={`input-base rounded-r-none border-r-0 text-sm font-mono ${
                      slugStatus === 'taken' ? 'border-red-300' : slugStatus === 'available' ? 'border-emerald-300' : ''
                    }`}
                    value={data.subdomain}
                    onChange={handleSubdomainChange}
                    placeholder="your-clinic"
                  />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    {slugStatus === 'checking' && <Loader2 className="w-3.5 h-3.5 text-neutral-900/30 animate-spin" />}
                    {slugStatus === 'available' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />}
                    {slugStatus === 'taken' && <AlertCircle className="w-3.5 h-3.5 text-red-400" />}
                  </div>
                </div>
                <div className="px-3 py-2.5 bg-neutral-100 border border-neutral-300 rounded-r-xl text-xs text-neutral-900/50 whitespace-nowrap">
                  .bestoclinic.com
                </div>
              </div>
              {slugStatus === 'available' && <p className="text-xs text-emerald-600 mt-1.5">Available!</p>}
              {slugStatus === 'taken' && <p className="text-xs text-red-500 mt-1.5">This subdomain is already taken. Try a different one.</p>}
            </div>
          )}
        </div>

        {/* Custom domain option */}
        <div
          onClick={() => onChange({ domainType: 'custom' })}
          className={`w-full text-left p-4 rounded-2xl border-2 transition-all duration-200 cursor-pointer ${
            domainType === 'custom'
              ? 'border-primary-500 bg-primary-50/50 shadow-md shadow-primary-600/10'
              : 'border-neutral-200 bg-white/60 hover:border-neutral-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-sm font-semibold text-neutral-900">Custom Domain</h4>
              <p className="text-xs text-neutral-900/40 mt-0.5">Use your own domain name</p>
            </div>
            {domainType === 'custom' && (
              <div className="w-6 h-6 rounded-full bg-primary-500 flex items-center justify-center shrink-0">
                <Check className="w-3.5 h-3.5 text-white" />
              </div>
            )}
          </div>

          {/* Custom domain input (shown when selected) */}
          {domainType === 'custom' && (
            <div className="mt-3" onClick={(e) => e.stopPropagation()}>
              <input
                className="input-base text-sm font-mono"
                value={data.customDomain}
                onChange={(e) => onChange({ customDomain: e.target.value.toLowerCase().trim() })}
                placeholder="clinic.yourdomain.com"
              />
              <p className="text-[11px] text-neutral-900/30 mt-1.5">
                Our team will configure DNS and SSL for your custom domain after registration.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Info note */}
      <div className="bg-primary-50/50 rounded-xl p-4 border border-primary-100 flex items-start gap-3">
        <Shield className="w-4 h-4 text-primary-500 mt-0.5 shrink-0" />
        <p className="text-xs text-neutral-900/60">
          Domain setup, DNS configuration, and SSL certificates are fully managed by our platform team.
          {domainType === 'subdomain'
            ? ' Your subdomain will be ready immediately after registration.'
            : ' Custom domain setup typically takes 24-48 hours after registration.'}
        </p>
      </div>
    </motion.div>
  );
}

// ─── Step 5: Documents ───────────────────────────────

const DOC_TYPES = [
  { value: 'business_registration', label: 'Business Registration' },
  { value: 'medical_license', label: 'Medical License' },
  { value: 'tax_certificate', label: 'Tax Certificate' },
  { value: 'insurance', label: 'Insurance' },
  { value: 'other', label: 'Other' },
];

function Step6Documents({ data, onChange }) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const fileInputRef = useRef(null);
  const [selectedType, setSelectedType] = useState('business_registration');

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate
    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
    if (!allowedTypes.includes(file.type)) {
      setUploadError('Only PDF, JPG, and PNG files are allowed');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setUploadError('File size must be under 5MB');
      return;
    }

    setUploadError('');
    setUploading(true);
    try {
      const res = await uploadDocument(file);
      const doc = {
        name: file.name,
        type: selectedType,
        url: res.data.url,
      };
      onChange({ documents: [...(data.documents || []), doc] });
    } catch (err) {
      setUploadError(err.message || 'Upload failed');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const removeDoc = (index) => {
    const docs = [...(data.documents || [])];
    docs.splice(index, 1);
    onChange({ documents: docs });
  };

  return (
    <motion.div {...fadeUp} className="space-y-5">
      <p className="text-sm text-neutral-900/50">
        Upload registration documents for your clinic. These are optional but recommended for faster verification.
      </p>

      {/* Upload area */}
      <div className="border-2 border-dashed border-neutral-300 rounded-2xl p-6 text-center hover:border-primary-300 transition-colors">
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.jpg,.jpeg,.png"
          onChange={handleFileSelect}
          className="hidden"
          id="doc-upload"
        />

        <div className="flex items-center gap-3 mb-4">
          <label className="block text-sm font-medium text-neutral-900/70">Document Type</label>
          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            className="input-base w-auto text-sm"
          >
            {DOC_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>

        <label htmlFor="doc-upload" className="cursor-pointer">
          <div className="w-12 h-12 mx-auto bg-neutral-100 rounded-xl flex items-center justify-center mb-3">
            {uploading ? <Loader2 className="w-5 h-5 text-primary-500 animate-spin" /> : <Upload className="w-5 h-5 text-neutral-900/40" />}
          </div>
          <p className="text-sm font-medium text-neutral-900/70">
            {uploading ? 'Uploading...' : 'Click to upload'}
          </p>
          <p className="text-xs text-neutral-900/30 mt-1">PDF, JPG, PNG — Max 5MB</p>
        </label>
      </div>

      {uploadError && (
        <p className="text-xs text-red-500 flex items-center gap-1">
          <AlertCircle className="w-3 h-3" /> {uploadError}
        </p>
      )}

      {/* Uploaded documents */}
      {(data.documents || []).length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-neutral-900/70">Uploaded Documents</p>
          {data.documents.map((doc, i) => (
            <div key={i} className="flex items-center justify-between bg-white/80 rounded-xl px-4 py-3 border border-neutral-200">
              <div className="flex items-center gap-3">
                <FileText className="w-4 h-4 text-primary-500" />
                <div>
                  <p className="text-sm font-medium text-neutral-900">{doc.name}</p>
                  <p className="text-xs text-neutral-900/40 capitalize">{doc.type.replace(/_/g, ' ')}</p>
                </div>
              </div>
              <button type="button" onClick={() => removeDoc(i)} className="p-1 rounded-lg hover:bg-red-50 text-neutral-900/30 hover:text-red-500 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </motion.div>
  );
}

// ─── Step 6: Review ──────────────────────────────────

function Step7Review({ data, goToStep }) {
  const [agreed, setAgreed] = useState(false);

  const Section = ({ title, step, children }) => (
    <div className="bg-white/60 rounded-xl border border-neutral-200 p-4">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-semibold text-neutral-900">{title}</h4>
        <button type="button" onClick={() => goToStep(step)} className="text-xs text-primary-600 hover:text-primary-700 font-medium">Edit</button>
      </div>
      {children}
    </div>
  );

  const Field = ({ label, value }) => (
    <div className="flex justify-between py-1">
      <span className="text-xs text-neutral-900/50">{label}</span>
      <span className="text-xs font-medium text-neutral-900 text-right max-w-[60%] truncate">{value || '—'}</span>
    </div>
  );

  return (
    <motion.div {...fadeUp} className="space-y-4">
      <Section title="Clinic Details" step={0}>
        {data.logo && (
          <div className="flex items-center gap-3 mb-3 pb-3 border-b border-neutral-200/60">
            <img
              src={resolveAssetUrl(data.logo)}
              alt="Clinic logo"
              className="w-10 h-10 object-contain rounded-lg border border-neutral-200 bg-white p-0.5"
            />
            <span className="text-xs font-medium text-neutral-900/60">Clinic Logo</span>
          </div>
        )}
        <Field label="Clinic Name" value={data.clinicName} />
        <Field label="Identifier" value={data.subdomain} />
        <Field label="Email" value={data.email} />
        <Field label="Phone" value={data.phone} />
        <Field label="Location" value={[data.locality, data.city, data.state].filter(Boolean).join(', ')} />
      </Section>

      <Section title="Plan" step={1}>
        <Field label="Selected Plan" value={data.plan || 'free'} />
        <Field label="Billing" value={data.billingCycle || 'monthly'} />
        {data.razorpayPaymentId && <Field label="Payment" value="Paid" />}
      </Section>

      <Section title="Admin Account" step={3}>
        <Field label="Name" value={data.adminName} />
        <Field label="Email" value={data.adminEmail} />
      </Section>

      <Section title="Domain" step={4}>
        <Field label="Type" value={data.domainType === 'custom' ? 'Custom Domain' : 'BestoClinic Subdomain'} />
        {data.domainType === 'custom' && data.customDomain
          ? <Field label="Domain" value={data.customDomain} />
          : <Field label="Address" value={`${data.subdomain}.bestoclinic.com`} />
        }
      </Section>

      <Section title="Documents" step={5}>
        {(data.documents || []).length > 0 ? (
          data.documents.map((d, i) => <Field key={i} label={d.type.replace(/_/g, ' ')} value={d.name} />)
        ) : (
          <p className="text-xs text-neutral-900/40">No documents uploaded</p>
        )}
      </Section>

      {/* Terms */}
      <label className="flex items-start gap-3 cursor-pointer p-3 rounded-xl hover:bg-neutral-100/60 transition-colors">
        <input
          type="checkbox"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
          className="mt-0.5 w-4 h-4 rounded border-neutral-300 text-primary-600 focus:ring-primary-400"
        />
        <span className="text-xs text-neutral-900/60">
          I agree to the <a href="#" className="text-primary-600 underline">Terms of Service</a> and{' '}
          <a href="#" className="text-primary-600 underline">Privacy Policy</a>. I understand that my clinic data
          will be stored in an isolated database.
        </span>
      </label>

      {/* Pass agreed state up via data */}
      {agreed !== data._agreed && setTimeout(() => data._setAgreed?.(agreed), 0) && null}
    </motion.div>
  );
}

// ─── Provisioning Status Screen ──────────────────────

const PROVISION_STEPS = [
  { key: 'creating_db', label: 'Creating Database', icon: Database },
  { key: 'generating_clinic_code', label: 'Generating Clinic Code', icon: Zap },
  { key: 'seeding', label: 'Seeding Default Data', icon: Zap },
  { key: 'creating_admin', label: 'Creating Admin Account', icon: Shield },
  { key: 'applying_plan', label: 'Applying Plan Features', icon: CreditCard },
];

function ProvisioningStatusScreen({ token, adminEmail }) {
  const [status, setStatus] = useState(null);
  const [steps, setSteps] = useState([]);
  const [error, setError] = useState('');
  const [retrying, setRetrying] = useState(false);
  const [clinicCode, setClinicCode] = useState('');
  const navigate = useNavigate();
  const intervalRef = useRef(null);

  useEffect(() => {
    const poll = async () => {
      try {
        const res = await getProvisioningStatus(token);
        setStatus(res.data.status);
        setSteps(res.data.steps || []);
        if (res.data.clinicCode) setClinicCode(res.data.clinicCode);
        if (res.data.lastError) setError(res.data.lastError);

        if (res.data.status === 'completed' || res.data.status === 'failed' || res.data.status === 'rolled_back') {
          clearInterval(intervalRef.current);
        }
      } catch (err) {
        setError(err.message);
      }
    };

    poll();
    intervalRef.current = setInterval(poll, 3000);
    return () => clearInterval(intervalRef.current);
  }, [token]);

  const getStepStatus = (stepKey) => {
    const step = steps.find(s => s.step === stepKey);
    if (!step) return 'pending';
    return step.status;
  };

  const goToDashboard = () => {
    const params = new URLSearchParams();
    if (clinicCode) params.set('clinicCode', clinicCode);
    if (adminEmail) params.set('email', adminEmail);
    navigate(`/clinic/login?${params.toString()}`);
  };

  return (
    <motion.div {...fadeUp} className="text-center">
      {status === 'completed' ? (
        <>
          <div className="w-20 h-20 mx-auto bg-emerald-100 rounded-full flex items-center justify-center mb-6">
            <CheckCircle2 className="w-10 h-10 text-emerald-500" />
          </div>
          <h2 className="text-2xl font-bold text-neutral-900 mb-2">Clinic Created Successfully!</h2>
          <p className="text-neutral-900/50 text-sm mb-8">Your clinic is ready. Sign in to start managing your practice.</p>
        </>
      ) : status === 'failed' || status === 'rolled_back' ? (
        <>
          <div className="w-20 h-20 mx-auto bg-red-100 rounded-full flex items-center justify-center mb-6">
            <AlertCircle className="w-10 h-10 text-red-500" />
          </div>
          <h2 className="text-2xl font-bold text-neutral-900 mb-2">Setup Needs Attention</h2>
          <p className="text-red-500 text-sm mb-4">{error || 'Something went wrong during setup.'}</p>
          <button
            type="button"
            onClick={async () => {
              setRetrying(true);
              setError('');
              try {
                await retryProvisioning(token);
                setStatus('pending');
                // Resume polling
                intervalRef.current = setInterval(async () => {
                  try {
                    const res = await getProvisioningStatus(token);
                    setStatus(res.data.status);
                    setSteps(res.data.steps || []);
                    if (res.data.lastError) setError(res.data.lastError);
                    if (res.data.status === 'completed' || res.data.status === 'failed' || res.data.status === 'rolled_back') {
                      clearInterval(intervalRef.current);
                    }
                  } catch (err) { setError(err.message); }
                }, 3000);
              } catch (err) {
                setError(err.message || 'Retry failed. Please contact support.');
              } finally {
                setRetrying(false);
              }
            }}
            disabled={retrying}
            className="px-6 py-2.5 bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-xl transition-colors disabled:opacity-50 flex items-center gap-2 mx-auto mb-4"
          >
            {retrying ? <><Loader2 className="w-4 h-4 animate-spin" /> Retrying...</> : 'Retry Setup'}
          </button>
          <p className="text-neutral-900/40 text-xs">If the issue persists, <Link to="/contact" className="text-primary-600 underline">contact support</Link>.</p>
        </>
      ) : (
        <>
          <div className="w-16 h-16 mx-auto bg-primary-100 rounded-full flex items-center justify-center mb-6">
            <Loader2 className="w-8 h-8 text-primary-500 animate-spin" />
          </div>
          <h2 className="text-2xl font-bold text-neutral-900 mb-2">Setting Up Your Clinic</h2>
          <p className="text-neutral-900/50 text-sm mb-8">Please wait while we prepare your dedicated environment...</p>
        </>
      )}

      {/* Step progress */}
      <div className="max-w-sm mx-auto space-y-3 mb-8">
        {PROVISION_STEPS.map(({ key, label, icon: Icon }) => {
          const s = getStepStatus(key);
          return (
            <div key={key} className={`flex items-center gap-3 p-3 rounded-xl transition-colors ${
              s === 'completed' ? 'bg-emerald-50' : s === 'started' ? 'bg-primary-50' : s === 'failed' ? 'bg-red-50' : 'bg-neutral-100/60'
            }`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                s === 'completed' ? 'bg-emerald-500 text-white' : s === 'started' ? 'bg-primary-500 text-white' : s === 'failed' ? 'bg-red-500 text-white' : 'bg-neutral-200 text-neutral-900/30'
              }`}>
                {s === 'completed' ? <Check className="w-4 h-4" /> : s === 'started' ? <Loader2 className="w-4 h-4 animate-spin" /> : s === 'failed' ? <X className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
              </div>
              <span className={`text-sm font-medium ${
                s === 'completed' ? 'text-emerald-700' : s === 'started' ? 'text-primary-700' : s === 'failed' ? 'text-red-700' : 'text-neutral-900/40'
              }`}>{label}</span>
              {s === 'completed' && <Check className="w-4 h-4 text-emerald-500 ml-auto" />}
            </div>
          );
        })}
      </div>

      {status === 'completed' && (
        <Button onClick={goToDashboard} className="w-full max-w-sm mx-auto">
          Go to Dashboard <ArrowRight className="w-4 h-4 ml-1.5" />
        </Button>
      )}
    </motion.div>
  );
}

// ─── Main Wizard ─────────────────────────────────────

export default function Register() {
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [provisioning, setProvisioning] = useState(null); // { token, slug, adminEmail }
  const [agreed, setAgreed] = useState(false);
  const [errors, setErrors] = useState({});

  const [data, setData] = useState({
    // Step 1 — Clinic Details
    clinicName: '', email: '', phone: '', street: '', locality: '', city: '', state: '', zipCode: '',
    subdomain: '', logo: '',
    // Step 2 — Plan
    plan: 'free', billingCycle: 'monthly',
    // Step 3 — Payment (filled by Razorpay redirect callback)
    razorpayOrderId: '', razorpayPaymentId: '', razorpaySignature: '',
    // Step 4 — Admin Account
    adminName: '', adminEmail: '', adminPassword: '', confirmPassword: '',
    // Step 5 — Domain
    domainType: 'subdomain', customDomain: '',
    // Step 6 — Documents
    documents: [],
  });

  const navigate = useNavigate();

  const onChange = (partial) => {
    setData((prev) => ({ ...prev, ...partial }));
    // Clear related errors
    Object.keys(partial).forEach((k) => {
      if (errors[k]) setErrors((prev) => { const next = { ...prev }; delete next[k]; return next; });
    });
  };

  // Clean up any legacy query params from old embedded checkout flow
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('razorpay_payment_id') || params.get('cancelled')) {
      navigate('/register', { replace: true });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const validateStep = (s) => {
    const e = {};
    if (s === 0) {
      if (!data.clinicName.trim()) e.clinicName = 'Clinic name is required';
      if (!data.email.trim()) e.email = 'Email is required';
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) e.email = 'Enter a valid email';
      if (!data.phone.trim()) e.phone = 'Phone number is required';
      else if (!/^(\+91[\s-]?)?[6-9]\d{9}$/.test(data.phone.replace(/[\s-]/g, ''))) e.phone = 'Enter a valid Indian mobile number';
    }
    if (s === 2) {
      // Payment step — paid plans must have completed payment
      if (data.plan && data.plan !== 'free' && !data.razorpayPaymentId) {
        e._payment = 'Payment is required for paid plans';
      }
    }
    if (s === 3) {
      if (!data.adminName.trim()) e.adminName = 'Admin name is required';
      if (!data.adminEmail.trim()) e.adminEmail = 'Admin email is required';
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.adminEmail)) e.adminEmail = 'Enter a valid email';
      if (!data.adminPassword) e.adminPassword = 'Password is required';
      else if (data.adminPassword.length < 8) e.adminPassword = 'Minimum 8 characters';
      if (!data.confirmPassword) e.confirmPassword = 'Please confirm your password';
      else if (data.adminPassword !== data.confirmPassword) e.confirmPassword = 'Passwords do not match';
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const next = () => {
    if (!validateStep(step)) return;
    setStep((s) => Math.min(s + 1, 6));
  };

  const back = () => setStep((s) => Math.max(s - 1, 0));
  const goToStep = (s) => setStep(s);

  const handleSubmit = async () => {
    // Validate all required steps before submission
    for (const s of [0, 2, 3]) {
      if (!validateStep(s)) {
        setStep(s);
        setSubmitError('Please complete all required fields before submitting.');
        return;
      }
    }
    if (!agreed) {
      setSubmitError('Please agree to the Terms of Service and Privacy Policy');
      return;
    }
    setSubmitError('');
    setSubmitting(true);

    try {
      const payload = {
        clinicName: data.clinicName,
        email: data.email,
        phone: data.phone || undefined,
        logo: data.logo || undefined,
        address: {
          street: data.street || undefined,
          locality: data.locality || undefined,
          city: data.city || undefined,
          state: data.state || undefined,
          zipCode: data.zipCode || undefined,
        },
        plan: data.plan,
        billingCycle: data.billingCycle || 'monthly',
        adminName: data.adminName,
        adminEmail: data.adminEmail,
        adminPassword: data.adminPassword,
        subdomain: data.subdomain || undefined,
        documents: data.documents.length > 0 ? data.documents : undefined,
        razorpayOrderId: data.razorpayOrderId || undefined,
        razorpayPaymentId: data.razorpayPaymentId || undefined,
        razorpaySignature: data.razorpaySignature || undefined,
      };

      const res = await registerClinic(payload);
      setProvisioning({
        token: res.data.registrationToken,
        adminEmail: data.adminEmail,
      });
    } catch (err) {
      setSubmitError(err.message || 'Registration failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // If provisioning is in progress, show that screen
  if (provisioning) {
    return (
      <>
        <SEO title="Setting Up Your Clinic" />
        <div className="min-h-screen flex items-center justify-center bg-neutral-50 px-6 py-12">
          <div className="w-full max-w-lg">
            <ProvisioningStatusScreen
              token={provisioning.token}
              adminEmail={provisioning.adminEmail}
            />
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <SEO title="Register Your Clinic" description="Register your clinic on BestoClinic — the complete practice management platform." />

      <div className="min-h-screen flex">
        {/* Left panel — branding */}
        <div className="hidden lg:flex lg:w-[40%] relative overflow-hidden bg-gradient-to-br from-primary-900 via-primary-800 to-primary-950">
          {/* Decorative blurs */}
          <div className="absolute top-0 right-0 w-96 h-96 bg-primary-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3" />
          <div className="absolute bottom-0 left-0 w-80 h-80 bg-primary-400/8 rounded-full blur-3xl translate-y-1/3 -translate-x-1/4" />
          <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.8) 1px, transparent 1px)', backgroundSize: '32px 32px' }} />

          <div className="relative flex flex-col justify-between p-12 xl:p-16 w-full">
            <Link to="/" className="inline-flex items-center gap-3">
              <img src="/platform_admin/logo/Besto Clinic Logo.svg" alt="BestoClinic" className="w-10 h-10" />
              <span className="text-xl font-bold font-display text-white">BestoClinic</span>
            </Link>

            <div className="flex-1 flex flex-col justify-center max-w-md">
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/10 backdrop-blur-sm text-xs font-medium text-primary-200 border border-white/10 mb-6 w-fit">
                <Sparkles className="h-3.5 w-3.5" /> Multi-Tenant Platform
              </span>
              <h1 className="text-3xl xl:text-4xl font-bold font-display text-white leading-tight mb-4">
                Your clinic, your database, your rules
              </h1>
              <p className="text-primary-200/70 text-base leading-relaxed mb-10">
                Every clinic gets its own isolated database, custom subdomain, and dedicated environment. Enterprise-grade security with zero shared data.
              </p>

              <div className="space-y-4">
                {[
                  { icon: Database, title: 'Isolated Database', desc: 'Your data never mixes with other clinics' },
                  { icon: Globe, title: 'Custom Domain', desc: 'Your own subdomain or custom domain' },
                  { icon: Shield, title: 'HIPAA Compliant', desc: 'Enterprise-grade security & encryption' },
                ].map((item) => (
                  <div key={item.title} className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-xl bg-white/6 backdrop-blur-sm flex items-center justify-center border border-white/6 shrink-0">
                      <item.icon className="h-5 w-5 text-primary-300" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-white">{item.title}</p>
                      <p className="text-xs text-primary-200/50 mt-0.5">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <p className="text-xs text-primary-400/50">
              © {new Date().getFullYear()} BestoClinic. All rights reserved.
            </p>
          </div>
        </div>

        {/* Right panel — wizard */}
        <div className="flex-1 flex flex-col bg-neutral-50 relative overflow-hidden">
          {/* Background accents */}
          <div className="absolute top-0 right-0 w-72 h-72 bg-primary-100/30 rounded-full blur-3xl -translate-y-1/2 translate-x-1/4" />
          <div className="absolute bottom-0 left-0 w-56 h-56 bg-primary-50/40 rounded-full blur-3xl translate-y-1/3" />

          <div className="flex-1 flex items-start justify-center px-6 py-8 overflow-y-auto">
            <div className="w-full max-w-[520px] relative">
              {/* Mobile logo */}
              <div className="lg:hidden text-center mb-6">
                <Link to="/" className="inline-flex items-center gap-2.5">
                  <img src="/platform_admin/logo/Besto Clinic Logo.svg" alt="BestoClinic" className="w-9 h-9" />
                  <span className="text-2xl font-bold text-neutral-900">
                    Besto<span className="text-secondary-500">Clinic</span>
                  </span>
                </Link>
              </div>

              {/* Step indicator */}
              <StepIndicator current={step} onStepClick={goToStep} />

              {/* Step title */}
              <div className="mb-6">
                <h2 className="text-xl font-bold font-display text-neutral-900">{STEPS[step].label}</h2>
                <p className="text-neutral-900/40 text-sm mt-1">Step {step + 1} of {STEPS.length}</p>
              </div>

              {/* Error */}
              {submitError && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center gap-2.5 bg-red-50 text-red-700 px-4 py-3 rounded-xl text-sm border border-red-100 mb-4"
                >
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {submitError}
                </motion.div>
              )}

              {/* Glass card */}
              <div className="bg-white/70 backdrop-blur-xl rounded-2xl border border-neutral-300/60 shadow-[var(--shadow-lg)] p-7">
                <AnimatePresence mode="wait">
                  {step === 0 && <Step1ClinicDetails key="s1" data={data} onChange={onChange} errors={errors} />}
                  {step === 1 && <Step2PlanSelection key="s2" data={data} onChange={onChange} />}
                  {step === 2 && <Step3Payment key="s3" data={data} onChange={onChange} />}
                  {step === 3 && <Step4AdminAccount key="s4" data={data} onChange={onChange} errors={errors} />}
                  {step === 4 && <Step5DomainSetup key="s5" data={data} onChange={onChange} />}
                  {step === 5 && <Step6Documents key="s6" data={data} onChange={onChange} />}
                  {step === 6 && <Step7Review key="s7" data={{ ...data, _agreed: agreed, _setAgreed: setAgreed }} goToStep={goToStep} />}
                </AnimatePresence>

                {/* Navigation buttons */}
                <div className="flex items-center justify-between mt-8 pt-6 border-t border-neutral-200/60">
                  {step > 0 ? (
                    <button
                      type="button"
                      onClick={back}
                      className="flex items-center gap-1.5 text-sm font-medium text-neutral-900/50 hover:text-neutral-900/70 transition-colors"
                    >
                      <ArrowLeft className="w-4 h-4" /> Back
                    </button>
                  ) : (
                    <Link to="/" className="text-sm font-medium text-neutral-900/50 hover:text-neutral-900/70 transition-colors">Cancel</Link>
                  )}

                  {step < 6 ? (
                    <Button onClick={next} size="sm">
                      {step === 5 ? 'Review' : 'Next'} <ArrowRight className="w-4 h-4 ml-1.5" />
                    </Button>
                  ) : (
                    <Button
                      onClick={handleSubmit}
                      size="sm"
                      disabled={submitting || !agreed}
                      className={!agreed ? 'opacity-50 cursor-not-allowed' : ''}
                    >
                      {submitting ? (
                        <><Loader2 className="w-4 h-4 animate-spin mr-1.5" /> Creating Clinic...</>
                      ) : (
                        <>Register Clinic <ArrowRight className="w-4 h-4 ml-1.5" /></>
                      )}
                    </Button>
                  )}
                </div>
              </div>

              {/* Footer */}
              <p className="mt-5 text-center text-sm text-neutral-900/40">
                Already have an account?{' '}
                <Link to="/clinic/login" className="text-primary-600 hover:text-primary-700 font-semibold transition-colors">
                  Sign in
                </Link>
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
