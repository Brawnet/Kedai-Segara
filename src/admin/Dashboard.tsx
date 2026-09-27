import { useMemo, useState } from 'preact/hooks';
import { ArrowSquareOut, ClipboardText, MagnifyingGlass, Package, Warning } from '@phosphor-icons/react';
import type { Icon } from '@phosphor-icons/react';
import { alurLabel, cocok, grupKat, nf } from '../lib/format';
import type { Barang } from '../lib/types';
import { Banner, Card, Input, PageTitle, Tag } from '../components/ui';
import { DataTable, useAdmin, type Col } from './shared';

export const total = (b: Barang) => b.stok_dalam + b.stok_luar;
export const menipis = (b: Barang) => total(b) < b.ambang_min;

function Stat({ icon: I, label, value, tone }: { icon: Icon; label: string; value: string | number; tone: string }) {
  return (
    <Card class="flex items-center gap-3 p-4">
      <span class={`grid size-11 shrink-0 place-items-center rounded-ctl ${tone}`}>
        <I size={22} weight="bold" aria-hidden />
      </span>
      <div class="min-w-0">
        <p class="text-[13px] font-semibold text-muted-fg">{label}</p>
        <p class="num truncate text-xl font-extrabold">{value}</p>
      </div>
    </Card>
  );
}

export function Dashboard() {
  const { d } = useAdmin();
  const [q, setQ] = useState('');
  const [onlyLow, setOnlyLow] = useState(false);
  const aktif = useMemo(() => d.barang.filter((b) => b.aktif), [d]);
  const low = aktif.filter(menipis);
  const st = d.status;
  const list = aktif.filter((b) => cocok(b, q) && (!onlyLow || menipis(b)));

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
        <strong class={menipis(b) ? 'text-warning' : ''}>
          {nf(total(b))} {b.satuan}
        </strong>
      ),
    },
    { label: 'Min', align: 'right', cell: (b) => nf(b.ambang_min) },
    { label: 'Alur', cell: (b) => <span class="text-sm text-muted-fg">{alurLabel(b.alur)}</span> },
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

      <div class="flex flex-col gap-3 sm:flex-row sm:items-center">
        <label class="relative block flex-1">
          <span class="sr-only">Cari barang</span>
          <MagnifyingGlass size={20} class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-fg" aria-hidden />
          <Input type="search" value={q} onInput={(e) => setQ(e.currentTarget.value)} placeholder="Cari nama atau kode…" class="pl-10" />
        </label>
        <label class="flex min-h-11 cursor-pointer items-center gap-2 rounded-ctl border border-line bg-card px-3 font-semibold">
          <input type="checkbox" checked={onlyLow} onChange={(e) => setOnlyLow(e.currentTarget.checked)} class="size-5 accent-primary" />
          Hanya menipis
        </label>
      </div>

      <DataTable compact cols={cols} groups={grupKat(list, d.urutan)} rowKey={(b) => b.id} empty="Tidak ada barang yang cocok." />

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
