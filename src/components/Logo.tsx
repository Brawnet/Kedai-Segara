import { Storefront } from '@phosphor-icons/react';

export const Logo = ({ sub }: { sub?: string }) => (
  <div class="flex min-w-0 items-center gap-2.5">
    <span class="grid size-10 shrink-0 place-items-center rounded-ctl bg-primary text-white">
      <Storefront size={22} weight="bold" aria-hidden />
    </span>
    <span class="min-w-0 leading-tight">
      <span class="block truncate font-extrabold tracking-tight">Stok Segara</span>
      {sub && <span class="block truncate text-xs font-medium text-muted-fg">{sub}</span>}
    </span>
  </div>
);
