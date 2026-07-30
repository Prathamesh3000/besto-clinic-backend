import { useState, useEffect, useCallback } from 'react';
import {
  Eye, Download, Share2, FileOutput, Clock, Shield,
  User, FileText, CalendarDays, Pill, CreditCard,
  ShieldCheck, HeartPulse, Sparkles, Star, Link2,
  ChevronDown, Plus, XCircle, CheckCircle2, RefreshCw,
  ArrowUpRight, Globe, UserCheck,
} from 'lucide-react';
import { getAccessLog } from '../api';
import { useSafePatientAuth } from '../../hooks/useSafeAuth';
import { Pagination } from '../../platform/components/shared';

/* ─── Design tokens ──────────────────────────────── */

const PAGE = 15;
const CARD = 'bg-white rounded-2xl border border-neutral-200 shadow-[var(--shadow-sm)]';

function Shimmer({ className = '' }) {
  return <div className={`animate-pulse bg-neutral-200/60 rounded-xl ${className}`} />;
}

/* ─── Formatters ─────────────────────────────────── */

const fmtDate = (d) => {
  const dt = new Date(d); const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${dt.getUTCDate()} ${months[dt.getUTCMonth()]} ${dt.getUTCFullYear()}`;
};

const fmtTime = (d) => {
  const dt = new Date(d); const h = dt.getUTCHours(); const m = dt.getUTCMinutes();
  return `${String(h % 12 || 12).padStart(2,'0')}:${String(m).padStart(2,'0')} ${h >= 12 ? 'PM' : 'AM'}`;
};

const fmtDateGroup = (d) => {
  const date = new Date(d);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.toDateString() === today.toDateString()) return 'Today';
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
};

/* ─── Config maps ────────────────────────────────── */

const ACCESS_TYPE = {
  view:     { label: 'Viewed',     icon: Eye,          bg: 'bg-blue-50',      text: 'text-blue-600',    dot: 'bg-blue-500' },
  download: { label: 'Downloaded', icon: Download,      bg: 'bg-emerald-50',   text: 'text-emerald-600', dot: 'bg-emerald-500' },
  share:    { label: 'Shared',     icon: Share2,        bg: 'bg-violet-50',    text: 'text-violet-600',  dot: 'bg-violet-500' },
  export:   { label: 'Exported',   icon: FileOutput,    bg: 'bg-amber-50',     text: 'text-amber-600',   dot: 'bg-amber-500' },
  create:   { label: 'Created',    icon: Plus,          bg: 'bg-secondary-50', text: 'text-secondary-600', dot: 'bg-secondary-500' },
  update:   { label: 'Updated',    icon: RefreshCw,     bg: 'bg-sky-50',       text: 'text-sky-600',     dot: 'bg-sky-500' },
  cancel:   { label: 'Cancelled',  icon: XCircle,       bg: 'bg-red-50',       text: 'text-red-500',     dot: 'bg-red-400' },
  revoke:   { label: 'Revoked',    icon: XCircle,       bg: 'bg-red-50',       text: 'text-red-500',     dot: 'bg-red-400' },
};

const RESOURCE = {
  profile:      { label: 'Profile',       icon: User,         bg: 'bg-blue-50',      clr: 'text-blue-600' },
  appointment:  { label: 'Appointment',   icon: CalendarDays,  bg: 'bg-primary-50',   clr: 'text-primary-600' },
  treatment:    { label: 'Treatment',     icon: HeartPulse,    bg: 'bg-rose-50',      clr: 'text-rose-600' },
  prescription: { label: 'Prescription',  icon: Pill,          bg: 'bg-emerald-50',   clr: 'text-emerald-600' },
  invoice:      { label: 'Invoice',       icon: CreditCard,    bg: 'bg-amber-50',     clr: 'text-amber-600' },
  consent:      { label: 'Consent',       icon: ShieldCheck,   bg: 'bg-violet-50',    clr: 'text-violet-600' },
  insurance:    { label: 'Insurance',     icon: FileText,      bg: 'bg-cyan-50',      clr: 'text-cyan-600' },
  review:       { label: 'Review',        icon: Star,          bg: 'bg-amber-50',     clr: 'text-amber-600' },
  share_token:  { label: 'Share Link',    icon: Link2,         bg: 'bg-violet-50',    clr: 'text-violet-600' },
};

const RESOURCE_KEYS = ['all', ...Object.keys(RESOURCE)];
const ACCESS_KEYS   = ['all', ...Object.keys(ACCESS_TYPE)];

/* ─── Helpers ────────────────────────────────────── */

/** Group items by date string for timeline view */
function groupByDate(items) {
  const groups = [];
  let currentKey = null;
  for (const item of items) {
    const key = new Date(item.createdAt).toDateString();
    if (key !== currentKey) {
      currentKey = key;
      groups.push({ dateLabel: fmtDateGroup(item.createdAt), items: [] });
    }
    groups[groups.length - 1].items.push(item);
  }
  return groups;
}

/** Build a human-readable sentence from entry data (fallback when description is empty) */
function buildFallbackDescription(entry) {
  const res = RESOURCE[entry.resource]?.label || entry.resource;
  const act = ACCESS_TYPE[entry.accessType]?.label || entry.accessType;
  return `${act} ${res.toLowerCase()} record`;
}

/* ═══════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════ */

export default function PatientActivityLog() {
  const { activePatientId } = useSafePatientAuth();

  /* ── State ── */
  const [items, setItems]     = useState([]);
  const [total, setTotal]     = useState(0);
  const [page, setPage]       = useState(1);
  const [loading, setLoading] = useState(true);

  const [resourceFilter, setResourceFilter] = useState('all');
  const [accessFilter, setAccessFilter]     = useState('all');

  /* ── Fetch ── */
  const fetchLog = useCallback(async () => {
    if (!activePatientId) return;
    setLoading(true);
    try {
      const params = { page, limit: PAGE, patientId: activePatientId };
      if (resourceFilter !== 'all') params.resource = resourceFilter;
      if (accessFilter !== 'all')   params.accessType = accessFilter;
      const res = await getAccessLog(activePatientId, params);
      const d = res.data || res;
      const list = Array.isArray(d) ? d : d.items || d.data || [];
      setItems(list);
      setTotal(d.total || d.meta?.total || list.length);
    } catch {
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [activePatientId, page, resourceFilter, accessFilter]);

  useEffect(() => { fetchLog(); }, [fetchLog]);
  useEffect(() => { setPage(1); }, [resourceFilter, accessFilter]);

  /* ═══ RENDER ═══ */

  if (loading && items.length === 0) {
    return (
      <div className="max-w-[1280px] mx-auto w-full space-y-6">
        <Shimmer className="h-10 w-56" />
        <Shimmer className="h-24 w-full" />
        <Shimmer className="h-64 w-full" />
      </div>
    );
  }

  /* Zero-data welcome */
  if (!loading && total === 0 && resourceFilter === 'all' && accessFilter === 'all') {
    return (
      <div className="max-w-[1280px] mx-auto w-full space-y-6">
        <div className="bg-gradient-to-br from-primary-600 to-primary-800 rounded-2xl p-8 md:p-10 text-white animate-[fadeUp_0.4s_ease-out_both]">
          <h1 className="text-2xl md:text-3xl font-bold font-display leading-tight">
            Activity Log
          </h1>
          <p className="text-primary-100 text-sm md:text-base mt-2 max-w-xl leading-relaxed">
            A complete audit trail of who accessed your health records.
            Every view, download, share and export is tracked here for your privacy.
          </p>
        </div>

        <div className={`${CARD} p-6 animate-[fadeUp_0.4s_ease-out_both]`} style={{ animationDelay: '100ms' }}>
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-neutral-100 flex items-center justify-center">
              <Sparkles className="h-5 w-5 text-neutral-600" />
            </div>
            <div>
              <h2 className="text-[15px] font-semibold font-display text-neutral-900">How activity tracking works</h2>
              <p className="text-xs text-neutral-500">Automatic, always-on privacy protection</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              {
                icon: Eye,
                iconBg: 'bg-blue-50', iconClr: 'text-blue-600',
                title: 'Every access recorded',
                desc: 'When a doctor, staff member, or system views your data, it is logged automatically.',
              },
              {
                icon: Shield,
                iconBg: 'bg-emerald-50', iconClr: 'text-emerald-600',
                title: 'Downloads & shares',
                desc: 'File downloads, PDF exports, and shared record accesses are all tracked separately.',
              },
              {
                icon: Clock,
                iconBg: 'bg-violet-50', iconClr: 'text-violet-600',
                title: 'Filter & search',
                desc: 'Filter by resource type and action to quickly find the events you are looking for.',
              },
            ].map((feat) => (
              <div key={feat.title} className="flex items-start gap-3 p-4 rounded-xl bg-neutral-50 border border-neutral-100">
                <div className={`w-10 h-10 rounded-xl ${feat.iconBg} flex items-center justify-center shrink-0`}>
                  <feat.icon className={`h-5 w-5 ${feat.iconClr}`} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-neutral-800">{feat.title}</p>
                  <p className="text-xs text-neutral-500 mt-0.5 leading-relaxed">{feat.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const dateGroups = groupByDate(items);
  const hasActiveFilters = resourceFilter !== 'all' || accessFilter !== 'all';

  /* ── Main data view ── */
  return (
    <div className="max-w-[1280px] mx-auto w-full space-y-6">

      {/* Header */}
      <div className="animate-[fadeUp_0.4s_ease-out_both]">
        <h1 className="text-2xl font-semibold font-display text-neutral-900">Activity Log</h1>
        <p className="text-sm text-neutral-600 mt-1">
          Complete audit trail — every view, action, and access to your health records
        </p>
      </div>

      {/* Category summary cards */}
      <div
        className="grid grid-cols-3 sm:grid-cols-5 gap-2 sm:gap-3 animate-[fadeUp_0.4s_ease-out_both]"
        style={{ animationDelay: '100ms' }}
      >
        {[
          { key: 'appointment', label: 'Appointments' },
          { key: 'treatment',   label: 'Treatments' },
          { key: 'prescription', label: 'Prescriptions' },
          { key: 'invoice',     label: 'Invoices' },
          { key: 'consent',     label: 'Consents' },
        ].map(({ key, label }) => {
          const cfg = RESOURCE[key];
          const Icon = cfg.icon;
          const isActive = resourceFilter === key;
          return (
            <button
              key={key}
              onClick={() => setResourceFilter(isActive ? 'all' : key)}
              className={`${CARD} p-3 flex flex-col items-center gap-1.5 transition-all ${
                isActive ? 'ring-2 ring-primary-400 bg-primary-50/50' : 'hover:bg-neutral-50'
              }`}
            >
              <div className={`w-9 h-9 rounded-lg ${cfg.bg} flex items-center justify-center`}>
                <Icon className={`h-4 w-4 ${cfg.clr}`} />
              </div>
              <p className={`text-[10px] font-medium ${isActive ? 'text-primary-700' : 'text-neutral-500'}`}>{label}</p>
            </button>
          );
        })}
      </div>

      {/* Filters + Timeline */}
      <div
        className={`${CARD} p-5 animate-[fadeUp_0.4s_ease-out_both]`}
        style={{ animationDelay: '200ms' }}
      >
        {/* Header + Filters */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-neutral-100 flex items-center justify-center">
              <Clock className="h-5 w-5 text-neutral-600" />
            </div>
            <div>
              <h2 className="text-[15px] font-semibold font-display text-neutral-900">Timeline</h2>
              <p className="text-xs text-neutral-500">{total} event{total !== 1 ? 's' : ''}{hasActiveFilters ? ' (filtered)' : ''}</p>
            </div>
          </div>

          <div className="flex gap-2">
            <FilterPill
              label="Resource"
              value={resourceFilter}
              options={RESOURCE_KEYS}
              optionLabel={(k) => k === 'all' ? 'All Resources' : RESOURCE[k]?.label || k}
              onChange={setResourceFilter}
            />
            <FilterPill
              label="Action"
              value={accessFilter}
              options={ACCESS_KEYS}
              optionLabel={(k) => k === 'all' ? 'All Actions' : ACCESS_TYPE[k]?.label || k}
              onChange={setAccessFilter}
            />
            {hasActiveFilters && (
              <button
                onClick={() => { setResourceFilter('all'); setAccessFilter('all'); }}
                className="text-[11px] font-medium px-2.5 py-1.5 rounded-lg text-red-500 hover:bg-red-50 transition-colors"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Timeline list */}
        {loading ? (
          <div className="space-y-3">
            <Shimmer className="h-20 w-full" />
            <Shimmer className="h-20 w-full" />
            <Shimmer className="h-20 w-full" />
          </div>
        ) : items.length === 0 ? (
          <EmptyState msg="No matching events" />
        ) : (
          <div className="space-y-5">
            {dateGroups.map((group) => (
              <div key={group.dateLabel}>
                {/* Date header */}
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wide">
                    {group.dateLabel}
                  </span>
                  <div className="flex-1 h-px bg-neutral-100" />
                  <span className="text-[10px] text-neutral-300 tabular-nums">
                    {group.items.length} event{group.items.length !== 1 ? 's' : ''}
                  </span>
                </div>

                {/* Events in this date group */}
                <div className="space-y-1.5 relative">
                  {/* Vertical timeline line */}
                  <div className="absolute left-[19px] top-3 bottom-3 w-px bg-neutral-100 hidden sm:block" />

                  {group.items.map((entry, idx) => (
                    <LogRow key={entry._id || idx} entry={entry} />
                  ))}
                </div>
              </div>
            ))}

            {total > PAGE && (
              <div className="pt-3">
                <Pagination page={page} limit={PAGE} total={total} onChange={setPage} />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Sub-components ──────────────────────────────── */

function LogRow({ entry }) {
  const res  = RESOURCE[entry.resource] || RESOURCE.profile;
  const act  = ACCESS_TYPE[entry.accessType] || ACCESS_TYPE.view;
  const ResIcon = res.icon;
  const actor = entry.accessedBy;
  const meta = entry.metadata || {};
  const description = entry.description || buildFallbackDescription(entry);

  const isExternal = !actor && entry.shareToken;

  return (
    <div className="flex gap-3 p-3 rounded-xl bg-neutral-50 border border-neutral-100 hover:bg-neutral-100/50 hover:border-neutral-200 transition-colors relative">
      {/* Resource icon with timeline dot */}
      <div className="relative z-10">
        <div className={`w-10 h-10 rounded-xl ${res.bg} flex items-center justify-center shrink-0`}>
          <ResIcon className={`h-[18px] w-[18px] ${res.clr}`} />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Top row: description + badges */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[13px] font-medium text-neutral-800 leading-snug">
              {description}
            </p>

            {/* Actor line */}
            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
              {isExternal ? (
                <span className="text-[11px] text-neutral-500 flex items-center gap-1">
                  <Globe className="h-3 w-3 text-neutral-400" />
                  External viewer
                  {entry.ipAddress && <span className="text-neutral-300 ml-1">({entry.ipAddress})</span>}
                </span>
              ) : actor?.name ? (
                <span className="text-[11px] text-neutral-500 flex items-center gap-1">
                  <UserCheck className="h-3 w-3 text-neutral-400" />
                  <span className="font-medium text-neutral-600">{actor.name}</span>
                  <span className="text-neutral-300">({actor.role?.replace(/_/g, ' ')})</span>
                </span>
              ) : (
                <span className="text-[11px] text-neutral-400 flex items-center gap-1">
                  <User className="h-3 w-3" /> You
                </span>
              )}
            </div>

            {/* Metadata tags */}
            <MetadataTags entry={entry} meta={meta} />
          </div>

          {/* Right: timestamp + action badge */}
          <div className="flex flex-col items-end gap-1.5 shrink-0">
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-0.5 ${act.bg} ${act.text}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${act.dot}`} />
              {act.label}
            </span>
            <span className="text-[11px] font-medium text-neutral-500 tabular-nums">{fmtTime(entry.createdAt)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Render contextual metadata tags below the description */
function MetadataTags({ entry, meta }) {
  const tags = [];

  // Appointment-specific
  if (entry.resource === 'appointment') {
    if (meta.appointmentType) tags.push({ label: meta.appointmentType.replace(/_/g, ' '), bg: 'bg-primary-50 text-primary-600' });
    if (meta.scheduledAt) tags.push({ label: fmtDate(meta.scheduledAt), bg: 'bg-neutral-100 text-neutral-500' });
    if (meta.confirmationStatus) tags.push({
      label: meta.confirmationStatus === 'confirmed' ? 'Confirmed' : 'Declined',
      bg: meta.confirmationStatus === 'confirmed' ? 'bg-secondary-50 text-secondary-600' : 'bg-red-50 text-red-500',
    });
    if (meta.reason) tags.push({ label: `Reason: ${meta.reason.slice(0, 40)}${meta.reason.length > 40 ? '...' : ''}`, bg: 'bg-neutral-100 text-neutral-500' });
    if (meta.previousDate && meta.newDate) {
      tags.push({ label: `${fmtDate(meta.previousDate)} → ${fmtDate(meta.newDate)}`, bg: 'bg-sky-50 text-sky-600' });
    }
  }

  // Treatment-specific
  if (entry.resource === 'treatment' && meta.totalRecords != null) {
    tags.push({ label: `${meta.totalRecords} records`, bg: 'bg-neutral-100 text-neutral-500' });
  }

  // Prescription-specific
  if (entry.resource === 'prescription' && meta.totalRecords != null) {
    tags.push({ label: `${meta.totalRecords} prescriptions`, bg: 'bg-neutral-100 text-neutral-500' });
  }

  // Invoice-specific
  if (entry.resource === 'invoice') {
    if (meta.totalRecords != null) tags.push({ label: `${meta.totalRecords} invoices`, bg: 'bg-neutral-100 text-neutral-500' });
    if (meta.statusFilter) tags.push({ label: `Status: ${meta.statusFilter}`, bg: 'bg-amber-50 text-amber-600' });
  }

  // Consent-specific
  if (entry.resource === 'consent') {
    if (meta.consentType) tags.push({ label: meta.consentType.replace(/_/g, ' '), bg: 'bg-violet-50 text-violet-600' });
    if (meta.scope) tags.push({ label: meta.scope, bg: 'bg-neutral-100 text-neutral-500' });
  }

  // Share token specific
  if (entry.resource === 'share_token') {
    if (meta.recordType) tags.push({ label: meta.recordType, bg: 'bg-violet-50 text-violet-600' });
    if (meta.sharedWith) tags.push({ label: `To: ${meta.sharedWith}`, bg: 'bg-neutral-100 text-neutral-500' });
    if (meta.expiresInHours) tags.push({ label: `${meta.expiresInHours}h expiry`, bg: 'bg-neutral-100 text-neutral-500' });
    if (meta.accessCount != null) tags.push({ label: `${meta.accessCount}/${meta.maxAccesses} views`, bg: 'bg-blue-50 text-blue-600' });
  }

  // Review specific
  if (entry.resource === 'review') {
    if (meta.rating) tags.push({ label: `${'★'.repeat(meta.rating)}${'☆'.repeat(5 - meta.rating)}`, bg: 'bg-amber-50 text-amber-600' });
    if (meta.isAnonymous) tags.push({ label: 'Anonymous', bg: 'bg-neutral-100 text-neutral-500' });
  }

  // Profile specific
  if (entry.resource === 'profile' && meta.updatedFields?.length) {
    tags.push({ label: meta.updatedFields.join(', '), bg: 'bg-blue-50 text-blue-600' });
  }

  // Insurance specific
  if (entry.resource === 'insurance' && meta.fileName) {
    tags.push({ label: meta.fileName, bg: 'bg-cyan-50 text-cyan-600' });
  }

  if (tags.length === 0) return null;

  return (
    <div className="flex items-center gap-1 mt-1.5 flex-wrap">
      {tags.map((tag, i) => (
        <span key={i} className={`text-[10px] font-medium px-1.5 py-0.5 rounded-md ${tag.bg}`}>
          {tag.label}
        </span>
      ))}
    </div>
  );
}

/* ─── Filter dropdown (compact pill) ──────────────── */

function FilterPill({ label, value, options, optionLabel, onChange }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`text-[11px] font-medium px-3 py-1.5 rounded-lg border transition-all flex items-center gap-1.5 ${
          value !== 'all'
            ? 'bg-primary-50 border-primary-200 text-primary-700'
            : 'bg-white border-neutral-200 text-neutral-600 hover:border-neutral-300'
        }`}
      >
        {value !== 'all' ? optionLabel(value) : label}
        <ChevronDown className={`h-3 w-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-50 w-48 bg-white rounded-xl border border-neutral-200 shadow-[var(--shadow-lg)] overflow-hidden max-h-64 overflow-y-auto">
            {options.map((opt) => {
              const cfg = opt !== 'all' ? RESOURCE[opt] || ACCESS_TYPE[opt] : null;
              const Icon = cfg?.icon;
              return (
                <button
                  key={opt}
                  onClick={() => { onChange(opt); setOpen(false); }}
                  className={`w-full text-left text-xs px-3 py-2 transition-colors flex items-center gap-2 ${
                    value === opt
                      ? 'bg-primary-50 text-primary-700 font-medium'
                      : 'text-neutral-600 hover:bg-neutral-50'
                  }`}
                >
                  {Icon && <Icon className="h-3.5 w-3.5 text-neutral-400 shrink-0" />}
                  {optionLabel(opt)}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function EmptyState({ msg }) {
  return (
    <div className="py-10 flex flex-col items-center gap-3">
      <div className="w-14 h-14 rounded-2xl bg-neutral-50 flex items-center justify-center">
        <Eye className="h-6 w-6 text-neutral-300" />
      </div>
      <p className="text-sm font-medium text-neutral-500">{msg}</p>
    </div>
  );
}
