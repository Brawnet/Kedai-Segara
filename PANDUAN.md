# Panduan Pemasangan Stok Segara ke Google Spreadsheet Kosong

Tutorial lengkap langkah demi langkah untuk memasang sistem Stok Segara ke **Google Spreadsheet kosong** menggunakan file yang sudah siap pakai di folder `apps-script/`.

---

## 📦 Berkas yang Digunakan

Semua file yang Anda butuhkan sudah siap pakai di dalam folder:
📁 **`apps-script/`** *(lokasi: `E:\Kerja\Segara\apps-script`)*

Di dalam folder tersebut ada 3 file:
1. **`Kode.gs`** — Logika backend & database sistem.
2. **`index.html`** — Tampilan antarmuka aplikasi web (sudah di-build rapi, siap pakai).
3. **`appsscript.json`** — Konfigurasi zona waktu Makassar (WITA, UTC+8) & izin akses Google.

> **Catatan**: Anda **cukup mengambil 3 file di atas** (atau mengunggah folder `apps-script/` ini ke Google Drive Anda). Folder lain seperti `src/`, `node_modules/`, dan file konfigurasi lainnya tidak perlu diunggah.

---

## 🚀 Langkah Demi Langkah Pemasangan

### Langkah 1: Buka Google Spreadsheet Baru (Kosong)
1. Buka browser dan kunjungi: **[https://sheets.new](https://sheets.new)** (atau buat spreadsheet baru di Google Drive).
2. Di pojok kiri atas (tulisan *"Spreadsheet tanpa judul"*), beri nama dokumen Anda, misalnya: **`Database Stok Kedai Segara`**.
3. Biarkan spreadsheet dalam keadaan kosong (hanya ada *Sheet1* kosong).

---

### Langkah 2: Buka Apps Script dari Spreadsheet
1. Di menu bilah atas Google Spreadsheet, klik:
   **Ekstensi (Extensions)** → **Apps Script**.
2. Tab baru editor Google Apps Script akan terbuka otomatis dan langsung terhubung dengan spreadsheet Anda.
3. Di pojok kiri atas editor Apps Script (tulisan *"Untitled project"*), klik dan beri nama: **`Stok Segara Backend`**, lalu klik **Rename**.

---

### Langkah 3: Masukkan 3 File Kode

Lakukan 3 langkah penyalinan file berikut:

#### A. File `Kode.gs`
1. Di panel kiri editor Apps Script, klik file default yang bernama **`Code.gs`**.
2. Hapus semua tulisan di dalamnya (tekan `Ctrl + A` lalu `Delete`).
3. Buka file **`apps-script/Kode.gs`** di komputer Anda (bisa dibuka dengan Notepad, VS Code, atau editor teks apa saja).
4. Salin seluruh isinya (`Ctrl + A` → `Ctrl + C`).
5. Tempelkan ke editor Apps Script (`Ctrl + V`).

#### B. File `index.html`
1. Di panel kiri editor Apps Script, di sebelah tulisan **Files**, klik tombol **+** lalu pilih **HTML**.
2. Beri nama file: **`index`** *(cukup ketik `index` saja tanpa `.html`)* lalu tekan Enter.
3. Hapus seluruh isi default-nya.
4. Buka file **`apps-script/index.html`** di komputer Anda, salin seluruh isinya (`Ctrl + A` → `Ctrl + C`).
5. Tempelkan ke editor Apps Script (`Ctrl + V`).

#### C. File `appsscript.json` (Setelan Manifes)
1. Di panel navigasi paling kiri editor Apps Script, klik ikon gerigi ⚙️ (**Project Settings / Setelan Proyek**).
2. Beri tanda centang pada kotak:
   ☑️ **Show "appsscript.json" manifest file in editor** *(Tampilkan file manifes "appsscript.json" di editor)*.
3. Klik kembali ikon kode `< >` (**Editor**) di menu navigasi kiri atas.
4. Pada daftar file di panel kiri, sekarang akan muncul file bernama **`appsscript.json`**. Klik file tersebut.
5. Hapus isinya, lalu ganti dengan isi dari file **`apps-script/appsscript.json`** yang ada di komputer Anda.
6. Tekan tombol **Ctrl + S** untuk menyimpan semua file.

---

### Langkah 4: Jalankan Setup Otomatis (Membangun Database)
Fungsi ini akan otomatis membuatkan seluruh lembar tabel, nama kolom, formula, dan konfigurasi awal di spreadsheet kosong Anda:

1. Di bilah menu atas editor Apps Script (di sebelah tombol *Run / Jalankan*), cari tombol dropdown pilihan fungsi.
2. Klik dropdown tersebut dan pilih: **`setup`**.
3. Klik tombol **Run (Jalankan)**.
4. Karena ini pertama kali dijalankan, Google akan meminta izin akses (**Authorization required**):
   - Klik tombol **Review permissions (Tinjau Izin)**.
   - Pilih akun Google Anda.
   - Jika muncul peringatan *"Google hasn't verified this app"*, klik tulisan **Advanced (Lanjutan)** di kiri bawah.
   - Klik link **Go to Stok Segara Backend (unsafe)**.
   - Klik tombol biru **Allow (Izinkan)**.
5. Tunggu proses berjalan hingga muncul tulisan **"Execution completed"** di bagian bawah editor.

#### 🔍 Cek Spreadsheet Anda:
Buka kembali tab Google Spreadsheet Anda. Spreadsheet yang tadinya kosong kini sudah otomatis terisi tabel-tabel bersih:
- **`Barang`** (Master data bahan dan stok)
- **`Karyawan`** (Daftar staf dapur & PIN)
- **`Transaksi`** (Riwayat barang masuk & keluar)
- **`Rekap`** & **`RekapBaris`** (Catatan closing sisa dapur per hari)
- **`Opname`** (Catatan penyesuaian stok fisik vs sistem)
- **`Pengaturan`** (Jam tutup `21:00`, urutan kategori)
- **`Log_Login`** (Catatan keamanan audit login)
- **Zona Waktu**: Otomatis tersetel ke **WITA (Waktu Indonesia Tengah / Makassar, GMT+8)** sehingga seluruh waktu transaksi dan laporan sinkron dengan waktu operasional kedai.

---

### Langkah 5 (Opsional): Impor Master Barang Kedai Segara
Jika Anda ingin langsung memasukkan daftar 100+ master bahan dan perlengkapan Kedai Segara (kopi, susu, sirup, cup, plastik, cleaning, dll.) dengan stok awal 0:

1. Di dropdown fungsi sebelah tombol Run, pilih: **`imporDataSegara`**.
2. Klik tombol **Run (Jalankan)**.
3. Tunggu hingga selesai. Semua data barang akan masuk rapi ke sheet `Barang` dengan status alur `LUAR` dan stok awal 0 (menunggu opname fisik awal).

---

### Langkah 6: Publikasikan Aplikasi (Deploy Menjadi Web App)
Langkah ini untuk membuat link URL aplikasi web agar bisa dibuka di tablet dapur dan HP:

1. Di pojok kanan atas editor Apps Script, klik tombol biru **Deploy** → pilih **New deployment (Penerapan baru)**.
2. Klik ikon gerigi ⚙️ di samping tulisan *Select type (Pilih jenis)* → pilih **Web app (Aplikasi web)**.
3. Isi kolom pengaturannya sebagai berikut:
   - **Description**: `Stok Segara Final`
   - **Execute as (Jalankan sebagai)**: **Me (email Anda)**
   - **Who has access (Siapa yang memiliki akses)**: **Anyone (Siapa saja)**
     *(PENTING: Pilih "Anyone" agar tablet dapur dapat membuka aplikasi tanpa harus memasukkan akun Google pemilik).*
4. Klik tombol biru **Deploy**.
5. Salin alamat **Web app URL** yang muncul (link berakhiran `/exec`).
   Contoh format link:
   `https://script.google.com/macros/s/AKfycb.../exec`

*Simpan link ini baik-baik!*

---

## 📱 Cara Menggunakan Aplikasi

### 1. Mode Tablet (Dapur / Kasir)
Buka link Web App yang Anda dapatkan di tablet atau HP dapur:
```text
https://script.google.com/macros/s/.../exec
```
- Karyawan memilih nama profilnya.
- **Ambil dari Gudang**: Digunakan saat bahan dipindahkan dari gudang ke dapur (ada waktu pembatalan 60 detik bila salah input).
- **Masukkan ke Gudang**: Digunakan saat barang baru datang dari supplier.
- **Rekap Sisa Dapur**: Digunakan saat closing malam untuk menginput sisa bahan.
- **Tips**: Di Google Chrome tablet/HP, klik menu titik tiga (kanan atas) → pilih **Tambahkan ke Layar Utama (Add to Home screen)** agar aplikasi terbuka satu layar penuh layaknya aplikasi HP.

### 2. Mode Admin (Owner / Store Manager)
Buka link yang sama dengan menambahkan `?mode=admin` di ujung URL:
```text
https://script.google.com/macros/s/.../exec?mode=admin
```
*(atau buka link biasa, lalu klik tombol **Admin** di pojok kanan atas)*.

- **Login Pertama Kali**:
  1. Masukkan alamat email Google Anda (pemilik spreadsheet otomatis terdaftar sebagai admin utama).
  2. Buka inbox email Anda, masukkan kode verifikasi (OTP) 6-digit.
  3. Sistem akan meminta Anda membuat **PIN Admin Pribadi (4–8 angka)**.
- **Fitur Admin**:
  - Melihat angka stok dalam (gudang) dan stok luar (dapur) secara real-time.
  - Melakukan **Opname Fisik** berkala.
  - Mengelola master barang & kategori.
  - Mengelola karyawan & menyetel PIN karyawan.
  - Mengunduh laporan pemakaian dan transaksi ke Google Sheets.
  - Menambah email staf lain ke whitelist di menu **Pengaturan → Kelola Akun & Whitelist**.

---

## 🔄 Cara Memperbarui Kode di Masa Depan
Jika ada perbaikan atau pembaruan kode file di kemudian hari:
1. Buka kembali editor Apps Script pada spreadsheet Anda.
2. Salin isi file yang diperbarui (`Kode.gs` atau `index.html`) ke file yang sesuai di editor.
3. Simpan perubahan (**Ctrl + S**).
4. Klik tombol **Deploy** → pilih **Manage deployments**.
5. Klik ikon pensil ✏️ (**Edit**) pada deployment aktif Anda.
6. Pada bagian dropdown **Version**, pilih **New version**.
7. Klik tombol **Deploy**.
*(URL Web App Anda tidak akan berubah, semua tablet dan HP pengguna otomatis langsung menggunakan versi terbaru).*

---

## ❓ Kendala Umum & Solusinya

| Kendala / Error | Penyebab | Solusi |
| :--- | :--- | :--- |
| `Sistem belum di-setup` | Fungsi inisialisasi belum dijalankan. | Buka Apps Script, pilih fungsi `setup` di dropdown atas, lalu klik tombol **Run**. |
| `Exception: You do not have permission...` | Akun Google yang deploy bukan pemilik spreadsheet. | Pastikan Anda login dengan akun Google pemilik spreadsheet. |
| `Email tidak terdaftar atau akses telah dinonaktifkan` | Email belum ada di whitelist sistem. | Buka mode Admin dari akun pemilik, masuk menu **Pengaturan → Kelola Akun & Whitelist**, tambahkan email tersebut. |
| Tablet meminta login akun Google saat buka link | Pilihan akses salah saat deploy. | Buka *Deploy → Manage deployments → Edit*, pastikan opsi **Who has access** dipilih **Anyone**. |
| Tampilan di tablet belum berubah setelah update | Browser tablet menyimpan cache. | Pastikan saat update memilih **New version** di Apps Script, lalu lakukan *refresh* pada halaman browser tablet. |
