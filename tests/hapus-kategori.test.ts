import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMock } from '../src/lib/mock.ts';

test('hapusKategori functionality and transaction history safety (mock)', async (t) => {
  const pin = '12345';

  await t.test('rejects deleting with invalid admin PIN', () => {
    const mock = createMock();
    assert.throws(
      () => mock.hapusKategori('wrong-pin', 'Minuman'),
      /PIN salah/,
    );
  });

  await t.test('rejects deleting empty category name', () => {
    const mock = createMock();
    assert.throws(
      () => mock.hapusKategori(pin, '   '),
      /Nama kategori tidak boleh kosong/,
    );
  });

  await t.test('rejects deleting default "Lainnya" category', () => {
    const mock = createMock();
    assert.throws(
      () => mock.hapusKategori(pin, 'Lainnya'),
      /Kategori default "Lainnya" tidak dapat dihapus/,
    );
    assert.throws(
      () => mock.hapusKategori(pin, 'lainnya'),
      /Kategori default "Lainnya" tidak dapat dihapus/,
    );
  });

  await t.test('rejects deleting non-existent category', () => {
    const mock = createMock();
    assert.throws(
      () => mock.hapusKategori(pin, 'KategoriGaib123'),
      /Kategori "KategoriGaib123" tidak ditemukan/,
    );
  });

  await t.test('tambahKategori and duplicate handling', () => {
    const mock = createMock();
    const res = mock.tambahKategori(pin, 'Snack Ringan');
    assert.equal(res.status, 'created');
    assert.match(res.message, /berhasil ditambahkan/);

    const admin = mock.adminData(pin);
    assert.ok(admin.urutan.includes('Snack Ringan'));

    // Duplicate check
    assert.throws(
      () => mock.tambahKategori(pin, 'snack ringan'),
      /sudah ada/,
    );
  });

  await t.test('CRITICAL: hapusKategori preserves 100% of transaction history', () => {
    const mock = createMock();

    // 1. Tambah kategori baru
    mock.tambahKategori(pin, 'Minuman Uji');

    // 2. Tambah barang dengan kategori tersebut dan stok awal (menghasilkan transaksi MASUK)
    mock.simpanBarang(pin, {
      id: '',
      nama: 'Es Jeruk Segar',
      satuan: 'Gelas',
      kategori: 'Minuman Uji',
      kode: 'EJS',
      catatan: 'Segar manis',
      alur: 'LUAR',
      ambang_min: 5,
      aktif: true,
      stok_awal: '20',
    });

    const adminAwal = mock.adminData(pin);
    const item = adminAwal.barang.find((b) => b.nama === 'Es Jeruk Segar')!;
    assert.ok(item, 'Barang harus berhasil dibuat');
    assert.equal(item.kategori, 'Minuman Uji');

    const karyawan = adminAwal.karyawan[0]!;

    // 3. Buat transaksi AMBIL oleh karyawan
    mock.ambil(karyawan.id, item.id, 3);

    // 4. Buat transaksi OPNAME oleh admin
    mock.simpanOpname(pin, [{ barang_id: item.id, fisik: '15' }]);

    // Catat seluruh riwayat transaksi sebelum kategori dihapus
    const adminSebelum = mock.adminData(pin);
    const totalTxSebelum = adminSebelum.transaksi.length;
    const txItemSebelum = adminSebelum.transaksi.filter((tx) => tx.barang_id === item.id);

    assert.ok(txItemSebelum.length >= 3, 'Harus ada minimal 3 transaksi (MASUK, AMBIL, OPNAME)');
    assert.ok(
      txItemSebelum.some((tx) => tx.jenis === 'MASUK' && tx.kategori === 'Minuman Uji'),
      'Transaksi MASUK harus mencatat kategori',
    );
    assert.ok(
      txItemSebelum.some((tx) => tx.jenis === 'AMBIL' && tx.kategori === 'Minuman Uji'),
      'Transaksi AMBIL harus mencatat kategori',
    );
    assert.ok(
      txItemSebelum.some((tx) => tx.jenis === 'OPNAME' && tx.kategori === 'Minuman Uji'),
      'Transaksi OPNAME harus mencatat kategori',
    );

    // 5. SEKARANG HAPUS KATEGORI TERSEBUT
    const resHapus = mock.hapusKategori(pin, 'Minuman Uji');
    assert.equal(resHapus.status, 'deleted');
    assert.equal(resHapus.jumlahBarang, 1);
    assert.match(resHapus.message, /Riwayat transaksi tetap aman tersimpan/);

    const adminSetelah = mock.adminData(pin);

    // A. INVARIAN UTAMA: JUMLAH RIWAYAT TRANSAKSI TIDAK BOLEH BERKURANG SAMA SEKALI
    assert.equal(
      adminSetelah.transaksi.length,
      totalTxSebelum,
      'Total transaksi TIDAK boleh berkurang setelah hapus kategori!',
    );

    // B. Verifikasi seluruh transaksi barang tersebut masih ada dan utuh
    const txItemSetelah = adminSetelah.transaksi.filter((tx) => tx.barang_id === item.id);
    assert.equal(
      txItemSetelah.length,
      txItemSebelum.length,
      'Semua riwayat transaksi untuk barang ini harus tetap ada!',
    );

    txItemSebelum.forEach((txAwal) => {
      const txAda = txItemSetelah.find((t) => t.id === txAwal.id);
      assert.ok(txAda, `Transaksi ID ${txAwal.id} harus tetap tersimpan`);
      assert.equal(txAda?.jumlah, txAwal.jumlah, 'Jumlah transaksi harus persis sama');
      assert.equal(txAda?.jenis, txAwal.jenis, 'Jenis transaksi harus persis sama');
      assert.equal(txAda?.waktu, txAwal.waktu, 'Waktu transaksi harus persis sama');
      assert.equal(txAda?.kategori, 'Minuman Uji', 'Label kategori historis pada transaksi harus tetap terjaga');
    });

    // C. INVARIAN BARANG: Barang tidak boleh terhapus, hanya dialihkan kategori ke '' (Lainnya)
    const itemSetelah = adminSetelah.barang.find((b) => b.id === item.id);
    assert.ok(itemSetelah, 'Barang TIDAK boleh terhapus!');
    assert.equal(itemSetelah?.kategori, '', 'Kategori barang harus dikosongkan (default ke Lainnya)');
    assert.equal(itemSetelah?.stok_dalam, 15, 'Stok barang harus tetap utuh');

    // D. INVARIAN URUTAN: Kategori harus terhapus dari urutan kategori
    assert.equal(
      adminSetelah.urutan.some((k) => k.toLowerCase() === 'minuman uji'),
      false,
      'Kategori harus dihapus dari daftar urutan',
    );
  });

  await t.test('hapusKategori on empty category without items', () => {
    const mock = createMock();
    mock.tambahKategori(pin, 'Kategori Kosong');
    assert.ok(mock.adminData(pin).urutan.includes('Kategori Kosong'));

    const res = mock.hapusKategori(pin, 'Kategori Kosong');
    assert.equal(res.status, 'deleted');
    assert.equal(res.jumlahBarang, 0);
    assert.equal(mock.adminData(pin).urutan.includes('Kategori Kosong'), false);
  });
});
