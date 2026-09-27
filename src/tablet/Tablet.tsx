import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import {
  ArrowCounterClockwise,
  ArrowLeft,
  ArrowRight,
  Backspace,
  CaretRight,
  CheckCircle,
  ClipboardText,
  DownloadSimple,
  House,
  MagnifyingGlass,
  ShieldCheck,
  SignOut,
  UploadSimple,
  X,
} from '@phosphor-icons/react';
import type { ComponentChildren } from 'preact';
import { call, pesan } from '../lib/api';
import { useApp } from '../lib/app';
import { cocok, dekatTutup, inisial, katOf, nf, parseNum, r3, urutKat } from '../lib/format';
import type { BarangTablet, Karyawan, RekapRow, TabletData } from '../lib/types';
import { Banner, Button, Empty, Input, Loading, PageTitle, Tag } from '../components/ui';
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

export function Tablet({ onAdmin }: { onAdmin: () => void }) {
  const { act, busy, toast } = useApp();
  const [d, setD] = useState<TabletData | null>(null);
  const [err, setErr] = useState('');
  const [step, setStep] = useState<Step>({ s: 'home' });
  const [last, setLast] = useState<Last | null>(null);
  const [now, setNow] = useState(Date.now());
  const lastAct = useRef(Date.now());

  const go = (s: Step) => {
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
    if (['menu', 'barang', 'jumlah', 'rekapNama'].includes(step.s) && now - lastAct.current > IDLE_MS) go({ s: 'home' });
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
  if (!d) body = err ? <Gagal msg={err} onRetry={load} /> : <Loading />;
  else if (step.s === 'home') body = <Home d={d} undo={undo} onPick={(k) => go({ s: 'menu', k })} onRekap={() => go({ s: 'rekapNama' })} />;
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
          if (tx) setLast({ id: tx.id, ts: Date.now(), karyawan: step.k.nama, barang: step.b.nama, jumlah: j, satuan: step.b.satuan });
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
        <GridKaryawan list={d.karyawan} onPick={mulaiRekap} />
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
      <header class="sticky top-0 z-30 border-b border-line bg-card/95 backdrop-blur">
        <div class="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 md:px-6">
          <button type="button" onClick={selesai} class="-ml-1 min-w-0 rounded-ctl p-1" aria-label="Ke beranda">
            <Logo sub={step.s !== 'home' && 'k' in step ? step.k.nama : 'Tablet dapur'} />
          </button>
          <div class="ml-auto flex shrink-0 items-center gap-2">
            {step.s !== 'home' && (
              <span class="hidden sm:block">
                <Button variant="ghost" onClick={selesai}>
                  <House size={20} aria-hidden /> Beranda
                </Button>
              </span>
            )}
            <Button variant="secondary" onClick={onAdmin} aria-label="Admin">
              <ShieldCheck size={20} aria-hidden /> <span class="hidden sm:inline">Admin</span>
            </Button>
          </div>
        </div>
      </header>
      <main class="animate-rise mx-auto max-w-6xl px-4 pb-24 pt-6 md:px-6 md:pt-8" key={step.s}>
        {body}
      </main>
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
  return (
    <div class="flex flex-wrap items-center gap-3 rounded-card border border-line bg-card p-3 shadow-sm sm:p-4">
      <CheckCircle size={24} weight="fill" class="shrink-0 text-success" aria-hidden />
      <p class="min-w-0 flex-1">
        <strong>{last.karyawan}</strong> ambil{' '}
        <span class="num font-bold">
          {nf(last.jumlah)} {last.satuan}
        </span>{' '}
        {last.barang}
      </p>
      <Button variant="danger-ghost" guard onClick={onUndo} class="border-danger/30">
        <ArrowCounterClockwise size={20} aria-hidden />
        Batalkan <span class="num">({left} dtk)</span>
      </Button>
    </div>
  );
}

function Avatar({ nama }: { nama: string }) {
  return (
    <span class="grid size-14 shrink-0 place-items-center rounded-full bg-primary-soft text-lg font-extrabold text-primary" aria-hidden>
      {inisial(nama)}
    </span>
  );
}

function GridKaryawan({ list, onPick }: { list: Karyawan[]; onPick: (k: Karyawan) => void }) {
  if (!list.length) return <Empty>Belum ada karyawan. Tambahkan lewat menu Admin.</Empty>;
  return (
    <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {list.map((k) => (
        <Tile key={k.id} onClick={() => onPick(k)}>
          <Avatar nama={k.nama} />
          <span class="min-w-0 flex-1 truncate text-lg font-bold">{k.nama}</span>
          <CaretRight size={22} class="shrink-0 text-muted-fg" aria-hidden />
        </Tile>
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
      class={`flex min-h-20 w-full items-center gap-4 rounded-card border border-line bg-card p-4 text-left shadow-sm transition-colors duration-150 hover:border-primary hover:bg-primary-soft active:bg-primary-soft disabled:opacity-60 ${c}`}
    >
      {children}
    </button>
  );
}

/* ================= Beranda ================= */

function Home({ d, undo, onPick, onRekap }: { d: TabletData; undo: Undo; onPick: (k: Karyawan) => void; onRekap: () => void }) {
  const st = d.status;
  return (
    <section class="flex flex-col gap-6">
      {st.lewatHari ? (
        <Banner
          tone="danger"
          action={
            <Button variant="danger" onClick={onRekap}>
              Rekap sekarang
            </Button>
          }
        >
          Ada pengambilan dari hari sebelumnya yang belum direkap.
        </Banner>
      ) : st.belumRekap > 0 && dekatTutup(d.jamTutup) ? (
        <Banner
          tone="warning"
          action={
            <Button variant="primary" onClick={onRekap}>
              Rekap
            </Button>
          }
        >
          Waktunya rekap sisa Stock Luar (tutup {d.jamTutup}).
        </Banner>
      ) : null}
      {undo && <UndoBar undo={undo} />}
      <PageTitle kicker="Mulai" title="Siapa yang pakai tablet?" sub="Ketuk nama Anda untuk ambil, masukkan, atau rekap barang." />
      <GridKaryawan list={d.karyawan} onPick={onPick} />
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
                  <span>{b.satuan}</span>
                  {b.kode && <Tag>{b.kode}</Tag>}
                  {!st.kat && <span class="truncate">· {katOf(b)}</span>}
                  {!masuk && b.alur === 'LANGSUNG_HABIS' && <Tag tone="warning">langsung habis</Tag>}
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
  onDone: (j: number, tx?: { id: string }) => void;
}) {
  const { act } = useApp();
  const [val, setVal] = useState('');
  const [sup, setSup] = useState('');
  const masuk = st.aksi === 'masuk';
  const b = st.b;
  const j = parseNum(val || '0');
  const ok = j > 0;

  const press = (k: (typeof KEYS)[number]) =>
    setVal((v) => {
      if (k === 'del') return v.slice(0, -1);
      if (k === ',') return v.includes(',') ? v : (v || '0') + ',';
      if (v === '0') v = '';
      return v.length < 8 ? v + k : v;
    });

  // Keyboard fisik juga bisa dipakai (kecuali saat mengetik supplier).
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return;
      if (/^[0-9]$/.test(e.key)) press(e.key as (typeof KEYS)[number]);
      else if (e.key === ',' || e.key === '.') press(',');
      else if (e.key === 'Backspace') press('del');
      else if (e.key === 'Enter' && ok) kirim();
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  });

  const kirim = async () => {
    if (!ok) return;
    const n = r3(j);
    if (masuk) {
      if (await act('masukKaryawan', [st.k.id, b.id, n, sup.trim()])) onDone(n);
    } else {
      const r = await act('ambil', [st.k.id, b.id, n]);
      if (r) onDone(n, r.tx);
    }
  };

  const ket = masuk ? 'Ditambahkan ke stok gudang' : b.alur === 'LUAR' ? 'Dibawa ke dapur, direkap saat closing' : 'Langsung tercatat terpakai';

  return (
    <section class="flex flex-col gap-5">
      <BackBar onBack={onBack} label="Pilih barang lain" />
      <div class="grid gap-6 md:grid-cols-[1fr_minmax(300px,380px)] md:items-start">
        <div class="flex flex-col gap-5">
          <PageTitle kicker={`${st.k.nama} · ${masuk ? 'Masukkan ke gudang' : 'Ambil dari gudang'}`} title={b.nama} sub={b.catatan || undefined} />
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
          <Button variant={masuk ? 'success' : 'primary'} size="lg" guard disabled={!ok} onClick={kirim} class="min-h-16 flex-col gap-0 text-lg">
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
    const r = await act('simpanRekap', [st.cutoff, st.k.id, st.rows.map((r, i) => ({ barang_id: r.barang_id, sisa: sisa[i]!, catatan: notes[i]! }))]);
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
        sub="Isi jumlah yang masih tersisa di luar. Ketuk “Habis” kalau tidak ada sisa."
      />
      <ul class="flex flex-col gap-3">
        {st.rows.map((r, i) => {
          const c = cek(i);
          const bad = c === 'salah' || (tried && c === 'kosong');
          const s = parseNum(vals[i]);
          return (
            <li key={r.barang_id} class={`rounded-card border bg-card p-4 shadow-sm ${bad ? 'border-danger' : 'border-line'}`}>
              <div class="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(280px,340px)_120px] md:items-center">
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
                  <div class="flex gap-2">
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
                    <Button onClick={() => set(i, '0')} class="min-h-12 shrink-0">
                      Habis
                    </Button>
                  </div>
                  {bad && (
                    <p id={'err-' + i} class="text-[13px] font-semibold text-danger">
                      {c === 'kosong' ? 'Belum diisi' : `Isi 0 sampai ${nf(r.maks)}`}
                    </p>
                  )}
                </div>
                <div class="flex items-center justify-between gap-2 md:flex-col md:items-end md:justify-center">
                  <span class="text-sm text-muted-fg">Terpakai</span>
                  <span class="num text-lg font-extrabold">{c === 'ok' ? `${nf(r3(r.maks - s))} ${r.satuan}` : '—'}</span>
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
    <section class="flex flex-col gap-5">
      <div class="flex items-center gap-4">
        <span class="grid size-14 shrink-0 place-items-center rounded-full bg-success-soft text-success">
          <CheckCircle size={32} weight="fill" aria-hidden />
        </span>
        <PageTitle kicker={`Rekap tersimpan · ${st.k.nama}`} title="Pemakaian hari ini" />
      </div>
      <div class="overflow-hidden rounded-card border border-line bg-card shadow-sm">
        <table class="w-full text-left">
          <thead class="bg-muted text-sm text-muted-fg">
            <tr>
              <th class="px-4 py-3 font-semibold">Barang</th>
              <th class="px-4 py-3 text-right font-semibold">Terpakai</th>
              <th class="px-4 py-3 text-right font-semibold">Sisa</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-line">
            {st.rows.map((r, i) => (
              <tr key={r.barang_id}>
                <td class="px-4 py-3 font-medium">{r.nama}</td>
                <td class="num px-4 py-3 text-right font-bold">
                  {nf(r3(r.maks - st.sisa[i]!))} {r.satuan}
                </td>
                <td class="num px-4 py-3 text-right text-muted-fg">
                  {nf(st.sisa[i]!)} {r.satuan}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div>
        <Button variant="primary" size="lg" onClick={onHome}>
          <House size={20} aria-hidden /> Kembali ke beranda
        </Button>
      </div>
    </section>
  );
}
