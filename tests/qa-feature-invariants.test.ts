import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { runInContext } from 'node:vm';
import { createAppsScriptEnvironment } from './apps-script.test.ts';
import { createMock } from '../src/lib/mock.ts';
import { cocok, katOf, menipis } from '../src/lib/format.ts';
import type { Barang, Rekap } from '../src/lib/types.ts';

interface Row extends Record<string, unknown> {
  id?: string;
  nama?: string;
  stok_dalam?: number;
  stok_luar?: number;
  status?: string;
  ts?: number;
  kategori?: string;
}

describe('QA Subsystem & Feature Invariants', () => {
  it('tokenFromArgs_ extracts token correctly in Apps Script Kode.gs', () => {
    const { context } = createAppsScriptEnvironment();
    const tokenFromArgs_ = runInContext('tokenFromArgs_', context);

    assert.equal(tokenFromArgs_(null), null);
    assert.equal(tokenFromArgs_([]), null);
    assert.equal(tokenFromArgs_(['12345']), null);
    assert.equal(tokenFromArgs_(['12345', 'mock_tok_admin_test@segara.com_123']), 'mock_tok_admin_test@segara.com_123');
    assert.equal(tokenFromArgs_(['payload.signature']), 'payload.signature');
    assert.equal(tokenFromArgs_(['arg1', 'arg2', 'payload.signature']), 'payload.signature');
  });

  it('getAdminAuthStatus runs without arguments when SKIP_AUTH_SESSION is active', () => {
    const { context } = createAppsScriptEnvironment();
    const getAdminAuthStatus = runInContext('getAdminAuthStatus', context);

    const status = getAdminAuthStatus();
    assert.ok(status);
    assert.equal(status.email, 'test@segara.com');
    assert.equal(typeof status.punyaPin, 'boolean');
  });

  it('gantiAdminPin enforces isolated rate-limiting on repeated wrong old PIN', () => {
    const { context, properties } = createAppsScriptEnvironment();
    properties.SKIP_AUTH_SESSION = '0';
    properties.AUTH_WHITELIST = JSON.stringify([
      { email: 'admin@segara.com', role: 'admin', aktif: true, dibuat: Date.now() },
    ]);

    const buatSessionToken_ = runInContext('buatSessionToken_', context);
    const setupAdminPin = runInContext('setupAdminPin', context);
    const gantiAdminPin = runInContext('gantiAdminPin', context);

    const token = buatSessionToken_('admin@segara.com', 'admin').token;
    assert.ok(setupAdminPin('12345', token));

    // 4 failed attempts throw 'PIN lama salah'
    for (let i = 0; i < 4; i++) {
      assert.throws(() => gantiAdminPin('99999', '54321', token), /PIN lama salah/);
    }

    // 5th failed attempt triggers rate limit lockout
    assert.throws(() => gantiAdminPin('99999', '54321', token), /PIN lama salah/);

    // 6th attempt is blocked by rate-limit guard
    assert.throws(
      () => gantiAdminPin('12345', '54321', token),
      /Terlalu banyak percobaan gagal/,
    );
  });

  it('mock backend gantiAdminPin enforces rate-limiting on repeated wrong old PIN', () => {
    const api = createMock();
    api.requestOtp('admin@segara.com');
    const session = api.verifyOtp('admin@segara.com', '123456');

    // admin@segara.com already has default PIN '12345'

    // 4 failed attempts
    for (let i = 0; i < 4; i++) {
      assert.throws(() => api.gantiAdminPin('99999', '54321', session.token), /PIN lama salah/);
    }
    // 5th attempt locks out
    assert.throws(() => api.gantiAdminPin('99999', '54321', session.token), /PIN lama salah/);

    // Locked out
    assert.throws(
      () => api.gantiAdminPin('12345', '54321', session.token),
      /Terlalu banyak percobaan gagal/,
    );
  });

  it('mock backend resetAdminPinWithOtp enforces rate-limiting on repeated wrong OTP code', () => {
    const api = createMock();
    api.requestOtp('admin@segara.com');

    // 4 failed OTP attempts
    for (let i = 0; i < 4; i++) {
      assert.throws(
        () => api.resetAdminPinWithOtp('admin@segara.com', '000000', '12345'),
        /Kode verifikasi salah/,
      );
    }
    assert.throws(
      () => api.resetAdminPinWithOtp('admin@segara.com', '000000', '12345'),
      /Kode verifikasi salah/,
    );

    // Locked out
    assert.throws(
      () => api.resetAdminPinWithOtp('admin@segara.com', '123456', '12345'),
      /Terlalu banyak percobaan gagal/,
    );
  });

  it('Opname category filtering correctly includes uncategorized items under "Lainnya"', () => {
    const items: Barang[] = [
      {
        id: '1',
        nama: 'Kecap Asin',
        satuan: 'btl',
        kategori: '', // No category -> should be 'Lainnya'
        stok_dalam: 5,
        stok_luar: 2,
        ambang_min: 1,
        alur: 'LUAR',
        aktif: true,
      },
      {
        id: '2',
        nama: 'Ayam Suwir',
        satuan: 'porsi',
        kategori: 'Freezer Protein',
        stok_dalam: 10,
        stok_luar: 0,
        ambang_min: 5,
        alur: 'LUAR',
        aktif: true,
      },
    ];

    const katFilter = 'Lainnya';
    const filtered = items.filter((b) => katFilter === 'semua' || katOf(b) === katFilter);

    assert.equal(filtered.length, 1);
    assert.equal(filtered[0]!.nama, 'Kecap Asin');
    assert.equal(katOf(filtered[0]!), 'Lainnya');
  });

  it('stokMasuk handles variable argument positions with idempotency and token in mock', () => {
    const api = createMock();
    api.requestOtp('admin@segara.com');
    const session = api.verifyOtp('admin@segara.com', '123456');

    const tab = api.getTablet();
    const bid = tab.barang[0]!.id;

    // Called with clientTxId and token
    const res1 = api.stokMasuk('12345', bid, 5, 'Supplier A', 'Catatan 1', 'tx-test-1', session.token);
    assert.equal(res1, true);

    // Repeated call with same clientTxId returns idempotent result
    const res2 = api.stokMasuk('12345', bid, 5, 'Supplier A', 'Catatan 1', 'tx-test-1', session.token);
    assert.equal(res2, true);

    // Called without clientTxId where token is received directly
    const res3 = api.stokMasuk('12345', bid, 2, 'Supplier B', 'Catatan 2', session.token);
    assert.equal(res3, true);
  });

  it('tablet batalAmbil allows undo within 60s without admin PIN and requires admin PIN after 60s', () => {
    const { context } = createAppsScriptEnvironment();
    const ambil = runInContext('ambil', context);
    const batalAmbil = runInContext('batalAmbil', context);
    const rows_ = runInContext('rows_', context);
    const update_ = runInContext('update_', context);

    const b1 = rows_('Barang').find((b: Row) => b.id === 'b1')!;
    const awalDalam = Number(b1.stok_dalam);
    const awalLuar = Number(b1.stok_luar);

    // 1. Ambil 2 unit
    const ambilRes = ambil('k1', 'b1', 2, 'tx-undo-test');
    assert.ok(ambilRes.tx.id);

    const b1After = rows_('Barang').find((b: Row) => b.id === 'b1')!;
    assert.equal(b1After.stok_dalam, awalDalam - 2);
    assert.equal(b1After.stok_luar, awalLuar + 2);

    // 2. Immediate batalAmbil (within 60s) succeeds without PIN
    const batalRes = batalAmbil(ambilRes.tx.id, '');
    assert.equal(batalRes, true);

    const b1Restored = rows_('Barang').find((b: Row) => b.id === 'b1')!;
    assert.equal(b1Restored.stok_dalam, awalDalam);
    assert.equal(b1Restored.stok_luar, awalLuar);

    // 3. Ambil again, simulate over 60 seconds
    const ambilRes2 = ambil('k1', 'b1', 3, 'tx-undo-test-2');
    const txRow = rows_('Transaksi').find((t: Row) => t.id === ambilRes2.tx.id)!;
    txRow.ts = Date.now() - 70000; // 70s ago
    update_('Transaksi', txRow);

    // Attempting cancel without PIN fails
    assert.throws(
      () => batalAmbil(ambilRes2.tx.id, ''),
      /Batas 60 detik lewat\. Minta admin untuk membatalkan\./,
    );

    // Attempting cancel with wrong PIN fails
    assert.throws(
      () => batalAmbil(ambilRes2.tx.id, 'wrongpin'),
      /PIN admin salah/,
    );

    // Canceling with valid admin PIN succeeds
    assert.equal(batalAmbil(ambilRes2.tx.id, '12345'), true);

    const txCancelled = rows_('Transaksi').find((t: Row) => t.id === ambilRes2.tx.id)!;
    assert.equal(txCancelled.status, 'BATAL');
  });

  it('hapusKategori reassigns active items to empty category without deleting audit logs', () => {
    const { context } = createAppsScriptEnvironment();
    const simpanBarang = runInContext('simpanBarang', context);
    const tambahKategori = runInContext('tambahKategori', context);
    const hapusKategori = runInContext('hapusKategori', context);
    const rows_ = runInContext('rows_', context);

    // Tambah kategori 'Minuman Dingin'
    assert.ok(tambahKategori('12345', 'Minuman Dingin'));

    // Tambah barang di kategori tersebut
    assert.ok(
      simpanBarang('12345', {
        nama: 'Es Teh Manis',
        satuan: 'Gelas',
        kategori: 'Minuman Dingin',
        stok_awal: 10,
        ambang_min: 2,
        alur: 'LUAR',
        aktif: true,
      }),
    );

    const b = rows_('Barang').find((x: Row) => x.nama === 'Es Teh Manis')!;
    assert.equal(b.kategori, 'Minuman Dingin');

    const txCountBefore = rows_('Transaksi').length;

    // Hapus kategori 'Minuman Dingin'
    const resHapus = hapusKategori('12345', 'Minuman Dingin');
    assert.equal(resHapus.status, 'deleted');
    assert.equal(resHapus.jumlahBarang, 1);

    // Barang is preserved and re-assigned to empty category (categorized as Lainnya)
    const bAfter = rows_('Barang').find((x: Row) => x.nama === 'Es Teh Manis')!;
    assert.ok(bAfter);
    assert.equal(bAfter.kategori, '');

    // Transaksi sheet is completely untouched
    const txCountAfter = rows_('Transaksi').length;
    assert.equal(txCountAfter, txCountBefore);
  });

  it('hapusBarang enforces stock zeroing and transaction audit safety', () => {
    const { context } = createAppsScriptEnvironment();
    const hapusBarang = runInContext('hapusBarang', context);
    const rows_ = runInContext('rows_', context);

    // b1 has stock_dalam: 20 -> cannot be deleted/archived
    assert.throws(
      () => hapusBarang('12345', 'b1'),
      /Barang masih memiliki stok/,
    );

    // Create a new item with 0 initial stock and no transactions
    const simpanBarang = runInContext('simpanBarang', context);
    simpanBarang('12345', {
      nama: 'Barang Uji Hapus Permanen',
      satuan: 'Pcs',
      kategori: 'Uji',
      stok_awal: 0,
      ambang_min: 0,
      alur: 'LUAR',
      aktif: true,
    });

    const bNew = rows_('Barang').find((x: Row) => x.nama === 'Barang Uji Hapus Permanen')!;
    assert.ok(bNew);

    // Deleting item without transaction history deletes it permanently
    const delRes = hapusBarang('12345', String(bNew.id));
    assert.equal(delRes.status, 'deleted');
    assert.ok(!rows_('Barang').some((x: Row) => x.id === bNew.id));
  });
  it('Lane 8: menipis in Dashboard only triggers for active items with ambang_min > 0', () => {
    const sampleActive: Barang = {
      id: 'b1',
      nama: 'Kopi Susu',
      satuan: 'Cup',
      kategori: 'Drink',
      alur: 'LUAR',
      kode: 'KS',
      catatan: '',
      stok_dalam: 2,
      stok_luar: 1,
      ambang_min: 5,
      aktif: true,
    };
    // 3 < 5 -> true
    assert.equal(menipis(sampleActive), true);

    // When stock is sufficient: 6 >= 5 -> false
    assert.equal(menipis({ ...sampleActive, stok_dalam: 5 }), false);

    // When archived: should never be menipis
    assert.equal(menipis({ ...sampleActive, aktif: false }), false);

    // When ambang_min <= 0: should never be menipis even if stock is 0
    assert.equal(menipis({ ...sampleActive, stok_dalam: 0, stok_luar: 0, ambang_min: 0 }), false);
  });

  it('Lane 1: simpanBarang enforces case-insensitive item code uniqueness', () => {
    const { context } = createAppsScriptEnvironment();
    const simpanBarang = runInContext('simpanBarang', context);

    // In initial sheetsData, b1 has code 'MG'
    // Attempting to register another item with 'mg' (lowercase) must fail
    assert.throws(
      () =>
        simpanBarang('12345', {
          nama: 'Minyak Goreng Baru',
          satuan: 'liter',
          kategori: 'Bahan',
          stok_awal: 0,
          ambang_min: 0,
          alur: 'LUAR',
          aktif: true,
          kode: 'mg',
        }),
      /Kode mg sudah dipakai barang lain/,
    );

    // Also test mock backend
    const api = createMock();
    // Default mock has AS ('Ayam Suwir')
    assert.throws(
      () =>
        api.simpanBarang(
          '12345',
          {
            nama: 'Ayam Suwir KW',
            satuan: 'Porsi',
            kategori: 'Freezer Protein',
            alur: 'LUAR',
            kode: 'as',
            catatan: '',
            ambang_min: 0,
            aktif: true,
            stok_awal: 0,
          },
        ),
      /Kode as sudah dipakai barang lain/,
    );
  });

  it('Lane 5: hitungRekap_ excludes inactive/archived items from closing rekap', () => {
    const { context } = createAppsScriptEnvironment();
    const hitungRekap_ = runInContext('hitungRekap_', context);
    const rows_ = runInContext('rows_', context);
    const update_ = runInContext('update_', context);

    // b1 is active and has stock_luar: 0
    const b1 = rows_('Barang').find((x: Row) => x.id === 'b1')!;
    b1.stok_luar = 10;
    b1.aktif = false; // archive b1
    update_('Barang', b1);

    const rows = hitungRekap_(Date.now());
    // Archived item b1 must NOT appear in closing rekap rows
    assert.ok(!rows.some((r: { barang_id: string }) => r.barang_id === 'b1'));

    // Test mock backend hitung
    const api = createMock();
    const draf = api.rekapDraf();
    // In mock, b2 is archived or any inactive item must not appear
    const adminData = api.adminData('12345');
    const inactiveIds = new Set(adminData.barang.filter((b) => !b.aktif).map((b) => b.id));
    for (const r of draf.baris) {
      assert.ok(!inactiveIds.has(r.barang_id), `Barang tidak aktif ${r.barang_id} tidak boleh masuk rekap`);
    }
  });

  it('Lane 9: laporan enforces YYYY-MM-DD date validation and chronological ordering', () => {
    const { context } = createAppsScriptEnvironment();
    const laporan = runInContext('laporan', context);

    // Invalid format throws
    assert.throws(() => laporan('12345', 'invalid-date', '2026-09-30'), /Format tanggal laporan tidak valid/);
    assert.throws(() => laporan('12345', '2026-09-01', ''), /Format tanggal laporan tidak valid/);

    // dari > sampai throws
    assert.throws(() => laporan('12345', '2026-09-30', '2026-09-01'), /Tanggal awal tidak boleh melebihi tanggal akhir/);

    // Valid date range succeeds
    const res = laporan('12345', '2026-09-01', '2026-09-30');
    assert.ok(Array.isArray(res));

    // Also test mock backend
    const api = createMock();
    assert.throws(() => api.laporan('12345', 'bad', '2026-09-30'), /Format tanggal laporan tidak valid/);
    assert.throws(() => api.laporan('12345', '2026-09-30', '2026-09-01'), /Tanggal awal tidak boleh melebihi tanggal akhir/);
    const mockRes = api.laporan('12345', '2026-09-01', '2026-09-30');
    assert.ok(Array.isArray(mockRes));
  });

  it('Lane 10: Riwayat Rekap date filter filters records accurately by timestamp and formatted date', () => {
    const sampleRekap: Rekap[] = [
      {
        id: 'r1',
        ts: new Date('2026-09-28T21:35:00').getTime(),
        waktu: '28/09/2026 21:35',
        karyawan_id: 'k1',
        karyawan: 'SAYA',
        diedit_admin: false,
        baris: [{ rekap_id: 'r1', barang_id: 'b1', barang: 'Sedotan', saldo_awal: 0, diambil: 10, sisa: 0, terpakai: 10, catatan: '' }],
      },
      {
        id: 'r2',
        ts: new Date('2026-09-25T21:00:00').getTime(),
        waktu: '25/09/2026 21:00',
        karyawan_id: 'k2',
        karyawan: 'Budi',
        diedit_admin: false,
        baris: [],
      },
      {
        id: 'r3',
        ts: new Date('2026-09-20T21:00:00').getTime(),
        waktu: '20/09/2026 21:00',
        karyawan_id: 'k3',
        karyawan: 'Andi',
        diedit_admin: true,
        baris: [],
      },
    ];

    const rekapTgl = (x: Rekap) => {
      if (x.ts && !isNaN(x.ts)) {
        const dt = new Date(x.ts);
        const pad = (n: number) => String(n).padStart(2, '0');
        return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
      }
      const m = x.waktu ? x.waktu.match(/^(\d{2})\/(\d{2})\/(\d{4})/) : null;
      return m ? `${m[3]}-${m[2]}-${m[1]}` : '';
    };

    const filter = (dari: string, sampai: string) =>
      sampleRekap.filter((x) => {
        const tgl = rekapTgl(x);
        if (!tgl) return true;
        if (dari && tgl < dari) return false;
        if (sampai && tgl > sampai) return false;
        return true;
      });

    // No filter: returns all 3
    assert.equal(filter('', '').length, 3);

    // Exactly 28/09/2026
    const only28 = filter('2026-09-28', '2026-09-28');
    assert.equal(only28.length, 1);
    assert.equal(only28[0]!.id, 'r1');

    // Range 2026-09-24 to 2026-09-28: returns r1 and r2
    const range24to28 = filter('2026-09-24', '2026-09-28');
    assert.equal(range24to28.length, 2);
    assert.deepEqual(range24to28.map((r) => r.id), ['r1', 'r2']);

    // Start date only: >= 2026-09-25
    const from25 = filter('2026-09-25', '');
    assert.equal(from25.length, 2);

    // End date only: <= 2026-09-21
    const until21 = filter('', '2026-09-21');
    assert.equal(until21.length, 1);
    assert.equal(until21[0]!.id, 'r3');

    // Date with no records: 2026-09-22
    assert.equal(filter('2026-09-22', '2026-09-22').length, 0);
  });
});
