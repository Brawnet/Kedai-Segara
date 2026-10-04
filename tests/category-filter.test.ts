import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cocok, grupKat, katOf, urutKat } from '../src/lib/format.ts';
import type { Barang } from '../src/lib/types.ts';

describe('Category Filtering & Stock Aggregation Logic', () => {
  const mockBarang: Barang[] = [
    { id: '1', nama: 'Ayam Suwir', kategori: 'Freezer Protein', stok_dalam: 5, stok_luar: 3, ambang_min: 8, satuan: 'Porsi', alur: 'LUAR', aktif: true, kode: 'AS' },
    { id: '2', nama: 'Topping Kwetiau', kategori: 'Freezer Protein', stok_dalam: 12, stok_luar: 0, ambang_min: 8, satuan: 'Porsi', alur: 'LUAR', aktif: true, kode: 'TK' },
    { id: '3', nama: 'Cumi', kategori: 'Freezer Protein', stok_dalam: 4, stok_luar: 2, ambang_min: 8, satuan: 'Porsi', alur: 'LUAR', aktif: true, kode: 'CM' }, // total 6 < 8 (menipis)
    { id: '4', nama: 'Bumbu Merah', kategori: 'Freezer Bumbu', stok_dalam: 2, stok_luar: 1, ambang_min: 5, satuan: 'Pack', alur: 'LUAR', aktif: true, kode: 'BM' }, // total 3 < 5 (menipis)
    { id: '5', nama: 'Bumbu Putih', kategori: 'Freezer Bumbu', stok_dalam: 10, stok_luar: 2, ambang_min: 5, satuan: 'Pack', alur: 'LUAR', aktif: true, kode: 'BP' },
  ];

  const total = (b: Barang) => b.stok_dalam + b.stok_luar;
  const menipis = (b: Barang) => total(b) < b.ambang_min;

  it('filters accurately by category dropdown selection', () => {
    const filterKat = 'Freezer Protein';
    const result = mockBarang.filter((b) => !filterKat || katOf(b) === filterKat);
    assert.equal(result.length, 3);
    assert.ok(result.every((b) => b.kategori === 'Freezer Protein'));
  });

  it('supports combining search, category filter, and low-stock filter', () => {
    const q = 'bumbu';
    const filterKat = 'Freezer Bumbu';
    const onlyLow = true;

    const result = mockBarang.filter(
      (b) => cocok(b, q) && (!onlyLow || menipis(b)) && (!filterKat || katOf(b) === filterKat),
    );

    assert.equal(result.length, 1);
    assert.equal(result[0].nama, 'Bumbu Merah');
  });

  it('supports multi-category filtering (array of categories)', () => {
    // Empty selection returns all
    const noFilter: string[] = [];
    const allResult = mockBarang.filter((b) => noFilter.length === 0 || noFilter.includes(katOf(b)));
    assert.equal(allResult.length, 5);

    // Single category in array
    const singleFilter = ['Freezer Protein'];
    const singleResult = mockBarang.filter((b) => singleFilter.length === 0 || singleFilter.includes(katOf(b)));
    assert.equal(singleResult.length, 3);
    assert.ok(singleResult.every((b) => b.kategori === 'Freezer Protein'));

    // Multiple categories selected simultaneously
    const multiFilter = ['Freezer Protein', 'Freezer Bumbu'];
    const multiResult = mockBarang.filter((b) => multiFilter.length === 0 || multiFilter.includes(katOf(b)));
    assert.equal(multiResult.length, 5);

    // Combined with low-stock filter
    const multiWithLow = mockBarang.filter(
      (b) => (!multiFilter.length || multiFilter.includes(katOf(b))) && menipis(b),
    );
    assert.equal(multiWithLow.length, 2); // Cumi (6 < 8) and Bumbu Merah (3 < 5)
    assert.deepEqual(multiWithLow.map((b) => b.nama), ['Cumi', 'Bumbu Merah']);
  });

  it('calculates low stock count per category group accurately for groupBadge', () => {
    const groups = grupKat(mockBarang);
    const badgeCounts: Record<string, number> = {};

    groups.forEach((g) => {
      badgeCounts[g.k] = g.l.filter(menipis).length;
    });

    assert.equal(badgeCounts['Freezer Protein'], 1); // Cumi is 6 < 8
    assert.equal(badgeCounts['Freezer Bumbu'], 1); // Bumbu Merah is 3 < 5
  });

  it('generates distinct categories with item counts for dropdown options', () => {
    const categories = urutKat(mockBarang);
    const options = categories.map((k) => ({
      label: k,
      count: mockBarang.filter((b) => katOf(b) === k).length,
    }));

    assert.deepEqual(options, [
      { label: 'Freezer Protein', count: 3 },
      { label: 'Freezer Bumbu', count: 2 },
    ]);
  });

  it('computes stock opname values: di dalam, di luar, and total', () => {
    const ayamSuwir = mockBarang[0]!;
    assert.equal(ayamSuwir.stok_dalam, 5);
    assert.equal(ayamSuwir.stok_luar, 3);
    assert.equal(total(ayamSuwir), 8);

    const cumi = mockBarang[2]!;
    assert.equal(cumi.stok_dalam, 4);
    assert.equal(cumi.stok_luar, 2);
    assert.equal(total(cumi), 6);
  });

  it('filters accurately by status filter: aktif, menipis, and arsip', () => {
    const sample: Barang[] = [
      ...mockBarang,
      { id: '6', nama: 'Barang Arsip', kategori: 'Lainnya', stok_dalam: 0, stok_luar: 0, ambang_min: 0, satuan: 'Pcs', alur: 'LUAR', aktif: false, kode: 'BA' },
    ];

    const isMenipis = (b: Barang) => b.aktif && b.stok_dalam + b.stok_luar < b.ambang_min;

    const aktifOnly = sample.filter((b) => b.aktif);
    assert.equal(aktifOnly.length, 5);

    const arsipOnly = sample.filter((b) => !b.aktif);
    assert.equal(arsipOnly.length, 1);
    assert.equal(arsipOnly[0]?.nama, 'Barang Arsip');

    const menipisOnly = sample.filter(isMenipis);
    assert.equal(menipisOnly.length, 2);
    assert.deepEqual(menipisOnly.map((b) => b.nama), ['Cumi', 'Bumbu Merah']);
  });

  it('calculates total porsi, gudang, and luar correctly for items with satuan porsi', () => {
    const isPorsi = (b: Barang) => b.satuan.trim().toLowerCase() === 'porsi';
    const porsiItems = mockBarang.filter((b) => b.aktif && isPorsi(b));

    assert.equal(porsiItems.length, 3);

    const gudang = porsiItems.reduce((acc, b) => acc + b.stok_dalam, 0);
    const luar = porsiItems.reduce((acc, b) => acc + b.stok_luar, 0);
    const totalPorsi = gudang + luar;

    assert.equal(gudang, 21); // 5 + 12 + 4
    assert.equal(luar, 5);    // 3 + 0 + 2
    assert.equal(totalPorsi, 26);
  });
});
