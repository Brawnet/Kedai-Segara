import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { ArrowCounterClockwise, FolderPlus, MagnifyingGlass, PencilSimple, Plus, ShieldCheck, Trash } from '@phosphor-icons/react';
import { alurLabel, cocok, grupKat, katOf, nf, parseNum, urutKat } from '../lib/format';
import { useApp } from '../lib/app';
import type { Alur, Barang, BarangInput } from '../lib/types';
import { Banner, Button, Confirm, Dialog, Field, Input, PageTitle, Select, Tag } from '../components/ui';
import { DataTable, useAdmin, type Col } from './shared';

type Form = Required<Omit<BarangInput, 'ambang_min' | 'stok_awal'>> & { ambang_min: string; stok_awal: string };

const kosong: Form = { id: '', nama: '', satuan: '', kategori: '', kode: '', catatan: '', alur: 'LUAR', ambang_min: '', aktif: true, stok_awal: '0' };

export function BarangPage() {
  const { d, A } = useAdmin();
  const [q, setQ] = useState('');
  const [kat, setKat] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (
        e.key === '/' &&
        document.activeElement !== searchRef.current &&
        document.activeElement?.tagName !== 'INPUT' &&
        document.activeElement?.tagName !== 'TEXTAREA'
      ) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  const { toast } = useApp();
  const [f, setF] = useState<Form | null>(null);
  const [err, setErr] = useState<Partial<Record<keyof Form, string>>>({});
  const [extraKat, setExtraKat] = useState<string[]>([]);
  const [modalKat, setModalKat] = useState(false);
  const [katBaruInput, setKatBaruInput] = useState('');
  const [errKatBaru, setErrKatBaru] = useState('');

  const [modalHapus, setModalHapus] = useState<Barang | null>(null);

  const kats = useMemo(() => {
    const list = urutKat(d.barang, d.urutan);
    extraKat.forEach((k) => {
      if (!list.includes(k)) list.push(k);
    });
    return list;
  }, [d, extraKat]);

  const simpanKategoriBaru = (e: Event) => {
    e.preventDefault();
    const nm = katBaruInput.trim();
    if (!nm) {
      setErrKatBaru('Nama kategori tidak boleh kosong');
      return;
    }
    const match = kats.find((k) => k.toLowerCase() === nm.toLowerCase());
    if (match) {
      up({ kategori: match });
      toast(`Kategori "${match}" sudah ada dan dipilih`);
      setModalKat(false);
      setKatBaruInput('');
      setErrKatBaru('');
      return;
    }
    setExtraKat((prev) => [...prev, nm]);
    up({ kategori: nm });
    toast(`Kategori "${nm}" berhasil ditambahkan`);
    setModalKat(false);
    setKatBaruInput('');
    setErrKatBaru('');
  };
  const list = d.barang.filter((b) => (cocok(b, q) || b.kategori.toLowerCase().includes(q.toLowerCase().trim())) && (!kat || katOf(b) === kat));

  const buka = (b?: Barang) => {
    setErr({});
    setF(b ? { ...b, ambang_min: String(b.ambang_min), stok_awal: '' } : { ...kosong });
  };
  const up = (p: Partial<Form>) => setF((x) => x && { ...x, ...p });

  const simpan = async (e: Event) => {
    e.preventDefault();
    if (!f) return;
    const er: typeof err = {};
    if (!f.nama.trim()) er.nama = 'Nama wajib diisi';
    if (!f.satuan.trim()) er.satuan = 'Satuan wajib diisi';
    const min = parseNum(f.ambang_min || '0');
    if (isNaN(min) || min < 0) er.ambang_min = 'Ambang minimum tidak boleh negatif';
    if (!f.id) {
      const awal = parseNum(f.stok_awal || '0');
      if (isNaN(awal) || awal < 0) er.stok_awal = 'Stok awal tidak boleh negatif';
    }
    setErr(er);
    if (Object.keys(er).length) return;
    const o: BarangInput = { ...f, id: f.id || '', stok_awal: f.id ? undefined : f.stok_awal };
    if (await A('simpanBarang', [o], 'Barang disimpan')) setF(null);
  };

  const cols: Col<Barang>[] = [
    {
      label: 'Barang',
      cell: (b) => (
        <div>
          <span class="flex flex-wrap items-center gap-2">
            <span class="font-semibold">{b.nama}</span>
            {b.kode && <Tag>{b.kode}</Tag>}
            {!b.aktif && <Tag tone="danger">Arsip</Tag>}
          </span>
          {b.catatan && <p class="text-sm font-normal text-muted-fg">{b.catatan}</p>}
        </div>
      ),
    },
    { label: 'Satuan', cell: (b) => b.satuan },
    { label: 'Alur', cell: (b) => <span class="text-sm">{alurLabel(b.alur)}</span> },
    { label: 'Min', align: 'right', cell: (b) => nf(b.ambang_min) },
    {
      label: ' ',
      bare: true,
      align: 'right',
      cell: (b) => (
        <div class="flex items-center justify-end gap-1.5">
          {!b.aktif && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => A('simpanBarang', [{ ...b, aktif: true }], `Barang "${b.nama}" diaktifkan kembali`)}
              aria-label={`Aktifkan kembali ${b.nama}`}
              title="Aktifkan kembali"
            >
              <ArrowCounterClockwise size={16} aria-hidden />
              <span class="hidden sm:inline">Aktifkan</span>
            </Button>
          )}
          <Button size="sm" onClick={() => buka(b)} aria-label={`Edit ${b.nama}`}>
            <PencilSimple size={18} aria-hidden /> Edit
          </Button>
          <Button
            size="sm"
            variant="danger-ghost"
            onClick={() => setModalHapus(b)}
            aria-label={`Hapus ${b.nama}`}
            title="Hapus barang"
          >
            <Trash size={18} aria-hidden />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div class="flex flex-col gap-6">
      <PageTitle
        kicker="Master"
        title="Barang"
        sub={`${d.barang.filter((b) => b.aktif).length} aktif · ${d.barang.filter((b) => !b.aktif).length} diarsipkan`}
        actions={
          <Button variant="primary" onClick={() => buka()}>
            <Plus size={20} weight="bold" aria-hidden /> Tambah barang
          </Button>
        }
      />
      <div class="flex flex-col gap-2.5 sm:flex-row sm:items-center">
        <label class="relative block flex-1">
          <span class="sr-only">Cari barang</span>
          <MagnifyingGlass size={20} class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-fg" aria-hidden />
          <Input
            ref={searchRef}
            type="search"
            value={q}
            onInput={(e) => setQ(e.currentTarget.value)}
            placeholder="Cari nama, kode, atau kategori… (tekan /)"
            class="pl-10"
          />
        </label>
        <div class="w-full sm:w-56 shrink-0">
          <label class="sr-only" for="barang-kat-filter">Filter Kategori</label>
          <Select
            id="barang-kat-filter"
            value={kat}
            onChange={(e) => setKat(e.currentTarget.value)}
            class="min-h-11 font-medium text-sm"
          >
            <option value="">Semua Kategori ({d.barang.length})</option>
            {urutKat(d.barang, d.urutan).map((k) => (
              <option key={k} value={k}>
                {k} ({d.barang.filter((b) => katOf(b) === k).length})
              </option>
            ))}
          </Select>
        </div>
      </div>
      <DataTable
        compact
        cols={cols}
        groups={grupKat(list, d.urutan)}
        rowKey={(b) => b.id}
        rowClass={(b) => (b.aktif ? '' : 'opacity-70')}
        searchQuery={q}
        empty="Tidak ada barang."
      />

      <Dialog
        open={!!f}
        onClose={() => setF(null)}
        title={f?.id ? `Edit: ${f.nama}` : 'Tambah barang'}
        wide
        footer={
          <div class="flex w-full flex-wrap items-center justify-between gap-2">
            {f?.id ? (
              <Button
                variant="danger-ghost"
                type="button"
                onClick={() => {
                  const target = d.barang.find((x) => x.id === f.id);
                  if (target) setModalHapus(target);
                }}
                class="text-danger hover:bg-danger-soft"
              >
                <Trash size={18} aria-hidden /> Hapus barang
              </Button>
            ) : (
              <span />
            )}
            <div class="flex items-center gap-2">
              <Button type="button" onClick={() => setF(null)}>
                Batal
              </Button>
              <Button variant="primary" guard type="submit" form="form-barang">
                Simpan
              </Button>
            </div>
          </div>
        }
      >
        {f && (
          <form id="form-barang" onSubmit={simpan} class="grid gap-4 sm:grid-cols-2" noValidate>
            <Field label="Nama" error={err.nama} class="sm:col-span-2">
              {(id, dId) => <Input id={id} value={f.nama} onInput={(e) => up({ nama: e.currentTarget.value })} aria-invalid={!!err.nama} aria-describedby={dId} />}
            </Field>
            <Field label="Kode" hint="Singkatan untuk pencarian cepat, mis. AS">
              {(id, dId) => <Input id={id} value={f.kode} onInput={(e) => up({ kode: e.currentTarget.value })} aria-describedby={dId} autocomplete="off" />}
            </Field>
            <Field label="Satuan" error={err.satuan}>
              {(id, dId) => (
                <Input id={id} value={f.satuan} onInput={(e) => up({ satuan: e.currentTarget.value })} placeholder="kg, liter, pcs" aria-invalid={!!err.satuan} aria-describedby={dId} />
              )}
            </Field>
            <Field label="Kategori" hint="Pilih dari daftar atau buat kategori baru">
              {(id, dId) => (
                <div class="flex gap-2">
                  <div class="relative min-w-0 flex-1">
                    <Input
                      id={id}
                      list="dl-kat"
                      value={f.kategori}
                      onInput={(e) => up({ kategori: e.currentTarget.value })}
                      placeholder="Pilih atau ketik kategori…"
                      aria-describedby={dId}
                      autocomplete="off"
                    />
                    <datalist id="dl-kat">
                      {kats.map((k) => (
                        <option key={k} value={k} />
                      ))}
                    </datalist>
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      setKatBaruInput('');
                      setErrKatBaru('');
                      setModalKat(true);
                    }}
                    class="shrink-0 px-3 whitespace-nowrap"
                    title="Buat kategori baru"
                  >
                    <FolderPlus size={18} weight="bold" class="text-primary" aria-hidden />
                    <span class="hidden sm:inline">Kategori baru</span>
                    <span class="sm:hidden">+ Baru</span>
                  </Button>
                </div>
              )}
            </Field>
            <Field label="Alur">
              {(id) => (
                <Select id={id} value={f.alur} onChange={(e) => up({ alur: e.currentTarget.value as Alur })}>
                  <option value="LUAR">Lewat Stock Luar (direkap)</option>
                  <option value="LANGSUNG_HABIS">Langsung habis</option>
                </Select>
              )}
            </Field>
            <Field label="Ambang minimum" hint="Muncul peringatan jika total stok di bawah angka ini" error={err.ambang_min}>
              {(id, dId) => <Input id={id} inputmode="decimal" value={f.ambang_min} onInput={(e) => up({ ambang_min: e.currentTarget.value })} aria-invalid={!!err.ambang_min} aria-describedby={dId} class="num" />}
            </Field>
            {f.id ? (
              <Field label="Status" hint="Arsip hanya bisa jika stok dalam dan luar = 0">
                {(id, dId) => (
                  <Select id={id} value={f.aktif ? '1' : '0'} onChange={(e) => up({ aktif: e.currentTarget.value === '1' })} aria-describedby={dId}>
                    <option value="1">Aktif</option>
                    <option value="0">Diarsipkan</option>
                  </Select>
                )}
              </Field>
            ) : (
              <Field label="Stok awal gudang" error={err.stok_awal}>
                {(id, dId) => <Input id={id} inputmode="decimal" value={f.stok_awal} onInput={(e) => up({ stok_awal: e.currentTarget.value })} aria-invalid={!!err.stok_awal} aria-describedby={dId} class="num" />}
              </Field>
            )}
            <Field label="Catatan" class="sm:col-span-2">
              {(id) => <Input id={id} value={f.catatan} onInput={(e) => up({ catatan: e.currentTarget.value })} placeholder="mis. 1 Pack isi 10 pcs" />}
            </Field>
          </form>
        )}
      </Dialog>

      {/* Dialog Buat Kategori Baru */}
      <Dialog
        open={modalKat}
        onClose={() => setModalKat(false)}
        title="Buat Kategori Baru"
        footer={
          <>
            <Button type="button" onClick={() => setModalKat(false)}>
              Batal
            </Button>
            <Button
              type="submit"
              variant="primary"
              form="form-kat-baru"
              disabled={!katBaruInput.trim()}
            >
              Gunakan Kategori
            </Button>
          </>
        }
      >
        <form id="form-kat-baru" onSubmit={simpanKategoriBaru} class="flex flex-col gap-4">
          <p class="text-sm text-muted-fg">
            Masukkan nama kategori baru untuk mengelompokkan barang pada daftar stok dan laporan.
          </p>

          <Field label="Nama Kategori Baru" error={errKatBaru}>
            {(id, dId) => (
              <Input
                id={id}
                placeholder="Contoh: Saus & Condiment"
                value={katBaruInput}
                onInput={(e) => {
                  setKatBaruInput(e.currentTarget.value);
                  if (errKatBaru) setErrKatBaru('');
                }}
                autoFocus
                autocomplete="off"
                aria-invalid={!!errKatBaru}
                aria-describedby={dId}
              />
            )}
          </Field>

          {kats.length > 0 && (
            <div>
              <span class="block text-xs font-semibold uppercase tracking-wider text-muted-fg mb-1.5">
                Kategori yang sudah ada:
              </span>
              <div class="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto pr-1">
                {kats.map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => {
                      up({ kategori: k });
                      toast(`Kategori "${k}" dipilih`);
                      setModalKat(false);
                      setKatBaruInput('');
                    }}
                    class="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-fg hover:bg-primary-soft hover:text-primary transition-colors cursor-pointer"
                  >
                    {k}
                  </button>
                ))}
              </div>
            </div>
          )}
        </form>
      </Dialog>

      {/* Dialog Konfirmasi Hapus Barang */}
      {modalHapus && (
        <Confirm
          open={!!modalHapus}
          title={`Hapus "${modalHapus.nama}"?`}
          okLabel={
            modalHapus.stok_dalam > 0 || modalHapus.stok_luar > 0
              ? 'Tutup'
              : 'Hapus Barang'
          }
          tone={
            modalHapus.stok_dalam > 0 || modalHapus.stok_luar > 0
              ? 'primary'
              : 'danger'
          }
          onCancel={() => setModalHapus(null)}
          onOk={async () => {
            if (modalHapus.stok_dalam > 0 || modalHapus.stok_luar > 0) {
              setModalHapus(null);
              return;
            }
            const targetId = modalHapus.id;
            const res = await A('hapusBarang', [targetId], (r) => r.message);
            if (res) {
              setModalHapus(null);
              setF(null);
            }
          }}
        >
          {modalHapus.stok_dalam > 0 || modalHapus.stok_luar > 0 ? (
            <div class="flex flex-col gap-3 text-sm">
              <Banner tone="warning">
                Barang tidak bisa dihapus karena masih memiliki stok:
                <div class="mt-1 font-bold">
                  Stok Gudang: {nf(modalHapus.stok_dalam)} {modalHapus.satuan} · Stok Luar: {nf(modalHapus.stok_luar)} {modalHapus.satuan}
                </div>
              </Banner>
              <p class="text-muted-fg leading-relaxed">
                Harap nolkan stok fisik terlebih dahulu (misalnya melalui menu <strong>Opname</strong> atau rekap penyesuaian) sebelum menghapus atau mengarsipkan barang ini.
              </p>
            </div>
          ) : (
            <div class="flex flex-col gap-3 text-sm">
              <p class="text-fg">
                Apakah Anda yakin ingin menghapus barang <strong>{modalHapus.nama}</strong> {modalHapus.kode ? `(${modalHapus.kode})` : ''}?
              </p>
              <div class="rounded-card border border-line bg-muted/60 p-3.5 space-y-2 text-xs text-muted-fg leading-relaxed">
                <div class="font-bold text-fg flex items-center gap-1.5">
                  <ShieldCheck size={16} class="text-primary shrink-0" /> Keamanan Riwayat Transaksi:
                </div>
                <p>
                  • <strong>Jika pernah ada transaksi:</strong> Barang akan <em>diarsipkan otomatis</em>. Riwayat transaksi masa lalu dan laporan bulanan di Google Sheet tetap utuh 100%, namun barang langsung disembunyikan dari tablet dapur & menu harian.
                </p>
                <p>
                  • <strong>Jika belum pernah ada transaksi:</strong> Barang akan <em>dihapus permanen</em> dari Google Sheet.
                </p>
              </div>
            </div>
          )}
        </Confirm>
      )}
    </div>
  );
}
