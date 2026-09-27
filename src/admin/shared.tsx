import { createContext, Fragment } from 'preact';
import type { ComponentChildren } from 'preact';
import { useContext, useEffect, useState } from 'preact/hooks';
import type { AdminData, Api } from '../lib/types';
import { Empty } from '../components/ui';

export interface AdminCtx {
  d: AdminData;
  pin: string;
  setPin(p: string): void;
  logout(): void;
  /** Aksi admin: PIN otomatis jadi argumen pertama, lalu data dimuat ulang. */
  A<K extends keyof Api>(
    fn: K,
    args: Parameters<Api[K]> extends [string, ...infer R] ? R : never,
    ok: string | ((r: ReturnType<Api[K]>) => string),
  ): Promise<ReturnType<Api[K]> | undefined>;
  /** Sama seperti A, tapi argumen ditulis lengkap (untuk batalAmbil(txId, pin)). */
  run<K extends keyof Api>(fn: K, args: Parameters<Api[K]>, ok: string | ((r: ReturnType<Api[K]>) => string)): Promise<ReturnType<Api[K]> | undefined>;
  reload(): Promise<void>;
}

export const Ctx = createContext<AdminCtx>(null as unknown as AdminCtx);
export const useAdmin = () => useContext(Ctx);

export function useMedia(q: string) {
  const [m, setM] = useState(() => window.matchMedia(q).matches);
  useEffect(() => {
    const mq = window.matchMedia(q);
    const h = () => setM(mq.matches);
    mq.addEventListener('change', h);
    return () => mq.removeEventListener('change', h);
  }, [q]);
  return m;
}

export interface Col<T> {
  label: string;
  cell: (r: T) => ComponentChildren;
  align?: 'right';
  /** Lebar kolom di tabel, mis. "w-48". */
  w?: string;
  /** Sembunyikan label di kartu mobile (kolom judul/aksi). */
  bare?: boolean;
}

/**
 * Tabel di layar ≥768px, kartu bertumpuk di ponsel.
 * Kolom pertama menjadi judul kartu. `groups` untuk judul kategori.
 */
export function DataTable<T>({
  cols,
  rows,
  groups,
  rowKey,
  empty = 'Tidak ada data.',
  rowClass,
  compact,
}: {
  compact?: boolean;
  cols: Col<T>[];
  rows?: T[];
  groups?: { k: string; l: T[] }[];
  rowKey: (r: T) => string;
  empty?: string;
  rowClass?: (r: T) => string;
}) {
  const wide = useMedia('(min-width: 768px)');
  const gs = groups ?? [{ k: '', l: rows ?? [] }];
  if (!gs.some((g) => g.l.length)) return <Empty>{empty}</Empty>;

  if (!wide)
    return (
      <div class="flex flex-col gap-4">
        {gs.map((g) => (
          <div key={g.k} class="flex flex-col gap-2">
            {g.k && (
              <h3 class="px-1 text-sm font-bold text-primary">
                {g.k} <span class="font-medium text-muted-fg">· {g.l.length}</span>
              </h3>
            )}
            {g.l.map((r) => {
              const [head, ...rest] = cols;
              return (
                <div key={rowKey(r)} class={`rounded-card border border-line bg-card p-4 shadow-sm ${rowClass?.(r) ?? ''}`}>
                  <div class="font-bold">{head!.cell(r)}</div>
                  {compact ? (
                    <div class="num mt-1 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-muted-fg">
                      {rest.filter((c) => c.label !== 'Alur').map((c) => (
                        <span key={c.label}>
                          {c.label} <span class="font-semibold text-fg">{c.cell(r)}</span>
                        </span>
                      ))}
                    </div>
                  ) : (
                  <dl class="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
                    {rest.map((c) =>
                      c.bare ? (
                        <dd key={c.label} class="col-span-2 mt-1">
                          {c.cell(r)}
                        </dd>
                      ) : (
                        <Fragment key={c.label}>
                          <dt class="text-muted-fg">{c.label}</dt>
                          <dd class="num min-w-0 text-right font-medium">{c.cell(r)}</dd>
                        </Fragment>
                      ),
                    )}
                  </dl>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    );

  return (
    <div class="overflow-x-auto rounded-card border border-line bg-card shadow-sm">
      <table class="w-full text-left text-[15px]">
        <thead class="sticky top-0 bg-muted text-sm text-muted-fg">
          <tr>
            {cols.map((c) => (
              <th key={c.label} scope="col" class={`whitespace-nowrap px-4 py-3 font-semibold ${c.align === 'right' ? 'text-right' : ''} ${c.w ?? ''}`}>
                {c.bare && !c.label.trim() ? <span class="sr-only">Aksi</span> : c.label}
              </th>
            ))}
          </tr>
        </thead>
        {gs.map((g) => (
          <tbody key={g.k} class="divide-y divide-line border-t border-line">
            {g.k && (
              <tr class="bg-primary-soft">
                <th colSpan={cols.length} scope="colgroup" class="px-4 py-2 text-sm font-bold text-primary">
                  {g.k} <span class="font-medium text-muted-fg">· {g.l.length} barang</span>
                </th>
              </tr>
            )}
            {g.l.map((r) => (
              <tr key={rowKey(r)} class={`transition-colors duration-150 hover:bg-bg ${rowClass?.(r) ?? ''}`}>
                {cols.map((c) => (
                  <td key={c.label} class={`px-4 py-3 align-middle ${c.align === 'right' ? 'num text-right' : ''}`}>
                    {c.cell(r)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        ))}
      </table>
    </div>
  );
}

export const Section = ({ title, children, actions }: { title: string; children: ComponentChildren; actions?: ComponentChildren }) => (
  <section class="flex flex-col gap-3">
    <div class="flex flex-wrap items-center gap-2">
      <h2 class="mr-auto text-lg font-bold">{title}</h2>
      {actions}
    </div>
    {children}
  </section>
);
