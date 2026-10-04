// Bentuk data yang dikembalikan Kode.gs. Nama field mengikuti kolom sheet.

export type Alur = 'LUAR' | 'LANGSUNG_HABIS' | 'DALAM';

/** Barang versi tablet — TANPA angka stok gudang (stok_luar di depan/dapur ditampilkan). */
export interface BarangTablet {
  id: string;
  nama: string;
  satuan: string;
  kategori: string;
  alur: Alur;
  kode: string;
  catatan: string;
  stok_luar: number;
  bisa_produksi: boolean;
}

/** Barang versi admin (pub_ di Kode.gs). */
export interface Barang extends BarangTablet {
  stok_dalam: number;
  stok_luar: number;
  ambang_min: number;
  aktif: boolean;
}

export interface Karyawan {
  id: string;
  nama: string;
  punyaPin?: boolean;
  pinLen?: number;
}
export interface KaryawanAdmin extends Karyawan {
  aktif: boolean;
  pin?: string;
}

export interface Status {
  belumRekap: number;
  lewatHari: boolean;
  lastRekap: string | null;
  barangLuar: number;
}

export interface TabletData {
  barang: BarangTablet[];
  karyawan: Karyawan[];
  status: Status;
  urutan: string[];
  jamTutup: string;
}

export interface AmbilResult {
  tx: { id: string; ts: number };
  barang: BarangTablet;
}

export interface RekapRow {
  barang_id: string;
  nama: string;
  satuan: string;
  saldo_awal: number;
  diambil: number;
  setelah: number;
  maks: number;
}
export interface RekapDraf {
  cutoff: number;
  baris: RekapRow[];
}
export interface RekapInput {
  barang_id: string;
  sisa: number | string;
  catatan?: string;
}

export type Jenis = 'AMBIL' | 'MASUK' | 'OPNAME' | 'PRODUKSI';

export interface Transaksi {
  id: string;
  ts: number;
  waktu: string;
  jenis: Jenis;
  barang_id: string;
  barang: string;
  jumlah: number;
  karyawan_id: string;
  karyawan: string;
  alur: Alur | '';
  supplier: string;
  status: 'AKTIF' | 'BATAL';
  dicatat_oleh: string;
  catatan: string;
  kategori: string;
  satuan: string;
}

export type RekapStatus = 'PENDING' | 'APPROVED';

export interface RekapBaris {
  rekap_id: string;
  barang_id: string;
  barang: string;
  saldo_awal: number;
  diambil: number;
  sisa: number;
  terpakai: number;
  terjual?: number;
  selisih?: number;
  catatan: string;
}
export interface Rekap {
  id: string;
  ts: number;
  waktu: string;
  karyawan_id: string;
  karyawan: string;
  diedit_admin: boolean;
  status?: RekapStatus;
  approved_ts?: number;
  baris: RekapBaris[];
}

export interface RekapApprovalItem {
  barang_id: string;
  sisa: number | string;
  terjual?: number | string;
}

export interface Opname {
  id: string;
  ts: number;
  waktu: string;
  barang_id: string;
  barang: string;
  sistem: number;
  fisik: number;
  selisih: number;
}

export interface AdminData {
  barang: Barang[];
  karyawan: KaryawanAdmin[];
  transaksi: Transaksi[];
  rekap: Rekap[];
  opname: Opname[];
  status: Status;
  lastRekap: number;
  urutan: string[];
  jamTutup: string;
  url: string;
  daftarSupplier?: string[];
  daftarSatuan?: string[];
}

export interface BarangInput {
  id?: string;
  nama: string;
  satuan: string;
  kategori: string;
  kode: string;
  catatan: string;
  alur: Alur;
  ambang_min: number | string;
  aktif: boolean;
  bisa_produksi?: boolean;
  stok_awal?: number | string;
}

export interface LaporanRow {
  nama: string;
  satuan: string;
  masuk: number;
  produksi: number;
  terpakai_rekap: number;
  langsung_habis: number;
  total_terpakai: number;
  opname: number;
}

export interface AuthAccount {
  email: string;
  nama?: string;
  role: 'admin' | 'tablet';
  aktif: boolean;
  dibuat: number;
  punyaPin?: boolean;
}

export interface LoginLog {
  id: string;
  ts: number;
  waktu: string;
  email: string;
  metode: 'GOOGLE' | 'OTP' | string;
  role: 'admin' | 'tablet' | string;
  status: string;
  user_agent?: string;
}

export interface PublicAuthConfig {
  hasGoogleAuth: boolean;
  googleClientId: string;
  allowDummyAuth?: boolean;
}

export interface AuthSession {
  token: string;
  email: string;
  role: 'admin' | 'tablet';
  exp: number;
}

export interface VerifySessionResult {
  valid: boolean;
  email?: string;
  role?: 'admin' | 'tablet';
  exp?: number;
  error?: string;
}

/** Semua fungsi publik di Kode.gs beserta argumen dan hasilnya. */
export interface Api {
  getTablet(token?: string): TabletData;
  ambil(
    karyawanId: string,
    barangId: string,
    jumlah: number,
    catatanOrClientTxId?: string,
    clientTxId?: string,
    token?: string,
  ): AmbilResult;
  masukKaryawan(karyawanId: string, barangId: string, jumlah: number, supplier: string, clientTxId?: string, token?: string): boolean;
  produksiKaryawan(karyawanId: string, barangId: string, jumlah: number, catatan?: string, clientTxId?: string, token?: string): boolean;
  batalAmbil(txId: string, pin: string, token?: string): boolean;
  batalMasuk(txId: string, pin: string, token?: string): boolean;
  batalProduksi(txId: string, pin: string, token?: string): boolean;
  rekapDraf(token?: string): RekapDraf;
  simpanRekap(cutoff: number, karyawanId: string, input: RekapInput[], clientTxId?: string, token?: string): { id: string };

  adminData(pin: string, token?: string): AdminData;
  simpanBarang(pin: string, o: BarangInput, token?: string): boolean;
  hapusBarang(pin: string, id: string, token?: string): { status: 'deleted' | 'archived'; nama: string; message: string };
  tambahKategori(pin: string, namaKategori: string, token?: string): { status: 'created'; nama: string; message: string };
  hapusKategori(pin: string, namaKategori: string, token?: string): { status: 'deleted'; nama: string; jumlahBarang: number; message: string };
  tambahSupplier(pin: string, namaSupplier: string, token?: string): { status: 'created'; nama: string; message: string };
  tambahSatuan(pin: string, namaSatuan: string, token?: string): { status: 'created'; nama: string; message: string };
  simpanKaryawan(pin: string, o: { id?: string; nama: string; aktif?: boolean; pin?: string }, token?: string): boolean;
  hapusKaryawan(pin: string, id: string, token?: string): { status: 'deleted' | 'archived'; nama: string; message: string };
  verifikasiPinKaryawan(karyawanId: string, pin: string): boolean;
  stokMasuk(pin: string, barangId: string, jumlah: number | string, supplier: string, catatan: string, clientTxId?: string, token?: string): boolean;
  simpanProduksiAdmin(pin: string, barangId: string, jumlah: number | string, catatan?: string, clientTxId?: string, token?: string): boolean;
  ambilAdmin(pin: string, karyawanId: string, barangId: string, jumlah: number | string, ts: number, token?: string): AmbilResult;
  simpanOpname(pin: string, items: { barang_id: string; fisik: string }[], token?: string): number;
  editRekapTerakhir(pin: string, input: { barang_id: string; sisa: string }[], token?: string): number;
  approveRekap(pin: string, rekapId: string, input: RekapApprovalItem[], token?: string): { id: string; status: RekapStatus };
  buatDummyRekap(pin: string, token?: string): number;
  simpanPengaturan(pin: string, jamTutup: string, pinBaru: string, token?: string): boolean;
  laporan(pin: string, dari: string, sampai: string, token?: string): LaporanRow[];
  laporanKeSheet(pin: string, dari: string, sampai: string, token?: string): string;
  getPublicAuthConfig(): PublicAuthConfig;
  requestOtp(email: string): { success: boolean; message: string; expSeconds: number };
  verifyOtp(email: string, code: string, userAgent?: string): AuthSession;
  verifyGoogleCredential(credential: string, userAgent?: string): AuthSession;
  verifySessionToken(token: string): VerifySessionResult;
  getAdminAuthStatus(token?: string): { email: string; punyaPin: boolean };
  setupAdminPin(newPin: string, token?: string): boolean;
  resetAdminPinWithOtp(email: string, code: string, newPin: string, token?: string): boolean;
  gantiAdminPin(oldPin: string, newPin: string, token?: string): boolean;

  getAuthAccounts(pin: string, token?: string): AuthAccount[];
  simpanAuthAccount(pin: string, email: string, role: 'admin' | 'tablet', aktif: boolean, namaOrToken?: string, token?: string): boolean;
  hapusAuthAccount(pin: string, email: string, token?: string): boolean;
  getLoginHistory(pin: string, limit?: number, token?: string): LoginLog[];
  simpanGoogleClientId(pin: string, clientId: string, token?: string): boolean;
}
