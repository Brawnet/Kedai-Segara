# Auto QA Campaign Report & Evidence Ledger: Stok Segara

**Project**: Stok Segara (v2.0.0)  
**Baseline Git Commit**: `9d77d5aaee0b294b87254bb86a0814f2882e68ad`  
**Scope**: All features (10 Subsystem Lanes)  
**Campaign Mode**: Continuous Subsystem Invariant & Edge Case Audit  
**Date**: 2026-09-28  
**Environment**: Node.js v24.2.0, Preact, Vite 8.3.1, Google Apps Script  

---

## 🚦 Audit Lanes (10 Subsystems)

| Lane | Subsystem | Canonical Owners | Scope & Invariants Under Audit | Status |
|:---:|:---|:---|:---|:---:|
| **1** | Master Barang & Kategori | `src/admin/Barang.tsx`, `apps-script/Kode.gs` | Kode uniqueness (case-insensitive), alur validation (`LUAR`, `LANGSUNG_HABIS`), ambang_min non-negative, category rename/delete cascade | **Verified & Fixed** |
| **2** | Karyawan & Auth PIN | `src/admin/Karyawan.tsx`, `apps-script/Kode.gs` | PIN 4–6 digit numeric validation, PIN hashing with salt, active state enforcement, collision detection, audit history preservation | **Verified Clean** |
| **3** | Transaksi & Pembatalan | `src/admin/Stok.tsx`, `src/tablet/Tablet.tsx`, `apps-script/Kode.gs` | 60s cancellation grace window (65s server tolerance), stock rollback, alur transfer gudang→dapur, idempotency guards (`withIdempotency_`) | **Verified Clean** |
| **4** | Opname Fisik & Draf | `src/admin/Opname.tsx`, `src/lib/opname-draft.ts`, `apps-script/Kode.gs` | Draft persistence (localStorage), 24h expiration, variance formula ($selisih = fisik - sistem$), non-negative physical count enforcement | **Verified Clean** |
| **5** | Rekap Sisa Dapur & Visibility | `src/tablet/Tablet.tsx`, `src/admin/Rekap.tsx`, `apps-script/Kode.gs` | Closing rekap, $terpakai = saldo\_awal + diambil - sisa$, alur filtering, tablet cutoff, exclusion of archived items | **Verified & Fixed** |
| **6** | Admin Session & Whitelist | `src/admin/Pengaturan.tsx`, `src/lib/api.ts`, `apps-script/Kode.gs` | Session expiration, whitelist matching, admin PIN hashing/salting, rate limiting lockouts, audit log (`Log_Login`) | **Verified Clean** |
| **7** | Formatting & Locale | `src/lib/format.ts` | Indonesian locale formatting (`id-ID`), comma decimal parsing (`parseNum`), number bounds, time formatting in WITA (UTC+8), input sanitization | **Verified Clean** |
| **8** | Dashboard & Alert Stok | `src/admin/Dashboard.tsx`, `src/lib/format.ts` | Stock gauges, low-stock threshold ($b.aktif \land b.ambang\_min > 0 \land total < ambang\_min$), category aggregations, search filters | **Verified & Fixed** |
| **9** | Riwayat & Laporan Audit | `src/admin/Riwayat.tsx`, `src/admin/Laporan.tsx`, `apps-script/Kode.gs` | Filter by date range, transaction status (AKTIF vs BATAL), summary math, backend date format (`YYYY-MM-DD`) & chronological validation | **Verified & Fixed** |
| **10** | Database & Google Sheets Coercion | `apps-script/Kode.gs` | Concurrency lock (`LockService`), formula injection escaping (`safeCell_`), type coercion (date/time/number) from Google Sheets | **Verified Clean** |

---

## 📑 Evidence Ledger: Root-Cause Fixes

### 1/4: False-Positive Low-Stock Alert on Archived or Zero-Threshold Items
- **Subsystem**: Lane 8 (Dashboard & Alert Stok) & `src/lib/format.ts`
- **Baseline SHA**: `9d77d5aaee0b294b87254bb86a0814f2882e68ad`
- **Affected Path**: `src/admin/Dashboard.tsx`
- **Reproduction Before**:
  `export const menipis = (b: Barang) => total(b) < b.ambang_min;`
  When an item was archived (`b.aktif === false`, stock zeroed out) with `b.ambang_min > 0`, `0 < ambang_min` evaluated to `true`, triggering false-positive low-stock warnings across Dashboard and category cards.
- **Root Cause**: Missing check for `b.aktif` and `b.ambang_min > 0` in `menipis(b)`.
- **Canonical Refactor**: Moved `total` and `menipis` to `src/lib/format.ts` as the canonical domain calculations, defining `menipis` as `b.aktif !== false && b.ambang_min > 0 && total(b) < b.ambang_min`. Re-exported in `Dashboard.tsx`.
- **Regression Proof**: `tests/qa-feature-invariants.test.ts` ("Lane 8: menipis in Dashboard only triggers for active items with ambang_min > 0").
- **Status**: Verified & Passed.

---

### 2/4: Case-Sensitive Item Code Collision Invariant Violation
- **Subsystem**: Lane 1 (Master Barang & Kategori)
- **Baseline SHA**: `9d77d5aaee0b294b87254bb86a0814f2882e68ad`
- **Affected Path**: `apps-script/Kode.gs` (line 617) & `src/lib/mock.ts` (line 522)
- **Reproduction Before**:
  `if (kd && rows_('Barang').some(function (x) { return String(x.kode) === kd && ... }))`
  Because `===` was case-sensitive, creating code `as` when `AS` already existed was permitted. However, in search matching (`cocok`), tablet entry, and transaction reports, codes are case-insensitive, causing collision and ambiguous foreign key lookups.
- **Root Cause**: Case-sensitive comparison on item code uniqueness check.
- **Canonical Refactor**: Updated check to `String(x.kode || '').trim().toLowerCase() === kd.toLowerCase()` in both `Kode.gs` and `mock.ts`.
- **Regression Proof**: `tests/qa-feature-invariants.test.ts` ("Lane 1: simpanBarang enforces case-insensitive item code uniqueness").
- **Status**: Verified & Passed.

---

### 3/4: Inactive / Archived Item Leakage into Closing Rekap Drafts
- **Subsystem**: Lane 5 (Rekap Sisa Dapur & Visibility)
- **Baseline SHA**: `9d77d5aaee0b294b87254bb86a0814f2882e68ad`
- **Affected Path**: `apps-script/Kode.gs` (line 532) & `src/lib/mock.ts` (line 221)
- **Reproduction Before**:
  The filter in `hitungRekap_` omitted checking `b.aktif`. Inactive/archived items with any calculated balance (`maks > 0`) could appear in kitchen closing rekap drafts.
- **Root Cause**: Omission of active status verification in rekap draft generation query.
- **Canonical Refactor**: Added `truthy_(b.aktif)` in `Kode.gs` and `b.aktif` in `mock.ts` with direct alur check (`b.alur !== 'LANGSUNG_HABIS'`).
- **Regression Proof**: `tests/qa-feature-invariants.test.ts` ("Lane 5: hitungRekap_ excludes inactive/archived items from closing rekap").
- **Status**: Verified & Passed.

---

### 4/4: Unvalidated Date Format & Inverted Date Range in Periodic Report
- **Subsystem**: Lane 9 (Riwayat & Laporan Audit)
- **Baseline SHA**: `9d77d5aaee0b294b87254bb86a0814f2882e68ad`
- **Affected Path**: `apps-script/Kode.gs` (line 934) & `src/lib/mock.ts` (line 774)
- **Reproduction Before**:
  `laporan(pin, dari, sampai, token)` did not validate `dari` and `sampai` on the backend. Passing empty strings, malformed strings, or `dari > sampai` silently executed invalid queries (e.g. converting `""` to Year 1899) and returned empty or corrupted data without informative validation errors.
- **Root Cause**: Client-only validation in `Laporan.tsx` without defensive assertion in backend RPC handlers.
- **Canonical Refactor**: Added strict `^\d{4}-\d{2}-\d{2}$` regex assertion and asserted `sDari <= sSampai` at the entry of `laporan(...)` in both `Kode.gs` and `mock.ts`.
- **Regression Proof**: `tests/qa-feature-invariants.test.ts` ("Lane 9: laporan enforces YYYY-MM-DD date validation and chronological ordering").
- **Status**: Verified & Passed.

---

### 5/5: LANGSUNG_HABIS Alur Preservation & stok_luar Isolation
- **Subsystem**: Lane 1 (Master Barang) & Lane 3 (Transaksi & Pembatalan)
- **Affected Path**: `apps-script/Kode.gs` & `src/lib/mock.ts`
- **Reproduction Before**:
  In `ambil_`, `b.alur` was unconditionally reassigned to `'LUAR'`, and `b.stok_luar` was incremented regardless of whether the item had `alur: 'LANGSUNG_HABIS'`. This corrupted the master data `alur` setting and erroneously increased kitchen stock (`stok_luar`) for directly consumed items.
- **Canonical Refactor**:
  Asserted `var alur = b.alur === 'LANGSUNG_HABIS' ? 'LANGSUNG_HABIS' : 'LUAR';` without mutating `b.alur`. Only incremented `b.stok_luar` when `alur === 'LUAR'`, and in `batalAmbil` only decremented `b.stok_luar` when `t.alur === 'LUAR'`.
- **Regression Proof**: `tests/apps-script.test.ts` ("ambil and batalAmbil correctly handle LANGSUNG_HABIS items without modifying stok_luar").
- **Status**: Verified & Passed.

---

### 6/6: September 2026 Master Data (DATA_SEGARA) Synchronization
- **Subsystem**: Lane 10 (Database) & `apps-script/Kode.gs`
- **Affected Path**: `apps-script/Kode.gs` (`DATA_SEGARA` & `imporDataSegara`)
- **Refactor**:
  Synchronized `DATA_SEGARA` in `apps-script/Kode.gs` with the latest September 2026 dataset (119 active items across 8 categories), and initialized default `urutan_kategori` in `setup()` if not already set. Rebuilt `apps-script/index.html` singlefile production bundle.
- **Regression Proof**: `tests/converted-database.test.ts`, `tests/apps-script.test.ts`.
- **Status**: Verified & Passed.

---

## 🧪 Test Suite Execution Evidence

```text
> segara-stok@2.0.0 test
> node --test --experimental-strip-types tests/**/*.test.ts

ℹ tests 266
ℹ suites 22
ℹ pass 266
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
```

**Build Status**:
```text
> segara-stok@2.0.0 build
> tsc --noEmit && vite build
✓ 4575 modules transformed.
apps-script/index.html  480.23 kB │ gzip: 131.30 kB
```
