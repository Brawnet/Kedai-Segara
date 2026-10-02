import type { Transaksi } from './types';

export interface ItemSummary {
  barang_id: string;
  nama: string;
  satuan: string;
  kategori: string;
  total: number;
  kali: number;
  stok_luar: number;
  adaLewatHari: boolean;
}

export function hitungBelumRekap(
  transaksi: Transaksi[],
  lastRekapTs: number,
  today0: number,
  barangById: Record<string, { nama?: string; satuan?: string; kategori?: string; stok_luar?: number }>,
) {
  const txBelumRekap = (transaksi || [])
    .filter(
      (t) =>
        t.jenis === 'AMBIL' &&
        t.alur === 'LUAR' &&
        t.status === 'AKTIF' &&
        Number(t.ts) > lastRekapTs,
    )
    .sort((a, b) => Number(b.ts) - Number(a.ts));

  const summaryById: Record<string, ItemSummary> = {};
  for (const t of txBelumRekap) {
    const b = barangById[t.barang_id];
    const isLewat = Number(t.ts) < today0;
    const existing = summaryById[t.barang_id];
    if (existing) {
      existing.total += Number(t.jumlah || 0);
      existing.kali += 1;
      if (isLewat) existing.adaLewatHari = true;
    } else {
      summaryById[t.barang_id] = {
        barang_id: t.barang_id,
        nama: t.barang || b?.nama || 'Barang',
        satuan: t.satuan || b?.satuan || '',
        kategori: t.kategori || b?.kategori || '',
        total: Number(t.jumlah || 0),
        kali: 1,
        stok_luar: Number(b?.stok_luar || 0),
        adaLewatHari: isLewat,
      };
    }
  }

  const ringkasanBarang = Object.values(summaryById).sort((a, b) => {
    if (a.adaLewatHari !== b.adaLewatHari) return a.adaLewatHari ? -1 : 1;
    return b.total - a.total;
  });

  return { txBelumRekap, ringkasanBarang };
}

export const SNOOZE_REKAP_KEY = 'sg_snooze_rekap_until';
export const SNOOZE_DURATION_MS = 12 * 60 * 60 * 1000; // 12 jam

export function getRekapSnoozeUntil(storage?: Storage): number {
  try {
    const s = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    const val = s?.getItem?.(SNOOZE_REKAP_KEY);
    return val ? Number(val) || 0 : 0;
  } catch {
    return 0;
  }
}

export function isRekapSnoozed(storage?: Storage, now = Date.now()): boolean {
  return getRekapSnoozeUntil(storage) > now;
}

export function setRekapSnooze(
  durationMs = SNOOZE_DURATION_MS,
  storage?: Storage,
  now = Date.now(),
): number {
  const until = now + durationMs;
  try {
    const s = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    s?.setItem?.(SNOOZE_REKAP_KEY, String(until));
  } catch {}
  return until;
}

export function clearRekapSnooze(storage?: Storage): void {
  try {
    const s = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    s?.removeItem?.(SNOOZE_REKAP_KEY);
  } catch {}
}

export function formatSnoozeUntil(until: number): string {
  if (!until || until <= Date.now()) return '';
  const d = new Date(until);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const today = new Date();
  if (
    d.getDate() === today.getDate() &&
    d.getMonth() === today.getMonth() &&
    d.getFullYear() === today.getFullYear()
  ) {
    return `pukul ${hh}:${mm} hari ini`;
  }
  const dd = String(d.getDate()).padStart(2, '0');
  const bb = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${bb} pukul ${hh}:${mm}`;
}
