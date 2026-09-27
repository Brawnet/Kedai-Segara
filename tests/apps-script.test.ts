import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { createHash } from 'node:crypto';

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

function createAppsScriptEnvironment(opts: { uuid?: () => string } = {}) {
  const properties: Record<string, string> = {
    SS_ID: 'test-ss-id',
    ADMIN_PIN: '12345',
    SKEMA: '3',
  };
  const sheetsData: Record<string, Cell[][]> = {
    Barang: [
      ['id', 'nama', 'satuan', 'kategori', 'stok_dalam', 'stok_luar', 'ambang_min', 'alur', 'aktif', 'kode', 'catatan'],
      ['b1', 'Minyak goreng', 'liter', 'Bahan', 20, 0, 5, 'LUAR', true, 'MG', ''],
      ['b2', 'Plastik Sampah S', 'Lbr', 'Cleaning', 10, 0, 2, 'LANGSUNG_HABIS', true, 'PS', ''],
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
    getRange: (row: number, col: number, numRows: number, numCols: number) => ({
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
    getLastRow: () => (sheetsData[sheetName] ? sheetsData[sheetName].length : 0),
    getMaxColumns: () => 20,
    getMaxRows: () => 100,
    insertColumnsAfter: () => {},
    insertRowsAfter: () => {},
    setFrozenRows: () => {},
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
      DigestAlgorithm: { SHA_256: 'SHA_256' },
      Charset: { UTF_8: 'UTF_8' },
      base64Encode: (data: Buffer | number[]) => Buffer.from(data).toString('base64'),
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
});
