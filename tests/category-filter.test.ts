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
});
