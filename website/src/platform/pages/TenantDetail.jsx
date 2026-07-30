import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useRef } from 'react';
import {
  getTenant, updateTenant, updateTenantFeatures, getTenantUsage, getTenantAuditLog,
  changePlan, cancelSubscription, reactivateSubscription, activateSubscription,
  setCustomPricing, cancelScheduledChange, listPlans, calculateProration, extendTrial,
  assignSuperAdmin, activateTenant, uploadTenantLogo,
  getClinicJobPortalStatus, enableClinicJobPortal, disableClinicJobPortal, grantClinicCredits,
} from '../api';
import {
  StatusBadge, TabBar, Modal, ConfirmDialog, Spinner, ErrorAlert,
} from '../components/shared';
import { ArrowLeft, Save, AlertTriangle, CreditCard, BarChart3, History, Settings, UserCog, CheckCircle, ImagePlus, Trash2, Briefcase, Coins, Plus } from 'lucide-react';
import { resolveAssetUrl } from '../../lib/assetUrl';

export default function TenantDetail() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [tenant, setTenant] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('info');
  const [msg, setMsg] = useState({ text: '', type: 'success' });
  const [saving, setSaving] = useState(false);

  // Editable info
  const [form, setForm] = useState({ name: '', email: '', phone: '', address: '' });
  const [features, setFeatures] = useState({});

  // Subscription
  const [plans, setPlans] = useState([]);
  const [changePlanModal, setChangePlanModal] = useState(false);
  const [planForm, setPlanForm] = useState({ planId: '', billingCycle: 'monthly', promoCode: '' });
  const [proration, setProration] = useState(null);
  const [cancelModal, setCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [confirmAction, setConfirmAction] = useState(null);
  const [customPricing, setCustomPricing] = useState({ enabled: false, amount: 0 });

  // Usage
  const [usage, setUsage] = useState(null);

  // Audit
  const [auditLog, setAuditLog] = useState([]);
  const [auditPage, setAuditPage] = useState(1);

  // SuperAdmin
  const [superAdminModal, setSuperAdminModal] = useState(false);
  const [superAdminForm, setSuperAdminForm] = useState({ name: '', email: '', phone: '' });

  // Logo
  const [logoUploading, setLogoUploading] = useState(false);
  const logoInputRef = useRef(null);

  // Job Portal
  const [jpStatus, setJpStatus] = useState(null);
  const [jpLoading, setJpLoading] = useState(false);
  const [creditForm, setCreditForm] = useState({ amount: '', description: '' });
  const [enableCredits, setEnableCredits] = useState('');

  useEffect(() => {
    Promise.all([
      getTenant(slug),
      listPlans({}).catch(() => ({ data: [] })),
    ])
      .then(([tenantRes, planRes]) => {
        const t = tenantRes.data;
        setTenant(t);

        // Format address object into readable string
        const addressStr = t.address
          ? [
              t.address.street,
              t.address.locality,
              t.address.city,
              t.address.state,
              t.address.zipCode,
            ].filter(Boolean).join(', ')
          : '';

        setForm({ name: t.name, email: t.email, phone: t.phone || '', address: addressStr });
        setFeatures(t.features || {});
        setCustomPricing({
          enabled: t.subscription?.customPricing?.enabled || false,
          amount: t.subscription?.customPricing?.amount || t.subscription?.billedAmount || 0,
        });
        setPlans(Array.isArray(planRes.data) ? planRes.data : planRes.data?.items || []);
      })
      .catch(() => navigate('/platform/tenants'))
      .finally(() => setLoading(false));
  }, [slug]);

  const fetchJobPortalStatus = () => {
    setJpLoading(true);
    getClinicJobPortalStatus(slug).then((r) => setJpStatus(r.data)).catch(() => {}).finally(() => setJpLoading(false));
  };

  useEffect(() => {
    if (tab === 'usage') getTenantUsage(slug).then((r) => setUsage(r.data)).catch(() => {});
    if (tab === 'audit') getTenantAuditLog(slug, { page: auditPage, limit: 20 }).then((r) => setAuditLog(Array.isArray(r.data) ? r.data : r.data?.items || [])).catch(() => {});
    if (tab === 'jobPortal') fetchJobPortalStatus();
  }, [tab, auditPage, slug]);

  const flash = (text, type = 'success') => {
    setMsg({ text, type });
    setTimeout(() => setMsg({ text: '', type: 'success' }), 4000);
  };

  const refreshTenant = async () => {
    const res = await getTenant(slug);
    setTenant(res.data);
  };

  // ─── Info ────────────────────────────────────
  const handleSaveInfo = async () => {
    setSaving(true);
    try {
      await updateTenant(slug, form);
      await refreshTenant();
      flash('Tenant info updated');
    } catch (err) { flash(err.message, 'error'); }
    finally { setSaving(false); }
  };

  const handleSaveFeatures = async () => {
    setSaving(true);
    try {
      await updateTenantFeatures(slug, features);
      await refreshTenant();
      flash('Features updated');
    } catch (err) { flash(err.message, 'error'); }
    finally { setSaving(false); }
  };

  // ─── Subscription Actions ───────────────────
  const handleChangePlan = async () => {
    setSaving(true);
    try {
      await changePlan(slug, planForm);
      setChangePlanModal(false);
      await refreshTenant();
      flash('Plan changed successfully');
    } catch (err) { flash(err.message, 'error'); }
    finally { setSaving(false); }
  };

  const handleCancel = async () => {
    setSaving(true);
    try {
      await cancelSubscription(slug, { reason: cancelReason });
      setCancelModal(false);
      setCancelReason('');
      await refreshTenant();
      flash('Subscription cancelled');
    } catch (err) { flash(err.message, 'error'); }
    finally { setSaving(false); }
  };

  const handleConfirmAction = async () => {
    if (!confirmAction) return;
    setSaving(true);
    try {
      if (confirmAction.type === 'reactivate') await reactivateSubscription(slug);
      else if (confirmAction.type === 'activate') await activateTenant(slug);
      else if (confirmAction.type === 'cancelChange') await cancelScheduledChange(slug);
      setConfirmAction(null);
      await refreshTenant();
      flash(`${confirmAction.label} successful`);
    } catch (err) { flash(err.message, 'error'); }
    finally { setSaving(false); }
  };

  const handleAssignSuperAdmin = async () => {
    setSaving(true);
    try {
      await assignSuperAdmin(slug, superAdminForm);
      setSuperAdminModal(false);
      setSuperAdminForm({ name: '', email: '', phone: '' });
      await refreshTenant();
      flash('SuperAdmin assigned successfully');
    } catch (err) { flash(err.message, 'error'); }
    finally { setSaving(false); }
  };

  const handleLogoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'].includes(file.type)) {
      flash('Only PNG, JPG, WebP, or SVG files are allowed', 'error');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      flash('Logo must be under 2MB', 'error');
      return;
    }
    setLogoUploading(true);
    try {
      const reader = new FileReader();
      const base64 = await new Promise((resolve, reject) => {
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      await uploadTenantLogo(slug, base64, file.type);
      await refreshTenant();
      flash('Logo uploaded successfully');
    } catch (err) { flash(err.message, 'error'); }
    finally { setLogoUploading(false); if (logoInputRef.current) logoInputRef.current.value = ''; }
  };

  const handleRemoveLogo = async () => {
    setSaving(true);
    try {
      await updateTenant(slug, { logo: '' });
      await refreshTenant();
      flash('Logo removed');
    } catch (err) { flash(err.message, 'error'); }
    finally { setSaving(false); }
  };

  const handleCustomPricing = async () => {
    setSaving(true);
    try {
      await setCustomPricing(slug, customPricing);
      await refreshTenant();
      flash('Custom pricing updated');
    } catch (err) { flash(err.message, 'error'); }
    finally { setSaving(false); }
  };

  const handleCalcProration = async () => {
    if (!planForm.planId || !tenant?.subscription?._id) return;
    try {
      const res = await calculateProration(tenant.subscription._id, { planId: planForm.planId, billingCycle: planForm.billingCycle });
      setProration(res.data);
    } catch { setProration(null); }
  };

  const handleExtendTrial = async () => {
    setSaving(true);
    try {
      await extendTrial(tenant.subscription?._id, 7);
      await refreshTenant();
      flash('Trial extended by 7 days');
    } catch (err) { flash(err.message, 'error'); }
    finally { setSaving(false); }
  };

  // ─── Job Portal Handlers ────────────────────
  const handleEnableJobPortal = async () => {
    setSaving(true);
    try {
      await enableClinicJobPortal(slug, { initialCredits: Number(enableCredits) || 0 });
      setEnableCredits('');
      fetchJobPortalStatus();
      await refreshTenant();
      flash('Job portal enabled');
    } catch (err) { flash(err.message, 'error'); }
    finally { setSaving(false); }
  };

  const handleDisableJobPortal = async () => {
    setSaving(true);
    try {
      await disableClinicJobPortal(slug);
      fetchJobPortalStatus();
      await refreshTenant();
      flash('Job portal disabled');
    } catch (err) { flash(err.message, 'error'); }
    finally { setSaving(false); }
  };

  const handleGrantCredits = async (e) => {
    e.preventDefault();
    if (!creditForm.amount || Number(creditForm.amount) <= 0) { flash('Enter a positive credit amount', 'error'); return; }
    setSaving(true);
    try {
      await grantClinicCredits(slug, { amount: Number(creditForm.amount), description: creditForm.description });
      setCreditForm({ amount: '', description: '' });
      fetchJobPortalStatus();
      flash(`${creditForm.amount} credits granted`);
    } catch (err) { flash(err.message, 'error'); }
    finally { setSaving(false); }
  };

  if (loading) return <Spinner />;
  if (!tenant) return null;

  const sub = tenant.subscription || {};
  const status = sub.status;
  const tabs = [
    { key: 'info', label: 'Info' },
    { key: 'subscription', label: 'Subscription' },
    { key: 'jobPortal', label: 'Job Portal' },
    { key: 'usage', label: 'Usage' },
    { key: 'audit', label: 'Audit Log' },
  ];

  return (
    <div className="space-y-6">
      {/* Back + Header */}
      <button onClick={() => navigate('/platform/tenants')} className="flex items-center gap-2 text-sm text-neutral-900/50 hover:text-neutral-900/70">
        <ArrowLeft className="h-4 w-4" /> Back to Tenants
      </button>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {tenant.logo && (
            <img
              src={resolveAssetUrl(tenant.logo)}
              alt=""
              className="w-10 h-10 rounded-xl object-contain bg-neutral-50 border border-neutral-300/40 p-1"
            />
          )}
          <h2 className="text-xl font-bold font-display text-neutral-900">{tenant.name}</h2>
          <StatusBadge status={status} />
        </div>
        <div className="flex gap-2">
          {(status === 'suspended' || status === 'cancelled') && (
            <button onClick={() => setConfirmAction({ type: 'reactivate', label: 'Reactivation' })} className="px-3 py-2 text-xs font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition">
              Reactivate
            </button>
          )}
          {status === 'trial' && (
            <button onClick={() => setConfirmAction({ type: 'activate', label: 'Activation' })} className="px-3 py-2 text-xs font-medium bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition">
              Activate
            </button>
          )}
        </div>
      </div>

      {msg.text && (
        <div className={`px-4 py-2 rounded-lg text-sm ${msg.type === 'error' ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>
          {msg.text}
        </div>
      )}

      <TabBar tabs={tabs} active={tab} onChange={setTab} />

      {/* ─── Info Tab ────────────────────────────────── */}
      {tab === 'info' && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-neutral-300/60 p-6 space-y-4">
            <h3 className="font-semibold font-display text-neutral-900 flex items-center gap-2"><Settings className="h-4 w-4" /> Basic Information</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[
                { key: 'name', label: 'Name' },
                { key: 'email', label: 'Email' },
                { key: 'phone', label: 'Phone' },
                { key: 'address', label: 'Address' },
              ].map(({ key, label }) => (
                <div key={key}>
                  <label className="block text-sm font-medium text-neutral-900/60 mb-1">{label}</label>
                  <input
                    value={form[key]}
                    onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                    className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
                  />
                </div>
              ))}
              <div>
                <label className="block text-sm font-medium text-neutral-900/60 mb-1">Slug</label>
                <input value={tenant.slug} disabled className="w-full px-3 py-2 border border-neutral-300/60 rounded-lg text-sm bg-neutral-50 text-neutral-900/40" />
              </div>
            </div>
            <div className="flex justify-end">
              <button onClick={handleSaveInfo} disabled={saving} className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white text-sm rounded-lg hover:bg-primary-700 disabled:opacity-50 transition">
                <Save className="h-4 w-4" /> Save Info
              </button>
            </div>
          </div>

          {/* Clinic Logo */}
          <div className="bg-white rounded-2xl border border-neutral-300/60 p-6 space-y-4">
            <h3 className="font-semibold font-display text-neutral-900 flex items-center gap-2"><ImagePlus className="h-4 w-4" /> Clinic Logo</h3>
            <div className="flex items-center gap-6">
              {tenant.logo ? (
                <div className="relative group">
                  <img src={resolveAssetUrl(tenant.logo)} alt="Clinic logo" className="w-24 h-24 object-contain rounded-xl border border-neutral-300/60 bg-neutral-50 p-2" />
                  <button
                    onClick={handleRemoveLogo}
                    className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition"
                    title="Remove logo"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ) : (
                <div className="w-24 h-24 rounded-xl border-2 border-dashed border-neutral-300 bg-neutral-50 flex items-center justify-center">
                  <ImagePlus className="h-8 w-8 text-neutral-900/20" />
                </div>
              )}
              <div className="space-y-2">
                <p className="text-sm text-neutral-900/60">{tenant.logo ? 'Replace the current logo' : 'Upload a logo for this clinic'}</p>
                <p className="text-xs text-neutral-900/40">PNG, JPG, WebP, or SVG. Max 2MB.</p>
                <input ref={logoInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={handleLogoUpload} className="hidden" />
                <button
                  onClick={() => logoInputRef.current?.click()}
                  disabled={logoUploading}
                  className="px-4 py-2 text-xs font-medium bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 transition flex items-center gap-1.5"
                >
                  <ImagePlus className="h-3.5 w-3.5" />
                  {logoUploading ? 'Uploading...' : 'Upload Logo'}
                </button>
              </div>
            </div>
          </div>

          {/* SuperAdmin Section */}
          <div className="bg-white rounded-2xl border border-neutral-300/60 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold font-display text-neutral-900 flex items-center gap-2">
                <UserCog className="h-4 w-4" /> SuperAdmin
              </h3>
              {!tenant.superAdmin?.email && (
                <button
                  onClick={() => setSuperAdminModal(true)}
                  className="px-3 py-2 text-xs font-medium bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition"
                >
                  Assign SuperAdmin
                </button>
              )}
            </div>
            {tenant.superAdmin?.email ? (
              <div className="bg-emerald-50 rounded-lg p-4 flex items-start gap-3">
                <CheckCircle className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-emerald-900">{tenant.superAdmin.name}</p>
                  <p className="text-xs text-emerald-700 mt-0.5">{tenant.superAdmin.email}</p>
                  {tenant.superAdmin.phone && (
                    <p className="text-xs text-emerald-700">{tenant.superAdmin.phone}</p>
                  )}
                  {tenant.superAdmin.provisionedAt && (
                    <p className="text-xs text-emerald-600/70 mt-1">
                      Assigned: {new Date(tenant.superAdmin.provisionedAt).toLocaleString('en-IN')}
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <div className="bg-amber-50 rounded-lg p-4 flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                <p className="text-sm text-amber-700">
                  No SuperAdmin assigned. A SuperAdmin is required before activating this clinic.
                </p>
              </div>
            )}
          </div>

          {/* Feature overrides */}
          <div className="bg-white rounded-2xl border border-neutral-300/60 p-6 space-y-4">
            <h3 className="font-semibold font-display text-neutral-900">Feature Overrides</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[
                { key: 'maxDoctors', label: 'Max Doctors', type: 'number' },
                { key: 'maxStaff', label: 'Max Staff', type: 'number' },
                { key: 'maxBranches', label: 'Max Branches', type: 'number' },
                { key: 'smsEnabled', label: 'SMS Enabled', type: 'boolean' },
                { key: 'teleHealthEnabled', label: 'TeleHealth', type: 'boolean' },
                { key: 'customBranding', label: 'Custom Branding', type: 'boolean' },
                { key: 'jobPortalEnabled', label: 'Job Portal', type: 'boolean' },
                { key: 'jobPostingCredits', label: 'Monthly Job Credits', type: 'number' },
              ].map(({ key, label, type }) => (
                <div key={key} className="flex items-center justify-between py-2">
                  <span className="text-sm text-neutral-900/70">{label}</span>
                  {type === 'boolean' ? (
                    <button
                      onClick={() => setFeatures((f) => ({ ...f, [key]: !f[key] }))}
                      className={`relative w-10 h-5 rounded-full transition-colors ${features[key] ? 'bg-emerald-500' : 'bg-gray-300'}`}
                    >
                      <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${features[key] ? 'translate-x-5' : ''}`} />
                    </button>
                  ) : (
                    <input
                      type="number"
                      value={features[key] || 0}
                      onChange={(e) => setFeatures((f) => ({ ...f, [key]: parseInt(e.target.value, 10) || 0 }))}
                      className="w-20 px-2 py-1 border border-neutral-300 rounded text-sm text-right"
                    />
                  )}
                </div>
              ))}
            </div>
            <div className="flex justify-end">
              <button onClick={handleSaveFeatures} disabled={saving} className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white text-sm rounded-lg hover:bg-primary-700 disabled:opacity-50 transition">
                <Save className="h-4 w-4" /> Save Features
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Subscription Tab ────────────────────────── */}
      {tab === 'subscription' && (
        <div className="space-y-6">
          {/* Current Plan Card */}
          <div className="bg-white rounded-2xl border border-neutral-300/60 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold font-display text-neutral-900 flex items-center gap-2"><CreditCard className="h-4 w-4" /> Current Plan</h3>
              <StatusBadge status={status} />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
              <div>
                <span className="text-neutral-900/50">Plan</span>
                <p className="font-medium capitalize">{sub.plan?.name || sub.planSlug || 'free'}</p>
              </div>
              <div>
                <span className="text-neutral-900/50">Billing</span>
                <p className="font-medium capitalize">{sub.billingCycle || '—'}</p>
              </div>
              <div>
                <span className="text-neutral-900/50">Amount</span>
                <p className="font-medium">₹{(sub.billedAmount || 0).toLocaleString('en-IN')}</p>
              </div>
              <div>
                <span className="text-neutral-900/50">Period End</span>
                <p className="font-medium">{sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd).toLocaleDateString() : '—'}</p>
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-neutral-300/30">
              <button onClick={() => { setChangePlanModal(true); setProration(null); }} className="px-3 py-2 text-xs font-medium bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition">
                Change Plan
              </button>
              {status === 'trial' && (
                <button onClick={handleExtendTrial} disabled={saving} className="px-3 py-2 text-xs font-medium bg-amber-50 text-amber-700 rounded-lg hover:bg-amber-100 transition disabled:opacity-50">
                  Extend Trial +7d
                </button>
              )}
              {status === 'active' && (
                <button onClick={() => setCancelModal(true)} className="px-3 py-2 text-xs font-medium bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition">
                  Cancel Subscription
                </button>
              )}
              {(status === 'suspended' || status === 'cancelled') && (
                <button onClick={() => setConfirmAction({ type: 'reactivate', label: 'Reactivation' })} className="px-3 py-2 text-xs font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition">
                  Reactivate
                </button>
              )}
            </div>
          </div>

          {/* Scheduled Change */}
          {sub.scheduledChange && (
            <div className="bg-amber-50 rounded-2xl border border-amber-200 p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <AlertTriangle className="h-5 w-5 text-amber-600" />
                <div>
                  <p className="text-sm font-medium text-amber-800">Scheduled Change</p>
                  <p className="text-xs text-amber-600">
                    {sub.scheduledChange.direction} to {sub.scheduledChange.newPlan} on {new Date(sub.scheduledChange.effectiveDate).toLocaleDateString()}
                  </p>
                </div>
              </div>
              <button onClick={() => setConfirmAction({ type: 'cancelChange', label: 'Cancel scheduled change' })} className="px-3 py-1.5 text-xs font-medium bg-white border border-amber-300 text-amber-700 rounded-lg hover:bg-amber-100 transition">
                Cancel Change
              </button>
            </div>
          )}

          {/* Custom Pricing */}
          <div className="bg-white rounded-2xl border border-neutral-300/60 p-6">
            <h3 className="font-semibold font-display text-neutral-900 mb-4">Custom Pricing</h3>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-sm">
                <button
                  onClick={() => setCustomPricing((c) => ({ ...c, enabled: !c.enabled }))}
                  className={`relative w-10 h-5 rounded-full transition-colors ${customPricing.enabled ? 'bg-primary-500' : 'bg-gray-300'}`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${customPricing.enabled ? 'translate-x-5' : ''}`} />
                </button>
                Enable
              </label>
              {customPricing.enabled && (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-neutral-900/50">₹</span>
                  <input
                    type="number"
                    value={customPricing.amount}
                    onChange={(e) => setCustomPricing((c) => ({ ...c, amount: Number(e.target.value) }))}
                    className="w-28 px-3 py-2 border border-neutral-300 rounded-lg text-sm"
                  />
                  <span className="text-xs text-neutral-900/40">/ month</span>
                </div>
              )}
              <button onClick={handleCustomPricing} disabled={saving} className="px-3 py-2 text-xs font-medium bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 transition">
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Usage Tab ──────────────────────────────── */}
      {tab === 'usage' && (
        <div className="bg-white rounded-2xl border border-neutral-300/60 p-6">
          <h3 className="font-semibold font-display text-neutral-900 flex items-center gap-2 mb-6"><BarChart3 className="h-4 w-4" /> Resource Usage</h3>
          {usage ? (
            <div className="space-y-5">
              {[
                { label: 'Doctors', used: usage.doctors?.used || 0, limit: usage.doctors?.limit || 0 },
                { label: 'Staff', used: usage.staff?.used || 0, limit: usage.staff?.limit || 0 },
                { label: 'Branches', used: usage.branches?.used || 0, limit: usage.branches?.limit || 0 },
                { label: 'Storage (MB)', used: usage.storage?.used || 0, limit: usage.storage?.limit || 0 },
                { label: 'SMS', used: usage.sms?.used || 0, limit: usage.sms?.limit || 0 },
              ].map(({ label, used, limit }) => {
                const pct = limit > 0 ? Math.min((used / limit) * 100, 100) : 0;
                const color = pct > 90 ? 'bg-red-500' : pct > 70 ? 'bg-amber-500' : 'bg-emerald-500';
                return (
                  <div key={label}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-neutral-900/70">{label}</span>
                      <span className="text-neutral-900/50">{used} / {limit || '∞'}</span>
                    </div>
                    <div className="w-full bg-neutral-100 rounded-full h-2.5">
                      <div className={`${color} h-2.5 rounded-full transition-all`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <Spinner />
          )}
        </div>
      )}

      {/* ─── Job Portal Tab ─────────────────────────── */}
      {tab === 'jobPortal' && (
        <div className="space-y-6">
          {jpLoading ? (
            <Spinner />
          ) : (
            <>
              {/* Enable / Disable Toggle */}
              <div className="bg-white rounded-2xl border border-neutral-300/60 p-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Briefcase className="h-5 w-5 text-neutral-900/60" />
                    <div>
                      <h3 className="font-semibold font-display text-neutral-900">Job Portal Access</h3>
                      <p className="text-xs text-neutral-900/50 mt-0.5">
                        {jpStatus?.enabled
                          ? 'This clinic can post jobs and manage applicants'
                          : 'Job portal is disabled for this clinic'}
                      </p>
                    </div>
                  </div>
                  {jpStatus?.enabled ? (
                    <button
                      onClick={handleDisableJobPortal}
                      disabled={saving}
                      className="px-4 py-2 text-xs font-medium bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition disabled:opacity-50"
                    >
                      Disable
                    </button>
                  ) : (
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="0"
                        placeholder="Initial credits"
                        value={enableCredits}
                        onChange={(e) => setEnableCredits(e.target.value)}
                        className="w-32 px-3 py-2 border border-neutral-300 rounded-lg text-sm"
                      />
                      <button
                        onClick={handleEnableJobPortal}
                        disabled={saving}
                        className="px-4 py-2 text-xs font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition disabled:opacity-50"
                      >
                        {saving ? 'Enabling...' : 'Enable'}
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {jpStatus?.enabled && (
                <>
                  {/* Stats */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div className="bg-white rounded-2xl border border-neutral-300/60 p-4 text-center">
                      <p className="text-2xl font-bold text-neutral-900">{jpStatus?.wallet?.balance ?? 0}</p>
                      <p className="text-xs text-neutral-900/50 mt-1">Credit Balance</p>
                    </div>
                    <div className="bg-white rounded-2xl border border-neutral-300/60 p-4 text-center">
                      <p className="text-2xl font-bold text-neutral-900">{jpStatus?.jobs?.active || 0}</p>
                      <p className="text-xs text-neutral-900/50 mt-1">Active Jobs</p>
                    </div>
                    <div className="bg-white rounded-2xl border border-neutral-300/60 p-4 text-center">
                      <p className="text-2xl font-bold text-neutral-900">{(jpStatus?.jobs?.draft || 0) + (jpStatus?.jobs?.closed || 0) + (jpStatus?.jobs?.filled || 0)}</p>
                      <p className="text-xs text-neutral-900/50 mt-1">Other Jobs</p>
                    </div>
                    <div className="bg-white rounded-2xl border border-neutral-300/60 p-4 text-center">
                      <p className="text-2xl font-bold text-neutral-900">{jpStatus?.applications || 0}</p>
                      <p className="text-xs text-neutral-900/50 mt-1">Applications</p>
                    </div>
                  </div>

                  {/* Grant Credits */}
                  <div className="bg-white rounded-2xl border border-neutral-300/60 p-6">
                    <h3 className="font-semibold font-display text-neutral-900 flex items-center gap-2 mb-4">
                      <Coins className="h-4 w-4" /> Grant Credits
                    </h3>
                    <form onSubmit={handleGrantCredits} className="flex flex-wrap items-end gap-3">
                      <div>
                        <label className="block text-sm font-medium text-neutral-900/60 mb-1">Credits</label>
                        <input
                          type="number"
                          min="1"
                          required
                          value={creditForm.amount}
                          onChange={(e) => setCreditForm((f) => ({ ...f, amount: e.target.value }))}
                          className="w-28 px-3 py-2 border border-neutral-300 rounded-lg text-sm"
                          placeholder="5"
                        />
                      </div>
                      <div className="flex-1 min-w-[200px]">
                        <label className="block text-sm font-medium text-neutral-900/60 mb-1">Reason</label>
                        <input
                          type="text"
                          value={creditForm.description}
                          onChange={(e) => setCreditForm((f) => ({ ...f, description: e.target.value }))}
                          className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm"
                          placeholder="e.g. Complimentary credits, promotion, etc."
                        />
                      </div>
                      <button
                        type="submit"
                        disabled={saving}
                        className="flex items-center gap-1.5 px-4 py-2 bg-primary-600 text-white text-sm rounded-lg hover:bg-primary-700 disabled:opacity-50 transition"
                      >
                        <Plus className="h-3.5 w-3.5" /> Grant
                      </button>
                    </form>
                    <div className="flex items-center gap-4 mt-4 pt-4 border-t border-neutral-100">
                      <div className="text-sm text-neutral-900/50">
                        Lifetime purchased: <span className="font-medium text-neutral-900">{jpStatus?.wallet?.totalPurchased || 0}</span>
                      </div>
                      <div className="text-sm text-neutral-900/50">
                        Lifetime consumed: <span className="font-medium text-neutral-900">{jpStatus?.wallet?.totalConsumed || 0}</span>
                      </div>
                    </div>
                  </div>

                  {/* Recent Transactions */}
                  {jpStatus?.transactions?.length > 0 && (
                    <div className="bg-white rounded-2xl border border-neutral-300/60 p-6">
                      <h3 className="font-semibold font-display text-neutral-900 flex items-center gap-2 mb-4">
                        <History className="h-4 w-4" /> Recent Credit Activity
                      </h3>
                      <div className="space-y-2">
                        {jpStatus.transactions.map((tx) => (
                          <div key={tx._id} className="flex items-center justify-between py-2 border-b border-neutral-100 last:border-0">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-neutral-900 truncate">{tx.description || tx.action}</p>
                              <p className="text-xs text-neutral-900/40">
                                {new Date(tx.createdAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                              </p>
                            </div>
                            <div className="text-right ml-4">
                              <p className={`text-sm font-semibold ${tx.amount > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                {tx.amount > 0 ? '+' : ''}{tx.amount}
                              </p>
                              <p className="text-xs text-neutral-900/40">Bal: {tx.balanceAfter}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>
      )}

      {/* ─── Audit Log Tab ──────────────────────────── */}
      {tab === 'audit' && (
        <div className="bg-white rounded-2xl border border-neutral-300/60 p-6">
          <h3 className="font-semibold font-display text-neutral-900 flex items-center gap-2 mb-6"><History className="h-4 w-4" /> Audit Log</h3>
          {auditLog.length > 0 ? (
            <div className="space-y-4">
              {auditLog.map((entry, i) => (
                <div key={entry._id || i} className="flex gap-4 border-l-2 border-neutral-300/60 pl-4 py-2">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-neutral-900">{entry.action || entry.event}</p>
                    <p className="text-xs text-neutral-900/50">{entry.details || entry.description || ''}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs text-neutral-900/40">{new Date(entry.createdAt || entry.timestamp).toLocaleString()}</p>
                    <p className="text-xs text-neutral-900/40">{entry.actor || entry.performedBy || '—'}</p>
                  </div>
                </div>
              ))}
              <div className="flex justify-center gap-2 pt-4">
                <button onClick={() => setAuditPage((p) => Math.max(1, p - 1))} disabled={auditPage <= 1} className="px-3 py-1.5 text-xs border rounded-lg disabled:opacity-40">
                  Prev
                </button>
                <span className="text-xs text-neutral-900/50 py-1.5">Page {auditPage}</span>
                <button onClick={() => setAuditPage((p) => p + 1)} disabled={auditLog.length < 20} className="px-3 py-1.5 text-xs border rounded-lg disabled:opacity-40">
                  Next
                </button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-neutral-900/40 text-center py-8">No audit entries</p>
          )}
        </div>
      )}

      {/* ─── Change Plan Modal ───────────────────────── */}
      <Modal open={changePlanModal} onClose={() => setChangePlanModal(false)} title="Change Plan" wide>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-neutral-900/60 mb-1">Select Plan</label>
            <select
              value={planForm.planId}
              onChange={(e) => setPlanForm((f) => ({ ...f, planId: e.target.value }))}
              className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm"
            >
              <option value="">Choose a plan...</option>
              {plans.filter((p) => p.isActive !== false).map((p) => (
                <option key={p._id} value={p._id}>{p.name} — ₹{p.pricing?.monthly || 0}/mo</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-900/60 mb-1">Billing Cycle</label>
            <div className="flex gap-2">
              {['monthly', 'yearly'].map((c) => (
                <button
                  key={c}
                  onClick={() => setPlanForm((f) => ({ ...f, billingCycle: c }))}
                  className={`px-4 py-2 text-sm rounded-lg border transition ${
                    planForm.billingCycle === c
                      ? 'border-primary-600 bg-primary-50 text-primary-700'
                      : 'border-neutral-300/60 text-neutral-900/60 hover:bg-neutral-50'
                  }`}
                >
                  {c.charAt(0).toUpperCase() + c.slice(1)}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-900/60 mb-1">Promo Code (optional)</label>
            <input
              value={planForm.promoCode}
              onChange={(e) => setPlanForm((f) => ({ ...f, promoCode: e.target.value }))}
              placeholder="Enter promo code"
              className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm"
            />
          </div>

          <button onClick={handleCalcProration} className="text-xs text-primary-600 hover:underline">
            Calculate proration preview
          </button>

          {proration && (
            <div className="bg-neutral-50 rounded-lg p-4 text-sm space-y-1">
              <p>Current: <span className="font-medium">₹{proration.currentAmount?.toLocaleString('en-IN')}</span></p>
              <p>New: <span className="font-medium">₹{proration.newAmount?.toLocaleString('en-IN')}</span></p>
              <p>Proration: <span className={`font-medium ${proration.adjustment >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                {proration.adjustment >= 0 ? '+' : ''}₹{proration.adjustment?.toLocaleString('en-IN')}
              </span></p>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => setChangePlanModal(false)} className="px-4 py-2 text-sm text-neutral-900/70 bg-neutral-100 rounded-lg hover:bg-neutral-200 transition">
              Cancel
            </button>
            <button onClick={handleChangePlan} disabled={!planForm.planId || saving} className="px-4 py-2 text-sm text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50 transition">
              {saving ? 'Processing...' : 'Confirm Change'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Cancel Modal */}
      <Modal open={cancelModal} onClose={() => setCancelModal(false)} title="Cancel Subscription">
        <div className="space-y-4">
          <div className="bg-red-50 p-3 rounded-lg flex items-start gap-2">
            <AlertTriangle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
            <p className="text-sm text-red-700">This will cancel the subscription. The tenant will retain access until the current period ends.</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-900/60 mb-1">Cancellation Reason</label>
            <textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm"
              placeholder="Why is this subscription being cancelled?"
            />
          </div>
          <div className="flex justify-end gap-3">
            <button onClick={() => setCancelModal(false)} className="px-4 py-2 text-sm text-neutral-900/70 bg-neutral-100 rounded-lg hover:bg-neutral-200 transition">
              Keep Active
            </button>
            <button onClick={handleCancel} disabled={saving} className="px-4 py-2 text-sm text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50 transition">
              {saving ? 'Cancelling...' : 'Confirm Cancel'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Assign SuperAdmin Modal */}
      <Modal open={superAdminModal} onClose={() => setSuperAdminModal(false)} title="Assign SuperAdmin">
        <div className="space-y-4">
          <p className="text-sm text-neutral-900/60">
            The SuperAdmin will be the clinic owner with full access to manage the clinic.
          </p>
          <div>
            <label className="block text-sm font-medium text-neutral-900/60 mb-1">Name *</label>
            <input
              value={superAdminForm.name}
              onChange={(e) => setSuperAdminForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Full name"
              className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-900/60 mb-1">Email *</label>
            <input
              type="email"
              value={superAdminForm.email}
              onChange={(e) => setSuperAdminForm((f) => ({ ...f, email: e.target.value }))}
              placeholder="email@example.com"
              className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-900/60 mb-1">Phone</label>
            <input
              value={superAdminForm.phone}
              onChange={(e) => setSuperAdminForm((f) => ({ ...f, phone: e.target.value }))}
              placeholder="Phone number"
              className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
            />
          </div>
          <div className="bg-blue-50 rounded-lg p-3 text-xs text-blue-700">
            <p className="font-medium mb-1">What happens next:</p>
            <ul className="list-disc list-inside space-y-0.5">
              <li>A super_admin user will be created in the tenant's database</li>
              <li>Login credentials will be sent to the email address</li>
              <li>The SuperAdmin can then access the clinic portal</li>
            </ul>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button
              onClick={() => setSuperAdminModal(false)}
              className="px-4 py-2 text-sm text-neutral-900/70 bg-neutral-100 rounded-lg hover:bg-neutral-200 transition"
            >
              Cancel
            </button>
            <button
              onClick={handleAssignSuperAdmin}
              disabled={!superAdminForm.name || !superAdminForm.email || saving}
              className="px-4 py-2 text-sm text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50 transition"
            >
              {saving ? 'Assigning...' : 'Assign SuperAdmin'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Generic Confirm */}
      <ConfirmDialog
        open={!!confirmAction}
        title={confirmAction?.label}
        message={`Are you sure you want to proceed with ${confirmAction?.label?.toLowerCase()}?`}
        onConfirm={handleConfirmAction}
        onCancel={() => setConfirmAction(null)}
        loading={saving}
      />
    </div>
  );
}
