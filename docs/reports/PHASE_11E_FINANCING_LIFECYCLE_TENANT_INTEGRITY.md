# PHASE 11.E — FINANCING LIFECYCLE, TENANT OWNERSHIP & INSTALLMENT INTEGRITY

**Modo:** HARDENING PATH B FINANCING (IndexedDB SSOT)  
**Data:** 2026-08-31  
**PHASE_11.B:** PASS (`58d72ed`) — regressão PATH A continua PASS  
**PHASE_11.C:** PASS_WITH_NOTES (`d0eb1ed`) — pagamento/estorno/reconciliação continua PASS  
**PHASE_11.D:** PASS_WITH_NOTES (`5a0f60d`) — lifecycle de CR / HISTORICO / CANCELADO continua PASS  
**PRODUCTION_CHANGED = NO** · **MIGRATION_APPLIED = NO** · **BACKFILL_APPLIED = NO** · **SUPABASE_CUTOVER = NO**

Nenhum PII. Nenhum secret. Sem deploy. Sem Phase 11.F.

---

## 1. Executive Summary

PATH B deixou de ser um financing “órfão de clínica” com aprovação insegura. Novos `financings` persistem `tenant_id`. Create/approve são idempotentes no writer. `approveFinancing` **só** consolida `APPROVED`/`ACTIVE` depois da materialização das obrigações. `entry_received_now` passa pelo lifecycle 11.C com `operation_id` estável. Paid/balance/status do financing derivam dos receivables/payments. Cancelamento unpaid é explícito; partial é FAIL CLOSED; paid permanece histórico. Budget `HISTORICO` não toca financing; budget `CANCELADO` pós-aprovação não apaga obrigação materializada.

---

## 2. Baseline

```
BRANCH = main
CURRENT_HEAD (antes) = 5a0f60deaa8262e3ae660d0f4736099e56e8dc75
EXPECTED_BASELINE = 5a0f60d
DELTA_FROM_BASELINE_BEFORE_11E = leftovers SMTP/patient-email (não staged)
INDEXEDDB_SCHEMA_CHANGE_REQUIRED = NO
DB_VERSION = 57 (não bumpado)
FINANCING_STORE = financings (JSON schemaless no blob IndexedDB)
```

Nenhum `git reset` / `clean` / `restore`. Leftovers SMTP/patient-email **não** foram staged.

---

## 3. Financing Flow Before

```
PHASE11E_FINANCING_FLOW_BEFORE =

UI FinanceFinanciamentoPage / Clinical PATH B
  → createFinancingProposal   (sem tenant_id persistido)
  → approveFinancing
       1. finance:write
       2. status = APPROVED          ← inseguro
       3. createEntryReceivableIfNeeded
       4. entry_received_now SEM operation_id
       5. createInstallmentsAndReceivables (sempre novos CRs)
       6. boletos
       7. status derivado das parcelas
  → registerFinancingPayment
       CR 11.C + bump paralelo stale paid_amount
  → refreshFinancingFromReceivable
       totais só de financingInstallments (entrada omitida)
```

---

## 4. Financing Data Model

```
FINANCING_SSOT = INDEXEDDB_LEGACY_SERVICES
FINANCING_STORE = financings
FINANCING_TENANT_FIELD = tenant_id (novas escritas)
FINANCING_BUDGET_REFERENCE = budget_id + treatment_plan_id
FINANCING_PATIENT_REFERENCE = patient_id
INSTALLMENT_MODEL = financingInstallments + receivables PATH B
ENTRY_MODEL = receivable origin_type=financing, installment_number=0
```

`financings` entrou em `TENANT_GUARDED_COLLECTIONS` **sem** bump de `DB_VERSION`. Create novo sem `tenant_id` falha. Legado sem tenant continua atualizável (o guard só impede *remover* tenant já existente). Sem backfill.

---

## 5. Tenant Ownership

Novas escritas: `resolveTenantIdForWrite` + `assertPatientTenantForWrite`. Se `budget_id` existir e o orçamento for encontrado, patient do appointment precisa bater com o payload e com o tenant da sessão.

Writers tocados (`createFinancingProposal`, `approveFinancing`, `cancelFinancing`, `rejectFinancing`, `registerFinancingPayment`, `generateBoletoCarne`, `renegotiateFinancing`) chamam `assertFinancingWriteOwnership`.

**Nunca** se assume que financing legado pertence ao tenant da sessão.

---

## 6. Legacy Tenant Policy

```
LEGACY_FINANCING_WRITE_POLICY = DERIVE_FROM_BUDGET_OR_PATIENT_OR_FAIL_CLOSED
```

Ordem: `financing.tenant_id` → `patient.tenant_id` → tenant do patient do budget/appointment. Sem derivação comprovável → `LEGACY_FINANCING_UNOWNED`. Listagens tenant-scoped **excluem** ownership desconhecido (mais estrito que `listReceivables` 11.B).

---

## 7. Financing Identity

Identidade da obrigação PATH B:

```
tenant_id + origin_type=financing + origin_id=financing.id + installment_number
```

Não reutiliza PATH A (`treatment_plan` + `budget.id`). Não usa amount como identidade. `findPathBObligationReceivable` vive ao lado de `findPathAObligationReceivable`. `createReceivable` replay PATH B devolve o título existente.

---

## 8. Create Idempotency

```
FINANCINGS_ALLOWED_PER_BUDGET = 1  (não canceled / não renegotiated)
```

Retry / duplo clique com o mesmo `tenant + budget_id` devolve o registro existente. `operation_id` explícito também replaya. **Não** há dedupe por patient + amount. Dois orçamentos distintos com os mesmos valores geram dois financings (T3).

---

## 9. Approval Idempotency

`approveFinancing` materializa entrada (`installment_number=0`) e parcelas 1..N de forma idempotente. Retry preenche números faltantes; não recria os já existentes.

```
FIRST_APPROVAL = receivables esperados (entrada + N parcelas)
SECOND_APPROVAL_ADDITIONAL_RECEIVABLES = 0
THIRD_APPROVAL_ADDITIONAL_RECEIVABLES = 0
```

IndexedDB não oferece transação ACID multi-`withDb` para o loop de `createReceivable`. Boundary: identidade PATH B + retry fail-closed (T8). Fault injection `__setFinancingApproveFaultForTest` confirma que status **não** fica `APPROVED` incompleto.

---

## 10. Budget Binding

`budget_id` / `treatment_plan_id` permanecem a referência real. Create valida mismatch patient×budget. Clinical PATH B continua em `createFinancingFromApprovedBudget` → `createFinancingProposal(..., { source: 'clinical_budget' })`. Alias `finance:write` removido desse caminho.

---

## 11. Receivable Binding

Cada obrigação PATH B leva `origin_type=financing`, `origin_id=financing.id`, `financing_id`, `tenant_id` e `installment_number` canônico. Entrada = `0`. Parcelas = `1..N`.

---

## 12. Installment Integrity

Soma entrada + parcelas = `total_payable_amount` (T9). `splitInCents` não foi alterado.

---

## 13. Rounding

```
PATH B rounding = floor + remainder nas primeiras N partes
1000 / 3 = 333.34 + 333.33 + 333.33
```

`calculateFinancingSummary` continua bloqueando `entry < 0` e `entry > total`. Sem conversão global de money storage.

---

## 14. Entry Lifecycle

Entrada é receivable PATH B `installment_number=0`, não linha de `financingInstallments`. Validação de entrada permanece no calculator.

---

## 15. Payment/Reversal Integration

`entry_received_now` chama `registerReceivablePayment` (11.C) com:

```
operation_id = payop:fin-entry:${financing.id}
```

Retry da aprovação não duplica o pagamento de entrada (T12).

`registerFinancingPayment` mantém replay 11.C e **remove** o bump paralelo `paid_amount += payload` sobre installment stale. Allocation continua uma vez no non-replay. Estorno 11.C reconcilia o financing (T15).

---

## 16. Financing Reconciliation

Fonte canônica: `reconcileFinancingFromReceivables` / `applyFinancingReconciliation`.

Inclui **todos** os CRs com `financing_id === id` **ou** (`origin_type=financing` && `origin_id === id`) — portanto a entrada entra nos totais. Status `canceled` / `renegotiated` não é sobrescrito por refresh de parcela.

`refreshFinancingFromReceivable` atualiza a parcela ligada e aplica a reconciliação canônica do financing.

---

## 17. Status Lifecycle

Catálogo inalterado: `draft, pending_analysis, approved, active, partially_paid, paid_off, overdue, renegotiated, canceled, defaulted`.

Prioridade de derivação: preserve canceled/renegotiated → paid_off se cobráveis quitados → overdue → partially_paid → active.

Listagem deriva status/totais dos receivables quando há obrigação materializada; draft/pending sem CR permanece o status persistido (não promove mais para `approved` por array vazio de parcelas).

---

## 18. Cancellation

| Estado | Política |
| --- | --- |
| unpaid / draft | cancelamento explícito; CRs PATH B unpaid via `cancelReceivable`; installments `canceled`; financing `canceled`; **sem hard delete**; idempotente |
| partial (pago efetivo > 0 e saldo > 0) | `PARTIALLY_PAID_CANCEL_REQUIRES_PRODUCT_DECISION` — **não engolido** |
| fully paid | `FINANCING_PAID_OFF_CANCEL_DENIED`; histórico preservado |

Sem writer `deleteFinancing`.

---

## 19. Budget HISTORICO/CANCELADO

```
BUDGET_HISTORICO_FINANCING_EFFECT = NONE
BUDGET_CANCELADO_PRE_APPROVAL_EFFECT = CANCEL_DRAFT_FINANCING
BUDGET_CANCELADO_POST_APPROVAL_EFFECT = PRESERVE_MATERIALIZED_OBLIGATION
```

`createNewBudgetForAppointment` continua sem tocar financings.  
`cancelApprovedBudgetWithFinance` **não** lança mais `FINANCING_LIFECYCLE_DEFERRED`. Pré-aprovação (sem CRs PATH B): cancela o draft. Pós-aprovação: orçamento pode ir a `CANCELADO` sem apagar a obrigação já materializada.

---

## 20. RBAC

```
UI IS NOT AUTHORITY. Writer reautoriza. Missing/unknown = DENY.
```

Writers PATH B tocados saíram de `finance:write`:

| Writer | Permission |
| --- | --- |
| create (manual) | `financeiro_financiamentos:create` |
| create (clinical) | `prontuario_orcamentos:approve` **ou** `financeiro_financiamentos:create` |
| approve / reject | `financeiro_financiamentos:approve` |
| cancel | `financeiro_financiamentos:cancel` |
| generateBoletoCarne / renegotiate | `financeiro_financiamentos:edit` |
| registerFinancingPayment | `financeiro_contas_receber:edit` (11.C) |

Role `financeiro` recebeu o catálogo `financeiro_financiamentos`: `view, create, edit, approve, cancel`.

**Deferred (não PATH B núcleo):** `runBoletoReminderRule` e `createReceivableCharge` ainda usam `finance:write`. Boleto auto-generate na aprovação é best-effort: falha de permissão de boleto **não** desfaz obrigação já materializada.

---

## 21. Cross-Tenant

Create com patient de outra clínica: `TENANT_MISMATCH`.  
Approve/cancel de financing B com sessão A: `TENANT_MISMATCH`.  
`listFinancings({ user })` / `getFinancingsKPIs({ user })` filtram pelo tenant da sessão. UI passou a enviar `user`; a UI **não** é autoridade.

---

## 22. Hard Delete Audit

```
FINANCING_HARD_DELETE_PATHS = NONE
PAYMENT_HARD_DELETE_PATHS = NONE
```

Cancelamento é status. Pagamentos 11.C permanecem fatos.

---

## 23. Reports/KPI

`getFinancingsKPIs(filters)` agora reusa `listFinancings(filters)`. Com `user`, KPIs não misturam tenant. Totais de paid/open na listagem vêm da reconciliação canônica quando há CRs.

---

## 24. Tests

Arquivo: `src/__tests__/phase11eFinancingLifecycleTenantIntegrity.test.js`

| Test | Result |
| --- | --- |
| T1 create + tenant_id | PASS |
| T2 create retry mesmo budget | PASS |
| T3 budgets distintos mesmos valores | PASS |
| T4 cross-tenant create DENY | PASS |
| T5 budget ownership mismatch DENY | PASS |
| T6 first approve → 5 CRs PATH B | PASS |
| T7 approve retry → 0 extra | PASS |
| T8 fault → não APPROVED incompleto; retry completa | PASS |
| T9 soma parcelas + entrada | PASS |
| T10 splitInCents 1000/3 | PASS |
| T11 entry inválida | PASS |
| T12 entry_received_now retry 1 payment | PASS |
| T13 partial paid/status | PASS |
| T14 paid_off | PASS |
| T15 reversal reconcilia financing | PASS |
| T16 cancel unpaid sem hard delete | PASS |
| T17 cancel partial FAIL CLOSED | PASS |
| T18 paid preserved | PASS |
| T19 budget HISTORICO none | PASS |
| T20 CANCELADO pré-aprovação cancela draft | PASS |
| T21 CANCELADO pós-aprovação preserva obrigação | PASS |
| T22 list tenant A ≠ B | PASS |
| T23 writer cross-tenant DENY | PASS |
| T24 legado deriva do patient | PASS |
| T25 unknown ownership FAIL CLOSED | PASS |
| T26 RBAC create | PASS |
| T27 RBAC approve | PASS |
| T28 RBAC cancel | PASS |
| T29 unknown permission DENY | PASS |
| T30 11.B | PASS |
| T31 11.C | PASS |
| T32 11.D | PASS |
| T33 contracts none | PASS |

`financing.test.js` (3) = PASS.

---

## 25. Regression

```
PHASE_11.B = PASS
PHASE_11.C = PASS
PHASE_11.D = PASS
PAYMENT_IDEMPOTENCY = PASS
REVERSAL_IDEMPOTENCY = PASS
RECEIVABLE_CREATION_IDEMPOTENCY = PASS
AUTOMATIC_FINANCIAL_SIDE_EFFECTS_FROM_CONTRACTS = NONE
```

Lote executado: phase11b, phase11c, phase11d, finance, financing, financeAuditServices, dashboardMetrics, permissions, tenantIsolation, fullBudgetContractFlow, 10.23E, 10.23F, 10.23I, financialWritePrimary, financialReadCutover — **154 tests PASS** (além dos 33 da 11.E + 3 financing).

`TYPECHECK_NEW_11E_FAILURES = NONE` (nenhum erro tsc nos arquivos 11.E). Dívida histórica `repositories`/CRM **não** reaberta.

---

## 26. Deferred Risks

- `runBoletoReminderRule` / `createReceivableCharge` / `boletoChargesService` ainda `finance:write` (catálogo de boleto fora do núcleo PATH B).
- Boundary transacional IndexedDB do loop de `createReceivable` não é um único `withDb`; mitigado por identidade + retry (T8).
- `listReceivables` ainda tolera legado sem `tenant_id` na listagem (dívida 11.B; **não** reproduzida em `listFinancings`).
- Partial cancel / refund / crédito: produto ainda não definiu política — FAIL CLOSED permanece.
- Sem backfill de `tenant_id` em financings históricos.

Nenhum desses é P0 em **novas escritas** PATH B.

---

## 27. Gate

```
PHASE_11E_GATE = FINANCING_LIFECYCLE_TENANT_SAFE
PHASE_11E_STATUS = PASS_WITH_NOTES
```

Os 21 critérios do gate final estão atendidos para novas escritas. Notes: boleto catalog `finance:write`; boundary IndexedDB multi-`withDb` mitigada por idempotência.

---

## 41. Métricas obrigatórias

```
PHASE_11E_STATUS = PASS_WITH_NOTES

BASELINE_HEAD = 5a0f60d
FINAL_HEAD = (após commit)

FINANCING_SSOT = INDEXEDDB_LEGACY_SERVICES
FINANCING_TENANT_FIELD = tenant_id
INDEXEDDB_SCHEMA_CHANGE_REQUIRED = NO

LEGACY_FINANCING_WRITE_POLICY = DERIVE_FROM_BUDGET_OR_PATIENT_OR_FAIL_CLOSED

FINANCING_TENANT_BOUND = PASS
CROSS_TENANT_FINANCING = BLOCKED

FINANCING_IDENTITY = tenant_id + origin_type=financing + origin_id=financing.id + installment_number
FINANCING_CREATE_IDEMPOTENCY = PASS
FINANCING_APPROVAL_IDEMPOTENCY = PASS

APPROVAL_RETRY_ADDITIONAL_RECEIVABLES = 0

FINANCING_BUDGET_BINDING = PASS
FINANCING_PATIENT_BINDING = PASS

FINANCINGS_ALLOWED_PER_BUDGET = 1

INSTALLMENT_MODEL = financingInstallments + receivables PATH B (entry receivable-only n=0)
INSTALLMENT_SUM_RECONCILIATION = PASS
FINANCING_ROUNDING = PASS

ENTRY_MODEL = receivable origin_type=financing installment_number=0
ENTRY_RECEIVED_NOW_IDEMPOTENCY = PASS

FINANCING_RECONCILIATION_SOURCE = receivables/payments (reconcileFinancingFromReceivables)
PARTIAL_FINANCING = PASS
FULL_FINANCING = PASS
REVERSAL_FINANCING_RECONCILIATION = PASS

BUDGET_HISTORICO_FINANCING_EFFECT = NONE
BUDGET_CANCELADO_PRE_APPROVAL_EFFECT = CANCEL_DRAFT_FINANCING
BUDGET_CANCELADO_POST_APPROVAL_EFFECT = PRESERVE_MATERIALIZED_OBLIGATION

FINANCING_PARTIAL_CANCEL_POLICY = FAIL_CLOSED_REQUIRES_PRODUCT_DECISION
FULLY_PAID_FINANCING_PRESERVED = PASS

FINANCING_CREATE_PERMISSION = financeiro_financiamentos:create
FINANCING_APPROVE_PERMISSION = financeiro_financiamentos:approve
FINANCING_CANCEL_PERMISSION = financeiro_financiamentos:cancel

FINANCING_RBAC_FAIL_CLOSED = PASS

FINANCING_HARD_DELETE_PATHS = NONE

LIST_FINANCINGS_TENANT_FILTER = PASS

PAYMENT_IDEMPOTENCY_REGRESSION = PASS
PAYMENT_REVERSAL_REGRESSION = PASS
RECEIVABLE_LIFECYCLE_REGRESSION = PASS
RECEIVABLE_CREATION_REGRESSION = PASS

AUTOMATIC_FINANCIAL_SIDE_EFFECTS_FROM_CONTRACTS = NONE

MONEY_STORAGE_MODEL_CHANGE = NONE
SUPABASE_CUTOVER = NO
MIGRATION_APPLIED = NO
BACKFILL_APPLIED = NO
HISTORICAL_FINANCINGS_CHANGED = NO

TYPECHECK_NEW_11E_FAILURES = NONE

TESTS_ADDED = 33
TESTS_PASS = 33 (11.E) + 3 (financing.test) + 154 (lote regressão)
TESTS_FAIL = 0

P0_FIXED = tenant_id em novas escritas; approve fail-closed; create/approve idempotentes; entry_received_now com operation_id 11.C; reconciliação canônica incluindo entrada; cancel unpaid/partial/paid; HISTORICO none; CANCELADO pós-aprovação não apaga obrigação; RBAC canônico PATH B; list tenant filter
P0_DEFERRED = boleto catalog finance:write; createReceivableCharge finance:write; listReceivables legado unowned (11.B); refund/crédito de partial cancel

PRODUCTION_CHANGED = NO
```
