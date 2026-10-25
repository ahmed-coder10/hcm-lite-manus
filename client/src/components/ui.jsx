import { forwardRef, useEffect, useId, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertCircle, ChevronDown, X } from 'lucide-react';
import { initials, initialsColor } from '../lib/format';

/** Merge class names (tiny clsx). */
export const cn = (...parts) => parts.filter(Boolean).join(' ');

/* --------------------------------- Button --------------------------------- */

const VARIANTS = {
  primary:
    'bg-[#5B3EE8] text-white hover:bg-[#6B4EF5] shadow-[0_10px_30px_-12px_rgba(91,62,232,0.9)] border border-white/10',
  light: 'bg-white text-ink-950 hover:bg-white/90 border border-white/0',
  secondary: 'glass text-text hover:border-white/20 hover:bg-white/[0.06]',
  ghost: 'text-text-muted hover:text-text hover:bg-white/[0.06] border border-transparent',
  danger: 'bg-rose/12 text-rose border border-rose/30 hover:bg-rose/20',
  success: 'bg-mint/12 text-mint border border-mint/30 hover:bg-mint/20',
  outline: 'border border-white/15 text-text hover:bg-white/[0.05]',
};

const SIZES = {
  sm: 'h-9 px-3 text-[13px] gap-1.5 rounded-lg',
  md: 'h-11 px-4 text-sm gap-2 rounded-xl',
  lg: 'h-12 px-6 text-[15px] gap-2.5 rounded-xl',
  icon: 'h-9 w-9 rounded-lg justify-center',
};

export const Button = forwardRef(function Button(
  { as: Tag = 'button', variant = 'primary', size = 'md', loading = false, className, children, icon: Icon, disabled, ...props },
  ref,
) {
  const isDisabled = disabled || loading;
  return (
    <Tag
      ref={ref}
      disabled={Tag === 'button' ? isDisabled : undefined}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex select-none items-center justify-center font-medium transition-all duration-200',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'active:translate-y-px',
        VARIANTS[variant] || VARIANTS.primary,
        SIZES[size] || SIZES.md,
        className,
      )}
      {...props}
    >
      {loading ? (
        <span
          className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
          aria-hidden="true"
        />
      ) : Icon ? (
        <Icon size={size === 'sm' ? 15 : 17} aria-hidden="true" className="shrink-0" />
      ) : null}
      {children}
    </Tag>
  );
});

export const IconButton = forwardRef(function IconButton({ label, icon: Icon, variant = 'ghost', size = 'icon', className, ...props }, ref) {
  return (
    <Button ref={ref} variant={variant} size={size} aria-label={label} title={label} className={className} {...props}>
      <Icon size={16} aria-hidden="true" />
    </Button>
  );
});

/* ---------------------------------- Card ---------------------------------- */

export function Card({ className, children, hover = false, as: Tag = 'div', ...props }) {
  return (
    <Tag className={cn('card', hover && 'card-hover', className)} {...props}>
      {children}
    </Tag>
  );
}

export function CardHeader({ title, subtitle, action, icon: Icon, className }) {
  return (
    <div className={cn('flex items-start justify-between gap-3 border-b border-white/[0.06] px-5 py-4', className)}>
      <div className="flex items-start gap-3">
        {Icon ? (
          <span className="mt-0.5 rounded-lg border border-white/10 bg-white/[0.04] p-1.5 text-violet-soft">
            <Icon size={15} aria-hidden="true" />
          </span>
        ) : null}
        <div>
          <h3 className="font-display text-[15px] font-semibold text-text">{title}</h3>
          {subtitle ? <p className="mt-0.5 text-[13px] text-text-muted">{subtitle}</p> : null}
        </div>
      </div>
      {action}
    </div>
  );
}

/* ---------------------------------- Badge --------------------------------- */

const TONES = {
  violet: 'bg-violet/12 text-violet-soft border-violet/25',
  cyan: 'bg-cyan/12 text-cyan-soft border-cyan/25',
  mint: 'bg-mint/12 text-mint border-mint/25',
  amber: 'bg-amber/12 text-amber border-amber/25',
  rose: 'bg-rose/12 text-rose border-rose/25',
  faint: 'bg-white/[0.04] text-text-faint border-white/10',
  neutral: 'bg-white/[0.06] text-text-muted border-white/12',
};

export function Badge({ tone = 'neutral', children, className, dot = false }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11.5px] font-medium leading-5',
        TONES[tone] || TONES.neutral,
        className,
      )}
    >
      {dot ? <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" /> : null}
      {children}
    </span>
  );
}

/* --------------------------------- Avatar --------------------------------- */

export function Avatar({ name = '', size = 36, className, src }) {
  const bg = initialsColor(name);
  return (
    <span
      className={cn('inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-display font-semibold text-ink-950', className)}
      style={{ width: size, height: size, background: bg, fontSize: size * 0.36 }}
      aria-hidden="true"
    >
      {src ? <img src={src} alt="" className="h-full w-full object-cover" /> : initials(name)}
    </span>
  );
}

/* --------------------------------- Fields --------------------------------- */

export const Input = forwardRef(function Input({ className, invalid, ...props }, ref) {
  return (
    <input
      ref={ref}
      className={cn(
        'h-11 w-full rounded-xl border bg-ink-900/60 px-3.5 text-sm text-text placeholder:text-text-faint',
        'transition focus:border-violet/60 focus:bg-ink-900 focus:outline-none',
        invalid ? 'border-rose/60' : 'border-white/10 hover:border-white/20',
        'disabled:opacity-50',
        className,
      )}
      aria-invalid={invalid || undefined}
      {...props}
    />
  );
});

export const Textarea = forwardRef(function Textarea({ className, invalid, rows = 4, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      rows={rows}
      className={cn(
        'w-full rounded-xl border bg-ink-900/60 px-3.5 py-2.5 text-sm text-text placeholder:text-text-faint',
        'transition focus:border-violet/60 focus:bg-ink-900 focus:outline-none',
        invalid ? 'border-rose/60' : 'border-white/10 hover:border-white/20',
        className,
      )}
      aria-invalid={invalid || undefined}
      {...props}
    />
  );
});

export const Select = forwardRef(function Select({ className, invalid, children, ...props }, ref) {
  return (
    <div className="relative">
      <select
        ref={ref}
        className={cn(
          'h-11 w-full appearance-none rounded-xl border bg-ink-900/60 px-3.5 pr-9 text-sm text-text',
          'transition focus:border-violet/60 focus:outline-none',
          invalid ? 'border-rose/60' : 'border-white/10 hover:border-white/20',
          className,
        )}
        aria-invalid={invalid || undefined}
        {...props}
      >
        {children}
      </select>
      <ChevronDown size={15} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-text-faint" aria-hidden="true" />
    </div>
  );
});

/**
 * Label + input + hint/error. Always renders a real <label> (never
 * placeholder-only fields) and links the error with aria-describedby.
 */
export function Field({ label, error, hint, children, id, required, className }) {
  const autoId = useId();
  const fieldId = id || `field-${autoId}`;
  const describedBy = error ? `${fieldId}-error` : hint ? `${fieldId}-hint` : undefined;
  const child = typeof children === 'function'
    ? children({ id: fieldId, invalid: Boolean(error), 'aria-describedby': describedBy })
    : children;

  return (
    <div className={cn('space-y-1.5', className)}>
      <label htmlFor={fieldId} className="flex items-center gap-1 text-[12.5px] font-medium text-text-muted">
        {label}
        {required ? <span className="text-rose" aria-hidden="true">*</span> : null}
      </label>
      {child}
      {error ? (
        <p id={`${fieldId}-error`} className="flex items-center gap-1.5 text-[12.5px] text-rose">
          <AlertCircle size={13} aria-hidden="true" />
          {error}
        </p>
      ) : hint ? (
        <p id={`${fieldId}-hint`} className="text-[12.5px] text-text-faint">{hint}</p>
      ) : null}
    </div>
  );
}

/* ---------------------------------- Modal --------------------------------- */

export function Modal({ open, onClose, title, description, children, footer, size = 'md' }) {
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    const t = setTimeout(() => {
      const focusable = ref.current?.querySelector('input,textarea,select,button');
      focusable?.focus();
    }, 60);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      clearTimeout(t);
    };
  }, [open, onClose]);

  const widths = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' };

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-[90] flex items-end justify-center p-0 sm:items-center sm:p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
        >
          <div className="absolute inset-0 bg-ink-950/80 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
          <motion.div
            ref={ref}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            initial={{ opacity: 0, y: 24, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.99 }}
            transition={{ duration: 0.24, ease: [0.2, 0.7, 0.3, 1] }}
            className={cn(
              'relative z-10 flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl sm:rounded-2xl',
              'glass-strong shadow-card',
              widths[size] || widths.md,
            )}
          >
            <div className="flex items-start justify-between gap-4 border-b border-white/[0.07] px-5 py-4">
              <div>
                <h2 className="font-display text-base font-semibold text-text">{title}</h2>
                {description ? <p className="mt-1 text-[13px] text-text-muted">{description}</p> : null}
              </div>
              <IconButton label="Close dialog" icon={X} onClick={onClose} />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
            {footer ? <div className="flex items-center justify-end gap-2 border-t border-white/[0.07] px-5 py-3.5">{footer}</div> : null}
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

export function ConfirmDialog({ open, onClose, onConfirm, title, description, confirmLabel = 'Confirm', tone = 'danger', loading }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant={tone} loading={loading} onClick={onConfirm}>{confirmLabel}</Button>
        </>
      }
    >
      <p className="text-sm text-text-muted">This action is recorded in the audit log.</p>
    </Modal>
  );
}

/* -------------------------------- Feedback -------------------------------- */

export function Spinner({ size = 18, className }) {
  return (
    <span
      className={cn('inline-block animate-spin rounded-full border-2 border-current border-t-transparent', className)}
      style={{ width: size, height: size }}
      aria-hidden="true"
    />
  );
}

export function Skeleton({ className }) {
  return <div className={cn('skeleton rounded-lg', className)} aria-hidden="true" />;
}

export function EmptyState({ icon: Icon, title, description, action, className }) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-3 px-6 py-14 text-center', className)}>
      {Icon ? (
        <span className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-text-faint">
          <Icon size={22} aria-hidden="true" />
        </span>
      ) : null}
      <div>
        <p className="font-display text-sm font-semibold text-text">{title}</p>
        {description ? <p className="mx-auto mt-1 max-w-sm text-[13px] leading-relaxed text-text-muted">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function ErrorState({ message, onRetry }) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-12 text-center" role="alert">
      <span className="rounded-2xl border border-rose/25 bg-rose/10 p-3 text-rose">
        <AlertCircle size={20} aria-hidden="true" />
      </span>
      <p className="max-w-sm text-sm text-text-muted">{message || 'Something went wrong while loading this data.'}</p>
      {onRetry ? <Button variant="secondary" size="sm" onClick={onRetry}>Try again</Button> : null}
    </div>
  );
}

/* --------------------------------- Stats ---------------------------------- */

export function StatCard({ label, value, hint, icon: Icon, tone = 'violet', delta, className }) {
  const tones = {
    violet: 'text-violet-soft bg-violet/10 border-violet/20',
    cyan: 'text-cyan-soft bg-cyan/10 border-cyan/20',
    mint: 'text-mint bg-mint/10 border-mint/20',
    amber: 'text-amber bg-amber/10 border-amber/20',
    rose: 'text-rose bg-rose/10 border-rose/20',
  };
  return (
    <Card className={cn('p-4', className)} hover>
      <div className="flex items-start justify-between gap-3">
        <p className="text-[12.5px] font-medium text-text-muted">{label}</p>
        {Icon ? (
          <span className={cn('rounded-lg border p-1.5', tones[tone] || tones.violet)}>
            <Icon size={14} aria-hidden="true" />
          </span>
        ) : null}
      </div>
      <p className="mt-2 font-display text-2xl font-semibold tracking-tight text-text">{value}</p>
      <div className="mt-1 flex items-center gap-2">
        {delta ? <span className="text-[12px] text-text-faint">{delta}</span> : null}
        {hint ? <span className="text-[12px] text-text-faint">{hint}</span> : null}
      </div>
    </Card>
  );
}

/* -------------------------------- Page bits -------------------------------- */

export function PageHeader({ eyebrow, title, description, actions, children }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow ? <p className="label-mono mb-2">{eyebrow}</p> : null}
        <h1 className="font-display text-2xl font-semibold tracking-tight text-text sm:text-[28px]">{title}</h1>
        {description ? <p className="mt-1.5 max-w-2xl text-sm text-text-muted">{description}</p> : null}
        {children}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function Tabs({ tabs, value, onChange, className }) {
  return (
    <div className={cn('inline-flex items-center gap-1 rounded-xl border border-white/10 bg-white/[0.03] p-1', className)} role="tablist">
      {tabs.map((tab) => {
        const active = tab.value === value;
        return (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab.value)}
            className={cn(
              'relative rounded-lg px-3 py-1.5 text-[13px] font-medium transition',
              active ? 'bg-white/[0.09] text-text' : 'text-text-muted hover:text-text',
            )}
          >
            {tab.label}
            {tab.count != null ? (
              <span className="ml-1.5 rounded-full bg-white/10 px-1.5 py-0.5 text-[10.5px] text-text-muted">{tab.count}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export function Progress({ value = 0, tone = 'violet', className, label }) {
  const tones = {
    violet: 'from-violet to-cyan',
    mint: 'from-mint to-cyan',
    amber: 'from-amber to-rose',
    rose: 'from-rose to-violet',
  };
  return (
    <div className={className}>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.07]" role="progressbar" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100} aria-label={label || 'Progress'}>
        <div
          className={cn('h-full rounded-full bg-gradient-to-r transition-[width] duration-500', tones[tone] || tones.violet)}
          style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
        />
      </div>
    </div>
  );
}

/* --------------------------------- Table ---------------------------------- */

export function Table({ children, className, caption }) {
  return (
    <div className="w-full overflow-x-auto">
      <table className={cn('w-full min-w-[640px] border-collapse text-left text-sm', className)}>
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        {children}
      </table>
    </div>
  );
}

export const Th = ({ children, className, ...props }) => (
  <th
    scope="col"
    className={cn('whitespace-nowrap border-b border-white/[0.07] px-4 py-2.5 text-[11.5px] font-medium uppercase tracking-[0.08em] text-text-faint', className)}
    {...props}
  >
    {children}
  </th>
);

export const Td = ({ children, className, ...props }) => (
  <td className={cn('border-b border-white/[0.04] px-4 py-3 align-middle text-[13.5px] text-text-muted', className)} {...props}>
    {children}
  </td>
);

export const Tr = ({ children, className, ...props }) => (
  <tr className={cn('transition-colors hover:bg-white/[0.025]', className)} {...props}>
    {children}
  </tr>
);
