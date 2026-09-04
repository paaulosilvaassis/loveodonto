# CLOUD.9 — Patient Production Cutover Plan (RUNBOOK ONLY)

**Status:** PLAN ONLY — NOT EXECUTED  
**Prepared by:** CLOUD.8  
**Date:** 2026-09-04  

**Hard freezes until each gate passes:**

- `PRODUCTION_PATIENT_DATA_WRITE = BLOCKED`
- `PRODUCTION_PATIENT_SCHEMA_WRITE = BLOCKED`
- `PRODUCTION_PATIENT_FLAGS_CHANGE = BLOCKED`
- `AGENDA_CLOUD_CUTOVER = BLOCKED`

Code merge (PR #15) is **not** cutover. Defaults remain OFF.

---

## Canonical context

| Item | Value |
|------|-------|
| Production project | `uoepkwhqztmsjnzirpev` |
| Staging project | `tckdjyunwmdpqmewrwvt` |
| Production target tenant | `b721c2c9-d924-41ee-8911-dc00c8208326` |
| Staging tenant (validated) | `7aba7127-409c-4ea4-8dbc-807efc5e189c` |
| Staging source snapshot | `PHASE_PATIENT_IMPORT_RECOVERY_06_post_reimport_3731_20260813_185537.pkl.gz` |
| Source SHA256 | `ce158979ef7e67e95bd17458ddf033e477e073266d7a5942897ceffb442329e9` |
| Staging active patients | 3731 (validated CLOUD.5–7) |
| Production patient schema (CLOUD.8) | **MISSING** |
| Production patient counts (CLOUD.8) | physical=0 / active=0 (tables absent) |
| Source freshness (CLOUD.8) | **UNRESOLVED** → APPLY blocked until reconciled |

Do **not** reuse staging tenant UUID in production.

---

## Gate map

### 9A — Production schema reconcile

**Goal:** Create additive patient schema in production matching validated migrations (`025_app_patients_core`, `027_app_patient_details` + satellites).

**Allowed:** migrations / DDL additive only  
**Forbidden:** DROP of unrelated tables, destructive rewrite, data apply

**Checks:**

- UUID PK on `patients`
- `tenant_id` UUID + validation trigger
- `legacy_id` + unique active `(tenant_id, legacy_id)`
- unique active `(tenant_id, cpf)` where cpf not null
- `deleted_at` soft delete
- RLS enabled + policies for membership
- satellites: phones/documents/records/addresses/insurances

**STOP:** schema diverge / RLS missing  
**Rollback:** leave additive objects; do not drop patient data if any exists; disable further gates

---

### 9B — Production backfill dry-run

**Goal:** Classify source → production without writes.

**Preconditions:**

- Source freshness = `CONFIRMED_CURRENT` (or explicitly accepted newer source)
- Schema READY
- Tenant UUID confirmed

**Outputs:** insert-safe / match / conflict counts (sanitized)  
**STOP:** conflicts > 0 without resolution plan; source UNRESOLVED  
**Rollback:** none (read-only)

---

### 9C — Controlled backfill apply

**Goal:** Idempotent insert of missing patients + satellites for production tenant only.

**Rules:**

- No blind upsert overwrite of divergent rows
- Preserve `legacy_id`
- Soft-delete aware
- Batch + checksum progress

**STOP:** conflict / tenant mismatch / unexpected mutation outside batch  
**Rollback:** do **not** truncate; mark failed batch; reconcile deterministically; preserve confirmed inserts

---

### 9D — Parity / idempotency

**Goal:** Re-run dry-run/apply classification → zero insert-safe remaining for active set; hash parity of legacy_id set.

**STOP:** count/hash drift  
**Rollback:** diagnose only; no delete/reset

---

### 9E — Shadow read

**Goal:** Enable staging-like `PATIENTS_SHADOW` on a **controlled** production preview/canary env if available; else server-side compare job.

**Not:** user-facing READ_PRIMARY  
**STOP:** cross-tenant leak / mismatch rate above threshold  
**Rollback:** disable shadow flag only

---

### 9F — READ_PRIMARY controlled

**Goal:** Enable `PATIENTS_READ` + `PATIENTS_READ_PRIMARY` for production clinic only after 9D/9E.

**STOP:** hydrate incomplete / wrong tenant / UI false authority  
**Rollback contract (READ_PRIMARY failure):**

1. Disable `READ_PRIMARY` (and optionally `READ`)
2. Preserve remote dataset
3. Preserve IDB cache
4. Diagnose
5. **No** IndexedDB reset / **no** remote delete

---

### 9G — Clean-browser production validation

**Goal:** Two clean browsers hydrate active patient count from cloud; search/detail smoke; no PHI in reports.

**STOP:** count mismatch / tenant leak  
**Rollback:** disable READ_PRIMARY

---

### 9H — WRITE_PRIMARY synthetic validation

**Goal:** Synthetic patient only — create/update/soft-delete remote-first; prove multi-browser; prove original dataset untouched.

**STOP:** false success / original mutation / remote failure swallowed  
**Rollback contract (WRITE_PRIMARY failure):**

1. Disable `WRITE_PRIMARY` (and optionally `WRITE`)
2. Preserve confirmed remote commits
3. Reconcile deterministically
4. No blind overwrite
5. No dataset reset

---

### 9I — Final production activation

**Goal:** Documented go-live of read (and later write) flags only after 9G/9H PASS.

**Requires explicit human authorization beyond this runbook.**  
Agenda remains BLOCKED.

---

## Rollback principles (global)

| Failure | Action |
|---------|--------|
| READ_PRIMARY | Disable flag; keep remote + IDB; diagnose; no reset |
| WRITE_PRIMARY | Disable flag; keep confirmed remote commits; reconcile; no blind overwrite |
| Schema/backfill | Additive/idempotent; no destructive patient data rollback |

---

## CLOUD.8 freeze (still active)

Until CLOUD.9 gates authorize each step:

```
PRODUCTION_PATIENT_DATA_WRITE = BLOCKED
PRODUCTION_PATIENT_SCHEMA_WRITE = BLOCKED
PRODUCTION_PATIENT_FLAGS_CHANGE = BLOCKED
AGENDA_CLOUD_CUTOVER = BLOCKED
```

Deploy of merged code ≠ data cutover.
