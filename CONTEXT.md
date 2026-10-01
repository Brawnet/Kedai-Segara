# Segara Inventory

Sistem pencatatan dan manajemen stok bahan serta barang operasional untuk Kedai Segara berbasis Google Sheets dan web app tablet/admin.

## Language

**Transaksi**:
Pencatatan mutasi fisik stok barang (Ambil, Masuk, Produksi, Opname).
_Avoid_: Order, purchase, invoice

**Catatan Transaksi**:
Keterangan tekstual opsional (maks. 150 karakter) yang menyertai mutasi stok untuk memberi konteks operasional di lapangan.
_Avoid_: Memo, pesan, keterangan bebas tak terstruktur

**Catatan Batch**:
Catatan tingkat sesi konfirmasi di tablet yang berlaku untuk seluruh barang yang diambil atau diproduksi dalam satu waktu.
_Avoid_: Catatan global, session note

**Catatan Item**:
Catatan khusus pada satu baris barang tertentu dalam sesi konfirmasi, yang jika diisi bersama Catatan Batch akan digabungkan dengan format `[Catatan Batch] - [Catatan Item]`.
_Avoid_: Item note, keterangan barang

**Ambil Barang**:
Pengambilan stok fisik bahan dari gudang oleh karyawan untuk operasional atau rekap.
_Avoid_: Checkout, withdraw, pengeluaran

**Hasil Produksi**:
Pencatatan penambahan stok barang olahan ke gudang oleh karyawan dengan catatan default 'Hasil produksi' bila tidak diisi catatan khusus.
_Avoid_: Masuk pabrik, restock internal

**Akun Auth**:
Akun terautentikasi (Google / OTP) yang terdaftar di whitelist sistem dengan role admin atau tablet.
_Avoid_: User profile, member, credentials

**Nama Admin**:
Nama penanggung jawab operasional yang dikonfigurasi per Akun Auth di Pengaturan Akses Akun, dicatat ke kolom karyawan pada transaksi yang diinput admin.
_Avoid_: Nama toko, user display name, author
