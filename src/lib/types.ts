// Bentuk data yang dikembalikan Kode.gs. Nama field mengikuti kolom sheet.

export type Alur = 'LUAR' | 'LANGSUNG_HABIS';

/** Barang versi tablet — TANPA angka stok (karyawan tidak boleh melihat stok gudang). */
export interface BarangTablet {
  id: string;
  nama: string;
  satuan: string;
  kategori: string;
  alur: Alur;
  kode: string;
  catatan: string;
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

export type Jenis = 'AMBIL' | 'MASUK' | 'OPNAME';

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
  dicatat_oleh: 'admin' | 'karyawan' | '';
  catatan: string;
  kategori: string;
  satuan: string;
}

export interface RekapBaris {
  rekap_id: string;
  barang_id: string;
  barang: string;
  saldo_awal: number;
  diambil: number;
  sisa: number;
  terpakai: number;
  catatan: string;
}
export interface Rekap {
  id: string;
  ts: number;
  waktu: string;
  karyawan_id: string;
  karyawan: string;
  diedit_admin: boolean;
  baris: RekapBaris[];
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
  stok_awal?: number | string;
}

export interface LaporanRow {
  nama: string;
  satuan: string;
  masuk: number;
  terpakai_rekap: number;
  langsung_habis: number;
  total_terpakai: number;
  opname: number;
}

/** Semua fungsi publik di Kode.gs beserta argumen dan hasilnya. */
export interface Api {
  getTablet(): TabletData;
  ambil(karyawanId: string, barangId: string, jumlah: number): AmbilResult;
  masukKaryawan(karyawanId: string, barangId: string, jumlah: number, supplier: string): boolean;
  batalAmbil(txId: string, pin: string): boolean;
  rekapDraf(): RekapDraf;
  simpanRekap(cutoff: number, karyawanId: string, input: RekapInput[]): { id: string };

  adminData(pin: string): AdminData;
  simpanBarang(pin: string, o: BarangInput): boolean;
  hapusBarang(pin: string, id: string): { status: 'deleted' | 'archived'; nama: string; message: string };
  simpanKaryawan(pin: string, o: { id?: string; nama: string; aktif?: boolean; pin?: string }): boolean;
  verifikasiPinKaryawan(karyawanId: string, pin: string): boolean;
  stokMasuk(pin: string, barangId: string, jumlah: number | string, supplier: string, catatan: string): boolean;
  ambilAdmin(pin: string, karyawanId: string, barangId: string, jumlah: number | string, ts: number): AmbilResult;
  simpanOpname(pin: string, items: { barang_id: string; fisik: string }[]): number;
  editRekapTerakhir(pin: string, input: { barang_id: string; sisa: string }[]): number;
  simpanPengaturan(pin: string, jamTutup: string, pinBaru: string): boolean;
  laporan(pin: string, dari: string, sampai: string): LaporanRow[];
  laporanKeSheet(pin: string, dari: string, sampai: string): string;
}
