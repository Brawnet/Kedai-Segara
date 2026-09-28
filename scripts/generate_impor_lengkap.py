import csv
import json

def main():
    print("Membaca data CSV...")
    with open("Data/csv/Barang.csv", "r", encoding="utf-8") as f:
        b_rows = list(csv.DictReader(f))
        for b in b_rows:
            b['stok_dalam'] = float(b['stok_dalam']) if '.' in b['stok_dalam'] else int(b['stok_dalam'])
            b['stok_luar'] = int(b['stok_luar'])
            b['ambang_min'] = int(b['ambang_min'])
            b['aktif'] = b['aktif'].lower() == 'true'

    with open("Data/csv/Transaksi.csv", "r", encoding="utf-8") as f:
        t_rows = list(csv.DictReader(f))
        for t in t_rows:
            t['ts'] = int(t['ts'])
            t['jumlah'] = float(t['jumlah']) if '.' in t['jumlah'] else int(t['jumlah'])

    with open("Data/csv/Karyawan.csv", "r", encoding="utf-8") as f:
        k_rows = list(csv.DictReader(f))
        for k in k_rows:
            k['aktif'] = k['aktif'].lower() == 'true'

    with open("Data/csv/Pengaturan.csv", "r", encoding="utf-8") as f:
        p_rows = list(csv.DictReader(f))

    print(f"Loaded: {len(b_rows)} barang, {len(t_rows)} transaksi, {len(k_rows)} karyawan, {len(p_rows)} pengaturan.")

    header_comment = f"""/**
 * Skrip Impor Otomatis Data Kedai Segara (Opsi 1: Bersih & Lengkap)
 * Sumber: Data/Laporan Stock Barang Kedai Segara.xlsx
 *
 * Fungsi: jalankanImporOpsi1()
 * - Mengosongkan data dummy testing di Google Sheets
 * - Menulis {len(b_rows)} barang lengkap dengan stok akhir aktual
 * - Menulis {len(t_rows)} riwayat transaksi bulan September (Masuk & Keluar)
 * - Menulis {len(k_rows)} karyawan dan {len(p_rows)} pengaturan
 * - Mengosongkan sheet rekap & opname lama
 */
"""
    var_barang = f"var IMPOR_BARANG = {json.dumps(b_rows, ensure_ascii=False)};\n\n"
    var_tx = f"var IMPOR_TRANSAKSI = {json.dumps(t_rows, ensure_ascii=False)};\n\n"
    var_k = f"var IMPOR_KARYAWAN = {json.dumps(k_rows, ensure_ascii=False)};\n\n"
    var_p = f"var IMPOR_PENGATURAN = {json.dumps(p_rows, ensure_ascii=False)};\n\n"

    function_code = """function jalankanImporOpsi1() {
  var ss = ss_();
  return lock_(function () {
    migrasi_(ss);

    // 1. Sheet Barang
    var sBarang = sheet_('Barang');
    var maxB = sBarang.getMaxRows();
    var lastB = sBarang.getLastRow();
    if (lastB > 1) {
      sBarang.getRange(2, 1, lastB - 1, sBarang.getLastColumn()).clearContent();
    }
    var bCols = SHEETS.Barang;
    var bRows = IMPOR_BARANG.map(function (b) {
      return bCols.map(function (col) {
        var val = b[col];
        return safeCell_(val === undefined ? '' : val);
      });
    });
    var needB = bRows.length + 1;
    if (maxB < needB) {
      sBarang.insertRowsAfter(maxB, needB - maxB);
    }
    sBarang.getRange(2, 1, bRows.length, bCols.length).setValues(bRows);

    // 2. Sheet Transaksi
    var sTx = sheet_('Transaksi');
    var maxTx = sTx.getMaxRows();
    var lastTx = sTx.getLastRow();
    if (lastTx > 1) {
      sTx.getRange(2, 1, lastTx - 1, sTx.getLastColumn()).clearContent();
    }
    var txCols = SHEETS.Transaksi;
    var txRows = IMPOR_TRANSAKSI.map(function (t) {
      return txCols.map(function (col) {
        var val = t[col];
        return safeCell_(val === undefined ? '' : val);
      });
    });
    var needTx = txRows.length + 1;
    if (maxTx < needTx) {
      sTx.insertRowsAfter(maxTx, needTx - maxTx);
    }
    var BATCH = 500;
    for (var offset = 0; offset < txRows.length; offset += BATCH) {
      var chunk = txRows.slice(offset, offset + BATCH);
      sTx.getRange(2 + offset, 1, chunk.length, txCols.length).setValues(chunk);
    }

    // 3. Sheet Karyawan
    var sKaryawan = sheet_('Karyawan');
    var maxK = sKaryawan.getMaxRows();
    var lastK = sKaryawan.getLastRow();
    if (lastK > 1) {
      sKaryawan.getRange(2, 1, lastK - 1, sKaryawan.getLastColumn()).clearContent();
    }
    var kCols = SHEETS.Karyawan;
    var kRows = IMPOR_KARYAWAN.map(function (k) {
      return kCols.map(function (col) {
        var val = k[col];
        return safeCell_(val === undefined ? '' : val);
      });
    });
    var needK = kRows.length + 1;
    if (maxK < needK) {
      sKaryawan.insertRowsAfter(maxK, needK - maxK);
    }
    sKaryawan.getRange(2, 1, kRows.length, kCols.length).setValues(kRows);

    // 4. Pengaturan
    IMPOR_PENGATURAN.forEach(function (p) {
      setSetting_(p.kunci, p.nilai);
    });

    // 5. Kosongkan riwayat operasional lama
    ['Rekap', 'RekapBaris', 'Opname'].forEach(function (shName) {
      var sh = sheet_(shName);
      if (sh) {
        var lr = sh.getLastRow();
        if (lr > 1) {
          sh.getRange(2, 1, lr - 1, sh.getLastColumn()).clearContent();
        }
      }
    });

    return {
      sukses: true,
      barang: bRows.length,
      transaksi: txRows.length,
      karyawan: kRows.length,
      pesan: 'Berhasil mengimpor Opsi 1: ' + bRows.length + ' barang dan ' + txRows.length + ' transaksi September.'
    };
  });
}
"""

    code = header_comment + "\n" + var_barang + var_tx + var_k + var_p + function_code
    out_file = "apps-script/ImporLengkap.gs"
    with open(out_file, "w", encoding="utf-8") as f:
        f.write(code)
    print(f"Berhasil membuat file: {out_file}")

if __name__ == '__main__':
    main()
