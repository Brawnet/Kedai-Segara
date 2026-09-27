import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { pesan, pinSalah } from '../src/lib/api.ts';

describe('API Client Helpers', () => {
  it('pesan strips Apps Script "Error:" and "Exception:" prefixes', () => {
    assert.equal(pesan(new Error('Error: PIN salah')), 'PIN salah');
    assert.equal(pesan(new Error('Exception: Barang tidak ditemukan')), 'Barang tidak ditemukan');
    assert.equal(pesan('Error: Jumlah harus lebih dari 0'), 'Jumlah harus lebih dari 0');
    assert.equal(pesan('Koneksi normal'), 'Koneksi normal');
  });

  it('pinSalah detects PIN error messages accurately', () => {
    assert.ok(pinSalah(new Error('Error: PIN salah')));
    assert.ok(pinSalah('PIN salah. Coba lagi.'));
    assert.ok(!pinSalah(new Error('Barang tidak ditemukan')));
    assert.ok(!pinSalah(new Error('Sistem belum di-setup')));
  });
});
