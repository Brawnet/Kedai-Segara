import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { runInContext } from 'node:vm';
import { createAppsScriptEnvironment } from './apps-script.test.ts';
import { createMock } from '../src/lib/mock.ts';
import { cocok, katOf } from '../src/lib/format.ts';
import type { Barang } from '../src/lib/types.ts';

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
});
