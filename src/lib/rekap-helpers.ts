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
