# PHASE 11.I — FINANCIAL V2 LOCAL FOUNDATION, MIGRATION MAPPER & SHADOW VALIDATION

**Modo:** LOCAL FOUNDATION (IndexedDB SSOT)  
**Data:** 2026-08-31  
**Baseline:** `f760d68` (Phase 11.H)  
**PRODUCTION_CHANGED = NO** · **MIGRATION_APPLIED = NO** · **BACKFILL_APPLIED = NO**  
**DUAL_WRITE_ENABLED = NO** · **SHADOW_WRITE_ENABLED = NO** · **SUPABASE_CUTOVER = NO**

Decisões 11.H preservadas:

```
TARGET_MONEY_STORAGE_MODEL = INTEGER_CENTS
TARGET_TENANT_MODEL = TENANT_ID_NOT_NULL
CUTOVER_STRATEGY = SHADOW_COMPARE_THEN_TENANT_CUTOVER
ROLLBACK_STRATEGY = FLAG_OFF_PRESERVE_IDB_AND_SERVER_ROWS
LEGACY_DUPLICATE_POLICY = QUARANTINE_NOT_DELETE
RECONCILIATION_BEFORE_MIGRATION = REQUIRED
```

Draft `docs/design/drafts/041_financial_core_v2.sql` **não** foi movido para `supabase/migrations/`.

---

## 1. Executive Summary

A 11.I transforma o design 11.H em uma fundação **local, pura e testável**: contrato V2, classificador legado, mapper IndexedDB → `financial_v2`, modelo de quarantine (in-memory) e shadow comparator. Dry-run produz estatísticas determinísticas sem escrever no Supabase. Flags V3 permanecem OFF. Histórico e produção não foram escaneados.

---

## 2. Components

| Piece | Module |
| --- | --- |
| V2 schema contract | `financialV2Foundation.js` + contrato 11.H |
| Legacy classifier | `financialV2LegacyClassifier.js` |
| Mapper | `financialV2Mapper.js` |
| Quarantine | rows do dry-run (`quarantined[]`) |
| Shadow comparator | `financialV2ShadowComparator.js` |
| Dry-run | `financialV2DryRun.js` |

Session tenant **nunca** é prova de ownership histórico.

---

## 3. Classifier

Classes: `OWNED_DIRECT`, `OWNED_DERIVED`, `UNOWNED`, `CONFLICTED`, `DUPLICATE`, `RECONCILIATION_MISMATCH`, `UNSUPPORTED`.

- DIRECT: `tenant_id` presente e coerente com patient/budget/financing/receivable.
- DERIVED: sem `tenant_id`, prova única via relação confiável (patient, budget, receivable, financing).
- CONFLICTED: tenant A vs relação B — quarantine, sem escolher lado.
- DUPLICATE: identidade PATH A/B, `operation_id`, financing ativo por budget — quarantine, sem delete.
- MISMATCH: `inspectFinancialReconciliation` (11.G).
- UNOWNED / UNSUPPORTED: quarantine.

Eligibility:

- OWNED_DIRECT + reconciled + non-duplicate → `ELIGIBLE`
- OWNED_DERIVED + proof + reconciled + non-duplicate → `ELIGIBLE_WITH_DERIVED_OWNERSHIP`
- resto → `QUARANTINE`

---

## 4. Mapper

Elegível apenas. `source_id` = id legado. Money = `toCents()` 11.G. Referências = `source_id` da entidade alvo (`V2_REFERENCE_STRATEGY = source_id_of_legacy_row`). Charge `creates_receivable = false`. Reversal preserva `reverses_payment_id`; o payment original permanece fato.

---

## 5. Shadow

Resultados: `MATCH`, `MISMATCH`, `NOT_COMPARABLE`, `QUARANTINED`.  
Reasons: `MONEY_MISMATCH`, `TENANT_MISMATCH`, `STATUS_MISMATCH`, `IDENTITY_MISMATCH`, `REFERENCE_MISMATCH`, `PAYMENT_FACT_MISMATCH`, `REVERSAL_MISMATCH`.  
`10.1` ≡ `1010` cents. Status `open` (021) **não** equivale a `pending`.

---

## 6. Migration order (não executada)

```
FINANCIAL_V2_MIGRATION_ORDER =
financings → receivables → payments → reversals → charges →
boleto_charges → financing_installments → boleto_reminder_events
```

Derivado das FKs do draft 041: financing/receivable primeiro; payments/reversals depois; charges depois do CR; installments por último (projeção).

---

## 7. RLS / DELETE / RBAC

Contrato V2 (não aplicado): SELECT/INSERT/UPDATE tenant-scoped; DELETE sem policy + REVOKE.  
DELETE DENY para payment, reversal, receivable materializado, financing aprovado.  
RBAC server: `financeiro_contas_receber:*`, `financeiro_financiamentos:*`, `financeiro_boletos:*`. RLS não substitui RBAC.

---

## 8. Tests

Suite T1–T43: **43 passed**.  
Regressão 11.B–11.H + finance: ver métricas.

---

## 9. Gate

```
PHASE_11I_GATE = FINANCIAL_V2_LOCAL_FOUNDATION_VALIDATED
PHASE_11I_STATUS = PASS
```

`GO_FOR_REMOTE_SCHEMA_PHASE = YES` (local/staging schema apply ainda é fase futura; **não** produção).  
`GO_FOR_SHADOW_WRITE_PHASE = NO` (machinery existe; persistência remota não).  
`GO_FOR_PRODUCTION_CUTOVER = NO`

---

## 42. Métricas

```
PHASE_11I_STATUS = PASS
BASELINE_HEAD = f760d68
FINAL_HEAD = (após commit)

CURRENT_FINANCIAL_SSOT = INDEXEDDB_LEGACY_SERVICES
TARGET_FINANCIAL_SSOT = SUPABASE_FINANCIAL_V2_NOT_YET_AUTHORITATIVE

V2_SCHEMA_CONTRACT = PASS
LEGACY_CLASSIFIER = classifyLegacyFinancialRecord
LEGACY_CLASSIFICATIONS = OWNED_DIRECT, OWNED_DERIVED, UNOWNED, CONFLICTED, DUPLICATE, RECONCILIATION_MISMATCH, UNSUPPORTED
MIGRATION_ELIGIBILITY_ENGINE = evaluateFinancialMigrationEligibility

UNOWNED_POLICY = QUARANTINE
CONFLICTED_POLICY = QUARANTINE
DUPLICATE_POLICY = QUARANTINE_NOT_DELETE
RECONCILIATION_MISMATCH_POLICY = QUARANTINE

INDEXEDDB_TO_V2_MAPPER = financialV2Mapper.js
MONEY_CONVERSION_RULE = SAME_AS_11G_TO_CENTS
SOURCE_ID_PRESERVATION = PASS
REFERENCE_MAPPING = source_id_of_legacy_row

FINANCIAL_V2_MIGRATION_ORDER = financings, receivables, payments, reversals, charges, boleto_charges, financing_installments, boleto_reminder_events

QUARANTINE_MODEL = in-memory dry-run rows (não store remoto)
SHADOW_COMPARATOR = compareFinancialShadow
SHADOW_RESULTS = MATCH, MISMATCH, NOT_COMPARABLE, QUARANTINED

SHADOW_WRITE_ENABLED = NO
DUAL_WRITE_ENABLED = NO
FINANCIAL_SERVER_READ_ENABLED = NO
FINANCIAL_SERVER_WRITE_ENABLED = NO

REMOTE_DATABASE_CHANGED = NO
MIGRATION_APPLIED = NO
BACKFILL_APPLIED = NO
HISTORICAL_PRODUCTION_SCAN = NO
HISTORICAL_DATA_CHANGED = NO

RLS_V2_CONTRACT = PASS
DELETE_V2_CONTRACT = PASS
SERVER_RBAC_V2_CONTRACT = PASS

DRY_RUN_ENGINE = dryRunFinancialV2Migration
DRY_RUN_FIXTURE_RESULT = deterministic (T31)

RECEIVABLE_CREATION_REGRESSION = PASS
PAYMENT_IDEMPOTENCY_REGRESSION = PASS
REVERSAL_REGRESSION = PASS
RECEIVABLE_LIFECYCLE_REGRESSION = PASS
FINANCING_LIFECYCLE_REGRESSION = PASS
FINANCIAL_WRITE_SURFACE_REGRESSION = PASS
MONETARY_RECONCILIATION_REGRESSION = PASS
PERSISTENCE_READINESS_REGRESSION = PASS

AUTOMATIC_FINANCIAL_SIDE_EFFECTS_FROM_CONTRACTS = NONE

TYPECHECK_NEW_11I_FAILURES = NONE

TESTS_ADDED = phase11iFinancialV2LocalFoundation.test.js (T1–T43)
TESTS_PASS = 43/43 (11.I) + 258/258 (15 files: 11.B–11.H, finance, financing, cutover, permissions, tenant, contracts)
TESTS_FAIL = 0

BLOCKERS_FOR_REMOTE_SCHEMA = draft 041 ainda não é migration; tenant IDB pode não ser UUID
BLOCKERS_FOR_SHADOW_WRITE = sem tabelas v2 aplicadas; flags OFF
BLOCKERS_FOR_TENANT_CUTOVER = shadow write + eligibility em dados reais ainda não existem

GO_FOR_REMOTE_SCHEMA_PHASE = YES
GO_FOR_SHADOW_WRITE_PHASE = NO
GO_FOR_PRODUCTION_CUTOVER = NO
PRODUCTION_CHANGED = NO
```
