import { useEffect, useState } from 'preact/hooks';
import {
  ArrowSquareOut,
  ArrowsClockwise,
  CheckCircle,
  Clock,
  Database,
  DeviceTablet,
  EnvelopeSimple,
  FolderSimple,
  GoogleLogo,
  Key,
  Link,
   LockKey,
   Moon,
  PencilSimple,
   ShieldCheck,
   Sun,
   Trash,
  UserPlus,
  Warning,
  WarningCircle,
} from '@phosphor-icons/react';
import { call, pesan } from '../lib/api';
import { formatNamaAdmin } from '../lib/format';
import { useApp } from '../lib/app';
import type { AuthAccount, LoginLog, PublicAuthConfig } from '../lib/types';
import { Button, Card, Confirm, Dialog, Field, Input, PageTitle, Select, Tag } from '../components/ui';
import { useAdmin } from './shared';
import { KelolaKategoriDialog } from './KelolaKategoriDialog';

type SubTab = 'umum' | 'akun' | 'log';

export function PengaturanPage() {
  const { d, pin, A, setPin } = useAdmin();
  const { theme, setTheme, toast } = useApp();

  const [tab, setTab] = useState<SubTab>('umum');

  const [modalKat, setModalKat] = useState(false);
  // Pengaturan umum
  const [jam, setJam] = useState(d.jamTutup);
  const [pinLama, setPinLama] = useState('');
  const [pinBaru, setPinBaru] = useState('');
  const [pinKonf, setPinKonf] = useState('');
  const [errGantiPin, setErrGantiPin] = useState('');
  const eGanti1 = pinBaru && !/^\d{4,8}$/.test(pinBaru) ? 'PIN harus 4–8 angka' : '';
  const eGanti2 = pinBaru && pinKonf !== pinBaru ? 'Konfirmasi PIN tidak sama' : '';
  // Akun Whitelist
  const [accounts, setAccounts] = useState<AuthAccount[]>([]);
  const [loadingAcc, setLoadingAcc] = useState(false);
  const [modalTambah, setModalTambah] = useState(false);
  const [emailBaru, setEmailBaru] = useState('');
  const [roleBaru, setRoleBaru] = useState<'admin' | 'tablet'>('tablet');
   const [errTambah, setErrTambah] = useState('');
   const [hapusTarget, setHapusTarget] = useState<string | null>(null);
  const [namaBaru, setNamaBaru] = useState('');
  const [editTarget, setEditTarget] = useState<AuthAccount | null>(null);
  const [namaEdit, setNamaEdit] = useState('');
  const [roleEdit, setRoleEdit] = useState<'admin' | 'tablet'>('tablet');
  const [errEdit, setErrEdit] = useState('');

  // Google OAuth Client ID
  const [authConfig, setAuthConfig] = useState<PublicAuthConfig>({ hasGoogleAuth: false, googleClientId: '' });
  const [clientIdInput, setClientIdInput] = useState('');

  // Riwayat Login
  const [logs, setLogs] = useState<LoginLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  // Muat akun saat tab akun dibuka
  const muatAkun = async () => {
    setLoadingAcc(true);
    try {
      const res = await call('getAuthAccounts', pin);
      if (res) setAccounts(res);
      const conf = await call('getPublicAuthConfig');
      if (conf) {
        setAuthConfig(conf);
        setClientIdInput(conf.googleClientId || '');
      }
    } catch (e) {
      toast(`Gagal memuat akun: ${pesan(e)}`, true);
      console.warn('Gagal memuat akun auth:', e);
    } finally {
      setLoadingAcc(false);
    }
  };

  // Muat riwayat saat tab log dibuka
  const muatLogs = async () => {
    setLoadingLogs(true);
    try {
      const res = await call('getLoginHistory', pin, 100);
      if (res) setLogs(res);
    } catch (e) {
      toast(`Gagal memuat riwayat login: ${pesan(e)}`, true);
      console.warn('Gagal memuat riwayat login:', e);
    } finally {
      setLoadingLogs(false);
    }
  };

  useEffect(() => {
    if (tab === 'akun') muatAkun();
    if (tab === 'log') muatLogs();
  }, [tab]);

  const simpanJam = async (e: Event) => {
    e.preventDefault();
    await A('simpanPengaturan', [jam, ''], 'Jam operasional disimpan');
  };

  const handleGantiPin = async (e: Event) => {
    e.preventDefault();
    setErrGantiPin('');
    if (!pinLama.trim()) return setErrGantiPin('PIN lama wajib diisi');
    if (!pinBaru.trim()) return setErrGantiPin('PIN baru wajib diisi');
    if (eGanti1 || eGanti2) return;

    try {
      const ok = await call('gantiAdminPin', pinLama, pinBaru);
      if (ok) {
        setPin(pinBaru);
        toast('PIN admin akun Anda berhasil diperbarui');
        setPinLama('');
        setPinBaru('');
        setPinKonf('');
      }
    } catch (err) {
      setErrGantiPin(pesan(err));
      toast(`Gagal mengganti PIN: ${pesan(err)}`, true);
    }
  };
  const simpanAkunBaru = async (e: Event) => {
    e.preventDefault();
    setErrTambah('');
    const em = emailBaru.toLowerCase().trim();
    if (!em || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) {
      setErrTambah('Format email tidak valid.');
      return;
    }
    const ok = await A('simpanAuthAccount', [em, roleBaru, true, namaBaru.trim()], 'Akun berhasil ditambahkan ke whitelist');
     if (ok) {
       setModalTambah(false);
       setEmailBaru('');
      setNamaBaru('');
       setRoleBaru('tablet');
       muatAkun();
     }
  };

  const handleSimpanEdit = async (e: Event) => {
    e.preventDefault();
    if (!editTarget) return;
    setErrEdit('');
    const ok = await A(
      'simpanAuthAccount',
      [editTarget.email, roleEdit, editTarget.aktif, namaEdit.trim()],
      'Perubahan akun berhasil disimpan',
    );
    if (ok) {
      setEditTarget(null);
      setNamaEdit('');
      muatAkun();
    }
  };

  const toggleAktifAkun = async (acc: AuthAccount) => {
    const ok = await A(
      'simpanAuthAccount',
      [acc.email, acc.role, !acc.aktif, acc.nama || ''],
      acc.aktif ? 'Akses akun dinonaktifkan' : 'Akses akun diaktifkan',
    );
    if (ok) muatAkun();
  };

  const konfirmasiHapus = async () => {
    if (!hapusTarget) return;
    const ok = await A('hapusAuthAccount', [hapusTarget], 'Akun dihapus dari whitelist');
    if (ok) {
      setHapusTarget(null);
      muatAkun();
    }
  };

  const simpanClientId = async (e: Event) => {
    e.preventDefault();
    const ok = await A('simpanGoogleClientId', [clientIdInput.trim()], 'Google Client ID disimpan');
    if (ok) muatAkun();
  };

  return (
    <div class="flex flex-col gap-6">
      <PageTitle kicker="Sistem" title="Pengaturan" />

      {/* Navigasi Sub-Tab */}
      <div class="flex border-b border-line gap-2 overflow-x-auto pb-px">
        {[
          { id: 'umum', label: 'Umum & Tampilan', icon: Clock },
          { id: 'akun', label: 'Akses Akun (Google / iCloud)', icon: ShieldCheck },
          { id: 'log', label: 'Riwayat Login', icon: Key },
        ].map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id as SubTab)}
              class={`flex min-h-11 items-center gap-2 whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors cursor-pointer select-none ${
                active
                  ? 'border-primary text-primary font-bold'
                  : 'border-transparent text-muted-fg hover:text-fg hover:border-line'
              }`}
            >
              <Icon size={18} weight={active ? 'bold' : 'regular'} aria-hidden />
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* TAB 1: UMUM */}
      {tab === 'umum' && (
        <div class="flex flex-col gap-6">
          <Card class="p-4 md:p-5">
            <form onSubmit={simpanJam} class="flex flex-col gap-4" noValidate>
              <div class="flex items-center gap-2 font-bold">
                <Clock size={20} aria-hidden /> Jam operasional
              </div>
              <Field label="Jam tutup" hint="Tablet mengingatkan rekap 30 menit sebelumnya." class="max-w-xs">
                {(id, dId) => (
                  <Input
                    id={id}
                    type="time"
                    value={jam}
                    onInput={(e) => setJam(e.currentTarget.value)}
                    aria-describedby={dId}
                  />
                )}
              </Field>
              <div>
                <Button type="submit" variant="primary" guard>
                  Simpan jam operasional
                </Button>
              </div>
            </form>
          </Card>

          <Card class="p-4 md:p-5">
            <form onSubmit={handleGantiPin} class="flex flex-col gap-4" noValidate>
              <div class="flex items-center gap-2 font-bold">
                <Key size={20} aria-hidden /> Ganti PIN Saya
              </div>
              <p class="text-xs text-muted-fg -mt-2">
                Ubah PIN admin untuk akun Anda saat ini. PIN bersifat pribadi dan tidak mempengaruhi akun admin lainnya.
              </p>

              {errGantiPin && (
                <div class="rounded-ctl bg-danger-soft p-2.5 text-xs text-danger font-medium">
                  {errGantiPin}
                </div>
              )}

              <div class="grid gap-4 sm:grid-cols-3">
                <Field label="PIN lama" hint="PIN saat ini">
                  {(id, dId) => (
                    <Input
                      id={id}
                      type="password"
                      inputmode="numeric"
                      autocomplete="current-password"
                      value={pinLama}
                      onInput={(e) => setPinLama(e.currentTarget.value)}
                      aria-describedby={dId}
                      class="num"
                    />
                  )}
                </Field>
                <Field label="PIN baru" hint="4–8 angka" error={eGanti1}>
                  {(id, dId) => (
                    <Input
                      id={id}
                      type="password"
                      inputmode="numeric"
                      autocomplete="new-password"
                      value={pinBaru}
                      onInput={(e) => setPinBaru(e.currentTarget.value)}
                      aria-invalid={!!eGanti1}
                      aria-describedby={dId}
                      class="num"
                    />
                  )}
                </Field>
                <Field label="Ulangi PIN baru" error={eGanti2}>
                  {(id, dId) => (
                    <Input
                      id={id}
                      type="password"
                      inputmode="numeric"
                      autocomplete="new-password"
                      value={pinKonf}
                      onInput={(e) => setPinKonf(e.currentTarget.value)}
                      disabled={!pinBaru}
                      aria-invalid={!!eGanti2}
                      aria-describedby={dId}
                      class="num"
                    />
                  )}
                </Field>
              </div>
              <div>
                <Button
                  type="submit"
                  variant="primary"
                  guard
                  disabled={!pinLama || !pinBaru || !pinKonf || !!eGanti1 || !!eGanti2}
                >
                  Ganti PIN
                </Button>
              </div>
            </form>
          </Card>

          <Card class="flex flex-col gap-4 p-4 md:p-5">
            <div class="flex items-center gap-2 font-bold">
              <Moon size={20} aria-hidden /> Tema tampilan
            </div>
            <p class="text-sm text-muted-fg">Pilih tampilan aplikasi untuk tablet dapur dan dashboard admin.</p>
            <div class="grid grid-cols-2 gap-3 max-w-md">
              <button
                type="button"
                onClick={() => setTheme('light')}
                class={`flex items-center justify-center gap-2.5 rounded-card border p-3 text-sm font-bold transition-all duration-150 cursor-pointer ${
                  theme === 'light'
                    ? 'border-primary bg-primary-soft text-primary ring-2 ring-primary/20 shadow-xs'
                    : 'border-line bg-card text-muted-fg hover:border-line-strong hover:bg-muted'
                }`}
              >
                <Sun size={20} weight={theme === 'light' ? 'bold' : 'regular'} aria-hidden />
                Mode Terang
              </button>
              <button
                type="button"
                onClick={() => setTheme('dark')}
                class={`flex items-center justify-center gap-2.5 rounded-card border p-3 text-sm font-bold transition-all duration-150 cursor-pointer ${
                  theme === 'dark'
                    ? 'border-primary bg-primary-soft text-primary ring-2 ring-primary/20 shadow-xs'
                    : 'border-line bg-card text-muted-fg hover:border-line-strong hover:bg-muted'
                }`}
              >
                <Moon size={20} weight={theme === 'dark' ? 'bold' : 'regular'} aria-hidden />
                Mode Gelap
              </button>
            </div>
          </Card>
          <Card class="flex flex-col gap-3 p-4 md:p-5">
            <div class="flex items-center justify-between gap-2">
              <div class="flex items-center gap-2 font-bold">
                <FolderSimple size={20} aria-hidden /> Kategori Barang
              </div>
              <Tag>{(d.urutan || []).length} kategori terdaftar</Tag>
            </div>
            <p class="text-sm text-muted-fg leading-relaxed">
              Kelola kategori untuk mengelompokkan barang pada tablet dapur dan laporan. Menghapus kategori tidak akan menghapus data barang ataupun riwayat transaksi.
            </p>
            <div>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setModalKat(true)}
                class="min-h-11 font-semibold"
              >
                <FolderSimple size={18} weight="bold" aria-hidden /> Kelola & Hapus Kategori
              </Button>
            </div>
          </Card>

          <div class="grid gap-4 md:grid-cols-2">
            <Card class="flex flex-col gap-2 p-4 md:p-5">
              <div class="flex items-center gap-2 font-bold">
                <Database size={20} aria-hidden /> Data
              </div>
              <p class="text-muted-fg text-sm">
                Semua data tersimpan di Google Sheet. Jangan ubah kolom <code class="rounded bg-muted px-1">id</code> dan
                judul kolom.
              </p>
              <a
                href={d.url}
                target="_blank"
                rel="noopener"
                class="inline-flex min-h-11 items-center gap-1 font-semibold text-primary hover:underline"
              >
                Buka Google Sheet <ArrowSquareOut size={16} aria-hidden />
              </a>
            </Card>
            <Card class="flex flex-col gap-2 p-4 md:p-5">
              <div class="flex items-center gap-2 font-bold">
                <Link size={20} aria-hidden /> Link
              </div>
              <p class="text-muted-fg text-sm">
                Tablet: URL web app ini. Admin langsung: tambahkan <code class="rounded bg-muted px-1">?mode=admin</code> di
                akhir URL.
              </p>
            </Card>
          </div>
        </div>
      )}

      {/* TAB 2: AKSES AKUN & WHITELIST */}
      {tab === 'akun' && (
        <div class="flex flex-col gap-6">
          {/* Header & Tambah Akun */}
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 class="text-lg font-bold">Whitelist Akun (Google & iCloud)</h2>
              <p class="text-sm text-muted-fg">Hanya akun di bawah ini yang dapat masuk ke dalam sistem.</p>
            </div>
            <div class="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={muatAkun} loading={loadingAcc} title="Muat ulang akun">
                <ArrowsClockwise size={18} aria-hidden />
              </Button>
              <Button variant="primary" size="sm" onClick={() => setModalTambah(true)}>
                <UserPlus size={18} weight="bold" aria-hidden /> Tambah Akun
              </Button>
            </div>
          </div>

          {/* Tabel Akun Whitelist */}
          <div class="overflow-x-auto rounded-card border border-line bg-card shadow-sm">
            <table class="w-full text-left text-[14px]">
              <thead class="bg-muted text-xs text-muted-fg uppercase tracking-wider">
                <tr>
                  <th scope="col" class="px-4 py-3 font-semibold">Email</th>
                  <th scope="col" class="px-4 py-3 font-semibold">Role</th>
                  <th scope="col" class="px-4 py-3 font-semibold">Status PIN</th>
                  <th scope="col" class="px-4 py-3 font-semibold">Status</th>
                  <th scope="col" class="px-4 py-3 font-semibold text-right">Aksi</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-line">
                {accounts.length === 0 ? (
                  <tr>
                    <td colSpan={5} class="p-6 text-center text-muted-fg">
                      {loadingAcc ? 'Memuat akun…' : 'Belum ada akun di whitelist.'}
                    </td>
                  </tr>
                ) : (
                  accounts.map((acc) => (
                    <tr key={acc.email} class="transition-colors hover:bg-bg">
                      <td class="px-4 py-3 font-medium">
                        <div class="flex flex-col">
                          <div class="flex items-center gap-2">
                            {acc.email.endsWith('@gmail.com') ? (
                              <GoogleLogo size={18} weight="bold" class="text-primary shrink-0" aria-hidden />
                            ) : (
                              <EnvelopeSimple size={18} class="text-muted-fg shrink-0" aria-hidden />
                            )}
                            <span class="font-semibold text-fg break-all">{acc.email}</span>
                          </div>
                          {acc.role === 'admin' && (
                            <span class="text-xs text-muted-fg mt-0.5 pl-6.5">
                              Nama Admin: <strong class="text-fg font-semibold">{acc.nama || `${formatNamaAdmin('', acc.email)} (default)`}</strong>
                            </span>
                          )}
                        </div>
                      </td>
                      <td class="px-4 py-3">
                        {acc.role === 'admin' ? (
                          <Tag tone="primary">
                            <span class="inline-flex items-center gap-1">
                              <ShieldCheck size={14} weight="fill" aria-hidden />
                              <span>Admin Penuh</span>
                            </span>
                          </Tag>
                        ) : (
                          <Tag tone="neutral">
                            <span class="inline-flex items-center gap-1">
                              <DeviceTablet size={14} aria-hidden />
                              <span>Tablet Saja</span>
                            </span>
                          </Tag>
                        )}
                      </td>
                      <td class="px-4 py-3">
                        {acc.role === 'admin' ? (
                          acc.punyaPin ? (
                            <Tag tone="success">
                              <span class="inline-flex items-center gap-1">
                                <LockKey size={13} weight="bold" aria-hidden />
                                <span>PIN Aktif</span>
                              </span>
                            </Tag>
                          ) : (
                            <Tag tone="warning">
                              <span class="inline-flex items-center gap-1">
                                <Warning size={13} weight="bold" aria-hidden />
                                <span>Belum Setel</span>
                              </span>
                            </Tag>
                          )
                        ) : (
                          <span class="text-muted-fg text-xs">—</span>
                        )}
                      </td>
                      <td class="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => toggleAktifAkun(acc)}
                          class="cursor-pointer select-none"
                          title="Klik untuk ubah status"
                        >
                          {acc.aktif ? (
                            <Tag tone="success">Aktif</Tag>
                          ) : (
                            <Tag tone="danger">Nonaktif</Tag>
                          )}
                        </button>
                      </td>
                      <td class="px-4 py-3 text-right">
                        <div class="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setEditTarget(acc);
                              setNamaEdit(acc.nama || '');
                              setRoleEdit(acc.role);
                              setErrEdit('');
                            }}
                            aria-label={`Edit ${acc.email}`}
                            title="Edit nama dan role akun"
                          >
                            <PencilSimple size={16} aria-hidden />
                          </Button>
                          <Button
                            variant="danger-ghost"
                            size="sm"
                            onClick={() => setHapusTarget(acc.email)}
                            aria-label={`Hapus ${acc.email}`}
                            title="Hapus dari whitelist"
                          >
                            <Trash size={16} aria-hidden />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Konfigurasi Google Client ID */}
          <Card class="p-5 flex flex-col gap-4 border-line">
            <div class="flex items-center justify-between gap-2 border-b border-line pb-3">
              <div class="flex items-center gap-2 font-bold text-base">
                <GoogleLogo size={20} weight="bold" class="text-primary" aria-hidden />
                <span>Google Sign-In (OAuth Client ID)</span>
              </div>
              {authConfig.hasGoogleAuth ? (
                <Tag tone="success">Tombol Google Aktif</Tag>
              ) : (
                <Tag tone="warning">Mode OTP Email Aktif</Tag>
              )}
            </div>
            <p class="text-sm text-muted-fg">
              Pasang <strong>OAuth Client ID</strong> dari Google Cloud Console agar tombol <em>"Sign in with Google"</em> muncul. Jika dikosongkan, pengguna tetap dapat login aman via kode OTP email.
            </p>
            <form onSubmit={simpanClientId} class="flex flex-col sm:flex-row gap-3 items-end">
              <Field label="Google OAuth Client ID" hint="Berakhir dengan .apps.googleusercontent.com" class="flex-1">
                {(id, dId) => (
                  <Input
                    id={id}
                    type="text"
                    value={clientIdInput}
                    onInput={(e) => setClientIdInput(e.currentTarget.value)}
                    placeholder="Contoh: 123456789-abc.apps.googleusercontent.com"
                    aria-describedby={dId}
                  />
                )}
              </Field>
              <Button type="submit" variant="primary" class="shrink-0 min-h-11">
                Simpan Client ID
              </Button>
            </form>
          </Card>
        </div>
      )}

      {/* TAB 3: RIWAYAT LOGIN */}
      {tab === 'log' && (
        <div class="flex flex-col gap-4">
          <div class="flex items-center justify-between gap-3">
            <div>
              <h2 class="text-lg font-bold">Riwayat Akses & Login</h2>
              <p class="text-sm text-muted-fg">Audit trail 100 aktivitas login terakhir ke sistem.</p>
            </div>
            <Button variant="secondary" size="sm" onClick={muatLogs} loading={loadingLogs}>
              <ArrowsClockwise size={18} aria-hidden /> Segarkan
            </Button>
          </div>

          <div class="overflow-x-auto rounded-card border border-line bg-card shadow-sm">
            <table class="w-full text-left text-[14px]">
              <thead class="bg-muted text-xs text-muted-fg uppercase tracking-wider">
                <tr>
                  <th scope="col" class="px-4 py-3 font-semibold">Waktu</th>
                  <th scope="col" class="px-4 py-3 font-semibold">Email</th>
                  <th scope="col" class="px-4 py-3 font-semibold">Metode</th>
                  <th scope="col" class="px-4 py-3 font-semibold">Role</th>
                  <th scope="col" class="px-4 py-3 font-semibold">Status</th>
                  <th scope="col" class="px-4 py-3 font-semibold">Info Perangkat</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-line">
                {logs.length === 0 ? (
                  <tr>
                    <td colSpan={6} class="p-6 text-center text-muted-fg">
                      {loadingLogs ? 'Memuat riwayat…' : 'Belum ada catatan riwayat login.'}
                    </td>
                  </tr>
                ) : (
                  logs.map((l) => {
                    const isSuccess = l.status.startsWith('BERHASIL');
                    return (
                      <tr key={l.id} class="transition-colors hover:bg-bg">
                        <td class="px-4 py-3 whitespace-nowrap text-muted-fg font-medium">{l.waktu}</td>
                        <td class="px-4 py-3 font-semibold text-fg">{l.email}</td>
                        <td class="px-4 py-3">
                          <span class="rounded bg-muted px-2 py-0.5 text-xs font-bold">{l.metode}</span>
                        </td>
                        <td class="px-4 py-3 text-xs uppercase font-bold text-muted-fg">{l.role}</td>
                        <td class="px-4 py-3">
                          <Tag tone={isSuccess ? 'success' : 'danger'}>
                            <span class="inline-flex items-center gap-1 text-xs">
                              {isSuccess ? (
                                <CheckCircle size={14} weight="fill" aria-hidden />
                              ) : (
                                <WarningCircle size={14} weight="fill" aria-hidden />
                              )}
                              <span>{l.status}</span>
                            </span>
                          </Tag>
                        </td>
                        <td class="px-4 py-3 text-xs text-muted-fg truncate max-w-[200px]" title={l.user_agent}>
                          {l.user_agent || '—'}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Dialog Tambah Akun Whitelist */}
      <Dialog
        open={modalTambah}
        onClose={() => setModalTambah(false)}
        title="Tambah Akun ke Whitelist"
        footer={
          <div class="flex w-full justify-end gap-2">
            <Button onClick={() => setModalTambah(false)}>Batal</Button>
            <Button variant="primary" type="submit" form="form-tambah-akun">
              Simpan Akun
            </Button>
          </div>
        }
      >
        <form id="form-tambah-akun" onSubmit={simpanAkunBaru} class="flex flex-col gap-4">
          {errTambah && (
            <div class="rounded-ctl border border-danger/30 bg-danger-soft p-3 text-sm text-danger font-medium">
              {errTambah}
            </div>
          )}
          <Field label="Alamat Email (Google / iCloud / Lainnya)" hint="Akun ini akan diizinkan login ke sistem.">
            {(id, dId) => (
              <Input
                id={id}
                type="email"
                required
                value={emailBaru}
                onInput={(e) => setEmailBaru(e.currentTarget.value)}
                placeholder="nama@gmail.com atau nama@icloud.com"
                aria-describedby={dId}
              />
            )}
          </Field>
          <Field label="Hak Akses (Role)" hint="Pilih hak akses untuk akun ini.">
            {(id) => (
              <Select
                id={id}
                value={roleBaru}
                onChange={(e) => setRoleBaru(e.currentTarget.value as 'admin' | 'tablet')}
              >
                <option value="tablet">Tablet Saja (Perangkat Dapur/Resto - Sesi 30 Hari)</option>
                <option value="admin">Admin Penuh (Dashboard, Master, Rekap, Pengaturan - 2FA PIN)</option>
              </Select>
            )}
          </Field>
          {roleBaru === 'admin' && (
            <Field
              label="Nama Panggilan / Nama Admin"
              hint={`Nama yang dicatat di transaksi saat admin ini input stok/produksi (opsional). Default: ${formatNamaAdmin('', emailBaru) || 'Nama email'}`}
            >
              {(id, dId) => (
                <Input
                  id={id}
                  type="text"
                  maxLength={50}
                  value={namaBaru}
                  onInput={(e) => setNamaBaru(e.currentTarget.value)}
                  placeholder={`mis. Budi (default: ${formatNamaAdmin('', emailBaru) || 'Nama email'})`}
                  aria-describedby={dId}
                />
              )}
            </Field>
          )}
          {roleBaru === 'admin' && (
            <div class="rounded-ctl bg-primary-soft p-2.5 text-xs text-primary font-medium flex items-center gap-2">
              <LockKey size={16} weight="bold" class="shrink-0" aria-hidden />
              <span>Admin baru akan dipandu untuk membuat PIN pribadinya saat pertama kali masuk.</span>
            </div>
          )}
        </form>
      </Dialog>

      {/* Dialog Edit Akun Whitelist */}
      <Dialog
        open={!!editTarget}
        onClose={() => setEditTarget(null)}
        title="Edit Akun Whitelist"
        footer={
          <div class="flex w-full justify-end gap-2">
            <Button onClick={() => setEditTarget(null)}>Batal</Button>
            <Button variant="primary" type="submit" form="form-edit-akun">
              Simpan Perubahan
            </Button>
          </div>
        }
      >
        {editTarget && (
          <form id="form-edit-akun" onSubmit={handleSimpanEdit} class="flex flex-col gap-4">
            {errEdit && (
              <div class="rounded-ctl border border-danger/30 bg-danger-soft p-3 text-sm text-danger font-medium">
                {errEdit}
              </div>
            )}
            <Field label="Alamat Email">
              {(id) => (
                <Input
                  id={id}
                  type="email"
                  disabled
                  value={editTarget.email}
                  class="opacity-70 cursor-not-allowed bg-muted"
                />
              )}
            </Field>
            <Field label="Hak Akses (Role)" hint="Pilih hak akses untuk akun ini.">
              {(id) => (
                <Select
                  id={id}
                  value={roleEdit}
                  onChange={(e) => setRoleEdit(e.currentTarget.value as 'admin' | 'tablet')}
                >
                  <option value="tablet">Tablet Saja (Perangkat Dapur/Resto - Sesi 30 Hari)</option>
                  <option value="admin">Admin Penuh (Dashboard, Master, Rekap, Pengaturan - 2FA PIN)</option>
                </Select>
              )}
            </Field>
            {roleEdit === 'admin' && (
              <Field
                label="Nama Panggilan / Nama Admin"
                hint={`Nama yang dicatat di transaksi saat admin ini input stok/produksi. Default: ${formatNamaAdmin('', editTarget.email)}`}
              >
                {(id, dId) => (
                  <Input
                    id={id}
                    type="text"
                    maxLength={50}
                    value={namaEdit}
                    onInput={(e) => setNamaEdit(e.currentTarget.value)}
                    placeholder={`mis. Budi (default: ${formatNamaAdmin('', editTarget.email)})`}
                    aria-describedby={dId}
                    autoFocus
                  />
                )}
              </Field>
            )}
          </form>
        )}
      </Dialog>

      {/* Konfirmasi Hapus Akun */}
      <Confirm
        open={!!hapusTarget}
        title="Hapus akun dari whitelist?"
        okLabel="Hapus Akun"
        tone="danger"
        onCancel={() => setHapusTarget(null)}
        onOk={konfirmasiHapus}
      >
        <p class="text-sm text-muted-fg">
          Akun <strong class="text-fg">{hapusTarget}</strong> tidak akan dapat masuk ke sistem lagi setelah dihapus.
        </p>
      </Confirm>
      {/* Modal Kelola & Hapus Kategori */}
      <KelolaKategoriDialog open={modalKat} onClose={() => setModalKat(false)} />
    </div>
  );
}
