import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { nf, parseNum, r3, cocok, dekatTutup, urutKat, grupKat, katOf, hanyaAngka, cegahBukanAngka } from '../src/lib/format.ts';

describe('Format & Number Parsing Helpers', () => {
  it('nf formats valid numbers into Indonesian locale with max 3 decimals', () => {
    assert.equal(nf(10), '10');
    assert.equal(nf(1250), '1.250');
    assert.equal(nf(1.5), '1,5');
    assert.equal(nf(1.125), '1,125');
    assert.equal(nf(1.1256), '1,126');
  });

  it('nf safely handles null, undefined, empty string, NaN, and Infinity without returning "NaN"', () => {
    assert.equal(nf(null), '0');
    assert.equal(nf(undefined), '0');
    assert.equal(nf(''), '0');
    assert.equal(nf(NaN), '0');
    assert.equal(nf(Infinity), '0');
    assert.equal(nf(-Infinity), '0');
    assert.equal(nf('not-a-number'), '0');
  });

  it('parseNum converts comma decimals, thousands separators, and returns valid numbers', () => {
    assert.equal(parseNum('10'), 10);
    assert.equal(parseNum('10,5'), 10.5);
    assert.equal(parseNum('0,125'), 0.125);
    assert.equal(parseNum(5.5), 5.5);
    assert.equal(parseNum(0), 0);
    assert.equal(parseNum('1.000'), 1000);
    assert.equal(parseNum('1.000,5'), 1000.5);
    assert.equal(parseNum('1.000.000'), 1000000);
    assert.equal(parseNum('1.000.000,25'), 1000000.25);
  });

  it('parseNum returns NaN for empty/null/undefined or non-numeric strings', () => {
    assert.ok(Number.isNaN(parseNum('')));
    assert.ok(Number.isNaN(parseNum(null)));
    assert.ok(Number.isNaN(parseNum(undefined)));
    assert.ok(Number.isNaN(parseNum('abc')));
  });

  it('r3 rounds to 3 decimal places and protects against non-finite values', () => {
    assert.equal(r3(1.2345), 1.235);
    assert.equal(r3(1.2341), 1.234);
    assert.equal(r3(0), 0);
    assert.equal(r3(NaN), 0);
    assert.equal(r3(Infinity), 0);
  });

  it('cocok matches items by substring name (case-insensitive) or prefix code', () => {
    const item = { nama: 'Ayam Suwir', kode: 'AS' };
    assert.ok(cocok(item, 'ayam'));
    assert.ok(cocok(item, 'SUWIR'));
    assert.ok(cocok(item, 'as'));
    assert.ok(cocok(item, ''));
    assert.ok(!cocok(item, 'sapi'));
  });

  it('katOf retrieves category or defaults to Lainnya', () => {
    assert.equal(katOf({ kategori: 'Bumbu' }), 'Bumbu');
    assert.equal(katOf({}), 'Lainnya');
    assert.equal(katOf({ kategori: '' }), 'Lainnya');
  });

  it('urutKat respects custom category order then appends remaining categories', () => {
    const list = [
      { kategori: 'Minuman' },
      { kategori: 'Freezer Protein' },
      { kategori: 'Bumbu' },
    ];
    const urutan = ['Freezer Protein', 'Bumbu'];
    const result = urutKat(list, urutan);
    assert.deepEqual(result, ['Freezer Protein', 'Bumbu', 'Minuman']);
  });

  it('grupKat groups items according to ordered categories', () => {
    const list = [
      { nama: 'Es Teh', kategori: 'Minuman' },
      { nama: 'Ayam', kategori: 'Freezer Protein' },
      { nama: 'Kopi', kategori: 'Minuman' },
    ];
    const urutan = ['Minuman', 'Freezer Protein'];
    const grouped = grupKat(list, urutan);
    assert.equal(grouped.length, 2);
    assert.equal(grouped[0].k, 'Minuman');
    assert.equal(grouped[0].l.length, 2);
    assert.equal(grouped[1].k, 'Freezer Protein');
    assert.equal(grouped[1].l.length, 1);
  });

  it('hanyaAngka strips non-numeric characters and enforces at most one decimal separator', () => {
    assert.equal(hanyaAngka('123'), '123');
    assert.equal(hanyaAngka('12a3bc'), '123');
    assert.equal(hanyaAngka('abc'), '');
    assert.equal(hanyaAngka('-5'), '5');
    assert.equal(hanyaAngka('10,5'), '10,5');
    assert.equal(hanyaAngka('10.5'), '10.5');
    assert.equal(hanyaAngka('10.5.2'), '10.52');
    assert.equal(hanyaAngka('10,5,2'), '10,52');
    assert.equal(hanyaAngka('!@#$%^'), '');
  });

  it('cegahBukanAngka prevents non-numeric keys while allowing navigation and shortcuts', () => {
    let prevented = false;
    const makeEv = (key: string, extra = {}) => ({
      key,
      preventDefault: () => { prevented = true; },
      ...extra,
    } as unknown as KeyboardEvent);

    // Allowed digit
    prevented = false;
    cegahBukanAngka(makeEv('5'), '');
    assert.equal(prevented, false);

    // Allowed decimal point when none exists
    prevented = false;
    cegahBukanAngka(makeEv(','), '10');
    assert.equal(prevented, false);

    prevented = false;
    cegahBukanAngka(makeEv('.'), '10');
    assert.equal(prevented, false);

    // Blocked second decimal point
    prevented = false;
    cegahBukanAngka(makeEv(','), '10,5');
    assert.equal(prevented, true);

    // Blocked letters and symbols
    prevented = false;
    cegahBukanAngka(makeEv('a'), '10');
    assert.equal(prevented, true);

    prevented = false;
    cegahBukanAngka(makeEv('-'), '10');
    assert.equal(prevented, true);

    // Allowed navigation / control keys
    prevented = false;
    cegahBukanAngka(makeEv('Backspace'), '10');
    assert.equal(prevented, false);

    prevented = false;
    cegahBukanAngka(makeEv('ArrowLeft'), '10');
    assert.equal(prevented, false);

    // Allowed shortcuts (e.g. Ctrl+A, Ctrl+V)
    prevented = false;
    cegahBukanAngka(makeEv('v', { ctrlKey: true }), '10');
    assert.equal(prevented, false);
  });
});
