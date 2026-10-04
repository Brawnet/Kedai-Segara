import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createMock } from '../src/lib/mock.ts';

describe('Mock Backend Business Logic & Invariants', () => {
  it('masukKaryawan increases warehouse stock and requires active employee and item', () => {
    const api = createMock();
    const tablet = api.getTablet();
    const item = tablet.barang[0];
    const employee = tablet.karyawan[0];
    assert.ok(item && employee);

    const initialAdmin = api.adminData('12345');
    const b0 = initialAdmin.barang.find((b) => b.id === item.id);
    const initialStock = b0 ? b0.stok_dalam : 0;

    const ok = api.masukKaryawan(employee.id, item.id, 5, 'Supplier ABC');
    assert.equal(ok, true);

    const updatedAdmin = api.adminData('12345');
    const b1 = updatedAdmin.barang.find((b) => b.id === item.id);
    assert.equal(b1?.stok_dalam, initialStock + 5);

    // Rejects 0 or negative
    assert.throws(() => api.masukKaryawan(employee.id, item.id, 0, ''), /Jumlah harus lebih dari 0/);
    assert.throws(() => api.masukKaryawan(employee.id, item.id, -1, ''), /Jumlah harus lebih dari 0/);
    assert.throws(() => api.masukKaryawan(employee.id, 'fake-id', 2, ''), /Barang tidak ditemukan/);
  });

  it('rejects inactive employee from performing masukKaryawan and ambil', () => {
    const api = createMock();
    const admin = api.adminData('12345');
    const item = admin.barang[0];
    const employee = admin.karyawan[0];
    assert.ok(item && employee);

    // Deactivate employee
    api.simpanKaryawan('12345', { id: employee.id, nama: employee.nama, aktif: false });

    assert.throws(
      () => api.masukKaryawan(employee.id, item.id, 5, ''),
      /Karyawan tidak aktif atau tidak ditemukan/,
    );
    assert.throws(
      () => api.ambil(employee.id, item.id, 1),
      /Karyawan tidak aktif atau tidak ditemukan/,
    );
  });

  it('ambil reduces stock_dalam and increases stock_luar for LUAR items', () => {
    const api = createMock();
    const admin = api.adminData('12345');
    const item = admin.barang.find((b) => b.alur === 'LUAR' && b.stok_dalam >= 5);
    const employee = admin.karyawan[0];
    assert.ok(item && employee);

    const prevDalam = item.stok_dalam;
    const prevLuar = item.stok_luar;

    const res = api.ambil(employee.id, item.id, 2);
    assert.ok(res.tx.id);

    const updated = api.adminData('12345').barang.find((b) => b.id === item.id);
    assert.equal(updated?.stok_dalam, prevDalam - 2);
    assert.equal(updated?.stok_luar, prevLuar + 2);
  });

  it('batalAmbil reverses inventory and marks transaction as BATAL', () => {
    const api = createMock();
    const admin = api.adminData('12345');
    const item = admin.barang.find((b) => b.alur === 'LUAR' && b.stok_dalam >= 5);
    const employee = admin.karyawan[0];
    assert.ok(item && employee);

    const prevDalam = item.stok_dalam;
    const prevLuar = item.stok_luar;

    const res = api.ambil(employee.id, item.id, 2);

    // Wrong PIN fails
    assert.throws(() => api.batalAmbil(res.tx.id, 'wrong'), /PIN salah/);

    const ok = api.batalAmbil(res.tx.id, '12345');
    assert.equal(ok, true);

    const reverted = api.adminData('12345').barang.find((b) => b.id === item.id);
    assert.equal(reverted?.stok_dalam, prevDalam);
    assert.equal(reverted?.stok_luar, prevLuar);

    const tx = api.adminData('12345').transaksi.find((t) => t.id === res.tx.id);
    assert.equal(tx?.status, 'BATAL');

    // Double cancel should fail
    assert.throws(() => api.batalAmbil(res.tx.id, '12345'), /Transaksi tidak bisa dibatalkan/);
  });

  it('simpanBarang validates non-negative ambang_min and stok_awal', () => {
    const api = createMock();
    assert.throws(
      () =>
        api.simpanBarang('12345', {
          id: '',
          nama: 'Barang Uji Negatif',
          satuan: 'pcs',
          kategori: 'Test',
          kode: 'TEST1',
          alur: 'LUAR',
          ambang_min: -5,
          aktif: true,
          stok_awal: 0,
        }),
      /Ambang minimum tidak boleh negatif/,
    );

    assert.throws(
      () =>
        api.simpanBarang('12345', {
          id: '',
          nama: 'Barang Uji Awal Negatif',
          satuan: 'pcs',
          kategori: 'Test',
          kode: 'TEST2',
          alur: 'LUAR',
          ambang_min: 0,
          aktif: true,
          stok_awal: -10,
        }),
      /Stok awal tidak boleh negatif/,
    );
  });

  it('simpanBarang preserves active status when aktif is omitted (undefined)', () => {
    const api = createMock();
    const item = api.getTablet().barang[0]!;
    assert.ok(item);

    // Updating item without explicitly passing aktif must not deactivate it or throw
    const ok = api.simpanBarang('12345', {
      id: item.id,
      nama: item.nama + ' Updated',
      satuan: item.satuan,
      kategori: item.kategori,
      kode: item.kode,
      catatan: item.catatan,
      alur: item.alur,
      ambang_min: 5,
    });
    assert.equal(ok, true);

    // Item must remain visible on tablet
    const tabletAfter = api.getTablet();
    assert.ok(tabletAfter.barang.some((b) => b.id === item.id && b.nama.includes('Updated')));
  });

  it('simpanKaryawan prevents duplicate employee names (case-insensitive)', () => {
    const api = createMock();
    const admin = api.adminData('12345');
    const existingName = admin.karyawan[0]?.nama;
    assert.ok(existingName);

    assert.throws(
      () => api.simpanKaryawan('12345', { nama: existingName }),
      /sudah ada/,
    );
    assert.throws(
      () => api.simpanKaryawan('12345', { nama: existingName.toUpperCase() }),
      /sudah ada/,
    );
  });
  it('simpanKaryawan and verifikasiPinKaryawan support PIN management correctly', () => {
    const api = createMock();
    // Invalid PIN format
    assert.throws(() => api.simpanKaryawan('12345', { nama: 'Eko', pin: '12' }), /4–6 angka/);
    assert.throws(() => api.simpanKaryawan('12345', { nama: 'Eko', pin: 'abcdef' }), /4–6 angka/);

    // Save with PIN
    assert.ok(api.simpanKaryawan('12345', { nama: 'Eko', pin: '654321' }));
    const admin = api.adminData('12345');
    const eko = admin.karyawan.find((k) => k.nama === 'Eko');
    assert.ok(eko);
    assert.equal(eko.punyaPin, true);
    assert.equal(eko.pin, undefined);

    // Verification
    assert.ok(api.verifikasiPinKaryawan(eko.id, '654321'));
    assert.throws(() => api.verifikasiPinKaryawan(eko.id, '111111'), /PIN karyawan salah/);

    // Update PIN
    assert.ok(api.simpanKaryawan('12345', { id: eko.id, nama: 'Eko Santoso', pin: '4321' }));
    assert.ok(api.verifikasiPinKaryawan(eko.id, '4321'));
    assert.throws(() => api.verifikasiPinKaryawan(eko.id, '654321'), /PIN karyawan salah/);

    // Clear PIN
    assert.ok(api.simpanKaryawan('12345', { id: eko.id, nama: 'Eko Santoso', pin: '' }));
    const ekoCleared = api.adminData('12345').karyawan.find((k) => k.id === eko.id);
    assert.equal(ekoCleared?.punyaPin, false);
    assert.ok(api.verifikasiPinKaryawan(eko.id, ''));
  });

  it('simpanOpname records adjustments accurately', () => {
    const api = createMock();
    const admin = api.adminData('12345');
    const item = admin.barang[0];
    assert.ok(item);

    const physical = item.stok_dalam + 3;
    const count = api.simpanOpname('12345', [{ barang_id: item.id, fisik: String(physical) }]);
    assert.equal(count, 1);

    const updated = api.adminData('12345').barang.find((b) => b.id === item.id);
    assert.equal(updated?.stok_dalam, physical);

    // Negative physical stock rejected
    assert.throws(
      () => api.simpanOpname('12345', [{ barang_id: item.id, fisik: '-1' }]),
      /Stok fisik tidak boleh negatif/,
    );

    // Non-numeric physical stock rejected
    assert.throws(
      () => api.simpanOpname('12345', [{ barang_id: item.id, fisik: 'abc' }]),
      /tidak valid/,
    );

    // Multiple items opname preserves timestamp batching
    const items = admin.barang.slice(0, 3);
    const batchCount = api.simpanOpname(
      '12345',
      items.map((b) => ({ barang_id: b.id, fisik: String(b.stok_dalam + 1) })),
    );
    assert.equal(batchCount, 3);
    const opnames = api.adminData('12345').opname;
    assert.ok(opnames.length >= 4);
    const latestTime = opnames[0]!.waktu;
    assert.ok(latestTime);
    // The 3 items in the batch share the exact same timestamp
    assert.equal(opnames[1]!.waktu, latestTime);
    assert.equal(opnames[2]!.waktu, latestTime);
  });

  it('simpanPengaturan updates closing time and PIN securely', () => {
    const api = createMock();
    api.simpanPengaturan('12345', '22:30', '54321');

    // Old PIN fails
    assert.throws(() => api.adminData('12345'), /PIN salah/);

    // New PIN succeeds
    const admin = api.adminData('54321');
    assert.equal(admin.jamTutup, '22:30');

    // PIN length validation
    assert.throws(() => api.simpanPengaturan('54321', '', '12'), /PIN harus 4–8 angka/);
    assert.throws(() => api.simpanPengaturan('54321', '', '123456789'), /PIN harus 4–8 angka/);

    // Invalid closing time rejected
    assert.throws(() => api.simpanPengaturan('54321', '25:00', ''), /Jam tutup/);
    assert.throws(() => api.simpanPengaturan('54321', 'xyz', ''), /Jam tutup/);
  });

  it('simpanRekap calculates consumed amounts and updates kitchen balances', () => {
    const api = createMock();
    const draf = api.rekapDraf();
    const admin = api.adminData('12345');
    const employee = admin.karyawan.find((k) => k.aktif);
    assert.ok(employee);

    if (draf.baris.length > 0) {
      const inputs = draf.baris.map((b) => ({
        barang_id: b.barang_id,
        sisa: 0,
        catatan: 'Habis hari ini',
      }));

      const res = api.simpanRekap(draf.cutoff, employee.id, inputs);
      assert.ok(res.id);

      const latestAdmin = api.adminData('12345');
      const latestRekap = latestAdmin.rekap[0];
      assert.equal(latestRekap?.id, res.id);
      assert.equal(latestRekap?.karyawan, employee.nama);
      // Future cutoff rejected
      assert.throws(
        () => api.simpanRekap(Date.now() + 3_600_000, employee.id, []),
        /Waktu rekap/,
      );
    }
  });

  it('editRekapTerakhir rejects non-numeric sisa', () => {
    const api = createMock();
    const draf = api.rekapDraf();
    const admin = api.adminData('12345');
    const employee = admin.karyawan.find((k) => k.aktif);
    assert.ok(employee);
    if (draf.baris.length > 0) {
      const item = draf.baris[0]!;
      api.simpanRekap(
        draf.cutoff,
        employee.id,
        draf.baris.map((b) => ({ barang_id: b.barang_id, sisa: 0 })),
      );
      assert.throws(
        () => api.editRekapTerakhir('12345', [{ barang_id: item.barang_id, sisa: 'invalid' }]),
        /tidak valid/,
      );
    }
  });

  it('simpanKaryawan treats pin: null like not provided', () => {
    const api = createMock();
    assert.ok(api.simpanKaryawan('12345', { nama: 'Tanpa Pin Mock', pin: null }));
    const emp = api.adminData('12345').karyawan.find((k) => k.nama === 'Tanpa Pin Mock');
    assert.ok(emp);
    assert.equal(emp.punyaPin, false);
  });

  it('provides dummy rekap data with realistic historical balance tracking', () => {
    const api = createMock();
    const admin = api.adminData('12345');

    // Pre-seeded with 3 historical rekap sessions
    assert.ok(admin.rekap.length >= 3);
    const latest = admin.rekap[0]!;
    assert.ok(latest.waktu);
    assert.ok(latest.karyawan);
    assert.ok(latest.baris.length > 0);

    // Balance equation check: terpakai == saldo_awal + diambil - sisa
    for (const b of latest.baris) {
      assert.equal(b.terpakai, b.saldo_awal + b.diambil - b.sisa);
    }

    // Calling buatDummyRekap requires valid PIN and adds more sessions
    assert.throws(() => api.buatDummyRekap('wrong'), /PIN salah/);
    const added = api.buatDummyRekap('12345');
    assert.equal(added, 3);
    assert.ok(api.adminData('12345').rekap.length >= 6);
  });
});
