import { useState } from 'preact/hooks';
import { ArrowSquareOut, ChartBar, Table } from '@phosphor-icons/react';
import { nf, ymd } from '../lib/format';
import type { LaporanRow } from '../lib/types';
import { Button, Card, Field, Input, PageTitle } from '../components/ui';
import { useApp } from '../lib/app';
import { pinSalah } from '../lib/api';
import { DataTable, useAdmin, type Col } from './shared';

export function LaporanPage() {
  const { pin, logout } = useAdmin();
  const { act, toast } = useApp();
  const n = new Date();
  const [dari, setDari] = useState(ymd(new Date(n.getFullYear(), n.getMonth(), 1)));
  const [sampai, setSampai] = useState(ymd(n));
  const [rows, setRows] = useState<LaporanRow[] | null>(null);
  const [periode, setPeriode] = useState('');
  const [sheet, setSheet] = useState('');
  const salah = !dari || !sampai || dari > sampai;
  const onErr = (e: unknown) => pinSalah(e) && logout();

  const tampil = async (e: Event) => {
    e.preventDefault();
    if (salah) return;
    const r = await act('laporan', [pin, dari, sampai], onErr);
    if (r) {
      setRows(r);
      setPeriode(`${dari}|${sampai}`);
      setSheet('');
    }
  };
  const keSheet = async () => {
    const [a, b] = periode.split('|') as [string, string];
    const url = await act('laporanKeSheet', [pin, a, b], onErr);
    if (url) {
      setSheet(url);
      toast('Laporan disalin ke sheet “Laporan”. Klik tautan di bawah jika popup terblokir.');
      try {
        window.open(url, '_blank', 'noopener');
      } catch {}
    }
  };

  const s = (r: LaporanRow) => ' ' + r.satuan;
  const cols: Col<LaporanRow>[] = [
    { label: 'Barang', cell: (r) => <span class="font-semibold">{r.nama}</span> },
    { label: 'Masuk', align: 'right', cell: (r) => nf(r.masuk) + s(r) },
    { label: 'Terpakai (rekap)', align: 'right', cell: (r) => nf(r.terpakai_rekap) + s(r) },
    { label: 'Langsung habis', align: 'right', cell: (r) => nf(r.langsung_habis) + s(r) },
    { label: 'Total terpakai', align: 'right', cell: (r) => <strong>{nf(r.total_terpakai) + s(r)}</strong> },
    {
      label: 'Selisih opname',
      align: 'right',
      cell: (r) => <span class={r.opname > 0 ? 'text-success' : r.opname < 0 ? 'text-danger' : 'text-muted-fg'}>{(r.opname > 0 ? '+' : '') + nf(r.opname)}</span>,
    },
  ];

  return (
    <div class="flex flex-col gap-6">
      <PageTitle kicker="Pemakaian" title="Laporan" />
      <Card class="p-4 md:p-5">
        <form onSubmit={tampil} class="grid gap-4 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_auto] lg:items-end" noValidate>
          <Field label="Dari">{(id) => <Input id={id} type="date" value={dari} onInput={(e) => setDari(e.currentTarget.value)} max={sampai} />}</Field>
          <Field label="Sampai" error={dari > sampai ? 'Tanggal akhir sebelum tanggal awal' : undefined}>
            {(id, dId) => <Input id={id} type="date" value={sampai} onInput={(e) => setSampai(e.currentTarget.value)} min={dari} aria-invalid={dari > sampai} aria-describedby={dId} />}
          </Field>
          <Button type="submit" variant="primary" guard disabled={salah} class="sm:col-span-2 lg:col-span-1">
            <ChartBar size={20} aria-hidden /> Tampilkan
          </Button>
        </form>
      </Card>

      {rows && (
        <>
          <div class="flex flex-wrap items-center gap-3">
            <p class="mr-auto text-sm text-muted-fg">
              <strong class="num text-fg">{rows.length}</strong> barang · {periode.replace('|', ' s/d ')}
            </p>
            <Button guard onClick={keSheet}>
              <Table size={20} aria-hidden /> Salin ke sheet “Laporan”
            </Button>
            {sheet && (
              <a href={sheet} target="_blank" rel="noopener" class="inline-flex min-h-11 items-center gap-1 font-semibold text-primary hover:underline">
                Buka sheet <ArrowSquareOut size={16} aria-hidden />
              </a>
            )}
          </div>
          <DataTable cols={cols} rows={rows} rowKey={(r) => r.nama + r.satuan} empty="Tidak ada data di periode ini." />
          <p class="text-sm text-muted-fg">Terpakai (rekap) dihitung berdasarkan waktu rekap disimpan.</p>
        </>
      )}
    </div>
  );
}
