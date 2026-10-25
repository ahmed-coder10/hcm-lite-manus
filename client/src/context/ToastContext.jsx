import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';

const ToastContext = createContext(null);

const TONES = {
  success: { icon: CheckCircle2, ring: 'border-mint/30', text: 'text-mint', bg: 'bg-mint/10' },
  error: { icon: XCircle, ring: 'border-rose/30', text: 'text-rose', bg: 'bg-rose/10' },
  warning: { icon: AlertTriangle, ring: 'border-amber/30', text: 'text-amber', bg: 'bg-amber/10' },
  info: { icon: Info, ring: 'border-cyan/30', text: 'text-cyan', bg: 'bg-cyan/10' },
};

let idSeq = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    ({ title, description, tone = 'info', duration = 4200 }) => {
      const id = ++idSeq;
      setToasts((prev) => [...prev.slice(-3), { id, title, description, tone }]);
      if (duration) setTimeout(() => dismiss(id), duration);
      return id;
    },
    [dismiss],
  );

  const toast = useMemo(
    () => ({
      push,
      success: (title, description) => push({ title, description, tone: 'success' }),
      error: (title, description) => push({ title, description, tone: 'error' }),
      warning: (title, description) => push({ title, description, tone: 'warning' }),
      info: (title, description) => push({ title, description, tone: 'info' }),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="true"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[100] flex flex-col items-center gap-2 p-4 sm:items-end sm:p-6"
      >
        <AnimatePresence initial={false}>
          {toasts.map((t) => {
            const tone = TONES[t.tone] || TONES.info;
            const Icon = tone.icon;
            return (
              <motion.div
                key={t.id}
                layout
                initial={{ opacity: 0, y: 16, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.97 }}
                transition={{ duration: 0.22, ease: [0.2, 0.7, 0.3, 1] }}
                className={`pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border ${tone.ring} glass-strong p-3.5 shadow-card`}
                role="status"
              >
                <span className={`mt-0.5 rounded-lg ${tone.bg} p-1.5`}>
                  <Icon size={16} className={tone.text} aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-text">{t.title}</p>
                  {t.description ? <p className="mt-0.5 text-[13px] leading-snug text-text-muted">{t.description}</p> : null}
                </div>
                <button
                  type="button"
                  onClick={() => dismiss(t.id)}
                  aria-label="Dismiss notification"
                  className="rounded-md p-1 text-text-faint transition hover:bg-white/5 hover:text-text"
                >
                  <X size={14} />
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
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}
