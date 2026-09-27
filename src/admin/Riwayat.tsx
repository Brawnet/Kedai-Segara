import { useMemo, useState } from 'preact/hooks';
import { FunnelSimple } from '@phosphor-icons/react';
import { katOf, urutKat } from '../lib/format';
import type { Barang } from '../lib/types';
import { Button, Card, Field, PageTitle, Select } from '../components/ui';
import { useAdmin } from './shared';
import { TxList } from './Tx';

export function RiwayatPage() {
  const { d } = useAdmin();
  const [f, setF] = useState({ j: '', k: '', c: '', b: '' });
  const kb = useMemo(() => Object.fromEntries(d.barang.map((b) => [b.id, b])) as Record<string, Barang>, [d]);
  const katT = (t: { kategori: string; barang_id: string }) => t.kategori || kb[t.barang_id]?.kategori || 'Lainnya';
  const bs = d.barang.filter((b) => !f.c || katOf(b) === f.c).sort((a, b) => (a.nama < b.nama ? -1 : 1));

  const list = d.transaksi
    .filter((t) => (!f.j || t.jenis === f.j) && (!f.k || t.karyawan_id === f.k) && (!f.c || katT(t) === f.c) && (!f.b || t.barang_id === f.b))
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
            <Button size="sm" variant="ghost" class="ml-auto" onClick={() => setF({ j: '', k: '', c: '', b: '' })}>
              Reset
            </Button>
          )}
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
      </Card>
      <p class="text-sm text-muted-fg" aria-live="polite">
        <strong class="num text-fg">{list.length}</strong> transaksi · <span class="num">{n('AMBIL')}</span> ambil · <span class="num">{n('MASUK')}</span> masuk ·{' '}
        <span class="num">{n('OPNAME')}</span> opname
      </p>
      <TxList list={list} withAct />
      <p class="text-sm text-muted-fg">Menampilkan 400 transaksi terbaru. Riwayat lengkap ada di sheet Transaksi.</p>
    </div>
  );
}
