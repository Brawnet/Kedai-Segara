import { useState } from 'preact/hooks';
import { PencilSimple, Plus, UserCircleMinus, UserCirclePlus } from '@phosphor-icons/react';
import type { KaryawanAdmin } from '../lib/types';
import { Button, Card, Dialog, Field, Input, PageTitle, Tag } from '../components/ui';
import { DataTable, useAdmin, type Col } from './shared';

export function KaryawanPage() {
  const { d, A } = useAdmin();
  const [baru, setBaru] = useState('');
  const [errBaru, setErrBaru] = useState('');
  const [ren, setRen] = useState<{ k: KaryawanAdmin; nama: string } | null>(null);

  const tambah = async (e: Event) => {
    e.preventDefault();
    if (!baru.trim()) return setErrBaru('Nama wajib diisi');
    setErrBaru('');
    if (await A('simpanKaryawan', [{ nama: baru.trim() }], 'Karyawan ditambahkan')) setBaru('');
  };
  const simpanNama = async (e: Event) => {
    e.preventDefault();
    if (!ren || !ren.nama.trim()) return;
    if (await A('simpanKaryawan', [{ id: ren.k.id, nama: ren.nama.trim(), aktif: ren.k.aktif }], 'Nama diperbarui')) setRen(null);
  };

  const cols: Col<KaryawanAdmin>[] = [
    { label: 'Nama', cell: (k) => <span class="font-semibold">{k.nama}</span> },
    { label: 'Status', cell: (k) => (k.aktif ? <Tag tone="success">Aktif</Tag> : <Tag>Nonaktif</Tag>) },
    {
      label: ' ',
      bare: true,
      align: 'right',
      cell: (k) => (
        <div class="flex flex-wrap justify-end gap-2 max-md:grid max-md:grid-cols-2">
          <Button size="sm" onClick={() => setRen({ k, nama: k.nama })}>
            <PencilSimple size={18} aria-hidden /> Ubah nama
          </Button>
          <Button
            size="sm"
            guard
            variant={k.aktif ? 'danger-ghost' : 'secondary'}
            onClick={() => A('simpanKaryawan', [{ id: k.id, nama: k.nama, aktif: !k.aktif }], 'Status diperbarui')}
          >
            {k.aktif ? <UserCircleMinus size={18} aria-hidden /> : <UserCirclePlus size={18} aria-hidden />}
            {k.aktif ? 'Nonaktifkan' : 'Aktifkan'}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div class="flex flex-col gap-6">
      <PageTitle kicker="Master" title="Karyawan" sub="Karyawan nonaktif hilang dari tablet, riwayatnya tetap tersimpan." />
      <Card class="p-4">
        <form onSubmit={tambah} class="flex flex-col gap-3 sm:flex-row sm:items-start" noValidate>
          <Field label="Nama karyawan baru" error={errBaru} class="flex-1">
            {(id, dId) => <Input id={id} value={baru} onInput={(e) => setBaru(e.currentTarget.value)} aria-invalid={!!errBaru} aria-describedby={dId} autocomplete="off" />}
          </Field>
          <Button type="submit" variant="primary" guard class="sm:mt-[1.625rem]">
            <Plus size={20} weight="bold" aria-hidden /> Tambah
          </Button>
        </form>
      </Card>
      <DataTable cols={cols} rows={d.karyawan} rowKey={(k) => k.id} empty="Belum ada karyawan." />

      <Dialog
        open={!!ren}
        onClose={() => setRen(null)}
        title="Ubah nama"
        footer={
          <>
            <Button onClick={() => setRen(null)}>Batal</Button>
            <Button variant="primary" guard type="submit" form="form-ren" disabled={!ren?.nama.trim()}>
              Simpan
            </Button>
          </>
        }
      >
        {ren && (
          <form id="form-ren" onSubmit={simpanNama}>
            <Field label="Nama baru">
              {(id) => <Input id={id} value={ren.nama} onInput={(e) => setRen({ ...ren, nama: e.currentTarget.value })} autoFocus />}
            </Field>
          </form>
        )}
      </Dialog>
    </div>
  );
}
