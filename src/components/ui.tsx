import type { ComponentChildren, JSX } from 'preact';
import { useEffect, useId, useRef, useState } from 'preact/hooks';
import { CircleNotch, Info, Warning, WarningOctagon, X } from '@phosphor-icons/react';
import { useApp } from '../lib/app';

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

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
  info: ['bg-muted/70 border-line text-fg', Info, 'text-muted-fg'],
  warning: ['bg-warning-soft border-warning/30 text-fg', Warning, 'text-warning'],
  danger: ['bg-danger-soft border-danger/30 text-fg', WarningOctagon, 'text-danger'],
} as const;

export function Banner({
  tone = 'info',
  children,
  action,
  dismissible = true,
  onClose,
}: {
  tone?: keyof typeof BANNER;
  children: ComponentChildren;
  action?: ComponentChildren;
  dismissible?: boolean;
  onClose?: () => void;
}) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  const [cls, Icon, ic] = BANNER[tone];

  const handleClose = () => {
    setDismissed(true);
    onClose?.();
  };

  return (
    <div
      class={cx('relative flex flex-col gap-3 rounded-card border p-3 sm:flex-row sm:items-center sm:p-4', cls)}
      role={tone === 'info' ? 'status' : 'alert'}
    >
      <div class={cx('flex min-w-0 flex-1 items-start gap-3 sm:items-center', dismissible && 'pr-8 sm:pr-0')}>
        <Icon size={22} weight="fill" class={cx('mt-0.5 shrink-0 sm:mt-0', ic)} aria-hidden />
        <div class="min-w-0 flex-1 font-medium">{children}</div>
      </div>
      {/* Di ponsel tombol aksi selebar kartu agar teks tidak terjepit. */}
      {action && <div class="flex shrink-0 flex-col sm:block">{action}</div>}
      {dismissible && (
        <button
          type="button"
          onClick={handleClose}
          class="absolute top-2 right-2 inline-flex size-8 items-center justify-center rounded-ctl text-muted-fg transition-colors hover:bg-black/5 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary dark:hover:bg-white/10 sm:relative sm:top-auto sm:right-auto sm:shrink-0"
          aria-label="Tutup"
          title="Tutup"
        >
          <X size={18} weight="bold" aria-hidden />
        </button>
      )}
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

/** Haptic feedback untuk layar sentuh / tablet mobile (diabaikan jika browser tidak mendukung). */
export function vibrate(ms: number | number[] = 10) {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try {
      navigator.vibrate(ms);
    } catch {}
  }
}

/** Visual stock progress bar (fuel gauge) dengan indikator ambang batas. */
export function StockGauge({
  current,
  min,
  class: c,
  unit,
}: {
  current: number;
  min: number;
  class?: string;
  unit?: string;
}) {
  const safeMin = Math.max(0, min);
  const targetMax = safeMin > 0 ? safeMin * 2 : Math.max(1, current * 1.5);
  const pct = Math.min(100, Math.max(0, Math.round((current / targetMax) * 100)));
  const isLow = safeMin > 0 && current < safeMin;
  const isOptimal = safeMin > 0 && current >= safeMin * 1.5;
  const barColor = isLow ? 'bg-danger' : isOptimal ? 'bg-success' : 'bg-warning';
  const label = isLow ? 'Menipis' : isOptimal ? 'Aman' : 'Cukup';

  return (
    <div class={cx('flex flex-col gap-1 min-w-[70px]', c)} title={`Stok: ${current}${unit ? ` ${unit}` : ''} (Min: ${min}) · Status: ${label}`}>
      <div class="h-1.5 w-full overflow-hidden rounded-full bg-muted border border-line">
        <div
          class={cx('h-full transition-all duration-300 rounded-full', barColor)}
          style={{ width: `${Math.max(4, pct)}%` }}
        />
      </div>
    </div>
  );
}

/** Shimmer / pulse skeleton placeholder untuk zero-CLS loading. */
export function Skeleton({ class: c }: { class?: string }) {
  return <div class={cx('animate-pulse rounded-ctl bg-muted/80', c)} aria-hidden />;
}

/** Status sinkronisasi ke Google Apps Script backend. */
export function SyncStatusBadge({ busy, class: c }: { busy: boolean; class?: string }) {
  return (
    <div
      class={cx(
        'inline-flex items-center gap-1.5 rounded-full px-2 py-1 sm:px-2.5 text-xs font-semibold select-none border transition-colors duration-150 shrink-0',
        busy ? 'bg-warning-soft border-warning/30 text-warning' : 'bg-success-soft border-success/30 text-success',
        c,
      )}
      role="status"
      title={busy ? 'Sedang mengirim data ke Google Sheets…' : 'Tersambung ke Google Sheets'}
    >
      <span class={cx('size-2 rounded-full shrink-0', busy ? 'bg-warning animate-ping' : 'bg-success')} aria-hidden />
      <span class="hidden sm:inline">{busy ? 'Menyimpan…' : 'Tersinkron'}</span>
    </div>
  );
}

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
    else if (!open && d.open) d.close();
    return () => {
      if (d && d.open) d.close();
    };
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
          <div class="flex items-center gap-2 border-b border-line px-5 py-3.5 sm:px-6 sm:py-4">
            <h2 id="dlg-title" class="mr-auto text-lg font-bold">
              {title}
            </h2>
            <button type="button" onClick={onClose} class="grid size-11 place-items-center rounded-ctl hover:bg-muted" aria-label="Tutup">
              <X size={20} aria-hidden />
            </button>
          </div>
          <div class={cx('overflow-y-auto px-5 py-4 sm:px-6 sm:py-5', !footer && 'pb-[max(1.25rem,calc(1.25rem+env(safe-area-inset-bottom,0px)))] sm:pb-6')}>
            {children}
          </div>
          {footer && (
            <div class="flex flex-wrap items-center justify-end gap-2.5 border-t border-line px-5 pt-3.5 pb-[max(1.25rem,calc(1.25rem+env(safe-area-inset-bottom,0px)))] sm:px-6 sm:pt-4 sm:pb-5">
              {footer}
            </div>
          )}
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
