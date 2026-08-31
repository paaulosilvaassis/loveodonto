# PHASE 11.J — FINANCIAL V2 REMOTE SCHEMA, RLS & CONSTRAINT VALIDATION

**Modo:** SCHEMA REMOTO CONTROLADO (staging)  
**Data:** 2026-08-31  
**Baseline:** `be1018d` (Phase 11.I)  
**PRODUCTION_DATABASE_CHANGED = NO** · **BACKFILL_APPLIED = NO**  
**SHADOW_WRITE_ENABLED = NO** · **DUAL_WRITE_ENABLED = NO**  
**CURRENT_FINANCIAL_SSOT = INDEXEDDB_LEGACY_SERVICES**

---

## 1. Executive Summary

O draft `041_financial_core_v2.sql` foi reauditado, alinhado ao contrato 11.H/11.I e promovido para `supabase/migrations/041_financial_core_v2.sql`. A migration foi aplicada **somente** no projeto staging `tckdjyunwmdpqmewrwvt` (`Love odonto`). Produção `uoepkwhqztmsjnzirpev` não foi tocada.

O schema `financial_v2_*` existe com BIGINT cents, tenant UUID NOT NULL, identities UNIQUE, FKs RESTRICT, RLS + FORCE RLS, e **sem** policy DELETE. Validação sintética (constraints + RLS autenticado) passou e as fixtures foram removidas. IndexedDB continua SSOT. Flags V3 permanecem OFF.

---

## 2. Baseline

```
HEAD esperado = be1018d
BRANCH = main
Leftovers SMTP/patient-email = preservados (não staged)
021 no repo = intocado
```

---

## 3. Target Environment

```
TARGET_DB_ENVIRONMENT = STAGING
REMOTE_SCHEMA_ENVIRONMENT = tckdjyunwmdpqmewrwvt
PROJECT_NAME = Love odonto
PRODUCTION_REF = uoepkwhqztmsjnzirpev
PRODUCTION_DATABASE_CHANGED = NO
```

Identificação explícita via MCP `list_projects`: staging ≠ production. Apply recusado se o project_id fosse o de produção.

---

## 4. Tenant ID Resolution

Prova no staging:

| Superfície | Tipo |
| --- | --- |
| `public.tenants.id` | UUID NOT NULL |
| `public.tenant_users.tenant_id` | UUID NOT NULL |
| Sessão SaaS / JWT / membership | UUID do tenant remoto |
| IndexedDB testes/legado | TEXT opaco possível (`tenant-11i-a`) |

```
CURRENT_TENANT_ID_FORMAT = UUID_SAAS_SESSION_OR_OPAQUE_IDB_LEGACY
SUPABASE_TENANT_ID_FORMAT = UUID
FINANCIAL_V2_TENANT_ID_TYPE = UUID
TENANT_ID_MAPPING_REQUIRED = YES_FOR_NON_UUID_IDB_QUARANTINE_ONLY
TENANT_ID_TYPE_RESOLVED = YES
```

Não há incompatibilidade de tipo no schema remoto: V2 referencia `tenants(id)`. Registros IDB não-UUID continuam **quarantine** (11.I) e não entram nas tabelas V2. Sem tabela de mapping.

---

## 5. Draft → Migration Parity

```
V2_SQL_CONTRACT_PARITY = PASS
```

Equivalência nas 7 tabelas do contrato, money BIGINT, identities, status canônicos, FKs RESTRICT.

Diferenças deliberadas vs draft:

| Item | Decisão |
| --- | --- |
| `financial_v2_migration_quarantine` | omitida (11.I: quarantine in-memory) |
| `amount_cents > 0` em payments | apertado vs draft `>= 0` |
| `installment_number >= 0` | adicionado |
| `amount_cents` em installments | projeção, não SSOT |
| RLS/REVOKE DELETE | implementado (draft era sketch) |

Draft 041 permanece em `docs/design/drafts/` para regressão 11.H/11.I.

---

## 6. Migration Created

```
FINANCIAL_V2_MIGRATION_FILE = supabase/migrations/041_financial_core_v2.sql
```

Cópias: `supabase-local/migrations/` e `supabase-local/supabase/migrations/`.  
041 estava livre na sequência do repo (último numerado = 040).

---

## 7. Migration Application

```
FINANCIAL_V2_SCHEMA_APPLIED = YES
APPLY_COMMAND = mcp apply_migration project_id=tckdjyunwmdpqmewrwvt name=financial_core_v2
STAGING_MIGRATION_VERSION = 20260831191740
```

Sem `supabase db push` contra produção. Sem backfill.

---

## 8. V2 Tables

Introspecção live (staging):

- `financial_v2_receivables`
- `financial_v2_payments`
- `financial_v2_financings`
- `financial_v2_financing_installments`
- `financial_v2_charges`
- `financial_v2_boleto_charges`
- `financial_v2_boleto_reminder_events`

021 **não existe** neste ambiente. Arquivo 021 no repo permanece legado.

---

## 9. Money Types

Todos os campos `*_cents` = `bigint` / `int8`.  
`V2_FLOAT_MONEY_COLUMNS = 0`  
Sem NUMERIC(14,2), DOUBLE ou REAL no V2.

---

## 10. Receivable Constraints

- `tenant_id` UUID NOT NULL RESTRICT
- `source_id` TEXT NOT NULL
- UNIQUE `(tenant_id, source_id)`
- UNIQUE parcial `(tenant_id, origin_type, origin_id, installment_number)` PATH A/B
- `total_cents >= 0`, `installment_number >= 0`
- status canônicos; sem default `open`
- duplicata mesma identity: REJECTED
- mesma identity em outro tenant: ALLOWED

---

## 11. Payment/Reversal Constraints

- UNIQUE `(tenant_id, operation_id)`
- `amount_cents > 0`
- reversal: FK composta mesmo tenant, no self-reverse, unique target
- trigger: target deve ser `kind=payment`
- payment original permanece após reversal
- reversal cross-tenant: REJECTED
- invariantes de serviço (amount igual, não estornar reversal) **não** são 100% SQL — documentados

---

## 12. Financing Constraints

Partial unique `(tenant_id, budget_id)` onde status ∉ (`canceled`, `renegotiated`).  
Segundo ativo: REJECTED. Histórico cancelado libera sucessor.

---

## 13. Charge/Boleto

Charge referencia receivable; criar charge não cria receivable.  
Boleto: tenant-scoped, provider default `fake`, sem emissão real.

---

## 14. Foreign Keys

Todas as FKs V2: `ON DELETE RESTRICT`.  
`V2_DESTRUCTIVE_CASCADE_PATHS = NONE`

---

## 15. RLS

ENABLE + FORCE em todas as tabelas V2.  
Policies: SELECT / INSERT / UPDATE via `auth.uid()` + `app_user_can_access_tenant(tenant_id)`.  
Sem policy DELETE.  
RLS testada com `SET ROLE authenticated` + JWT `sub` (não service_role).  
SELECT próprio = visível; SELECT outro tenant = vazio.

RBAC `financeiro_*` permanece no writer. RLS não substitui RBAC.

---

## 16. DELETE Protection

Authenticated: DELETE DENY (0 rows / exception).  
REVOKE ALL de `anon`/`authenticated` + GRANT só SELECT/INSERT/UPDATE.  
Cleanup sintético usou bypass administrativo (postgres) e foi documentado.

---

## 17. Synthetic DB Validation

Fixtures `phase11j-*` / tenants sintéticos. Sem PII real. Removidas após o teste (`cleanupComplete = true`).

---

## 18. Schema Drift Contract

`src/services/financialV2SchemaDrift.js` + snapshot `docs/reports/PHASE_11J_STAGING_INTROSPECTION.json`.  
Detecta type change, unique drop, RLS off, DELETE policy, money não-BIGINT.

---

## 19. Feature Flags

```
FINANCIAL_READ = OFF
FINANCIAL_WRITE = OFF
FINANCIAL_DUAL_WRITE = OFF
FINANCIAL_SHADOW = OFF
FINANCIAL_SERVER_READ_ENABLED = NO
FINANCIAL_SERVER_WRITE_ENABLED = NO
SHADOW_WRITE_ENABLED = NO
```

---

## 20. Regression

```
TESTS_ADDED = phase11jFinancialV2RemoteSchema.test.js (T1–T35 + drift)
TESTS_PASS = 36/36 (11.J); 294/294 em 16 files (11.B–11.J + finance/cutover/permissions/tenant/contracts)
TESTS_FAIL = 0
TYPECHECK_NEW_11J_FAILURES = NONE
```

---

## 21. Remaining Blockers

- Mapper 11.I ainda aceita tenant IDB não-UUID (correto para quarantine; bloqueia insert remoto).
- Writers 11.B–11.F não escrevem no V2.
- Shadow-write machinery existe (11.I) mas persistência remota OFF.
- Staging não tem 021; produção ainda tem 021 legado (intocado nesta fase).

---

## 22. Go/No-Go

```
GO_FOR_SHADOW_WRITE_PHASE = YES
GO_FOR_TENANT_CUTOVER = NO
GO_FOR_PRODUCTION_CUTOVER = NO
```

Shadow-write é a **próxima** fase possível. Não inicia aqui.

---

## 23. Gate

```
PHASE_11J_GATE = FINANCIAL_V2_REMOTE_SCHEMA_VALIDATED
PHASE_11J_STATUS = PASS
```
