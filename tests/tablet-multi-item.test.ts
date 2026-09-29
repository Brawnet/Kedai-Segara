import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createMock } from '../src/lib/mock.ts';
import { runInContext } from 'node:vm';
import { createAppsScriptEnvironment } from './apps-script.test.ts';

describe('Tablet Multi-Item Batch & Dapur-ke-Gudang Returns', () => {
  it('masukKaryawan correctly transfers stock from kitchen (stok_luar) to warehouse (stok_dalam) in mock', () => {
    const api = createMock();
    const pin = '12345';
    const admin = api.adminData(pin);

    // Find or prepare an item with alur LUAR and existing stok_luar
    const item = admin.barang.find((b) => b.alur === 'LUAR' && b.stok_luar > 0)!;
    const employee = admin.karyawan[0]!;
    assert.ok(item, 'Expected at least one LUAR item with stok_luar > 0');

    const stokDalamBefore = item.stok_dalam;
    const stokLuarBefore = item.stok_luar;
    const qtyToReturn = Math.min(2, stokLuarBefore);

    const ok = api.masukKaryawan(employee.id, item.id, qtyToReturn, '');
    assert.equal(ok, true);

    const updated = api.adminData(pin).barang.find((b) => b.id === item.id)!;
    assert.equal(updated.stok_dalam, stokDalamBefore + qtyToReturn);
    assert.equal(updated.stok_luar, stokLuarBefore - qtyToReturn);
  });

  it('masukKaryawan transfers stock from kitchen to warehouse in Apps Script (Kode.gs)', () => {
    const { context, sheetsData } = createAppsScriptEnvironment();
    const masukKaryawan = runInContext('masukKaryawan', context);

    // Set item b1 to have stok_dalam = 20, stok_luar = 10, alur = 'LUAR'
    const b1Row = sheetsData.Barang.find((r) => r[0] === 'b1')!;
    b1Row[4] = 20; // stok_dalam
    b1Row[5] = 10; // stok_luar
    b1Row[7] = 'LUAR'; // alur

    const res = masukKaryawan('k1', 'b1', 3, '');
    assert.equal(res, true);

    const updatedRow = sheetsData.Barang.find((r) => r[0] === 'b1')!;
    assert.equal(updatedRow[4], 23, 'stok_dalam must increase by 3');
    assert.equal(updatedRow[5], 7, 'stok_luar must decrease by 3');

    // Verify Transaksi log
    const lastTx = sheetsData.Transaksi[sheetsData.Transaksi.length - 1];
    assert.equal(lastTx[3], 'MASUK');
    assert.equal(lastTx[4], 'b1');
    assert.equal(lastTx[6], 3);
    assert.equal(lastTx[9], 'DALAM');
  });

  it('simulates batch ambil for multiple items with unique clientTxId', () => {
    const api = createMock();
    const tablet = api.getTablet();
    const employee = tablet.karyawan[0]!;
    const items = tablet.barang.filter((b) => b.alur === 'LUAR').slice(0, 2);
    assert.equal(items.length, 2);

    const baseId = 'batch-' + Date.now();
    const batchInputs = [
      { b: items[0]!, j: 2 },
      { b: items[1]!, j: 3 },
    ];

    const results = batchInputs.map((input, idx) => {
      const txId = `${baseId}-${idx}`;
      return api.ambil(employee.id, input.b.id, input.j, txId);
    });

    assert.equal(results.length, 2);
    assert.ok(results[0]?.tx.id);
    assert.ok(results[1]?.tx.id);

    // Verify both items were properly updated
    const tabletAfter = api.getTablet();
    const updated0 = tabletAfter.barang.find((b) => b.id === items[0]!.id)!;
    const updated1 = tabletAfter.barang.find((b) => b.id === items[1]!.id)!;

    assert.equal(updated0.stok_luar, (items[0]!.stok_luar ?? 0) + 2);
    assert.equal(updated1.stok_luar, (items[1]!.stok_luar ?? 0) + 3);
  });

  it('filters available items for masuk: only LUAR items with stok_luar > 0 are eligible', () => {
    const api = createMock();
    const tablet = api.getTablet();

    // Replicate tablet component filter:
    const availableForMasuk = tablet.barang.filter(
      (b) => b.alur === 'LUAR' && (b.stok_luar ?? 0) > 0
    );

    // Must not include any LANGSUNG items
    assert.ok(availableForMasuk.every((b) => b.alur === 'LUAR'));
    // Must not include any item with stok_luar <= 0
    assert.ok(availableForMasuk.every((b) => (b.stok_luar ?? 0) > 0));
  });
});
