import { useState } from 'preact/hooks';
import { cegahBukanAngka, hanyaAngka, nf, parseNum, ymdhm } from '../lib/format';
import { Banner, Button, Card, Field, Input, PageTitle, Select } from '../components/ui';
import { Section, useAdmin } from './shared';
import { BarangSelect, TxList } from './Tx';

export function MasukPage() {
  const { d, A } = useAdmin();
  const aktif = d.barang.filter((b) => b.aktif);
  const [f, setF] = useState({ b: '', j: '', s: '', c: '' });
  const [err, setErr] = useState<{ b?: string; j?: string }>({});
  const b = aktif.find((x) => x.id === f.b);

  const simpan = async (e: Event) => {
    e.preventDefault();
    const er: typeof err = {};
    if (!f.b) er.b = 'Pilih barang';
    if (!(parseNum(f.j) > 0)) er.j = 'Jumlah harus lebih dari 0';
    setErr(er);
    if (Object.keys(er).length) return;
    const reqId = Date.now() + '-' + Math.random().toString(36).slice(2, 8);
    if (await A('stokMasuk', [f.b, parseNum(f.j), f.s.trim(), f.c.trim(), reqId], 'Stok masuk dicatat')) setF({ b: f.b, j: '', s: f.s, c: '' });
  };

  return (
    <div class="flex flex-col gap-6">
      <PageTitle kicker="Restock" title="Stok masuk" sub="Catat barang yang datang dari supplier ke gudang (Stock Dalam)." />
      <Card class="p-4 md:p-5">
        <form onSubmit={simpan} class="grid gap-4 md:grid-cols-2" noValidate>
          <Field label="Barang" error={err.b} class="md:col-span-2" hint={b ? `Stok gudang sekarang: ${nf(b.stok_dalam)} ${b.satuan}` : undefined}>
            {(id) => <BarangSelect id={id} value={f.b} onChange={(v) => setF({ ...f, b: v })} list={aktif} invalid={!!err.b} />}
          </Field>
          <Field label={`Jumlah datang${b ? ` (${b.satuan})` : ''}`} error={err.j}>
            {(id, dId) => (
              <Input
                id={id}
                type="text"
                inputmode="decimal"
                autocomplete="off"
                placeholder="0"
                value={f.j}
                onKeyDown={(e) => cegahBukanAngka(e, f.j)}
                onInput={(e) => setF({ ...f, j: hanyaAngka(e.currentTarget.value) })}
                aria-invalid={!!err.j}
                aria-describedby={dId}
                class="num font-bold text-lg"
              />
            )}
          </Field>
          <Field label="Supplier (opsional)">{(id) => <Input id={id} value={f.s} onInput={(e) => setF({ ...f, s: e.currentTarget.value })} />}</Field>
          <Field label="Catatan (opsional)" class="md:col-span-2">
            {(id) => <Input id={id} value={f.c} onInput={(e) => setF({ ...f, c: e.currentTarget.value })} />}
          </Field>
          <div class="md:col-span-2">
            <Button type="submit" variant="success" size="lg" guard class="w-full md:w-auto">
              Simpan stok masuk
            </Button>
          </div>
        </form>
      </Card>
      <Section title="Terakhir masuk">
        <TxList list={d.transaksi.filter((t) => t.jenis === 'MASUK').slice(0, 20)} />
      </Section>
    </div>
  );
}

export function ManualPage() {
  const { d, A } = useAdmin();
  const aktif = d.barang.filter((b) => b.aktif);
  const kar = d.karyawan.filter((k) => k.aktif);
  const [f, setF] = useState({ k: '', b: '', j: '', w: ymdhm(new Date()) });
  const [err, setErr] = useState<{ k?: string; b?: string; j?: string; w?: string }>({});
  const b = aktif.find((x) => x.id === f.b);

  const simpan = async (e: Event) => {
    e.preventDefault();
    const er: typeof err = {};
    if (!f.k) er.k = 'Pilih karyawan';
    if (!f.b) er.b = 'Pilih barang';
    if (!(parseNum(f.j) > 0)) er.j = 'Jumlah harus lebih dari 0';
    const ts = new Date(f.w).getTime();
    if (!f.w || isNaN(ts)) er.w = 'Isi waktu pengambilan';
    else if (ts > Date.now() + 60000) er.w = 'Waktu tidak boleh di masa depan';
    else if (d.lastRekap && ts <= d.lastRekap) er.w = `Waktu harus setelah rekap terakhir (${d.status.lastRekap || 'terbaru'})`;
    setErr(er);
    if (Object.keys(er).length) return;
    if (await A('ambilAdmin', [f.k, f.b, parseNum(f.j), ts], 'Pengambilan dicatat')) setF({ ...f, j: '' });
  };

  return (
    <div class="flex flex-col gap-6">
      <PageTitle kicker="Koreksi" title="Ambil manual" />
      <Banner tone="info">
        Untuk mencatat pengambilan yang ditulis di kertas saat internet mati. Waktu harus setelah rekap terakhir{d.status.lastRekap ? ` (${d.status.lastRekap})` : ''}.
      </Banner>
      <Card class="p-4 md:p-5">
        <form onSubmit={simpan} class="grid gap-4 md:grid-cols-2" noValidate>
          <Field label="Karyawan" error={err.k}>
            {(id) => (
              <Select id={id} value={f.k} onChange={(e) => setF({ ...f, k: e.currentTarget.value })} aria-invalid={!!err.k}>
                <option value="">Pilih karyawan…</option>
                {kar.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.nama}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Waktu" error={err.w}>
            {(id) => <Input id={id} type="datetime-local" value={f.w} onInput={(e) => setF({ ...f, w: e.currentTarget.value })} aria-invalid={!!err.w} />}
          </Field>
          <Field label="Barang" error={err.b} hint={b ? `Stok gudang: ${nf(b.stok_dalam)} ${b.satuan}` : undefined}>
            {(id) => <BarangSelect id={id} value={f.b} onChange={(v) => setF({ ...f, b: v })} list={aktif} invalid={!!err.b} />}
          </Field>
          <Field label={`Jumlah${b ? ` (${b.satuan})` : ''}`} error={err.j}>
            {(id, dId) => (
              <Input
                id={id}
                type="text"
                inputmode="decimal"
                autocomplete="off"
                placeholder="0"
                value={f.j}
                onKeyDown={(e) => cegahBukanAngka(e, f.j)}
                onInput={(e) => setF({ ...f, j: hanyaAngka(e.currentTarget.value) })}
                aria-invalid={!!err.j}
                aria-describedby={dId}
                class="num font-bold text-lg"
              />
            )}
          </Field>
          <div class="md:col-span-2">
            <Button type="submit" variant="primary" size="lg" guard class="w-full md:w-auto">
              Simpan pengambilan
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
