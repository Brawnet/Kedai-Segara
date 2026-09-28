import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('Database Stok Segara Converted Data Invariants', () => {
  it('semua file hasil konversi harus ada di folder Data/', () => {
    assert.ok(existsSync('Data/Database_Stok_Segara.xlsx'), 'File Data/Database_Stok_Segara.xlsx harus ada');
    assert.ok(existsSync('apps-script/data_segara_september.js'), 'File apps-script/data_segara_september.js harus ada');
    
    const csvFiles = [
      'Barang.csv',
      'Transaksi.csv',
      'Karyawan.csv',
      'Pengaturan.csv',
      'Rekap.csv',
      'RekapBaris.csv',
      'Opname.csv',
      'Log_Login.csv',
      'Rekap_September.csv',
    ];
    for (const f of csvFiles) {
      assert.ok(existsSync(join('Data/csv', f)), `File Data/csv/${f} harus ada`);
    }
  });

  it('struktur kolom pada CSV Barang harus persis mengikuti skema SHEETS.Barang', () => {
    const content = readFileSync('Data/csv/Barang.csv', 'utf-8');
    const firstLine = content.split(/\r?\n/)[0];
    const expected = 'id,nama,satuan,kategori,stok_dalam,stok_luar,ambang_min,alur,aktif,kode,catatan';
    assert.equal(firstLine, expected);
  });

  it('struktur kolom pada CSV Transaksi harus persis mengikuti skema SHEETS.Transaksi', () => {
    const content = readFileSync('Data/csv/Transaksi.csv', 'utf-8');
    const firstLine = content.split(/\r?\n/)[0];
    const expected = 'id,ts,waktu,jenis,barang_id,barang,jumlah,karyawan_id,karyawan,alur,supplier,status,dicatat_oleh,catatan,kategori,satuan';
    assert.equal(firstLine, expected);
  });

  it('setiap transaksi di Transaksi.csv harus memiliki barang_id yang valid dan terdaftar di Barang.csv', () => {
    const barangContent = readFileSync('Data/csv/Barang.csv', 'utf-8');
    const barangLines = barangContent.split(/\r?\n/).filter(Boolean).slice(1);
    const validBarangIds = new Set(barangLines.map((l) => l.split(',')[0]));

    assert.equal(validBarangIds.size, 120, 'Harus ada 120 barang (119 September + 1 legacy BU)');

    const txContent = readFileSync('Data/csv/Transaksi.csv', 'utf-8');
    const txLines = txContent.split(/\r?\n/).filter(Boolean).slice(1);
    assert.equal(txLines.length, 1519, 'Harus ada 1519 transaksi (170 Masuk + 1349 Ambil)');

    for (const line of txLines) {
      // Split basic CSV columns
      const parts = line.split(',');
      const txId = parts[0];
      const jenis = parts[3];
      const barangId = parts[4];
      const jumlah = Number(parts[6]);

      assert.ok(['MASUK', 'AMBIL'].includes(jenis), `Jenis transaksi harus MASUK atau AMBIL: ${txId}`);
      assert.ok(validBarangIds.has(barangId), `Barang ID ${barangId} pada transaksi ${txId} tidak ditemukan di master Barang`);
      assert.ok(Number.isFinite(jumlah) && jumlah >= 0, `Jumlah pada transaksi ${txId} harus angka non-negatif`);
    }
  });

  it('file data_segara_september.js harus valid JavaScript dan mendefinisikan DATA_SEGARA', () => {
    const jsContent = readFileSync('apps-script/data_segara_september.js', 'utf-8');
    assert.ok(jsContent.includes('var DATA_SEGARA = ['), 'Harus mendefinisikan var DATA_SEGARA');
    assert.ok(jsContent.includes('Freezer Protein'), 'Harus memuat kategori Freezer Protein');
    assert.ok(jsContent.includes('LGS'), 'Harus memuat kode LGS (Lidah Goreng Segara)');
    assert.ok(jsContent.includes('BUL'), 'Harus memuat kode BUL (Bumbu Ungkep Lidah)');
  });
});
