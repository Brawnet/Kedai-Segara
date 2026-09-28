import { useState } from 'preact/hooks';
import { diAppsScript } from './lib/api';
import { Tablet } from './tablet/Tablet';
import { Admin } from './admin/Admin';
import { AuthGate } from './components/AuthGate';
export type Mode = 'tablet' | 'admin';

function awalMode(): Mode {
  const m = window.SEGARA_MODE;
  if (m === 'admin' || m === 'tablet') return m;
  // Saat dev (placeholder belum diganti), baca ?mode=admin dari URL.
  return new URLSearchParams(location.search).get('mode') === 'admin' ? 'admin' : 'tablet';
}

export function App() {
  const [mode, setMode] = useState<Mode>(awalMode);

  if (!diAppsScript() && !import.meta.env.DEV) {
    return (
      <main class="mx-auto max-w-xl px-5 py-16">
        <p class="text-[13px] font-bold uppercase tracking-wide text-primary">Stok Segara</p>
        <h1 class="mt-1 text-3xl font-extrabold">Buka lewat URL Web App</h1>
        <p class="mt-3 text-muted-fg">File ini berjalan di Google Apps Script. Ikuti PANDUAN.md untuk memasangnya.</p>
      </main>
    );
  }

  return (
    <AuthGate
      onLogin={(session, preferredMode) => {
        if (preferredMode) {
          setMode(preferredMode);
        } else if (session.role === 'admin' && !window.SEGARA_MODE) {
          setMode('admin');
        } else if (session.role === 'tablet' && !window.SEGARA_MODE) {
          setMode('tablet');
        }
      }}
    >
      {(session, logout) => {
        if (session.role === 'tablet' && mode === 'admin') {
          return (
            <main class="min-h-screen flex items-center justify-center p-4 bg-bg text-fg">
              <div class="max-w-md w-full rounded-card border border-warning/40 bg-card p-6 flex flex-col gap-4 text-center shadow-md">
                <h2 class="text-xl font-bold text-warning">Akses Dibatasi</h2>
                <p class="text-sm text-muted-fg leading-relaxed">
                  Akun Anda (<strong class="text-fg">{session.email}</strong>) terdaftar dengan hak akses <strong>Tablet Saja</strong>. Menu Admin memerlukan akun dengan hak akses Admin Penuh.
                </p>
                <div class="flex gap-2 justify-center pt-2">
                  <button
                    type="button"
                    onClick={() => setMode('tablet')}
                    class="rounded-ctl bg-primary px-4 py-2 font-semibold text-white transition-colors hover:bg-primary-hover cursor-pointer"
                  >
                    Kembali ke Tablet
                  </button>
                  <button
                    type="button"
                    onClick={logout}
                    class="rounded-ctl border border-line px-4 py-2 font-semibold hover:bg-muted transition-colors cursor-pointer"
                  >
                    Ganti Akun
                  </button>
                </div>
              </div>
            </main>
          );
        }
        return mode === 'tablet' ? (
          <Tablet onAdmin={() => setMode('admin')} session={session} onLogout={logout} />
        ) : (
          <Admin onTablet={() => setMode('tablet')} session={session} onLogout={logout} />
        );
      }}
    </AuthGate>
  );
}
