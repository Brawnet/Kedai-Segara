import { useEffect, useMemo, useState } from 'preact/hooks';
import { FunnelSimple } from '@phosphor-icons/react';
import { nf, parseNum, ymd } from '../lib/format';
import type { Rekap, RekapBaris } from '../lib/types';
import { Button, Card, Empty, Field, Input, PageTitle, Tag } from '../components/ui';
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
  const [dari, setDari] = useState('');
  const [sampai, setSampai] = useState('');
  useEffect(() => setVals(r ? r.baris.map((x) => String(x.sisa)) : []), [r?.id, d]);

  const now = new Date();
  const today = ymd(now);
  const hMinus7 = ymd(new Date(now.getTime() - 7 * 864e5));
  const awalBulan = ymd(new Date(now.getFullYear(), now.getMonth(), 1));

  const rekapTgl = (x: Rekap) => {
    if (x.ts && !isNaN(x.ts)) return ymd(new Date(x.ts));
    const m = x.waktu ? x.waktu.match(/^(\d{2})\/(\d{2})\/(\d{4})/) : null;
    return m ? `${m[3]}-${m[2]}-${m[1]}` : '';
  };

  const filteredRekap = useMemo(() => {
    return d.rekap.filter((x) => {
      const tgl = rekapTgl(x);
      if (!tgl) return true;
      if (dari && tgl < dari) return false;
      if (sampai && tgl > sampai) return false;
      return true;
    });
  }, [d.rekap, dari, sampai]);

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
      w: 'w-[36%]',
      cell: (x) => (
        <div>
          <span class="font-semibold text-fg">{x.barang}</span>
          {x.catatan && <p class="text-xs font-normal text-muted-fg mt-0.5">{x.catatan}</p>}
        </div>
      ),
    },
    {
      label: 'Awal',
      align: 'center',
      w: 'w-[16%]',
      cell: (x) => <span class="num font-semibold text-fg">{nf(x.saldo_awal)}</span>,
    },
    {
      label: 'Diambil',
      align: 'center',
      w: 'w-[16%]',
      cell: (x) => <span class="num font-semibold text-fg">{nf(x.diambil)}</span>,
    },
    {
      label: 'Sisa',
      align: 'center',
      w: 'w-[18%]',
      cell: (x) => (
        <div class="flex flex-col items-end sm:items-center">
          <Input
            aria-label={`Sisa ${x.barang}`}
            inputmode="decimal"
            value={vals[x.i] ?? ''}
            onInput={(e) => {
              const v = e.currentTarget.value;
              setVals((a) => a.map((y, j) => (j === x.i ? v : y)));
            }}
            aria-invalid={bad(x.i)}
            class="num text-center w-24 sm:w-28"
          />
          {bad(x.i) && (
            <p class="mt-1 text-xs font-semibold text-danger text-right sm:text-center">
              0 sampai {nf(maks(x))}
            </p>
          )}
        </div>
      ),
    },
    {
      label: 'Terpakai',
      align: 'center',
      w: 'w-[14%]',
      cell: (x) => <strong class="num font-bold text-fg">{nf(x.terpakai)}</strong>,
    },
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
        const fullIndex = d.rekap.findIndex((item) => item.id === x.id);
        const p = fullIndex >= 0 ? d.rekap[fullIndex + 1] : undefined;
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
      <Section
        title="Riwayat rekap"
        actions={
          (dari || sampai) ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setDari('');
                setSampai('');
              }}
              class="text-xs"
            >
              Reset filter
            </Button>
          ) : undefined
        }
      >
        <Card class="p-3.5 sm:p-4 flex flex-col gap-3">
          <div class="flex items-center gap-2 text-xs font-bold text-muted-fg uppercase tracking-wider">
            <FunnelSimple size={16} aria-hidden />
            <span>Filter Tanggal</span>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_auto] gap-3 items-end">
            <Field label="Dari Tanggal">
              {(id) => (
                <Input
                  id={id}
                  type="date"
                  value={dari}
                  onInput={(e) => setDari(e.currentTarget.value)}
                  max={sampai || undefined}
                />
              )}
            </Field>
            <Field
              label="Sampai Tanggal"
              error={dari && sampai && dari > sampai ? 'Tanggal akhir sebelum tanggal awal' : undefined}
            >
              {(id, dId) => (
                <Input
                  id={id}
                  type="date"
                  value={sampai}
                  onInput={(e) => setSampai(e.currentTarget.value)}
                  min={dari || undefined}
                  aria-invalid={Boolean(dari && sampai && dari > sampai)}
                  aria-describedby={dId}
                />
              )}
            </Field>
            <div class="flex items-center gap-2 flex-wrap pb-0.5">
              <Button
                size="sm"
                variant={!dari && !sampai ? 'primary' : 'secondary'}
                onClick={() => {
                  setDari('');
                  setSampai('');
                }}
              >
                Semua
              </Button>
              <Button
                size="sm"
                variant={dari === today && sampai === today ? 'primary' : 'secondary'}
                onClick={() => {
                  setDari(today);
                  setSampai(today);
                }}
              >
                Hari Ini
              </Button>
              <Button
                size="sm"
                variant={dari === hMinus7 && sampai === today ? 'primary' : 'secondary'}
                onClick={() => {
                  setDari(hMinus7);
                  setSampai(today);
                }}
              >
                7 Hari
              </Button>
              <Button
                size="sm"
                variant={dari === awalBulan && sampai === today ? 'primary' : 'secondary'}
                onClick={() => {
                  setDari(awalBulan);
                  setSampai(today);
                }}
              >
                Bulan Ini
              </Button>
            </div>
          </div>
        </Card>

        <div class="flex items-center justify-between text-xs text-muted-fg px-1">
          <span>
            Menampilkan <strong class="num text-fg">{filteredRekap.length}</strong> dari <span class="num">{d.rekap.length}</span> rekap
            {(dari || sampai) && (
              <span> · Rentang: <strong>{dari || 'Awal'}</strong> s/d <strong>{sampai || 'Sekarang'}</strong></span>
            )}
          </span>
        </div>

        <DataTable
          cols={hisCols}
          rows={filteredRekap.map((x, i) => ({ ...x, i }))}
          rowKey={(x) => x.id}
          empty={
            dari || sampai
              ? 'Tidak ada riwayat rekap pada rentang tanggal yang dipilih.'
              : 'Belum ada riwayat rekap.'
          }
        />
      </Section>
    </div>
  );
}
