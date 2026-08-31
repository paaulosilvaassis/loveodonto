# PHASE 11.M — CONTROLLED APP WRITER SHADOW WIRING IN STAGING

**Modo:** APP WRITER → runtime V2 shadow (non-authoritative)  
**Data:** 2026-08-31  
**Baseline:** `db20323` (Phase 11.L)  
**PRODUCTION_CHANGED = NO** · **PRODUCTION_DATABASE_CHANGED = NO**  
**TENANT_CUTOVER = NO** · **BACKFILL_APPLIED = NO**  
**CURRENT_FINANCIAL_SSOT = INDEXEDDB_LEGACY_SERVICES**

---

## 1. Executive Summary

A 11.M liga os **writers canônicos** ao path V2 shadow **depois** do commit no IndexedDB. A flag `FINANCIAL_V2_RUNTIME_SHADOW` nasce **OFF**. Allowlist é fail-closed. Staging only. Falha remota **não** quebra o writer legado. V2 permanece non-authoritative. Sem observation window de usuário real.

## 2. Baseline

```
HEAD esperado = db20323
Leftovers SMTP/patient-email = preservados
021 = intocado
Flags V3 = OFF
11.L APP_WRITERS_STAGING_WIRED = false (preservado)
```

## 3. Git Safety

Branch `main`. Leftovers anteriores não staged. Sem `git add .` / reset / clean.

## 4. Writer Surface Audit

| Writer | File | Função canônica | Boundary legado | Hook 11.K | Risco |
| --- | --- | --- | --- | --- | --- |
| PATH A receivable | `receivablesService.js` | `createReceivable` (`origin_type=treatment_plan`) | `withDb` então adapter | `scheduleFinancialDualWriteCreateReceivable` → V2 | baixo |
| PATH B receivable | `financingsService.js` → `createReceivable` | `createInstallmentsAndReceivables` / `createEntryReceivableIfNeeded` | após IDB em `createReceivable` | mesmo hook PATH A | médio (N títulos) |
| Payment | `receivablePaymentLifecycle.js` | `registerReceivablePayment` | após `withDb` | já existia | baixo |
| Reversal | `receivablePaymentLifecycle.js` | `reverseReceivablePayment` | após `withDb` | já existia | médio (deps) |
| Financing create | `financingsService.js` | `createFinancingProposal` | após persist | adapter create | baixo |
| Financing approval | `financingsService.js` | `approveFinancing` → `persistFinancingApproval` | após IDB | **11.M adicionou** `scheduleFinancialDualWriteUpdateFinancing` | médio |
| Charge | `receivablesService.js` | `createReceivableCharge` | após persist | já existia | baixo |

UI/modais não receberam hook.

## 5. Runtime Shadow Architecture

```
canonical writer
  → authorize/validate
  → IndexedDB commit (SSOT)
  → return legacy result
  → enqueue FINANCIAL_V2_RUNTIME_SHADOW (best-effort)
       → env + flag + allowlist + UUID
       → shadowWriteFinancialRecord (11.K, fabricateDependencies=false)
       → persist SQL 11.L (generic builders)
       → compareFinancialShadow
       → telemetry/counters
```

Engine **não** foi recriada.

## 6. Environment Guard

```
STAGING  = tckdjyunwmdpqmewrwvt  ALLOWED
PRODUCTION = uoepkwhqztmsjnzirpev  FORBIDDEN
UNKNOWN / missing = DISABLED
RUNTIME_SHADOW_PRODUCTION_GUARD = PASS
```

## 7. Feature Flag

```
FINANCIAL_V2_RUNTIME_SHADOW
V2_RUNTIME_SHADOW_DEFAULT = OFF
```

Não reutiliza `FINANCIAL_SHADOW` V3 (path 021).

## 8. Tenant Allowlist

```
TENANT_ALLOWLIST_MODE = EXPLICIT_FAIL_CLOSED
ALLOWLISTED_SYNTHETIC_TENANTS = c11c11c1-1111-4111-8111-c11c11c1111c
`all` / `*` = ALLOWLIST_ALL_FORBIDDEN
ausente = ALLOWLIST_MISSING
não listado = ALLOWLIST_DENIED
```

## 9. PATH A Writer

`createReceivable` + `origin_type=treatment_plan`. Legacy criado. Shadow MATCH (99.99 → 9999). Retry sem duplicata.

## 10. Financing Writer

`createFinancingProposal`. Legacy + shadow MATCH.

## 11. PATH B Writer

`approveFinancing` materializa receivables `origin_type=financing`. Shadows MATCH. Identidades A/B não colidem.

## 12. Payment Writer

`registerReceivablePayment`. Legacy + reconciliação + shadow MATCH.

## 13. Reversal Writer

`reverseReceivablePayment`. Fato original preservado. Reversal MATCH. Sem original remoto: `WRITE_FAILED_WITH_DEPENDENCY`, sem fabricar.

## 14. Charge Writer

`createReceivableCharge`. MATCH. Não cria receivable extra.

## 15. Idempotency

PATH A / payment / financing: retry não duplica IDB nem V2 store.

## 16. Immutable Conflicts

Payment remoto com `amount_cents` diferente: `IMMUTABLE_FACT_CONFLICT`, sem overwrite. Legacy intacto.

## 17. Failure Isolation

Network / RLS / constraint / mismatch: writer legado retorna sucesso.  
`SHADOW_FAILURE_BREAKS_APP_WRITER = NO`

## 18. Kill Switch

Flag ON → MATCH. Flag OFF → zero enqueue imediato, sem reset de dados.

## 19. Telemetry

Campos: `tenant_id`, `entity_type`, `source_id`, `operation`, `result`, `reason_code`, `duration_ms`, `timestamp`.  
PII: NONE. Counters por entity type.

## 20. RLS / Operational Auth

Insert live PATH A: `SET ROLE authenticated` + `request.jwt.claim.sub` + `tenant_id`.  
Service role só setup/cleanup de fixtures.  
`SHADOW_OPERATIONAL_AUTH = TENANT_SCOPED`

## 21. Synthetic Runtime Validation

Prefixo `phase11m-*`. Tenant UUID sintético. Sem paciente/clínica real. Sem scan histórico.

## 22. Cleanup

```
PHASE_11M_STAGING_FIXTURES_LEFT = 0
receivables=0 payments=0 financings=0 charges=0 tenants=0 tenant_users=0
```

RLS/DELETE policies não foram enfraquecidas.

## 23. Regression

Suite T1–T60: **60 passed**.  
11.B–11.L + finance/cutover/permissions/tenant/contracts: **426/426** em 19 files.

## 24. Remaining Risks

- Observation window real ainda não existe (proposital).
- Executor app-side ainda é injetado (test/harness); default OFF não persiste remoto sozinho.
- Approval financing agora emite shadow de update; status V2 pode avançar, money permanece imutável.

## 25. Go/No-Go

```
GO_FOR_CONTROLLED_RUNTIME_OBSERVATION_WINDOW = YES
GO_FOR_TENANT_CUTOVER = NO
GO_FOR_PRODUCTION_CUTOVER = NO
REAL_USER_RUNTIME_SHADOW = NO
```

## 26. Gate

```
PHASE_11M_GATE = FINANCIAL_V2_APP_WRITER_SHADOW_WIRING_VALIDATED
PHASE_11M_STATUS = PASS
```

---

## Métricas

```
PHASE_11M_STATUS = PASS
BASELINE_HEAD = db20323
FINAL_HEAD = (após commit)

CURRENT_FINANCIAL_SSOT = INDEXEDDB_LEGACY_SERVICES
TARGET_DB_ENVIRONMENT = STAGING
SHADOW_TARGET_PROJECT_REF = tckdjyunwmdpqmewrwvt
PRODUCTION_PROJECT_REF_BLOCKED = PASS

V2_RUNTIME_SHADOW_FLAG = FINANCIAL_V2_RUNTIME_SHADOW
V2_RUNTIME_SHADOW_DEFAULT = OFF

TENANT_ALLOWLIST_MODE = EXPLICIT_FAIL_CLOSED
ALLOWLISTED_SYNTHETIC_TENANTS = c11c11c1-1111-4111-8111-c11c11c1111c

APP_WRITER_PATH_A_SHADOW = MATCH
APP_WRITER_FINANCING_SHADOW = MATCH
APP_WRITER_PATH_B_SHADOW = MATCH
APP_WRITER_PAYMENT_SHADOW = MATCH
APP_WRITER_REVERSAL_SHADOW = MATCH
APP_WRITER_CHARGE_SHADOW = MATCH

PATH_A_IDEMPOTENCY = PASS
PATH_B_IDEMPOTENCY = PASS
PAYMENT_IDEMPOTENCY = PASS
FINANCING_IDEMPOTENCY = PASS

IMMUTABLE_FACT_CONFLICT_POLICY = REPORT_MISMATCH_NO_OVERWRITE
SHADOW_READ_BACK_REQUIRED = YES
SHADOW_COMPARATOR = compareFinancialShadow
SHADOW_FAILURE_BREAKS_APP_WRITER = NO

KILL_SWITCH = PASS
RUNTIME_TELEMETRY = PASS
RUNTIME_TELEMETRY_PII = NONE

TENANT_RLS_RUNTIME_SHADOW = PASS
SHADOW_OPERATIONAL_AUTH = TENANT_SCOPED
NON_UUID_TENANT_POLICY = QUARANTINE

PHASE_11M_STAGING_FIXTURES_LEFT = 0
HISTORICAL_SHADOW_SCAN = NO
BACKFILL_APPLIED = NO

FINANCIAL_SERVER_READ_ENABLED = NO
FINANCIAL_SERVER_WRITE_ENABLED = NO
FINANCIAL_SERVER_WRITE_AUTHORITY = NO
DUAL_WRITE_ENABLED = NO
SHADOW_NON_AUTHORITATIVE = YES
REAL_USER_RUNTIME_SHADOW = NO
TENANT_CUTOVER_APPLIED = NO
PRODUCTION_DATABASE_CHANGED = NO
PRODUCTION_CHANGED = NO

AUTOMATIC_FINANCIAL_SIDE_EFFECTS_FROM_CONTRACTS = NONE
TYPECHECK_NEW_11M_FAILURES = NONE

TESTS_ADDED = phase11mFinancialV2AppWriterShadowWiring.test.js (T1–T60)
TESTS_PASS = 60/60 (11.M); 426/426 em 19 files
TESTS_FAIL = 0

BLOCKERS_FOR_RUNTIME_OBSERVATION_WINDOW = nenhum P0; falta só decisão de produto para janela controlada
GO_FOR_CONTROLLED_RUNTIME_OBSERVATION_WINDOW = YES
GO_FOR_TENANT_CUTOVER = NO
GO_FOR_PRODUCTION_CUTOVER = NO
```
