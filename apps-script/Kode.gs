/**
 * Sistem Manajemen Stok Gudang
 * Google Apps Script + Google Sheets (database) + Web App (tablet & admin)
 * Alur: Stock Dalam (gudang) → Stock Luar (area kerja) → Rekap sisa akhir hari.
 */
var SHEETS = {
  Barang: ['id', 'nama', 'satuan', 'kategori', 'stok_dalam', 'stok_luar', 'ambang_min', 'alur', 'aktif', 'kode', 'catatan', 'bisa_produksi'],
  Karyawan: ['id', 'nama', 'aktif', 'pin'],
  Transaksi: ['id', 'ts', 'waktu', 'jenis', 'barang_id', 'barang', 'jumlah', 'karyawan_id', 'karyawan', 'alur', 'supplier', 'status', 'dicatat_oleh', 'catatan', 'kategori', 'satuan'],
  Rekap: ['id', 'ts', 'waktu', 'karyawan_id', 'karyawan', 'diedit_admin', 'status', 'approved_ts'],
  RekapBaris: ['rekap_id', 'barang_id', 'barang', 'saldo_awal', 'diambil', 'sisa', 'terpakai', 'catatan', 'terjual', 'selisih'],
  Opname: ['id', 'ts', 'waktu', 'barang_id', 'barang', 'sistem', 'fisik', 'selisih'],
  Pengaturan: ['kunci', 'nilai'],
  Log_Login: ['id', 'ts', 'waktu', 'email', 'metode', 'role', 'status', 'user_agent']
};
var TZ = Session.getScriptTimeZone();
var SS_ = null;
// Opsional: Isi ID spreadsheet jika script dibuat terpisah dari script.google.com.
// Jika dibuka dari spreadsheet langsung (Ekstensi → Apps Script), biarkan kosong ('').
var DEFAULT_SS_ID = '';
var SKEMA_V = '7'; // naikkan jika kolom di SHEETS berubah

/* ---------- Web app ---------- */
// index.html adalah hasil build (Vite, satu file). Tidak dievaluasi sebagai template
// karena kode JS hasil build bisa mengandung "<?" — mode disisipkan lewat placeholder.
function resetStokLuar_() {
  return lock_(function () {
    var last = lastRekapTs_();
    var open = openTx_(last);
    var takenToday = {};
    open.forEach(function (t) {
      var id = String(t.barang_id);
      takenToday[id] = r_((takenToday[id] || 0) + num_(t.jumlah));
    });
    var data = rows_('Barang');
    var updated = 0;
    data.forEach(function (b) {
      var id = String(b.id);
      var correctLuar = takenToday[id] || 0;
      if (num_(b.stok_luar) !== correctLuar) {
        b.stok_luar = correctLuar;
        update_('Barang', b);
        updated++;
      }
    });
    return { ok: true, updated: updated, total_barang: data.length };
  });
}

function appendBatch_(n, rows) {
  if (!rows || rows.length === 0) return;
  var s = sheet_(n);
  var cols = SHEETS[n];
  var raw = rows.map(function (o) {
    return cols.map(function (k) { return safeCell_(o[k] === undefined ? '' : o[k]); });
  });
  var lr = s.getLastRow();
  s.getRange(lr + 1, 1, raw.length, cols.length).setValues(raw);
}

function tutupPeriodeSeptember_() {
  return lock_(function () {
    var allTx = rows_('Transaksi');
    var maxTs = 0;
    allTx.forEach(function (t) {
      if (num_(t.ts) > maxTs) maxTs = num_(t.ts);
    });
    if (!maxTs) maxTs = 1790599800000;
    var rekapTs = maxTs + 10 * 60000;
    var rekapWaktu = fmt_(rekapTs);
    var rekapId = 'rekap_sept_2026';
    var existingRekap = rows_('Rekap').filter(function (r) { return String(r.id) === rekapId || num_(r.ts) >= rekapTs; });
    var barisAdded = 0;
    if (existingRekap.length === 0) {
      append_('Rekap', {
        id: rekapId,
        ts: rekapTs,
        waktu: rekapWaktu,
        karyawan_id: 'admin',
        karyawan: 'Admin (Tutup September)',
        diedit_admin: false
      });
      var before = {};
      allTx.forEach(function (t) {
        if (t.jenis === 'AMBIL' && t.alur === 'LUAR' && t.status === 'AKTIF' && num_(t.ts) <= rekapTs) {
          var id = String(t.barang_id);
          before[id] = r_((before[id] || 0) + num_(t.jumlah));
        }
      });
      var barisRows = [];
      rows_('Barang').forEach(function (b) {
        var id = String(b.id);
        var diambil = before[id] || 0;
        if (diambil > 0) {
          barisRows.push({
            rekap_id: rekapId,
            barang_id: id,
            barang: b.nama,
            saldo_awal: 0,
            diambil: diambil,
            sisa: 0,
            terpakai: diambil,
            catatan: 'Penutupan otomatis data September'
          });
        }
      });
      appendBatch_('RekapBaris', barisRows);
      barisAdded = barisRows.length;
    }
    var shB = sheet_('Barang');
    var lr = shB.getLastRow();
    if (lr > 1) {
      var colIdx = SHEETS['Barang'].indexOf('stok_luar') + 1;
      shB.getRange(2, colIdx, lr - 1, 1).setValue(0);
    }
    return {
      ok: true,
      rekap_id: rekapId,
      rekap_waktu: rekapWaktu,
      baris_ditutup: barisAdded,
      transaksi_terakhir: fmt_(maxTs)
    };
  });
}

function doGet(e) {
  var mode = (e && e.parameter && e.parameter.mode) === 'admin' ? 'admin' : 'tablet';
  var html = HtmlService.createHtmlOutputFromFile('index').getContent().replace('__SEGARA_MODE__', mode);
  return HtmlService.createHtmlOutput(html)
    .setTitle('Stok Segara')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/* ---------- Setup (jalankan sekali dari editor) ---------- */
function requireEditorOrAdmin_(pin, token) {
  var isEditor = false;
  try {
    if (typeof Session !== 'undefined' && Session.getActiveUser) {
      var u = Session.getActiveUser().getEmail();
      if (u && u.trim()) isEditor = true;
    }
  } catch (e) {}
  if (isEditor) return true;

  // Jika dipanggil dari web app / client tablet via google.script.run, wajib otentikasi admin
  auth_(pin, token);
  return true;
}

function setup(pin, token) {
  requireEditorOrAdmin_(pin, token);
  // Script yang dibuat dari Sheet (Ekstensi → Apps Script) memakai sheet itu;
  // script standalone memakai DEFAULT_SS_ID.
  var ss = SpreadsheetApp.getActiveSpreadsheet() || (DEFAULT_SS_ID ? SpreadsheetApp.openById(DEFAULT_SS_ID) : null);
  if (!ss) throw new Error('Isi DEFAULT_SS_ID di Kode.gs, atau buka Apps Script dari Google Sheet (Ekstensi → Apps Script).');
  var p = PropertiesService.getScriptProperties();
  p.setProperty('SS_ID', ss.getId());
  if (!p.getProperty('ADMIN_PIN')) p.setProperty('ADMIN_PIN', hashPin_('12345', adminSalt_()));
  SS_ = ss;
  if (typeof ss.setSpreadsheetTimeZone === 'function') {
    try { ss.setSpreadsheetTimeZone(TZ); } catch (e) {}
  }
  Object.keys(SHEETS).forEach(function (n) {
    var s = ss.getSheetByName(n) || ss.insertSheet(n);
    if (s.getLastRow() === 0) {
      s.appendRow(SHEETS[n]);
      s.setFrozenRows(1);
      s.getRange(1, 1, 1, SHEETS[n].length).setFontWeight('bold');
    }
  });
  ['Sheet1', 'Lembar1'].forEach(function (n) {
    var d = ss.getSheetByName(n);
    if (d && d.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(d);
  });
  migrasi_(ss);
  if (getSetting_('jam_tutup') === '') setSetting_('jam_tutup', '21:00');
  if (getSetting_('urutan_kategori') === '') {
    var defaultUrut = DATA_SEGARA.map(function (g) { return g[0]; });
    setSetting_('urutan_kategori', JSON.stringify(defaultUrut));
  }
}

/* ---------- Helpers ---------- */
function ss_() {
  if (SS_) return SS_;
  var active = null;
  try { active = SpreadsheetApp.getActiveSpreadsheet(); } catch (e) {}
  var id = PropertiesService.getScriptProperties().getProperty('SS_ID') || (active ? active.getId() : '') || DEFAULT_SS_ID;
  if (!id) throw new Error('Sistem belum di-setup. Jalankan fungsi setup di editor Apps Script.');
  SS_ = (active && active.getId() === id) ? active : SpreadsheetApp.openById(id);
  if (PropertiesService.getScriptProperties().getProperty('SKEMA') !== SKEMA_V) migrasi_(SS_);
  return SS_;
}
function sheet_(n) { return ss_().getSheetByName(n); }
function rows_(n) {
  var v = sheet_(n).getDataRange().getValues();
  if (!v || !v.length) return [];
  var h = v.shift();
  // Validasi skema: pastikan kolom wajib yang didefinisikan di SHEETS[n] tidak hilang/diubah
  var expectedCols = SHEETS[n];
  if (expectedCols) {
    for (var c = 0; c < expectedCols.length; c++) {
      var colName = expectedCols[c];
      if (h.indexOf(colName) === -1) {
        throw new Error('Kolom wajib "' + colName + '" tidak ditemukan di sheet "' + n + '". Pastikan judul kolom tidak diubah.');
      }
    }
  }
  return v.map(function (r, i) {
    var o = { _row: i + 2 };
    h.forEach(function (k, j) { var x = r[j]; if (x instanceof Date) x = fmt_(x.getTime()); o[k] = x; });
    return o;
  }).filter(function (o) {
    return Object.keys(o).some(function (k) { return k !== '_row' && String(o[k] === null || o[k] === undefined ? '' : o[k]).trim() !== ''; });
  });
}
// Semua teks ditulis dengan awalan ' agar Sheets menyimpannya apa adanya: tidak dijadikan
// rumus (=, +, -, @), angka (PIN "0123" → 123, ID "00123…"), tanggal ("1/2") atau jam ("21:00").
// Awalan ' tidak ikut tersimpan sebagai isi sel.
function safeCell_(v) {
  if (typeof v === 'string' && v !== '') return "'" + v;
  return v;
}
function append_(n, o) { sheet_(n).appendRow(SHEETS[n].map(function (k) { return safeCell_(o[k] === undefined ? '' : o[k]); })); }
function update_(n, o) {
  var h = SHEETS[n];
  sheet_(n).getRange(o._row, 1, 1, h.length).setValues([h.map(function (k) { return safeCell_(o[k] === undefined ? '' : o[k]); })]);
}
function find_(n, id) { return rows_(n).filter(function (o) { return String(o.id) === String(id); })[0]; }
function clean_(o) { var c = {}; Object.keys(o).forEach(function (k) { if (k !== '_row') c[k] = o[k]; }); return c; }
// Diawali huruf agar ID tidak pernah terlihat seperti angka (mis. "0123456789" atau "12e4567890").
function uid_() { return 'x' + Utilities.getUuid().replace(/-/g, '').slice(0, 9); }
function parseNum_(val) {
  if (val === '' || val === null || val === undefined) return NaN;
  if (typeof val === 'number') return Number.isFinite(val) ? val : NaN;
  var s = String(val).trim();
  if (!s) return NaN;
  if (s.indexOf('.') >= 0 && s.indexOf(',') >= 0) {
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      s = s.replace(/,/g, '');
    }
  } else if (s.indexOf(',') >= 0) {
    s = s.replace(',', '.');
  } else if (s.indexOf('.') >= 0) {
    if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
      s = s.replace(/\./g, '');
    }
  }
  var n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}
function num_(x) {
  var n = parseNum_(x);
  return Number.isFinite(n) ? n : 0;
}
function numWajib_(x, label) {
  var n = parseNum_(x);
  if (!Number.isFinite(n)) throw new Error(label + ' tidak valid: ' + x);
  return n;
}
function r_(x) { return Math.round(x * 1000) / 1000; }
function truthy_(x) { return x === true || String(x).toUpperCase() === 'TRUE'; }
function fmt_(ms) { return Utilities.formatDate(new Date(ms), TZ, 'dd/MM/yyyy HH:mm'); }
function lock_(fn) {
  var l = LockService.getScriptLock();
  l.waitLock(20000);
  try { return fn(); } finally { l.releaseLock(); }
}
// Pengaturan dibaca sebagai teks tampilan: sel jam lama ("21:00" yang sudah diubah Sheets menjadi
// nilai waktu 30/12/1899) tidak ikut bergeser zona waktu historis.
function settings_() {
  var v = sheet_('Pengaturan').getDataRange().getDisplayValues();
  v.shift();
  return v.map(function (r, i) { return { _row: i + 2, kunci: String(r[0]), nilai: String(r[1]) }; })
    .filter(function (o) { return o.kunci !== ''; });
}
function getSetting_(k) {
  var r = settings_().filter(function (o) { return o.kunci === k; })[0];
  return r ? r.nilai : '';
}
function setSetting_(k, v) {
  var r = settings_().filter(function (o) { return o.kunci === k; })[0];
  if (r) { r.nilai = String(v); update_('Pengaturan', r); } else append_('Pengaturan', { kunci: k, nilai: String(v) });
}
// "21:00", "21.00.00" (locale id), "9:00:00 PM" → "21:00". '' jika tidak dikenali.
function jam_(s) {
  var m = /(\d{1,2})[:.](\d{2})(?:[:.]\d{2})?\s*([AaPp][Mm])?/.exec(String(s || ''));
  if (!m) return '';
  var h = Number(m[1]), mi = Number(m[2]), ap = (m[3] || '').toUpperCase();
  if (ap === 'PM' && h < 12) h += 12;
  if (ap === 'AM' && h === 12) h = 0;
  if (h > 23 || mi > 59) return '';
  return (h < 10 ? '0' : '') + h + ':' + (mi < 10 ? '0' : '') + mi;
}
function jamTutup_() { return jam_(getSetting_('jam_tutup')); }
// PIN karyawan sebagai teks. Sel lama bisa berupa angka (Sheets membuang nol di depan).
function pinK_(k) { return k.pin === null || k.pin === undefined ? '' : String(k.pin).trim(); }
function pinLen_(k) {
  var s = pinK_(k);
  if (!s) return 0;
  if (typeof k.pin === 'number') {
    var numStr = String(k.pin);
    return numStr.length >= 4 && numStr.length <= 6 ? numStr.length : 4;
  }
  if (s.indexOf('$') > 0) {
    var len = parseInt(s.split('$')[0], 10);
    if (len >= 4 && len <= 6) return len;
  }
  if (/^\d{4,6}$/.test(s)) return s.length;
  return 4;
}
function cache_() {
  try {
    return typeof CacheService !== 'undefined' ? CacheService.getScriptCache() : null;
  } catch (e) {
    return null;
  }
}
function safeEqual_(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  var mismatch = a.length === b.length ? 0 : 1;
  var len = Math.min(a.length, b.length);
  for (var i = 0; i < len; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

function rateLimitGuard_(key, cd) {
  var c = cache_();
  if (!c) return;
  if (c.get('rl_lock_' + key)) throw new Error('Terlalu banyak percobaan gagal. Silakan tunggu ' + (cd || 60) + ' detik.');
}

function rateLimitCatatGagal_(key, cd) {
  var c = cache_();
  if (!c) return;
  var fk = 'rl_fail_' + key, lk = 'rl_lock_' + key, ek = 'rl_esc_' + key;
  var count = Number(c.get(fk) || 0) + 1;
  var esc = Number(c.get(ek) || 0);
  var durations = [60, 300, 1800];
  var lockSec = cd || durations[Math.min(esc, durations.length - 1)];
  if (count >= 5) {
    c.put(lk, 'locked', lockSec);
    c.remove(fk);
    c.put(ek, String(esc + 1), 3600);
  } else {
    c.put(fk, String(count), 120);
  }
}

function rateLimitReset_(key) {
  var c = cache_();
  if (!c) return;
  c.remove('rl_fail_' + key);
  c.remove('rl_lock_' + key);
  c.remove('rl_esc_' + key);
}

function hashPin_(rawPin, salt) {
  if (!rawPin || String(rawPin).trim() === '') return '';
  var raw = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(rawPin).trim() + ':' + String(salt),
    Utilities.Charset.UTF_8
  );
  return Utilities.base64Encode(raw);
}

function adminSalt_() {
  var p = PropertiesService.getScriptProperties();
  var id = (p && p.getProperty('SS_ID')) || DEFAULT_SS_ID || 'segara';
  return 'segara_admin_' + id;
}

function karyawanSalt_(karyawanId) {
  var p = PropertiesService.getScriptProperties();
  var id = (p && p.getProperty('SS_ID')) || DEFAULT_SS_ID || 'segara';
  return 'segara_karyawan_' + karyawanId + '_' + id;
}

function pin_() {
  var p = PropertiesService.getScriptProperties().getProperty('ADMIN_PIN');
  if (!p) throw new Error('Sistem belum di-setup. Jalankan fungsi setup di editor Apps Script.');
  return p;
}

function cekAnyAdminPin_(inputPin) {
  var input = String(inputPin || '').trim();
  if (!input) return null;
  var list = getAuthWhitelist_();
  for (var i = 0; i < list.length; i++) {
    var a = list[i];
    if (a.role === 'admin' && truthy_(a.aktif) && a.pinHash) {
      var salt = a.salt || adminSalt_(a.email);
      if (safeEqual_(a.pinHash, hashPin_(input, salt))) {
        return a.email;
      }
    }
  }
  var p = PropertiesService.getScriptProperties();
  var legacy = p && p.getProperty('ADMIN_PIN');
  if (legacy) {
    var legacyHash = hashPin_(input, adminSalt_());
    var isAlreadyHashed = typeof legacy === 'string' && /^[A-Za-z0-9+/]{43}=$/.test(legacy);
    if (safeEqual_(legacy, legacyHash) || (!isAlreadyHashed && safeEqual_(legacy, input))) return 'admin';
  }
  return null;
}

function cekAdminPin_(inputPin) {
  var p = pin_();
  var input = String(inputPin || '').trim();
  if (!input) return false;
  var hashed = hashPin_(input, adminSalt_());
  if (safeEqual_(p, hashed)) return true;
  // Kompatibilitas mundur: hanya jika data di Script Properties masih berupa plaintext (bukan hash base64)
  var isAlreadyHashed = typeof p === 'string' && /^[A-Za-z0-9+/]{43}=$/.test(p);
  if (!isAlreadyHashed && safeEqual_(p, input)) {
    PropertiesService.getScriptProperties().setProperty('ADMIN_PIN', hashed);
    return true;
  }
  return false;
}

function requireSession_(token, allowedRole) {
  var p = PropertiesService.getScriptProperties();
  if (p && p.getProperty('SKIP_AUTH_SESSION') === '1' && !token) {
    return { valid: true, role: 'admin', email: 'test@segara.com' };
  }
  if (!token || typeof token !== 'string') {
    throw new Error('Akses ditolak: sesi login wajib disertakan.');
  }
  var v = verifySessionToken(token);
  if (!v.valid) {
    throw new Error(v.error || 'Akses ditolak: sesi login tidak valid.');
  }
  if (allowedRole && v.role !== allowedRole && v.role !== 'admin') {
    throw new Error('Akses ditolak: peran "' + v.role + '" tidak memiliki izin untuk operasi ini.');
  }
  return v;
}

function withIdempotency_(key, fn) {
  if (!key || typeof key !== 'string') return fn();
  var c = cache_();
  var cacheKey = 'idem_' + String(key).trim();
  if (c) {
    var cached = c.get(cacheKey);
    if (cached) {
      try { return JSON.parse(cached); } catch (e) { return cached; }
    }
    var inFlightKey = 'idem_inflight_' + String(key).trim();
    if (c.get(inFlightKey)) {
      throw new Error('Permintaan sedang diproses di server. Tunggu sebentar.');
    }
    c.put(inFlightKey, '1', 60);
  }

  try {
    var result = fn();
    if (c) {
      try {
        c.put(cacheKey, JSON.stringify(result === undefined ? true : result), 600);
      } catch (e) {
        c.put(cacheKey, String(result), 600);
      }
      c.remove('idem_inflight_' + String(key).trim());
    }
    return result;
  } catch (err) {
    if (c) c.remove('idem_inflight_' + String(key).trim());
    throw err;
  }
}

function cekAdminAccountPin_(email, inputPin) {
  var input = String(inputPin || '').trim();
  if (!input) return false;
  var acc = findAuthAccount_(email);
  if (acc) {
    if (acc.pinHash) {
      var salt = acc.salt || adminSalt_(acc.email || email);
      var hashed = hashPin_(input, salt);
      return safeEqual_(acc.pinHash, hashed);
    }
  }
  return cekAdminPin_(input);
}

function auth_(pin, token) {
  var p = PropertiesService.getScriptProperties();
  var skipAuth = p && p.getProperty('SKIP_AUTH_SESSION') === '1';
  var sess = null;
  if (!skipAuth) {
    sess = requireSession_(token, 'admin');
  }
  var rateKey = sess && sess.email ? 'admin_' + sess.email : 'admin_anon';
  rateLimitGuard_(rateKey, 60);
  var valid = (sess && sess.email) ? cekAdminAccountPin_(sess.email, pin) : cekAdminPin_(pin);
  if (!valid) {
    rateLimitCatatGagal_(rateKey, 60);
    catatLogLogin_(sess ? sess.email : 'admin', 'PIN', 'admin', 'GAGAL - PIN SALAH', '');
    throw new Error('PIN salah');
  }
  rateLimitReset_(rateKey);
}

function pub_(b) {
  return { id: String(b.id), nama: String(b.nama), satuan: String(b.satuan), kategori: String(b.kategori || ''),
    stok_dalam: num_(b.stok_dalam), stok_luar: num_(b.stok_luar), ambang_min: num_(b.ambang_min),
    alur: b.alur === 'LANGSUNG_HABIS' ? 'LANGSUNG_HABIS' : 'LUAR', aktif: truthy_(b.aktif),
    kode: String(b.kode || ''), catatan: String(b.catatan || ''),
    bisa_produksi: truthy_(b.bisa_produksi) };
}
function lastRekapTs_() {
  return rows_('Rekap').reduce(function (m, r) { return Math.max(m, num_(r.ts)); }, 0);
}
function openTx_(last) {
  return rows_('Transaksi').filter(function (t) {
    return t.jenis === 'AMBIL' && t.alur === 'LUAR' && t.status === 'AKTIF' && num_(t.ts) > last;
  });
}
function status_() {
  var last = lastRekapTs_();
  var tx = openTx_(last);
  var d = new Date(); d.setHours(0, 0, 0, 0);
  var today0 = d.getTime();
  var luar = rows_('Barang').filter(function (b) {
    return b.alur !== 'LANGSUNG_HABIS' && num_(b.stok_luar) > 0;
  }).length;
  return {
    belumRekap: tx.length,
    lewatHari: tx.some(function (t) { return num_(t.ts) < today0; }),
    lastRekap: last ? fmt_(last) : null,
    barangLuar: luar
  };
}

/* ---------- Tablet ---------- */
// Karyawan tidak boleh melihat stok gudang (stok_dalam), tapi stok_luar (di depan/dapur) ditampilkan.
function tab_(b) { return { id: b.id, nama: b.nama, satuan: b.satuan, kategori: b.kategori, alur: b.alur, kode: b.kode, catatan: b.catatan, stok_luar: num_(b.stok_luar), bisa_produksi: truthy_(b.bisa_produksi) }; }
function produksiKaryawan(karyawanId, barangId, jumlah, catatan, clientTxId, token) {
  var tok = token || (typeof clientTxId === 'string' && clientTxId.indexOf('.') > 0 ? clientTxId : null);
  var idemKey = clientTxId && clientTxId !== tok ? clientTxId : null;
  requireSession_(tok, 'tablet');
  return withIdempotency_(idemKey, function () {
    jumlah = r_(num_(jumlah));
    if (!(jumlah > 0)) throw new Error('Jumlah harus lebih dari 0');
    return lock_(function () {
      var b = find_('Barang', barangId), k = find_('Karyawan', karyawanId);
      if (!b || !truthy_(b.aktif)) throw new Error('Barang tidak ditemukan');
      if (!k || !truthy_(k.aktif)) throw new Error('Karyawan tidak aktif atau tidak ditemukan');
      if (!truthy_(b.bisa_produksi)) throw new Error('Barang ini tidak diatur untuk produksi karyawan');
      b.stok_dalam = r_(num_(b.stok_dalam) + jumlah);
      update_('Barang', b);
      var ts = Date.now();
      append_('Transaksi', { id: uid_(), ts: ts, waktu: fmt_(ts), jenis: 'PRODUKSI', barang_id: String(b.id), barang: b.nama, jumlah: jumlah,
        karyawan_id: String(k.id), karyawan: k.nama, alur: 'DALAM', supplier: '', status: 'AKTIF', dicatat_oleh: 'karyawan',
        kategori: String(b.kategori || ''), satuan: String(b.satuan || ''), catatan: String(catatan || 'Hasil produksi').trim() });
      return true;
    });
  });
}
function masukKaryawan(karyawanId, barangId, jumlah, supplier, clientTxId, token) {
  return produksiKaryawan(karyawanId, barangId, jumlah, supplier, clientTxId, token);
}
function getTablet(token) {
  requireSession_(token, 'tablet');
  return {
    barang: rows_('Barang').map(pub_).filter(function (b) { return b.aktif; }).map(tab_),
    karyawan: rows_('Karyawan').filter(function (k) { return truthy_(k.aktif); }).map(function (k) {
      return { id: String(k.id), nama: String(k.nama), punyaPin: pinK_(k) !== '', pinLen: pinLen_(k) };
    }),
    status: status_(),
    urutan: urutanKategori_(),
    jamTutup: jamTutup_()
  };
}

function ambil_(karyawanId, barangId, jumlah, ts, oleh, catatan) {
  jumlah = r_(num_(jumlah));
  if (!(jumlah > 0)) throw new Error('Jumlah harus lebih dari 0');
  return lock_(function () {
    var b = find_('Barang', barangId), k = find_('Karyawan', karyawanId);
    if (!b || !truthy_(b.aktif)) throw new Error('Barang tidak ditemukan');
    if (!k || (oleh === 'karyawan' && !truthy_(k.aktif))) throw new Error('Karyawan tidak aktif atau tidak ditemukan');
    if (jumlah > num_(b.stok_dalam) + 1e-9) throw new Error(oleh === 'admin' ? 'Stok gudang tidak cukup. Sisa: ' + num_(b.stok_dalam) + ' ' + b.satuan : 'Jumlah melebihi stok gudang yang tercatat. Hubungi admin.');
    var alur = b.alur === 'LANGSUNG_HABIS' ? 'LANGSUNG_HABIS' : 'LUAR';
    b.stok_dalam = r_(num_(b.stok_dalam) - jumlah);
    if (alur === 'LUAR') b.stok_luar = r_(num_(b.stok_luar) + jumlah);
    update_('Barang', b);
    var t = { id: uid_(), ts: ts, waktu: fmt_(ts), jenis: 'AMBIL', barang_id: String(b.id), barang: b.nama, jumlah: jumlah,
      karyawan_id: String(k.id), karyawan: k.nama, alur: alur, status: 'AKTIF', dicatat_oleh: oleh,
      kategori: String(b.kategori || ''), satuan: String(b.satuan || ''), catatan: String(catatan || '').trim() };
    append_('Transaksi', t);
    return { tx: { id: t.id, ts: ts }, barang: oleh === 'admin' ? pub_(b) : tab_(pub_(b)) };
  });
}
function ambil(karyawanId, barangId, jumlah, arg4, arg5, arg6) {
  var catatan = '';
  var idemKey = null;
  var tok = null;

  if (arguments.length >= 6) {
    catatan = String(arg4 || '');
    idemKey = arg5;
    tok = arg6;
  } else if (arguments.length === 5) {
    if (typeof arg5 === 'string' && /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(arg5)) {
      // Pemanggilan lama: (k, b, j, clientTxId, token)
      idemKey = arg4;
      tok = arg5;
    } else {
      // Pemanggilan baru tanpa token (mis. test): (k, b, j, catatan, clientTxId)
      catatan = String(arg4 || '');
      idemKey = arg5;
    }
  } else if (arguments.length === 4) {
    if (typeof arg4 === 'string' && /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(arg4)) {
      tok = arg4;
    } else {
      idemKey = arg4;
    }
  }

  requireSession_(tok, 'tablet');
  return withIdempotency_(idemKey, function () {
    return ambil_(karyawanId, barangId, jumlah, Date.now(), 'karyawan', catatan);
  });
}

function batalAmbil(txId, pin, token) {
  requireSession_(token, 'tablet');
  return lock_(function () {
    var adminEmail = null;
    if (pin) {
      var input = String(pin).trim();
      adminEmail = cekAnyAdminPin_(input);
      if (!adminEmail && cekAdminPin_(input)) adminEmail = 'admin@segara.com';
    }
    var t = find_('Transaksi', txId);
    if (!t || t.jenis !== 'AMBIL' || t.status !== 'AKTIF') throw new Error('Transaksi tidak bisa dibatalkan');
    var isOverTime = Date.now() - num_(t.ts) > 65000;
    if (isOverTime) {
      if (!adminEmail) {
        if (!pin || !String(pin).trim()) throw new Error('Batas 60 detik lewat. Minta admin untuk membatalkan.');
        throw new Error('PIN admin salah');
      }
    }
    if (num_(t.ts) <= lastRekapTs_()) throw new Error('Sudah direkap. Koreksi lewat edit rekap atau opname.');
    var b = find_('Barang', t.barang_id);
    if (!b) throw new Error('Barang tidak ditemukan');
    b.stok_dalam = r_(num_(b.stok_dalam) + num_(t.jumlah));
    if (t.alur === 'LUAR') b.stok_luar = Math.max(0, r_(num_(b.stok_luar) - num_(t.jumlah)));
    update_('Barang', b);
    t.status = 'BATAL';
    if (adminEmail) t.dicatat_oleh = adminEmail;
    update_('Transaksi', t);
    return true;
  });
}

function batalProduksi(txId, pin, token) {
  auth_(pin, token);
  return lock_(function () {
    var t = find_('Transaksi', txId);
    if (!t || t.jenis !== 'PRODUKSI' || t.status !== 'AKTIF') throw new Error('Transaksi tidak bisa dibatalkan');
    var b = find_('Barang', t.barang_id);
    if (!b) throw new Error('Barang tidak ditemukan');
    var j = num_(t.jumlah);
    if (num_(b.stok_dalam) < j - 1e-9) {
      throw new Error('Gagal membatalkan: Sisa stok gudang (' + num_(b.stok_dalam) + ' ' + b.satuan + ') tidak mencukupi untuk menarik kembali ' + j + ' ' + b.satuan + ' hasil produksi.');
    }
    b.stok_dalam = Math.max(0, r_(num_(b.stok_dalam) - j));
    update_('Barang', b);
    t.status = 'BATAL';
    t.catatan = (t.catatan ? String(t.catatan).trim() + ' · ' : '') + 'Dibatalkan admin';
    update_('Transaksi', t);
    return true;
  });
}

function batalMasuk(txId, pin, token) {
  var p = PropertiesService.getScriptProperties();
  var skipAuth = p && p.getProperty('SKIP_AUTH_SESSION') === '1';
  var sessEmail = 'admin';
  if (!skipAuth) {
    var sess = requireSession_(token, 'admin');
    if (sess && sess.email) sessEmail = sess.email;
  }
  auth_(pin, token);
  return lock_(function () {
    var t = find_('Transaksi', txId);
    if (!t || t.jenis !== 'MASUK' || t.status !== 'AKTIF') throw new Error('Transaksi tidak bisa dibatalkan');
    if (t.dicatat_oleh !== 'admin' && t.dicatat_oleh !== sessEmail) {
      throw new Error('Hanya bisa membatalkan stok masuk yang dicatat oleh akun Anda sendiri (' + sessEmail + ').');
    }
    var b = find_('Barang', t.barang_id);
    if (!b) throw new Error('Barang tidak ditemukan');
    var j = num_(t.jumlah);
    if (num_(b.stok_dalam) < j - 1e-9) {
      throw new Error('Gagal membatalkan: Sisa stok gudang (' + num_(b.stok_dalam) + ' ' + b.satuan + ') tidak mencukupi untuk menarik kembali ' + j + ' ' + b.satuan + ' stok masuk.');
    }
    b.stok_dalam = Math.max(0, r_(num_(b.stok_dalam) - j));
    update_('Barang', b);
    t.status = 'BATAL';
    t.catatan = (t.catatan ? String(t.catatan).trim() + ' · ' : '') + 'Dibatalkan admin';
    update_('Transaksi', t);
    return true;
  });
}

function hitungRekap_(cutoff, last) {
  if (last === undefined) last = lastRekapTs_();
  var before = {}, after = {};
  openTx_(last).forEach(function (t) {
    var m = num_(t.ts) <= cutoff ? before : after, id = String(t.barang_id);
    m[id] = r_((m[id] || 0) + num_(t.jumlah));
  });
  return rows_('Barang').filter(function (b) {
    return truthy_(b.aktif) && b.alur !== 'LANGSUNG_HABIS';
  }).map(function (b) {
    var id = String(b.id), d = before[id] || 0, a = after[id] || 0, luar = num_(b.stok_luar);
    var awal = Math.max(0, r_(luar - d - a));
    return { barang_id: id, nama: String(b.nama), satuan: String(b.satuan), saldo_awal: awal, diambil: d, setelah: a, maks: r_(awal + d) };
  }).filter(function (x) { return x.maks > 0; });
}
function rekapDraf(token) {
  requireSession_(token, 'tablet');
  var c = Date.now();
  return { cutoff: c, baris: hitungRekap_(c) };
}

function simpanRekap(cutoff, karyawanId, input, clientTxId, token) {
  var tok = token || (typeof clientTxId === 'string' && clientTxId.indexOf('.') > 0 ? clientTxId : null);
  var idemKey = clientTxId && clientTxId !== tok ? clientTxId : null;
  requireSession_(tok, 'tablet');
  return withIdempotency_(idemKey, function () {
    cutoff = num_(cutoff);
    if (cutoff > Date.now() + 60000) throw new Error('Waktu rekap tidak boleh di masa depan');
    return lock_(function () {
      var last = lastRekapTs_();
      if (cutoff <= last) throw new Error('Sudah ada rekap yang lebih baru. Buka ulang menu rekap.');
      var k = find_('Karyawan', karyawanId);
      if (!k || !truthy_(k.aktif)) throw new Error('Karyawan tidak aktif atau tidak ditemukan');
      var draf = hitungRekap_(cutoff, last), barang = rows_('Barang'), by = {};
      (input || []).forEach(function (i) { by[String(i.barang_id)] = i; });
      draf.forEach(function (r) {
        var i = by[r.barang_id];
        if (!i || i.sisa === '' || i.sisa === null || i.sisa === undefined) throw new Error('Sisa ' + r.nama + ' belum diisi');
        var s = r_(numWajib_(i.sisa, 'Sisa ' + r.nama));
        if (s < 0 || s > r.maks + 1e-9) throw new Error('Sisa ' + r.nama + ' harus 0 sampai ' + r.maks);
      });
      var id = uid_();
      append_('Rekap', { id: id, ts: cutoff, waktu: fmt_(cutoff), karyawan_id: String(k.id), karyawan: k.nama, diedit_admin: false, status: 'PENDING', approved_ts: '' });
      draf.forEach(function (r) {
        var i = by[r.barang_id], s = r_(num_(i.sisa));
        var b = barang.filter(function (x) { return String(x.id) === r.barang_id; })[0];
        if (b) {
          b.stok_luar = r_(s + r.setelah);
          update_('Barang', b);
        }
        var terpakai = r_(r.maks - s);
        append_('RekapBaris', { rekap_id: id, barang_id: r.barang_id, barang: r.nama, saldo_awal: r.saldo_awal, diambil: r.diambil,
          sisa: s, terpakai: terpakai, catatan: i.catatan || '', terjual: 0, selisih: terpakai });
      });
      return { id: id };
    });
  });
}

/* ---------- Admin ---------- */
function adminData(pin, token) {
  auth_(pin, token);
  var desc = function (a, b) { return num_(b.ts) - num_(a.ts); };
  var allRekapList = rows_('Rekap');
  var pendingRekap = allRekapList.filter(function (r) { return String(r.status || '').toUpperCase() === 'PENDING'; }).sort(desc);
  var approvedRekap = allRekapList.filter(function (r) { return String(r.status || '').toUpperCase() !== 'PENDING'; }).sort(desc).slice(0, 30);
  var rekap = pendingRekap.concat(approvedRekap).map(clean_);
  var baris = rows_('RekapBaris');
  rekap.forEach(function (r) {
    r.diedit_admin = truthy_(r.diedit_admin);
    r.status = r.status ? String(r.status).toUpperCase() : 'APPROVED';
    r.baris = baris.filter(function (x) { return String(x.rekap_id) === String(r.id); }).map(function (b) {
      var cb = clean_(b);
      var adaSelisih = cb.selisih !== undefined && cb.selisih !== null && String(cb.selisih).trim() !== '';
      var adaTerjual = cb.terjual !== undefined && cb.terjual !== null && String(cb.terjual).trim() !== '';
      if (adaSelisih || adaTerjual) {
        cb.terjual = num_(cb.terjual) || 0;
        cb.selisih = adaSelisih ? num_(cb.selisih) : r_(num_(cb.terpakai) - cb.terjual);
      } else {
        // Data lama (sebelum ada fitur terjual & selisih): tidak ada selisih
        cb.terjual = num_(cb.terpakai);
        cb.selisih = 0;
      }
      return cb;
    });
  });
  return {
    barang: rows_('Barang').map(pub_),
    karyawan: rows_('Karyawan').map(function (k) {
      return { id: String(k.id), nama: String(k.nama), aktif: truthy_(k.aktif), punyaPin: pinK_(k) !== '', pinLen: pinLen_(k) };
    }),
    transaksi: rows_('Transaksi').sort(desc).slice(0, 400).map(clean_),
    rekap: rekap,
    opname: rows_('Opname').sort(desc).slice(0, 100).map(clean_),
    status: status_(),
    lastRekap: lastRekapTs_(),
    urutan: urutanKategori_(),
    jamTutup: jamTutup_(),
    url: ss_().getUrl(),
    daftarSupplier: daftarSupplier_()
  };
}

function simpanBarang(pin, o, token) {
  auth_(pin, token);
  return lock_(function () {
    if (!String(o.nama || '').trim() || !String(o.satuan || '').trim()) throw new Error('Nama dan satuan wajib diisi');
    var min = r_(num_(o.ambang_min));
    if (min < 0) throw new Error('Ambang minimum tidak boleh negatif');
    var alur = o.alur === 'LANGSUNG_HABIS' ? 'LANGSUNG_HABIS' : 'LUAR';
    var kd = String(o.kode || '').trim();
    if (kd && rows_('Barang').some(function (x) { return String(x.kode || '').trim().toLowerCase() === kd.toLowerCase() && String(x.id) !== String(o.id || ''); })) throw new Error('Kode ' + kd + ' sudah dipakai barang lain');
    if (o.id) {
      var b = find_('Barang', o.id);
      if (!b) throw new Error('Barang tidak ditemukan');
      var aktif = o.aktif !== false;
      if (!aktif && truthy_(b.aktif) && (num_(b.stok_dalam) > 0 || num_(b.stok_luar) > 0))
        throw new Error('Barang hanya bisa diarsipkan jika stok dalam dan luar = 0');
      b.nama = o.nama.trim(); b.satuan = o.satuan.trim(); b.kategori = (o.kategori || '').trim();
      if (o.kode !== undefined) b.kode = kd;
      if (o.catatan !== undefined) b.catatan = String(o.catatan || '').trim();
      b.alur = alur; b.ambang_min = min; b.aktif = aktif;
      b.bisa_produksi = truthy_(o.bisa_produksi);
      update_('Barang', b);
    } else {
      var awal = r_(num_(o.stok_awal));
      if (awal < 0) throw new Error('Stok awal tidak boleh negatif');
      var id = uid_(), ts = Date.now();
      append_('Barang', { id: id, nama: o.nama.trim(), satuan: o.satuan.trim(), kategori: (o.kategori || '').trim(),
        stok_dalam: awal, stok_luar: 0, ambang_min: min, alur: alur, aktif: true,
        kode: kd, catatan: String(o.catatan || '').trim(), bisa_produksi: truthy_(o.bisa_produksi) });
      if (awal > 0) append_('Transaksi', { id: uid_(), ts: ts, waktu: fmt_(ts), jenis: 'MASUK', barang_id: id, barang: o.nama.trim(),
        jumlah: awal, alur: 'DALAM', status: 'AKTIF', dicatat_oleh: 'admin', catatan: 'Stok awal', kategori: (o.kategori || '').trim(), satuan: o.satuan.trim() });
    }
    return true;
  });
}
function hapusBarang(pin, id, token) {
  auth_(pin, token);
  return lock_(function () {
    var b = find_('Barang', id);
    if (!b) throw new Error('Barang tidak ditemukan');
    if (num_(b.stok_dalam) > 0 || num_(b.stok_luar) > 0) {
      throw new Error('Barang masih memiliki stok (gudang: ' + num_(b.stok_dalam) + ', luar: ' + num_(b.stok_luar) + '). Nolkan stok terlebih dahulu sebelum menghapus/mengarsipkan.');
    }
    var sid = String(id);
    var punyaRiwayat = rows_('Transaksi').some(function (t) { return String(t.barang_id) === sid; }) ||
                       rows_('RekapBaris').some(function (r) { return String(r.barang_id) === sid; }) ||
                       rows_('Opname').some(function (o) { return String(o.barang_id) === sid; });
    if (punyaRiwayat) {
      b.aktif = false;
      update_('Barang', b);
      return {
        status: 'archived',
        nama: b.nama,
        message: 'Barang memiliki riwayat transaksi sehingga otomatis diarsipkan (disembunyikan dari tablet dapur & menu harian) agar riwayat laporan tidak hilang.'
      };
    }
    sheet_('Barang').deleteRow(b._row);
    return {
      status: 'deleted',
      nama: b.nama,
      message: 'Barang berhasil dihapus permanen karena belum memiliki riwayat transaksi.'
    };
  });
}


function simpanKaryawan(pin, o, token) {
  auth_(pin, token);
  var nm = String(o.nama || '').trim();
  if (!nm) throw new Error('Nama wajib diisi');
  return lock_(function () {
    if (rows_('Karyawan').some(function (x) { return String(x.nama).toLowerCase() === nm.toLowerCase() && String(x.id) !== String(o.id || ''); }))
      throw new Error('Karyawan dengan nama ' + nm + ' sudah ada');
    var pVal = (o.pin === undefined || o.pin === null) ? undefined : String(o.pin).trim();
    if (pVal !== undefined && pVal !== '' && !/^\d{4,6}$/.test(pVal)) throw new Error('PIN karyawan harus 4–6 angka');
    if (o.id) {
      var k = find_('Karyawan', o.id);
      if (!k) throw new Error('Karyawan tidak ditemukan');
      k.nama = nm; k.aktif = o.aktif !== false;
      if (pVal !== undefined) k.pin = pVal ? (pVal.length + '$' + hashPin_(pVal, karyawanSalt_(k.id))) : '';
      update_('Karyawan', k);
    } else {
      var newId = uid_();
      append_('Karyawan', { id: newId, nama: nm, aktif: true, pin: pVal ? (pVal.length + '$' + hashPin_(pVal, karyawanSalt_(newId))) : '' });
    }
    return true;
  });
}

function tambahKategori(pin, namaKategori, token) {
  auth_(pin, token);
  var kat = String(namaKategori || '').trim();
  if (!kat) throw new Error('Nama kategori tidak boleh kosong');
  if (kat.toLowerCase() === 'lainnya') {
    throw new Error('Kategori "Lainnya" sudah ada sebagai kategori bawaan');
  }
  return lock_(function () {
    var urut = urutanKategori_();
    if (urut.length === 0) {
      var s = [];
      rows_('Barang').forEach(function (b) {
        var k = String(b.kategori || '').trim();
        if (k && s.indexOf(k) === -1) s.push(k);
      });
      urut = s;
    }
    if (urut.some(function (k) { return k.toLowerCase() === kat.toLowerCase(); })) {
      throw new Error('Kategori "' + kat + '" sudah ada');
    }
    urut.push(kat);
    setSetting_('urutan_kategori', JSON.stringify(urut));
    return { status: 'created', nama: kat, message: 'Kategori "' + kat + '" berhasil ditambahkan' };
  });
}
function daftarSupplier_() {
  var s = getSetting_('daftar_supplier');
  var list = [];
  if (s) {
    try { list = JSON.parse(s); } catch (e) {}
  }
  var set = {};
  var res = [];
  var tambah = function (nm) {
    var clean = String(nm || '').trim();
    if (!clean) return;
    var lower = clean.toLowerCase();
    if (!set[lower]) {
      set[lower] = true;
      res.push(clean);
    }
  };
  tambah('CV. Dapur Rumah Rasa');
  if (Array.isArray(list)) list.forEach(tambah);
  rows_('Transaksi').forEach(function (t) {
    tambah(t.supplier);
  });
  return res;
}

function tambahSupplier(pin, namaSupplier, token) {
  auth_(pin, token);
  var sup = String(namaSupplier || '').trim();
  if (!sup) throw new Error('Nama supplier tidak boleh kosong');
  return lock_(function () {
    var list = daftarSupplier_();
    var exists = list.some(function (s) { return s.toLowerCase() === sup.toLowerCase(); });
    if (exists) throw new Error('Supplier "' + sup + '" sudah ada');
    list.push(sup);
    setSetting_('daftar_supplier', JSON.stringify(list));
    return { status: 'created', nama: sup, message: 'Supplier "' + sup + '" berhasil ditambahkan' };
  });
}

function hapusKategori(pin, namaKategori, token) {
  auth_(pin, token);
  var kat = String(namaKategori || '').trim();
  if (!kat) throw new Error('Nama kategori tidak boleh kosong');
  if (kat.toLowerCase() === 'lainnya') {
    throw new Error('Kategori default "Lainnya" tidak dapat dihapus');
  }

  return lock_(function () {
    var urut = urutanKategori_();
    var semuaBarang = rows_('Barang');
    if (urut.length === 0) {
      var s = [];
      semuaBarang.forEach(function (b) {
        var k = String(b.kategori || '').trim();
        if (k && s.indexOf(k) === -1) s.push(k);
      });
      urut = s;
    }

    var adaDiUrutan = urut.some(function (k) { return k.toLowerCase() === kat.toLowerCase(); });
    var barangTerdampak = semuaBarang.filter(function (b) {
      return String(b.kategori || '').trim().toLowerCase() === kat.toLowerCase();
    });

    if (!adaDiUrutan && barangTerdampak.length === 0) {
      throw new Error('Kategori "' + kat + '" tidak ditemukan');
    }

    // 1. Alihkan barang di kategori ini agar kategori menjadi kosong ('') / 'Lainnya'.
    //    Barang TIDAK dihapus sama sekali.
    barangTerdampak.forEach(function (b) {
      b.kategori = '';
      update_('Barang', b);
    });

    // 2. Hapus dari urutan_kategori
    var urutBaru = urut.filter(function (k) {
      return k.toLowerCase() !== kat.toLowerCase();
    });
    setSetting_('urutan_kategori', JSON.stringify(urutBaru));

    // 3. JAMINAN KEAMANAN RIWAYAT:
    //    Sheet Transaksi, Rekap, RekapBaris, dan Opname sama sekali TIDAK dihapus atau diubah
    //    sehingga riwayat transaksi dan jejak audit masa lalu tetap utuh 100%.

    return {
      status: 'deleted',
      nama: kat,
      jumlahBarang: barangTerdampak.length,
      message: 'Kategori "' + kat + '" berhasil dihapus. ' +
        (barangTerdampak.length > 0
          ? barangTerdampak.length + ' barang dialihkan ke kategori "Lainnya". '
          : '') +
        'Riwayat transaksi tetap aman tersimpan.'
    };
  });
}

function hapusKaryawan(pin, id, token) {
  auth_(pin, token);
  return lock_(function () {
    var k = find_('Karyawan', id);
    if (!k) throw new Error('Karyawan tidak ditemukan');
    var sid = String(id);
    var sNama = String(k.nama);
    var punyaRiwayat = rows_('Transaksi').some(function (t) {
      return String(t.karyawan_id) === sid || String(t.karyawan) === sNama;
    }) || rows_('Rekap').some(function (r) {
      return String(r.karyawan_id) === sid || String(r.karyawan) === sNama;
    });
    if (punyaRiwayat) {
      k.aktif = false;
      update_('Karyawan', k);
      return {
        status: 'archived',
        nama: k.nama,
        message: 'Karyawan memiliki riwayat transaksi/rekap sehingga otomatis dinonaktifkan agar riwayat laporan tidak hilang.'
      };
    }
    sheet_('Karyawan').deleteRow(k._row);
    rateLimitReset_('karyawan_' + sid);
    return {
      status: 'deleted',
      nama: k.nama,
      message: 'Karyawan berhasil dihapus permanen karena belum memiliki riwayat transaksi.'
    };
  });
}

function verifikasiPinKaryawan(karyawanId, pin) {
  var k = find_('Karyawan', karyawanId);
  if (!k || !truthy_(k.aktif)) throw new Error('Karyawan tidak aktif atau tidak ditemukan');
  var stored = pinK_(k);
  if (!stored) return true;
  rateLimitGuard_('karyawan_' + karyawanId, 60);
  var input = String(pin || '').trim();
  var hashed = hashPin_(input, karyawanSalt_(karyawanId));
  // Sel lama berisi angka (Sheets membuang nol di depan: "0123" → 123): cocokkan nilai angkanya,
  // hanya untuk input 4–6 digit. Teks biasa harus sama persis.
  var legacyNum = typeof k.pin === 'number' && /^\d{4,6}$/.test(input) && Number(input) === k.pin;
  var storedHash = stored.indexOf('$') > 0 ? stored.split('$')[1] : stored;
  var cocok = (stored === hashed) || (storedHash === hashed) || (stored === input) || legacyNum;
  if (!cocok) {
    rateLimitCatatGagal_('karyawan_' + karyawanId, 60);
    throw new Error('PIN karyawan salah');
  }
  var newStored = input.length + '$' + hashed;
  if (stored !== newStored) {
    k.pin = newStored;
    update_('Karyawan', k);
  }
  rateLimitReset_('karyawan_' + karyawanId);
  return true;
}

function stokMasuk(pin, barangId, jumlah, supplier, catatan, clientTxId, token) {
  var tok = token || (typeof clientTxId === 'string' && clientTxId.indexOf('.') > 0 ? clientTxId : null);
  var idemKey = clientTxId && clientTxId !== tok ? clientTxId : null;
  auth_(pin, tok);
  var p = PropertiesService.getScriptProperties();
  var skipAuth = p && p.getProperty('SKIP_AUTH_SESSION') === '1';
  var sessEmail = 'admin';
  if (!skipAuth) {
    var sess = requireSession_(tok, 'admin');
    if (sess && sess.email) sessEmail = sess.email;
  } else if (tok) {
    try {
      var sessTest = verifySessionToken(tok);
      if (sessTest && sessTest.email) sessEmail = sessTest.email;
    } catch (e) {}
  }
  var acc = findAuthAccount_(sessEmail);
  var adminNama = formatNamaAdmin_(acc ? acc.nama : '', sessEmail);
  return withIdempotency_(idemKey, function () {
    jumlah = r_(num_(jumlah));
    if (!(jumlah > 0)) throw new Error('Jumlah harus lebih dari 0');
    return lock_(function () {
      var b = find_('Barang', barangId);
      if (!b || !truthy_(b.aktif)) throw new Error('Barang tidak ditemukan');
      b.stok_dalam = r_(num_(b.stok_dalam) + jumlah);
      update_('Barang', b);
      var ts = Date.now();
      append_('Transaksi', { id: uid_(), ts: ts, waktu: fmt_(ts), jenis: 'MASUK', barang_id: String(b.id), barang: b.nama, jumlah: jumlah,
        karyawan: adminNama, alur: 'DALAM', supplier: supplier || '', status: 'AKTIF', dicatat_oleh: sessEmail, catatan: catatan || '', kategori: String(b.kategori || ''), satuan: String(b.satuan || '') });
      var supClean = String(supplier || '').trim();
      if (supClean) {
        var dSup = daftarSupplier_();
        if (!dSup.some(function (s) { return s.toLowerCase() === supClean.toLowerCase(); })) {
          dSup.push(supClean);
          setSetting_('daftar_supplier', JSON.stringify(dSup));
        }
      }
      return true;
    });
  });
}

function simpanProduksiAdmin(pin, barangId, jumlah, catatan, clientTxId, token) {
  var tok = token || (typeof clientTxId === 'string' && clientTxId.indexOf('.') > 0 ? clientTxId : null);
  var idemKey = clientTxId && clientTxId !== tok ? clientTxId : null;
  auth_(pin, tok);
  var p = PropertiesService.getScriptProperties();
  var skipAuth = p && p.getProperty('SKIP_AUTH_SESSION') === '1';
  var sessEmail = 'admin';
  if (!skipAuth) {
    var sess = requireSession_(tok, 'admin');
    if (sess && sess.email) sessEmail = sess.email;
  } else if (tok) {
    try {
      var sessTest = verifySessionToken(tok);
      if (sessTest && sessTest.email) sessEmail = sessTest.email;
    } catch (e) {}
  }
  var acc = findAuthAccount_(sessEmail);
  var adminNama = formatNamaAdmin_(acc ? acc.nama : '', sessEmail);
  return withIdempotency_(idemKey, function () {
    jumlah = r_(num_(jumlah));
    if (!(jumlah > 0)) throw new Error('Jumlah harus lebih dari 0');
    return lock_(function () {
      var b = find_('Barang', barangId);
      if (!b || !truthy_(b.aktif)) throw new Error('Barang tidak ditemukan');
      b.stok_dalam = r_(num_(b.stok_dalam) + jumlah);
      update_('Barang', b);
      var ts = Date.now();
      append_('Transaksi', { id: uid_(), ts: ts, waktu: fmt_(ts), jenis: 'PRODUKSI', barang_id: String(b.id), barang: b.nama, jumlah: jumlah,
        karyawan_id: '', karyawan: adminNama, alur: 'DALAM', supplier: '', status: 'AKTIF', dicatat_oleh: sessEmail, catatan: catatan || 'Hasil produksi (Admin)', kategori: String(b.kategori || ''), satuan: String(b.satuan || '') });
    });
  });
}

function ambilAdmin(pin, karyawanId, barangId, jumlah, ts, token) {
  auth_(pin, token);
  ts = num_(ts) || Date.now();
  if (ts > Date.now() + 60000) throw new Error('Waktu tidak boleh di masa depan');
  if (ts <= lastRekapTs_()) throw new Error('Waktu sebelum rekap terakhir. Koreksi lewat edit rekap atau opname.');
  return ambil_(karyawanId, barangId, jumlah, ts, 'admin');
}

function simpanOpname(pin, items, token) {
  auth_(pin, token);
  return lock_(function () {
    var barang = rows_('Barang'), ts = Date.now(), n = 0;
    (items || []).forEach(function (i) {
      if (i.fisik === '' || i.fisik === null || i.fisik === undefined) return;
      var b = barang.filter(function (x) { return String(x.id) === String(i.barang_id); })[0];
      if (!b) return;
      var f = r_(numWajib_(i.fisik, 'Stok fisik ' + b.nama));
      if (f < 0) throw new Error('Stok fisik tidak boleh negatif');
      var sis = num_(b.stok_dalam), sel = r_(f - sis);
      append_('Opname', { id: uid_(), ts: ts, waktu: fmt_(ts), barang_id: String(b.id), barang: b.nama, sistem: sis, fisik: f, selisih: sel });
      if (sel !== 0) append_('Transaksi', { id: uid_(), ts: ts, waktu: fmt_(ts), jenis: 'OPNAME', barang_id: String(b.id), barang: b.nama,
        jumlah: sel, status: 'AKTIF', dicatat_oleh: 'admin', catatan: 'Sistem ' + sis + ' → fisik ' + f, kategori: String(b.kategori || ''), satuan: String(b.satuan || '') });
      b.stok_dalam = f;
      update_('Barang', b);
      n++;
    });
    return n;
  });
}

function editRekapTerakhir(pin, input, token) {
  auth_(pin, token);
  return lock_(function () {
    var rk = rows_('Rekap').sort(function (a, b) { return num_(b.ts) - num_(a.ts); })[0];
    if (!rk) throw new Error('Belum ada rekap');
    var bs = rows_('RekapBaris').filter(function (x) { return String(x.rekap_id) === String(rk.id); });
    var barang = rows_('Barang'), plan = [];
    (input || []).forEach(function (i) {
      var x = bs.filter(function (b) { return String(b.barang_id) === String(i.barang_id); })[0];
      if (!x || i.sisa === '' || i.sisa === null || i.sisa === undefined) return;
      var s = r_(numWajib_(i.sisa, 'Sisa ' + x.barang));
      var maks = num_(x.saldo_awal) + num_(x.diambil);
      if (s < 0 || s > maks + 1e-9) throw new Error('Sisa ' + x.barang + ' harus 0 sampai ' + maks);
      var delta = r_(s - num_(x.sisa));
      if (!delta) return;
      var b = barang.filter(function (y) { return String(y.id) === String(x.barang_id); })[0];
      if (!b) throw new Error('Barang ' + x.barang + ' tidak ditemukan');
      var nl = r_(num_(b.stok_luar) + delta);
      if (nl < 0) throw new Error('Saldo luar ' + x.barang + ' akan negatif');
      plan.push({ x: x, b: b, s: s, maks: maks, nl: nl });
    });
    plan.forEach(function (p) {
      p.b.stok_luar = p.nl; update_('Barang', p.b);
      p.x.sisa = p.s; p.x.terpakai = r_(p.maks - p.s); update_('RekapBaris', p.x);
    });
    if (plan.length) { rk.diedit_admin = true; update_('Rekap', rk); }
    return plan.length;
  });
}
function approveRekap(pin, rekapId, input, token) {
  auth_(pin, token);
  return lock_(function () {
    var rk = find_('Rekap', rekapId);
    if (!rk) throw new Error('Rekap tidak ditemukan');
    if ((rk.status ? String(rk.status).toUpperCase() : 'APPROVED') === 'APPROVED') {
      throw new Error('Rekap sudah disetujui');
    }

    // FIFO check: pastikan tidak ada rekap berstatus PENDING yang lebih lampau
    var allRekap = rows_('Rekap');
    var hasOlderPending = allRekap.some(function (r) {
      var isPending = (r.status ? String(r.status).toUpperCase() : 'APPROVED') === 'PENDING';
      return isPending && String(r.id) !== String(rekapId) && num_(r.ts) < num_(rk.ts);
    });
    if (hasOlderPending) {
      throw new Error('Harap setujui rekap yang lebih lama terlebih dahulu');
    }

    var bs = rows_('RekapBaris').filter(function (x) { return String(x.rekap_id) === String(rekapId); });
    var barang = rows_('Barang'), plan = [];
    var by = {};
    (input || []).forEach(function (i) { by[String(i.barang_id)] = i; });

    bs.forEach(function (x) {
      var itemInput = by[String(x.barang_id)];
      var s = num_(x.sisa);
      var terjual = num_(x.terjual) || 0;
      var maks = num_(x.saldo_awal) + num_(x.diambil);

      if (itemInput) {
        if (itemInput.sisa !== '' && itemInput.sisa !== null && itemInput.sisa !== undefined) {
          s = r_(numWajib_(itemInput.sisa, 'Sisa ' + x.barang));
          if (s < 0 || s > maks + 1e-9) throw new Error('Sisa ' + x.barang + ' harus 0 sampai ' + maks);
        }
        if (itemInput.terjual !== '' && itemInput.terjual !== null && itemInput.terjual !== undefined) {
          terjual = r_(numWajib_(itemInput.terjual, 'Terjual ' + x.barang));
          if (terjual < 0) throw new Error('Terjual ' + x.barang + ' tidak boleh negatif');
        }
      }

      var delta = r_(s - num_(x.sisa));
      var b = barang.filter(function (y) { return String(y.id) === String(x.barang_id); })[0];
      if (!b) throw new Error('Barang ' + x.barang + ' tidak ditemukan');
      var nl = r_(num_(b.stok_luar) + delta);
      if (nl < 0) throw new Error('Saldo luar ' + x.barang + ' akan negatif');
      plan.push({ x: x, b: b, s: s, maks: maks, nl: nl, terjual: terjual });
    });

    var changed = false;
    plan.forEach(function (p) {
      if (p.b.stok_luar !== p.nl) {
        p.b.stok_luar = p.nl;
        update_('Barang', p.b);
        changed = true;
      }
      if (p.x.sisa !== p.s) changed = true;
      p.x.sisa = p.s;
      p.x.terpakai = r_(p.maks - p.s);
      p.x.terjual = p.terjual;
      p.x.selisih = r_(p.x.terpakai - p.terjual);
      update_('RekapBaris', p.x);
    });

    if (changed) rk.diedit_admin = true;
    rk.status = 'APPROVED';
    rk.approved_ts = Date.now();
    update_('Rekap', rk);

    return { id: rk.id, status: 'APPROVED' };
  });
}

function simpanPengaturan(pin, jamTutup, pinBaru, token) {
  auth_(pin, token);
  return lock_(function () {
    if (jamTutup) {
      var j = jam_(jamTutup);
      if (!j) throw new Error('Jam tutup tidak valid: ' + jamTutup);
      setSetting_('jam_tutup', j);
    }
    if (pinBaru) {
      if (!/^\d{4,8}$/.test(pinBaru)) throw new Error('PIN harus 4–8 angka');
      PropertiesService.getScriptProperties().setProperty('ADMIN_PIN', hashPin_(pinBaru, adminSalt_()));
    }
    return true;
  });
}

function laporan(pin, dari, sampai, token) {
  auth_(pin, token);
  var sDari = String(dari || '').trim(), sSampai = String(sampai || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(sDari) || !/^\d{4}-\d{2}-\d{2}$/.test(sSampai)) {
    throw new Error('Format tanggal laporan tidak valid (harus YYYY-MM-DD)');
  }
  if (sDari > sSampai) {
    throw new Error('Tanggal awal tidak boleh melebihi tanggal akhir');
  }
  var p = function (s, add) { var a = String(s).split('-').map(Number); return new Date(a[0], a[1] - 1, a[2] + (add || 0)).getTime(); };
  var t0 = p(sDari), t1 = p(sSampai, 1), map = {};
  var barang = rows_('Barang').map(pub_);
  var g = function (id, nama) {
    id = String(id);
    if (!map[id]) {
      var b = barang.filter(function (x) { return x.id === id; })[0];
      map[id] = { nama: b ? b.nama : nama, satuan: b ? b.satuan : '', masuk: 0, produksi: 0, terpakai_rekap: 0, langsung_habis: 0, opname: 0 };
    }
    return map[id];
  };
  var rk = {};
  rows_('Rekap').forEach(function (r) { var ts = num_(r.ts); if (ts >= t0 && ts < t1) rk[String(r.id)] = 1; });
  rows_('RekapBaris').forEach(function (x) { if (rk[String(x.rekap_id)]) g(x.barang_id, x.barang).terpakai_rekap += num_(x.terpakai); });
  rows_('Transaksi').forEach(function (t) {
    var ts = num_(t.ts);
    if (ts < t0 || ts >= t1 || t.status !== 'AKTIF') return;
    if (t.jenis === 'MASUK') g(t.barang_id, t.barang).masuk += num_(t.jumlah);
    else if (t.jenis === 'PRODUKSI') g(t.barang_id, t.barang).produksi += num_(t.jumlah);
    else if (t.jenis === 'AMBIL' && t.alur === 'LANGSUNG_HABIS') g(t.barang_id, t.barang).langsung_habis += num_(t.jumlah);
    else if (t.jenis === 'OPNAME') g(t.barang_id, t.barang).opname += num_(t.jumlah);
  });
  return Object.keys(map).map(function (k) {
    var r = map[k];
    return { nama: r.nama, satuan: r.satuan, masuk: r_(r.masuk), produksi: r_(r.produksi), terpakai_rekap: r_(r.terpakai_rekap), langsung_habis: r_(r.langsung_habis),
      total_terpakai: r_(r.terpakai_rekap + r.langsung_habis), opname: r_(r.opname) };
  }).sort(function (a, b) { return a.nama < b.nama ? -1 : 1; });
}

function laporanKeSheet(pin, dari, sampai, token) {
  var rows = laporan(pin, dari, sampai, token);
  var ss = ss_(), s = ss.getSheetByName('Laporan') || ss.insertSheet('Laporan');
  s.clear();
  var head = ['Barang', 'Satuan', 'Masuk (Supplier)', 'Hasil Produksi', 'Terpakai (rekap)', 'Langsung habis', 'Total terpakai', 'Selisih opname'];
  var data = [[safeCell_('Laporan ' + dari + ' s/d ' + sampai), '', '', '', '', '', '', ''], head].concat(rows.map(function (r) {
    return [safeCell_(r.nama), safeCell_(r.satuan), r.masuk, r.produksi, r.terpakai_rekap, r.langsung_habis, r.total_terpakai, r.opname];
  }));
  s.getRange(1, 1, data.length, head.length).setValues(data);
  s.getRange(1, 1, 2, head.length).setFontWeight('bold');
  return ss.getUrl() + '#gid=' + s.getSheetId();
}

/* ---------- Autentikasi Google, iCloud, OTP & Whitelist ---------- */

function tokenSecret_() {
  var p = PropertiesService.getScriptProperties();
  var s = p.getProperty('AUTH_TOKEN_SECRET');
  if (!s) {
    s = Utilities.getUuid() + '-' + Utilities.getUuid();
    p.setProperty('AUTH_TOKEN_SECRET', s);
  }
  return s;
}

function getAuthWhitelist_() {
  var p = PropertiesService.getScriptProperties();
  var raw = p.getProperty('AUTH_WHITELIST');
  var list = [];
  if (raw) {
    try { list = JSON.parse(raw); } catch (e) { list = []; }
  }
  // Auto-bootstrap akun owner jika whitelist kosong
  if (!list || !list.length) {
    list = [];
    var owner = '';
    try {
      if (typeof Session !== 'undefined' && Session.getEffectiveUser) {
        owner = Session.getEffectiveUser().getEmail();
      }
    } catch (e) {}
    if (owner && owner.trim()) {
      list.push({ email: owner.toLowerCase().trim(), role: 'admin', aktif: true, dibuat: Date.now() });
    }
    p.setProperty('AUTH_WHITELIST', JSON.stringify(list));
  }
  return list;
}

function saveAuthWhitelist_(list) {
  PropertiesService.getScriptProperties().setProperty('AUTH_WHITELIST', JSON.stringify(list));
}

function findAuthAccount_(email) {
  if (!email) return null;
  var em = String(email).toLowerCase().trim();
  var list = getAuthWhitelist_();
  for (var i = 0; i < list.length; i++) {
    if (list[i].email && list[i].email.toLowerCase().trim() === em) return list[i];
  }
  return null;
}

function formatNamaAdmin_(nama, email) {
  if (nama && String(nama).trim()) return String(nama).trim();
  if (!email || !String(email).trim()) return 'Admin';
  var userPart = String(email).split('@')[0] || '';
  var firstName = userPart.split(/[._-]/)[0] || '';
  if (!firstName) return 'Admin';
  return firstName.charAt(0).toUpperCase() + firstName.slice(1).toLowerCase();
}

function catatLogLogin_(email, metode, role, status, userAgent) {
  try {
    var ts = Date.now();
    append_('Log_Login', {
      id: uid_(),
      ts: ts,
      waktu: fmt_(ts),
      email: String(email || '').trim().toLowerCase(),
      metode: String(metode || 'OTP').toUpperCase(),
      role: String(role || '-'),
      status: String(status || 'BERHASIL'),
      user_agent: String(userAgent || '').slice(0, 200)
    });
    // Pangkas baris tertua jika log melebihi 1000 baris agar tidak membebani spreadsheet
    var s = sheet_('Log_Login');
    if (s && s.getLastRow() > 1050) {
      s.deleteRows(2, s.getLastRow() - 1000);
    }
  } catch (e) {
    console.error('Gagal mencatat log login:', e);
  }
}

function buatSessionToken_(email, role) {
  var duration = role === 'tablet' ? 30 * 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000;
  var exp = Date.now() + duration;
  var nonce = Utilities.getUuid().slice(0, 8);
  var payload = [email.toLowerCase().trim(), role, exp, nonce].join('|');
  var sig = Utilities.base64EncodeWebSafe(
    Utilities.computeHmacSha256Signature(payload, tokenSecret_(), Utilities.Charset.UTF_8)
  );
  var token = Utilities.base64EncodeWebSafe(payload) + '.' + sig;
  return { token: token, email: email.toLowerCase().trim(), role: role, exp: exp };
}

function verifySessionToken(token) {
  if (!token || typeof token !== 'string') return { valid: false, error: 'Token tidak ada' };
  var parts = token.split('.');
  if (parts.length !== 2) return { valid: false, error: 'Format token tidak valid' };
  try {
    var payloadBytes = Utilities.base64DecodeWebSafe(parts[0]);
    var payload = Utilities.newBlob(payloadBytes).getDataAsString();
    var sig = parts[1];
    var expectedSig = Utilities.base64EncodeWebSafe(
      Utilities.computeHmacSha256Signature(payload, tokenSecret_(), Utilities.Charset.UTF_8)
    );
    if (!safeEqual_(sig, expectedSig)) return { valid: false, error: 'Tanda tangan token tidak sah' };
    var fields = payload.split('|');
    var email = fields[0];
    var exp = Number(fields[2]);
    if (Date.now() > exp) return { valid: false, error: 'Sesi telah berakhir. Silakan login kembali.' };

    var acc = findAuthAccount_(email);
    if (!acc || !truthy_(acc.aktif)) {
      return { valid: false, error: 'Akses akun telah dicabut atau dinonaktifkan oleh admin.' };
    }
    return { valid: true, email: email, role: acc.role, exp: exp };
  } catch (err) {
    return { valid: false, error: 'Gagal memverifikasi token: ' + String(err.message || err) };
  }
}

function getPublicAuthConfig() {
  var p = PropertiesService.getScriptProperties();
  var clientId = (p && p.getProperty('GOOGLE_CLIENT_ID')) || '';
  return {
    hasGoogleAuth: Boolean(clientId && clientId.trim()),
    googleClientId: clientId ? clientId.trim() : '',
    allowDummyAuth: isDummyAllowed_()
  };
}

function isDummyAllowed_() {
  var p = PropertiesService.getScriptProperties();
  return p && (p.getProperty('ALLOW_DUMMY_AUTH') === '1' || p.getProperty('SKIP_AUTH_SESSION') === '1');
}

function requestOtp(email) {
  if (!email || !String(email).trim()) throw new Error('Email wajib diisi');
  var em = String(email).toLowerCase().trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) throw new Error('Format email tidak valid');

  var acc = findAuthAccount_(em);
  if (!acc || !truthy_(acc.aktif)) {
    catatLogLogin_(em, 'OTP', '-', 'GAGAL - BUKAN WHITELIST', '');
    throw new Error('Email tidak terdaftar atau akses telah dinonaktifkan. Hubungi admin.');
  }

  rateLimitGuard_('otp_req_' + em, 120);

  var isDummy = em === 'admin@segara.com' || em === 'tablet@segara.com' || em.endsWith('@segara.com');
  var c = cache_();
  if (c && c.get('otp_cd_' + em) && !isDummy) {
    throw new Error('Kode verifikasi baru saja dikirim. Tunggu 60 detik sebelum meminta kode baru.');
  }

  var code = isDummy ? '123456' : (function () {
    var raw = Utilities.getUuid().replace(/\D/g, '');
    if (raw.length < 6) raw += String(Math.floor(100000 + Math.random() * 900000));
    return raw.slice(0, 6);
  })();
  if (c) {
    c.put('otp_' + em, code, 300);
    c.put('otp_cd_' + em, '1', 60);
  }
  if (isDummy) {
    return {
      success: true,
      message: 'Kode verifikasi dummy: 123456 (Gunakan kode ini untuk masuk)',
      expSeconds: 300
    };
  }

  try {
    MailApp.sendEmail({
      to: em,
      subject: '[Kedai Segara] Kode Verifikasi Login: ' + code,
      body: 'Halo,\n\nKode verifikasi login Anda ke Sistem Stok Kedai Segara adalah: ' + code + '\n\n' +
            'Kode ini berlaku selama 5 menit. Jangan berikan kode ini kepada siapa pun.\n\n' +
            'Jika Anda tidak meminta kode ini, abaikan pesan ini.'
    });
  } catch (err) {
    throw new Error('Gagal mengirim email verifikasi: ' + (err.message || String(err)));
  }

  return { success: true, message: 'Kode verifikasi telah dikirim ke ' + em, expSeconds: 300 };
}

function verifyOtp(email, code, userAgent) {
  if (!email || !code) throw new Error('Email dan kode verifikasi wajib diisi');
  var em = String(email).toLowerCase().trim();
  var cd = String(code).trim();

  rateLimitGuard_('otp_ver_' + em, 60);

  var c = cache_();
  var isDummy = em === 'admin@segara.com' || em === 'tablet@segara.com' || em.endsWith('@segara.com');
  var stored = c ? c.get('otp_' + em) : null;
  if (!stored && !isDummy) {
    rateLimitCatatGagal_('otp_ver_' + em, 60);
    catatLogLogin_(em, 'OTP', '-', 'GAGAL - OTP KADALUARSA', userAgent);
    throw new Error('Kode verifikasi salah atau sudah kadaluarsa. Minta kode baru.');
  }

  var validDummy = isDummy && cd === '123456';
  if (stored !== cd && !validDummy) {
    rateLimitCatatGagal_('otp_ver_' + em, 60);
    catatLogLogin_(em, 'OTP', '-', 'GAGAL - OTP SALAH', userAgent);
    throw new Error('Kode verifikasi salah.');
  }

  if (c) c.remove('otp_' + em);
  rateLimitReset_('otp_ver_' + em);

  var acc = findAuthAccount_(em);
  if (!acc || !truthy_(acc.aktif)) {
    catatLogLogin_(em, 'OTP', '-', 'GAGAL - BUKAN WHITELIST', userAgent);
    throw new Error('Akun ini tidak memiliki akses aktif.');
  }

  catatLogLogin_(em, 'OTP', acc.role, 'BERHASIL', userAgent);
  return buatSessionToken_(acc.email, acc.role);
}

function verifyGoogleCredential(credential, userAgent) {
  if (!credential) throw new Error('Kredensial Google wajib ada');
  var p = PropertiesService.getScriptProperties();
  var expectedClientId = (p && p.getProperty('GOOGLE_CLIENT_ID')) || '';
  if (!expectedClientId || !expectedClientId.trim()) {
    catatLogLogin_('-', 'GOOGLE', '-', 'GAGAL - GOOGLE SIGN-IN BELUM AKTIF', userAgent);
    throw new Error('Google Sign-In belum dikonfigurasi di pengaturan sistem.');
  }

  var url = 'https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(credential);
  var res;
  try {
    res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  } catch (e) {
    throw new Error('Gagal menghubungi server verifikasi Google: ' + String(e.message || e));
  }
  if (res.getResponseCode() !== 200) {
    catatLogLogin_('-', 'GOOGLE', '-', 'GAGAL - TOKEN INVALID', userAgent);
    throw new Error('Token otorisasi Google tidak sah atau kadaluarsa.');
  }
  var payload;
  try {
    payload = JSON.parse(res.getContentText());
  } catch (e) {
    throw new Error('Gagal membaca data dari Google.');
  }

  if (payload.aud !== expectedClientId.trim()) {
    catatLogLogin_(payload.email || '-', 'GOOGLE', '-', 'GAGAL - AUDIENCE INVALID', userAgent);
    throw new Error('Token otorisasi Google tidak sah untuk aplikasi ini.');
  }

  var email = payload.email ? String(payload.email).toLowerCase().trim() : '';
  if (!email || !(payload.email_verified === 'true' || payload.email_verified === true)) {
    catatLogLogin_(email || '-', 'GOOGLE', '-', 'GAGAL - EMAIL BELUM TERVERIFIKASI', userAgent);
    throw new Error('Email Google belum terverifikasi.');
  }

  var acc = findAuthAccount_(email);
  if (!acc || !truthy_(acc.aktif)) {
    catatLogLogin_(email, 'GOOGLE', '-', 'GAGAL - BUKAN WHITELIST', userAgent);
    throw new Error('Email Google (' + email + ') belum terdaftar di whitelist sistem. Hubungi admin.');
  }

  catatLogLogin_(email, 'GOOGLE', acc.role, 'BERHASIL', userAgent);
  return buatSessionToken_(acc.email, acc.role);
}

function tokenFromArgs_(args) {
  if (!args || !args.length) return null;
  for (var i = args.length - 1; i >= 0; i--) {
    var v = args[i];
    if (typeof v === 'string' && (v.indexOf('.') > 0 || v.indexOf('mock_tok_') === 0)) return v;
  }
  return null;
}

function getAdminAuthStatus(token) {
  var tok = token || tokenFromArgs_(arguments);
  var sess = requireSession_(tok, 'admin');
  var acc = findAuthAccount_(sess.email);
  return {
    email: sess.email,
    punyaPin: !!(acc && acc.pinHash)
  };
}

function setupAdminPin(newPin, token) {
  var tok = token || tokenFromArgs_(arguments);
  var sess = requireSession_(tok, 'admin');
  var pinStr = String(newPin || '').trim();
  if (!/^\d{4,8}$/.test(pinStr)) throw new Error('PIN harus 4–8 angka');

  return lock_(function () {
    var list = getAuthWhitelist_();
    var acc = null;
    var em = sess.email.toLowerCase().trim();
    for (var i = 0; i < list.length; i++) {
      if (list[i].email && list[i].email.toLowerCase().trim() === em) {
        acc = list[i];
        break;
      }
    }
    if (!acc) throw new Error('Akun admin tidak ditemukan di whitelist');
    if (acc.pinHash) throw new Error('Akun sudah memiliki PIN. Gunakan ganti PIN.');

    var salt = 'salt_' + Utilities.getUuid().replace(/-/g, '').slice(0, 12);
    acc.pinHash = hashPin_(pinStr, salt);
    acc.salt = salt;
    saveAuthWhitelist_(list);
    catatLogLogin_(sess.email, 'PIN_SETUP', 'admin', 'BERHASIL', '');
    return true;
  });
}

function gantiAdminPin(oldPin, newPin, token) {
  var tok = token || tokenFromArgs_(arguments);
  var sess = requireSession_(tok, 'admin');
  var acc = findAuthAccount_(sess.email);
  if (!acc) throw new Error('Akun admin tidak ditemukan di whitelist');
  if (!acc.pinHash) throw new Error('Akun belum memiliki PIN. Gunakan setup PIN.');

  rateLimitGuard_('admin_' + sess.email, 60);

  var salt = acc.salt || adminSalt_(acc.email);
  var oldHashed = hashPin_(String(oldPin || '').trim(), salt);
  if (!safeEqual_(acc.pinHash, oldHashed)) {
    rateLimitCatatGagal_('admin_' + sess.email, 60);
    catatLogLogin_(sess.email, 'GANTI_PIN', 'admin', 'GAGAL - PIN LAMA SALAH', '');
    throw new Error('PIN lama salah');
  }

  var newPinStr = String(newPin || '').trim();
  if (!/^\d{4,8}$/.test(newPinStr)) throw new Error('PIN harus 4–8 angka');

  rateLimitReset_('admin_' + sess.email);

  return lock_(function () {
    var list = getAuthWhitelist_();
    var em = sess.email.toLowerCase().trim();
    for (var i = 0; i < list.length; i++) {
      if (list[i].email && list[i].email.toLowerCase().trim() === em) {
        var newSalt = 'salt_' + Utilities.getUuid().replace(/-/g, '').slice(0, 12);
        list[i].pinHash = hashPin_(newPinStr, newSalt);
        list[i].salt = newSalt;
        break;
      }
    }
    saveAuthWhitelist_(list);
    catatLogLogin_(sess.email, 'GANTI_PIN', 'admin', 'BERHASIL', '');
    return true;
  });
}

function resetAdminPinWithOtp(email, code, newPin, token) {
  if (!email || !code) throw new Error('Email dan kode verifikasi wajib diisi');
  var em = String(email).toLowerCase().trim();
  var cd = String(code).trim();
  var pinStr = String(newPin || '').trim();
  if (!/^\d{4,8}$/.test(pinStr)) throw new Error('PIN harus 4–8 angka');

  rateLimitGuard_('otp_ver_' + em, 60);

  var c = cache_();
  var isDummy = (typeof isDummyAllowed_ === 'function' ? isDummyAllowed_() : true) && (em === 'admin@segara.com' || em === 'tablet@segara.com' || em.endsWith('@segara.com'));
  var stored = c ? c.get('otp_' + em) : null;
  if (!stored && !isDummy) {
    rateLimitCatatGagal_('otp_ver_' + em, 60);
    catatLogLogin_(em, 'OTP_RESET_PIN', '-', 'GAGAL - OTP KADALUARSA', '');
    throw new Error('Kode verifikasi salah atau sudah kadaluarsa. Minta kode baru.');
  }

  var validOtp = (stored && safeEqual_(stored, cd)) || (isDummy && cd === '123456');
  if (!validOtp) {
    rateLimitCatatGagal_('otp_ver_' + em, 60);
    catatLogLogin_(em, 'OTP_RESET_PIN', '-', 'GAGAL - OTP SALAH', '');
    throw new Error('Kode verifikasi salah');
  }

  rateLimitReset_('otp_ver_' + em);
  if (c) c.remove('otp_' + em);

  return lock_(function () {
    var list = getAuthWhitelist_();
    var acc = null;
    for (var i = 0; i < list.length; i++) {
      if (list[i].email && list[i].email.toLowerCase().trim() === em) {
        acc = list[i];
        break;
      }
    }
    if (!acc || acc.role !== 'admin' || !truthy_(acc.aktif)) {
      throw new Error('Akun admin tidak ditemukan di whitelist');
    }
    var newSalt = 'salt_' + Utilities.getUuid().replace(/-/g, '').slice(0, 12);
    acc.pinHash = hashPin_(pinStr, newSalt);
    acc.salt = newSalt;
    saveAuthWhitelist_(list);
    catatLogLogin_(em, 'RESET_PIN_OTP', 'admin', 'BERHASIL', '');
    return true;
  });
}


function getAuthAccounts(pin, token) {
  auth_(pin, token);
  var list = getAuthWhitelist_();
  return list.map(function (a) {
    return {
      email: a.email,
      nama: a.nama || '',
      role: a.role,
      aktif: truthy_(a.aktif),
      dibuat: a.dibuat,
      punyaPin: !!(a.pinHash)
    };
  });
}

function simpanAuthAccount(pin, email, role, aktif, arg5, arg6) {
  var nama = undefined;
  var tok = null;
  if (arg6 !== undefined) {
    nama = String(arg5 || '').trim();
    tok = arg6;
  } else if (typeof arg5 === 'string' && (/^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(arg5) || arg5.indexOf('mock_tok_') === 0)) {
    tok = arg5;
  } else if (arg5 !== undefined) {
    nama = String(arg5 || '').trim();
  }

  auth_(pin, tok);
  if (!email || !String(email).trim()) throw new Error('Email wajib diisi');
  var em = String(email).toLowerCase().trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) throw new Error('Format email tidak valid');
  if (role !== 'admin' && role !== 'tablet') throw new Error('Role harus admin atau tablet');

  return lock_(function () {
    var list = getAuthWhitelist_();
    var idx = -1;
    for (var i = 0; i < list.length; i++) {
      if (list[i].email && list[i].email.toLowerCase().trim() === em) {
        idx = i;
        break;
      }
    }

    var target = idx >= 0 ? list[idx] : null;
    var adminLain = list.filter(function (x) {
      return x.role === 'admin' && truthy_(x.aktif) && x.email.toLowerCase().trim() !== em;
    });
    if (target && target.role === 'admin' && truthy_(target.aktif) && adminLain.length === 0) {
      if (role !== 'admin' || !truthy_(aktif)) {
        throw new Error('Tidak dapat menonaktifkan atau mengubah role admin aktif terakhir. Sisakan minimal satu admin aktif.');
      }
    }

    var cleanNama = nama !== undefined ? nama : (target && target.nama ? target.nama : '');
    if (idx >= 0) {
      list[idx].role = role;
      list[idx].aktif = truthy_(aktif);
      list[idx].nama = cleanNama;
    } else {
      list.push({
        email: em,
        nama: cleanNama,
        role: role,
        aktif: truthy_(aktif),
        dibuat: Date.now()
      });
    }
    saveAuthWhitelist_(list);
    return true;
  });
}

function hapusAuthAccount(pin, email, token) {
  auth_(pin, token);
  if (!email) throw new Error('Email wajib diisi');
  var em = String(email).toLowerCase().trim();

  return lock_(function () {
    var list = getAuthWhitelist_();
    var adminLain = list.filter(function (x) {
      return x.role === 'admin' && truthy_(x.aktif) && x.email.toLowerCase().trim() !== em;
    });
    var acc = list.filter(function (x) { return x.email.toLowerCase().trim() === em; })[0];
    if (acc && acc.role === 'admin' && adminLain.length === 0) {
      throw new Error('Tidak dapat menghapus admin aktif terakhir. Sisakan minimal satu admin.');
    }

    var baru = list.filter(function (x) {
      return x.email.toLowerCase().trim() !== em;
    });
    saveAuthWhitelist_(baru);
    return true;
  });
}

function getLoginHistory(pin, limit, token) {
  auth_(pin, token);
  var max = Number(limit) || 100;
  var rows = rows_('Log_Login');
  rows.sort(function (a, b) { return num_(b.ts) - num_(a.ts); });
  return rows.slice(0, max).map(clean_);
}

function simpanGoogleClientId(pin, clientId, token) {
  auth_(pin, token);
  var cid = String(clientId || '').trim();
  PropertiesService.getScriptProperties().setProperty('GOOGLE_CLIENT_ID', cid);
  return true;
}

/* ---------- Data Kedai Segara (Laporan Stock September · CV. Dapur Rumah Rasa) ---------- */
// Kategori = judul merah di laporan. Format barang: [kode, nama, satuan, catatan (opsional)]
var DATA_SEGARA = [
  ['Freezer Protein', [
    ['AS', 'Ayam Suwir', 'Porsi'],
    ['TK', 'Topping Kwetiau', 'Porsi'],
    ['TM', 'Topping Mbakmoy', 'Porsi'],
    ['AJ', 'Ayam Jamur', 'Porsi'],
    ['DGM', 'Dada Gurih Manis', 'Porsi'],
    ['PGM', 'Paha Gurih Manis', 'Porsi'],
    ['P', 'Paha', 'Porsi'],
    ['D', 'Dada', 'Porsi'],
    ['Syp', 'Sayap Goreng', 'Porsi'],
    ['Daging', 'Daging Slice', 'Porsi'],
    ['C', 'Cumi', 'Porsi'],
    ['K', 'Kulit', 'Porsi'],
    ['L', 'Lidah', 'Porsi'],
    ['LGS', 'Lidah Goreng Segara', 'Porsi'],
    ['TP', 'Teri Pete', 'Porsi'],
    ['TNG', 'Topping Nasi Gila', 'Porsi'],
    ['PTA', 'Pete Add On', 'Porsi'],
    ['PT', 'Pete', 'Porsi'],
    ['B', 'Bagor', 'Porsi'],
    ['DS', 'Daging Sambal HIjau', 'Porsi'],
    ['BC', 'Sambal Baby Cumi', 'Porsi'],
    ['TA', 'Tahu Aci', 'Pack'],
    ['Cr', 'Cireng', 'Porsi'],
  ]],
  ['Freezer Bumbu', [
    ['SB', 'Sambal Bawang', 'Pack'],
    ['S.terasi', 'Sambal Terasi', 'Pack'],
    ['SK', 'Sambal Kuning', 'Pack'],
    ['SP', 'Sambal Petis', 'Pack'],
    ['ST', 'Sambal Terong', 'Pack'],
    ['BS', 'Bumbu Segara', 'Pack'],
    ['BL', 'Bumbu Lidah', 'Pack'],
    ['Serundeng', 'Bumbu Serundeng', 'Pack'],
    ['BK', 'Bumbu Kwetiau', 'Pack'],
    ['GM', 'Gorengan Mbakmoy', 'Pack'],
    ['BUL', 'Bumbu Ungkep Lidah', 'Pack'],
    ['BNG', 'Bumbu Nasi Gila', 'Pack'],
    ['BT', 'Bumbu Teri', 'Pack'],
    ['BMG', 'Bumbu Mie Goreng Jawa', 'Pack'],
  ]],
  ['Freezer Roti & Juice', [
    ['RotiB', 'Roti Bakar', 'Pack'],
    ['RotiA', 'Roti Angsle', 'Pack'],
    ['Sirsak', 'Sirsak Juice', 'Pack'],
    ['SM', 'Manggo Juice', 'Pack'],
    ['Berries', 'Mix Berries', 'Pack'],
  ]],
  ['Flavourful Drink', [
    ['M', 'Mineral', 'Botol'],
    ['AT', 'Air Tahu', 'Botol'],
    ['Polaris', 'Soda Polaris', 'Kaleng'],
    ['ZD', 'Zoda Water', 'Kaleng'],
    ['Kaleng', 'Lhychee Kaleng', 'Kaleng'],
    ['Apple', 'Apple Juice Diamond', 'Pcs'],
    ['DHT', 'Syrup Dht', 'Jug'],
    ['Butter', 'Dripp Butterschotch', 'Botol'],
    ['Pandan', 'Dripp Pandan', 'Botol'],
    ['Lhychee', 'Dripp Lhychee', 'Botol'],
    ['Sun', 'Sunquick Manggo', 'Botol'],
    ['Lemon', 'Ecolate Lemongrass', 'Pack'],
    ['Winter', 'Ecolate Wintermelon Tea', 'Pack'],
    ['Kopi', 'Kopi', 'Pack'],
    ['LT', 'Lemon Tea', 'Pack'],
  ]],
  ['Barang Kering (Dairy + Plant Base Milk)', [
    ['UHT', 'Diamond Milk', 'Pcs'],
    ['Cara1', 'Sun Cara 1L', 'Pcs'],
    ['Evap', 'Susu Evaporasi', 'Kaleng'],
    ['SKM', 'Susu Kental Manis Carnation', 'Pcs'],
    ['Oatside', 'Oatside Milk', 'Pcs'],
    ['Cashew', 'Cashew Milk', 'Pcs'],
    ['Cara200', 'Sun Cara 200Ml', 'Pcs'],
    ['Creamer', 'Max Creamer', 'Pcs'],
    ['Milo', 'Milo', 'Pcs'],
    ['Keju', 'Keju', 'Pcs'],
    ['MB', 'Minyak Beku', 'Pcs'],
    ['MC', 'Kunci Mas', 'Pcs'],
  ]],
  ['Bahan Dasar + Kecap', [
    ['Gula', 'Gula', 'Pack'],
    ['Garam', 'Garam', 'Pack'],
    ['BR', 'Bumbu Racik', 'Pack'],
    ['BG', 'Bumbu Gule', 'Pack'],
    ['T', 'Terasi', 'Pcs'],
    ['GulaH', 'Gula Halus', 'Pack'],
    ['Knor', 'Knorr', 'Pack'],
    ['RR', 'Raja Rasa', 'Botol'],
    ['Tipparos', 'Kecap Ikan Tipparos', 'Botol'],
    ['Maggi', 'Kecap Maggi', 'Botol'],
    ['SS', 'Saus Sambal', 'Pack'],
    ['Tomat', 'Saus Tomat', 'Pack'],
  ]],
  ['Bahan Snack / Dessert + Tepung', [
    ['Beras', 'Tepung Beras Bola', 'Pack'],
    ['Ketan', 'Tepung Ketan', 'Pack'],
    ['Maizena', 'Tepung Maizena', 'Pack'],
    ['Terigu', 'Tepung Terigu', 'Pack'],
    ['Tapioka', 'Tepung Tapioka', 'Pack'],
    ['TT', 'Tepung Telur', 'Pack'],
    ['Urai', 'Mie Urai', 'Pack'],
    ['Plain', 'Nurtijel Plain', 'Pack'],
    ['Sagu', 'Sagu Mutiara', 'Pack'],
    ['Nata', 'Nata Decoco', 'Pack'],
    ['Hijau', 'Pewarna Hijau', 'Btl'],
    ['Pink', 'Pewarna Pink', 'Btl'],
    ['V', 'Vanilli', 'Btl'],
  ]],
  ['Cleaning Supplies + Utensils', [
    ['Ps.ukS', 'Plastik Sampah S', 'Lbr', '1 Pack Isi 10 pcs'],
    ['Ps.ukM', 'Plastik Sampah M', 'Lbr', '1 Pack Isi 10 pcs'],
    ['Ps.ukL', 'Plastik Sampah L', 'Lbr', '1 Pack Isi 10 pcs'],
    ['Ps.ukXL', 'Plastik Sampah XL', 'Lbr', '1 Pack Isi 10 pcs'],
    ['Paper', 'Thermal Paper', 'Roll'],
    ['Eko', 'Ekonomi', 'Pcs'],
    ['Ice', 'Cup Ice', 'Pack'],
    ['SoupXS', 'Plastik Soup XS', 'Pack'],
    ['Tmeja', 'Tissue Meja', 'Pack'],
    ['TWC', 'Tissue Toilet', 'Pack'],
    ['Tbm', 'Take Away Box M', 'Pack'],
    ['CupS', 'Cup Sambal', 'Pack'],
    ['Bm24', 'Plastik Bima uk24', 'Pack'],
    ['Tbs', 'Take Away Box S', 'Pack'],
    ['TbL', 'Take Away Bocx L', 'Pack'],
    ['Bm28', 'Plastik Bima uk.28', 'Pack'],
    ['Sdt', 'Sedotan', 'Pack'],
    ['Bm15', 'Plastik Bima uk.15', 'Pack'],
    ['Sumpit', 'Sumpit', 'Pack'],
    ['Sbb', 'Sendok Bebek', 'Pack'],
    ['2in1', '2in1 Sendok', 'Pack'],
    ['Hot', 'Cup Hot', 'Pack'],
    ['SoupM', 'Plastik Soup M', 'Roll'],
    ['SoupL', 'Plastik Soup L', 'Pack'],
    ['Lakban', 'Lakban Segara', 'Roll'],
  ]],
];

/**
 * Jalankan SEKALI dari editor: pilih "imporDataSegara" di dropdown, lalu klik Jalankan.
 * Menambahkan semua barang Kedai Segara ke sheet Barang (stok 0, alur lewat Stock Luar).
 * Stok diisi setelah hitung fisik lewat Admin → Opname.
 * Aman dijalankan ulang: barang yang kodenya sudah ada tidak diubah.
 */
function imporDataSegara(pin, token) {
  requireEditorOrAdmin_(pin, token);
  return lock_(function () {
    var ada = {};
    rows_('Barang').forEach(function (b) { if (String(b.kode || '')) ada[String(b.kode)] = true; });
    var baru = [], lewati = 0;
    DATA_SEGARA.forEach(function (g) {
      g[1].forEach(function (r) {
        if (ada[r[0]]) { lewati++; return; }
        var o = { id: uid_(), nama: r[1], satuan: r[2], kategori: g[0], stok_dalam: 0, stok_luar: 0, ambang_min: 0,
          alur: 'LUAR', aktif: true, kode: r[0], catatan: r[3] || '' };
        baru.push(SHEETS.Barang.map(function (k) { return safeCell_(o[k] === undefined ? '' : o[k]); }));
      });
    });
    var s = sheet_('Barang');
    if (baru.length) {
      var needRows = s.getLastRow() + baru.length;
      if (s.getMaxRows() < needRows) s.insertRowsAfter(s.getMaxRows(), needRows - s.getMaxRows());
      s.getRange(s.getLastRow() + 1, 1, baru.length, SHEETS.Barang.length).setValues(baru);
    }
    var urut = DATA_SEGARA.map(function (g) { return g[0]; });
    setSetting_('urutan_kategori', JSON.stringify(urut.concat(urutanKategori_().filter(function (k) { return urut.indexOf(k) < 0; }))));
    var hasil = baru.length + ' barang ditambahkan, ' + lewati + ' sudah ada (dilewati).';
    Logger.log(hasil);
    return hasil;
  });
}

/**
 * Buat data dummy rekap dan transaksi untuk testing di Google Sheets.
 * Jalankan dari editor Apps Script: pilih "buatDummyRekap", lalu klik Run.
 * Atau dipanggil via API admin.
 */
function buatDummyRekap(pin, token) {
  auth_(pin, token);
  return lock_(function () {
    var barang = rows_('Barang');
    var luarItems = barang.filter(function (b) { return b.alur === 'LUAR' && truthy_(b.aktif); });
    if (!luarItems.length) throw new Error('Belum ada barang dengan alur LUAR. Jalankan imporDataSegara dulu.');
    var karyawan = rows_('Karyawan').filter(function (k) { return truthy_(k.aktif); });
    if (!karyawan.length) throw new Error('Belum ada karyawan aktif.');

    var p1 = karyawan[0], p2 = karyawan[1] || karyawan[0], p3 = karyawan[2] || karyawan[0];
    var dayMs = 86400000, now = Date.now();
    var sisaMap = {};

    var t3 = new Date(now - 3 * dayMs); t3.setHours(21, 0, 0, 0); var ts3 = t3.getTime();
    var t2 = new Date(now - 2 * dayMs); t2.setHours(21, 0, 0, 0); var ts2 = t2.getTime();
    var t1 = new Date(now - 1 * dayMs); t1.setHours(21, 0, 0, 0); var ts1 = t1.getTime();

    // H-3
    var id3 = uid_();
    append_('Rekap', { id: id3, ts: ts3, waktu: fmt_(ts3), karyawan_id: String(p3.id), karyawan: p3.nama, diedit_admin: false });
    luarItems.forEach(function (b, idx) {
      var ambilJml = 10 + ((idx * 3) % 15);
      var sisa = Math.max(1, Math.round(ambilJml * 0.2));
      var terpakai = ambilJml - sisa;
      append_('Transaksi', { id: uid_(), ts: ts3 - 9 * 3600000, waktu: fmt_(ts3 - 9 * 3600000), jenis: 'AMBIL',
        barang_id: String(b.id), barang: b.nama, jumlah: ambilJml, karyawan_id: String(p3.id), karyawan: p3.nama,
        alur: b.alur, status: 'AKTIF', dicatat_oleh: 'karyawan', catatan: 'Ambil dapur', kategori: String(b.kategori || ''), satuan: String(b.satuan || '') });
      append_('RekapBaris', { rekap_id: id3, barang_id: String(b.id), barang: b.nama, saldo_awal: 0, diambil: ambilJml, sisa: sisa, terpakai: terpakai, catatan: '' });
      sisaMap[String(b.id)] = sisa;
    });

    // H-2
    var id2 = uid_();
    append_('Rekap', { id: id2, ts: ts2, waktu: fmt_(ts2), karyawan_id: String(p2.id), karyawan: p2.nama, diedit_admin: false });
    luarItems.forEach(function (b, idx) {
      var sa = sisaMap[String(b.id)] || 0;
      var ambilJml = 12 + ((idx * 4) % 18);
      var sisa = Math.max(1, Math.round((sa + ambilJml) * 0.25));
      var terpakai = sa + ambilJml - sisa;
      append_('Transaksi', { id: uid_(), ts: ts2 - 9 * 3600000, waktu: fmt_(ts2 - 9 * 3600000), jenis: 'AMBIL',
        barang_id: String(b.id), barang: b.nama, jumlah: ambilJml, karyawan_id: String(p2.id), karyawan: p2.nama,
        alur: b.alur, status: 'AKTIF', dicatat_oleh: 'karyawan', catatan: 'Ambil dapur', kategori: String(b.kategori || ''), satuan: String(b.satuan || '') });
      append_('RekapBaris', { rekap_id: id2, barang_id: String(b.id), barang: b.nama, saldo_awal: sa, diambil: ambilJml, sisa: sisa, terpakai: terpakai, catatan: '' });
      sisaMap[String(b.id)] = sisa;
    });

    // H-1 (Kemarin)
    var id1 = uid_();
    append_('Rekap', { id: id1, ts: ts1, waktu: fmt_(ts1), karyawan_id: String(p1.id), karyawan: p1.nama, diedit_admin: false });
    luarItems.forEach(function (b, idx) {
      var sa = sisaMap[String(b.id)] || 0;
      var ambilJml = 15 + ((idx * 5) % 20);
      var sisa = Math.max(2, Math.round((sa + ambilJml) * 0.3));
      var terpakai = sa + ambilJml - sisa;
      append_('Transaksi', { id: uid_(), ts: ts1 - 9 * 3600000, waktu: fmt_(ts1 - 9 * 3600000), jenis: 'AMBIL',
        barang_id: String(b.id), barang: b.nama, jumlah: ambilJml, karyawan_id: String(p1.id), karyawan: p1.nama,
        alur: b.alur, status: 'AKTIF', dicatat_oleh: 'karyawan', catatan: 'Ambil dapur', kategori: String(b.kategori || ''), satuan: String(b.satuan || '') });
      append_('RekapBaris', { rekap_id: id1, barang_id: String(b.id), barang: b.nama, saldo_awal: sa, diambil: ambilJml, sisa: sisa, terpakai: terpakai, catatan: '' });
      b.stok_luar = sisa;
      update_('Barang', b);
    });

    Logger.log('3 sesi dummy rekap berhasil dibuat.');
    return 3;
  });
}

/* Lengkapi judul kolom sheet lama agar sama dengan SHEETS (kolom baru selalu ditambah di kanan). */
function migrasi_(ss) {
  Object.keys(SHEETS).forEach(function (n) {
    var s = ss.getSheetByName(n) || ss.insertSheet(n), cols = SHEETS[n];
    if (s.getMaxColumns() < cols.length) s.insertColumnsAfter(s.getMaxColumns(), cols.length - s.getMaxColumns());
    if (s.getLastRow() === 0) {
      s.appendRow(cols);
      s.setFrozenRows(1);
      s.getRange(1, 1, 1, cols.length).setFontWeight('bold');
      return;
    }
    var h = s.getRange(1, 1, 1, cols.length).getValues()[0];
    cols.forEach(function (c, i) { if (String(h[i]) === '') s.getRange(1, i + 1).setValue(c).setFontWeight('bold'); });
  });
  PropertiesService.getScriptProperties().setProperty('SKEMA', SKEMA_V);
}

/* Urutan kategori untuk tablet & admin (mengikuti urutan di laporan). */
function urutanKategori_() {
  try {
    var a = JSON.parse(getSetting_('urutan_kategori') || '[]');
    return Array.isArray(a) ? a.map(String) : [];
  } catch (e) { return []; }
}