import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Search, ChevronRight, ChevronLeft, CheckCircle2, Plus, User, Bell,
  CalendarDays, Sun, Sunset, Moon, Info, Timer, Hourglass, CalendarClock,
} from 'lucide-react';
import { Modal, ErrorAlert } from '../../../platform/components/shared';
import {
  listPatients, listDoctors, listBranches, createPatient,
  createAppointment, getDoctorAvailability, getDoctorAvailabilitySummary,
} from '../../api';
import { useToast } from '../../ToastContext';
import { TYPE_CONFIG, SOURCE_STYLES, REMINDER_TIMING_OPTIONS, formatTimingLabel, inputClasses, labelClasses } from './appointment-constants';
import { stripDrPrefix } from '../../../utils/doctorName';

const STEPS = ['Patient', 'Schedule', 'Details', 'Confirm'];

const EMPTY_NEW_PATIENT = { name: '', phone: '', email: '', dateOfBirth: '', gender: '' };

export default function AppointmentCreateModal({ open, onClose, onCreated, prefillDate, prefillTime }) {
  const { showToast } = useToast();

  // Step state
  const [step, setStep] = useState(0);

  // Step 1: Patient
  const [patients, setPatients] = useState([]);
  const [patientSearch, setPatientSearch] = useState('');
  const [selectedPatientId, setSelectedPatientId] = useState('');
  const [isNewPatient, setIsNewPatient] = useState(false);
  const [newPatientData, setNewPatientData] = useState(EMPTY_NEW_PATIENT);

  // Step 2: Schedule
  const [doctors, setDoctors] = useState([]);
  const [doctorId, setDoctorId] = useState('');
  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [availableSlots, setAvailableSlots] = useState([]);
  const [loadingSlots, setLoadingSlots] = useState(false);

  // Calendar state
  const [calMonth, setCalMonth] = useState(new Date().getMonth() + 1);
  const [calYear, setCalYear] = useState(new Date().getFullYear());
  const [dateSummary, setDateSummary] = useState({});
  const [doctorPolicy, setDoctorPolicy] = useState(null);

  // Step 3: Details
  const [type, setType] = useState('consultation');
  const [source, setSource] = useState('general');
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [branches, setBranches] = useState([]);
  const [branchId, setBranchId] = useState('');

  // Step 3: Reminder timings
  const [reminderTimings, setReminderTimings] = useState([1440]);

  // Form state
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  // Reset on open
  useEffect(() => {
    if (open) {
      setStep(0);
      setPatientSearch('');
      setSelectedPatientId('');
      setIsNewPatient(false);
      setNewPatientData(EMPTY_NEW_PATIENT);
      setDoctorId('');
      setDate(prefillDate || '');
      setStartTime(prefillTime || '');
      setEndTime('');
      setAvailableSlots([]);
      setDoctorPolicy(null);
      setType('consultation');
      setSource('general');
      setReason('');
      setNotes('');
      setBranchId('');
      setReminderTimings([1440]);
      setFormError('');
    }
  }, [open, prefillDate, prefillTime]);

  // Fetch patients and doctors
  useEffect(() => {
    if (!open) return;
    listPatients({ limit: 300 })
      .then((res) => setPatients(Array.isArray(res.data) ? res.data : res.data?.items || []))
      .catch(() => {});
    listDoctors({ limit: 200 })
      .then((res) => setDoctors(Array.isArray(res.data) ? res.data : res.data?.items || []))
      .catch(() => {});
    listBranches({ limit: 100 })
      .then((res) => setBranches(Array.isArray(res.data) ? res.data : res.data?.items || []))
      .catch(() => {});
  }, [open]);

  // Fetch monthly availability summary when doctor or month changes
  useEffect(() => {
    if (!doctorId) { setDateSummary({}); setDoctorPolicy(null); return; }
    getDoctorAvailabilitySummary(doctorId, calMonth, calYear, branchId || undefined)
      .then((res) => {
        const d = res.data || res;
        setDateSummary(d.dates || {});
        if (d.minNoticeMinutes != null) {
          setDoctorPolicy({
            minNoticeMinutes: d.minNoticeMinutes,
            maxAdvanceDays: d.maxAdvanceDays,
            slotDuration: d.slotDuration ?? 30,
            bufferMinutes: d.bufferMinutes ?? 0,
          });
        }
      })
      .catch(() => setDateSummary({}));
  }, [doctorId, calMonth, calYear, branchId]);

  // Fetch availability
  useEffect(() => {
    if (!doctorId || !date) { setAvailableSlots([]); return; }
    setLoadingSlots(true);
    getDoctorAvailability(doctorId, date, branchId || undefined)
      .then((res) => {
        const d = res.data || {};
        const slots = d.slots || [];
        setAvailableSlots(slots.filter((s) => s.available));
        // Merge full policy from slot response
        if (d.minNoticeMinutes != null) {
          setDoctorPolicy((prev) => ({
            ...prev,
            minNoticeMinutes: d.minNoticeMinutes,
            maxAdvanceDays: d.maxAdvanceDays,
            bufferMinutes: d.bufferMinutes ?? prev?.bufferMinutes ?? 0,
            slotDuration: prev?.slotDuration ?? 30,
          }));
        }
      })
      .catch(() => setAvailableSlots([]))
      .finally(() => setLoadingSlots(false));
  }, [doctorId, date, branchId]);

  // Group slots by period
  const groupedSlots = useMemo(() => {
    const groups = { morning: [], afternoon: [], evening: [] };
    availableSlots.forEach((s) => {
      const h = parseInt(s.display?.split(':')[0] || '0', 10);
      if (h < 12) groups.morning.push(s);
      else if (h < 17) groups.afternoon.push(s);
      else groups.evening.push(s);
    });
    return groups;
  }, [availableSlots]);

  // Populate reminder timings from selected doctor's defaults
  useEffect(() => {
    if (!doctorId) return;
    const doc = doctors.find((d) => (d._id || d.id) === doctorId);
    if (doc?.defaultReminderTimings?.length) {
      setReminderTimings(doc.defaultReminderTimings);
    }
  }, [doctorId, doctors]);

  // Filter patients by search
  const filteredPatients = useMemo(() => {
    if (!patientSearch.trim()) return patients.slice(0, 20);
    const q = patientSearch.toLowerCase();
    return patients.filter((p) =>
      (p.name || '').toLowerCase().includes(q) ||
      (p.phone || '').includes(q) ||
      (p.email || '').toLowerCase().includes(q) ||
      (p.patientId || '').toLowerCase().includes(q)
    ).slice(0, 20);
  }, [patients, patientSearch]);

  const selectedPatient = patients.find((p) => (p._id || p.id) === selectedPatientId);
  const selectedDoctor = doctors.find((d) => (d._id || d.id) === doctorId);
  const selectedBranch = branches.find((b) => (b._id || b.id) === branchId);

  // Validate current step
  const canProceed = () => {
    if (step === 0) return isNewPatient ? (newPatientData.name && newPatientData.phone) : !!selectedPatientId;
    if (step === 1) return doctorId && date && startTime && endTime;
    if (step === 2) return !!type;
    return true;
  };

  // Handle create
  const handleCreate = async () => {
    setSaving(true);
    setFormError('');
    try {
      let patientId = selectedPatientId;
      if (isNewPatient) {
        const res = await createPatient(newPatientData);
        patientId = res.data._id || res.data.id;
      }
      // Use "fake UTC" convention: local display time encoded as UTC
      // (backend stores/validates all times this way)
      const scheduledAt = `${date}T${startTime}:00.000Z`;
      const start = new Date(`${date}T${startTime}:00.000Z`);
      const end = new Date(`${date}T${endTime}:00.000Z`);
      const duration = Math.max(10, Math.round((end - start) / 1000 / 60));

      await createAppointment({
        patient: patientId,
        doctor: doctorId,
        scheduledAt,
        duration,
        type,
        source,
        reason: reason || undefined,
        notes: notes || undefined,
        branch: branchId || undefined,
        reminderTimings: reminderTimings.length > 0 ? reminderTimings : undefined,
      });
      showToast({ type: 'success', message: 'Appointment created successfully' });
      onCreated?.();
      onClose();
    } catch (err) {
      setFormError(err.message || 'Failed to create appointment');
      showToast({ type: 'error', message: err.message || 'Failed to create appointment' });
    } finally {
      setSaving(false);
    }
  };

  const handleSlotClick = (slot) => {
    // Use slot's actual endTime instead of hardcoding 30 min (respects doctor's slotDuration)
    const endDate = new Date(slot.endTime);
    const endDisplay = `${String(endDate.getUTCHours()).padStart(2, '0')}:${String(endDate.getUTCMinutes()).padStart(2, '0')}`;
    setStartTime(slot.display);
    setEndTime(endDisplay);
  };

  return (
    <Modal open={open} onClose={onClose} title="New Appointment" wide>
      <div className="px-6 py-5">
        {/* Step Indicator */}
        <div className="flex items-center gap-2 mb-8">
          {STEPS.map((label, i) => {
            const isActive = i === step;
            const isCompleted = i < step;
            return (
              <div key={label} className="flex items-center gap-2 flex-1">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-all ${
                  isCompleted ? 'bg-secondary-600 text-white' :
                  isActive ? 'bg-primary-600 text-white' :
                  'bg-neutral-100 text-neutral-400'
                }`}>
                  {isCompleted ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
                </div>
                <span className={`text-xs font-medium hidden sm:block ${
                  isActive ? 'text-neutral-900' : isCompleted ? 'text-secondary-600' : 'text-neutral-400'
                }`}>{label}</span>
                {i < STEPS.length - 1 && (
                  <div className={`flex-1 h-px mx-1 ${isCompleted ? 'bg-secondary-300' : 'bg-neutral-200'}`} />
                )}
              </div>
            );
          })}
        </div>

        {formError && <div className="mb-4"><ErrorAlert message={formError} /></div>}

        {/* Step 1: Patient */}
        {step === 0 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-neutral-900">Select Patient</h3>
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={isNewPatient}
                  onChange={(e) => { setIsNewPatient(e.target.checked); setSelectedPatientId(''); }}
                  className="rounded border-neutral-300"
                />
                <span className="text-neutral-600">New Patient</span>
              </label>
            </div>

            {!isNewPatient ? (
              <>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
                  <input
                    type="text"
                    value={patientSearch}
                    onChange={(e) => setPatientSearch(e.target.value)}
                    placeholder="Search by name, phone, or ID..."
                    className={`${inputClasses} pl-10`}
                    autoFocus
                  />
                </div>
                <div className="max-h-52 overflow-y-auto space-y-1 border border-neutral-200 rounded-xl p-2">
                  {filteredPatients.length === 0 ? (
                    <p className="text-xs text-neutral-400 text-center py-4">No patients found</p>
                  ) : filteredPatients.map((p) => {
                    const pid = p._id || p.id;
                    const isSelected = selectedPatientId === pid;
                    return (
                      <button
                        key={pid}
                        onClick={() => setSelectedPatientId(pid)}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all ${
                          isSelected ? 'bg-primary-50 border border-primary-200' : 'hover:bg-neutral-50'
                        }`}
                      >
                        <div className="w-8 h-8 rounded-full bg-neutral-100 flex items-center justify-center shrink-0">
                          <User className="h-3.5 w-3.5 text-neutral-500" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-neutral-900 truncate">{p.name}</p>
                          <p className="text-[11px] text-neutral-400 truncate">
                            {p.phone || 'No phone'}
                          </p>
                        </div>
                        {isSelected && <CheckCircle2 className="h-4 w-4 text-primary-600 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 bg-neutral-50 rounded-xl border border-neutral-200">
                <div>
                  <label className={labelClasses}>Name *</label>
                  <input type="text" value={newPatientData.name} onChange={(e) => setNewPatientData({ ...newPatientData, name: e.target.value })} placeholder="Full name" className={inputClasses} />
                </div>
                <div>
                  <label className={labelClasses}>Phone *</label>
                  <input type="tel" value={newPatientData.phone} onChange={(e) => setNewPatientData({ ...newPatientData, phone: e.target.value })} placeholder="Phone number" className={inputClasses} />
                </div>
                <div>
                  <label className={labelClasses}>Email</label>
                  <input type="email" value={newPatientData.email} onChange={(e) => setNewPatientData({ ...newPatientData, email: e.target.value })} placeholder="Email" className={inputClasses} />
                </div>
                <div>
                  <label className={labelClasses}>Date of Birth</label>
                  <input type="date" value={newPatientData.dateOfBirth} onChange={(e) => setNewPatientData({ ...newPatientData, dateOfBirth: e.target.value })} className={inputClasses} />
                </div>
                <div>
                  <label className={labelClasses}>Gender</label>
                  <select value={newPatientData.gender} onChange={(e) => setNewPatientData({ ...newPatientData, gender: e.target.value })} className={`${inputClasses} cursor-pointer`}>
                    <option value="">Select...</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step 2: Schedule */}
        {step === 1 && (
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-neutral-900">Doctor & Schedule</h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={labelClasses}>Doctor *</label>
                <select value={doctorId} onChange={(e) => { setDoctorId(e.target.value); setDate(''); setStartTime(''); setEndTime(''); setDateSummary({}); }} className={`${inputClasses} cursor-pointer`} required>
                  <option value="">Select doctor...</option>
                  {doctors.map((d) => (
                    <option key={d._id || d.id} value={d._id || d.id}>
                      {/* stripDrPrefix first — some stored names already include the
                          title, which would otherwise render as "Dr. Dr. Name". */}
                      Dr. {stripDrPrefix(d.name)}{d.specialization ? ` — ${d.specialization}` : ''}
                    </option>
                  ))}
                </select>
              </div>
              {branches.length > 1 && (
                <div>
                  <label className={labelClasses}>Branch</label>
                  <select value={branchId} onChange={(e) => { setBranchId(e.target.value); setDate(''); setStartTime(''); setEndTime(''); setDateSummary({}); }} className={`${inputClasses} cursor-pointer`}>
                    <option value="">All branches</option>
                    {branches.map((b) => (
                      <option key={b._id || b.id} value={b._id || b.id}>{b.name}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Scheduling Policy */}
            {doctorId && (() => {
              const p = doctorPolicy || { slotDuration: 30, bufferMinutes: 0, minNoticeMinutes: 60, maxAdvanceDays: 60 };
              const noticeLabel = p.minNoticeMinutes >= 1440
                ? `${Math.round(p.minNoticeMinutes / 1440)} day(s)`
                : p.minNoticeMinutes >= 60
                  ? `${Math.round(p.minNoticeMinutes / 60)} hour(s)`
                  : `${p.minNoticeMinutes} minutes`;
              return (
                <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
                  <div className="flex items-center gap-2 mb-2.5">
                    <Info className="h-4 w-4 text-blue-600 shrink-0" />
                    <span className="text-xs font-semibold text-blue-800">Booking Policy</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2.5">
                    <div className="flex items-center gap-2">
                      <Timer className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                      <div>
                        <p className="text-xs font-medium text-blue-900">{p.slotDuration} min per slot</p>
                        <p className="text-[10px] text-blue-600">Appointment duration</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <CalendarClock className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                      <div>
                        <p className="text-xs font-medium text-blue-900">{noticeLabel} notice</p>
                        <p className="text-[10px] text-blue-600">Minimum advance booking</p>
                      </div>
                    </div>
                    {(p.bufferMinutes ?? 0) > 0 && (
                      <div className="flex items-center gap-2">
                        <Hourglass className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                        <div>
                          <p className="text-xs font-medium text-blue-900">{p.bufferMinutes} min buffer</p>
                          <p className="text-[10px] text-blue-600">Between appointments</p>
                        </div>
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <CalendarDays className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                      <div>
                        <p className="text-xs font-medium text-blue-900">Up to {p.maxAdvanceDays} days</p>
                        <p className="text-[10px] text-blue-600">Maximum advance booking</p>
                      </div>
                    </div>
                  </div>
                  <p className="text-[10px] text-blue-600 mt-2 pt-2 border-t border-blue-200">
                    Grayed-out slots are past the booking window or within the advance notice period.
                  </p>
                </div>
              );
            })()}

            {/* Inline Availability Calendar */}
            {doctorId && (() => {
              const daysInMonth = new Date(calYear, calMonth, 0).getDate();
              const firstDow = (new Date(calYear, calMonth - 1, 1).getDay() + 6) % 7; // Mon=0
              const pad2 = (n) => String(n).padStart(2, '0');
              const todayStr = new Date().toISOString().slice(0, 10);
              const statusColors = {
                available: 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 cursor-pointer border-emerald-200',
                few_left: 'bg-amber-50 text-amber-700 hover:bg-amber-100 cursor-pointer border-amber-200',
                fully_booked: 'bg-red-50 text-red-400 border-red-100',
                off: 'bg-neutral-50 text-neutral-300',
                leave: 'bg-neutral-50 text-neutral-300',
                past: 'bg-neutral-50 text-neutral-300',
                unavailable: 'bg-neutral-50 text-neutral-300',
              };
              const cells = [];
              for (let i = 0; i < firstDow; i++) cells.push(null);
              for (let d = 1; d <= daysInMonth; d++) cells.push(d);

              return (
                <div className="border border-neutral-200 rounded-xl p-3">
                  <div className="flex items-center justify-between mb-3">
                    <button type="button" onClick={() => { if (calMonth === 1) { setCalMonth(12); setCalYear(calYear - 1); } else setCalMonth(calMonth - 1); }} className="p-1 rounded-lg hover:bg-neutral-100 text-neutral-400 transition">
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <span className="text-sm font-semibold text-neutral-900">
                      {new Date(calYear, calMonth - 1).toLocaleString('default', { month: 'long', year: 'numeric' })}
                    </span>
                    <button type="button" onClick={() => { if (calMonth === 12) { setCalMonth(1); setCalYear(calYear + 1); } else setCalMonth(calMonth + 1); }} className="p-1 rounded-lg hover:bg-neutral-100 text-neutral-400 transition">
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="grid grid-cols-7 gap-1 text-center mb-1">
                    {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
                      <div key={d} className="text-[10px] font-semibold text-neutral-400 py-1">{d}</div>
                    ))}
                  </div>
                  <div className="grid grid-cols-7 gap-1">
                    {cells.map((day, i) => {
                      if (day === null) return <div key={`e-${i}`} />;
                      const dateStr = `${calYear}-${pad2(calMonth)}-${pad2(day)}`;
                      const status = dateSummary[dateStr] || 'unavailable';
                      const isClickable = status === 'available' || status === 'few_left';
                      const isSelected = date === dateStr;
                      const isToday = dateStr === todayStr;
                      return (
                        <button
                          key={dateStr}
                          type="button"
                          disabled={!isClickable}
                          onClick={() => { if (isClickable) { setDate(dateStr); setStartTime(''); setEndTime(''); } }}
                          className={`relative h-8 rounded-lg text-xs font-medium border transition-all ${
                            isSelected ? 'bg-primary-600 text-white border-primary-600 ring-2 ring-primary-200' :
                            statusColors[status] || statusColors.unavailable
                          } ${!isClickable ? 'cursor-default' : ''}`}
                        >
                          {day}
                          {isToday && !isSelected && <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-primary-500" />}
                        </button>
                      );
                    })}
                  </div>
                  <div className="flex gap-3 mt-2 pt-2 border-t border-neutral-100 text-[10px] text-neutral-400">
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-400" /> Available</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400" /> Few Left</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-300" /> Full</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-neutral-300" /> Off</span>
                  </div>
                </div>
              );
            })()}

            {/* Time Slots — grouped by period */}
            {doctorId && date && (
              <div>
                <label className={labelClasses}>Available Slots — {new Date(date + 'T00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}</label>
                {loadingSlots ? (
                  <div className="flex items-center gap-2 text-xs text-neutral-500 py-2">
                    <span className="w-3.5 h-3.5 border-2 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
                    Checking availability...
                  </div>
                ) : availableSlots.length === 0 ? (
                  <p className="text-xs text-neutral-400 py-2">No available slots. You can enter a custom time below.</p>
                ) : (
                  <div className="space-y-3">
                    {[
                      { key: 'morning', label: 'Morning', icon: Sun, slots: groupedSlots.morning },
                      { key: 'afternoon', label: 'Afternoon', icon: Sunset, slots: groupedSlots.afternoon },
                      { key: 'evening', label: 'Evening', icon: Moon, slots: groupedSlots.evening },
                    ].filter((g) => g.slots.length > 0).map((group) => (
                      <div key={group.key}>
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <group.icon className="h-3.5 w-3.5 text-neutral-400" />
                          <span className="text-[11px] font-medium text-neutral-500">{group.label} ({group.slots.length})</span>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {group.slots.map((slot) => {
                            const isSelected = startTime === slot.display;
                            return (
                              <button
                                key={slot.startTime}
                                type="button"
                                onClick={() => handleSlotClick(slot)}
                                className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-all ${
                                  isSelected
                                    ? 'bg-primary-50 border-primary-400 text-primary-700 ring-2 ring-primary-100'
                                    : 'border-neutral-200 text-neutral-600 hover:bg-neutral-50'
                                }`}
                              >
                                {slot.display}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClasses}>Start Time *</label>
                <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className={inputClasses} required />
              </div>
              <div>
                <label className={labelClasses}>End Time *</label>
                <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className={inputClasses} required />
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Details */}
        {step === 2 && (
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-neutral-900">Appointment Details</h3>

            {/* Type selector */}
            <div>
              <label className={labelClasses}>Type</label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {Object.entries(TYPE_CONFIG).map(([key, config]) => {
                  const isSelected = type === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setType(key)}
                      className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-xs font-medium transition-all ${
                        isSelected
                          ? 'bg-primary-50 border-primary-300 text-primary-700 ring-2 ring-primary-100'
                          : 'border-neutral-200 text-neutral-600 hover:bg-neutral-50'
                      }`}
                    >
                      <config.Icon className={`h-3.5 w-3.5 ${isSelected ? 'text-primary-600' : config.color}`} />
                      {config.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Source selector */}
            <div>
              <label className={labelClasses}>Source</label>
              <div className="flex flex-wrap gap-2">
                {Object.entries(SOURCE_STYLES).map(([key, style]) => {
                  const isSelected = source === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setSource(key)}
                      className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-all ${
                        isSelected
                          ? `${style.bg} ${style.text} border-current`
                          : 'border-neutral-200 text-neutral-500 hover:bg-neutral-50'
                      }`}
                    >
                      {style.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className={labelClasses}>Reason</label>
              <input type="text" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Chief complaint or reason for visit..." className={inputClasses} />
            </div>

            <div>
              <label className={labelClasses}>Notes</label>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Additional notes..." rows={2} className={`${inputClasses} resize-none`} />
            </div>

            {/* Reminder Timings */}
            <div>
              <label className={labelClasses}>
                <Bell className="h-3 w-3 inline mr-1 -mt-0.5" />
                Reminder Timings
              </label>
              <p className="text-[11px] text-neutral-400 mb-2">Select when to send reminders before the appointment</p>
              <div className="flex flex-wrap gap-2">
                {REMINDER_TIMING_OPTIONS.map((opt) => {
                  const isSelected = reminderTimings.includes(opt.value);
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => {
                        setReminderTimings((prev) =>
                          isSelected
                            ? prev.filter((v) => v !== opt.value)
                            : [...prev, opt.value].sort((a, b) => b - a)
                        );
                      }}
                      className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-all ${
                        isSelected
                          ? 'bg-primary-50 border-primary-300 text-primary-700 ring-2 ring-primary-100'
                          : 'border-neutral-200 text-neutral-500 hover:bg-neutral-50'
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
              {reminderTimings.length === 0 && (
                <p className="text-[11px] text-amber-600 mt-1">No reminders selected — patient won't be notified</p>
              )}
            </div>
          </div>
        )}

        {/* Step 4: Confirm */}
        {step === 3 && (
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-neutral-900">Confirm Appointment</h3>

            <div className="bg-neutral-50 rounded-xl border border-neutral-200 p-5 space-y-4">
              {/* Patient */}
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-primary-100 flex items-center justify-center">
                  <User className="h-4 w-4 text-primary-700" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-neutral-900">
                    {isNewPatient ? newPatientData.name : selectedPatient?.name || 'Unknown'}
                  </p>
                  <p className="text-[11px] text-neutral-400">
                    {isNewPatient ? newPatientData.phone : selectedPatient?.phone || ''}
                  </p>
                </div>
              </div>

              <div className="h-px bg-neutral-200" />

              {/* Doctor + Schedule */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-neutral-400 mb-0.5">Doctor</p>
                  <p className="text-neutral-900 font-medium">{selectedDoctor?.name || '—'}</p>
                  {selectedDoctor?.specialization && <p className="text-[11px] text-neutral-400">{selectedDoctor.specialization}</p>}
                </div>
                <div>
                  <p className="text-xs text-neutral-400 mb-0.5">Date</p>
                  <p className="text-neutral-900 font-medium">{date || '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-neutral-400 mb-0.5">Time</p>
                  <p className="text-neutral-900 font-medium">{startTime || '—'} – {endTime || '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-neutral-400 mb-0.5">Type</p>
                  <p className="text-neutral-900 font-medium capitalize">{(type || '').replace(/_/g, ' ')}</p>
                </div>
              </div>

              {(reason || notes || selectedBranch) && (
                <>
                  <div className="h-px bg-neutral-200" />
                  <div className="space-y-2 text-sm">
                    {selectedBranch && (
                      <div><span className="text-xs text-neutral-400">Branch:</span> <span className="text-neutral-700">{selectedBranch.name}</span></div>
                    )}
                    {reason && (
                      <div><span className="text-xs text-neutral-400">Reason:</span> <span className="text-neutral-700">{reason}</span></div>
                    )}
                    {notes && (
                      <div><span className="text-xs text-neutral-400">Notes:</span> <span className="text-neutral-700">{notes}</span></div>
                    )}
                  </div>
                </>
              )}

              {/* Reminder timings summary */}
              <div className="h-px bg-neutral-200" />
              <div>
                <p className="text-xs text-neutral-400 mb-1.5 flex items-center gap-1">
                  <Bell className="h-3 w-3" /> Reminders
                </p>
                {reminderTimings.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {reminderTimings
                      .sort((a, b) => b - a)
                      .map((t) => (
                        <span key={t} className="inline-flex text-xs px-2 py-0.5 rounded-full bg-primary-50 text-primary-700 font-medium">
                          {t === 0 ? 'Immediately' : `${formatTimingLabel(t)} before`}
                        </span>
                      ))}
                  </div>
                ) : (
                  <p className="text-xs text-amber-600">No reminders — patient won't be notified</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Navigation Footer */}
        <div className="flex items-center justify-between mt-8 pt-4 border-t border-neutral-200">
          {step > 0 ? (
            <button
              onClick={() => setStep(step - 1)}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-neutral-600 bg-neutral-100 rounded-xl hover:bg-neutral-200 transition"
            >
              <ChevronLeft className="h-4 w-4" /> Back
            </button>
          ) : (
            <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-neutral-600 bg-neutral-100 rounded-xl hover:bg-neutral-200 transition">
              Cancel
            </button>
          )}

          {step < 3 ? (
            <button
              onClick={() => setStep(step + 1)}
              disabled={!canProceed()}
              className="flex items-center gap-1.5 px-5 py-2 text-sm font-semibold text-white bg-primary-600 rounded-xl hover:bg-primary-700 transition shadow-sm disabled:opacity-40"
            >
              Next <ChevronRight className="h-4 w-4" />
            </button>
          ) : (
            <button
              onClick={handleCreate}
              disabled={saving}
              className="flex items-center gap-1.5 px-5 py-2 text-sm font-semibold text-white bg-primary-600 rounded-xl hover:bg-primary-700 transition shadow-sm disabled:opacity-50"
            >
              {saving ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4" /> Create Appointment
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
