import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import {
  ArrowsDownUp,
  Copy,
  MagnifyingGlass,
} from '@phosphor-icons/react';
import { cocok, grupKat, nf, parseNum, r3, urutKat } from '../lib/format';
import type { Barang, Opname } from '../lib/types';
import { Button, Confirm, Input, PageTitle, Select, Tag, vibrate } from '../components/ui';
import { DataTable, Section, useAdmin, type Col } from './shared';

const selisihCls = (s: number) => (s > 0 ? 'text-success' : s < 0 ? 'text-danger' : 'text-muted-fg');
const tanda = (s: number) => (s > 0 ? '+' : '') + nf(s);

type SortOpt = 'kategori' | 'stok-desc' | 'stok-asc' | 'nama-asc' | 'selisih-desc';
type StatusFilter = 'semua' | 'diisi' | 'belum' | 'selisih';

export function OpnamePage() {
  const { d, A } = useAdmin();
  const aktif = useMemo(() => d.barang.filter((b) => b.aktif), [d]);
  const [vals, setVals] = useState<Record<string, string>>({});
  const [q, setQ] = useState('');
  const [tanya, setTanya] = useState(false);
  const [sort, setSort] = useState<SortOpt>('kategori');
  const [katFilter, setKatFilter] = useState('semua');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('semua');
  const searchRef = useRef<HTMLInputElement>(null);

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

  const kats = useMemo(() => urutKat(d.barang, d.urutan), [d]);

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
      if (katFilter !== 'semua' && b.kategori !== katFilter) return false;

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
            {(sort !== 'kategori' || katFilter !== 'semua') && <span>{b.kategori}</span>}
          </div>
        </div>
      ),
    },
    {
      label: 'Sistem',
      align: 'right',
      cell: (b) => (
        <span class="num font-semibold text-fg">
          {nf(b.stok_dalam)} <span class="text-xs font-normal text-muted-fg">{b.satuan}</span>
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
              title={`Salin stok sistem (${b.stok_dalam})`}
              aria-label={`Salin stok sistem ${b.stok_dalam} untuk ${b.nama}`}
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

  const simpan = async () => {
    const items = isi.map(([barang_id, fisik]) => ({ barang_id, fisik: String(parseNum(fisik)) }));
    const n = await A('simpanOpname', [items], (n) => `${n} barang disesuaikan`);
    setTanya(false);
    if (n !== undefined) setVals({});
  };

  return (
    <div class="flex flex-col gap-6">
      <PageTitle kicker="Hitung fisik" title="Stock opname" sub="Isi hasil hitung fisik di gudang (Stock Dalam). Kosongkan barang yang tidak dihitung." />

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
              class="pl-10"
            />
          </label>

          {/* Dropdown Besar Kecilnya (Sort) & Kategori */}
          <div class="flex flex-wrap items-center gap-2 sm:flex-nowrap">
            <div class="flex items-center gap-1.5 min-w-[220px] flex-1 sm:flex-initial">
              <ArrowsDownUp size={18} class="text-muted-fg shrink-0" aria-hidden />
              <Select
                value={sort}
                onChange={(e) => setSort(e.currentTarget.value as SortOpt)}
                class="w-full text-sm font-semibold"
                aria-label="Urutkan besar kecilnya stok"
              >
                <option value="kategori">Kategori (Bawaan)</option>
                <option value="stok-desc">Stok: Terbesar ke Terkecil (Besar → Kecil)</option>
                <option value="stok-asc">Stok: Terkecil ke Terbesar (Kecil → Besar)</option>
                <option value="nama-asc">Nama Barang: A → Z</option>
                <option value="selisih-desc">Selisih Terbesar (±)</option>
              </Select>
            </div>

            <Select
              value={katFilter}
              onChange={(e) => setKatFilter(e.currentTarget.value)}
              class="min-w-[170px] text-sm font-semibold flex-1 sm:flex-initial"
              aria-label="Filter kategori"
            >
              <option value="semua">Semua Kategori ({aktif.length})</option>
              {kats.map((c) => (
                <option key={c} value={c}>
                  {c} ({aktif.filter((b) => b.kategori === c).length})
                </option>
              ))}
            </Select>
          </div>
        </div>

        {/* Action bar cepat & status filter */}
        <div class="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-line/60">
          <div class="flex flex-wrap items-center gap-1.5">
            <span class="text-xs font-semibold text-muted-fg mr-1">Filter:</span>
            {[
              { id: 'semua', label: `Semua (${sortedList.length})` },
              { id: 'belum', label: `Belum diisi (${aktif.length - isi.length})` },
              { id: 'diisi', label: `Sudah diisi (${isi.length})` },
              { id: 'selisih', label: `Ada selisih (${selisihItems.length})` },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setStatusFilter(tab.id as StatusFilter)}
                class={`px-2.5 py-1 rounded-full text-xs font-semibold transition-colors cursor-pointer select-none ${
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
            title="Salin stok sistem ke kolom fisik untuk semua barang yang tampil"
            class="text-xs font-semibold"
          >
            <Copy size={16} aria-hidden /> Salin semua dari sistem
          </Button>
        </div>
      </div>

      {sort === 'kategori' && katFilter === 'semua' ? (
        <DataTable compact cols={cols} groups={grupKat(sortedList, d.urutan)} rowKey={(b) => b.id} empty="Tidak ada barang yang cocok." />
      ) : (
        <DataTable compact cols={cols} rows={sortedList} rowKey={(b) => b.id} empty="Tidak ada barang yang cocok." />
      )}

      {/* Floating Sticky Bottom Bar */}
      <div class="safe-bottom sticky bottom-16 z-20 -mx-4 border-t border-line bg-card/95 px-4 py-3 backdrop-blur md:-mx-6 md:px-6 lg:bottom-0">
        <div class="flex flex-wrap items-center gap-3">
          <div class="mr-auto flex flex-wrap items-center gap-2 text-sm font-semibold" aria-live="polite">
            <span class="num text-fg">
              <strong>{isi.length}</strong> / {aktif.length} diisi
            </span>
            {cocokItems.length > 0 && (
              <span class="inline-flex items-center gap-1 text-xs text-muted-fg font-medium">
                · <span class="num font-bold text-fg">{cocokItems.length}</span> cocok
              </span>
            )}
            {selisihItems.length > 0 && (
              <span class="inline-flex items-center gap-1 text-xs font-bold text-warning">
                · <span class="num">{selisihItems.length}</span> selisih
              </span>
            )}
            {salah.length > 0 && <span class="text-xs font-bold text-danger">· {salah.length} tidak valid</span>}
          </div>
          {isi.length > 0 && <Button onClick={() => setVals({})}>Kosongkan</Button>}
          <Button
            variant="primary"
            disabled={!isi.length || salah.length > 0}
            onClick={() => setTanya(true)}
            aria-label="Simpan & sesuaikan"
            class="whitespace-nowrap"
          >
            Simpan<span class="hidden sm:inline"> & sesuaikan</span>
          </Button>
        </div>
      </div>

      <Section title="Riwayat opname">
        <DataTable cols={opCols} rows={d.opname} rowKey={(o) => o.id + o.barang_id} empty="Belum ada opname." />
      </Section>

      <Confirm open={tanya} title="Sesuaikan stok?" okLabel={`Sesuaikan ${isi.length} barang`} onCancel={() => setTanya(false)} onOk={simpan}>
        Stok gudang {isi.length} barang akan diganti dengan angka hitung fisik. Selisihnya dicatat sebagai transaksi opname.
      </Confirm>
    </div>
  );
}
