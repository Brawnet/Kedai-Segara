import { useEffect, useState } from 'preact/hooks';
import { nf, parseNum } from '../lib/format';
import type { Rekap, RekapBaris } from '../lib/types';
import { Button, Card, Empty, Input, PageTitle, Tag } from '../components/ui';
import { DataTable, Section, useAdmin, type Col } from './shared';

const hari = (a: number, b: number) => {
  const x = new Date(a), y = new Date(b);
  x.setHours(0, 0, 0, 0);
  y.setHours(0, 0, 0, 0);
  return Math.round((x.getTime() - y.getTime()) / 864e5);
};

export function RekapPage() {
  const { d, A } = useAdmin();
  const r = d.rekap[0];
  const [vals, setVals] = useState<string[]>([]);
  useEffect(() => setVals(r ? r.baris.map((x) => String(x.sisa)) : []), [r?.id, d]);

  if (!r)
    return (
      <div class="flex flex-col gap-6">
        <PageTitle kicker="Stock Luar" title="Rekap" />
        <Empty>Belum ada rekap.</Empty>
      </div>
    );

  const maks = (x: RekapBaris) => Number(x.saldo_awal) + Number(x.diambil);
  const bad = (i: number) => {
    const s = parseNum(vals[i]);
    return vals[i] === '' || isNaN(s) || s < 0 || s > maks(r.baris[i]!) + 1e-9;
  };
  const adaSalah = r.baris.some((_, i) => bad(i));

  const cols: Col<RekapBaris & { i: number }>[] = [
    {
      label: 'Barang',
      cell: (x) => (
        <div>
          <span class="font-semibold">{x.barang}</span>
          {x.catatan && <p class="text-sm font-normal text-muted-fg">{x.catatan}</p>}
        </div>
      ),
    },
    { label: 'Awal', align: 'right', cell: (x) => nf(x.saldo_awal) },
    { label: 'Diambil', align: 'right', cell: (x) => nf(x.diambil) },
    {
      label: 'Sisa',
      w: 'w-40',
      cell: (x) => (
        <div>
          <Input
            aria-label={`Sisa ${x.barang}`}
            inputmode="decimal"
            value={vals[x.i] ?? ''}
            onInput={(e) => {
              const v = e.currentTarget.value;
              setVals((a) => a.map((y, j) => (j === x.i ? v : y)));
            }}
            aria-invalid={bad(x.i)}
            class="num text-right max-md:w-32"
          />
          {bad(x.i) && <p class="mt-1 text-xs font-semibold text-danger">0 sampai {nf(maks(x))}</p>}
        </div>
      ),
    },
    { label: 'Terpakai', align: 'right', cell: (x) => <strong>{nf(x.terpakai)}</strong> },
  ];

  const hisCols: Col<Rekap & { i: number }>[] = [
    { label: 'Waktu', cell: (x) => <span class="num font-semibold">{x.waktu}</span> },
    { label: 'Perekap', cell: (x) => x.karyawan },
    {
      label: 'Terpakai',
      cell: (x) => (
        <span class="text-sm">
          {x.baris.length
            ? x.baris.map((b, j) => (
                <span key={b.barang_id}>
                  {j > 0 && ' · '}
                  {b.barang} <strong class="num">{nf(b.terpakai)}</strong>
                </span>
              ))
            : '—'}
        </span>
      ),
    },
    {
      label: 'Tanda',
      cell: (x) => {
        const p = d.rekap[x.i + 1];
        const n = p ? hari(x.ts, p.ts) : 0;
        return (
          <span class="inline-flex flex-wrap justify-end gap-1">
            {n > 1 && <Tag tone="warning">gabungan {n} hari</Tag>}
            {x.diedit_admin && <Tag>diedit</Tag>}
            {n <= 1 && !x.diedit_admin && <span class="text-muted-fg">—</span>}
          </span>
        );
      },
    },
  ];

  const simpan = () =>
    A(
      'editRekapTerakhir',
      [r.baris.map((x, i) => ({ barang_id: x.barang_id, sisa: String(parseNum(vals[i])) }))],
      (n) => (n ? `${n} baris dikoreksi` : 'Tidak ada perubahan'),
    );

  return (
    <div class="flex flex-col gap-6">
      <PageTitle kicker="Stock Luar" title="Rekap" />
      <Card class="flex flex-col gap-4 p-4 md:p-5">
        <div class="flex flex-wrap items-center gap-2">
          <h2 class="mr-auto text-lg font-bold">
            Rekap terakhir · <span class="num">{r.waktu}</span> · {r.karyawan}
          </h2>
          {r.diedit_admin && <Tag>diedit admin</Tag>}
        </div>
        <DataTable cols={cols} rows={r.baris.map((x, i) => ({ ...x, i }))} rowKey={(x) => x.barang_id} empty="Rekap ini tidak berisi barang." />
        <div class="flex flex-wrap items-center gap-3">
          <Button variant="primary" guard onClick={simpan} disabled={adaSalah || !r.baris.length}>
            Simpan koreksi
          </Button>
          <p class="text-sm text-muted-fg">Selisih sisa langsung diterapkan ke saldo luar saat ini.</p>
        </div>
      </Card>
      <Section title="Riwayat rekap">
        <DataTable cols={hisCols} rows={d.rekap.map((x, i) => ({ ...x, i }))} rowKey={(x) => x.id} />
      </Section>
    </div>
  );
}
