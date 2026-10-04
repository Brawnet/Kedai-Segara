// Backend palsu untuk `npm run dev` saja (tidak ikut ke build produksi).
// Meniru logika Kode.gs secukupnya agar semua layar bisa diuji tanpa Google.
import type {
  AdminData,
  Api,
  AuthAccount,
  Barang,
  BarangTablet,
  KaryawanAdmin,
  LoginLog,
  Opname,
  Rekap,
  RekapBaris,
  RekapRow,
  Transaksi,
} from './types';
import { formatNamaAdmin } from './format.ts';
type Impl = { [K in keyof Api]: (...a: Parameters<Api[K]>) => ReturnType<Api[K]> };

const r_ = (x: number) => Math.round(x * 1000) / 1000;
const num = (x: unknown) => {
  const n = Number(String(x).replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};
const numWajib = (x: unknown, label: string) => {
  const s = String(x === null || x === undefined ? '' : x).trim().replace(',', '.');
  const n = s === '' ? NaN : Number(s);
  if (!Number.isFinite(n)) throw new Error(label + ' tidak valid: ' + x);
  return n;
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

function mockHash(val: string, salt: string) {
  let h = 0x811c9dc5;
  const s = `${val}:${salt}`;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `hash_${(h >>> 0).toString(16)}`;
}

export function createMock(): Impl {
  let PIN = '12345';
  let jamTutup = '21:00';
  let googleClientId = '';
  const authWhitelist: (AuthAccount & { pinHash?: string; salt?: string })[] = [
    { email: 'admin@segara.com', role: 'admin', aktif: true, dibuat: Date.now() - 86400000, pinHash: mockHash('12345', 'admin_salt'), salt: 'admin_salt' },
    { email: 'tablet@segara.com', role: 'tablet', aktif: true, dibuat: Date.now() - 86400000 },
  ];
  const loginLogs: LoginLog[] = [];
  const otpStore: Record<string, { code: string; exp: number }> = {};
  const idempotencyStore: Record<string, unknown> = {};
  const withIdem = <T>(key: string | undefined, fn: () => T): T => {
    if (!key) return fn();
    if (key in idempotencyStore) return idempotencyStore[key] as T;
    const res = fn();
    idempotencyStore[key] = res;
    return res;
  };
  const catatLog = (email: string, metode: string, role: string, status: string, userAgent = '') => {
    loginLogs.unshift({
      id: uid(),
      ts: Date.now(),
      waktu: fmt(Date.now()),
      email: email.toLowerCase().trim(),
      metode,
      role,
      status,
      user_agent: userAgent,
    });
  };
  const urutan = DATA.map((d) => d[0]);
  const daftarSupplier: string[] = ['CV. Dapur Rumah Rasa'];
  const daftarSatuan: string[] = ['Porsi', 'Pack', 'Pcs', 'Botol', 'Kaleng', 'Lbr', 'Kg', 'Gram', 'Liter', 'Cup', 'Bungkus', 'Dus', 'Piring', 'Mangkok'];
  const barang: Barang[] = [];
  DATA.forEach(([kat, items], gi) =>
    items.forEach(([kode, nama, satuan, catatan], i) =>
      barang.push({
        id: uid(), nama, satuan, kategori: kat, kode, catatan: catatan || '',
        stok_dalam: 5 + ((i * 7 + gi * 3) % 25), stok_luar: 0, ambang_min: 8,
        alur: kat.startsWith('Cleaning') && i > 1 ? 'LANGSUNG_HABIS' : 'LUAR', aktif: true,
        bisa_produksi: false,
      }),
    ),
  );
  const fails: Record<string, { count: number; lockUntil: number }> = {};
  const rateLimitGuard = (key: string) => {
    const f = fails[key];
    if (f && f.lockUntil > Date.now()) {
      const wait = Math.ceil((f.lockUntil - Date.now()) / 1000);
      throw new Error(`Terlalu banyak percobaan gagal. Silakan tunggu ${wait} detik.`);
    }
  };
  const rateLimitFail = (key: string) => {
    if (!fails[key]) fails[key] = { count: 0, lockUntil: 0 };
    fails[key].count++;
    if (fails[key].count >= 5) {
      fails[key].lockUntil = Date.now() + 60_000;
      fails[key].count = 0;
    }
  };
  const rateLimitReset = (key: string) => {
    delete fails[key];
  };


  const karyawan: KaryawanAdmin[] = ['Budi Santoso', 'Sari', 'Andi Wijaya', 'Rina'].map((nama, i) => {
    const id = uid();
    return {
      id,
      nama,
      aktif: true,
      pin: i === 0 ? mockHash('1234', `salt_${id}`) : '',
      punyaPin: i === 0,
      pinLen: i === 0 ? 4 : undefined,
    };
  });
  const transaksi: Transaksi[] = [];
  const rekap: Omit<Rekap, 'baris'>[] = [];
  const rekapBaris: RekapBaris[] = [];
  const opname: Opname[] = [];

  const verifySession = (tok?: string, allowedRole?: 'admin' | 'tablet') => {
    if (!tok) return;
    if (!tok.startsWith('mock_tok_')) throw new Error('Akses ditolak: sesi login tidak valid.');
    const parts = tok.split('_');
    const email = parts[3] || '';
    const exp = Number(parts[4] || 0);
    if (Date.now() > exp) throw new Error('Sesi telah berakhir. Silakan login kembali.');
    const acc = authWhitelist.find((a) => a.email.toLowerCase() === email.toLowerCase());
    if (!acc || !acc.aktif) throw new Error('Akses akun telah dicabut atau dinonaktifkan.');
    if (allowedRole && acc.role !== allowedRole && acc.role !== 'admin') {
      throw new Error('Akses ditolak: peran "' + acc.role + '" tidak memiliki izin untuk operasi ini.');
    }
  };

  const auth = (pin: string, token?: string) => {
    let email = 'admin';
    if (token) {
      verifySession(token, 'admin');
      const parts = token.split('_');
      email = parts[3] || 'admin';
    }
    const rateKey = `admin_${email}`;
    rateLimitGuard(rateKey);
    const input = String(pin).trim();
    const acc = authWhitelist.find((a) => a.email.toLowerCase() === email.toLowerCase());
    let valid = false;
    if (acc && acc.pinHash) {
      const salt = acc.salt || 'admin_salt';
      valid = mockHash(input, salt) === acc.pinHash || input === acc.pinHash;
    } else if (input === PIN || mockHash(input, 'admin_salt') === PIN) {
      valid = true;
    }
    if (!valid) {
      rateLimitFail(rateKey);
      throw new Error('PIN salah');
    }
    rateLimitReset(rateKey);
  };
  const find = (id: string) => barang.find((b) => b.id === id);
  const findK = (id: string) => karyawan.find((k) => k.id === id);
  const tab = (b: Barang): BarangTablet => ({ id: b.id, nama: b.nama, satuan: b.satuan, kategori: b.kategori, alur: b.alur, kode: b.kode, catatan: b.catatan, stok_luar: b.stok_luar, bisa_produksi: Boolean(b.bisa_produksi) });
  const lastRekapTs = () => rekap.reduce((m, r) => Math.max(m, r.ts), 0);
  const openTx = (last: number) => {
    return transaksi.filter((t) => t.jenis === 'AMBIL' && t.alur === 'LUAR' && t.status === 'AKTIF' && t.ts > last);
  };
  const status = () => {
    const last = lastRekapTs();
    const tx = openTx(last);
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return {
      belumRekap: tx.length,
      lewatHari: tx.some((t) => t.ts < d.getTime()),
      lastRekap: last ? fmt(last) : null,
      barangLuar: barang.filter((b) => b.alur !== 'LANGSUNG_HABIS' && b.stok_luar > 0).length,
    };
  };
  const tx = (o: Partial<Transaksi>): Transaksi => {
    const ts = o.ts ?? Date.now();
    const t: Transaksi = {
      id: uid(), ts, waktu: fmt(ts), jenis: 'MASUK', barang_id: '', barang: '', jumlah: 0, karyawan_id: '', karyawan: '',
      alur: 'DALAM', supplier: '', status: 'AKTIF', dicatat_oleh: 'admin', catatan: '', kategori: '', satuan: '', ...o,
    };
    transaksi.push(t);
    return t;
  };
  const ambil_ = (kid: string, bid: string, j: number, ts: number, oleh: 'admin' | 'karyawan', catatan = '') => {
    j = r_(num(j));
    if (!(j > 0)) throw new Error('Jumlah harus lebih dari 0');
    const b = find(bid), k = findK(kid);
    if (!b || !b.aktif) throw new Error('Barang tidak ditemukan');
    if (!k || (oleh === 'karyawan' && !k.aktif)) throw new Error('Karyawan tidak aktif atau tidak ditemukan');
    if (j > b.stok_dalam + 1e-9)
      throw new Error(oleh === 'admin' ? `Stok gudang tidak cukup. Sisa: ${b.stok_dalam} ${b.satuan}` : 'Jumlah melebihi stok gudang yang tercatat. Hubungi admin.');
    const alur = b.alur === 'LANGSUNG_HABIS' ? 'LANGSUNG_HABIS' : 'LUAR';
    b.stok_dalam = r_(b.stok_dalam - j);
    if (alur === 'LUAR') b.stok_luar = r_(b.stok_luar + j);
    const t = tx({ ts, jenis: 'AMBIL', barang_id: b.id, barang: b.nama, jumlah: j, karyawan_id: k.id, karyawan: k.nama, alur, dicatat_oleh: oleh, kategori: b.kategori, satuan: b.satuan, catatan: String(catatan || '').trim() });
    return { tx: { id: t.id, ts }, barang: oleh === 'admin' ? { ...b } : tab(b) };
  };
  const hitung = (cutoff: number, last = lastRekapTs()): RekapRow[] => {
    const before: Record<string, number> = {}, after: Record<string, number> = {};
    openTx(last).forEach((t) => {
      const m = t.ts <= cutoff ? before : after;
      m[t.barang_id] = r_((m[t.barang_id] || 0) + t.jumlah);
    });
    return barang
      .filter((b) => b.aktif && b.alur !== 'LANGSUNG_HABIS')
      .map((b) => {
        const d = before[b.id] || 0, a = after[b.id] || 0;
        const awal = Math.max(0, r_(b.stok_luar - d - a));
        return { barang_id: b.id, nama: b.nama, satuan: b.satuan, saldo_awal: awal, diambil: d, setelah: a, maks: r_(awal + d) };
      })
      .filter((x) => x.maks > 0);
  };

  const generateDummyRekap = () => {
    const karyawanList = karyawan.filter((k) => k.aktif);
    const p1 = karyawanList[0] || { id: uid(), nama: 'Budi Santoso' };
    const p2 = karyawanList[1] || { id: uid(), nama: 'Sari' };
    const p3 = karyawanList[2] || { id: uid(), nama: 'Andi Wijaya' };

    const luarItems = barang.filter((b) => b.alur === 'LUAR' && b.aktif);
    if (luarItems.length === 0) return 0;

    const dayMs = 86400000;
    const nowTime = Date.now();

    // H-3 jam 21:00
    const t3 = new Date(nowTime - 3 * dayMs);
    t3.setHours(21, 0, 0, 0);
    const ts3 = t3.getTime();

    // H-2 jam 21:00
    const t2 = new Date(nowTime - 2 * dayMs);
    t2.setHours(21, 0, 0, 0);
    const ts2 = t2.getTime();

    // H-1 (kemarin) jam 21:00
    const t1 = new Date(nowTime - 1 * dayMs);
    t1.setHours(21, 0, 0, 0);
    const ts1 = t1.getTime();

    const sisaMap: Record<string, number> = {};

    // 1. Rekap H-3
    const id3 = uid();
    rekap.push({
      id: id3,
      ts: ts3,
      waktu: fmt(ts3),
      karyawan_id: p3.id,
      karyawan: p3.nama,
      diedit_admin: false,
    });

    luarItems.forEach((b, idx) => {
      const sa = 0;
      const ambilJml = 10 + ((idx * 3) % 15);
      const sisa = Math.max(1, Math.round(ambilJml * 0.2));
      const terpakai = sa + ambilJml - sisa;

      tx({
        ts: ts3 - 9 * 3600000,
        jenis: 'AMBIL',
        barang_id: b.id,
        barang: b.nama,
        jumlah: ambilJml,
        karyawan_id: p3.id,
        karyawan: p3.nama,
        alur: b.alur,
        dicatat_oleh: 'karyawan',
        kategori: b.kategori,
        satuan: b.satuan,
      });

      rekapBaris.push({
        rekap_id: id3,
        barang_id: b.id,
        barang: b.nama,
        saldo_awal: sa,
        diambil: ambilJml,
        sisa,
        terpakai,
        catatan: '',
      });
      sisaMap[b.id] = sisa;
    });

    // 2. Rekap H-2
    const id2 = uid();
    rekap.push({
      id: id2,
      ts: ts2,
      waktu: fmt(ts2),
      karyawan_id: p2.id,
      karyawan: p2.nama,
      diedit_admin: false,
    });

    luarItems.forEach((b, idx) => {
      const sa = sisaMap[b.id] || 0;
      const ambilJml = 12 + ((idx * 4) % 18);
      const sisa = Math.max(1, Math.round((sa + ambilJml) * 0.25));
      const terpakai = sa + ambilJml - sisa;

      tx({
        ts: ts2 - 9 * 3600000,
        jenis: 'AMBIL',
        barang_id: b.id,
        barang: b.nama,
        jumlah: ambilJml,
        karyawan_id: p2.id,
        karyawan: p2.nama,
        alur: b.alur,
        dicatat_oleh: 'karyawan',
        kategori: b.kategori,
        satuan: b.satuan,
      });

      rekapBaris.push({
        rekap_id: id2,
        barang_id: b.id,
        barang: b.nama,
        saldo_awal: sa,
        diambil: ambilJml,
        sisa,
        terpakai,
        catatan: '',
      });
      sisaMap[b.id] = sisa;
    });

    // 3. Rekap H-1 (Kemarin)
    const id1 = uid();
    rekap.push({
      id: id1,
      ts: ts1,
      waktu: fmt(ts1),
      karyawan_id: p1.id,
      karyawan: p1.nama,
      diedit_admin: false,
    });

    luarItems.forEach((b, idx) => {
      const sa = sisaMap[b.id] || 0;
      const ambilJml = 15 + ((idx * 5) % 20);
      const sisa = Math.max(2, Math.round((sa + ambilJml) * 0.3));
      const terpakai = sa + ambilJml - sisa;

      tx({
        ts: ts1 - 9 * 3600000,
        jenis: 'AMBIL',
        barang_id: b.id,
        barang: b.nama,
        jumlah: ambilJml,
        karyawan_id: p1.id,
        karyawan: p1.nama,
        alur: b.alur,
        dicatat_oleh: 'karyawan',
        kategori: b.kategori,
        satuan: b.satuan,
      });

      rekapBaris.push({
        rekap_id: id1,
        barang_id: b.id,
        barang: b.nama,
        saldo_awal: sa,
        diambil: ambilJml,
        sisa,
        terpakai,
        catatan: '',
      });
      b.stok_luar = sisa;
      sisaMap[b.id] = sisa;
    });

    // 4. Catat transaksi ambil untuk hari ini agar rekap dapur tablet ada draf aktif
    const jamAmbilHariIni = nowTime - 2 * 3600000;
    luarItems.slice(0, 4).forEach((b, idx) => {
      const j = 5 + idx * 2;
      b.stok_luar = r_(b.stok_luar + j);
      tx({
        ts: jamAmbilHariIni,
        jenis: 'AMBIL',
        barang_id: b.id,
        barang: b.nama,
        jumlah: j,
        karyawan_id: p1.id,
        karyawan: p1.nama,
        alur: b.alur,
        dicatat_oleh: 'karyawan',
        kategori: b.kategori,
        satuan: b.satuan,
      });
    });

    return 3;
  };

  generateDummyRekap();

  const setelahDesc = <T extends { ts: number }>(a: T, b: T) => b.ts - a.ts;

  return {
    getTablet: () => ({
      barang: barang.filter((b) => b.aktif).map(tab),
      karyawan: karyawan.filter((k) => k.aktif).map(({ id, nama, pin, punyaPin, pinLen }) => ({ id, nama, punyaPin: punyaPin ?? !!(pin && pin.trim()), pinLen: pinLen || (pin ? 4 : 0) })),
      status: status(),
      urutan,
      jamTutup,
    }),
    ambil: (k, b, j, catatanOrClientTxId, clientTxId) => {
      let catatan = '';
      let idemKey: string | undefined;
      if (clientTxId !== undefined) {
        catatan = String(catatanOrClientTxId || '');
        idemKey = clientTxId;
      } else if (catatanOrClientTxId !== undefined) {
        idemKey = catatanOrClientTxId;
      }
      return withIdem(idemKey, () => ambil_(k, b, j, Date.now(), 'karyawan', catatan));
    },
    produksiKaryawan: (kid, bid, j, catatan, clientTxId) =>
      withIdem(clientTxId, () => {
        j = r_(num(j));
        if (!(j > 0)) throw new Error('Jumlah harus lebih dari 0');
        const b = find(bid), k = findK(kid);
        if (!b || !b.aktif) throw new Error('Barang tidak ditemukan');
        if (!k || !k.aktif) throw new Error('Karyawan tidak aktif atau tidak ditemukan');
        if (!b.bisa_produksi) throw new Error('Barang ini tidak diatur untuk produksi karyawan');
        b.stok_dalam = r_(b.stok_dalam + j);
        tx({ jenis: 'PRODUKSI', barang_id: b.id, barang: b.nama, jumlah: j, karyawan_id: k.id, karyawan: k.nama, alur: 'DALAM', supplier: '', catatan: catatan || 'Hasil produksi', dicatat_oleh: 'karyawan', kategori: b.kategori, satuan: b.satuan });
        return true;
      }),
    masukKaryawan: (kid, bid, j, supplier, clientTxId) =>
      withIdem(clientTxId, () => {
        const b = find(bid);
        if (b && !b.bisa_produksi) b.bisa_produksi = true;
        j = r_(num(j));
        if (!(j > 0)) throw new Error('Jumlah harus lebih dari 0');
        const k = findK(kid);
        if (!b || !b.aktif) throw new Error('Barang tidak ditemukan');
        if (!k || !k.aktif) throw new Error('Karyawan tidak aktif atau tidak ditemukan');
        b.stok_dalam = r_(b.stok_dalam + j);
        tx({ jenis: 'PRODUKSI', barang_id: b.id, barang: b.nama, jumlah: j, karyawan_id: k.id, karyawan: k.nama, alur: 'DALAM', supplier: '', catatan: supplier || 'Hasil produksi', dicatat_oleh: 'karyawan', kategori: b.kategori, satuan: b.satuan });
        return true;
      }),
    batalAmbil: (txId, pin, token) => {
      let email = 'admin';
      if (token) {
        const parts = token.split('_');
        if (parts[3]) email = parts[3];
      }
      auth(pin, token);
      const t = transaksi.find((x) => x.id === txId);
      if (!t || t.jenis !== 'AMBIL' || t.status !== 'AKTIF') throw new Error('Transaksi tidak bisa dibatalkan');
      if (t.ts <= lastRekapTs()) throw new Error('Sudah direkap. Koreksi lewat edit rekap atau opname.');
      const b = find(t.barang_id);
      if (!b) throw new Error('Barang tidak ditemukan');
      b.stok_dalam = r_(b.stok_dalam + t.jumlah);
      if (t.alur === 'LUAR') b.stok_luar = Math.max(0, r_(b.stok_luar - t.jumlah));
      t.status = 'BATAL';
      t.catatan = (t.catatan ? t.catatan + ' · ' : '') + 'Dibatalkan admin';
      t.dicatat_oleh = email;
      return true;
    },
    batalMasuk: (txId, pin, token) => {
      let email = 'admin';
      if (token) {
        const parts = token.split('_');
        if (parts[3]) email = parts[3];
      }
      auth(pin, token);
      const t = transaksi.find((x) => x.id === txId);
      if (!t || t.jenis !== 'MASUK' || t.status !== 'AKTIF') throw new Error('Transaksi tidak bisa dibatalkan');
      if (t.dicatat_oleh !== 'admin' && t.dicatat_oleh !== email) {
        throw new Error(`Hanya bisa membatalkan stok masuk yang dicatat oleh akun Anda sendiri (${email}).`);
      }
      const b = find(t.barang_id);
      if (!b) throw new Error('Barang tidak ditemukan');
      if (b.stok_dalam < t.jumlah - 1e-9) {
        throw new Error(
          `Gagal membatalkan: Sisa stok gudang (${b.stok_dalam} ${b.satuan}) tidak mencukupi untuk menarik kembali ${t.jumlah} ${b.satuan} stok masuk.`
        );
      }
      b.stok_dalam = Math.max(0, r_(b.stok_dalam - t.jumlah));
      t.status = 'BATAL';
      t.catatan = (t.catatan ? t.catatan + ' · ' : '') + 'Dibatalkan admin';
      return true;
    },
    batalProduksi: (txId, pin, token) => {
      auth(pin, token);
      const t = transaksi.find((x) => x.id === txId);
      if (!t || t.jenis !== 'PRODUKSI' || t.status !== 'AKTIF') throw new Error('Transaksi tidak bisa dibatalkan');
      const b = find(t.barang_id);
      if (!b) throw new Error('Barang tidak ditemukan');
      if (b.stok_dalam < t.jumlah - 1e-9) {
        throw new Error(
          `Gagal membatalkan: Sisa stok gudang (${b.stok_dalam} ${b.satuan}) tidak mencukupi untuk menarik kembali ${t.jumlah} ${b.satuan} hasil produksi.`
        );
      }
      b.stok_dalam = Math.max(0, r_(b.stok_dalam - t.jumlah));
      t.status = 'BATAL';
      t.catatan = (t.catatan ? t.catatan + ' · ' : '') + 'Dibatalkan admin';
      return true;
    },
    rekapDraf: () => {
      const c = Date.now();
      return { cutoff: c, baris: hitung(c) };
    },
    simpanRekap: (cutoff, kid, input, clientTxId) =>
      withIdem(clientTxId, () => {
        cutoff = num(cutoff);
        if (cutoff > Date.now() + 60000) throw new Error('Waktu rekap tidak boleh di masa depan');
        const last = lastRekapTs();
        if (cutoff <= last) throw new Error('Sudah ada rekap yang lebih baru. Buka ulang menu rekap.');
        const k = findK(kid);
        if (!k || !k.aktif) throw new Error('Karyawan tidak aktif atau tidak ditemukan');
        const draf = hitung(cutoff, last);
        const by = Object.fromEntries(input.map((i) => [i.barang_id, i]));
        draf.forEach((r) => {
          const i = by[r.barang_id];
          if (!i || i.sisa === '' || i.sisa === null || Number.isNaN(Number(i.sisa))) throw new Error(`Sisa ${r.nama} belum diisi`);
          const s = num(i.sisa);
          if (s < 0 || s > r.maks + 1e-9) throw new Error(`Sisa ${r.nama} harus 0 sampai ${r.maks}`);
        });
        const id = uid();
        rekap.push({ id, ts: cutoff, waktu: fmt(cutoff), karyawan_id: k.id, karyawan: k.nama, diedit_admin: false, status: 'PENDING' });
        draf.forEach((r) => {
          const i = by[r.barang_id]!, s = r_(num(i.sisa));
          const b = find(r.barang_id);
          if (b) b.stok_luar = r_(s + r.setelah);
          const terpakai = r_(r.maks - s);
          rekapBaris.push({ rekap_id: id, barang_id: r.barang_id, barang: r.nama, saldo_awal: r.saldo_awal, diambil: r.diambil, sisa: s, terpakai, terjual: 0, selisih: terpakai, catatan: i.catatan || '' });
        });
        return { id };
      }),

    adminData: (pin, token): AdminData => {
      auth(pin, token);
      return JSON.parse(
        JSON.stringify({
          barang,
          karyawan: karyawan.map(({ id, nama, aktif, punyaPin, pin, pinLen }) => ({ id, nama, aktif, punyaPin: punyaPin ?? !!(pin && pin.trim()), pinLen: pinLen || (pin ? 4 : 0) })),
          transaksi: [...transaksi].sort(setelahDesc).slice(0, 400),
          rekap: (() => {
            const pending = rekap.filter((r) => (r.status || 'APPROVED') === 'PENDING').sort(setelahDesc);
            const approved = rekap.filter((r) => (r.status || 'APPROVED') === 'APPROVED').sort(setelahDesc).slice(0, 30);
            return [...pending, ...approved].map((r) => ({
              ...r,
              status: r.status || 'APPROVED',
              baris: rekapBaris.filter((x) => x.rekap_id === r.id).map((b) => {
                const adaSelisih = b.selisih !== undefined && b.selisih !== null && String(b.selisih).trim() !== '';
                const adaTerjual = b.terjual !== undefined && b.terjual !== null && String(b.terjual).trim() !== '';
                if (adaSelisih || adaTerjual) {
                  const terjual = num(b.terjual) || 0;
                  const selisih = adaSelisih ? num(b.selisih) : r_(b.terpakai - terjual);
                  return { ...b, terjual, selisih };
                }
                return { ...b, terjual: num(b.terpakai), selisih: 0 };
              }),
            }));
          })(),
          opname: [...opname].sort(setelahDesc).slice(0, 100),
          status: status(),
          lastRekap: lastRekapTs(),
          urutan,
          jamTutup,
          url: 'https://docs.google.com/spreadsheets/',
          daftarSupplier: (() => {
            const set = new Set<string>(daftarSupplier);
            transaksi.forEach((t) => {
              const s = (t.supplier || '').trim();
              if (s) set.add(s);
            });
            return Array.from(set);
          })(),
          daftarSatuan: (() => {
            const set = new Set<string>(daftarSatuan);
            barang.forEach((b) => {
              const s = (b.satuan || '').trim();
              if (s) set.add(s);
            });
            return Array.from(set);
          })(),
        }),
      );
    },
    simpanBarang: (pin, o, token) => {
      auth(pin, token);
      if (!o.nama.trim() || !o.satuan.trim()) throw new Error('Nama dan satuan wajib diisi');
      const min = r_(num(o.ambang_min));
      if (min < 0) throw new Error('Ambang minimum tidak boleh negatif');
      const kd = o.kode.trim();
      if (kd && barang.some((x) => x.kode.toLowerCase() === kd.toLowerCase() && x.id !== (o.id || ''))) throw new Error('Kode ' + kd + ' sudah dipakai barang lain');
      const alur = o.alur === 'LANGSUNG_HABIS' ? 'LANGSUNG_HABIS' : 'LUAR';
      if (o.id) {
        const b = find(o.id);
        if (!b) throw new Error('Barang tidak ditemukan');
        const aktif = o.aktif !== false;
        if (!aktif && b.aktif && (b.stok_dalam > 0 || b.stok_luar > 0)) throw new Error('Barang hanya bisa diarsipkan jika stok dalam dan luar = 0');
        Object.assign(b, { nama: o.nama.trim(), satuan: o.satuan.trim(), kategori: o.kategori.trim(), kode: kd, catatan: o.catatan.trim(), alur, ambang_min: min, aktif, bisa_produksi: Boolean(o.bisa_produksi) });
      } else {
        const awal = r_(num(o.stok_awal));
        if (awal < 0) throw new Error('Stok awal tidak boleh negatif');
        const b: Barang = { id: uid(), nama: o.nama.trim(), satuan: o.satuan.trim(), kategori: o.kategori.trim(), kode: kd, catatan: o.catatan.trim(), alur, ambang_min: min, aktif: true, stok_dalam: awal, stok_luar: 0, bisa_produksi: Boolean(o.bisa_produksi) };
        barang.push(b);
        if (awal > 0) tx({ jenis: 'MASUK', barang_id: b.id, barang: b.nama, jumlah: awal, alur: 'DALAM', catatan: 'Stok awal', kategori: b.kategori, satuan: b.satuan });
      }
      return true;
    },
    hapusBarang: (pin, id, token) => {
      auth(pin, token);
      const bIdx = barang.findIndex((x) => x.id === id);
      if (bIdx === -1) throw new Error('Barang tidak ditemukan');
      const b = barang[bIdx]!;
      if (b.stok_dalam > 0 || b.stok_luar > 0) {
        throw new Error(
          `Barang masih memiliki stok (gudang: ${b.stok_dalam}, luar: ${b.stok_luar}). Nolkan stok terlebih dahulu sebelum menghapus/mengarsipkan.`,
        );
      }
      const punyaRiwayat =
        transaksi.some((t) => t.barang_id === id) ||
        rekapBaris.some((r) => r.barang_id === id) ||
        opname.some((o) => o.barang_id === id);
      if (punyaRiwayat) {
        b.aktif = false;
        return {
          status: 'archived',
          nama: b.nama,
          message: 'Barang memiliki riwayat transaksi sehingga otomatis diarsipkan agar riwayat laporan tidak hilang.',
        };
      }
      barang.splice(bIdx, 1);
      return {
        status: 'deleted',
        nama: b.nama,
        message: 'Barang berhasil dihapus permanen karena belum memiliki riwayat transaksi.',
      };
    },
    tambahKategori: (pin, namaKategori, token) => {
      auth(pin, token);
      const kat = String(namaKategori || '').trim();
      if (!kat) throw new Error('Nama kategori tidak boleh kosong');
      if (kat.toLowerCase() === 'lainnya') {
        throw new Error('Kategori "Lainnya" sudah ada sebagai kategori bawaan');
      }
      if (urutan.some((k) => k.toLowerCase() === kat.toLowerCase())) {
        throw new Error(`Kategori "${kat}" sudah ada`);
      }
      urutan.push(kat);
      return { status: 'created', nama: kat, message: `Kategori "${kat}" berhasil ditambahkan` };
    },
    tambahSupplier: (pin, namaSupplier, token) => {
      auth(pin, token);
      const sup = String(namaSupplier || '').trim();
      if (!sup) throw new Error('Nama supplier tidak boleh kosong');
      const lower = sup.toLowerCase();
      if (daftarSupplier.some((s) => s.toLowerCase() === lower)) {
        throw new Error(`Supplier "${sup}" sudah ada`);
      }
      daftarSupplier.push(sup);
      return { status: 'created', nama: sup, message: `Supplier "${sup}" berhasil ditambahkan` };
    },
    tambahSatuan: (pin, namaSatuan, token) => {
      auth(pin, token);
      const sat = String(namaSatuan || '').trim();
      if (!sat) throw new Error('Nama satuan tidak boleh kosong');
      const lower = sat.toLowerCase();
      if (daftarSatuan.some((s) => s.toLowerCase() === lower)) {
        throw new Error(`Satuan "${sat}" sudah ada`);
      }
      daftarSatuan.push(sat);
      return { status: 'created', nama: sat, message: `Satuan "${sat}" berhasil ditambahkan` };
    },
    hapusKategori: (pin, namaKategori, token) => {
      auth(pin, token);
      const kat = String(namaKategori || '').trim();
      if (!kat) throw new Error('Nama kategori tidak boleh kosong');
      if (kat.toLowerCase() === 'lainnya') {
        throw new Error('Kategori default "Lainnya" tidak dapat dihapus');
      }

      const katLower = kat.toLowerCase();
      const idxUrutan = urutan.findIndex((k) => k.toLowerCase() === katLower);
      const barangTerdampak = barang.filter((b) => (b.kategori || '').trim().toLowerCase() === katLower);

      if (idxUrutan === -1 && barangTerdampak.length === 0) {
        throw new Error(`Kategori "${kat}" tidak ditemukan`);
      }

      // Update barang di kategori ini menjadi '' (Lainnya), tidak menghapus barang
      barangTerdampak.forEach((b) => {
        b.kategori = '';
      });

      // Hapus dari urutan jika ada
      if (idxUrutan !== -1) {
        urutan.splice(idxUrutan, 1);
      }

      // Jaminan: Transaksi, rekap, opname sama sekali TIDAK dihapus
      return {
        status: 'deleted',
        nama: kat,
        jumlahBarang: barangTerdampak.length,
        message: `Kategori "${kat}" berhasil dihapus. ${
          barangTerdampak.length > 0 ? `${barangTerdampak.length} barang dialihkan ke kategori "Lainnya". ` : ''
        }Riwayat transaksi tetap aman tersimpan.`,
      };
    },
    simpanKaryawan: (pin, o, token) => {
      auth(pin, token);
      const nm = o.nama.trim();
      if (!nm) throw new Error('Nama wajib diisi');
      if (karyawan.some((x) => x.nama.toLowerCase() === nm.toLowerCase() && x.id !== (o.id || '')))
        throw new Error('Karyawan dengan nama ' + nm + ' sudah ada');
      const pVal = o.pin === undefined || o.pin === null ? undefined : String(o.pin).trim();
      if (pVal !== undefined && pVal !== '' && !/^\d{4,6}$/.test(pVal)) throw new Error('PIN karyawan harus 4–6 angka');
      if (o.id) {
        const k = findK(o.id);
        if (!k) throw new Error('Karyawan tidak ditemukan');
        Object.assign(k, {
          nama: nm,
          aktif: o.aktif !== false,
          ...(pVal !== undefined ? { pin: pVal ? `${pVal.length}$${mockHash(pVal, `salt_${k.id}`)}` : '', punyaPin: !!pVal, pinLen: pVal ? pVal.length : 0 } : {}),
        });
      } else {
        const newId = uid();
        karyawan.push({ id: newId, nama: nm, aktif: true, pin: pVal ? `${pVal.length}$${mockHash(pVal, `salt_${newId}`)}` : '', punyaPin: !!pVal, pinLen: pVal ? pVal.length : 0 });
      }
      return true;
    },
    hapusKaryawan: (pin: string, id: string, token?: string) => {
      auth(pin, token);
      const kIdx = karyawan.findIndex((x) => x.id === id);
      if (kIdx === -1) throw new Error('Karyawan tidak ditemukan');
      const k = karyawan[kIdx]!;
      const sid = String(id);
      const sNama = String(k.nama);
      const punyaRiwayat =
        transaksi.some((t) => t.karyawan_id === sid || t.karyawan === sNama) ||
        rekap.some((r) => r.karyawan_id === sid || r.karyawan === sNama);
      if (punyaRiwayat) {
        k.aktif = false;
        return {
          status: 'archived' as const,
          nama: k.nama,
          message: 'Karyawan memiliki riwayat transaksi/rekap sehingga otomatis dinonaktifkan agar riwayat laporan tidak hilang.',
        };
      }
      karyawan.splice(kIdx, 1);
      rateLimitReset(`karyawan_${sid}`);
      return {
        status: 'deleted' as const,
        nama: k.nama,
        message: 'Karyawan berhasil dihapus permanen karena belum memiliki riwayat transaksi.',
      };
    },
    verifikasiPinKaryawan: (kid, p) => {
      const k = findK(kid);
      if (!k || !k.aktif) throw new Error('Karyawan tidak aktif atau tidak ditemukan');
      const target = String(k.pin || '').trim();
      if (!target) return true;
      rateLimitGuard(`karyawan_${kid}`);
      const input = String(p).trim();
      const targetHash = target.includes('$') ? target.split('$')[1] : target;
      const valid = target === input || targetHash === input || target === mockHash(input, `salt_${kid}`) || targetHash === mockHash(input, `salt_${kid}`);
      if (!valid) {
        rateLimitFail(`karyawan_${kid}`);
        throw new Error('PIN karyawan salah');
      }
      rateLimitReset(`karyawan_${kid}`);
      return true;
    },
    stokMasuk: (pin, bid, j, supplier, catatan, clientTxId, token) => {
      const tok =
        token ||
        (typeof clientTxId === 'string' &&
        (clientTxId.startsWith('mock_tok_') || clientTxId.indexOf('.') > 0)
          ? clientTxId
          : undefined);
      const idemKey = clientTxId && clientTxId !== tok ? clientTxId : undefined;
      return withIdem(idemKey, () => {
        auth(pin, tok);
        let email = 'admin';
        if (tok) {
          const parts = tok.split('_');
          if (parts[3]) email = parts[3];
        }
        const acc = authWhitelist.find((a) => a.email.toLowerCase() === email.toLowerCase());
        const adminNama = formatNamaAdmin(acc?.nama, email);
        const n = r_(num(j));
        if (!(n > 0)) throw new Error('Jumlah harus lebih dari 0');
        const b = find(bid);
        if (!b) throw new Error('Barang tidak ditemukan');
        b.stok_dalam = r_(b.stok_dalam + n);
        tx({ jenis: 'MASUK', barang_id: b.id, barang: b.nama, jumlah: n, karyawan: adminNama, alur: 'DALAM', supplier, catatan, dicatat_oleh: email, kategori: b.kategori, satuan: b.satuan });
        if (supplier && supplier.trim()) {
          const supClean = supplier.trim();
          if (!daftarSupplier.some((s) => s.toLowerCase() === supClean.toLowerCase())) {
            daftarSupplier.push(supClean);
          }
        }
        return true;
      });
    },
    simpanProduksiAdmin: (pin, bid, j, catatan, clientTxId, token) => {
      const tok =
        token ||
        (typeof clientTxId === 'string' &&
        (clientTxId.startsWith('mock_tok_') || clientTxId.indexOf('.') > 0)
          ? clientTxId
          : undefined);
      const idemKey = clientTxId && clientTxId !== tok ? clientTxId : undefined;
      return withIdem(idemKey, () => {
        auth(pin, tok);
        let email = 'admin';
        if (tok) {
          const parts = tok.split('_');
          if (parts[3]) email = parts[3];
        }
        const acc = authWhitelist.find((a) => a.email.toLowerCase() === email.toLowerCase());
        const adminNama = formatNamaAdmin(acc?.nama, email);
        const n = r_(num(j));
        if (!(n > 0)) throw new Error('Jumlah harus lebih dari 0');
        const b = find(bid);
        if (!b || !b.aktif) throw new Error('Barang tidak ditemukan');
        b.stok_dalam = r_(b.stok_dalam + n);
        tx({ jenis: 'PRODUKSI', barang_id: b.id, barang: b.nama, jumlah: n, karyawan_id: '', karyawan: adminNama, alur: 'DALAM', supplier: '', catatan: catatan || 'Hasil produksi (Admin)', dicatat_oleh: email, kategori: b.kategori, satuan: b.satuan });
        return true;
      });
    },
    ambilAdmin: (pin, kid, bid, j, ts, token) => {
      auth(pin, token);
      ts = num(ts) || Date.now();
      if (ts > Date.now() + 60000) throw new Error('Waktu tidak boleh di masa depan');
      if (ts <= lastRekapTs()) throw new Error('Waktu sebelum rekap terakhir. Koreksi lewat edit rekap atau opname.');
      return ambil_(kid, bid, num(j), ts, 'admin');
    },
    simpanOpname: (pin, items, token) => {
      auth(pin, token);
      const ts = Date.now();
      let n = 0;
      items.forEach((i) => {
        if (i.fisik === '' || i.fisik === null || i.fisik === undefined) return;
        const b = find(i.barang_id);
        if (!b) return;
        const f = r_(numWajib(i.fisik, 'Stok fisik ' + b.nama));
        if (f < 0) throw new Error('Stok fisik tidak boleh negatif');
        const sel = r_(f - b.stok_dalam);
        opname.push({ id: uid(), ts, waktu: fmt(ts), barang_id: b.id, barang: b.nama, sistem: b.stok_dalam, fisik: f, selisih: sel });
        if (sel) tx({ ts, jenis: 'OPNAME', barang_id: b.id, barang: b.nama, jumlah: sel, catatan: `Sistem ${b.stok_dalam} → fisik ${f}`, kategori: b.kategori, satuan: b.satuan });
        b.stok_dalam = f;
        n++;
      });
      return n;
    },
    editRekapTerakhir: (pin, input, token) => {
      auth(pin, token);
      const rk = [...rekap].sort(setelahDesc)[0];
      if (!rk) throw new Error('Belum ada rekap');
      const plan: { x: RekapBaris; b: Barang; s: number; maks: number; nl: number }[] = [];
      (input || []).forEach((i) => {
        const x = rekapBaris.find((b) => b.rekap_id === rk.id && b.barang_id === i.barang_id);
        if (!x || i.sisa === '' || i.sisa === null || i.sisa === undefined) return;
        const s = r_(numWajib(i.sisa, 'Sisa ' + x.barang)), maks = r_(x.saldo_awal + x.diambil);
        if (s < 0 || s > maks + 1e-9) throw new Error(`Sisa ${x.barang} harus 0 sampai ${maks}`);
        const delta = r_(s - x.sisa);
        if (!delta) return;
        const b = find(x.barang_id);
        if (!b) throw new Error('Barang ' + x.barang + ' tidak ditemukan');
        const nl = r_(b.stok_luar + delta);
        if (nl < 0) throw new Error('Saldo luar ' + x.barang + ' akan negatif');
        plan.push({ x, b, s, maks, nl });
      });
      plan.forEach((p) => {
        p.b.stok_luar = p.nl;
        p.x.sisa = p.s;
        p.x.terpakai = r_(p.maks - p.s);
      });
      if (plan.length) rk.diedit_admin = true;
      return plan.length;
    },
    approveRekap: (pin, rekapId, input, token) => {
      auth(pin, token);
      const rk = rekap.find((r) => r.id === rekapId);
      if (!rk) throw new Error('Rekap tidak ditemukan');
      if ((rk.status || 'APPROVED') === 'APPROVED') {
        throw new Error('Rekap sudah disetujui');
      }

      // FIFO check: pastikan tidak ada rekap berstatus PENDING yang lebih lampau
      const hasOlderPending = rekap.some((r) => {
        const isPending = (r.status || 'APPROVED') === 'PENDING';
        return isPending && r.id !== rekapId && r.ts < rk.ts;
      });
      if (hasOlderPending) {
        throw new Error('Harap setujui rekap yang lebih lama terlebih dahulu');
      }

      const plan: { x: RekapBaris; b: Barang; s: number; maks: number; nl: number; terjual: number }[] = [];
      const by = Object.fromEntries((input || []).map((i) => [i.barang_id, i]));
      const bs = rekapBaris.filter((b) => b.rekap_id === rk.id);

      bs.forEach((x) => {
        const itemInput = by[x.barang_id];
        let s = x.sisa;
        let terjual = x.terjual ?? 0;
        const maks = r_(x.saldo_awal + x.diambil);

        if (itemInput) {
          if (itemInput.sisa !== '' && itemInput.sisa !== null && itemInput.sisa !== undefined) {
            s = r_(numWajib(itemInput.sisa, 'Sisa ' + x.barang));
            if (s < 0 || s > maks + 1e-9) throw new Error(`Sisa ${x.barang} harus 0 sampai ${maks}`);
          }
          if (itemInput.terjual !== '' && itemInput.terjual !== null && itemInput.terjual !== undefined) {
            terjual = r_(numWajib(itemInput.terjual, 'Terjual ' + x.barang));
            if (terjual < 0) throw new Error(`Terjual ${x.barang} tidak boleh negatif`);
          }
        }

        const delta = r_(s - x.sisa);
        const b = find(x.barang_id);
        if (!b) throw new Error('Barang ' + x.barang + ' tidak ditemukan');
        const nl = r_(b.stok_luar + delta);
        if (nl < 0) throw new Error('Saldo luar ' + x.barang + ' akan negatif');
        plan.push({ x, b, s, maks, nl, terjual });
      });

      let changed = false;
      plan.forEach((p) => {
        if (p.b.stok_luar !== p.nl) {
          p.b.stok_luar = p.nl;
          changed = true;
        }
        if (p.x.sisa !== p.s) changed = true;
        p.x.sisa = p.s;
        p.x.terpakai = r_(p.maks - p.s);
        p.x.terjual = p.terjual;
        p.x.selisih = r_(p.x.terpakai - p.terjual);
      });

      if (changed) rk.diedit_admin = true;
      rk.status = 'APPROVED';
      rk.approved_ts = Date.now();
      return { id: rk.id, status: 'APPROVED' };
    },
    buatDummyRekap: (pin, token) => {
      auth(pin, token);
      return generateDummyRekap();
    },
    simpanPengaturan: (pin, jam, baru, token) => {
      auth(pin, token);
      if (jam) {
        const m = /(\d{1,2})[:.](\d{2})(?:[:.]\d{2})?\s*([AaPp][Mm])?/.exec(String(jam || ''));
        if (!m) throw new Error('Jam tutup tidak valid: ' + jam);
        let h = Number(m[1]), mi = Number(m[2]), ap = (m[3] || '').toUpperCase();
        if (ap === 'PM' && h < 12) h += 12;
        if (ap === 'AM' && h === 12) h = 0;
        if (h > 23 || mi > 59) throw new Error('Jam tutup tidak valid: ' + jam);
        jamTutup = (h < 10 ? '0' : '') + h + ':' + (mi < 10 ? '0' : '') + mi;
      }
      if (baru) {
        if (!/^\d{4,8}$/.test(baru)) throw new Error('PIN harus 4–8 angka');
        PIN = mockHash(baru, 'admin_salt');
      }
      return true;
    },
    laporan: (pin, dari, sampai, token) => {
      auth(pin, token);
      const sDari = String(dari || '').trim(), sSampai = String(sampai || '').trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(sDari) || !/^\d{4}-\d{2}-\d{2}$/.test(sSampai)) {
        throw new Error('Format tanggal laporan tidak valid (harus YYYY-MM-DD)');
      }
      if (sDari > sSampai) {
        throw new Error('Tanggal awal tidak boleh melebihi tanggal akhir');
      }
      const p = (s: string, add = 0) => {
        const a = s.split('-').map(Number);
        return new Date(a[0]!, a[1]! - 1, a[2]! + add).getTime();
      };
      const t0 = p(sDari), t1 = p(sSampai, 1);
      const map: Record<string, { nama: string; satuan: string; masuk: number; produksi: number; rk: number; lh: number; op: number }> = {};
      const g = (id: string, nama: string) => {
        const b = find(id);
        return (map[id] ??= { nama: b?.nama ?? nama, satuan: b?.satuan ?? '', masuk: 0, produksi: 0, rk: 0, lh: 0, op: 0 });
      };
      const ids = new Set(rekap.filter((r) => r.ts >= t0 && r.ts < t1).map((r) => r.id));
      rekapBaris.forEach((x) => ids.has(x.rekap_id) && (g(x.barang_id, x.barang).rk += x.terpakai));
      transaksi.forEach((t) => {
        if (t.ts < t0 || t.ts >= t1 || t.status !== 'AKTIF') return;
        if (t.jenis === 'MASUK') g(t.barang_id, t.barang).masuk += t.jumlah;
        else if (t.jenis === 'PRODUKSI') g(t.barang_id, t.barang).produksi += t.jumlah;
        else if (t.jenis === 'AMBIL' && t.alur === 'LANGSUNG_HABIS') g(t.barang_id, t.barang).lh += t.jumlah;
        else if (t.jenis === 'OPNAME') g(t.barang_id, t.barang).op += t.jumlah;
      });
      return Object.values(map)
        .map((r) => ({ nama: r.nama, satuan: r.satuan, masuk: r_(r.masuk), produksi: r_(r.produksi), terpakai_rekap: r_(r.rk), langsung_habis: r_(r.lh), total_terpakai: r_(r.rk + r.lh), opname: r_(r.op) }))
        .sort((a, b) => (a.nama < b.nama ? -1 : 1));
    },
    laporanKeSheet: (pin, _dari, _sampai, token) => {
      auth(pin, token);
      return 'https://docs.google.com/spreadsheets/';
    },
    getPublicAuthConfig: () => ({
      hasGoogleAuth: Boolean(googleClientId),
      googleClientId,
      allowDummyAuth: true,
    }),
    requestOtp: (email: string) => {
      const em = email.toLowerCase().trim();
      const acc = authWhitelist.find((a) => a.email.toLowerCase() === em);
      if (!acc || !acc.aktif) {
        catatLog(em, 'OTP', '-', 'GAGAL - BUKAN WHITELIST');
        throw new Error('Email tidak terdaftar atau akses telah dinonaktifkan. Hubungi admin.');
      }
      const code = '123456';
      otpStore[em] = { code, exp: Date.now() + 300000 };
      return { success: true, message: `Kode verifikasi dikirim ke ${em} (Kode mock: ${code})`, expSeconds: 300 };
    },
    verifyOtp: (email: string, code: string, userAgent = '') => {
      const em = email.toLowerCase().trim();
      const cd = code.trim();
      const isDummy = em === 'admin@segara.com' || em === 'tablet@segara.com' || em.endsWith('@segara.com');
      const stored = otpStore[em];
      if (!stored && !isDummy) {
        catatLog(em, 'OTP', '-', 'GAGAL - OTP KADALUARSA', userAgent);
        throw new Error('Kode verifikasi salah atau sudah kadaluarsa. Minta kode baru.');
      }
      if (stored && Date.now() > stored.exp && !isDummy) {
        catatLog(em, 'OTP', '-', 'GAGAL - OTP KADALUARSA', userAgent);
        throw new Error('Kode verifikasi salah atau sudah kadaluarsa. Minta kode baru.');
      }
      const validDummy = isDummy && cd === '123456';
      if ((!stored || stored.code !== cd) && !validDummy) {
        catatLog(em, 'OTP', '-', 'GAGAL - OTP SALAH', userAgent);
        throw new Error('Kode verifikasi salah.');
      }
      delete otpStore[em];
      const acc = authWhitelist.find((a) => a.email.toLowerCase() === em);
      if (!acc || !acc.aktif) {
        catatLog(em, 'OTP', '-', 'GAGAL - BUKAN WHITELIST', userAgent);
        throw new Error('Akun ini tidak memiliki akses aktif.');
      }
      catatLog(em, 'OTP', acc.role, 'BERHASIL', userAgent);
      const duration = acc.role === 'tablet' ? 30 * 86400000 : 7 * 86400000;
      return {
        token: `mock_tok_${acc.role}_${acc.email}_${Date.now() + duration}`,
        email: acc.email,
        role: acc.role,
        exp: Date.now() + duration,
      };
    },
    verifyGoogleCredential: (credential: string, userAgent = '') => {
      const em = (credential.includes('@') ? credential : 'admin@segara.com').toLowerCase().trim();
      const acc = authWhitelist.find((a) => a.email.toLowerCase() === em);
      if (!acc || !acc.aktif) {
        catatLog(em, 'GOOGLE', '-', 'GAGAL - BUKAN WHITELIST', userAgent);
        throw new Error(`Email Google (${em}) belum terdaftar di whitelist sistem. Hubungi admin.`);
      }
      catatLog(em, 'GOOGLE', acc.role, 'BERHASIL', userAgent);
      const duration = acc.role === 'tablet' ? 30 * 86400000 : 7 * 86400000;
      return {
        token: `mock_tok_${acc.role}_${acc.email}_${Date.now() + duration}`,
        email: acc.email,
        role: acc.role,
        exp: Date.now() + duration,
      };
    },
    verifySessionToken: (token: string) => {
      if (!token || !token.startsWith('mock_tok_')) return { valid: false, error: 'Token tidak valid' };
      const parts = token.split('_');
      const email = parts[3] || '';
      const exp = Number(parts[4] || 0);
      if (Date.now() > exp) return { valid: false, error: 'Sesi telah berakhir. Silakan login kembali.' };
      const acc = authWhitelist.find((a) => a.email.toLowerCase() === email.toLowerCase());
      if (!acc || !acc.aktif) return { valid: false, error: 'Akses akun telah dicabut atau dinonaktifkan.' };
      return { valid: true, email: acc.email, role: acc.role, exp };
    },
    getAuthAccounts: (pin: string, token?: string) => {
      auth(pin, token);
      return authWhitelist.map((a) => ({
        ...a,
        punyaPin: Boolean(a.pinHash && String(a.pinHash).trim() !== ''),
      }));
    },
    simpanAuthAccount: (pin: string, email: string, role: 'admin' | 'tablet', aktif: boolean, namaOrToken?: string, token?: string) => {
      let nama: string | undefined;
      let tok: string | undefined;
      if (token !== undefined) {
        nama = namaOrToken;
        tok = token;
      } else if (
        namaOrToken !== undefined &&
        (namaOrToken.startsWith('mock_tok_') || /^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(namaOrToken))
      ) {
        tok = namaOrToken;
      } else {
        nama = namaOrToken;
      }
      auth(pin, tok);
      if (!email || !email.trim()) throw new Error('Email wajib diisi');
      const em = email.toLowerCase().trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) throw new Error('Format email tidak valid');
      if (role !== 'admin' && role !== 'tablet') throw new Error('Role harus admin atau tablet');

      const adminLain = authWhitelist.filter((x) => x.role === 'admin' && x.aktif && x.email.toLowerCase() !== em);
      const target = authWhitelist.find((x) => x.email.toLowerCase() === em);
      if (target?.role === 'admin' && target.aktif && adminLain.length === 0) {
        if (role !== 'admin' || !aktif) {
          throw new Error('Tidak dapat menonaktifkan atau mengubah role admin aktif terakhir. Sisakan minimal satu admin aktif.');
        }
      }

      const cleanNama = nama !== undefined ? nama.trim() : (target?.nama || '');
      const idx = authWhitelist.findIndex((a) => a.email.toLowerCase() === em);
      if (idx >= 0) {
        authWhitelist[idx]!.role = role;
        authWhitelist[idx]!.aktif = aktif;
        authWhitelist[idx]!.nama = cleanNama;
      } else {
        authWhitelist.push({ email: em, nama: cleanNama, role, aktif, dibuat: Date.now() });
      }
      return true;
    },
    hapusAuthAccount: (pin: string, email: string, token?: string) => {
      auth(pin, token);
      const em = email.toLowerCase().trim();
      const adminLain = authWhitelist.filter((x) => x.role === 'admin' && x.aktif && x.email.toLowerCase() !== em);
      const target = authWhitelist.find((x) => x.email.toLowerCase() === em);
      if (target?.role === 'admin' && adminLain.length === 0) {
        throw new Error('Tidak dapat menghapus admin aktif terakhir. Sisakan minimal satu admin.');
      }
      const idx = authWhitelist.findIndex((a) => a.email.toLowerCase() === em);
      if (idx >= 0) authWhitelist.splice(idx, 1);
      return true;
    },
    getLoginHistory: (pin: string, limit = 100, token?: string) => {
      auth(pin, token);
      return loginLogs.slice(0, limit);
    },
    simpanGoogleClientId: (pin: string, clientId: string, token?: string) => {
      auth(pin, token);
      googleClientId = clientId.trim();
      return true;
    },
    getAdminAuthStatus: (token?: string) => {
      if (!token) throw new Error('Akses ditolak: sesi login wajib disertakan.');
      const tokenEmail = token.split('_')[3]?.toLowerCase();
      const v = authWhitelist.find((a) => a.email.toLowerCase() === tokenEmail);
      if (!v || v.role !== 'admin' || !v.aktif) throw new Error('Akses ditolak: sesi login tidak valid.');
      return {
        email: v.email,
        punyaPin: Boolean(v.pinHash && String(v.pinHash).trim() !== ''),
      };
    },
    setupAdminPin: (newPin: string, token?: string) => {
      if (!token) throw new Error('Akses ditolak: sesi login wajib disertakan.');
      const pinStr = String(newPin || '').trim();
      if (!/^\d{4,8}$/.test(pinStr)) throw new Error('PIN harus 4–8 angka');
      const tokenEmail = token.split('_')[3]?.toLowerCase();
      const v = authWhitelist.find((a) => a.email.toLowerCase() === tokenEmail);
      if (!v || v.role !== 'admin' || !v.aktif) throw new Error('Akun admin tidak ditemukan di whitelist');
      if (v.pinHash && String(v.pinHash).trim() !== '') throw new Error('Akun sudah memiliki PIN. Gunakan ganti PIN.');
      const salt = `salt_${uid()}`;
      v.salt = salt;
      v.pinHash = mockHash(pinStr, salt);
      return true;
    },
    gantiAdminPin: (oldPin: string, newPin: string, token?: string) => {
      if (!token) throw new Error('Akses ditolak: sesi login wajib disertakan.');
      const tokenEmail = token.split('_')[3]?.toLowerCase();
      const v = authWhitelist.find((a) => a.email.toLowerCase() === tokenEmail);
      if (!v || v.role !== 'admin' || !v.aktif) throw new Error('Akun admin tidak ditemukan di whitelist');
      if (!v.pinHash) throw new Error('Akun belum memiliki PIN. Gunakan setup PIN.');
      const rateKey = `admin_${v.email}`;
      rateLimitGuard(rateKey);
      const oldStr = String(oldPin || '').trim();
      const newStr = String(newPin || '').trim();
      if (!/^\d{4,8}$/.test(newStr)) throw new Error('PIN harus 4–8 angka');
      const salt = v.salt || 'admin_salt';
      if (v.pinHash !== mockHash(oldStr, salt)) {
        rateLimitFail(rateKey);
        throw new Error('PIN lama salah');
      }
      rateLimitReset(rateKey);
      const newSalt = `salt_${uid()}`;
      v.salt = newSalt;
      v.pinHash = mockHash(newStr, newSalt);
      return true;
    },
    resetAdminPinWithOtp: (email: string, code: string, newPin: string, _token?: string) => {
      const em = String(email || '').toLowerCase().trim();
      const cd = String(code || '').trim();
      const pinStr = String(newPin || '').trim();
      if (!/^\d{4,8}$/.test(pinStr)) throw new Error('PIN harus 4–8 angka');
      const rateKey = `otp_ver_${em}`;
      rateLimitGuard(rateKey);
      const validCode = cd === '123456' || (otpStore[em] && otpStore[em].code === cd);
      if (!validCode) {
        rateLimitFail(rateKey);
        throw new Error('Kode verifikasi salah');
      }
      rateLimitReset(rateKey);
      const v = authWhitelist.find((a) => a.email.toLowerCase() === em);
      if (!v || v.role !== 'admin' || !v.aktif) throw new Error('Akun admin tidak ditemukan');
      const salt = `salt_${uid()}`;
      v.salt = salt;
      v.pinHash = mockHash(pinStr, salt);
      delete otpStore[em];
      return true;
    },
  };
}
