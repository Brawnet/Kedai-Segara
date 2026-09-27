import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { ArrowSquareOut, ClipboardText, MagnifyingGlass, Package, Warning, X } from '@phosphor-icons/react';
import type { Icon } from '@phosphor-icons/react';
import { alurLabel, cocok, grupKat, katOf, nf, urutKat } from '../lib/format';
import type { Barang } from '../lib/types';
import { Banner, Button, Card, Input, PageTitle, Select, StockGauge, Tag } from '../components/ui';
import { DataTable, useAdmin, type Col } from './shared';

export const total = (b: Barang) => b.stok_dalam + b.stok_luar;
export const menipis = (b: Barang) => total(b) < b.ambang_min;

function Stat({ icon: I, label, value, tone }: { icon: Icon; label: string; value: string | number; tone: string }) {
  return (
    <Card class="flex flex-col items-start gap-2 p-4 sm:flex-row sm:items-center sm:gap-3">
      <span class={`grid size-10 shrink-0 place-items-center rounded-ctl sm:size-11 ${tone}`}>
        <I size={22} weight="bold" aria-hidden />
      </span>
      <div class="min-w-0">
        <p class="text-[13px] font-semibold leading-tight text-muted-fg">{label}</p>
        <p class={`num mt-0.5 font-extrabold leading-tight break-words ${typeof value === 'number' ? 'text-2xl' : 'text-base'}`}>{value}</p>
      </div>
    </Card>
  );
}

export function Dashboard() {
  const { d } = useAdmin();
  const [q, setQ] = useState('');
  const [kat, setKat] = useState('');
  const [onlyLow, setOnlyLow] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
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
    () => aktif.filter((b) => cocok(b, q) && (!onlyLow || menipis(b)) && (!kat || katOf(b) === kat)),
    [aktif, q, onlyLow, kat],
  );

  const hasFilter = Boolean(q.trim() || kat || onlyLow);
  const resetFilter = () => {
    setQ('');
    setKat('');
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
      {st.lewatHari ? (
        <Banner tone="danger">Rekap tertunda: {st.belumRekap} pengambilan belum direkap, ada yang dari hari sebelumnya.</Banner>
      ) : st.belumRekap ? (
        <Banner tone="warning">{st.belumRekap} pengambilan belum direkap.</Banner>
      ) : null}

      <PageTitle kicker="Ringkasan" title="Stok saat ini" />

      <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon={Package} label="Barang aktif" value={aktif.length} tone="bg-primary-soft text-primary" />
        <Stat icon={Warning} label="Stok menipis" value={low.length} tone="bg-warning-soft text-warning" />
        <Stat icon={ClipboardText} label="Belum direkap" value={st.belumRekap} tone="bg-danger-soft text-danger" />
        <Stat icon={ClipboardText} label="Rekap terakhir" value={st.lastRekap || 'Belum ada'} tone="bg-success-soft text-success" />
      </div>

      {low.length > 0 && (
        <Card class="p-4">
          <h2 class="flex items-center gap-2 font-bold text-warning">
            <Warning size={20} weight="fill" aria-hidden /> Stok menipis ({low.length})
          </h2>
          <ul class="mt-3 flex flex-wrap gap-2">
            {low.map((b) => (
              <li key={b.id} class="rounded-full border border-warning/30 bg-warning-soft px-3 py-1 text-sm">
                <span class="font-semibold">{b.nama}</span>{' '}
                <span class="num text-muted-fg">
                  {nf(total(b))}/{nf(b.ambang_min)} {b.satuan}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div class="flex flex-col gap-2.5 sm:flex-row sm:items-center">
        <label class="relative block flex-1">
          <span class="sr-only">Cari barang</span>
          <MagnifyingGlass size={20} class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-fg" aria-hidden />
          <Input
            ref={searchRef}
            type="search"
            value={q}
            onInput={(e) => setQ(e.currentTarget.value)}
            placeholder="Cari nama atau kode… (tekan /)"
            class="pl-10"
          />
        </label>

        <div class="w-full sm:w-56 shrink-0">
          <label class="sr-only" for="filter-kategori">Filter Kategori</label>
          <Select
            id="filter-kategori"
            value={kat}
            onChange={(e) => setKat(e.currentTarget.value)}
            class="min-h-11 font-medium text-sm"
          >
            <option value="">Semua Kategori ({aktif.length})</option>
            {kategoriList.map((k) => {
              const count = aktif.filter((b) => katOf(b) === k).length;
              return (
                <option key={k} value={k}>
                  {k} ({count})
                </option>
              );
            })}
          </Select>
        </div>

        <label class="flex min-h-11 cursor-pointer items-center gap-2 rounded-ctl border border-line bg-card px-3.5 font-semibold shrink-0 select-none hover:bg-muted/50 transition-colors">
          <input
            type="checkbox"
            checked={onlyLow}
            onChange={(e) => setOnlyLow(e.currentTarget.checked)}
            class="size-5 accent-primary cursor-pointer"
          />
          <span class="text-sm">Hanya menipis</span>
        </label>
      </div>

      {hasFilter && (
        <div class="flex flex-wrap items-center justify-between gap-2 rounded-ctl border border-line/70 bg-muted/60 px-3 py-2 text-xs">
          <div class="flex flex-wrap items-center gap-1.5 text-muted-fg">
            <span class="font-semibold text-fg">Filter aktif:</span>
            {q.trim() && (
              <span class="rounded bg-card px-2 py-0.5 font-medium text-fg border border-line">
                Kata kunci: "{q.trim()}"
              </span>
            )}
            {kat && (
              <span class="rounded bg-card px-2 py-0.5 font-medium text-fg border border-line">
                Kategori: {kat}
              </span>
            )}
            {onlyLow && (
              <span class="rounded bg-warning-soft px-2 py-0.5 font-medium text-warning border border-warning/30">
                Stok menipis
              </span>
            )}
            <span class="text-muted-fg">({list.length} barang cocok)</span>
          </div>
          <button
            type="button"
            onClick={resetFilter}
            class="inline-flex items-center gap-1 font-semibold text-primary hover:underline cursor-pointer select-none"
          >
            <X size={14} aria-hidden />
            <span>Reset filter</span>
          </button>
        </div>
      )}

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
        />
      )}
      <p class="text-sm text-muted-fg">
        Data tersimpan di{' '}
        <a href={d.url} target="_blank" rel="noopener" class="inline-flex items-center gap-1 font-semibold text-primary underline-offset-2 hover:underline">
          Google Sheet <ArrowSquareOut size={14} aria-hidden />
        </a>
        .
      </p>
    </div>
  );
}
