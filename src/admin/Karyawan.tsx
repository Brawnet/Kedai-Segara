import { useMemo, useState } from 'preact/hooks';
import {
  Eye,
  EyeSlash,
  Key,
  MagnifyingGlass,
  PencilSimple,
  Plus,
  ShieldCheck,
  UserCheck,
  UserCircleMinus,
  UserCirclePlus,
  UserMinus,
  UserPlus,
  Users,
  X,
} from '@phosphor-icons/react';
import { inisial } from '../lib/format';
import type { KaryawanAdmin } from '../lib/types';
import { Banner, Button, Card, Confirm, Dialog, Field, Input, PageTitle, Tag } from '../components/ui';
import { DataTable, useAdmin, type Col } from './shared';

type FilterTab = 'semua' | 'aktif' | 'nonaktif' | 'pin' | 'tanpa-pin';

export function KaryawanPage() {
  const { d, A } = useAdmin();

  // Pencarian & Filter
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<FilterTab>('semua');

  // Form Tambah Cepat
  const [quickNama, setQuickNama] = useState('');
  const [quickPin, setQuickPin] = useState('');
  const [quickErr, setQuickErr] = useState('');

  // Dialog Tambah Karyawan Lengkap
  const [modalTambah, setModalTambah] = useState(false);
  const [namaBaru, setNamaBaru] = useState('');
  const [pinBaru, setPinBaru] = useState('');
  const [errTambah, setErrTambah] = useState('');

  // Dialog Atur / Ubah PIN Karyawan
  const [modalPin, setModalPin] = useState<KaryawanAdmin | null>(null);
  const [pinVal, setPinVal] = useState('');
  const [pinKonf, setPinKonf] = useState('');
  const [errPin, setErrPin] = useState('');
  const [showPin, setShowPin] = useState(false);

  // Dialog Ubah Nama
  const [modalRen, setModalRen] = useState<{ k: KaryawanAdmin; nama: string } | null>(null);
  const [errRen, setErrRen] = useState('');

  // Dialog Konfirmasi Nonaktifkan
  const [modalTog, setModalTog] = useState<KaryawanAdmin | null>(null);

  // Metrik Ringkasan
  const total = d.karyawan.length;
  const aktifCount = useMemo(() => d.karyawan.filter((k) => k.aktif).length, [d.karyawan]);
  const nonaktifCount = total - aktifCount;
  const pinCount = useMemo(() => d.karyawan.filter((k) => k.punyaPin).length, [d.karyawan]);
  const tanpaPinCount = total - pinCount;

  // Filter daftar karyawan
  const list = useMemo(() => {
    return d.karyawan.filter((k) => {
      const cocokNama = !q.trim() || k.nama.toLowerCase().includes(q.trim().toLowerCase());
      if (!cocokNama) return false;

      if (filter === 'aktif') return k.aktif;
      if (filter === 'nonaktif') return !k.aktif;
      if (filter === 'pin') return !!k.punyaPin;
      if (filter === 'tanpa-pin') return !k.punyaPin;
      return true;
    });
  }, [d.karyawan, q, filter]);

  // Tambah cepat dari kartu inline
  const tambahCepat = async (e: Event) => {
    e.preventDefault();
    const nm = quickNama.trim();
    if (!nm) return setQuickErr('Nama karyawan wajib diisi');
    if (d.karyawan.some((k) => k.nama.toLowerCase() === nm.toLowerCase()))
      return setQuickErr('Karyawan dengan nama ini sudah ada');

    const p = quickPin.trim();
    if (p && !/^\d{4,6}$/.test(p))
      return setQuickErr('PIN harus 4–6 angka numerik');

    setQuickErr('');
    if (await A('simpanKaryawan', [{ nama: nm, pin: p || undefined }], 'Karyawan ditambahkan')) {
      setQuickNama('');
      setQuickPin('');
    }
  };

  // Tambah karyawan dari modal dialog
  const tambahModal = async (e: Event) => {
    e.preventDefault();
    const nm = namaBaru.trim();
    if (!nm) return setErrTambah('Nama karyawan wajib diisi');
    if (d.karyawan.some((k) => k.nama.toLowerCase() === nm.toLowerCase()))
      return setErrTambah('Karyawan dengan nama ini sudah ada');

    const p = pinBaru.trim();
    if (p && !/^\d{4,6}$/.test(p))
      return setErrTambah('PIN harus 4–6 angka numerik (atau kosongkan)');

    setErrTambah('');
    if (await A('simpanKaryawan', [{ nama: nm, pin: p || undefined }], 'Karyawan berhasil ditambahkan')) {
      setModalTambah(false);
      setNamaBaru('');
      setPinBaru('');
    }
  };

  // Simpan / Ubah PIN
  const bukaPinModal = (k: KaryawanAdmin) => {
    setModalPin(k);
    setPinVal('');
    setPinKonf('');
    setErrPin('');
    setShowPin(false);
  };

  const simpanPin = async (e: Event) => {
    e.preventDefault();
    if (!modalPin) return;

    const p = pinVal.trim();
    if (!p) return setErrPin('PIN tidak boleh kosong. Gunakan "Hapus PIN" jika ingin meniadakan PIN.');
    if (!/^\d{4,6}$/.test(p)) return setErrPin('PIN harus 4–6 angka numerik');
    if (p !== pinKonf.trim()) return setErrPin('Konfirmasi PIN tidak cocok');

    setErrPin('');
    if (await A('simpanKaryawan', [{ id: modalPin.id, nama: modalPin.nama, aktif: modalPin.aktif, pin: p }], 'PIN karyawan berhasil disimpan')) {
      setModalPin(null);
    }
  };

  const hapusPin = async () => {
    if (!modalPin) return;
    if (await A('simpanKaryawan', [{ id: modalPin.id, nama: modalPin.nama, aktif: modalPin.aktif, pin: '' }], 'PIN karyawan dinonaktifkan')) {
      setModalPin(null);
    }
  };

  // Simpan Ubah Nama
  const simpanNama = async (e: Event) => {
    e.preventDefault();
    if (!modalRen || !modalRen.nama.trim()) return;
    const nm = modalRen.nama.trim();
    if (d.karyawan.some((k) => k.id !== modalRen.k.id && k.nama.toLowerCase() === nm.toLowerCase())) {
      setErrRen('Karyawan dengan nama ini sudah ada');
      return;
    }
    setErrRen('');
    if (await A('simpanKaryawan', [{ id: modalRen.k.id, nama: nm, aktif: modalRen.k.aktif }], 'Nama diperbarui')) {
      setModalRen(null);
    }
  };

  // Ubah status aktif/nonaktif
  const konfirmasiToggle = async () => {
    if (!modalTog) return;
    await A('simpanKaryawan', [{ id: modalTog.id, nama: modalTog.nama, aktif: !modalTog.aktif }], modalTog.aktif ? 'Karyawan dinonaktifkan' : 'Karyawan diaktifkan');
    setModalTog(null);
  };

  // Definisi Kolom Tabel
  const cols: Col<KaryawanAdmin>[] = [
    {
      label: 'Karyawan',
      cell: (k) => (
        <div class="flex items-center gap-3">
          <div
            class="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-fg font-bold select-none border border-line"
            aria-hidden
          >
            {inisial(k.nama)}
          </div>
          <div class="flex min-w-0 flex-col">
            <span class="font-semibold text-fg text-[15px] sm:text-base leading-snug">{k.nama}</span>
            <div class="mt-0.5 flex items-center gap-2 text-xs text-muted-fg">
              {!k.aktif && <Tag tone="danger">Nonaktif</Tag>}
              <span>ID: {k.id.slice(0, 6)}</span>
            </div>
          </div>
        </div>
      ),
    },
    {
      label: 'PIN Tablet',
      cell: (k) =>
        k.punyaPin ? (
          <div class="inline-flex items-center gap-1.5">
            <Tag tone="success">
              <ShieldCheck size={14} weight="bold" class="mr-1 inline" aria-hidden /> PIN Aktif
            </Tag>
            <span class="font-mono text-xs tracking-widest text-muted-fg select-none" title="PIN terpasang">
              ••••
            </span>
          </div>
        ) : (
          <Tag tone="neutral">
            <Key size={13} class="mr-1 inline opacity-50" aria-hidden /> Belum diatur
          </Tag>
        ),
    },
    {
      label: 'Status',
      cell: (k) => (k.aktif ? <Tag tone="success">Aktif</Tag> : <Tag>Nonaktif</Tag>),
    },
    {
      label: ' ',
      bare: true,
      align: 'right',
      cell: (k) => (
        <div class="flex flex-wrap items-center justify-end gap-2 max-md:grid max-md:grid-cols-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => bukaPinModal(k)}
            aria-label={`${k.punyaPin ? 'Ubah' : 'Atur'} PIN untuk ${k.nama}`}
          >
            <Key size={17} weight="bold" class={k.punyaPin ? 'text-primary' : 'text-muted-fg'} aria-hidden />
            {k.punyaPin ? 'Ubah PIN' : 'Atur PIN'}
          </Button>
          <Button size="sm" onClick={() => setModalRen({ k, nama: k.nama })} aria-label={`Ubah nama ${k.nama}`}>
            <PencilSimple size={17} aria-hidden /> Ubah nama
          </Button>
          <Button
            size="sm"
            variant={k.aktif ? 'danger-ghost' : 'secondary'}
            onClick={() => (k.aktif ? setModalTog(k) : A('simpanKaryawan', [{ id: k.id, nama: k.nama, aktif: true }], 'Karyawan diaktifkan'))}
            aria-label={`${k.aktif ? 'Nonaktifkan' : 'Aktifkan'} ${k.nama}`}
          >
            {k.aktif ? <UserCircleMinus size={17} aria-hidden /> : <UserCirclePlus size={17} aria-hidden />}
            {k.aktif ? 'Nonaktifkan' : 'Aktifkan'}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div class="flex flex-col gap-6">
      {/* Header Utama */}
      <PageTitle
        kicker="Master"
        title="Karyawan"
        sub={`${aktifCount} aktif di tablet · ${pinCount} terproteksi PIN`}
        actions={
          <Button variant="primary" onClick={() => setModalTambah(true)}>
            <UserPlus size={20} weight="bold" aria-hidden /> Tambah karyawan
          </Button>
        }
      />

      {/* Kartu Ringkasan Metrik (Bento Grid) */}
      <div class="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        <Card class="flex items-center gap-3.5 p-4">
          <div class="flex size-11 shrink-0 items-center justify-center rounded-xl bg-muted text-fg">
            <Users size={24} weight="bold" aria-hidden />
          </div>
          <div class="min-w-0 flex-1">
            <div class="num text-2xl font-extrabold tracking-tight text-fg">{total}</div>
            <div class="truncate text-xs font-medium text-muted-fg">Total Karyawan</div>
          </div>
        </Card>

        <Card class="flex items-center gap-3.5 p-4">
          <div class="flex size-11 shrink-0 items-center justify-center rounded-xl bg-muted text-primary">
            <UserCheck size={24} weight="bold" aria-hidden />
          </div>
          <div class="min-w-0 flex-1">
            <div class="num text-2xl font-extrabold tracking-tight text-fg">{aktifCount}</div>
            <div class="truncate text-xs font-medium text-muted-fg">Aktif di Tablet</div>
          </div>
        </Card>

        <Card class="flex items-center gap-3.5 p-4">
          <div class="flex size-11 shrink-0 items-center justify-center rounded-xl bg-muted text-fg">
            <ShieldCheck size={24} weight="bold" aria-hidden />
          </div>
          <div class="min-w-0 flex-1">
            <div class="num text-2xl font-extrabold tracking-tight text-fg">{pinCount}</div>
            <div class="truncate text-xs font-medium text-muted-fg">PIN Terpasang</div>
          </div>
        </Card>

        <Card class="flex items-center gap-3.5 p-4">
          <div class="flex size-11 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-fg">
            <UserMinus size={24} weight="bold" aria-hidden />
          </div>
          <div class="min-w-0 flex-1">
            <div class="num text-2xl font-extrabold tracking-tight text-fg">{nonaktifCount}</div>
            <div class="truncate text-xs font-medium text-muted-fg">Nonaktif</div>
          </div>
        </Card>
      </div>

      {/* Banner Informasi Keamanan PIN */}
      <Banner tone="info">
        <span class="font-semibold text-fg">Keamanan PIN Tablet:</span> Staf dengan PIN terpasang wajib memasukkan 4–6 angka saat memilih namanya di tablet kasir/dapur, mencegah pencatatan bahan tertukar antarstaf.
      </Banner>

      {/* Form Tambah Cepat Karyawan */}
      <Card class="p-4 sm:p-5">
        <div class="mb-3 flex items-center gap-2">
          <UserPlus size={18} weight="bold" class="text-primary" aria-hidden />
          <h2 class="text-sm font-bold uppercase tracking-wider text-muted-fg">Tambah Karyawan Cepat</h2>
        </div>
        <form onSubmit={tambahCepat} class="flex flex-col gap-3 md:flex-row md:items-start" noValidate>
          <Field label="Nama karyawan baru" error={quickErr} class="flex-1">
            {(id, dId) => (
              <Input
                id={id}
                placeholder="Contoh: Siti Rahma"
                value={quickNama}
                onInput={(e) => {
                  setQuickNama(e.currentTarget.value);
                  if (quickErr) setQuickErr('');
                }}
                aria-invalid={!!quickErr}
                aria-describedby={dId}
                autocomplete="off"
              />
            )}
          </Field>
          <Field label="PIN Tablet (Opsional)" hint="4–6 angka" class="w-full md:w-48">
            {(id) => (
              <Input
                id={id}
                type="password"
                inputmode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                placeholder="Misal: 1234"
                value={quickPin}
                onInput={(e) => setQuickPin(e.currentTarget.value)}
                autocomplete="off"
              />
            )}
          </Field>
          <Button type="submit" variant="primary" guard class="md:mt-[1.625rem] shrink-0" disabled={!quickNama.trim()}>
            <Plus size={20} weight="bold" aria-hidden /> Tambah
          </Button>
        </form>
      </Card>

      {/* Toolbar Pencarian & Filter Tabs */}
      <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Search Bar */}
        <div class="relative w-full sm:max-w-xs">
          <MagnifyingGlass size={18} class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-fg" aria-hidden />
          <Input
            value={q}
            onInput={(e) => setQ(e.currentTarget.value)}
            placeholder="Cari nama staf…"
            class="pl-9 pr-8"
            aria-label="Cari nama staf"
          />
          {q && (
            <button
              type="button"
              onClick={() => setQ('')}
              class="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-fg hover:text-fg focus-visible:outline-none"
              aria-label="Bersihkan pencarian"
            >
              <X size={16} aria-hidden />
            </button>
          )}
        </div>

        {/* Filter Chips */}
        <div class="flex flex-wrap items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0" role="tablist" aria-label="Filter status staf">
          {(
            [
              { k: 'semua', label: 'Semua', count: total },
              { k: 'aktif', label: 'Aktif', count: aktifCount },
              { k: 'pin', label: 'Ada PIN', count: pinCount },
              { k: 'tanpa-pin', label: 'Tanpa PIN', count: tanpaPinCount },
              { k: 'nonaktif', label: 'Nonaktif', count: nonaktifCount },
            ] as const
          ).map((t) => (
            <button
              key={t.k}
              type="button"
              role="tab"
              aria-selected={filter === t.k}
              onClick={() => setFilter(t.k)}
              class={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors duration-150 ${
                filter === t.k
                  ? 'bg-primary text-white shadow-sm'
                  : 'bg-muted text-muted-fg hover:bg-line hover:text-fg'
              }`}
            >
              <span>{t.label}</span>
              <span
                class={`num rounded-full px-1.5 py-0.2 text-[10px] ${
                  filter === t.k ? 'bg-white/25 text-white' : 'bg-line text-muted-fg'
                }`}
              >
                {t.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Tabel & Daftar Karyawan */}
      <DataTable
        cols={cols}
        rows={list}
        rowKey={(k) => k.id}
        empty={q ? `Tidak ada staf yang cocok dengan "${q}".` : 'Belum ada staf yang terdaftar.'}
      />

      {/* ================= Dialog: Menu Atur PIN Karyawan ================= */}
      <Dialog
        open={!!modalPin}
        onClose={() => setModalPin(null)}
        title="Atur PIN Tablet Karyawan"
        footer={
          <div class="flex w-full items-center justify-between gap-2">
            <div>
              {modalPin?.punyaPin && (
                <Button variant="danger-ghost" guard onClick={hapusPin} type="button">
                  Hapus PIN
                </Button>
              )}
            </div>
            <div class="flex items-center gap-2">
              <Button onClick={() => setModalPin(null)} type="button">
                Batal
              </Button>
              <Button variant="primary" guard type="submit" form="form-pin" disabled={!pinVal.trim() || !pinKonf.trim()}>
                Simpan PIN
              </Button>
            </div>
          </div>
        }
      >
        {modalPin && (
          <form id="form-pin" onSubmit={simpanPin} class="flex flex-col gap-4">
            {/* Profil Staf Header */}
            <div class="flex items-center gap-3 rounded-card border border-line bg-muted p-3">
              <div class="flex size-11 items-center justify-center rounded-full bg-primary-soft font-bold text-primary ring-1 ring-primary/20">
                {inisial(modalPin.nama)}
              </div>
              <div class="min-w-0 flex-1">
                <div class="font-bold text-fg">{modalPin.nama}</div>
                <div class="text-xs text-muted-fg">
                  Status saat ini:{' '}
                  {modalPin.punyaPin ? (
                    <span class="font-semibold text-success">PIN Aktif terpasang</span>
                  ) : (
                    <span class="font-semibold text-muted-fg">Belum memiliki PIN</span>
                  )}
                </div>
              </div>
            </div>

            <p class="text-sm text-muted-fg">
              PIN digunakan staf untuk masuk ke menu tablet kasir/dapur saat memilih namanya. Masukkan 4–6 angka numerik.
            </p>

            <Field label="PIN Baru (4–6 angka)" error={errPin}>
              {(id, dId) => (
                <div class="relative">
                  <Input
                    id={id}
                    type={showPin ? 'text' : 'password'}
                    inputmode="numeric"
                    pattern="[0-9]*"
                    maxLength={6}
                    placeholder="Masukkan 4–6 angka"
                    value={pinVal}
                    onInput={(e) => {
                      setPinVal(e.currentTarget.value);
                      if (errPin) setErrPin('');
                    }}
                    autoFocus
                    autocomplete="new-password"
                    aria-invalid={!!errPin}
                    aria-describedby={dId}
                    class="pr-10 font-mono tracking-widest"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPin(!showPin)}
                    class="absolute right-3 top-1/2 -translate-y-1/2 text-muted-fg hover:text-fg focus-visible:outline-none"
                    aria-label={showPin ? 'Sembunyikan PIN' : 'Tampilkan PIN'}
                  >
                    {showPin ? <EyeSlash size={18} aria-hidden /> : <Eye size={18} aria-hidden />}
                  </button>
                </div>
              )}
            </Field>

            <Field label="Konfirmasi PIN Baru">
              {(id) => (
                <Input
                  id={id}
                  type={showPin ? 'text' : 'password'}
                  inputmode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  placeholder="Ketik ulang PIN baru"
                  value={pinKonf}
                  onInput={(e) => {
                    setPinKonf(e.currentTarget.value);
                    if (errPin) setErrPin('');
                  }}
                  autocomplete="new-password"
                  class="font-mono tracking-widest"
                />
              )}
            </Field>
          </form>
        )}
      </Dialog>

      {/* ================= Dialog: Tambah Karyawan Baru ================= */}
      <Dialog
        open={modalTambah}
        onClose={() => setModalTambah(false)}
        title="Tambah Karyawan Baru"
        footer={
          <>
            <Button onClick={() => setModalTambah(false)}>Batal</Button>
            <Button variant="primary" guard type="submit" form="form-modal-tambah" disabled={!namaBaru.trim()}>
              Tambah Karyawan
            </Button>
          </>
        }
      >
        <form id="form-modal-tambah" onSubmit={tambahModal} class="flex flex-col gap-4">
          <Field label="Nama Lengkap Karyawan" error={errTambah}>
            {(id, dId) => (
              <Input
                id={id}
                placeholder="Contoh: Budi Santoso"
                value={namaBaru}
                onInput={(e) => {
                  setNamaBaru(e.currentTarget.value);
                  if (errTambah) setErrTambah('');
                }}
                autoFocus
                autocomplete="off"
                aria-invalid={!!errTambah}
                aria-describedby={dId}
              />
            )}
          </Field>

          <Field label="PIN Tablet (Opsional)" hint="4–6 angka numerik. Dapat dikosongkan jika staf belum butuh PIN.">
            {(id) => (
              <Input
                id={id}
                type="password"
                inputmode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                placeholder="Contoh: 1234"
                value={pinBaru}
                onInput={(e) => setPinBaru(e.currentTarget.value)}
                autocomplete="new-password"
                class="font-mono tracking-widest"
              />
            )}
          </Field>
        </form>
      </Dialog>

      {/* ================= Dialog: Ubah Nama ================= */}
      <Dialog
        open={!!modalRen}
        onClose={() => setModalRen(null)}
        title="Ubah Nama Karyawan"
        footer={
          <>
            <Button onClick={() => setModalRen(null)}>Batal</Button>
            <Button variant="primary" guard type="submit" form="form-ren" disabled={!modalRen?.nama.trim()}>
              Simpan
            </Button>
          </>
        }
      >
        {modalRen && (
          <form id="form-ren" onSubmit={simpanNama} class="flex flex-col gap-3">
            <Field label="Nama baru" error={errRen}>
              {(id, dId) => (
                <Input
                  id={id}
                  value={modalRen.nama}
                  onInput={(e) => {
                    setModalRen({ ...modalRen, nama: e.currentTarget.value });
                    if (errRen) setErrRen('');
                  }}
                  autoFocus
                  aria-invalid={!!errRen}
                  aria-describedby={dId}
                />
              )}
            </Field>
          </form>
        )}
      </Dialog>

      {/* ================= Confirm: Nonaktifkan Karyawan ================= */}
      <Confirm
        open={!!modalTog}
        title="Nonaktifkan Karyawan?"
        okLabel="Nonaktifkan"
        tone="danger"
        onCancel={() => setModalTog(null)}
        onOk={konfirmasiToggle}
      >
        Staf <strong class="text-fg">{modalTog?.nama}</strong> tidak akan muncul lagi di pilihan nama tablet kasir/dapur. Riwayat transaksi sebelumnya tetap tersimpan di sistem.
      </Confirm>
    </div>
  );
}
