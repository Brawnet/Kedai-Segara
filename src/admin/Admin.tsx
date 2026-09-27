import { useEffect, useMemo, useState } from 'preact/hooks';
import type { FunctionComponent } from 'preact';
import type { Icon } from '@phosphor-icons/react';
import {
  ArrowClockwise,
  ChartBar,
  ClipboardText,
  ClockCounterClockwise,
  DeviceTablet,
  DotsThreeOutline,
  DownloadSimple,
  Gear,
  HandGrabbing,
  Lock,
  Moon,
  Package,
  Scales,
  SignOut,
  SquaresFour,
  Sun,
  Users,
} from '@phosphor-icons/react';
import { call, pesan, pinSalah } from '../lib/api';
import { useApp } from '../lib/app';
import type { AdminData } from '../lib/types';
import { Button, Dialog, Field, Input, Skeleton, SyncStatusBadge } from '../components/ui';
import { Logo } from '../components/Logo';
import { Ctx, type AdminCtx } from './shared';
import { Dashboard } from './Dashboard';
import { BarangPage } from './Barang';
import { KaryawanPage } from './Karyawan';
import { MasukPage, ManualPage } from './Stok';
import { OpnamePage } from './Opname';
import { RekapPage } from './Rekap';
import { RiwayatPage } from './Riwayat';
import { LaporanPage } from './Laporan';
import { PengaturanPage } from './Pengaturan';

type Tab = 'dash' | 'barang' | 'karyawan' | 'masuk' | 'manual' | 'opname' | 'rekap' | 'riwayat' | 'laporan' | 'set';

const TABS: { k: Tab; label: string; icon: Icon; mobile?: boolean }[] = [
  { k: 'dash', label: 'Ringkasan', icon: SquaresFour, mobile: true },
  { k: 'masuk', label: 'Stok masuk', icon: DownloadSimple, mobile: true },
  { k: 'opname', label: 'Opname', icon: Scales, mobile: true },
  { k: 'riwayat', label: 'Riwayat', icon: ClockCounterClockwise, mobile: true },
  { k: 'rekap', label: 'Rekap', icon: ClipboardText },
  { k: 'barang', label: 'Barang', icon: Package },
  { k: 'karyawan', label: 'Karyawan', icon: Users },
  { k: 'manual', label: 'Ambil manual', icon: HandGrabbing },
  { k: 'laporan', label: 'Laporan', icon: ChartBar },
  { k: 'set', label: 'Pengaturan', icon: Gear },
];

const PAGES: Record<Tab, FunctionComponent> = {
  dash: Dashboard,
  barang: BarangPage,
  karyawan: KaryawanPage,
  masuk: MasukPage,
  manual: ManualPage,
  opname: OpnamePage,
  rekap: RekapPage,
  riwayat: RiwayatPage,
  laporan: LaporanPage,
  set: PengaturanPage,
};

const KEY = 'sg_pin';

// Web app Apps Script berjalan di iframe googleusercontent.com. Browser yang memblokir storage
// pihak ketiga (mis. Safari/iPad) melempar SecurityError saat sessionStorage diakses.
const sesi = {
  get: () => {
    try {
      return sessionStorage.getItem(KEY) || '';
    } catch {
      return '';
    }
  },
  set: (p: string) => {
    try {
      if (p) sessionStorage.setItem(KEY, p);
      else sessionStorage.removeItem(KEY);
    } catch {}
  },
};

export function Admin({ onTablet }: { onTablet: () => void }) {
  const { act, toast, theme, toggleTheme, busy } = useApp();
  const [pin, setPinState] = useState(sesi.get);
  const [d, setD] = useState<AdminData | null>(null);
  const [loadErr, setLoadErr] = useState('');
  const [tab, setTab] = useState<Tab>('dash');
  const [more, setMore] = useState(false);

  const setPin = (p: string) => {
    setPinState(p);
    sesi.set(p);
  };
  const logout = () => {
    setPin('');
    setD(null);
    setLoadErr('');
  };
  const onErr = (e: unknown) => pinSalah(e) && logout();

  const reload = async (): Promise<void> => {
    setLoadErr('');
    const r = await act('adminData', [pin], (e) => {
      onErr(e);
      setLoadErr(pesan(e));
    });
    if (r) {
      setD(r);
      setLoadErr('');
    }
  };
  useEffect(() => {
    if (pin && !d) reload();
  }, []);

  const ctx = useMemo<AdminCtx | null>(() => {
    if (!d) return null;
    const run: AdminCtx['run'] = async (fn, args, ok) => {
      const r = await act(fn, args, onErr);
      if (r === undefined) return undefined;
      toast(typeof ok === 'function' ? ok(r as never) : ok);
      // Jika ganti PIN, muat ulang dengan PIN baru agar tidak 'PIN salah'.
      const nextPin = fn === 'simpanPengaturan' && args[2] ? String(args[2]) : pin;
      if (nextPin !== pin) setPin(nextPin);
      // Muat ulang tanpa mengunci tombol (sama seperti versi lama).
      call('adminData', nextPin).then(setD, () => undefined);
      return r;
    };
    return {
      d,
      pin,
      setPin,
      logout,
      reload: () => reload(),
      run,
      A: (fn, args, ok) => run(fn, [pin, ...args] as never, ok as never) as never,
    };
  }, [d, pin]);

  const pilih = (k: Tab) => {
    setTab(k);
    setMore(false);
    window.scrollTo(0, 0);
  };

  if (!ctx) {
    if (pin) {
      if (loadErr) {
        return (
          <div class="mx-auto max-w-md py-16 text-center">
            <h1 class="text-2xl font-extrabold">Tidak bisa memuat data admin</h1>
            <p class="mt-2 text-muted-fg">{loadErr}</p>
            <div class="mt-6 flex justify-center gap-2">
              <Button variant="primary" onClick={() => reload()}>
                <ArrowClockwise size={20} aria-hidden /> Coba lagi
              </Button>
              <Button variant="secondary" onClick={logout}>
                <SignOut size={20} aria-hidden /> Keluar
              </Button>
            </div>
          </div>
        );
      }
      return (
        <div class="mx-auto max-w-6xl p-4 md:p-6 space-y-6 animate-rise">
          <div class="flex items-center justify-between border-b border-line pb-4">
            <Skeleton class="h-8 w-48" />
            <Skeleton class="h-8 w-24" />
          </div>
          <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} class="h-24 w-full" />
            ))}
          </div>
          <Skeleton class="h-64 w-full" />
        </div>
      );
    }
    return <Login onTablet={onTablet} onOk={(p, r) => (setPin(p), setD(r))} />;
  }

  const Page = PAGES[tab];
  const cur = TABS.find((t) => t.k === tab)!;
  const moreActive = !cur.mobile;

  return (
    <Ctx.Provider value={ctx}>
      <div class="min-h-dvh lg:pl-64">
        {/* Sidebar desktop */}
        <aside class="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-line bg-card lg:flex">
          <div class="flex h-16 items-center border-b border-line px-5">
            <Logo sub="Admin" />
          </div>
          <nav class="flex-1 overflow-y-auto p-3" aria-label="Menu admin">
            <ul class="flex flex-col gap-1">
              {TABS.map((t) => (
                <li key={t.k}>
                  <NavItem t={t} active={t.k === tab} onClick={() => pilih(t.k)} />
                </li>
              ))}
            </ul>
          </nav>
          <div class="flex flex-col gap-1 border-t border-line p-3">
            <Button variant="ghost" onClick={toggleTheme} class="justify-start">
              {theme === 'dark' ? <Sun size={20} aria-hidden /> : <Moon size={20} aria-hidden />}
              {theme === 'dark' ? 'Mode terang' : 'Mode gelap'}
            </Button>
            <Button variant="ghost" onClick={onTablet} class="justify-start">
              <DeviceTablet size={20} aria-hidden /> Mode tablet
            </Button>
            <Button variant="ghost" onClick={logout} class="justify-start">
              <SignOut size={20} aria-hidden /> Keluar
            </Button>
          </div>
        </aside>

        {/* Header */}
        <header class="sticky top-0 z-20 border-b border-line bg-card/95 backdrop-blur">
          <div class="mx-auto flex h-16 max-w-6xl items-center gap-2 px-4 md:px-6">
            <div class="lg:hidden">
              <Logo sub={cur.label} />
            </div>
            <p class="hidden text-sm font-semibold text-muted-fg lg:block">{cur.label}</p>
            <div class="ml-auto flex items-center gap-2">
              <SyncStatusBadge busy={busy} />
              <Button
                variant="ghost"
                onClick={toggleTheme}
                title={theme === 'dark' ? 'Mode terang' : 'Mode gelap'}
                aria-label={theme === 'dark' ? 'Mode terang' : 'Mode gelap'}
              >
                {theme === 'dark' ? <Sun size={20} aria-hidden /> : <Moon size={20} aria-hidden />}
              </Button>
              <Button variant="ghost" guard onClick={() => reload()} aria-label="Muat ulang data">
                <ArrowClockwise size={20} aria-hidden />
                <span class="hidden sm:inline">Muat ulang</span>
              </Button>
              <Button variant="ghost" onClick={onTablet} class="lg:hidden" aria-label="Mode tablet">
                <DeviceTablet size={20} aria-hidden />
              </Button>
              <Button variant="ghost" onClick={logout} class="lg:hidden" aria-label="Keluar">
                <SignOut size={20} aria-hidden />
              </Button>
            </div>
          </div>
        </header>

        <main class="animate-rise mx-auto max-w-6xl px-4 pb-28 pt-6 md:px-6 lg:pb-12" key={tab}>
          <Page />
        </main>

        {/* Tab bar ponsel/tablet */}
        <nav class="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-line bg-card lg:hidden" aria-label="Menu admin">
          <ul class="mx-auto grid max-w-xl grid-cols-5">
            {TABS.filter((t) => t.mobile).map((t) => (
              <li key={t.k}>
                <BottomItem label={t.label} icon={t.icon} active={t.k === tab} onClick={() => pilih(t.k)} />
              </li>
            ))}
            <li>
              <BottomItem label="Lainnya" icon={DotsThreeOutline} active={moreActive} onClick={() => setMore(true)} expanded={more} />
            </li>
          </ul>
        </nav>

        <Dialog open={more} onClose={() => setMore(false)} title="Menu lainnya">
          <ul class="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {TABS.filter((t) => !t.mobile).map((t) => (
              <li key={t.k}>
                <button
                  type="button"
                  onClick={() => pilih(t.k)}
                  aria-current={t.k === tab ? 'page' : undefined}
                  class={`flex min-h-20 w-full flex-col items-center justify-center gap-1.5 rounded-card border p-3 text-sm font-semibold transition-colors duration-150 ${
                    t.k === tab ? 'border-primary bg-primary-soft text-primary' : 'border-line hover:bg-muted'
                  }`}
                >
                  <t.icon size={26} aria-hidden />
                  {t.label}
                </button>
              </li>
            ))}
          </ul>
        </Dialog>
      </div>
    </Ctx.Provider>
  );
}

function NavItem({ t, active, onClick }: { t: (typeof TABS)[number]; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      class={`flex min-h-11 w-full items-center gap-3 rounded-ctl px-3 text-[15px] font-semibold transition-colors duration-150 ${
        active ? 'bg-primary-soft text-primary' : 'text-fg hover:bg-muted'
      }`}
    >
      <t.icon size={20} weight={active ? 'fill' : 'regular'} aria-hidden />
      {t.label}
    </button>
  );
}

function BottomItem({ label, icon: I, active, onClick, expanded }: { label: string; icon: Icon; active: boolean; onClick: () => void; expanded?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      aria-expanded={expanded}
      class={`flex h-16 w-full flex-col items-center justify-center gap-0.5 text-[11px] font-semibold transition-colors duration-150 ${
        active ? 'text-primary' : 'text-muted-fg hover:text-fg'
      }`}
    >
      <I size={24} weight={active ? 'fill' : 'regular'} aria-hidden />
      <span class="max-w-full truncate px-1">{label}</span>
    </button>
  );
}

function Login({ onOk, onTablet }: { onOk: (pin: string, d: AdminData) => void; onTablet: () => void }) {
  const { act, theme, toggleTheme } = useApp();
  const [p, setP] = useState('');
  const [err, setErr] = useState('');
  const masuk = async (e: Event) => {
    e.preventDefault();
    if (!p.trim()) return setErr('Masukkan PIN');
    setErr('');
    const r = await act('adminData', [p], (e) => pinSalah(e) && setErr('PIN salah. Coba lagi.'));
    if (r) onOk(p, r);
  };
  return (
    <div class="grid min-h-dvh place-items-center px-4 py-10">
      <div class="w-full max-w-sm">
        <div class="mb-6 flex justify-center">
          <Logo sub="Admin" />
        </div>
        <form onSubmit={masuk} class="flex flex-col gap-4 rounded-sheet border border-line bg-card p-6 shadow-sm">
          <div class="flex items-center gap-3">
            <span class="grid size-11 place-items-center rounded-full bg-primary-soft text-primary">
              <Lock size={22} weight="bold" aria-hidden />
            </span>
            <div>
              <h1 class="text-xl font-extrabold">Masuk admin</h1>
              <p class="text-sm text-muted-fg">Masukkan PIN untuk melanjutkan.</p>
            </div>
          </div>
          <Field label="PIN admin" error={err}>
            {(id, dId) => (
              <Input
                id={id}
                type="password"
                inputmode="numeric"
                autocomplete="current-password"
                value={p}
                onInput={(e) => setP(e.currentTarget.value)}
                aria-invalid={!!err}
                aria-describedby={dId}
                class="num min-h-12 text-lg tracking-widest"
                autoFocus
              />
            )}
          </Field>
          <Button type="submit" variant="primary" size="lg" guard>
            Masuk
          </Button>
        </form>
        <div class="mt-4 flex items-center justify-center gap-2">
          <Button variant="ghost" onClick={onTablet}>
            <DeviceTablet size={20} aria-hidden /> Kembali ke mode tablet
          </Button>
          <Button
            variant="ghost"
            onClick={toggleTheme}
            title={theme === 'dark' ? 'Mode terang' : 'Mode gelap'}
            aria-label={theme === 'dark' ? 'Mode terang' : 'Mode gelap'}
          >
            {theme === 'dark' ? <Sun size={20} aria-hidden /> : <Moon size={20} aria-hidden />}
          </Button>
        </div>
      </div>
    </div>
  );
}
