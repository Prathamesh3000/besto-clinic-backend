import { useState, useEffect, useCallback, useMemo } from 'react';
import { listHolidays, createHoliday, updateHoliday, deleteHoliday, listBranches } from '../api';
import { useTenantAuth } from '../TenantAuthContext';
import { Modal, ConfirmDialog, ErrorAlert, Spinner } from '../../platform/components/shared';
import {
  btnPrimary, btnGhost, inputCls, labelCls, PageHeader,
} from '../components/doctor/shared';
import {
  Plus, Pencil, Trash2, CalendarX2, ChevronLeft, ChevronRight,
  Building2, RotateCcw, Info,
} from 'lucide-react';

// ─── Constants ──────────────────────────────────────
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const PILL_COLORS = [
  { bg: 'bg-red-100',     text: 'text-red-700',     hover: 'hover:bg-red-200' },
  { bg: 'bg-amber-100',   text: 'text-amber-700',   hover: 'hover:bg-amber-200' },
  { bg: 'bg-emerald-100', text: 'text-emerald-700', hover: 'hover:bg-emerald-200' },
  { bg: 'bg-blue-100',    text: 'text-blue-700',    hover: 'hover:bg-blue-200' },
  { bg: 'bg-purple-100',  text: 'text-purple-700',  hover: 'hover:bg-purple-200' },
  { bg: 'bg-pink-100',    text: 'text-pink-700',    hover: 'hover:bg-pink-200' },
];

function getPillColor(name) {
  let hash = 0;
  for (let i = 0; i < (name || '').length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return PILL_COLORS[Math.abs(hash) % PILL_COLORS.length];
}

const INITIAL_FORM = {
  name: '',
  startDate: '',
  endDate: '',
  branches: [],
  isRecurring: false,
  notes: '',
};

function formatDateShort(date) {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}

// ═══════════════════════════════════════════════════════
export default function HolidayCalendar() {
  const { hasPermission } = useTenantAuth();
  const canCreate = hasPermission('holiday:create');
  const canUpdate = hasPermission('holiday:update');
  const canDelete = hasPermission('holiday:delete');

  // ─── Calendar state ────────────────────────────
  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());

  // ─── Data ──────────────────────────────────────
  const [holidays, setHolidays] = useState([]);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // ─── Modal state ───────────────────────────────
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(INITIAL_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);

  // ─── Confirm dialog state ──────────────────────
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // ─── Fetch holidays ───────────────────────────
  const fetchHolidays = useCallback(() => {
    setLoading(true);
    setError(null);
    listHolidays({ year: viewYear, limit: 100 })
      .then((res) => {
        const data = Array.isArray(res.data) ? res.data : res.data?.items || [];
        setHolidays(data);
      })
      .catch((err) => setError(err.message || 'Failed to load holidays'))
      .finally(() => setLoading(false));
  }, [viewYear]);

  useEffect(() => { fetchHolidays(); }, [fetchHolidays]);

  // ─── Fetch branches once ──────────────────────
  useEffect(() => {
    listBranches({ limit: 100, status: 'active' })
      .then((res) => {
        const data = Array.isArray(res.data) ? res.data : res.data?.items || [];
        setBranches(data);
      })
      .catch(() => {});
  }, []);

  // ─── Calendar grid (Monday-first, consistent with other calendars) ──
  const calendarDays = useMemo(() => {
    const firstDay = new Date(viewYear, viewMonth, 1);
    const lastDay = new Date(viewYear, viewMonth + 1, 0);
    // getDay(): 0=Sun. We want Mon=0. Adjust: (getDay() + 6) % 7
    const startPad = (firstDay.getDay() + 6) % 7;
    const totalDays = lastDay.getDate();

    const days = [];
    // Padding days from previous month
    for (let i = startPad - 1; i >= 0; i--) {
      const d = new Date(viewYear, viewMonth, -i);
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      days.push({ date: dateStr, day: d.getDate(), isCurrentMonth: false });
    }
    for (let d = 1; d <= totalDays; d++) {
      const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      days.push({ date: dateStr, day: d, isCurrentMonth: true });
    }
    // Pad to complete last row (multiple of 7)
    while (days.length % 7 !== 0) {
      const d = new Date(viewYear, viewMonth + 1, days.length - startPad - totalDays + 1);
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      days.push({ date: dateStr, day: d.getDate(), isCurrentMonth: false });
    }
    return days;
  }, [viewYear, viewMonth]);

  // ─── Map holidays to dates ────────────────────
  const holidaysByDate = useMemo(() => {
    const map = {};
    for (const h of holidays) {
      const start = new Date(h.startDate);
      const end = new Date(h.endDate);
      const cursor = new Date(start);
      cursor.setHours(0, 0, 0, 0);
      const endNorm = new Date(end);
      endNorm.setHours(23, 59, 59, 999);

      while (cursor <= endNorm) {
        const dateStr = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`;
        if (!map[dateStr]) map[dateStr] = [];
        map[dateStr].push(h);
        cursor.setDate(cursor.getDate() + 1);
      }
    }
    return map;
  }, [holidays]);

  // ─── Handlers ─────────────────────────────────
  const openCreate = (dateStr) => {
    setEditing(null);
    setForm({ ...INITIAL_FORM, startDate: dateStr || '', endDate: dateStr || '' });
    setFormError(null);
    setModalOpen(true);
  };

  const openEdit = (holiday) => {
    setEditing(holiday);
    setForm({
      name: holiday.name,
      startDate: new Date(holiday.startDate).toISOString().slice(0, 10),
      endDate: new Date(holiday.endDate).toISOString().slice(0, 10),
      branches: (holiday.branches || []).map((b) => (typeof b === 'object' ? b._id : b)),
      isRecurring: holiday.isRecurring || false,
      notes: holiday.notes || '',
    });
    setFormError(null);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditing(null);
    setForm(INITIAL_FORM);
    setFormError(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      if (!form.name.trim()) { setFormError('Holiday name is required'); setSaving(false); return; }
      if (!form.startDate || !form.endDate) { setFormError('Start and end dates are required'); setSaving(false); return; }

      const payload = {
        name: form.name.trim(),
        startDate: new Date(form.startDate).toISOString(),
        endDate: new Date(form.endDate).toISOString(),
        branches: form.branches,
        isRecurring: form.isRecurring,
        notes: form.notes?.trim() || '',
      };

      if (editing) await updateHoliday(editing._id, payload);
      else await createHoliday(payload);

      closeModal();
      fetchHolidays();
    } catch (err) {
      setFormError(err.message || 'Failed to save holiday');
    } finally {
      setSaving(false);
    }
  };

  const openDeleteConfirm = (holiday) => {
    setDeleteTarget(holiday);
    setConfirmOpen(true);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try {
      await deleteHoliday(deleteTarget._id);
      setConfirmOpen(false);
      setDeleteTarget(null);
      fetchHolidays();
    } catch (err) {
      setError(err.message || 'Failed to delete holiday');
    } finally {
      setDeleteLoading(false);
    }
  };

  const navMonth = (dir) => {
    let m = viewMonth + dir;
    let y = viewYear;
    if (m < 0) { m = 11; y--; }
    if (m > 11) { m = 0; y++; }
    setViewMonth(m);
    setViewYear(y);
  };

  const goToday = () => {
    setViewYear(now.getFullYear());
    setViewMonth(now.getMonth());
  };

  // ─── Upcoming holidays ───────────────────────
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  const upcoming = useMemo(() => {
    return holidays
      .filter((h) => new Date(h.endDate).toISOString().slice(0, 10) >= todayStr)
      .sort((a, b) => new Date(a.startDate) - new Date(b.startDate))
      .slice(0, 10);
  }, [holidays, todayStr]);

  // ═══════════════════════════════════════════════
  return (
    <div className="max-w-[1280px] mx-auto w-full h-[calc(100vh-7rem)] flex flex-col">

      {/* ── Page Header + inline month nav ───────── */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 animate-[fadeUp_0.4s_ease-out_both]">
        <div>
          <h1 className="text-2xl font-semibold font-display text-neutral-900">Holiday Calendar</h1>
          <p className="text-sm text-neutral-500 mt-1">Manage clinic-wide holidays and closures that block all bookings</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Month nav */}
          <div className="flex items-center gap-1 bg-neutral-100 rounded-lg p-1">
            <button onClick={() => navMonth(-1)} className="p-1.5 rounded-md hover:bg-white text-neutral-500 hover:text-neutral-700 transition">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-sm font-semibold text-neutral-700 w-36 text-center select-none">
              {MONTHS[viewMonth]} {viewYear}
            </span>
            <button onClick={() => navMonth(1)} className="p-1.5 rounded-md hover:bg-white text-neutral-500 hover:text-neutral-700 transition">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <button onClick={goToday} className="px-3 py-1.5 text-xs font-semibold text-primary-600 bg-primary-50 hover:bg-primary-100 rounded-lg transition">
            Today
          </button>
          {canCreate && (
            <button onClick={() => openCreate('')} className={`${btnPrimary} flex items-center gap-2`}>
              <Plus className="h-4 w-4" /> Add Holiday
            </button>
          )}
        </div>
      </div>

      {/* ── Error ────────────────────────────────── */}
      {error && <div className="mt-4"><ErrorAlert message={error} /></div>}

      {/* ── Content — NO card wrappers ──────────── */}
      <div className="flex gap-5 flex-1 min-h-0 mt-5 animate-[fadeUp_0.4s_ease-out_both]" style={{ animationDelay: '100ms' }}>

        {/* ── Calendar Grid (borderless white) ──── */}
        <div className="flex-1 flex flex-col overflow-hidden min-w-0 bg-white rounded-xl">
          {/* Day headers */}
          <div className="grid grid-cols-7">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
              <div key={d} className="text-center text-[11px] font-semibold text-neutral-400 uppercase tracking-wider py-2.5">
                {d}
              </div>
            ))}
          </div>

          {/* Calendar body */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <Spinner />
            ) : (
              <div className="grid grid-cols-7 auto-rows-fr min-h-full">
                {calendarDays.map(({ date, day, isCurrentMonth }, idx) => {
                  const dayHolidays = holidaysByDate[date] || [];
                  const isToday = date === todayStr;
                  const isPast = date < todayStr;
                  // Mon-first: Sat=index 5, Sun=index 6
                  const isWeekend = idx % 7 === 5 || idx % 7 === 6;

                  return (
                    <div
                      key={`${date}-${idx}`}
                      className={`border-t border-neutral-100/50 p-1.5 min-h-[90px] transition-colors group ${
                        !isCurrentMonth ? 'opacity-30' :
                        isPast ? 'opacity-40' : 'hover:bg-primary-50/20'
                      } ${isToday && isCurrentMonth ? 'bg-primary-50/30' : ''} ${
                        isWeekend && !isToday && isCurrentMonth ? 'bg-neutral-50/40' : ''
                      }`}
                      onClick={() => canCreate && isCurrentMonth && !isPast && openCreate(date)}
                      role={canCreate && isCurrentMonth && !isPast ? 'button' : undefined}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className={`text-xs leading-none ${
                          isToday
                            ? 'bg-primary-600 text-white w-6 h-6 rounded-full flex items-center justify-center font-bold'
                            : `font-medium ${isPast ? 'text-neutral-400' : 'text-neutral-600'}`
                        }`}>
                          {day}
                        </span>
                        {dayHolidays.length > 0 && !isToday && (
                          <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                        )}
                      </div>
                      {dayHolidays.slice(0, 2).map((h) => {
                        const pill = getPillColor(h.name);
                        return (
                          <div
                            key={h._id}
                            onClick={(e) => { e.stopPropagation(); if (canUpdate) openEdit(h); }}
                            className={`mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium truncate cursor-pointer transition ${pill.bg} ${pill.text} ${pill.hover}`}
                            title={h.name}
                          >
                            {h.name}
                          </div>
                        );
                      })}
                      {dayHolidays.length > 2 && (
                        <div className="text-[10px] text-neutral-400 mt-0.5 px-1.5">
                          +{dayHolidays.length - 2} more
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── Right Panel (open, no card box) ──── */}
        <div className="w-72 shrink-0 flex flex-col min-h-0 space-y-5">

          {/* Upcoming Holidays */}
          <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-red-50 flex items-center justify-center">
                  <CalendarX2 className="h-3 w-3 text-red-500" />
                </div>
                Upcoming
              </h3>
              {upcoming.length > 0 && (
                <span className="text-[10px] font-bold text-neutral-400 bg-neutral-100 px-2 py-0.5 rounded-full">
                  {upcoming.length}
                </span>
              )}
            </div>

            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="flex items-center justify-center h-32">
                  <div className="relative w-6 h-6">
                    <div className="absolute inset-0 rounded-full border-2 border-neutral-200" />
                    <div className="absolute inset-0 rounded-full border-2 border-primary-600 border-t-transparent animate-spin" />
                  </div>
                </div>
              ) : upcoming.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-neutral-400">
                  <CalendarX2 className="h-8 w-8 text-neutral-200 mb-2" />
                  <p className="text-xs font-medium text-neutral-500">No upcoming holidays</p>
                  <p className="text-[10px] text-neutral-400 mt-0.5">All clear for now</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {upcoming.map((h) => {
                    const start = new Date(h.startDate);
                    const end = new Date(h.endDate);
                    const isSingle = start.toISOString().slice(0, 10) === end.toISOString().slice(0, 10);
                    const branchNames = (h.branches || []).map((b) => (typeof b === 'object' ? b.name : b));
                    const pill = getPillColor(h.name);
                    const isActive = todayStr >= start.toISOString().slice(0, 10) && todayStr <= end.toISOString().slice(0, 10);

                    return (
                      <div key={h._id} className={`px-3 py-3 rounded-lg hover:bg-white transition group ${isActive ? 'bg-red-50/40' : ''}`}>
                        <div className="flex items-start justify-between">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className={`w-2 h-2 rounded-full shrink-0 ${pill.bg.replace('100', '400')}`} />
                              <p className="text-sm font-semibold text-neutral-800 truncate">{h.name}</p>
                            </div>
                            <p className="text-[11px] text-neutral-500 mt-1 ml-4">
                              {isSingle ? formatDateShort(start) : `${formatDateShort(start)} – ${formatDateShort(end)}`}
                            </p>
                            <div className="flex items-center gap-1.5 mt-1.5 ml-4 flex-wrap">
                              {branchNames.length === 0 ? (
                                <span className="inline-flex items-center gap-1 text-[10px] text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded-md font-medium">
                                  <Building2 className="h-2.5 w-2.5" /> All branches
                                </span>
                              ) : (
                                branchNames.slice(0, 2).map((name, i) => (
                                  <span key={i} className="text-[10px] text-neutral-500 bg-neutral-100 px-1.5 py-0.5 rounded-md">
                                    {name}
                                  </span>
                                ))
                              )}
                              {branchNames.length > 2 && (
                                <span className="text-[10px] text-neutral-400">+{branchNames.length - 2}</span>
                              )}
                              {h.isRecurring && (
                                <span className="inline-flex items-center gap-0.5 text-[10px] text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded-md font-medium">
                                  <RotateCcw className="h-2.5 w-2.5" /> Yearly
                                </span>
                              )}
                              {isActive && (
                                <span className="inline-flex items-center text-[10px] text-red-600 bg-red-50 px-1.5 py-0.5 rounded-md font-semibold">
                                  Today
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition shrink-0 ml-2">
                            {canUpdate && (
                              <button onClick={() => openEdit(h)} className="p-1.5 rounded-lg hover:bg-neutral-100 text-neutral-400 hover:text-primary-600 transition">
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                            )}
                            {canDelete && (
                              <button onClick={() => openDeleteConfirm(h)} className="p-1.5 rounded-lg hover:bg-red-50 text-neutral-400 hover:text-red-600 transition">
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Info note */}
          <div className="flex items-start gap-2 text-[11px] text-neutral-400 px-2">
            <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <span>Holidays block all appointment bookings for affected branches.</span>
          </div>
        </div>
      </div>

      {/* ── Create/Edit Modal ────────────────────── */}
      <Modal open={modalOpen} onClose={closeModal} title={editing ? 'Edit Holiday' : 'Add Holiday'} wide>
        <form onSubmit={handleSubmit} className="space-y-5">
          {formError && <ErrorAlert message={formError} />}

          <div>
            <label className={labelCls}>Holiday Name *</label>
            <input
              required
              className={inputCls}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Diwali, Christmas, National Holiday"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Start Date *</label>
              <input
                type="date"
                required
                className={inputCls}
                value={form.startDate}
                onChange={(e) => setForm({ ...form, startDate: e.target.value, endDate: form.endDate < e.target.value ? e.target.value : form.endDate })}
              />
            </div>
            <div>
              <label className={labelCls}>End Date *</label>
              <input
                type="date"
                required
                className={inputCls}
                value={form.endDate}
                min={form.startDate}
                onChange={(e) => setForm({ ...form, endDate: e.target.value })}
              />
            </div>
          </div>

          <div>
            <label className={labelCls}>Affected Branches</label>
            <p className="text-[11px] text-neutral-400 mb-2">Leave empty to apply to all branches</p>
            <div className="flex flex-wrap gap-2">
              {branches.map((b) => {
                const isSelected = form.branches.includes(b._id);
                return (
                  <button
                    key={b._id}
                    type="button"
                    onClick={() =>
                      setForm({
                        ...form,
                        branches: isSelected
                          ? form.branches.filter((id) => id !== b._id)
                          : [...form.branches, b._id],
                      })
                    }
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                      isSelected
                        ? 'bg-primary-50 border-primary-300 text-primary-700'
                        : 'bg-white border-neutral-200 text-neutral-600 hover:border-neutral-300'
                    }`}
                  >
                    {b.name}
                  </button>
                );
              })}
              {branches.length === 0 && (
                <span className="text-xs text-neutral-400">No branches available</span>
              )}
            </div>
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.isRecurring}
              onChange={(e) => setForm({ ...form, isRecurring: e.target.checked })}
              className="rounded border-neutral-300 text-primary-600 focus:ring-primary-500"
            />
            <span className="text-sm text-neutral-700">Recurring yearly</span>
          </label>

          <div>
            <label className={labelCls}>Notes</label>
            <textarea
              className={`${inputCls} resize-none`}
              rows={2}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Optional notes about this holiday"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={closeModal} className={btnGhost}>Cancel</button>
            <button type="submit" disabled={saving} className={btnPrimary}>
              {saving ? 'Saving...' : editing ? 'Update Holiday' : 'Create Holiday'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ── Delete Confirm ─────────────────────────── */}
      <ConfirmDialog
        open={confirmOpen}
        title="Delete Holiday"
        message={`Are you sure you want to delete "${deleteTarget?.name || ''}"? Bookings that were blocked by this holiday will become available again.`}
        danger
        loading={deleteLoading}
        onConfirm={handleDelete}
        onCancel={() => { setConfirmOpen(false); setDeleteTarget(null); }}
      />
    </div>
  );
}
