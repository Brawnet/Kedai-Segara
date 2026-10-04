import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { CaretDown, CheckCircle, Clock, FunnelSimple, Info, Lightning, ListDashes, Rows } from '@phosphor-icons/react';
import { nf, parseNum, ymd } from '../lib/format';
import type { Rekap } from '../lib/types';
import { Button, Card, Confirm, Dialog, Field, Input, PageTitle, Tag, cx, formatDisplayDate } from '../components/ui';
import { DataTable, Section, useAdmin, type Col } from './shared';
import { formatSelisih, hitungAutoFillTerjual } from '../lib/rekap-helpers';
import { clearRekapDraft, loadRekapDraft, saveRekapDraft } from '../lib/rekap-draft';

const hari = (a: number, b: number) => {
  const x = new Date(a), y = new Date(b);
  x.setHours(0, 0, 0, 0);
  y.setHours(0, 0, 0, 0);
  return Math.round((x.getTime() - y.getTime()) / 864e5);
};


function SelisihBadge({ value, onClick }: { value: number | null | undefined; onClick?: () => void }) {
  if (value === null || value === undefined || isNaN(value)) {
    return (
      <span
        class="num font-semibold px-2 py-0.5 rounded text-xs min-w-6 text-center inline-block text-muted-fg/70 bg-muted/50 border border-line/60"
        title="Nilai selisih belum dihitung karena terjual belum diisi"
      >
        -
      </span>
    );
  }
  const isZero = Math.abs(value) < 1e-9;
  const isPos = value > 0;
  const badge = (
    <span
      class={cx(
        'num font-bold px-2 py-0.5 rounded text-xs min-w-6 text-center inline-block transition-colors',
        isZero
          ? 'bg-muted text-muted-fg border border-line/60'
          : isPos
          ? 'bg-amber-100/80 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-300/60 dark:border-amber-800/60'
          : 'bg-blue-100/80 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-300/60 dark:border-blue-800/60',
        onClick && 'cursor-pointer hover:opacity-85 active:scale-95 transition-transform',
      )}
      title={
        isZero
          ? 'Selisih 0: Fisik terpakai pas dengan penjualan kasir'
          : isPos
          ? `Selisih +${formatSelisih(value)}: Terpakai lebih banyak dari kasir (potensi loss/porsi lebih)`
          : `Selisih ${formatSelisih(value)}: Terpakai lebih sedikit dari kasir (penjualan kasir lebih tinggi)`
      }
    >
      {formatSelisih(value)}
    </span>
  );

  if (onClick) {
    return (
      <button type="button" onClick={onClick} class="cursor-pointer" aria-label="Info nilai selisih">
        {badge}
      </button>
    );
  }
  return badge;
}

export function RekapPage() {
  const { d, A } = useAdmin();
  const [initialDraft] = useState(() => loadRekapDraft());
  const [sisaVals, setSisaVals] = useState<Record<string, Record<string, string>>>(() => initialDraft?.sisaVals || {});
  const [terjualVals, setTerjualVals] = useState<Record<string, Record<string, string>>>(() => initialDraft?.terjualVals || {});
  const [manualTerjual, setManualTerjual] = useState<Record<string, Record<string, boolean>>>(() => initialDraft?.manualTerjual || {});
  const isInitialDraftMount = useRef(true);

  // Simpan draf otomatis ke localStorage setiap kali ada input sisa fisik, terjual, atau auto-fill
  useEffect(() => {
    if (isInitialDraftMount.current) {
      isInitialDraftMount.current = false;
      return;
    }
    saveRekapDraft(sisaVals, terjualVals, manualTerjual);
  }, [sisaVals, terjualVals, manualTerjual]);

  const [openPendingId, setOpenPendingId] = useState<string | null>(null);
  const [confirmApproveId, setConfirmApproveId] = useState<string | null>(null);
  const [confirmResetId, setConfirmResetId] = useState<string | null>(null);
  const initializedPendingRef = useRef(false);
  const [dari, setDari] = useState('');
  const [sampai, setSampai] = useState('');
  const [modeTampilan, setModeTampilan] = useState<'rinci' | 'ringkas'>('rinci');
  const [bukaInfoSelisih, setBukaInfoSelisih] = useState(false);
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
  // Bersihkan draf untuk rekap yang sudah tidak berstatus pending (mis. disetujui di tab lain)
  useEffect(() => {
    const pendingIds = new Set(pendingRekaps.map((r) => r.id));
    const draftIds = new Set([...Object.keys(sisaVals), ...Object.keys(terjualVals)]);
    for (const id of draftIds) {
      if (!pendingIds.has(id)) {
        clearRekapDraft(id);
      }
    }
  }, [pendingRekaps, sisaVals, terjualVals]);

  // Peringatan sebelum reload/close tab jika ada angka draf yang belum disetujui
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      const hasUnsaved =
        Object.values(sisaVals).some((sub) => Object.values(sub).some((v) => typeof v === 'string' && v.trim() !== '')) ||
        Object.values(terjualVals).some((sub) => Object.values(sub).some((v) => typeof v === 'string' && v.trim() !== ''));
      if (hasUnsaved) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [sisaVals, terjualVals]);

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
                        <span class="text-[9px] uppercase font-bold text-muted-fg tracking-wider">
                          Selisih
                        </span>
                        <SelisihBadge value={selisihVal} onClick={() => setBukaInfoSelisih(true)} />
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
                    <SelisihBadge value={selisihVal} onClick={() => setBukaInfoSelisih(true)} />
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
                const hasEditedTerjual = b.barang_id in terjualMap || (rk.diedit_admin && b.terjual !== undefined && b.terjual !== null);
                const terjualStr = hasEditedTerjual
                  ? (terjualMap[b.barang_id] ?? String(b.terjual ?? ''))
                  : '';
                const sisaNum = parseNum(sisaStr);
                const terjualNum = parseNum(terjualStr);
                const maks = Number(b.saldo_awal) + Number(b.diambil);
                const badSisa = sisaStr === '' || isNaN(sisaNum) || sisaNum < 0 || sisaNum > maks + 1e-9;
                const badTerjual = terjualStr !== '' && (isNaN(terjualNum) || terjualNum < 0);
                const liveTerpakai = !isNaN(sisaNum) ? Math.max(0, maks - sisaNum) : b.terpakai;
                const liveSelisih = !isNaN(terjualNum) ? liveTerpakai - terjualNum : NaN;
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
              const belumLengkap = itemRows.some((b) => b.sisaStr.trim() === '' || b.terjualStr.trim() === '');
              const needsAutoFill = itemRows.some((b) => {
                if (b.terjualStr.trim() === '') return true;
                const terjualNum = parseNum(b.terjualStr);
                const isManuallyEdited = Boolean(manualTerjual[rk.id]?.[b.barang_id]);
                if (!isManuallyEdited && b.liveTerpakai > 0 && (terjualNum === 0 || isNaN(terjualNum))) {
                  return true;
                }
                return false;
              });
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
                  header: (
                    <span class="inline-flex items-center justify-center gap-1.5">
                      <span>Terjual</span>
                      {isFirstQueue && itemRows.length > 0 && needsAutoFill && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            isiOtomatisTerjual();
                          }}
                          class="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-bold text-primary bg-primary-soft hover:bg-primary/20 border border-primary/30 transition-colors cursor-pointer select-none"
                          title="Isi otomatis Terjual = Terpakai untuk semua barang tanpa menimpa yang sudah Anda isi manual"
                          aria-label="Isi semua terjual otomatis sesuai terpakai"
                        >
                          <Lightning size={11} weight="fill" aria-hidden />
                          <span>Auto</span>
                        </button>
                      )}
                    </span>
                  ),
                  align: 'center',
                  w: 'w-[15%]',
                  cell: (b) => (
                    <div class="flex flex-col items-center">
                      <Input
                        aria-label={`Terjual ${b.barang}`}
                        inputmode="decimal"
                        value={b.terjualStr}
                        placeholder="-"
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
                        class="num text-center w-20 sm:w-24 placeholder:text-muted-fg/40"
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
                  cell: (b) => <SelisihBadge value={b.liveSelisih} onClick={() => setBukaInfoSelisih(true)} />,
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
                        <span class="text-[9px] font-bold uppercase tracking-wider text-muted-fg">
                          Selisih
                        </span>
                        <SelisihBadge value={b.liveSelisih} onClick={() => setBukaInfoSelisih(true)} />
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
                      <div class="flex items-center justify-between mb-1">
                        <label class="text-[11px] font-bold uppercase tracking-wider text-muted-fg">
                          Terjual
                        </label>
                        {isFirstQueue && b.liveTerpakai > 0 && b.terjualStr !== String(b.liveTerpakai) && (
                          <button
                            type="button"
                            onClick={() => {
                              setTerjualVals((prev) => ({
                                ...prev,
                                [rk.id]: { ...(prev[rk.id] || {}), [b.barang_id]: String(b.liveTerpakai) },
                              }));
                              setManualTerjual((prev) => ({
                                ...prev,
                                [rk.id]: { ...(prev[rk.id] || {}), [b.barang_id]: true },
                              }));
                            }}
                            class="inline-flex items-center gap-0.5 text-[10px] font-bold text-primary hover:underline cursor-pointer"
                            title={`Isi otomatis ${b.liveTerpakai} sesuai terpakai`}
                          >
                            <Lightning size={10} weight="fill" aria-hidden />
                            <span>={nf(b.liveTerpakai)}</span>
                          </button>
                        )}
                      </div>
                      <Input
                        inputmode="decimal"
                        value={b.terjualStr}
                        placeholder="-"
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
                        class="num text-center font-bold text-sm w-full placeholder:text-muted-fg/40"
                        disabled={!isFirstQueue}
                      />
                      {b.badTerjual && <p class="mt-1 text-[10px] font-semibold text-danger">Wajib ≥ 0</p>}
                    </div>
                  </div>
                </div>
              );

              const setujui = async () => {
                if (!isFirstQueue || adaSalah || belumLengkap || !itemRows.length) return;
                const items = itemRows.map((b) => ({
                  barang_id: b.barang_id,
                  sisa: String(parseNum(b.sisaStr)),
                  terjual: String(parseNum(b.terjualStr)),
                }));
                const res = await A('approveRekap', [rk.id, items], 'Rekap berhasil disetujui');
                if (res) {
                  clearRekapDraft(rk.id);
                  setSisaVals((prev) => {
                    const next = { ...prev };
                    delete next[rk.id];
                    return next;
                  });
                  setTerjualVals((prev) => {
                    const next = { ...prev };
                    delete next[rk.id];
                    return next;
                  });
                  setManualTerjual((prev) => {
                    const next = { ...prev };
                    delete next[rk.id];
                    return next;
                  });
                }
              };

              const hasDraft = Boolean(
                (sisaVals[rk.id] && Object.values(sisaVals[rk.id]).some((v) => typeof v === 'string' && v.trim() !== '')) ||
                (terjualVals[rk.id] && Object.values(terjualVals[rk.id]).some((v) => typeof v === 'string' && v.trim() !== ''))
              );

              const resetDraf = () => {
                clearRekapDraft(rk.id);
                setSisaVals((prev) => {
                  const next = { ...prev };
                  delete next[rk.id];
                  return next;
                });
                setTerjualVals((prev) => {
                  const next = { ...prev };
                  delete next[rk.id];
                  return next;
                });
                setManualTerjual((prev) => {
                  const next = { ...prev };
                  delete next[rk.id];
                  return next;
                });
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
                      {hasDraft && <Tag tone="neutral">Draf Tersimpan</Tag>}
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

                      {/* Quick Action Bar di atas tabel */}
                      {isFirstQueue && itemRows.length > 0 && needsAutoFill && (
                        <div class="flex flex-wrap items-center justify-between gap-2.5 rounded-lg border border-line bg-muted/40 p-2.5 sm:px-3 text-xs">
                          <div class="flex items-center gap-2 text-muted-fg min-w-0">
                            <span class="inline-flex size-6 shrink-0 items-center justify-center rounded-md bg-primary-soft text-primary font-bold">
                              <Lightning size={14} weight="fill" aria-hidden />
                            </span>
                            <span class="truncate sm:overflow-visible">
                              Aksi Cepat: Isi otomatis <strong>Terjual = Terpakai</strong> untuk semua barang
                            </span>
                          </div>
                          <Button
                            variant="secondary"
                            size="sm"
                            type="button"
                            onClick={isiOtomatisTerjual}
                            class="min-h-8 text-xs px-2.5 py-1 gap-1.5 font-bold text-primary border-primary/30 bg-primary-soft hover:bg-primary/20 hover:text-primary shrink-0"
                            title="Isi otomatis nilai terjual = terpakai tanpa menimpa angka yang sudah Anda isi manual"
                          >
                            <Lightning size={14} weight="fill" aria-hidden />
                            <span>Isi Terjual Otomatis</span>
                          </Button>
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
                          onClick={() => setConfirmApproveId(rk.id)}
                          disabled={!isFirstQueue || adaSalah || belumLengkap || !rk.baris.length}
                          title={belumLengkap ? 'Isi nilai terjual untuk semua barang sebelum menyetujui rekap' : undefined}
                        >
                          Setujui Rekap
                        </Button>
                        {hasDraft && (
                          <Button
                            variant="ghost"
                            type="button"
                            onClick={() => setConfirmResetId(rk.id)}
                            disabled={!isFirstQueue}
                            title="Kembalikan sisa fisik dan terjual ke nilai asli dari tablet"
                          >
                            Reset Draf
                          </Button>
                        )}
                        <p class="text-xs text-muted-fg">
                          {isFirstQueue
                            ? belumLengkap
                              ? 'Isi nilai terjual (atau gunakan tombol Isi Terjual Otomatis di atas) sebelum menyetujui rekap.'
                              : 'Menyimpan sisa fisik, terjual, dan selisih ke Riwayat Rekap. Draf tersimpan otomatis di perangkat ini.'
                            : `Terkunci: setujui rekap ${pendingRekaps[0].waktu} terlebih dahulu.`}
                        </p>
                      </div>

                      {confirmApproveId === rk.id && (
                        <Confirm
                          open={confirmApproveId === rk.id}
                          title="Setujui Rekap?"
                          okLabel="Ya, Setujui"
                          tone="primary"
                          onCancel={() => setConfirmApproveId(null)}
                          onOk={async () => {
                            setConfirmApproveId(null);
                            await setujui();
                          }}
                        >
                          <div class="flex flex-col gap-2 text-sm">
                            <p>
                              Apakah Anda yakin ingin menyetujui rekap tanggal{' '}
                              <strong class="text-fg num">{rk.waktu}</strong> dari staf{' '}
                              <strong class="text-fg">{rk.karyawan}</strong> ({itemRows.length} barang)?
                            </p>
                            <p class="text-xs text-muted-fg">
                              Sisa fisik, nilai terjual, dan selisih akan disimpan secara permanen ke Riwayat Rekap.
                            </p>
                          </div>
                        </Confirm>
                      )}

                      {confirmResetId === rk.id && (
                        <Confirm
                          open={confirmResetId === rk.id}
                          title="Reset Draf Rekap?"
                          okLabel="Ya, Reset Draf"
                          tone="danger"
                          onCancel={() => setConfirmResetId(null)}
                          onOk={() => {
                            setConfirmResetId(null);
                            resetDraf();
                          }}
                        >
                          <p class="text-sm">
                            Semua angka sisa fisik dan terjual yang Anda ubah akan dikembalikan ke nilai awal yang dikirim dari tablet.
                          </p>
                        </Confirm>
                      )}
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
              <span> · Rentang: <strong>{formatDisplayDate(dari) || 'Awal'}</strong> s/d <strong>{formatDisplayDate(sampai) || 'Sekarang'}</strong></span>
            )}
          </span>
          <span class="inline-flex items-center gap-1.5 text-[11px] text-muted-fg bg-muted/60 px-2.5 py-1 rounded-ctl border border-line">
            <span class="font-medium text-muted-fg">Kalkulasi:</span>
            <span class="num font-semibold text-fg">Awal + Ambil - Sisa</span> = <span class="num font-bold text-primary">Terpakai</span>
            <span class="text-muted-fg">·</span>
            <span class="num font-semibold text-fg">Terpakai - Terjual</span> = <span class="num font-bold text-fg">Selisih</span>
            <button
              type="button"
              onClick={() => setBukaInfoSelisih(true)}
              class="inline-flex items-center gap-1 ml-1 text-primary hover:underline font-bold cursor-pointer"
              title="Penjelasan lengkap arti nilai selisih"
            >
              <Info size={13} weight="bold" />
              <span>Arti Selisih</span>
            </button>
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

      {/* Dialog Panduan & Arti Nilai Selisih */}
      <Dialog
        open={bukaInfoSelisih}
        onClose={() => setBukaInfoSelisih(false)}
        title="Arti & Panduan Nilai Selisih"
        footer={
          <Button variant="secondary" onClick={() => setBukaInfoSelisih(false)}>
            Mengerti
          </Button>
        }
      >
        <div class="flex flex-col gap-4 text-xs sm:text-sm">
          {/* Rumus Ringkas */}
          <div class="rounded-ctl border border-line bg-muted/50 p-3 sm:p-3.5 flex flex-col gap-1.5">
            <div class="text-[11px] font-bold text-muted-fg uppercase tracking-wider">Rumus Dasar Selisih</div>
            <div class="flex flex-wrap items-center gap-1.5 text-xs sm:text-sm font-semibold text-fg">
              <span class="num font-bold text-fg bg-card px-2 py-0.5 rounded border border-line">Selisih</span>
              <span>=</span>
              <span class="num text-primary font-bold bg-card px-2 py-0.5 rounded border border-line">Terpakai</span>
              <span>−</span>
              <span class="num text-fg bg-card px-2 py-0.5 rounded border border-line">Terjual</span>
            </div>
            <p class="text-[11px] sm:text-xs text-muted-fg mt-1">
              Membandingkan stok fisik bahan yang berkurang dari dapur/bar (<strong>Terpakai</strong>) dengan pencatatan struk penjualan kasir (<strong>Terjual</strong>).
            </p>
          </div>

          {/* Kartu 3 Kondisi: Plus, Minus, Nol */}
          <div class="flex flex-col gap-3">
            {/* 1. Nilai Minus */}
            <div class="rounded-ctl border border-blue-200 dark:border-blue-900/60 bg-blue-50/50 dark:bg-blue-950/20 p-3 sm:p-3.5 flex flex-col gap-1.5">
              <div class="flex items-center justify-between gap-2">
                <div class="flex items-center gap-2">
                  <span class="num font-bold px-2 py-0.5 rounded text-xs text-center inline-block bg-blue-100 text-blue-800 dark:bg-blue-950/80 dark:text-blue-300 border border-blue-300/80 dark:border-blue-800">
                    -2
                  </span>
                  <span class="font-bold text-fg text-xs sm:text-sm">Nilai Minus (−)</span>
                </div>
                <span class="text-[11px] font-semibold text-blue-700 dark:text-blue-300">
                  Terpakai &lt; Terjual
                </span>
              </div>
              <div class="text-xs text-muted-fg flex flex-col gap-1 mt-0.5">
                <p class="text-fg font-medium">
                  Artinya: Penjualan kasir lebih tinggi dari stok fisik yang terpakai.
                </p>
                <span class="text-[11px] font-semibold text-muted-fg uppercase tracking-wider mt-1">Penyebab Umum:</span>
                <ul class="list-disc list-inside space-y-0.5 text-[11px] sm:text-xs pl-1">
                  <li>Porsi atau takaran penyajian lebih hemat / efisien dibanding resep standar.</li>
                  <li>Kasir salah mencatat kuantitas berlebih pada transaksi penjualan.</li>
                  <li>Sisa fisik terhitung terlalu banyak saat opname rekap.</li>
                  <li>Ada bahan sisa dari sesi sebelumnya yang ikut dipakai tanpa tercatat ambil baru.</li>
                </ul>
              </div>
            </div>

            {/* 2. Nilai Nol */}
            <div class="rounded-ctl border border-line bg-muted/30 p-3 sm:p-3.5 flex flex-col gap-1.5">
              <div class="flex items-center justify-between gap-2">
                <div class="flex items-center gap-2">
                  <span class="num font-bold px-2 py-0.5 rounded text-xs text-center inline-block bg-muted text-muted-fg border border-line/60">
                    0
                  </span>
                  <span class="font-bold text-fg text-xs sm:text-sm">Nilai Nol (0)</span>
                </div>
                <span class="text-[11px] font-semibold text-success">
                  Terpakai = Terjual
                </span>
              </div>
              <div class="text-xs text-muted-fg flex flex-col gap-1 mt-0.5">
                <p class="text-fg font-medium">
                  Artinya: Stok fisik bahan yang terpakai cocok persis dengan pencatatan penjualan kasir.
                </p>
                <p class="text-[11px] sm:text-xs text-muted-fg">
                  Kondisi ideal operasional — tidak ada indikasi kebocoran bahan maupun selisih porsi.
                </p>
              </div>
            </div>

            {/* 3. Nilai Plus */}
            <div class="rounded-ctl border border-amber-200 dark:border-amber-900/60 bg-amber-50/50 dark:bg-amber-950/20 p-3 sm:p-3.5 flex flex-col gap-1.5">
              <div class="flex items-center justify-between gap-2">
                <div class="flex items-center gap-2">
                  <span class="num font-bold px-2 py-0.5 rounded text-xs text-center inline-block bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300 border border-amber-300/80 dark:border-amber-800">
                    +2
                  </span>
                  <span class="font-bold text-fg text-xs sm:text-sm">Nilai Plus (+)</span>
                </div>
                <span class="text-[11px] font-semibold text-amber-700 dark:text-amber-300">
                  Terpakai &gt; Terjual
                </span>
              </div>
              <div class="text-xs text-muted-fg flex flex-col gap-1 mt-0.5">
                <p class="text-fg font-medium">
                  Artinya: Stok fisik bahan keluar/berkurang lebih banyak daripada yang tercatat terjual di kasir.
                </p>
                <span class="text-[11px] font-semibold text-muted-fg uppercase tracking-wider mt-1">Penyebab Umum:</span>
                <ul class="list-disc list-inside space-y-0.5 text-[11px] sm:text-xs pl-1">
                  <li>Bahan terbuang (rusak, gosong, basi, tumpah, atau porsi terlalu banyak).</li>
                  <li>Digunakan untuk tester/sampel atau konsumsi internal staf tanpa dicatat.</li>
                  <li>Ada pesanan pelanggan yang belum sempat terinput / terlewat di kasir.</li>
                  <li>Sisa fisik terhitung terlalu sedikit saat opname rekap.</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
