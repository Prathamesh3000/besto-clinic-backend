import { createContext, useContext, useState, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle, XCircle, AlertTriangle, X } from 'lucide-react';

const ToastContext = createContext(null);

let toastId = 0;

const ICONS = {
  success: CheckCircle,
  error: XCircle,
  warning: AlertTriangle,
};

const COLORS = {
  success: 'bg-green-50 border-green-200 text-green-800',
  error: 'bg-red-50 border-red-200 text-red-800',
  warning: 'bg-amber-50 border-amber-200 text-amber-800',
};

const ICON_COLORS = {
  success: 'text-green-500',
  error: 'text-red-500',
  warning: 'text-amber-500',
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const showToast = useCallback(({ type = 'success', message, duration = 4000 }) => {
    const id = ++toastId;
    setToasts((prev) => [...prev, { id, type, message }]);
    if (duration > 0) {
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, duration);
    }
  }, []);

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none">
        <AnimatePresence>
          {toasts.map((toast) => {
            const Icon = ICONS[toast.type] || ICONS.success;
            return (
              <motion.div
                key={toast.id}
                initial={{ opacity: 0, x: 60, scale: 0.95 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: 60, scale: 0.95 }}
                transition={{ duration: 0.25, ease: 'easeOut' }}
                className={`pointer-events-auto flex items-start gap-3 px-4 py-3 rounded-xl border shadow-lg max-w-sm ${COLORS[toast.type] || COLORS.success}`}
              >
                <Icon className={`h-5 w-5 shrink-0 mt-0.5 ${ICON_COLORS[toast.type] || ICON_COLORS.success}`} />
                <p className="text-sm font-medium flex-1">{toast.message}</p>
                <button
                  onClick={() => dismiss(toast.id)}
                  className="shrink-0 p-0.5 rounded-md hover:bg-black/5 transition"
                >
                  <X className="h-4 w-4 opacity-50" />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within a ToastProvider');
  return ctx;
}
