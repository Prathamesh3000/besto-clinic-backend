import { AlertTriangle, Trash2, X } from 'lucide-react';
import { createPortal } from 'react-dom';

const VARIANTS = {
  danger: {
    icon: Trash2,
    iconBg: 'bg-red-100',
    iconColor: 'text-red-600',
    confirmBtn: 'bg-red-600 hover:bg-red-700 focus:ring-red-200',
  },
  warning: {
    icon: AlertTriangle,
    iconBg: 'bg-amber-100',
    iconColor: 'text-amber-600',
    confirmBtn: 'bg-amber-600 hover:bg-amber-700 focus:ring-amber-200',
  },
};

/**
 * Custom confirm dialog for destructive / important actions.
 *
 * @param {{ open, onClose, onConfirm, variant, title, message, confirmLabel, cancelLabel, loading }} props
 */
export default function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  variant = 'danger',
  title = 'Are you sure?',
  message = '',
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  loading = false,
}) {
  if (!open) return null;

  const v = VARIANTS[variant] || VARIANTS.danger;
  const Icon = v.icon;

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* Dialog */}
      <div className="relative bg-white rounded-2xl shadow-xl border border-neutral-200 w-full max-w-md p-6 animate-in fade-in zoom-in-95">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1 rounded-lg text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Icon */}
        <div className={`w-12 h-12 rounded-xl ${v.iconBg} flex items-center justify-center mb-4`}>
          <Icon className={`w-6 h-6 ${v.iconColor}`} />
        </div>

        {/* Content */}
        <h3 className="text-lg font-semibold text-neutral-900">{title}</h3>
        {message && <p className="text-sm text-neutral-500 mt-2 leading-relaxed">{message}</p>}

        {/* Actions */}
        <div className="flex items-center gap-3 mt-6">
          <button
            onClick={onClose}
            disabled={loading}
            className="flex-1 px-4 py-2.5 text-sm font-medium text-neutral-700 bg-neutral-100 rounded-xl hover:bg-neutral-200 transition disabled:opacity-50 cursor-pointer"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className={`flex-1 px-4 py-2.5 text-sm font-medium text-white rounded-xl transition focus:ring-2 disabled:opacity-50 cursor-pointer ${v.confirmBtn}`}
          >
            {loading ? 'Please wait...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
