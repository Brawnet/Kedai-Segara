import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import {
  Archive,
  ArrowCounterClockwise,
  BowlFood,
  CheckCircle,
  FolderPlus,
  FolderSimple,
  MagnifyingGlass,
  Package,
  PencilSimple,
  Plus,
  ShieldCheck,
  Trash,
  Warning,
  X,
} from '@phosphor-icons/react';
import { alurLabel, cocok, grupKat, katOf, nf, parseNum, urutKat } from '../lib/format';
import type { Alur, Barang, BarangInput } from '../lib/types';
import { Banner, Button, Confirm, Dialog, Field, Input, PageTitle, Select, Tag, cx } from '../components/ui';
import { DataTable, useAdmin, type Col } from './shared';
import { KelolaKategoriDialog } from './KelolaKategoriDialog';

type Form = Required<Omit<BarangInput, 'ambang_min' | 'stok_awal' | 'opname_rekap'>> & {
  ambang_min: string;
  stok_awal: string;
  opname_rekap: boolean;
};
type StatusFilter = 'semua' | 'porsi' | 'aktif' | 'menipis' | 'arsip';

const kosong: Form = {
  id: '',
  nama: '',
  satuan: '',
  kategori: '',
  kode: '',
  catatan: '',
  alur: 'LUAR',
  ambang_min: '',
  aktif: true,
  stok_awal: '0',
  opname_rekap: true,
};

export function BarangPage() {
  const { d, A } = useAdmin();
  const [q, setQ] = useState('');
  const [kat, setKat] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('semua');
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

  const [f, setF] = useState<Form | null>(null);
  const [err, setErr] = useState<Partial<Record<keyof Form, string>>>({});
  const [extraKat, setExtraKat] = useState<string[]>([]);
  const [modalKat, setModalKat] = useState(false);

  const [modalHapus, setModalHapus] = useState<Barang | null>(null);

  const itemDiedit = useMemo(() => {
    return f?.id ? d.barang.find((x) => x.id === f.id) || null : null;
  }, [f?.id, d.barang]);

  const totalStokDiedit = itemDiedit ? itemDiedit.stok_dalam + itemDiedit.stok_luar : 0;
  const hasStockDiedit = totalStokDiedit > 0;

  const kats = useMemo(() => {
    const list = urutKat(d.barang, d.urutan);
    extraKat.forEach((k) => {
      if (!list.includes(k)) list.push(k);
    });
    return list;
  }, [d, extraKat]);

  const isMenipis = (b: Barang) => b.aktif && b.stok_dalam + b.stok_luar < b.ambang_min;
  const isPorsi = (b: Barang) => b.satuan.trim().toLowerCase() === 'porsi';

  const counts = useMemo(() => {
    const total = d.barang.length;
    const aktif = d.barang.filter((b) => b.aktif).length;
    const menipis = d.barang.filter(isMenipis).length;
    const arsip = d.barang.filter((b) => !b.aktif).length;

    const porsiItems = d.barang.filter((b) => b.aktif && isPorsi(b));
    const porsiGudang = porsiItems.reduce((acc, b) => acc + b.stok_dalam, 0);
    const porsiLuar = porsiItems.reduce((acc, b) => acc + b.stok_luar, 0);
    const totalPorsi = porsiGudang + porsiLuar;
    const porsiCount = porsiItems.length;

    return { total, aktif, menipis, arsip, totalPorsi, porsiGudang, porsiLuar, porsiCount };
  }, [d.barang]);


  const list = useMemo(() => {
    const query = q.trim().toLowerCase();
    return d.barang.filter((b) => {
      if (query && !cocok(b, query) && !b.kategori.toLowerCase().includes(query)) return false;
      if (kat && katOf(b) !== kat) return false;
      if (statusFilter === 'aktif' && !b.aktif) return false;
      if (statusFilter === 'arsip' && b.aktif) return false;
      if (statusFilter === 'porsi' && (!b.aktif || !isPorsi(b))) return false;
      if (statusFilter === 'menipis' && !isMenipis(b)) return false;
      return true;
    });
  }, [d.barang, q, kat, statusFilter]);

  const listPorsi = useMemo(() => {
    const items = list.filter((b) => b.aktif && isPorsi(b));
    const gudang = items.reduce((acc, b) => acc + b.stok_dalam, 0);
    const luar = items.reduce((acc, b) => acc + b.stok_luar, 0);
    return { total: gudang + luar, gudang, luar, count: items.length };
  }, [list]);

  const hasActiveFilter = Boolean(q || kat || statusFilter !== 'semua');
  const resetFilter = () => {
    setQ('');
    setKat('');
    setStatusFilter('semua');
  };

  const buka = (b?: Barang) => {
    setErr({});
    setF(
      b
        ? {
            ...b,
            ambang_min: String(b.ambang_min),
            stok_awal: '',
            opname_rekap: b.opname_rekap !== false,
          }
        : { ...kosong },
    );
  };
  const up = (p: Partial<Form>) => setF((x) => x && { ...x, ...p });

  const simpan = async (e: Event) => {
    e.preventDefault();
    if (!f) return;
    const er: typeof err = {};
    if (!f.nama.trim()) er.nama = 'Nama wajib diisi';
    if (!f.satuan.trim()) er.satuan = 'Satuan wajib diisi';
    const min = parseNum(f.ambang_min || '0');
    if (isNaN(min) || min < 0) er.ambang_min = 'Ambang minimum tidak boleh negatif';
    if (!f.id) {
      const awal = parseNum(f.stok_awal || '0');
      if (isNaN(awal) || awal < 0) er.stok_awal = 'Stok awal tidak boleh negatif';
    }
    setErr(er);
    if (Object.keys(er).length) return;
    const o: BarangInput = {
      ...f,
      id: f.id || '',
      stok_awal: f.id ? undefined : f.stok_awal,
      opname_rekap: f.opname_rekap !== false,
    };
    if (await A('simpanBarang', [o], 'Barang disimpan')) setF(null);
  };

  const cols: Col<Barang>[] = [
    {
      label: 'Barang',
      cell: (b) => {
        const menipis = isMenipis(b);
        return (
          <div class="min-w-[180px] max-w-sm py-0.5">
            <span class="flex flex-wrap items-center gap-1.5">
              <span class="font-bold text-fg text-sm sm:text-base leading-snug">{b.nama}</span>
              {b.kode && (
                <span class="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-mono font-bold bg-muted text-muted-fg border border-line">
                  {b.kode}
                </span>
              )}
              {!b.aktif && <Tag tone="danger">Arsip</Tag>}
              {menipis && (
                <Tag tone="warning">
                  <Warning size={12} weight="bold" class="mr-1 inline" aria-hidden /> Menipis
                </Tag>
              )}
            </span>
            {b.catatan && <p class="text-xs font-normal text-muted-fg mt-0.5 line-clamp-1">{b.catatan}</p>}
          </div>
        );
      },
    },
    {
      label: 'Satuan',
      align: 'center',
      cell: (b) => (
        <span class="inline-flex items-center justify-center text-xs font-semibold text-muted-fg px-2.5 py-0.5 rounded-full bg-muted border border-line whitespace-nowrap">
          {b.satuan}
        </span>
      ),
    },
    {
      label: 'Gudang',
      align: 'center',
      cell: (b) => (
        <span class="num font-bold text-primary text-sm sm:text-[15px]">
          {nf(b.stok_dalam)}
        </span>
      ),
    },
    {
      label: 'Luar',
      align: 'center',
      cell: (b) => (
        <span class="num font-semibold text-fg text-sm sm:text-[15px]">
          {nf(b.stok_luar)}
        </span>
      ),
    },
    {
      label: 'Total',
      align: 'center',
      cell: (b) => {
        const menipis = isMenipis(b);
        const total = b.stok_dalam + b.stok_luar;
        return (
          <span
            class={cx(
              'inline-flex items-center justify-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold num border whitespace-nowrap',
              menipis
                ? 'bg-warning-soft text-warning border-warning/40'
                : 'bg-muted text-fg border-line'
            )}
          >
            {menipis && <Warning size={12} weight="bold" class="shrink-0" aria-hidden />}
            <span>{nf(total)}</span>
            <span class={menipis ? 'text-warning/80 font-normal' : 'text-muted-fg font-normal'}>{b.satuan}</span>
          </span>
        );
      },
    },
    {
      label: 'Min',
      align: 'center',
      cell: (b) => (
        <span class="num text-sm text-muted-fg font-medium">
          {nf(b.ambang_min)}
        </span>
      ),
    },
    {
      label: 'Alur',
      align: 'center',
      cell: (b) => (
        <span class="inline-flex items-center justify-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-muted border border-line text-muted-fg whitespace-nowrap">
          {alurLabel(b.alur)}
        </span>
      ),
    },
    {
      label: ' ',
      bare: true,
      align: 'right',
      cell: (b) => (
        <div class="flex items-center justify-end gap-1.5 whitespace-nowrap">
          {!b.aktif && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => A('simpanBarang', [{ ...b, aktif: true }], `Barang "${b.nama}" diaktifkan kembali`)}
              aria-label={`Aktifkan kembali ${b.nama}`}
              title="Aktifkan kembali"
            >
              <ArrowCounterClockwise size={16} aria-hidden />
              <span class="hidden xl:inline">Aktifkan</span>
            </Button>
          )}
          <Button size="sm" onClick={() => buka(b)} aria-label={`Edit ${b.nama}`}>
            <PencilSimple size={16} aria-hidden /> Edit
          </Button>
          <Button
            size="sm"
            variant="danger-ghost"
            onClick={() => setModalHapus(b)}
            aria-label={`Hapus ${b.nama}`}
            title="Hapus barang"
          >
            <Trash size={16} aria-hidden />
          </Button>
        </div>
      ),
    },
  ];

  const renderCardMobile = (b: Barang) => {
    const menipis = isMenipis(b);
    const porsi = isPorsi(b);
    const total = b.stok_dalam + b.stok_luar;
    return (
      <div
        class={`rounded-card border transition-all duration-150 p-3.5 sm:p-4 flex flex-col gap-3 shadow-xs ${
          !b.aktif
            ? 'border-line/70 bg-muted/40 opacity-75'
            : menipis
              ? 'border-warning/60 bg-warning-soft/10'
              : 'border-line bg-card'
        }`}
      >
        {/* Baris 1: Judul Barang, Tag & Kategori */}
        <div class="flex items-start justify-between gap-2">
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-1.5 flex-wrap">
              <h3 class="font-bold text-[15px] sm:text-base text-fg leading-snug break-words">
                {b.nama}
              </h3>
              {b.kode && (
                <span class="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-mono font-bold bg-muted text-muted-fg border border-line">
                  {b.kode}
                </span>
              )}
              {porsi && (
                <Tag tone="primary">
                  <BowlFood size={13} weight="bold" class="mr-1 inline" aria-hidden />
                  {nf(total)} Porsi
                </Tag>
              )}
              {!b.aktif && <Tag tone="danger">Arsip</Tag>}
              {menipis && (
                <Tag tone="warning">
                  <Warning size={12} weight="bold" class="mr-1 inline" aria-hidden /> Menipis
                </Tag>
              )}
            </div>
            {b.catatan && (
              <p class="text-xs text-muted-fg mt-1 line-clamp-2">
                {b.catatan}
              </p>
            )}
          </div>

          {/* Kategori Badge */}
          <span
            class="shrink-0 inline-flex items-center rounded-full bg-primary-soft/80 border border-primary/20 px-2.5 py-0.5 text-xs font-semibold text-primary max-w-[130px] truncate"
            title={b.kategori}
          >
            {katOf(b)}
          </span>
        </div>

        {/* Baris 2: Context Stock Mini-Grid (3 Kolom Ergonomis) */}
        <div class="grid grid-cols-3 gap-2 bg-muted/60 p-2.5 rounded-ctl border border-line/70 text-center text-xs">
          <div class="flex flex-col">
            <span class="text-[11px] text-muted-fg font-medium">Gudang</span>
            <span class="font-extrabold text-sm text-fg num">{nf(b.stok_dalam)}</span>
            <span class="text-[10px] text-muted-fg">{b.satuan}</span>
          </div>
          <div class="flex flex-col border-x border-line/60">
            <span class="text-[11px] text-muted-fg font-medium">Luar / Dapur</span>
            <span class="font-semibold text-sm text-fg num">
              {nf(b.stok_luar)}
            </span>
            <span class="text-[10px] text-muted-fg">{b.satuan}</span>
          </div>
          <div class="flex flex-col">
            <span class="text-[11px] text-muted-fg font-medium">{porsi ? 'Total Porsi' : 'Min. Ambang'}</span>
            <span class={cx('font-bold text-sm num', menipis ? 'text-warning font-extrabold' : 'text-fg')}>
              {porsi ? nf(total) : nf(b.ambang_min)}
            </span>
            <span class="text-[10px] text-muted-fg">{b.satuan}</span>
          </div>
        </div>

        {/* Total & Ambang Info Bar */}
        <div class="flex items-center justify-between rounded-ctl px-2.5 py-1 text-[11px] font-semibold bg-muted border border-line">
          <span class="inline-flex items-center gap-1 text-fg">
            Total stok: <strong class="num text-primary font-extrabold">{nf(total)} {b.satuan}</strong>
          </span>
          <span class={menipis ? 'text-warning font-bold' : 'text-muted-fg'}>
            Ambang min: {nf(b.ambang_min)} {b.satuan}
          </span>
        </div>
        {/* Baris 3: Tombol Aksi Thumb-Friendly (Apple HIG min-h-11) */}
        <div class="flex items-center gap-2 pt-2 border-t border-line/60">
          {!b.aktif && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => A('simpanBarang', [{ ...b, aktif: true }], `Barang "${b.nama}" diaktifkan kembali`)}
              aria-label={`Aktifkan kembali ${b.nama}`}
              title="Aktifkan kembali"
              class="flex-1 min-h-11 text-xs sm:text-sm font-semibold"
            >
              <ArrowCounterClockwise size={18} weight="bold" aria-hidden />
              <span>Aktifkan</span>
            </Button>
          )}
          <Button
            size="sm"
            variant="secondary"
            onClick={() => buka(b)}
            aria-label={`Edit ${b.nama}`}
            class="flex-1 min-h-11 text-xs sm:text-sm font-semibold"
          >
            <PencilSimple size={18} weight="bold" aria-hidden />
            <span>Edit</span>
          </Button>
          <Button
            size="sm"
            variant="danger-ghost"
            onClick={() => setModalHapus(b)}
            aria-label={`Hapus ${b.nama}`}
            title="Hapus barang"
            class="size-11 min-h-11 min-w-11 p-0 shrink-0 text-danger hover:bg-danger-soft flex items-center justify-center rounded-ctl"
          >
            <Trash size={18} weight="bold" aria-hidden />
          </Button>
        </div>
      </div>
    );
  };

  return (
    <div class="flex flex-col gap-5 sm:gap-6">
      {/* Header Utama & CTA Tambah Barang */}
      <PageTitle
        kicker="Master Data"
        title="Barang"
        sub={
          <span>
            {counts.aktif} aktif · {counts.arsip} diarsipkan ·{' '}
            <strong class="text-primary font-bold">{nf(counts.totalPorsi)} total porsi</strong>
            <span class="hidden sm:inline text-muted-fg"> ({nf(counts.porsiGudang)} gudang · {nf(counts.porsiLuar)} dapur)</span>
          </span>
        }
        actions={
          <div class="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setModalKat(true)}
              class="flex-1 sm:flex-initial min-h-11 font-semibold"
              title="Kelola & hapus kategori"
            >
              <FolderSimple size={20} weight="bold" aria-hidden />
              <span>Kelola Kategori</span>
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={() => buka()}
              class="flex-1 sm:flex-initial min-h-11 font-semibold"
            >
              <Plus size={20} weight="bold" aria-hidden />
              <span>Tambah barang</span>
            </Button>
          </div>
        }
      />

      {/* Bento Metric Cards (Filter Status Instan untuk Layar Mobile) */}
      <div class="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5 sm:gap-3" role="group" aria-label="Ringkasan dan filter status barang">
        {/* Card 1: Total Porsi (Hero Card di Mobile) */}
        <button
          type="button"
          onClick={() => setStatusFilter((curr) => (curr === 'porsi' ? 'semua' : 'porsi'))}
          class={cx(
            'col-span-2 sm:col-span-1 flex items-center gap-3 p-3 sm:p-3.5 rounded-card border transition-all text-left cursor-pointer select-none',
            statusFilter === 'porsi'
              ? 'border-primary ring-2 ring-primary/20 bg-primary-soft/60'
              : 'border-primary/30 bg-primary-soft/20 hover:border-primary/60 hover:bg-primary-soft/40'
          )}
          aria-pressed={statusFilter === 'porsi'}
        >
          <div class="flex size-10 shrink-0 items-center justify-center rounded-ctl bg-primary text-white shadow-xs">
            <BowlFood size={20} weight="bold" aria-hidden />
          </div>
          <div class="min-w-0 flex-1">
            <div class="flex items-baseline gap-1.5">
              <span class="num text-xl sm:text-2xl font-extrabold tracking-tight text-primary">{nf(counts.totalPorsi)}</span>
              <span class="text-xs font-bold text-primary">Porsi</span>
            </div>
            <div class="truncate text-[11px] font-semibold text-muted-fg">
              {nf(counts.porsiGudang)} gudang · {nf(counts.porsiLuar)} dapur
            </div>
          </div>
        </button>

        {/* Card 2: Semua Barang */}
        <button
          type="button"
          onClick={() => setStatusFilter('semua')}
          class={cx(
            'flex items-center gap-3 p-3 sm:p-3.5 rounded-card border transition-all text-left cursor-pointer select-none',
            statusFilter === 'semua'
              ? 'border-primary ring-2 ring-primary/20 bg-primary-soft/30'
              : 'border-line bg-card hover:border-line-strong'
          )}
          aria-pressed={statusFilter === 'semua'}
        >
          <div class="flex size-10 shrink-0 items-center justify-center rounded-ctl bg-muted text-fg">
            <Package size={20} weight="bold" aria-hidden />
          </div>
          <div class="min-w-0 flex-1">
            <div class="num text-xl font-extrabold tracking-tight text-fg">{counts.total}</div>
            <div class="truncate text-xs font-semibold text-muted-fg">Semua Barang</div>
          </div>
        </button>

        {/* Card 3: Aktif */}
        <button
          type="button"
          onClick={() => setStatusFilter((curr) => (curr === 'aktif' ? 'semua' : 'aktif'))}
          class={cx(
            'flex items-center gap-3 p-3 sm:p-3.5 rounded-card border transition-all text-left cursor-pointer select-none',
            statusFilter === 'aktif'
              ? 'border-primary ring-2 ring-primary/20 bg-primary-soft/30'
              : 'border-line bg-card hover:border-line-strong'
          )}
          aria-pressed={statusFilter === 'aktif'}
        >
          <div class="flex size-10 shrink-0 items-center justify-center rounded-ctl bg-primary-soft text-primary">
            <CheckCircle size={20} weight="bold" aria-hidden />
          </div>
          <div class="min-w-0 flex-1">
            <div class="num text-xl font-extrabold tracking-tight text-fg">{counts.aktif}</div>
            <div class="truncate text-xs font-semibold text-muted-fg">Aktif</div>
          </div>
        </button>

        {/* Card 4: Menipis */}
        <button
          type="button"
          onClick={() => setStatusFilter((curr) => (curr === 'menipis' ? 'semua' : 'menipis'))}
          class={cx(
            'flex items-center gap-3 p-3 sm:p-3.5 rounded-card border transition-all text-left cursor-pointer select-none',
            statusFilter === 'menipis'
              ? 'border-warning ring-2 ring-warning/25 bg-warning-soft/40'
              : counts.menipis > 0
                ? 'border-warning/50 bg-warning-soft/10 hover:border-warning'
                : 'border-line bg-card hover:border-line-strong'
          )}
          aria-pressed={statusFilter === 'menipis'}
        >
          <div class={cx('flex size-10 shrink-0 items-center justify-center rounded-ctl', counts.menipis > 0 ? 'bg-warning-soft text-warning' : 'bg-muted text-muted-fg')}>
            <Warning size={20} weight="bold" aria-hidden />
          </div>
          <div class="min-w-0 flex-1">
            <div class={cx('num text-xl font-extrabold tracking-tight', counts.menipis > 0 ? 'text-warning' : 'text-fg')}>
               {counts.menipis}
            </div>
            <div class="truncate text-xs font-semibold text-muted-fg">Stok Menipis</div>
          </div>
        </button>

        {/* Card 5: Diarsipkan */}
        <button
          type="button"
          onClick={() => setStatusFilter((curr) => (curr === 'arsip' ? 'semua' : 'arsip'))}
          class={cx(
            'flex items-center gap-3 p-3 sm:p-3.5 rounded-card border transition-all text-left cursor-pointer select-none',
            statusFilter === 'arsip'
              ? 'border-line-strong ring-2 ring-line-strong/20 bg-muted'
              : 'border-line bg-card hover:border-line-strong'
          )}
          aria-pressed={statusFilter === 'arsip'}
        >
          <div class="flex size-10 shrink-0 items-center justify-center rounded-ctl bg-muted text-muted-fg">
            <Archive size={20} weight="bold" aria-hidden />
          </div>
          <div class="min-w-0 flex-1">
            <div class="num text-xl font-extrabold tracking-tight text-fg">{counts.arsip}</div>
            <div class="truncate text-xs font-semibold text-muted-fg">Diarsipkan</div>
          </div>
        </button>
      </div>

      {/* Toolbar Pencarian & Filter Kategori */}
      <div class="flex flex-col gap-2.5">
        <div class="flex flex-col gap-2.5 sm:flex-row sm:items-center">
          <div class="relative flex-1">
            <label class="sr-only" for="search-barang">Cari barang</label>
            <MagnifyingGlass size={20} class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-fg" aria-hidden />
            <Input
              id="search-barang"
              ref={searchRef}
              type="search"
              inputmode="search"
              autocomplete="off"
              value={q}
              onInput={(e) => setQ(e.currentTarget.value)}
              placeholder="Cari nama, kode, atau kategori…"
              class="pl-10 pr-9 min-h-11 text-base"
            />
            {q && (
              <button
                type="button"
                onClick={() => {
                  setQ('');
                  searchRef.current?.focus();
                }}
                class="absolute right-2 top-1/2 -translate-y-1/2 inline-flex size-9 items-center justify-center rounded-ctl text-muted-fg hover:bg-black/5 hover:text-fg dark:hover:bg-white/10"
                aria-label="Bersihkan pencarian"
              >
                <X size={17} weight="bold" aria-hidden />
              </button>
            )}
          </div>
          <div class="hidden sm:block w-56 shrink-0">
            <label class="sr-only" for="barang-kat-filter">Filter Kategori</label>
            <Select
              id="barang-kat-filter"
              value={kat}
              onChange={(e) => setKat(e.currentTarget.value)}
              class="min-h-11 font-medium text-sm"
            >
              <option value="">Semua Kategori ({d.barang.length})</option>
              {urutKat(d.barang, d.urutan).map((k) => (
                <option key={k} value={k}>
                  {k} ({d.barang.filter((b) => katOf(b) === k).length})
                </option>
              ))}
            </Select>
          </div>
        </div>

        {/* Horizontal Scrolling Category Carousel untuk Sentuhan Jempol Cepat */}
        <div class="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5 -mx-1 px-1" role="tablist" aria-label="Filter kategori barang">
          <button
            type="button"
            role="tab"
            aria-selected={!kat}
            onClick={() => setKat('')}
            class={cx(
              'shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors duration-150 min-h-9 select-none cursor-pointer',
              !kat
                ? 'bg-primary text-white shadow-xs'
                : 'bg-muted text-muted-fg hover:bg-line hover:text-fg'
            )}
          >
            <span>Semua</span>
            <span class={cx('rounded-full px-1.5 py-0.5 text-[10px] font-bold', !kat ? 'bg-white/20 text-white' : 'bg-line/70 text-fg')}>
              {d.barang.length}
            </span>
          </button>
          {urutKat(d.barang, d.urutan).map((k) => {
            const count = d.barang.filter((b) => katOf(b) === k).length;
            const active = kat === k;
            return (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setKat(active ? '' : k)}
                class={cx(
                  'shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors duration-150 min-h-9 select-none cursor-pointer',
                  active
                    ? 'bg-primary text-white shadow-xs'
                    : 'bg-muted text-muted-fg hover:bg-line hover:text-fg'
                )}
              >
                <span>{k}</span>
                <span class={cx('rounded-full px-1.5 py-0.5 text-[10px] font-bold', active ? 'bg-white/20 text-white' : 'bg-line/70 text-fg')}>
                  {count}
                </span>
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setModalKat(true)}
            class="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold text-muted-fg border border-dashed border-line hover:border-primary hover:text-primary transition-colors min-h-9 select-none cursor-pointer"
            title="Kelola & hapus kategori"
            aria-label="Kelola dan hapus kategori"
          >
            <FolderSimple size={14} weight="bold" aria-hidden />
            <span>Kelola</span>
          </button>
        </div>

        {/* Filter Summary & Quick Reset */}
        {hasActiveFilter && (
          <div class="flex flex-wrap items-center justify-between gap-2 px-1 text-xs text-muted-fg">
            <span>
              Menampilkan <strong>{list.length}</strong> dari {d.barang.length} barang
              {listPorsi.total > 0 && (
                <span class="font-semibold text-primary"> · {nf(listPorsi.total)} porsi ({nf(listPorsi.gudang)} gudang · {nf(listPorsi.luar)} dapur)</span>
              )}
              {statusFilter !== 'semua' && <span class="capitalize font-semibold text-fg"> · Status: {statusFilter}</span>}
              {kat && <span> · Kategori: <strong class="text-fg">{kat}</strong></span>}
            </span>
            <button
              type="button"
              onClick={resetFilter}
              class="inline-flex items-center gap-1 font-semibold text-primary hover:text-primary-hover underline underline-offset-2 cursor-pointer ml-auto"
            >
              <X size={13} weight="bold" aria-hidden /> Reset filter
            </button>
          </div>
        )}
      </div>

      {/* Tabel Desktop & Kartu Mobile */}
      <DataTable
        compact
        cols={cols}
        groups={grupKat(list, d.urutan)}
        rowKey={(b) => b.id}
        rowClass={(b) => (b.aktif ? '' : 'opacity-70')}
        searchQuery={q}
        groupBadge={(g) => {
          const low = g.l.filter(isMenipis).length;
          const porsiItems = g.l.filter((b) => b.aktif && isPorsi(b));
          const totalPorsiGroup = porsiItems.reduce((acc, b) => acc + b.stok_dalam + b.stok_luar, 0);
          return (
            <div class="flex items-center gap-1.5">
              {totalPorsiGroup > 0 && (
                <Tag tone="primary">
                  <BowlFood size={13} weight="bold" class="mr-1 inline" aria-hidden />
                  {nf(totalPorsiGroup)} porsi
                </Tag>
              )}
              {low > 0 && (
                <Tag tone="warning">
                  {low} menipis
                </Tag>
              )}
            </div>
          );
        }}
        renderCard={renderCardMobile}
        empty={hasActiveFilter ? 'Tidak ada barang yang cocok dengan filter saat ini.' : 'Tidak ada barang.'}
      />

      {/* Dialog Tambah / Edit Barang */}
      <Dialog
        open={!!f}
        onClose={() => setF(null)}
        title={f?.id ? `Edit: ${f.nama || itemDiedit?.nama || 'Barang'}` : 'Tambah Barang Baru'}
        wide
        footer={
          <div class="flex w-full flex-col-reverse gap-2.5 sm:flex-row sm:items-center sm:justify-between">
            {f?.id ? (
              <Button
                variant="danger-ghost"
                type="button"
                onClick={() => {
                  const target = d.barang.find((x) => x.id === f.id);
                  if (target) setModalHapus(target);
                }}
                class="w-full sm:w-auto text-danger hover:bg-danger-soft justify-center min-h-11"
              >
                <Trash size={18} aria-hidden /> Hapus barang
              </Button>
            ) : (
              <div class="hidden sm:block" />
            )}
            <div class="flex items-center gap-2 w-full sm:w-auto">
              <Button type="button" onClick={() => setF(null)} class="flex-1 sm:flex-initial min-h-11">
                Batal
              </Button>
              <Button variant="primary" guard type="submit" form="form-barang" class="flex-1 sm:flex-initial min-h-11 px-5">
                <CheckCircle size={18} weight="bold" aria-hidden />
                <span>{f?.id ? 'Simpan Perubahan' : 'Tambah Barang'}</span>
              </Button>
            </div>
          </div>
        }
      >
        {f && (
          <form id="form-barang" onSubmit={simpan} class="flex flex-col gap-3.5" noValidate>
            {/* Ringkasan Konteks Stok Saat Ini (Edit Mode) */}
            {f.id && itemDiedit && (
              <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5 rounded-xl border border-line bg-muted/60 px-3 py-2 text-xs">
                <div class="flex items-center gap-2 flex-wrap">
                  <span class="font-bold text-fg text-sm">{itemDiedit.nama}</span>
                  {itemDiedit.kode && (
                    <span class="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-mono font-bold bg-card text-muted-fg border border-line">
                      {itemDiedit.kode}
                    </span>
                  )}
                  <Tag tone={f.aktif ? 'success' : 'neutral'}>
                    {f.aktif ? 'Aktif' : 'Arsip'}
                  </Tag>
                </div>
                <div class="flex items-center gap-1.5 text-muted-fg font-medium flex-wrap">
                  <span>Stok tercatat:</span>
                  <span class="font-bold text-fg num">{nf(itemDiedit.stok_dalam)}</span> gudang
                  <span>·</span>
                  <span class="font-bold text-fg num">
                    {nf(itemDiedit.stok_luar)} luar/dapur
                  </span>
                  <span>·</span>
                  <span>
                    Total: <strong class="text-primary font-bold num">{nf(totalStokDiedit)} {itemDiedit.satuan}</strong>
                  </span>
                </div>
              </div>
            )}

            {/* Bagian 1: Identitas Barang */}
            <div class="grid gap-3 sm:grid-cols-2">
              <Field label="Nama Barang" error={err.nama} class="sm:col-span-2">
                {(id, dId) => (
                  <Input
                    id={id}
                    value={f.nama}
                    onInput={(e) => up({ nama: e.currentTarget.value })}
                    aria-invalid={!!err.nama}
                    aria-describedby={dId}
                    placeholder="Contoh: Ayam Suwir, Daging Sapi Slice 500g"
                    class="min-h-11 text-base font-medium"
                  />
                )}
              </Field>
              <Field label="Kode Barang (Opsional)" hint="Singkatan pencarian cepat">
                {(id, dId) => (
                  <Input
                    id={id}
                    value={f.kode}
                    onInput={(e) => up({ kode: e.currentTarget.value.toUpperCase() })}
                    aria-describedby={dId}
                    autocomplete="off"
                    placeholder="mis. AS"
                    class="min-h-11 text-base uppercase font-mono"
                  />
                )}
              </Field>
              <Field label="Satuan" error={err.satuan} hint="Satuan hitung stok">
                {(id, dId) => (
                  <Input
                    id={id}
                    value={f.satuan}
                    onInput={(e) => up({ satuan: e.currentTarget.value })}
                    placeholder="mis. Porsi, Pack, Kg, Pcs"
                    aria-invalid={!!err.satuan}
                    aria-describedby={dId}
                    class="min-h-11 text-base"
                  />
                )}
              </Field>
              <Field label="Kategori" class="sm:col-span-2">
                {(id) => (
                  <div class="flex flex-col gap-2">
                    <div class="flex gap-2">
                      <div class="relative min-w-0 flex-1">
                        <Select
                          id={id}
                          value={f.kategori}
                          onChange={(e) => {
                            const val = e.currentTarget.value;
                            if (val === '__KELOLA__') {
                              setModalKat(true);
                            } else {
                              up({ kategori: val });
                            }
                          }}
                          class="min-h-11 text-base w-full"
                        >
                          <option value="">-- Pilih Kategori --</option>
                          {kats.map((k) => (
                            <option key={k} value={k}>
                              {k}
                            </option>
                          ))}
                          {f.kategori && !kats.includes(f.kategori) && (
                            <option value={f.kategori}>{f.kategori} (Kustom)</option>
                          )}
                          <option value="__KELOLA__">+ Kelola / Buat Kategori Baru...</option>
                        </Select>
                      </div>
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => setModalKat(true)}
                        class="shrink-0 px-3 whitespace-nowrap min-h-11"
                        title="Kelola Kategori"
                      >
                        <FolderPlus size={18} weight="bold" class="text-primary" aria-hidden />
                        <span class="hidden sm:inline">Kelola Kategori</span>
                        <span class="sm:hidden">Kelola</span>
                      </Button>
                    </div>

                    {/* Quick Category Chips: sleek single-line horizontal scroll */}
                    {kats.length > 0 && (
                      <div class="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
                        <span class="text-[11px] font-semibold text-muted-fg shrink-0 mr-0.5">Pilih cepat:</span>
                        {kats.map((k) => {
                          const sel = f.kategori === k;
                          return (
                            <button
                              key={k}
                              type="button"
                              onClick={() => up({ kategori: k })}
                              class={cx(
                                'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors cursor-pointer select-none',
                                sel
                                  ? 'bg-primary text-white font-bold shadow-xs'
                                  : 'bg-muted text-fg hover:bg-primary-soft hover:text-primary'
                              )}
                            >
                              {k}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </Field>
            </div>

            {/* Bagian 2: Pengaturan Alur & Stok */}
            <div class="pt-2.5 border-t border-line">
              <div class="grid gap-3 sm:grid-cols-2">
                <Field label="Alur Stok" hint="Sistem pergerakan barang saat diambil">
                  {(id) => (
                    <Select
                      id={id}
                      value={f.alur}
                      onChange={(e) => up({ alur: e.currentTarget.value as Alur })}
                      class="min-h-11 text-base"
                    >
                      <option value="LUAR">Masuk Dapur (Stock Luar) & Direkap</option>
                    </Select>
                  )}
                </Field>
                <Field
                  label="Ambang Minimum"
                  hint="Peringatan jika total stok di bawah angka ini"
                  error={err.ambang_min}
                >
                  {(id, dId) => (
                    <Input
                      id={id}
                      inputmode="decimal"
                      value={f.ambang_min}
                      onInput={(e) => up({ ambang_min: e.currentTarget.value })}
                      aria-invalid={!!err.ambang_min}
                      aria-describedby={dId}
                      placeholder="0"
                      class="num min-h-11 text-base"
                    />
                  )}
                </Field>
                {f.id ? (
                  <Field
                    label="Status Barang"
                    hint={
                      hasStockDiedit
                        ? `Nolkan stok (${nf(totalStokDiedit)} ${itemDiedit?.satuan || ''}) untuk mengarsipkan.`
                        : 'Arsip menyembunyikan barang dari operasional.'
                    }
                  >
                    {(id, dId) => (
                      <Select
                        id={id}
                        value={f.aktif ? '1' : '0'}
                        onChange={(e) => up({ aktif: e.currentTarget.value === '1' })}
                        aria-describedby={dId}
                        class="min-h-11 text-base"
                      >
                        <option value="1">Aktif</option>
                        <option value="0" disabled={hasStockDiedit}>
                          Diarsipkan {hasStockDiedit ? '(Stok masih ada)' : ''}
                        </option>
                      </Select>
                    )}
                  </Field>
                ) : (
                  <Field
                    label="Stok Awal Gudang"
                    hint="Jumlah stok awal saat item baru dicatat"
                    error={err.stok_awal}
                  >
                    {(id, dId) => (
                      <Input
                        id={id}
                        inputmode="decimal"
                        value={f.stok_awal}
                        onInput={(e) => up({ stok_awal: e.currentTarget.value })}
                        aria-invalid={!!err.stok_awal}
                        aria-describedby={dId}
                        placeholder="0"
                        class="num min-h-11 text-base"
                      />
                    )}
                  </Field>
                )}
                <Field label="Catatan" hint="Keterangan tambahan kemasan/penyimpanan">
                  {(id) => (
                    <Input
                      id={id}
                      value={f.catatan}
                      onInput={(e) => up({ catatan: e.currentTarget.value })}
                      placeholder="mis. 1 Pack isi 10 pcs"
                      class="min-h-11 text-base"
                    />
                  )}
                </Field>
              </div>
            </div>

          </form>
        )}
      </Dialog>

      {/* Dialog Kelola & Hapus Kategori */}
      <KelolaKategoriDialog
        open={modalKat}
        onClose={() => setModalKat(false)}
        selectedKategori={f?.kategori}
        onSelect={f ? (k) => up({ kategori: k }) : undefined}
        onKategoriDeleted={(k) => {
          if (kat.toLowerCase() === k.toLowerCase()) setKat('');
          if (f && f.kategori.toLowerCase() === k.toLowerCase()) up({ kategori: '' });
          setExtraKat((prev) => prev.filter((x) => x.toLowerCase() !== k.toLowerCase()));
        }}
      />

      {/* Dialog Konfirmasi Hapus Barang */}
      {modalHapus && (
        <Confirm
          open={!!modalHapus}
          title={`Hapus "${modalHapus.nama}"?`}
          okLabel={
            modalHapus.stok_dalam > 0 || modalHapus.stok_luar > 0
              ? 'Tutup'
              : 'Hapus Barang'
          }
          tone={
            modalHapus.stok_dalam > 0 || modalHapus.stok_luar > 0
              ? 'primary'
              : 'danger'
          }
          onCancel={() => setModalHapus(null)}
          onOk={async () => {
            if (modalHapus.stok_dalam > 0 || modalHapus.stok_luar > 0) {
              setModalHapus(null);
              return;
            }
            const targetId = modalHapus.id;
            const res = await A('hapusBarang', [targetId], (r) => r.message);
            if (res) {
              setModalHapus(null);
              setF(null);
            }
          }}
        >
          {modalHapus.stok_dalam > 0 || modalHapus.stok_luar > 0 ? (
            <div class="flex flex-col gap-3 text-sm">
              <Banner tone="warning">
                Barang tidak bisa dihapus karena masih memiliki stok:
                <div class="mt-1 font-bold">
                  Stok Gudang: {nf(modalHapus.stok_dalam)} {modalHapus.satuan} · Stok Luar: {nf(modalHapus.stok_luar)} {modalHapus.satuan}
                </div>
              </Banner>
              <p class="text-muted-fg leading-relaxed">
                Harap nolkan stok fisik terlebih dahulu (misalnya melalui menu <strong>Opname</strong> atau rekap penyesuaian) sebelum menghapus atau mengarsipkan barang ini.
              </p>
            </div>
          ) : (
            <div class="flex flex-col gap-3 text-sm">
              <p class="text-fg">
                Apakah Anda yakin ingin menghapus barang <strong>{modalHapus.nama}</strong> {modalHapus.kode ? `(${modalHapus.kode})` : ''}?
              </p>
              <div class="rounded-card border border-line bg-muted/60 p-3.5 space-y-2 text-xs text-muted-fg leading-relaxed">
                <div class="font-bold text-fg flex items-center gap-1.5">
                  <ShieldCheck size={16} class="text-primary shrink-0" /> Keamanan Riwayat Transaksi:
                </div>
                <p>
                  • <strong>Jika pernah ada transaksi:</strong> Barang akan <em>diarsipkan otomatis</em>. Riwayat transaksi masa lalu dan laporan bulanan di Google Sheet tetap utuh 100%, namun barang langsung disembunyikan dari tablet dapur & menu harian.
                </p>
                <p>
                  • <strong>Jika belum pernah ada transaksi:</strong> Barang akan <em>dihapus permanen</em> dari Google Sheet.
                </p>
              </div>
            </div>
          )}
        </Confirm>
      )}
    </div>
  );
}
