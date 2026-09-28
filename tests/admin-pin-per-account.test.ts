import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { runInContext } from 'node:vm';
import { createAppsScriptEnvironment } from './apps-script.test.ts';

describe('Per-Account Admin PIN Invariants & Public APIs', () => {
  it('getAdminAuthStatus returns email and punyaPin boolean for session', () => {
    const { context, properties } = createAppsScriptEnvironment();
    properties.SKIP_AUTH_SESSION = '0';
    properties.AUTH_WHITELIST = JSON.stringify([
      { email: 'owner@segara.com', role: 'admin', aktif: true, dibuat: Date.now() },
    ]);

    const buatSessionToken_ = runInContext('buatSessionToken_', context);
    const getAdminAuthStatus = runInContext('getAdminAuthStatus', context);

    const token = buatSessionToken_('owner@segara.com', 'admin').token;
    const status = getAdminAuthStatus(token);

    assert.equal(status.email, 'owner@segara.com');
    assert.equal(status.punyaPin, false);
  });

  it('setupAdminPin allows first-time PIN creation for accounts without PIN', () => {
    const { context, properties } = createAppsScriptEnvironment();
    properties.SKIP_AUTH_SESSION = '0';
    properties.AUTH_WHITELIST = JSON.stringify([
      { email: 'admin1@segara.com', role: 'admin', aktif: true, dibuat: Date.now() },
    ]);

    const buatSessionToken_ = runInContext('buatSessionToken_', context);
    const setupAdminPin = runInContext('setupAdminPin', context);
    const getAdminAuthStatus = runInContext('getAdminAuthStatus', context);

    const token = buatSessionToken_('admin1@segara.com', 'admin').token;

    // Reject non-numeric or invalid length
    assert.throws(() => setupAdminPin('123', token), /4–8 angka/);
    assert.throws(() => setupAdminPin('123456789', token), /4–8 angka/);
    assert.throws(() => setupAdminPin('abcd', token), /4–8 angka/);

    // Valid PIN sets up successfully
    assert.ok(setupAdminPin('4321', token));

    // Status now reflects punyaPin: true
    const status = getAdminAuthStatus(token);
    assert.equal(status.punyaPin, true);

    // Cannot call setupAdminPin again if already has PIN
    assert.throws(() => setupAdminPin('9999', token), /sudah memiliki PIN/);
  });

  it('authenticates against the specific admin account and isolates wrong PIN rate limiting', () => {
    const { context, properties, mockCache } = createAppsScriptEnvironment();
    properties.SKIP_AUTH_SESSION = '0';

    const hashPin_ = runInContext('hashPin_', context);
    const adminSalt_ = runInContext('adminSalt_', context);
    const saltA = 'salt_a';
    const saltB = 'salt_b';

    properties.AUTH_WHITELIST = JSON.stringify([
      { email: 'adminA@segara.com', role: 'admin', aktif: true, pinHash: hashPin_('1111', saltA), salt: saltA, dibuat: Date.now() },
      { email: 'adminB@segara.com', role: 'admin', aktif: true, pinHash: hashPin_('2222', saltB), salt: saltB, dibuat: Date.now() },
    ]);

    const buatSessionToken_ = runInContext('buatSessionToken_', context);
    const adminData = runInContext('adminData', context);

    const tokA = buatSessionToken_('adminA@segara.com', 'admin').token;
    const tokB = buatSessionToken_('adminB@segara.com', 'admin').token;

    // Admin A can authenticate with 1111, but not with Admin B's 2222
    assert.ok(adminData('1111', tokA));
    assert.throws(() => adminData('2222', tokA), /PIN salah/);

    // Admin B can authenticate with 2222, but not with Admin A's 1111
    assert.ok(adminData('2222', tokB));
    assert.throws(() => adminData('1111', tokB), /PIN salah/);

    // Trigger 5 failures on Admin A to test isolated rate limiting
    for (let i = 0; i < 4; i++) {
      assert.throws(() => adminData('wrong', tokA), /PIN salah/);
    }
    // 5th failure triggers rate limit lock
    assert.throws(() => adminData('wrong', tokA), /Terlalu banyak percobaan gagal/);

    // Admin A is locked
    assert.throws(() => adminData('1111', tokA), /Terlalu banyak percobaan gagal/);

    // Admin B is NOT locked and can still work normally
    assert.ok(adminData('2222', tokB));
  });

  it('gantiAdminPin requires correct old PIN and updates to new PIN', () => {
    const { context, properties } = createAppsScriptEnvironment();
    properties.SKIP_AUTH_SESSION = '0';

    const hashPin_ = runInContext('hashPin_', context);
    const salt = 'salt_test';
    properties.AUTH_WHITELIST = JSON.stringify([
      { email: 'admin@segara.com', role: 'admin', aktif: true, pinHash: hashPin_('1234', salt), salt, dibuat: Date.now() },
    ]);

    const buatSessionToken_ = runInContext('buatSessionToken_', context);
    const gantiAdminPin = runInContext('gantiAdminPin', context);
    const adminData = runInContext('adminData', context);

    const token = buatSessionToken_('admin@segara.com', 'admin').token;

    // Wrong old PIN is rejected
    assert.throws(() => gantiAdminPin('0000', '5678', token), /PIN lama salah/);

    // Invalid new PIN format is rejected
    assert.throws(() => gantiAdminPin('1234', '12', token), /4–8 angka/);

    // Valid change succeeds
    assert.ok(gantiAdminPin('1234', '5678', token));

    // Old PIN now fails
    assert.throws(() => adminData('1234', token), /PIN salah/);

    // New PIN succeeds
    assert.ok(adminData('5678', token));
  });

  it('resetAdminPinWithOtp verifies OTP and resets admin PIN', () => {
    const { context, properties, mockCache } = createAppsScriptEnvironment();
    properties.SKIP_AUTH_SESSION = '0';

    const hashPin_ = runInContext('hashPin_', context);
    const salt = 'salt_reset';
    properties.AUTH_WHITELIST = JSON.stringify([
      { email: 'admin@segara.com', role: 'admin', aktif: true, pinHash: hashPin_('1234', salt), salt, dibuat: Date.now() },
    ]);

    const requestOtp = runInContext('requestOtp', context);
    const resetAdminPinWithOtp = runInContext('resetAdminPinWithOtp', context);
    const buatSessionToken_ = runInContext('buatSessionToken_', context);
    const adminData = runInContext('adminData', context);

    // Request OTP (segara.com uses dummy 123456)
    requestOtp('admin@segara.com');

    // Wrong OTP fails
    assert.throws(
      () => resetAdminPinWithOtp('admin@segara.com', '999999', '9876'),
      /Kode verifikasi salah/,
    );

    // Correct OTP resets PIN
    assert.ok(resetAdminPinWithOtp('admin@segara.com', '123456', '9876'));

    // Authenticate with new PIN
    const token = buatSessionToken_('admin@segara.com', 'admin').token;
    assert.ok(adminData('9876', token));
  });

  it('batalAmbil on tablet accepts PIN from any active admin and records authorizer email', () => {
    const { context, properties, sheetsData } = createAppsScriptEnvironment();
    properties.SKIP_AUTH_SESSION = '0';

    const hashPin_ = runInContext('hashPin_', context);
    properties.AUTH_WHITELIST = JSON.stringify([
      { email: 'tablet@segara.com', role: 'tablet', aktif: true, dibuat: Date.now() },
      { email: 'spv@segara.com', role: 'admin', aktif: true, pinHash: hashPin_('8888', 's1'), salt: 's1', dibuat: Date.now() },
    ]);

    const buatSessionToken_ = runInContext('buatSessionToken_', context);
    const tabletToken = buatSessionToken_('tablet@segara.com', 'tablet').token;

    const append_ = runInContext('append_', context);
    const batalAmbil = runInContext('batalAmbil', context);

    // Insert an old AMBIL transaction (> 65 seconds ago)
    const oldTs = Date.now() - 70000;
    append_('Transaksi', {
      id: 'tx_old',
      ts: oldTs,
      waktu: '10:00:00',
      jenis: 'AMBIL',
      barang_id: 'b1',
      barang: 'Minyak goreng',
      jumlah: 2,
      karyawan_id: 'k1',
      karyawan: 'Budi',
      alur: 'LUAR',
      supplier: '',
      status: 'AKTIF',
      dicatat_oleh: 'Budi',
      catatan: '',
      kategori: 'Bahan',
      satuan: 'liter',
    });

    // Without valid admin PIN, fails due to > 60s limit
    assert.throws(
      () => batalAmbil('tx_old', '', tabletToken),
      /Batas 60 detik lewat\. Minta admin untuk membatalkan\./,
    );
    assert.throws(
      () => batalAmbil('tx_old', '1234', tabletToken),
      /PIN admin salah/,
    );
    // With spv's PIN (8888), succeeds and updates transaction
    assert.ok(batalAmbil('tx_old', '8888', tabletToken));

    // Verify transaction status changed to BATAL and dicatat_oleh records spv email
    const row = sheetsData.Transaksi.find((r) => r[0] === 'tx_old');
    assert.ok(row);
    assert.equal(row[11], 'BATAL');
    assert.equal(row[12], 'spv@segara.com');
  });

  it('getAuthAccounts returns punyaPin boolean and hides pinHash/salt', () => {
    const { context, properties } = createAppsScriptEnvironment();
    properties.SKIP_AUTH_SESSION = '0';

    const hashPin_ = runInContext('hashPin_', context);
    properties.AUTH_WHITELIST = JSON.stringify([
      { email: 'admin1@segara.com', role: 'admin', aktif: true, pinHash: hashPin_('1111', 's1'), salt: 's1', dibuat: 1000 },
      { email: 'admin2@segara.com', role: 'admin', aktif: true, dibuat: 2000 },
    ]);

    const buatSessionToken_ = runInContext('buatSessionToken_', context);
    const getAuthAccounts = runInContext('getAuthAccounts', context);

    const token = buatSessionToken_('admin1@segara.com', 'admin').token;
    const accounts = getAuthAccounts('1111', token);

    assert.equal(accounts.length, 2);
    const a1 = accounts.find((a: { email: string }) => a.email === 'admin1@segara.com') as { punyaPin?: boolean; pinHash?: string; salt?: string };
    const a2 = accounts.find((a: { email: string }) => a.email === 'admin2@segara.com') as { punyaPin?: boolean; pinHash?: string; salt?: string };

    assert.equal(a1.punyaPin, true);
    assert.equal(a1.pinHash, undefined);
    assert.equal(a1.salt, undefined);

    assert.equal(a2.punyaPin, false);
    assert.equal(a2.pinHash, undefined);
    assert.equal(a2.salt, undefined);
  });
});
