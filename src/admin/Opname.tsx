import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import {
  ArrowsDownUp,
  CalendarBlank,
  CheckCircle,
  ClockCounterClockwise,
  Copy,
  Equals,
  MagnifyingGlass,
  Minus,
  Plus,
  Trash,
  WarningCircle,
  X,
} from '@phosphor-icons/react';
import { cocok, grupKat, katOf, nf, parseNum, r3, urutKat } from '../lib/format';
import { useApp } from '../lib/app';
import { loadOpnameDraft, saveOpnameDraft, clearOpnameDraft } from '../lib/opname-draft';
import type { Barang, Opname } from '../lib/types';
import { Button, Confirm, Input, MultiSelect, PageTitle, Select, Tag, vibrate } from '../components/ui';
import { DataTable, Section, useAdmin, useMedia, type Col } from './shared';

const selisihCls = (s: number) => (s > 0 ? 'text-success' : s < 0 ? 'text-danger' : 'text-muted-fg');
const tanda = (s: number) => (s > 0 ? '+' : '') + nf(s);

const formatWaktuDraf = (ts: number) => {
  const dt = new Date(ts);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(dt.getDate())}/${p(dt.getMonth() + 1)} ${p(dt.getHours())}:${p(dt.getMinutes())}`;
};


const ambilTanggal = (o: Opname) => {
  if (o.waktu) {
    const parts = o.waktu.trim().split(/\s+/);
    if (parts[0]) return parts[0];
  }
  if (o.ts) {
    const dt = new Date(o.ts);
    const p = (n: number) => String(n).padStart(2, '0');
    return `${p(dt.getDate())}/${p(dt.getMonth() + 1)}/${dt.getFullYear()}`;
  }
  return '';
};
type SortOpt = 'kategori' | 'stok-desc' | 'stok-asc' | 'nama-asc' | 'selisih-desc';
type StatusFilter = 'semua' | 'diisi' | 'belum' | 'selisih';

function OpnameCardMobile({
  b,
  val,
  onValChange,
  isInvalid,
  onNext,
}: {
  b: Barang;
  val: string;
  onValChange: (v: string) => void;
  isInvalid: boolean;
  onNext?: () => void;
}) {
  const isFilled = val !== undefined && val.trim() !== '';
  const numVal = parseNum(val);
  const sameAsSystem = isFilled && !isNaN(numVal) && String(numVal) === String(b.stok_dalam);
  const hasDiff = isFilled && !isNaN(numVal) && numVal !== b.stok_dalam;
  const selisih = isFilled && !isNaN(numVal) ? r3(numVal - b.stok_dalam) : 0;

  const handleStep = (delta: number) => {
    vibrate(8);
    const curr = isFilled && !isNaN(numVal) ? numVal : b.stok_dalam;
    const next = Math.max(0, r3(curr + delta));
    onValChange(String(next));
  };

  const handleCopySystem = () => {
    vibrate(12);
    onValChange(String(b.stok_dalam));
  };

  const handleZero = () => {
    vibrate(10);
    onValChange('0');
  };

  return (
    <div class="flex flex-col gap-3">
      {/* Baris 1: Judul Barang, Kode, Kategori & Status Pill */}
      <div class="flex items-start justify-between gap-2">
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-1.5 flex-wrap">
            <h3 class="font-bold text-[15px] text-fg leading-snug break-words">{b.nama}</h3>
            {b.kode && <Tag>{b.kode}</Tag>}
          </div>
          <p class="text-xs text-muted-fg mt-0.5">
            {b.kategori} · Satuan: <strong class="text-fg">{b.satuan}</strong>
          </p>
        </div>

        {/* Status Selisih Pill */}
        <div class="shrink-0 text-right">
          {!isFilled ? (
            <span class="inline-flex items-center rounded-full bg-muted border border-line px-2 py-0.5 text-[11px] font-semibold text-muted-fg">
              Belum dihitung
            </span>
          ) : isInvalid ? (
            <span class="inline-flex items-center rounded-full bg-danger-soft border border-danger/30 px-2 py-0.5 text-[11px] font-bold text-danger">
              Tidak valid
            </span>
          ) : selisih === 0 ? (
            <span class="inline-flex items-center gap-1 rounded-full bg-success-soft border border-success/30 px-2.5 py-0.5 text-xs font-bold text-success">
              <CheckCircle size={13} weight="bold" aria-hidden /> Cocok (0)
            </span>
          ) : selisih > 0 ? (
            <span class="inline-flex items-center gap-0.5 rounded-full bg-primary-soft border border-primary/30 px-2.5 py-0.5 text-xs font-extrabold text-primary num">
              +{nf(selisih)} {b.satuan}
            </span>
          ) : (
            <span class="inline-flex items-center gap-0.5 rounded-full bg-danger-soft border border-danger/30 px-2.5 py-0.5 text-xs font-extrabold text-danger num">
              {nf(selisih)} {b.satuan}
            </span>
          )}
        </div>
      </div>

      {/* Baris 2: Context Stock Mini-Grid */}
      <div class="grid grid-cols-3 gap-2 bg-muted/60 p-2 rounded-ctl border border-line/70 text-center text-xs">
        <div class="flex flex-col">
          <span class="text-[11px] text-muted-fg font-medium">Di Gudang</span>
          <span class="font-extrabold text-sm text-primary num">{nf(b.stok_dalam)}</span>
        </div>
        <div class="flex flex-col border-x border-line/60">
          <span class="text-[11px] text-muted-fg font-medium">Di Dapur</span>
          <span class="font-medium text-sm text-muted-fg num">
            {b.alur === 'LUAR' || b.stok_luar ? nf(b.stok_luar) : '—'}
          </span>
        </div>
        <div class="flex flex-col">
          <span class="text-[11px] text-muted-fg font-medium">Total Sistem</span>
          <span class="font-bold text-sm text-fg num">{nf(b.stok_dalam + b.stok_luar)}</span>
        </div>
      </div>

      {/* Baris 3: Input Area & Quick Action Controls (Ergonomis untuk iPhone 11) */}
      <div class="flex flex-col gap-1.5 pt-1 border-t border-line/50">
        <div class="flex items-center justify-between text-xs font-semibold text-muted-fg">
          <span>Stok Fisik Gudang</span>
          {sameAsSystem && <span class="text-success text-[11px] font-bold">✓ Sesuai sistem</span>}
        </div>

        <div class="flex items-center gap-1.5">
          {/* Tombol Kurang 1 */}
          <button
            type="button"
            onClick={() => handleStep(-1)}
            aria-label={`Kurangi 1 untuk ${b.nama}`}
            class="size-11 shrink-0 flex items-center justify-center rounded-ctl border border-line bg-card text-fg active:bg-muted font-bold transition-colors cursor-pointer select-none"
          >
            <Minus size={18} weight="bold" aria-hidden />
          </button>

          {/* Input Numeric Utama */}
          <div class="relative flex-1 min-w-0">
            <input
              data-opname-input
              data-item-id={b.id}
              type="text"
              inputmode="decimal"
              autocomplete="off"
              placeholder={String(b.stok_dalam)}
              value={val ?? ''}
              onInput={(e) => onValChange(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  onNext?.();
                }
              }}
              aria-label={`Stok fisik untuk ${b.nama}`}
              class={`w-full h-11 text-center font-extrabold text-lg num rounded-ctl border px-2 bg-card text-fg transition-colors outline-none focus:ring-2 focus:ring-primary/25 ${
                isInvalid
                  ? 'border-danger text-danger'
                  : hasDiff
                    ? 'border-warning/80 font-bold text-warning-strong'
                    : sameAsSystem
                      ? 'border-success text-success'
                      : 'border-line-strong'
              }`}
            />
          </div>

          {/* Tombol Tambah 1 */}
          <button
            type="button"
            onClick={() => handleStep(1)}
            aria-label={`Tambah 1 untuk ${b.nama}`}
            class="size-11 shrink-0 flex items-center justify-center rounded-ctl border border-line bg-card text-fg active:bg-muted font-bold transition-colors cursor-pointer select-none"
          >
            <Plus size={18} weight="bold" aria-hidden />
          </button>

          {/* Tombol Cepat Sama (=) */}
          <button
            type="button"
            onClick={handleCopySystem}
            title={`Salin stok dalam (${b.stok_dalam})`}
            aria-label={`Sama dengan sistem ${b.stok_dalam} untuk ${b.nama}`}
            class={`min-h-11 px-3 flex items-center justify-center gap-1 rounded-ctl border text-xs font-bold transition-all select-none cursor-pointer whitespace-nowrap shrink-0 ${
              sameAsSystem
                ? 'border-primary bg-primary text-white shadow-xs'
                : 'border-primary/40 bg-primary-soft text-primary hover:bg-primary-soft/80 active:bg-primary/20'
            }`}
          >
            <Equals size={15} weight="bold" aria-hidden />
            <span>{b.stok_dalam}</span>
          </button>

          {/* Tombol Habis (0) jika ada stok tapi fisik 0 */}
          {b.stok_dalam > 0 && (
            <button
              type="button"
              onClick={handleZero}
              title="Set 0 (Habis)"
              aria-label={`Set fisik 0 untuk ${b.nama}`}
              class={`size-11 shrink-0 flex items-center justify-center rounded-ctl border text-xs font-bold transition-colors cursor-pointer select-none ${
                isFilled && numVal === 0
                  ? 'border-danger bg-danger text-white'
                  : 'border-line bg-card text-muted-fg hover:text-danger hover:border-danger/40'
              }`}
            >
              0
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function OpnameHistoryCardMobile({ o }: { o: Opname }) {
  const selisih = Number(o.selisih);
  return (
    <div class="flex flex-col gap-2.5">
      <div class="flex items-start justify-between gap-2">
        <div class="min-w-0 flex-1">
          <h4 class="font-bold text-sm text-fg leading-snug break-words">{o.barang}</h4>
          <span class="text-xs text-muted-fg num mt-0.5 block">{o.waktu}</span>
        </div>
        <div class="shrink-0">
          <span
            class={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-extrabold num ${
              selisih === 0
                ? 'bg-muted text-muted-fg border border-line'
                : selisih > 0
                  ? 'bg-success-soft text-success border border-success/30'
                  : 'bg-danger-soft text-danger border border-danger/30'
            }`}
          >
            {tanda(selisih)}
          </span>
        </div>
      </div>

      <div class="grid grid-cols-2 gap-2 bg-muted/40 p-2 rounded-ctl text-xs text-center border border-line/60">
        <div>
          <span class="text-muted-fg text-[11px] block">Sistem (Gudang)</span>
          <span class="font-semibold text-fg num text-sm">{nf(o.sistem)}</span>
        </div>
        <div class="border-l border-line/60">
          <span class="text-muted-fg text-[11px] block">Hasil Fisik</span>
          <span class="font-bold text-fg num text-sm">{nf(o.fisik)}</span>
        </div>
      </div>
    </div>
  );
}

export function OpnamePage() {
  const { d, A } = useAdmin();
  const { toast } = useApp();
  const aktif = useMemo(() => d.barang.filter((b) => b.aktif), [d]);
  const [vals, setVals] = useState<Record<string, string>>({});
  const [draftRestored, setDraftRestored] = useState<number | null>(null);
  const [confirmBuang, setConfirmBuang] = useState(false);
  const [q, setQ] = useState('');
  const [tanya, setTanya] = useState(false);
  const [sort, setSort] = useState<SortOpt>('kategori');
  const [katFilter, setKatFilter] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('semua');
  const searchRef = useRef<HTMLInputElement>(null);
  const [filterTgl, setFilterTgl] = useState<string>('');
  const [opnameStatusFilter, setOpnameStatusFilter] = useState<'semua' | 'selisih' | 'cocok'>('semua');
  const [qRiwayat, setQRiwayat] = useState('');

  const isDesktop = useMedia('(min-width: 768px)');
  const opnameRowClass = (b: Barang) => {
    const isFilled = vals[b.id] !== undefined && vals[b.id].trim() !== '';
    if (!isFilled) return '';
    const numVal = parseNum(vals[b.id]);
    if (isNaN(numVal) || numVal < 0) return '!border-danger/80 !ring-1 !ring-danger/30';
    if (numVal === b.stok_dalam) return '!border-success/40 !bg-success-soft/10';
    return '!border-warning/60 !bg-warning-soft/15';
  };
  // Shortcut / untuk fokus pencarian
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
  // Muat draf tersimpan saat komponen pertama kali dibuka (jika ada dan belum hangus)
  useEffect(() => {
    const draft = loadOpnameDraft();
    if (draft) {
      setVals(draft.vals);
      setDraftRestored(draft.ts);
    }
  }, []);

  // Simpan draf otomatis ke localStorage setiap kali ada perubahan angka
  useEffect(() => {
    saveOpnameDraft(vals);
  }, [vals]);

  // Peringatan sebelum reload/close tab jika ada angka yang sedang diisi
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      const hasUnsaved = Object.values(vals).some((v) => typeof v === 'string' && v.trim() !== '');
      if (hasUnsaved) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [vals]);

  const buangDraf = () => {
    clearOpnameDraft();
    setVals({});
    setDraftRestored(null);
    setConfirmBuang(false);
    toast('Draf opname berhasil dibuang');
  };

  const kats = useMemo(() => urutKat(aktif, d.urutan), [aktif, d.urutan]);

  const isi = Object.entries(vals).filter(([, v]) => v.trim() !== '');
  const salah = isi.filter(([, v]) => isNaN(parseNum(v)) || parseNum(v) < 0).map(([k]) => k);

  const selisihItems = useMemo(() => {
    return isi.filter(([id, v]) => {
      const b = aktif.find((x) => x.id === id);
      if (!b) return false;
      const f = parseNum(v);
      return !isNaN(f) && f >= 0 && r3(f - b.stok_dalam) !== 0;
    });
  }, [isi, aktif]);

  const cocokItems = useMemo(() => {
    return isi.filter(([id, v]) => {
      const b = aktif.find((x) => x.id === id);
      if (!b) return false;
      const f = parseNum(v);
      return !isNaN(f) && f >= 0 && r3(f - b.stok_dalam) === 0;
    });
  }, [isi, aktif]);

  // Filter daftar barang
  const filtered = useMemo(() => {
    return aktif.filter((b) => {
      if (!cocok(b, q)) return false;
      if (katFilter.length > 0 && !katFilter.includes(katOf(b))) return false;

      const v = vals[b.id];
      const hasValue = v !== undefined && v.trim() !== '';
      if (statusFilter === 'diisi' && !hasValue) return false;
      if (statusFilter === 'belum' && hasValue) return false;
      if (statusFilter === 'selisih') {
        if (!hasValue) return false;
        const f = parseNum(v);
        if (isNaN(f) || f < 0 || r3(f - b.stok_dalam) === 0) return false;
      }
      return true;
    });
  }, [aktif, q, katFilter, statusFilter, vals]);

  // Urutkan daftar barang
  const sortedList = useMemo(() => {
    const arr = [...filtered];
    if (sort === 'stok-desc') {
      return arr.sort((a, b) => b.stok_dalam - a.stok_dalam);
    }
    if (sort === 'stok-asc') {
      return arr.sort((a, b) => a.stok_dalam - b.stok_dalam);
    }
    if (sort === 'nama-asc') {
      return arr.sort((a, b) => a.nama.localeCompare(b.nama));
    }
    if (sort === 'selisih-desc') {
      return arr.sort((a, b) => {
        const valA = vals[a.id];
        const valB = vals[b.id];
        const diffA = valA && !isNaN(parseNum(valA)) ? Math.abs(r3(parseNum(valA) - a.stok_dalam)) : -1;
        const diffB = valB && !isNaN(parseNum(valB)) ? Math.abs(r3(parseNum(valB) - b.stok_dalam)) : -1;
        return diffB - diffA;
      });
    }
    return arr;
  }, [filtered, sort, vals]);

  // Salin semua stok sistem ke kolom fisik untuk barang yang sedang tampil
  const salinSemuaSistem = () => {
    vibrate(15);
    setVals((prev) => {
      const next = { ...prev };
      filtered.forEach((b) => {
        next[b.id] = String(b.stok_dalam);
      });
      return next;
    });
  };

  const cols: Col<Barang>[] = [
    {
      label: 'Barang',
      cell: (b) => (
        <div>
          <span class="font-semibold text-fg">{b.nama}</span>
          <div class="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-fg">
            {b.kode && <Tag>{b.kode}</Tag>}
            {(sort !== 'kategori' || katFilter.length > 0) && <span>{b.kategori}</span>}
          </div>
        </div>
      ),
    },
    {
      label: 'Di Dalam',
      align: 'right',
      cell: (b) => (
        <span class="num font-semibold text-fg">
          {nf(b.stok_dalam)}
        </span>
      ),
    },
    {
      label: 'Di Luar',
      align: 'right',
      cell: (b) => (
        <span class="num text-fg">
          {b.alur === 'LUAR' || b.stok_luar ? nf(b.stok_luar) : '—'}
        </span>
      ),
    },
    {
      label: 'Total',
      align: 'right',
      cell: (b) => (
        <span class="num font-bold text-fg">
          {nf(b.stok_dalam + b.stok_luar)} <span class="text-xs font-normal text-muted-fg">{b.satuan}</span>
        </span>
      ),
    },
    {
      label: 'Fisik',
      w: 'w-48',
      cell: (b) => {
        const isFilled = vals[b.id] !== undefined && vals[b.id].trim() !== '';
        const sameAsSystem = isFilled && String(parseNum(vals[b.id])) === String(b.stok_dalam);
        return (
          <div class="flex items-center gap-1.5">
            <Input
              data-opname-input
              aria-label={`Stok fisik ${b.nama}`}
              inputmode="decimal"
              autocomplete="off"
              value={vals[b.id] ?? ''}
              onInput={(e) => {
                const v = e.currentTarget.value;
                setVals((x) => ({ ...x, [b.id]: v }));
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === 'ArrowDown') {
                  e.preventDefault();
                  const inputs = Array.from(document.querySelectorAll<HTMLInputElement>('input[data-opname-input]'));
                  const idx = inputs.indexOf(e.currentTarget);
                  if (idx >= 0 && idx < inputs.length - 1) inputs[idx + 1]?.focus();
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  const inputs = Array.from(document.querySelectorAll<HTMLInputElement>('input[data-opname-input]'));
                  const idx = inputs.indexOf(e.currentTarget);
                  if (idx > 0) inputs[idx - 1]?.focus();
                }
              }}
              aria-invalid={salah.includes(b.id)}
              class="num text-right max-md:w-28 flex-1"
              placeholder={String(b.stok_dalam)}
            />
            <button
              type="button"
              onClick={() => {
                vibrate(10);
                setVals((x) => ({ ...x, [b.id]: String(b.stok_dalam) }));
              }}
              title={`Salin stok dalam (${b.stok_dalam})`}
              aria-label={`Salin stok dalam ${b.stok_dalam} untuk ${b.nama}`}
              class={`min-h-11 px-2.5 rounded-ctl border text-xs font-bold transition-colors select-none cursor-pointer ${
                sameAsSystem
                  ? 'border-primary/40 bg-primary-soft text-primary'
                  : 'border-line bg-card text-muted-fg hover:border-line-strong hover:bg-muted'
              }`}
            >
              =
            </button>
          </div>
        );
      },
    },
    {
      label: 'Selisih',
      align: 'right',
      cell: (b) => {
        const v = vals[b.id];
        if (!v || !v.trim()) return <span class="text-muted-fg">—</span>;
        const f = parseNum(v);
        if (isNaN(f) || f < 0) return <span class="font-semibold text-danger">Tidak valid</span>;
        const s = r3(f - b.stok_dalam);
        if (s === 0) {
          return (
            <span class="inline-flex items-center rounded-full bg-muted border border-line px-2.5 py-0.5 text-xs font-semibold text-muted-fg">
              Cocok (0)
            </span>
          );
        }
        if (s > 0) {
          return (
            <span class="inline-flex items-center rounded-full bg-success-soft border border-success/30 px-2.5 py-0.5 text-xs font-bold text-success num">
              +{nf(s)}
            </span>
          );
        }
        return (
          <span class="inline-flex items-center rounded-full bg-danger-soft border border-danger/30 px-2.5 py-0.5 text-xs font-bold text-danger num">
            {nf(s)}
          </span>
        );
      },
    },
  ];

  const opCols: Col<Opname>[] = [
    { label: 'Barang', cell: (o) => <span class="font-semibold">{o.barang}</span> },
    { label: 'Waktu', cell: (o) => <span class="num text-sm">{o.waktu}</span> },
    { label: 'Sistem', align: 'right', cell: (o) => nf(o.sistem) },
    { label: 'Fisik', align: 'right', cell: (o) => nf(o.fisik) },
    { label: 'Selisih', align: 'right', cell: (o) => <strong class={selisihCls(Number(o.selisih))}>{tanda(Number(o.selisih))}</strong> },
  ];

  interface TanggalOpt {
    key: string;
    tgl: string;
    label: string;
    count: number;
    ts: number;
  }

  const daftarTanggal = useMemo<TanggalOpt[]>(() => {
    if (!d.opname || d.opname.length === 0) return [];

    const sorted = [...d.opname].sort((a, b) => (b.ts || 0) - (a.ts || 0));
    const grupTgl = new Map<string, { tgl: string; items: Opname[]; sesiMap: Map<string, Opname[]> }>();

    for (const o of sorted) {
      const tgl = ambilTanggal(o);
      if (!tgl) continue;
      let g = grupTgl.get(tgl);
      if (!g) {
        g = { tgl, items: [], sesiMap: new Map() };
        grupTgl.set(tgl, g);
      }
      g.items.push(o);

      const parts = o.waktu ? o.waktu.trim().split(/\s+/) : [];
      const jam = parts[1] || '';
      if (jam) {
        let s = g.sesiMap.get(jam);
        if (!s) {
          s = [];
          g.sesiMap.set(jam, s);
        }
        s.push(o);
      }
    }

    const opts: TanggalOpt[] = [];

    for (const [tgl, g] of grupTgl.entries()) {
      const latestTs = g.items[0]?.ts || 0;
      const sesiList = Array.from(g.sesiMap.entries());

      if (sesiList.length <= 1) {
        const jam = sesiList[0]?.[0];
        const labelJam = jam ? ` · ${jam}` : '';
        opts.push({
          key: tgl,
          tgl,
          label: `${tgl}${labelJam} (${g.items.length} barang)`,
          count: g.items.length,
          ts: latestTs,
        });
      } else {
        opts.push({
          key: tgl,
          tgl,
          label: `${tgl} · Semua Sesi (${g.items.length} barang)`,
          count: g.items.length,
          ts: latestTs,
        });
        for (const [jam, items] of sesiList) {
          const sesiKey = `${tgl} ${jam}`;
          opts.push({
            key: sesiKey,
            tgl,
            label: `  ↳ ${tgl} jam ${jam} (${items.length} barang)`,
            count: items.length,
            ts: items[0]?.ts || latestTs,
          });
        }
      }
    }

    return opts;
  }, [d.opname]);

  const activeTgl = useMemo(() => {
    if (filterTgl === 'semua') return 'semua';
    if (filterTgl && daftarTanggal.some((t) => t.key === filterTgl)) return filterTgl;
    return daftarTanggal[0]?.key || 'semua';
  }, [filterTgl, daftarTanggal]);

  const opnameDateItems = useMemo(() => {
    if (!d.opname || d.opname.length === 0) return [];
    if (activeTgl === 'semua') return d.opname;
    return d.opname.filter((o) => {
      if (activeTgl.includes(' ')) {
        const fullWaktu = o.waktu ? o.waktu.trim() : '';
        return fullWaktu === activeTgl;
      }
      return ambilTanggal(o) === activeTgl;
    });
  }, [d.opname, activeTgl]);

  const opnameStats = useMemo(() => {
    let cocok = 0;
    let selisih = 0;
    for (const o of opnameDateItems) {
      if (Number(o.selisih) === 0) cocok++;
      else selisih++;
    }
    return {
      total: opnameDateItems.length,
      cocok,
      selisih,
    };
  }, [opnameDateItems]);

  const opnameFiltered = useMemo(() => {
    let list = opnameDateItems;

    if (qRiwayat.trim()) {
      const term = qRiwayat.toLowerCase().trim();
      list = list.filter((o) => o.barang.toLowerCase().includes(term));
    }

    if (opnameStatusFilter === 'selisih') {
      list = list.filter((o) => Number(o.selisih) !== 0);
    } else if (opnameStatusFilter === 'cocok') {
      list = list.filter((o) => Number(o.selisih) === 0);
    }

    return list;
  }, [opnameDateItems, qRiwayat, opnameStatusFilter]);

  const simpan = async () => {
    if (!isi.length || salah.length > 0) return;
    const items = isi.map(([barang_id, fisik]) => ({ barang_id, fisik: String(parseNum(fisik)) }));
    const n = await A('simpanOpname', [items], (n) => `${n} barang disesuaikan`);
    setTanya(false);
    if (n !== undefined) {
      clearOpnameDraft();
      setDraftRestored(null);
      setVals({});
      setFilterTgl('');
      setOpnameStatusFilter('semua');
      setQRiwayat('');
    }
  };

  return (
    <div class="flex flex-col gap-6">
      <PageTitle kicker="Hitung fisik" title="Stock opname" sub="Isi hasil hitung fisik di gudang (Stock Dalam). Kosongkan barang yang tidak dihitung." />
      {/* Banner Pemulihan Draf Tersimpan */}
      {draftRestored && (
        <div class="rounded-card border border-warning/40 bg-warning-soft/20 p-3.5 flex items-center justify-between gap-3 text-xs">
          <div class="flex items-center gap-2 min-w-0">
            <ClockCounterClockwise size={18} class="text-warning shrink-0" aria-hidden />
            <span class="truncate">
              <strong>Draf opname tersimpan</strong> dipulihkan (disimpan {formatWaktuDraf(draftRestored)}).
            </span>
          </div>
          <Button
            type="button"
            variant="danger-ghost"
            size="sm"
            onClick={() => setConfirmBuang(true)}
            class="shrink-0"
          >
            <Trash size={14} aria-hidden /> Buang Draf
          </Button>
        </div>
      )}

      {/* Mobile Progress & Status Micro-Card (Dioptimalkan untuk iPhone 11) */}
      {!isDesktop && (
        <div class="rounded-card border border-line bg-card p-3.5 shadow-xs flex flex-col gap-2.5">
          <div class="flex items-center justify-between gap-2">
            <div class="flex items-center gap-2">
              <span class="text-xs font-bold uppercase tracking-wider text-muted-fg">Progres Opname</span>
              <span class="rounded-full bg-primary-soft text-primary font-bold text-xs px-2.5 py-0.5 num">
                {isi.length} / {aktif.length} dihitung
              </span>
            </div>
            <span class="text-xs font-extrabold text-primary num">
              {Math.round((isi.length / (aktif.length || 1)) * 100)}%
            </span>
          </div>

          <div class="w-full bg-muted rounded-full h-2 overflow-hidden border border-line/50">
            <div
              class="bg-primary h-full transition-all duration-300 rounded-full"
              style={{ width: `${Math.min(100, Math.round((isi.length / (aktif.length || 1)) * 100))}%` }}
            />
          </div>

          <div class="flex items-center gap-1.5 flex-wrap pt-0.5">
            <button
              type="button"
              onClick={() => setStatusFilter(statusFilter === 'selisih' ? 'semua' : 'selisih')}
              class={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold transition-all cursor-pointer ${
                statusFilter === 'selisih'
                  ? 'bg-warning text-white ring-2 ring-warning/30'
                  : selisihItems.length > 0
                    ? 'bg-warning-soft text-warning border border-warning/30 hover:bg-warning/20'
                    : 'bg-muted text-muted-fg border border-line'
              }`}
            >
              <WarningCircle size={14} weight="bold" aria-hidden />
              <span>{selisihItems.length} Selisih</span>
            </button>

            <button
              type="button"
              onClick={() => setStatusFilter(statusFilter === 'belum' ? 'semua' : 'belum')}
              class={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold transition-all cursor-pointer ${
                statusFilter === 'belum'
                  ? 'bg-primary text-white ring-2 ring-primary/30'
                  : 'bg-muted text-muted-fg border border-line hover:text-fg'
              }`}
            >
              <span>{aktif.length - isi.length} Belum dihitung</span>
            </button>

            {cocokItems.length > 0 && (
              <button
                type="button"
                onClick={() => setStatusFilter(statusFilter === 'diisi' ? 'semua' : 'diisi')}
                class={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold transition-all cursor-pointer ${
                  statusFilter === 'diisi'
                    ? 'bg-success text-white ring-2 ring-success/30'
                    : 'bg-success-soft text-success border border-success/30 hover:bg-success/20'
                }`}
              >
                <CheckCircle size={14} weight="bold" aria-hidden />
                <span>{cocokItems.length} Cocok</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Kontrol Pencarian, Dropdown Besar/Kecil, dan Filter Kategori */}
      <div class="flex flex-col gap-3">
        <div class="flex flex-col gap-3 lg:flex-row lg:items-center">
          <label class="relative block flex-1">
            <span class="sr-only">Cari barang</span>
            <MagnifyingGlass size={20} class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-fg" aria-hidden />
            <Input
              ref={searchRef}
              type="search"
              value={q}
              onInput={(e) => setQ(e.currentTarget.value)}
              placeholder="Cari nama atau kode… (tekan /)"
              class="pl-10 pr-10"
            />
            {q && (
              <button
                type="button"
                onClick={() => {
                  setQ('');
                  searchRef.current?.focus();
                }}
                aria-label="Hapus pencarian"
                class="absolute right-2.5 top-1/2 -translate-y-1/2 size-7 flex items-center justify-center rounded-full text-muted-fg hover:text-fg hover:bg-muted"
              >
                <X size={15} aria-hidden />
              </button>
            )}
          </label>

          {/* Dropdown Besar Kecilnya (Sort) & Kategori MultiSelect */}
          <div class="grid grid-cols-2 gap-2 sm:flex sm:flex-nowrap sm:items-center">
            {/* Sort Dropdown: fixed width sm:w-56 */}
            <div class="w-full sm:w-56 shrink-0 flex items-center gap-1.5">
              <ArrowsDownUp size={18} class="text-muted-fg shrink-0" aria-hidden />
              <div class="flex-1 min-w-0">
                <Select
                  value={sort}
                  onChange={(e) => setSort(e.currentTarget.value as SortOpt)}
                  class="w-full min-h-11 text-xs sm:text-sm font-semibold"
                  aria-label="Urutkan besar kecilnya stok"
                >
                  <option value="kategori">Kategori</option>
                  <option value="stok-desc">Stok Dalam: Besar → Kecil</option>
                  <option value="stok-asc">Stok Dalam: Kecil → Besar</option>
                  <option value="nama-asc">Nama: A → Z</option>
                  <option value="selisih-desc">Selisih Terbesar (±)</option>
                </Select>
              </div>
            </div>

            {/* Category MultiSelect: fixed width sm:w-64 */}
            <div class="w-full sm:w-64 shrink-0">
              <MultiSelect
                value={katFilter}
                onChange={setKatFilter}
                options={kats.map((c) => ({
                  value: c,
                  label: c,
                  count: aktif.filter((b) => b.kategori === c).length,
                }))}
                allLabel={`Semua Kategori (${aktif.length})`}
                placeholder="Pilih Kategori"
                class="w-full min-h-11 font-medium text-xs sm:text-sm"
                aria-label="Filter kategori"
              />
            </div>
          </div>
        </div>

        {/* Action bar cepat & status filter */}
        <div class="flex items-center justify-between gap-2 pt-2 border-t border-line/60 overflow-x-auto no-scrollbar">
          <div class="flex items-center gap-1.5 shrink-0">
            <span class="text-xs font-semibold text-muted-fg mr-0.5">Filter:</span>
            {[
              { id: 'semua', label: `Semua (${sortedList.length})` },
              { id: 'belum', label: `Belum (${aktif.length - isi.length})` },
              { id: 'diisi', label: `Diisi (${isi.length})` },
              { id: 'selisih', label: `Selisih (${selisihItems.length})` },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setStatusFilter(tab.id as StatusFilter)}
                class={`px-2.5 py-1 rounded-full text-xs font-semibold transition-colors cursor-pointer select-none whitespace-nowrap ${
                  statusFilter === tab.id
                    ? 'bg-primary text-white shadow-sm'
                    : 'bg-muted text-muted-fg hover:text-fg hover:bg-muted/80'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <Button
            size="sm"
            onClick={salinSemuaSistem}
            title="Salin stok dalam ke kolom fisik untuk semua barang yang tampil"
            class="text-xs font-semibold shrink-0"
          >
            <Copy size={16} aria-hidden /> <span class="hidden sm:inline">Salin semua stok dalam</span><span class="sm:hidden">Salin Semua</span>
          </Button>
        </div>

        {/* Chips Kategori Aktif jika ada kategori yang dipilih */}
        {katFilter.length > 0 && (
          <div class="flex flex-wrap items-center gap-1.5 pt-1 text-xs text-muted-fg">
            <span class="font-semibold text-fg">Kategori aktif:</span>
            {katFilter.map((c) => (
              <span
                key={c}
                class="inline-flex items-center gap-1 rounded-md bg-card pl-2 pr-1.5 py-0.5 font-medium text-fg border border-line"
              >
                <span>{c}</span>
                <button
                  type="button"
                  onClick={() => setKatFilter((prev) => prev.filter((x) => x !== c))}
                  class="text-muted-fg hover:text-danger cursor-pointer ml-0.5"
                  aria-label={`Hapus filter kategori ${c}`}
                >
                  <X size={12} weight="bold" />
                </button>
              </span>
            ))}
            <button
              type="button"
              onClick={() => setKatFilter([])}
              class="font-semibold text-primary hover:underline cursor-pointer ml-1"
            >
              Hapus semua ({katFilter.length})
            </button>
          </div>
        )}
      </div>
      {sort === 'kategori' && katFilter.length !== 1 ? (
        <DataTable
          compact
          cols={cols}
          groups={grupKat(sortedList, d.urutan)}
          rowKey={(b) => b.id}
          rowClass={opnameRowClass}
          empty="Tidak ada barang yang cocok."
          renderCard={(b) => (
            <OpnameCardMobile
              b={b}
              val={vals[b.id] ?? ''}
              onValChange={(v) => setVals((prev) => ({ ...prev, [b.id]: v }))}
              isInvalid={salah.includes(b.id)}
            />
          )}
        />
      ) : (
        <DataTable
          compact
          cols={cols}
          rows={sortedList}
          rowKey={(b) => b.id}
          rowClass={opnameRowClass}
          empty="Tidak ada barang yang cocok."
          renderCard={(b) => (
            <OpnameCardMobile
              b={b}
              val={vals[b.id] ?? ''}
              onValChange={(v) => setVals((prev) => ({ ...prev, [b.id]: v }))}
              isInvalid={salah.includes(b.id)}
            />
          )}
        />
      )}

      {/* Floating Sticky Bottom Bar (Disesuaikan ergonomis iPhone 11 di atas navigasi bawah) */}
      <div class="sticky z-20 -mx-4 px-4 py-2.5 border-t border-line bg-card/95 backdrop-blur shadow-lg bottom-[calc(3.5rem+env(safe-area-inset-bottom,0px)+0.25rem)] lg:bottom-0">
        <div class="flex items-center justify-between gap-3 max-w-6xl mx-auto">
          <div class="flex flex-col justify-center min-w-0">
            <div class="flex items-center gap-1.5 text-xs font-bold">
              <span class="num text-fg">
                <strong>{isi.length}</strong> / {aktif.length} diisi
              </span>
              {selisihItems.length > 0 && (
                <span class="inline-flex items-center gap-0.5 text-warning num">
                  · {selisihItems.length} selisih
                </span>
              )}
              {salah.length > 0 && <span class="text-danger">· {salah.length} salah</span>}
            </div>
            <span class="text-[11px] text-muted-fg font-medium truncate">
              {isi.length === 0
                ? 'Belum ada barang dihitung'
                : `${Math.round((isi.length / (aktif.length || 1)) * 100)}% selesai`}
            </span>
          </div>

          <div class="flex items-center gap-2 shrink-0">
            {isi.length > 0 && (
              <Button
                type="button"
                variant="danger-ghost"
                size="sm"
                onClick={() => setConfirmBuang(true)}
                title="Buang draf dan kosongkan input"
              >
                <Trash size={14} aria-hidden /> Buang Draf
              </Button>
            )}
            <Button
              variant="primary"
              size="md"
              disabled={!isi.length || salah.length > 0}
              onClick={() => {
                vibrate(15);
                setTanya(true);
              }}
              aria-label="Simpan dan sesuaikan stok opname"
              class="whitespace-nowrap font-bold"
            >
              Simpan{isi.length > 0 ? ` (${isi.length})` : ''}
            </Button>
          </div>
        </div>
      </div>

      <Section
        title="Riwayat opname"
        actions={
          daftarTanggal.length > 0 && (
            <div class="flex items-center gap-1.5">
              <CalendarBlank size={18} class="text-muted-fg shrink-0" aria-hidden />
              <Select
                id="select-tgl-opname"
                value={activeTgl}
                onChange={(e) => {
                  setFilterTgl(e.currentTarget.value);
                  setOpnameStatusFilter('semua');
                  setQRiwayat('');
                }}
                class="text-sm font-semibold max-w-[280px] sm:max-w-xs"
                aria-label="Filter tanggal riwayat opname"
              >
                <option value="semua">Semua Tanggal ({d.opname.length} barang)</option>
                {daftarTanggal.map((t) => (
                  <option key={t.key} value={t.key}>
                    {t.label}
                  </option>
                ))}
              </Select>
            </div>
          )
        }
      >
        {d.opname.length === 0 ? (
          <DataTable cols={opCols} rows={[]} rowKey={(o) => o.id + o.barang_id} empty="Belum ada riwayat opname." />
        ) : (
          <div class="flex flex-col gap-3">
            {/* Toolbar filter status & pencarian barang di riwayat */}
            <div class="flex flex-wrap items-center justify-between gap-2.5 p-3 rounded-card bg-muted/40 border border-line">
              <div class="flex flex-wrap items-center gap-1.5">
                <span class="text-xs font-semibold text-muted-fg mr-1">Filter:</span>
                <button
                  type="button"
                  onClick={() => setOpnameStatusFilter('semua')}
                  class={`px-2.5 py-1 rounded-full text-xs font-semibold transition-colors cursor-pointer select-none ${
                    opnameStatusFilter === 'semua'
                      ? 'bg-primary text-white shadow-sm'
                      : 'bg-card text-muted-fg border border-line hover:text-fg'
                  }`}
                >
                  Semua ({opnameStats.total})
                </button>
                <button
                  type="button"
                  onClick={() => setOpnameStatusFilter('selisih')}
                  class={`px-2.5 py-1 rounded-full text-xs font-semibold transition-colors cursor-pointer select-none ${
                    opnameStatusFilter === 'selisih'
                      ? 'bg-danger text-white shadow-sm'
                      : opnameStats.selisih > 0
                      ? 'bg-danger-soft border border-danger/30 text-danger hover:bg-danger/20 font-bold'
                      : 'bg-card text-muted-fg border border-line hover:text-fg'
                  }`}
                >
                  Ada Selisih ({opnameStats.selisih})
                </button>
                <button
                  type="button"
                  onClick={() => setOpnameStatusFilter('cocok')}
                  class={`px-2.5 py-1 rounded-full text-xs font-semibold transition-colors cursor-pointer select-none ${
                    opnameStatusFilter === 'cocok'
                      ? 'bg-success text-white shadow-sm'
                      : 'bg-card text-muted-fg border border-line hover:text-fg'
                  }`}
                >
                  Cocok ({opnameStats.cocok})
                </button>
              </div>

              {/* Cari barang di riwayat */}
              <div class="relative min-w-[180px] flex-1 sm:max-w-xs">
                <MagnifyingGlass size={16} class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-fg" aria-hidden />
                <Input
                  type="search"
                  value={qRiwayat}
                  onInput={(e) => setQRiwayat(e.currentTarget.value)}
                  placeholder="Cari nama barang di riwayat…"
                  class="pl-9 pr-8 h-9 text-xs"
                  aria-label="Cari nama barang di riwayat opname"
                />
                {qRiwayat && (
                  <button
                    type="button"
                    onClick={() => setQRiwayat('')}
                    aria-label="Hapus pencarian riwayat"
                    class="absolute right-2 top-1/2 -translate-y-1/2 size-5 flex items-center justify-center rounded-full text-muted-fg hover:text-fg hover:bg-muted cursor-pointer"
                  >
                    <X size={13} aria-hidden />
                  </button>
                )}
              </div>
            </div>

            <DataTable
              cols={opCols}
              rows={opnameFiltered}
              rowKey={(o) => o.id + o.barang_id}
              empty={qRiwayat || opnameStatusFilter !== 'semua' ? 'Tidak ada riwayat opname yang cocok dengan filter.' : 'Belum ada opname.'}
              renderCard={(o) => <OpnameHistoryCardMobile o={o} />}
            />
          </div>
        )}
      </Section>

      <Confirm open={tanya} title="Sesuaikan stok?" okLabel={`Sesuaikan ${isi.length} barang`} onCancel={() => setTanya(false)} onOk={simpan}>
        Stok gudang {isi.length} barang akan diganti dengan angka hitung fisik. Selisihnya dicatat sebagai transaksi opname.
      </Confirm>

      <Confirm
        open={confirmBuang}
        title="Buang draf opname?"
        okLabel="Buang Draf"
        tone="danger"
        onCancel={() => setConfirmBuang(false)}
        onOk={buangDraf}
      >
        Semua angka hitung fisik yang belum disimpan ({isi.length} barang) akan dikosongkan dan draf lokal akan dihapus.
      </Confirm>
    </div>
  );
}
