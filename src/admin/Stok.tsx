import { useMemo, useState } from 'preact/hooks';
import { CalendarBlank, CookingPot, Plus, Truck } from '@phosphor-icons/react';
import { cegahBukanAngka, hanyaAngka, nf, parseNum, ymd, ymdhm } from '../lib/format';
import { Banner, Button, Card, Field, Input, PageTitle, Select, cx } from '../components/ui';
import { Section, useAdmin } from './shared';
import { BarangSelect, TxList } from './Tx';
import { TambahSupplierDialog } from './TambahSupplierDialog';

export function MasukPage() {
  const { d, A } = useAdmin();
  const aktif = d.barang.filter((b) => b.aktif);
  const [mode, setMode] = useState<'supplier' | 'produksi'>('supplier');
  const [f, setF] = useState({ b: '', j: '', s: '', c: '' });
  const [err, setErr] = useState<{ b?: string; j?: string }>({});
  const barangOpsi = useMemo(() => {
    if (mode === 'produksi') {
      return aktif.filter((item) => item.bisa_produksi);
    }
    return aktif;
  }, [aktif, mode]);
  const b = barangOpsi.find((x) => x.id === f.b);
  const [filterWaktu, setFilterWaktu] = useState<string>('20');
  const [tglDari, setTglDari] = useState(ymd(new Date()));
  const [tglSampai, setTglSampai] = useState(ymd(new Date()));
  const [modalSupplier, setModalSupplier] = useState(false);

  const listSupplier = useMemo(() => {
    const set = new Set<string>();
    const list: string[] = [];
    const tambah = (s?: string) => {
      const clean = (s || '').trim();
      if (!clean) return;
      const lower = clean.toLowerCase();
      if (!set.has(lower)) {
        set.add(lower);
        list.push(clean);
      }
    };
    tambah('CV. Dapur Rumah Rasa');
    (d.daftarSupplier || []).forEach(tambah);
    (d.transaksi || []).forEach((t) => tambah(t.supplier));
    return list;
  }, [d.daftarSupplier, d.transaksi]);
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
    const listMasuk = d.transaksi.filter((t) => t.jenis === 'MASUK' || t.jenis === 'PRODUKSI');
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
    if (mode === 'produksi') {
      if (await A('simpanProduksiAdmin', [f.b, parseNum(f.j), f.c.trim(), reqId], 'Hasil produksi dicatat')) {
        setF({ b: f.b, j: '', s: '', c: '' });
      }
    } else {
      if (await A('stokMasuk', [f.b, parseNum(f.j), f.s.trim(), f.c.trim(), reqId], 'Stok masuk dicatat')) {
        setF({ b: f.b, j: '', s: f.s, c: '' });
      }
    }
  };

  return (
    <div class="flex flex-col gap-6">
      <PageTitle
        kicker={mode === 'produksi' ? 'Produksi' : 'Restock'}
        title={mode === 'produksi' ? 'Hasil produksi dapur' : 'Stok masuk'}
        sub={
          mode === 'produksi'
            ? 'Catat hasil olahan/batching dapur ke gudang (Stock Dalam).'
            : 'Catat barang yang datang dari supplier ke gudang (Stock Dalam).'
        }
      />

      {/* Segmented Control Mode */}
      <div class="flex items-center gap-1.5 rounded-xl bg-muted p-1 border border-line w-fit">
        <button
          type="button"
          onClick={() => {
            setMode('supplier');
            setErr({});
          }}
          class={cx(
            'flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-sm font-bold transition-all cursor-pointer select-none',
            mode === 'supplier'
              ? 'bg-card text-fg shadow-xs border border-line'
              : 'text-muted-fg hover:text-fg'
          )}
        >
          <Truck size={18} weight="bold" class={mode === 'supplier' ? 'text-primary' : ''} aria-hidden />
          <span>Datang dari Supplier</span>
        </button>
        <button
          type="button"
          onClick={() => {
            setMode('produksi');
            setErr({});
            if (f.b && !aktif.find((x) => x.id === f.b)?.bisa_produksi) {
              setF((prev) => ({ ...prev, b: '' }));
            }
          }}
          class={cx(
            'flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-sm font-bold transition-all cursor-pointer select-none',
            mode === 'produksi'
              ? 'bg-card text-fg shadow-xs border border-line'
              : 'text-muted-fg hover:text-fg'
          )}
        >
          <CookingPot size={18} weight="bold" class={mode === 'produksi' ? 'text-primary' : ''} aria-hidden />
          <span>Hasil Produksi Dapur</span>
        </button>
      </div>

      {mode === 'produksi' && barangOpsi.length === 0 && (
        <Banner tone="warning">
          Belum ada barang dengan status <strong>Bisa Diproduksi Karyawan</strong>. Buka menu{' '}
          <strong>Barang</strong> lalu edit barang dan aktifkan opsi produksinya.
        </Banner>
      )}

      <Card class="p-4 md:p-5">
        <form onSubmit={simpan} class="grid gap-4 md:grid-cols-2" noValidate>
          <Field
            label={mode === 'produksi' ? 'Barang Hasil Produksi' : 'Barang'}
            error={err.b}
            class="md:col-span-2"
            hint={b ? `Stok gudang sekarang: ${nf(b.stok_dalam)} ${b.satuan}` : undefined}
          >
            {(id) => (
              <BarangSelect
                id={id}
                value={f.b}
                onChange={(v) => setF({ ...f, b: v })}
                list={barangOpsi}
                invalid={!!err.b}
              />
            )}
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
          {mode === 'supplier' && (
            <Field label="Supplier (opsional)">
              {(id) => (
                <div class="flex items-center gap-2">
                <Select
                  id={id}
                  value={f.s}
                  onChange={(e) => {
                    const val = e.currentTarget.value;
                    if (val === '__TAMBAH__') {
                      setModalSupplier(true);
                      return;
                    }
                    setF({ ...f, s: val });
                  }}
                  class="flex-1 font-medium"
                >
                  <option value="">Pilih supplier (opsional)...</option>
                  {listSupplier.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                  {f.s && !listSupplier.includes(f.s) && (
                    <option value={f.s}>{f.s} (Kustom)</option>
                  )}
                  <option value="__TAMBAH__">+ Tambah Supplier Baru...</option>
                </Select>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setModalSupplier(true)}
                  title="Tambah Supplier Baru"
                  class="shrink-0 h-10 px-3 border border-line hover:border-primary/50 text-xs sm:text-sm font-semibold"
                >
                  <Plus size={16} class="mr-1 inline text-primary" aria-hidden />
                  <span>Tambah</span>
                </Button>
                </div>
              )}
            </Field>
          )}
          <Field
            label={mode === 'produksi' ? 'Keterangan / Batch (opsional)' : 'Catatan (opsional)'}
            class={mode === 'produksi' ? 'md:col-span-1' : 'md:col-span-2'}
          >
            {(id) => (
              <Input
                id={id}
                value={f.c}
                placeholder={mode === 'produksi' ? 'mis. Batch 1, Marinasi sore' : ''}
                onInput={(e) => setF({ ...f, c: e.currentTarget.value })}
              />
            )}
          </Field>
          <div class="md:col-span-2">
            <Button type="submit" variant="success" size="lg" guard class="w-full md:w-auto">
              {mode === 'produksi' ? 'Simpan hasil produksi' : 'Simpan stok masuk'}
            </Button>
          </div>
        </form>
      </Card>
      <Section
        title={mode === 'produksi' ? 'Terakhir Masuk & Produksi' : 'Terakhir masuk'}
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
              Menampilkan <strong class="num text-fg">{filteredMasuk.length}</strong> transaksi stok masuk & produksi
            </p>
          )}
          <TxList list={filteredMasuk} withAct />
        </div>
      </Section>
      <TambahSupplierDialog
        open={modalSupplier}
        onClose={() => setModalSupplier(false)}
        onSelect={(sup) => setF((prev) => ({ ...prev, s: sup }))}
      />
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
