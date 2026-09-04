# CLOUD.4 — Patient Backfill Dry-Run (SANITIZED)

MODE = READ_ONLY / NO APPLY  
STAGING_MUTATION = ZERO  
PRODUCTION_WRITE = ZERO

## Source

- LIVE_IDB_META = {"patientCount":0,"revision":172,"note":"Live Chrome tab loveodonto.com.br IDB meta-only read at CLOUD.4: empty patients"}
- SOURCE_DATASET = PHASE_PATIENT_IMPORT_RECOVERY_06_post_reimport_3731_20260813_185537.pkl.gz
- SOURCE_NOTE = Live IDB was empty (rev 172). Used validated clinic IDB recovery snapshot RECOVERY_06 (3731 patients, tenant b721c2c9).
- SOURCE_TENANT_VALUES = {"b721c2c9-d924-41ee-8911-dc00c8208326":3731}
- TARGET_STAGING_TENANT_UUID = 7aba7127-409c-4ea4-8dbc-807efc5e189c

## Counts

| Metric | Value |
|--------|------:|
| LOCAL_PATIENT_COUNT | 3731 |
| REMOTE_PATIENT_COUNT_BEFORE | 0 |
| REMOTE_PATIENT_COUNT_AFTER | 0 |
| PATIENT_INSERT_SAFE | 3731 |
| PATIENT_MATCH_EXISTING | 0 |
| PATIENT_CONFLICT | 0 |
| PATIENT_INVALID | 0 |
| PATIENT_MISSING_TENANT | 0 |

## Conflict reasons

| Reason | Count |
|--------|------:|
| CONFLICT_REMOTE_LEGACY_DIVERGED | 0 |
| CONFLICT_REMOTE_CPF_OTHER_LEGACY | 0 |
| CONFLICT_LOCAL_DUPLICATE_LEGACY | 0 |
| CONFLICT_LOCAL_DUPLICATE_CPF | 0 |
| CONFLICT_IDENTITY_AMBIGUOUS | 0 |

## Satellites

- **phone**: match=0, insert_after_parent=0, pending_parent=0, conflict=0, orphan=0, invalid=0
- **document**: match=0, insert_after_parent=3731, pending_parent=3731, conflict=0, orphan=0, invalid=0
- **record**: match=0, insert_after_parent=3731, pending_parent=3731, conflict=0, orphan=0, invalid=0
- **address**: match=0, insert_after_parent=2921, pending_parent=2921, conflict=0, orphan=0, invalid=0
- **insurance**: match=0, insert_after_parent=2176, pending_parent=2176, conflict=0, orphan=0, invalid=0
- **birth**: match=0, insert_after_parent=3731, pending_parent=3731, conflict=0, orphan=0, invalid=0
- **education**: match=0, insert_after_parent=3731, pending_parent=3731, conflict=0, orphan=0, invalid=0
- **relationship**: match=0, insert_after_parent=3731, pending_parent=3731, conflict=0, orphan=0, invalid=0

## Orphans

- ORPHAN_PHONE_COUNT = 0
- ORPHAN_DOCUMENT_COUNT = 0
- ORPHAN_RECORD_COUNT = 0
- ORPHAN_ADDRESS_COUNT = 0
- ORPHAN_INSURANCE_COUNT = 0

## References (snapshot availability)

- PATIENT_REFERENCES_APPOINTMENTS = UNAVAILABLE_IN_SOURCE_SNAPSHOT
- PATIENT_REFERENCES_BUDGETS = UNAVAILABLE_IN_SOURCE_SNAPSHOT
- PATIENT_REFERENCES_CONTRACTS = UNAVAILABLE_IN_SOURCE_SNAPSHOT
- PATIENT_REFERENCES_CRM = UNAVAILABLE_IN_SOURCE_SNAPSHOT
- PATIENT_REFERENCES_FINANCIAL = UNAVAILABLE_IN_SOURCE_SNAPSHOT
- PATIENT_REFERENCES_CLINICAL = UNAVAILABLE_IN_SOURCE_SNAPSHOT

## Integrity

- HASH_STRATEGY = sha256(canonical_json:tenant_id|legacy_id|full_name|cpf|birth_date|status|blocked|lead_source)
- TENANT_MAPPING_FAILURES = 0
- REMOTE_COUNT_UNCHANGED = true
- REMOTE_UPDATED_AT_UNCHANGED = true
- STAGING_MUTATION_DETECTED = NO
- PATIENT_BACKFILL_ROWS_WRITTEN = 0

## Gate

FINAL_GATE = PASS_CLOUD4_PATIENT_BACKFILL_DRY_RUN_READY
