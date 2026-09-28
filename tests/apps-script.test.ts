import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { createHash, createHmac } from 'node:crypto';

type Cell = string | number | boolean | Date | null | undefined;

/**
 * Meniru cara Google Sheets menyimpan nilai dari appendRow/setValues (seperti diketik user):
 * "'teks" → teks biasa, angka → Number (nol di depan hilang), TRUE/FALSE → boolean,
 * "21:00" → nilai waktu (Date 30/12/1899), "=..." → rumus.
 */
function toCell(v: Cell): Cell {
  if (typeof v !== 'string') return v;
  if (v.startsWith("'")) return v.slice(1);
  if (v.startsWith('=')) return 'FORMULA:' + v;
  if (/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(v.trim())) return Number(v);
  if (/^(true|false)$/i.test(v)) return v.toUpperCase() === 'TRUE';
  const t = /^(\d{1,2}):(\d{2})$/.exec(v);
  if (t) return new Date(1899, 11, 30, Number(t[1]), Number(t[2]));
  return v;
}
const pad2 = (n: number) => String(n).padStart(2, '0');
function display(v: Cell): string {
  if (v instanceof Date) return `${pad2(v.getHours())}.${pad2(v.getMinutes())}.00`; // format waktu locale id_ID
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  return v === null || v === undefined ? '' : String(v);
}
const cloneCell = (v: Cell): Cell => (v instanceof Date ? new Date(v.getTime()) : v);

export function createAppsScriptEnvironment(opts: { uuid?: () => string } = {}) {
  const properties: Record<string, string> = {
    SS_ID: 'test-ss-id',
    ADMIN_PIN: '12345',
    SKEMA: '5',
    SKIP_AUTH_SESSION: '1',
  };
  const sheetsData: Record<string, Cell[][]> = {
    Barang: [
      ['id', 'nama', 'satuan', 'kategori', 'stok_dalam', 'stok_luar', 'ambang_min', 'alur', 'aktif', 'kode', 'catatan', 'opname_rekap'],
      ['b1', 'Minyak goreng', 'liter', 'Bahan', 20, 0, 5, 'LUAR', true, 'MG', '', true],
      ['b2', 'Plastik Sampah S', 'Lbr', 'Cleaning', 10, 0, 2, 'LANGSUNG_HABIS', true, 'PS', '', true],
    ],
    Karyawan: [
      ['id', 'nama', 'aktif', 'pin'],
      ['k1', 'Budi', true, 1234], // Sheets menyimpan PIN "1234" sebagai angka
      ['k2', 'Sari', false, ''],
    ],
    Transaksi: [
      ['id', 'ts', 'waktu', 'jenis', 'barang_id', 'barang', 'jumlah', 'karyawan_id', 'karyawan', 'alur', 'supplier', 'status', 'dicatat_oleh', 'catatan', 'kategori', 'satuan'],
    ],
    Rekap: [
      ['id', 'ts', 'waktu', 'karyawan_id', 'karyawan', 'diedit_admin'],
    ],
    RekapBaris: [
      ['rekap_id', 'barang_id', 'barang', 'saldo_awal', 'diambil', 'sisa', 'terpakai', 'catatan'],
    ],
    Opname: [
      ['id', 'ts', 'waktu', 'barang_id', 'barang', 'sistem', 'fisik', 'selisih'],
    ],
    Pengaturan: [
      ['kunci', 'nilai'],
      ['jam_tutup', toCell('21:00')], // setup() lama menulis "21:00" → Sheets mengubahnya jadi nilai waktu
    ],
    Log_Login: [
      ['id', 'ts', 'waktu', 'email', 'metode', 'role', 'status', 'user_agent'],
    ],
  };
  let lockAcquired = false;

  const mockLock = {
    waitLock: (_ms: number) => {
      lockAcquired = true;
    },
    releaseLock: () => {
      lockAcquired = false;
    },
  };

  const createSheetMock = (sheetName: string) => ({
    getDataRange: () => ({
      getValues: () => (sheetsData[sheetName] || []).map((r) => r.map(cloneCell)),
      getDisplayValues: () => (sheetsData[sheetName] || []).map((r) => r.map(display)),
    }),
    appendRow: (row: Cell[]) => {
      if (!sheetsData[sheetName]) sheetsData[sheetName] = [];
      sheetsData[sheetName].push(row.map(toCell));
    },
    getRange: (row: number, col: number, numRows: number = 1, numCols: number = 1) => ({
      getValues: () => {
        const sheet = sheetsData[sheetName] || [];
        const res: Cell[][] = [];
        for (let r = 0; r < numRows; r++) {
          const rowData = sheet[row - 1 + r] || [];
          const rowCells: Cell[] = [];
          for (let c = 0; c < numCols; c++) {
            rowCells.push(cloneCell(rowData[col - 1 + c] ?? ''));
          }
          res.push(rowCells);
        }
        return res;
      },
      setValue: (val: Cell) => {
        if (!sheetsData[sheetName]) sheetsData[sheetName] = [];
        if (!sheetsData[sheetName][row - 1]) sheetsData[sheetName][row - 1] = [];
        sheetsData[sheetName][row - 1][col - 1] = toCell(val);
        return { setFontWeight: () => {} };
      },
      setValues: (values: Cell[][]) => {
        const sheet = sheetsData[sheetName];
        for (let r = 0; r < numRows; r++) {
          const targetRow = row - 1 + r;
          if (!sheet[targetRow]) sheet[targetRow] = [];
          for (let c = 0; c < numCols; c++) {
            sheet[targetRow][col - 1 + c] = toCell(values[r][c]);
          }
        }
      },
      setFontWeight: () => {},
    }),
    getMaxColumns: () => 20,
    getMaxRows: () => 100,
    getLastRow: () => (sheetsData[sheetName] || []).length,
    getLastColumn: () => ((sheetsData[sheetName] || [])[0] || []).length,
    insertColumnsAfter: () => {},
    insertRowsAfter: () => {},
    setFrozenRows: () => {},
    deleteRow: (row: number) => {
      const sheet = sheetsData[sheetName];
      if (sheet && row >= 1 && row <= sheet.length) {
        sheet.splice(row - 1, 1);
      }
    },
    clear: () => {
      sheetsData[sheetName] = [];
    },
    getSheetId: () => 7,
  });

  const mockSS = {
    getId: () => 'test-ss-id',
    getUrl: () => 'https://docs.google.com/spreadsheets/d/test-ss-id/edit',
    getSpreadsheetTimeZone: () => 'Asia/Jakarta',
    getSheetByName: (name: string) => (sheetsData[name] ? createSheetMock(name) : null),
    insertSheet: (name: string) => {
      if (!sheetsData[name]) sheetsData[name] = [];
      return createSheetMock(name);
    },
    deleteSheet: () => {},
    getSheets: () => Object.keys(sheetsData).map(createSheetMock),
  };

  let uuidCounter = 0;
  const mockCache = new Map<string, string>();
  const sandbox = {
    CacheService: {
      getScriptCache: () => ({
        get: (k: string) => mockCache.get(k) || null,
        put: (k: string, v: string, _sec?: number) => {
          mockCache.set(k, String(v));
        },
        remove: (k: string) => {
          mockCache.delete(k);
        },
      }),
    },
    SpreadsheetApp: {
      getActiveSpreadsheet: () => mockSS,
      openById: () => mockSS,
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k: string) => properties[k] || null,
        setProperty: (k: string, v: string) => {
          properties[k] = String(v);
        },
      }),
    },
    LockService: {
      getScriptLock: () => mockLock,
    },
    Session: {
      getScriptTimeZone: () => 'Asia/Jakarta',
      getEffectiveUser: () => ({
        getEmail: () => 'owner@segara.com',
      }),
    },
    Utilities: {
      getUuid: opts.uuid ?? (() => `uuid-${++uuidCounter}-test-1234`),
      // Zona waktu diabaikan (pakai waktu lokal proses); cukup untuk pola yang dipakai Kode.gs.
      formatDate: (date: Date, _tz: string, pattern: string) =>
        pattern
          .replace('dd', pad2(date.getDate()))
          .replace('MM', pad2(date.getMonth() + 1))
          .replace('yyyy', String(date.getFullYear()))
          .replace('HH', pad2(date.getHours()))
          .replace('mm', pad2(date.getMinutes())),
      computeDigest: (_algo: unknown, value: string, _charset: unknown) =>
        createHash('sha256').update(value, 'utf8').digest(),
      computeHmacSha256Signature: (value: string, key: string, _charset?: unknown) =>
        createHmac('sha256', key).update(value, 'utf8').digest(),
      DigestAlgorithm: { SHA_256: 'SHA_256' },
      Charset: { UTF_8: 'UTF_8' },
      base64Encode: (data: Buffer | number[]) => Buffer.from(data).toString('base64'),
      base64EncodeWebSafe: (data: Buffer | number[] | string) =>
        Buffer.from(typeof data === 'string' ? data : Buffer.from(data)).toString('base64url'),
      base64DecodeWebSafe: (data: string) => Buffer.from(data, 'base64url'),
      newBlob: (bytes: Buffer) => ({
        getDataAsString: () => Buffer.from(bytes).toString('utf8'),
      }),
    },
    MailApp: {
      sendEmail: (_opts: unknown) => {},
    },
    UrlFetchApp: {
      fetch: (url: string, _opts?: unknown) => {
        const parsed = new URL(url);
        const idToken = parsed.searchParams.get('id_token') || '';
        if (idToken === 'bad_token') {
          return {
            getResponseCode: () => 400,
            getContentText: () => JSON.stringify({ error: 'invalid_token' }),
          };
        }
        if (idToken === 'other_app_token') {
          return {
            getResponseCode: () => 200,
            getContentText: () => JSON.stringify({
              email: 'admin@segara.com',
              email_verified: true,
              aud: 'attacker-client-id.apps.googleusercontent.com',
            }),
          };
        }
        return {
          getResponseCode: () => 200,
          getContentText: () => JSON.stringify({
            email: idToken.includes('@') ? idToken : 'admin@segara.com',
            email_verified: true,
            aud: 'test-client-id.apps.googleusercontent.com',
          }),
        };
      },
    },
    HtmlService: {
      createHtmlOutputFromFile: () => ({
        getContent: () => '<html>__SEGARA_MODE__</html>',
      }),
      createHtmlOutput: (content: string) => ({
        setTitle: () => ({
          addMetaTag: () => ({
            setXFrameOptionsMode: () => content,
          }),
        }),
      }),
      XFrameOptionsMode: { ALLOWALL: 'ALLOWALL' },
    },
    Logger: {
      log: () => {},
    },
    Number,
    String,
    Math,
    Date,
    Array,
    Object,
    JSON,
    Error,
    RegExp,
    isNaN,
  };

  const context = createContext(sandbox);
  const code = readFileSync('apps-script/Kode.gs', 'utf8');
  runInContext(code, context);

  return { context, sheetsData, properties, mockCache };
}

describe('Google Apps Script (Kode.gs) Engine & Security Invariants', () => {
  it('safeCell_ escapes formula prefixes to prevent spreadsheet formula injection', () => {
    const { context } = createAppsScriptEnvironment();
    const safeCell_ = runInContext('safeCell_', context);

    assert.equal(safeCell_('=1+2'), "'=1+2");
    assert.equal(safeCell_('+SUM(A1:A10)'), "'+SUM(A1:A10)");
    assert.equal(safeCell_('-5'), "'-5");
    assert.equal(safeCell_('@cmd'), "'@cmd");
    // Semua teks dipaksa jadi teks biasa agar Sheets tidak mengubahnya jadi angka/tanggal.
    assert.equal(safeCell_('Minyak goreng'), "'Minyak goreng");
    assert.equal(safeCell_('0123'), "'0123");
    assert.equal(safeCell_(''), '');
    assert.equal(safeCell_(100), 100);
    assert.equal(safeCell_(true), true);
  });

  it('num_ converts Indonesian commas to dots and rejects non-finite values', () => {
    const { context } = createAppsScriptEnvironment();
    const num_ = runInContext('num_', context);

    assert.equal(num_('10,5'), 10.5);
    assert.equal(num_('100'), 100);
    assert.equal(num_('Infinity'), 0);
    assert.equal(num_('-Infinity'), 0);
    assert.equal(num_('NaN'), 0);
    assert.equal(num_('invalid'), 0);
    assert.equal(num_(null), 0);
  });

  it('masukKaryawan validates active employee and writes Transaksi with alur DALAM', () => {
    const { context, sheetsData } = createAppsScriptEnvironment();
    const masukKaryawan = runInContext('masukKaryawan', context);

    // Inactive employee k2 must be rejected
    assert.throws(
      () => masukKaryawan('k2', 'b1', 10, 'Supplier X'),
      /Karyawan tidak aktif atau tidak ditemukan/,
    );

    // Active employee k1 succeeds
    const res = masukKaryawan('k1', 'b1', 5, 'Supplier Makmur');
    assert.equal(res, true);

    // Verify stock_dalam updated
    const barangRow = sheetsData.Barang.find((r) => r[0] === 'b1');
    assert.equal(barangRow[4], 25);

    // Verify Transaksi entry
    const txRow = sheetsData.Transaksi[sheetsData.Transaksi.length - 1];
    assert.equal(txRow[3], 'MASUK');
    assert.equal(txRow[4], 'b1');
    assert.equal(txRow[6], 5);
    assert.equal(txRow[7], 'k1');
    assert.equal(txRow[9], 'DALAM');
  });

  it('ambil validates active employee and updates stock balances', () => {
    const { context, sheetsData } = createAppsScriptEnvironment();
    const ambil = runInContext('ambil', context);

    // Inactive employee rejected
    assert.throws(
      () => ambil('k2', 'b1', 2),
      /Karyawan tidak aktif atau tidak ditemukan/,
    );

    // Stock exceedance rejected
    assert.throws(
      () => ambil('k1', 'b1', 999),
      /Jumlah melebihi stok gudang yang tercatat/,
    );

    // Valid ambil
    const res = ambil('k1', 'b1', 3);
    assert.ok(res.tx.id);

    const b1 = sheetsData.Barang.find((r) => r[0] === 'b1');
    assert.equal(b1[4], 17); // stok_dalam 20 - 3
    assert.equal(b1[5], 3);  // stok_luar 0 + 3
  });

  it('batalAmbil cleanly restores stock and marks transaction as BATAL', () => {
    const { context, sheetsData } = createAppsScriptEnvironment();
    const ambil = runInContext('ambil', context);
    const batalAmbil = runInContext('batalAmbil', context);

    const ambilRes = ambil('k1', 'b1', 4);
    const txId = ambilRes.tx.id;

    const ok = batalAmbil(txId, '');
    assert.equal(ok, true);

    const b1 = sheetsData.Barang.find((r) => r[0] === 'b1');
    assert.equal(b1[4], 20); // 16 + 4
    assert.equal(b1[5], 0);  // 4 - 4

    const tx = sheetsData.Transaksi.find((r) => r[0] === txId);
    assert.equal(tx[11], 'BATAL');
  });

  it('simpanBarang enforces non-negative stok_awal and ambang_min', () => {
    const { context } = createAppsScriptEnvironment();
    const simpanBarang = runInContext('simpanBarang', context);

    assert.throws(
      () =>
        simpanBarang('12345', {
          nama: 'Item Negatif',
          satuan: 'kg',
          kategori: 'Bahan',
          ambang_min: -1,
          stok_awal: 0,
        }),
      /Ambang minimum tidak boleh negatif/,
    );

    assert.throws(
      () =>
        simpanBarang('12345', {
          nama: 'Item Stok Awal Negatif',
          satuan: 'kg',
          kategori: 'Bahan',
          ambang_min: 0,
          stok_awal: -10,
        }),
      /Stok awal tidak boleh negatif/,
    );
  });

  it('simpanKaryawan rejects duplicate employee names', () => {
    const { context } = createAppsScriptEnvironment();
    const simpanKaryawan = runInContext('simpanKaryawan', context);

    assert.throws(
      () => simpanKaryawan('12345', { nama: 'budi' }),
      /sudah ada/,
    );

    // Non-duplicate name succeeds
    const ok = simpanKaryawan('12345', { nama: 'Joko' });
    assert.equal(ok, true);
  });
  it('simpanKaryawan validates employee PIN and verifikasiPinKaryawan checks correctly', () => {
    const { context, sheetsData, mockCache } = createAppsScriptEnvironment();
    const simpanKaryawan = runInContext('simpanKaryawan', context);
    const verifikasiPinKaryawan = runInContext('verifikasiPinKaryawan', context);
    const adminData = runInContext('adminData', context);

    // Invalid PIN length
    assert.throws(() => simpanKaryawan('12345', { nama: 'Bambang', pin: '123' }), /4–6 angka/);
    assert.throws(() => simpanKaryawan('12345', { nama: 'Bambang', pin: '1234567' }), /4–6 angka/);
    assert.throws(() => simpanKaryawan('12345', { nama: 'Bambang', pin: 'abcd' }), /4–6 angka/);

    // Valid PIN succeeds
    assert.ok(simpanKaryawan('12345', { nama: 'Bambang', pin: '9876' }));
    const admin = adminData('12345');
    const bambang = admin.karyawan.find((k: { nama: string }) => k.nama === 'Bambang');
    assert.ok(bambang);
    assert.equal(bambang.punyaPin, true);
    assert.equal(bambang.pin, undefined); // PIN is NOT leaked to admin client
    assert.equal(bambang.pinLen, 4);
    const getTablet = runInContext('getTablet', context);
    const tabBambang = getTablet().karyawan.find((k: { id: string }) => k.id === bambang.id);
    assert.equal(tabBambang.pinLen, 4);

    // Verify stored in sheet as SHA-256 hash, not plaintext
    const row = sheetsData.Karyawan.find((r) => r[1] === 'Bambang');
    assert.ok(row && row[3]);
    assert.notEqual(row[3], '9876');

    // Verify PIN works
    assert.ok(verifikasiPinKaryawan(bambang.id, '9876'));
    assert.throws(() => verifikasiPinKaryawan(bambang.id, '0000'), /PIN karyawan salah/);

    // Rate limiting: 5 wrong attempts trigger cooldown lock
    assert.throws(() => verifikasiPinKaryawan(bambang.id, '0001'), /PIN karyawan salah/);
    assert.throws(() => verifikasiPinKaryawan(bambang.id, '0002'), /PIN karyawan salah/);
    assert.throws(() => verifikasiPinKaryawan(bambang.id, '0003'), /PIN karyawan salah/);
    assert.throws(() => verifikasiPinKaryawan(bambang.id, '0004'), /PIN karyawan salah/);
    assert.throws(() => verifikasiPinKaryawan(bambang.id, '9876'), /Terlalu banyak percobaan gagal/);

    // Clear lock for remaining tests
    mockCache.clear();

    // Clear PIN
    assert.ok(simpanKaryawan('12345', { id: bambang.id, nama: 'Bambang', pin: '' }));
    const updated = adminData('12345').karyawan.find((k: { id: string }) => k.id === bambang.id);
    assert.equal(updated.punyaPin, false);
    assert.ok(verifikasiPinKaryawan(bambang.id, '')); // No PIN required when cleared
  });

  it('hapusKaryawan safely deletes or archives employees based on transaction history', () => {
    const { context, sheetsData } = createAppsScriptEnvironment();
    const hapusKaryawan = runInContext('hapusKaryawan', context);
    const adminData = runInContext('adminData', context);
    const ambil = runInContext('ambil', context);

    // 1. Wrong PIN is rejected
    assert.throws(() => hapusKaryawan('wrong-pin', 'k1'), /PIN salah/);

    // 2. Non-existent employee ID throws
    assert.throws(() => hapusKaryawan('12345', 'non-existent'), /Karyawan tidak ditemukan/);

    // 3. Employee k2 has no transactions -> hard delete permanently removes row
    const resDel = hapusKaryawan('12345', 'k2');
    assert.equal(resDel.status, 'deleted');
    assert.match(resDel.message, /berhasil dihapus permanen/);
    assert.equal(sheetsData.Karyawan.some((r) => r[0] === 'k2'), false);
    assert.equal(adminData('12345').karyawan.some((k: { id: string }) => k.id === 'k2'), false);

    // 4. Employee k1 takes stock (generates transaction) -> cannot be hard-deleted, archives instead
    ambil('k1', 'b1', 1);
    const resArch = hapusKaryawan('12345', 'k1');
    assert.equal(resArch.status, 'archived');
    assert.match(resArch.message, /riwayat transaksi/);
    // Row still exists in sheet, but aktif is false
    const k1Row = sheetsData.Karyawan.find((r) => r[0] === 'k1');
    assert.ok(k1Row);
    assert.equal(k1Row[2], false);
    const k1Admin = adminData('12345').karyawan.find((k: { id: string }) => k.id === 'k1');
    assert.ok(k1Admin);
    assert.equal(k1Admin.aktif, false);
  });

  it('simpanPengaturan safely updates configuration inside lock', () => {
    const { context, properties, sheetsData } = createAppsScriptEnvironment();
    const simpanPengaturan = runInContext('simpanPengaturan', context);

    simpanPengaturan('12345', '23:00', '98765');
    // Admin PIN is stored as SHA-256 hash, not plaintext
    assert.notEqual(properties.ADMIN_PIN, '98765');
    assert.ok(properties.ADMIN_PIN.length > 20);

    // Can authenticate with new PIN
    const adminData = runInContext('adminData', context);
    assert.ok(adminData('98765'));
    assert.throws(() => adminData('12345'), /PIN salah/);
    const jamSetting = sheetsData.Pengaturan.find((r) => r[0] === 'jam_tutup');
    assert.equal(jamSetting[1], '23:00');
  });
});

/* ---------- Regresi: perilaku Google Sheets asli ---------- */
describe('Kode.gs regressions (real Google Sheets coercion & integrity)', () => {
  it('karyawan PIN with leading zero survives the sheet round-trip', () => {
    const { context } = createAppsScriptEnvironment();
    const simpanKaryawan = runInContext('simpanKaryawan', context);
    const verifikasiPinKaryawan = runInContext('verifikasiPinKaryawan', context);
    const adminData = runInContext('adminData', context);

    assert.ok(simpanKaryawan('12345', { nama: 'Nina', pin: '0123' }));
    const nina = adminData('12345').karyawan.find((k: { nama: string }) => k.nama === 'Nina');
    assert.equal(nina.punyaPin, true);
    assert.ok(verifikasiPinKaryawan(nina.id, '0123'));
    assert.throws(() => verifikasiPinKaryawan(nina.id, '123'), /PIN karyawan salah/);
  });

  it('legacy numeric PIN cells (stored before the fix) still verify', () => {
    const { context, sheetsData } = createAppsScriptEnvironment();
    sheetsData.Karyawan.push(['k9', 'Lama', true, 123]); // dulu "0123", nol hilang
    const verifikasiPinKaryawan = runInContext('verifikasiPinKaryawan', context);
    assert.ok(verifikasiPinKaryawan('k1', '1234'));
    assert.ok(verifikasiPinKaryawan('k9', '0123'));
    assert.ok(verifikasiPinKaryawan('k9', '0123')); // setelah di-hash ulang tetap bisa
    assert.throws(() => verifikasiPinKaryawan('k9', '9999'), /PIN karyawan salah/);
  });

  it('legacy plain-text PIN is matched exactly (no leading-zero variants)', () => {
    const { context, sheetsData } = createAppsScriptEnvironment();
    sheetsData.Karyawan.push(['k8', 'Teks', true, '4321']);
    const verifikasiPinKaryawan = runInContext('verifikasiPinKaryawan', context);
    assert.throws(() => verifikasiPinKaryawan('k8', '04321'), /PIN karyawan salah/);
    assert.ok(verifikasiPinKaryawan('k8', '4321'));
    assert.ok(verifikasiPinKaryawan('k8', '4321'));
  });

  it('PIN "0000" is not treated as "no PIN"', () => {
    const { context } = createAppsScriptEnvironment();
    const simpanKaryawan = runInContext('simpanKaryawan', context);
    const getTablet = runInContext('getTablet', context);
    const verifikasiPinKaryawan = runInContext('verifikasiPinKaryawan', context);
    simpanKaryawan('12345', { nama: 'Nol', pin: '0000' });
    const k = getTablet().karyawan.find((x: { nama: string }) => x.nama === 'Nol');
    assert.equal(k.punyaPin, true);
    assert.throws(() => verifikasiPinKaryawan(k.id, ''), /PIN karyawan salah/);
  });

  it('legacy numeric PIN cell with 0 still verifies and has punyaPin true', () => {
    const { context, sheetsData } = createAppsScriptEnvironment();
    sheetsData.Karyawan.push(['k10', 'NolLama', true, 0]); // legacy "0000" coerced to 0 by Sheets
    const getTablet = runInContext('getTablet', context);
    const adminData = runInContext('adminData', context);
    const verifikasiPinKaryawan = runInContext('verifikasiPinKaryawan', context);
    const tabK = getTablet().karyawan.find((x: { id: string }) => x.id === 'k10');
    const admK = adminData('12345').karyawan.find((x: { id: string }) => x.id === 'k10');
    assert.equal(tabK.punyaPin, true);
    assert.equal(admK.punyaPin, true);
    assert.ok(verifikasiPinKaryawan('k10', '0000'));
  });

  it('simpanKaryawan treats pin: null like "not provided"', () => {
    const { context } = createAppsScriptEnvironment();
    const simpanKaryawan = runInContext('simpanKaryawan', context);
    assert.ok(simpanKaryawan('12345', { nama: 'Tanpa Pin', pin: null }));
  });

  it('jam_tutup stored as a Sheets time value is returned as HH:mm', () => {
    const { context } = createAppsScriptEnvironment();
    const getTablet = runInContext('getTablet', context);
    const adminData = runInContext('adminData', context);
    assert.equal(getTablet().jamTutup, '21:00');
    assert.equal(adminData('12345').jamTutup, '21:00');
  });

  it('simpanPengaturan stores jam_tutup as text and rejects invalid times', () => {
    const { context } = createAppsScriptEnvironment();
    const simpanPengaturan = runInContext('simpanPengaturan', context);
    const getTablet = runInContext('getTablet', context);
    simpanPengaturan('12345', '07:30', '');
    assert.equal(getTablet().jamTutup, '07:30');
    assert.throws(() => simpanPengaturan('12345', '25:00', ''), /Jam tutup/);
    assert.throws(() => simpanPengaturan('12345', 'abc', ''), /Jam tutup/);
  });

  it('ids that look numeric are not corrupted by Sheets (batalAmbil still finds the tx)', () => {
    let n = 0;
    // UUID hex yang semuanya angka dengan nol di depan → dulu jadi angka dan nol hilang.
    const { context } = createAppsScriptEnvironment({ uuid: () => `0${String(++n).padStart(9, '0')}-0000-0000-0000-000000000000` });
    const ambil = runInContext('ambil', context);
    const batalAmbil = runInContext('batalAmbil', context);
    const r = ambil('k1', 'b1', 2);
    assert.ok(batalAmbil(r.tx.id, ''));
  });

  it('text that looks like a date or number is kept verbatim', () => {
    const { context, sheetsData } = createAppsScriptEnvironment();
    const simpanBarang = runInContext('simpanBarang', context);
    const adminData = runInContext('adminData', context);
    simpanBarang('12345', { nama: 'Teh 1/2', satuan: 'kg', kategori: 'Bahan', kode: '007', catatan: '10,5', ambang_min: 0, stok_awal: 0 });
    const b = adminData('12345').barang.find((x: { nama: string }) => x.nama === 'Teh 1/2');
    assert.equal(b.kode, '007');
    assert.equal(b.catatan, '10,5');
    assert.ok(!sheetsData.Barang.some((r) => String(r[1]).startsWith('FORMULA:')));
  });

  it('simpanOpname rejects non-numeric fisik instead of zeroing stock', () => {
    const { context, sheetsData } = createAppsScriptEnvironment();
    const simpanOpname = runInContext('simpanOpname', context);
    assert.throws(() => simpanOpname('12345', [{ barang_id: 'b1', fisik: 'abc' }]), /tidak valid/);
    assert.throws(() => simpanOpname('12345', [{ barang_id: 'b1', fisik: 'NaN' }]), /tidak valid/);
    assert.equal(sheetsData.Barang.find((r) => r[0] === 'b1')![4], 20);
    assert.equal(simpanOpname('12345', [{ barang_id: 'b1', fisik: '18,5' }]), 1);
    assert.equal(sheetsData.Barang.find((r) => r[0] === 'b1')![4], 18.5);
  });

  it('editRekapTerakhir rejects non-numeric sisa', () => {
    const { context } = createAppsScriptEnvironment();
    const ambil = runInContext('ambil', context);
    const rekapDraf = runInContext('rekapDraf', context);
    const simpanRekap = runInContext('simpanRekap', context);
    const editRekapTerakhir = runInContext('editRekapTerakhir', context);
    ambil('k1', 'b1', 4);
    const d = rekapDraf();
    simpanRekap(d.cutoff, 'k1', [{ barang_id: 'b1', sisa: 1 }]);
    assert.throws(() => editRekapTerakhir('12345', [{ barang_id: 'b1', sisa: 'abc' }]), /tidak valid/);
  });

  it('simpanRekap rejects a cutoff in the future', () => {
    const { context } = createAppsScriptEnvironment();
    const ambil = runInContext('ambil', context);
    const simpanRekap = runInContext('simpanRekap', context);
    ambil('k1', 'b1', 4);
    assert.throws(() => simpanRekap(Date.now() + 3_600_000, 'k1', [{ barang_id: 'b1', sisa: 0 }]), /Waktu rekap/);
  });

  it('laporanKeSheet does not write item names as formulas', () => {
    const { context, sheetsData } = createAppsScriptEnvironment();
    const simpanBarang = runInContext('simpanBarang', context);
    const laporanKeSheet = runInContext('laporanKeSheet', context);
    simpanBarang('12345', { nama: '=IMPORTXML("http://x")', satuan: 'kg', kategori: 'Bahan', ambang_min: 0, stok_awal: 5 });
    const now = new Date();
    const ymd = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
    laporanKeSheet('12345', ymd, ymd);
    const cells = sheetsData.Laporan.flat();
    assert.ok(cells.includes('=IMPORTXML("http://x")'));
    assert.ok(!cells.some((c) => String(c).startsWith('FORMULA:')));
  });

  it('buatDummyRekap populates Google Sheets with realistic rekap and transaction history', () => {
    const { context, sheetsData } = createAppsScriptEnvironment();
    const buatDummyRekap = runInContext('buatDummyRekap', context);
    const adminData = runInContext('adminData', context);

    assert.throws(() => buatDummyRekap('wrong-pin'), /PIN salah/);
    const count = buatDummyRekap('12345');
    assert.equal(count, 3);

    // Sheets populated
    assert.ok(sheetsData.Rekap.length >= 4); // header + 3 rows
    assert.ok(sheetsData.RekapBaris.length > 3);
    assert.ok(sheetsData.Transaksi.length > 3);

    // Admin data reflects the rekaps
    const data = adminData('12345');
    assert.equal(data.rekap.length, 3);
    assert.ok(data.rekap[0].baris.length > 0);
  });
});

describe('Google Apps Script (Kode.gs) Authentication, Session & Whitelist Invariants', () => {
  const pin = '12345';

  it('creates and verifies HMAC session token with role and expiry', () => {
    const { context, properties } = createAppsScriptEnvironment();
    properties.AUTH_WHITELIST = JSON.stringify([
      { email: 'admin@segara.com', role: 'admin', aktif: true, dibuat: Date.now() },
      { email: 'tablet@segara.com', role: 'tablet', aktif: true, dibuat: Date.now() },
    ]);

    const buatSessionToken_ = runInContext('buatSessionToken_', context);
    const verifySessionToken = runInContext('verifySessionToken', context);

    const sess = buatSessionToken_('admin@segara.com', 'admin');
    assert.ok(sess.token);
    assert.equal(sess.email, 'admin@segara.com');
    assert.equal(sess.role, 'admin');
    assert.ok(sess.exp > Date.now());

    const verified = verifySessionToken(sess.token);
    assert.equal(verified.valid, true);
    assert.equal(verified.email, 'admin@segara.com');
    assert.equal(verified.role, 'admin');
  });

  it('rejects tampered or forged session token signature', () => {
    const { context, properties } = createAppsScriptEnvironment();
    properties.AUTH_WHITELIST = JSON.stringify([
      { email: 'admin@segara.com', role: 'admin', aktif: true, dibuat: Date.now() },
    ]);

    const buatSessionToken_ = runInContext('buatSessionToken_', context);
    const verifySessionToken = runInContext('verifySessionToken', context);

    const sess = buatSessionToken_('admin@segara.com', 'admin');
    const tampered = sess.token + 'forged';
    const result = verifySessionToken(tampered);
    assert.equal(result.valid, false);
    assert.match(result.error, /Tanda tangan token tidak sah/);
  });

  it('rejects expired session token', () => {
    const { context, properties } = createAppsScriptEnvironment();
    properties.AUTH_WHITELIST = JSON.stringify([
      { email: 'admin@segara.com', role: 'admin', aktif: true, dibuat: Date.now() },
    ]);

    const verifySessionToken = runInContext('verifySessionToken', context);
    const tokenSecret_ = runInContext('tokenSecret_', context);
    const secret = tokenSecret_();

    // Buat token dengan exp di masa lalu
    const payload = ['admin@segara.com', 'admin', Date.now() - 10000, 'nonce123'].join('|');
    const sig = Buffer.from(createHmac('sha256', secret).update(payload).digest()).toString('base64url');
    const expiredToken = Buffer.from(payload).toString('base64url') + '.' + sig;

    const res = verifySessionToken(expiredToken);
    assert.equal(res.valid, false);
    assert.match(res.error, /Sesi telah berakhir/);
  });

  it('invalidates session token when account is deactivated or deleted in whitelist', () => {
    const { context, properties } = createAppsScriptEnvironment();
    properties.AUTH_WHITELIST = JSON.stringify([
      { email: 'owner@segara.com', role: 'admin', aktif: true, dibuat: Date.now() },
      { email: 'staff@segara.com', role: 'tablet', aktif: true, dibuat: Date.now() },
    ]);

    const buatSessionToken_ = runInContext('buatSessionToken_', context);
    const verifySessionToken = runInContext('verifySessionToken', context);
    const simpanAuthAccount = runInContext('simpanAuthAccount', context);
    const hapusAuthAccount = runInContext('hapusAuthAccount', context);

    const sess = buatSessionToken_('staff@segara.com', 'tablet');
    assert.equal(verifySessionToken(sess.token).valid, true);

    // Deaktivasi akun
    simpanAuthAccount(pin, 'staff@segara.com', 'tablet', false);
    const resDeact = verifySessionToken(sess.token);
    assert.equal(resDeact.valid, false);
    assert.match(resDeact.error, /dicabut atau dinonaktifkan/);

    // Hapus akun
    hapusAuthAccount(pin, 'staff@segara.com');
    const resDel = verifySessionToken(sess.token);
    assert.equal(resDel.valid, false);
  });

  it('simpanAuthAccount prevents deactivating or demoting the last active admin', () => {
    const { context, properties } = createAppsScriptEnvironment();
    properties.AUTH_WHITELIST = JSON.stringify([
      { email: 'owner@segara.com', role: 'admin', aktif: true, dibuat: Date.now() },
      { email: 'tablet@segara.com', role: 'tablet', aktif: true, dibuat: Date.now() },
    ]);

    const simpanAuthAccount = runInContext('simpanAuthAccount', context);

    // Coba deaktifkan satu-satunya admin aktif
    assert.throws(
      () => simpanAuthAccount(pin, 'owner@segara.com', 'admin', false),
      /Tidak dapat menonaktifkan atau mengubah role admin aktif terakhir/,
    );

    // Coba ubah role satu-satunya admin aktif jadi tablet
    assert.throws(
      () => simpanAuthAccount(pin, 'owner@segara.com', 'tablet', true),
      /Tidak dapat menonaktifkan atau mengubah role admin aktif terakhir/,
    );
  });

  it('hapusAuthAccount prevents deleting the last active admin', () => {
    const { context, properties } = createAppsScriptEnvironment();
    properties.AUTH_WHITELIST = JSON.stringify([
      { email: 'owner@segara.com', role: 'admin', aktif: true, dibuat: Date.now() },
    ]);

    const hapusAuthAccount = runInContext('hapusAuthAccount', context);
    assert.throws(
      () => hapusAuthAccount(pin, 'owner@segara.com'),
      /Tidak dapat menghapus admin aktif terakhir/,
    );
  });

  it('verifyGoogleCredential verifies audience and rejects client ID mismatch', () => {
    const { context, properties } = createAppsScriptEnvironment();
    properties.GOOGLE_CLIENT_ID = 'test-client-id.apps.googleusercontent.com';
    properties.AUTH_WHITELIST = JSON.stringify([
      { email: 'admin@segara.com', role: 'admin', aktif: true, dibuat: Date.now() },
    ]);

    const verifyGoogleCredential = runInContext('verifyGoogleCredential', context);

    // Token dengan audience salah
    assert.throws(
      () => verifyGoogleCredential('other_app_token'),
      /Token otorisasi Google tidak sah untuk aplikasi ini/,
    );

    // Token yang valid dengan audience cocok
    const sess = verifyGoogleCredential('admin@segara.com');
    assert.equal(sess.email, 'admin@segara.com');
    assert.equal(sess.role, 'admin');
    assert.ok(sess.token);
  });

  it('requestOtp enforces 60-second cooldown per email', () => {
    const { context, properties } = createAppsScriptEnvironment();
    properties.AUTH_WHITELIST = JSON.stringify([
      { email: 'user@real.com', role: 'tablet', aktif: true, dibuat: Date.now() },
    ]);

    const requestOtp = runInContext('requestOtp', context);

    const first = requestOtp('user@real.com');
    assert.equal(first.success, true);

    // Permintaan kedua langsung ditolak cooldown
    assert.throws(
      () => requestOtp('user@real.com'),
      /Tunggu 60 detik sebelum meminta kode baru/,
    );
  });

  it('rejects getTablet and ambil when server session is missing or invalid in production', () => {
    const { context, properties } = createAppsScriptEnvironment();
    // Nonaktifkan bypass test agar mengecek sesi server nyata
    properties.SKIP_AUTH_SESSION = '0';
    properties.AUTH_WHITELIST = JSON.stringify([
      { email: 'tablet@segara.com', role: 'tablet', aktif: true, dibuat: Date.now() },
    ]);

    const getTablet = runInContext('getTablet', context);
    const ambil = runInContext('ambil', context);
    const buatSessionToken_ = runInContext('buatSessionToken_', context);

    // Tanpa token ditolak
    assert.throws(() => getTablet(), /Akses ditolak: sesi login wajib disertakan/);
    assert.throws(() => ambil('k1', 'b1', 1), /Akses ditolak: sesi login wajib disertakan/);

    // Dengan token valid berhasil
    const sess = buatSessionToken_('tablet@segara.com', 'tablet');
    const tabRes = getTablet(sess.token);
    assert.ok(tabRes.barang.length > 0);

    const ambilRes = ambil('k1', 'b1', 1, null, sess.token);
    assert.ok(ambilRes.tx.id);
  });

  it('idempotency key prevents double-save on ambil and returns cached result', () => {
    const { context, sheetsData } = createAppsScriptEnvironment();
    const ambil = runInContext('ambil', context);

    const clientTxId = 'test-idemp-key-123';
    const r1 = ambil('k1', 'b1', 2, clientTxId);
    assert.ok(r1.tx.id);

    // Hitung baris transaksi setelah panggilan pertama
    const txRowsAfterFirst = sheetsData.Transaksi.length;

    // Panggil lagi dengan idempotency key yang sama
    const r2 = ambil('k1', 'b1', 2, clientTxId);
    assert.equal(r2.tx.id, r1.tx.id);

    // Pastikan tidak ada baris transaksi ganda yang ditambahkan ke sheet
    assert.equal(sheetsData.Transaksi.length, txRowsAfterFirst);
  });

  it('rows_ throws error when a required column in sheet is missing or renamed', () => {
    const { context, sheetsData } = createAppsScriptEnvironment();
    const rows_ = runInContext('rows_', context);

    // Ganti kolom 'satuan' menjadi 'satuan_baru' di header sheet Barang
    sheetsData.Barang[0]![2] = 'satuan_baru';

    assert.throws(
      () => rows_('Barang'),
      /Kolom wajib "satuan" tidak ditemukan di sheet "Barang"/,
    );
  });

  it('rate limit escalates lockout duration on repeated failures', () => {
    const { context, mockCache } = createAppsScriptEnvironment();
    const rateLimitCatatGagal_ = runInContext('rateLimitCatatGagal_', context);

    // 5 kegagalan pertama -> kunci 60 detik (tier 0)
    for (let i = 0; i < 5; i++) {
      rateLimitCatatGagal_('test_esc_key');
    }
    assert.equal(mockCache.get('rl_lock_test_esc_key'), 'locked');
    assert.equal(mockCache.get('rl_esc_test_esc_key'), '1');

    // Hapus kunci sementara untuk mensimulasikan percobaan setelah 60 detik berlalu
    mockCache.delete('rl_lock_test_esc_key');

    // 5 kegagalan berikutnya -> tier 1
    for (let i = 0; i < 5; i++) {
      rateLimitCatatGagal_('test_esc_key');
    }
    assert.equal(mockCache.get('rl_lock_test_esc_key'), 'locked');
    assert.equal(mockCache.get('rl_esc_test_esc_key'), '2');
  });

  it('rejects adminData, simpanBarang, and all admin operations when server session is missing in production', () => {
    const { context, properties } = createAppsScriptEnvironment();
    properties.SKIP_AUTH_SESSION = '0';
    properties.AUTH_WHITELIST = JSON.stringify([
      { email: 'admin@segara.com', role: 'admin', aktif: true, dibuat: Date.now() },
    ]);

    const adminData = runInContext('adminData', context);
    const simpanBarang = runInContext('simpanBarang', context);
    const hapusBarang = runInContext('hapusBarang', context);
    const simpanKaryawan = runInContext('simpanKaryawan', context);
    const hapusKaryawan = runInContext('hapusKaryawan', context);
    const tambahKategori = runInContext('tambahKategori', context);
    const hapusKategori = runInContext('hapusKategori', context);
    const buatSessionToken_ = runInContext('buatSessionToken_', context);

    // All operations without session token must be rejected
    assert.throws(() => adminData('12345'), /Akses ditolak: sesi login wajib disertakan/);
    assert.throws(() => simpanBarang('12345', { nama: 'Test', satuan: 'kg', ambang_min: 0, alur: 'LUAR', kode: '', catatan: '' }), /Akses ditolak: sesi login wajib disertakan/);
    assert.throws(() => hapusBarang('12345', 'b1'), /Akses ditolak: sesi login wajib disertakan/);
    assert.throws(() => simpanKaryawan('12345', { nama: 'Test' }), /Akses ditolak: sesi login wajib disertakan/);
    assert.throws(() => hapusKaryawan('12345', 'k1'), /Akses ditolak: sesi login wajib disertakan/);
    assert.throws(() => tambahKategori('12345', 'KategoriBaru'), /Akses ditolak: sesi login wajib disertakan/);
    assert.throws(() => hapusKategori('12345', 'Bahan'), /Akses ditolak: sesi login wajib disertakan/);

    // With valid admin token, succeeds
    const sess = buatSessionToken_('admin@segara.com', 'admin');
    const res = adminData('12345', sess.token);
    assert.ok(res.barang.length > 0);
  });

  it('buatDummyRekap requires valid admin credentials and rejects unauthenticated calls', () => {
    const { context, properties } = createAppsScriptEnvironment();
    properties.SKIP_AUTH_SESSION = '0';
    properties.AUTH_WHITELIST = JSON.stringify([
      { email: 'admin@segara.com', role: 'admin', aktif: true, dibuat: Date.now() },
    ]);

    const buatDummyRekap = runInContext('buatDummyRekap', context);
    const buatSessionToken_ = runInContext('buatSessionToken_', context);

    // Missing token/pin rejected
    assert.throws(() => buatDummyRekap(), /Akses ditolak: sesi login wajib disertakan/);
    assert.throws(() => buatDummyRekap('12345'), /Akses ditolak: sesi login wajib disertakan/);

    // Valid pin & token succeeds
    const sess = buatSessionToken_('admin@segara.com', 'admin');
    const count = buatDummyRekap('12345', sess.token);
    assert.equal(count, 3);
  });

  it('simpanRekap accepts comma decimal input for sisa without throwing error', () => {
    const { context } = createAppsScriptEnvironment();
    const ambil = runInContext('ambil', context);
    const rekapDraf = runInContext('rekapDraf', context);
    const simpanRekap = runInContext('simpanRekap', context);

    ambil('k1', 'b1', 4);
    const d = rekapDraf();
    // Input sisa with Indonesian comma format '1,5'
    const res = simpanRekap(d.cutoff, 'k1', [{ barang_id: 'b1', sisa: '1,5' }]);
    assert.ok(res.id);
  });

  it('cekAdminPin_ refuses to re-hash when input is identical to existing base64 hash', () => {
    const { context, properties } = createAppsScriptEnvironment();
    const hashPin_ = runInContext('hashPin_', context);
    const adminSalt_ = runInContext('adminSalt_', context);
    const cekAdminPin_ = runInContext('cekAdminPin_', context);

    const originalHashed = hashPin_('12345', adminSalt_());
    properties.ADMIN_PIN = originalHashed;

    // Passing the base64 hash as inputPin should not authenticate or overwrite the hash
    assert.equal(cekAdminPin_(originalHashed), false);
    assert.equal(properties.ADMIN_PIN, originalHashed);
  });
});
