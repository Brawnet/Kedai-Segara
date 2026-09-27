import type { ComponentChildren, JSX } from 'preact';
import { useEffect, useId, useRef } from 'preact/hooks';
import { CircleNotch, Info, Warning, WarningOctagon, X } from '@phosphor-icons/react';
import { useApp } from '../lib/app';

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

/* ---------- Button ---------- */
type Variant = 'primary' | 'success' | 'danger' | 'secondary' | 'ghost' | 'danger-ghost';
const V: Record<Variant, string> = {
  primary: 'bg-primary text-white hover:bg-primary-hover border-transparent',
  success: 'bg-success text-white hover:bg-success-hover border-transparent',
  danger: 'bg-danger text-white hover:bg-danger-hover border-transparent',
  secondary: 'bg-card text-fg border-line hover:border-line-strong hover:bg-muted',
  ghost: 'bg-transparent text-fg border-transparent hover:bg-muted',
  'danger-ghost': 'bg-transparent text-danger border-transparent hover:bg-danger-soft',
};
const SZ = { sm: 'min-h-11 px-3 text-sm', md: 'min-h-11 px-4 text-[15px]', lg: 'min-h-14 px-6 text-base' };

type BtnProps = Omit<JSX.ButtonHTMLAttributes<HTMLButtonElement>, 'size' | 'type' | 'disabled'> & {
  variant?: Variant;
  size?: keyof typeof SZ;
  /** Nonaktif otomatis saat ada aksi server berjalan. */
  guard?: boolean;
  loading?: boolean;
  disabled?: boolean;
  type?: 'button' | 'submit';
};

export function Button({ variant = 'secondary', size = 'md', guard, loading, disabled, class: c, children, type = 'button', ...p }: BtnProps) {
  const { busy } = useApp();
  const off = disabled || loading || (guard && busy);
  return (
    <button
      {...p}
      type={type}
      disabled={off}
      class={cx(
        'inline-flex select-none items-center justify-center gap-2 rounded-ctl border font-semibold transition-colors duration-150 disabled:opacity-50',
        V[variant],
        SZ[size],
        c as string,
      )}
    >
      {loading || (guard && busy) ? <CircleNotch class="animate-spin" size={18} aria-hidden /> : null}
      {children}
    </button>
  );
}

/* ---------- Form ---------- */
const ctl =
  'w-full min-h-11 rounded-ctl border border-line-strong bg-card px-3 py-2 text-fg placeholder:text-muted-fg/80 transition-colors duration-150 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/25 disabled:bg-muted aria-[invalid=true]:border-danger';

export function Field({
  label,
  hint,
  error,
  children,
  class: c,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: (id: string, describedBy?: string) => ComponentChildren;
  class?: string;
}) {
  const id = useId();
  const dId = hint || error ? id + '-d' : undefined;
  return (
    <div class={cx('flex flex-col gap-1.5', c)}>
      <label for={id} class="text-sm font-semibold text-fg">
        {label}
      </label>
      {children(id, dId)}
      {(error || hint) && (
        <p id={dId} class={cx('text-[13px]', error ? 'font-semibold text-danger' : 'text-muted-fg')}>
          {error || hint}
        </p>
      )}
    </div>
  );
}

export const Input = ({ class: c, ...p }: JSX.InputHTMLAttributes<HTMLInputElement>) => <input {...p} class={cx(ctl, c as string)} />;
export const Select = ({ class: c, ...p }: JSX.SelectHTMLAttributes<HTMLSelectElement>) => (
  <select {...p} class={cx(ctl, 'pr-8', c as string)} />
);

/* ---------- Layout bits ---------- */
export const Card = ({ class: c, children }: { class?: string; children: ComponentChildren }) => (
  <div class={cx('rounded-card border border-line bg-card shadow-sm', c)}>{children}</div>
);

export function PageTitle({ kicker, title, sub, actions }: { kicker?: string; title: string; sub?: ComponentChildren; actions?: ComponentChildren }) {
  return (
    <div class="flex flex-wrap items-end gap-3">
      <div class="mr-auto min-w-0">
        {kicker && <p class="text-[13px] font-bold uppercase tracking-wide text-primary">{kicker}</p>}
        <h1 class="text-2xl font-extrabold leading-tight tracking-tight text-balance md:text-3xl">{title}</h1>
        {sub && <p class="mt-1 text-muted-fg">{sub}</p>}
      </div>
      {actions && <div class="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

const BANNER = {
  info: ['bg-primary-soft border-primary/20 text-fg', Info, 'text-primary'],
  warning: ['bg-warning-soft border-warning/30 text-fg', Warning, 'text-warning'],
  danger: ['bg-danger-soft border-danger/30 text-fg', WarningOctagon, 'text-danger'],
} as const;

export function Banner({ tone = 'info', children, action }: { tone?: keyof typeof BANNER; children: ComponentChildren; action?: ComponentChildren }) {
  const [cls, Icon, ic] = BANNER[tone];
  return (
    <div class={cx('flex flex-wrap items-center gap-3 rounded-card border p-3 sm:p-4', cls)} role={tone === 'info' ? 'status' : 'alert'}>
      <Icon size={22} weight="fill" class={cx('shrink-0', ic)} aria-hidden />
      <div class="min-w-0 flex-1 font-medium">{children}</div>
      {action}
    </div>
  );
}

const TAG = {
  neutral: 'bg-muted text-muted-fg',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
  success: 'bg-success-soft text-success',
  primary: 'bg-primary-soft text-primary',
};
export const Tag = ({ tone = 'neutral', children }: { tone?: keyof typeof TAG; children: ComponentChildren }) => (
  <span class={cx('inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-bold', TAG[tone])}>{children}</span>
);

export const Empty = ({ children }: { children: ComponentChildren }) => (
  <div class="rounded-card border border-dashed border-line bg-card px-4 py-10 text-center text-muted-fg">{children}</div>
);

export const Loading = ({ label = 'Memuat…' }: { label?: string }) => (
  <div class="flex items-center justify-center gap-3 py-20 text-muted-fg" role="status">
    <CircleNotch class="animate-spin" size={24} aria-hidden />
    {label}
  </div>
);

/* ---------- Dialog (native <dialog>: fokus terkunci, Esc menutup) ---------- */
export function Dialog({
  open,
  onClose,
  title,
  children,
  footer,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ComponentChildren;
  footer?: ComponentChildren;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      class={cx(
        'm-0 mt-auto max-h-[92dvh] w-full max-w-none rounded-t-sheet bg-card p-0 text-fg shadow-lg sm:m-auto sm:rounded-sheet',
        wide ? 'sm:max-w-2xl' : 'sm:max-w-lg',
      )}
      aria-labelledby="dlg-title"
    >
      {open && (
        <div class="flex max-h-[92dvh] flex-col">
          <div class="flex items-center gap-2 border-b border-line px-5 py-3">
            <h2 id="dlg-title" class="mr-auto text-lg font-bold">
              {title}
            </h2>
            <button type="button" onClick={onClose} class="grid size-11 place-items-center rounded-ctl hover:bg-muted" aria-label="Tutup">
              <X size={20} aria-hidden />
            </button>
          </div>
          <div class="overflow-y-auto px-5 py-4">{children}</div>
          {footer && <div class="safe-bottom flex flex-wrap justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
        </div>
      )}
    </dialog>
  );
}

/** Dialog konfirmasi pengganti window.confirm. */
export function Confirm({
  open,
  title,
  children,
  okLabel,
  tone = 'primary',
  onOk,
  onCancel,
}: {
  open: boolean;
  title: string;
  children: ComponentChildren;
  okLabel: string;
  tone?: 'primary' | 'danger';
  onOk: () => void;
  onCancel: () => void;
}) {
  return (
    <Dialog
      open={open}
      onClose={onCancel}
      title={title}
      footer={
        <>
          <Button onClick={onCancel}>Batal</Button>
          <Button variant={tone} guard onClick={onOk}>
            {okLabel}
          </Button>
        </>
      }
    >
      <div class="text-muted-fg">{children}</div>
    </Dialog>
  );
}
