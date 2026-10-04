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
Catatan tingkat sesi konfirmasi di tablet yang berlaku langsung sebagai catatan mutasi untuk seluruh barang yang diambil atau diproduksi dalam satu waktu (maks. 150 karakter).
_Avoid_: Catatan global, session note, catatan per item
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

**Terjual**:
Jumlah barang atau porsi yang terjual menurut data penjualan kasir yang diinput oleh Admin saat verifikasi rekap.
_Avoid_: Sales order, penjualan kasir, qty terjual

**Selisih Rekap**:
Deviasi numerik antara stok fisik terpakai dengan jumlah yang terjual (`Terpakai - Terjual`). Ditampilkan ringkas dan rapi secara numerik tanpa teks deskriptif panjang.
_Avoid_: Variance, deviasi stok, selisih pemakaian lebih

**Rekap Approved**:
Status sesi rekap yang telah diverifikasi dan disetujui oleh admin, menandai data resmi masuk ke Riwayat Rekap.
_Avoid_: Verified rekap, rekap final, closed rekap

**Rekap Pending**:
Sesi rekap yang diinput oleh karyawan di tablet namun belum disetujui admin, bertahan dalam antrean verifikasi rekap admin.
_Avoid_: Unapproved rekap, draft rekap, rekap gantung
