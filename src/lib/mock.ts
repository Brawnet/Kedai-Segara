// Backend palsu untuk `npm run dev` saja (tidak ikut ke build produksi).
// Meniru logika Kode.gs secukupnya agar semua layar bisa diuji tanpa Google.
import type {
  AdminData,
  Api,
  Barang,
  BarangTablet,
  KaryawanAdmin,
  Opname,
  Rekap,
  RekapBaris,
  RekapRow,
  Transaksi,
} from './types';

type Impl = { [K in keyof Api]: (...a: Parameters<Api[K]>) => ReturnType<Api[K]> };

const r_ = (x: number) => Math.round(x * 1000) / 1000;
const num = (x: unknown) => {
  const n = Number(String(x).replace(',', '.'));
  return isNaN(n) ? 0 : n;
};
let seq = 0;
const uid = () => 'm' + (++seq).toString(36) + Math.random().toString(36).slice(2, 7);
const fmt = (ms: number) => {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

const DATA: [string, [string, string, string, string?][]][] = [
  ['Freezer Protein', [['AS', 'Ayam Suwir', 'Porsi'], ['TK', 'Topping Kwetiau', 'Porsi'], ['AJ', 'Ayam Jamur', 'Porsi'], ['DGM', 'Dada Gurih Manis', 'Porsi'], ['C', 'Cumi', 'Porsi'], ['L', 'Lidah', 'Porsi'], ['TP', 'Teri Pete', 'Porsi']]],
  ['Freezer Bumbu', [['SB', 'Sambal Bawang', 'Pack'], ['SK', 'Sambal Kuning', 'Pack'], ['BS', 'Bumbu Segara', 'Pack'], ['BK', 'Bumbu Kwetiau', 'Pack']]],
  ['Flavourful Drink', [['M', 'Mineral', 'Botol'], ['AT', 'Air Tahu', 'Botol'], ['Polaris', 'Soda Polaris', 'Kaleng'], ['Kopi', 'Kopi', 'Pack']]],
  ['Barang Kering (Dairy + Plant Base Milk)', [['UHT', 'Diamond Milk', 'Pcs'], ['Evap', 'Susu Evaporasi', 'Kaleng'], ['Keju', 'Keju', 'Pcs']]],
  ['Cleaning Supplies + Utensils', [['Ps.ukS', 'Plastik Sampah S', 'Lbr', '1 Pack Isi 10 pcs'], ['Paper', 'Thermal Paper', 'Roll'], ['Tmeja', 'Tissue Meja', 'Pack'], ['Sdt', 'Sedotan', 'Pack']]],
];

export function createMock(): Impl {
  let PIN = '12345';
  let jamTutup = '21:00';
  const urutan = DATA.map((d) => d[0]);
  const barang: Barang[] = [];
  DATA.forEach(([kat, items], gi) =>
    items.forEach(([kode, nama, satuan, catatan], i) =>
      barang.push({
        id: uid(), nama, satuan, kategori: kat, kode, catatan: catatan || '',
        stok_dalam: 5 + ((i * 7 + gi * 3) % 25), stok_luar: 0, ambang_min: 8,
        alur: kat.startsWith('Cleaning') && i > 1 ? 'LANGSUNG_HABIS' : 'LUAR', aktif: true,
      }),
    ),
  );
  const karyawan: KaryawanAdmin[] = ['Budi Santoso', 'Sari', 'Andi Wijaya', 'Rina'].map((nama) => ({ id: uid(), nama, aktif: true }));
  const transaksi: Transaksi[] = [];
  const rekap: Omit<Rekap, 'baris'>[] = [];
  const rekapBaris: RekapBaris[] = [];
  const opname: Opname[] = [];

  const auth = (pin: string) => {
    if (String(pin).trim() !== PIN) throw new Error('PIN salah');
  };
  const find = (id: string) => barang.find((b) => b.id === id);
  const findK = (id: string) => karyawan.find((k) => k.id === id);
  const tab = (b: Barang): BarangTablet => ({ id: b.id, nama: b.nama, satuan: b.satuan, kategori: b.kategori, alur: b.alur, kode: b.kode, catatan: b.catatan });
  const lastRekapTs = () => rekap.reduce((m, r) => Math.max(m, r.ts), 0);
  const openTx = (last: number) => transaksi.filter((t) => t.jenis === 'AMBIL' && t.alur === 'LUAR' && t.status === 'AKTIF' && t.ts > last);
  const status = () => {
    const last = lastRekapTs();
    const tx = openTx(last);
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return {
      belumRekap: tx.length,
      lewatHari: tx.some((t) => t.ts < d.getTime()),
      lastRekap: last ? fmt(last) : null,
      barangLuar: barang.filter((b) => b.stok_luar > 0).length,
    };
  };
  const tx = (o: Partial<Transaksi>): Transaksi => {
    const ts = o.ts ?? Date.now();
    const t: Transaksi = {
      id: uid(), ts, waktu: fmt(ts), jenis: 'MASUK', barang_id: '', barang: '', jumlah: 0, karyawan_id: '', karyawan: '',
      alur: '', supplier: '', status: 'AKTIF', dicatat_oleh: 'admin', catatan: '', kategori: '', satuan: '', ...o,
    };
    transaksi.push(t);
    return t;
  };
  const ambil_ = (kid: string, bid: string, j: number, ts: number, oleh: 'admin' | 'karyawan') => {
    j = r_(num(j));
    if (!(j > 0)) throw new Error('Jumlah harus lebih dari 0');
    const b = find(bid), k = findK(kid);
    if (!b || !b.aktif) throw new Error('Barang tidak ditemukan');
    if (!k) throw new Error('Karyawan tidak ditemukan');
    if (j > b.stok_dalam + 1e-9)
      throw new Error(oleh === 'admin' ? `Stok gudang tidak cukup. Sisa: ${b.stok_dalam} ${b.satuan}` : 'Jumlah melebihi stok gudang yang tercatat. Hubungi admin.');
    b.stok_dalam = r_(b.stok_dalam - j);
    if (b.alur === 'LUAR') b.stok_luar = r_(b.stok_luar + j);
    const t = tx({ ts, jenis: 'AMBIL', barang_id: b.id, barang: b.nama, jumlah: j, karyawan_id: k.id, karyawan: k.nama, alur: b.alur, dicatat_oleh: oleh, kategori: b.kategori, satuan: b.satuan });
    return { tx: { id: t.id, ts }, barang: oleh === 'admin' ? { ...b } : tab(b) };
  };
  const hitung = (cutoff: number, last = lastRekapTs()): RekapRow[] => {
    const before: Record<string, number> = {}, after: Record<string, number> = {};
    openTx(last).forEach((t) => {
      const m = t.ts <= cutoff ? before : after;
      m[t.barang_id] = r_((m[t.barang_id] || 0) + t.jumlah);
    });
    return barang
      .map((b) => {
        const d = before[b.id] || 0, a = after[b.id] || 0;
        const awal = Math.max(0, r_(b.stok_luar - d - a));
        return { barang_id: b.id, nama: b.nama, satuan: b.satuan, saldo_awal: awal, diambil: d, setelah: a, maks: r_(awal + d) };
      })
      .filter((x) => x.maks > 0);
  };

  // Data contoh: beberapa pengambilan hari ini.
  const now = Date.now();
  [[0, 0, 3], [1, 4, 2], [2, 8, 1]].forEach(([k, b, j], i) => {
    const bb = barang[b]!;
    bb.stok_dalam += j!;
    ambil_(karyawan[k]!.id, bb.id, j!, now - (i + 1) * 3600e3, 'karyawan');
  });

  const setelahDesc = <T extends { ts: number }>(a: T, b: T) => b.ts - a.ts;

  return {
    getTablet: () => ({
      barang: barang.filter((b) => b.aktif).map(tab),
      karyawan: karyawan.filter((k) => k.aktif).map(({ id, nama }) => ({ id, nama })),
      status: status(),
      urutan,
      jamTutup,
    }),
    ambil: (k, b, j) => ambil_(k, b, j, Date.now(), 'karyawan'),
    masukKaryawan: (kid, bid, j, supplier) => {
      j = r_(num(j));
      if (!(j > 0)) throw new Error('Jumlah harus lebih dari 0');
      const b = find(bid), k = findK(kid);
      if (!b || !k) throw new Error('Barang tidak ditemukan');
      b.stok_dalam = r_(b.stok_dalam + j);
      tx({ jenis: 'MASUK', barang_id: b.id, barang: b.nama, jumlah: j, karyawan_id: k.id, karyawan: k.nama, supplier, dicatat_oleh: 'karyawan', kategori: b.kategori, satuan: b.satuan });
      return true;
    },
    batalAmbil: (txId, pin) => {
      const t = transaksi.find((x) => x.id === txId);
      if (!t || t.jenis !== 'AMBIL' || t.status !== 'AKTIF') throw new Error('Transaksi tidak bisa dibatalkan');
      const admin = pin && pin === PIN;
      if (!admin && Date.now() - t.ts > 65000) throw new Error('Batas 60 detik lewat. Minta admin untuk membatalkan.');
      if (t.ts <= lastRekapTs()) throw new Error('Sudah direkap. Koreksi lewat edit rekap atau opname.');
      const b = find(t.barang_id)!;
      b.stok_dalam = r_(b.stok_dalam + t.jumlah);
      if (t.alur === 'LUAR') b.stok_luar = Math.max(0, r_(b.stok_luar - t.jumlah));
      t.status = 'BATAL';
      return true;
    },
    rekapDraf: () => {
      const c = Date.now();
      return { cutoff: c, baris: hitung(c) };
    },
    simpanRekap: (cutoff, kid, input) => {
      const last = lastRekapTs();
      if (cutoff <= last) throw new Error('Sudah ada rekap yang lebih baru. Buka ulang menu rekap.');
      const k = findK(kid);
      if (!k) throw new Error('Karyawan tidak ditemukan');
      const draf = hitung(cutoff, last);
      const by = Object.fromEntries(input.map((i) => [i.barang_id, i]));
      draf.forEach((r) => {
        const i = by[r.barang_id];
        if (!i || i.sisa === '' || isNaN(Number(i.sisa))) throw new Error('Sisa ' + r.nama + ' belum diisi');
        const s = num(i.sisa);
        if (s < 0 || s > r.maks + 1e-9) throw new Error(`Sisa ${r.nama} harus 0 sampai ${r.maks}`);
      });
      const id = uid();
      rekap.push({ id, ts: cutoff, waktu: fmt(cutoff), karyawan_id: k.id, karyawan: k.nama, diedit_admin: false });
      draf.forEach((r) => {
        const i = by[r.barang_id]!, s = r_(num(i.sisa));
        find(r.barang_id)!.stok_luar = r_(s + r.setelah);
        rekapBaris.push({ rekap_id: id, barang_id: r.barang_id, barang: r.nama, saldo_awal: r.saldo_awal, diambil: r.diambil, sisa: s, terpakai: r_(r.maks - s), catatan: i.catatan || '' });
      });
      return { id };
    },

    adminData: (pin): AdminData => {
      auth(pin);
      return JSON.parse(
        JSON.stringify({
          barang,
          karyawan,
          transaksi: [...transaksi].sort(setelahDesc).slice(0, 400),
          rekap: [...rekap].sort(setelahDesc).slice(0, 30).map((r) => ({ ...r, baris: rekapBaris.filter((x) => x.rekap_id === r.id) })),
          opname: [...opname].sort(setelahDesc).slice(0, 100),
          status: status(),
          lastRekap: lastRekapTs(),
          urutan,
          jamTutup,
          url: 'https://docs.google.com/spreadsheets/',
        }),
      );
    },
    simpanBarang: (pin, o) => {
      auth(pin);
      if (!o.nama.trim() || !o.satuan.trim()) throw new Error('Nama dan satuan wajib diisi');
      const kd = o.kode.trim();
      if (kd && barang.some((x) => x.kode === kd && x.id !== (o.id || ''))) throw new Error('Kode ' + kd + ' sudah dipakai barang lain');
      if (o.id) {
        const b = find(o.id);
        if (!b) throw new Error('Barang tidak ditemukan');
        if (!o.aktif && b.aktif && (b.stok_dalam > 0 || b.stok_luar > 0)) throw new Error('Barang hanya bisa diarsipkan jika stok dalam dan luar = 0');
        Object.assign(b, { nama: o.nama.trim(), satuan: o.satuan.trim(), kategori: o.kategori.trim(), kode: kd, catatan: o.catatan.trim(), alur: o.alur, ambang_min: num(o.ambang_min), aktif: o.aktif });
      } else {
        const awal = r_(num(o.stok_awal));
        const b: Barang = { id: uid(), nama: o.nama.trim(), satuan: o.satuan.trim(), kategori: o.kategori.trim(), kode: kd, catatan: o.catatan.trim(), alur: o.alur, ambang_min: num(o.ambang_min), aktif: true, stok_dalam: awal, stok_luar: 0 };
        barang.push(b);
        if (awal > 0) tx({ jenis: 'MASUK', barang_id: b.id, barang: b.nama, jumlah: awal, catatan: 'Stok awal', kategori: b.kategori, satuan: b.satuan });
      }
      return true;
    },
    simpanKaryawan: (pin, o) => {
      auth(pin);
      if (!o.nama.trim()) throw new Error('Nama wajib diisi');
      if (o.id) Object.assign(findK(o.id)!, { nama: o.nama.trim(), aktif: o.aktif !== false });
      else karyawan.push({ id: uid(), nama: o.nama.trim(), aktif: true });
      return true;
    },
    stokMasuk: (pin, bid, j, supplier, catatan) => {
      auth(pin);
      const n = r_(num(j));
      if (!(n > 0)) throw new Error('Jumlah harus lebih dari 0');
      const b = find(bid);
      if (!b) throw new Error('Barang tidak ditemukan');
      b.stok_dalam = r_(b.stok_dalam + n);
      tx({ jenis: 'MASUK', barang_id: b.id, barang: b.nama, jumlah: n, supplier, catatan, kategori: b.kategori, satuan: b.satuan });
      return true;
    },
    ambilAdmin: (pin, kid, bid, j, ts) => {
      auth(pin);
      ts = num(ts) || Date.now();
      if (ts > Date.now() + 60000) throw new Error('Waktu tidak boleh di masa depan');
      if (ts <= lastRekapTs()) throw new Error('Waktu sebelum rekap terakhir. Koreksi lewat edit rekap atau opname.');
      return ambil_(kid, bid, num(j), ts, 'admin');
    },
    simpanOpname: (pin, items) => {
      auth(pin);
      const ts = Date.now();
      let n = 0;
      items.forEach((i) => {
        if (i.fisik === '') return;
        const f = r_(num(i.fisik));
        if (f < 0) throw new Error('Stok fisik tidak boleh negatif');
        const b = find(i.barang_id);
        if (!b) return;
        const sel = r_(f - b.stok_dalam);
        opname.push({ id: uid(), ts, waktu: fmt(ts), barang_id: b.id, barang: b.nama, sistem: b.stok_dalam, fisik: f, selisih: sel });
        if (sel) tx({ ts, jenis: 'OPNAME', barang_id: b.id, barang: b.nama, jumlah: sel, catatan: `Sistem ${b.stok_dalam} → fisik ${f}`, kategori: b.kategori, satuan: b.satuan });
        b.stok_dalam = f;
        n++;
      });
      return n;
    },
    editRekapTerakhir: (pin, input) => {
      auth(pin);
      const rk = [...rekap].sort(setelahDesc)[0];
      if (!rk) throw new Error('Belum ada rekap');
      let n = 0;
      input.forEach((i) => {
        const x = rekapBaris.find((b) => b.rekap_id === rk.id && b.barang_id === i.barang_id);
        if (!x || i.sisa === '') return;
        const s = r_(num(i.sisa)), maks = r_(x.saldo_awal + x.diambil);
        if (s < 0 || s > maks + 1e-9) throw new Error(`Sisa ${x.barang} harus 0 sampai ${maks}`);
        const delta = r_(s - x.sisa);
        if (!delta) return;
        const b = find(x.barang_id)!;
        b.stok_luar = r_(b.stok_luar + delta);
        x.sisa = s;
        x.terpakai = r_(maks - s);
        n++;
      });
      if (n) rk.diedit_admin = true;
      return n;
    },
    simpanPengaturan: (pin, jam, baru) => {
      auth(pin);
      if (jam) jamTutup = jam;
      if (baru) {
        if (!/^\d{4,8}$/.test(baru)) throw new Error('PIN harus 4–8 angka');
        PIN = baru;
      }
      return true;
    },
    laporan: (pin, dari, sampai) => {
      auth(pin);
      const p = (s: string, add = 0) => {
        const a = s.split('-').map(Number);
        return new Date(a[0]!, a[1]! - 1, a[2]! + add).getTime();
      };
      const t0 = p(dari), t1 = p(sampai, 1);
      const map: Record<string, { nama: string; satuan: string; masuk: number; rk: number; lh: number; op: number }> = {};
      const g = (id: string, nama: string) => {
        const b = find(id);
        return (map[id] ??= { nama: b?.nama ?? nama, satuan: b?.satuan ?? '', masuk: 0, rk: 0, lh: 0, op: 0 });
      };
      const ids = new Set(rekap.filter((r) => r.ts >= t0 && r.ts < t1).map((r) => r.id));
      rekapBaris.forEach((x) => ids.has(x.rekap_id) && (g(x.barang_id, x.barang).rk += x.terpakai));
      transaksi.forEach((t) => {
        if (t.ts < t0 || t.ts >= t1 || t.status !== 'AKTIF') return;
        if (t.jenis === 'MASUK') g(t.barang_id, t.barang).masuk += t.jumlah;
        else if (t.jenis === 'AMBIL' && t.alur === 'LANGSUNG_HABIS') g(t.barang_id, t.barang).lh += t.jumlah;
        else if (t.jenis === 'OPNAME') g(t.barang_id, t.barang).op += t.jumlah;
      });
      return Object.values(map)
        .map((r) => ({ nama: r.nama, satuan: r.satuan, masuk: r_(r.masuk), terpakai_rekap: r_(r.rk), langsung_habis: r_(r.lh), total_terpakai: r_(r.rk + r.lh), opname: r_(r.op) }))
        .sort((a, b) => (a.nama < b.nama ? -1 : 1));
    },
    laporanKeSheet: (pin) => {
      auth(pin);
      return 'https://docs.google.com/spreadsheets/';
    },
  };
}
