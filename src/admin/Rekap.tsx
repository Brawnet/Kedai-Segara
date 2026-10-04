import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { CaretDown, CheckCircle, Clock, FunnelSimple, ListDashes, Rows } from '@phosphor-icons/react';
import { nf, parseNum, ymd } from '../lib/format';
import type { Rekap } from '../lib/types';
import { Button, Card, Field, Input, PageTitle, Tag, cx } from '../components/ui';
import { DataTable, Section, useAdmin, type Col } from './shared';
import { formatSelisih, hitungAutoFillTerjual } from '../lib/rekap-helpers';

const hari = (a: number, b: number) => {
  const x = new Date(a), y = new Date(b);
  x.setHours(0, 0, 0, 0);
  y.setHours(0, 0, 0, 0);
  return Math.round((x.getTime() - y.getTime()) / 864e5);
};


function SelisihBadge({ value }: { value: number }) {
  const isZero = Math.abs(value) < 1e-9;
  const isPos = value > 0;
  return (
    <span
      class={cx(
        'num font-bold px-2 py-0.5 rounded text-xs min-w-6 text-center inline-block transition-colors',
        isZero
          ? 'bg-muted text-muted-fg border border-line/60'
          : isPos
          ? 'bg-amber-100/80 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-300/60 dark:border-amber-800/60'
          : 'bg-blue-100/80 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-300/60 dark:border-blue-800/60',
      )}
      title={`Selisih: ${formatSelisih(value)}`}
    >
      {formatSelisih(value)}
    </span>
  );
}

export function RekapPage() {
  const { d, A } = useAdmin();
  const [sisaVals, setSisaVals] = useState<Record<string, Record<string, string>>>({});
  const [terjualVals, setTerjualVals] = useState<Record<string, Record<string, string>>>({});
  const [manualTerjual, setManualTerjual] = useState<Record<string, Record<string, boolean>>>({});
  const [openPendingId, setOpenPendingId] = useState<string | null>(null);
  const initializedPendingRef = useRef(false);
  const [dari, setDari] = useState('');
  const [sampai, setSampai] = useState('');
  const [modeTampilan, setModeTampilan] = useState<'rinci' | 'ringkas'>('rinci');

  const pendingRekaps = useMemo(() => {
    return d.rekap
      .filter((x) => (x.status ? String(x.status).toUpperCase() === 'PENDING' : false))
      .sort((a, b) => a.ts - b.ts); // FIFO: terlama di awal antrean
  }, [d.rekap]);

  const approvedRekaps = useMemo(() => {
    return d.rekap
      .filter((x) => (x.status ? String(x.status).toUpperCase() === 'APPROVED' : true))
      .sort((a, b) => b.ts - a.ts); // Riwayat: terbaru di atas
  }, [d.rekap]);

  // Set default accordion ke rekap pending paling awal (FIFO)
  useEffect(() => {
    if (pendingRekaps.length === 0) {
      setOpenPendingId(null);
      initializedPendingRef.current = false;
      return;
    }

    if (!initializedPendingRef.current) {
      setOpenPendingId(pendingRekaps[0].id);
      initializedPendingRef.current = true;
      return;
    }

    setOpenPendingId((currentOpenId) => {
      if (currentOpenId && !pendingRekaps.some((p) => p.id === currentOpenId)) {
        return pendingRekaps[0].id;
      }
      return currentOpenId;
    });
  }, [pendingRekaps]);

  const now = new Date();
  const today = ymd(now);
  const hMinus7 = ymd(new Date(now.getTime() - 7 * 864e5));
  const awalBulan = ymd(new Date(now.getFullYear(), now.getMonth(), 1));

  const rekapTgl = (x: Rekap) => {
    if (x.ts && !isNaN(x.ts)) return ymd(new Date(x.ts));
    const m = x.waktu ? x.waktu.match(/^(\d{2})\/(\d{2})\/(\d{4})/) : null;
    return m ? `${m[3]}-${m[2]}-${m[1]}` : '';
  };

  const filteredApproved = useMemo(() => {
    return approvedRekaps.filter((x) => {
      const tgl = rekapTgl(x);
      if (!tgl) return true;
      if (dari && tgl < dari) return false;
      if (sampai && tgl > sampai) return false;
      return true;
    });
  }, [approvedRekaps, dari, sampai]);

  const hisCols = useMemo<Col<Rekap & { i: number }>[]>(
    () => [
      {
        label: 'Waktu',
        w: 'w-[18%] md:w-[160px]',
        cell: (x) => <span class="num font-semibold text-fg">{x.waktu}</span>,
      },
      {
        label: 'Perekap',
        w: 'w-[14%] md:w-[130px]',
        cell: (x) => (
          <div class="flex flex-col">
            <span class="font-medium text-fg">{x.karyawan}</span>
            <span class="text-[11px] text-muted-fg num">{x.baris.length} barang</span>
          </div>
        ),
      },
      {
        label: modeTampilan === 'rinci' ? 'Rincian Stok, Terjual & Selisih' : 'Pemakaian & Penjualan',
        bare: true,
        cell: (x) => (
          <div
            class={cx(
              'w-full py-0.5',
              modeTampilan === 'rinci'
                ? 'grid grid-cols-1 sm:grid-cols-2 md:flex md:flex-wrap items-stretch gap-2.5'
                : 'flex flex-wrap items-center gap-2 justify-start',
            )}
          >
            {x.baris.length ? (
              x.baris.map((b) => {
                const terjualVal = b.terjual ?? 0;
                const selisihVal = b.selisih !== undefined ? b.selisih : b.terpakai - terjualVal;
                return modeTampilan === 'rinci' ? (
                  <div
                    key={b.barang_id}
                    class="flex flex-col justify-between rounded-ctl border border-line bg-card p-3 sm:p-2.5 text-xs shadow-2xs hover:border-line-strong hover:bg-muted/20 transition-all w-full md:w-auto md:min-w-[190px] md:max-w-[270px]"
                    title={`Awal: ${nf(b.saldo_awal)} | +Ambil: ${nf(b.diambil)} | Sisa: ${nf(b.sisa)} | Terpakai: ${nf(b.terpakai)} | Terjual: ${nf(terjualVal)} | Selisih: ${formatSelisih(selisihVal)}`}
                  >
                    <div class="flex items-center justify-between gap-3 border-b border-line/70 pb-2 sm:pb-1.5 mb-2 sm:mb-1.5">
                      <span class="font-bold text-fg truncate text-sm sm:text-xs" title={b.barang}>
                        {b.barang}
                      </span>
                      <span
                        class={cx(
                          'num font-bold px-2 py-0.5 rounded text-xs sm:text-[11px] min-w-6 text-center shrink-0',
                          b.terpakai > 0
                            ? 'bg-primary-soft text-primary'
                            : 'bg-muted text-muted-fg border border-line/60',
                        )}
                        title="Terpakai"
                      >
                        {nf(b.terpakai)}
                      </span>
                    </div>
                    <div class="grid grid-cols-5 gap-1 text-center num text-[10.5px]">
                      <div class="flex flex-col items-center">
                        <span class="text-[9px] uppercase font-bold text-muted-fg tracking-wider">Awal</span>
                        <span class="font-semibold text-fg text-xs">{nf(b.saldo_awal)}</span>
                      </div>
                      <div class="flex flex-col items-center border-l border-line/60 px-0.5">
                        <span class="text-[9px] uppercase font-bold text-muted-fg tracking-wider">+Ambil</span>
                        <span class="font-semibold text-fg text-xs">{b.diambil > 0 ? `+${nf(b.diambil)}` : '0'}</span>
                      </div>
                      <div class="flex flex-col items-center border-l border-line/60 px-0.5">
                        <span class="text-[9px] uppercase font-bold text-muted-fg tracking-wider">Sisa</span>
                        <span class="font-semibold text-muted-fg text-xs">{nf(b.sisa)}</span>
                      </div>
                      <div class="flex flex-col items-center border-l border-line/60 px-0.5">
                        <span class="text-[9px] uppercase font-bold text-muted-fg tracking-wider">Terjual</span>
                        <span class="font-semibold text-fg text-xs">{nf(terjualVal)}</span>
                      </div>
                      <div class="flex flex-col items-center border-l border-line/60 px-0.5">
                        <span class="text-[9px] uppercase font-bold text-muted-fg tracking-wider">Selisih</span>
                        <SelisihBadge value={selisihVal} />
                      </div>
                    </div>
                    {b.catatan ? (
                      <div class="mt-2 pt-1.5 border-t border-dashed border-line text-[11px] sm:text-[10px] text-muted-fg italic truncate" title={b.catatan}>
                        "{b.catatan}"
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <span
                    key={b.barang_id}
                    class="inline-flex items-center gap-2 rounded-lg border border-line bg-muted/60 px-2.5 py-1 text-xs text-fg"
                    title={`Awal: ${nf(b.saldo_awal)} | +Ambil: ${nf(b.diambil)} | Sisa: ${nf(b.sisa)} | Terpakai: ${nf(b.terpakai)} | Terjual: ${nf(terjualVal)} | Selisih: ${formatSelisih(selisihVal)}`}
                  >
                    <span class="font-medium text-fg">{b.barang}</span>
                    <span
                      class={cx(
                        'num font-bold px-1.5 py-0.5 rounded text-[11px] min-w-5 text-center',
                        b.terpakai > 0
                          ? 'bg-primary-soft text-primary'
                          : 'bg-muted text-muted-fg border border-line/60',
                      )}
                      title="Terpakai"
                    >
                      {nf(b.terpakai)}
                    </span>
                    <span class="text-muted-fg text-[11px]">Jual: <strong class="text-fg num">{nf(terjualVal)}</strong></span>
                    <SelisihBadge value={selisihVal} />
                  </span>
                );
              })
            ) : (
              <span class="text-muted-fg text-sm">—</span>
            )}
          </div>
        ),
      },
      {
        label: 'Tanda',
        align: 'center',
        w: 'w-[15%] md:w-[110px]',
        cell: (x) => {
          const fullIndex = approvedRekaps.findIndex((item) => item.id === x.id);
          const p = fullIndex >= 0 ? approvedRekaps[fullIndex + 1] : undefined;
          const n = p ? hari(x.ts, p.ts) : 0;
          return (
            <span class="inline-flex flex-wrap justify-center gap-1">
              <Tag tone="success">approved</Tag>
              {n > 1 && <Tag tone="warning">gabungan {n} hari</Tag>}
              {x.diedit_admin && <Tag>diedit</Tag>}
            </span>
          );
        },
      },
    ],
    [modeTampilan, approvedRekaps],
  );

  return (
    <div class="flex flex-col gap-6">
      <PageTitle kicker="Stock Luar" title="Rekap" />

      {/* Bagian 1: Antrean Rekap Pending (Menunggu Persetujuan Admin) */}
      <section class="flex flex-col gap-4">
        <div class="flex items-center justify-between gap-3">
          <div class="flex items-center gap-2">
            <Clock size={20} class="text-primary" aria-hidden />
            <h2 class="text-lg font-bold text-fg">Antrean Rekap Menunggu Approval</h2>
            {pendingRekaps.length > 0 && (
              <span class="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                {pendingRekaps.length} rekap
              </span>
            )}
          </div>
        </div>

        {pendingRekaps.length === 0 ? (
          <Card class="flex items-center gap-3 p-4 sm:p-5 text-sm text-muted-fg border-line bg-muted/20">
            <CheckCircle size={22} class="text-success shrink-0" aria-hidden />
            <div>
              <p class="font-semibold text-fg">Semua rekap telah disetujui.</p>
              <p class="text-xs text-muted-fg mt-0.5">
                Rekap baru yang diinput dari tablet akan masuk ke antrean ini sebelum resmi dicatat ke Riwayat Rekap.
              </p>
            </div>
          </Card>
        ) : (
          <div class="flex flex-col gap-4">
            {pendingRekaps.map((rk, idx) => {
              const isFirstQueue = idx === 0;
              const isOpen = openPendingId === rk.id;

              const sisaMap = sisaVals[rk.id] || {};
              const terjualMap = terjualVals[rk.id] || {};

              const itemRows = rk.baris.map((b, i) => {
                const sisaStr = sisaMap[b.barang_id] ?? String(b.sisa);
                const terjualStr = terjualMap[b.barang_id] ?? String(b.terjual ?? 0);
                const sisaNum = parseNum(sisaStr);
                const terjualNum = parseNum(terjualStr);
                const maks = Number(b.saldo_awal) + Number(b.diambil);
                const badSisa = sisaStr === '' || isNaN(sisaNum) || sisaNum < 0 || sisaNum > maks + 1e-9;
                const badTerjual = terjualStr === '' || isNaN(terjualNum) || terjualNum < 0;
                const liveTerpakai = !isNaN(sisaNum) ? Math.max(0, maks - sisaNum) : b.terpakai;
                const liveSelisih = !isNaN(terjualNum) ? liveTerpakai - terjualNum : b.selisih ?? liveTerpakai;
                return {
                  ...b,
                  i,
                  sisaStr,
                  terjualStr,
                  maks,
                  badSisa,
                  badTerjual,
                  liveTerpakai,
                  liveSelisih,
                };
              });

              const adaSalah = itemRows.some((b) => b.badSisa || b.badTerjual);
              type PendingRow = (typeof itemRows)[number];

              const pendingCols: Col<PendingRow>[] = [
                {
                  label: 'Barang',
                  w: 'w-[28%]',
                  cell: (b) => (
                    <div>
                      <span class="font-semibold text-fg">{b.barang}</span>
                      {b.catatan && <p class="text-xs font-normal text-muted-fg mt-0.5">{b.catatan}</p>}
                    </div>
                  ),
                },
                {
                  label: 'Awal',
                  align: 'center',
                  w: 'w-[10%]',
                  cell: (b) => <span class="num font-semibold text-fg">{nf(b.saldo_awal)}</span>,
                },
                {
                  label: 'Diambil',
                  align: 'center',
                  w: 'w-[10%]',
                  cell: (b) => <span class="num font-semibold text-fg">{nf(b.diambil)}</span>,
                },
                {
                  label: 'Sisa Fisik',
                  align: 'center',
                  w: 'w-[15%]',
                  cell: (b) => (
                    <div class="flex flex-col items-center">
                      <Input
                        aria-label={`Sisa ${b.barang}`}
                        inputmode="decimal"
                        value={b.sisaStr}
                        onInput={(e) => {
                          const val = e.currentTarget.value;
                          setSisaVals((prev) => ({
                            ...prev,
                            [rk.id]: { ...(prev[rk.id] || {}), [b.barang_id]: val },
                          }));
                        }}
                        aria-invalid={b.badSisa}
                        class="num text-center w-20 sm:w-24"
                        disabled={!isFirstQueue}
                      />
                      {b.badSisa && (
                        <p class="mt-1 text-[11px] font-semibold text-danger text-center">
                          0–{nf(b.maks)}
                        </p>
                      )}
                    </div>
                  ),
                },
                {
                  label: 'Terpakai',
                  align: 'center',
                  w: 'w-[11%]',
                  cell: (b) => (
                    <span
                      class={cx(
                        'num font-bold px-2 py-0.5 rounded text-xs min-w-6 text-center inline-block',
                        b.liveTerpakai > 0 ? 'bg-primary-soft text-primary' : 'bg-muted text-muted-fg border border-line/60',
                      )}
                    >
                      {nf(b.liveTerpakai)}
                    </span>
                  ),
                },
                {
                  label: 'Terjual',
                  align: 'center',
                  w: 'w-[15%]',
                  cell: (b) => (
                    <div class="flex flex-col items-center">
                      <Input
                        aria-label={`Terjual ${b.barang}`}
                        inputmode="decimal"
                        value={b.terjualStr}
                        onInput={(e) => {
                          const val = e.currentTarget.value;
                          setTerjualVals((prev) => ({
                            ...prev,
                            [rk.id]: { ...(prev[rk.id] || {}), [b.barang_id]: val },
                          }));
                          setManualTerjual((prev) => ({
                            ...prev,
                            [rk.id]: { ...(prev[rk.id] || {}), [b.barang_id]: true },
                          }));
                        }}
                        aria-invalid={b.badTerjual}
                        class="num text-center w-20 sm:w-24"
                        disabled={!isFirstQueue}
                      />
                      {b.badTerjual && (
                        <p class="mt-1 text-[11px] font-semibold text-danger text-center">
                          Wajib ≥ 0
                        </p>
                      )}
                    </div>
                  ),
                },
                {
                  label: 'Selisih',
                  align: 'center',
                  w: 'w-[11%]',
                  cell: (b) => <SelisihBadge value={b.liveSelisih} />,
                },
              ];

              const renderPendingMobileCard = (b: PendingRow) => (
                <div
                  class={cx(
                    'rounded-card border bg-card p-3.5 flex flex-col gap-3 shadow-xs transition-all',
                    b.badSisa || b.badTerjual ? 'border-danger/80 ring-1 ring-danger/30' : 'border-line',
                  )}
                >
                  <div class="flex items-start justify-between gap-3">
                    <div class="min-w-0 flex-1">
                      <h3 class="font-bold text-base text-fg leading-snug break-words">{b.barang}</h3>
                      {b.catatan && <p class="text-xs text-muted-fg mt-0.5 italic">"{b.catatan}"</p>}
                    </div>
                    <div class="flex items-center gap-2 shrink-0">
                      <div class="flex flex-col items-end">
                        <span class="text-[9px] font-bold uppercase tracking-wider text-muted-fg">Terpakai</span>
                        <span class="num font-bold px-2 py-0.5 rounded text-xs bg-primary-soft text-primary">
                          {nf(b.liveTerpakai)}
                        </span>
                      </div>
                      <div class="flex flex-col items-end">
                        <span class="text-[9px] font-bold uppercase tracking-wider text-muted-fg">Selisih</span>
                        <SelisihBadge value={b.liveSelisih} />
                      </div>
                    </div>
                  </div>

                  <div class="grid grid-cols-3 gap-2 rounded-lg bg-muted/50 border border-line/60 p-2 text-center num text-xs">
                    <div>
                      <span class="text-[9px] uppercase font-bold text-muted-fg">Awal</span>
                      <div class="font-semibold text-fg">{nf(b.saldo_awal)}</div>
                    </div>
                    <div class="border-x border-line/60 px-1">
                      <span class="text-[9px] uppercase font-bold text-muted-fg">+Ambil</span>
                      <div class="font-semibold text-fg">{b.diambil > 0 ? `+${nf(b.diambil)}` : '0'}</div>
                    </div>
                    <div>
                      <span class="text-[9px] uppercase font-bold text-muted-fg">Total</span>
                      <div class="font-bold text-fg">{nf(b.maks)}</div>
                    </div>
                  </div>

                  <div class="grid grid-cols-2 gap-3 pt-1 border-t border-line/40">
                    <div>
                      <label class="text-[11px] font-bold uppercase tracking-wider text-muted-fg block mb-1">
                        Sisa Fisik
                      </label>
                      <Input
                        inputmode="decimal"
                        value={b.sisaStr}
                        onInput={(e) => {
                          const val = e.currentTarget.value;
                          setSisaVals((prev) => ({
                            ...prev,
                            [rk.id]: { ...(prev[rk.id] || {}), [b.barang_id]: val },
                          }));
                        }}
                        aria-invalid={b.badSisa}
                        class="num text-center font-bold text-sm w-full"
                        disabled={!isFirstQueue}
                      />
                      {b.badSisa && <p class="mt-1 text-[10px] font-semibold text-danger">0–{nf(b.maks)}</p>}
                    </div>
                    <div>
                      <label class="text-[11px] font-bold uppercase tracking-wider text-muted-fg block mb-1">
                        Terjual
                      </label>
                      <Input
                        inputmode="decimal"
                        value={b.terjualStr}
                        onInput={(e) => {
                          const val = e.currentTarget.value;
                          setTerjualVals((prev) => ({
                            ...prev,
                            [rk.id]: { ...(prev[rk.id] || {}), [b.barang_id]: val },
                          }));
                          setManualTerjual((prev) => ({
                            ...prev,
                            [rk.id]: { ...(prev[rk.id] || {}), [b.barang_id]: true },
                          }));
                        }}
                        aria-invalid={b.badTerjual}
                        class="num text-center font-bold text-sm w-full"
                        disabled={!isFirstQueue}
                      />
                      {b.badTerjual && <p class="mt-1 text-[10px] font-semibold text-danger">Wajib ≥ 0</p>}
                    </div>
                  </div>
                </div>
              );

              const setujui = () => {
                if (!isFirstQueue || adaSalah || !itemRows.length) return;
                const items = itemRows.map((b) => ({
                  barang_id: b.barang_id,
                  sisa: String(parseNum(b.sisaStr)),
                  terjual: String(parseNum(b.terjualStr)),
                }));
                A('approveRekap', [rk.id, items], 'Rekap berhasil disetujui');
              };

              const isiOtomatisTerjual = () => {
                if (!isFirstQueue) return;
                const itemsToFill = itemRows.map((r) => ({
                  barang_id: r.barang_id,
                  liveTerpakai: r.liveTerpakai,
                }));
                const updated = hitungAutoFillTerjual(
                  itemsToFill,
                  terjualVals[rk.id] || {},
                  manualTerjual[rk.id] || {},
                );
                setTerjualVals((prev) => ({
                  ...prev,
                  [rk.id]: updated,
                }));
              };

              return (
                <Card key={rk.id} class="flex flex-col gap-3 p-4 md:p-5 border-line">
                  {/* Header Accordion */}
                  <div
                    role="button"
                    tabIndex={0}
                    aria-expanded={isOpen}
                    class="flex flex-wrap items-center justify-between gap-2 cursor-pointer select-none rounded-lg focus-visible:outline-2 focus-visible:outline-primary"
                    onClick={() => setOpenPendingId((prev) => (prev === rk.id ? null : rk.id))}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setOpenPendingId((prev) => (prev === rk.id ? null : rk.id));
                      }
                    }}
                  >
                    <div class="flex flex-wrap items-center gap-2">
                      <h3 class="text-base font-bold text-fg">
                        Rekap · <span class="num">{rk.waktu}</span> · {rk.karyawan}
                      </h3>
                      <Tag tone="warning">Menunggu Approval</Tag>
                      {isFirstQueue ? (
                        <Tag tone="primary">Antrean Aktif #1</Tag>
                      ) : (
                        <Tag tone="neutral">Antrean #{idx + 1}</Tag>
                      )}
                      {rk.diedit_admin && <Tag>diedit admin</Tag>}
                    </div>
                    <div
                      class="flex size-8 items-center justify-center rounded-lg text-muted-fg hover:text-fg hover:bg-muted/60 transition-colors"
                      aria-label={isOpen ? 'Tutup detail rekap' : 'Buka detail rekap'}
                    >
                      <CaretDown
                        size={18}
                        class={cx('transition-transform duration-200', isOpen && 'rotate-180')}
                      />
                    </div>
                  </div>

                  {/* Body Accordion */}
                  {isOpen && (
                    <div class="flex flex-col gap-4 pt-2 border-t border-line/60">
                      {!isFirstQueue && (
                        <div class="rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 p-3 text-xs text-amber-800 dark:text-amber-200">
                          <strong>Antrean FIFO:</strong> Harap setujui rekap yang lebih lama ({pendingRekaps[0].waktu}) terlebih dahulu sebelum menyetujui rekap ini.
                        </div>
                      )}

                      <DataTable
                        cols={pendingCols}
                        rows={itemRows}
                        rowKey={(x) => x.barang_id}
                        renderCard={renderPendingMobileCard}
                        empty="Rekap ini tidak berisi barang."
                      />

                      <div class="flex flex-wrap items-center gap-3 pt-2">
                        <Button
                          variant="primary"
                          guard
                          onClick={setujui}
                          disabled={!isFirstQueue || adaSalah || !rk.baris.length}
                        >
                          Setujui Rekap
                        </Button>
                        <Button
                          variant="secondary"
                          type="button"
                          onClick={isiOtomatisTerjual}
                          disabled={!isFirstQueue || !itemRows.length}
                          title="Isi otomatis nilai terjual = terpakai tanpa menimpa angka yang sudah Anda isi manual"
                        >
                          Isi Terjual Otomatis
                        </Button>
                        <p class="text-xs text-muted-fg">
                          {isFirstQueue
                            ? 'Menyimpan sisa fisik, terjual, dan selisih ke Riwayat Rekap. Tombol otomatis mengisi terjual = terpakai tanpa menimpa angka yang sudah Anda isi manual.'
                            : `Terkunci: setujui rekap ${pendingRekaps[0].waktu} terlebih dahulu.`}
                        </p>
                      </div>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </section>

      {/* Bagian 2: Riwayat Rekap yang Sudah Approved */}
      <Section
        title="Riwayat rekap"
        actions={
          <div class="flex items-center gap-2 flex-wrap justify-end">
            <div
              class="relative inline-grid grid-cols-2 rounded-ctl border border-line bg-muted/70 p-0.5 text-xs select-none"
              role="group"
              aria-label="Mode Tampilan Riwayat"
            >
              {/* Sliding Pill Indicator */}
              <div
                class={cx(
                  'absolute top-0.5 bottom-0.5 left-0.5 w-[calc(50%-2px)] rounded-[8px] bg-card border border-line/60 shadow-2xs transition-transform duration-200 ease-out pointer-events-none',
                  modeTampilan === 'rinci' ? 'translate-x-0' : 'translate-x-full',
                )}
                aria-hidden="true"
              />

              <button
                type="button"
                onClick={() => setModeTampilan('rinci')}
                class={cx(
                  'relative z-10 inline-flex items-center justify-center gap-1.5 rounded-[8px] px-2.5 py-1 font-semibold cursor-pointer text-xs transition-colors duration-150',
                  modeTampilan === 'rinci' ? 'text-fg' : 'text-muted-fg hover:text-fg',
                )}
                title="Tampilkan detail Awal, Ambil, Sisa, Terpakai, Terjual, dan Selisih"
              >
                <Rows size={14} weight={modeTampilan === 'rinci' ? 'bold' : 'regular'} aria-hidden />
                <span>Rinci</span>
              </button>
              <button
                type="button"
                onClick={() => setModeTampilan('ringkas')}
                class={cx(
                  'relative z-10 inline-flex items-center justify-center gap-1.5 rounded-[8px] px-2.5 py-1 font-semibold cursor-pointer text-xs transition-colors duration-150',
                  modeTampilan === 'ringkas' ? 'text-fg' : 'text-muted-fg hover:text-fg',
                )}
                title="Tampilkan ringkas nama barang, terpakai, terjual, dan selisih"
              >
                <ListDashes size={14} weight={modeTampilan === 'ringkas' ? 'bold' : 'regular'} aria-hidden />
                <span>Ringkas</span>
              </button>
            </div>
            {(dari || sampai) && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setDari('');
                  setSampai('');
                }}
                class="text-xs"
              >
                Reset filter
              </Button>
            )}
          </div>
        }
      >
        <Card class="p-3.5 sm:p-4 flex flex-col gap-3">
          <div class="flex items-center gap-2 text-xs font-bold text-muted-fg uppercase tracking-wider">
            <FunnelSimple size={16} aria-hidden />
            <span>Filter Tanggal</span>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_auto] gap-3 items-end">
            <Field label="Dari Tanggal">
              {(id) => (
                <Input
                  id={id}
                  type="date"
                  value={dari}
                  onInput={(e) => setDari(e.currentTarget.value)}
                  max={sampai || undefined}
                />
              )}
            </Field>
            <Field
              label="Sampai Tanggal"
              error={dari && sampai && dari > sampai ? 'Tanggal akhir sebelum tanggal awal' : undefined}
            >
              {(id, dId) => (
                <Input
                  id={id}
                  type="date"
                  value={sampai}
                  onInput={(e) => setSampai(e.currentTarget.value)}
                  min={dari || undefined}
                  aria-invalid={Boolean(dari && sampai && dari > sampai)}
                  aria-describedby={dId}
                />
              )}
            </Field>
            <div class="flex items-center gap-2 flex-wrap pb-0.5">
              <Button
                size="sm"
                variant={!dari && !sampai ? 'primary' : 'secondary'}
                onClick={() => {
                  setDari('');
                  setSampai('');
                }}
              >
                Semua
              </Button>
              <Button
                size="sm"
                variant={dari === today && sampai === today ? 'primary' : 'secondary'}
                onClick={() => {
                  setDari(today);
                  setSampai(today);
                }}
              >
                Hari Ini
              </Button>
              <Button
                size="sm"
                variant={dari === hMinus7 && sampai === today ? 'primary' : 'secondary'}
                onClick={() => {
                  setDari(hMinus7);
                  setSampai(today);
                }}
              >
                7 Hari
              </Button>
              <Button
                size="sm"
                variant={dari === awalBulan && sampai === today ? 'primary' : 'secondary'}
                onClick={() => {
                  setDari(awalBulan);
                  setSampai(today);
                }}
              >
                Bulan Ini
              </Button>
            </div>
          </div>
        </Card>

        <div class="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-fg px-1">
          <span>
            Menampilkan <strong class="num text-fg">{filteredApproved.length}</strong> dari <span class="num">{approvedRekaps.length}</span> rekap disetujui
            {(dari || sampai) && (
              <span> · Rentang: <strong>{dari || 'Awal'}</strong> s/d <strong>{sampai || 'Sekarang'}</strong></span>
            )}
          </span>
          <span class="inline-flex items-center gap-1.5 text-[11px] text-muted-fg bg-muted/60 px-2.5 py-1 rounded-ctl border border-line">
            <span class="font-medium text-muted-fg">Kalkulasi:</span>
            <span class="num font-semibold text-fg">Awal + Ambil - Sisa</span> = <span class="num font-bold text-primary">Terpakai</span>
            <span class="text-muted-fg">·</span>
            <span class="num font-semibold text-fg">Terpakai - Terjual</span> = <span class="num font-bold text-fg">Selisih</span>
          </span>
        </div>

        <DataTable
          cols={hisCols}
          rows={filteredApproved.map((x, i) => ({ ...x, i }))}
          rowKey={(x) => x.id}
          empty={
            dari || sampai
              ? 'Tidak ada riwayat rekap pada rentang tanggal yang dipilih.'
              : 'Belum ada riwayat rekap yang disetujui.'
          }
        />
      </Section>
    </div>
  );
}
