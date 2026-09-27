import { createContext, Fragment } from 'preact';
import type { ComponentChildren } from 'preact';
import { useContext, useEffect, useState } from 'preact/hooks';
import { ArrowsInLineVertical, ArrowsOutLineVertical, CaretDown } from '@phosphor-icons/react';
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
  /** Sembunyikan kolom ini di kartu ringkas (mode `compact`). */
  hideCompact?: boolean;
}

/**
 * Tabel di layar ≥768px, kartu bertumpuk di ponsel.
 * Kolom pertama menjadi judul kartu. `groups` untuk judul kategori.
 * Mendukung accordion collapsible per kategori dan groupBadge kustom.
 */
export function DataTable<T>({
  cols,
  rows,
  groups,
  rowKey,
  empty = 'Tidak ada data.',
  rowClass,
  compact,
  collapsible = true,
  groupBadge,
  searchQuery = '',
}: {
  compact?: boolean;
  cols: Col<T>[];
  rows?: T[];
  groups?: { k: string; l: T[] }[];
  rowKey: (r: T) => string;
  empty?: string;
  rowClass?: (r: T) => string;
  collapsible?: boolean;
  groupBadge?: (group: { k: string; l: T[] }) => ComponentChildren;
  searchQuery?: string;
}) {
  const wide = useMedia('(min-width: 768px)');
  const gs = groups ?? [{ k: '', l: rows ?? [] }];
  if (!gs.some((g) => g.l.length)) return <Empty>{empty}</Empty>;

  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const isSearching = Boolean(searchQuery && searchQuery.trim().length > 0);
  const isGroupCollapsed = (k: string) => !isSearching && collapsible && Boolean(k && collapsed[k]);

  const namedGroups = gs.filter((g) => Boolean(g.k));
  const hasMultipleNamedGroups = namedGroups.length > 1;
  const allCollapsed = hasMultipleNamedGroups && namedGroups.every((g) => Boolean(collapsed[g.k]));

  const toggleGroup = (k: string) => {
    setCollapsed((prev) => ({ ...prev, [k]: !prev[k] }));
  };

  const toggleAll = () => {
    if (allCollapsed) {
      setCollapsed({});
    } else {
      const all: Record<string, boolean> = {};
      namedGroups.forEach((g) => {
        all[g.k] = true;
      });
      setCollapsed(all);
    }
  };

  const controlBar = collapsible && hasMultipleNamedGroups && (
    <div class="flex items-center justify-between px-1 text-xs text-muted-fg">
      <span class="flex items-center gap-1.5">
        <span>
          Menampilkan <strong class="font-semibold text-fg">{namedGroups.length}</strong> kategori
        </span>
      </span>
      {isSearching ? (
        <span class="font-medium text-muted-fg">Semua dibuka saat pencarian</span>
      ) : (
        <button
          type="button"
          onClick={toggleAll}
          class="inline-flex min-h-8 items-center gap-1.5 rounded-ctl px-2.5 py-1 font-semibold text-primary transition-colors hover:bg-primary-soft hover:text-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary cursor-pointer select-none"
        >
          {allCollapsed ? (
            <>
              <ArrowsOutLineVertical size={14} weight="bold" aria-hidden />
              <span>Buka semua</span>
            </>
          ) : (
            <>
              <ArrowsInLineVertical size={14} weight="bold" aria-hidden />
              <span>Tutup semua</span>
            </>
          )}
        </button>
      )}
    </div>
  );
  if (!wide)
    return (
      <div class="flex flex-col gap-3">
        {controlBar}
        <div class="flex flex-col gap-4">
          {gs.map((g) => {
            const isCollapsed = isGroupCollapsed(g.k);
            const groupId = `group-m-${g.k ? g.k.toLowerCase().replace(/[^a-z0-9]+/g, '-') : 'all'}`;
            return (
              <div key={g.k} class="flex flex-col gap-2">
                {g.k &&
                  (collapsible ? (
                    <button
                      type="button"
                      onClick={() => toggleGroup(g.k)}
                      aria-expanded={!isCollapsed}
                      aria-controls={groupId}
                      class="flex min-h-11 w-full items-center justify-between gap-2 rounded-ctl border border-line bg-primary-soft/50 px-3.5 py-2.5 text-left text-sm font-bold text-primary transition-colors hover:bg-primary-soft active:bg-primary-soft/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary cursor-pointer select-none"
                    >
                      <span class="flex items-center gap-2 min-w-0">
                        <CaretDown
                          size={18}
                          weight="bold"
                          class={`shrink-0 text-primary transition-transform duration-200 motion-reduce:transition-none ${
                            isCollapsed ? '-rotate-90' : 'rotate-0'
                          }`}
                          aria-hidden
                        />
                        <span class="truncate">{g.k}</span>
                        <span class="text-xs font-semibold text-muted-fg shrink-0">({g.l.length})</span>
                      </span>
                      <span class="flex items-center gap-1.5 shrink-0">
                        {groupBadge?.(g)}
                      </span>
                    </button>
                  ) : (
                    <h3 class="px-1 text-sm font-bold text-primary">
                      {g.k} <span class="font-medium text-muted-fg">· {g.l.length}</span>
                    </h3>
                  ))}
                {!isCollapsed && (
                  <div id={groupId} class="flex flex-col gap-2">
                    {g.l.map((r) => {
                      const head = cols[0];
                      const rest = cols.slice(1);
                      const acts = compact ? rest.filter((c) => c.bare) : [];
                      const info = compact ? rest.filter((c) => !c.bare) : rest;
                      return (
                        <div key={rowKey(r)} class={`rounded-card border border-line bg-card p-4 shadow-sm ${rowClass?.(r) ?? ''}`}>
                          <div class="flex items-start gap-3">
                            <div class="min-w-0 flex-1 font-bold">{head ? head.cell(r) : null}</div>
                            {acts.map((c) => (
                              <div key={c.label} class="shrink-0 -my-1.5 -mr-1.5">
                                {c.cell(r)}
                              </div>
                            ))}
                          </div>
                          {compact ? (
                            <div class="num mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-fg">
                              {info.filter((c) => !c.hideCompact).map((c) => (
                                 <span key={c.label}>
                                   {c.label} <span class="font-semibold text-fg">{c.cell(r)}</span>
                                 </span>
                               ))}
                             </div>
                           ) : (
                             <dl class="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
                               {info.map((c) =>
                                 c.bare ? (
                                   <dd key={c.label} class="col-span-2 mt-2.5 pt-2.5 border-t border-line/60">
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
                 )}
               </div>
             );
           })}
         </div>
       </div>
     );

   return (
     <div class="flex flex-col gap-2">
       {controlBar}
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
           {gs.map((g) => {
             const isCollapsed = isGroupCollapsed(g.k);
            const groupId = `group-${g.k ? g.k.toLowerCase().replace(/[^a-z0-9]+/g, '-') : 'all'}`;
             return (
               <tbody key={g.k} class="divide-y divide-line border-t border-line">
                 {g.k && (
                   <tr class="bg-primary-soft/50 hover:bg-primary-soft transition-colors duration-150">
                     <th colSpan={cols.length} scope="colgroup" class="p-0">
                       {collapsible ? (
                         <button
                           type="button"
                           onClick={() => toggleGroup(g.k)}
                           aria-expanded={!isCollapsed}
                           aria-controls={groupId}
                           class="flex min-h-11 w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-sm font-bold text-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset cursor-pointer select-none"
                         >
                           <span class="flex items-center gap-2.5">
                             <CaretDown
                               size={18}
                               weight="bold"
                               class={`shrink-0 text-primary transition-transform duration-200 motion-reduce:transition-none ${
                                 isCollapsed ? '-rotate-90' : 'rotate-0'
                               }`}
                               aria-hidden
                             />
                             <span>{g.k}</span>
                             <span class="text-xs font-semibold text-muted-fg">· {g.l.length} barang</span>
                           </span>
                           <span class="flex items-center gap-2.5">
                             {groupBadge?.(g)}
                             <span class="hidden sm:inline text-xs font-medium text-muted-fg/80">
                               {isCollapsed ? 'Buka' : 'Tutup'}
                             </span>
                           </span>
                         </button>
                       ) : (
                         <div class="flex items-center justify-between px-4 py-2.5 text-sm font-bold text-primary">
                           <span>
                             {g.k} <span class="font-medium text-muted-fg">· {g.l.length} barang</span>
                           </span>
                           {groupBadge?.(g)}
                         </div>
                       )}
                     </th>
                   </tr>
                 )}
                 {!isCollapsed &&
                   g.l.map((r) => (
                     <tr key={rowKey(r)} class={`transition-colors duration-150 hover:bg-bg ${rowClass?.(r) ?? ''}`}>
                       {cols.map((c) => (
                         <td key={c.label} class={`px-4 py-3 align-middle ${c.align === 'right' ? 'num text-right' : ''}`}>
                           {c.cell(r)}
                         </td>
                       ))}
                     </tr>
                   ))}
               </tbody>
             );
           })}
         </table>
       </div>
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
