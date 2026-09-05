# CLOUD.9A — Patient Source Freshness + Production Schema Foundation

**FINAL_GATE:** `PASS_CLOUD9A_SCHEMA_READY_SOURCE_RECOVERY_DECISION_REQUIRED`  
**Date:** 2026-09-04  
**Production patient data write:** NO  
**Production backfill:** NO  
**Production runtime cutover:** NO  
**Production env/flag changes:** NO  
**Agenda touched:** NO  

## Baseline

| Field | Value |
|-------|-------|
| CLOUD.8 FINAL_GATE | `PASS_CLOUD8_PATIENT_PRODUCTION_READINESS_WITH_SOURCE_BLOCK` |
| MAIN_SHA (PR15 merge) | `757a97714256861dd3df7eeb400f8875298758ce` |
| MAIN_SHA (docs tip / PR16) | `ccf0f18ffb1529b85dbd756f2d37d528bc7d249f` |
| PRODUCTION_PROJECT_REF | `uoepkwhqztmsjnzirpev` |
| PRODUCTION_PROJECT_NAME | `love-odonto-prod` |
| PRODUCTION_PROJECT_CONFIRMED | YES (`ACTIVE_HEALTHY`, region `us-east-1`) |
| TARGET_IS_STAGING | NO |
| PRODUCTION_TARGET_TENANT_UUID | `b721c2c9-d924-41ee-8911-dc00c8208326` |

---

## Parte A — Source freshness

### A1 — Timeline (sanitized)

| DATE | EVENT | SOURCE | PATIENT_COUNT | EVIDENCE |
|------|-------|--------|---------------|----------|
| 2026-08-13 ~13:29 | Backup pré-limpeza | `RECOVERY_03_backup_7474.pkl.gz` | 7474 | Manifest `record_count=7474`, `restore_test=PASS` |
| 2026-08-13 18:39 | Pre-delete checkpoint | human checkpoint JSON | 7474 | Store counts document 7474 patients; delete candidates = 7474 |
| 2026-08-13 18:55–18:56 | Delete + reimport | UI checkpoint + RECOVERY_06 | 7474 → 0 → 3731 | `deleted=7474`, `created=3731`, `duplicate_skipped=2`, `final_patient_count=3731` |
| 2026-08-13 18:55:37 | Snapshot pós-reimport | `RECOVERY_06_post_reimport_3731_*.pkl.gz` | 3731 | SHA256 verificado; `restore_test=PASS` |
| 2026-08-26 | Audit readonly script | `REPAIR_01_AUDIT_READONLY.js` | n/a | Não é dump de pacientes |
| 2026-09 (CLOUD.5–7) | Staging backfill + remote validation | staging `tckdjyunwmdpqmewrwvt` | 3731 active | Staging still 3731 active (revalidated CLOUD.9A) |
| 2026-09-04 (CLOUD.8) | Freshness marked UNRESOLVED | docs CLOUD.8 | — | Empty live IDB ≠ currency proof |
| 2026-09-04 (CLOUD.9A) | Reconciliação de fontes | inventário local + git/docs | — | Nenhum dump paciente posterior válido encontrado |

### A2 — Inventário de fontes candidatas

| SOURCE_ID | SOURCE_PATH | SOURCE_TIMESTAMP | SOURCE_SHA256 | PATIENT_COUNT | TENANT | FORMAT | VALID | NEWER_THAN_2026_08_13 |
|-----------|-------------|------------------|---------------|---------------|--------|--------|-------|------------------------|
| RECOVERY_06 | `~/Desktop/loveodonto-snapshots/PHASE_PATIENT_IMPORT_RECOVERY_06_post_reimport_3731_20260813_185537.pkl.gz` | 2026-08-13 18:55:37 (local) / content `updated_at` max ~21:51 UTC same day | `ce158979ef7e67e95bd17458ddf033e477e073266d7a5942897ceffb442329e9` | 3731 | `b721c2c9-…` (100%) | pickle.gz IDB dump | YES (`restore_test=PASS`, intact SHA) | NO |
| RECOVERY_03 | `…/PHASE_PATIENT_IMPORT_RECOVERY_03_backup_7474.pkl.gz` | 2026-08-13 13:29 | `bab9624d427daba6b50ab4a1ac9988022ca915d4d6d4b97899c80419af092791` | 7474 | clinic lineage (pré-delete) | pickle.gz | YES (superseded) | NO |
| REPAIR_01_AUDIT | `…/PHASE_PATIENT_IMPORT_REPAIR_01_AUDIT_READONLY.js` | 2026-08-26 | n/a | n/a | n/a | JS audit | N/A (not patient dump) | YES (mtime only; not data source) |
| Staging cloud patients | project `tckdjyunwmdpqmewrwvt` | post CLOUD.5 | n/a | 3731 active | staging tenant | Postgres | YES (lineage from RECOVERY_06) | derived, not a newer clinic export |
| Live production IDB | browser | historically empty / rev 172 | n/a | 0 | — | IndexedDB | N/A as currency proof | — |

**NEWER_SOURCE_FOUND (patient dump):** NO  

### A3 — Comparação determinística (sem PII)

SOURCE_A = RECOVERY_06 (3731)  
SOURCE_B = RECOVERY_03 (7474)

| Metric | Value |
|--------|-------|
| SOURCE_A_COUNT | 3731 |
| SOURCE_B_COUNT | 7474 |
| COMMON (legacy `id`) | 0 |
| ONLY_A | 3731 |
| ONLY_B | 7474 |
| CHANGED | n/a (disjoint ID sets after intentional delete+reimport) |

Interpretação: RECOVERY_03 é o estado **pré-delete** (contaminado/duplicado). RECOVERY_06 é o estado **pós-reimport** documentado como autoridade de recuperação.

### A4 — Mudanças posteriores ao snapshot

| Claim | Evidence |
|-------|----------|
| Newer `.pkl/.pkl.gz` patient dump after 2026-08-13 18:55:37 | **Not found** in `loveodonto-snapshots` or project trees |
| Newer clinic CSV/JSON/SQL patient export | **Not found** as recoverable patient corpus |
| Post-snapshot audit artifact | `REPAIR_01_AUDIT_READONLY.js` (2026-08-26) — audit only |
| Staging mutations after snapshot | Staging holds 3731 from same lineage (CLOUD.5–7); synthetic CLOUD.7 rows are staging-only and not a clinic export |
| Absence of newer file ⇒ no clinic create/update/delete | **Not inferred** — lack of newer file is not proof of clinic stasis |

`POST_SNAPSHOT_CHANGE_EVIDENCE` = **INCONCLUSIVE** (no newer clinic dump; no positive proof of later clinic mutations either).

### A5 — Classificação

| Field | Value |
|-------|-------|
| PRODUCTION_BACKFILL_SOURCE_STATUS | **BEST_RECOVERABLE_SOURCE** |
| SOURCE_GATE | `SOURCE_BEST_RECOVERABLE` |
| SOURCE_CLASSIFICATION_REASON | RECOVERY_06 is the newest intact, SHA-verified, restore-tested patient dump for tenant `b721c2c9-…` (3731). No newer valid patient source was found. Absolute currency vs live clinic cannot be confirmed without a post-2026-08-13 clinic export or live SSOT with patients. Empty IDB is explicitly **not** used as currency proof. |

**Importante:** `BEST_RECOVERABLE_SOURCE` **não autoriza** backfill. Exige decisão explícita de recuperação antes de CLOUD.9B.

---

## Parte B — Production schema foundation

### B1 — Environment

| Check | Result |
|-------|--------|
| TARGET_PROJECT_REF | `uoepkwhqztmsjnzirpev` |
| PROJECT NAME | `love-odonto-prod` |
| TARGET_IS_STAGING | NO |
| STOP_CLOUD9A_WRONG_ENVIRONMENT | not raised |

### B2 — Pre-state (immediately before apply)

| Check | Result |
|-------|--------|
| `public.patients` | MISSING |
| `patient_%` tables | 0 |
| Helpers `touch_updated_at`, `app_user_can_access_tenant`, `app_user_is_tenant_admin` | PRESENT |
| Target tenant exists | YES (1) |
| Unexpected state change since CLOUD.8 | NO |

### B3 — Migration review

Applied controlled chunks equivalent to staging-validated:

- `025_app_patients_core` (patients, phones, documents, records)
- `027_app_patient_details` (birth, education, addresses, relationships, insurances, access, activity + RLS finalize)
- Minimal `app_assert_critical_tenant_tables_rls()` helper (required by 027 finalize; **026 JWT/membership rewrite intentionally skipped** to avoid replacing production helpers)

Hardening retained from validated 027 finalize:

- FORCE RLS on patient tables
- `authenticated` GRANT without DELETE (fail-closed physical delete)
- Policies: SELECT (tenant; admin can see soft-deleted) + INSERT/UPDATE admin only

**Prohibited ops not executed:** DROP of active tables, TRUNCATE, DELETE, destructive rename, data reset, patient INSERT/backfill.

### B4 — Applied migrations (production)

| version | name |
|---------|------|
| 20260905001312 | `025_app_patients_core_patients` |
| 20260905001531 | `025_app_patients_core_phones` |
| 20260905001653 | `025_app_patients_core_documents_records` |
| 20260905001811 | `027_app_patient_details_wave2a` |
| 20260905001912 | `027_app_patient_details_wave2b` |
| 20260905002025 | `027_app_patient_details_wave2c` |
| 20260905002115 | `027_app_patient_details_activity_and_rls_finalize` |

### B5–B8 — Contracts

| Contract | Result |
|----------|--------|
| PATIENT_PK_CONTRACT | PASS (`id uuid` PK + `gen_random_uuid()`) |
| PATIENT_LEGACY_ID_CONTRACT | PASS (`legacy_id text NOT NULL` + immutability trigger) |
| PATIENT_TENANT_CONTRACT | PASS (`tenant_id uuid NOT NULL` FK → `tenants`, immutable on update) |
| PATIENT_UNIQUE_LEGACY_CONTRACT | PASS (`patients_tenant_legacy_id_uq` WHERE `deleted_at IS NULL`) |
| PATIENT_UNIQUE_CPF_CONTRACT | PASS (`patients_tenant_cpf_uq` WHERE active + cpf not null) |
| PATIENT_SOFT_DELETE_CONTRACT | PASS (`deleted_at` + SELECT policy allows admin soft-deleted visibility) |
| Required columns (full_name, nickname, social_name, sex, birth_date, cpf, photo_url, status, blocked, …) | PASS |
| SATELLITE_SCHEMA | PASS (`patient_phones/documents/records/addresses/insurances` + birth/education/relationships/access/activity; FK `patient_id → patients.id`) |
| RLS | PASS (ENABLED + FORCE; 3 policies/table; anon SELECT/INSERT = false) |
| INDEXES | PASS (tenant, legacy_id, cpf, `lower(full_name)`, status, updated_at) |
| TRIGGERS | PASS (`trg_patients_validate`, `trg_patients_touch_updated_at` + satellite validators) |

### B9 — Zero data proof

| Table | Rows after schema |
|-------|-------------------|
| PATIENTS_AFTER_SCHEMA | **0** |
| PHONES_AFTER_SCHEMA | **0** |
| DOCUMENTS_AFTER_SCHEMA | **0** |
| RECORDS_AFTER_SCHEMA | **0** |
| ADDRESSES_AFTER_SCHEMA | **0** |
| INSURANCES_AFTER_SCHEMA | **0** |
| birth/education/relationships/access/activity | **0** |

`STOP_CLOUD9A_UNEXPECTED_DATA_MUTATION` = not raised.

### B10 — Flags

Code defaults unchanged (all false):

| Flag | Value |
|------|-------|
| PATIENT_REMOTE_READ | false |
| PATIENT_REMOTE_READ_SHADOW | false |
| PATIENT_REMOTE_READ_PRIMARY | false |
| PATIENT_REMOTE_WRITE | false |
| PATIENT_REMOTE_WRITE_PRIMARY | false |

No production env vars altered.

---

## Tests / build

| Suite | Result |
|-------|--------|
| phase94aWave1PatientsFoundation | PASS |
| phase94aWave2PatientsDetails | PASS (9/9; one transient ENOENT on CLI mirror resolved by re-run) |
| phase94aSecurityHardening | PASS |
| cloud3PatientRepositoryWiring | PASS |
| cloud4PatientBackfillDryRun | included in first batch context |
| patients | PASS |
| phase1020ProductionReadiness | PASS |
| phase1012ProductionHardening | PASS |
| cloud7PatientRemoteWritePrimary | PASS (54 tests in Admin/API batch; 1 pre-existing unhandled IDB_STALE_SNAPSHOT rejection observed, not a failing assertion) |
| BUILD | PASS |

---

## Gates

| Gate | Value |
|------|-------|
| SOURCE_GATE | `SOURCE_BEST_RECOVERABLE` |
| SCHEMA_GATE | `PASS_CLOUD9A_PRODUCTION_PATIENT_SCHEMA_READY` |
| FINAL_GATE | **`PASS_CLOUD9A_SCHEMA_READY_SOURCE_RECOVERY_DECISION_REQUIRED`** |

Nenhum gate desta fase autoriza backfill / CLOUD.9B apply / runtime cutover.

## Freeze

```
PRODUCTION_SCHEMA_CHANGE = PATIENT_FOUNDATION_025_027_ONLY
PRODUCTION_DATA_CHANGE = NONE (all patient tables = 0)
PRODUCTION_ENV_CHANGE = NONE
PRODUCTION_BACKFILL_EXECUTED = NO
PRODUCTION_RUNTIME_CUTOVER = NO
AGENDA_TOUCHED = NO
```
