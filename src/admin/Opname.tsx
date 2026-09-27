import { useMemo, useState } from 'preact/hooks';
import { MagnifyingGlass } from '@phosphor-icons/react';
import { cocok, grupKat, nf, parseNum, r3 } from '../lib/format';
import type { Barang, Opname } from '../lib/types';
import { Button, Confirm, Input, PageTitle } from '../components/ui';
import { DataTable, Section, useAdmin, type Col } from './shared';

const selisihCls = (s: number) => (s > 0 ? 'text-success' : s < 0 ? 'text-danger' : 'text-muted-fg');
const tanda = (s: number) => (s > 0 ? '+' : '') + nf(s);

export function OpnamePage() {
  const { d, A } = useAdmin();
  const aktif = useMemo(() => d.barang.filter((b) => b.aktif), [d]);
  const [vals, setVals] = useState<Record<string, string>>({});
  const [q, setQ] = useState('');
  const [tanya, setTanya] = useState(false);

  const isi = Object.entries(vals).filter(([, v]) => v.trim() !== '');
  const salah = isi.filter(([, v]) => isNaN(parseNum(v)) || parseNum(v) < 0).map(([k]) => k);

  const cols: Col<Barang>[] = [
    { label: 'Barang', cell: (b) => <span class="font-semibold">{b.nama}</span> },
    {
      label: 'Sistem',
      align: 'right',
      cell: (b) => (
        <span>
          {nf(b.stok_dalam)} {b.satuan}
        </span>
      ),
    },
    {
      label: 'Fisik',
      w: 'w-44',
      cell: (b) => (
        <Input
          aria-label={`Stok fisik ${b.nama}`}
          inputmode="decimal"
          autocomplete="off"
          value={vals[b.id] ?? ''}
          onInput={(e) => {
            const v = e.currentTarget.value;
            setVals((x) => ({ ...x, [b.id]: v }));
          }}
          aria-invalid={salah.includes(b.id)}
          class="num text-right max-md:w-32"
        />
      ),
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
        return <strong class={selisihCls(s)}>{tanda(s)}</strong>;
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

  const list = aktif.filter((b) => cocok(b, q));

  return (
    <div class="flex flex-col gap-6">
      <PageTitle kicker="Hitung fisik" title="Stock opname" sub="Isi hasil hitung fisik di gudang (Stock Dalam). Kosongkan barang yang tidak dihitung." />
      <label class="relative block">
        <span class="sr-only">Cari barang</span>
        <MagnifyingGlass size={20} class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-fg" aria-hidden />
        <Input type="search" value={q} onInput={(e) => setQ(e.currentTarget.value)} placeholder="Cari nama atau kode…" class="pl-10" />
      </label>
      <DataTable compact cols={cols} groups={grupKat(list, d.urutan)} rowKey={(b) => b.id} empty="Tidak ada barang." />

      <div class="safe-bottom sticky bottom-16 z-20 -mx-4 border-t border-line bg-card/95 px-4 py-3 backdrop-blur md:-mx-6 md:px-6 lg:bottom-0">
        <div class="flex items-center gap-3">
          <p class="mr-auto whitespace-nowrap text-sm font-semibold" aria-live="polite">
            <span class="num">{isi.length}</span> diisi
            {salah.length > 0 && <span class="text-danger"> · {salah.length} tidak valid</span>}
          </p>
          {isi.length > 0 && <Button onClick={() => setVals({})}>Kosongkan</Button>}
          <Button variant="primary" disabled={!isi.length || salah.length > 0} onClick={() => setTanya(true)} aria-label="Simpan & sesuaikan" class="whitespace-nowrap">
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
