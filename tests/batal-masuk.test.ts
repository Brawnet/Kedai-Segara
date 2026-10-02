import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createMock } from '../src/lib/mock.ts';

describe('batalMasuk invariants', () => {
  it('allows cancelling own MASUK transactions and restores stock', () => {
    const api = createMock();
    const pin = '12345';
    const admin = api.adminData(pin);
    const item = admin.barang[0]!;
    const stokAwal = item.stok_dalam;

    // Generate an admin session for test1
    api.requestOtp('admin@segara.com');
    const session1 = api.verifyOtp('admin@segara.com', '123456');
    const token1 = session1.token;

    api.stokMasuk(pin, item.id, 15, 'Supplier A', 'Notes', undefined, token1);
    const afterMasuk = api.adminData(pin);
    const itemMasuk = afterMasuk.barang.find((b) => b.id === item.id)!;
    assert.equal(itemMasuk.stok_dalam, stokAwal + 15);

    const tx = afterMasuk.transaksi.find((t) => t.jenis === 'MASUK' && t.status === 'AKTIF')!;
    
    // Generate another admin session for test2 (owner@segara.com is another admin in whitelist by default)
    api.simpanAuthAccount(pin, 'owner@segara.com', 'admin', true);
    api.requestOtp('owner@segara.com');
    const session2 = api.verifyOtp('owner@segara.com', '123456');
    const token2 = session2.token;

    // Attempt to cancel by a different admin
    assert.throws(
      () => api.batalMasuk(tx.id, pin, token2),
      /Hanya bisa membatalkan stok masuk yang dicatat oleh akun Anda sendiri/
    );

    // Cancel by the same admin
    assert.ok(api.batalMasuk(tx.id, pin, token1));


    const afterCancel = api.adminData(pin);
    const itemCancel = afterCancel.barang.find((b) => b.id === item.id)!;
    assert.equal(itemCancel.stok_dalam, stokAwal);
  });
});
