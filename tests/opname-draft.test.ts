import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  loadOpnameDraft,
  saveOpnameDraft,
  clearOpnameDraft,
  OPNAME_DRAFT_MAX_AGE_MS,
  OPNAME_DRAFT_KEY,
} from '../src/lib/opname-draft.ts';

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

describe('Opname Draft Persistence & Expiry Logic', () => {
  it('returns null when no draft exists', () => {
    const storage = createMockStorage();
    assert.equal(loadOpnameDraft(storage), null);
  });

  it('saves and loads valid draft within 24 hours', () => {
    const storage = createMockStorage();
    const now = 1_700_000_000_000;
    const vals = { b1: '15', b2: '0' };

    saveOpnameDraft(vals, storage, now);

    const loaded = loadOpnameDraft(storage, now + 3600_000); // 1 hour later
    assert.ok(loaded);
    assert.equal(loaded.ts, now);
    assert.deepEqual(loaded.vals, vals);
  });

  it('auto-expires and deletes draft older than 24 hours (1 day)', () => {
    const storage = createMockStorage();
    const now = 1_700_000_000_000;
    const vals = { b1: '25' };

    saveOpnameDraft(vals, storage, now);

    // Exactly at threshold + 1 second
    const expiredTime = now + OPNAME_DRAFT_MAX_AGE_MS + 1000;
    const loaded = loadOpnameDraft(storage, expiredTime);

    assert.equal(loaded, null);
    // Verified that expired draft was cleaned up from storage
    assert.equal(storage.getItem(OPNAME_DRAFT_KEY), null);
  });

  it('removes draft when all values are empty strings', () => {
    const storage = createMockStorage();
    const now = 1_700_000_000_000;

    // First save valid
    saveOpnameDraft({ b1: '10' }, storage, now);
    assert.ok(storage.getItem(OPNAME_DRAFT_KEY));

    // Then update with empty values
    saveOpnameDraft({ b1: '', b2: '   ' }, storage, now + 1000);
    assert.equal(storage.getItem(OPNAME_DRAFT_KEY), null);
    assert.equal(loadOpnameDraft(storage, now + 1000), null);
  });

  it('clearOpnameDraft removes draft immediately (Buang Draf)', () => {
    const storage = createMockStorage();
    const now = 1_700_000_000_000;

    saveOpnameDraft({ b1: '5' }, storage, now);
    assert.ok(loadOpnameDraft(storage, now));

    clearOpnameDraft(storage);
    assert.equal(loadOpnameDraft(storage, now), null);
    assert.equal(storage.getItem(OPNAME_DRAFT_KEY), null);
  });

  it('safely handles corrupted JSON in storage without throwing', () => {
    const storage = createMockStorage();
    storage.setItem(OPNAME_DRAFT_KEY, '{invalid-json');

    assert.equal(loadOpnameDraft(storage), null);
    assert.equal(storage.getItem(OPNAME_DRAFT_KEY), null);
  });
});
