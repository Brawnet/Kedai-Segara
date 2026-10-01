import logoImg from '../assets/logo.png';

export const Logo = ({ sub, compact }: { sub?: string; compact?: boolean }) => (
  <div class="flex min-w-0 items-center gap-2.5">
    <span class="grid size-10 shrink-0 place-items-center overflow-hidden rounded-ctl bg-white dark:bg-card border border-line p-0.5 shadow-xs">
      <img src={logoImg} alt="Kedai Segara" class="size-full object-contain dark:brightness-0 dark:invert" />
    </span>
    {!compact && (
      <span class="min-w-0 leading-tight">
        <span class="block truncate font-extrabold tracking-tight text-fg">Stok Segara</span>
        {sub && <span class="block truncate text-xs font-medium text-muted-fg">{sub}</span>}
      </span>
    )}
  </div>
);
