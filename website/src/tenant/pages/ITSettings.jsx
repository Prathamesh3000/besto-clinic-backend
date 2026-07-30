import { useState, useEffect, useRef } from 'react';
import {
  Building2, Save, Mail, Phone, MapPin, Upload, Check, X, Image as ImageIcon,
} from 'lucide-react';
import { getClinicSettings, updateClinicSettings, uploadClinicLogo } from '../api';
import { ErrorAlert, Spinner } from '../../platform/components/shared';
import { resolveAssetUrl } from '../../lib/assetUrl';

/* ─── Shared classes ─────────────────────────────── */
const inputClasses =
  'w-full px-3 py-2.5 border border-neutral-300/60 rounded-xl text-sm bg-neutral-50/50 text-neutral-900 placeholder:text-neutral-900/25 focus:bg-white focus:border-primary-300 focus:ring-2 focus:ring-primary-400/20 outline-none transition-all';
const labelClasses = 'block text-xs font-semibold text-neutral-900/50 mb-1.5';

/* ─── File → Base64 helper ───────────────────────── */
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

/* ═══════════════════════════════════════════════════
   ─── MAIN COMPONENT ──────────────────────────────
   ═══════════════════════════════════════════════════ */
export default function ITSettings() {
  // ─── State ────────────────────────────────────────
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Form fields
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');

  // Logo
  const [logoUrl, setLogoUrl] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const fileInputRef = useRef(null);

  // Save
  const [saving, setSaving] = useState(false);

  // ─── Load settings ────────────────────────────────
  useEffect(() => {
    setLoading(true);
    setError('');
    getClinicSettings()
      .then((res) => {
        const data = res.data || res;
        setName(data.name || '');
        setEmail(data.email || '');
        setPhone(data.phone || '');
        // Flatten address to a single string for display
        const addr = data.address;
        if (typeof addr === 'string') {
          setAddress(addr);
        } else if (addr && typeof addr === 'object') {
          const parts = [addr.street, addr.city, addr.state, addr.zipCode, addr.country].filter(Boolean);
          setAddress(parts.join(', '));
        } else {
          setAddress('');
        }
        setLogoUrl(resolveAssetUrl(data.logo));
      })
      .catch((err) => setError(err.message || 'Failed to load clinic settings'))
      .finally(() => setLoading(false));
  }, []);

  // ─── Save handler ─────────────────────────────────
  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      await updateClinicSettings({ name, email, phone, address });
      setSuccess('Settings saved successfully.');
      setTimeout(() => setSuccess(''), 4000);
    } catch (err) {
      setError(err.message || 'Failed to update settings');
    } finally {
      setSaving(false);
    }
  };

  // ─── Logo upload handler ──────────────────────────
  const handleLogoSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const ALLOWED = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];
    if (!ALLOWED.includes(file.type)) {
      setUploadError('Invalid file type. Use PNG, JPEG, WebP, or SVG.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setUploadError('File too large. Maximum 5 MB.');
      return;
    }

    setUploading(true);
    setUploadError('');
    try {
      const base64 = await fileToBase64(file);
      const res = await uploadClinicLogo(base64, file.type);
      const data = res.data || res;
      setLogoUrl(resolveAssetUrl(data.logo));
      setSuccess('Logo uploaded successfully.');
      setTimeout(() => setSuccess(''), 4000);
    } catch (err) {
      setUploadError(err.message || 'Failed to upload logo');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // ─── Loading state ────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">

      {/* Header */}
      <div className="animate-[fadeUp_0.4s_ease-out_both]">
        <h1 className="text-2xl font-semibold font-display text-neutral-900">Clinic Settings</h1>
        <p className="text-sm text-neutral-600 mt-1">Manage your clinic profile and contact information</p>
      </div>

      {/* Success toast */}
      {success && (
        <div
          className="flex items-center gap-3 bg-emerald-50 text-emerald-700 px-5 py-4 rounded-2xl text-sm border border-emerald-100 animate-[fadeUp_0.4s_ease-out_both]"
        >
          <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
            <Check className="w-4 h-4" />
          </div>
          <p>{success}</p>
        </div>
      )}

      {error && <ErrorAlert message={error} />}

      {/* Form card */}
      <div
        className="bg-white rounded-2xl border border-neutral-200 shadow-[var(--shadow-sm)] overflow-hidden animate-[fadeUp_0.4s_ease-out_both]"
        style={{ animationDelay: '50ms' }}
      >
        {/* Logo section */}
        <div className="px-6 py-5 border-b border-neutral-200">
          <div className="flex items-center gap-5">
            <div className="relative group shrink-0">
              <div className="w-20 h-20 rounded-2xl overflow-hidden bg-neutral-50 border-2 border-neutral-200/50 flex items-center justify-center">
                {logoUrl ? (
                  <img src={logoUrl} alt={name} className="w-full h-full object-contain" />
                ) : (
                  <Building2 className="h-8 w-8 text-neutral-900/15" />
                )}
              </div>
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
            </div>

            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-semibold text-neutral-900">Clinic Logo</h3>
              <p className="text-xs text-neutral-500 mt-0.5">
                Hover over the logo to upload a new one. PNG, JPEG, WebP, or SVG. Max 5 MB.
              </p>
              {uploadError && <p className="text-xs text-red-500 mt-1">{uploadError}</p>}
            </div>
          </div>
        </div>

        {/* Form fields */}
        <form onSubmit={handleSave} className="px-6 py-5 space-y-5">
          {/* Clinic Name */}
          <div>
            <label className={labelClasses}>Clinic Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. SmileCare Dental"
              required
              className={inputClasses}
            />
          </div>

          {/* Email */}
          <div>
            <label className={labelClasses}>
              <span className="flex items-center gap-1.5">
                <Mail className="h-3.5 w-3.5 text-neutral-400" /> Email
              </span>
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="clinic@example.com"
              className={inputClasses}
            />
          </div>

          {/* Phone */}
          <div>
            <label className={labelClasses}>
              <span className="flex items-center gap-1.5">
                <Phone className="h-3.5 w-3.5 text-neutral-400" /> Phone
              </span>
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+91 98765 43210"
              className={inputClasses}
            />
          </div>

          {/* Address */}
          <div>
            <label className={labelClasses}>
              <span className="flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 text-neutral-400" /> Address
              </span>
            </label>
            <textarea
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="123 Main Street, City, State, PIN"
              rows={3}
              className={`${inputClasses} resize-none`}
            />
          </div>

          {/* Save button */}
          <div className="flex justify-end pt-4 border-t border-neutral-200">
            <button
              type="submit"
              disabled={saving}
              className="h-11 px-6 text-sm font-semibold bg-primary-600 text-white rounded-lg hover:bg-primary-700 shadow-[var(--shadow-sm)] hover:shadow-[var(--shadow-md)] transition-all duration-200 flex items-center gap-2 disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              {saving ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
