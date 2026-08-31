# PHASE 11.H — SUPABASE FINANCIAL PERSISTENCE READINESS & CUTOVER DESIGN

**Modo:** DESIGN + READINESS (IndexedDB SSOT)  
**Data:** 2026-08-31  
**PHASE_11.B–11.G:** preservadas (regressão nesta suite)  
**PRODUCTION_CHANGED = NO** · **MIGRATION_APPLIED = NO** · **BACKFILL_APPLIED = NO** · **DUAL_WRITE_ENABLED = NO** · **SUPABASE_CUTOVER = NO**

Nenhum PII. Nenhum secret. Sem deploy. Sem Phase 11.I executada.

Artefatos:

- `docs/design/FINANCIAL_CORE_V2_SCHEMA.md`
- `docs/design/FINANCIAL_CUTOVER_PLAN.md`
- `docs/design/drafts/041_financial_core_v2.sql` (**DRAFT ONLY — DO NOT APPLY**)
- `src/contracts/financialCoreV2PersistenceContract.js`

---

## 1. Executive Summary

O schema Supabase `financial_*` (migration **021** + RLS **023**) existe, mas foi desenhado **antes** das fases 11.B–11.G. É **INCOMPATÍVEL** com o domínio LIVE: dinheiro `NUMERIC(14,2)`, status `open`, sem `installment_number`, sem tabela de payments/reversals, sem charges, `ON DELETE CASCADE` no tenant, e DELETE liberado para admin via RLS.

O target **financial_v2_*** fecha o contrato endurecido: `tenant_id NOT NULL`, **integer cents**, identidade PATH A/B, `UNIQUE(tenant_id, operation_id)`, reversal como fato, charge ≠ receivable, DELETE DENY. IndexedDB continua SSOT. Nenhuma migration foi aplicada.

Cutover recomendado: **shadow-compare e depois tenant-by-tenant**. Não dual-write contra 021. Rollback = flag OFF, preservar IDB e rows server. `GO_FOR_PRODUCTION_CUTOVER = NO`. `GO_FOR_PHASE_11I = YES` só para schema local + mapper + quarantine.

---

## 2. Baseline

```
BRANCH = main
CURRENT_HEAD (antes) = d5578797fae146091e22cdc7cbdaccc1538fc46f
EXPECTED_BASELINE = d557879
DELTA = leftovers SMTP/patient-email (não staged)
FINANCIAL_SSOT = INDEXEDDB_LEGACY_SERVICES
MONEY_STORAGE_MODEL = FLOAT_BRL
MONEY_CALCULATION_MODEL = INTEGER_CENTS
SUPABASE_FINANCIAL_DEPENDENCY = PREPARED_NOT_AUTHORITATIVE
FLAGS V3 = OFF + production lock
```

Nenhum `git reset` / `clean` / `restore`. Leftovers **não** staged. Nenhum `supabase db push`.

---

## 3. Existing Supabase Financial Schema

`SUPABASE_FINANCIAL_SCHEMA_INVENTORY`

Migrations: `021_app_financial_core.sql`, `023_app_appointments_financial_crm_rls.sql`. Cópias em `supabase/migrations` e `supabase-local`. 024–040 **não** alteram colunas `financial_*`. 026/027 apenas citam as tabelas em health-check.

| TABLE | PK | TENANT | MONEY | STATUS | ORIGIN | UNIQUE | FK | RLS | CLASS |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| financial_accounts_receivable | uuid | uuid NOT NULL CASCADE | numeric(14,2) | default `open` | origin_type/id, budget, financing; **sem installment_number** | (tenant, legacy_id) | tenant | SELECT member; ALL admin **incl. DELETE** | INCOMPATIBLE |
| financial_payables | uuid | uuid CASCADE | numeric | `open` | n/a | (tenant, legacy_id) | tenant | idem | UNUSED |
| financial_financings | uuid | uuid CASCADE | numeric total/entry | `draft` + approval_status | patient/budget text | (tenant, legacy_id) | tenant | idem | INCOMPATIBLE |
| payments / reversals | — | — | — | — | — | — | — | — | MISSING |
| installments | — | — | — | — | — | — | — | — | MISSING |
| charges / boleto / reminders | — | — | — | — | — | — | — | — | MISSING |

`EXISTING_SUPABASE_SCHEMA_COMPATIBILITY = INCOMPATIBLE`

---

## 4. Domain vs Schema Gap Analysis

| Domínio 11.B–11.G | 021 |
| --- | --- |
| PATH A identity + installment_number 0 | ausente unique / coluna |
| PATH B origin financing + installment | ausente |
| Payment `operation_id` + reversal fact | tabela inexistente |
| Money integer cents | NUMERIC BRL |
| Status pending/partially_paid/canceled | `open` / `cancelled` (mapper V3) |
| 1 financing ativo por tenant+budget | não |
| Charge não cria obrigação | n/a |
| DELETE DENY | RLS admin DELETE + CASCADE tenant |
| created_by IDB text | uuid |
| ID `recv-*` | uuid PK |

Mapper `financialTypes.ts` **não** deve ser reativado contra 021.

---

## 5. Target Receivable Model

`financial_v2_receivables`

- `tenant_id NOT NULL` RESTRICT
- `source_id` = ID IndexedDB
- `origin_type`, `origin_id`, `installment_number`
- `total_cents` persistido; paid/balance **derivados**
- status persistido + validado contra facts
- cancel metadata
- UNIQUE obligation PATH A/B
- DELETE DENY

Manual entry: sem origin unique; identidade = `(tenant_id, source_id)`.

---

## 6. Target Payment/Reversal Model

`financial_v2_payments` (facts imutáveis de valor)

- UNIQUE `(tenant_id, operation_id)`
- `kind` payment \| reversal
- `reverses_payment_id` FK composta no **mesmo tenant** RESTRICT
- UNIQUE um reversal por payment
- original nunca apagado
- CHECK: payment XOR reversal shape; no self-reverse
- Serviço: não estornar reversal; amount igual; sem ciclo

---

## 7. Target Financing Model

`financial_v2_financings`

- tenant/patient/budget (budget TEXT, **sem FK**)
- cents: total, entry, interest, fee, discount, total_payable
- paid/open derivados
- UNIQUE ativo `(tenant_id, budget_id)` onde status ∉ {canceled, renegotiated}
- Renegociação: status antigo `renegotiated` libera o unique para a nova versão

Installments: projeção `financial_v2_financing_installments` ligada 1:1 ao receivable. **Obrigação = CR.**

---

## 8. Target Charge/Boleto Model

`financial_v2_charges` / `financial_v2_boleto_charges` / reminders

- referenciam receivable
- **não** geram receivable
- UNIQUE `(tenant_id, operation_id)` (11.F)

---

## 9. Money Persistence Model

```
TARGET_MONEY_STORAGE_MODEL = INTEGER_CENTS
MONEY_CONVERSION_RULE = SAME_AS_11G_TO_CENTS
roundToCentsForPersistence === toCents
```

Storage IDB permanece FLOAT até cutover. Server autoritativo futuro = BIGINT cents. Sem NUMERIC ambíguo no v2.

---

## 10. Tenant Ownership

Novo server-side: **NO UNOWNED ROWS**. `tenant_id NOT NULL`. Sem derivar de patient no insert novo.

Legado:

| Class | Policy |
| --- | --- |
| OWNED_DIRECT | eligible |
| OWNED_DERIVED | eligible only with proof |
| UNOWNED | quarantine |
| CONFLICTED | quarantine |

Não atribuir silenciosamente ao tenant ativo.

---

## 11. RLS

**023 atual:** SELECT membro do tenant; INSERT/UPDATE/DELETE = admin. Service_role (Admin API) bypassa RLS.

Gaps: DELETE permitido; não há policies para payments/charges; RLS ≠ RBAC.

**Target v2:** SELECT/INSERT/UPDATE com membership; **nenhuma** policy DELETE; `REVOKE DELETE FROM authenticated, anon`.

---

## 12. RBAC Boundary

`RBAC_SERVER_BOUNDARY = DEFINED`

Enforcement no **server writer** (não no frontend, não só RLS):

- `financeiro_contas_receber:create|edit|reverse|cancel`
- `financeiro_financiamentos:create|approve|cancel`
- `financeiro_boletos:create|issue|cancel|resend`

JWT: membership / `app_metadata`. Nunca `user_metadata`.

---

## 13. Foreign Keys

| Ref | Policy |
| --- | --- |
| tenants | UUID FK ON DELETE **RESTRICT** (não CASCADE) |
| patient | TEXT opaco — **NO FK** até cutover de pacientes |
| budget | TEXT opaco — **NO FK** (orçamento no IDB) |
| receivable / financing / payment | FK composta (tenant_id, source_id) RESTRICT |

Não criar FK impossível só para parecer relacional.

---

## 14. IndexedDB → Supabase Mapping

| SOURCE | TARGET | MONEY | OWNERSHIP | RISK |
| --- | --- | --- | --- | --- |
| accountsReceivable | financial_v2_receivables | toCents | tenant required | unowned; status open≠pending |
| receivablePayments | financial_v2_payments | amount_received → amount_cents | tenant | operation_id ausente |
| financings | financial_v2_financings | cents | tenant | enum status |
| financingInstallments | v2 installments projection | N/A SSOT | via financing | delinquency unscoped |
| receivableCharges | financial_v2_charges | cents display | tenant+recv | never create CR |
| boletoCharges | financial_v2_boleto_charges | cents | tenant | provider fake |
| boletoReminderEvents | v2 reminder events | n/a | tenant | operational |

---

## 15. Legacy Classification

Ownership: OWNED_DIRECT / OWNED_DERIVED / UNOWNED / CONFLICTED.  
Duplicates: **QUARANTINE_NOT_DELETE**.  
Tabela draft `financial_v2_migration_quarantine`.

---

## 16. Reconciliation Eligibility

`RECONCILIATION_BEFORE_MIGRATION = REQUIRED`

Classes: RECONCILED, MISMATCH, UNOWNED, DUPLICATE, UNSUPPORTED.  
Somente RECONCILED (+ ownership) é candidato automático.

---

## 17. Proposed Cutover Strategy

`CUTOVER_STRATEGY = SHADOW_COMPARE_THEN_TENANT_CUTOVER`

Não A (big bang). Não B (dual-write 021). Não C prematuro.

Princípios: no silent divergence; retry idempotente; tenant scoped; kill switch; rollback sem DELETE; reconciliação; read-after-write; no history rewrite.

Detalhe: `docs/design/FINANCIAL_CUTOVER_PLAN.md`.

---

## 18. Rollback Strategy

`ROLLBACK_STRATEGY = FLAG_OFF_PRESERVE_IDB_AND_SERVER_ROWS`

Falha parcial → desliga flag do tenant; leitura IDB. UNIQUE impede replay duplo. Rows server não são apagadas.

---

## 19. Feature Flag Design

Existentes (OFF, production-locked): `FINANCIAL_READ`, `READ_PRIMARY`, `SHADOW`, `COMPARE`, `WRITE`, `WRITE_PRIMARY`, `DUAL_WRITE`, `WRITE_COMPARE`.

Futuras conceituais (não implementadas em 11.H): `FINANCIAL_SERVER_READ`, `FINANCIAL_SERVER_WRITE`, `FINANCIAL_SHADOW_WRITE`, `FINANCIAL_TENANT_CUTOVER`.

Não ligar flags existentes contra schema 021.

---

## 20. Readiness Matrix

`FINANCIAL_PERSISTENCE_READINESS_MATRIX = COMPLETE`

| DOMAIN | IDB | TARGET | SCHEMA | RLS | MONEY | IDEMP | LEGACY MIG | BLOCKERS |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| receivables | accountsReceivable | v2_receivables | NEEDS_CHANGES | NEEDS_CHANGES | DESIGNED | DESIGNED | NO | 021 numeric/status/identity |
| payments | receivablePayments | v2_payments | NEEDS_CHANGES | NEEDS_CHANGES | DESIGNED | DESIGNED | NO | tabela ausente |
| reversals | payments kind=reversal | v2_payments | NEEDS_CHANGES | NEEDS_CHANGES | DESIGNED | DESIGNED | NO | service invariants |
| financing | financings | v2_financings | NEEDS_CHANGES | NEEDS_CHANGES | DESIGNED | DESIGNED | NO | enum/CASCADE/payable |
| installments | financingInstallments | projection | NEEDS_CHANGES | NEEDS_CHANGES | N_A | DESIGNED | NO | não duplicar SSOT |
| charges | receivableCharges | v2_charges | NEEDS_CHANGES | NEEDS_CHANGES | DESIGNED | DESIGNED | NO | missing; no spawn CR |
| boleto/reminders | boleto* | v2 boleto+events | NEEDS_CHANGES | NEEDS_CHANGES | DESIGNED | DESIGNED | NO | missing; tenant gap operacional |

---

## 21. Tests

Suite `phase11hSupabaseFinancialPersistenceReadiness.test.js` T1–T26.

---

## 22. Blockers

Para **cutover de produção**:

1. Schema v2 não aplicado (intencional)
2. 021 incompatível
3. Mapper V3 status drift
4. Budget/patient sem FK segura
5. Tenant IDB pode não ser UUID
6. RLS 023 permite DELETE
7. Dual-write 021 seria corrupção monetária
8. Flags locked OFF em produção (correto)

---

## 23. Go/No-Go

```
GO_FOR_PHASE_11I = YES   (local schema + mapper + quarantine only)
GO_FOR_PRODUCTION_CUTOVER = NO
```

11.I não deve: db push produção, backfill, dual-write, cutover.

---

## 24. Gate

```
PHASE_11H_GATE = FINANCIAL_PERSISTENCE_CUTOVER_DESIGNED
PHASE_11H_STATUS = PASS_WITH_NOTES
```

NOTES = schema 021 INCOMPATIBLE (esperado); cutover produção NO-GO. Design e contrato executável PASS. Sem P0 de escrita LIVE.

---

## 42. Métricas obrigatórias

```
PHASE_11H_STATUS = PASS_WITH_NOTES
BASELINE_HEAD = d557879
FINAL_HEAD = (após commit)

CURRENT_FINANCIAL_SSOT = INDEXEDDB_LEGACY_SERVICES
TARGET_FINANCIAL_SSOT = SUPABASE_FINANCIAL_V2_NOT_YET_AUTHORITATIVE

EXISTING_SUPABASE_SCHEMA_COMPATIBILITY = INCOMPATIBLE

TARGET_MONEY_STORAGE_MODEL = INTEGER_CENTS
TARGET_TENANT_MODEL = TENANT_ID_NOT_NULL

RECEIVABLE_TARGET_SCHEMA = NEEDS_CHANGES
PAYMENT_TARGET_SCHEMA = NEEDS_CHANGES
REVERSAL_TARGET_SCHEMA = NEEDS_CHANGES
FINANCING_TARGET_SCHEMA = NEEDS_CHANGES
CHARGE_TARGET_SCHEMA = NEEDS_CHANGES

RECEIVABLE_IDEMPOTENCY_CONSTRAINT = UNIQUE (tenant_id, origin_type, origin_id, installment_number) [partial PATH A/B]
PAYMENT_IDEMPOTENCY_CONSTRAINT = UNIQUE (tenant_id, operation_id)
FINANCING_IDEMPOTENCY_CONSTRAINT = UNIQUE (tenant_id, budget_id) WHERE not canceled/renegotiated

RLS_READINESS = NEEDS_CHANGES
RBAC_SERVER_BOUNDARY = DEFINED

LEGACY_OWNERSHIP_CLASSIFICATION = DEFINED
LEGACY_DUPLICATE_POLICY = QUARANTINE_NOT_DELETE

MONEY_CONVERSION_RULE = SAME_AS_11G_TO_CENTS

RECONCILIATION_BEFORE_MIGRATION = REQUIRED

CUTOVER_STRATEGY = SHADOW_COMPARE_THEN_TENANT_CUTOVER
ROLLBACK_STRATEGY = FLAG_OFF_PRESERVE_IDB_AND_SERVER_ROWS

FEATURE_FLAG_PLAN = DEFINED

FINANCIAL_PERSISTENCE_READINESS_MATRIX = COMPLETE

REMOTE_DATABASE_CHANGED = NO
MIGRATION_APPLIED = NO
BACKFILL_APPLIED = NO
DUAL_WRITE_ENABLED = NO
SUPABASE_CUTOVER = NO
HISTORICAL_DATA_CHANGED = NO

AUTOMATIC_FINANCIAL_SIDE_EFFECTS_FROM_CONTRACTS = NONE

TYPECHECK_NEW_11H_FAILURES = NONE

TESTS_ADDED = src/__tests__/phase11hSupabaseFinancialPersistenceReadiness.test.js (T1–T26)
TESTS_PASS = 205 (11.H + 11.B–G + finance/cutover/contracts)
TESTS_FAIL = 0

BLOCKERS_FOR_CUTOVER = 021 incompatible; v2 unapplied; mapper drift; budget/patient FK; RLS DELETE; prod flags locked
GO_FOR_PHASE_11I = YES

PRODUCTION_CHANGED = NO
```
