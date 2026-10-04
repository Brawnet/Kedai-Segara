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
  CookingPot,
  DownloadSimple,
  House,
  MagnifyingGlass,
  Moon,
  ShieldCheck,
  SignOut,
  Storefront,
  Sun,
  UploadSimple,
  X,
   LockKey,
   Plus,
  ChatCenteredText,
 } from '@phosphor-icons/react';
import type { ComponentChildren } from 'preact';
import { call, pesan } from '../lib/api';
import { useApp } from '../lib/app';
import { cocok, dekatTutup, inisial, katOf, nf, parseNum, r3, urutKat } from '../lib/format';
import type { AuthSession, BarangTablet, Karyawan, RekapRow, TabletData } from '../lib/types';
import { Banner, Button, Dialog, Empty, Input, PageTitle, Skeleton, SyncStatusBadge, Tag, cx, vibrate } from '../components/ui';
import { Logo } from '../components/Logo';
type Aksi = 'ambil' | 'masuk';
export type BatchItem = {
  b: BarangTablet;
  val: string;
};

type Step =
  | { s: 'home' }
  | { s: 'menu'; k: Karyawan }
  | { s: 'barang'; k: Karyawan; aksi: Aksi; kat: string | null; q: string }
  | { s: 'jumlah'; k: Karyawan; aksi: Aksi; kat: string | null; items: BatchItem[]; activeIdx: number }
  | { s: 'sukses'; k: Karyawan; aksi: Aksi; kat: string | null; items: { b: BarangTablet; j: number }[] }
  | { s: 'rekapNama' }
  | { s: 'rekap'; k: Karyawan; cutoff: number; rows: RekapRow[] }
  | { s: 'rekapOk'; k: Karyawan; rows: RekapRow[]; sisa: number[] };

const IDLE_MS = 120_000;
export function Tablet({
  onAdmin,
  session,
  onLogout,
}: {
  onAdmin: () => void;
  session?: AuthSession;
  onLogout?: () => void;
}) {
  const { act, busy, theme, toggleTheme } = useApp();
  const [d, setD] = useState<TabletData | null>(null);
  const [err, setErr] = useState('');
  const [step, setStep] = useState<Step>({ s: 'home' });
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

  // Detik berjalan: kembali ke beranda saat diam.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
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

  // (Undo dihapus sesuai instruksi)
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
    body = <Home d={d} now={now} onPick={(k) => pilihKaryawan(k, () => go({ s: 'menu', k }))} onRekap={() => go({ s: 'rekapNama' })} />;
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
        onPick={(b) => go({ s: 'jumlah', k: step.k, aksi: step.aksi, kat: step.kat, items: [{ b, val: '' }], activeIdx: 0 })}
      />
    );
  else if (step.s === 'jumlah')
    body = (
      <Jumlah
        d={d}
        st={step}
        onBack={() => go({ s: 'barang', k: step.k, aksi: step.aksi, kat: step.kat, q: '' })}
        onDone={(items) => {
          go({ s: 'sukses', k: step.k, aksi: step.aksi, kat: step.kat, items });
        }}
      />
    );
  else if (step.s === 'sukses')
    body = (
      <Sukses
        st={step}
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
  onPick,
  onRekap,
  now,
}: {
  d: TabletData;
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
                Sentuh nama Anda untuk mulai mencatat pengambilan bahan dari gudang, hasil produksi dapur, atau rekap harian closing.
              </p>
            </div>

            <div class="mt-4">
              <GridKaryawan list={d.karyawan} onPick={onPick} />
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
    { key: 'masuk', icon: CookingPot, title: 'Masuk hasil produksi', sub: 'Catat bahan olahan yang selesai dimasak/diproduksi', tone: 'bg-success text-white', onClick: () => onAksi('masuk') },
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
  const availableBarang = useMemo(() => {
    if (!masuk) return d.barang;
    return d.barang.filter((b) => b.bisa_produksi);
  }, [d.barang, masuk]);

  const kats = useMemo(() => urutKat(availableBarang, d.urutan), [availableBarang, d.urutan]);
  const q = st.q.trim();
  const list = useMemo(() => availableBarang.filter((b) => (!st.kat || katOf(b) === st.kat) && cocok(b, q)), [availableBarang, st.kat, q]);
  const showKat = !st.kat && !q;

  return (
    <section class="flex flex-col gap-5">
      <BackBar onBack={onBack} label={st.kat ? 'Semua kategori' : 'Menu'} />
      <PageTitle
        kicker={`${st.k.nama} · ${masuk ? 'Masuk hasil produksi (Dapur → Gudang)' : 'Ambil dari gudang'}`}
        title={st.kat ?? (masuk ? 'Bahan olahan apa yang diproduksi?' : 'Ambil barang apa?')}
        sub={
          availableBarang.length === 0
            ? undefined
            : showKat
            ? masuk
              ? 'Pilih kategori atau langsung cari barang hasil produksi dapur.'
              : 'Pilih kategori, atau langsung cari nama/kode barang.'
            : undefined
        }
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

      {!showKat && availableBarang.length > 0 && (
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
              Semua ({availableBarang.length})
            </button>
            {kats.map((c) => {
              const count = availableBarang.filter((b) => katOf(b) === c).length;
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

      {availableBarang.length === 0 ? (
        <Empty>
          {masuk
            ? 'Belum ada barang yang diatur untuk produksi karyawan. Atur di menu Admin > Barang > Edit Barang > Bisa Diproduksi Karyawan.'
            : 'Belum ada barang. Tambahkan lewat menu Admin.'}
        </Empty>
      ) : showKat ? (
        kats.length ? (
          <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {kats.map((c) => (
              <Tile key={c} onClick={() => onChange({ kat: c, q: '' })} class="border-l-4 border-l-primary">
                <span class="min-w-0 flex-1">
                  <span class="block font-bold leading-snug">{c}</span>
                  <span class="block text-sm text-muted-fg">{availableBarang.filter((b) => katOf(b) === c).length} barang</span>
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

/* ================= Modal Tambah Barang (Searchable Combobox) ================= */

function ModalTambahBarang({
  d,
  aksi,
  selectedIds,
  onPick,
  onClose,
}: {
  d: TabletData;
  aksi: Aksi;
  selectedIds: Record<string, true>;
  onPick: (b: BarangTablet) => void;
  onClose: () => void;
}) {
  const masuk = aksi === 'masuk';
  const [kat, setKat] = useState<string | null>(null);
  const [q, setQ] = useState('');

  const availableBarang = useMemo(() => {
    if (!masuk) return d.barang;
    return d.barang.filter((b) => b.bisa_produksi);
  }, [d.barang, masuk]);
  const kats = useMemo(() => urutKat(availableBarang, d.urutan), [availableBarang, d.urutan]);
  const query = q.trim();
  const filtered = useMemo(
    () => availableBarang.filter((b) => (!kat || katOf(b) === kat) && cocok(b, query)),
    [availableBarang, kat, query]
  );

  return (
    <Dialog
      open
      onClose={onClose}
      title={masuk ? 'Tambah Hasil Produksi Lain' : 'Tambah Barang Lain'}
      wide
    >
      <div class="flex flex-col gap-4">
        {/* Search Input */}
        <label class="relative block">
          <span class="sr-only">Cari barang</span>
          <MagnifyingGlass size={20} class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-fg" aria-hidden />
          <Input
            type="search"
            value={q}
            onInput={(e) => setQ(e.currentTarget.value)}
            placeholder={kat ? `Cari di kategori ${kat}…` : 'Cari nama atau kode barang…'}
            class="min-h-12 pl-10 pr-11"
            autocomplete="off"
            autoFocus
          />
          {q && (
            <button
              type="button"
              onClick={() => setQ('')}
              class="absolute right-1 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-ctl text-muted-fg hover:bg-muted"
              aria-label="Hapus pencarian"
            >
              <X size={18} aria-hidden />
            </button>
          )}
        </label>

        {/* Category Pills */}
        <div class="flex items-center gap-1.5 overflow-x-auto pb-1 text-sm no-scrollbar">
          <button
            type="button"
            onClick={() => setKat(null)}
            class={`min-h-10 inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors duration-150 cursor-pointer ${
              !kat ? 'bg-primary text-white shadow-sm' : 'border border-line bg-card text-muted-fg hover:border-line-strong hover:bg-muted'
            }`}
          >
            Semua ({availableBarang.length})
          </button>
          {kats.map((c) => {
            const count = availableBarang.filter((b) => katOf(b) === c).length;
            const active = kat === c;
            return (
              <button
                key={c}
                type="button"
                onClick={() => setKat(c)}
                class={`min-h-10 inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors duration-150 cursor-pointer ${
                  active ? 'bg-primary text-white shadow-sm' : 'border border-line bg-card text-muted-fg hover:border-line-strong hover:bg-muted'
                }`}
              >
                <span>{c}</span>
                <span class={`rounded-full px-1.5 py-0.2 text-[10px] font-bold ${active ? 'bg-white/20 text-white' : 'bg-muted text-muted-fg'}`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Item List */}
        <div class="max-h-[50vh] overflow-y-auto pr-1 flex flex-col gap-2">
          {filtered.length ? (
            filtered.map((b) => {
              const already = Boolean(selectedIds[b.id]);
              return (
                <button
                  key={b.id}
                  type="button"
                  disabled={already}
                  onClick={() => onPick(b)}
                  class={`flex min-h-14 w-full items-center justify-between rounded-card border p-3 text-left transition-colors cursor-pointer select-none ${
                    already
                      ? 'border-line/60 bg-muted/40 opacity-60 cursor-not-allowed'
                      : 'border-line bg-card hover:border-primary hover:bg-primary-soft/30 active:bg-primary-soft'
                  }`}
                >
                  <div class="min-w-0 flex-1">
                    <div class="flex items-center gap-2">
                      <span class="font-bold text-fg leading-snug">{b.nama}</span>
                      <span class="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-fg">{katOf(b)}</span>
                    </div>
                    <span class="mt-0.5 block text-xs text-muted-fg">
                      {b.alur === 'LUAR' ? (
                        <span>Di luar: <strong class="num">{nf(b.stok_luar ?? 0)}</strong> {b.satuan}</span>
                      ) : (
                        <span>Langsung habis</span>
                      )}
                    </span>
                  </div>
                  {already ? (
                    <span class="rounded bg-muted px-2.5 py-1 text-xs font-semibold text-muted-fg">
                      Sudah dipilih
                    </span>
                  ) : (
                    <span class="grid size-8 place-items-center rounded-full bg-primary-soft text-primary">
                      <Plus size={18} weight="bold" />
                    </span>
                  )}
                </button>
              );
            })
          ) : (
            <Empty>Tidak ada barang yang cocok dengan pencarian.</Empty>
          )}
        </div>
      </div>
    </Dialog>
  );
}

/* ================= Modal Verifikasi ================= */

function ModalVerifikasi({
  items,
  aksi,
  k,
  busy,
  batchNote,
  setBatchNote,
  showBatchNote,
  setShowBatchNote,
  onClose,
  onRemoveItem,
  onKonfirmasi,
}: {
  items: BatchItem[];
  aksi: Aksi;
  k: Karyawan;
  busy: boolean;
  batchNote: string;
  setBatchNote: (n: string) => void;
  showBatchNote: boolean;
  setShowBatchNote: (s: boolean) => void;
  onClose: () => void;
  onRemoveItem: (index: number) => void;
  onKonfirmasi: (batchNote: string) => void;
}) {
  const masuk = aksi === 'masuk';
  const totalItem = items.length;

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return;
      if (e.key === 'Enter' && !busy && items.length > 0) {
        e.preventDefault();
        onKonfirmasi(batchNote);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [busy, items.length, batchNote, onKonfirmasi]);

  return (
    <Dialog
      open
      onClose={onClose}
      title={masuk ? 'Verifikasi Hasil Produksi' : 'Verifikasi Pengambilan Barang'}
      wide
    >
      <div class="flex flex-col gap-4">
        <div class="rounded-card border border-primary/20 bg-primary-soft/30 p-3.5 text-sm">
          <p class="font-bold text-fg">
            {masuk
              ? `${k.nama} akan mencatat hasil produksi ${totalItem} macam barang:`
              : `${k.nama} akan mengambil ${totalItem} macam bahan:`}
          </p>
          <p class="mt-0.5 text-xs text-muted-fg">
            {masuk
              ? `Dicatat oleh: ${k.nama}. Stok gudang akan otomatis bertambah setelah konfirmasi.`
              : 'Pastikan nama barang dan jumlahnya sudah sesuai dengan fisik sebelum konfirmasi.'}
          </p>
        </div>

        <div class="max-h-[40vh] overflow-y-auto divide-y divide-line rounded-card border border-line bg-card">
          {items.map((it, idx) => {
            const j = parseNum(it.val || '0');
            return (
              <div key={it.b.id} class="p-3.5 flex items-center justify-between gap-3">
                <div class="min-w-0 flex-1">
                  <span class="block font-bold text-fg leading-tight">{it.b.nama}</span>
                  <span class="text-xs text-muted-fg">{katOf(it.b)}</span>
                </div>
                <div class="text-right">
                  <span class="num text-lg font-extrabold text-primary">
                    {nf(j)} {it.b.satuan}
                  </span>
                </div>
                <div class="flex items-center shrink-0">
                  <button
                    type="button"
                    onClick={() => onRemoveItem(idx)}
                    class="grid size-9 shrink-0 place-items-center rounded-ctl text-muted-fg hover:text-danger hover:bg-danger-soft transition-colors cursor-pointer"
                    aria-label={`Hapus ${it.b.nama}`}
                    title="Hapus dari daftar"
                  >
                    <X size={18} weight="bold" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Seksi Catatan Batch */}
        {showBatchNote || batchNote ? (
          <div class="rounded-card border border-primary/20 bg-primary-soft/10 p-3 flex flex-col gap-2">
            <div class="flex items-center justify-between">
              <label class="text-xs font-bold text-fg flex items-center gap-1.5">
                <ChatCenteredText size={16} weight="bold" class="text-primary" />
                <span>Catatan Batch (Semua Barang)</span>
              </label>
              <span class="text-[11px] text-muted-fg font-mono">
                {batchNote.length}/150
              </span>
            </div>
            <input
              type="text"
              maxLength={150}
              value={batchNote}
              onInput={(e) => setBatchNote((e.target as HTMLInputElement).value)}
              placeholder="mis. Persiapan event bazar, catering, dll. (opsional)"
              class="w-full text-sm rounded-ctl border border-line bg-card px-3 py-2 text-fg placeholder:text-muted-fg focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        ) : (
          <div>
            <button
              type="button"
              onClick={() => setShowBatchNote(true)}
              class="inline-flex items-center gap-2 rounded-ctl border border-dashed border-line hover:border-primary/50 bg-muted/20 hover:bg-primary-soft/20 px-3.5 py-2.5 text-xs font-semibold text-muted-fg hover:text-primary transition-all cursor-pointer w-full justify-center"
            >
              <Plus size={15} weight="bold" />
              <span>+ Tambah Catatan Batch</span>
            </button>
          </div>
        )}

        <div class="grid grid-cols-2 gap-3 pt-2 border-t border-line">
          <Button variant="ghost" size="lg" onClick={onClose} disabled={busy}>
            Periksa Kembali
          </Button>
          <Button
            variant={masuk ? 'success' : 'primary'}
            size="lg"
            guard
            disabled={busy || items.length === 0}
            onClick={() => onKonfirmasi(batchNote)}
            class="font-bold"
          >
            {busy ? 'Menyimpan…' : masuk ? 'Simpan Hasil Produksi' : 'Konfirmasi Ambil'}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

/* ================= Jumlah (numpad) ================= */

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', ',', '0', 'del'] as const;

function Jumlah({
  d,
  st,
  onBack,
  onDone,
}: {
  d: TabletData;
  st: Extract<Step, { s: 'jumlah' }>;
  onBack: () => void;
  onDone: (items: { b: BarangTablet; j: number }[]) => void;
}) {
  const { act, busy, toast } = useApp();
  const [items, setItems] = useState<BatchItem[]>(st.items && st.items.length ? st.items : []);
  const [activeIdx, setActiveIdx] = useState(st.activeIdx || 0);
  const [showModalTambah, setShowModalTambah] = useState(false);
  const [showModalVerifikasi, setShowModalVerifikasi] = useState(false);
  const [batchNote, setBatchNote] = useState('');
  const [showBatchNote, setShowBatchNote] = useState(false);
  const masuk = st.aksi === 'masuk';

  // Current active item
  const curr = items[activeIdx] ?? items[0];
  const b = curr?.b;
  const val = curr?.val || '';
  const j = parseNum(val || '0');
  const ok = j > 0;

  const setCurrVal = (updater: (prev: string) => string) => {
    setItems((prev) => {
      const next = [...prev];
      if (next[activeIdx]) {
        next[activeIdx] = { ...next[activeIdx], val: updater(next[activeIdx].val) };
      }
      return next;
    });
  };

  const press = (k: (typeof KEYS)[number]) => {
    vibrate(10);
    setCurrVal((v) => {
      if (k === 'del') return v.slice(0, -1);
      if (k === ',') return v.includes(',') ? v : (v || '0') + ',';
      if (v === '0') v = '';
      return v.length < 8 ? v + k : v;
    });
  };

  const tambahCepat = (delta: number) => {
    vibrate(10);
    const currNum = parseNum(val || '0');
    const nextNum = Math.max(0, r3(currNum + delta));
    setCurrVal(() => (nextNum === 0 ? '' : String(nextNum).replace('.', ',')));
  };

  const handleReset = () => {
    vibrate(10);
    setCurrVal(() => '');
  };

  const handleRemoveItem = (idxToRemove: number) => {
    vibrate(15);
    const nextItems = items.filter((_, i) => i !== idxToRemove);
    if (nextItems.length === 0) {
      onBack();
      return;
    }
    setItems(nextItems);
    if (activeIdx >= nextItems.length) {
      setActiveIdx(nextItems.length - 1);
    } else if (activeIdx === idxToRemove && activeIdx > 0) {
      setActiveIdx(activeIdx - 1);
    }
  };

  const handleAddItem = (newBarang: BarangTablet) => {
    vibrate(10);
    setItems((prev) => [...prev, { b: newBarang, val: '' }]);
    setActiveIdx(items.length); // Fokus ke barang baru
    setShowModalTambah(false);
  };

  const handlePreVerify = () => {
    if (items.length === 0) return;
    const invalidIdx = items.findIndex((it) => !(parseNum(it.val || '0') > 0));
    if (invalidIdx !== -1) {
      vibrate(25);
      setActiveIdx(invalidIdx);
      toast(`Harap masukkan jumlah untuk ${items[invalidIdx].b.nama}`);
      return;
    }
    setShowModalVerifikasi(true);
  };

  const reqIdBase = useRef(Date.now() + '-' + Math.random().toString(36).slice(2, 8));

  const handleKonfirmasiBatch = async (bNote = batchNote) => {
    if (busy || items.length === 0) return;
    const invalidIdx = items.findIndex((it) => !(parseNum(it.val || '0') > 0));
    if (invalidIdx !== -1) {
      toast(`Harap masukkan jumlah untuk ${items[invalidIdx].b.nama}`);
      setActiveIdx(invalidIdx);
      return;
    }

    const baseId = reqIdBase.current;
    const results: { b: BarangTablet; j: number }[] = [];
    const finalCatatan = (bNote || '').trim().slice(0, 150);

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const n = r3(parseNum(item.val));
      const reqId = `${baseId}-${i}`;

      if (masuk) {
        const catatanProd = finalCatatan || 'Hasil produksi';
        const okRes = await act('produksiKaryawan', [st.k.id, item.b.id, n, catatanProd, reqId]);
        if (!okRes) return;
      } else {
        const res = await act('ambil', [st.k.id, item.b.id, n, finalCatatan, reqId]);
        if (!res) return;
      }
      results.push({ b: item.b, j: n });
    }

    setShowModalVerifikasi(false);
    onDone(results);
  };

  // Keyboard fisik
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return;
      if (/^[0-9]$/.test(e.key)) press(e.key as (typeof KEYS)[number]);
      else if (e.key === ',' || e.key === '.') press(',');
      else if (e.key === 'Backspace') press('del');
      else if (e.key === 'Enter' && !busy) {
        if (!showModalVerifikasi) handlePreVerify();
      } else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [items, activeIdx, busy, showModalVerifikasi]);

  if (!b) return null;

  const ket = masuk
    ? `Dicatat oleh ${st.k.nama} · Masuk ke stok gudang (${items.length} barang)`
    : `Dibawa ke dapur, direkap saat closing (${items.length} barang)`;
  const selectedIds: Record<string, true> = {};
  items.forEach((it) => {
    selectedIds[it.b.id] = true;
  });

  return (
    <section class="flex flex-col gap-5">
      <BackBar onBack={onBack} label="Kembali" />

      {/* Header and Chips */}
      <div class="flex flex-col gap-3">
        <PageTitle
          kicker={`${st.k.nama} · ${masuk ? 'Masuk hasil produksi' : 'Ambil dari gudang'}`}
          title={masuk ? 'Catat Hasil Produksi ke Gudang' : 'Ambil Bahan dari Gudang'}
          sub="Pilih chip barang di bawah untuk mengatur jumlahnya, atau tekan tombol tambah barang lain."
        />

        {/* Chips Bar */}
        <div class="flex flex-wrap items-center gap-2 pt-1">
          {items.map((it, idx) => {
            const isActive = idx === activeIdx;
            const itemVal = parseNum(it.val || '0');
            const hasQty = itemVal > 0;
            return (
              <div
                key={it.b.id}
                onClick={() => {
                  vibrate(10);
                  setActiveIdx(idx);
                }}
                class={`group flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-semibold transition-all cursor-pointer select-none ${
                  isActive
                    ? 'border-primary bg-primary text-white shadow-sm ring-2 ring-primary/30'
                    : 'border-line bg-card text-fg hover:border-primary/50 hover:bg-muted'
                }`}
                role="button"
                tabIndex={0}
                aria-pressed={isActive}
              >
                <span>{it.b.nama}</span>
                <span
                  class={`num text-xs font-bold px-1.5 py-0.5 rounded-full ${
                    isActive
                      ? 'bg-white/20 text-white'
                      : hasQty
                      ? 'bg-primary-soft text-primary font-extrabold'
                      : 'bg-muted text-muted-fg'
                  }`}
                >
                  {it.val ? `${it.val} ${it.b.satuan}` : `0 ${it.b.satuan}`}
                </span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRemoveItem(idx);
                  }}
                  class={`grid size-5 place-items-center rounded-full transition-colors cursor-pointer ${
                    isActive
                      ? 'hover:bg-white/20 text-white'
                      : 'hover:bg-danger-soft hover:text-danger text-muted-fg'
                  }`}
                  aria-label={`Hapus ${it.b.nama}`}
                >
                  <X size={13} weight="bold" />
                </button>
              </div>
            );
          })}

          <button
            type="button"
            onClick={() => {
              vibrate(10);
              setShowModalTambah(true);
            }}
            class="min-h-9 inline-flex items-center gap-1.5 rounded-full border border-dashed border-primary/60 bg-primary-soft/40 px-3.5 py-1.5 text-xs font-bold text-primary hover:bg-primary-soft hover:border-primary transition-colors cursor-pointer select-none"
          >
            <Plus size={15} weight="bold" />
            <span>Tambah barang lain</span>
          </button>
        </div>
      </div>

      <div class="grid gap-6 md:grid-cols-[1fr_minmax(300px,380px)] md:items-start">
        {/* Kolom Kiri: Display Barang Aktif & Jumlah */}
        <div class="flex flex-col gap-4">
          <div class="rounded-card border border-line bg-card p-4 sm:p-5 shadow-sm">
            <div class="flex items-center justify-between gap-2 border-b border-line pb-3">
              <span class="text-xs font-bold uppercase tracking-wider text-primary">
                Barang yang sedang diisi ({activeIdx + 1} dari {items.length})
              </span>
              <span class="rounded bg-muted px-2 py-0.5 text-xs font-semibold text-muted-fg">
                {katOf(b)}
              </span>
            </div>
            <div class="mt-3">
              <h2 class="text-2xl font-extrabold text-fg sm:text-3xl">{b.nama}</h2>
              {b.catatan && <p class="mt-0.5 text-sm text-muted-fg">{b.catatan}</p>}
            </div>

            <div class="mt-4 flex items-center justify-between rounded-card border border-primary/20 bg-primary-soft/40 px-4 py-2.5 text-sm">
              <span class="font-medium text-muted-fg">Tersedia di dapur saat ini:</span>
              <span class="num text-base font-extrabold text-primary">
                {nf(b.stok_luar ?? 0)} {b.satuan}
              </span>
            </div>
            {masuk && b.catatan && (
              <p class="mt-2 text-xs font-medium text-muted-fg">
                Catatan: {b.catatan}
              </p>
            )}

            <div
              class="mt-4 rounded-card border-2 border-line bg-card px-5 py-4"
              aria-live="polite"
              aria-label={`Jumlah ${val || '0'} ${b.satuan}`}
            >
              <p class="text-sm font-semibold text-muted-fg">
                {masuk ? `Jumlah hasil produksi (oleh ${st.k.nama})` : 'Jumlah yang diambil'}
              </p>
              <p class="num flex items-baseline gap-2 break-all">
                <span class={`text-5xl font-extrabold tracking-tight md:text-6xl ${ok ? 'text-fg' : 'text-muted-fg'}`}>
                  {val || '0'}
                </span>
                <span class="text-xl font-bold text-muted-fg">{b.satuan}</span>
              </p>
            </div>

            <div class="mt-4 flex flex-wrap items-center gap-2">
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
                onClick={handleReset}
                disabled={!val}
                class="min-h-10 rounded-ctl border border-line bg-card px-3 py-1 text-xs font-bold text-muted-fg hover:text-danger hover:border-danger hover:bg-danger-soft transition-colors select-none disabled:opacity-40 cursor-pointer"
              >
                Reset
              </button>
            </div>
          </div>
        </div>

        {/* Kolom Kanan: Papan Angka (Numpad) */}
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
          <Button
            variant={masuk ? 'success' : 'primary'}
            size="lg"
            guard
            disabled={busy || items.length === 0}
            onClick={handlePreVerify}
            class="min-h-16 flex-col gap-0.5 text-lg"
          >
            <span>
              Periksa & {masuk ? 'Simpan Produksi' : 'Ambil'} ({items.length} barang)
            </span>
            <span class="text-[12px] font-medium opacity-90">{ket}</span>
          </Button>
        </div>
      </div>

      {showModalTambah && (
        <ModalTambahBarang
          d={d}
          aksi={st.aksi}
          selectedIds={selectedIds}
          onPick={handleAddItem}
          onClose={() => setShowModalTambah(false)}
        />
      )}

      {showModalVerifikasi && (
        <ModalVerifikasi
          items={items}
          aksi={st.aksi}
          k={st.k}
          busy={busy}
          batchNote={batchNote}
          setBatchNote={setBatchNote}
          showBatchNote={showBatchNote}
          setShowBatchNote={setShowBatchNote}
          onClose={() => setShowModalVerifikasi(false)}
          onRemoveItem={(idx) => {
            handleRemoveItem(idx);
            if (items.length <= 1) {
              setShowModalVerifikasi(false);
            }
          }}
          onKonfirmasi={handleKonfirmasiBatch}
        />
      )}
    </section>
  );
}

/* ================= Sukses ================= */

function Sukses({
  st,
  onLagi,
  onMenu,
  onSelesai,
}: {
  st: Extract<Step, { s: 'sukses' }>;
  onLagi: () => void;
  onMenu: () => void;
  onSelesai: () => void;
}) {
  const m = st.aksi === 'masuk';
  const totalItem = st.items.length;
  return (
    <section class="mx-auto flex max-w-2xl flex-col items-center gap-6 py-6 text-center">
      <span class="grid size-20 place-items-center rounded-full bg-success-soft text-success">
        <CheckCircle size={48} weight="fill" aria-hidden />
      </span>
      <div>
        <p class="text-[13px] font-bold uppercase tracking-wide text-success">Tercatat</p>
        <h1 class="mt-1 text-2xl font-extrabold leading-tight text-balance md:text-3xl">
          {st.k.nama} berhasil {m ? 'mencatat' : 'mengambil'} {totalItem} macam {m ? 'hasil produksi ke gudang' : 'barang'}
        </h1>
      </div>
      <div class="w-full rounded-card border border-line bg-card divide-y divide-line text-left shadow-sm">
        {st.items.map((it) => (
          <div key={it.b.id} class="flex items-center justify-between px-4 py-3">
            <span class="font-bold text-fg">{it.b.nama}</span>
            <span class="num font-extrabold text-primary">
              {nf(it.j)} {it.b.satuan}
            </span>
          </div>
        ))}
      </div>
      <div class="grid w-full gap-3 sm:grid-cols-3">
        <Button variant="primary" size="lg" onClick={onLagi}>
          <ArrowRight size={20} aria-hidden /> {m ? 'Produksi lagi' : 'Ambil lagi'}
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
  const pct = st.rows.length ? Math.round((terisi / st.rows.length) * 100) : 0;
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
    <section class="mx-auto flex w-full max-w-3xl flex-col gap-5">
      <BackBar onBack={onBack} label="Batal" />
      <PageTitle
        kicker={`${st.k.nama} · Rekap`}
        title="Hitung sisa di area kerja"
        sub="Isi jumlah fisik sisa bahan yang ada di dapur saat ini."
      />
      <ul class="flex flex-col gap-3">
        {st.rows.map((r, i) => {
          const c = cek(i);
          const bad = c === 'salah' || (tried && c === 'kosong');
          return (
            <li
              key={r.barang_id}
              class={cx(
                'rounded-card border bg-card p-4 sm:p-5 shadow-xs transition-all',
                bad
                  ? 'border-danger/80 ring-1 ring-danger/30'
                  : c === 'ok'
                  ? 'border-primary/50 bg-card shadow-xs'
                  : 'border-line hover:border-line-strong/40',
              )}
            >
              <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                {/* Kolom Kiri: Nama Barang */}
                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-2 flex-wrap">
                    <h3 class="text-base sm:text-lg font-bold text-fg leading-snug">{r.nama}</h3>
                    {c === 'ok' && (
                      <span class="inline-flex items-center gap-1 rounded-full bg-primary-soft text-primary px-2 py-0.5 text-xs font-bold">
                        <CheckCircle size={13} weight="bold" /> Terisi
                      </span>
                    )}
                  </div>
                </div>

                {/* Kolom Kanan: Input Sisa */}
                <div class="w-full sm:w-48 shrink-0">
                  <label for={'sisa-' + i} class="block text-xs font-bold uppercase tracking-wider text-muted-fg mb-1">
                    Sisa ({r.satuan})
                  </label>
                  <div class="relative">
                    <Input
                      id={'sisa-' + i}
                      type="text"
                      inputmode="decimal"
                      autocomplete="off"
                      value={vals[i]}
                      onInput={(e) => set(i, e.currentTarget.value)}
                      aria-invalid={bad}
                      aria-describedby={bad ? 'err-' + i : undefined}
                      class="num min-h-12 w-full text-lg font-bold pr-14"
                      placeholder="0"
                    />
                    <span class="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-fg select-none">
                      {r.satuan}
                    </span>
                  </div>
                  {bad && (
                    <p id={'err-' + i} class="mt-1 text-[13px] font-semibold text-danger">
                      {c === 'kosong' ? 'Wajib diisi' : `Isi 0 sampai ${nf(r.maks)}`}
                    </p>
                  )}
                </div>
              </div>

              {/* Catatan (Opsional) */}
              <div class="mt-3 border-t border-line/50 pt-2.5">
                <label class="block">
                  <span class="sr-only">Catatan untuk {r.nama}</span>
                  <Input
                    value={notes[i]}
                    onInput={(e) => {
                      const v = e.currentTarget.value;
                      setNotes((a) => a.map((x, j) => (j === i ? v : x)));
                    }}
                    placeholder="Catatan tambahan (opsional)…"
                    class="text-xs sm:text-sm h-9 bg-muted/30 border-transparent hover:border-line focus:border-primary focus:bg-card transition-colors"
                  />
                </label>
              </div>
            </li>
          );
        })}
      </ul>
      <div class="relative sticky bottom-3 sm:bottom-4 z-20 w-full rounded-2xl sm:rounded-3xl border border-line-strong/30 dark:border-white/10 bg-card/95 dark:bg-[#16161b]/95 p-3 sm:px-5 sm:py-3.5 backdrop-blur-xl shadow-xl shadow-black/10 dark:shadow-black/40 overflow-hidden transition-all">
        {/* Subtle accent highlight line on top edge */}
        <div class="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent" aria-hidden="true" />

        <div class="flex items-center justify-between gap-3 sm:gap-4">
          <div class="flex items-center gap-3 sm:gap-3.5 min-w-0">
            {/* Visual Gauge: Circular Progress Ring */}
            <div class="relative size-10.5 sm:size-11 shrink-0 flex items-center justify-center">
              <svg class="size-10.5 sm:size-11 -rotate-90" viewBox="0 0 36 36" aria-hidden="true">
                <path
                  class="text-muted/80 dark:text-white/10 stroke-current"
                  stroke-width="3.5"
                  fill="none"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
                <path
                  class={cx(
                    'stroke-current transition-all duration-500 ease-out',
                    semua ? 'text-success' : 'text-primary',
                  )}
                  stroke-width="3.5"
                  stroke-dasharray={`${pct}, 100`}
                  stroke-linecap="round"
                  fill="none"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
              </svg>
              <span class="num absolute text-[11px] font-extrabold text-fg">
                {pct}%
              </span>
            </div>

            {/* Status Info Capsule */}
            <div class="flex flex-col min-w-0">
              <div class="flex items-center gap-2">
                <span
                  class={cx(
                    'inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold border transition-colors shrink-0',
                    semua
                      ? 'bg-success/15 text-success border-success/30'
                      : terisi > 0
                      ? 'bg-primary-soft text-primary border-primary/25'
                      : 'bg-muted text-muted-fg border-line',
                  )}
                >
                  {semua ? (
                    <>
                      <CheckCircle size={13} weight="fill" aria-hidden /> Lengkap
                    </>
                  ) : (
                    <>
                      <Clock size={13} weight="bold" aria-hidden /> {terisi}/{st.rows.length} Terisi
                    </>
                  )}
                </span>
                <span class="text-xs sm:text-sm font-bold text-fg truncate hidden xs:inline">
                  {semua ? 'Semua terisi' : `${st.rows.length - terisi} belum diisi`}
                </span>
              </div>
              <span class="text-[11px] text-muted-fg font-medium truncate mt-0.5 hidden sm:inline">
                {semua
                  ? 'Semua sisa dapur siap disimpan'
                  : 'Isi sisa bahan lalu ketuk simpan'}
              </span>
            </div>
          </div>

          {/* Vertical divider */}
          <div class="hidden sm:block h-9 w-px bg-line/80 dark:bg-white/10 shrink-0" aria-hidden="true" />

          {/* Action buttons */}
          <div class="flex items-center gap-2 shrink-0">
            <Button
              variant="ghost"
              size="md"
              onClick={onBack}
              class="text-muted-fg hover:text-fg hover:bg-muted/80 rounded-xl sm:rounded-full hidden sm:inline-flex font-semibold px-4"
            >
              Batal
            </Button>
            <Button
              variant={semua ? 'primary' : 'secondary'}
              size="lg"
              guard
              onClick={simpan}
              class={cx(
                'rounded-xl sm:rounded-full font-bold min-h-12 px-5 sm:px-6 transition-all active:scale-95 shadow-sm',
                semua
                  ? 'shadow-md shadow-primary/25 ring-2 ring-primary/30'
                  : 'border-2 border-primary/40 bg-primary/10 text-primary hover:bg-primary/20 hover:border-primary/60 dark:bg-primary/15 dark:hover:bg-primary/25',
              )}
            >
              <CheckCircle size={20} weight={semua ? 'bold' : 'regular'} aria-hidden />
              <span>Simpan rekap</span>
            </Button>
          </div>
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
