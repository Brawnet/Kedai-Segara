import { useMemo, useState } from 'preact/hooks';
import { Plus, ShieldCheck, Trash } from '@phosphor-icons/react';
import { Button, Confirm, Dialog, Field, Input, Tag } from '../components/ui';
import { useAdmin } from './shared';
import { useApp } from '../lib/app';
import { katOf } from '../lib/format';

export interface KelolaKategoriDialogProps {
  open: boolean;
  onClose: () => void;
  onSelect?: (kategori: string) => void;
  selectedKategori?: string;
  onKategoriDeleted?: (kategori: string) => void;
}

export function KelolaKategoriDialog({
  open,
  onClose,
  onSelect,
  selectedKategori,
  onKategoriDeleted,
}: KelolaKategoriDialogProps) {
  const { d, A } = useAdmin();
  const { toast } = useApp();

  const [katBaru, setKatBaru] = useState('');
  const [errKatBaru, setErrKatBaru] = useState('');
  const [katHapus, setKatHapus] = useState<string | null>(null);

  // Kumpulkan semua kategori unik dari urutan dan data barang
  const daftarKategori = useMemo(() => {
    const list: string[] = [];
    const seen = new Set<string>();

    const tambah = (k: string) => {
      const clean = (k || '').trim();
      if (!clean) return;
      const lower = clean.toLowerCase();
      if (!seen.has(lower)) {
        seen.add(lower);
        list.push(clean);
      }
    };

    (d.urutan || []).forEach(tambah);
    d.barang.forEach((b) => tambah(b.kategori));

    return list;
  }, [d.urutan, d.barang]);

  const handleTambah = async (e: Event) => {
    e.preventDefault();
    const nm = katBaru.trim();
    if (!nm) {
      setErrKatBaru('Nama kategori tidak boleh kosong');
      return;
    }
    if (nm.toLowerCase() === 'lainnya') {
      setErrKatBaru('Kategori "Lainnya" sudah ada sebagai kategori bawaan');
      return;
    }
    if (daftarKategori.some((k) => k.toLowerCase() === nm.toLowerCase())) {
      setErrKatBaru(`Kategori "${nm}" sudah ada`);
      return;
    }

    const res = await A('tambahKategori', [nm], (r) => r.message);
    if (res) {
      setKatBaru('');
      setErrKatBaru('');
      if (onSelect) {
        onSelect(nm);
        toast(`Kategori "${nm}" berhasil ditambahkan dan dipilih`);
        onClose();
      }
    }
  };

  const handleKonfirmasiHapus = async () => {
    if (!katHapus) return;
    const target = katHapus;
    const res = await A('hapusKategori', [target], (r) => r.message);
    if (res) {
      onKategoriDeleted?.(target);
      setKatHapus(null);
    }
  };

  const jumlahBarang = (kat: string) => {
    const target = kat.toLowerCase();
    return d.barang.filter((b) => katOf(b).toLowerCase() === target).length;
  };

  return (
    <>
      <Dialog
        open={open}
        onClose={onClose}
        title="Kelola Kategori"
        footer={
          <div class="flex items-center justify-end gap-2 w-full">
            <Button type="button" variant="secondary" onClick={onClose} class="min-h-11">
              Tutup
            </Button>
          </div>
        }
      >
        <div class="flex flex-col gap-5">
          {/* Form Tambah Kategori Baru */}
          <form onSubmit={handleTambah} class="flex flex-col gap-2.5 pb-4 border-b border-line" noValidate>
            <p class="text-xs sm:text-sm text-muted-fg leading-relaxed">
              Buat kategori baru untuk mengelompokkan stok barang pada tablet dapur dan laporan.
            </p>
            <Field label="Nama Kategori Baru" error={errKatBaru}>
              {(id, dId) => (
                <div class="flex gap-2 items-start">
                  <Input
                    id={id}
                    placeholder="Contoh: Saus & Condiment"
                    value={katBaru}
                    onInput={(e) => {
                      setKatBaru(e.currentTarget.value);
                      if (errKatBaru) setErrKatBaru('');
                    }}
                    autocomplete="off"
                    aria-invalid={!!errKatBaru}
                    aria-describedby={dId}
                    class="min-h-11 flex-1 text-sm sm:text-base"
                  />
                  <Button
                    type="submit"
                    variant="primary"
                    disabled={!katBaru.trim()}
                    class="min-h-11 shrink-0 px-3 sm:px-4 font-semibold"
                  >
                    <Plus size={18} weight="bold" aria-hidden />
                    <span>Tambah</span>
                  </Button>
                </div>
              )}
            </Field>
          </form>

          {/* Daftar Kategori */}
          <div class="flex flex-col gap-2.5">
            <div class="flex items-center justify-between">
              <span class="text-xs font-bold uppercase tracking-wider text-muted-fg">
                Daftar Kategori ({daftarKategori.length})
              </span>
              <span class="text-[11px] text-muted-fg">Klik ikon sampah untuk menghapus</span>
            </div>

            {daftarKategori.length === 0 ? (
              <p class="text-xs text-muted-fg py-4 text-center">Belum ada kategori kustom.</p>
            ) : (
              <div class="flex flex-col gap-2 max-h-72 overflow-y-auto pr-1">
                {daftarKategori.map((k) => {
                  const count = jumlahBarang(k);
                  const isLainnya = k.toLowerCase() === 'lainnya';
                  const isSelected = selectedKategori && selectedKategori.toLowerCase() === k.toLowerCase();

                  return (
                    <div
                      key={k}
                      class={`flex items-center justify-between gap-3 p-2.5 rounded-ctl border transition-colors ${
                        isSelected
                          ? 'border-primary bg-primary-soft/30'
                          : 'border-line bg-card hover:bg-muted/40'
                      }`}
                    >
                      <div class="min-w-0 flex-1">
                        <div class="flex items-center gap-2">
                          <span class="font-semibold text-sm text-fg truncate">{k}</span>
                          {isSelected && <Tag tone="primary">Dipilih</Tag>}
                        </div>
                        <div class="text-xs text-muted-fg mt-0.5">
                          {count > 0 ? (
                            <span>
                              <strong>{count}</strong> barang aktif/arsip
                            </span>
                          ) : (
                            <span class="italic text-muted-fg/80">0 barang</span>
                          )}
                        </div>
                      </div>

                      <div class="flex items-center gap-2 shrink-0">
                        {onSelect && (
                          <Button
                            type="button"
                            size="sm"
                            variant={isSelected ? 'primary' : 'secondary'}
                            onClick={() => {
                              onSelect(k);
                              toast(`Kategori "${k}" dipilih`);
                              onClose();
                            }}
                            class="text-xs px-3 min-h-10 font-bold"
                          >
                            Pilih
                          </Button>
                        )}
                        {isLainnya ? (
                          <Tag tone="neutral">Bawaan</Tag>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setKatHapus(k)}
                            title={`Hapus kategori "${k}"`}
                            aria-label={`Hapus kategori ${k}`}
                            class="size-10 min-h-10 min-w-10 rounded-ctl bg-danger-soft border border-danger/30 text-danger hover:bg-danger hover:text-white transition-all flex items-center justify-center cursor-pointer shadow-xs shrink-0"
                          >
                            <Trash size={22} weight="bold" aria-hidden />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </Dialog>

      {/* Modal Konfirmasi Hapus Kategori */}
      {katHapus && (
        <Confirm
          open={!!katHapus}
          title={`Hapus Kategori "${katHapus}"?`}
          okLabel="Hapus Kategori"
          tone="danger"
          onCancel={() => setKatHapus(null)}
          onOk={handleKonfirmasiHapus}
        >
          <div class="flex flex-col gap-3 text-sm">
            {(() => {
              const count = jumlahBarang(katHapus);
              return (
                <>
                  <p class="text-fg leading-relaxed">
                    {count > 0 ? (
                      <>
                        Terdapat <strong>{count} barang</strong> dalam kategori <strong>"{katHapus}"</strong>.
                        Barang-barang tersebut <strong>TIDAK akan dihapus</strong>, melainkan dialihkan ke kategori{' '}
                        <strong>"Lainnya"</strong>.
                      </>
                    ) : (
                      <>
                        Kategori <strong>"{katHapus}"</strong> akan dihapus dari sistem.
                      </>
                    )}
                  </p>
                  <div class="rounded-card border border-primary/20 bg-primary-soft/40 p-3 text-xs text-primary leading-relaxed flex items-start gap-2.5">
                    <ShieldCheck size={20} weight="bold" class="shrink-0 mt-0.5 text-primary" aria-hidden />
                    <div>
                      <strong class="font-bold block mb-0.5">Jaminan Riwayat Transaksi Aman:</strong>
                      Semua catatan riwayat transaksi (history), catatan rekap, dan jejak opname masa lalu yang berkaitan dengan kategori ini <strong>tidak akan terhapus</strong> dan tetap tersimpan utuh di sistem.
                    </div>
                  </div>
                </>
              );
            })()}
          </div>
        </Confirm>
      )}
    </>
  );
}
