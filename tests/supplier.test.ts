import test from 'node:test';
import assert from 'node:assert/strict';
import { createMock } from '../src/lib/mock.ts';

test('Supplier Management & Invariants', async (t) => {
  const pin = '12345';

  await t.test('adminData returns default supplier list including CV. Dapur Rumah Rasa', () => {
    const mock = createMock();
    const admin = mock.adminData(pin);
    assert.ok(Array.isArray(admin.daftarSupplier));
    assert.ok(admin.daftarSupplier.includes('CV. Dapur Rumah Rasa'));
  });

  await t.test('tambahSupplier successfully adds a new supplier', () => {
    const mock = createMock();
    const res = mock.tambahSupplier(pin, 'PT. Berkah Sumber Pangan');
    assert.equal(res.status, 'created');
    assert.equal(res.nama, 'PT. Berkah Sumber Pangan');
    assert.match(res.message, /berhasil ditambahkan/);

    const admin = mock.adminData(pin);
    assert.ok(admin.daftarSupplier.includes('PT. Berkah Sumber Pangan'));
  });

  await t.test('tambahSupplier rejects empty or whitespace-only name', () => {
    const mock = createMock();
    assert.throws(
      () => mock.tambahSupplier(pin, ''),
      /Nama supplier tidak boleh kosong/,
    );
    assert.throws(
      () => mock.tambahSupplier(pin, '   '),
      /Nama supplier tidak boleh kosong/,
    );
  });

  await t.test('tambahSupplier rejects duplicate supplier name (case-insensitive)', () => {
    const mock = createMock();
    mock.tambahSupplier(pin, 'Supplier Alpha');

    assert.throws(
      () => mock.tambahSupplier(pin, 'supplier alpha'),
      /Supplier "supplier alpha" sudah ada/,
    );
    assert.throws(
      () => mock.tambahSupplier(pin, 'Supplier Alpha'),
      /Supplier "Supplier Alpha" sudah ada/,
    );
  });

  await t.test('stokMasuk automatically registers newly introduced supplier', () => {
    const mock = createMock();
    const adminAwal = mock.adminData(pin);
    const bId = adminAwal.barang[0].id;

    assert.ok(!adminAwal.daftarSupplier.includes('Toko Grosir Segar'));

    mock.stokMasuk(pin, bId, 10, 'Toko Grosir Segar', 'Pengiriman perdana');

    const adminAkhir = mock.adminData(pin);
    assert.ok(adminAkhir.daftarSupplier.includes('Toko Grosir Segar'));
  });
});
