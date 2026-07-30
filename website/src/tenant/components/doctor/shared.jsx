/**
 * Shared utilities, style constants, and micro-components for the Doctor Portal.
 * Design tokens aligned exactly with the admin/owner portal.
 */
import { Search, Inbox } from 'lucide-react';
import { TrendingUp, TrendingDown } from 'lucide-react';

// ─── Style constants (admin portal tokens) ──────────
export const cardCls =
  'bg-white rounded-2xl border border-neutral-200 shadow-[var(--shadow-sm)]';

export const cardHover =
  'hover:shadow-[var(--shadow-md)] hover:-translate-y-0.5 transition-all duration-200';

export const inputCls =
  'w-full px-3.5 py-2.5 border border-neutral-200 rounded-xl text-sm bg-white text-neutral-900 placeholder:text-neutral-400 focus:border-primary-300 focus:ring-2 focus:ring-primary-100 outline-none transition-all';

export const labelCls =
  'block text-xs font-semibold text-neutral-500 mb-1.5';

export const btnPrimary =
  'px-5 py-2.5 text-sm font-semibold text-white rounded-lg bg-primary-600 hover:bg-primary-700 shadow-[var(--shadow-sm)] transition-all disabled:opacity-50';

export const btnSecondary =
  'px-4 py-2.5 text-sm font-medium text-primary-700 bg-white border border-primary-200 rounded-lg hover:bg-primary-50 hover:border-primary-300 transition-all';

export const btnGhost =
  'px-4 py-2.5 text-sm font-medium text-neutral-600 bg-neutral-100 rounded-lg hover:bg-neutral-200 transition';

export const sectionHeader =
  'px-5 py-3.5 border-b border-neutral-100 bg-neutral-50/50';

export const tableHeader =
  'text-[11px] uppercase tracking-wider text-neutral-500 font-medium';

// ─── Helpers ────────────────────────────────────────

export { stripDrPrefix, formatDoctorName } from '../../../utils/doctorName';

export const formatCurrency = (v) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(v || 0);

export const formatTime = (d) => {
  if (!d) return '';
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return '--:--';
  const h = dt.getUTCHours();
  const m = dt.getUTCMinutes();
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${String(h12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${ampm}`;
};

export const formatDate = (d) => {
  if (!d) return '';
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return '';
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[dt.getUTCMonth()]} ${dt.getUTCDate()}`;
};

export const formatFullDate = (d) =>
  new Date(d).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

export const todayISO = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
};

export const todayEndISO = () => {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d.toISOString();
};

export const sixMonthsAgoISO = () => {
  const d = new Date();
  d.setMonth(d.getMonth() - 6);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
};

export function toISODate(d) {
  return d.toISOString().split('T')[0];
}

export function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

/** Unwrap a Promise.allSettled result safely */
export function unwrap(result) {
  if (result.status === 'fulfilled') {
    const v = result.value;
    return v?.data ?? v;
  }
  return null;
}

// ─── Appointment status styles ──────────────────────
export const APPT_STATUS = {
  requested:   { bg: 'bg-amber-50',    text: 'text-amber-700',   dot: 'bg-amber-500' },
  confirmed:   { bg: 'bg-yellow-50',   text: 'text-yellow-700',  dot: 'bg-yellow-500' },
  checked_in:  { bg: 'bg-blue-50',     text: 'text-blue-700',    dot: 'bg-blue-500' },
  in_progress: { bg: 'bg-purple-50',   text: 'text-purple-700',  dot: 'bg-purple-500' },
  completed:   { bg: 'bg-emerald-50',  text: 'text-emerald-700', dot: 'bg-emerald-500' },
  cancelled:   { bg: 'bg-red-50',      text: 'text-red-700',     dot: 'bg-red-500' },
  no_show:     { bg: 'bg-neutral-100', text: 'text-neutral-600', dot: 'bg-neutral-400' },
};

// ─── Micro-components ───────────────────────────────

/** Appointment status badge — consistent dot + label pill */
export function ApptBadge({ status }) {
  const s = APPT_STATUS[status] || { bg: 'bg-neutral-100', text: 'text-neutral-600', dot: 'bg-neutral-400' };
  return (
    <span className={`inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full font-medium capitalize ${s.bg} ${s.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {(status || 'N/A').replace(/_/g, ' ')}
    </span>
  );
}

/** Skeleton loader — pulse animation placeholders */
export function SkeletonLoader({ className = '', count = 1 }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className={`animate-pulse bg-neutral-100 rounded-xl ${className}`}
        />
      ))}
    </>
  );
}

/** Stat card matching admin portal StatCard exactly */
export function StatCard({ title, value, subtitle, icon: Icon, trend, color = 'primary', delay = 0 }) {
  const palette = {
    primary: { iconBg: 'bg-primary-50',   iconText: 'text-primary-600' },
    green:   { iconBg: 'bg-secondary-50',  iconText: 'text-secondary-600' },
    yellow:  { iconBg: 'bg-amber-50',      iconText: 'text-amber-600' },
    red:     { iconBg: 'bg-red-50',        iconText: 'text-red-600' },
    purple:  { iconBg: 'bg-purple-50',     iconText: 'text-purple-600' },
    blue:    { iconBg: 'bg-blue-50',       iconText: 'text-blue-600' },
  };
  const p = palette[color] || palette.primary;

  return (
    <div
      className={`${cardCls} ${cardHover} p-5 animate-[fadeUp_0.4s_ease-out_both]`}
      style={delay ? { animationDelay: `${delay}ms` } : undefined}
    >
      <div className="flex items-start justify-between mb-3">
        {Icon && (
          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${p.iconBg}`}>
            <Icon className={`h-6 w-6 ${p.iconText}`} />
          </div>
        )}
        {trend !== undefined && trend !== null && (
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${
            trend >= 0 ? 'bg-secondary-50 text-secondary-700' : 'bg-red-50 text-red-700'
          }`}>
            {trend >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {Math.abs(trend).toFixed(1)}%
          </span>
        )}
      </div>
      <p className="text-[28px] font-bold font-display text-neutral-900 leading-tight">{value}</p>
      <p className="text-xs font-medium text-neutral-500 mt-1">{title}</p>
      {subtitle && <p className="text-[11px] text-neutral-400 mt-0.5">{subtitle}</p>}
    </div>
  );
}

/** Stat card skeleton — matches admin portal loading state */
export function StatCardSkeleton() {
  return (
    <div className={`${cardCls} p-5`}>
      <div className="flex items-start justify-between mb-3">
        <SkeletonLoader className="w-12 h-12" />
      </div>
      <SkeletonLoader className="h-8 w-24 mb-2" />
      <SkeletonLoader className="h-3 w-32" />
    </div>
  );
}

/** Search input with magnifying glass icon */
export function SearchInput({ value, onChange, placeholder = 'Search...' }) {
  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`${inputCls} pl-10`}
      />
    </div>
  );
}

/** Empty state — centered icon + text */
export function EmptyState({ icon: Icon = Inbox, title, message }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-neutral-400">
      <div className="w-16 h-16 rounded-2xl bg-neutral-100 flex items-center justify-center mb-4">
        <Icon className="h-7 w-7" />
      </div>
      <p className="text-sm font-medium text-neutral-600">{title}</p>
      {message && <p className="text-xs text-neutral-400 mt-1">{message}</p>}
    </div>
  );
}

/** Generic badge pill */
export function Badge({ children, color = 'primary' }) {
  const colors = {
    primary: 'bg-primary-50 text-primary-700',
    green:   'bg-emerald-50 text-emerald-700',
    red:     'bg-red-50 text-red-700',
    purple:  'bg-purple-50 text-purple-700',
    amber:   'bg-amber-50 text-amber-700',
    blue:    'bg-blue-50 text-blue-700',
  };
  return (
    <span className={`inline-flex items-center text-[11px] px-2.5 py-1 rounded-full font-medium ${colors[color] || colors.primary}`}>
      {children}
    </span>
  );
}

/** Page header — consistent across all doctor pages */
export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 animate-[fadeUp_0.4s_ease-out_both]">
      <div>
        <h1 className="text-2xl font-semibold font-display text-neutral-900">{title}</h1>
        {subtitle && <p className="text-sm text-neutral-500 mt-1">{subtitle}</p>}
      </div>
      {actions && <div className="flex gap-3">{actions}</div>}
    </div>
  );
}

/** Filter pill — togglable chip for toolbars */
export function FilterPill({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`px-3.5 py-1.5 text-xs font-medium rounded-full border transition-all ${
        active
          ? 'bg-primary-600 text-white border-primary-600 shadow-sm'
          : 'bg-white text-neutral-600 border-neutral-200 hover:border-neutral-300 hover:bg-neutral-50'
      }`}
    >
      {label}
    </button>
  );
}

/** Tab bar matching admin portal tabs */
export function TabBar({ tabs, active, onChange }) {
  return (
    <div className="flex gap-1 border-b border-neutral-200">
      {tabs.map((tab) => {
        const key = typeof tab === 'string' ? tab : tab.key;
        const label = typeof tab === 'string' ? tab : tab.label;
        const isActive = active === key;
        return (
          <button
            key={key}
            onClick={() => onChange(key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              isActive
                ? 'border-primary-600 text-primary-600'
                : 'border-transparent text-neutral-400 hover:text-neutral-600 hover:border-neutral-300'
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

/** Stagger animation wrapper for grids */
export function StaggerItem({ index, children, className = '' }) {
  return (
    <div
      className={`animate-[fadeUp_0.4s_ease-out_both] ${className}`}
      style={{ animationDelay: `${50 + index * 50}ms` }}
    >
      {children}
    </div>
  );
}

// Tab content animation variants (for framer-motion if needed)
export const tabVariants = {
  enter: { opacity: 0, y: 8 },
  center: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
};
