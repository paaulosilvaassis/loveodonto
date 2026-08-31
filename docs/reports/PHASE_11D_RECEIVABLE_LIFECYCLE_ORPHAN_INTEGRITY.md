# PHASE 11.D — RECEIVABLE LIFECYCLE, BUDGET CANCELLATION & ORPHAN INTEGRITY

**Modo:** HARDENING RECEIVABLE LIFECYCLE (IndexedDB SSOT)  
**Data:** 2026-08-31  
**PHASE_11.B:** PASS (`58d72ed`) — regressão PATH A continua PASS  
**PHASE_11.C:** PASS_WITH_NOTES (`d0eb1ed`) — pagamento/estorno/reconciliação continua PASS  
**PRODUCTION_CHANGED = NO** · **MIGRATION_APPLIED = NO** · **BACKFILL_APPLIED = NO** · **SUPABASE_CUTOVER = NO**

Nenhum PII. Nenhum secret. Sem deploy. Sem Phase 11.E.

---

## 1. Executive Summary

Orçamento e obrigação financeira deixaram de ser a mesma coisa. `HISTORICO` é **versão substituída** e **não** cancela título. Cancelamento financeiro é uma cerimônia explícita (`cancelReceivable` / `cancelApprovedBudgetWithFinance`): unpaid PATH A vira `canceled`, paid permanece liquidado, parcialmente pago é **FAIL CLOSED**.

Novo ciclo cria Budget B com identidade 11.B própria. Receivable A não é reutilizado nem apagado. Título cancelado não aceita pagamento novo; estorno de fato histórico continua possível. Pagamentos nunca são hard-deleted.

---

## 2. Baseline

```
BRANCH = main
CURRENT_HEAD (antes) = d0eb1ed58b1cae3ef339a4000501e823fad2dd33
EXPECTED_BASELINE = d0eb1ed
DELTA_FROM_BASELINE_BEFORE_11D = leftovers SMTP/patient-email (não staged)
```

---

## 3. Lifecycle Before

```
PHASE11D_RECEIVABLE_LIFECYCLE_BEFORE =

APROVADO
  → createReceivablesFromApprovedBudget (PATH A) / financing (PATH B)
  → receivables ativos cobráveis

createNewBudgetForAppointment
  → budget atual vira HISTORICO
  → receivables NÃO tocados  (órfãos operacionais, origem ainda no history)

BUDGET CANCELADO
  → status existe no catálogo
  → NENHUM writer de produção gravava CANCELADO
  → updateBudgetStatus bloqueado por lock se já há financeiro

cancelReceivable (FinanceReceivablesPage / cancelFinancing / renegotiate)
  → status canceled
  → bloqueava PAID
  → PERMITIA parcialmente pago (pagamentos ficavam, título some da cobrança)
  → finance:write
  → sem tenant
  → não idempotente (reatrava canceled_at)
```

**PAYMENT STATE:** 11.C — pagamentos efetivos reconciliam saldo; título `canceled` já negava novo payment.

---

## 4. Budget Status Semantics

| STATUS | SIGNIFICADO PROVADO | EFEITO FINANCEIRO 11.D |
| --- | --- | --- |
| RASCUNHO / ENVIADO / NEGOCIACAO | negociação | NONE |
| APROVADO | materializa PATH A ou B | criação (11.B) |
| CONTRATO_GERADO | contrato, não financeiro | NONE (contratos sem side-effect) |
| HISTORICO | versão arquivada por novo ciclo | **NONE** |
| REPROVADO | recusa comercial (UI) | NONE |
| CANCELADO | status latente; agora cerimônia explícita | unpaid PATH A → cancel receivable; paid preserve; partial FAIL CLOSED; PATH B FAIL CLOSED |

---

## 5. Receivable Status Semantics

```
RECEIVABLE_STATUS_MATRIX_BEFORE/AFTER =

pending | due_today | upcoming | overdue | partially_paid
  CAN_RECEIVE_PAYMENT = YES
  CAN_CANCEL (unpaid) = YES
  CAN_CANCEL (partial) = FAIL CLOSED
  CAN_REOPEN = NO (não inventado)

paid
  CAN_RECEIVE_PAYMENT = overpay blocked (11.C)
  CAN_CANCEL = NO (exige estorno)
  CAN_REOPEN = NO

canceled
  CAN_RECEIVE_PAYMENT = NO
  CAN_CANCEL = idempotent no-op
  CAN_REVERSE_EXISTING = YES (distinto de receber)

renegotiated
  CAN_RECEIVE_PAYMENT = NO
```

Payment status (11.C): `applied | reversed`; kind `payment | reversal`.

Financing status: inalterado nesta fase.

---

## 6. Budget → Receivable Transition Matrix

| BUDGET | RECEIVABLE | PAID | NEW PAYMENT | REVERSAL | FINANCIAL_EFFECT |
| --- | --- | --- | --- | --- | --- |
| APROVADO | unpaid | 0 | YES | n/a | cobrança ativa |
| APROVADO | partial | >0 | YES até saldo | YES | cobrança ativa |
| APROVADO | paid | full | NO (overpay) | YES | liquidado |
| HISTORICO | unpaid | 0 | YES | n/a | **NONE** — continua cobrável até cancel explícito |
| HISTORICO | partial | >0 | YES | YES | **NONE** |
| HISTORICO | paid | full | NO | YES | **NONE** — receita preservada |
| CANCELADO | unpaid | 0 | NO | n/a | cancel financeiro explícito |
| CANCELADO | partial | >0 | (não chega) | YES se já existia | **REQUIRES_PRODUCT_DECISION** — FAIL CLOSED |
| CANCELADO | paid | full | NO | YES | título **permanece paid**; budget pode CANCELADO |

RASCUNHO→APROVADO: FINANCIAL_EFFECT_REQUIRED = PATH A create (11.B).  
APROVADO→HISTORICO: FINANCIAL_EFFECT_FORBIDDEN = mutate/delete receivable.  
APROVADO→CANCELADO: FINANCIAL_EFFECT_REQUIRED = cancel unpaid PATH A via writer dedicado.

---

## 7. Files Changed

**Novos**

- `src/services/receivableObligationLifecycle.js` — `cancelReceivable` canônico
- `src/services/clinicalBudgetReceivableLifecycle.js` — `cancelApprovedBudgetWithFinance`
- `src/services/receivableOrphanIntegrity.js` — detector (não muta)
- `src/__tests__/phase11dReceivableLifecycleOrphanIntegrity.test.js`
- `docs/reports/PHASE_11D_RECEIVABLE_LIFECYCLE_ORPHAN_INTEGRITY.md`

**Alterados**

- `src/services/receivablesService.js` — reexport cancel; update RBAC/tenant/origem imutável; KPI exclui canceled
- `src/services/receivablePaymentLifecycle.js` — `assertReceivableCollectible`
- `src/services/receivableReconciliation.js` — helpers collectible/open
- `src/permissions/catalog.js` / `roleDefaults.js` — action `cancel`
- `src/pages/FinanceReceivablesPage.jsx` — botão cancel gated

---

## 8. Cancellation Model

Soft status `canceled`. Sem delete. Sem mexer em payment/received_amount.

Idempotente: segundo cancel devolve o mesmo `canceled_at`/`reason`.

Audit: `canceled_by`, `canceled_reason`, domain event `RECEIVABLE_UPDATED` só na primeira transição.

```
RECEIVABLE_LIFECYCLE_MODEL = BUDGET_VERSION_SEPARATE_FROM_OBLIGATION
BUDGET_CANCELADO_FINANCIAL_EFFECT = CANCEL_UNPAID_PATH_A_OR_FAIL_CLOSED
```

---

## 9. Historical Budget Model

`createNewBudgetForAppointment` continua só arquivando. **Não** tocamos receivables.

```
BUDGET_HISTORICO_FINANCIAL_EFFECT = NONE
```

---

## 10. Partial Payment Cancellation Policy

```
PARTIALLY_PAID_RECEIVABLE_CANCEL_POLICY = FAIL_CLOSED_REQUIRES_PRODUCT_DECISION
```

Não inventamos refund, crédito, baixa de saldo nem auto-estorno. Pagamento permanece.

---

## 11. Paid Receivable Preservation

Cancel de título `paid` continua bloqueado. Cancel de **orçamento** com título pago: budget → CANCELADO, receivable permanece `paid`, payments intactos.

---

## 12. New Budget Cycle

Budget A → HISTORICO. Budget B novo `id`. Aprovação B usa identidade 11.B (`origin_id = B.id`). Receivable A não é copiado.

```
NEW_BUDGET_REUSES_OLD_RECEIVABLE = NO
NEW_BUDGET_CYCLE_ORPHAN_CREATION = BLOCKED
```

Unpaid de A em HISTORICO permanece cobrável até cancel explícito (`operational_detach` no detector — não é órfão de origem).

---

## 13. Orphan Prevention

Detector `inspectReceivableIntegrity`:

- `missing_origin_budget` = órfão verdadeiro
- `collectible_on_cancelled_budget`
- `operational_detach_historical_budget` (informativo)
- `unowned_tenant` / `legacy_tenant_derivable`
- mismatch pagamento/status

Não corrige histórico. Não cancela em massa.

```
ORPHAN_RECEIVABLE_PATHS_NEW_WRITES = NONE
HISTORICAL_ORPHANS_CHANGED = NO
HISTORICAL_ORPHANS_DETECTED = UNKNOWN
```

---

## 14. RBAC

```
RECEIVABLE_CANCEL_PERMISSION_BEFORE = finance:write
RECEIVABLE_CANCEL_PERMISSION_AFTER  = financeiro_contas_receber:cancel
RECEIVABLE_UPDATE_PERMISSION_BEFORE = finance:write
RECEIVABLE_UPDATE_PERMISSION_AFTER  = financeiro_contas_receber:edit
```

Action `cancel` já existia em `ACTION_KEYS` (boletos/financiamentos). Adicionada a `financeiro_contas_receber`. Role `financeiro` recebe. UI esconde; writer nega.

`createReceivableCharge` permanece `finance:write` (fora do gate de lifecycle do título).

---

## 15. Tenant Isolation

Cancel e update revalidam `assertReceivableWriteOwnership` (11.C). Tenant A não cancela/edita B.

---

## 16. Legacy Tenant Policy

```
LEGACY_RECEIVABLE_WRITE_POLICY = DERIVE_FROM_PATIENT_OR_FAIL_CLOSED
```

Sem backfill. `listReceivables` ainda mostra linhas sem `tenant_id` (dívida 11.B de leitura).

---

## 17. Payment Writer Guard

`assertReceivableCollectible`: `canceled` e `renegotiated` negam **novo** pagamento. Chamada direta testada (T2).

---

## 18. Reversal Compatibility

Estorno **não** exige título cobrável. T15: título canceled (legado/simulado) + payment histórico → reverse PASS; novo payment DENY.

```
REVERSAL_AFTER_RECEIVABLE_CANCEL = PASS
```

---

## 19. Reports/KPI

`getReceivablesKPIs` ignora `canceled`/`renegotiated` no aberto. `paid` continua em `totalReceived` mesmo se o orçamento virou HISTORICO.

Aba `a_receber` já excluía `canceled`. Dashboard/DRE/comissão já filtram payments efetivos (11.C).

```
CANCELLED_RECEIVABLE_OPEN_KPI = EXCLUDED
HISTORICAL_PAID_RECEIVABLE_RECEIVED_KPI = PRESERVED
```

Listagem legado sem `tenant_id` ainda pode entrar em agregado se o filtro tenant estiver ativo (P1 leitura, não reconstruído).

---

## 20. Audit Trail

Cancel: `canceled_by`, `canceled_at`, `canceled_reason`, from→to via domain event. Sem ledger novo.

Reopen: **não existe**.

---

## 21. Tests

Arquivo: `src/__tests__/phase11dReceivableLifecycleOrphanIntegrity.test.js` — T1–T24 **PASS** (24).

Regressões: 11.B (16), 11.C (26), finance, financing, audit, domain events, dashboard, permissions, tenant, budget/contract, 10.23E/F/I, cutover — **PASS** (175 testes no lote).

---

## 22. Regression

```
PAYMENT_IDEMPOTENCY_REGRESSION = PASS
PAYMENT_REVERSAL_REGRESSION = PASS
RECEIVABLE_CREATION_IDEMPOTENCY_REGRESSION = PASS
PATH_B_REGRESSION = PASS
AUTOMATIC_FINANCIAL_SIDE_EFFECTS_FROM_CONTRACTS = NONE
TYPECHECK_NEW_11D_FAILURES = NONE
```

PATH B `cancelFinancing` ainda engole erro de `cancelReceivable` (pré-existente). Não improvisamos financing lifecycle.

---

## 23. Deferred Risks

- Partial + cancel: decisão de produto (refund/crédito/baixa)
- `listReceivables` legado sem `tenant_id`
- `FINANCING_TENANT_SCHEMA_GAP = YES`
- PATH B + budget cancel: FAIL CLOSED nesta fase
- Unpaid cobrável após HISTORICO até cancel explícito (by design)
- `createReceivableCharge` ainda `finance:write`
- Sem reopen

---

## 24. Gate

```
PHASE_11D_GATE = RECEIVABLE_LIFECYCLE_INTEGRITY
PHASE_11D_STATUS = PASS_WITH_NOTES
```

Critérios 1–17: PASS. Notes = fail-closed de parcial + dívidas 11.B/PATH B não improvisadas.

---

## Métricas

```
PHASE_11D_STATUS = PASS_WITH_NOTES

BASELINE_HEAD = d0eb1ed
FINAL_HEAD = (commit 11.D)

RECEIVABLE_LIFECYCLE_MODEL = BUDGET_VERSION_SEPARATE_FROM_OBLIGATION

BUDGET_HISTORICO_FINANCIAL_EFFECT = NONE
BUDGET_CANCELADO_FINANCIAL_EFFECT = CANCEL_UNPAID_PATH_A_OR_FAIL_CLOSED

UNPAID_RECEIVABLE_CANCEL_FLOW = PASS
PARTIALLY_PAID_RECEIVABLE_CANCEL_POLICY = FAIL_CLOSED_REQUIRES_PRODUCT_DECISION
FULLY_PAID_RECEIVABLE_PRESERVED = PASS

RECEIVABLE_CANCEL_IDEMPOTENCY = PASS

CANCELLED_RECEIVABLE_ACCEPTS_NEW_PAYMENT = NO

REVERSAL_AFTER_RECEIVABLE_CANCEL = PASS

NEW_BUDGET_CYCLE_ORPHAN_CREATION = BLOCKED
NEW_BUDGET_REUSES_OLD_RECEIVABLE = NO
ORPHAN_RECEIVABLE_PATHS_NEW_WRITES = NONE

HISTORICAL_ORPHANS_DETECTED = UNKNOWN
HISTORICAL_ORPHANS_CHANGED = NO

RECEIVABLE_CANCEL_PERMISSION_BEFORE = finance:write
RECEIVABLE_CANCEL_PERMISSION_AFTER = financeiro_contas_receber:cancel
RECEIVABLE_UPDATE_PERMISSION_BEFORE = finance:write
RECEIVABLE_UPDATE_PERMISSION_AFTER = financeiro_contas_receber:edit

RECEIVABLE_RBAC_FAIL_CLOSED = PASS

RECEIVABLE_TENANT_BOUNDARY = PASS
CROSS_TENANT_RECEIVABLE_CANCEL = BLOCKED

LEGACY_RECEIVABLE_WRITE_POLICY = DERIVE_FROM_PATIENT_OR_FAIL_CLOSED

CANCELLED_RECEIVABLE_OPEN_KPI = EXCLUDED
HISTORICAL_PAID_RECEIVABLE_RECEIVED_KPI = PRESERVED

PAYMENT_IDEMPOTENCY_REGRESSION = PASS
PAYMENT_REVERSAL_REGRESSION = PASS
RECEIVABLE_CREATION_IDEMPOTENCY_REGRESSION = PASS

PATH_B_REGRESSION = PASS

FINANCING_TENANT_SCHEMA_GAP = YES

AUTOMATIC_FINANCIAL_SIDE_EFFECTS_FROM_CONTRACTS = NONE

PAYMENT_HARD_DELETE_PATHS = NONE
RECEIVABLE_HARD_DELETE_PATHS = NONE

MONEY_MODEL_CHANGE = NONE
SUPABASE_CUTOVER = NO
MIGRATION_APPLIED = NO
BACKFILL_APPLIED = NO

HISTORICAL_RECEIVABLES_CHANGED = NO
HISTORICAL_PAYMENTS_CHANGED = NO
HISTORICAL_BUDGETS_CHANGED = NO

TYPECHECK_NEW_11D_FAILURES = NONE

TESTS_ADDED = 24
TESTS_PASS = 24 (11.D) + regressões do lote
TESTS_FAIL = 0

P0_FIXED = budget HISTORICO no longer confused with financial cancel; unpaid cancel explicit; cancelled not payable; paid preserved; new cycle identity isolation; RBAC/tenant on cancel/update
P0_DEFERRED = partial-pay cancel product decision; listReceivables legacy unowned visibility; financing tenant_id; PATH B financing cancel lifecycle

PRODUCTION_CHANGED = NO
```
