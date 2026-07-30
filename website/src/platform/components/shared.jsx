import { useState, useEffect, useRef, useCallback } from 'react';
import { X, ChevronUp, ChevronDown, Inbox, TrendingUp, TrendingDown } from 'lucide-react';

// ─── StatCard ─────────────────────────────────
export function StatCard({ title, value, subtitle, icon: Icon, trend, color = 'primary' }) {
  const palette = {
    primary:  { iconBg: 'bg-primary-50',   iconText: 'text-primary-600' },
    green:    { iconBg: 'bg-secondary-100', iconText: 'text-secondary-500' },
    yellow:   { iconBg: 'bg-amber-50',      iconText: 'text-amber-600' },
    red:      { iconBg: 'bg-red-50',        iconText: 'text-red-600' },
    purple:   { iconBg: 'bg-purple-50',     iconText: 'text-purple-600' },
    blue:     { iconBg: 'bg-blue-50',       iconText: 'text-blue-600' },
  };
  const p = palette[color] || palette.primary;

  return (
    <div className="bg-white rounded-2xl border border-neutral-200 p-5 shadow-[var(--shadow-sm)] hover:shadow-[var(--shadow-md)] hover:-translate-y-0.5 transition-all duration-200">
      <div className="flex items-start justify-between mb-4">
        {Icon && (
          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${p.iconBg}`}>
            <Icon className={`h-6 w-6 ${p.iconText}`} />
          </div>
        )}
        {trend !== undefined && trend !== null && (
          <div className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold ${
            trend >= 0 ? 'bg-secondary-100 text-secondary-600' : 'bg-red-50 text-red-700'
          }`}>
            {trend >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {Math.abs(trend)}%
          </div>
        )}
      </div>
      <p className="text-[28px] font-bold text-neutral-900 font-display leading-tight">{value}</p>
      <p className="text-xs text-neutral-500 mt-1 font-medium">{title}</p>
      {subtitle && <p className="text-[11px] text-neutral-400 mt-0.5">{subtitle}</p>}
    </div>
  );
}

// ─── Modal ────────────────────────────────────
export function Modal({ open, onClose, title, wide, children }) {
  const overlayRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-950/50 backdrop-blur-sm"
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
    >
      <div className={`bg-white rounded-[20px] shadow-[var(--shadow-xl)] w-full mx-4 max-h-[85vh] flex flex-col ${wide ? 'max-w-3xl' : 'max-w-lg'}`}>
        <div className="flex items-center justify-between px-6 py-5 border-b border-neutral-200">
          <h3 className="text-lg font-semibold font-display text-neutral-900">{title}</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-neutral-100 text-neutral-500 hover:text-neutral-700 transition">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="px-6 py-5 overflow-y-auto flex-1">{children}</div>
      </div>
    </div>
  );
}

// ─── Drawer (slide-in panel from right) ──────
export function Drawer({ open, onClose, title, wide, children }) {
  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handler);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-neutral-950/40 backdrop-blur-sm animate-[fadeIn_0.2s_ease-out]" onClick={onClose} />
      <div className={`relative bg-white shadow-[var(--shadow-xl)] flex flex-col animate-[slideInRight_0.25s_ease-out] w-full ${wide ? 'max-w-2xl' : 'max-w-md'}`}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-200 shrink-0">
          <h3 className="text-base font-bold font-display text-neutral-900">{title}</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-neutral-100 text-neutral-500 hover:text-neutral-700 transition">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">{children}</div>
      </div>
      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
    </div>
  );
}

// ─── StatusBadge ──────────────────────────────
const STATUS_STYLES = {
  active:       { bg: 'bg-secondary-50',  text: 'text-secondary-700', dot: 'bg-secondary-500' },
  trial:        { bg: 'bg-amber-50',      text: 'text-amber-700',     dot: 'bg-amber-500' },
  grace_period: { bg: 'bg-orange-50',     text: 'text-orange-700',    dot: 'bg-orange-500' },
  suspended:    { bg: 'bg-red-50',        text: 'text-red-700',       dot: 'bg-red-500' },
  cancelled:    { bg: 'bg-neutral-100',   text: 'text-neutral-600',   dot: 'bg-neutral-400' },
  past_due:     { bg: 'bg-orange-50',     text: 'text-orange-700',    dot: 'bg-orange-500' },
  expired:      { bg: 'bg-neutral-100',   text: 'text-neutral-500',   dot: 'bg-neutral-400' },
};

export function StatusBadge({ status }) {
  const s = STATUS_STYLES[status] || { bg: 'bg-neutral-100', text: 'text-neutral-600', dot: 'bg-neutral-400' };
  const label = (status || 'N/A').replace(/_/g, ' ');
  return (
    <span className={`inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full font-medium uppercase tracking-wide capitalize ${s.bg} ${s.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {label}
    </span>
  );
}

// ─── DataTable ────────────────────────────────
export function DataTable({ columns, data, onRowClick, sortKey, sortDir, onSort, highlightId }) {
  const highlightRef = useCallback((node) => {
    if (node) {
      requestAnimationFrame(() => {
        node.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    }
  }, []);

  return (
    <div className="overflow-x-auto bg-white rounded-2xl border border-neutral-200 shadow-[var(--shadow-sm)] overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-neutral-50/80 border-b border-neutral-200">
            {columns.map((col) => (
              <th
                key={col.key}
                className={`text-left px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wider ${col.sortable ? 'cursor-pointer select-none hover:text-neutral-700 transition-colors' : ''}`}
                onClick={() => col.sortable && onSort?.(col.key)}
              >
                <span className="flex items-center gap-1">
                  {col.label}
                  {col.sortable && sortKey === col.key && (
                    <span className="text-primary-600">
                      {sortDir === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    </span>
                  )}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => {
            const rowId = row._id || row.id;
            const isHighlighted = highlightId && rowId === highlightId;
            return (
              <tr
                key={rowId || i}
                ref={isHighlighted ? highlightRef : undefined}
                data-row-id={rowId || undefined}
                className={`border-b border-neutral-100 last:border-0 transition-colors duration-150 ${onRowClick ? 'cursor-pointer hover:bg-neutral-50/50' : ''}`}
                style={isHighlighted ? { animation: 'highlightPulse 0.8s ease-in-out 3, highlightFadeOut 0.6s ease-out 2.4s forwards' } : undefined}
                onClick={() => onRowClick?.(row)}
              >
                {columns.map((col) => (
                  <td key={col.key} className="px-4 py-3.5 text-neutral-700">
                    {col.render ? col.render(row) : row[col.key]}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── EmptyState ───────────────────────────────
export function EmptyState({ icon: Icon = Inbox, title = 'No data', message }) {
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

// ─── TabBar ───────────────────────────────────
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

// ─── ConfirmDialog ────────────────────────────
export function ConfirmDialog({ open, title, message, onConfirm, onCancel, danger, loading }) {
  if (!open) return null;
  return (
    <Modal open={open} onClose={onCancel} title={title || 'Confirm'}>
      <p className="text-sm text-neutral-600 mb-6">{message}</p>
      <div className="flex justify-end gap-3">
        <button
          onClick={onCancel}
          className="px-4 py-2 text-sm font-medium text-neutral-600 bg-neutral-100 rounded-lg hover:bg-neutral-200 transition"
        >
          Cancel
        </button>
        <button
          onClick={onConfirm}
          disabled={loading}
          className={`px-5 py-2 text-sm font-semibold text-white rounded-lg transition disabled:opacity-50 ${
            danger ? 'bg-red-600 hover:bg-red-700' : 'bg-primary-600 hover:bg-primary-700 shadow-sm'
          }`}
        >
          {loading ? 'Processing...' : 'Confirm'}
        </button>
      </div>
    </Modal>
  );
}

// ─── Pagination ───────────────────────────────
export function Pagination({ page, limit, total, onChange }) {
  const totalPages = Math.ceil(total / limit) || 1;
  return (
    <div className="flex items-center justify-between py-4">
      <p className="text-xs text-neutral-500">
        Showing <span className="font-medium text-neutral-700">{Math.min((page - 1) * limit + 1, total)}</span>–<span className="font-medium text-neutral-700">{Math.min(page * limit, total)}</span> of {total}
      </p>
      <div className="flex gap-1">
        <button
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
          className="px-3 py-1.5 text-xs font-medium rounded-lg border border-neutral-300 text-neutral-600 hover:bg-neutral-100 disabled:opacity-30 transition"
        >
          Prev
        </button>
        {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
          let p;
          if (totalPages <= 5) p = i + 1;
          else if (page <= 3) p = i + 1;
          else if (page >= totalPages - 2) p = totalPages - 4 + i;
          else p = page - 2 + i;
          return (
            <button
              key={p}
              onClick={() => onChange(p)}
              className={`w-8 h-8 text-xs font-medium rounded-lg border transition ${
                p === page
                  ? 'border-primary-600 bg-primary-600 text-white'
                  : 'border-neutral-300 text-neutral-600 hover:bg-neutral-100'
              }`}
            >
              {p}
            </button>
          );
        })}
        <button
          disabled={page >= totalPages}
          onClick={() => onChange(page + 1)}
          className="px-3 py-1.5 text-xs font-medium rounded-lg border border-neutral-300 text-neutral-600 hover:bg-neutral-100 disabled:opacity-30 transition"
        >
          Next
        </button>
      </div>
    </div>
  );
}

// ─── Spinner ──────────────────────────────────
export function Spinner() {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-3">
      <div className="relative w-10 h-10">
        <div className="absolute inset-0 rounded-full border-[3px] border-neutral-200" />
        <div className="absolute inset-0 rounded-full border-[3px] border-primary-600 border-t-transparent animate-spin" />
      </div>
      <p className="text-xs text-neutral-400 font-medium">Loading...</p>
    </div>
  );
}

// ─── ErrorAlert ───────────────────────────────
export function ErrorAlert({ message }) {
  return (
    <div className="flex items-center gap-3 bg-red-50 text-red-700 px-5 py-4 rounded-2xl text-sm border border-red-100">
      <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center shrink-0">
        <X className="w-4 h-4" />
      </div>
      <p>{message}</p>
    </div>
  );
}
