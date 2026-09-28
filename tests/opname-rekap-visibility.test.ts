import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createMock } from '../src/lib/mock.ts';
import { createAppsScriptEnvironment } from './apps-script.test.ts';
import { runInContext } from 'node:vm';

describe('Opname & Rekap Visibility Feature (opname_rekap)', () => {
  const pin = '12345';

  it('mock backend: defaults opname_rekap to true when creating new item', () => {
    const mock = createMock();
    mock.simpanBarang(pin, {
      id: '',
      nama: 'Kopi Susu Gula Aren',
      satuan: 'Cup',
      kategori: 'Minuman',
      kode: 'KSGA',
      catatan: '',
      alur: 'LUAR',
      ambang_min: 10,
      aktif: true,
      stok_awal: 50,
    });

    const items = mock.getTablet().barang;
    const added = items.find((b) => b.nama === 'Kopi Susu Gula Aren');
    assert.ok(added);
    assert.equal(added.opname_rekap, true);
  });

  it('mock backend: excludes items with opname_rekap=false from rekapDraf and status.belumRekap', () => {
    const mock = createMock();
    const tabletData = mock.getTablet();
    const employee = tabletData.karyawan[0]!;

    // 1. Tambah barang yang tidak dimunculkan di rekap & opname
    mock.simpanBarang(pin, {
      id: '',
      nama: 'Sedotan Plastik',
      satuan: 'Pcs',
      kategori: 'Kemasan',
      kode: 'SDT',
      catatan: 'Tidak perlu di-opname closing',
      alur: 'LUAR',
      ambang_min: 10,
      aktif: true,
      stok_awal: 100,
      opname_rekap: false,
    });

    const items = mock.adminData(pin).barang;
    const sedotan = items.find((b) => b.nama === 'Sedotan Plastik');
    assert.ok(sedotan);
    assert.equal(sedotan.opname_rekap, false);
    // Stok barang tetap tercatat dan aktif
    assert.equal(sedotan.stok_dalam, 100);

    // 2. Karyawan mengambil barang tersebut ke dapur
    const stBefore = mock.getTablet().status.belumRekap;
    mock.ambil(employee.id, sedotan.id, 20);

    // 3. Verifikasi status: transaksi AMBIL barang non-rekap tidak menambah closing rekap tertunda
    const stAfter = mock.getTablet().status.belumRekap;
    assert.equal(stAfter, stBefore);
    // 4. Buka rekap draft: Sedotan TIDAK muncul di daftar rekap karyawan
    const draf = mock.rekapDraf();
    const drafSedotan = draf.baris.find((r) => r.barang_id === sedotan.id);
    assert.equal(drafSedotan, undefined);
  });

  it('mock backend: supports toggling opname_rekap on existing item', () => {
    const mock = createMock();
    const items = mock.adminData(pin).barang;
    const item = items[0]!;

    // Ubah menjadi opname_rekap = false
    mock.simpanBarang(pin, {
      ...item,
      opname_rekap: false,
    });

    let updated = mock.adminData(pin).barang.find((b) => b.id === item.id);
    assert.equal(updated?.opname_rekap, false);

    // Kembalikan menjadi opname_rekap = true
    mock.simpanBarang(pin, {
      ...item,
      opname_rekap: true,
    });

    updated = mock.adminData(pin).barang.find((b) => b.id === item.id);
    assert.equal(updated?.opname_rekap, true);
  });

  it('Google Apps Script engine: simpanBarang saves opname_rekap and hitungRekap_ excludes it', () => {
    const { context } = createAppsScriptEnvironment();
    const simpanBarang = runInContext('simpanBarang', context);
    const adminData = runInContext('adminData', context);
    const ambil = runInContext('ambil', context);
    const rekapDraf = runInContext('rekapDraf', context);

    // 1. Buat barang dengan opname_rekap = false
    simpanBarang(pin, {
      nama: 'Tissue Meja',
      satuan: 'Pack',
      kategori: 'Operational',
      alur: 'LUAR',
      ambang_min: 5,
      stok_awal: 20,
      kode: 'TSM',
      catatan: '',
      opname_rekap: false,
    });

    const barangList = adminData(pin).barang;
    const tissue = barangList.find((b: { nama: string }) => b.nama === 'Tissue Meja');
    assert.ok(tissue);
    assert.equal(tissue.opname_rekap, false);
    assert.equal(tissue.stok_dalam, 20);

    // 2. Ambil barang
    ambil('k1', tissue.id, 5);

    // 3. Rekap draft: Tissue tidak boleh muncul di baris rekap
    const draf = rekapDraf();
    const drafTissue = draf.baris.find((r: { barang_id: string }) => r.barang_id === tissue.id);
    assert.equal(drafTissue, undefined);
  });
});
