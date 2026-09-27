import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMock } from '../src/lib/mock.ts';

test('hapusBarang functionality and transaction history safety', async (t) => {
  const mock = createMock();
  const pin = '12345';

  await t.test('rejects deleting item with non-zero stock', () => {
    const admin = mock.adminData(pin);
    // Find item with stock > 0
    const itemWithStock = admin.barang.find((b) => b.stok_dalam > 0 || b.stok_luar > 0);
    assert.ok(itemWithStock, 'Must have item with stock');

    assert.throws(
      () => mock.hapusBarang(pin, itemWithStock.id),
      /masih memiliki stok/,
    );
  });

  await t.test('soft-deletes (archives) item if transaction history exists', () => {
    // Add an item with initial stock to generate transaction history
    mock.simpanBarang(pin, {
      id: '',
      nama: 'Item Uji Riwayat',
      satuan: 'Pcs',
      kategori: 'Bahan',
      kode: 'TEST1',
      catatan: '',
      alur: 'LUAR',
      ambang_min: 5,
      aktif: true,
      stok_awal: '10',
    });

    const admin = mock.adminData(pin);
    const item = admin.barang.find((b) => b.nama === 'Item Uji Riwayat')!;
    assert.ok(item, 'Item created');

    // Opname stock down to 0 so it can be deleted
    mock.simpanOpname(pin, [{ barang_id: item.id, fisik: '0' }]);

    const check = mock.adminData(pin).barang.find((b) => b.id === item.id)!;
    assert.equal(check.stok_dalam, 0);
    assert.equal(check.stok_luar, 0);

    // Call hapusBarang
    const res = mock.hapusBarang(pin, item.id);
    assert.equal(res.status, 'archived');
    assert.match(res.message, /riwayat transaksi/);

    // Verify item is still in database but marked inactive
    const after = mock.adminData(pin).barang.find((b) => b.id === item.id);
    assert.ok(after, 'Item row still exists in database');
    assert.equal(after?.aktif, false, 'Item must be inactive (archived)');

    // Verify item is hidden from tablet
    const tablet = mock.getTablet();
    assert.equal(tablet.barang.some((b) => b.id === item.id), false, 'Item must be hidden from tablet');

    // Verify transaction history still has the item name intact
    const tx = mock.adminData(pin).transaksi.filter((t) => t.barang_id === item.id);
    assert.ok(tx.length > 0, 'Transactions must be preserved');
    assert.equal(tx[0]?.barang, 'Item Uji Riwayat', 'Transaction item name preserved');
  });

  await t.test('hard-deletes item if NO transaction history exists', () => {
    // Add item with 0 stock
    mock.simpanBarang(pin, {
      id: '',
      nama: 'Item Salah Buat',
      satuan: 'Pcs',
      kategori: 'Bahan',
      kode: 'TEST2',
      catatan: '',
      alur: 'LUAR',
      ambang_min: 0,
      aktif: true,
      stok_awal: '0',
    });

    const admin = mock.adminData(pin);
    const item = admin.barang.find((b) => b.nama === 'Item Salah Buat')!;
    assert.ok(item, 'Item created with 0 stock and 0 transactions');

    // Call hapusBarang
    const res = mock.hapusBarang(pin, item.id);
    assert.equal(res.status, 'deleted');
    assert.match(res.message, /berhasil dihapus permanen/);

    // Verify item is completely gone from database
    const after = mock.adminData(pin).barang.find((b) => b.id === item.id);
    assert.equal(after, undefined, 'Item must be completely deleted');
  });
});
