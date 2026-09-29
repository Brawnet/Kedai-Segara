import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createMock } from '../src/lib/mock.ts';
import { runInContext } from 'node:vm';
import { createAppsScriptEnvironment } from './apps-script.test.ts';

describe('Tablet Multi-Item Batch & Masuk Hasil Produksi', () => {
  it('produksiKaryawan correctly adds finished goods stock to warehouse (stok_dalam) without altering stok_luar in mock', () => {
    const api = createMock();
    const pin = '12345';
    const admin = api.adminData(pin);

    // Prepare an item with bisa_produksi = true
    const item = admin.barang[0]!;
    api.simpanBarang(pin, { ...item, bisa_produksi: true });

    const employee = admin.karyawan[0]!;
    const itemBefore = api.adminData(pin).barang.find((b) => b.id === item.id)!;
    const stokDalamBefore = itemBefore.stok_dalam;
    const stokLuarBefore = itemBefore.stok_luar;
    const qtyProduced = 5;

    const ok = api.produksiKaryawan(employee.id, item.id, qtyProduced, 'Hasil olahan dapur');
    assert.equal(ok, true);

    const updated = api.adminData(pin).barang.find((b) => b.id === item.id)!;
    assert.equal(updated.stok_dalam, stokDalamBefore + qtyProduced, 'stok_dalam must increase');
    assert.equal(updated.stok_luar, stokLuarBefore, 'stok_luar must remain unchanged');

    const lastTx = api.adminData(pin).transaksi[0]!;
    assert.equal(lastTx.jenis, 'PRODUKSI');
    assert.equal(lastTx.karyawan, employee.nama);
    assert.equal(lastTx.dicatat_oleh, 'karyawan');
    assert.equal(lastTx.catatan, 'Hasil olahan dapur');
  });

  it('produksiKaryawan adds finished goods stock to warehouse in Apps Script (Kode.gs)', () => {
    const { context, sheetsData } = createAppsScriptEnvironment();
    const produksiKaryawan = runInContext('produksiKaryawan', context);

    // Item b1 has bisa_produksi = true
    const b1Row = sheetsData.Barang.find((r) => r[0] === 'b1')!;
    b1Row[4] = 20; // stok_dalam
    b1Row[5] = 10; // stok_luar
    b1Row[11] = true; // bisa_produksi

    const res = produksiKaryawan('k1', 'b1', 4, 'Batch sore');
    assert.equal(res, true);

    const updatedRow = sheetsData.Barang.find((r) => r[0] === 'b1')!;
    assert.equal(updatedRow[4], 24, 'stok_dalam must increase by 4');
    assert.equal(updatedRow[5], 10, 'stok_luar must not change');

    // Verify Transaksi log
    const lastTx = sheetsData.Transaksi[sheetsData.Transaksi.length - 1];
    assert.equal(lastTx[3], 'PRODUKSI');
    assert.equal(lastTx[4], 'b1');
    assert.equal(lastTx[6], 4);
    assert.equal(lastTx[8], 'Budi');
    assert.equal(lastTx[9], 'DALAM');
    assert.equal(lastTx[12], 'karyawan');
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

  it('filters available items for masuk hasil produksi: only items with bisa_produksi === true are eligible', () => {
    const api = createMock();
    const pin = '12345';
    const allBarang = api.adminData(pin).barang;

    // Set first 2 items as producible, rest non-producible
    api.simpanBarang(pin, { ...allBarang[0]!, bisa_produksi: true });
    api.simpanBarang(pin, { ...allBarang[1]!, bisa_produksi: true });

    const tablet = api.getTablet();
    const availableForProduksi = tablet.barang.filter((b) => b.bisa_produksi);

    assert.equal(availableForProduksi.length, 2);
    assert.ok(availableForProduksi.every((b) => b.bisa_produksi === true));
    assert.equal(availableForProduksi[0]!.id, allBarang[0]!.id);
    assert.equal(availableForProduksi[1]!.id, allBarang[1]!.id);
  });

  it('admin can record production and cancel it with safety guard when stock is insufficient', () => {
    const api = createMock();
    const pin = '12345';
    const admin = api.adminData(pin);
    const item = admin.barang[0]!;
    const stokAwal = item.stok_dalam;

    // Admin records production
    api.simpanProduksiAdmin(pin, item.id, 10, 'Admin batch');
    const afterProd = api.adminData(pin);
    const itemProd = afterProd.barang.find((b) => b.id === item.id)!;
    assert.equal(itemProd.stok_dalam, stokAwal + 10);

    const txProd = afterProd.transaksi.find((t) => t.barang_id === item.id && t.jenis === 'PRODUKSI' && t.status === 'AKTIF')!;
    assert.ok(txProd);
    assert.equal(txProd.dicatat_oleh, 'admin');

    // Successful cancellation: restores stock
    api.batalProduksi(txProd.id, pin);
    const afterCancel = api.adminData(pin);
    const itemCancelled = afterCancel.barang.find((b) => b.id === item.id)!;
    assert.equal(itemCancelled.stok_dalam, stokAwal);

    // Re-record production of 10
    api.simpanProduksiAdmin(pin, item.id, 10, 'Admin batch 2');
    const txProd2 = api.adminData(pin).transaksi.find((t) => t.barang_id === item.id && t.jenis === 'PRODUKSI' && t.status === 'AKTIF')!;

    // Simulate that staff took 8 from warehouse to kitchen, leaving only 2
    const bObj = api.adminData(pin).barang.find((b) => b.id === item.id)!;
    // Manually lower stock_dalam to 2 to simulate shortage
    api.simpanOpname(pin, [{ barang_id: item.id, fisik: '2' }]);

    // Cancellation must fail with safety guard
    assert.throws(
      () => api.batalProduksi(txProd2.id, pin),
      /tidak mencukupi untuk menarik kembali/
    );
  });
});
