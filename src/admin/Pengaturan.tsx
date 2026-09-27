import { useState } from 'preact/hooks';
import { ArrowSquareOut, Clock, Database, Key, Link, Moon, Sun } from '@phosphor-icons/react';
import { useApp } from '../lib/app';
import { Button, Card, Field, Input, PageTitle } from '../components/ui';
import { useAdmin } from './shared';

export function PengaturanPage() {
  const { d, A, setPin } = useAdmin();
  const { theme, setTheme } = useApp();
  const [jam, setJam] = useState(d.jamTutup);
  const [p1, setP1] = useState('');
  const [p2, setP2] = useState('');
  const e1 = p1 && !/^\d{4,8}$/.test(p1) ? 'PIN harus 4–8 angka' : '';
  const e2 = p1 && p2 !== p1 ? 'PIN tidak sama' : '';

  const simpan = async (e: Event) => {
    e.preventDefault();
    if (e1 || e2) return;
    if (await A('simpanPengaturan', [jam, p1], 'Pengaturan disimpan')) {
      if (p1) setPin(p1);
      setP1('');
      setP2('');
    }
  };

  return (
    <div class="flex flex-col gap-6">
      <PageTitle kicker="Sistem" title="Pengaturan" />
      <Card class="p-4 md:p-5">
        <form onSubmit={simpan} class="flex flex-col gap-5" noValidate>
          <div class="flex items-center gap-2 font-bold">
            <Clock size={20} aria-hidden /> Jam operasional
          </div>
          <Field label="Jam tutup" hint="Tablet mengingatkan rekap 30 menit sebelumnya." class="max-w-xs">
            {(id, dId) => <Input id={id} type="time" value={jam} onInput={(e) => setJam(e.currentTarget.value)} aria-describedby={dId} />}
          </Field>
          <div class="flex items-center gap-2 border-t border-line pt-5 font-bold">
            <Key size={20} aria-hidden /> Ganti PIN admin
          </div>
          <div class="grid gap-4 sm:grid-cols-2">
            <Field label="PIN baru" hint="4–8 angka. Kosongkan jika tidak diganti." error={e1}>
              {(id, dId) => (
                <Input id={id} type="password" inputmode="numeric" autocomplete="new-password" value={p1} onInput={(e) => setP1(e.currentTarget.value)} aria-invalid={!!e1} aria-describedby={dId} />
              )}
            </Field>
            <Field label="Ulangi PIN baru" error={e2}>
              {(id, dId) => (
                <Input
                  id={id}
                  type="password"
                  inputmode="numeric"
                  autocomplete="new-password"
                  value={p2}
                  onInput={(e) => setP2(e.currentTarget.value)}
                  disabled={!p1}
                  aria-invalid={!!e2}
                  aria-describedby={dId}
                />
              )}
            </Field>
          </div>
          <div>
            <Button type="submit" variant="primary" guard disabled={!!e1 || !!e2}>
              Simpan pengaturan
            </Button>
          </div>
        </form>
      </Card>

      <Card class="flex flex-col gap-4 p-4 md:p-5">
        <div class="flex items-center gap-2 font-bold">
          <Moon size={20} aria-hidden /> Tema tampilan
        </div>
        <p class="text-sm text-muted-fg">
          Pilih tampilan aplikasi untuk tablet dapur dan dashboard admin.
        </p>
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
      <div class="grid gap-4 md:grid-cols-2">
        <Card class="flex flex-col gap-2 p-4 md:p-5">
          <div class="flex items-center gap-2 font-bold">
            <Database size={20} aria-hidden /> Data
          </div>
          <p class="text-muted-fg">
            Semua data tersimpan di Google Sheet. Jangan ubah kolom <code class="rounded bg-muted px-1">id</code> dan judul kolom. Gunakan File → Riwayat versi untuk memulihkan data.
          </p>
          <a href={d.url} target="_blank" rel="noopener" class="inline-flex min-h-11 items-center gap-1 font-semibold text-primary hover:underline">
            Buka Google Sheet <ArrowSquareOut size={16} aria-hidden />
          </a>
        </Card>
        <Card class="flex flex-col gap-2 p-4 md:p-5">
          <div class="flex items-center gap-2 font-bold">
            <Link size={20} aria-hidden /> Link
          </div>
          <p class="text-muted-fg">
            Tablet: URL web app ini. Admin langsung: tambahkan <code class="rounded bg-muted px-1">?mode=admin</code> di akhir URL.
          </p>
        </Card>
      </div>
    </div>
  );
}
