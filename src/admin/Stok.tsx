import { useMemo, useState } from 'preact/hooks';
import { CalendarBlank } from '@phosphor-icons/react';
import { cegahBukanAngka, hanyaAngka, nf, parseNum, ymd, ymdhm } from '../lib/format';
import { Banner, Button, Card, Field, Input, PageTitle, Select } from '../components/ui';
import { Section, useAdmin } from './shared';
import { BarangSelect, TxList } from './Tx';

export function MasukPage() {
  const { d, A } = useAdmin();
  const aktif = d.barang.filter((b) => b.aktif);
  const [f, setF] = useState({ b: '', j: '', s: '', c: '' });
  const [err, setErr] = useState<{ b?: string; j?: string }>({});
  const b = aktif.find((x) => x.id === f.b);
  const [filterWaktu, setFilterWaktu] = useState<string>('20');
  const [tglDari, setTglDari] = useState(ymd(new Date()));
  const [tglSampai, setTglSampai] = useState(ymd(new Date()));

  const ambilTs = (t: { ts?: number | string; waktu?: string }): number => {
    const n = Number(t.ts);
    if (Number.isFinite(n) && n > 0) return n;
    if (t.waktu) {
      const m = t.waktu.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}))?/);
      if (m) {
        const d = Number(m[1]), mo = Number(m[2]) - 1, y = Number(m[3]);
        const h = Number(m[4] || 0), mi = Number(m[5] || 0);
        return new Date(y, mo, d, h, mi).getTime();
      }
    }
    return 0;
  };

  const filteredMasuk = useMemo(() => {
    const listMasuk = d.transaksi.filter((t) => t.jenis === 'MASUK');
    if (filterWaktu === '20') {
      return listMasuk.slice(0, 20);
    }
    if (filterWaktu === 'semua') {
      return listMasuk;
    }

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const endOfToday = startOfToday + 86400000 - 1;

    let minTs = 0;
    let maxTs = Infinity;

    if (filterWaktu === 'hari_ini') {
      minTs = startOfToday;
      maxTs = endOfToday;
    } else if (filterWaktu === 'kemarin') {
      minTs = startOfToday - 86400000;
      maxTs = startOfToday - 1;
    } else if (filterWaktu === '7_hari') {
      minTs = startOfToday - 6 * 86400000;
      maxTs = endOfToday;
    } else if (filterWaktu === '30_hari') {
      minTs = startOfToday - 29 * 86400000;
      maxTs = endOfToday;
    } else if (filterWaktu === 'bulan_ini') {
      minTs = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
      maxTs = endOfToday;
    } else if (filterWaktu === 'kustom') {
      if (tglDari) {
        minTs = new Date(`${tglDari}T00:00:00`).getTime();
      }
      if (tglSampai) {
        maxTs = new Date(`${tglSampai}T23:59:59.999`).getTime();
      }
    }

    return listMasuk.filter((t) => {
      const ts = ambilTs(t);
      return ts >= minTs && ts <= maxTs;
    });
  }, [d.transaksi, filterWaktu, tglDari, tglSampai]);
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
      <Section
        title="Terakhir masuk"
        actions={
          <div class="flex flex-wrap items-center gap-2">
            <div class="flex items-center gap-1.5">
              <CalendarBlank size={18} class="text-muted-fg shrink-0" aria-hidden />
              <Select
                id="filter-waktu-masuk"
                aria-label="Filter waktu transaksi masuk"
                value={filterWaktu}
                onChange={(e) => setFilterWaktu(e.currentTarget.value)}
                class="min-h-9 py-1 text-xs sm:text-sm font-semibold pr-7"
              >
                <option value="20">20 Terakhir</option>
                <option value="hari_ini">Hari ini</option>
                <option value="kemarin">Kemarin</option>
                <option value="7_hari">7 hari terakhir</option>
                <option value="30_hari">30 hari terakhir</option>
                <option value="bulan_ini">Bulan ini</option>
                <option value="kustom">Pilih tanggal…</option>
                <option value="semua">Semua waktu</option>
              </Select>
            </div>
            {filterWaktu === 'kustom' && (
              <div class="flex items-center gap-1.5">
                <Input
                  type="date"
                  aria-label="Tanggal mulai"
                  value={tglDari}
                  onInput={(e) => setTglDari(e.currentTarget.value)}
                  class="min-h-9 py-1 text-xs sm:text-sm w-auto font-medium"
                />
                <span class="text-xs text-muted-fg">s/d</span>
                <Input
                  type="date"
                  aria-label="Tanggal akhir"
                  value={tglSampai}
                  onInput={(e) => setTglSampai(e.currentTarget.value)}
                  class="min-h-9 py-1 text-xs sm:text-sm w-auto font-medium"
                />
              </div>
            )}
          </div>
        }
      >
        <div class="flex flex-col gap-2">
          {filterWaktu !== '20' && (
            <p class="text-xs text-muted-fg" aria-live="polite">
              Menampilkan <strong class="num text-fg">{filteredMasuk.length}</strong> transaksi stok masuk
            </p>
          )}
          <TxList list={filteredMasuk} />
        </div>
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
