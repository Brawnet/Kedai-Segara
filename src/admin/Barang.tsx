import { useMemo, useState } from 'preact/hooks';
import { MagnifyingGlass, PencilSimple, Plus } from '@phosphor-icons/react';
import { alurLabel, cocok, grupKat, urutKat } from '../lib/format';
import type { Alur, Barang, BarangInput } from '../lib/types';
import { Button, Dialog, Field, Input, PageTitle, Select, Tag } from '../components/ui';
import { nf } from '../lib/format';
import { DataTable, useAdmin, type Col } from './shared';

type Form = Required<Omit<BarangInput, 'ambang_min' | 'stok_awal'>> & { ambang_min: string; stok_awal: string };

const kosong: Form = { id: '', nama: '', satuan: '', kategori: '', kode: '', catatan: '', alur: 'LUAR', ambang_min: '', aktif: true, stok_awal: '0' };

export function BarangPage() {
  const { d, A } = useAdmin();
  const [q, setQ] = useState('');
  const [f, setF] = useState<Form | null>(null);
  const [err, setErr] = useState<Partial<Record<keyof Form, string>>>({});
  const kats = useMemo(() => urutKat(d.barang, d.urutan), [d]);
  const list = d.barang.filter((b) => cocok(b, q) || b.kategori.toLowerCase().includes(q.toLowerCase().trim()));

  const buka = (b?: Barang) => {
    setErr({});
    setF(b ? { ...b, ambang_min: String(b.ambang_min), stok_awal: '' } : { ...kosong });
  };
  const up = (p: Partial<Form>) => setF((x) => x && { ...x, ...p });

  const simpan = async (e: Event) => {
    e.preventDefault();
    if (!f) return;
    const er: typeof err = {};
    if (!f.nama.trim()) er.nama = 'Nama wajib diisi';
    if (!f.satuan.trim()) er.satuan = 'Satuan wajib diisi';
    setErr(er);
    if (Object.keys(er).length) return;
    const o: BarangInput = { ...f, id: f.id || '', stok_awal: f.id ? undefined : f.stok_awal };
    if (await A('simpanBarang', [o], 'Barang disimpan')) setF(null);
  };

  const cols: Col<Barang>[] = [
    {
      label: 'Barang',
      cell: (b) => (
        <div>
          <span class="flex flex-wrap items-center gap-2">
            <span class="font-semibold">{b.nama}</span>
            {b.kode && <Tag>{b.kode}</Tag>}
            {!b.aktif && <Tag tone="danger">Arsip</Tag>}
          </span>
          {b.catatan && <p class="text-sm font-normal text-muted-fg">{b.catatan}</p>}
        </div>
      ),
    },
    { label: 'Satuan', cell: (b) => b.satuan },
    { label: 'Alur', cell: (b) => <span class="text-sm">{alurLabel(b.alur)}</span> },
    { label: 'Min', align: 'right', cell: (b) => nf(b.ambang_min) },
    {
      label: ' ',
      bare: true,
      align: 'right',
      cell: (b) => (
        <Button size="sm" onClick={() => buka(b)} aria-label={`Edit ${b.nama}`} class="max-md:w-full">
          <PencilSimple size={18} aria-hidden /> Edit
        </Button>
      ),
    },
  ];

  return (
    <div class="flex flex-col gap-6">
      <PageTitle
        kicker="Master"
        title="Barang"
        sub={`${d.barang.filter((b) => b.aktif).length} aktif · ${d.barang.filter((b) => !b.aktif).length} diarsipkan`}
        actions={
          <Button variant="primary" onClick={() => buka()}>
            <Plus size={20} weight="bold" aria-hidden /> Tambah barang
          </Button>
        }
      />
      <label class="relative block">
        <span class="sr-only">Cari barang</span>
        <MagnifyingGlass size={20} class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-fg" aria-hidden />
        <Input type="search" value={q} onInput={(e) => setQ(e.currentTarget.value)} placeholder="Cari nama, kode, atau kategori…" class="pl-10" />
      </label>
      <DataTable cols={cols} groups={grupKat(list, d.urutan)} rowKey={(b) => b.id} rowClass={(b) => (b.aktif ? '' : 'opacity-70')} empty="Tidak ada barang." />

      <Dialog
        open={!!f}
        onClose={() => setF(null)}
        title={f?.id ? `Edit: ${f.nama}` : 'Tambah barang'}
        wide
        footer={
          <>
            <Button onClick={() => setF(null)}>Batal</Button>
            <Button variant="primary" guard type="submit" form="form-barang">
              Simpan
            </Button>
          </>
        }
      >
        {f && (
          <form id="form-barang" onSubmit={simpan} class="grid gap-4 sm:grid-cols-2" noValidate>
            <Field label="Nama" error={err.nama} class="sm:col-span-2">
              {(id, dId) => <Input id={id} value={f.nama} onInput={(e) => up({ nama: e.currentTarget.value })} aria-invalid={!!err.nama} aria-describedby={dId} />}
            </Field>
            <Field label="Kode" hint="Singkatan untuk pencarian cepat, mis. AS">
              {(id, dId) => <Input id={id} value={f.kode} onInput={(e) => up({ kode: e.currentTarget.value })} aria-describedby={dId} autocomplete="off" />}
            </Field>
            <Field label="Satuan" error={err.satuan}>
              {(id, dId) => (
                <Input id={id} value={f.satuan} onInput={(e) => up({ satuan: e.currentTarget.value })} placeholder="kg, liter, pcs" aria-invalid={!!err.satuan} aria-describedby={dId} />
              )}
            </Field>
            <Field label="Kategori" hint="Pilih yang ada atau ketik kategori baru">
              {(id, dId) => (
                <>
                  <Input id={id} list="dl-kat" value={f.kategori} onInput={(e) => up({ kategori: e.currentTarget.value })} aria-describedby={dId} autocomplete="off" />
                  <datalist id="dl-kat">
                    {kats.map((k) => (
                      <option key={k} value={k} />
                    ))}
                  </datalist>
                </>
              )}
            </Field>
            <Field label="Alur">
              {(id) => (
                <Select id={id} value={f.alur} onChange={(e) => up({ alur: e.currentTarget.value as Alur })}>
                  <option value="LUAR">Lewat Stock Luar (direkap)</option>
                  <option value="LANGSUNG_HABIS">Langsung habis</option>
                </Select>
              )}
            </Field>
            <Field label="Ambang minimum" hint="Muncul peringatan jika total stok di bawah angka ini">
              {(id, dId) => <Input id={id} inputmode="decimal" value={f.ambang_min} onInput={(e) => up({ ambang_min: e.currentTarget.value })} aria-describedby={dId} class="num" />}
            </Field>
            {f.id ? (
              <Field label="Status" hint="Arsip hanya bisa jika stok dalam dan luar = 0">
                {(id, dId) => (
                  <Select id={id} value={f.aktif ? '1' : '0'} onChange={(e) => up({ aktif: e.currentTarget.value === '1' })} aria-describedby={dId}>
                    <option value="1">Aktif</option>
                    <option value="0">Diarsipkan</option>
                  </Select>
                )}
              </Field>
            ) : (
              <Field label="Stok awal gudang">
                {(id) => <Input id={id} inputmode="decimal" value={f.stok_awal} onInput={(e) => up({ stok_awal: e.currentTarget.value })} class="num" />}
              </Field>
            )}
            <Field label="Catatan" class="sm:col-span-2">
              {(id) => <Input id={id} value={f.catatan} onInput={(e) => up({ catatan: e.currentTarget.value })} placeholder="mis. 1 Pack isi 10 pcs" />}
            </Field>
          </form>
        )}
      </Dialog>
    </div>
  );
}
