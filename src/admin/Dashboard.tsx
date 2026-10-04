import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import {
  ArrowSquareOut,
  BellSlash,
  ClipboardText,
  Eye,
  MagnifyingGlass,
  Package,
  Warning,
  X,
  type Icon,
} from '@phosphor-icons/react';
import { alurLabel, cocok, grupKat, katOf, menipis, nf, total, urutKat } from '../lib/format';
import type { Barang } from '../lib/types';
import { Banner, Button, Card, Input, MultiSelect, PageTitle, ScrollPills, StockGauge, Tag, cx } from '../components/ui';
import { DataTable, useAdmin, type Col } from './shared';
import { DetailBelumRekapDialog } from './DetailBelumRekapDialog';
import { clearRekapSnooze, getRekapSnoozeUntil } from '../lib/rekap-helpers';

export { total, menipis };

interface StatCardProps {
  icon: Icon;
  label: string;
  value: string | number;
  sublabel?: string;
  tone: string;
  active?: boolean;
  onClick?: () => void;
  badge?: string;
  badgeTone?: 'warning' | 'primary' | 'danger';
}

function StatCard({
  icon: I,
  label,
  value,
  sublabel,
  tone,
  active,
  onClick,
  badge,
  badgeTone = 'warning',
}: StatCardProps) {
  const isClickable = Boolean(onClick);
  const badgeClasses = {
    warning: 'bg-warning-soft text-warning border-warning/30',
    primary: 'bg-primary-soft text-primary border-primary/30',
    danger: 'bg-danger-soft text-danger border-danger/30',
  }[badgeTone];

  const content = (
    <>
      <div class="flex items-center justify-between gap-2">
        <span
          class={cx(
            'grid size-10 shrink-0 place-items-center rounded-xl text-sm transition-transform group-hover:scale-105',
            tone,
          )}
        >
          <I size={20} weight="bold" aria-hidden />
        </span>
        {badge && (
          <span class={cx('rounded-full border px-2 py-0.5 text-[10px] font-bold tracking-tight', badgeClasses)}>
            {badge}
          </span>
        )}
      </div>

      <div class="mt-2.5 min-w-0">
        <p class="truncate text-xs font-semibold text-muted-fg">{label}</p>
        <p
          class={cx(
            'num mt-0.5 font-extrabold tracking-tight truncate',
            typeof value === 'number' ? 'text-2xl text-fg' : 'text-sm sm:text-base font-bold text-fg',
          )}
        >
          {value}
        </p>
        {sublabel && <p class="mt-0.5 truncate text-[11px] font-medium text-muted-fg">{sublabel}</p>}
      </div>
    </>
  );

  const cardClasses = cx(
    'group relative flex flex-col justify-between p-3.5 sm:p-4 text-left transition-all duration-150 rounded-card border border-line bg-card shadow-sm',
    isClickable && 'cursor-pointer active:scale-[0.98] select-none hover:border-primary/50',
    active && 'ring-2 ring-primary border-primary bg-primary-soft/15 shadow-sm',
  );

  if (isClickable) {
    return (
      <button type="button" onClick={onClick} class={cardClasses}>
        {content}
      </button>
    );
  }
  return <div class={cardClasses}>{content}</div>;
}

export function Dashboard() {
  const { d } = useAdmin();
  const [q, setQ] = useState('');
  const [kat, setKat] = useState<string[]>([]);
  const [onlyLow, setOnlyLow] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const [modalDetailRekap, setModalDetailRekap] = useState(false);
  const [snoozeUntil, setSnoozeUntil] = useState(() => getRekapSnoozeUntil());
  const isSnoozed = snoozeUntil > Date.now();

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (
        e.key === '/' &&
        document.activeElement !== searchRef.current &&
        document.activeElement?.tagName !== 'INPUT' &&
        document.activeElement?.tagName !== 'TEXTAREA'
      ) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  const aktif = useMemo(() => d.barang.filter((b) => b.aktif), [d]);
  const low = useMemo(() => aktif.filter(menipis), [aktif]);
  const st = d.status;
  const kategoriList = useMemo(() => urutKat(aktif, d.urutan), [aktif, d.urutan]);
  const list = useMemo(
    () =>
      aktif.filter(
        (b) =>
          cocok(b, q) &&
          (!onlyLow || menipis(b)) &&
          (kat.length === 0 || kat.includes(katOf(b))),
      ),
    [aktif, q, onlyLow, kat],
  );

  const hasFilter = Boolean(q.trim() || kat.length > 0 || onlyLow);
  const resetFilter = () => {
    setQ('');
    setKat([]);
    setOnlyLow(false);
    searchRef.current?.focus();
  };

  const groupBadge = (g: { k: string; l: Barang[] }) => {
    const count = g.l.filter(menipis).length;
    if (count === 0) return null;
    return (
      <Tag tone="warning">
        <span class="inline-flex items-center gap-1 text-[11px] font-bold">
          <Warning size={13} weight="fill" aria-hidden />
          <span>{count} menipis</span>
        </span>
      </Tag>
    );
  };

  // Kartu khusus layar ponsel (iPhone 11-18) yang rapi, padat, dan bebas overflow
  const renderBarangCard = (b: Barang) => {
    const tot = total(b);
    const isLow = menipis(b);

    return (
      <div class="flex flex-col gap-3">
        {/* Header Baris Barang */}
        <div class="flex items-start justify-between gap-2">
          <div class="min-w-0 flex-1">
            <h4 class="text-[15px] font-bold leading-snug text-fg break-words">{b.nama}</h4>
          </div>
          <div class="flex shrink-0 items-center gap-1.5">
            {isLow ? (
              <Tag tone="warning">
                <span class="inline-flex items-center gap-1">
                  <Warning size={12} weight="fill" aria-hidden />
                  <span>Menipis</span>
                </span>
              </Tag>
            ) : null}
            <Tag tone="neutral">{alurLabel(b.alur)}</Tag>
          </div>
        </div>

        {/* Total Stok & Visual Gauge */}
        <div class="rounded-xl border border-line bg-muted/30 p-2.5">
          <div class="flex items-baseline justify-between gap-2">
            <span class="text-xs font-semibold text-muted-fg">Total Tersedia:</span>
            <div class="flex items-baseline gap-1">
              <span class={cx('num text-2xl font-black leading-none', isLow ? 'text-warning' : 'text-fg')}>
                {nf(tot)}
              </span>
              <span class="text-xs font-bold text-muted-fg">{b.satuan}</span>
            </div>
          </div>

          {b.ambang_min > 0 && (
            <div class="mt-2.5">
              <StockGauge current={tot} min={b.ambang_min} unit={b.satuan} class="w-full" />
            </div>
          )}
        </div>

        {/* Rincian Sub-Metrik (3 Kolom Micro-Grid) */}
        <div class="grid grid-cols-3 divide-x divide-line rounded-lg border border-line/70 bg-card py-2 text-center text-xs">
          <div class="px-1.5">
            <span class="block text-[11px] font-medium text-muted-fg">Stok Dalam</span>
            <span class="num mt-0.5 block font-bold text-fg">{nf(b.stok_dalam)}</span>
          </div>
          <div class="px-1.5">
            <span class="block text-[11px] font-medium text-muted-fg">Stok Luar</span>
            <span class="num mt-0.5 block font-bold text-fg">
              {b.alur === 'LUAR' || b.stok_luar ? nf(b.stok_luar) : '—'}
            </span>
          </div>
          <div class="px-1.5">
            <span class="block text-[11px] font-medium text-muted-fg">Batas Min</span>
            <span class="num mt-0.5 block font-bold text-fg">{nf(b.ambang_min)}</span>
          </div>
        </div>
      </div>
    );
  };

  const cols: Col<Barang>[] = [
    {
      label: 'Barang',
      cell: (b) => (
        <span class="flex flex-wrap items-center gap-2">
          <span class="font-semibold">{b.nama}</span>
          {menipis(b) && <Tag tone="warning">Menipis</Tag>}
        </span>
      ),
    },
    { label: 'Dalam', align: 'right', cell: (b) => nf(b.stok_dalam) },
    { label: 'Luar', align: 'right', cell: (b) => (b.alur === 'LUAR' || b.stok_luar ? nf(b.stok_luar) : '—') },
    {
      label: 'Total',
      align: 'right',
      cell: (b) => (
        <div class="flex flex-col items-end gap-1">
          <strong class={menipis(b) ? 'text-warning font-bold' : 'font-semibold'}>
            {nf(total(b))} {b.satuan}
          </strong>
          {b.ambang_min > 0 && (
            <StockGauge current={total(b)} min={b.ambang_min} unit={b.satuan} class="w-16 sm:w-20" />
          )}
        </div>
      ),
    },
    { label: 'Min', align: 'right', cell: (b) => nf(b.ambang_min) },
    { label: 'Alur', hideCompact: true, cell: (b) => <span class="text-sm text-muted-fg">{alurLabel(b.alur)}</span> },
  ];

  return (
    <div class="flex flex-col gap-6">
      {isSnoozed && (st.lewatHari || st.belumRekap > 0) ? (
        <div class="flex items-center justify-between gap-3 rounded-card border border-line bg-muted/40 px-3.5 py-2.5 text-xs text-muted-fg">
          <div class="flex items-center gap-2 min-w-0">
            <BellSlash size={16} weight="bold" class="text-primary shrink-0" aria-hidden />
            <span class="truncate">
              Pengingat rekap sedang disenyapkan ({st.belumRekap} pengambilan belum direkap).
            </span>
          </div>
          <div class="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => setModalDetailRekap(true)}
              class="font-semibold text-fg hover:underline cursor-pointer"
            >
              Lihat detail
            </button>
            <span class="text-line-strong">·</span>
            <button
              type="button"
              onClick={() => {
                clearRekapSnooze();
                setSnoozeUntil(0);
              }}
              class="font-bold text-primary hover:underline cursor-pointer"
            >
              Aktifkan kembali
            </button>
          </div>
        </div>
      ) : st.lewatHari ? (
        <Banner
          key={`rekap-danger-${st.belumRekap}`}
          tone="danger"
          action={
            <Button
              size="sm"
              variant="danger"
              class="h-9 min-h-9 px-3 text-xs font-semibold sm:text-sm whitespace-nowrap shadow-xs cursor-pointer"
              onClick={() => setModalDetailRekap(true)}
            >
              <Eye size={16} weight="bold" aria-hidden />
              <span>Lihat detail</span>
            </Button>
          }
        >
          Rekap tertunda: {st.belumRekap} pengambilan belum direkap, ada yang dari hari sebelumnya.
        </Banner>
      ) : st.belumRekap ? (
        <Banner
          key={`rekap-warning-${st.belumRekap}`}
          tone="warning"
          action={
            <Button
              size="sm"
              variant="secondary"
              class="h-9 min-h-9 px-3 text-xs font-semibold sm:text-sm whitespace-nowrap shadow-xs cursor-pointer"
              onClick={() => setModalDetailRekap(true)}
            >
              <Eye size={16} weight="bold" aria-hidden />
              <span>Lihat detail</span>
            </Button>
          }
        >
          {st.belumRekap} pengambilan belum direkap.
        </Banner>
      ) : null}

      <PageTitle kicker="Ringkasan" title="Stok saat ini" />

      {/* Bento Grid Ringkasan Interaktif */}
      <div class="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
        <StatCard
          icon={Package}
          label="Barang aktif"
          value={aktif.length}
          sublabel="Semua item terdaftar"
          tone="bg-primary-soft text-primary"
          onClick={() => {
            if (hasFilter) resetFilter();
          }}
          badge={hasFilter ? 'Reset' : undefined}
          badgeTone="primary"
        />
        <StatCard
          icon={Warning}
          label="Stok menipis"
          value={low.length}
          sublabel={low.length > 0 ? 'Perlu pengadaan' : 'Stok aman'}
          tone="bg-warning-soft text-warning"
          active={onlyLow}
          onClick={() => setOnlyLow(!onlyLow)}
          badge={onlyLow ? 'Filter Aktif' : low.length > 0 ? 'Perhatian' : undefined}
          badgeTone="warning"
        />
        <StatCard
          icon={ClipboardText}
          label="Belum direkap"
          value={st.belumRekap}
          sublabel={
            st.belumRekap > 0
              ? isSnoozed
                ? 'Disenyapkan 12j · Klik untuk buka'
                : 'Klik untuk lihat detail'
              : 'Semua tersinkron'
          }
          tone={
            st.belumRekap > 0
              ? isSnoozed
                ? 'bg-muted text-muted-fg'
                : 'bg-danger-soft text-danger'
              : 'bg-muted text-muted-fg'
          }
          badge={isSnoozed ? 'Ditunda 12j' : st.lewatHari ? 'Lewat hari' : undefined}
          badgeTone={isSnoozed ? 'primary' : 'danger'}
          onClick={st.belumRekap > 0 ? () => setModalDetailRekap(true) : undefined}
        />
        <StatCard
          icon={ClipboardText}
          label="Rekap terakhir"
          value={st.lastRekap || 'Belum ada'}
          sublabel="Waktu opname/rekap"
          tone="bg-success-soft text-success"
        />
      </div>

      {/* Pratinjau Cepat Barang Menipis (Scroll Horisontal) */}
      {low.length > 0 && (
        <Card class="p-3.5 sm:p-4">
          <div class="flex items-center justify-between gap-2">
            <h2 class="flex items-center gap-1.5 text-sm font-bold text-warning sm:text-base">
              <Warning size={18} weight="fill" aria-hidden />
              <span>Stok Menipis ({low.length})</span>
            </h2>
            <button
              type="button"
              onClick={() => setOnlyLow(!onlyLow)}
              class={cx(
                'inline-flex items-center gap-1 rounded-ctl px-2.5 py-1 text-xs font-bold transition-colors cursor-pointer select-none',
                onlyLow
                  ? 'bg-warning text-white'
                  : 'text-warning bg-warning-soft hover:bg-warning-soft/80',
              )}
            >
              <span>{onlyLow ? 'Buka Semua' : 'Filter di Tabel'}</span>
            </button>
          </div>

          <div class="mt-3 flex gap-2 overflow-x-auto no-scrollbar -mx-3.5 px-3.5 sm:mx-0 sm:px-0 sm:flex-wrap">
            {low.map((b) => {
              const isSelected = q === b.nama;
              return (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => {
                    if (isSelected) {
                      setQ('');
                    } else {
                      setQ(b.nama);
                    }
                  }}
                  class={cx(
                    'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition-all duration-150 cursor-pointer active:scale-95',
                    isSelected
                      ? 'border-warning bg-warning text-white shadow-sm'
                      : 'border-warning/30 bg-warning-soft text-warning hover:border-warning/50',
                  )}
                  title={`Klik untuk mencari ${b.nama}`}
                >
                  <span class="font-bold">{b.nama}</span>
                  <span class={cx('num text-[11px]', isSelected ? 'text-white/90' : 'text-warning/80')}>
                    {nf(total(b))}/{nf(b.ambang_min)} {b.satuan}
                  </span>
                </button>
              );
            })}
          </div>
        </Card>
      )}

      {/* Pill Kategori dengan Drag-to-scroll, Mouse Wheel, dan Tombol Slide */}
      <ScrollPills class="-mx-4 px-4 sm:mx-0 sm:px-0">
        <button
          onClick={() => setKat([])}
          class={cx(
            'inline-flex min-h-9 shrink-0 items-center rounded-full px-3.5 text-xs font-semibold transition-all duration-150 cursor-pointer active:scale-95',
            kat.length === 0
              ? 'bg-primary text-white shadow-sm'
              : 'border border-line bg-card text-muted-fg hover:border-line-strong hover:text-fg',
          )}
        >
          Semua ({aktif.length})
        </button>

        {kategoriList.map((k) => {
          const count = aktif.filter((b) => katOf(b) === k).length;
          const isSel = kat.includes(k);
          return (
            <button
              key={k}
              type="button"
              onClick={() =>
                setKat((prev) =>
                  prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k],
                )
              }
              class={cx(
                'inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-xs font-semibold transition-all duration-150 cursor-pointer active:scale-95',
                isSel
                  ? 'bg-primary text-white shadow-sm'
                  : 'border border-line bg-card text-muted-fg hover:border-line-strong hover:text-fg',
              )}
            >
              <span>{k}</span>
              <span class="num text-[11px] opacity-75">({count})</span>
            </button>
          );
        })}

        <button
          type="button"
          onClick={() => setOnlyLow(!onlyLow)}
          class={cx(
            'inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-xs font-semibold transition-all duration-150 cursor-pointer active:scale-95 border',
            onlyLow
              ? 'border-warning bg-warning text-white shadow-sm'
              : 'border-warning/30 bg-warning-soft text-warning hover:bg-warning-soft/80',
          )}
        >
          <Warning size={13} weight="fill" />
          <span>Menipis ({low.length})</span>
        </button>
      </ScrollPills>

      {/* Input Pencarian & Dropdown Kategori Desktop */}
      <div class="flex flex-col gap-2.5 sm:flex-row sm:items-center">
        <div class="relative flex-1">
          <label class="sr-only" for="search-barang">
            Cari barang
          </label>
          <MagnifyingGlass
            size={18}
            class="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-fg"
            aria-hidden
          />
          <Input
            id="search-barang"
            ref={searchRef}
            type="search"
            inputMode="search"
            enterKeyHint="search"
            autoCorrect="off"
            autoCapitalize="none"
            value={q}
            onInput={(e) => setQ(e.currentTarget.value)}
            placeholder="Cari nama atau kode barang… (tekan /)"
            class="min-h-11 pl-10 pr-9 text-sm rounded-xl"
          />
          {q && (
            <button
              type="button"
              onClick={() => {
                setQ('');
                searchRef.current?.focus();
              }}
              class="absolute right-2.5 top-1/2 -translate-y-1/2 flex size-7 items-center justify-center rounded-full text-muted-fg hover:bg-muted hover:text-fg cursor-pointer"
              aria-label="Hapus pencarian"
            >
              <X size={15} weight="bold" />
            </button>
          )}
        </div>

        {/* Dropdown filter untuk layar tablet/desktop */}
        <div class="hidden sm:block w-64 shrink-0">
          <label class="sr-only" for="filter-kategori">
            Filter Kategori
          </label>
          <MultiSelect
            id="filter-kategori"
            value={kat}
            onChange={setKat}
            options={kategoriList.map((k) => ({
              value: k,
              label: k,
              count: aktif.filter((b) => katOf(b) === k).length,
            }))}
            allLabel={`Semua Kategori (${aktif.length})`}
            placeholder="Pilih Kategori"
            class="w-full min-h-11 font-medium text-sm"
          />
        </div>
      </div>

      {/* Baris Ringkasan Filter Aktif */}
      {hasFilter && (
        <div class="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line/70 bg-muted/60 px-3.5 py-2 text-xs">
          <div class="flex flex-wrap items-center gap-1.5 text-muted-fg">
            <span class="font-semibold text-fg">Filter aktif:</span>
            {q.trim() && (
              <span class="rounded-md bg-card px-2 py-0.5 font-medium text-fg border border-line">
                Kata kunci: "{q.trim()}"
              </span>
            )}
            {kat.length > 0 && (
              <div class="flex flex-wrap items-center gap-1">
                {kat.map((k) => (
                  <span
                    key={k}
                    class="inline-flex items-center gap-1 rounded-md bg-card pl-2 pr-1.5 py-0.5 font-medium text-fg border border-line"
                  >
                    <span>Kategori: {k}</span>
                    <button
                      type="button"
                      onClick={() => setKat((prev) => prev.filter((x) => x !== k))}
                      class="text-muted-fg hover:text-danger cursor-pointer ml-0.5"
                      aria-label={`Hapus filter kategori ${k}`}
                    >
                      <X size={12} weight="bold" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            {onlyLow && (
              <span class="rounded-md bg-warning-soft px-2 py-0.5 font-medium text-warning border border-warning/30">
                Stok menipis
              </span>
            )}
            <span class="text-muted-fg">({list.length} barang cocok)</span>
          </div>
          <button
            type="button"
            onClick={resetFilter}
            class="inline-flex min-h-8 items-center gap-1 font-semibold text-primary hover:underline cursor-pointer select-none"
          >
            <X size={14} aria-hidden />
            <span>Reset filter</span>
          </button>
        </div>
      )}

      {/* Tabel & Daftar Kartu Barang */}
      {list.length === 0 ? (
        <div class="flex flex-col items-center justify-center gap-3 rounded-card border border-dashed border-line bg-card p-10 text-center">
          <p class="text-sm font-semibold text-fg">Tidak ada barang yang cocok dengan filter yang dipilih.</p>
          <p class="text-xs text-muted-fg">Coba ganti kata kunci atau pilih kategori lain.</p>
          <Button variant="secondary" size="sm" onClick={resetFilter}>
            Reset semua filter
          </Button>
        </div>
      ) : (
        <DataTable
          compact
          cols={cols}
          groups={grupKat(list, d.urutan)}
          rowKey={(b) => b.id}
          groupBadge={groupBadge}
          searchQuery={q}
          empty="Tidak ada barang yang cocok."
          renderCard={renderBarangCard}
        />
      )}

      <p class="text-xs sm:text-sm text-muted-fg">
        Data tersimpan di{' '}
        <a
          href={d.url}
          target="_blank"
          rel="noopener"
          class="inline-flex items-center gap-1 font-semibold text-primary underline-offset-2 hover:underline"
        >
          Google Sheet <ArrowSquareOut size={14} aria-hidden />
        </a>
        .
      </p>

      <DetailBelumRekapDialog
        open={modalDetailRekap}
        onClose={() => setModalDetailRekap(false)}
        onSnoozeChange={(snoozed) => setSnoozeUntil(snoozed ? getRekapSnoozeUntil() : 0)}
      />
    </div>
  );
}
