import { useState, useEffect, useRef } from 'react';
import { getClinicSettings, updateClinicSettings, uploadClinicLogo } from '../api';
import { ErrorAlert, Spinner } from '../../platform/components/shared';
import { resolveAssetUrl } from '../../lib/assetUrl';
import { useTenantAuth } from '../TenantAuthContext';
import {
  Building2, Save, Hash, Globe, Phone, Mail, MapPin, Check, Pencil, X,
  Upload, Image as ImageIcon, FileText, Calendar, Shield, ExternalLink,
} from 'lucide-react';

/* ─── Design Tokens ────────────────────────────── */
const cardCls = 'bg-white rounded-2xl border border-neutral-200 shadow-[var(--shadow-sm)]';
const btnPrimary = 'px-5 py-2.5 text-sm font-semibold text-white rounded-lg bg-primary-600 hover:bg-primary-700 shadow-[var(--shadow-sm)] transition-all disabled:opacity-50';
const btnGhost = 'px-4 py-2.5 text-sm font-medium text-neutral-600 bg-neutral-100 rounded-lg hover:bg-neutral-200 transition';
const inputCls = 'w-full px-3.5 py-2.5 border border-neutral-200 rounded-xl text-sm bg-white text-neutral-900 placeholder:text-neutral-400 focus:border-primary-300 focus:ring-2 focus:ring-primary-100 outline-none transition-all';
const labelCls = 'block text-xs font-semibold text-neutral-500 mb-1.5';
const valueCls = 'text-sm text-neutral-900';
const emptyCls = 'text-sm text-neutral-400 italic';

const DOC_TYPE_LABELS = {
  business_registration: 'Business Registration',
  medical_license: 'Medical License',
  tax_certificate: 'Tax Certificate',
  insurance: 'Insurance',
  other: 'Other',
};

export default function ClinicSettings() {
  const { updateClinic } = useTenantAuth();
  const [clinicData, setClinicData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Edit mode
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);
  const [success, setSuccess] = useState(false);

  // Logo upload
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const [logoLoadError, setLogoLoadError] = useState(false);
  const fileInputRef = useRef(null);

  const fetchClinic = () => {
    setLoading(true);
    setError(null);
    getClinicSettings()
      .then((res) => {
        const data = res.data || res;
        setClinicData(data);
      })
      .catch((err) => setError(err.message || 'Failed to load clinic settings'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchClinic(); }, []);

  // Populate form when entering edit mode
  const enterEditMode = () => {
    setForm({
      name: clinicData.name || '',
      email: clinicData.email || '',
      phone: clinicData.phone || '',
      website: clinicData.website || '',
      address: {
        street: clinicData.address?.street || '',
        city: clinicData.address?.city || '',
        state: clinicData.address?.state || '',
        zipCode: clinicData.address?.zipCode || '',
        country: clinicData.address?.country || '',
      },
    });
    setFormError(null);
    setSuccess(false);
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditing(false);
    setFormError(null);
    setSuccess(false);
  };

  const handleFormChange = (field, value) => {
    setSuccess(false);
    if (field.startsWith('address.')) {
      const addrField = field.split('.')[1];
      setForm((prev) => ({
        ...prev,
        address: { ...prev.address, [addrField]: value },
      }));
    } else {
      setForm((prev) => ({ ...prev, [field]: value }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    setSuccess(false);
    try {
      const res = await updateClinicSettings(form);
      const updated = res.data || res;
      setClinicData(updated);
      setSuccess(true);
      setEditing(false);
    } catch (err) {
      const msg = err.message || 'Failed to update settings';
      if (err.status === 403 || msg.toLowerCase().includes('feature')) {
        setFormError('Your plan doesn\'t include profile customization. Please upgrade to enable this feature.');
      } else {
        setFormError(msg);
      }
    } finally {
      setSaving(false);
    }
  };

  // Logo upload handler
  const handleLogoSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const ALLOWED = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];
    if (!ALLOWED.includes(file.type)) {
      setUploadError('Invalid file type. Use PNG, JPEG, WebP, or SVG.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setUploadError('File too large. Maximum 5MB.');
      return;
    }

    setUploading(true);
    setUploadError(null);
    try {
      const base64 = await fileToBase64(file);
      const res = await uploadClinicLogo(base64, file.type);
      const data = res.data || res;
      setClinicData((prev) => ({ ...prev, logo: data.logo }));
      setLogoLoadError(false);
      // Sync new logo into auth context so all pages using useTenantAuth().clinic get it
      updateClinic({ logo: data.logo });
    } catch (err) {
      const msg = err.message || 'Failed to upload logo';
      if (err.status === 403) {
        setUploadError('Your plan doesn\'t include logo customization. Please upgrade.');
      } else {
        setUploadError(msg);
      }
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner />
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-[1280px] mx-auto w-full space-y-6">
        <div>
          <h2 className="text-2xl font-semibold font-display text-neutral-900">Clinic Settings</h2>
          <p className="text-sm text-neutral-500 mt-1">Manage your clinic profile</p>
        </div>
        <ErrorAlert message={error} />
      </div>
    );
  }

  const logoSrc = resolveAssetUrl(clinicData?.logo);
  const address = clinicData?.address || {};
  const addressParts = [address.street, address.city, address.state, address.zipCode, address.country].filter(Boolean);
  const documents = clinicData?.documents || [];
  const sub = clinicData?.subscription || {};

  return (
    <div className="max-w-[1280px] mx-auto w-full space-y-6">
      {/* Page header */}
      <div
        className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 animate-[fadeUp_0.4s_ease-out_both]"
      >
        <div>
          <h2 className="text-2xl font-semibold font-display text-neutral-900">Clinic Settings</h2>
          <p className="text-sm text-neutral-500 mt-1">Manage your clinic profile and contact information</p>
        </div>
        {!editing && (
          <button
            onClick={enterEditMode}
            className={`inline-flex items-center gap-1.5 ${btnPrimary}`}
          >
            <Pencil className="h-3.5 w-3.5" /> Edit Profile
          </button>
        )}
      </div>

      {/* Success banner */}
      {success && (
        <div className="flex items-center gap-3 bg-emerald-50 text-emerald-700 px-5 py-4 rounded-2xl text-sm border border-emerald-100">
          <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
            <Check className="w-4 h-4" />
          </div>
          <p>Settings saved successfully.</p>
        </div>
      )}

      <div
        className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-[fadeUp_0.4s_ease-out_both]"
        style={{ animationDelay: '50ms' }}
      >
        {/* ─── Left column: Profile + Address ─── */}
        <div className="lg:col-span-2 space-y-6">
          {/* Clinic profile card */}
          <div className={cardCls}>
            {/* Logo + Name header */}
            <div className="p-6 border-b border-neutral-200">
              <div className="flex items-center gap-5">
                {/* Logo with upload */}
                <div className="relative group shrink-0">
                  <div className="w-20 h-20 rounded-2xl overflow-hidden bg-neutral-50 border-2 border-neutral-200 flex items-center justify-center">
                    {logoSrc && !logoLoadError ? (
                      <img src={logoSrc} alt={clinicData.name} className="w-full h-full object-contain" onError={() => setLogoLoadError(true)} />
                    ) : (
                      <Building2 className="h-8 w-8 text-neutral-300" />
                    )}
                  </div>
                  {editing && (
                    <>
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploading}
                        className="absolute inset-0 rounded-2xl bg-neutral-950/0 group-hover:bg-neutral-950/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
                      >
                        {uploading ? (
                          <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <Upload className="h-5 w-5 text-white" />
                        )}
                      </button>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/svg+xml"
                        className="hidden"
                        onChange={handleLogoSelect}
                      />
                    </>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-lg font-bold font-display text-neutral-900 truncate">{clinicData.name}</h3>
                  {editing && <p className="text-xs text-neutral-400 mt-0.5">Hover over logo to upload a new one</p>}
                  {uploadError && (
                    <p className="text-xs text-red-500 mt-1">{uploadError}</p>
                  )}
                </div>
              </div>
            </div>

            {/* Profile fields */}
            {editing ? (
              <form onSubmit={handleSubmit} className="p-6 space-y-5">
                {formError && <ErrorAlert message={formError} />}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2">
                    <label className={labelCls}>Clinic Name *</label>
                    <input type="text" required value={form.name} onChange={(e) => handleFormChange('name', e.target.value)} placeholder="e.g. SmileCare Dental" className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>Email *</label>
                    <input type="email" required value={form.email} onChange={(e) => handleFormChange('email', e.target.value)} placeholder="clinic@example.com" className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>Phone</label>
                    <input type="tel" value={form.phone} onChange={(e) => handleFormChange('phone', e.target.value)} placeholder="+91 98765 43210" className={inputCls} />
                  </div>
                  <div className="sm:col-span-2">
                    <label className={labelCls}>Website</label>
                    <input type="url" value={form.website} onChange={(e) => handleFormChange('website', e.target.value)} placeholder="https://www.example.com" className={inputCls} />
                  </div>
                </div>

                {/* Address */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <MapPin className="h-4 w-4 text-neutral-400" />
                    <span className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">Address</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="sm:col-span-2">
                      <label className={labelCls}>Street</label>
                      <input type="text" value={form.address.street} onChange={(e) => handleFormChange('address.street', e.target.value)} placeholder="123 Main Street" className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls}>City</label>
                      <input type="text" value={form.address.city} onChange={(e) => handleFormChange('address.city', e.target.value)} placeholder="Pune" className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls}>State</label>
                      <input type="text" value={form.address.state} onChange={(e) => handleFormChange('address.state', e.target.value)} placeholder="Maharashtra" className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls}>Zip Code</label>
                      <input type="text" value={form.address.zipCode} onChange={(e) => handleFormChange('address.zipCode', e.target.value)} placeholder="411001" className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls}>Country</label>
                      <input type="text" value={form.address.country} onChange={(e) => handleFormChange('address.country', e.target.value)} placeholder="IN" className={inputCls} />
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex justify-end gap-3 pt-4 border-t border-neutral-200">
                  <button type="button" onClick={cancelEdit} className={btnGhost}>
                    Cancel
                  </button>
                  <button type="submit" disabled={saving} className={`${btnPrimary} flex items-center gap-1.5`}>
                    <Save className="h-3.5 w-3.5" />
                    {saving ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </form>
            ) : (
              /* View mode */
              <div className="p-6 space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-5 gap-x-8">
                  <InfoField icon={Building2} label="Clinic Name" value={clinicData.name} />
                  <InfoField icon={Mail} label="Email" value={clinicData.email} />
                  <InfoField icon={Phone} label="Phone" value={clinicData.phone} />
                  <InfoField icon={Globe} label="Website" value={clinicData.website} link />
                </div>

                {/* Address */}
                <div className="pt-4 border-t border-neutral-200">
                  <div className="flex items-center gap-2 mb-3">
                    <MapPin className="h-4 w-4 text-neutral-400" />
                    <span className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">Address</span>
                  </div>
                  {addressParts.length > 0 ? (
                    <p className={valueCls}>{addressParts.join(', ')}</p>
                  ) : (
                    <p className={emptyCls}>No address added</p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ─── Right column: Identifiers + Plan + Documents ─── */}
        <div className="space-y-6">
          {/* Clinic identifiers */}
          <div className={`${cardCls} p-5`}>
            <div className="flex items-center gap-2 mb-4">
              <div className="p-1.5 rounded-lg bg-primary-50">
                <Hash className="h-4 w-4 text-primary-600" />
              </div>
              <h4 className="font-semibold font-display text-neutral-900 text-sm">Identifiers</h4>
            </div>
            <div className="space-y-3">
              <IdRow label="Clinic Code" value={clinicData.clinicCode} mono />
              <IdRow label="Slug" value={clinicData.slug} />
              <IdRow label="Status" value={clinicData.status} capitalize />
            </div>
          </div>

          {/* Subscription info */}
          <div className={`${cardCls} p-5`}>
            <div className="flex items-center gap-2 mb-4">
              <div className="p-1.5 rounded-lg bg-purple-50">
                <Shield className="h-4 w-4 text-purple-600" />
              </div>
              <h4 className="font-semibold font-display text-neutral-900 text-sm">Subscription</h4>
            </div>
            <div className="space-y-3">
              <IdRow label="Plan" value={sub.plan} capitalize />
              <IdRow label="Status" value={sub.status} capitalize />
              {sub.trialEndsAt && <IdRow label="Trial Ends" value={new Date(sub.trialEndsAt).toLocaleDateString()} />}
              {sub.currentPeriodEnd && <IdRow label="Period End" value={new Date(sub.currentPeriodEnd).toLocaleDateString()} />}
            </div>
          </div>

          {/* Documents */}
          <div className={`${cardCls} p-5`}>
            <div className="flex items-center gap-2 mb-4">
              <div className="p-1.5 rounded-lg bg-amber-50">
                <FileText className="h-4 w-4 text-amber-600" />
              </div>
              <h4 className="font-semibold font-display text-neutral-900 text-sm">Documents</h4>
            </div>
            {documents.length === 0 ? (
              <p className="text-xs text-neutral-400">No documents uploaded yet.</p>
            ) : (
              <div className="space-y-2.5">
                {documents.map((doc, i) => (
                  <a
                    key={doc._id || i}
                    href={resolveAssetUrl(doc.url)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-neutral-50 border border-neutral-200 hover:border-primary-300 transition-colors group"
                  >
                    <div className="w-8 h-8 rounded-lg bg-white border border-neutral-200 flex items-center justify-center shrink-0">
                      <FileText className="h-4 w-4 text-neutral-400" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-neutral-900 truncate">{doc.name}</p>
                      <p className="text-[10px] text-neutral-400">
                        {DOC_TYPE_LABELS[doc.type] || doc.type}
                        {doc.uploadedAt && ` · ${new Date(doc.uploadedAt).toLocaleDateString()}`}
                      </p>
                    </div>
                    <ExternalLink className="h-3.5 w-3.5 text-neutral-300 group-hover:text-primary-500 transition-colors shrink-0" />
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Helper Components ─── */

function InfoField({ icon: Icon, label, value, link }) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="h-4 w-4 text-neutral-400 mt-0.5 shrink-0" />
      <div className="min-w-0">
        <p className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider mb-0.5">{label}</p>
        {value ? (
          link ? (
            <a href={value.startsWith('http') ? value : `https://${value}`} target="_blank" rel="noopener noreferrer" className="text-sm text-primary-600 hover:underline truncate block">
              {value}
            </a>
          ) : (
            <p className="text-sm text-neutral-900">{value}</p>
          )
        ) : (
          <p className="text-sm text-neutral-400 italic">Not set</p>
        )}
      </div>
    </div>
  );
}

function IdRow({ label, value, mono, capitalize: cap }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-neutral-500">{label}</span>
      <span className={`text-xs font-medium text-neutral-900 ${mono ? 'font-mono tracking-wider' : ''} ${cap ? 'capitalize' : ''}`}>
        {value || '—'}
      </span>
    </div>
  );
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
