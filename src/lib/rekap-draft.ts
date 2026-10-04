export interface RekapDraftPayload {
  ts: number;
  sisaVals: Record<string, Record<string, string>>;
  terjualVals: Record<string, Record<string, string>>;
  manualTerjual?: Record<string, Record<string, boolean>>;
}

export const REKAP_DRAFT_KEY = 'sg_rekap_draft';
export const REKAP_DRAFT_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 jam

function hasAnyEntries(map: Record<string, Record<string, string>>): boolean {
  for (const sub of Object.values(map)) {
    if (sub && typeof sub === 'object') {
      for (const val of Object.values(sub)) {
        if (typeof val === 'string' && val.trim() !== '') {
          return true;
        }
      }
    }
  }
  return false;
}

export function loadRekapDraft(
  storage: Storage = typeof window !== 'undefined' ? window.localStorage : (null as unknown as Storage),
  now = Date.now(),
): RekapDraftPayload | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(REKAP_DRAFT_KEY);
    if (!raw) return null;

    const data = JSON.parse(raw) as unknown;
    if (!data || typeof data !== 'object') {
      storage.removeItem(REKAP_DRAFT_KEY);
      return null;
    }

    const candidate = data as {
      ts?: unknown;
      sisaVals?: unknown;
      terjualVals?: unknown;
      manualTerjual?: unknown;
    };

    if (typeof candidate.ts !== 'number') {
      storage.removeItem(REKAP_DRAFT_KEY);
      return null;
    }

    // Auto-hangus jika draf sudah lebih dari 24 jam atau waktu di masa depan tidak wajar
    if (now - candidate.ts > REKAP_DRAFT_MAX_AGE_MS || candidate.ts > now + 60_000) {
      storage.removeItem(REKAP_DRAFT_KEY);
      return null;
    }

    const sisaVals = (candidate.sisaVals && typeof candidate.sisaVals === 'object')
      ? (candidate.sisaVals as Record<string, Record<string, string>>)
      : {};
    const terjualVals = (candidate.terjualVals && typeof candidate.terjualVals === 'object')
      ? (candidate.terjualVals as Record<string, Record<string, string>>)
      : {};
    const manualTerjual = (candidate.manualTerjual && typeof candidate.manualTerjual === 'object')
      ? (candidate.manualTerjual as Record<string, Record<string, boolean>>)
      : {};

    const hasData = hasAnyEntries(sisaVals) || hasAnyEntries(terjualVals);
    if (!hasData) {
      storage.removeItem(REKAP_DRAFT_KEY);
      return null;
    }

    return {
      ts: candidate.ts,
      sisaVals,
      terjualVals,
      manualTerjual,
    };
  } catch {
    try {
      storage.removeItem(REKAP_DRAFT_KEY);
    } catch {}
    return null;
  }
}

export function saveRekapDraft(
  sisaVals: Record<string, Record<string, string>>,
  terjualVals: Record<string, Record<string, string>>,
  manualTerjual: Record<string, Record<string, boolean>> = {},
  storage: Storage = typeof window !== 'undefined' ? window.localStorage : (null as unknown as Storage),
  now = Date.now(),
): void {
  if (!storage) return;
  try {
    const hasData = hasAnyEntries(sisaVals) || hasAnyEntries(terjualVals);
    if (!hasData) {
      storage.removeItem(REKAP_DRAFT_KEY);
      return;
    }

    const payload: RekapDraftPayload = {
      ts: now,
      sisaVals,
      terjualVals,
      manualTerjual,
    };
    storage.setItem(REKAP_DRAFT_KEY, JSON.stringify(payload));
  } catch {}
}

export function clearRekapDraft(
  rekapId?: string,
  storage: Storage = typeof window !== 'undefined' ? window.localStorage : (null as unknown as Storage),
  now = Date.now(),
): void {
  if (!storage) return;
  try {
    if (!rekapId) {
      storage.removeItem(REKAP_DRAFT_KEY);
      return;
    }

    const current = loadRekapDraft(storage, now);
    if (!current) {
      storage.removeItem(REKAP_DRAFT_KEY);
      return;
    }

    const nextSisa = { ...current.sisaVals };
    const nextTerjual = { ...current.terjualVals };
    const nextManual = { ...(current.manualTerjual || {}) };

    delete nextSisa[rekapId];
    delete nextTerjual[rekapId];
    delete nextManual[rekapId];

    if (!hasAnyEntries(nextSisa) && !hasAnyEntries(nextTerjual)) {
      storage.removeItem(REKAP_DRAFT_KEY);
    } else {
      saveRekapDraft(nextSisa, nextTerjual, nextManual, storage, now);
    }
  } catch {}
}
