import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMock } from '../src/lib/mock.ts';

test('hapusKaryawan functionality and transaction history safety', async (t) => {
  const mock = createMock();
  const pin = '12345';

  await t.test('rejects deleting with invalid admin PIN', () => {
    assert.throws(
      () => mock.hapusKaryawan('wrong-pin', 'any-id'),
      /PIN salah/,
    );
  });

  await t.test('rejects deleting non-existent employee ID', () => {
    assert.throws(
      () => mock.hapusKaryawan(pin, 'random-missing-id'),
      /Karyawan tidak ditemukan/,
    );
  });

  await t.test('hard-deletes employee if NO transaction or rekap history exists', () => {
    // Add brand new employee
    mock.simpanKaryawan(pin, {
      nama: 'Karyawan Uji Hapus',
      pin: '1234',
    });

    const admin = mock.adminData(pin);
    const emp = admin.karyawan.find((k) => k.nama === 'Karyawan Uji Hapus')!;
    assert.ok(emp, 'Employee created');

    // Call hapusKaryawan
    const res = mock.hapusKaryawan(pin, emp.id);
    assert.equal(res.status, 'deleted');
    assert.match(res.message, /berhasil dihapus permanen/);

    // Verify employee is completely gone from admin and tablet data
    const after = mock.adminData(pin).karyawan.find((k) => k.id === emp.id);
    assert.equal(after, undefined, 'Employee must be completely deleted from admin');
    const tablet = mock.getTablet().karyawan.find((k) => k.id === emp.id);
    assert.equal(tablet, undefined, 'Employee must be completely deleted from tablet');
  });

  await t.test('soft-deletes (archives) employee if transaction history exists', () => {
    // Add new employee
    mock.simpanKaryawan(pin, {
      nama: 'Karyawan Ada Transaksi',
    });

    const admin = mock.adminData(pin);
    const emp = admin.karyawan.find((k) => k.nama === 'Karyawan Ada Transaksi')!;
    const item = admin.barang.find((b) => b.aktif && b.stok_dalam > 0)!;
    assert.ok(emp && item, 'Employee and item exist');

    // Make employee take stock (creates a transaction)
    mock.ambil(emp.id, item.id, 1);

    // Verify transaction was recorded
    const tx = mock.adminData(pin).transaksi.filter((x) => x.karyawan_id === emp.id);
    assert.ok(tx.length > 0, 'Transaction recorded for employee');

    // Call hapusKaryawan
    const res = mock.hapusKaryawan(pin, emp.id);
    assert.equal(res.status, 'archived');
    assert.match(res.message, /riwayat transaksi/);

    // Verify employee is still in admin data but marked inactive
    const after = mock.adminData(pin).karyawan.find((k) => k.id === emp.id);
    assert.ok(after, 'Employee still exists in database for audit trail');
    assert.equal(after?.aktif, false, 'Employee must be marked inactive (archived)');

    // Verify employee is hidden from active tablet list
    const tablet = mock.getTablet().karyawan.find((k) => k.id === emp.id);
    assert.equal(tablet, undefined, 'Archived employee must not appear on tablet');

    // Verify transaction history preserved employee's name and details
    const txAfter = mock.adminData(pin).transaksi.filter((x) => x.karyawan_id === emp.id);
    assert.equal(txAfter.length, tx.length);
    assert.equal(txAfter[0]?.karyawan, 'Karyawan Ada Transaksi');
  });

  await t.test('soft-deletes (archives) employee if rekap history exists', () => {
    // Add new employee
    mock.simpanKaryawan(pin, {
      nama: 'Karyawan Ada Rekap',
    });

    const admin = mock.adminData(pin);
    const emp = admin.karyawan.find((k) => k.nama === 'Karyawan Ada Rekap')!;
    assert.ok(emp);

    // Save rekap under employee
    const draf = mock.rekapDraf();
    const input = draf.baris.map((b) => ({ barang_id: b.barang_id, sisa: '0' }));
    mock.simpanRekap(Date.now(), emp.id, input);
    // Call hapusKaryawan
    const res = mock.hapusKaryawan(pin, emp.id);
    assert.equal(res.status, 'archived');
    assert.match(res.message, /riwayat transaksi/);

    const after = mock.adminData(pin).karyawan.find((k) => k.id === emp.id);
    assert.ok(after);
    assert.equal(after?.aktif, false);
  });
});
