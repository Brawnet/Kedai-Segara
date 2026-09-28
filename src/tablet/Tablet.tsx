import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import {
  ArrowCounterClockwise,
  ArrowLeft,
  ArrowRight,
  Backspace,
  CaretRight,
  CheckCircle,
  ClipboardText,
  Clock,
  DownloadSimple,
  House,
  Info,
  MagnifyingGlass,
  Moon,
  ShieldCheck,
  SignOut,
  Storefront,
  Sun,
  UploadSimple,
  X,
  LockKey,
} from '@phosphor-icons/react';
import type { ComponentChildren } from 'preact';
import { call, pesan } from '../lib/api';
import { useApp } from '../lib/app';
import { cocok, dekatTutup, inisial, katOf, nf, parseNum, r3, urutKat } from '../lib/format';
import type { AuthSession, BarangTablet, Karyawan, RekapRow, TabletData } from '../lib/types';
import { Banner, Button, Dialog, Empty, Input, PageTitle, Skeleton, SyncStatusBadge, Tag, vibrate } from '../components/ui';
import { Logo } from '../components/Logo';
type Aksi = 'ambil' | 'masuk';
type Step =
  | { s: 'home' }
  | { s: 'menu'; k: Karyawan }
  | { s: 'barang'; k: Karyawan; aksi: Aksi; kat: string | null; q: string }
  | { s: 'jumlah'; k: Karyawan; aksi: Aksi; kat: string | null; b: BarangTablet }
  | { s: 'sukses'; k: Karyawan; aksi: Aksi; kat: string | null; b: BarangTablet; j: number }
  | { s: 'rekapNama' }
  | { s: 'rekap'; k: Karyawan; cutoff: number; rows: RekapRow[] }
  | { s: 'rekapOk'; k: Karyawan; rows: RekapRow[]; sisa: number[] };

interface Last {
  id: string;
  ts: number;
  karyawan: string;
  barang: string;
  jumlah: number;
  satuan: string;
}

const IDLE_MS = 120_000;
const UNDO_MS = 60_000;

export function Tablet({
  onAdmin,
  session,
  onLogout,
}: {
  onAdmin: () => void;
  session?: AuthSession;
  onLogout?: () => void;
}) {
  const { act, busy, toast, theme, toggleTheme } = useApp();
  const [d, setD] = useState<TabletData | null>(null);
  const [err, setErr] = useState('');
  const [step, setStep] = useState<Step>({ s: 'home' });
  const [last, setLast] = useState<Last | null>(null);
  const [now, setNow] = useState(Date.now());
  const [pinPrompt, setPinPrompt] = useState<{ k: Karyawan; onOk: () => void } | null>(null);
  const lastAct = useRef(Date.now());

  const pilihKaryawan = (k: Karyawan, onOk: () => void) => {
    if (k.punyaPin) {
      setPinPrompt({ k, onOk });
    } else {
      onOk();
    }
  };

  const go = (s: Step) => {
    if (s.s === 'home') setPinPrompt(null);
    setStep(s);
    window.scrollTo(0, 0);
  };

  const load = () =>
    call('getTablet')
      .then((r) => {
        setD(r);
        setErr('');
      })
      .catch((e) => setErr(pesan(e)));

  useEffect(() => {
    load();
    const mark = () => (lastAct.current = Date.now());
    document.addEventListener('pointerdown', mark);
    document.addEventListener('keydown', mark);
    return () => {
      document.removeEventListener('pointerdown', mark);
      document.removeEventListener('keydown', mark);
    };
  }, []);

  // Detik berjalan: hitung mundur batal, kembali ke beranda saat diam.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (last && now - last.ts > UNDO_MS) setLast(null);
    if (['menu', 'barang', 'jumlah', 'rekapNama'].includes(step.s) && now - lastAct.current > IDLE_MS) {
      setPinPrompt(null);
      go({ s: 'home' });
    }
  }, [now]);

  // Muat ulang data setiap 30 detik saat di beranda.
  useEffect(() => {
    if (step.s !== 'home') return;
    const t = setInterval(() => !busy && load(), 30_000);
    return () => clearInterval(t);
  }, [step.s, busy]);

  // Layar sukses ambil: kembali ke beranda setelah 15 detik.
  useEffect(() => {
    if (step.s !== 'sukses') return;
    const t = setTimeout(() => {
      go({ s: 'home' });
      load();
    }, 15_000);
    return () => clearTimeout(t);
  }, [step]);

  const selesai = () => {
    go({ s: 'home' });
    load();
  };

  const batal = async () => {
    if (!last) return;
    const ok = await act('batalAmbil', [last.id, '']);
    if (ok) {
      setLast(null);
      toast('Pengambilan dibatalkan');
      selesai();
    }
  };

  const undoLeft = last ? Math.max(0, Math.ceil((UNDO_MS - (now - last.ts)) / 1000)) : 0;
  const undo = last && undoLeft > 0 ? { last, left: undoLeft, onUndo: batal } : null;

  const mulaiRekap = async (k: Karyawan) => {
    const r = await act('rekapDraf', []);
    if (r) go({ s: 'rekap', k, cutoff: r.cutoff, rows: r.baris });
  };

  let body: ComponentChildren;
  if (!d)
    body = err ? (
      <Gagal msg={err} onRetry={load} />
    ) : (
      <div class="flex flex-col gap-6 animate-rise">
        <div class="flex flex-col gap-2">
          <Skeleton class="h-8 w-44" />
          <Skeleton class="h-5 w-72" />
        </div>
        <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} class="h-28 w-full rounded-card" />
          ))}
        </div>
      </div>
    );
  else if (step.s === 'home')
    body = <Home d={d} undo={undo} now={now} onPick={(k) => pilihKaryawan(k, () => go({ s: 'menu', k }))} onRekap={() => go({ s: 'rekapNama' })} />;
  else if (step.s === 'menu')
    body = (
      <Menu
        k={step.k}
        d={d}
        onBack={() => go({ s: 'home' })}
        onAksi={(aksi) => go({ s: 'barang', k: step.k, aksi, kat: null, q: '' })}
        onRekap={() => mulaiRekap(step.k)}
      />
    );
  else if (step.s === 'barang')
    body = (
      <PilihBarang
        d={d}
        st={step}
        onChange={(p) => setStep({ ...step, ...p })}
        onBack={() => (step.kat ? go({ ...step, kat: null, q: '' }) : go({ s: 'menu', k: step.k }))}
        onPick={(b) => go({ s: 'jumlah', k: step.k, aksi: step.aksi, kat: step.kat, b })}
      />
    );
  else if (step.s === 'jumlah')
    body = (
      <Jumlah
        st={step}
        onBack={() => go({ s: 'barang', k: step.k, aksi: step.aksi, kat: step.kat, q: '' })}
        onDone={(j, tx) => {
          if (tx) setLast({ id: tx.id, ts: tx.ts || Date.now(), karyawan: step.k.nama, barang: step.b.nama, jumlah: j, satuan: step.b.satuan });
          go({ s: 'sukses', k: step.k, aksi: step.aksi, kat: step.kat, b: step.b, j });
        }}
      />
    );
  else if (step.s === 'sukses')
    body = (
      <Sukses
        st={step}
        undo={step.aksi === 'ambil' ? undo : null}
        onLagi={() => go({ s: 'barang', k: step.k, aksi: step.aksi, kat: step.kat, q: '' })}
        onMenu={() => go({ s: 'menu', k: step.k })}
        onSelesai={selesai}
      />
    );
  else if (step.s === 'rekapNama')
    body = (
      <section class="flex flex-col gap-6">
        <BackBar onBack={() => go({ s: 'home' })} label="Kembali" />
        <PageTitle kicker="Rekap sisa Stock Luar" title="Siapa yang merekap?" />
        <GridKaryawan list={d.karyawan} onPick={(k) => pilihKaryawan(k, () => mulaiRekap(k))} sub="Ketuk untuk input rekap" />
      </section>
    );
  else if (step.s === 'rekap')
    body = (
      <RekapForm
        st={step}
        onBack={() => go({ s: 'home' })}
        onSaved={(sisa) => {
          go({ s: 'rekapOk', k: step.k, rows: step.rows, sisa });
          load();
        }}
      />
    );
  else body = <RekapOk st={step} onHome={() => go({ s: 'home' })} />;

  return (
    <div class="min-h-dvh">
      <header class="sticky top-0 z-30 border-b border-line bg-card/95 backdrop-blur safe-top">
        <div class="mx-auto flex h-16 max-w-6xl items-center gap-2 px-3 sm:px-4 md:px-6">
          <button type="button" onClick={selesai} class="-ml-1 min-w-0 shrink rounded-ctl p-1" aria-label="Ke beranda">
            <Logo sub={step.s !== 'home' && 'k' in step ? step.k.nama : 'Tablet dapur'} />
          </button>
          <div class="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
            <SyncStatusBadge busy={busy} />
            {step.s !== 'home' && (
              <span class="hidden sm:block">
                <Button size="sm" variant="ghost" onClick={selesai}>
                  <House size={19} aria-hidden /> Beranda
                </Button>
              </span>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={toggleTheme}
              title={theme === 'dark' ? 'Mode terang' : 'Mode gelap'}
              aria-label={theme === 'dark' ? 'Mode terang' : 'Mode gelap'}
              class="size-10 p-0 sm:size-auto sm:px-3 rounded-ctl"
            >
              {theme === 'dark' ? <Sun size={19} aria-hidden /> : <Moon size={19} aria-hidden />}
            </Button>
            {session?.role !== 'tablet' && (
              <Button size="sm" variant="secondary" onClick={onAdmin} aria-label="Admin" class="h-10 px-2.5 sm:h-11 sm:px-3">
                <ShieldCheck size={19} aria-hidden /> <span class="hidden sm:inline">Admin</span>
              </Button>
            )}
            {onLogout && (
              <Button
                size="sm"
                variant="ghost"
                onClick={onLogout}
                title={`Keluar akun (${session?.email || ''})`}
                aria-label="Keluar akun"
                class="size-10 p-0 sm:size-auto sm:px-3 rounded-ctl text-danger hover:bg-danger-soft hover:text-danger"
              >
                <SignOut size={19} aria-hidden />
              </Button>
            )}
          </div>
        </div>
      </header>
      <main class="animate-rise mx-auto max-w-6xl px-4 pb-24 pt-6 md:px-6 md:pt-8" key={step.s}>
        {body}
      </main>
      <PinPromptDialog prompt={pinPrompt} onClose={() => setPinPrompt(null)} />
    </div>
  );
}

/* ================= Bagian kecil ================= */

function Gagal({ msg, onRetry }: { msg: string; onRetry: () => void }) {
  return (
    <div class="mx-auto max-w-md py-16 text-center">
      <h1 class="text-2xl font-extrabold">Tidak bisa memuat data</h1>
      <p class="mt-2 text-muted-fg">{msg}</p>
      <Button variant="primary" class="mt-6" onClick={onRetry}>
        <ArrowCounterClockwise size={20} aria-hidden /> Coba lagi
      </Button>
    </div>
  );
}

function BackBar({ onBack, label }: { onBack: () => void; label: string }) {
  return (
    <div>
      <Button variant="ghost" onClick={onBack} class="-ml-3">
        <ArrowLeft size={20} aria-hidden /> {label}
      </Button>
    </div>
  );
}

type Undo = { last: Last; left: number; onUndo: () => void } | null;

function UndoBar({ undo }: { undo: NonNullable<Undo> }) {
  const { last, left, onUndo } = undo;
  const handleUndo = () => {
    vibrate(15);
    onUndo();
  };
  const progressPct = Math.min(100, Math.max(0, (left / (UNDO_MS / 1000)) * 100));
  return (
    <div class="relative overflow-hidden rounded-card border-2 border-line bg-card p-3 shadow-md sm:p-4 animate-rise">
      <div class="flex flex-wrap items-center gap-3">
        <CheckCircle size={24} weight="fill" class="shrink-0 text-success" aria-hidden />
        <p class="min-w-0 flex-1 text-[15px] sm:text-base">
          <strong>{last.karyawan}</strong> ambil{' '}
          <span class="num font-bold text-primary">
            {nf(last.jumlah)} {last.satuan}
          </span>{' '}
          {last.barang}
        </p>
        <Button variant="danger-ghost" guard onClick={handleUndo} class="border-danger/30 text-danger hover:bg-danger-soft">
          <ArrowCounterClockwise size={20} aria-hidden />
          Batalkan <span class="num font-bold">({left}s)</span>
        </Button>
      </div>
      <div class="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          class="h-full bg-primary transition-all duration-1000 ease-linear rounded-full"
          style={{ width: `${progressPct}%` }}
          aria-hidden
        />
      </div>
    </div>
  );
}
const AVATAR_TONES = [
  'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 border-emerald-500/30',
  'bg-amber-500/15 text-amber-900 dark:text-amber-300 border-amber-500/30',
  'bg-orange-500/15 text-orange-900 dark:text-orange-300 border-orange-500/30',
  'bg-lime-500/15 text-lime-900 dark:text-lime-300 border-lime-500/30',
  'bg-sky-500/15 text-sky-800 dark:text-sky-300 border-sky-500/30',
  'bg-stone-500/15 text-stone-800 dark:text-stone-300 border-stone-500/30',
];

function getAvatarTone(nama: string) {
  let hash = 0;
  for (let i = 0; i < nama.length; i++) hash = (hash << 5) - hash + nama.charCodeAt(i);
  return AVATAR_TONES[Math.abs(hash) % AVATAR_TONES.length];
}

function Avatar({ nama, class: c = '' }: { nama: string; class?: string }) {
  const tone = getAvatarTone(nama);
  return (
    <span
      class={`grid size-14 shrink-0 place-items-center rounded-full border text-lg font-extrabold tracking-tight ${tone} ${c}`}
      aria-hidden
    >
      {inisial(nama)}
    </span>
  );
}

function StaffTile({
  k,
  onClick,
  disabled,
  sub = 'Ketuk untuk mulai',
}: {
  k: Karyawan;
  onClick: () => void;
  disabled?: boolean;
  sub?: string;
}) {
  const tone = getAvatarTone(k.nama);
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      class="group relative flex min-h-[84px] w-full items-center gap-4 rounded-card border border-line bg-card p-4 text-left shadow-sm transition-all duration-150 hover:border-primary hover:bg-primary-soft/30 hover:shadow-md active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:opacity-60 cursor-pointer"
    >
      <span
        class={`grid size-14 shrink-0 place-items-center rounded-full border text-lg font-extrabold tracking-tight transition-transform duration-150 group-hover:scale-105 ${tone}`}
        aria-hidden
      >
        {inisial(k.nama)}
      </span>
      <div class="min-w-0 flex-1">
        <span class="block truncate text-lg font-bold text-fg transition-colors group-hover:text-primary">
          {k.nama}
        </span>
        <span class="mt-0.5 flex items-center gap-1.5 text-xs font-medium text-muted-fg">
          <span class="size-2 rounded-full bg-success" />
          <span>Staf Dapur • {sub}</span>
          {k.punyaPin && (
            <span class="inline-flex items-center gap-1 rounded bg-primary-soft px-1.5 py-0.5 text-[10px] font-bold text-primary">
              <LockKey size={11} weight="bold" aria-hidden /> PIN
            </span>
          )}
        </span>
      </div>
      <span
        class="grid size-9 shrink-0 place-items-center rounded-full bg-muted text-muted-fg transition-all duration-150 group-hover:bg-primary group-hover:text-white"
        aria-hidden
      >
        <CaretRight size={20} weight="bold" />
      </span>
    </button>
  );
}

function GridKaryawan({
  list,
  onPick,
  sub,
}: {
  list: Karyawan[];
  onPick: (k: Karyawan) => void;
  sub?: string;
}) {
  const { busy } = useApp();
  if (!list.length) return <Empty>Belum ada karyawan. Tambahkan lewat menu Admin.</Empty>;
  return (
    <div class="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
      {list.map((k) => (
        <StaffTile key={k.id} k={k} onClick={() => onPick(k)} disabled={busy} sub={sub} />
      ))}
    </div>
  );
}

function Tile({ onClick, children, class: c = '' }: { onClick: () => void; children: ComponentChildren; class?: string }) {
  const { busy } = useApp();
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      class={`flex min-h-20 w-full items-center gap-4 rounded-card border border-line bg-card p-4 text-left shadow-sm transition-colors duration-150 hover:border-primary hover:bg-primary-soft active:bg-primary-soft disabled:opacity-60 cursor-pointer ${c}`}
    >
      {children}
    </button>
  );
}

/* ================= Beranda ================= */

function Home({
  d,
  undo,
  onPick,
  onRekap,
  now,
}: {
  d: TabletData;
  undo: Undo;
  onPick: (k: Karyawan) => void;
  onRekap: () => void;
  now: number;
}) {
  const st = d.status;
  const isDekatTutup = dekatTutup(d.jamTutup);

  const dateObj = new Date(now);
  const jam = dateObj.getHours();

  let salam = 'Selamat datang';
  if (jam >= 4 && jam < 11) salam = 'Selamat pagi';
  else if (jam >= 11 && jam < 15) salam = 'Selamat siang';
  else if (jam >= 15 && jam < 18) salam = 'Selamat sore';
  else salam = 'Selamat malam';

  const tglStr = new Intl.DateTimeFormat('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(dateObj);

  const pad = (n: number) => String(n).padStart(2, '0');
  const waktuStr = `${pad(dateObj.getHours())}:${pad(dateObj.getMinutes())}:${pad(dateObj.getSeconds())}`;

  return (
    <section class="flex flex-col gap-6">
      {st.lewatHari ? (
        <Banner
          key={`tablet-danger-${st.belumRekap}`}
          tone="danger"
          action={
            <Button variant="danger" size="md" onClick={onRekap}>
              <ClipboardText size={18} weight="bold" aria-hidden />
              Rekap sekarang
            </Button>
          }
        >
          Ada pengambilan dari hari sebelumnya yang belum direkap. Harap selesaikan rekap sisa dapur.
        </Banner>
      ) : st.belumRekap > 0 && isDekatTutup ? (
        <Banner
          key={`tablet-warning-${st.belumRekap}`}
          tone="warning"
          action={
            <Button variant="primary" size="md" onClick={onRekap}>
              <ClipboardText size={18} weight="bold" aria-hidden />
              Rekap sekarang
            </Button>
          }
        >
          Waktunya rekap sisa Stock Luar dapur (jam tutup {d.jamTutup}).
        </Banner>
      ) : null}

      {undo && <UndoBar undo={undo} />}

      <div class="grid grid-cols-1 gap-5 lg:grid-cols-12 lg:gap-6 lg:items-start">
        {/* Kolom Kiri: Pemilihan Staf */}
        <div class="flex flex-col gap-4 lg:col-span-7 xl:col-span-8">
          <div class="rounded-card border border-line bg-card p-5 sm:p-6 shadow-sm">
            <div class="border-b border-line pb-4">
              <div class="flex items-center justify-between gap-2">
                <p class="text-[12px] font-bold uppercase tracking-wider text-primary">KEDAI SEGARA • TABLET DAPUR</p>
                <span class="inline-flex items-center gap-1.5 rounded-full bg-success-soft px-2.5 py-0.5 text-xs font-bold text-success">
                  <span class="size-1.5 rounded-full bg-success animate-pulse" aria-hidden />
                  {d.karyawan.length} Staf Aktif
                </span>
              </div>
              <h1 class="mt-1 text-2xl font-extrabold tracking-tight text-fg sm:text-3xl">
                {`${salam}, siapa yang pakai tablet?`}
              </h1>
              <p class="mt-2 text-sm text-muted-fg">
                Sentuh nama Anda untuk mulai mencatat pengambilan bahan dari gudang, barang baru datang, atau rekap harian dapur.
              </p>
            </div>

            <div class="mt-4">
              <GridKaryawan list={d.karyawan} onPick={onPick} />
            </div>
          </div>

          {/* Tips Info Bar */}
          <div class="flex items-start gap-3 rounded-card border border-line bg-muted/50 p-3.5 text-sm text-muted-fg">
            <Info size={20} class="mt-0.5 shrink-0 text-primary" aria-hidden />
            <div class="min-w-0 flex-1 leading-relaxed">
              <span class="font-semibold text-fg">Salah catat barang?</span> Setiap transaksi pengambilan dapat dibatalkan langsung dalam waktu 60 detik melalui tombol batalkan yang muncul di layar.
            </div>
          </div>
        </div>

        {/* Kolom Kanan: Status Operasional & Panduan */}
        <aside class="flex flex-col gap-4 lg:col-span-5 xl:col-span-4">
          {/* Card Status Operasional */}
          <div class="rounded-card border border-line bg-card p-4.5 sm:p-5 shadow-sm">
            <div class="flex items-center justify-between border-b border-line pb-3">
              <div class="flex items-center gap-2">
                <span class="grid size-8 place-items-center rounded-lg bg-primary-soft text-primary">
                  <Clock size={19} weight="bold" aria-hidden />
                </span>
                <span class="font-bold text-fg">Status Operasional</span>
              </div>
              <span class="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold text-muted-fg">
                Tutup {d.jamTutup}
              </span>
            </div>

            {/* Jam & Tanggal Digital */}
            <div class="mt-3.5 rounded-xl bg-muted/50 p-3.5 border border-line/60">
              <div class="text-[11px] font-semibold uppercase tracking-wider text-muted-fg">{tglStr}</div>
              <div class="num mt-0.5 text-2xl sm:text-3xl font-extrabold tracking-tight text-fg font-mono">
                {waktuStr} <span class="text-xs font-bold text-muted-fg">WIB</span>
              </div>
            </div>

            {/* Quick Metrics */}
            <div class="mt-3.5 grid grid-cols-2 gap-2.5">
              <div class="rounded-xl border border-line p-2.5 sm:p-3">
                <span class="block text-[11px] font-semibold text-muted-fg">Rekap Dapur</span>
                <div class="mt-1 flex items-center gap-1.5">
                  {st.lewatHari ? (
                    <Tag tone="danger">Tertunda</Tag>
                  ) : st.belumRekap > 0 ? (
                    <Tag tone="warning">{st.belumRekap} Ambil</Tag>
                  ) : (
                    <Tag tone="success">Terekap</Tag>
                  )}
                </div>
                <span class="mt-1 block text-[11px] text-muted-fg">
                  {st.lewatHari ? 'Perlu rekap kemarin' : st.belumRekap > 0 ? 'Menunggu closing' : 'Semua aman'}
                </span>
              </div>

              <div class="rounded-xl border border-line p-2.5 sm:p-3">
                <span class="block text-[11px] font-semibold text-muted-fg">Bahan di Dapur</span>
                <div class="num mt-1 text-lg sm:text-xl font-extrabold text-fg">
                  {st.barangLuar} <span class="text-xs font-normal text-muted-fg">jenis</span>
                </div>
                <span class="mt-1 block text-[11px] text-muted-fg">Stock luar aktif</span>
              </div>
            </div>

            {/* Tombol Pintas Rekap Dapur */}
            <div class="mt-3.5 pt-3 border-t border-line">
              <Button
                variant={st.lewatHari ? 'danger' : 'secondary'}
                size="md"
                class="w-full justify-center"
                onClick={onRekap}
              >
                <ClipboardText size={18} weight="bold" aria-hidden />
                {st.lewatHari ? 'Rekap Kemarin Sekarang' : 'Rekap Sisa Dapur'}
              </Button>
            </div>
          </div>

          {/* Card Alur Kerja Tablet */}
          <div class="rounded-card border border-line bg-card p-4.5 sm:p-5 shadow-sm">
            <div class="flex items-center gap-2 border-b border-line pb-3">
              <span class="grid size-8 place-items-center rounded-lg bg-muted text-fg">
                <Storefront size={19} weight="bold" aria-hidden />
              </span>
              <div>
                <h3 class="text-sm font-bold text-fg">Alur Kerja Tablet</h3>
                <p class="text-[11px] text-muted-fg">3 tindakan operasional dapur</p>
              </div>
            </div>

            <ol class="mt-3 space-y-2.5">
              <li class="flex items-start gap-2.5">
                <span class="grid size-7 shrink-0 place-items-center rounded-full bg-primary-soft text-xs font-bold text-primary">
                  <UploadSimple size={15} weight="bold" aria-hidden />
                </span>
                <div class="min-w-0 flex-1">
                  <strong class="block text-xs sm:text-sm font-bold text-fg">1. Ambil dari Gudang</strong>
                  <p class="text-[11px] sm:text-xs text-muted-fg leading-snug">
                    Catat saat mengambil stok dari gudang untuk stok meja dapur.
                  </p>
                </div>
              </li>

              <li class="flex items-start gap-2.5">
                <span class="grid size-7 shrink-0 place-items-center rounded-full bg-success-soft text-xs font-bold text-success">
                  <DownloadSimple size={15} weight="bold" aria-hidden />
                </span>
                <div class="min-w-0 flex-1">
                  <strong class="block text-xs sm:text-sm font-bold text-fg">2. Masukkan ke Gudang</strong>
                  <p class="text-[11px] sm:text-xs text-muted-fg leading-snug">
                    Catat kiriman bahan baru yang datang langsung dari supplier.
                  </p>
                </div>
              </li>

              <li class="flex items-start gap-2.5">
                <span class="grid size-7 shrink-0 place-items-center rounded-full bg-warning-soft text-xs font-bold text-warning">
                  <ClipboardText size={15} weight="bold" aria-hidden />
                </span>
                <div class="min-w-0 flex-1">
                  <strong class="block text-xs sm:text-sm font-bold text-fg">3. Rekap Sisa Closing</strong>
                  <p class="text-[11px] sm:text-xs text-muted-fg leading-snug">
                    Hitung fisik sisa bahan di meja kerja sebelum outlet tutup.
                  </p>
                </div>
              </li>
            </ol>
          </div>
        </aside>
      </div>
    </section>
  );
}

/* ================= Menu ================= */

function Menu({ k, d, onBack, onAksi, onRekap }: { k: Karyawan; d: TabletData; onBack: () => void; onAksi: (a: Aksi) => void; onRekap: () => void }) {
  const st = d.status;
  const items = [
    { key: 'ambil', icon: UploadSimple, title: 'Ambil dari gudang', sub: 'Catat barang yang dibawa ke dapur', tone: 'bg-primary text-white', onClick: () => onAksi('ambil') },
    { key: 'masuk', icon: DownloadSimple, title: 'Masukkan ke gudang', sub: 'Catat barang yang baru datang', tone: 'bg-success text-white', onClick: () => onAksi('masuk') },
    {
      key: 'rekap',
      icon: ClipboardText,
      title: 'Rekap sisa dapur',
      sub: st.belumRekap ? `Closing malam · ${st.belumRekap} pengambilan belum direkap` : 'Closing malam',
      tone: st.lewatHari ? 'bg-danger text-white' : 'bg-warning text-white',
      onClick: onRekap,
    },
  ];
  return (
    <section class="flex flex-col gap-6">
      <BackBar onBack={onBack} label="Ganti nama" />
      <div class="flex items-center gap-4">
        <Avatar nama={k.nama} />
        <PageTitle kicker={k.nama} title="Mau apa?" />
      </div>
      <div class="grid grid-cols-1 gap-3 md:grid-cols-3">
        {items.map((it) => (
          <Tile key={it.key} onClick={it.onClick} class="md:min-h-44 md:flex-col md:items-start md:justify-between">
            <span class={`grid size-14 shrink-0 place-items-center rounded-card ${it.tone}`}>
              <it.icon size={28} weight="bold" aria-hidden />
            </span>
            <span class="min-w-0 flex-1 md:flex-none">
              <span class="block text-lg font-bold leading-snug">{it.title}</span>
              <span class="block text-sm text-muted-fg">{it.sub}</span>
            </span>
            <CaretRight size={22} class="shrink-0 text-muted-fg md:hidden" aria-hidden />
          </Tile>
        ))}
      </div>
    </section>
  );
}

/* ================= Pilih barang ================= */

function PilihBarang({
  d,
  st,
  onChange,
  onBack,
  onPick,
}: {
  d: TabletData;
  st: Extract<Step, { s: 'barang' }>;
  onChange: (p: { kat?: string | null; q?: string }) => void;
  onBack: () => void;
  onPick: (b: BarangTablet) => void;
}) {
  const masuk = st.aksi === 'masuk';
  const kats = useMemo(() => urutKat(d.barang, d.urutan), [d]);
  const q = st.q.trim();
  const list = useMemo(() => d.barang.filter((b) => (!st.kat || katOf(b) === st.kat) && cocok(b, q)), [d, st.kat, q]);
  const showKat = !st.kat && !q;

  return (
    <section class="flex flex-col gap-5">
      <BackBar onBack={onBack} label={st.kat ? 'Semua kategori' : 'Menu'} />
      <PageTitle
        kicker={`${st.k.nama} · ${masuk ? 'Masukkan ke gudang' : 'Ambil dari gudang'}`}
        title={st.kat ?? (masuk ? 'Barang apa yang datang?' : 'Ambil barang apa?')}
        sub={showKat ? 'Pilih kategori, atau langsung cari nama/kode barang.' : undefined}
      />
      <div class="sticky top-16 z-20 -mx-4 bg-bg/95 px-4 py-2 backdrop-blur md:-mx-6 md:px-6">
        <label class="relative block">
          <span class="sr-only">Cari barang</span>
          <MagnifyingGlass size={20} class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-fg" aria-hidden />
          <Input
            type="search"
            value={st.q}
            onInput={(e) => onChange({ q: e.currentTarget.value })}
            placeholder={st.kat ? 'Cari di kategori ini…' : 'Cari nama atau kode barang…'}
            class="min-h-12 pl-10 pr-11"
            autocomplete="off"
          />
          {st.q && (
            <button
              type="button"
              onClick={() => onChange({ q: '' })}
              class="absolute right-1 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-ctl text-muted-fg hover:bg-muted"
              aria-label="Hapus pencarian"
            >
              <X size={18} aria-hidden />
            </button>
          )}
        </label>
      </div>

      {!showKat && (
        <div class="flex flex-col gap-2 -mt-2">
          <div class="flex items-center gap-2 overflow-x-auto pb-1 text-sm no-scrollbar">
            <button
              type="button"
              onClick={() => onChange({ kat: null })}
              class={`min-h-11 inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 font-semibold transition-colors duration-150 cursor-pointer ${
                !st.kat
                  ? 'bg-primary text-white shadow-sm'
                  : 'border border-line bg-card text-muted-fg hover:border-line-strong hover:bg-muted'
              }`}
            >
              Semua ({d.barang.length})
            </button>
            {kats.map((c) => {
              const count = d.barang.filter((b) => katOf(b) === c).length;
              const active = st.kat === c;
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => onChange({ kat: c })}
                  class={`min-h-11 inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 font-semibold transition-colors duration-150 cursor-pointer ${
                    active
                      ? 'bg-primary text-white shadow-sm'
                      : 'border border-line bg-card text-muted-fg hover:border-line-strong hover:bg-muted'
                  }`}
                >
                  <span>{c}</span>
                  <span class={`rounded-full px-1.5 py-0.2 text-[11px] font-bold ${active ? 'bg-white/20 text-white' : 'bg-muted text-muted-fg'}`}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
          {q && (
            <p class="text-xs font-semibold text-muted-fg px-1" aria-live="polite">
              Ditemukan {list.length} barang untuk “{q}”
            </p>
          )}
        </div>
      )}

      {showKat ? (
        kats.length ? (
          <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {kats.map((c) => (
              <Tile key={c} onClick={() => onChange({ kat: c, q: '' })} class="border-l-4 border-l-primary">
                <span class="min-w-0 flex-1">
                  <span class="block font-bold leading-snug">{c}</span>
                  <span class="block text-sm text-muted-fg">{d.barang.filter((b) => katOf(b) === c).length} barang</span>
                </span>
                <CaretRight size={22} class="shrink-0 text-muted-fg" aria-hidden />
              </Tile>
            ))}
          </div>
        ) : (
          <Empty>Belum ada barang. Tambahkan lewat menu Admin.</Empty>
        )
      ) : list.length ? (
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((b) => (
            <Tile key={b.id} onClick={() => onPick(b)}>
              <span class="min-w-0 flex-1">
                <span class="block font-bold leading-snug">{b.nama}</span>
                <span class="mt-1 flex flex-wrap items-center gap-1.5 text-sm text-muted-fg">
                  {!st.kat && <span class="truncate">{katOf(b)}</span>}
                  {b.alur === 'LUAR' ? (
                    <span
                      class={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${
                        (b.stok_luar ?? 0) > 0
                          ? 'bg-primary-soft text-primary font-bold'
                          : 'bg-muted text-muted-fg'
                      }`}
                    >
                      Di luar: <strong class="num">{(b.stok_luar ?? 0) > 0 ? nf(b.stok_luar) : '0'}</strong> {b.satuan}
                    </span>
                  ) : (
                    !masuk && <Tag tone="warning">langsung habis</Tag>
                  )}
                </span>
              </span>
              <CaretRight size={22} class="shrink-0 text-muted-fg" aria-hidden />
            </Tile>
          ))}
        </div>
      ) : (
        <Empty>Tidak ada barang yang cocok dengan “{q}”.</Empty>
      )}
    </section>
  );
}

/* ================= Jumlah (numpad) ================= */

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', ',', '0', 'del'] as const;

function Jumlah({
  st,
  onBack,
  onDone,
}: {
  st: Extract<Step, { s: 'jumlah' }>;
  onBack: () => void;
  onDone: (j: number, tx?: { id: string; ts?: number }) => void;
}) {
  const { act, busy } = useApp();
  const [val, setVal] = useState('');
  const [sup, setSup] = useState('');
  const masuk = st.aksi === 'masuk';
  const b = st.b;
  const j = parseNum(val || '0');
  const ok = j > 0;

  const press = (k: (typeof KEYS)[number]) => {
    vibrate(10);
    setVal((v) => {
      if (k === 'del') return v.slice(0, -1);
      if (k === ',') return v.includes(',') ? v : (v || '0') + ',';
      if (v === '0') v = '';
      return v.length < 8 ? v + k : v;
    });
  };

  const tambahCepat = (delta: number) => {
    vibrate(10);
    const curr = parseNum(val || '0');
    const next = Math.max(0, r3(curr + delta));
    setVal(next === 0 ? '' : String(next).replace('.', ','));
  };
  // Keyboard fisik juga bisa dipakai (kecuali saat mengetik supplier).
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return;
      if (/^[0-9]$/.test(e.key)) press(e.key as (typeof KEYS)[number]);
      else if (e.key === ',' || e.key === '.') press(',');
      else if (e.key === 'Backspace') press('del');
      else if (e.key === 'Enter' && ok && !busy) kirim();
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [ok, busy, j, sup, masuk, st, b]);

  const reqIdRef = useRef(Date.now() + '-' + Math.random().toString(36).slice(2, 8));

  const kirim = async () => {
    if (!ok || busy) return;
    const n = r3(j);
    const reqId = reqIdRef.current;
    if (masuk) {
      if (await act('masukKaryawan', [st.k.id, b.id, n, sup.trim(), reqId])) onDone(n);
    } else {
      const r = await act('ambil', [st.k.id, b.id, n, reqId]);
      if (r) onDone(n, r.tx);
    }
  };

  const ket = masuk ? 'Ditambahkan ke stok gudang' : 'Dibawa ke dapur, direkap saat closing';

  return (
    <section class="flex flex-col gap-5">
      <BackBar onBack={onBack} label="Pilih barang lain" />
      <div class="grid gap-6 md:grid-cols-[1fr_minmax(300px,380px)] md:items-start">
        <div class="flex flex-col gap-5">
          <PageTitle kicker={`${st.k.nama} · ${masuk ? 'Masukkan ke gudang' : 'Ambil dari gudang'}`} title={b.nama} sub={b.catatan || undefined} />
          {!masuk && (
            <div class="flex items-center justify-between rounded-card border border-primary/20 bg-primary-soft/50 px-4 py-2.5 text-sm">
              <span class="font-medium text-muted-fg">Tersedia di dapur saat ini:</span>
              <span class="num text-base font-extrabold text-primary">
                {nf(b.stok_luar ?? 0)} {b.satuan}
              </span>
            </div>
          )}
          <div
            class="rounded-card border-2 border-line bg-card px-5 py-4"
            aria-live="polite"
            aria-label={`Jumlah ${val || '0'} ${b.satuan}`}
          >
            <p class="text-sm font-semibold text-muted-fg">Jumlah</p>
            <p class="num flex items-baseline gap-2 break-all">
              <span class={`text-5xl font-extrabold tracking-tight md:text-6xl ${ok ? 'text-fg' : 'text-muted-fg'}`}>{val || '0'}</span>
              <span class="text-xl font-bold text-muted-fg">{b.satuan}</span>
            </p>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <span class="text-xs font-semibold text-muted-fg">Tambah cepat:</span>
            {[1, 2, 5, 10, 20].map((step) => (
              <button
                key={step}
                type="button"
                onClick={() => tambahCepat(step)}
                class="min-h-11 min-w-12 rounded-ctl border border-line bg-card px-2.5 py-1 text-sm font-bold text-fg hover:border-primary hover:bg-primary-soft active:bg-primary-soft transition-colors select-none cursor-pointer"
              >
                +{step}
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                vibrate(10);
                setVal('');
              }}
              disabled={!val}
              class="min-h-10 rounded-ctl border border-line bg-card px-3 py-1 text-xs font-bold text-muted-fg hover:text-danger hover:border-danger hover:bg-danger-soft transition-colors select-none disabled:opacity-40 cursor-pointer"
            >
              Reset
            </button>
          </div>
          {masuk && (
            <label class="flex flex-col gap-1.5">
              <span class="text-sm font-semibold">Dari supplier (opsional)</span>
              <Input value={sup} onInput={(e) => setSup(e.currentTarget.value)} placeholder="mis. Toko Makmur" autocomplete="off" />
            </label>
          )}
        </div>

        <div class="flex flex-col gap-3">
          <div class="grid grid-cols-3 gap-2" role="group" aria-label="Papan angka">
            {KEYS.map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => press(k)}
                class="num grid h-16 place-items-center rounded-card border border-line bg-card text-2xl font-bold shadow-sm transition-colors duration-100 hover:bg-muted active:bg-primary-soft md:h-[4.5rem]"
                aria-label={k === 'del' ? 'Hapus satu angka' : k === ',' ? 'Koma' : k}
              >
                {k === 'del' ? <Backspace size={28} aria-hidden /> : k}
              </button>
            ))}
          </div>
          <Button variant={masuk ? 'success' : 'primary'} size="lg" guard disabled={!ok || busy} onClick={kirim} class="min-h-16 flex-col gap-0 text-lg">
            <span>
              {masuk ? 'Masukkan' : 'Ambil'} {ok && <span class="num">{nf(j)} {b.satuan}</span>}
            </span>
            <span class="text-[13px] font-medium opacity-90">{ket}</span>
          </Button>
        </div>
      </div>
    </section>
  );
}

/* ================= Sukses ================= */

function Sukses({
  st,
  undo,
  onLagi,
  onMenu,
  onSelesai,
}: {
  st: Extract<Step, { s: 'sukses' }>;
  undo: Undo;
  onLagi: () => void;
  onMenu: () => void;
  onSelesai: () => void;
}) {
  const m = st.aksi === 'masuk';
  return (
    <section class="mx-auto flex max-w-2xl flex-col items-center gap-6 py-6 text-center">
      <span class="grid size-20 place-items-center rounded-full bg-success-soft text-success">
        <CheckCircle size={48} weight="fill" aria-hidden />
      </span>
      <div>
        <p class="text-[13px] font-bold uppercase tracking-wide text-success">Tercatat</p>
        <h1 class="mt-1 text-2xl font-extrabold leading-tight text-balance md:text-3xl">
          {st.k.nama} {m ? 'memasukkan' : 'ambil'}{' '}
          <span class="num">
            {nf(st.j)} {st.b.satuan}
          </span>{' '}
          {st.b.nama}
          {m ? ' ke gudang' : ''}
        </h1>
      </div>
      {undo && (
        <div class="w-full text-left">
          <UndoBar undo={undo} />
        </div>
      )}
      <div class="grid w-full gap-3 sm:grid-cols-3">
        <Button variant="primary" size="lg" onClick={onLagi}>
          <ArrowRight size={20} aria-hidden /> {m ? 'Masukkan lagi' : 'Ambil lagi'}
        </Button>
        <Button size="lg" onClick={onMenu}>
          Menu
        </Button>
        <Button size="lg" onClick={onSelesai}>
          <SignOut size={20} aria-hidden /> Selesai
        </Button>
      </div>
      <p class="text-sm text-muted-fg">Kembali ke beranda otomatis dalam 15 detik.</p>
    </section>
  );
}

/* ================= Rekap ================= */

function RekapForm({ st, onBack, onSaved }: { st: Extract<Step, { s: 'rekap' }>; onBack: () => void; onSaved: (sisa: number[]) => void }) {
  const { act } = useApp();
  const [vals, setVals] = useState<string[]>(() => st.rows.map(() => ''));
  const [notes, setNotes] = useState<string[]>(() => st.rows.map(() => ''));
  const [tried, setTried] = useState(false);

  const cek = (i: number) => {
    const v = vals[i]!;
    if (v === '') return 'kosong';
    const s = parseNum(v);
    if (isNaN(s) || s < 0 || s > st.rows[i]!.maks + 1e-9) return 'salah';
    return 'ok';
  };
  const terisi = st.rows.filter((_, i) => cek(i) === 'ok').length;
  const semua = terisi === st.rows.length;

  const set = (i: number, v: string) => setVals((a) => a.map((x, j) => (j === i ? v : x)));

  const simpan = async () => {
    setTried(true);
    if (!semua) {
      const first = st.rows.findIndex((_, i) => cek(i) !== 'ok');
      document.getElementById('sisa-' + first)?.focus();
      return;
    }
    const sisa = vals.map((v) => parseNum(v));
    const reqId = st.cutoff + '-' + st.k.id;
    const r = await act('simpanRekap', [st.cutoff, st.k.id, st.rows.map((r, i) => ({ barang_id: r.barang_id, sisa: sisa[i]!, catatan: notes[i]! })), reqId]);
    if (r) onSaved(sisa);
  };

  if (!st.rows.length)
    return (
      <section class="flex flex-col gap-6">
        <BackBar onBack={onBack} label="Kembali" />
        <PageTitle kicker="Rekap" title="Tidak ada barang di luar" sub="Tidak ada yang perlu direkap saat ini." />
      </section>
    );

  return (
    <section class="flex flex-col gap-5">
      <BackBar onBack={onBack} label="Batal" />
      <PageTitle
        kicker={`${st.k.nama} · Rekap`}
        title="Hitung sisa di area kerja"
        sub="Isi jumlah yang masih tersisa di luar."
      />
      <ul class="flex flex-col gap-3">
        {st.rows.map((r, i) => {
          const c = cek(i);
          const bad = c === 'salah' || (tried && c === 'kosong');
          return (
            <li key={r.barang_id} class={`rounded-card border bg-card p-4 shadow-sm ${bad ? 'border-danger' : 'border-line'}`}>
              <div class="grid gap-3 sm:grid-cols-[minmax(0,1fr)_200px] sm:items-center">
                <div class="min-w-0">
                  <p class="font-bold">{r.nama}</p>
                  <p class="num text-sm text-muted-fg">
                    Di luar <strong class="text-fg">{nf(r.maks)} {r.satuan}</strong> · awal {nf(r.saldo_awal)} + diambil {nf(r.diambil)}
                  </p>
                </div>
                <div class="flex flex-col gap-1.5">
                  <label for={'sisa-' + i} class="text-sm font-semibold">
                    Sisa ({r.satuan})
                  </label>
                  <Input
                    id={'sisa-' + i}
                    type="text"
                    inputmode="decimal"
                    autocomplete="off"
                    value={vals[i]}
                    onInput={(e) => set(i, e.currentTarget.value)}
                    aria-invalid={bad}
                    aria-describedby={bad ? 'err-' + i : undefined}
                    class="num min-h-12 text-lg font-bold"
                  />
                  {bad && (
                    <p id={'err-' + i} class="text-[13px] font-semibold text-danger">
                      {c === 'kosong' ? 'Belum diisi' : `Isi 0 sampai ${nf(r.maks)}`}
                    </p>
                  )}
                </div>
              </div>
              <label class="mt-3 block">
                <span class="sr-only">Catatan untuk {r.nama}</span>
                <Input
                  value={notes[i]}
                  onInput={(e) => {
                    const v = e.currentTarget.value;
                    setNotes((a) => a.map((x, j) => (j === i ? v : x)));
                  }}
                  placeholder="Catatan (opsional)"
                  class="text-sm"
                />
              </label>
            </li>
          );
        })}
      </ul>
      <div class="safe-bottom sticky bottom-0 z-20 -mx-4 border-t border-line bg-card/95 px-4 py-3 backdrop-blur md:-mx-6 md:px-6">
        <div class="flex items-center gap-3">
          <p class="mr-auto text-sm font-semibold" aria-live="polite">
            <span class="num">{terisi}</span> dari <span class="num">{st.rows.length}</span> barang terisi
          </p>
          <Button variant="primary" size="lg" guard onClick={simpan}>
            <CheckCircle size={20} aria-hidden /> Simpan rekap
          </Button>
        </div>
      </div>
    </section>
  );
}

function RekapOk({ st, onHome }: { st: Extract<Step, { s: 'rekapOk' }>; onHome: () => void }) {
  return (
    <section class="mx-auto flex w-full max-w-xl flex-col gap-6 py-2">
      <div class="flex items-center gap-4">
        <span class="grid size-12 sm:size-14 shrink-0 place-items-center rounded-full bg-success-soft text-success shadow-2xs">
          <CheckCircle size={32} weight="fill" aria-hidden />
        </span>
        <PageTitle kicker={`Rekap tersimpan · ${st.k.nama}`} title="Sisa dapur hari ini" />
      </div>

      <div class="overflow-hidden rounded-card border border-line bg-card shadow-sm">
        <div class="flex items-center justify-between border-b border-line bg-muted/60 px-4 py-2.5 sm:px-5 text-xs font-bold uppercase tracking-wider text-muted-fg">
          <span>Barang</span>
          <span>Sisa</span>
        </div>
        <ul class="divide-y divide-line">
          {st.rows.map((r, i) => (
            <li
              key={r.barang_id}
              class="flex items-center justify-between gap-4 px-4 py-3 sm:px-5 transition-colors hover:bg-muted/40"
            >
              <span class="font-medium text-fg text-sm sm:text-base leading-snug">{r.nama}</span>
              <span class="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-line/70 bg-muted/60 px-2.5 py-1 text-sm font-bold text-fg num">
                <span class="text-primary font-bold">{nf(st.sisa[i]!)}</span>
                <span class="text-xs font-medium text-muted-fg">{r.satuan}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <Button variant="primary" size="lg" onClick={onHome} class="w-full sm:w-auto">
          <House size={20} aria-hidden /> Kembali ke beranda
        </Button>
      </div>
    </section>
  );
}

/* ================= Dialog PIN Karyawan ================= */

function PinPromptDialog({
  prompt,
  onClose,
}: {
  prompt: { k: Karyawan; onOk: () => void } | null;
  onClose: () => void;
}) {
  const { act } = useApp();
  const [pin, setPin] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setPin('');
    setErr('');
    setBusy(false);
  }, [prompt]);

  if (!prompt) return null;
  const k = prompt.k;
  const pinLen = k.pinLen || 4;

  const verifikasi = async (val: string) => {
    if (!val || busy) return;
    setBusy(true);
    setErr('');
    try {
      const ok = await act('verifikasiPinKaryawan', [k.id, val]);
      if (ok) {
        const onOk = prompt.onOk;
        onClose();
        onOk();
      } else {
        vibrate([40, 60, 40]);
        setErr('PIN salah, coba lagi');
        setPin('');
      }
    } catch (e: unknown) {
      vibrate([40, 60, 40]);
      setErr(pesan(e) || 'PIN salah');
      setPin('');
    } finally {
      setBusy(false);
    }
  };

  const tekan = (key: string) => {
    if (busy) return;
    vibrate(10);
    if (key === 'del') {
      setPin((p) => p.slice(0, -1));
      if (err) setErr('');
    } else if (key === 'c') {
      setPin('');
      if (err) setErr('');
    } else if (/^\d$/.test(key)) {
      if (pin.length < pinLen) {
        const next = pin + key;
        setPin(next);
        if (err) setErr('');
        if (next.length === pinLen) {
          verifikasi(next);
        }
      }
    }
  };

  return (
    <Dialog
      open={!!prompt}
      onClose={onClose}
      title="Verifikasi PIN Staf"
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            Batal
          </Button>
          <Button
            variant="primary"
            guard
            loading={busy}
            disabled={pin.length < pinLen || busy}
            onClick={() => verifikasi(pin)}
          >
            Masuk
          </Button>
        </>
      }
    >
      <div class="flex flex-col items-center gap-4 text-center">
        <div class="flex items-center gap-3 rounded-card border border-line bg-muted px-4 py-2.5 w-full">
          <div class="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary-soft font-bold text-primary">
            {inisial(k.nama)}
          </div>
          <div class="min-w-0 flex-1 text-left">
            <div class="font-bold text-fg truncate">{k.nama}</div>
            <div class="text-xs text-muted-fg">Masukkan {pinLen} angka PIN tablet</div>
          </div>
          <LockKey size={20} class="text-primary shrink-0" aria-hidden />
        </div>

        {/* Display PIN Dots */}
        <div class="flex items-center justify-center gap-2.5 py-1">
          {Array.from({ length: pinLen }).map((_, idx) => {
            const filled = idx < pin.length;
            return (
              <span
                key={idx}
                class={`size-3.5 rounded-full border transition-all duration-150 ${
                  filled ? 'border-primary bg-primary scale-110' : 'border-line-strong bg-muted'
                }`}
              />
            );
          })}
        </div>

        {err && <p class="text-sm font-semibold text-danger animate-pulse">{err}</p>}

        {/* Numpad */}
        <div class="grid grid-cols-3 gap-2 w-full max-w-[280px]" role="group" aria-label="Keypad PIN">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'c', '0', 'del'].map((key) => {
            const isDel = key === 'del';
            const isC = key === 'c';
            return (
              <button
                key={key}
                type="button"
                onClick={() => tekan(key)}
                disabled={busy}
                class="flex min-h-12 items-center justify-center rounded-ctl border border-line bg-card text-lg font-bold text-fg shadow-sm transition-colors hover:border-primary hover:bg-primary-soft active:bg-primary-soft disabled:opacity-50 cursor-pointer"
                aria-label={isDel ? 'Hapus satu angka' : isC ? 'Hapus semua' : `Angka ${key}`}
              >
                {isDel ? <Backspace size={20} aria-hidden /> : isC ? 'C' : key}
              </button>
            );
          })}
        </div>
      </div>
    </Dialog>
  );
}
