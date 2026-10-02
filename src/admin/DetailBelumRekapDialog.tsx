import { useMemo, useState } from 'preact/hooks';
import {
  ArrowCounterClockwise,
  ClockCounterClockwise,
  MagnifyingGlass,
  Package,
  WarningOctagon,
  X,
} from '@phosphor-icons/react';
import { nf } from '../lib/format';
import type { Transaksi } from '../lib/types';
import { hitungBelumRekap } from '../lib/rekap-helpers';
import { Button, Confirm, Dialog, Empty, Input, Tag, cx } from '../components/ui';
import { useAdmin } from './shared';
export interface DetailBelumRekapDialogProps {
  open: boolean;
  onClose: () => void;
}


export function DetailBelumRekapDialog({ open, onClose }: DetailBelumRekapDialogProps) {
  const { d, run, pin } = useAdmin();
  const [tab, setTab] = useState<'barang' | 'transaksi'>('barang');
  const [q, setQ] = useState('');
  const [filterBarangId, setFilterBarangId] = useState<string | null>(null);
  const [batal, setBatal] = useState<Transaksi | null>(null);

  const lastRekapTs = Number(d.lastRekap ?? d.rekap?.[0]?.ts ?? 0);

  const today0 = useMemo(() => {
    const dt = new Date();
    dt.setHours(0, 0, 0, 0);
    return dt.getTime();
  }, []);

  const barangById = useMemo(() => {
    return Object.fromEntries(d.barang.map((b) => [b.id, b]));
  }, [d.barang]);

  const { txBelumRekap, ringkasanBarang } = useMemo(() => {
    return hitungBelumRekap(d.transaksi, lastRekapTs, today0, barangById);
  }, [d.transaksi, lastRekapTs, today0, barangById]);

  const query = q.trim().toLowerCase();

  const filteredBarang = useMemo(() => {
    if (!query) return ringkasanBarang;
    return ringkasanBarang.filter(
      (b) =>
        b.nama.toLowerCase().includes(query) ||
        b.kategori.toLowerCase().includes(query),
    );
  }, [ringkasanBarang, query]);

  const filteredTx = useMemo(() => {
    return txBelumRekap.filter((t) => {
      if (filterBarangId && t.barang_id !== filterBarangId) return false;
      if (!query) return true;
      return (
        t.barang.toLowerCase().includes(query) ||
        (t.karyawan || '').toLowerCase().includes(query) ||
        (t.catatan || '').toLowerCase().includes(query) ||
        (t.kategori || '').toLowerCase().includes(query)
      );
    });
  }, [txBelumRekap, filterBarangId, query]);

  const handleClose = () => {
    setQ('');
    setFilterBarangId(null);
    setTab('barang');
    setBatal(null);
    onClose();
  };

  const selectedBarangNama = filterBarangId ? barangById[filterBarangId]?.nama || 'Barang terpilih' : '';

  return (
    <>
      <Dialog
        open={open}
        onClose={handleClose}
        title="Detail Pengambilan Belum Direkap"
        wide
        footer={
          <div class="flex items-center justify-between gap-2 w-full">
            <span class="text-xs text-muted-fg">
              {txBelumRekap.length} transaksi · {ringkasanBarang.length} jenis barang
            </span>
            <Button type="button" variant="secondary" onClick={handleClose} class="min-h-10 h-10 px-4">
              Tutup
            </Button>
          </div>
        }
      >
        <div class="flex flex-col gap-4">
          {/* Banner Peringatan Lewat Hari */}
          {d.status.lewatHari ? (
            <div class="flex items-start gap-2.5 rounded-ctl border border-danger/30 bg-danger-soft p-3 text-xs sm:text-sm text-danger">
              <WarningOctagon size={20} weight="fill" class="shrink-0 mt-0.5" aria-hidden />
              <div class="flex-1">
                <span class="font-bold">Perhatian: Ada pengambilan dari hari sebelumnya.</span>
                <p class="mt-0.5 text-xs text-danger/90 leading-relaxed">
                  Pengambilan ini belum direkap saat penutupan kemarin. Pastikan fisik barang di dapur/depan dihitung dan direkap agar stok sistem sesuai dengan fisik.
                </p>
              </div>
            </div>
          ) : (
            <p class="text-xs sm:text-sm text-muted-fg leading-relaxed">
              Daftar barang yang telah diambil dari gudang ke dapur (alur luar) sejak rekap terakhir ({d.status.lastRekap || 'belum ada rekap'}).
            </p>
          )}

          {/* Info ringkas total */}
          {d.status.belumRekap > txBelumRekap.length && (
            <div class="rounded-ctl bg-warning-soft border border-warning/30 px-3 py-2 text-xs text-warning">
              Menampilkan {txBelumRekap.length} dari {d.status.belumRekap} pengambilan (sebagian transaksi terdahulu di luar 400 riwayat aktif).
            </div>
          )}

          {/* Tab Navigasi & Pencarian */}
          <div class="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
            <div class="inline-flex rounded-ctl bg-muted/60 p-1 border border-line">
              <button
                type="button"
                onClick={() => setTab('barang')}
                class={cx(
                  'inline-flex items-center gap-1.5 rounded-[8px] px-3 py-1.5 font-semibold transition-all cursor-pointer text-xs sm:text-sm',
                  tab === 'barang'
                    ? 'bg-card text-fg shadow-2xs border border-line/60'
                    : 'text-muted-fg hover:text-fg',
                )}
              >
                <Package size={16} weight={tab === 'barang' ? 'bold' : 'regular'} aria-hidden />
                <span>Ringkasan Barang ({ringkasanBarang.length})</span>
              </button>
              <button
                type="button"
                onClick={() => setTab('transaksi')}
                class={cx(
                  'inline-flex items-center gap-1.5 rounded-[8px] px-3 py-1.5 font-semibold transition-all cursor-pointer text-xs sm:text-sm',
                  tab === 'transaksi'
                    ? 'bg-card text-fg shadow-2xs border border-line/60'
                    : 'text-muted-fg hover:text-fg',
                )}
              >
                <ClockCounterClockwise size={16} weight={tab === 'transaksi' ? 'bold' : 'regular'} aria-hidden />
                <span>Rincian Transaksi ({txBelumRekap.length})</span>
              </button>
            </div>

            <div class="relative w-full sm:w-64">
              <MagnifyingGlass
                size={16}
                class="absolute left-3 top-1/2 -translate-y-1/2 text-muted-fg pointer-events-none"
                aria-hidden
              />
              <Input
                placeholder={tab === 'barang' ? 'Cari barang / kategori...' : 'Cari barang / staf / catatan...'}
                value={q}
                onInput={(e) => setQ(e.currentTarget.value)}
                class="h-9 min-h-9 pl-9 pr-8 text-xs sm:text-sm w-full"
              />
              {q && (
                <button
                  type="button"
                  onClick={() => setQ('')}
                  class="absolute right-2 top-1/2 -translate-y-1/2 text-muted-fg hover:text-fg p-1 rounded-ctl"
                  aria-label="Hapus pencarian"
                >
                  <X size={14} weight="bold" />
                </button>
              )}
            </div>
          </div>

          {/* Active Filter Bar (jika filterBarangId aktif pada tab transaksi) */}
          {tab === 'transaksi' && filterBarangId && (
            <div class="flex items-center justify-between gap-2 rounded-ctl bg-primary-soft/20 border border-primary/30 px-3 py-1.5 text-xs text-primary font-medium">
              <span>
                Filter barang: <strong>{selectedBarangNama}</strong>
              </span>
              <button
                type="button"
                onClick={() => setFilterBarangId(null)}
                class="inline-flex items-center gap-1 font-bold text-primary hover:underline cursor-pointer"
              >
                <X size={14} weight="bold" /> Tampilkan semua barang
              </button>
            </div>
          )}

          {/* Konten Tab 1: Ringkasan per Barang */}
          {tab === 'barang' && (
            <div class="flex flex-col gap-2">
              {filteredBarang.length === 0 ? (
                <Empty>
                  {q ? `Tidak ada barang yang cocok dengan "${q}".` : 'Tidak ada pengambilan yang belum direkap.'}
                </Empty>
              ) : (
                filteredBarang.map((item) => (
                  <div
                    key={item.barang_id}
                    class={cx(
                      'flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-card border p-3.5 transition-colors',
                      item.adaLewatHari
                        ? 'border-danger/30 bg-danger-soft/10 hover:border-danger/50'
                        : 'border-line bg-card hover:border-line-strong',
                    )}
                  >
                    <div class="flex-1 min-w-0">
                      <div class="flex items-center gap-2 flex-wrap">
                        <span class="font-bold text-fg text-sm sm:text-base">
                          {item.nama}
                        </span>
                        {item.kategori && (
                          <span class="rounded-ctl bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-fg">
                            {item.kategori}
                          </span>
                        )}
                        {item.adaLewatHari && (
                          <Tag tone="danger">Ada dari hari sebelumnya</Tag>
                        )}
                      </div>
                      <div class="mt-1 flex items-center gap-2 text-xs text-muted-fg flex-wrap">
                        <span>{item.kali}x pengambilan</span>
                        <span>·</span>
                        <span>
                          Stok luar dapur: <strong class="text-fg font-semibold">{nf(item.stok_luar)} {item.satuan}</strong>
                        </span>
                      </div>
                    </div>

                    <div class="flex items-center justify-between sm:justify-end gap-3 shrink-0 pt-2 border-t border-line/50 sm:pt-0 sm:border-0">
                      <div class="text-left sm:text-right">
                        <div class="num font-extrabold text-base sm:text-lg text-primary">
                          {nf(item.total)} <span class="text-xs font-semibold text-muted-fg">{item.satuan}</span>
                        </div>
                        <span class="text-[11px] text-muted-fg">Total diambil</span>
                      </div>
                      <Button
                        size="sm"
                        variant="secondary"
                        class="h-8 min-h-8 px-2.5 text-xs font-medium shrink-0"
                        onClick={() => {
                          setFilterBarangId(item.barang_id);
                          setTab('transaksi');
                        }}
                      >
                        Lihat transaksi
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Konten Tab 2: Rincian Transaksi */}
          {tab === 'transaksi' && (
            <div class="flex flex-col gap-2.5">
              {filteredTx.length === 0 ? (
                <Empty>
                  {q || filterBarangId
                    ? 'Tidak ada transaksi yang cocok dengan filter.'
                    : 'Tidak ada transaksi pengambilan.'}
                </Empty>
              ) : (
                filteredTx.map((t) => {
                  const isLewat = Number(t.ts) < today0;
                  return (
                    <div
                      key={t.id}
                      class={cx(
                        'flex flex-col gap-2 rounded-card border p-3 sm:p-3.5 transition-colors',
                        isLewat ? 'border-danger/30 bg-danger-soft/10' : 'border-line bg-card',
                      )}
                    >
                      <div class="flex items-center justify-between gap-2 flex-wrap">
                        <div class="flex items-center gap-2 flex-wrap">
                          {isLewat ? (
                            <Tag tone="danger">Hari sebelumnya</Tag>
                          ) : (
                            <Tag tone="primary">Hari ini</Tag>
                          )}
                          <span class="num text-xs font-medium text-muted-fg">{t.waktu}</span>
                        </div>
                        <strong class="num text-sm sm:text-base font-bold text-fg">
                          {nf(t.jumlah)} {t.satuan}
                        </strong>
                      </div>

                      <div class="flex items-center justify-between gap-2 flex-wrap">
                        <div>
                          <span class="font-bold text-fg text-sm">{t.barang}</span>
                          {t.kategori && (
                            <span class="ml-1.5 text-xs text-muted-fg">({t.kategori})</span>
                          )}
                        </div>
                        <span class="text-xs text-muted-fg">
                          Diambil: <strong class="text-fg font-medium">{t.karyawan || 'Admin'}</strong>
                          {t.dicatat_oleh === 'admin' ? ' (input admin)' : ''}
                        </span>
                      </div>

                      {t.catatan && (
                        <div class="rounded-ctl bg-muted/60 px-2.5 py-1 text-xs text-muted-fg italic">
                          "{t.catatan}"
                        </div>
                      )}

                      <div class="flex items-center justify-end pt-1">
                        <Button
                          size="sm"
                          variant="danger-ghost"
                          class="h-8 min-h-8 text-xs px-2.5"
                          onClick={() => setBatal(t)}
                        >
                          <ArrowCounterClockwise size={14} aria-hidden /> Batalkan
                        </Button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      </Dialog>

      {/* Konfirmasi Pembatalan Transaksi */}
      <Confirm
        open={!!batal}
        title="Batalkan pengambilan barang?"
        okLabel="Ya, batalkan"
        tone="danger"
        onCancel={() => setBatal(null)}
        onOk={async () => {
          if (!batal) return;
          await run('batalAmbil', [batal.id, pin], 'Pengambilan dibatalkan');
          setBatal(null);
        }}
      >
        {batal && (
          <div class="flex flex-col gap-2">
            <p class="text-sm">Apakah Anda yakin ingin membatalkan transaksi pengambilan ini?</p>
            <div class="rounded-ctl bg-muted/60 p-3 text-xs flex flex-col gap-1 border border-line">
              <div>
                <strong>Barang:</strong> {batal.barang} ({nf(batal.jumlah)} {batal.satuan})
              </div>
              <div>
                <strong>Waktu:</strong> {batal.waktu}
              </div>
              <div>
                <strong>Diambil oleh:</strong> {batal.karyawan || 'Admin'}
              </div>
            </div>
            <p class="text-xs text-muted-fg">
              Stok akan dikembalikan ke gudang dan transaksi tidak lagi dihitung sebagai tanggungan rekap.
            </p>
          </div>
        )}
      </Confirm>
    </>
  );
}
