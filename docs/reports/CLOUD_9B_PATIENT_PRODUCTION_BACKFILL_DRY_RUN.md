# CLOUD.9B — Production Patient Backfill Dry-Run

**FINAL_GATE:** `PASS_CLOUD9B_PATIENT_PRODUCTION_BACKFILL_DRY_RUN_READY`  
**Date:** 2026-09-04  
**Production writes:** ZERO  
**Production env changes:** NONE  
**Agenda touched:** NO  
**Source classification:** BEST_RECOVERABLE_SOURCE (human-authorized for dry-run / recovery planning only)

## PR #17

| Field | Value |
|-------|-------|
| PR17_STATE_BEFORE | OPEN |
| PR17_HEAD | `b2e6ffdcbf883b6c90a5c6eecf583d3b297c09ec` |
| PR17_SCOPE | docs-only (`CLOUD_9A_*.md` + `.json`) |
| PR17_CHECKS | SUCCESS (Bugbot + Vercel) |
| PR17_MERGEABLE | YES / CLEAN |
| PR17_MERGED | YES (squash) |
| PR17_MERGE_SHA | `6b936b67c116253514750ce0595865ba4d8d6a63` |

## Environment

| Field | Value |
|-------|-------|
| PRODUCTION_PROJECT_REF | `uoepkwhqztmsjnzirpev` |
| PRODUCTION_PROJECT_CONFIRMED | YES (`love-odonto-prod`, `ACTIVE_HEALTHY`) |
| TARGET_IS_STAGING | NO |
| TARGET_TENANT | `b721c2c9-d924-41ee-8911-dc00c8208326` (identity; no remap) |

## Source pin

| Field | Value |
|-------|-------|
| SOURCE_FILE | `PHASE_PATIENT_IMPORT_RECOVERY_06_post_reimport_3731_20260813_185537.pkl.gz` |
| SOURCE_SHA256 | `ce158979ef7e67e95bd17458ddf033e477e073266d7a5942897ceffb442329e9` (exact match) |
| SOURCE_PATIENT_COUNT | 3731 |
| SOURCE_DOCUMENT_COUNT | 3731 |
| SOURCE_RECORD_COUNT | 3731 |
| SOURCE_ADDRESS_COUNT | 2921 |
| SOURCE_INSURANCE_COUNT | 2176 |
| SOURCE_PHONE_COUNT | 0 |

## Production pre/post dry-run (read-only)

| Metric | Before | After dry-run |
|--------|-------:|--------------:|
| patients | 0 | 0 |
| documents | 0 | 0 |
| records | 0 | 0 |
| addresses | 0 | 0 |
| insurances | 0 | 0 |
| phones | 0 | 0 |

`PRODUCTION_WRITE = ZERO` (classifier + pickle load only; no `apply_migration` / no INSERT).

## Parent classification (against live production remote = empty)

| Class | Count |
|-------|------:|
| PATIENT_INSERT_SAFE | 3731 |
| PATIENT_MATCH_EXISTING | 0 |
| PATIENT_CONFLICT | 0 |
| PATIENT_INVALID | 0 |
| PATIENT_MISSING_TENANT | 0 |

## Identity / uniqueness

| Check | Value |
|-------|------:|
| DUPLICATE_LEGACY_IDS | 0 |
| DUPLICATE_CPFS_REQUIRING_REVIEW | 0 |
| SCHEMA_INVALID_ROWS | 0 |
| TENANT_MAPPING_FAILURES | 0 |

## Satellites

| Satellite | INSERT_AFTER_PARENT | CONFLICT | ORPHAN |
|-----------|--------------------:|---------:|-------:|
| documents | 3731 | 0 | 0 |
| records | 3731 | 0 | 0 |
| addresses | 2921 | 0 | 0 |
| insurances | 2176 | 0 | 0 |
| phones | 0 | 0 | 0 |

## record_number collision (deterministic CLOUD.5 strategy)

| Field | Value |
|-------|-------|
| RECORD_NUMBER_COLLISION_COUNT | 1 group / 1 adjustment |
| RECORD_NUMBER_COLLISION_STRATEGY | sort by record `legacy_id` ascending; keep first; losers → `{number}__{legacy_id}` |
| Known collision | `1915` → keep `record-26fbd7eb-…`; adjust `record-4bb143f4-…` → `1915__record-4bb143f4-8175-45e7-8cfe-efc47aa96b96` |
| Row discard | NO |

## Hash / parity preview

| Field | Value |
|-------|------:|
| HASH_STRATEGY | `sha256(canonical_json:tenant_id\|legacy_id\|full_name\|cpf\|birth_date\|status\|blocked\|lead_source)` |
| EXPECTED_FINAL_PATIENT_COUNT | 3731 |
| EXPECTED_FINAL_DOCUMENT_COUNT | 3731 |
| EXPECTED_FINAL_RECORD_COUNT | 3731 |
| EXPECTED_FINAL_ADDRESS_COUNT | 2921 |
| EXPECTED_FINAL_INSURANCE_COUNT | 2176 |
| EXPECTED_FINAL_PHONE_COUNT | 0 |
| EXPECTED_SOURCE_MATCH | 3731 |
| EXPECTED_MISMATCH | 0 |
| unique semantic hashes (source) | 3731 |

Normalization: `birth_date` accepts `DD/MM/YYYY` and `DD/MM/YYYY 00:00:00` (CLOUD.5 contract).

## CLOUD.9C apply plan (NOT executed)

| Item | Plan |
|------|------|
| Batch size | **50** parents per logical batch |
| Order | parents first → build `legacy_id → uuid` map → satellites |
| Compare-before-write | re-classify each batch vs production; unexpected occupancy ⇒ STOP |
| Transaction | per-batch SQL statement groups; no blind upsert |
| Checkpoint | JSON `{batch_index, last_legacy_id, inserted_count, uuid_map_delta, sha256_source}` |
| Resume | skip `MATCH_EXISTING`; continue from next INSERT_SAFE |
| Stop-on-conflict | halt further writes; do not start satellites if parent parity fails |
| record_number | apply planned overrides before insert |
| Read-back | count + hash parity after parents; then satellites |
| Second-run idempotency | re-dry-run must yield INSERT_SAFE=0 / MATCH=3731 |
| Forbidden | TRUNCATE, DELETE dataset, reset, blind upsert, overwrite conflicts |

## Rollback / abort contract

1. **Before first write:** any unexpected production patient row ⇒ `STOP`
2. **During parents:** any conflict ⇒ stop further writes
3. **After parent parity failure:** do not start satellites
4. **After satellite parity failure:** stop cutover; preserve confirmed parent rows
5. Never TRUNCATE / DELETE dataset / reset production / blind upsert

## Flags (unchanged)

| Flag | Value |
|------|-------|
| PATIENT_REMOTE_READ | false |
| PATIENT_REMOTE_READ_SHADOW | false |
| PATIENT_REMOTE_READ_PRIMARY | false |
| PATIENT_REMOTE_WRITE | false |
| PATIENT_REMOTE_WRITE_PRIMARY | false |

## Tooling

- `scripts/cloud9b-patient-production-backfill-dry-run.mjs`
- `planRecordNumberCollisions` in `src/domain/patients/patientBackfillDryRun.js`
- `src/__tests__/cloud9bPatientProductionBackfillDryRun.test.js`

## Tests / build

| Suite | Result |
|-------|--------|
| cloud4PatientBackfillDryRun | PASS |
| cloud9bPatientProductionBackfillDryRun | PASS |
| phase94aWave1PatientsFoundation | PASS |
| cloud3PatientRepositoryWiring | PASS |
| phase1020ProductionReadiness | PASS |
| BUILD | PASS |

## Gates

```
CLOUD9C_APPLY_PLAN_READY = YES
PRODUCTION_ROWS_AFTER_DRY_RUN = 0
PRODUCTION_WRITE = ZERO
PRODUCTION_ENV_CHANGE = NONE
AGENDA_TOUCHED = NO
FINAL_GATE = PASS_CLOUD9B_PATIENT_PRODUCTION_BACKFILL_DRY_RUN_READY
```

**Does not authorize CLOUD.9C apply automatically** — requires explicit apply authorization.
