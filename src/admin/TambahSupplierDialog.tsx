import { useMemo, useState } from 'preact/hooks';
import { Plus, Buildings } from '@phosphor-icons/react';
import { Button, Dialog, Field, Input, Tag } from '../components/ui';
import { useAdmin } from './shared';
import { useApp } from '../lib/app';

export interface TambahSupplierDialogProps {
  open: boolean;
  onClose: () => void;
  onSelect?: (supplier: string) => void;
}

export function TambahSupplierDialog({ open, onClose, onSelect }: TambahSupplierDialogProps) {
  const { d, A } = useAdmin();
  const { toast } = useApp();

  const [nama, setNama] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  // Kumpulkan supplier yang sudah ada
  const daftarSupplier = useMemo(() => {
    const set = new Set<string>();
    const list: string[] = [];
    const tambah = (s?: string) => {
      const clean = (s || '').trim();
      if (!clean) return;
      const lower = clean.toLowerCase();
      if (!set.has(lower)) {
        set.add(lower);
        list.push(clean);
      }
    };
    tambah('CV. Dapur Rumah Rasa');
    (d.daftarSupplier || []).forEach(tambah);
    (d.transaksi || []).forEach((t) => tambah(t.supplier));
    return list;
  }, [d.daftarSupplier, d.transaksi]);

  const handleSimpan = async (e: Event) => {
    e.preventDefault();
    const clean = nama.trim();
    if (!clean) {
      setErr('Nama supplier wajib diisi');
      return;
    }
    const lower = clean.toLowerCase();
    if (daftarSupplier.some((s) => s.toLowerCase() === lower)) {
      setErr(`Supplier "${clean}" sudah terdaftar`);
      return;
    }

    setLoading(true);
    setErr('');
    try {
      const res = await A('tambahSupplier', [clean], (r) => r.message);
      if (res) {
        setNama('');
        setErr('');
        if (onSelect) {
          onSelect(clean);
        }
        toast(`Supplier "${clean}" berhasil ditambahkan`);
        onClose();
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={() => {
        setErr('');
        setNama('');
        onClose();
      }}
      title="Tambah Supplier Baru"
    >
      <form onSubmit={handleSimpan} class="flex flex-col gap-4" noValidate>
        <p class="text-xs text-muted-fg leading-relaxed">
          Tambahkan nama supplier atau distributor bahan baru. Supplier yang ditambahkan akan otomatis tersimpan dalam daftar pilihan.
        </p>

        <Field label="Nama Supplier" error={err}>
          {(id, dId) => (
            <div class="relative">
              <Input
                id={id}
                type="text"
                placeholder="mis. PT. Sumber Pangan, Toko Berkah"
                value={nama}
                onInput={(e) => {
                  setNama(e.currentTarget.value);
                  if (err) setErr('');
                }}
                autocomplete="off"
                aria-invalid={!!err}
                aria-describedby={dId}
                autoFocus
                class="font-medium pr-10"
              />
              <Buildings
                size={18}
                class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-fg"
                aria-hidden
              />
            </div>
          )}
        </Field>

        {daftarSupplier.length > 0 && (
          <div class="rounded-ctl border border-line bg-muted/40 p-3">
            <span class="block text-[11px] font-bold uppercase tracking-wider text-muted-fg mb-2">
              Supplier yang sudah terdaftar ({daftarSupplier.length}):
            </span>
            <div class="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto pr-1">
              {daftarSupplier.map((s) => (
                <Tag key={s} tone="neutral">
                  {s}
                </Tag>
              ))}
            </div>
          </div>
        )}

        <div class="flex items-center justify-end gap-2 pt-2 border-t border-line">
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setErr('');
              setNama('');
              onClose();
            }}
          >
            Batal
          </Button>
          <Button type="submit" variant="primary" guard disabled={loading}>
            <Plus size={16} class="mr-1 inline" aria-hidden /> Simpan Supplier
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
