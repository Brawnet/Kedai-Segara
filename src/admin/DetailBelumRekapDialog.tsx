import { useMemo, useState } from 'preact/hooks';
import {
  ArrowCounterClockwise,
  Bell,
  BellSlash,
  CaretRight,
  CheckCircle,
  ClockCounterClockwise,
  MagnifyingGlass,
  Package,
  Storefront,
  User,
  WarningOctagon,
  X,
} from '@phosphor-icons/react';
import { nf } from '../lib/format';
import type { Transaksi } from '../lib/types';
import {
  clearRekapSnooze,
  formatSnoozeUntil,
  getRekapSnoozeUntil,
  hitungBelumRekap,
  setRekapSnooze,
} from '../lib/rekap-helpers';
import { Button, Confirm, Dialog, Empty, Input, Tag, cx } from '../components/ui';
import { useAdmin } from './shared';
import { useApp } from '../lib/app';

export interface DetailBelumRekapDialogProps {
  open: boolean;
  onClose: () => void;
  onSnoozeChange?: (snoozed: boolean) => void;
}

export function DetailBelumRekapDialog({ open, onClose, onSnoozeChange }: DetailBelumRekapDialogProps) {
  const { d, run, pin } = useAdmin();
  const { toast } = useApp();
  const [tab, setTab] = useState<'barang' | 'transaksi'>('barang');
  const [q, setQ] = useState('');
  const [filterBarangId, setFilterBarangId] = useState<string | null>(null);
  const [batal, setBatal] = useState<Transaksi | null>(null);
  const [snoozeUntil, setSnoozeUntil] = useState(() => getRekapSnoozeUntil());
  const isSnoozed = snoozeUntil > Date.now();
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

  const handleSnooze12Jam = () => {
    const until = setRekapSnooze(12 * 60 * 60 * 1000);
    setSnoozeUntil(until);
    onSnoozeChange?.(true);
    toast(`Pengingat disenyapkan sampai ${formatSnoozeUntil(until)}`);
    onClose();
  };

  const handleBatalSnooze = () => {
    clearRekapSnooze();
    setSnoozeUntil(0);
    onSnoozeChange?.(false);
    toast('Pengingat rekap diaktifkan kembali');
  };

  const handleClose = () => {
    setQ('');
    setFilterBarangId(null);
    setTab('barang');
    setBatal(null);
    onClose();
  };

  const selectedBarangNama = filterBarangId ? barangById[filterBarangId]?.nama || 'Barang terpilih' : '';
  const totalItemLewat = ringkasanBarang.filter((b) => b.adaLewatHari).length;

  return (
    <>
      <Dialog
        open={open}
        onClose={handleClose}
        title="Detail Pengambilan Belum Direkap"
        wide
        footer={
          <div class="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 w-full">
            <div class="flex items-center gap-2 text-xs text-muted-fg order-3 sm:order-1">
              <Package size={16} weight="bold" class="text-muted-fg shrink-0" aria-hidden />
              <span>
                <strong class="text-fg">{txBelumRekap.length}</strong> transaksi ·{' '}
                <strong class="text-fg">{ringkasanBarang.length}</strong> jenis barang
              </span>
            </div>
            <div class="flex items-center justify-end gap-2 order-1 sm:order-2 flex-wrap">
              {!isSnoozed ? (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={handleSnooze12Jam}
                  class="min-h-10 h-10 px-3.5 text-xs sm:text-sm font-semibold text-muted-fg hover:text-fg hover:border-line-strong transition-all gap-1.5"
                  title="Senyapkan pengingat ini selama 12 jam ke depan"
                >
                  <BellSlash size={16} weight="bold" aria-hidden />
                  <span>Jangan ingatkan lagi (12 jam)</span>
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={handleBatalSnooze}
                  class="min-h-10 h-10 px-3 text-xs sm:text-sm font-semibold text-primary gap-1.5"
                >
                  <Bell size={16} weight="bold" aria-hidden />
                  <span>Aktifkan pengingat</span>
                </Button>
              )}
              <Button
                type="button"
                variant="secondary"
                onClick={handleClose}
                class="min-h-10 h-10 px-5 text-sm font-bold border-line-strong hover:bg-muted"
              >
                Tutup
              </Button>
            </div>
          </div>
        }
      >
        <div class="flex flex-col gap-4">
          {/* Banner Status Pengingat / Peringatan Lewat Hari */}
          {isSnoozed ? (
            <div class="flex items-center justify-between gap-3 rounded-card border border-line bg-muted/50 p-3.5 text-xs sm:text-sm text-muted-fg flex-wrap">
              <div class="flex items-center gap-2.5 min-w-0">
                <span class="grid size-8 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary">
                  <BellSlash size={18} weight="bold" aria-hidden />
                </span>
                <span class="leading-snug">
                  Pengingat disenyapkan sampai <strong>{formatSnoozeUntil(snoozeUntil)}</strong>. Banner dashboard disembunyikan.
                </span>
              </div>
              <Button
                size="sm"
                variant="secondary"
                class="h-7 min-h-7 px-2.5 text-xs font-semibold shrink-0 gap-1"
                onClick={handleBatalSnooze}
              >
                <Bell size={13} weight="bold" aria-hidden /> Aktifkan kembali
              </Button>
            </div>
          ) : d.status.lewatHari ? (
            <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-card border border-danger/25 bg-danger-soft/15 p-3.5 sm:p-4 text-xs sm:text-sm text-danger">
              <div class="flex items-start gap-3 min-w-0 flex-1">
                <span class="grid size-9 shrink-0 place-items-center rounded-xl bg-danger-soft text-danger border border-danger/30 mt-0.5 sm:mt-0">
                  <WarningOctagon size={20} weight="fill" aria-hidden />
                </span>
                <div class="flex-1 min-w-0">
                  <h4 class="font-bold text-danger text-sm leading-tight">
                    {totalItemLewat > 0 ? `${totalItemLewat} Barang Belum Direkap dari Kemarin` : 'Pengambilan dari Hari Sebelumnya'}
                  </h4>
                  <p class="mt-1 text-xs text-danger/85 leading-relaxed">
                    Barang ini sudah keluar gudang kemarin namun belum tertutup di rekap. Akan <strong>otomatis masuk</strong> ke draf rekap tablet saat closing malam nanti.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleSnooze12Jam}
                class="inline-flex items-center gap-1.5 rounded-ctl border border-danger/30 bg-card px-2.5 py-1 text-xs font-bold text-fg hover:bg-muted transition-colors shrink-0 shadow-2xs self-end sm:self-center cursor-pointer"
                title="Sembunyikan peringatan ini selama 12 jam"
              >
                <BellSlash size={14} weight="bold" class="text-danger" />
                <span>Senyapkan 12 jam</span>
              </button>
            </div>
          ) : (
            <div class="flex items-center gap-2.5 rounded-card border border-line bg-muted/30 px-3.5 py-2.5 text-xs sm:text-sm text-muted-fg">
              <Storefront size={18} class="text-primary shrink-0" aria-hidden />
              <span>
                Pengambilan barang alur luar (dapur/depan) sejak rekap terakhir ({d.status.lastRekap || 'belum pernah'}).
              </span>
            </div>
          )}

          {/* Info ringkas total jika terpotong */}
          {d.status.belumRekap > txBelumRekap.length && (
            <div class="rounded-ctl bg-warning-soft border border-warning/30 px-3 py-2 text-xs text-warning">
              Menampilkan {txBelumRekap.length} dari {d.status.belumRekap} pengambilan (sebagian transaksi terdahulu di luar 400 riwayat aktif).
            </div>
          )}

          {/* Tab Navigasi & Pencarian */}
          <div class="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
            <div class="inline-flex h-10 items-center rounded-ctl bg-muted/60 p-1 border border-line shrink-0">
              <button
                type="button"
                onClick={() => setTab('barang')}
                class={cx(
                  'inline-flex h-8 items-center gap-1.5 rounded-[8px] px-3 font-semibold transition-all cursor-pointer text-xs sm:text-sm select-none',
                  tab === 'barang'
                    ? 'bg-card text-fg shadow-2xs border border-line/60 font-bold'
                    : 'text-muted-fg hover:text-fg',
                )}
              >
                <Package size={15} weight={tab === 'barang' ? 'bold' : 'regular'} aria-hidden />
                <span>Ringkasan Barang</span>
                <span
                  class={cx(
                    'rounded-full px-1.5 py-0.2 text-[10px] font-bold',
                    tab === 'barang' ? 'bg-primary-soft text-primary' : 'bg-muted text-muted-fg',
                  )}
                >
                  {ringkasanBarang.length}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setTab('transaksi')}
                class={cx(
                  'inline-flex h-8 items-center gap-1.5 rounded-[8px] px-3 font-semibold transition-all cursor-pointer text-xs sm:text-sm select-none',
                  tab === 'transaksi'
                    ? 'bg-card text-fg shadow-2xs border border-line/60 font-bold'
                    : 'text-muted-fg hover:text-fg',
                )}
              >
                <ClockCounterClockwise size={15} weight={tab === 'transaksi' ? 'bold' : 'regular'} aria-hidden />
                <span>Rincian Transaksi</span>
                <span
                  class={cx(
                    'rounded-full px-1.5 py-0.2 text-[10px] font-bold',
                    tab === 'transaksi' ? 'bg-primary-soft text-primary' : 'bg-muted text-muted-fg',
                  )}
                >
                  {txBelumRekap.length}
                </span>
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
                class="h-10 min-h-10 pl-9 pr-8 text-xs sm:text-sm w-full rounded-ctl"
              />
              {q && (
                <button
                  type="button"
                  onClick={() => setQ('')}
                  class="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-fg hover:text-fg p-1 rounded-ctl"
                  aria-label="Hapus pencarian"
                >
                  <X size={14} weight="bold" />
                </button>
              )}
            </div>
          </div>

          {/* Active Filter Bar (jika filterBarangId aktif pada tab transaksi) */}
          {tab === 'transaksi' && filterBarangId && (
            <div class="flex items-center justify-between gap-2 rounded-card bg-primary-soft/15 border border-primary/25 px-3.5 py-2 text-xs text-primary font-medium">
              <span>
                Menampilkan transaksi untuk: <strong class="font-bold text-fg">{selectedBarangNama}</strong>
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
            <div class="flex flex-col gap-2.5">
              {filteredBarang.length === 0 ? (
                <Empty>
                  {q ? `Tidak ada barang yang cocok dengan "${q}".` : 'Tidak ada pengambilan yang belum direkap.'}
                </Empty>
              ) : (
                filteredBarang.map((item) => (
                  <div
                    key={item.barang_id}
                    class={cx(
                      'relative flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 rounded-card border bg-card p-3.5 sm:p-4 transition-all duration-150 shadow-2xs hover:shadow-xs',
                      item.adaLewatHari
                        ? 'border-line hover:border-danger/40 before:absolute before:left-0 before:top-2.5 before:bottom-2.5 before:w-1 before:rounded-r before:bg-danger'
                        : 'border-line hover:border-line-strong',
                    )}
                  >
                    <div class="flex-1 min-w-0">
                      <div class="flex items-center gap-2 flex-wrap">
                        <span class="font-bold text-fg text-base tracking-tight truncate">
                          {item.nama}
                        </span>
                        {item.kategori && (
                          <span class="rounded-md border border-line/60 bg-muted/70 px-2 py-0.5 text-[11px] font-medium text-muted-fg">
                            {item.kategori}
                          </span>
                        )}
                        {item.adaLewatHari && (
                          <span class="inline-flex items-center gap-1 rounded-full border border-danger/30 bg-danger-soft px-2 py-0.5 text-[11px] font-bold text-danger">
                            <ClockCounterClockwise size={12} weight="bold" /> Belum rekap kemarin
                          </span>
                        )}
                      </div>
                      <div class="mt-1.5 flex items-center gap-2 text-xs text-muted-fg flex-wrap">
                        <span class="inline-flex items-center gap-1">
                          <Storefront size={14} class="text-muted-fg shrink-0" aria-hidden />
                          <span>
                            Stok luar dapur: <strong class="text-fg font-semibold">{nf(item.stok_luar)} {item.satuan}</strong>
                          </span>
                        </span>
                        <span>·</span>
                        <span>{item.kali}x pengambilan</span>
                      </div>
                    </div>

                    <div class="flex items-center justify-between sm:justify-end gap-3.5 shrink-0 pt-2 border-t border-line/40 sm:pt-0 sm:border-0">
                      <div class="text-left sm:text-right">
                        <div class="num text-lg font-black tracking-tight text-fg">
                          {nf(item.total)}{' '}
                          <span class="text-xs font-semibold text-muted-fg">{item.satuan}</span>
                        </div>
                        <span class="text-[11px] font-medium text-muted-fg">Total diambil</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setFilterBarangId(item.barang_id);
                          setTab('transaksi');
                        }}
                        class="inline-flex h-9 items-center gap-1.5 rounded-ctl border border-line bg-muted/40 px-3 text-xs font-bold text-fg transition-all hover:bg-muted hover:border-line-strong hover:text-primary active:scale-[0.98] select-none cursor-pointer shrink-0"
                      >
                        <span>Lihat transaksi</span>
                        <CaretRight size={13} weight="bold" class="text-muted-fg" />
                      </button>
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
                        'relative flex flex-col gap-2.5 rounded-card border bg-card p-3.5 sm:p-4 transition-all duration-150 shadow-2xs hover:shadow-xs',
                        isLewat
                          ? 'border-line hover:border-danger/40 before:absolute before:left-0 before:top-2.5 before:bottom-2.5 before:w-1 before:rounded-r before:bg-danger'
                          : 'border-line hover:border-line-strong',
                      )}
                    >
                      <div class="flex items-center justify-between gap-2 flex-wrap">
                        <div class="flex items-center gap-2 flex-wrap">
                          {isLewat ? (
                            <span class="inline-flex items-center gap-1 rounded-full border border-danger/30 bg-danger-soft px-2.5 py-0.5 text-[11px] font-bold text-danger">
                              <ClockCounterClockwise size={12} weight="bold" /> Kemarin
                            </span>
                          ) : (
                            <span class="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary-soft px-2.5 py-0.5 text-[11px] font-bold text-primary">
                              <CheckCircle size={12} weight="bold" /> Hari ini
                            </span>
                          )}
                          <span class="num text-xs font-semibold text-muted-fg">{t.waktu}</span>
                        </div>
                        <div class="num text-base font-extrabold text-fg">
                          {nf(t.jumlah)} <span class="text-xs font-semibold text-muted-fg">{t.satuan}</span>
                        </div>
                      </div>

                      <div class="flex items-center justify-between gap-2 flex-wrap">
                        <div>
                          <span class="font-bold text-fg text-sm sm:text-base">{t.barang}</span>
                          {t.kategori && (
                            <span class="ml-2 text-xs text-muted-fg">({t.kategori})</span>
                          )}
                        </div>
                        <div class="inline-flex items-center gap-1 text-xs text-muted-fg">
                          <User size={13} class="text-muted-fg" />
                          <span>
                            Diambil: <strong class="text-fg font-medium">{t.karyawan || 'Admin'}</strong>
                          </span>
                          {t.dicatat_oleh === 'admin' && (
                            <span class="ml-1 rounded bg-muted px-1.5 py-0.2 text-[10px] font-medium text-muted-fg">
                              input admin
                            </span>
                          )}
                        </div>
                      </div>

                      {t.catatan && (
                        <div class="rounded-ctl border border-line/60 bg-muted/40 px-3 py-1.5 text-xs text-muted-fg italic">
                          "{t.catatan}"
                        </div>
                      )}

                      <div class="flex items-center justify-end pt-2 border-t border-line/40">
                        <Button
                          size="sm"
                          variant="danger-ghost"
                          class="h-8 min-h-8 text-xs font-semibold px-2.5 gap-1.5"
                          onClick={() => setBatal(t)}
                        >
                          <ArrowCounterClockwise size={14} weight="bold" aria-hidden /> Batalkan Pengambilan
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
          <div class="flex flex-col gap-2.5">
            <p class="text-sm text-fg">Apakah Anda yakin ingin membatalkan transaksi pengambilan ini?</p>
            <div class="rounded-card bg-muted/60 p-3.5 text-xs flex flex-col gap-1.5 border border-line">
              <div class="flex items-center justify-between">
                <span class="text-muted-fg">Barang:</span>
                <strong class="text-fg font-bold">
                  {batal.barang} ({nf(batal.jumlah)} {batal.satuan})
                </strong>
              </div>
              <div class="flex items-center justify-between">
                <span class="text-muted-fg">Waktu:</span>
                <span class="num text-fg font-medium">{batal.waktu}</span>
              </div>
              <div class="flex items-center justify-between">
                <span class="text-muted-fg">Diambil oleh:</span>
                <strong class="text-fg font-medium">{batal.karyawan || 'Admin'}</strong>
              </div>
            </div>
            <p class="text-xs text-muted-fg leading-relaxed">
              Stok akan dikembalikan ke gudang dan transaksi tidak lagi dihitung sebagai tanggungan rekap.
            </p>
          </div>
        )}
      </Confirm>
    </>
  );
}
