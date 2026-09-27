/**
 * Sistem Manajemen Stok Gudang
 * Google Apps Script + Google Sheets (database) + Web App (tablet & admin)
 * Alur: Stock Dalam (gudang) → Stock Luar (area kerja) → Rekap sisa akhir hari.
 */
var SHEETS = {
  Barang: ['id', 'nama', 'satuan', 'kategori', 'stok_dalam', 'stok_luar', 'ambang_min', 'alur', 'aktif', 'kode', 'catatan'],
  Karyawan: ['id', 'nama', 'aktif', 'pin'],
  Transaksi: ['id', 'ts', 'waktu', 'jenis', 'barang_id', 'barang', 'jumlah', 'karyawan_id', 'karyawan', 'alur', 'supplier', 'status', 'dicatat_oleh', 'catatan', 'kategori', 'satuan'],
  Rekap: ['id', 'ts', 'waktu', 'karyawan_id', 'karyawan', 'diedit_admin'],
  RekapBaris: ['rekap_id', 'barang_id', 'barang', 'saldo_awal', 'diambil', 'sisa', 'terpakai', 'catatan'],
  Opname: ['id', 'ts', 'waktu', 'barang_id', 'barang', 'sistem', 'fisik', 'selisih'],
  Pengaturan: ['kunci', 'nilai']
};
var TZ = Session.getScriptTimeZone();
var SS_ = null;
// Spreadsheet database Kedai Segara. Dipakai jika script dibuat terpisah (standalone,
// dari script.google.com) atau Script Property SS_ID belum diisi.
// Ganti ID ini jika memakai spreadsheet lain (ambil dari URL: /spreadsheets/d/<ID>/edit).
var DEFAULT_SS_ID = '1xFbqykYkWzFFhCfSVDUG8HiGEl3-FF9Ha1kJfPrd6gg';
var SKEMA_V = '3'; // naikkan jika kolom di SHEETS berubah

/* ---------- Web app ---------- */
// index.html adalah hasil build (Vite, satu file). Tidak dievaluasi sebagai template
// karena kode JS hasil build bisa mengandung "<?" — mode disisipkan lewat placeholder.
function doGet(e) {
  var mode = (e && e.parameter && e.parameter.mode) === 'admin' ? 'admin' : 'tablet';
  var html = HtmlService.createHtmlOutputFromFile('index').getContent().replace('__SEGARA_MODE__', mode);
  return HtmlService.createHtmlOutput(html)
    .setTitle('Stok Segara')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/* ---------- Setup (jalankan sekali dari editor) ---------- */
function setup() {
  // Script yang dibuat dari Sheet (Ekstensi → Apps Script) memakai sheet itu;
  // script standalone memakai DEFAULT_SS_ID.
  var ss = SpreadsheetApp.getActiveSpreadsheet() || (DEFAULT_SS_ID ? SpreadsheetApp.openById(DEFAULT_SS_ID) : null);
  if (!ss) throw new Error('Isi DEFAULT_SS_ID di Kode.gs, atau buka Apps Script dari Google Sheet (Ekstensi → Apps Script).');
  var p = PropertiesService.getScriptProperties();
  p.setProperty('SS_ID', ss.getId());
  if (!p.getProperty('ADMIN_PIN')) p.setProperty('ADMIN_PIN', hashPin_('12345', adminSalt_()));
  SS_ = ss;
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
  if (!rows_('Karyawan').length) ['Budi', 'Sari', 'Andi'].forEach(function (n) {
    append_('Karyawan', { id: uid_(), nama: n, aktif: true, pin: '' });
  });
  if (!rows_('Barang').length) [
    ['Minyak goreng', 'liter', 'Bahan', 20, 'LUAR', 5],
    ['Beras', 'kg', 'Bahan', 50, 'LUAR', 10],
    ['Telur', 'butir', 'Bahan', 120, 'LUAR', 30],
    ['Gas LPG 3 kg', 'tabung', 'Operasional', 6, 'LUAR', 2],
    ['Sabun cuci piring', 'botol', 'Operasional', 8, 'LUAR', 2]
  ].forEach(function (r) {
    append_('Barang', { id: uid_(), nama: r[0], satuan: r[1], kategori: r[2], stok_dalam: r[3], stok_luar: 0, ambang_min: r[5], alur: r[4], aktif: true });
  });
}

/* ---------- Helpers ---------- */
function ss_() {
  if (SS_) return SS_;
  var id = PropertiesService.getScriptProperties().getProperty('SS_ID') || DEFAULT_SS_ID;
  if (!id) throw new Error('Sistem belum di-setup. Jalankan fungsi setup di editor Apps Script.');
  SS_ = SpreadsheetApp.openById(id);
  if (PropertiesService.getScriptProperties().getProperty('SKEMA') !== SKEMA_V) migrasi_(SS_);
  return SS_;
}
function sheet_(n) { return ss_().getSheetByName(n); }
function rows_(n) {
  var v = sheet_(n).getDataRange().getValues();
  var h = v.shift();
  return v.map(function (r, i) {
    var o = { _row: i + 2 };
    h.forEach(function (k, j) { var x = r[j]; if (x instanceof Date) x = fmt_(x.getTime()); o[k] = x; });
    return o;
  }).filter(function (o) { return String(o[h[0]]) !== ''; });
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
function num_(x) { var n = Number(String(x).replace(',', '.')); return Number.isFinite(n) ? n : 0; }
// Angka dari input; error jika kosong/bukan angka (num_ diam-diam mengubahnya jadi 0).
function numWajib_(x, label) {
  var s = String(x === null || x === undefined ? '' : x).trim().replace(',', '.');
  var n = s === '' ? NaN : Number(s);
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
function cache_() {
  try {
    return typeof CacheService !== 'undefined' ? CacheService.getScriptCache() : null;
  } catch (e) {
    return null;
  }
}
function rateLimitGuard_(key, cd) {
  var c = cache_();
  if (!c) return;
  if (c.get('rl_lock_' + key)) throw new Error('Terlalu banyak percobaan gagal. Silakan tunggu ' + (cd || 60) + ' detik.');
}
function rateLimitCatatGagal_(key, cd) {
  var c = cache_();
  if (!c) return;
  var fk = 'rl_fail_' + key, lk = 'rl_lock_' + key;
  var count = Number(c.get(fk) || 0) + 1;
  var sec = cd || 60;
  if (count >= 5) {
    c.put(lk, 'locked', sec);
    c.remove(fk);
  } else {
    c.put(fk, String(count), sec);
  }
}
function rateLimitReset_(key) {
  var c = cache_();
  if (!c) return;
  c.remove('rl_fail_' + key);
  c.remove('rl_lock_' + key);
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
function cekAdminPin_(inputPin) {
  var p = pin_();
  var input = String(inputPin || '').trim();
  if (!input) return false;
  var hashed = hashPin_(input, adminSalt_());
  if (p === hashed) return true;
  // Kompatibilitas mundur: jika data di Script Properties masih berupa plaintext (sebelum migrasi hash)
  if (p === input) {
    PropertiesService.getScriptProperties().setProperty('ADMIN_PIN', hashed);
    return true;
  }
  return false;
}
function auth_(pin) {
  rateLimitGuard_('admin_auth', 60);
  if (!cekAdminPin_(pin)) {
    rateLimitCatatGagal_('admin_auth', 60);
    throw new Error('PIN salah');
  }
  rateLimitReset_('admin_auth');
}
function pub_(b) {
  return { id: String(b.id), nama: String(b.nama), satuan: String(b.satuan), kategori: String(b.kategori || ''),
    stok_dalam: num_(b.stok_dalam), stok_luar: num_(b.stok_luar), ambang_min: num_(b.ambang_min),
    alur: b.alur === 'LANGSUNG_HABIS' ? 'LANGSUNG_HABIS' : 'LUAR', aktif: truthy_(b.aktif),
    kode: String(b.kode || ''), catatan: String(b.catatan || '') };
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
  var luar = rows_('Barang').filter(function (b) { return num_(b.stok_luar) > 0; }).length;
  return {
    belumRekap: tx.length,
    lewatHari: tx.some(function (t) { return num_(t.ts) < today0; }),
    lastRekap: last ? fmt_(last) : null,
    barangLuar: luar
  };
}

/* ---------- Tablet ---------- */
// Karyawan tidak boleh melihat stok gudang: tablet hanya menerima data ini.
function tab_(b) { return { id: b.id, nama: b.nama, satuan: b.satuan, kategori: b.kategori, alur: b.alur, kode: b.kode, catatan: b.catatan }; }
function masukKaryawan(karyawanId, barangId, jumlah, supplier) {
  jumlah = r_(num_(jumlah));
  if (!(jumlah > 0)) throw new Error('Jumlah harus lebih dari 0');
  return lock_(function () {
    var b = find_('Barang', barangId), k = find_('Karyawan', karyawanId);
    if (!b || !truthy_(b.aktif)) throw new Error('Barang tidak ditemukan');
    if (!k || !truthy_(k.aktif)) throw new Error('Karyawan tidak aktif atau tidak ditemukan');
    b.stok_dalam = r_(num_(b.stok_dalam) + jumlah);
    update_('Barang', b);
    var ts = Date.now();
    append_('Transaksi', { id: uid_(), ts: ts, waktu: fmt_(ts), jenis: 'MASUK', barang_id: String(b.id), barang: b.nama, jumlah: jumlah,
      karyawan_id: String(k.id), karyawan: k.nama, alur: 'DALAM', supplier: supplier || '', status: 'AKTIF', dicatat_oleh: 'karyawan',
      kategori: String(b.kategori || ''), satuan: String(b.satuan || '') });
    return true;
  });
}
function getTablet() {
  return {
    barang: rows_('Barang').map(pub_).filter(function (b) { return b.aktif; }).map(tab_),
    karyawan: rows_('Karyawan').filter(function (k) { return truthy_(k.aktif); }).map(function (k) {
      return { id: String(k.id), nama: String(k.nama), punyaPin: pinK_(k) !== '' };
    }),
    status: status_(),
    urutan: urutanKategori_(),
    jamTutup: jamTutup_()
  };
}

function ambil_(karyawanId, barangId, jumlah, ts, oleh) {
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
      kategori: String(b.kategori || ''), satuan: String(b.satuan || '') };
    append_('Transaksi', t);
    return { tx: { id: t.id, ts: ts }, barang: oleh === 'admin' ? pub_(b) : tab_(pub_(b)) };
  });
}
function ambil(karyawanId, barangId, jumlah) { return ambil_(karyawanId, barangId, jumlah, Date.now(), 'karyawan'); }

function batalAmbil(txId, pin) {
  return lock_(function () {
    var admin = pin && cekAdminPin_(pin);
    if (!admin && cekAdminPin_(txId)) {
      var swap = txId; txId = pin; pin = swap;
      admin = true;
    }
    var t = find_('Transaksi', txId);
    if (!t || t.jenis !== 'AMBIL' || t.status !== 'AKTIF') throw new Error('Transaksi tidak bisa dibatalkan');
    if (!admin && Date.now() - num_(t.ts) > 65000) throw new Error('Batas 60 detik lewat. Minta admin untuk membatalkan.');
    if (num_(t.ts) <= lastRekapTs_()) throw new Error('Sudah direkap. Koreksi lewat edit rekap atau opname.');
    var b = find_('Barang', t.barang_id);
    if (!b) throw new Error('Barang tidak ditemukan');
    b.stok_dalam = r_(num_(b.stok_dalam) + num_(t.jumlah));
    if (t.alur === 'LUAR') b.stok_luar = Math.max(0, r_(num_(b.stok_luar) - num_(t.jumlah)));
    update_('Barang', b);
    t.status = 'BATAL';
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
  return rows_('Barang').map(function (b) {
    var id = String(b.id), d = before[id] || 0, a = after[id] || 0, luar = num_(b.stok_luar);
    var awal = Math.max(0, r_(luar - d - a));
    return { barang_id: id, nama: String(b.nama), satuan: String(b.satuan), saldo_awal: awal, diambil: d, setelah: a, maks: r_(awal + d) };
  }).filter(function (x) { return x.maks > 0; });
}
function rekapDraf() { var c = Date.now(); return { cutoff: c, baris: hitungRekap_(c) }; }

function simpanRekap(cutoff, karyawanId, input) {
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
      if (!i || i.sisa === '' || i.sisa === null || isNaN(Number(i.sisa))) throw new Error('Sisa ' + r.nama + ' belum diisi');
      var s = num_(i.sisa);
      if (s < 0 || s > r.maks + 1e-9) throw new Error('Sisa ' + r.nama + ' harus 0 sampai ' + r.maks);
    });
    var id = uid_();
    append_('Rekap', { id: id, ts: cutoff, waktu: fmt_(cutoff), karyawan_id: String(k.id), karyawan: k.nama, diedit_admin: false });
    draf.forEach(function (r) {
      var i = by[r.barang_id], s = r_(num_(i.sisa));
      var b = barang.filter(function (x) { return String(x.id) === r.barang_id; })[0];
      if (b) {
        b.stok_luar = r_(s + r.setelah);
        update_('Barang', b);
      }
      append_('RekapBaris', { rekap_id: id, barang_id: r.barang_id, barang: r.nama, saldo_awal: r.saldo_awal, diambil: r.diambil,
        sisa: s, terpakai: r_(r.maks - s), catatan: i.catatan || '' });
    });
    return { id: id };
  });
}

/* ---------- Admin ---------- */
function adminData(pin) {
  auth_(pin);
  var desc = function (a, b) { return num_(b.ts) - num_(a.ts); };
  var rekap = rows_('Rekap').sort(desc).slice(0, 30).map(clean_);
  var baris = rows_('RekapBaris');
  rekap.forEach(function (r) {
    r.diedit_admin = truthy_(r.diedit_admin);
    r.baris = baris.filter(function (x) { return String(x.rekap_id) === String(r.id); }).map(clean_);
  });
  return {
    barang: rows_('Barang').map(pub_),
    karyawan: rows_('Karyawan').map(function (k) {
      return { id: String(k.id), nama: String(k.nama), aktif: truthy_(k.aktif), punyaPin: pinK_(k) !== '' };
    }),
    transaksi: rows_('Transaksi').sort(desc).slice(0, 400).map(clean_),
    rekap: rekap,
    opname: rows_('Opname').sort(desc).slice(0, 100).map(clean_),
    status: status_(),
    lastRekap: lastRekapTs_(),
    urutan: urutanKategori_(),
    jamTutup: jamTutup_(),
    url: ss_().getUrl()
  };
}

function simpanBarang(pin, o) {
  auth_(pin);
  return lock_(function () {
    if (!String(o.nama || '').trim() || !String(o.satuan || '').trim()) throw new Error('Nama dan satuan wajib diisi');
    var min = r_(num_(o.ambang_min));
    if (min < 0) throw new Error('Ambang minimum tidak boleh negatif');
    var alur = o.alur === 'LANGSUNG_HABIS' ? 'LANGSUNG_HABIS' : 'LUAR';
    var kd = String(o.kode || '').trim();
    if (kd && rows_('Barang').some(function (x) { return String(x.kode) === kd && String(x.id) !== String(o.id || ''); })) throw new Error('Kode ' + kd + ' sudah dipakai barang lain');
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
      update_('Barang', b);
    } else {
      var awal = r_(num_(o.stok_awal));
      if (awal < 0) throw new Error('Stok awal tidak boleh negatif');
      var id = uid_(), ts = Date.now();
      append_('Barang', { id: id, nama: o.nama.trim(), satuan: o.satuan.trim(), kategori: (o.kategori || '').trim(),
        stok_dalam: awal, stok_luar: 0, ambang_min: min, alur: alur, aktif: true,
        kode: kd, catatan: String(o.catatan || '').trim() });
      if (awal > 0) append_('Transaksi', { id: uid_(), ts: ts, waktu: fmt_(ts), jenis: 'MASUK', barang_id: id, barang: o.nama.trim(),
        jumlah: awal, alur: 'DALAM', status: 'AKTIF', dicatat_oleh: 'admin', catatan: 'Stok awal', kategori: (o.kategori || '').trim(), satuan: o.satuan.trim() });
    }
    return true;
  });
}
function hapusBarang(pin, id) {
  auth_(pin);
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


function simpanKaryawan(pin, o) {
  auth_(pin);
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
      if (pVal !== undefined) k.pin = pVal ? hashPin_(pVal, karyawanSalt_(k.id)) : '';
      update_('Karyawan', k);
    } else {
      var newId = uid_();
      append_('Karyawan', { id: newId, nama: nm, aktif: true, pin: pVal ? hashPin_(pVal, karyawanSalt_(newId)) : '' });
    }
    return true;
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
  var cocok = (stored === hashed) || (stored === input) || legacyNum;
  if (!cocok) {
    rateLimitCatatGagal_('karyawan_' + karyawanId, 60);
    throw new Error('PIN karyawan salah');
  }
  if (stored !== hashed) {
    k.pin = hashed;
    update_('Karyawan', k);
  }
  rateLimitReset_('karyawan_' + karyawanId);
  return true;
}

function stokMasuk(pin, barangId, jumlah, supplier, catatan) {
  auth_(pin);
  jumlah = r_(num_(jumlah));
  if (!(jumlah > 0)) throw new Error('Jumlah harus lebih dari 0');
  return lock_(function () {
    var b = find_('Barang', barangId);
    if (!b) throw new Error('Barang tidak ditemukan');
    b.stok_dalam = r_(num_(b.stok_dalam) + jumlah);
    update_('Barang', b);
    var ts = Date.now();
    append_('Transaksi', { id: uid_(), ts: ts, waktu: fmt_(ts), jenis: 'MASUK', barang_id: String(b.id), barang: b.nama, jumlah: jumlah,
      alur: 'DALAM', supplier: supplier || '', status: 'AKTIF', dicatat_oleh: 'admin', catatan: catatan || '', kategori: String(b.kategori || ''), satuan: String(b.satuan || '') });
    return true;
  });
}

function ambilAdmin(pin, karyawanId, barangId, jumlah, ts) {
  auth_(pin);
  ts = num_(ts) || Date.now();
  if (ts > Date.now() + 60000) throw new Error('Waktu tidak boleh di masa depan');
  if (ts <= lastRekapTs_()) throw new Error('Waktu sebelum rekap terakhir. Koreksi lewat edit rekap atau opname.');
  return ambil_(karyawanId, barangId, jumlah, ts, 'admin');
}

function simpanOpname(pin, items) {
  auth_(pin);
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

function editRekapTerakhir(pin, input) {
  auth_(pin);
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

function simpanPengaturan(pin, jamTutup, pinBaru) {
  auth_(pin);
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

function laporan(pin, dari, sampai) {
  auth_(pin);
  var p = function (s, add) { var a = String(s).split('-').map(Number); return new Date(a[0], a[1] - 1, a[2] + (add || 0)).getTime(); };
  var t0 = p(dari), t1 = p(sampai, 1), map = {};
  var barang = rows_('Barang').map(pub_);
  var g = function (id, nama) {
    id = String(id);
    if (!map[id]) {
      var b = barang.filter(function (x) { return x.id === id; })[0];
      map[id] = { nama: b ? b.nama : nama, satuan: b ? b.satuan : '', masuk: 0, terpakai_rekap: 0, langsung_habis: 0, opname: 0 };
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
    else if (t.jenis === 'AMBIL' && t.alur === 'LANGSUNG_HABIS') g(t.barang_id, t.barang).langsung_habis += num_(t.jumlah);
    else if (t.jenis === 'OPNAME') g(t.barang_id, t.barang).opname += num_(t.jumlah);
  });
  return Object.keys(map).map(function (k) {
    var r = map[k];
    return { nama: r.nama, satuan: r.satuan, masuk: r_(r.masuk), terpakai_rekap: r_(r.terpakai_rekap), langsung_habis: r_(r.langsung_habis),
      total_terpakai: r_(r.terpakai_rekap + r.langsung_habis), opname: r_(r.opname) };
  }).sort(function (a, b) { return a.nama < b.nama ? -1 : 1; });
}

function laporanKeSheet(pin, dari, sampai) {
  var rows = laporan(pin, dari, sampai);
  var ss = ss_(), s = ss.getSheetByName('Laporan') || ss.insertSheet('Laporan');
  s.clear();
  var head = ['Barang', 'Satuan', 'Masuk', 'Terpakai (rekap)', 'Langsung habis', 'Total terpakai', 'Selisih opname'];
  var data = [[safeCell_('Laporan ' + dari + ' s/d ' + sampai), '', '', '', '', '', ''], head].concat(rows.map(function (r) {
    return [safeCell_(r.nama), safeCell_(r.satuan), r.masuk, r.terpakai_rekap, r.langsung_habis, r.total_terpakai, r.opname];
  }));
  s.getRange(1, 1, data.length, head.length).setValues(data);
  s.getRange(1, 1, 2, head.length).setFontWeight('bold');
  return ss.getUrl() + '#gid=' + s.getSheetId();
}

/* ---------- Data Kedai Segara (Laporan Stock Agustus · CV. Dapur Rumah Rasa) ---------- */
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
    ['TP', 'Teri Pete', 'Porsi'],
    ['TNG', 'Topping Nasi Gila', 'Porsi'],
    ['PT', 'Pete', 'Porsi'],
    ['B', 'Bagor', 'Porsi'],
    ['DS', 'Daging Sambal Hijau', 'Porsi'],
    ['BC', 'Sambal Baby Cumi', 'Porsi'],
    ['TA', 'Tahu Aci', 'Pack'],
    ['Cr', 'Cireng', 'Porsi']
  ]],
  ['Freezer Bumbu', [
    ['SB', 'Sambal Bawang', 'Pack'],
    ['S.terasi', 'Sambal Terasi', 'Pack'],
    ['SK', 'Sambal Kuning', 'Pack'],
    ['SP', 'Sambal Petis', 'Pack'],
    ['ST', 'Sambal Terong', 'Pack'],
    ['BS', 'Bumbu Segara', 'Pack'],
    ['BL', 'Bumbu Lidah', 'Pack'],
    ['BK', 'Bumbu Kwetiau', 'Pack'],
    ['GM', 'Gorengan Mbakmoy', 'Pack'],
    ['BU', 'Bumbu Ungkep', 'Pack'],
    ['BNG', 'Bumbu Nasi Gila', 'Pack'],
    ['BT', 'Bumbu Teri', 'Pack'],
    ['BMG', 'Bumbu Mie Goreng Jawa', 'Pack']
  ]],
  ['Freezer Roti & Juice', [
    ['RotiB', 'Roti Bakar', 'Pack'],
    ['RotiA', 'Roti Angsle', 'Pack'],
    ['Sirsak', 'Sirsak Juice', 'Pack'],
    ['SM', 'Manggo Juice', 'Pack'],
    ['Berries', 'Mix Berries', 'Pack']
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
    ['LT', 'Lemon Tea', 'Pack']
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
    ['MC', 'Kunci Mas', 'Pcs']
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
    ['Tomat', 'Saus Tomat', 'Pack']
  ]],
  ['Bahan Snack/Dessert + Tepung', [
    ['Beras', 'Tepung Beras Bola', 'Pack'],
    ['Ketan', 'Tepung Ketan', 'Pack'],
    ['Maizena', 'Tepung Maizena', 'Pack'],
    ['Terigu', 'Tepung Terigu', 'Pack'],
    ['Tapioka', 'Tepung Tapioka', 'Pack'],
    ['Urai', 'Mie Urai', 'Pack'],
    ['TT', 'Tepung Telur', 'Pack'],
    ['Plain', 'Nurtijel Plain', 'Pack'],
    ['Sagu', 'Sagu Mutiara', 'Pack'],
    ['Nata', 'Nata Decoco', 'Pack'],
    ['Hijau', 'Pewarna Hijau', 'Btl'],
    ['Pink', 'Pewarna Pink', 'Btl'],
    ['V', 'Vanilli', 'Btl']
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
    ['Bm21', 'Plastik Bima uk21', 'Pack'],
    ['Tbs', 'Take Away Box S', 'Pack'],
    ['TbL', 'Take Away Box L', 'Pack'],
    ['Bm28', 'Plastik Bima uk.28', 'Pack'],
    ['Sdt', 'Sedotan', 'Pack'],
    ['Bm15', 'Plastik Bima uk.15', 'Pack'],
    ['Sumpit', 'Sumpit', 'Pack'],
    ['Sbb', 'Sendok Bebek', 'Pack'],
    ['2in1', '2in1 Sendok', 'Pack'],
    ['Hot', 'Cup Hot', 'Pack'],
    ['SoupM', 'Plastik Soup M', 'Roll'],
    ['SoupL', 'Plastik Soup L', 'Pack'],
    ['Lakban', 'Lakban Segara', 'Roll']
  ]]
];

/**
 * Jalankan SEKALI dari editor: pilih "imporDataSegara" di dropdown, lalu klik Jalankan.
 * Menambahkan semua barang Kedai Segara ke sheet Barang (stok 0, alur lewat Stock Luar).
 * Stok diisi setelah hitung fisik lewat Admin → Opname.
 * Aman dijalankan ulang: barang yang kodenya sudah ada tidak diubah.
 */
function imporDataSegara() {
  migrasi_(ss_());
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