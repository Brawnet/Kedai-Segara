# Panduan Pemasangan & Penggunaan Stok Segara

Aplikasi berjalan di **Google Apps Script** (https://script.google.com) dengan database
**Google Sheets**. Tanpa hosting berbayar. Tampilan menyesuaikan ponsel, tablet, dan laptop.

Spreadsheet database yang dipakai:
https://docs.google.com/spreadsheets/d//edit

ID-nya (``) sudah diisi di `apps-script/Kode.gs`
pada baris `var DEFAULT_SS_ID = ...`. Ganti di sana jika memakai spreadsheet lain.

---

## Langkah 0: Buat file hasil build (sekali, di komputer)

Aplikasi web ditulis di `src/` lalu digabung menjadi satu file `apps-script/index.html`.

```bash
npm install
npm run build
```

Setelah ini folder `apps-script/` berisi 3 file yang dibutuhkan Apps Script:
`Kode.gs`, `index.html`, dan `appsscript.json`.

---

## Cara A: Salin-tempel lewat browser (paling mudah)

### A1. Buka Apps Script dari spreadsheet
1. Buka spreadsheet di atas.
2. Menu **Ekstensi (Extensions) → Apps Script**. Project baru terbuka dan otomatis terhubung ke sheet ini.

   *(Bisa juga membuat project baru di https://script.google.com → **New project**.
   Karena `DEFAULT_SS_ID` sudah diisi, script tetap memakai spreadsheet Segara.)*

### A2. Masukkan kode
1. File `Code.gs`: hapus semua isinya, tempel seluruh isi **`apps-script/Kode.gs`**.
2. Klik **+** di samping "Files" → **HTML** → beri nama **`index`** (tanpa `.html`).
   Hapus isinya, tempel seluruh isi **`apps-script/index.html`** (hasil `npm run build`, ±320 KB).
3. Klik ikon gerigi **Project Settings** → centang **Show "appsscript.json" manifest file in editor**.
   Kembali ke Editor, buka `appsscript.json`, ganti isinya dengan **`apps-script/appsscript.json`**
   (zona waktu `Asia/Jakarta`, web app bisa dibuka tanpa login).
4. Tekan `Ctrl + S`.

### A3. Jalankan setup (sekali)
1. Di dropdown fungsi (di sebelah tombol Run/Jalankan), pilih **`setup`** → **Run**.
2. Saat muncul **Authorization required**: **Review permissions** → pilih akun →
   **Advanced / Lanjutan** → **Go to … (unsafe)** → **Allow**.
3. `setup` membuat sheet yang belum ada (Karyawan, Transaksi, Rekap, dll.), melengkapi kolom,
   dan mengisi PIN admin default **`12345`**. Data yang sudah ada di sheet **Barang** tidak diubah.

Opsional: pilih **`imporDataSegara`** → **Run** untuk menambahkan daftar barang Kedai Segara.
Aman dijalankan ulang; barang yang kodenya sudah ada dilewati.

### A4. Deploy menjadi Web App
1. Kanan atas: **Deploy → New deployment**.
2. Ikon gerigi **Select type** → **Web app**.
3. Isi:
   - **Description**: `Stok Segara`
   - **Execute as**: **Me** (email Anda)
   - **Who has access**: **Anyone** (tablet dapur tidak perlu login Google)
4. **Deploy** → salin **Web app URL** (berakhiran `/exec`).

### A5. Update setelah ada perubahan kode
Tempel ulang file yang berubah, lalu **Deploy → Manage deployments → ✏️ Edit →
Version: New version → Deploy**. URL tetap sama.
(Jangan pakai "New deployment" lagi, karena itu membuat URL baru.)

---

## Cara B: Dari komputer dengan clasp (otomatis)

1. Aktifkan Apps Script API: https://script.google.com/home/usersettings → **On**.
2. Login: `npx clasp login`
3. Buat project dulu lewat **Cara A1**, lalu ambil **Script ID** di Project Settings.
4. Salin `.clasp.json.example` menjadi `.clasp.json`, isi `scriptId`.
5. Kirim kode: `npm run push` (build + `clasp push`).
6. Jalankan `setup` sekali di editor (Cara A3) dan buat deployment pertama (Cara A4).
7. Isi `deploymentId` di `.clasp.json` (lihat `npx clasp deployments`).
8. Selanjutnya cukup: `npm run deploy` — URL web app tidak berubah.

---

## Cara Pakai

### Mode Tablet (karyawan / dapur)
Buka Web app URL di tablet atau HP dapur. Karyawan pilih namanya, lalu:
- **Ambil dari gudang**: barang dibawa ke dapur (bisa dibatalkan dalam 60 detik).
- **Masukkan ke gudang**: barang baru datang dari supplier.
- **Rekap sisa dapur**: closing malam, isi sisa barang di area kerja.

Tip: di HP/tablet, buka URL lalu **Tambahkan ke Layar Utama** agar terbuka seperti aplikasi.

### Mode Admin (owner / manager) — cocok dibuka di laptop atau HP
Buka `https://script.google.com/macros/s/…/exec?mode=admin`
atau ketuk tombol **Admin** di pojok kanan atas. PIN default **`12345`** — **segera ganti**
di menu **Pengaturan**.

Di laptop menu ada di sidebar kiri; di HP menu ada di bar bawah (menu lain di **Lainnya**).
Admin bisa: lihat stok, stok masuk, opname, riwayat, rekap, kelola barang & karyawan,
ambil manual, laporan (bisa disalin ke sheet **Laporan**), dan pengaturan PIN / jam tutup.

---

## Hak Akses & Keamanan

| Lapis | Penjelasan |
| :--- | :--- |
| **URL Web App** | *Anyone*: siapa pun yang punya link bisa membuka mode tablet tanpa login. Jangan sebarkan link di luar karyawan. Pilih *Anyone within organization* jika memakai Google Workspace. |
| **Tablet vs Admin** | Mode tablet **tidak** menampilkan angka stok gudang, laporan, maupun data master. Semua fungsi admin di server wajib PIN. |
| **Spreadsheet** | Hanya bisa dibuka pemilik (atau yang sengaja diberi akses). Web app membaca/menulis atas nama pemilik (*Execute as: Me*). |

Catatan keamanan PIN:
- **Enkripsi Hash SHA-256**: PIN Admin dan PIN Karyawan tidak lagi disimpan dalam bentuk teks biasa, melainkan di-hash menggunakan algoritma SHA-256 dan salt unik berbasis database spreadsheet.
- **Anti Brute-Force (Rate Limiting)**: Jika terjadi 5 kali kesalahan PIN berturut-turut, sistem otomatis mengunci percobaan selama 60 detik via Google Apps Script Cache.
- **Zero-Knowledge di Klien**: Data karyawan di browser tablet maupun admin tidak pernah menerima teks asli PIN staf, melainkan hanya status aktif PIN (`punyaPin: true/false`).
---

## Masalah umum

| Pesan | Solusi |
| :--- | :--- |
| `Sistem belum di-setup` | Jalankan fungsi `setup` di editor (Cara A3). |
| `Exception: You do not have permission…` / `openById` | Akun yang men-deploy harus punya akses edit ke spreadsheet. |
| Halaman "Buka lewat URL Web App" | File `index.html` dibuka langsung. Buka lewat URL `/exec`. |
| Perubahan tidak muncul | Buat **New version** di Manage deployments (Cara A5), lalu muat ulang halaman. |
| Link `/dev` minta login | Pakai link `/exec` dari deployment, bukan link "Test deployments". |
