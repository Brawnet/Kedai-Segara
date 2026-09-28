import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import {
  ArrowLeft,
  CheckCircle,
  EnvelopeSimple,
  Key,
  ShieldCheck,
  WarningCircle,
} from '@phosphor-icons/react';
import { call, pesan } from '../lib/api';
import { authStorage } from '../lib/auth-storage';
import type { AuthSession, PublicAuthConfig } from '../lib/types';
import { Button, Card, Field, Input, Loading, Tag } from './ui';
import { Logo } from './Logo';


export function AuthGate({
  children,
  onLogout,
}: {
  children: (session: AuthSession, logout: () => void) => ComponentChildren;
  onLogout?: () => void;
}) {
  const [checking, setChecking] = useState(true);
  const [session, setSession] = useState<AuthSession | null>(null);
  const [config, setConfig] = useState<PublicAuthConfig>({ hasGoogleAuth: false, googleClientId: '' });

  // Mode OTP
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'input_email' | 'input_code'>('input_email');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [countdown, setCountdown] = useState(0);

  const googleBtnRef = useRef<HTMLDivElement>(null);

  // 1. Verifikasi token yang ada di storage saat awal buka
  useEffect(() => {
    let unmounted = false;
    const initAuth = async () => {
      try {
        const conf = await call('getPublicAuthConfig');
        if (!unmounted) setConfig(conf);
      } catch (e) {
        console.warn('Gagal memuat konfigurasi auth publik:', e);
      }

      const tok = authStorage.getToken();
      if (!tok) {
        if (!unmounted) setChecking(false);
        return;
      }

      try {
        const res = await call('verifySessionToken', tok);
        if (unmounted) return;
        if (res.valid && res.email && res.role && res.exp) {
          const sess: AuthSession = {
            token: tok,
            email: res.email,
            role: res.role,
            exp: res.exp,
          };
          authStorage.saveSession(sess);
          setSession(sess);
        } else {
          authStorage.clear();
          setErr(res.error || 'Sesi telah berakhir. Silakan login kembali.');
        }
      } catch {
        // Jika offline atau error jaringan, tapi token belum expired
        const user = authStorage.getUser();
        if (user && user.exp > Date.now()) {
          setSession({
            token: tok,
            email: user.email,
            role: user.role,
            exp: user.exp,
          });
        } else {
          authStorage.clear();
        }
      } finally {
        if (!unmounted) setChecking(false);
      }
    };

    initAuth();
    return () => {
      unmounted = true;
    };
  }, []);
  // Listener untuk sesi yang kedaluwarsa atau dicabut saat aplikasi sedang berjalan
  useEffect(() => {
    const onSessionExpired = (e: Event) => {
      authStorage.clear();
      setSession(null);
      const detail = (e as CustomEvent<string>)?.detail;
      setErr(detail || 'Sesi login telah berakhir atau akses dicabut. Silakan login kembali.');
    };
    window.addEventListener('sg_session_expired', onSessionExpired);
    return () => window.removeEventListener('sg_session_expired', onSessionExpired);
  }, []);


  // Timer hitung mundur OTP
  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setInterval(() => {
      setCountdown((c) => Math.max(0, c - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  // Inisialisasi Google Identity Services jika ada Client ID
  useEffect(() => {
    if (checking || session || !config.hasGoogleAuth || !config.googleClientId) return;

    const setupGoogle = () => {
      if (!window.google?.accounts?.id || !googleBtnRef.current) return;
      try {
        window.google.accounts.id.initialize({
          client_id: config.googleClientId,
          callback: async (res: { credential: string }) => {
            if (!res.credential) return;
            setLoading(true);
            setErr('');
            try {
              const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
              const sess = await call('verifyGoogleCredential', res.credential, ua);
              authStorage.saveSession(sess);
              setSession(sess);
            } catch (e) {
              setErr(pesan(e));
            } finally {
              setLoading(false);
            }
          },
        });

        window.google.accounts.id.renderButton(googleBtnRef.current, {
          theme: 'outline',
          size: 'large',
          text: 'signin_with',
          shape: 'pill',
          width: 280,
        });
      } catch (err) {
        console.warn('Gagal memuat tombol Google:', err);
      }
    };

    if (window.google?.accounts?.id) {
      setupGoogle();
    } else {
      const existingScript = document.querySelector<HTMLScriptElement>('script[src*="accounts.google.com/gsi/client"]');
      if (existingScript) {
        existingScript.addEventListener('load', setupGoogle);
      } else {
        const script = document.createElement('script');
        script.src = 'https://accounts.google.com/gsi/client';
        script.async = true;
        script.defer = true;
        script.onload = setupGoogle;
        document.head.appendChild(script);
      }
    }
  }, [checking, session, config]);

  const handleKirimOtp = async (e: Event) => {
    e.preventDefault();
    setErr('');
    setMsg('');
    setCode('');
    const em = email.toLowerCase().trim();
    if (!em || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) {
      setErr('Masukkan format email yang valid.');
      return;
    }
    setLoading(true);
    try {
      const res = await call('requestOtp', em);
      setMsg(res.message || `Kode 6-angka telah dikirim ke ${em}`);
      setStep('input_code');
      setCountdown(res.expSeconds || 300);
    } catch (e) {
      setErr(pesan(e));
    } finally {
      setLoading(false);
    }
  };

  const handleVerifikasiOtp = async (e: Event) => {
    e.preventDefault();
    setErr('');
    const cd = code.trim();
    if (!cd || cd.length < 6) {
      setErr('Masukkan 6-digit kode verifikasi.');
      return;
    }

    setLoading(true);
    try {
      const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
      const sess = await call('verifyOtp', email.toLowerCase().trim(), cd, ua);
      authStorage.saveSession(sess);
      setSession(sess);
    } catch (e) {
      setErr(pesan(e));
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    authStorage.clear();
    setSession(null);
    setStep('input_email');
    setCode('');
    setMsg('');
    setErr('');
    onLogout?.();
  };

  if (checking) {
    return (
      <main class="min-h-screen flex items-center justify-center p-4 bg-bg text-fg">
        <Loading label="Memeriksa akses keamanan…" />
      </main>
    );
  }

  // Jika sudah terautentikasi dan sesi valid, tampilkan aplikasi anak
  if (session) {
    return <>{children(session, logout)}</>;
  }

  // Tampilkan Gerbang Login
  return (
    <main class="min-h-screen flex flex-col justify-center items-center px-4 py-8 bg-bg text-fg select-none">
      <div class="w-full max-w-md flex flex-col gap-6">
        {/* Header Branding */}
        <div class="flex flex-col items-center text-center gap-3">
          <Logo sub="Akses Sistem" />
          <div>
            <h1 class="text-2xl font-extrabold tracking-tight">Kedai Segara</h1>
            <p class="text-sm text-muted-fg mt-0.5">Sistem Manajemen Stok & Operasional</p>
          </div>
          <Tag tone="primary">
            <span class="inline-flex items-center gap-1.5 py-0.5">
              <ShieldCheck size={16} weight="fill" aria-hidden />
              <span>Akses Terproteksi Whitelist</span>
            </span>
          </Tag>
        </div>

        {/* Kartu Autentikasi */}
        <Card class="p-6 flex flex-col gap-5 shadow-md border-line">
          {err && (
            <div class="flex items-start gap-2.5 rounded-ctl border border-danger/30 bg-danger-soft p-3 text-sm text-danger">
              <WarningCircle size={20} weight="fill" class="shrink-0 mt-0.5" aria-hidden />
              <div class="flex-1 font-medium">{err}</div>
            </div>
          )}

          {msg && (
            <div class="flex items-start gap-2.5 rounded-ctl border border-success/30 bg-success-soft p-3 text-sm text-success">
              <CheckCircle size={20} weight="fill" class="shrink-0 mt-0.5" aria-hidden />
              <div class="flex-1 font-medium">{msg}</div>
            </div>
          )}

          {/* Bagian Google Sign-In (jika diaktifkan) */}
          {config.hasGoogleAuth && step === 'input_email' && (
            <div class="flex flex-col items-center gap-3 pb-4 border-b border-line">
              <p class="text-xs font-semibold uppercase tracking-wider text-muted-fg">Masuk sekali klik</p>
              <div ref={googleBtnRef} class="min-h-[44px] flex items-center justify-center" />
              <div class="relative flex w-full items-center justify-center my-1">
                <div class="absolute inset-0 flex items-center">
                  <div class="w-full border-t border-line" />
                </div>
                <div class="relative bg-card px-3 text-xs uppercase font-medium text-muted-fg">Atau lewat email</div>
              </div>
            </div>
          )}

          {/* Form OTP Email (Google / iCloud / Lainnya) */}
          {step === 'input_email' ? (
            <form onSubmit={handleKirimOtp} class="flex flex-col gap-4">
              <Field
                label="Email Terdaftar (Google / iCloud)"
                hint="Gunakan email yang sudah didaftarkan owner di sistem."
              >
                {(id, dId) => (
                  <div class="relative">
                    <EnvelopeSimple
                      size={20}
                      class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-fg"
                      aria-hidden
                    />
                    <Input
                      id={id}
                      aria-describedby={dId}
                      type="email"
                      required
                      autocomplete="email"
                      value={email}
                      onInput={(e) => setEmail(e.currentTarget.value)}
                      placeholder="nama@gmail.com atau nama@icloud.com"
                      class="pl-10"
                      disabled={loading}
                    />
                  </div>
                )}
              </Field>

              <Button
                variant="primary"
                type="submit"
                size="md"
                loading={loading}
                disabled={!email.trim()}
                class="w-full"
              >
                <span>Kirim Kode Verifikasi</span>
              </Button>

            </form>
          ) : (
            <form onSubmit={handleVerifikasiOtp} class="flex flex-col gap-4">
              <div class="rounded-ctl bg-muted/60 p-3 text-xs flex flex-col gap-1 border border-line">
                <span class="text-muted-fg">Email verifikasi:</span>
                <span class="font-bold text-fg break-all">{email}</span>
              </div>


              <Field
                label="Kode Verifikasi (6-Digit)"
                hint={countdown > 0 ? `Berlaku selama ${Math.floor(countdown / 60)}:${String(countdown % 60).padStart(2, '0')}` : 'Kode kadaluarsa. Silakan minta kode baru.'}
              >
                {(id, dId) => (
                  <div class="relative">
                    <Key
                      size={20}
                      class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-fg"
                      aria-hidden
                    />
                    <Input
                      id={id}
                      aria-describedby={dId}
                      type="text"
                      inputmode="numeric"
                      pattern="[0-9]*"
                      maxlength={6}
                      required
                      autoFocus
                      autocomplete="one-time-code"
                      value={code}
                      onInput={(e) => setCode(e.currentTarget.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="Contoh: 123456"
                      class="pl-10 text-center tracking-widest text-lg font-bold"
                      disabled={loading}
                    />
                  </div>
                )}
              </Field>

              <Button
                variant="primary"
                type="submit"
                size="md"
                loading={loading}
                disabled={code.trim().length < 6 || countdown <= 0}
                class="w-full"
              >
                <span>Verifikasi & Masuk</span>
              </Button>

              <div class="flex items-center justify-between pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setStep('input_email');
                    setCode('');
                    setErr('');
                    setMsg('');
                  }}
                  class="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-fg hover:text-fg transition-colors cursor-pointer select-none"
                >
                  <ArrowLeft size={14} aria-hidden />
                  <span>Ganti email</span>
                </button>

                {countdown <= 0 && (
                  <button
                    type="button"
                    onClick={handleKirimOtp}
                    class="text-xs font-semibold text-primary hover:underline cursor-pointer select-none"
                  >
                    Kirim ulang kode
                  </button>
                )}
              </div>
            </form>
          )}

          <div class="pt-2 text-center text-xs text-muted-fg/80 border-t border-line/60">
            Perangkat tablet resto akan tetap aktif hingga 30 hari.
          </div>
        </Card>
      </div>
    </main>
  );
}
