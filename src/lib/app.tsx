import { createContext } from 'preact';
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { call, pesan } from './api';
import type { Api } from './types';

type Toast = { id: number; msg: string; bad?: boolean };
export type Theme = 'light' | 'dark';

interface AppCtx {
  busy: boolean;
  toast(msg: string, bad?: boolean): void;
  /**
   * Jalankan satu aksi ke server. Hanya satu aksi boleh berjalan sekaligus (sama seperti versi lama).
   * Error ditampilkan sebagai toast; hasilnya `undefined` jika gagal atau sedang sibuk.
   */
  act<K extends keyof Api>(fn: K, args: Parameters<Api[K]>, onErr?: (e: unknown) => void): Promise<ReturnType<Api[K]> | undefined>;
  theme: Theme;
  toggleTheme(): void;
  setTheme(t: Theme): void;
}
const Ctx = createContext<AppCtx>(null as unknown as AppCtx);
export const useApp = () => useContext(Ctx);

function initTheme(): Theme {
  try {
    const saved = localStorage.getItem('segara_theme');
    if (saved === 'dark' || saved === 'light') return saved;
    if (window.matchMedia('(prefers-color-scheme: dark)').matches) return 'dark';
  } catch {}
  return 'light';
}

export function AppProvider({ children }: { children: ComponentChildren }) {
  const [busy, setBusy] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [theme, setThemeState] = useState<Theme>(initTheme);
  const busyRef = useRef(false);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    try {
      localStorage.setItem('segara_theme', t);
    } catch {}
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      try {
        localStorage.setItem('segara_theme', next);
      } catch {}
      return next;
    });
  }, []);

  const toast = useCallback((msg: string, bad?: boolean) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-2), { id, msg, bad }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), bad ? 6000 : 3500);
  }, []);

  const act = useCallback<AppCtx['act']>(
    async (fn, args, onErr) => {
      if (busyRef.current) return undefined;
      busyRef.current = true;
      setBusy(true);
      try {
        return await call(fn, ...args);
      } catch (e) {
        toast(pesan(e), true);
        onErr?.(e);
        return undefined;
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    },
    [toast],
  );

  const value = useMemo(() => ({ busy, toast, act, theme, toggleTheme, setTheme }), [busy, toast, act, theme, toggleTheme, setTheme]);
  return (
    <Ctx.Provider value={value}>
      {busy && (
        <div class="fixed inset-x-0 top-0 z-50 h-1 overflow-hidden bg-primary-soft" role="progressbar" aria-label="Memproses">
          <div class="animate-progress h-full w-2/5 bg-primary" />
        </div>
      )}
      {children}
      <div
        class="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex flex-col items-center gap-2 px-4 lg:bottom-6"
        aria-live="polite"
        role="status"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            class={`animate-rise pointer-events-auto max-w-md rounded-ctl px-4 py-3 text-sm font-semibold text-white shadow-lg ${
              t.bad ? 'bg-danger' : 'bg-fg'
            }`}
          >
            {t.msg}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
