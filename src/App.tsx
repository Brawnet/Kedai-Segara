import { useState } from 'preact/hooks';
import { diAppsScript } from './lib/api';
import { Tablet } from './tablet/Tablet';
import { Admin } from './admin/Admin';

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

  return mode === 'tablet' ? <Tablet onAdmin={() => setMode('admin')} /> : <Admin onTablet={() => setMode('tablet')} />;
}
