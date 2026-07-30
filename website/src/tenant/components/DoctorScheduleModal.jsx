import { useState, useEffect, useCallback } from 'react';
import {
  getDoctorSchedule,
  updateDoctorSchedule,
  getDoctorLeaves,
  createDoctorLeave,
  deleteDoctorLeave,
  approveDoctorLeave,
  rejectDoctorLeave,
  getDoctorOverrides,
  createDoctorOverride,
  deleteDoctorOverride,
  listBranches,
  getBookingPolicy,
} from '../api';
import { Modal, Spinner, ErrorAlert } from '../../platform/components/shared';
import { stripDrPrefix } from '../../utils/doctorName';
import { Clock, Calendar, Trash2, Plus, Save, CalendarCog, Settings2, Check, X, Copy, ChevronDown } from 'lucide-react';
import ConflictResolutionModal from './schedule/ConflictResolutionModal';

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const DAY_LABELS = { monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed', thursday: 'Thu', friday: 'Fri', saturday: 'Sat', sunday: 'Sun' };
const DAY_FULL = { monday: 'Monday', tuesday: 'Tuesday', wednesday: 'Wednesday', thursday: 'Thursday', friday: 'Friday', saturday: 'Saturday', sunday: 'Sunday' };
const LEAVE_TYPES = ['planned', 'sick', 'personal', 'conference', 'other'];
const OVERRIDE_TYPES = [
  { value: 'custom_hours', label: 'Custom Hours', desc: 'Different hours for this date' },
  { value: 'day_off', label: 'Day Off', desc: 'Not available this date' },
  { value: 'extra_day', label: 'Extra Day', desc: 'Available on an off-day' },
];

const DEFAULT_SCHEDULE = DAYS.map((day) => ({
  day,
  isWorking: day !== 'sunday',
  slots: day !== 'sunday'
    ? [{ startTime: '09:00', endTime: '13:00', label: 'Morning' }, { startTime: '14:00', endTime: '18:00', label: 'Afternoon' }]
    : [],
  startTime: '09:00',
  endTime: '18:00',
  breakStart: null,
  breakEnd: null,
}));

const inputCls = 'w-full px-2 py-1.5 text-sm rounded-lg border border-neutral-900/10 bg-white focus:outline-none focus:ring-2 focus:ring-primary-500/30';
const btnPrimary = 'inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary-600 text-white font-medium text-sm hover:bg-primary-700 transition disabled:opacity-50';
const btnSecondary = 'inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-neutral-900/10 text-sm text-neutral-900/60 hover:bg-neutral-100 transition';

export default function DoctorScheduleModal({ open, onClose, doctor }) {
  const [branches, setBranches] = useState([]);
  const [selectedBranch, setSelectedBranch] = useState('');
  const [schedule, setSchedule] = useState(DEFAULT_SCHEDULE);
  const [slotDuration, setSlotDuration] = useState(30);
  const [bufferMinutes, setBufferMinutes] = useState(0);
  const [minNoticeMinutes, setMinNoticeMinutes] = useState(60);
  const [maxAdvanceDays, setMaxAdvanceDays] = useState(60);
  const [leaves, setLeaves] = useState([]);
  const [overrides, setOverrides] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('schedule');

  // Schedule conflict resolution
  const [conflictModalOpen, setConflictModalOpen] = useState(false);
  const [conflictData, setConflictData] = useState({ conflicts: [], reason: '', branchId: '' });

  // Day pill selector
  const [selectedDay, setSelectedDay] = useState('monday');

  // Copy-to-days dropdown
  const [showCopyDropdown, setShowCopyDropdown] = useState(false);
  const [copyTargets, setCopyTargets] = useState([]);

  // Leave form
  const [leaveForm, setLeaveForm] = useState({ startDate: '', endDate: '', reason: '', leaveType: 'planned' });
  const [addingLeave, setAddingLeave] = useState(false);

  // Override form
  const [overrideForm, setOverrideForm] = useState({
    date: '', type: 'custom_hours',
    slots: [{ startTime: '09:00', endTime: '18:00', label: '' }],
    reason: '',
  });
  const [addingOverride, setAddingOverride] = useState(false);

  const doctorId = doctor?._id || doctor?.id;

  // ── Fetch functions ──

  const fetchBranches = useCallback(async () => {
    try {
      const res = await listBranches();
      const items = res.data?.items || res.data || [];
      setBranches(items);
      if (items.length > 0 && !selectedBranch) {
        const defaultBranch = doctor?.branch?._id || doctor?.branch || items[0]._id || items[0].id;
        setSelectedBranch(defaultBranch);
      }
    } catch (err) {
      setError(err.message);
    }
  }, [doctor, selectedBranch]);

  const fetchSchedule = useCallback(async () => {
    if (!doctorId) return;
    setLoading(true);
    setError('');
    try {
      const res = await getDoctorSchedule(doctorId);
      const schedules = res.data || [];
      const match = selectedBranch
        ? schedules.find((s) => (s.branch?._id || s.branch) === selectedBranch)
        : schedules[0];
      if (match) {
        setSchedule(
          DAYS.map((day) => {
            const found = match.weeklySchedule.find((d) => d.day === day);
            if (found) {
              // Ensure slots exist — migrate legacy data if needed
              let slots = found.slots || [];
              if (slots.length === 0 && found.isWorking && found.startTime && found.endTime) {
                if (found.breakStart && found.breakEnd) {
                  slots = [
                    { startTime: found.startTime, endTime: found.breakStart, label: '' },
                    { startTime: found.breakEnd, endTime: found.endTime, label: '' },
                  ];
                } else {
                  slots = [{ startTime: found.startTime, endTime: found.endTime, label: '' }];
                }
              }
              return { ...found, slots };
            }
            return { day, isWorking: false, slots: [], startTime: '09:00', endTime: '18:00', breakStart: null, breakEnd: null };
          }),
        );
        setSlotDuration(match.slotDuration || 30);
        setBufferMinutes(match.bufferMinutes || 0);
        setMinNoticeMinutes(match.minNoticeMinutes ?? 60);
        setMaxAdvanceDays(match.maxAdvanceDays ?? 60);
      } else {
        // Load clinic-level policy defaults instead of hardcoded values
        let clinicDefaults = { slotDuration: 30, bufferMinutes: 0, minNoticeMinutes: 60, maxAdvanceDays: 60 };
        try {
          const policyRes = await getBookingPolicy();
          if (policyRes?.data) clinicDefaults = policyRes.data;
        } catch (_) { /* use hardcoded defaults if policy fetch fails */ }

        setSchedule(DEFAULT_SCHEDULE);
        setSlotDuration(clinicDefaults.slotDuration ?? 30);
        setBufferMinutes(clinicDefaults.bufferMinutes ?? 0);
        setMinNoticeMinutes(clinicDefaults.minNoticeMinutes ?? 60);
        setMaxAdvanceDays(clinicDefaults.maxAdvanceDays ?? 60);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [doctorId, selectedBranch]);

  const fetchLeaves = useCallback(async () => {
    if (!doctorId) return;
    try {
      const res = await getDoctorLeaves(doctorId, { upcoming: 'true', limit: 50 });
      setLeaves(res.data?.items || res.data || []);
    } catch (err) {
      setError(err.message);
    }
  }, [doctorId]);

  const fetchOverrides = useCallback(async () => {
    if (!doctorId || !selectedBranch) return;
    try {
      const res = await getDoctorOverrides(doctorId, { branch: selectedBranch, limit: 50 });
      setOverrides(res.data?.items || res.data || []);
    } catch (err) {
      setError(err.message);
    }
  }, [doctorId, selectedBranch]);

  useEffect(() => {
    if (open) {
      fetchBranches();
      fetchLeaves();
    }
  }, [open, fetchBranches, fetchLeaves]);

  useEffect(() => {
    if (open && selectedBranch) fetchOverrides();
  }, [open, selectedBranch, fetchOverrides]);

  useEffect(() => {
    if (open && selectedBranch) fetchSchedule();
  }, [open, selectedBranch, fetchSchedule]);

  // ── Schedule handlers ──

  const getDaySchedule = (dayName) => schedule.find((d) => d.day === dayName);

  const handleToggleWorking = (dayName, isWorking) => {
    setSchedule((prev) => prev.map((d) => {
      if (d.day !== dayName) return d;
      return {
        ...d,
        isWorking,
        slots: isWorking && d.slots.length === 0
          ? [{ startTime: '09:00', endTime: '13:00', label: 'Morning' }, { startTime: '14:00', endTime: '18:00', label: 'Afternoon' }]
          : d.slots,
      };
    }));
  };

  const handleSlotChange = (dayName, slotIndex, field, value) => {
    setSchedule((prev) => prev.map((d) => {
      if (d.day !== dayName) return d;
      const newSlots = d.slots.map((s, i) => (i === slotIndex ? { ...s, [field]: value } : s));
      return { ...d, slots: newSlots };
    }));
  };

  const handleAddSlot = (dayName) => {
    setSchedule((prev) => prev.map((d) => {
      if (d.day !== dayName) return d;
      const lastSlot = d.slots[d.slots.length - 1];
      const newStart = lastSlot ? lastSlot.endTime : '09:00';
      const [h, m] = newStart.split(':').map(Number);
      const endH = Math.min(h + 4, 23);
      const newEnd = `${String(endH).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      return { ...d, slots: [...d.slots, { startTime: newStart, endTime: newEnd, label: '' }] };
    }));
  };

  const handleRemoveSlot = (dayName, slotIndex) => {
    setSchedule((prev) => prev.map((d) => {
      if (d.day !== dayName) return d;
      return { ...d, slots: d.slots.filter((_, i) => i !== slotIndex) };
    }));
  };

  const handleCopyToOtherDays = () => {
    if (copyTargets.length === 0) return;
    const source = getDaySchedule(selectedDay);
    setSchedule((prev) => prev.map((d) => {
      if (!copyTargets.includes(d.day)) return d;
      return { ...d, isWorking: source.isWorking, slots: source.slots.map((s) => ({ ...s })) };
    }));
    setShowCopyDropdown(false);
    setCopyTargets([]);
  };

  const toggleCopyTarget = (day) => {
    setCopyTargets((prev) => prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]);
  };

  const handleSave = async () => {
    if (!selectedBranch) { setError('Please select a branch'); return; }
    setSaving(true);
    setError('');
    try {
      await updateDoctorSchedule(doctorId, {
        branch: selectedBranch,
        slotDuration,
        bufferMinutes,
        minNoticeMinutes,
        maxAdvanceDays,
        weeklySchedule: schedule.map(({ day, isWorking, slots }) => ({
          day,
          isWorking,
          slots: isWorking ? slots : [],
        })),
      });
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  // ── Leave handlers ──

  const handleAddLeave = async () => {
    if (!leaveForm.startDate || !leaveForm.endDate) { setError('Start and end dates are required'); return; }
    setAddingLeave(true);
    setError('');
    try {
      await createDoctorLeave(doctorId, leaveForm);
      setLeaveForm({ startDate: '', endDate: '', reason: '', leaveType: 'planned' });
      fetchLeaves();
    } catch (err) {
      setError(err.message);
    } finally {
      setAddingLeave(false);
    }
  };

  const handleDeleteLeave = async (leaveId) => {
    try { await deleteDoctorLeave(doctorId, leaveId); fetchLeaves(); } catch (err) { setError(err.message); }
  };

  const handleApproveLeave = async (leaveId) => {
    try {
      const res = await approveDoctorLeave(doctorId, leaveId);
      fetchLeaves();

      // Check for conflicting appointments during leave period
      const data = res?.data || res;
      const conflicts = data?.conflicts || [];
      if (conflicts.length > 0) {
        setConflictData({
          conflicts,
          reason: `Doctor on leave`,
          branchId: selectedBranch,
        });
        setConflictModalOpen(true);
      }
    } catch (err) { setError(err.message); }
  };

  const handleRejectLeave = async (leaveId) => {
    try { await rejectDoctorLeave(doctorId, leaveId); fetchLeaves(); } catch (err) { setError(err.message); }
  };

  // ── Override handlers ──

  const handleOverrideSlotChange = (slotIndex, field, value) => {
    setOverrideForm((prev) => ({
      ...prev,
      slots: prev.slots.map((s, i) => (i === slotIndex ? { ...s, [field]: value } : s)),
    }));
  };

  const handleAddOverrideSlot = () => {
    setOverrideForm((prev) => ({
      ...prev,
      slots: [...prev.slots, { startTime: '09:00', endTime: '18:00', label: '' }],
    }));
  };

  const handleRemoveOverrideSlot = (slotIndex) => {
    setOverrideForm((prev) => ({
      ...prev,
      slots: prev.slots.filter((_, i) => i !== slotIndex),
    }));
  };

  const handleAddOverride = async () => {
    if (!overrideForm.date) { setError('Date is required'); return; }
    if (!selectedBranch) { setError('Please select a branch first'); return; }
    if ((overrideForm.type === 'custom_hours' || overrideForm.type === 'extra_day') && overrideForm.slots.length === 0) {
      setError('At least one time slot is required');
      return;
    }
    setAddingOverride(true);
    setError('');
    try {
      const res = await createDoctorOverride(doctorId, {
        branch: selectedBranch,
        date: overrideForm.date,
        type: overrideForm.type,
        slots: overrideForm.type === 'day_off' ? [] : overrideForm.slots,
        startTime: overrideForm.type === 'day_off' ? null : overrideForm.slots[0]?.startTime || null,
        endTime: overrideForm.type === 'day_off' ? null : overrideForm.slots[overrideForm.slots.length - 1]?.endTime || null,
        reason: overrideForm.reason || null,
      });
      setOverrideForm({ date: '', type: 'custom_hours', slots: [{ startTime: '09:00', endTime: '18:00', label: '' }], reason: '' });
      fetchOverrides();

      // Check for conflicting appointments
      const data = res?.data || res;
      const conflicts = data?.conflicts || [];
      if (conflicts.length > 0) {
        setConflictData({
          conflicts,
          reason: overrideForm.reason || `Doctor schedule change on ${overrideForm.date}`,
          branchId: selectedBranch,
        });
        setConflictModalOpen(true);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setAddingOverride(false);
    }
  };

  const handleDeleteOverride = async (overrideId) => {
    try { await deleteDoctorOverride(doctorId, overrideId); fetchOverrides(); } catch (err) { setError(err.message); }
  };

  if (!open) return null;

  const currentDay = getDaySchedule(selectedDay);

  return (
    <Modal open={open} onClose={onClose} title={`Schedule — Dr. ${stripDrPrefix(doctor?.name || '')}`} maxWidth="max-w-2xl">
      <div className="space-y-4">
        {error && <ErrorAlert message={error} onClose={() => setError('')} />}

        {/* Tabs */}
        <div className="flex gap-2 border-b border-neutral-900/10 pb-2">
          {[
            { key: 'schedule', icon: Clock, label: 'Weekly Schedule' },
            { key: 'leaves', icon: Calendar, label: `Leaves (${leaves.length})` },
            { key: 'overrides', icon: CalendarCog, label: `Overrides (${overrides.length})` },
          ].map(({ key, icon: Icon, label }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`px-3 py-1.5 text-sm rounded-t-lg font-medium transition ${tab === key ? 'text-primary-600 border-b-2 border-primary-600' : 'text-neutral-900/40 hover:text-neutral-900/60'}`}
            >
              <Icon className="h-4 w-4 inline mr-1" /> {label}
            </button>
          ))}
        </div>

        {/* ── Weekly Schedule Tab ── */}
        {tab === 'schedule' && (
          <>
            {/* Branch + Slot Duration */}
            <div className="flex gap-4">
              <div className="flex-1">
                <label className="text-xs font-medium text-neutral-900/50 mb-1 block">Branch</label>
                <select className={inputCls} value={selectedBranch} onChange={(e) => setSelectedBranch(e.target.value)}>
                  <option value="">Select branch</option>
                  {branches.map((b) => (
                    <option key={b._id || b.id} value={b._id || b.id}>{b.name}</option>
                  ))}
                </select>
              </div>
              <div className="w-32">
                <label className="text-xs font-medium text-neutral-900/50 mb-1 block">Slot (min)</label>
                <input type="number" min={10} max={120} step={5} className={inputCls} value={slotDuration} onChange={(e) => setSlotDuration(Number(e.target.value))} />
              </div>
            </div>

            {loading ? (
              <div className="flex justify-center py-8"><Spinner /></div>
            ) : (
              <>
                {/* Day Pill Selector */}
                <div className="flex gap-2">
                  {DAYS.map((day) => {
                    const ds = getDaySchedule(day);
                    const isActive = selectedDay === day;
                    const hasSlots = ds?.isWorking && ds?.slots?.length > 0;
                    return (
                      <button
                        key={day}
                        onClick={() => setSelectedDay(day)}
                        className={`relative flex-1 py-2.5 px-1 rounded-xl text-center text-xs font-semibold transition-all
                          ${isActive
                            ? 'bg-primary-600 text-white shadow-md shadow-primary-200'
                            : ds?.isWorking
                              ? 'bg-white border border-neutral-900/10 text-neutral-900 hover:border-primary-300'
                              : 'bg-neutral-50 border border-neutral-900/5 text-neutral-900/30'
                          }`}
                      >
                        {DAY_LABELS[day]}
                        {hasSlots && !isActive && (
                          <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Selected Day Panel */}
                {currentDay && (
                  <div className="bg-white border border-neutral-900/10 rounded-xl p-4 space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-semibold text-neutral-900">{DAY_FULL[selectedDay]}</h4>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <span className="text-xs text-neutral-900/50">{currentDay.isWorking ? 'Working' : 'Off'}</span>
                        <button
                          onClick={() => handleToggleWorking(selectedDay, !currentDay.isWorking)}
                          className={`relative w-10 h-5 rounded-full transition-colors ${currentDay.isWorking ? 'bg-primary-500' : 'bg-neutral-300'}`}
                        >
                          <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${currentDay.isWorking ? 'translate-x-5' : ''}`} />
                        </button>
                      </label>
                    </div>

                    {currentDay.isWorking ? (
                      <>
                        <div className="space-y-3">
                          {currentDay.slots.map((slot, idx) => (
                            <div key={idx} className="flex items-center gap-3 bg-neutral-50 rounded-lg p-3">
                              <div className="flex-1 grid grid-cols-3 gap-2">
                                <div>
                                  <label className="text-[10px] font-medium text-neutral-900/40 mb-0.5 block">Label</label>
                                  <input
                                    className={inputCls}
                                    placeholder="e.g. Morning OPD"
                                    value={slot.label || ''}
                                    onChange={(e) => handleSlotChange(selectedDay, idx, 'label', e.target.value)}
                                  />
                                </div>
                                <div>
                                  <label className="text-[10px] font-medium text-neutral-900/40 mb-0.5 block">Start</label>
                                  <input
                                    type="time"
                                    className={inputCls}
                                    value={slot.startTime}
                                    onChange={(e) => handleSlotChange(selectedDay, idx, 'startTime', e.target.value)}
                                  />
                                </div>
                                <div>
                                  <label className="text-[10px] font-medium text-neutral-900/40 mb-0.5 block">End</label>
                                  <input
                                    type="time"
                                    className={inputCls}
                                    value={slot.endTime}
                                    onChange={(e) => handleSlotChange(selectedDay, idx, 'endTime', e.target.value)}
                                  />
                                </div>
                              </div>
                              {currentDay.slots.length > 1 && (
                                <button
                                  onClick={() => handleRemoveSlot(selectedDay, idx)}
                                  className="p-1.5 rounded-lg text-neutral-900/20 hover:text-red-600 hover:bg-red-50 transition"
                                  title="Remove slot"
                                >
                                  <X className="h-4 w-4" />
                                </button>
                              )}
                            </div>
                          ))}
                        </div>

                        <div className="flex items-center gap-3">
                          {currentDay.slots.length < 5 && (
                            <button onClick={() => handleAddSlot(selectedDay)} className={`${btnSecondary} text-xs`}>
                              <Plus className="h-3.5 w-3.5" /> Add Time Slot
                            </button>
                          )}

                          <div className="relative">
                            <button
                              onClick={() => { setShowCopyDropdown(!showCopyDropdown); setCopyTargets([]); }}
                              className={`${btnSecondary} text-xs`}
                            >
                              <Copy className="h-3.5 w-3.5" /> Copy to other days <ChevronDown className="h-3 w-3" />
                            </button>
                            {showCopyDropdown && (
                              <div className="absolute top-full left-0 mt-1 bg-white border border-neutral-900/10 rounded-xl shadow-lg p-2 z-10 min-w-[180px]">
                                {DAYS.filter((d) => d !== selectedDay).map((day) => (
                                  <label key={day} className="flex items-center gap-2 px-2 py-1.5 hover:bg-neutral-50 rounded-lg cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={copyTargets.includes(day)}
                                      onChange={() => toggleCopyTarget(day)}
                                      className="rounded border-neutral-300 text-primary-600"
                                    />
                                    <span className="text-sm text-neutral-700">{DAY_FULL[day]}</span>
                                  </label>
                                ))}
                                <div className="border-t border-neutral-900/5 mt-1 pt-1">
                                  <button
                                    onClick={handleCopyToOtherDays}
                                    disabled={copyTargets.length === 0}
                                    className="w-full text-xs font-medium text-primary-600 hover:bg-primary-50 rounded-lg py-1.5 transition disabled:opacity-40"
                                  >
                                    Apply to {copyTargets.length} day{copyTargets.length !== 1 ? 's' : ''}
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="text-center py-6">
                        <p className="text-sm text-neutral-900/30 font-medium">Day Off</p>
                        <p className="text-xs text-neutral-900/20 mt-1">Toggle the switch to set working hours</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Booking Policies */}
                <div className="bg-neutral-50 rounded-xl p-3 space-y-2">
                  <p className="text-xs font-semibold text-neutral-900/50 flex items-center gap-1.5"><Settings2 className="h-3.5 w-3.5" /> Booking Policies</p>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="text-[11px] font-medium text-neutral-900/40 mb-1 block">Buffer (min)</label>
                      <input type="number" min={0} max={60} step={5} className={inputCls} value={bufferMinutes} onChange={(e) => setBufferMinutes(Number(e.target.value))} />
                    </div>
                    <div>
                      <label className="text-[11px] font-medium text-neutral-900/40 mb-1 block">Min Notice (min)</label>
                      <input type="number" min={0} max={10080} step={30} className={inputCls} value={minNoticeMinutes} onChange={(e) => setMinNoticeMinutes(Number(e.target.value))} />
                    </div>
                    <div>
                      <label className="text-[11px] font-medium text-neutral-900/40 mb-1 block">Max Advance (days)</label>
                      <input type="number" min={1} max={365} step={1} className={inputCls} value={maxAdvanceDays} onChange={(e) => setMaxAdvanceDays(Number(e.target.value))} />
                    </div>
                  </div>
                  <p className="text-[10px] text-neutral-900/30">Buffer: gap between appointments. Notice: how early patients must book. Advance: how far ahead they can book.</p>
                </div>
              </>
            )}

            <div className="flex justify-end pt-2">
              <button className={btnPrimary} onClick={handleSave} disabled={saving || !selectedBranch}>
                <Save className="h-4 w-4" />
                {saving ? 'Saving...' : 'Save Schedule'}
              </button>
            </div>
          </>
        )}

        {/* ── Leaves Tab ── */}
        {tab === 'leaves' && (
          <>
            <div className="bg-neutral-50 rounded-xl p-4 space-y-3">
              <h4 className="text-sm font-semibold text-neutral-900 flex items-center gap-2"><Calendar className="h-4 w-4 text-neutral-900/30" /> Add Leave</h4>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-neutral-900/50 mb-1 block">Start Date</label>
                  <input type="date" className={inputCls} value={leaveForm.startDate} onChange={(e) => setLeaveForm((p) => ({ ...p, startDate: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs font-medium text-neutral-900/50 mb-1 block">End Date</label>
                  <input type="date" className={inputCls} value={leaveForm.endDate} onChange={(e) => setLeaveForm((p) => ({ ...p, endDate: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs font-medium text-neutral-900/50 mb-1 block">Type</label>
                  <select className={inputCls} value={leaveForm.leaveType} onChange={(e) => setLeaveForm((p) => ({ ...p, leaveType: e.target.value }))}>
                    {LEAVE_TYPES.map((t) => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-neutral-900/50 mb-1 block">Reason</label>
                  <input className={inputCls} placeholder="Optional" value={leaveForm.reason} onChange={(e) => setLeaveForm((p) => ({ ...p, reason: e.target.value }))} />
                </div>
              </div>
              <button className={btnSecondary} onClick={handleAddLeave} disabled={addingLeave}>
                <Plus className="h-4 w-4" />
                {addingLeave ? 'Adding...' : 'Add Leave'}
              </button>
            </div>

            {leaves.length === 0 ? (
              <p className="text-sm text-neutral-900/40 text-center py-6">No upcoming leaves</p>
            ) : (
              <div className="space-y-2">
                {leaves.map((l) => (
                  <div key={l._id || l.id} className="flex items-center justify-between bg-white border border-neutral-900/5 rounded-lg px-4 py-3">
                    <div>
                      <span className="text-sm font-medium text-neutral-900">
                        {new Date(l.startDate).toLocaleDateString()} — {new Date(l.endDate).toLocaleDateString()}
                      </span>
                      <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-primary-50 text-primary-700 capitalize">{l.leaveType}</span>
                      {l.status === 'pending' && <span className="ml-1 text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">Pending</span>}
                      {l.status === 'approved' && <span className="ml-1 text-xs px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">Approved</span>}
                      {l.status === 'rejected' && <span className="ml-1 text-xs px-2 py-0.5 rounded-full bg-red-50 text-red-700">Rejected</span>}
                      {l.reason && <p className="text-xs text-neutral-900/40 mt-0.5">{l.reason}</p>}
                    </div>
                    <div className="flex items-center gap-1">
                      {l.status === 'pending' && (
                        <>
                          <button onClick={() => handleApproveLeave(l._id || l.id)} className="p-2 rounded-lg hover:bg-emerald-50 text-neutral-900/30 hover:text-emerald-600 transition" title="Approve"><Check className="h-4 w-4" /></button>
                          <button onClick={() => handleRejectLeave(l._id || l.id)} className="p-2 rounded-lg hover:bg-red-50 text-neutral-900/30 hover:text-red-600 transition" title="Reject"><X className="h-4 w-4" /></button>
                        </>
                      )}
                      <button onClick={() => handleDeleteLeave(l._id || l.id)} className="p-2 rounded-lg hover:bg-red-50 text-neutral-900/30 hover:text-red-600 transition" title="Delete"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ── Overrides Tab ── */}
        {tab === 'overrides' && (
          <>
            <div className="bg-neutral-50 rounded-xl p-4 space-y-3">
              <h4 className="text-sm font-semibold text-neutral-900 flex items-center gap-2"><CalendarCog className="h-4 w-4 text-neutral-900/30" /> Add Schedule Override</h4>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-neutral-900/50 mb-1 block">Date</label>
                  <input type="date" className={inputCls} value={overrideForm.date} onChange={(e) => setOverrideForm((p) => ({ ...p, date: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs font-medium text-neutral-900/50 mb-1 block">Type</label>
                  <select className={inputCls} value={overrideForm.type} onChange={(e) => setOverrideForm((p) => ({ ...p, type: e.target.value }))}>
                    {OVERRIDE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
              </div>

              {overrideForm.type !== 'day_off' && (
                <div className="space-y-2">
                  <label className="text-xs font-medium text-neutral-900/50 block">Time Slots</label>
                  {overrideForm.slots.map((slot, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <input className={`${inputCls} flex-1`} placeholder="Label" value={slot.label || ''} onChange={(e) => handleOverrideSlotChange(idx, 'label', e.target.value)} />
                      <input type="time" className={inputCls} value={slot.startTime} onChange={(e) => handleOverrideSlotChange(idx, 'startTime', e.target.value)} style={{ width: 110 }} />
                      <span className="text-neutral-900/30 text-xs shrink-0">to</span>
                      <input type="time" className={inputCls} value={slot.endTime} onChange={(e) => handleOverrideSlotChange(idx, 'endTime', e.target.value)} style={{ width: 110 }} />
                      {overrideForm.slots.length > 1 && (
                        <button onClick={() => handleRemoveOverrideSlot(idx)} className="p-1 rounded text-neutral-900/20 hover:text-red-600 transition"><X className="h-3.5 w-3.5" /></button>
                      )}
                    </div>
                  ))}
                  {overrideForm.slots.length < 5 && (
                    <button onClick={handleAddOverrideSlot} className="text-xs text-primary-600 hover:text-primary-700 flex items-center gap-1">
                      <Plus className="h-3 w-3" /> Add time slot
                    </button>
                  )}
                </div>
              )}

              <div>
                <label className="text-xs font-medium text-neutral-900/50 mb-1 block">Reason (optional)</label>
                <input className={inputCls} placeholder="e.g. Conference, Special clinic day" value={overrideForm.reason} onChange={(e) => setOverrideForm((p) => ({ ...p, reason: e.target.value }))} />
              </div>

              <button className={btnSecondary} onClick={handleAddOverride} disabled={addingOverride || !selectedBranch}>
                <Plus className="h-4 w-4" />
                {addingOverride ? 'Adding...' : 'Add Override'}
              </button>
              {!selectedBranch && <p className="text-[11px] text-amber-600">Select a branch in the Weekly Schedule tab first.</p>}
            </div>

            {overrides.length === 0 ? (
              <p className="text-sm text-neutral-900/40 text-center py-6">No schedule overrides</p>
            ) : (
              <div className="space-y-2">
                {overrides.map((o) => {
                  const typeLabel = OVERRIDE_TYPES.find((t) => t.value === o.type)?.label || o.type;
                  const typeColor = o.type === 'day_off' ? 'bg-red-50 text-red-700' : o.type === 'extra_day' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700';
                  return (
                    <div key={o._id || o.id} className="flex items-center justify-between bg-white border border-neutral-900/5 rounded-lg px-4 py-3">
                      <div>
                        <span className="text-sm font-medium text-neutral-900">
                          {new Date(o.date).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                        </span>
                        <span className={`ml-2 text-xs px-2 py-0.5 rounded-full ${typeColor}`}>{typeLabel}</span>
                        {o.type !== 'day_off' && o.slots?.length > 0 && (
                          <span className="ml-2 text-xs text-neutral-900/40">{o.slots.map((s) => `${s.startTime}-${s.endTime}`).join(', ')}</span>
                        )}
                        {o.type !== 'day_off' && !o.slots?.length && o.startTime && o.endTime && (
                          <span className="ml-2 text-xs text-neutral-900/40">{o.startTime} - {o.endTime}</span>
                        )}
                        {o.reason && <p className="text-xs text-neutral-900/40 mt-0.5">{o.reason}</p>}
                      </div>
                      <button onClick={() => handleDeleteOverride(o._id || o.id)} className="p-2 rounded-lg hover:bg-red-50 text-neutral-900/30 hover:text-red-600 transition" title="Delete"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>

      {/* Conflict Resolution Modal — shown when override/leave creates conflicts */}
      <ConflictResolutionModal
        open={conflictModalOpen}
        onClose={() => setConflictModalOpen(false)}
        conflicts={conflictData.conflicts}
        overrideReason={conflictData.reason}
        branchId={conflictData.branchId}
      />
    </Modal>
  );
}
