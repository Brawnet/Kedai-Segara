import type { Api } from './types';
import { authStorage } from './auth-storage.ts';

type Fn = keyof Api;
type Runner = Record<string, (...args: unknown[]) => void> & {
  withSuccessHandler(cb: (r: unknown) => void): Runner;
  withFailureHandler(cb: (e: unknown) => void): Runner;
};

declare global {
  interface Window {
    SEGARA_MODE?: string;
    google?: {
      script?: { run: Runner };
      accounts?: {
        id?: {
          initialize(config: {
            client_id: string;
            callback: (response: { credential: string }) => void;
            auto_select?: boolean;
          }): void;
          renderButton(
            parent: HTMLElement,
            options: {
              theme?: 'outline' | 'filled_blue' | 'filled_black';
              size?: 'large' | 'medium' | 'small';
              text?: string;
              shape?: 'rectangular' | 'pill' | 'circle';
              width?: number;
            },
          ): void;
          prompt(): void;
        };
      };
    };
  }
}

type Impl = { [K in Fn]: (...a: Parameters<Api[K]>) => ReturnType<Api[K]> | Promise<ReturnType<Api[K]>> };
let mock: Impl | null = null;

/** True saat berjalan di dalam Apps Script (bukan `npm run dev`). */
export const diAppsScript = () => !!window.google?.script?.run;

async function devMock(): Promise<Impl> {
  if (!mock) mock = (await import('./mock')).createMock();
  return mock;
}

/** Panggil fungsi di Kode.gs lewat google.script.run, dibungkus Promise. */
const TIMEOUT_MS = 60_000;

/** Panggil fungsi di Kode.gs lewat google.script.run, dibungkus Promise. */
export function call<K extends Fn>(fn: K, ...args: Parameters<Api[K]>): Promise<ReturnType<Api[K]>> {
  const publicFns = new Set<string>([
    'getPublicAuthConfig',
    'requestOtp',
    'verifyOtp',
    'verifyGoogleCredential',
    'verifySessionToken',
  ]);
  const finalArgs = [...args] as unknown[];
  if (!publicFns.has(fn)) {
    const tok = authStorage.getToken();
    if (tok && !finalArgs.includes(tok)) {
      finalArgs.push(tok);
    }
  }

  const run = window.google?.script?.run;
  if (!run) {
    if (import.meta.env.DEV) {
      return devMock().then(
        (m) =>
          new Promise((res, rej) =>
            // Latensi palsu agar state loading terlihat saat pengembangan.
            setTimeout(() => {
              try {
                Promise.resolve((m[fn] as (...a: unknown[]) => unknown)(...finalArgs)).then(
                  (v) => res(v as ReturnType<Api[K]>),
                  (e) => {
                    periksaSesiExpired(e);
                    rej(e);
                  },
                );
              } catch (e) {
                periksaSesiExpired(e);
                rej(e);
              }
            }, 250),
          ),
      );
    }
    return Promise.reject(new Error('Buka aplikasi lewat URL Web App Apps Script.'));
  }
  return new Promise((res, rej) => {
    let done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      rej(new Error('Koneksi timeout (60 detik). Periksa internet Anda lalu coba lagi.'));
    }, TIMEOUT_MS);

    try {
      const r = run
        .withSuccessHandler((v) => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          res(v as ReturnType<Api[K]>);
        })
        .withFailureHandler((e) => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          const errMsg = typeof e === 'object' && e !== null && 'message' in e ? String(e.message) : String(e);
          const err = e instanceof Error ? e : new Error(errMsg);
          periksaSesiExpired(err);
          rej(err);
        });
      if (typeof r[fn] !== 'function') {
        clearTimeout(timer);
        rej(new Error(`Fungsi "${String(fn)}" tidak ditemukan di server Apps Script.`));
        return;
      }
      r[fn](...finalArgs);
    } catch (err) {
      clearTimeout(timer);
      rej(err instanceof Error ? err : new Error(String(err)));
    }
  });
}

function periksaSesiExpired(err: unknown) {
  const msg = pesan(err);
  if (/Akses ditolak|Sesi telah berakhir|sesi login wajib|sesi login tidak valid/i.test(msg)) {
    authStorage.clear();
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new CustomEvent('sg_session_expired', { detail: msg }));
    }
  }
}

/** Pesan error tanpa awalan "Error:"/"Exception:" dari Apps Script. */
export function pesan(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e);
  return m.replace(/^(Error|Exception):\s*/i, '');
}

export const pinSalah = (e: unknown) => /PIN salah/.test(pesan(e));
