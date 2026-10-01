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
  LockKey,
  Moon,
  Package,
  Scales,
  SidebarSimple,
  SignOut,
  SquaresFour,
  Sun,
  Users,
} from '@phosphor-icons/react';
import { call, pesan, pinSalah } from '../lib/api';
import { useApp } from '../lib/app';
import type { AdminData, AuthSession } from '../lib/types';
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


export function Admin({
  onTablet,
  session,
  onLogout,
}: {
  onTablet: () => void;
  session?: AuthSession;
  onLogout?: () => void;
}) {
  const { act, toast, theme, toggleTheme, busy } = useApp();
  // PIN hanya disimpan di memori selama sesi komponen aktif (in-memory state).
  // Tidak disimpan ke sessionStorage/localStorage agar saat halaman di-refresh,
  // pengguna diwajibkan memasukkan PIN kembali demi keamanan.
  const [pin, setPin] = useState('');
  const [d, setD] = useState<AdminData | null>(null);
  const [loadErr, setLoadErr] = useState('');
  const [tab, setTab] = useState<Tab>(() => {
    try {
      const saved = sessionStorage.getItem('sg_admin_tab') as Tab;
      if (saved && TABS.some((t) => t.k === saved)) {
        return saved;
      }
    } catch {}
    return 'dash';
  });
  const [more, setMore] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem('sg_admin_sidebar_collapsed') === '1';
    } catch {
      return false;
    }
  });

  const toggleSidebar = (val?: boolean) => {
    setSidebarCollapsed((prev) => {
      const next = typeof val === 'boolean' ? val : !prev;
      try {
        localStorage.setItem('sg_admin_sidebar_collapsed', next ? '1' : '0');
      } catch {}
      return next;
    });
  };

  // Bersihkan sisa token PIN lama dari sessionStorage jika pernah tersimpan
  useEffect(() => {
    try {
      sessionStorage.removeItem('sg_pin');
    } catch {}
  }, []);

  const logout = () => {
    setPin('');
    setD(null);
    setLoadErr('');
    try {
      sessionStorage.removeItem('sg_pin');
      sessionStorage.removeItem('sg_admin_tab');
    } catch {}
  };
  const onErr = (e: unknown) => pinSalah(e) && logout();

  const reload = async (): Promise<void> => {
    if (!pin) return;
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

  const ctx = useMemo<AdminCtx | null>(() => {
    if (!d) return null;
    const run: AdminCtx['run'] = async (fn, args, ok) => {
      const r = await act(fn, args, onErr);
      if (r === undefined) return undefined;
      if (ok) toast(typeof ok === 'function' ? ok(r as never) : ok);
      // Jika ganti PIN, muat ulang dengan PIN baru agar tidak 'PIN salah'.
      const nextPin =
        fn === 'simpanPengaturan' && args[2]
          ? String(args[2])
          : fn === 'gantiAdminPin' && args[1]
            ? String(args[1])
            : pin;
      if (nextPin !== pin) setPin(nextPin);
      // Muat ulang tanpa mengunci tombol (tangani eror jika PIN salah/sesi habis)
      call('adminData', nextPin).then(setD, (err) => {
        onErr(err);
        toast(`Gagal memuat ulang data admin: ${pesan(err)}`, true);
      });
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
    try {
      sessionStorage.setItem('sg_admin_tab', k);
    } catch {}
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
    return (
      <Login
        onTablet={onTablet}
        session={session}
        onLogout={onLogout}
        onOk={(p, r) => (setPin(p), setD(r))}
      />
    );
  }

  const Page = PAGES[tab];
  const cur = TABS.find((t) => t.k === tab)!;
  const moreActive = !cur.mobile;

  return (
    <Ctx.Provider value={ctx}>
      <div class={`min-h-dvh transition-[padding] duration-200 ease-in-out ${sidebarCollapsed ? 'lg:pl-20' : 'lg:pl-64'}`}>
        {/* Sidebar desktop */}
        <aside
          class={`fixed inset-y-0 left-0 z-30 hidden flex-col border-r border-line bg-card lg:flex transition-[width] duration-200 ease-in-out ${
            sidebarCollapsed ? 'w-20' : 'w-64'
          }`}
        >
          <div class={`flex h-16 items-center border-b border-line ${sidebarCollapsed ? 'justify-center px-2' : 'justify-between px-4'}`}>
            {sidebarCollapsed ? (
              <button
                type="button"
                onClick={() => toggleSidebar(false)}
                title="Buka menu sidebar"
                aria-label="Buka menu sidebar"
                class="group relative flex size-10 items-center justify-center rounded-ctl border border-line bg-white dark:bg-card p-0.5 shadow-xs hover:border-primary transition-all cursor-pointer"
              >
                <Logo compact />
                <SidebarSimple
                  size={18}
                  weight="bold"
                  class="absolute opacity-0 group-hover:opacity-100 text-primary transition-opacity bg-card/90 size-full p-2.5 rounded-ctl"
                  aria-hidden
                />
              </button>
            ) : (
              <>
                <Logo sub="Admin" />
                <button
                  type="button"
                  onClick={() => toggleSidebar(true)}
                  title="Tutup menu sidebar"
                  aria-label="Tutup menu sidebar"
                  class="flex size-8 items-center justify-center rounded-lg text-muted-fg hover:bg-muted hover:text-fg transition-colors cursor-pointer"
                >
                  <SidebarSimple size={19} weight="bold" aria-hidden />
                </button>
              </>
            )}
          </div>
          <nav class={`flex-1 overflow-y-auto ${sidebarCollapsed ? 'px-2 py-3' : 'p-3'}`} aria-label="Menu admin">
            <ul class="flex flex-col gap-1">
              {TABS.map((t) => (
                <li key={t.k}>
                  <NavItem t={t} active={t.k === tab} onClick={() => pilih(t.k)} collapsed={sidebarCollapsed} />
                </li>
              ))}
            </ul>
          </nav>
          {session?.email && (
            sidebarCollapsed ? (
              <div class="flex justify-center py-2.5 border-t border-line bg-muted/40" title={`Terotentikasi: ${session.email}`}>
                <div class="flex size-8 items-center justify-center rounded-full bg-primary-soft text-xs font-bold text-primary">
                  {session.email.charAt(0).toUpperCase()}
                </div>
              </div>
            ) : (
              <div class="px-4 py-2 text-xs border-t border-line flex flex-col gap-0.5 bg-muted/40">
                <span class="text-muted-fg font-medium">Terotentikasi:</span>
                <span class="font-bold text-fg truncate" title={session.email}>{session.email}</span>
              </div>
            )
          )}
          <div class={`flex flex-col gap-1 border-t border-line ${sidebarCollapsed ? 'p-2 items-center' : 'p-3'}`}>
            <Button
              variant="ghost"
              onClick={toggleTheme}
              title={theme === 'dark' ? 'Mode terang' : 'Mode gelap'}
              aria-label={theme === 'dark' ? 'Mode terang' : 'Mode gelap'}
              class={sidebarCollapsed ? 'size-11 justify-center p-0' : 'justify-start'}
            >
              {theme === 'dark' ? <Sun size={20} aria-hidden /> : <Moon size={20} aria-hidden />}
              {!sidebarCollapsed && <span>{theme === 'dark' ? 'Mode terang' : 'Mode gelap'}</span>}
            </Button>
            <Button
              variant="ghost"
              onClick={onTablet}
              title="Mode tablet"
              aria-label="Mode tablet"
              class={sidebarCollapsed ? 'size-11 justify-center p-0' : 'justify-start'}
            >
              <DeviceTablet size={20} aria-hidden />
              {!sidebarCollapsed && <span>Mode tablet</span>}
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                logout();
                onLogout?.();
              }}
              title="Keluar Akun"
              aria-label="Keluar Akun"
              class={`text-danger hover:text-danger hover:bg-danger-soft ${sidebarCollapsed ? 'size-11 justify-center p-0' : 'justify-start'}`}
            >
              <SignOut size={20} aria-hidden />
              {!sidebarCollapsed && <span>Keluar Akun</span>}
            </Button>
            <Button
              variant="ghost"
              onClick={() => toggleSidebar()}
              title={sidebarCollapsed ? 'Buka menu sidebar' : 'Tutup menu sidebar'}
              aria-label={sidebarCollapsed ? 'Buka menu sidebar' : 'Tutup menu sidebar'}
              class={`text-muted-fg hover:text-fg ${sidebarCollapsed ? 'size-11 justify-center p-0' : 'justify-start'}`}
            >
              <SidebarSimple size={20} weight="bold" aria-hidden />
              {!sidebarCollapsed && <span>Ciutkan menu</span>}
            </Button>
          </div>
        </aside>

        {/* Header */}
        <header class="sticky top-0 z-20 border-b border-line bg-card/95 backdrop-blur safe-top">
          <div class="mx-auto flex h-16 max-w-6xl items-center gap-2 px-3 sm:px-4 md:px-6">
            <div class="min-w-0 shrink lg:hidden">
              <Logo sub={cur.label} />
            </div>
            <p class="hidden text-sm font-semibold text-muted-fg lg:block">{cur.label}</p>
            <div class="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
              <SyncStatusBadge busy={busy} />
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
              <Button
                size="sm"
                variant="ghost"
                guard
                onClick={() => reload()}
                aria-label="Muat ulang data"
                title="Muat ulang data"
                class="size-10 p-0 sm:size-auto sm:px-3 rounded-ctl"
              >
                <ArrowClockwise size={19} aria-hidden />
                <span class="hidden sm:inline">Muat ulang</span>
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={onTablet}
                class="lg:hidden size-10 p-0 sm:size-auto sm:px-3 rounded-ctl"
                aria-label="Mode tablet"
                title="Beralih ke mode tablet"
              >
                <DeviceTablet size={19} aria-hidden />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  logout();
                  onLogout?.();
                }}
                class="lg:hidden size-10 p-0 sm:size-auto sm:px-3 rounded-ctl text-danger hover:bg-danger-soft hover:text-danger"
                aria-label="Keluar akun"
                title="Keluar akun"
              >
                <SignOut size={19} aria-hidden />
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
          <div class="flex flex-col gap-5">
            <div>
              <p class="mb-2 text-xs font-bold uppercase tracking-wider text-muted-fg">Navigasi</p>
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
            </div>

            <div class="flex flex-col gap-2.5 border-t border-line pt-4">
              <p class="text-xs font-bold uppercase tracking-wider text-muted-fg">Sistem & Akun</p>

              {session?.email && (
                <div class="flex items-center gap-2.5 rounded-card border border-line bg-muted/50 p-3 text-xs">
                  <div class="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary-soft font-bold text-primary">
                    {session.email.charAt(0).toUpperCase()}
                  </div>
                  <div class="min-w-0 flex-1">
                    <div class="text-[11px] text-muted-fg">Terotentikasi sebagai</div>
                    <div class="font-bold text-fg truncate">{session.email}</div>
                  </div>
                </div>
              )}

              <div class="grid grid-cols-2 gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={toggleTheme}
                  class="justify-center text-xs"
                >
                  {theme === 'dark' ? <Sun size={18} aria-hidden /> : <Moon size={18} aria-hidden />}
                  {theme === 'dark' ? 'Mode terang' : 'Mode gelap'}
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setMore(false);
                    onTablet();
                  }}
                  class="justify-center text-xs"
                >
                  <DeviceTablet size={18} aria-hidden /> Mode tablet
                </Button>
              </div>

              <Button
                variant="danger-ghost"
                onClick={() => {
                  setMore(false);
                  logout();
                  onLogout?.();
                }}
                class="mt-1 w-full justify-center text-danger hover:bg-danger-soft hover:text-danger font-bold"
              >
                <SignOut size={19} weight="bold" aria-hidden /> Keluar Akun
              </Button>
            </div>
          </div>
        </Dialog>
      </div>
    </Ctx.Provider>
  );
}

function NavItem({
  t,
  active,
  onClick,
  collapsed,
}: {
  t: (typeof TABS)[number];
  active: boolean;
  onClick: () => void;
  collapsed?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={collapsed ? t.label : undefined}
      aria-label={t.label}
      aria-current={active ? 'page' : undefined}
      class={`flex min-h-11 w-full items-center rounded-ctl text-[15px] font-semibold transition-all duration-150 ${
        collapsed ? 'justify-center px-0' : 'gap-3 px-3'
      } ${
        active ? 'bg-primary-soft text-primary' : 'text-fg hover:bg-muted'
      }`}
    >
      <t.icon size={collapsed ? 22 : 20} weight={active ? 'fill' : 'regular'} aria-hidden />
      {!collapsed && <span class="truncate">{t.label}</span>}
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

function Login({
  onOk,
  onTablet,
  session,
  onLogout,
}: {
  onOk: (pin: string, d: AdminData) => void;
  onTablet: () => void;
  session?: AuthSession;
  onLogout?: () => void;
}) {
  const { act, toast, theme, toggleTheme } = useApp();
  const [p, setP] = useState('');
  const [err, setErr] = useState('');

  // Status PIN Akun
  const [statusLoaded, setStatusLoaded] = useState(false);
  const [punyaPin, setPunyaPin] = useState(true);

  // Form Setup PIN Baru (Force Setup untuk akun baru)
  const [setupP1, setSetupP1] = useState('');
  const [setupP2, setSetupP2] = useState('');
  const [errSetup, setErrSetup] = useState('');
  const errSetup1 = setupP1 && !/^\d{4,8}$/.test(setupP1) ? 'PIN harus 4–8 angka' : '';
  const errSetup2 = setupP1 && setupP2 !== setupP1 ? 'PIN konfirmasi tidak sama' : '';

  // Modal Lupa PIN via OTP
  const [modalReset, setModalReset] = useState(false);
  const [otpKirimBusy, setOtpKirimBusy] = useState(false);
  const [otpTerkirim, setOtpTerkirim] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [otpP1, setOtpP1] = useState('');
  const [otpP2, setOtpP2] = useState('');
  const [otpErr, setOtpErr] = useState('');
  const [otpBusy, setOtpBusy] = useState(false);
  const errOtp1 = otpP1 && !/^\d{4,8}$/.test(otpP1) ? 'PIN harus 4–8 angka' : '';
  const errOtp2 = otpP1 && otpP2 !== otpP1 ? 'PIN konfirmasi tidak sama' : '';

  useEffect(() => {
    let mounted = true;
    call('getAdminAuthStatus', session?.token)
      .then((st) => {
        if (mounted && st) {
          setPunyaPin(st.punyaPin);
          setStatusLoaded(true);
        }
      })
      .catch(() => {
        if (mounted) setStatusLoaded(true);
      });
    return () => {
      mounted = false;
    };
  }, [session?.token]);

  const masuk = async (e: Event) => {
    e.preventDefault();
    if (!p.trim()) return setErr('Masukkan PIN');
    setErr('');
    const r = await act('adminData', [p], (e) => pinSalah(e) && setErr('PIN salah. Coba lagi.'));
    if (r) onOk(p, r);
  };

  const handleSetupPin = async (e: Event) => {
    e.preventDefault();
    setErrSetup('');
    if (!setupP1.trim()) return setErrSetup('PIN wajib diisi');
    if (errSetup1 || errSetup2) return;
    const ok = await act('setupAdminPin', [setupP1], (e) => setErrSetup(pesan(e)));
    if (ok) {
      toast('PIN admin berhasil dibuat');
      const r = await act('adminData', [setupP1]);
      if (r) onOk(setupP1, r);
    }
  };

  const bukaModalReset = async () => {
    setModalReset(true);
    setOtpErr('');
    setOtpCode('');
    setOtpP1('');
    setOtpP2('');
    setOtpTerkirim(false);
    if (session?.email) {
      setOtpKirimBusy(true);
      try {
        const res = await call('requestOtp', session.email);
        if (res && res.success) {
          setOtpTerkirim(true);
          toast('Kode OTP telah dikirim ke email Anda');
        }
      } catch (e) {
        setOtpErr(pesan(e));
      } finally {
        setOtpKirimBusy(false);
      }
    }
  };

  const kirimUlangOtp = async () => {
    if (!session?.email) return;
    setOtpKirimBusy(true);
    setOtpErr('');
    try {
      const res = await call('requestOtp', session.email);
      if (res && res.success) {
        setOtpTerkirim(true);
        toast('Kode verifikasi baru telah dikirim');
      }
    } catch (e) {
      setOtpErr(pesan(e));
    } finally {
      setOtpKirimBusy(false);
    }
  };

  const handleResetPinSubmit = async (e: Event) => {
    e.preventDefault();
    if (!session?.email) return setOtpErr('Email sesi tidak ditemukan');
    if (!otpCode.trim()) return setOtpErr('Masukkan kode OTP verifikasi');
    if (!otpP1.trim()) return setOtpErr('Masukkan PIN baru');
    if (errOtp1 || errOtp2) return;

    setOtpBusy(true);
    setOtpErr('');
    try {
      const ok = await call('resetAdminPinWithOtp', session.email, otpCode, otpP1);
      if (ok) {
        toast('PIN admin berhasil diperbarui');
        setModalReset(false);
        const r = await call('adminData', otpP1);
        if (r) onOk(otpP1, r);
      }
    } catch (e) {
      setOtpErr(pesan(e));
    } finally {
      setOtpBusy(false);
    }
  };

  return (
    <div class="grid min-h-dvh place-items-center px-4 py-10">
      <div class="w-full max-w-sm">
        <div class="mb-6 flex justify-center">
          <Logo sub="Admin" />
        </div>

        {statusLoaded && !punyaPin ? (
          /* Form Buat PIN Pertama Kali (Force Setup) */
          <form onSubmit={handleSetupPin} class="flex flex-col gap-4 rounded-sheet border border-line bg-card p-6 shadow-sm">
            <div class="flex items-center gap-3">
              <span class="grid size-11 place-items-center rounded-full bg-primary-soft text-primary">
                <LockKey size={22} weight="bold" aria-hidden />
              </span>
              <div>
                <h1 class="text-xl font-extrabold">Buat PIN Admin</h1>
                <p class="text-xs text-muted-fg">Buat 4–8 angka PIN unik untuk akun Anda.</p>
              </div>
            </div>

            {session?.email && (
              <div class="rounded-ctl bg-muted/60 p-2.5 text-xs border border-line flex items-center justify-between">
                <div class="min-w-0">
                  <span class="text-muted-fg block">Akun terverifikasi:</span>
                  <span class="font-bold text-fg truncate block" title={session.email}>{session.email}</span>
                </div>
                {onLogout && (
                  <button
                    type="button"
                    onClick={onLogout}
                    class="text-xs font-semibold text-primary hover:underline shrink-0 ml-2 cursor-pointer"
                  >
                    Ganti Akun
                  </button>
                )}
              </div>
            )}

            {errSetup && (
              <div class="rounded-ctl bg-danger-soft p-2.5 text-xs text-danger font-medium">
                {errSetup}
              </div>
            )}

            <Field label="PIN Baru (4–8 angka)" error={errSetup1}>
              {(id, dId) => (
                <Input
                  id={id}
                  type="password"
                  inputmode="numeric"
                  autocomplete="new-password"
                  value={setupP1}
                  onInput={(e) => setSetupP1(e.currentTarget.value)}
                  aria-invalid={!!errSetup1}
                  aria-describedby={dId}
                  class="num min-h-12 text-lg tracking-widest"
                  autoFocus
                />
              )}
            </Field>

            <Field label="Ulangi PIN Baru" error={errSetup2}>
              {(id, dId) => (
                <Input
                  id={id}
                  type="password"
                  inputmode="numeric"
                  autocomplete="new-password"
                  value={setupP2}
                  onInput={(e) => setSetupP2(e.currentTarget.value)}
                  aria-invalid={!!errSetup2}
                  aria-describedby={dId}
                  class="num min-h-12 text-lg tracking-widest"
                />
              )}
            </Field>

            <Button type="submit" variant="primary" size="lg" guard disabled={!setupP1 || !!errSetup1 || !!errSetup2}>
              Simpan PIN & Masuk
            </Button>
          </form>
        ) : (
          /* Form Masuk Admin Rutin */
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

            {session?.email && (
              <div class="rounded-ctl bg-muted/60 p-2.5 text-xs border border-line flex items-center justify-between">
                <div class="min-w-0">
                  <span class="text-muted-fg block">Akun terverifikasi:</span>
                  <span class="font-bold text-fg truncate block" title={session.email}>{session.email}</span>
                </div>
                {onLogout && (
                  <button
                    type="button"
                    onClick={onLogout}
                    class="text-xs font-semibold text-primary hover:underline shrink-0 ml-2 cursor-pointer"
                  >
                    Ganti Akun
                  </button>
                )}
              </div>
            )}

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

            <div class="flex items-center justify-between text-xs pt-1">
              <button
                type="button"
                onClick={bukaModalReset}
                class="text-primary hover:underline font-medium cursor-pointer"
              >
                Lupa PIN?
              </button>
            </div>

            <Button type="submit" variant="primary" size="lg" guard>
              Masuk
            </Button>
          </form>
        )}

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

      {/* Dialog Modal Lupa PIN via OTP */}
      <Dialog
        open={modalReset}
        onClose={() => setModalReset(false)}
        title="Reset PIN Admin"
      >
        <p class="text-xs text-muted-fg -mt-2 mb-3">
          Kode verifikasi dikirim ke <strong>{session?.email || 'email Anda'}</strong>.
        </p>
        <form onSubmit={handleResetPinSubmit} class="flex flex-col gap-4 pt-2">
          {otpErr && (
            <div class="rounded-ctl bg-danger-soft p-2.5 text-xs text-danger font-medium">
              {otpErr}
            </div>
          )}

          {otpTerkirim && (
            <div class="rounded-ctl bg-success-soft p-2.5 text-xs text-success font-medium">
              Kode verifikasi telah dikirim ke email <strong>{session?.email}</strong>. Berlaku 5 menit.
            </div>
          )}

          <Field label="Kode Verifikasi (OTP)" hint="6 digit angka dari email">
            {(id, dId) => (
              <div class="flex gap-2">
                <Input
                  id={id}
                  type="text"
                  inputmode="numeric"
                  maxlength={6}
                  value={otpCode}
                  onInput={(e) => setOtpCode(e.currentTarget.value)}
                  aria-describedby={dId}
                  class="num font-mono tracking-widest text-base"
                  placeholder="123456"
                  autoFocus
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="md"
                  onClick={kirimUlangOtp}
                  disabled={otpKirimBusy}
                  class="shrink-0 text-xs"
                >
                  {otpKirimBusy ? 'Mengirim…' : 'Kirim Ulang'}
                </Button>
              </div>
            )}
          </Field>

          <Field label="PIN Baru (4–8 angka)" error={errOtp1}>
            {(id, dId) => (
              <Input
                id={id}
                type="password"
                inputmode="numeric"
                autocomplete="new-password"
                value={otpP1}
                onInput={(e) => setOtpP1(e.currentTarget.value)}
                aria-invalid={!!errOtp1}
                aria-describedby={dId}
                class="num text-base tracking-widest"
              />
            )}
          </Field>

          <Field label="Ulangi PIN Baru" error={errOtp2}>
            {(id, dId) => (
              <Input
                id={id}
                type="password"
                inputmode="numeric"
                autocomplete="new-password"
                value={otpP2}
                onInput={(e) => setOtpP2(e.currentTarget.value)}
                aria-invalid={!!errOtp2}
                aria-describedby={dId}
                class="num text-base tracking-widest"
              />
            )}
          </Field>

          <div class="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setModalReset(false)} disabled={otpBusy}>
              Batal
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={otpBusy || !otpCode || !otpP1 || !!errOtp1 || !!errOtp2}
            >
              {otpBusy ? 'Menyimpan…' : 'Reset PIN & Masuk'}
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
