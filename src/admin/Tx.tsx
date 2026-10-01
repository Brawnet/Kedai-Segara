import { useState } from 'preact/hooks';
import { ArrowCounterClockwise } from '@phosphor-icons/react';
import { nf } from '../lib/format';
import type { Barang, Transaksi } from '../lib/types';
import { Button, Confirm, Select, Tag } from '../components/ui';
import { grupKat } from '../lib/format';
import { DataTable, useAdmin, type Col } from './shared';

const JENIS: Record<string, [string, 'primary' | 'success' | 'warning']> = {
  AMBIL: ['Ambil', 'primary'],
  MASUK: ['Masuk', 'success'],
  PRODUKSI: ['Produksi', 'primary'],
  OPNAME: ['Opname', 'warning'],
};

/** Daftar transaksi; `withAct` menampilkan tombol batal untuk pengambilan yang belum direkap. */
export function TxList({ list, withAct }: { list: Transaksi[]; withAct?: boolean }) {
  const { d, run, pin } = useAdmin();
  const [batal, setBatal] = useState<Transaksi | null>(null);


  const cols: Col<Transaksi>[] = [
    {
      label: 'Barang',
      cell: (t) => (
        <div class={t.status === 'BATAL' ? 'text-muted-fg line-through' : ''}>
          <span class="font-semibold">{t.barang}</span>
          {t.kategori && <p class="text-sm font-normal text-muted-fg no-underline">{t.kategori}</p>}
        </div>
      ),
    },
    {
      label: 'Jenis',
      cell: (t) => (
        <span class="inline-flex flex-wrap justify-end gap-1">
          <Tag tone={JENIS[t.jenis]?.[1] ?? 'primary'}>{JENIS[t.jenis]?.[0] ?? t.jenis}</Tag>
          {t.status === 'BATAL' && <Tag tone="danger">Batal</Tag>}
        </span>
      ),
    },
    {
      label: 'Jumlah',
      align: 'right',
      cell: (t) => (
        <strong class={t.status === 'BATAL' ? 'text-muted-fg line-through' : ''}>
          {t.jenis === 'OPNAME' && t.jumlah > 0 ? '+' : ''}
          {nf(t.jumlah)} {t.satuan}
        </strong>
      ),
    },
    { label: 'Waktu', cell: (t) => <span class="num whitespace-nowrap text-sm">{t.waktu}</span> },
    { label: 'Oleh', cell: (t) => t.karyawan || 'Admin' },
    {
      label: 'Keterangan',
      cell: (t) => {
        const info = [
          t.jenis === 'AMBIL' ? (t.alur === 'LUAR' ? 'lewat luar' : 'langsung habis') : '',
          t.supplier,
          t.dicatat_oleh === 'admin' && t.jenis === 'AMBIL' ? 'input admin' : '',
        ]
          .filter(Boolean)
          .join(' · ');

        return (
          <div class="flex flex-col gap-0.5 text-sm">
            {t.catatan && (
              <span class="font-medium text-fg italic leading-snug">
                "{t.catatan}"
              </span>
            )}
            {info && <span class="text-xs text-muted-fg">{info}</span>}
            {!t.catatan && !info && <span class="text-muted-fg">—</span>}
          </div>
        );
      },
    },
  ];
  if (withAct)
    cols.push({
      label: ' ',
      bare: true,
      align: 'right',
      cell: (t) => {
        const canCancelAmbil = t.jenis === 'AMBIL' && t.status === 'AKTIF' && Number(t.ts) > d.lastRekap;
        const canCancelProduksi = t.jenis === 'PRODUKSI' && t.status === 'AKTIF';
        const canCancelMasuk = t.jenis === 'MASUK' && t.status === 'AKTIF';
        if (canCancelAmbil || canCancelProduksi || canCancelMasuk) {
          return (
            <Button size="sm" variant="danger-ghost" onClick={() => setBatal(t)} class="max-md:w-full">
              <ArrowCounterClockwise size={18} aria-hidden /> Batalkan
            </Button>
          );
        }
        return null;
      },
    });

  return (
    <>
      <DataTable cols={cols} rows={list} rowKey={(t) => t.id} empty="Tidak ada transaksi." />
      <Confirm
        open={!!batal}
        title={batal?.jenis === 'PRODUKSI' ? 'Batalkan transaksi produksi?' : batal?.jenis === 'MASUK' ? 'Batalkan stok masuk?' : 'Batalkan pengambilan?'}
        okLabel="Ya, batalkan"
        tone="danger"
        onCancel={() => setBatal(null)}
        onOk={async () => {
          if (!batal) return;
          if (batal.jenis === 'PRODUKSI') {
            await run('batalProduksi', [batal.id, pin], 'Transaksi produksi dibatalkan');
          } else if (batal.jenis === 'MASUK') {
            await run('batalMasuk', [batal.id, pin], 'Stok masuk dibatalkan');
          } else {
            await run('batalAmbil', [batal.id, pin], 'Transaksi dibatalkan');
          }
          setBatal(null);
        }}
      >
        {batal &&
          (batal.jenis === 'PRODUKSI' ? (
            <>
              Produksi <strong class="num text-fg">{nf(batal.jumlah)} {batal.satuan}</strong> {batal.barang} ({batal.waktu}) oleh <strong>{batal.karyawan || 'Admin'}</strong>. Stok akan dikurangi kembali dari gudang.
            </>
          ) : batal.jenis === 'MASUK' ? (
            <>
              Stok masuk <strong class="num text-fg">{nf(batal.jumlah)} {batal.satuan}</strong> {batal.barang} ({batal.waktu}). Stok akan dikurangi kembali dari gudang.
            </>
          ) : (
            <>
              {batal.karyawan} ambil <strong class="num text-fg">{nf(batal.jumlah)} {batal.satuan}</strong> {batal.barang} ({batal.waktu}). Stok dikembalikan ke gudang.
            </>
          ))}
      </Confirm>
    </>
  );
}

/** Select barang dikelompokkan per kategori. */
export function BarangSelect({ id, value, onChange, list, invalid }: { id: string; value: string; onChange: (v: string) => void; list: Barang[]; invalid?: boolean }) {
  const { d } = useAdmin();
  return (
    <Select id={id} value={value} onChange={(e) => onChange(e.currentTarget.value)} aria-invalid={invalid}>
      <option value="">Pilih barang…</option>
      {grupKat(list, d.urutan).map((g) => (
        <optgroup key={g.k} label={g.k}>
          {g.l.map((b) => (
            <option key={b.id} value={b.id}>
              {b.nama} ({b.satuan}){b.kode ? ` · ${b.kode}` : ''}
            </option>
          ))}
        </optgroup>
      ))}
    </Select>
  );
}
