export interface OpnameDraft {
  ts: number;
  vals: Record<string, string>;
}

export const OPNAME_DRAFT_KEY = 'sg_opname_draft';
export const OPNAME_DRAFT_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 jam (1 hari)

export function loadOpnameDraft(
  storage: Storage = typeof window !== 'undefined' ? window.localStorage : (null as unknown as Storage),
  now = Date.now(),
): OpnameDraft | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(OPNAME_DRAFT_KEY);
    if (!raw) return null;

    const data = JSON.parse(raw) as unknown;
    if (!data || typeof data !== 'object') {
      storage.removeItem(OPNAME_DRAFT_KEY);
      return null;
    }

    const candidate = data as { ts?: unknown; vals?: unknown };
    if (typeof candidate.ts !== 'number' || !candidate.vals || typeof candidate.vals !== 'object') {
      storage.removeItem(OPNAME_DRAFT_KEY);
      return null;
    }

    // Auto-hangus jika draf sudah lebih dari 24 jam (1 hari) atau waktu di masa depan yang tidak wajar
    if (now - candidate.ts > OPNAME_DRAFT_MAX_AGE_MS || candidate.ts > now + 60_000) {
      storage.removeItem(OPNAME_DRAFT_KEY);
      return null;
    }

    const valsObj = candidate.vals as Record<string, unknown>;
    const cleanedVals: Record<string, string> = {};
    let hasNonEmpty = false;

    for (const [k, v] of Object.entries(valsObj)) {
      if (typeof v === 'string') {
        cleanedVals[k] = v;
        if (v.trim() !== '') hasNonEmpty = true;
      }
    }

    if (!hasNonEmpty) {
      storage.removeItem(OPNAME_DRAFT_KEY);
      return null;
    }

    return {
      ts: candidate.ts,
      vals: cleanedVals,
    };
  } catch {
    try {
      storage.removeItem(OPNAME_DRAFT_KEY);
    } catch {}
    return null;
  }
}

export function saveOpnameDraft(
  vals: Record<string, string>,
  storage: Storage = typeof window !== 'undefined' ? window.localStorage : (null as unknown as Storage),
  now = Date.now(),
): void {
  if (!storage) return;
  try {
    const hasNonEmpty = Object.values(vals).some((v) => typeof v === 'string' && v.trim() !== '');
    if (!hasNonEmpty) {
      storage.removeItem(OPNAME_DRAFT_KEY);
      return;
    }
    const draft: OpnameDraft = { ts: now, vals };
    storage.setItem(OPNAME_DRAFT_KEY, JSON.stringify(draft));
  } catch {}
}

export function clearOpnameDraft(
  storage: Storage = typeof window !== 'undefined' ? window.localStorage : (null as unknown as Storage),
): void {
  if (!storage) return;
  try {
    storage.removeItem(OPNAME_DRAFT_KEY);
  } catch {}
}
