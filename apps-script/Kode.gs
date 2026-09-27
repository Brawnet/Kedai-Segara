/**
 * Sistem Manajemen Stok Gudang
 * Google Apps Script + Google Sheets (database) + Web App (tablet & admin)
 * Alur: Stock Dalam (gudang) → Stock Luar (area kerja) → Rekap sisa akhir hari.
 */
var SHEETS = {
  Barang: ['id', 'nama', 'satuan', 'kategori', 'stok_dalam', 'stok_luar', 'ambang_min', 'alur', 'aktif', 'kode', 'catatan'],
  Karyawan: ['id', 'nama', 'aktif'],
  Transaksi: ['id', 'ts', 'waktu', 'jenis', 'barang_id', 'barang', 'jumlah', 'karyawan_id', 'karyawan', 'alur', 'supplier', 'status', 'dicatat_oleh', 'catatan', 'kategori', 'satuan'],
  Rekap: ['id', 'ts', 'waktu', 'karyawan_id', 'karyawan', 'diedit_admin'],
  RekapBaris: ['rekap_id', 'barang_id', 'barang', 'saldo_awal', 'diambil', 'sisa', 'terpakai', 'catatan'],
  Opname: ['id', 'ts', 'waktu', 'barang_id', 'barang', 'sistem', 'fisik', 'selisih'],
  Pengaturan: ['kunci', 'nilai']
};
var TZ = Session.getScriptTimeZone();
var SS_ = null;
var SKEMA_V = '2'; // naikkan jika kolom di SHEETS berubah

/* ---------- Web app ---------- */
// index.html adalah hasil build (Vite, satu file). Tidak dievaluasi sebagai template
// karena kode JS hasil build bisa mengandung "<?" — mode disisipkan lewat placeholder.
function doGet(e) {
  var mode = (e && e.parameter && e.parameter.mode) === 'admin' ? 'admin' : 'tablet';
  var html = HtmlService.createHtmlOutputFromFile('index').getContent().replace('__SEGARA_MODE__', mode);
  return HtmlService.createHtmlOutput(html)
    .setTitle('Stok Gudang')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/* ---------- Setup (jalankan sekali dari editor) ---------- */
function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('Buka Apps Script dari Google Sheet (Ekstensi → Apps Script), lalu jalankan setup.');
  var p = PropertiesService.getScriptProperties();
  p.setProperty('SS_ID', ss.getId());
  if (!p.getProperty('ADMIN_PIN')) p.setProperty('ADMIN_PIN', '12345');
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
    append_('Karyawan', { id: uid_(), nama: n, aktif: true });
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
  var id = PropertiesService.getScriptProperties().getProperty('SS_ID');
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
function append_(n, o) { sheet_(n).appendRow(SHEETS[n].map(function (k) { return o[k] === undefined ? '' : o[k]; })); }
function update_(n, o) {
  var h = SHEETS[n];
  sheet_(n).getRange(o._row, 1, 1, h.length).setValues([h.map(function (k) { return o[k] === undefined ? '' : o[k]; })]);
}
function find_(n, id) { return rows_(n).filter(function (o) { return String(o.id) === String(id); })[0]; }
function clean_(o) { var c = {}; Object.keys(o).forEach(function (k) { if (k !== '_row') c[k] = o[k]; }); return c; }
function uid_() { return Utilities.getUuid().replace(/-/g, '').slice(0, 10); }
function num_(x) { var n = Number(String(x).replace(',', '.')); return isNaN(n) ? 0 : n; }
function r_(x) { return Math.round(x * 1000) / 1000; }
function truthy_(x) { return x === true || String(x).toUpperCase() === 'TRUE'; }
function fmt_(ms) { return Utilities.formatDate(new Date(ms), TZ, 'dd/MM/yyyy HH:mm'); }
function lock_(fn) {
  var l = LockService.getScriptLock();
  l.waitLock(20000);
  try { return fn(); } finally { l.releaseLock(); }
}
function getSetting_(k) {
  var r = rows_('Pengaturan').filter(function (o) { return o.kunci === k; })[0];
  return r ? String(r.nilai) : '';
}
function setSetting_(k, v) {
  var r = rows_('Pengaturan').filter(function (o) { return o.kunci === k; })[0];
  if (r) { r.nilai = v; update_('Pengaturan', r); } else append_('Pengaturan', { kunci: k, nilai: v });
}
function pin_() {
  var p = PropertiesService.getScriptProperties().getProperty('ADMIN_PIN');
  if (!p) throw new Error('Sistem belum di-setup. Jalankan fungsi setup di editor Apps Script.');
  return p;
}
function auth_(pin) { if (String(pin).trim() !== pin_()) throw new Error('PIN salah'); }
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
    if (!k) throw new Error('Karyawan tidak ditemukan');
    b.stok_dalam = r_(num_(b.stok_dalam) + jumlah);
    update_('Barang', b);
    var ts = Date.now();
    append_('Transaksi', { id: uid_(), ts: ts, waktu: fmt_(ts), jenis: 'MASUK', barang_id: String(b.id), barang: b.nama, jumlah: jumlah,
      karyawan_id: String(k.id), karyawan: k.nama, supplier: supplier || '', status: 'AKTIF', dicatat_oleh: 'karyawan',
      kategori: String(b.kategori || ''), satuan: String(b.satuan || '') });
    return true;
  });
}
function getTablet() {
  return {
    barang: rows_('Barang').map(pub_).filter(function (b) { return b.aktif; }).map(tab_),
    karyawan: rows_('Karyawan').filter(function (k) { return truthy_(k.aktif); }).map(function (k) { return { id: String(k.id), nama: String(k.nama) }; }),
    status: status_(),
    urutan: urutanKategori_(),
    jamTutup: getSetting_('jam_tutup')
  };
}

function ambil_(karyawanId, barangId, jumlah, ts, oleh) {
  jumlah = r_(num_(jumlah));
  if (!(jumlah > 0)) throw new Error('Jumlah harus lebih dari 0');
  return lock_(function () {
    var b = find_('Barang', barangId), k = find_('Karyawan', karyawanId);
    if (!b || !truthy_(b.aktif)) throw new Error('Barang tidak ditemukan');
    if (!k) throw new Error('Karyawan tidak ditemukan');
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
    var p = pin_();
    if (String(txId) === String(p)) {
      var swap = txId; txId = pin; pin = swap;
    }
    var t = find_('Transaksi', txId);
    if (!t || t.jenis !== 'AMBIL' || t.status !== 'AKTIF') throw new Error('Transaksi tidak bisa dibatalkan');
    var admin = pin && String(pin) === p;
    if (!admin && Date.now() - num_(t.ts) > 65000) throw new Error('Batas 60 detik lewat. Minta admin untuk membatalkan.');
    if (num_(t.ts) <= lastRekapTs_()) throw new Error('Sudah direkap. Koreksi lewat edit rekap atau opname.');
    var b = find_('Barang', t.barang_id);
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
  return lock_(function () {
    var last = lastRekapTs_();
    if (cutoff <= last) throw new Error('Sudah ada rekap yang lebih baru. Buka ulang menu rekap.');
    var k = find_('Karyawan', karyawanId);
    if (!k) throw new Error('Karyawan tidak ditemukan');
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
      b.stok_luar = r_(s + r.setelah);
      update_('Barang', b);
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
    karyawan: rows_('Karyawan').map(function (k) { return { id: String(k.id), nama: String(k.nama), aktif: truthy_(k.aktif) }; }),
    transaksi: rows_('Transaksi').sort(desc).slice(0, 400).map(clean_),
    rekap: rekap,
    opname: rows_('Opname').sort(desc).slice(0, 100).map(clean_),
    status: status_(),
    lastRekap: lastRekapTs_(),
    urutan: urutanKategori_(),
    jamTutup: getSetting_('jam_tutup'),
    url: ss_().getUrl()
  };
}

function simpanBarang(pin, o) {
  auth_(pin);
  return lock_(function () {
    if (!String(o.nama || '').trim() || !String(o.satuan || '').trim()) throw new Error('Nama dan satuan wajib diisi');
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
      b.alur = alur; b.ambang_min = num_(o.ambang_min); b.aktif = aktif;
      update_('Barang', b);
    } else {
      var awal = r_(num_(o.stok_awal));
      var id = uid_(), ts = Date.now();
      append_('Barang', { id: id, nama: o.nama.trim(), satuan: o.satuan.trim(), kategori: (o.kategori || '').trim(),
        stok_dalam: awal, stok_luar: 0, ambang_min: num_(o.ambang_min), alur: alur, aktif: true,
        kode: kd, catatan: String(o.catatan || '').trim() });
      if (awal > 0) append_('Transaksi', { id: uid_(), ts: ts, waktu: fmt_(ts), jenis: 'MASUK', barang_id: id, barang: o.nama.trim(),
        jumlah: awal, status: 'AKTIF', dicatat_oleh: 'admin', catatan: 'Stok awal', kategori: (o.kategori || '').trim(), satuan: o.satuan.trim() });
    }
    return true;
  });
}

function simpanKaryawan(pin, o) {
  auth_(pin);
  if (!String(o.nama || '').trim()) throw new Error('Nama wajib diisi');
  if (o.id) {
    var k = find_('Karyawan', o.id);
    if (!k) throw new Error('Karyawan tidak ditemukan');
    k.nama = o.nama.trim(); k.aktif = o.aktif !== false;
    update_('Karyawan', k);
  } else append_('Karyawan', { id: uid_(), nama: o.nama.trim(), aktif: true });
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
      supplier: supplier || '', status: 'AKTIF', dicatat_oleh: 'admin', catatan: catatan || '', kategori: String(b.kategori || ''), satuan: String(b.satuan || '') });
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
      if (i.fisik === '' || i.fisik === null) return;
      var f = r_(num_(i.fisik));
      if (f < 0) throw new Error('Stok fisik tidak boleh negatif');
      var b = barang.filter(function (x) { return String(x.id) === String(i.barang_id); })[0];
      if (!b) return;
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
      if (!x || i.sisa === '' || i.sisa === null) return;
      var s = r_(num_(i.sisa)), maks = r_(num_(x.saldo_awal) + num_(x.diambil));
      if (s < 0 || s > maks + 1e-9) throw new Error('Sisa ' + x.barang + ' harus 0 sampai ' + maks);
      var delta = r_(s - num_(x.sisa));
      if (!delta) return;
      var b = barang.filter(function (y) { return String(y.id) === String(x.barang_id); })[0];
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
  if (jamTutup) setSetting_('jam_tutup', jamTutup);
  if (pinBaru) {
    if (!/^\d{4,8}$/.test(pinBaru)) throw new Error('PIN harus 4–8 angka');
    PropertiesService.getScriptProperties().setProperty('ADMIN_PIN', pinBaru);
  }
  return true;
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
  var data = [['Laporan ' + dari + ' s/d ' + sampai, '', '', '', '', '', ''], head].concat(rows.map(function (r) {
    return [r.nama, r.satuan, r.masuk, r.terpakai_rekap, r.langsung_habis, r.total_terpakai, r.opname];
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
        baru.push(SHEETS.Barang.map(function (k) { return o[k] === undefined ? '' : o[k]; }));
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