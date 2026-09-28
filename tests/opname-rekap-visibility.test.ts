import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createMock } from '../src/lib/mock.ts';
import { createAppsScriptEnvironment } from './apps-script.test.ts';
import { runInContext } from 'node:vm';

describe('Rekap & Stok Luar Visibility driven directly by Alur', () => {
  const pin = '12345';

  it('mock backend: item with alur LUAR appears in rekapDraf when taken, regardless of legacy opname_rekap', () => {
    const mock = createMock();
    const tabletData = mock.getTablet();
    const employee = tabletData.karyawan[0]!;

    // Tambah barang dengan alur LUAR
    mock.simpanBarang(pin, {
      id: '',
      nama: 'Sedotan Plastik',
      satuan: 'Pcs',
      kategori: 'Kemasan',
      kode: 'SDT-PLS',
      catatan: '',
      alur: 'LUAR',
      ambang_min: 10,
      aktif: true,
      stok_awal: 100,
    });

    const items = mock.adminData(pin).barang;
    const sedotan = items.find((b) => b.nama === 'Sedotan Plastik');
    assert.ok(sedotan);
    assert.equal(sedotan.stok_dalam, 100);

    // Karyawan mengambil barang ke dapur
    const stBefore = mock.getTablet().status.belumRekap;
    mock.ambil(employee.id, sedotan.id, 20);

    // Menambah status belumRekap
    const stAfter = mock.getTablet().status.belumRekap;
    assert.equal(stAfter, stBefore + 1);

    // Buka rekap draft: Sedotan MUNCUL di daftar rekap
    const draf = mock.rekapDraf();
    const drafSedotan = draf.baris.find((r) => r.barang_id === sedotan.id);
    assert.ok(drafSedotan, 'Sedotan harus muncul di rekap karena alurnya LUAR');
    assert.equal(drafSedotan.diambil, 20);
  });

  it('mock backend: item with alur LANGSUNG_HABIS is excluded from rekapDraf and status.belumRekap', () => {
    const mock = createMock();
    const tabletData = mock.getTablet();
    const employee = tabletData.karyawan[0]!;

    mock.simpanBarang(pin, {
      id: '',
      nama: 'Plastik Sampah Hitam',
      satuan: 'Lbr',
      kategori: 'Cleaning',
      kode: 'PSH',
      catatan: '',
      alur: 'LANGSUNG_HABIS',
      ambang_min: 5,
      aktif: true,
      stok_awal: 50,
    });

    const items = mock.adminData(pin).barang;
    const plastik = items.find((b) => b.nama === 'Plastik Sampah Hitam');
    assert.ok(plastik);

    const stBefore = mock.getTablet().status.belumRekap;
    mock.ambil(employee.id, plastik.id, 5);

    // Alur LANGSUNG_HABIS tidak menambah belumRekap
    const stAfter = mock.getTablet().status.belumRekap;
    assert.equal(stAfter, stBefore);

    // Buka rekap draft: Plastik LANGSUNG_HABIS TIDAK muncul di daftar rekap
    const draf = mock.rekapDraf();
    const drafPlastik = draf.baris.find((r) => r.barang_id === plastik.id);
    assert.equal(drafPlastik, undefined, 'Item LANGSUNG_HABIS tidak boleh ada di rekap dapur');
  });

  it('Google Apps Script engine: hitungRekap_ directly follows alur LUAR and excludes LANGSUNG_HABIS', () => {
    const { context } = createAppsScriptEnvironment();
    const simpanBarang = runInContext('simpanBarang', context);
    const adminData = runInContext('adminData', context);
    const ambil = runInContext('ambil', context);
    const rekapDraf = runInContext('rekapDraf', context);

    // 1. Buat barang alur LUAR (meskipun opname_rekap di legacy sheet sempat false)
    simpanBarang(pin, {
      nama: 'Sedotan Bubble',
      satuan: 'Pack',
      kategori: 'Utensil',
      alur: 'LUAR',
      ambang_min: 5,
      stok_awal: 20,
      kode: 'SDB',
      catatan: '',
      opname_rekap: false, // simulasikan legacy value
    });

    // 2. Buat barang alur LANGSUNG_HABIS
    simpanBarang(pin, {
      nama: 'Kertas Thermal Struk',
      satuan: 'Roll',
      kategori: 'Utensil',
      alur: 'LANGSUNG_HABIS',
      ambang_min: 2,
      stok_awal: 10,
      kode: 'KTS',
      catatan: '',
    });

    const barangList = adminData(pin).barang;
    const sedotan = barangList.find((b: { nama: string }) => b.nama === 'Sedotan Bubble');
    const thermal = barangList.find((b: { nama: string }) => b.nama === 'Kertas Thermal Struk');
    assert.ok(sedotan);
    assert.ok(thermal);

    // Ambil keduanya
    ambil('k1', sedotan.id, 5);
    ambil('k1', thermal.id, 2);

    // Rekap draft: Sedotan (alur LUAR) HARUS muncul, Thermal (LANGSUNG_HABIS) TIDAK muncul
    const draf = rekapDraf();
    const drafSedotan = draf.baris.find((r: { barang_id: string }) => r.barang_id === sedotan.id);
    const drafThermal = draf.baris.find((r: { barang_id: string }) => r.barang_id === thermal.id);

    assert.ok(drafSedotan, 'Sedotan dengan alur LUAR harus muncul di rekap');
    assert.equal(drafSedotan.diambil, 5);
    assert.equal(drafThermal, undefined, 'Thermal dengan alur LANGSUNG_HABIS tidak boleh muncul di rekap');
  });
});
