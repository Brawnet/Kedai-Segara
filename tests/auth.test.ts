import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createMock } from '../src/lib/mock.ts';

describe('Google & iCloud Authentication & Audit Log System', () => {
  const pin = '12345';

  it('rejects OTP request for non-whitelisted email and logs failure', () => {
    const api = createMock();
    const badEmail = 'stranger@gmail.com';

    assert.throws(
      () => api.requestOtp(badEmail),
      /Email tidak terdaftar atau akses telah dinonaktifkan/,
    );

    const logs = api.getLoginHistory(pin);
    assert.ok(logs.length > 0);
    assert.equal(logs[0]!.email, badEmail);
    assert.equal(logs[0]!.metode, 'OTP');
    assert.equal(logs[0]!.status, 'GAGAL - BUKAN WHITELIST');
  });

  it('generates OTP for whitelisted email and verifies successfully', () => {
    const api = createMock();
    const adminEmail = 'admin@segara.com';

    const reqRes = api.requestOtp(adminEmail);
    assert.ok(reqRes.success);
    assert.match(reqRes.message, /123456/);

    // Salah kode OTP
    assert.throws(
      () => api.verifyOtp(adminEmail, '999999'),
      /Kode verifikasi salah/,
    );

    const logsAfterFail = api.getLoginHistory(pin);
    assert.equal(logsAfterFail[0]!.status, 'GAGAL - OTP SALAH');

    // Kode benar
    const sess = api.verifyOtp(adminEmail, '123456', 'Mozilla/5.0');
    assert.equal(sess.email, adminEmail);
    assert.equal(sess.role, 'admin');
    assert.ok(sess.token);
    assert.ok(sess.exp > Date.now());

    const logsAfterOk = api.getLoginHistory(pin);
    assert.equal(logsAfterOk[0]!.status, 'BERHASIL');
    assert.equal(logsAfterOk[0]!.role, 'admin');

    // Token validasi
    const check = api.verifySessionToken(sess.token);
    assert.equal(check.valid, true);
    assert.equal(check.email, adminEmail);
    assert.equal(check.role, 'admin');
  });

  it('supports tablet role with 30-day session expiry', () => {
    const api = createMock();
    const tabletEmail = 'tablet@segara.com';

    api.requestOtp(tabletEmail);
    const sess = api.verifyOtp(tabletEmail, '123456');
    assert.equal(sess.role, 'tablet');

    // Sesi 30 hari (~2.592.000.000 ms)
    const thirtyDays = 30 * 86400000;
    assert.ok(sess.exp - Date.now() >= thirtyDays - 5000);
  });

  it('supports direct dummy login for admin and tablet without requiring requestOtp step', () => {
    const api = createMock();

    // Direct Admin Dummy Login
    const adminSess = api.verifyOtp('admin@segara.com', '123456', 'Test-Agent');
    assert.equal(adminSess.email, 'admin@segara.com');
    assert.equal(adminSess.role, 'admin');
    assert.ok(adminSess.token);

    const checkAdmin = api.verifySessionToken(adminSess.token);
    assert.equal(checkAdmin.valid, true);
    assert.equal(checkAdmin.role, 'admin');

    // Direct Tablet Dummy Login
    const tabletSess = api.verifyOtp('tablet@segara.com', '123456', 'Test-Agent');
    assert.equal(tabletSess.email, 'tablet@segara.com');
    assert.equal(tabletSess.role, 'tablet');
    assert.ok(tabletSess.token);

    const checkTablet = api.verifySessionToken(tabletSess.token);
    assert.equal(checkTablet.valid, true);
    assert.equal(checkTablet.role, 'tablet');

    // Direct Dummy Login with wrong code must be rejected
    assert.throws(
      () => api.verifyOtp('admin@segara.com', '000000', 'Test-Agent'),
      /Kode verifikasi salah/,
    );
  });

  it('rejects Google login for non-whitelisted email and accepts whitelisted', () => {
    const api = createMock();

    assert.throws(
      () => api.verifyGoogleCredential('unknown@gmail.com'),
      /belum terdaftar di whitelist/,
    );

    const logsFail = api.getLoginHistory(pin);
    assert.equal(logsFail[0]!.metode, 'GOOGLE');
    assert.equal(logsFail[0]!.status, 'GAGAL - BUKAN WHITELIST');

    const okSess = api.verifyGoogleCredential('admin@segara.com');
    assert.equal(okSess.email, 'admin@segara.com');
    assert.equal(okSess.role, 'admin');

    const logsOk = api.getLoginHistory(pin);
    assert.equal(logsOk[0]!.status, 'BERHASIL');
  });

  it('immediately invalidates session token when account is deactivated or revoked in whitelist', () => {
    const api = createMock();
    const email = 'tablet@segara.com';

    api.requestOtp(email);
    const sess = api.verifyOtp(email, '123456');
    assert.equal(api.verifySessionToken(sess.token).valid, true);

    // Nonaktifkan akun di whitelist
    api.simpanAuthAccount(pin, email, 'tablet', false);
    const checkInactive = api.verifySessionToken(sess.token);
    assert.equal(checkInactive.valid, false);
    assert.match(checkInactive.error || '', /dicabut atau dinonaktifkan/);

    // Aktifkan kembali
    api.simpanAuthAccount(pin, email, 'tablet', true);
    const checkActive = api.verifySessionToken(sess.token);
    assert.equal(checkActive.valid, true);

    // Hapus akun dari whitelist
    api.hapusAuthAccount(pin, email);
    const checkDeleted = api.verifySessionToken(sess.token);
    assert.equal(checkDeleted.valid, false);
  });

  it('prevents deleting the last remaining active admin account', () => {
    const api = createMock();
    const accounts = api.getAuthAccounts(pin);
    const admins = accounts.filter((a) => a.role === 'admin' && a.aktif);
    assert.equal(admins.length, 1);

    assert.throws(
      () => api.hapusAuthAccount(pin, admins[0]!.email),
      /Tidak dapat menghapus admin aktif terakhir/,
    );
  });

  it('prevents deactivating or demoting the last remaining active admin account via simpanAuthAccount', () => {
    const api = createMock();
    const accounts = api.getAuthAccounts(pin);
    const admin = accounts.find((a) => a.role === 'admin' && a.aktif)!;

    assert.throws(
      () => api.simpanAuthAccount(pin, admin.email, 'admin', false),
      /Tidak dapat menonaktifkan atau mengubah role admin aktif terakhir/,
    );

    assert.throws(
      () => api.simpanAuthAccount(pin, admin.email, 'tablet', true),
      /Tidak dapat menonaktifkan atau mengubah role admin aktif terakhir/,
    );
  });

  it('manages Google OAuth Client ID via admin settings', () => {
    const api = createMock();
    assert.equal(api.getPublicAuthConfig().hasGoogleAuth, false);

    api.simpanGoogleClientId(pin, '123456.apps.googleusercontent.com');
    const conf = api.getPublicAuthConfig();
    assert.equal(conf.hasGoogleAuth, true);
    assert.equal(conf.googleClientId, '123456.apps.googleusercontent.com');
  });

  it('enforces admin PIN requirement on sensitive admin operations', () => {
    const api = createMock();

    // Admin data requires correct PIN every time
    assert.throws(() => api.adminData(''), /PIN salah/);
    assert.throws(() => api.adminData('wrong'), /PIN salah/);
    const data = api.adminData(pin);
    assert.ok(data);
    assert.ok(Array.isArray(data.barang));

    // Pengaturan and whitelist account management also require PIN
    assert.throws(() => api.getAuthAccounts(''), /PIN salah/);
    assert.throws(() => api.simpanPengaturan('', '22:00', ''), /PIN salah/);
  });

  it('handles per-account PIN lifecycle: check status, setup, change, and OTP reset', () => {
    const api = createMock();

    // Add new admin account without PIN
    api.simpanAuthAccount(pin, 'newadmin@segara.com', 'admin', true);
    const accounts = api.getAuthAccounts(pin);
    const newAcc = accounts.find((a) => a.email === 'newadmin@segara.com');
    assert.ok(newAcc);
    assert.equal(newAcc.punyaPin, false);

    // Login as newadmin
    api.requestOtp('newadmin@segara.com');
    const sess = api.verifyOtp('newadmin@segara.com', '123456');

    // Check status -> punyaPin: false
    const status = api.getAdminAuthStatus(sess.token);
    assert.equal(status.email, 'newadmin@segara.com');
    assert.equal(status.punyaPin, false);

    // Setup PIN
    assert.throws(() => api.setupAdminPin('12', sess.token), /4–8 angka/);
    assert.ok(api.setupAdminPin('654321', sess.token));
    assert.equal(api.getAdminAuthStatus(sess.token).punyaPin, true);

    // Cannot setup again
    assert.throws(() => api.setupAdminPin('111111', sess.token), /sudah memiliki PIN/);

    // Change PIN
    assert.throws(() => api.gantiAdminPin('000000', '999999', sess.token), /PIN lama salah/);
    assert.ok(api.gantiAdminPin('654321', '999999', sess.token));

    // Reset PIN with OTP
    api.requestOtp('newadmin@segara.com');
    assert.throws(() => api.resetAdminPinWithOtp('newadmin@segara.com', '000000', '777777', sess.token), /Kode verifikasi salah/);
    assert.ok(api.resetAdminPinWithOtp('newadmin@segara.com', '123456', '777777', sess.token));
  });

  it('saves and updates custom nama in auth account and falls back to capitalized first name', () => {
    const api = createMock();

    // 1. Simpan akun dengan nama khusus
    api.simpanAuthAccount(pin, 'budi.santoso@segara.com', 'admin', true, 'Budi');
    const accs1 = api.getAuthAccounts(pin);
    const acc1 = accs1.find((a) => a.email === 'budi.santoso@segara.com');
    assert.ok(acc1);
    assert.equal(acc1.nama, 'Budi');

    // 2. Update nama akun yang ada
    // 2. Update nama akun yang ada (termasuk nama dengan titik seperti Dr. Budi S.)
    api.simpanAuthAccount(pin, 'budi.santoso@segara.com', 'admin', true, 'Dr. Budi S.');
    const accs2 = api.getAuthAccounts(pin);
    const acc2 = accs2.find((a) => a.email === 'budi.santoso@segara.com');
    assert.equal(acc2?.nama, 'Dr. Budi S.');

    // 3. Login as budi dan rekam stokMasuk -> transaksi mencatat nama admin
    api.requestOtp('budi.santoso@segara.com');
    const sess1 = api.verifyOtp('budi.santoso@segara.com', '123456');
    const item = api.adminData(pin).barang[0]!;
    api.stokMasuk(pin, item.id, 10, 'Supplier A', 'Batch stok baru', 'tx-stok-budi', sess1.token);

    const txStok = api.adminData(pin).transaksi.find((t) => t.id && t.jenis === 'MASUK')!;
    assert.equal(txStok.karyawan, 'Dr. Budi S.');
    assert.equal(txStok.dicatat_oleh, 'budi.santoso@segara.com');

    // 4. Akun tanpa nama khusus -> otomatis fallback nama depan email berhuruf kapital
    api.simpanAuthAccount(pin, 'siti.aminah@segara.com', 'admin', true, '');
    api.requestOtp('siti.aminah@segara.com');
    const sess2 = api.verifyOtp('siti.aminah@segara.com', '123456');
    api.stokMasuk(pin, item.id, 5, 'Supplier B', '', 'tx-stok-siti', sess2.token);

    const txStokSiti = api.adminData(pin).transaksi.find((t) => t.dicatat_oleh === 'siti.aminah@segara.com')!;
    assert.equal(txStokSiti.karyawan, 'Siti');
    assert.equal(txStokSiti.dicatat_oleh, 'siti.aminah@segara.com');
  });
});
