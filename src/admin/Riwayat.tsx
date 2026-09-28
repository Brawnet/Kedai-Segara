import { useMemo, useState } from 'preact/hooks';
import { FunnelSimple } from '@phosphor-icons/react';
import { katOf, urutKat, ymd } from '../lib/format';
import type { Barang, Transaksi } from '../lib/types';
import { Button, Card, Field, Input, PageTitle, Select } from '../components/ui';
import { useAdmin } from './shared';
import { TxList } from './Tx';

export function RiwayatPage() {
  const { d } = useAdmin();
  const [f, setF] = useState({ j: '', k: '', c: '', b: '', dari: '', sampai: '' });
  const kb = useMemo(() => Object.fromEntries(d.barang.map((b) => [b.id, b])) as Record<string, Barang>, [d]);
  const katT = (t: { kategori: string; barang_id: string }) => t.kategori || kb[t.barang_id]?.kategori || 'Lainnya';
  const bs = d.barang.filter((b) => !f.c || katOf(b) === f.c).sort((a, b) => (a.nama < b.nama ? -1 : 1));

  const now = new Date();
  const today = ymd(now);
  const hMinus7 = ymd(new Date(now.getTime() - 7 * 864e5));
  const awalBulan = ymd(new Date(now.getFullYear(), now.getMonth(), 1));

  const txTgl = (t: Transaksi) => {
    if (t.ts && !isNaN(t.ts)) return ymd(new Date(t.ts));
    const m = t.waktu ? t.waktu.match(/^(\d{2})\/(\d{2})\/(\d{4})/) : null;
    return m ? `${m[3]}-${m[2]}-${m[1]}` : '';
  };

  const list = d.transaksi
    .filter((t) => {
      if (f.j && t.jenis !== f.j) return false;
      if (f.k && t.karyawan_id !== f.k) return false;
      if (f.c && katT(t) !== f.c) return false;
      if (f.b && t.barang_id !== f.b) return false;
      if (f.dari || f.sampai) {
        const tgl = txTgl(t);
        if (!tgl) return true;
        if (f.dari && tgl < f.dari) return false;
        if (f.sampai && tgl > f.sampai) return false;
      }
      return true;
    })
    .map((t) => ({ ...t, kategori: katT(t), satuan: t.satuan || kb[t.barang_id]?.satuan || '' }));
  const ok = list.filter((t) => t.status !== 'BATAL');
  const n = (j: string) => ok.filter((t) => t.jenis === j).length;
  const aktifFilter = Object.values(f).some(Boolean);

  return (
    <div class="flex flex-col gap-6">
      <PageTitle kicker="Jejak audit" title="Riwayat transaksi" />
      <Card class="p-4">
        <div class="mb-3 flex items-center gap-2 font-bold">
          <FunnelSimple size={20} aria-hidden /> Filter
          {aktifFilter && (
            <Button size="sm" variant="ghost" class="ml-auto" onClick={() => setF({ j: '', k: '', c: '', b: '', dari: '', sampai: '' })}>
              Reset
            </Button>
          )}
        </div>
        <div class="flex flex-col gap-4">
          <div class="flex flex-col gap-2 rounded-card border border-line bg-muted/40 p-3">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <span class="text-xs font-bold uppercase tracking-wider text-muted-fg">Filter Tanggal</span>
              <div class="flex items-center gap-1.5 flex-wrap">
                <Button
                  size="sm"
                  variant={!f.dari && !f.sampai ? 'primary' : 'secondary'}
                  class="h-8 min-h-8 text-xs px-2.5"
                  onClick={() => setF({ ...f, dari: '', sampai: '' })}
                >
                  Semua
                </Button>
                <Button
                  size="sm"
                  variant={f.dari === today && f.sampai === today ? 'primary' : 'secondary'}
                  class="h-8 min-h-8 text-xs px-2.5"
                  onClick={() => setF({ ...f, dari: today, sampai: today })}
                >
                  Hari Ini
                </Button>
                <Button
                  size="sm"
                  variant={f.dari === hMinus7 && f.sampai === today ? 'primary' : 'secondary'}
                  class="h-8 min-h-8 text-xs px-2.5"
                  onClick={() => setF({ ...f, dari: hMinus7, sampai: today })}
                >
                  7 Hari
                </Button>
                <Button
                  size="sm"
                  variant={f.dari === awalBulan && f.sampai === today ? 'primary' : 'secondary'}
                  class="h-8 min-h-8 text-xs px-2.5"
                  onClick={() => setF({ ...f, dari: awalBulan, sampai: today })}
                >
                  Bulan Ini
                </Button>
              </div>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Dari Tanggal">
                {(id) => (
                  <Input
                    id={id}
                    type="date"
                    value={f.dari}
                    onInput={(e) => setF({ ...f, dari: e.currentTarget.value })}
                    max={f.sampai || undefined}
                  />
                )}
              </Field>
              <Field
                label="Sampai Tanggal"
                error={f.dari && f.sampai && f.dari > f.sampai ? 'Tanggal akhir sebelum tanggal awal' : undefined}
              >
                {(id, dId) => (
                  <Input
                    id={id}
                    type="date"
                    value={f.sampai}
                    onInput={(e) => setF({ ...f, sampai: e.currentTarget.value })}
                    min={f.dari || undefined}
                    aria-invalid={Boolean(f.dari && f.sampai && f.dari > f.sampai)}
                    aria-describedby={dId}
                  />
                )}
              </Field>
            </div>
          </div>

          <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Jenis">
            {(id) => (
              <Select id={id} value={f.j} onChange={(e) => setF({ ...f, j: e.currentTarget.value })}>
                <option value="">Semua</option>
                <option value="AMBIL">Ambil</option>
                <option value="MASUK">Masuk / tambah</option>
                <option value="OPNAME">Opname</option>
              </Select>
            )}
          </Field>
          <Field label="Karyawan">
            {(id) => (
              <Select id={id} value={f.k} onChange={(e) => setF({ ...f, k: e.currentTarget.value })}>
                <option value="">Semua</option>
                {d.karyawan.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.nama}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Kategori">
            {(id) => (
              <Select id={id} value={f.c} onChange={(e) => setF({ ...f, c: e.currentTarget.value, b: '' })}>
                <option value="">Semua</option>
                {urutKat(d.barang, d.urutan).map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Barang">
            {(id) => (
              <Select id={id} value={f.b} onChange={(e) => setF({ ...f, b: e.currentTarget.value })}>
                <option value="">Semua</option>
                {bs.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.nama}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          </div>
        </div>
      </Card>
      <p class="text-sm text-muted-fg" aria-live="polite">
        <strong class="num text-fg">{list.length}</strong> transaksi · <span class="num">{n('AMBIL')}</span> ambil · <span class="num">{n('MASUK')}</span> masuk ·{' '}
        <span class="num">{n('OPNAME')}</span> opname
        {(f.dari || f.sampai) && (
          <span> · Rentang: <strong>{f.dari || 'Awal'}</strong> s/d <strong>{f.sampai || 'Sekarang'}</strong></span>
        )}
      </p>
      <TxList list={list} withAct />
      <p class="text-sm text-muted-fg">Menampilkan 400 transaksi terbaru. Riwayat lengkap ada di sheet Transaksi.</p>
    </div>
  );
}
