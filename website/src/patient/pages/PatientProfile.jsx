import { useState, useEffect, useCallback } from 'react';
import {
  User, Phone, Calendar, Heart, MapPin, Shield,
  Loader2, CheckCircle2, AlertCircle, Edit3, Save, X,
} from 'lucide-react';
import { getPatientProfile, updatePatientProfile } from '../api';
import { useSafePatientAuth } from '../../hooks/useSafeAuth';

/* ─── Design tokens ──────────────────────────────── */

const CARD = 'bg-white rounded-2xl border border-neutral-200 shadow-[var(--shadow-sm)]';

function Shimmer({ className = '' }) {
  return <div className={`animate-pulse bg-neutral-200/60 rounded-xl ${className}`} />;
}

/* ─── Formatters ──────────────────────────────────── */

const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) : '';

const fmtDateInput = (d) => {
  if (!d) return '';
  const dt = new Date(d);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const day = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const GENDER_OPTIONS = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'other', label: 'Other' },
  { value: 'prefer_not_to_say', label: 'Prefer not to say' },
];

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

/* ═══════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════ */

export default function PatientProfile() {
  const { activePatientId } = useSafePatientAuth();

  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const [form, setForm] = useState({});

  /* ── Fetch ── */

  const fetchProfile = useCallback(async () => {
    if (!activePatientId) return;
    setLoading(true);
    try {
      const res = await getPatientProfile(activePatientId);
      const data = res.data || res;
      setProfile(data);
    } catch {
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }, [activePatientId]);

  useEffect(() => { fetchProfile(); }, [fetchProfile]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  /* ── Edit helpers ── */

  const startEditing = () => {
    setForm({
      name: profile?.name || '',
      phone: profile?.phone || '',
      dateOfBirth: fmtDateInput(profile?.dateOfBirth),
      gender: profile?.gender || '',
      bloodGroup: profile?.bloodGroup || '',
      address: {
        street: profile?.address?.street || '',
        city: profile?.address?.city || '',
        state: profile?.address?.state || '',
        zipCode: profile?.address?.zipCode || '',
        country: profile?.address?.country || '',
      },
      emergencyContact: {
        name: profile?.emergencyContact?.name || '',
        phone: profile?.emergencyContact?.phone || '',
        relationship: profile?.emergencyContact?.relationship || '',
      },
    });
    setEditing(true);
  };

  const cancelEditing = () => {
    setEditing(false);
    setForm({});
  };

  const updateField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const updateAddress = (key, value) => {
    setForm((prev) => ({
      ...prev,
      address: { ...prev.address, [key]: value },
    }));
  };

  const updateEmergency = (key, value) => {
    setForm((prev) => ({
      ...prev,
      emergencyContact: { ...prev.emergencyContact, [key]: value },
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = { ...form };
      if (payload.dateOfBirth) payload.dateOfBirth = new Date(payload.dateOfBirth).toISOString();
      await updatePatientProfile(activePatientId, payload);
      setToast({ type: 'success', msg: 'Profile updated successfully' });
      setEditing(false);
      fetchProfile();
    } catch (err) {
      setToast({ type: 'error', msg: err.message || 'Failed to update profile' });
    } finally {
      setSaving(false);
    }
  };

  /* ── Derived ── */

  const completeness = profile ? [
    !!profile.phone,
    !!profile.dateOfBirth,
    !!profile.gender,
    !!profile.bloodGroup,
    !!profile.address?.city,
    !!profile.emergencyContact?.name,
  ] : [];
  const completedCount = completeness.filter(Boolean).length;
  const totalFields = completeness.length;
  const pct = totalFields > 0 ? Math.round((completedCount / totalFields) * 100) : 0;
  const isComplete = pct === 100;

  /* ═══ RENDER ═══ */

  if (loading) {
    return (
      <div className="max-w-[1280px] mx-auto w-full space-y-6">
        <Shimmer className="h-44 w-full" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Shimmer className="h-64" />
          <Shimmer className="h-64" />
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="max-w-[1280px] mx-auto w-full">
        <div className={`${CARD} p-10 text-center`}>
          <div className="w-14 h-14 rounded-2xl bg-neutral-50 flex items-center justify-center mx-auto mb-3">
            <AlertCircle className="h-6 w-6 text-neutral-300" />
          </div>
          <p className="text-sm font-medium text-neutral-600">Unable to load profile</p>
          <p className="text-xs text-neutral-400 mt-1">Please try again later</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[1280px] mx-auto w-full space-y-6">

      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-5 py-3 rounded-xl shadow-[var(--shadow-lg)] text-sm font-medium flex items-center gap-2 ${
          toast.type === 'success' ? 'bg-secondary-600 text-white' : 'bg-red-600 text-white'
        }`}>
          {toast.type === 'success' ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          {toast.msg}
        </div>
      )}

      {/* Hero Header */}
      <div className="bg-gradient-to-br from-primary-600 to-primary-800 rounded-2xl p-8 md:p-10 text-white animate-[fadeUp_0.4s_ease-out_both]">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center text-white text-2xl font-bold font-display">
              {(profile.name || 'P')[0].toUpperCase()}
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold font-display leading-tight">
                {profile.name}
              </h1>
              <p className="text-primary-100 text-sm mt-1">
                {profile.patientId && <span className="font-mono">{profile.patientId}</span>}
                {profile.email && <span> &middot; {profile.email}</span>}
              </p>
            </div>
          </div>
          {!editing && (
            <button
              onClick={startEditing}
              className="h-11 px-6 text-sm font-bold bg-white text-primary-700 rounded-xl hover:bg-primary-50 shadow-[var(--shadow-md)] transition-all duration-200 flex items-center gap-2 shrink-0"
            >
              <Edit3 className="h-4 w-4" /> Edit Profile
            </button>
          )}
        </div>

        {/* Completeness bar */}
        {!isComplete && (
          <div className="mt-6 p-4 rounded-xl bg-white/10 backdrop-blur-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-primary-100">Profile completeness</span>
              <span className="text-xs font-bold text-white">{pct}%</span>
            </div>
            <div className="h-1.5 bg-white/20 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full bg-white transition-all duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="text-xs text-primary-200 mt-2">
              Complete your profile to help your clinic provide better care
            </p>
          </div>
        )}
      </div>

      {/* Edit mode action bar */}
      {editing && (
        <div className={`${CARD} p-4 flex items-center justify-between animate-[fadeUp_0.4s_ease-out_both]`} style={{ animationDelay: '50ms' }}>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center">
              <Edit3 className="h-4 w-4 text-amber-600" />
            </div>
            <p className="text-sm font-medium text-neutral-700">Editing profile</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={cancelEditing}
              disabled={saving}
              className="h-9 px-4 text-xs font-semibold text-neutral-600 bg-neutral-100 rounded-lg hover:bg-neutral-200 transition-all disabled:opacity-50 flex items-center gap-1.5"
            >
              <X className="h-3.5 w-3.5" /> Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="h-9 px-5 text-xs font-semibold text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-all disabled:opacity-50 flex items-center gap-1.5"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Save Changes
            </button>
          </div>
        </div>
      )}

      {/* Profile sections */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Personal Information */}
        <div className={`${CARD} p-5 animate-[fadeUp_0.4s_ease-out_both]`} style={{ animationDelay: '100ms' }}>
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-xl bg-primary-50 flex items-center justify-center">
              <User className="h-5 w-5 text-primary-600" />
            </div>
            <div>
              <h2 className="text-[15px] font-semibold font-display text-neutral-900">Personal Information</h2>
              <p className="text-xs text-neutral-500">Basic details about you</p>
            </div>
          </div>

          <div className="space-y-4">
            <ProfileField
              label="Full Name"
              value={profile.name}
              editing={editing}
              inputValue={form.name}
              onChange={(v) => updateField('name', v)}
            />
            <ProfileField
              label="Phone"
              value={profile.phone}
              placeholder="Add phone number"
              editing={editing}
              inputValue={form.phone}
              onChange={(v) => updateField('phone', v)}
              type="tel"
              missing={!profile.phone}
            />
            <ProfileField
              label="Date of Birth"
              value={profile.dateOfBirth ? fmtDate(profile.dateOfBirth) : null}
              placeholder="Add date of birth"
              editing={editing}
              inputValue={form.dateOfBirth}
              onChange={(v) => updateField('dateOfBirth', v)}
              type="date"
              missing={!profile.dateOfBirth}
            />
            <ProfileSelect
              label="Gender"
              value={profile.gender}
              options={GENDER_OPTIONS}
              placeholder="Select gender"
              editing={editing}
              inputValue={form.gender}
              onChange={(v) => updateField('gender', v)}
              missing={!profile.gender}
            />
            <ProfileSelect
              label="Blood Group"
              value={profile.bloodGroup}
              options={BLOOD_GROUPS.map((bg) => ({ value: bg, label: bg }))}
              placeholder="Select blood group"
              editing={editing}
              inputValue={form.bloodGroup}
              onChange={(v) => updateField('bloodGroup', v)}
              missing={!profile.bloodGroup}
            />
          </div>
        </div>

        {/* Address */}
        <div className={`${CARD} p-5 animate-[fadeUp_0.4s_ease-out_both]`} style={{ animationDelay: '150ms' }}>
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
              <MapPin className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-[15px] font-semibold font-display text-neutral-900">Address</h2>
              <p className="text-xs text-neutral-500">Your residential address</p>
            </div>
          </div>

          <div className="space-y-4">
            <ProfileField
              label="Street"
              value={profile.address?.street}
              placeholder="Add street address"
              editing={editing}
              inputValue={form.address?.street}
              onChange={(v) => updateAddress('street', v)}
            />
            <div className="grid grid-cols-2 gap-3">
              <ProfileField
                label="City"
                value={profile.address?.city}
                placeholder="Add city"
                editing={editing}
                inputValue={form.address?.city}
                onChange={(v) => updateAddress('city', v)}
                missing={!profile.address?.city}
              />
              <ProfileField
                label="State"
                value={profile.address?.state}
                placeholder="Add state"
                editing={editing}
                inputValue={form.address?.state}
                onChange={(v) => updateAddress('state', v)}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <ProfileField
                label="ZIP Code"
                value={profile.address?.zipCode}
                placeholder="Add ZIP"
                editing={editing}
                inputValue={form.address?.zipCode}
                onChange={(v) => updateAddress('zipCode', v)}
              />
              <ProfileField
                label="Country"
                value={profile.address?.country}
                placeholder="Add country"
                editing={editing}
                inputValue={form.address?.country}
                onChange={(v) => updateAddress('country', v)}
              />
            </div>
          </div>
        </div>

        {/* Emergency Contact */}
        <div className={`${CARD} p-5 animate-[fadeUp_0.4s_ease-out_both]`} style={{ animationDelay: '200ms' }}>
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center">
              <Shield className="h-5 w-5 text-red-500" />
            </div>
            <div>
              <h2 className="text-[15px] font-semibold font-display text-neutral-900">Emergency Contact</h2>
              <p className="text-xs text-neutral-500">Someone we can reach in an emergency</p>
            </div>
          </div>

          <div className="space-y-4">
            <ProfileField
              label="Contact Name"
              value={profile.emergencyContact?.name}
              placeholder="Add emergency contact name"
              editing={editing}
              inputValue={form.emergencyContact?.name}
              onChange={(v) => updateEmergency('name', v)}
              missing={!profile.emergencyContact?.name}
            />
            <ProfileField
              label="Contact Phone"
              value={profile.emergencyContact?.phone}
              placeholder="Add emergency phone"
              editing={editing}
              inputValue={form.emergencyContact?.phone}
              onChange={(v) => updateEmergency('phone', v)}
              type="tel"
            />
            <ProfileField
              label="Relationship"
              value={profile.emergencyContact?.relationship}
              placeholder="Add relationship"
              editing={editing}
              inputValue={form.emergencyContact?.relationship}
              onChange={(v) => updateEmergency('relationship', v)}
            />
          </div>
        </div>

        {/* Medical Information (read-only) */}
        <div className={`${CARD} p-5 animate-[fadeUp_0.4s_ease-out_both]`} style={{ animationDelay: '250ms' }}>
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-xl bg-secondary-50 flex items-center justify-center">
              <Heart className="h-5 w-5 text-secondary-600" />
            </div>
            <div>
              <h2 className="text-[15px] font-semibold font-display text-neutral-900">Medical Information</h2>
              <p className="text-xs text-neutral-500">Managed by your clinic</p>
            </div>
          </div>

          <div className="space-y-4">
            <ReadOnlyField
              label="Allergies"
              value={profile.medicalHistory?.allergies?.length > 0
                ? profile.medicalHistory.allergies.join(', ')
                : null}
              placeholder="No allergies recorded"
            />
            <ReadOnlyField
              label="Medications"
              value={profile.medicalHistory?.medications?.length > 0
                ? profile.medicalHistory.medications.join(', ')
                : null}
              placeholder="No current medications"
            />
            <ReadOnlyField
              label="Conditions"
              value={profile.medicalHistory?.conditions?.length > 0
                ? profile.medicalHistory.conditions.join(', ')
                : null}
              placeholder="No known conditions"
            />
            {profile.insurance?.provider && (
              <ReadOnlyField
                label="Insurance"
                value={`${profile.insurance.provider}${profile.insurance.policyNumber ? ` — ${profile.insurance.policyNumber}` : ''}`}
              />
            )}
          </div>

          <p className="text-[11px] text-neutral-400 mt-4">
            Medical information is updated by your healthcare providers during visits
          </p>
        </div>
      </div>
    </div>
  );
}

/* ─── Sub-components ──────────────────────────────── */

function ProfileField({ label, value, placeholder, editing, inputValue, onChange, type = 'text', missing }) {
  if (editing) {
    return (
      <div>
        <label className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400 mb-1.5 block">
          {label}
        </label>
        <input
          type={type}
          value={inputValue || ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder || label}
          className="w-full h-10 px-3 text-sm text-neutral-900 bg-neutral-50 border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-300 transition-all"
        />
      </div>
    );
  }

  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400 mb-1">
        {label}
      </p>
      {value ? (
        <p className="text-sm font-medium text-neutral-800">{value}</p>
      ) : (
        <p className={`text-sm ${missing ? 'text-amber-500 font-medium' : 'text-neutral-400'}`}>
          {placeholder || 'Not provided'}
        </p>
      )}
    </div>
  );
}

function ProfileSelect({ label, value, options, placeholder, editing, inputValue, onChange, missing }) {
  if (editing) {
    return (
      <div>
        <label className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400 mb-1.5 block">
          {label}
        </label>
        <select
          value={inputValue || ''}
          onChange={(e) => onChange(e.target.value)}
          className="w-full h-10 px-3 text-sm text-neutral-900 bg-neutral-50 border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-300 transition-all appearance-none"
        >
          <option value="">{placeholder}</option>
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>
    );
  }

  const display = options.find((o) => o.value === value)?.label;
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400 mb-1">
        {label}
      </p>
      {display ? (
        <p className="text-sm font-medium text-neutral-800 capitalize">{display}</p>
      ) : (
        <p className={`text-sm ${missing ? 'text-amber-500 font-medium' : 'text-neutral-400'}`}>
          {placeholder || 'Not provided'}
        </p>
      )}
    </div>
  );
}

function ReadOnlyField({ label, value, placeholder }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400 mb-1">
        {label}
      </p>
      {value ? (
        <p className="text-sm font-medium text-neutral-800">{value}</p>
      ) : (
        <p className="text-sm text-neutral-400">{placeholder || 'Not provided'}</p>
      )}
    </div>
  );
}
