import { useState, useEffect } from 'react';
import {
  Mail, Phone, Building2, Stethoscope, CreditCard, FileText,
  Globe, Star, Languages, GraduationCap, Clock, CalendarClock,
  Pencil, Check, X, ChevronRight,
} from 'lucide-react';
import { Drawer, StatusBadge, ErrorAlert, Spinner } from '../../platform/components/shared';
import { getDoctor, updateDoctor, getDoctorSchedule } from '../api';

const AVATAR_COLORS = [
  'from-primary-100 to-primary-200 text-primary-700',
  'from-emerald-100 to-emerald-200 text-emerald-700',
  'from-amber-100 to-amber-200 text-amber-700',
  'from-purple-100 to-purple-200 text-purple-700',
  'from-blue-100 to-blue-200 text-blue-700',
  'from-rose-100 to-rose-200 text-rose-700',
];

function getAvatarColor(name) {
  let hash = 0;
  for (let i = 0; i < (name || '').length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

const DAY_LABELS = { monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed', thursday: 'Thu', friday: 'Fri', saturday: 'Sat', sunday: 'Sun' };

function InfoRow({ icon: Icon, label, value, muted }) {
  return (
    <div className="flex items-start gap-3 py-2">
      <div className="p-1.5 rounded-lg bg-neutral-100 text-neutral-900/40 shrink-0 mt-0.5">
        <Icon className="h-3.5 w-3.5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] text-neutral-900/35 font-medium">{label}</p>
        <p className={`text-sm ${muted ? 'text-neutral-900/30 italic' : 'text-neutral-900/80'}`}>{value || '--'}</p>
      </div>
    </div>
  );
}

const inputClasses =
  'w-full px-3 py-2 border border-neutral-300/60 rounded-xl text-sm bg-neutral-50/50 text-neutral-900 placeholder:text-neutral-900/25 focus:bg-white focus:border-primary-300 focus:ring-2 focus:ring-primary-400/20 outline-none transition-all';
const labelClasses = 'block text-[11px] font-semibold text-neutral-900/40 mb-1';

export default function DoctorDetailDrawer({ open, onClose, doctor: listDoctor, onOpenSchedule, onOpenFeature, onRefresh }) {
  const [doctor, setDoctor] = useState(null);
  const [loading, setLoading] = useState(false);
  const [schedule, setSchedule] = useState(null);

  // Profile editing
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileForm, setProfileForm] = useState({ bio: '', experienceYears: '', languages: '', qualifications: '', acceptingNewPatients: true });
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState(null);

  // Fetch full doctor details when drawer opens
  useEffect(() => {
    if (!open || !listDoctor) return;
    const id = listDoctor._id || listDoctor.id;
    setLoading(true);
    setEditingProfile(false);
    setProfileError(null);

    Promise.all([
      getDoctor(id),
      getDoctorSchedule(id).catch(() => ({ data: null })),
    ]).then(([docRes, schedRes]) => {
      setDoctor(docRes.data || listDoctor);
      setSchedule(schedRes.data);
    }).catch(() => {
      setDoctor(listDoctor);
    }).finally(() => setLoading(false));
  }, [open, listDoctor]);

  const startEditProfile = () => {
    const dp = doctor?.doctorProfile || {};
    setProfileForm({
      bio: dp.bio || '',
      experienceYears: dp.experienceYears ?? '',
      languages: (dp.languages || []).join(', '),
      qualifications: (dp.qualifications || []).join(', '),
      acceptingNewPatients: dp.acceptingNewPatients ?? true,
    });
    setProfileError(null);
    setEditingProfile(true);
  };

  const handleProfileSave = async () => {
    if (!doctor) return;
    setProfileSaving(true);
    setProfileError(null);
    try {
      const doctorProfile = {
        bio: profileForm.bio.trim(),
        experienceYears: profileForm.experienceYears !== '' ? Number(profileForm.experienceYears) : undefined,
        languages: profileForm.languages.split(',').map(s => s.trim()).filter(Boolean),
        qualifications: profileForm.qualifications.split(',').map(s => s.trim()).filter(Boolean),
        acceptingNewPatients: profileForm.acceptingNewPatients,
      };
      const res = await updateDoctor(doctor._id || doctor.id, { doctorProfile });
      setDoctor(res.data || { ...doctor, doctorProfile });
      setEditingProfile(false);
      onRefresh?.();
    } catch (err) {
      setProfileError(err.message || 'Failed to save profile');
    } finally {
      setProfileSaving(false);
    }
  };

  const getBranchName = (d) => {
    if (typeof d.branch === 'object' && d.branch?.name) return d.branch.name;
    return '--';
  };

  const getDeptName = (d) => {
    if (typeof d.department === 'object' && d.department?.name) return d.department.name;
    return d.specialization || '--';
  };

  // Compact schedule view
  const scheduleEntries = schedule
    ? (Array.isArray(schedule) ? schedule[0] : schedule)
    : null;
  const weeklySchedule = scheduleEntries?.weeklySchedule || [];

  return (
    <Drawer open={open} onClose={onClose} title="Doctor Details" wide>
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Spinner />
        </div>
      ) : doctor ? (
        <div className="divide-y divide-neutral-200/60">
          {/* Hero section */}
          <div className="px-6 py-5">
            <div className="flex items-start gap-4">
              <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${getAvatarColor(doctor.name)} flex items-center justify-center text-lg font-bold shrink-0`}>
                {(doctor.name || '?')[0].toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-lg font-bold text-neutral-900 font-display truncate">{doctor.name}</h3>
                <p className="text-sm text-neutral-900/50">{doctor.specialization || 'No specialization'}</p>
                <div className="flex items-center gap-2 mt-2">
                  <StatusBadge status={doctor.status || (doctor.isActive ? 'active' : 'inactive')} />
                  {doctor.isFeaturedOnPlatform && (
                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200 rounded-full">
                      <Star className="w-2.5 h-2.5 fill-amber-400 text-amber-400" />
                      Featured
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Quick actions */}
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => { onClose(); onOpenFeature?.(doctor); }}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
                  doctor.isFeaturedOnPlatform
                    ? 'bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200'
                    : 'bg-neutral-100 text-neutral-900/50 hover:bg-neutral-200 border border-neutral-300/60'
                }`}
              >
                <Globe className="h-3.5 w-3.5" />
                {doctor.isFeaturedOnPlatform ? 'Featured' : 'Feature'}
              </button>
              <button
                onClick={() => { onClose(); onOpenSchedule?.(doctor); }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-neutral-100 text-neutral-900/50 hover:bg-neutral-200 border border-neutral-300/60 transition"
              >
                <CalendarClock className="h-3.5 w-3.5" />
                Schedule
              </button>
            </div>
          </div>

          {/* Contact & Professional info */}
          <div className="px-6 py-4">
            <p className="text-[10px] font-bold text-neutral-900/30 uppercase tracking-widest mb-2">Contact & Details</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6">
              <InfoRow icon={Mail} label="Email" value={doctor.email} />
              <InfoRow icon={Phone} label="Phone" value={doctor.phone} />
              <InfoRow icon={Building2} label="Branch" value={getBranchName(doctor)} />
              <InfoRow icon={Stethoscope} label="Department" value={getDeptName(doctor)} />
              <InfoRow icon={FileText} label="License Number" value={doctor.licenseNumber} />
              <InfoRow icon={CreditCard} label="Consultation Fee" value={doctor.consultationFee != null ? `Rs. ${doctor.consultationFee}` : null} />
            </div>
          </div>

          {/* Working Schedule summary */}
          <div className="px-6 py-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] font-bold text-neutral-900/30 uppercase tracking-widest">Working Schedule</p>
              <button
                onClick={() => { onClose(); onOpenSchedule?.(doctor); }}
                className="text-[11px] font-semibold text-primary-600 hover:text-primary-700 flex items-center gap-0.5"
              >
                Manage <ChevronRight className="h-3 w-3" />
              </button>
            </div>
            {weeklySchedule.length > 0 ? (
              <div className="space-y-1">
                {weeklySchedule.map((day) => (
                  <div key={day.day} className="flex items-center gap-3 py-1">
                    <span className="text-xs font-medium text-neutral-900/50 w-8">{DAY_LABELS[day.day] || day.day}</span>
                    {day.isWorking ? (
                      <div className="flex items-center gap-2 flex-wrap">
                        {day.slots && day.slots.length > 0 ? (
                          day.slots.map((slot, i) => (
                            <span key={i} className="text-xs text-neutral-900/70 bg-emerald-50 px-2 py-0.5 rounded-md font-medium">
                              {slot.startTime} - {slot.endTime}
                            </span>
                          ))
                        ) : (
                          <span className="text-xs text-neutral-900/70 bg-emerald-50 px-2 py-0.5 rounded-md font-medium">
                            {day.startTime} - {day.endTime}
                          </span>
                        )}
                        {day.breakStart && (
                          <span className="text-[11px] text-neutral-900/35">
                            break {day.breakStart}-{day.breakEnd}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-neutral-900/25 italic">Off</span>
                    )}
                  </div>
                ))}
                {scheduleEntries?.slotDuration && (
                  <p className="text-[11px] text-neutral-900/35 mt-1 flex items-center gap-1">
                    <Clock className="h-3 w-3" /> {scheduleEntries.slotDuration} min slots
                  </p>
                )}
              </div>
            ) : (
              <p className="text-xs text-neutral-900/30 italic">No schedule configured yet</p>
            )}
          </div>

          {/* Public Profile section */}
          <div className="px-6 py-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] font-bold text-neutral-900/30 uppercase tracking-widest">Public Profile</p>
              {!editingProfile && (
                <button
                  onClick={startEditProfile}
                  className="text-[11px] font-semibold text-primary-600 hover:text-primary-700 flex items-center gap-0.5"
                >
                  <Pencil className="h-3 w-3" /> Edit
                </button>
              )}
            </div>

            {profileError && <ErrorAlert message={profileError} />}

            {editingProfile ? (
              <div className="space-y-3">
                <div>
                  <label className={labelClasses}>Bio</label>
                  <textarea
                    value={profileForm.bio}
                    onChange={(e) => setProfileForm(p => ({ ...p, bio: e.target.value }))}
                    rows={3}
                    maxLength={1000}
                    placeholder="Brief professional bio..."
                    className={inputClasses + ' resize-none'}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelClasses}>Experience (years)</label>
                    <input
                      type="number"
                      min="0"
                      max="60"
                      value={profileForm.experienceYears}
                      onChange={(e) => setProfileForm(p => ({ ...p, experienceYears: e.target.value }))}
                      placeholder="10"
                      className={inputClasses}
                    />
                  </div>
                  <div className="flex items-end pb-1">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={profileForm.acceptingNewPatients}
                        onChange={(e) => setProfileForm(p => ({ ...p, acceptingNewPatients: e.target.checked }))}
                        className="w-4 h-4 rounded border-neutral-300 text-primary-600 focus:ring-primary-500 cursor-pointer"
                      />
                      <span className="text-xs text-neutral-900/60">Accepting patients</span>
                    </label>
                  </div>
                </div>
                <div>
                  <label className={labelClasses}>Languages (comma-separated)</label>
                  <input
                    type="text"
                    value={profileForm.languages}
                    onChange={(e) => setProfileForm(p => ({ ...p, languages: e.target.value }))}
                    placeholder="English, Hindi, Marathi"
                    className={inputClasses}
                  />
                </div>
                <div>
                  <label className={labelClasses}>Qualifications (comma-separated)</label>
                  <input
                    type="text"
                    value={profileForm.qualifications}
                    onChange={(e) => setProfileForm(p => ({ ...p, qualifications: e.target.value }))}
                    placeholder="BDS, MDS Periodontics"
                    className={inputClasses}
                  />
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <button
                    onClick={() => setEditingProfile(false)}
                    disabled={profileSaving}
                    className="px-3 py-1.5 text-xs font-medium text-neutral-900/50 bg-neutral-200/80 rounded-lg hover:bg-neutral-300 transition"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleProfileSave}
                    disabled={profileSaving}
                    className="px-4 py-1.5 text-xs font-semibold text-white bg-gradient-to-r from-primary-500 to-primary-600 rounded-lg hover:from-primary-600 hover:to-primary-700 transition disabled:opacity-50 flex items-center gap-1"
                  >
                    {profileSaving ? 'Saving...' : <><Check className="h-3 w-3" /> Save</>}
                  </button>
                </div>
              </div>
            ) : (
              <div>
                {(() => {
                  const dp = doctor.doctorProfile || {};
                  const hasBio = dp.bio?.trim();
                  const hasAny = hasBio || dp.experienceYears || dp.languages?.length || dp.qualifications?.length;

                  if (!hasAny) {
                    return (
                      <p className="text-xs text-neutral-900/30 italic">
                        No public profile information set yet. Click &quot;Edit&quot; to add bio, qualifications, and more.
                      </p>
                    );
                  }

                  return (
                    <div className="space-y-2">
                      {hasBio && <p className="text-sm text-neutral-900/60 leading-relaxed">{dp.bio}</p>}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6">
                        {dp.experienceYears != null && (
                          <InfoRow icon={Clock} label="Experience" value={`${dp.experienceYears} years`} />
                        )}
                        {dp.languages?.length > 0 && (
                          <InfoRow icon={Languages} label="Languages" value={dp.languages.join(', ')} />
                        )}
                        {dp.qualifications?.length > 0 && (
                          <InfoRow icon={GraduationCap} label="Qualifications" value={dp.qualifications.join(', ')} />
                        )}
                      </div>
                      <p className="text-[11px] text-neutral-900/35 flex items-center gap-1">
                        {dp.acceptingNewPatients !== false ? (
                          <><Check className="h-3 w-3 text-emerald-500" /> Accepting new patients</>
                        ) : (
                          <><X className="h-3 w-3 text-red-400" /> Not accepting new patients</>
                        )}
                      </p>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </Drawer>
  );
}
