import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createMock } from '../src/lib/mock.ts';
import { createAppsScriptEnvironment } from './apps-script.test.ts';
import { runInContext } from 'node:vm';
import { formatSelisih } from '../src/lib/rekap-helpers.ts';

describe('Rekap Approval FIFO, Terjual & Selisih (Mock & Apps Script)', () => {
  it('Mock: simpanRekap creates PENDING rekap with terjual: 0 and selisih: terpakai', () => {
    const api = createMock();
    const tablet = api.getTablet();
    const emp = tablet.karyawan[0];
    const item = tablet.barang.find((b) => b.alur === 'LUAR') || tablet.barang[0];
    assert.ok(emp && item);

    // Pastikan stok gudang cukup untuk diambil
    api.stokMasuk('12345', item.id, 20, 'Supplier Test', 'Inisialisasi stok');
    api.ambil(emp.id, item.id, 10);

    const draf = api.rekapDraf();
    const res = api.simpanRekap(
      draf.cutoff,
      emp.id,
      draf.baris.map((b) => ({ barang_id: b.barang_id, sisa: b.barang_id === item.id ? 3 : 0 })),
    );
    assert.ok(res.id);

    const admin = api.adminData('12345');
    const created = admin.rekap.find((r) => r.id === res.id);
    assert.ok(created);
    assert.equal(created.status, 'PENDING');

    const createdBaris = created.baris.find((b) => b.barang_id === item.id);
    assert.ok(createdBaris);
    assert.equal(createdBaris.sisa, 3);
    const expectedTerpakai = createdBaris.saldo_awal + createdBaris.diambil - 3;
    assert.equal(createdBaris.terpakai, expectedTerpakai);
    assert.equal(createdBaris.terjual, 0);
    assert.equal(createdBaris.selisih, expectedTerpakai);
  });

  it('Mock: enforces FIFO order when multiple pending rekaps exist', () => {
    const api = createMock();
    const tablet = api.getTablet();
    const emp = tablet.karyawan[0];
    const item = tablet.barang.find((b) => b.alur === 'LUAR') || tablet.barang[0];
    assert.ok(emp && item);

    api.stokMasuk('12345', item.id, 20, 'Supplier Test', 'Inisialisasi stok');

    // Sesi rekap 1 (kemarin)
    api.ambil(emp.id, item.id, 5);
    const draf1 = api.rekapDraf();
    const r1 = api.simpanRekap(
      draf1.cutoff,
      emp.id,
      draf1.baris.map((b) => ({ barang_id: b.barang_id, sisa: b.barang_id === item.id ? 2 : 0 })),
    );

    // Sesi rekap 2 (hari ini)
    api.ambil(emp.id, item.id, 4);
    const draf2 = api.rekapDraf();
    const t2 = Math.max(draf2.cutoff, draf1.cutoff + 1000);
    const r2 = api.simpanRekap(
      t2,
      emp.id,
      draf2.baris.map((b) => ({ barang_id: b.barang_id, sisa: b.barang_id === item.id ? 1 : 0 })),
    );
    const adminBefore = api.adminData('12345');
    const pendingList = adminBefore.rekap.filter((r) => r.status === 'PENDING');
    assert.equal(pendingList.length, 2);

    // Coba approve rekap 2 (yang lebih baru) sebelum rekap 1 -> harus gagal FIFO
    assert.throws(() => {
      api.approveRekap('12345', r2.id, [{ barang_id: item.id, sisa: 1, terjual: 4 }]);
    }, /Harap setujui rekap yang lebih lama terlebih dahulu/);

    // Approve rekap 1 (yang terlama) -> berhasil
    const b0 = adminBefore.barang.find((b) => b.id === item.id);
    const stokLuarAwal = b0?.stok_luar || 0;

    const resApprove1 = api.approveRekap('12345', r1.id, [
      { barang_id: item.id, sisa: 3, terjual: 2 }, // koreksi sisa jadi 3, terjual 2
    ]);
    assert.equal(resApprove1.status, 'APPROVED');

    const adminMid = api.adminData('12345');
    const approved1 = adminMid.rekap.find((r) => r.id === r1.id);
    assert.ok(approved1);
    assert.equal(approved1.status, 'APPROVED');
    const baris1 = approved1.baris.find((b) => b.barang_id === item.id);
    assert.ok(baris1);
    assert.equal(baris1.sisa, 3);
    assert.equal(baris1.terjual, 2);
    const expectedTerpakai1 = baris1.saldo_awal + baris1.diambil - 3;
    assert.equal(baris1.terpakai, expectedTerpakai1);
    assert.equal(baris1.selisih, expectedTerpakai1 - 2);

    // Sekarang rekap 2 bisa di-approve
    const resApprove2 = api.approveRekap('12345', r2.id, [
      { barang_id: item.id, sisa: 1, terjual: 5 },
    ]);
    assert.equal(resApprove2.status, 'APPROVED');

    const adminFinal = api.adminData('12345');
    const approved2 = adminFinal.rekap.find((r) => r.id === r2.id);
    assert.ok(approved2);
    assert.equal(approved2.status, 'APPROVED');
    const baris2 = approved2.baris.find((b) => b.barang_id === item.id);
    assert.ok(baris2);
    assert.equal(baris2.terjual, 5);
    // Terpakai = maks - sisa. Selisih = terpakai - terjual
    assert.equal(baris2.selisih, baris2.terpakai - 5);
  });

  it('Apps Script: simpanRekap sets PENDING and approveRekap enforces FIFO and updates terjual & selisih', () => {
    const { context } = createAppsScriptEnvironment();
    const ambil = runInContext('ambil', context);
    const rekapDraf = runInContext('rekapDraf', context);
    const simpanRekap = runInContext('simpanRekap', context);
    const adminData = runInContext('adminData', context);
    const approveRekap = runInContext('approveRekap', context);

    ambil('k1', 'b1', 10);
    const d1 = rekapDraf();
    const r1 = simpanRekap(d1.cutoff, 'k1', [{ barang_id: 'b1', sisa: 4 }]);
    assert.ok(r1.id);

    ambil('k1', 'b1', 6);
    const d2 = rekapDraf();
    const t2 = Math.max(d2.cutoff, d1.cutoff + 1000);
    const r2 = simpanRekap(t2, 'k1', [{ barang_id: 'b1', sisa: 2 }]);
    assert.ok(r2.id);

    const adm1 = adminData('12345');
    const rk1 = adm1.rekap.find((r: { id: string }) => r.id === r1.id);
    assert.ok(rk1);
    assert.equal(rk1.status, 'PENDING');

    // Menyetujui r2 duluan harus ditolak FIFO
    assert.throws(() => {
      approveRekap('12345', r2.id, [{ barang_id: 'b1', sisa: 2, terjual: 5 }]);
    }, /Harap setujui rekap yang lebih lama terlebih dahulu/);

    // Setujui r1
    const app1 = approveRekap('12345', r1.id, [{ barang_id: 'b1', sisa: 3, terjual: 6 }]);
    assert.equal(app1.status, 'APPROVED');

    const adm2 = adminData('12345');
    const rk1Done = adm2.rekap.find((r: { id: string }) => r.id === r1.id);
    assert.equal(rk1Done.status, 'APPROVED');
    const b1Row = rk1Done.baris.find((b: { barang_id: string }) => b.barang_id === 'b1');
    assert.equal(b1Row.sisa, 3);
    assert.equal(b1Row.terjual, 6);
    assert.equal(b1Row.terpakai, 7); // awal 0 + 10 - 3 = 7
    assert.equal(b1Row.selisih, 1); // 7 - 6 = 1

    // Sekarang r2 bisa disetujui
    const app2 = approveRekap('12345', r2.id, [{ barang_id: 'b1', sisa: 2, terjual: 8 }]);
    assert.equal(app2.status, 'APPROVED');
  });

  it('UI formatSelisih: formats 0 as neutral "0", positive with "+", and negative with "-"', () => {
    assert.equal(formatSelisih(0), '0');
    assert.equal(formatSelisih(0.0), '0');
    assert.equal(formatSelisih(2), '+2');
    assert.equal(formatSelisih(1.5), '+1,5');
    assert.equal(formatSelisih(-3), '-3');
    assert.equal(formatSelisih(-0.5), '-0,5');
  });

  it('Rekap segregation: unapproved rekap stays in pending queue and is excluded from approved history', () => {
    const api = createMock();
    const tablet = api.getTablet();
    const emp = tablet.karyawan[0];
    const item = tablet.barang.find((b) => b.alur === 'LUAR') || tablet.barang[0];
    assert.ok(emp && item);

    api.stokMasuk('12345', item.id, 10, 'Supplier', 'Stok test');
    api.ambil(emp.id, item.id, 5);

    const draf = api.rekapDraf();
    const res = api.simpanRekap(
      draf.cutoff,
      emp.id,
      draf.baris.map((b) => ({ barang_id: b.barang_id, sisa: 2 })),
    );

    const admin = api.adminData('12345');
    const pending = admin.rekap.filter((r) => (r.status || 'APPROVED') === 'PENDING');
    const approved = admin.rekap.filter((r) => (r.status || 'APPROVED') === 'APPROVED');

    assert.ok(pending.some((r) => r.id === res.id));
    assert.ok(!approved.some((r) => r.id === res.id));

    // Setelah di-approve, berpindah ke approved
    api.approveRekap('12345', res.id, [{ barang_id: item.id, sisa: 2, terjual: 3 }]);

    const adminAfter = api.adminData('12345');
    const pendingAfter = adminAfter.rekap.filter((r) => (r.status || 'APPROVED') === 'PENDING');
    const approvedAfter = adminAfter.rekap.filter((r) => (r.status || 'APPROVED') === 'APPROVED');

    assert.ok(!pendingAfter.some((r) => r.id === res.id));
    assert.ok(approvedAfter.some((r) => r.id === res.id));

    // Mencoba menyetujui ulang harus ditolak
    assert.throws(() => {
      api.approveRekap('12345', res.id, [{ barang_id: item.id, sisa: 2, terjual: 3 }]);
    }, /Rekap sudah disetujui/);
  });

  it('Legacy rekap: rows without recorded terjual & selisih default to selisih 0 and terjual = terpakai', () => {
    const { context, sheetsData } = createAppsScriptEnvironment();
    const adminData = runInContext('adminData', context);

    // Simulasi data lama di Google Sheets (kolom terjual dan selisih kosong)
    const rekapSheet = sheetsData.Rekap;
    const rekapBarisSheet = sheetsData.RekapBaris;
    const legacyRekapId = 'legacy-rk-1';
    rekapSheet.push([legacyRekapId, Date.now() - 50000, '01/10/2026 12:00', 'k1', 'Budi', false, '', '']);
    // Baris rekap lama: saldo_awal: 0, diambil: 10, sisa: 3, terpakai: 7, catatan: '', terjual: '', selisih: ''
    rekapBarisSheet.push([legacyRekapId, 'b1', 'Minyak goreng', 0, 10, 3, 7, '', '', '']);

    const adm = adminData('12345');
    const legacyRekap = adm.rekap.find((r: { id: string }) => r.id === legacyRekapId);
    assert.ok(legacyRekap);
    assert.equal(legacyRekap.status, 'APPROVED');

    const baris = legacyRekap.baris.find((b: { barang_id: string }) => b.barang_id === 'b1');
    assert.ok(baris);
    assert.equal(baris.terpakai, 7);
    assert.equal(baris.terjual, 7); // Sama dengan terpakai agar tidak ada selisih
    assert.equal(baris.selisih, 0); // Selisih 0
  });
});
