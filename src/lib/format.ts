import type { BarangTablet } from './types';

/** Format angka gaya Indonesia (koma desimal), maks 3 desimal. Mengembalikan '0' jika kosong/tidak valid. */
export const nf = (n: number | string | null | undefined) => {
  if (n === null || n === undefined || n === '') return '0';
  const num = Number(n);
  if (!Number.isFinite(num)) return '0';
  return (Math.round(num * 1000) / 1000).toLocaleString('id-ID');
};
/** Tanggal lokal YYYY-MM-DD untuk input type=date. */
export const ymd = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);

/** Tanggal+jam lokal untuk input type=datetime-local. */
export const ymdhm = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

/** Parse angka dari input (menerima koma). NaN jika kosong/tidak valid. */
export const parseNum = (v: string | number | undefined | null) => {
  if (v === '' || v === null || v === undefined) return NaN;
  return Number(String(v).replace(',', '.'));
};

export const r3 = (n: number) => {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 1000) / 1000;
};
export const katOf = (b: { kategori?: string }) => b.kategori || 'Lainnya';

/** Urutan kategori: urutan dari pengaturan dulu, lalu sisanya sesuai kemunculan. */
export function urutKat<T extends { kategori?: string }>(list: T[], urutan: string[] = []) {
  const s: string[] = [];
  [...urutan, ...list.map(katOf)].forEach((c) => {
    if (c && !s.includes(c) && list.some((b) => katOf(b) === c)) s.push(c);
  });
  return s;
}

export function grupKat<T extends { kategori?: string }>(list: T[], urutan: string[] = []) {
  return urutKat(list, urutan).map((k) => ({ k, l: list.filter((b) => katOf(b) === k) }));
}

/** Cari berdasarkan nama (mengandung) atau kode (awalan) — sama dengan versi lama. */
export function cocok(b: Pick<BarangTablet, 'nama' | 'kode'>, q: string) {
  q = q.toLowerCase().trim();
  if (!q) return true;
  return b.nama.toLowerCase().includes(q) || String(b.kode || '').toLowerCase().startsWith(q);
}

/** True jika sudah 30 menit sebelum jam tutup (pengingat rekap). */
export function dekatTutup(jam: string) {
  if (!jam) return false;
  const [h, m] = jam.split(':').map(Number);
  const c = new Date();
  c.setHours(h, m || 0, 0, 0);
  return Date.now() >= c.getTime() - 30 * 60000;
}

export const inisial = (nama: string) =>
  nama
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]!.toUpperCase())
    .join('');

export const alurLabel = (a: string) => (a === 'LANGSUNG_HABIS' ? 'Langsung habis' : 'Lewat Stock Luar');
