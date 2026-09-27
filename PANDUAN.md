# Panduan Pemasangan & Penggunaan Sistem Stok Segara

Sistem ini berjalan di atas **Google Apps Script** dengan database **Google Sheets**. Tidak memerlukan hosting berbayar atau server Node.js.

---

## Langkah 1: Buat Google Sheet
1. Buka [Google Sheets](https://sheets.new) di browser Anda.
2. Beri nama spreadsheet, misalnya: **Stok Gudang Segara**.

---

## Langkah 2: Masukkan Kode ke Apps Script
1. Di Google Sheet tersebut, klik menu **Ekstensi (Extensions)** → **Apps Script**.
2. Di panel kiri:
   - Buka file `Code.gs`, hapus semua isinya, lalu salin seluruh isi file **`Kode.gs`** ke sana.
   - Klik tombol **+** (Add a file) di samping "Files" → pilih **HTML**. Beri nama **`index`** (sehingga menjadi `index.html`).
   - Salin seluruh isi file **`index.html`** ke file tersebut.
3. Klik tombol **Save** (ikon disket) atau tekan `Ctrl + S`.

---

## Langkah 3: Inisialisasi Database
1. Di bilah menu atas Apps Script, cari dropdown pilihan fungsi (biasanya tertulis `doGet`).
2. Ganti pilihan fungsi menjadi **`setup`**.
3. Klik tombol **Jalankan (Run)**.
4. Google akan meminta izin akses (**Authorization Required**):
   - Klik **Review Permissions**.
   - Pilih akun Google Anda.
   - Klik **Advanced (Lanjutan)** → klik **Go to Untitled project (unsafe)** / Buka project.
   - Klik **Allow (Izinkan)**.
5. Tunggu hingga eksekusi selesai (`setup` akan membuat tabel-tabel sheet otomatis).

---

## Langkah 4: Impor Data Barang Kedai Segara
1. Di dropdown fungsi yang sama, pilih fungsi **`imporDataSegara`**.
2. Klik tombol **Jalankan (Run)**.
3. Fungsi ini akan otomatis memasukkan seluruh daftar menu dan bahan baku Segara (Freezer Protein, Bumbu, Drink, Dairy, Bahan Dasar, Supplies, dll.) ke sheet `Barang`.

---

## Langkah 5: Deploy Menjadi Web App
1. Di pojok kanan atas Apps Script, klik tombol biru **Terapkan (Deploy)** → **Penerapan baru (New deployment)**.
2. Klik ikon gerigi (Select type) di samping kiri → pilih **Aplikasi web (Web app)**.
3. Isi konfigurasi berikut:
   - **Deskripsi**: `Stok Segara v1`
   - **Jalankan sebagai (Execute as)**: `Saya (email Anda)`
   - **Yang memiliki akses (Who has access)**: `Siapa saja (Anyone)` *(agar tablet operasional bisa membuka tanpa perlu login Google)*
4. Klik **Terapkan (Deploy)**.
5. Salin **URL Aplikasi Web** yang diberikan.

---

## Langkah 6: Cara Pakai

### Mode Tablet (Karyawan / Dapur)
* Buka URL Web App di browser tablet atau smartphone dapur.
* Karyawan dapat langsung memilih namanya untuk:
  - Mencatat pengambilan barang dari gudang ke dapur.
  - Mencatat barang masuk dari supplier.
  - Melakukan closing sisa dapur di malam hari.

### Mode Admin (Owner / Manager)
* Buka URL Web App dengan menambahkan parameter di belakangnya:
  ```
  https://script.google.com/macros/s/.../exec?mode=admin
  ```
  *(Atau buka URL biasa lalu klik tab **Admin** di pojok kanan atas)*.
* Masukkan **PIN default: `12345`**.
* Di menu Admin, Anda dapat:
  - Mengubah PIN admin dan jam tutup operasional.
  - Mengisi stok awal fisik via menu **Opname**.
  - Melihat peringatan stok menipis.
  - Mengunduh rekap pemakaian ke sheet **Laporan**.

---

## Hak Akses & Keamanan Sistem

Aplikasi ini memiliki 3 lapis perlindungan akses:

### 1. Lapis Jaringan (Tautan / URL Web App)
* **Pilihan `Who has access: Anyone` saat deploy:**
  * Siapa pun yang memiliki link URL dapat membuka tampilan tablet tanpa perlu login akun Google.
  * Sangat cocok untuk tablet/HP operasional dapur agar staf tidak terkendala login akun.
* **Pilihan `Anyone within organization` (khusus Google Workspace bisnis):**
  * Hanya pengguna dengan email domain perusahaan (`@perusahaan.com`) yang dapat membuka link.

### 2. Lapis Aplikasi (Pembagian Peran Tablet vs Admin)
| Peran | Syarat Masuk | Hak Akses & Batasan |
| :--- | :--- | :--- |
| **Karyawan / Tablet** | Cukup buka link URL | • Bisa catat barang keluar (ambil ke dapur), barang masuk, dan rekap sisa malam.<br>• Bisa membatalkan transaksi pengambilan sendiri dalam waktu **maksimal 60 detik**.<br>• **Aman:** Karyawan **TIDAK BISA** melihat sisa angka stok gudang (`Stock Dalam`). Hanya nama dan satuan barang yang ditampilkan.<br>• Tidak bisa melihat laporan, opname, maupun data master. |
| **Admin / Owner** | Wajib input **PIN Admin** (Default: `12345`) | • Akses penuh seluruh stok gudang dan dapur.<br>• Tambah/edit/arsip barang dan karyawan.<br>• Melakukan stock opname (penyesuaian fisik vs sistem).<br>• Melihat riwayat lengkap dan laporan pemakaian.<br>• Mengubah PIN admin dan jam tutup toko. |

### 3. Lapis Database (Spreadsheet Google)
* File Google Sheets yang menjadi database hanya dapat dibuka langsung di Google Drive oleh **pemilik akun Google** (atau email yang sengaja Anda bagikan akses editnya).
* Pengguna di tablet web app sama sekali tidak memiliki akses langsung ke file spreadsheet. Semua operasi baca/tulis dijalankan oleh server Apps Script atas nama akun Anda (*Execute as: Me*).
