import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createMock } from '../src/lib/mock.ts';
import { hitungBelumRekap } from '../src/lib/rekap-helpers.ts';
import type { Transaksi } from '../src/lib/types.ts';

describe('Detail Belum Rekap logic & invariants', () => {
  const pin = '12345';

  it('hitungBelumRekap correctly filters and aggregates unreconciled LUAR takings', () => {
    const today0 = new Date(2026, 9, 2, 0, 0, 0).getTime();
    const lastRekapTs = new Date(2026, 9, 1, 18, 0, 0).getTime();

    const transaksi: Transaksi[] = [
      // 1. Ambil LUAR kemarin malam setelah rekap terakhir (lewat hari)
      {
        id: 'tx-1',
        ts: lastRekapTs + 3600000, // 19:00 kemarin
        waktu: '01/10/2026 19:00:00',
        jenis: 'AMBIL',
        barang_id: 'b-1',
        barang: 'Susu UHT',
        jumlah: 2,
        karyawan_id: 'k-1',
        karyawan: 'Budi',
        alur: 'LUAR',
        supplier: '',
        status: 'AKTIF',
        dicatat_oleh: 'karyawan',
        catatan: 'ambil malam',
        kategori: 'Dairy',
        satuan: 'Liter',
      },
      // 2. Ambil LUAR hari ini (b-1 lagi)
      {
        id: 'tx-2',
        ts: today0 + 36000000, // 10:00 hari ini
        waktu: '02/10/2026 10:00:00',
        jenis: 'AMBIL',
        barang_id: 'b-1',
        barang: 'Susu UHT',
        jumlah: 3,
        karyawan_id: 'k-2',
        karyawan: 'Siti',
        alur: 'LUAR',
        supplier: '',
        status: 'AKTIF',
        dicatat_oleh: 'karyawan',
        catatan: 'ambil pagi',
        kategori: 'Dairy',
        satuan: 'Liter',
      },
      // 3. Ambil LUAR hari ini (b-2)
      {
        id: 'tx-3',
        ts: today0 + 40000000, // 11:06 hari ini
        waktu: '02/10/2026 11:06:00',
        jenis: 'AMBIL',
        barang_id: 'b-2',
        barang: 'Sirup Vanilla',
        jumlah: 1,
        karyawan_id: 'k-1',
        karyawan: 'Budi',
        alur: 'LUAR',
        supplier: '',
        status: 'AKTIF',
        dicatat_oleh: 'karyawan',
        catatan: '',
        kategori: 'Sirup',
        satuan: 'Botol',
      },
      // 4. Ambil LANGSUNG_HABIS (harus diabaikan dari rekap)
      {
        id: 'tx-4',
        ts: today0 + 42000000,
        waktu: '02/10/2026 11:40:00',
        jenis: 'AMBIL',
        barang_id: 'b-3',
        barang: 'Plastik Sampah',
        jumlah: 5,
        karyawan_id: 'k-1',
        karyawan: 'Budi',
        alur: 'LANGSUNG_HABIS',
        supplier: '',
        status: 'AKTIF',
        dicatat_oleh: 'karyawan',
        catatan: '',
        kategori: 'Kebersihan',
        satuan: 'Lbr',
      },
      // 5. Transaksi sebelum rekap terakhir (harus diabaikan)
      {
        id: 'tx-5',
        ts: lastRekapTs - 1000,
        waktu: '01/10/2026 17:59:00',
        jenis: 'AMBIL',
        barang_id: 'b-1',
        barang: 'Susu UHT',
        jumlah: 1,
        karyawan_id: 'k-1',
        karyawan: 'Budi',
        alur: 'LUAR',
        supplier: '',
        status: 'AKTIF',
        dicatat_oleh: 'karyawan',
        catatan: '',
        kategori: 'Dairy',
        satuan: 'Liter',
      },
      // 6. Transaksi berstatus BATAL (harus diabaikan)
      {
        id: 'tx-6',
        ts: today0 + 45000000,
        waktu: '02/10/2026 12:30:00',
        jenis: 'AMBIL',
        barang_id: 'b-2',
        barang: 'Sirup Vanilla',
        jumlah: 2,
        karyawan_id: 'k-2',
        karyawan: 'Siti',
        alur: 'LUAR',
        supplier: '',
        status: 'BATAL',
        dicatat_oleh: 'karyawan',
        catatan: 'salah ambil',
        kategori: 'Sirup',
        satuan: 'Botol',
      },
      // 7. Transaksi MASUK (harus diabaikan)
      {
        id: 'tx-7',
        ts: today0 + 46000000,
        waktu: '02/10/2026 12:45:00',
        jenis: 'MASUK',
        barang_id: 'b-1',
        barang: 'Susu UHT',
        jumlah: 10,
        karyawan_id: '',
        karyawan: 'Admin',
        alur: 'DALAM',
        supplier: 'Supplier Susu',
        status: 'AKTIF',
        dicatat_oleh: 'admin',
        catatan: '',
        kategori: 'Dairy',
        satuan: 'Liter',
      },
    ];

    const barangById = {
      'b-1': { nama: 'Susu UHT', satuan: 'Liter', kategori: 'Dairy', stok_luar: 5 },
      'b-2': { nama: 'Sirup Vanilla', satuan: 'Botol', kategori: 'Sirup', stok_luar: 1 },
      'b-3': { nama: 'Plastik Sampah', satuan: 'Lbr', kategori: 'Kebersihan', stok_luar: 0 },
    };

    const { txBelumRekap, ringkasanBarang } = hitungBelumRekap(
      transaksi,
      lastRekapTs,
      today0,
      barangById,
    );

    // Hanya tx-1, tx-2, tx-3 yang belum direkap (3 transaksi)
    assert.equal(txBelumRekap.length, 3);
    assert.deepEqual(
      txBelumRekap.map((t) => t.id),
      ['tx-3', 'tx-2', 'tx-1'], // Diurutkan dari terbaru (desc)
    );

    // Ringkasan barang harus ada 2 macam (b-1 dan b-2)
    assert.equal(ringkasanBarang.length, 2);

    // b-1 memiliki pengambilan dari hari sebelumnya (adaLewatHari = true), jadi di posisi pertama
    const item1 = ringkasanBarang[0]!;
    assert.equal(item1.barang_id, 'b-1');
    assert.equal(item1.nama, 'Susu UHT');
    assert.equal(item1.total, 5); // 2 + 3
    assert.equal(item1.kali, 2);
    assert.equal(item1.stok_luar, 5);
    assert.equal(item1.adaLewatHari, true);

    // b-2 hanya diambil hari ini
    const item2 = ringkasanBarang[1]!;
    assert.equal(item2.barang_id, 'b-2');
    assert.equal(item2.nama, 'Sirup Vanilla');
    assert.equal(item2.total, 1);
    assert.equal(item2.kali, 1);
    assert.equal(item2.stok_luar, 1);
    assert.equal(item2.adaLewatHari, false);
  });

  it('integration with createMock: taking items updates pending rekap and cancellation restores it', () => {
    const mock = createMock();
    const tabletData = mock.getTablet();
    const employee = tabletData.karyawan[0]!;

    // Buat barang baru
    mock.simpanBarang(pin, {
      id: '',
      nama: 'Matcha Powder',
      satuan: 'Gram',
      kategori: 'Bubuk',
      kode: 'MTC',
      catatan: '',
      alur: 'LUAR',
      ambang_min: 100,
      aktif: true,
      stok_awal: 1000,
    });

    const admin = mock.adminData(pin);
    const matcha = admin.barang.find((b) => b.nama === 'Matcha Powder')!;
    assert.ok(matcha);

    const stBefore = admin.status.belumRekap;

    // Ambil matcha sebanyak 150 gram
    const result = mock.ambil(employee.id, matcha.id, 150);
    assert.ok(result.tx.id);

    // Periksa status setelah ambil
    const adminAfterAmbil = mock.adminData(pin);
    assert.equal(adminAfterAmbil.status.belumRekap, stBefore + 1);

    const today0 = new Date();
    today0.setHours(0, 0, 0, 0);

    const barangById = Object.fromEntries(adminAfterAmbil.barang.map((b) => [b.id, b]));
    const { txBelumRekap, ringkasanBarang } = hitungBelumRekap(
      adminAfterAmbil.transaksi,
      adminAfterAmbil.lastRekap,
      today0.getTime(),
      barangById,
    );

    const matchMatcha = ringkasanBarang.find((r) => r.barang_id === matcha.id);
    assert.ok(matchMatcha);
    assert.equal(matchMatcha.total, 150);
    assert.equal(matchMatcha.kali, 1);
    assert.equal(matchMatcha.satuan, 'Gram');

    // Admin membatalkan pengambilan tersebut
    mock.batalAmbil(result.tx.id, pin);

    // Status kembali normal
    const adminAfterBatal = mock.adminData(pin);
    assert.equal(adminAfterBatal.status.belumRekap, stBefore);

    const { txBelumRekap: txAfterBatal } = hitungBelumRekap(
      adminAfterBatal.transaksi,
      adminAfterBatal.lastRekap,
      today0.getTime(),
      barangById,
    );
    assert.ok(!txAfterBatal.some((t) => t.id === result.tx.id));

    // Stok kembali pulih
    const matchaFinal = adminAfterBatal.barang.find((b) => b.id === matcha.id)!;
    assert.equal(matchaFinal.stok_dalam, 1000);
  });
});
