import { useEffect } from 'react';
import { CheckCircle2, XCircle, AlertTriangle, Info, X } from 'lucide-react';

const VARIANTS = {
  success: { icon: CheckCircle2, bg: 'bg-emerald-50 border-emerald-200', text: 'text-emerald-800', iconColor: 'text-emerald-500' },
  error:   { icon: XCircle, bg: 'bg-red-50 border-red-200', text: 'text-red-800', iconColor: 'text-red-500' },
  warning: { icon: AlertTriangle, bg: 'bg-amber-50 border-amber-200', text: 'text-amber-800', iconColor: 'text-amber-500' },
  info:    { icon: Info, bg: 'bg-blue-50 border-blue-200', text: 'text-blue-800', iconColor: 'text-blue-500' },
};

/**
 * Inline toast notification for job portal pages.
 *
 * @param {{ type: 'success'|'error'|'warning'|'info', title: string, message?: string, onClose: () => void, duration?: number }} props
 */
export default function JobToast({ type = 'info', title, message, onClose, duration = 5000 }) {
  useEffect(() => {
    if (duration > 0) {
      const timer = setTimeout(onClose, duration);
      return () => clearTimeout(timer);
    }
  }, [duration, onClose]);

  const v = VARIANTS[type] || VARIANTS.info;
  const Icon = v.icon;

  return (
    <div className={`flex items-start gap-3 px-4 py-3 rounded-xl border ${v.bg} animate-in fade-in slide-in-from-top-2`}>
      <Icon className={`w-5 h-5 mt-0.5 shrink-0 ${v.iconColor}`} />
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-semibold ${v.text}`}>{title}</p>
        {message && <p className={`text-sm mt-0.5 ${v.text} opacity-80`}>{message}</p>}
      </div>
      <button onClick={onClose} className={`shrink-0 p-0.5 rounded-md hover:bg-black/5 ${v.text} opacity-50 hover:opacity-100 transition cursor-pointer`}>
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
