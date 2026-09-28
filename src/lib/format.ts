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

/** Parse angka dari input (menerima format Indonesia 1.000 atau desimal 1,5 / 1.5). NaN jika kosong/tidak valid. */
export const parseNum = (v: string | number | undefined | null) => {
  if (v === '' || v === null || v === undefined) return NaN;
  if (typeof v === 'number') return Number.isFinite(v) ? v : NaN;
  let s = String(v).trim();
  if (!s) return NaN;
  if (s.indexOf('.') >= 0 && s.indexOf(',') >= 0) {
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      s = s.replace(/,/g, '');
    }
  } else if (s.indexOf(',') >= 0) {
    s = s.replace(',', '.');
  } else if (s.indexOf('.') >= 0) {
    if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
      s = s.replace(/\./g, '');
    }
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
};

export const r3 = (n: number) => {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 1000) / 1000;
};
export const total = (b: { stok_dalam: number; stok_luar: number }) => b.stok_dalam + b.stok_luar;
export const menipis = (b: { stok_dalam: number; stok_luar: number; ambang_min: number; aktif?: boolean }) =>
  b.aktif !== false && b.ambang_min > 0 && total(b) < b.ambang_min;
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

/** Hanya menyisakan digit angka (0-9) dan maksimal satu tanda desimal (, atau .). */
export const hanyaAngka = (v: string) => {
  if (!v) return '';
  let clean = v.replace(/[^0-9.,]/g, '');
  const firstSep = clean.search(/[.,]/);
  if (firstSep !== -1) {
    const head = clean.slice(0, firstSep + 1);
    const tail = clean.slice(firstSep + 1).replace(/[.,]/g, '');
    clean = head + tail;
  }
  return clean;
};

/** Mencegah ketikan karakter selain angka, koma/titik desimal, tombol navigasi, dan shortcut edit. */
export const cegahBukanAngka = (e: KeyboardEvent, currVal = '') => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (
    [
      'Backspace',
      'Tab',
      'Enter',
      'Delete',
      'Escape',
      'ArrowLeft',
      'ArrowRight',
      'ArrowUp',
      'ArrowDown',
      'Home',
      'End',
    ].includes(e.key)
  ) {
    return;
  }
  if (/^[0-9]$/.test(e.key)) return;
  if ((e.key === ',' || e.key === '.') && !/[.,]/.test(currVal)) return;
  e.preventDefault();
};
