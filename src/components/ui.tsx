import { isValidElement, type ComponentChildren, type JSX, type VNode } from 'preact';
import { useEffect, useId, useMemo, useRef, useState } from 'preact/hooks';
import {
  CalendarBlank,
  CaretDoubleLeft,
  CaretDoubleRight,
  CaretDown,
  CaretLeft,
  CaretRight,
  Check,
  CircleNotch,
  Clock,
  Info,
  MagnifyingGlass,
  Plus,
  Warning,
  WarningOctagon,
  X,
} from '@phosphor-icons/react';
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
const ctlBase =
  'w-full min-h-11 rounded-ctl border border-line-strong bg-card py-2 text-fg placeholder:text-muted-fg/80 transition-colors duration-150 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/25 disabled:bg-muted aria-[invalid=true]:border-danger';
const ctl = cx(ctlBase, 'px-3');
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

const BULAN_PENDEK = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const BULAN_LENGKAP = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
];
const HARI_LABEL = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];

export function formatDisplayDate(val: string, isDateTime?: boolean): string {
  if (!val) return '';
  const [datePart, timePart] = val.split('T');
  const [y, m, d] = datePart.split('-').map(Number);
  if (!y || !m || !d) return val;
  const monthName = BULAN_PENDEK[m - 1] || '';
  const dayStr = String(d).padStart(2, '0');
  const base = `${dayStr} ${monthName} ${y}`;
  if (isDateTime && timePart) {
    const [hh, mm] = timePart.split(':');
    return `${base}, ${hh || '00'}:${mm || '00'}`;
  }
  return base;
}

export interface DatePickerProps extends JSX.InputHTMLAttributes<HTMLInputElement> {
  type?: string;
}

export function DatePicker({
  class: c,
  id,
  name,
  value,
  min,
  max,
  disabled,
  readOnly,
  required,
  placeholder,
  type = 'date',
  onInput,
  onChange,
  'aria-invalid': ariaInvalid,
  'aria-describedby': ariaDescribedby,
}: DatePickerProps) {
  const isDateTime = type === 'datetime-local';
  const valStr = value !== undefined && value !== null ? String(value) : '';
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const hiddenInputRef = useRef<HTMLInputElement>(null);

  const [alignRight, setAlignRight] = useState(false);
  const [dropUp, setDropUp] = useState(false);

  const parsedVal = useMemo(() => {
    if (!valStr) return null;
    const [datePart, timePart] = valStr.split('T');
    const [y, m, d] = datePart.split('-').map(Number);
    if (!y || !m || !d) return null;
    return { year: y, month: m - 1, day: d, time: timePart || '00:00', dateStr: datePart };
  }, [valStr]);

  const today = useMemo(() => {
    const d = new Date();
    const tzOffset = d.getTimezoneOffset() * 60000;
    const local = new Date(d.getTime() - tzOffset);
    const dateStr = local.toISOString().slice(0, 10);
    const [y, m, day] = dateStr.split('-').map(Number);
    return { year: y, month: m - 1, day, dateStr };
  }, []);

  const [viewYear, setViewYear] = useState<number>(parsedVal?.year || today.year);
  const [viewMonth, setViewMonth] = useState<number>(parsedVal?.month ?? today.month);
  const [timeVal, setTimeVal] = useState<string>(parsedVal?.time || '12:00');

  useEffect(() => {
    if (parsedVal) {
      setViewYear(parsedVal.year);
      setViewMonth(parsedVal.month);
      setTimeVal(parsedVal.time);
    }
  }, [valStr]);

  useEffect(() => {
    if (!open) return;
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setAlignRight(rect.left + 300 > window.innerWidth);
      setDropUp(window.innerHeight - rect.bottom < 340 && rect.top > 340);
    }
    const handleOutside = (e: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('touchstart', handleOutside);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('touchstart', handleOutside);
    };
  }, [open]);

  const dispatchChange = (newVal: string) => {
    if (hiddenInputRef.current) {
      hiddenInputRef.current.value = newVal;
      hiddenInputRef.current.dispatchEvent(new Event('input', { bubbles: true }));
      hiddenInputRef.current.dispatchEvent(new Event('change', { bubbles: true }));
    }
    const synthetic = {
      currentTarget: { value: newVal, id, name } as unknown as HTMLInputElement,
      target: { value: newVal, id, name } as unknown as HTMLInputElement,
      bubbles: true,
      preventDefault: () => {},
      stopPropagation: () => {},
    } as unknown as JSX.TargetedEvent<HTMLInputElement, Event>;

    if (onInput) onInput(synthetic as unknown as JSX.TargetedInputEvent<HTMLInputElement>);
    if (onChange) onChange(synthetic);
  };

  const handleDayClick = (dateStr: string) => {
    if (isDateTime) {
      const finalVal = `${dateStr}T${timeVal || '00:00'}`;
      dispatchChange(finalVal);
    } else {
      dispatchChange(dateStr);
      setOpen(false);
    }
  };

  const handleTimeChange = (newTime: string) => {
    setTimeVal(newTime);
    const baseDate = parsedVal?.dateStr || today.dateStr;
    dispatchChange(`${baseDate}T${newTime}`);
  };

  const handleQuickPreset = (preset: 'today' | 'yesterday' | 'clear') => {
    if (preset === 'clear') {
      dispatchChange('');
      setOpen(false);
      return;
    }
    const d = new Date();
    if (preset === 'yesterday') {
      d.setDate(d.getDate() - 1);
    }
    const tzOffset = d.getTimezoneOffset() * 60000;
    const dateStr = new Date(d.getTime() - tzOffset).toISOString().slice(0, 10);
    if (isDateTime) {
      const finalVal = `${dateStr}T${timeVal || '00:00'}`;
      dispatchChange(finalVal);
    } else {
      dispatchChange(dateStr);
      setOpen(false);
    }
  };

  const calendarDays = useMemo(() => {
    const firstDay = new Date(viewYear, viewMonth, 1).getDay();
    const offset = (firstDay + 6) % 7;
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const daysInPrevMonth = new Date(viewYear, viewMonth, 0).getDate();

    const days: Array<{ day: number; dateStr: string; isOtherMonth: boolean }> = [];

    for (let i = offset - 1; i >= 0; i--) {
      const d = daysInPrevMonth - i;
      const m = viewMonth === 0 ? 11 : viewMonth - 1;
      const y = viewMonth === 0 ? viewYear - 1 : viewYear;
      const dateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      days.push({ day: d, dateStr, isOtherMonth: true });
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      days.push({ day: d, dateStr, isOtherMonth: false });
    }

    const remaining = (7 - (days.length % 7)) % 7;
    for (let d = 1; d <= remaining; d++) {
      const m = viewMonth === 11 ? 0 : viewMonth + 1;
      const y = viewMonth === 11 ? viewYear + 1 : viewYear;
      const dateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      days.push({ day: d, dateStr, isOtherMonth: true });
    }

    return days;
  }, [viewYear, viewMonth]);

  const changeMonth = (delta: number) => {
    let nextM = viewMonth + delta;
    let nextY = viewYear;
    if (nextM > 11) {
      nextM = 0;
      nextY += 1;
    } else if (nextM < 0) {
      nextM = 11;
      nextY -= 1;
    }
    setViewMonth(nextM);
    setViewYear(nextY);
  };

  const changeYear = (delta: number) => {
    setViewYear((y) => y + delta);
  };

  const yearOptions = useMemo(() => {
    const list: number[] = [];
    const start = today.year - 8;
    const end = today.year + 4;
    for (let y = start; y <= end; y++) {
      list.push(y);
    }
    if (!list.includes(viewYear)) {
      list.push(viewYear);
      list.sort((a, b) => a - b);
    }
    return list;
  }, [today.year, viewYear]);

  const minStr = min ? String(min).slice(0, 10) : '';
  const maxStr = max ? String(max).slice(0, 10) : '';
  const isInvalid = Boolean(ariaInvalid && ariaInvalid !== 'false');
  const placeholderStr = placeholder !== undefined && placeholder !== null ? String(placeholder) : '';
  const displayLabel =
    formatDisplayDate(valStr, isDateTime) || placeholderStr || (isDateTime ? 'Pilih tanggal & waktu' : 'Pilih tanggal');

  return (
    <div ref={containerRef} class="relative w-full">
      <input
        ref={hiddenInputRef}
        type="hidden"
        name={name}
        value={valStr}
        required={required}
        aria-invalid={ariaInvalid}
        aria-describedby={ariaDescribedby}
      />

      <button
        ref={triggerRef}
        type="button"
        id={id}
        disabled={disabled}
        onClick={() => !disabled && !readOnly && setOpen(!open)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setOpen(false);
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            if (!disabled && !readOnly) setOpen(!open);
           }
        }}
        class={cx(
          ctl,
          'cursor-pointer select-none text-left flex items-center justify-between gap-2 transition-all duration-150',
          open && 'border-primary ring-2 ring-primary/25 bg-card',
          disabled && 'opacity-50 cursor-not-allowed bg-muted',
          isInvalid && 'border-danger ring-1 ring-danger/30',
          typeof c === 'string' ? c : undefined,
        )}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-describedby={ariaDescribedby}
      >
        <span
          class={cx(
            'truncate flex-1 min-w-0 flex items-center gap-2',
            !valStr ? 'text-muted-fg font-normal' : 'text-fg font-medium',
          )}
        >
          <CalendarBlank
            size={16}
            weight={open || valStr ? 'bold' : 'regular'}
            class={cx('shrink-0 transition-colors', open || valStr ? 'text-primary' : 'text-muted-fg')}
            aria-hidden
          />
          <span class="num text-xs sm:text-sm truncate">{displayLabel}</span>
        </span>

        <div class="flex items-center gap-1 shrink-0">
          {valStr && !disabled && !readOnly && (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                dispatchChange('');
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.stopPropagation();
                  dispatchChange('');
                }
              }}
              title="Hapus tanggal"
              class="p-0.5 rounded-full hover:bg-muted text-muted-fg hover:text-danger cursor-pointer transition-colors"
            >
              <X size={13} weight="bold" />
            </span>
          )}
          <CaretDown
            size={13}
            weight="bold"
            class={cx('text-muted-fg transition-transform duration-200', open && 'rotate-180 text-primary')}
            aria-hidden
          />
        </div>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Pilih tanggal"
          class={cx(
            'absolute z-50 rounded-2xl border border-line bg-card shadow-2xl p-3 sm:p-3.5 w-72 sm:w-80 max-w-[calc(100vw-2rem)] flex flex-col gap-2.5 animate-in fade-in-0 zoom-in-95 backdrop-blur-md',
            alignRight ? 'right-0' : 'left-0',
            dropUp ? 'bottom-full mb-1.5' : 'top-full mt-1.5',
          )}
        >
          <div class="flex items-center justify-between gap-1 pb-1 border-b border-line/60">
            <div class="flex items-center gap-0.5">
              <button
                type="button"
                onClick={() => changeYear(-1)}
                title="Tahun sebelumnya"
                class="p-1 rounded-md hover:bg-muted text-muted-fg hover:text-fg transition-colors cursor-pointer"
              >
                <CaretDoubleLeft size={13} weight="bold" />
              </button>
              <button
                type="button"
                onClick={() => changeMonth(-1)}
                title="Bulan sebelumnya"
                class="p-1 rounded-md hover:bg-muted text-muted-fg hover:text-fg transition-colors cursor-pointer"
              >
                <CaretLeft size={14} weight="bold" />
              </button>
            </div>

            <div class="flex items-center gap-1 font-bold text-xs">
              <select
                value={viewMonth}
                onChange={(e) => setViewMonth(Number(e.currentTarget.value))}
                class="bg-transparent text-fg hover:bg-muted/60 rounded px-1.5 py-0.5 cursor-pointer font-semibold text-xs focus:outline-none"
              >
                {BULAN_LENGKAP.map((m, idx) => (
                  <option key={idx} value={idx} class="bg-card text-fg">
                    {m}
                  </option>
                ))}
              </select>
              <select
                value={viewYear}
                onChange={(e) => setViewYear(Number(e.currentTarget.value))}
                class="bg-transparent text-fg hover:bg-muted/60 rounded px-1.5 py-0.5 cursor-pointer font-semibold text-xs focus:outline-none num"
              >
                {yearOptions.map((y) => (
                  <option key={y} value={y} class="bg-card text-fg">
                    {y}
                  </option>
                ))}
              </select>
            </div>

            <div class="flex items-center gap-0.5">
              <button
                type="button"
                onClick={() => changeMonth(1)}
                title="Bulan berikutnya"
                class="p-1 rounded-md hover:bg-muted text-muted-fg hover:text-fg transition-colors cursor-pointer"
              >
                <CaretRight size={14} weight="bold" />
              </button>
              <button
                type="button"
                onClick={() => changeYear(1)}
                title="Tahun berikutnya"
                class="p-1 rounded-md hover:bg-muted text-muted-fg hover:text-fg transition-colors cursor-pointer"
              >
                <CaretDoubleRight size={13} weight="bold" />
              </button>
            </div>
          </div>

          <div class="grid grid-cols-7 gap-1 text-center">
            {HARI_LABEL.map((h, i) => (
              <span key={i} class="text-[10.5px] font-bold text-muted-fg uppercase tracking-wider py-0.5">
                {h}
              </span>
            ))}
          </div>

          <div class="grid grid-cols-7 gap-1">
            {calendarDays.map((d, i) => {
              const isSelected = parsedVal?.dateStr === d.dateStr;
              const isToday = today.dateStr === d.dateStr;
              const isDisabled = Boolean(
                (minStr && d.dateStr < minStr) ||
                (maxStr && d.dateStr > maxStr),
              );
              return (
                <button
                  key={i}
                  type="button"
                  disabled={isDisabled}
                  onClick={() => !isDisabled && handleDayClick(d.dateStr)}
                  class={cx(
                    'h-8 rounded-lg flex items-center justify-center text-xs font-semibold num transition-all cursor-pointer',
                    isSelected
                      ? 'bg-primary text-primary-fg font-bold shadow-xs'
                      : isToday
                      ? 'border border-primary text-primary font-bold hover:bg-muted'
                      : d.isOtherMonth
                      ? 'text-muted-fg/30 hover:bg-muted/40'
                      : 'text-fg hover:bg-muted',
                    isDisabled && 'opacity-25 cursor-not-allowed hover:bg-transparent pointer-events-none',
                  )}
                >
                  {d.day}
                </button>
              );
            })}
          </div>

          {isDateTime && (
            <div class="pt-2 border-t border-line/60 flex items-center justify-between gap-2">
              <div class="flex items-center gap-1.5 text-xs font-semibold text-muted-fg">
                <Clock size={15} class="text-primary shrink-0" />
                <span>Waktu:</span>
                <input
                  type="time"
                  value={timeVal}
                  onInput={(e) => handleTimeChange(e.currentTarget.value)}
                  class="bg-muted/60 border border-line rounded px-1.5 py-0.5 text-xs text-fg font-mono num focus:outline-none focus:border-primary"
                />
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                class="px-2.5 py-1 text-xs font-bold rounded-lg bg-primary text-primary-fg hover:bg-primary/90 transition-colors cursor-pointer"
              >
                Selesai
              </button>
            </div>
          )}

          <div class="pt-1.5 border-t border-line/60 flex items-center justify-between gap-1 text-[11px]">
            <div class="flex items-center gap-1">
              <button
                type="button"
                onClick={() => handleQuickPreset('today')}
                class="px-2 py-0.5 rounded-md bg-muted/60 hover:bg-muted hover:text-primary text-muted-fg font-medium transition-colors cursor-pointer"
              >
                Hari Ini
              </button>
              <button
                type="button"
                onClick={() => handleQuickPreset('yesterday')}
                class="px-2 py-0.5 rounded-md bg-muted/60 hover:bg-muted hover:text-primary text-muted-fg font-medium transition-colors cursor-pointer"
              >
                Kemarin
              </button>
            </div>
            {valStr ? (
              <button
                type="button"
                onClick={() => handleQuickPreset('clear')}
                class="px-2 py-0.5 rounded-md hover:bg-danger-soft text-muted-fg hover:text-danger font-medium transition-colors cursor-pointer"
              >
                Reset
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setOpen(false)}
                class="px-2 py-0.5 rounded-md hover:bg-muted text-muted-fg font-medium transition-colors cursor-pointer"
              >
                Tutup
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export const Input = ({ class: c, type, ...p }: JSX.InputHTMLAttributes<HTMLInputElement>) => {
  if (type === 'date' || type === 'datetime-local') {
    return <DatePicker type={type} class={c as string} {...p} />;
  }
  return <input type={type} {...p} class={cx(ctl, c as string)} />;
};
interface ParsedOption {
  value: string;
  label: string;
  disabled?: boolean;
  isAction?: boolean;
}

interface ParsedGroup {
  label: string;
  options: ParsedOption[];
}

type ParsedItem = { type: 'option'; option: ParsedOption } | { type: 'group'; group: ParsedGroup };

type OptionVNode = VNode<{ value?: string | number; children?: ComponentChildren; disabled?: boolean }>;
type OptgroupVNode = VNode<{ label?: string; children?: ComponentChildren }>;

function extractText(node: ComponentChildren): string {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(extractText).join('');
  if (isValidElement(node)) {
    const p = node.props as { children?: ComponentChildren };
    return extractText(p.children);
  }
  return '';
}

function parseItems(children: ComponentChildren): ParsedItem[] {
  const items: ParsedItem[] = [];
  const flat = Array.isArray(children) ? children.flat(Infinity) : [children];

  for (const child of flat) {
    if (!isValidElement(child)) continue;
    if (child.type === 'option') {
      const optNode = child as unknown as OptionVNode;
      const val = optNode.props.value !== undefined ? String(optNode.props.value) : extractText(optNode.props.children);
      const label = extractText(optNode.props.children) || val;
      const isAction = val.startsWith('__') || label.startsWith('+ ');
      items.push({
        type: 'option',
        option: {
          value: val,
          label,
          disabled: !!optNode.props.disabled,
          isAction,
        },
      });
    } else if (child.type === 'optgroup') {
      const grpNode = child as unknown as OptgroupVNode;
      const gLabel = String(grpNode.props.label || '');
      const gOptions: ParsedOption[] = [];
      const gFlat = Array.isArray(grpNode.props.children) ? grpNode.props.children.flat(Infinity) : [grpNode.props.children];
      for (const gChild of gFlat) {
        if (!isValidElement(gChild) || gChild.type !== 'option') continue;
        const gOptNode = gChild as unknown as OptionVNode;
        const val = gOptNode.props.value !== undefined ? String(gOptNode.props.value) : extractText(gOptNode.props.children);
        const label = extractText(gOptNode.props.children) || val;
        const isAction = val.startsWith('__') || label.startsWith('+ ');
        gOptions.push({
          value: val,
          label,
          disabled: !!gOptNode.props.disabled,
          isAction,
        });
      }
      items.push({
        type: 'group',
        group: { label: gLabel, options: gOptions },
      });
    }
  }
  return items;
}

export interface SelectProps extends JSX.SelectHTMLAttributes<HTMLSelectElement> {
  placeholder?: string;
}

export function Select({
  class: c,
  children,
  value,
  onChange,
  id,
  disabled,
  placeholder,
  ...p
}: SelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [highlightIdx, setHighlightIdx] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const nativeRef = useRef<HTMLSelectElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const parsedItems = useMemo(() => parseItems(children), [children]);

  const allOptions = useMemo(() => {
    const list: ParsedOption[] = [];
    parsedItems.forEach((item) => {
      if (item.type === 'option') {
        list.push(item.option);
      } else {
        item.group.options.forEach((opt) => list.push(opt));
      }
    });
    return list;
  }, [parsedItems]);

  const currentVal = value !== undefined ? String(value) : '';
  const selectedOption =
    allOptions.find((o) => o.value === currentVal) ||
    (allOptions.length && currentVal === '' ? allOptions.find((o) => o.value === '') || allOptions[0] : undefined);
  const displayLabel = selectedOption ? selectedOption.label : (placeholder || 'Pilih...');
  const isPlaceholder = !currentVal || (selectedOption && (selectedOption.value === '' || selectedOption.label.startsWith('Pilih')));

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('touchstart', handleClick);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('touchstart', handleClick);
    };
  }, [open]);

  // Focus search input when open
  useEffect(() => {
    if (open) {
      setSearch('');
      setHighlightIdx(-1);
      if (allOptions.length > 7 && searchInputRef.current) {
        setTimeout(() => searchInputRef.current?.focus(), 50);
      }
    }
  }, [open, allOptions.length]);

  const handleSelect = (newVal: string) => {
    setOpen(false);
    if (nativeRef.current) {
      nativeRef.current.value = newVal;
      const event = new Event('change', { bubbles: true });
      nativeRef.current.dispatchEvent(event);
    }
    if (onChange) {
      const synthetic = {
        currentTarget: { value: newVal },
        target: { value: newVal },
        preventDefault: () => {},
        stopPropagation: () => {},
      } as unknown as JSX.TargetedEvent<HTMLSelectElement, Event>;
      onChange(synthetic);
    }
  };

  // Filtered items based on search
  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return parsedItems;
    const result: ParsedItem[] = [];
    for (const item of parsedItems) {
      if (item.type === 'option') {
        if (item.option.label.toLowerCase().includes(q) || item.option.isAction) {
          result.push(item);
        }
      } else {
        const matching = item.group.options.filter((o) => o.label.toLowerCase().includes(q) || o.isAction);
        if (matching.length) {
          result.push({
            type: 'group',
            group: { label: item.group.label, options: matching },
          });
        }
      }
    }
    return result;
  }, [parsedItems, search]);

  const visibleOptions = useMemo(() => {
    const list: ParsedOption[] = [];
    filteredItems.forEach((item) => {
      if (item.type === 'option') list.push(item.option);
      else item.group.options.forEach((o) => list.push(o));
    });
    return list;
  }, [filteredItems]);

  const handleKeyDown = (e: JSX.TargetedKeyboardEvent<HTMLElement>) => {
    if (disabled) return;
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }

    if (e.key === 'Escape' || e.key === 'Tab') {
      setOpen(false);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIdx((prev) => (prev < visibleOptions.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIdx((prev) => (prev > 0 ? prev - 1 : visibleOptions.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightIdx >= 0 && highlightIdx < visibleOptions.length) {
        const target = visibleOptions[highlightIdx];
        if (!target.disabled) handleSelect(target.value);
      }
    }
  };

  const showSearch = allOptions.length > 7;

  return (
    <div
      ref={containerRef}
      class={cx(
        'relative text-left',
        typeof c === 'string' && c.includes('w-full')
          ? 'w-full'
          : typeof c === 'string' && c.includes('flex-1')
          ? 'flex-1 min-w-0'
          : typeof c === 'string' && /\bw-\S+/.test(c)
          ? cx(c.match(/\bw-\S+/)?.[0], 'min-w-0')
          : 'inline-block min-w-[140px]',
      )}
      onKeyDown={handleKeyDown}
    >
      {/* Hidden native select for form validation, accessibility & scripts */}
      <select
        ref={nativeRef}
        id={id ? id + '-native' : undefined}
        value={currentVal}
        disabled={disabled}
        tabIndex={-1}
        aria-hidden="true"
        class="sr-only pointer-events-none absolute"
        {...p}
      >
        {children}
      </select>

      {/* Custom styled trigger button */}
      <button
        id={id}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-invalid={p['aria-invalid']}
        aria-describedby={p['aria-describedby']}
        aria-label={p['aria-label']}
        title={typeof displayLabel === 'string' ? displayLabel : undefined}
        onClick={() => !disabled && setOpen(!open)}
        class={cx(
          ctlBase,
          'pl-3.5 pr-4 cursor-pointer select-none text-left flex items-center justify-between gap-2.5 transition-all duration-150 min-w-0',
          open && 'border-primary ring-2 ring-primary/25 bg-card',
          disabled && 'opacity-50 cursor-not-allowed bg-muted',
          typeof c === 'string' ? c.replace(/\b(truncate|pl-\S+|pr-\S+|px-\S+)\b/g, '').trim() : undefined,
        )}
      >
        <span class={cx('truncate flex-1 min-w-0', isPlaceholder ? 'text-muted-fg font-normal' : 'text-fg font-medium')}>
          {displayLabel}
        </span>
        <CaretDown
          size={16}
          weight="bold"
          class={cx('shrink-0 text-muted-fg transition-transform duration-200', open && 'rotate-180 text-primary')}
          aria-hidden
        />
      </button>

      {/* Custom dropdown menu */}
      {open && (
        <div
          role="listbox"
          tabIndex={-1}
          class="absolute left-0 top-full mt-1.5 w-full min-w-[200px] z-50 rounded-xl border border-line bg-card shadow-lg backdrop-blur-md p-1.5 flex flex-col gap-0.5 max-h-64 overflow-y-auto overscroll-contain animate-in fade-in-0 zoom-in-95"
        >
          {showSearch && (
            <div class="p-1 border-b border-line/60 mb-1 sticky top-0 bg-card z-10 -mt-1.5 -mx-1.5 px-2.5 pt-2 pb-1.5">
              <div class="relative">
                <MagnifyingGlass size={14} class="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-fg" aria-hidden />
                <input
                  ref={searchInputRef}
                  type="text"
                  placeholder="Cari..."
                  value={search}
                  onInput={(e) => setSearch(e.currentTarget.value)}
                  class="w-full text-xs h-8 pl-7 pr-2 rounded-md bg-muted/60 border border-line focus:border-primary focus:bg-card focus:outline-none transition-colors"
                />
              </div>
            </div>
          )}

          {visibleOptions.length === 0 ? (
            <div class="px-3 py-4 text-xs text-center text-muted-fg select-none">
              Tidak ada hasil yang cocok.
            </div>
          ) : (
            filteredItems.map((item, itemIdx) => {
              if (item.type === 'option') {
                const opt = item.option;
                const isSelected = opt.value === currentVal;
                const optGlobalIdx = visibleOptions.indexOf(opt);
                const isHighlighted = optGlobalIdx === highlightIdx;

                if (opt.isAction) {
                  return (
                    <div key={'action-' + opt.value + '-' + itemIdx}>
                      <div class="border-t border-line/60 my-1 -mx-1" />
                      <button
                        type="button"
                        role="option"
                        aria-selected={isSelected}
                        disabled={opt.disabled}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSelect(opt.value);
                        }}
                        class={cx(
                          'w-full min-h-10 px-3 py-2 text-sm font-semibold rounded-lg flex items-center gap-2 cursor-pointer transition-colors duration-100 text-primary hover:bg-primary-soft/80 select-none text-left',
                          isHighlighted && 'bg-primary-soft/50',
                        )}
                      >
                        <Plus size={16} weight="bold" class="shrink-0 text-primary" aria-hidden />
                        <span class="flex-1 truncate">{opt.label.replace(/^\+\s*/, '')}</span>
                      </button>
                    </div>
                  );
                }

                return (
                  <button
                    key={'opt-' + opt.value + '-' + itemIdx}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    disabled={opt.disabled}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSelect(opt.value);
                    }}
                    class={cx(
                      'w-full min-h-10 px-3 py-2 text-sm rounded-lg flex items-center justify-between gap-2 cursor-pointer transition-colors duration-100 text-left select-none',
                      isSelected
                        ? 'bg-primary-soft text-primary font-semibold'
                        : isHighlighted
                        ? 'bg-muted text-fg'
                        : 'text-fg hover:bg-muted',
                      opt.disabled && 'opacity-40 cursor-not-allowed',
                    )}
                  >
                    <span class="truncate flex-1 min-w-0">{opt.label}</span>
                    {isSelected && <Check size={16} weight="bold" class="text-primary shrink-0" aria-hidden />}
                  </button>
                );
              }

              // Group
              return (
                <div key={'grp-' + item.group.label + '-' + itemIdx} class="flex flex-col gap-0.5">
                  <div class="text-[11px] font-bold uppercase tracking-wider text-muted-fg px-3 py-1.5 select-none bg-muted/60 rounded-md my-1">
                    {item.group.label}
                  </div>
                  {item.group.options.map((opt, optIdx) => {
                    const isSelected = opt.value === currentVal;
                    const optGlobalIdx = visibleOptions.indexOf(opt);
                    const isHighlighted = optGlobalIdx === highlightIdx;

                    return (
                      <button
                        key={'grp-opt-' + opt.value + '-' + optIdx}
                        type="button"
                        role="option"
                        aria-selected={isSelected}
                        disabled={opt.disabled}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSelect(opt.value);
                        }}
                        class={cx(
                          'w-full min-h-10 px-3 py-2 text-sm rounded-lg flex items-center justify-between gap-2 cursor-pointer transition-colors duration-100 text-left select-none',
                          isSelected
                            ? 'bg-primary-soft text-primary font-semibold'
                            : isHighlighted
                            ? 'bg-muted text-fg'
                            : 'text-fg hover:bg-muted',
                          opt.disabled && 'opacity-40 cursor-not-allowed',
                        )}
                      >
                        <span class="truncate flex-1 min-w-0">{opt.label}</span>
                        {isSelected && <Check size={16} weight="bold" class="text-primary shrink-0" aria-hidden />}
                      </button>
                    );
                  })}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

/* ---------- MultiSelect (Pilihan Jamak dengan Dropdown) ---------- */
export interface MultiSelectOption {
  value: string;
  label: string;
  count?: number;
  disabled?: boolean;
}

export interface MultiSelectProps {
  id?: string;
  value: string[];
  onChange: (value: string[]) => void;
  options: MultiSelectOption[];
  placeholder?: string;
  allLabel?: string;
  class?: string;
  disabled?: boolean;
  'aria-label'?: string;
}

export function MultiSelect({
  id,
  value,
  onChange,
  options,
  placeholder = 'Pilih…',
  allLabel,
  class: c,
  disabled,
  'aria-label': ariaLabel,
}: MultiSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Tutup saat klik di luar
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('touchstart', handleClick);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('touchstart', handleClick);
    };
  }, [open]);

  // Fokus input pencarian saat terbuka
  useEffect(() => {
    if (open) {
      setSearch('');
      if (options.length > 5 && searchInputRef.current) {
        setTimeout(() => searchInputRef.current?.focus(), 50);
      }
    }
  }, [open, options.length]);

  const toggle = (val: string) => {
    if (value.includes(val)) {
      onChange(value.filter((v) => v !== val));
    } else {
      onChange([...value, val]);
    }
  };

  const selectAll = () => {
    onChange(options.filter((o) => !o.disabled).map((o) => o.value));
  };

  const clearAll = () => {
    onChange([]);
  };

  const filteredOptions = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, search]);

  const handleKeyDown = (e: JSX.TargetedKeyboardEvent<HTMLElement>) => {
    if (disabled) return;
    if (e.key === 'Escape') {
      setOpen(false);
    } else if (!open && (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      setOpen(true);
    }
  };

  // Label & Tooltip
  let displayLabel: string;
  let isAll = false;
  let fullTooltip = '';

  if (value.length === 0) {
    displayLabel = allLabel || placeholder;
    isAll = true;
    fullTooltip = displayLabel;
  } else if (value.length === 1) {
    const matched = options.find((o) => o.value === value[0]);
    const label = matched ? matched.label : value[0];
    const countPart = matched?.count !== undefined ? ` (${matched.count})` : '';
    displayLabel = `${label}${countPart}`;
    fullTooltip = displayLabel;
  } else {
    displayLabel = `${value.length} Kategori Dipilih`;
    fullTooltip = value
      .map((v) => {
        const m = options.find((o) => o.value === v);
        return m ? m.label : v;
      })
      .join(', ');
  }

  const widthClass =
    typeof c === 'string' && c.includes('w-full')
      ? 'w-full'
      : typeof c === 'string' && c.includes('flex-1')
      ? 'flex-1 min-w-0'
      : typeof c === 'string' && /\bw-\S+/.test(c)
      ? cx(c.match(/\bw-\S+/)?.[0], 'min-w-0')
      : 'w-full min-w-0';

  return (
    <div
      ref={containerRef}
      class={cx('relative text-left', widthClass)}
      onKeyDown={handleKeyDown}
    >
      {/* Trigger button dengan ukuran tetap & teks terpotong rapi */}
      <button
        id={id}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel || displayLabel}
        title={fullTooltip}
        onClick={() => !disabled && setOpen(!open)}
        class={cx(
          ctlBase,
          'pl-3.5 pr-3.5 cursor-pointer select-none text-left flex items-center justify-between gap-2 transition-all duration-150 min-w-0',
          open && 'border-primary ring-2 ring-primary/25 bg-card',
          disabled && 'opacity-50 cursor-not-allowed bg-muted',
          typeof c === 'string' ? c.replace(/\b(truncate|pl-\S+|pr-\S+|px-\S+|w-\S+|flex-1)\b/g, '').trim() : undefined,
        )}
      >
        <div class="flex items-center gap-1.5 flex-1 min-w-0">
          <span
            class={cx(
              'truncate flex-1 min-w-0',
              isAll ? 'text-muted-fg font-normal' : 'text-fg font-medium',
            )}
          >
            {displayLabel}
          </span>
        </div>
        <CaretDown
          size={16}
          weight="bold"
          class={cx('shrink-0 text-muted-fg transition-transform duration-200', open && 'rotate-180 text-primary')}
          aria-hidden
        />
      </button>

      {/* Dropdown panel multi-select (posisi right-0 agar tidak melebihi margin kanan layar) */}
      {open && (
        <div
          role="listbox"
          aria-multiselectable="true"
          tabIndex={-1}
          class="absolute right-0 top-full mt-1.5 w-72 sm:w-80 max-w-[calc(100vw-2rem)] z-50 rounded-xl border border-line bg-card shadow-lg backdrop-blur-md p-1.5 flex flex-col gap-1 max-h-80 overflow-hidden animate-in fade-in-0 zoom-in-95"
        >
          {/* Kotak pencarian jika pilihan banyak */}
          {options.length > 5 && (
             <div class="relative px-1 pt-1 pb-1 border-b border-line/60">
               <MagnifyingGlass
                 size={14}
                 class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-fg"
                 aria-hidden
               />
               <input
                 ref={searchInputRef}
                 type="text"
                 placeholder="Cari kategori…"
                 value={search}
                 onInput={(e) => setSearch(e.currentTarget.value)}
                 class="w-full text-xs h-8 pl-7 pr-7 rounded-md bg-muted/60 border border-line focus:border-primary focus:bg-card focus:outline-none transition-colors"
               />
               {search && (
                 <button
                   type="button"
                   onClick={() => setSearch('')}
                   class="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-fg hover:text-fg cursor-pointer"
                   aria-label="Bersihkan pencarian"
                 >
                   <X size={12} weight="bold" />
                 </button>
               )}
             </div>
           )}

           {/* Bar aksi cepat & info status pilihan */}
           <div class="flex items-center justify-between px-2 py-1 text-xs border-b border-line/40 text-muted-fg select-none">
             <span>
               {value.length === 0
                 ? 'Semua dipilih'
                 : `${value.length} dari ${options.length} dipilih`}
             </span>
             <div class="flex items-center gap-2">
               {value.length < options.length && (
                 <button
                   type="button"
                   onClick={selectAll}
                   class="font-semibold text-primary hover:underline cursor-pointer"
                 >
                   Pilih semua
                 </button>
               )}
               {value.length > 0 && (
                 <button
                   type="button"
                   onClick={clearAll}
                   class="font-semibold text-danger hover:underline cursor-pointer"
                 >
                   Reset
                 </button>
               )}
             </div>
           </div>

           {/* Daftar opsi dengan checkbox kustom */}
           <div class="flex-1 overflow-y-auto overscroll-contain flex flex-col gap-0.5 max-h-56 pr-0.5">
             {filteredOptions.length === 0 ? (
               <div class="px-3 py-4 text-xs text-center text-muted-fg select-none">
                 Tidak ada hasil yang cocok.
               </div>
             ) : (
               filteredOptions.map((opt) => {
                 const isChecked = value.includes(opt.value);
                 return (
                   <button
                     key={opt.value}
                     type="button"
                     role="option"
                     aria-selected={isChecked}
                     disabled={opt.disabled}
                     onClick={() => !opt.disabled && toggle(opt.value)}
                     title={opt.label}
                     class={cx(
                       'w-full min-h-9 px-2.5 py-1.5 text-xs sm:text-sm rounded-lg flex items-center justify-between gap-2.5 cursor-pointer transition-colors duration-100 text-left select-none',
                       isChecked
                         ? 'bg-primary-soft/60 text-fg font-medium'
                         : 'text-fg hover:bg-muted',
                       opt.disabled && 'opacity-40 cursor-not-allowed',
                     )}
                   >
                     <div class="flex items-center gap-2.5 flex-1 min-w-0">
                       <div
                         class={cx(
                           'size-4 rounded border flex items-center justify-center shrink-0 transition-colors',
                           isChecked
                             ? 'border-primary bg-primary text-white shadow-xs'
                             : 'border-line-strong bg-card',
                         )}
                         aria-hidden
                       >
                         {isChecked && <Check size={11} weight="bold" />}
                       </div>
                       <span class="truncate flex-1 min-w-0">{opt.label}</span>
                     </div>
                     {opt.count !== undefined && (
                       <span class="num text-[11px] text-muted-fg bg-muted px-1.5 py-0.5 rounded-full shrink-0">
                         {opt.count}
                       </span>
                     )}
                   </button>
                 );
               })
             )}
           </div>

           {/* Tombol selesai */}
           <div class="border-t border-line/60 pt-1 mt-0.5 flex justify-end px-1">
             <button
               type="button"
               onClick={() => setOpen(false)}
               class="w-full py-1.5 text-xs font-semibold rounded-lg bg-primary text-white hover:bg-primary/90 transition-colors cursor-pointer select-none text-center"
             >
               Selesai
             </button>
           </div>
         </div>
       )}
     </div>
   );
 }

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
export const Tag = ({ tone = 'neutral', class: c, children }: { tone?: keyof typeof TAG; class?: string; children: ComponentChildren }) => (
  <span class={cx('inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-bold', TAG[tone], c)}>{children}</span>
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

/* ---------- ScrollPills: Horizontal Container dengan Drag-to-Scroll & Mouse Wheel ---------- */
export function ScrollPills({
  children,
  class: c,
  activeSelector,
}: {
  children: ComponentChildren;
  class?: string;
  activeSelector?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const isDownRef = useRef(false);
  const isDraggingRef = useRef(false);

  const checkScroll = () => {
    const el = containerRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 2);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 2);
  };

  useEffect(() => {
    checkScroll();
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(checkScroll);
    ro.observe(el);

    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX) && el.scrollWidth > el.clientWidth) {
        const canLeft = el.scrollLeft > 0;
        const canRight = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
        if ((e.deltaY > 0 && canRight) || (e.deltaY < 0 && canLeft)) {
          e.preventDefault();
          el.scrollLeft += e.deltaY;
          checkScroll();
        }
      }
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      ro.disconnect();
      el.removeEventListener('wheel', onWheel);
    };
  }, []);

  useEffect(() => {
    if (!activeSelector) return;
    const el = containerRef.current;
    if (!el) return;
    const activeEl = el.querySelector(activeSelector) as HTMLElement | null;
    if (activeEl) {
      activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
      setTimeout(checkScroll, 200);
    }
  }, [activeSelector]);

  const onMouseDown = (e: MouseEvent) => {
    if (e.button !== 0) return;
    const el = containerRef.current;
    if (!el) return;
    isDownRef.current = true;
    const startX = e.pageX;
    const startScrollLeft = el.scrollLeft;
    isDraggingRef.current = false;

    const onMove = (ev: MouseEvent) => {
      if (!isDownRef.current || !containerRef.current) return;
      const dist = ev.pageX - startX;
      if (Math.abs(dist) > 3) {
        isDraggingRef.current = true;
      }
      containerRef.current.scrollLeft = startScrollLeft - dist * 1.2;
      checkScroll();
    };

    const onUp = () => {
      isDownRef.current = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      setTimeout(() => {
        isDraggingRef.current = false;
      }, 50);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };
  const onClickCapture = (e: MouseEvent) => {
    if (isDraggingRef.current) {
      e.stopPropagation();
      e.preventDefault();
    }
  };

  const slide = (direction: 'left' | 'right') => {
    const el = containerRef.current;
    if (!el) return;
    const amount = Math.min(el.clientWidth * 0.75, 240);
    el.scrollBy({ left: direction === 'left' ? -amount : amount, behavior: 'smooth' });
    setTimeout(checkScroll, 250);
  };

  return (
    <div class={cx('relative group', c)}>
      {canScrollLeft && (
        <div class="pointer-events-none absolute left-0 top-0 bottom-0 z-10 hidden sm:flex items-center pl-0.5 pr-6 bg-gradient-to-r from-bg via-bg/85 to-transparent">
          <button
            type="button"
            onClick={() => slide('left')}
            class="pointer-events-auto grid size-7 place-items-center rounded-full bg-card border border-line shadow-xs text-muted-fg hover:text-fg hover:bg-muted transition-all duration-150 cursor-pointer"
            aria-label="Geser filter ke kiri"
          >
            <CaretLeft size={14} weight="bold" />
          </button>
        </div>
      )}

      <div
        ref={containerRef}
        onScroll={checkScroll}
        onMouseDown={onMouseDown}

        onClickCapture={onClickCapture}
        class="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5 cursor-grab active:cursor-grabbing select-none"
      >
        {children}
      </div>

      {canScrollRight && (
        <div class="pointer-events-none absolute right-0 top-0 bottom-0 z-10 hidden sm:flex items-center pr-0.5 pl-6 bg-gradient-to-l from-bg via-bg/85 to-transparent">
          <button
            type="button"
            onClick={() => slide('right')}
            class="pointer-events-auto grid size-7 place-items-center rounded-full bg-card border border-line shadow-xs text-muted-fg hover:text-fg hover:bg-muted transition-all duration-150 cursor-pointer"
            aria-label="Geser filter ke kanan"
          >
            <CaretRight size={14} weight="bold" />
          </button>
        </div>
      )}
    </div>
  );
}
