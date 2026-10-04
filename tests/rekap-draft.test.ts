import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  loadRekapDraft,
  saveRekapDraft,
  clearRekapDraft,
  REKAP_DRAFT_MAX_AGE_MS,
  REKAP_DRAFT_KEY,
} from '../src/lib/rekap-draft.ts';

function createMockStorage(): Storage {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, String(value)),
    removeItem: (key: string) => store.delete(key),
    clear: () => store.clear(),
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size;
    },
  };
}

describe('Rekap Approval Draft Persistence & Expiry Logic', () => {
  it('returns null when no draft exists', () => {
    const storage = createMockStorage();
    assert.equal(loadRekapDraft(storage), null);
  });

  it('saves and loads valid draft with sisa, terjual, and manualTerjual within 24 hours', () => {
    const storage = createMockStorage();
    const now = 1_700_000_000_000;
    const sisaVals = {
      rk_1: { b_ayam: '2', b_paha: '4' },
    };
    const terjualVals = {
      rk_1: { b_ayam: '5', b_paha: '3' },
    };
    const manualTerjual = {
      rk_1: { b_ayam: true },
    };

    saveRekapDraft(sisaVals, terjualVals, manualTerjual, storage, now);

    const loaded = loadRekapDraft(storage, now + 3600_000); // 1 jam kemudian
    assert.ok(loaded);
    assert.equal(loaded.ts, now);
    assert.deepEqual(loaded.sisaVals, sisaVals);
    assert.deepEqual(loaded.terjualVals, terjualVals);
    assert.deepEqual(loaded.manualTerjual, manualTerjual);
  });

  it('auto-expires and deletes draft older than 24 hours', () => {
    const storage = createMockStorage();
    const now = 1_700_000_000_000;
    const sisaVals = { rk_1: { b_ayam: '2' } };
    const terjualVals = { rk_1: { b_ayam: '5' } };

    saveRekapDraft(sisaVals, terjualVals, {}, storage, now);

    const expiredTime = now + REKAP_DRAFT_MAX_AGE_MS + 1000;
    const loaded = loadRekapDraft(storage, expiredTime);
    assert.equal(loaded, null);
    assert.equal(storage.getItem(REKAP_DRAFT_KEY), null);
  });

  it('rejects and purges corrupted drafts or future timestamps (> 60s)', () => {
    const storage = createMockStorage();
    const now = 1_700_000_000_000;

    storage.setItem(REKAP_DRAFT_KEY, 'invalid-json');
    assert.equal(loadRekapDraft(storage, now), null);
    assert.equal(storage.getItem(REKAP_DRAFT_KEY), null);

    storage.setItem(
      REKAP_DRAFT_KEY,
      JSON.stringify({ ts: now + 70_000, sisaVals: { rk_1: { b1: '1' } }, terjualVals: {} }),
    );
    assert.equal(loadRekapDraft(storage, now), null);
    assert.equal(storage.getItem(REKAP_DRAFT_KEY), null);
  });

  it('selectively clears draft for a specific rekap when approved, keeping other rekaps intact', () => {
    const storage = createMockStorage();
    const now = 1_700_000_000_000;

    const sisaVals = {
      rk_1: { b1: '2' },
      rk_2: { b2: '5' },
    };
    const terjualVals = {
      rk_1: { b1: '3' },
      rk_2: { b2: '4' },
    };
    const manualTerjual = {
      rk_1: { b1: true },
      rk_2: { b2: false },
    };

    saveRekapDraft(sisaVals, terjualVals, manualTerjual, storage, now);

    // Hapus hanya rk_1
    clearRekapDraft('rk_1', storage, now);

    const loaded = loadRekapDraft(storage, now);
    assert.ok(loaded);
    assert.deepEqual(loaded.sisaVals, { rk_2: { b2: '5' } });
    assert.deepEqual(loaded.terjualVals, { rk_2: { b2: '4' } });
    assert.deepEqual(loaded.manualTerjual, { rk_2: { b2: false } });

    // Hapus rk_2: karena kosong, seluruh draft di storage terhapus
    clearRekapDraft('rk_2', storage, now);
    assert.equal(loadRekapDraft(storage, now), null);
    assert.equal(storage.getItem(REKAP_DRAFT_KEY), null);
  });

  it('clearRekapDraft without argument clears all drafts completely', () => {
    const storage = createMockStorage();
    const now = 1_700_000_000_000;
    saveRekapDraft({ rk_1: { b1: '1' } }, { rk_1: { b1: '2' } }, {}, storage, now);

    assert.ok(loadRekapDraft(storage, now));
    clearRekapDraft(undefined, storage, now);
    assert.equal(loadRekapDraft(storage, now), null);
    assert.equal(storage.getItem(REKAP_DRAFT_KEY), null);
  });
});
