# PHASE 11.C — PAYMENT LIFECYCLE, IDEMPOTENCY, REVERSAL & RECONCILIATION

**Modo:** HARDENING PAYMENT LIFECYCLE (IndexedDB SSOT)  
**Data:** 2026-08-31  
**PHASE_10.23:** CLOSED (`be054ba`) — não reaberta  
**PHASE_11.A:** PASS_WITH_FINDINGS — não reexecutada como auditoria  
**PHASE_11.B:** PASS (`58d72ed`) — não reaberta; regressão PATH A continua PASS  
**PRODUCTION_CHANGED = NO** · **MIGRATION_APPLIED = NO** · **BACKFILL_APPLIED = NO** · **SUPABASE_CUTOVER = NO**

Nenhum PII. Nenhum secret. Sem deploy. Sem Phase 11.D.

---

## 1. Executive Summary

O lifecycle de pagamento do Love Odonto deixou de ser um bump silencioso de `received_amount`. Pagamento agora tem **identidade de operação** (`operation_id`), **idempotência no writer**, **tenant binding fail-closed**, **RBAC canônico** e **reconciliação única** de saldo/status a partir dos pagamentos efetivos.

Retry e duplo clique com a mesma operação **não duplicam** efeito financeiro. Dois pagamentos legítimos do mesmo valor, com `operation_id` distintos, **continuam dois pagamentos**. Estorno é um **novo fato** (`kind: reversal`); o pagamento original permanece. Estorno de pagamento total **reabre** o título (o bug 11.A de “permanecer pago” desaparece).

Caixa permanece desacoplado: CR payment **não** cria `cashTransactions`. `FINANCING_TENANT_SCHEMA_GAP` e a tolerância de `listReceivables` a linhas legado sem `tenant_id` **não** foram improvisadas nesta fase.

---

## 2. Baseline

```
BRANCH = main
CURRENT_HEAD (antes) = 58d72edd81615b5e7a74d3f1a45f06dbb088c6f8
EXPECTED_BASELINE = 58d72ed
DELTA_FROM_BASELINE_BEFORE_11C = leftovers SMTP/patient-email (não staged)
```

Nenhum `git reset` / `clean` / `restore`. Leftovers SMTP/patient-email **não** foram staged.

```
FINANCIAL_SSOT = INDEXEDDB_LEGACY_SERVICES
RECEIVABLE_SSOT = accountsReceivable
PAYMENT_SSOT = receivablePayments
```

---

## 3. Payment Flow Before

Provado pelo código (não assumido):

```
PHASE11C_PAYMENT_FLOW_BEFORE =

UI FinanceReceivablesPage.handleSubmitPayment
  / handleOpenPayment (DollarSign)
  / create-flow entryReceivedNow
  / registerFinancingPayment
  / approveFinancing entry_received_now
→ registerReceivablePayment (receivablesService — THE writer)
→ receivablePayments.push
→ bump accountsReceivable.received_amount  (Math.max(net - newReceived, 0))
→ refreshFinancingFromReceivable (se financing_id)
→ computeReceivableStatus
→ schedulePaymentReceivedDomainEvent
```

**Reversal before:** somente `reverseFinancingPaymentAudit` → `reverseAllocationsByReceivablePayment`. Marcava `financingPaymentAllocations` como `REVERSED` **sem** reabrir `received_amount` / `status` do título. Esse era o P0 (“estorno deixa título pago”).

**Não existia** writer de estorno de CR. **Não existia** hard-delete de pagamento.

**Caixa:** comentário e código do writer antigo não gravavam `cashTransactions`. `CASH_PAYMENT_COUPLING = NONE`.

**Overpayment before:** clamp silencioso de `remaining_amount` podia deixar `received_amount` acima do líquido.

**Idempotência before:** `PAYMENT_IDEMPOTENCY = NONE`.

---

## 4. Writers Audited

| WRITER | PERMISSION (antes → depois) | TENANT | RECEIVABLE | PATIENT | IDEMPOTENCY | AUDIT | SIDE_EFFECTS |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `registerReceivablePayment` | `finance:write` (11.A) / canônico 11.B no PATH A create; **pagamento ainda `finance:write` no início da 11.C** → `financeiro_contas_receber:edit` | activeTenant + receivable.tenant_id; legado deriva de patient ou FAIL CLOSED | título existe; não cancelado; overpay bloqueado | se payload traz `patient_id`, deve bater | `tenant_id + operation_id` na mesma `withDb` | `created_by` / `created_at`; domain event se não replay | reconcilia receivable; refresh financing installment; **não** caixa |
| `reverseReceivablePayment` | **não existia** → `financeiro_contas_receber:reverse` | mesmo ownership + payment.tenant_id | título do payment original | n/a | `operation_id` ou `revop:{original.id}` | original marcado `reversed`; row `kind=reversal`; `reversed_by` | reconcilia; `reverseAllocationsByReceivablePayment` após `withDb` |
| `registerFinancingPayment` | `finance:write` → `financeiro_contas_receber:edit` | via writer de pagamento | parcela/`receivable_id` | n/a | passa `operation_id`; **early-return se `replayed`** | timeline PATH B | allocation PATH B (não no retry) |
| `reverseFinancingPaymentAudit` | sem CR reverse → delega `reverseReceivablePayment` | via reverse writer | via payment | n/a | passa `operation_id` | timeline `PAYMENT_REVERSED` | lista allocations já `REVERSED` |
| `updateReceivable` | `finance:write` (**não alterado**) | sem hardening 11.C | edita metadados/valores; **não** cria payment | payload patient opcional | n/a | domain event update | remaining a partir de `received_amount` persistido |
| `cancelReceivable` | `finance:write` (**não alterado**) | sem hardening 11.C | bloqueia se `paid` | n/a | n/a | canceled_* | refresh financing |
| `createReceivableCharge` | `finance:write` (**não alterado**) | fora de 11.C | cobrança, não payment | n/a | n/a | charge events | n/a |

`deletePayable` não toca CR/payment. **PAYMENT_HARD_DELETE_PATHS = NONE**.

---

## 5. Files Changed

**Novos**

- `src/services/receivableMoney.js` — `toCents` / `fromCents` / `assertFiniteMoney` (cálculo; storage continua FLOAT_BRL)
- `src/services/receivableReconciliation.js` — reconciliação canônica + `computeReceivableStatus` + `refreshFinancingFromReceivable`
- `src/services/receivablePaymentLifecycle.js` — writers de receber/estornar
- `src/__tests__/phase11cPaymentLifecycleReconciliation.test.js` — T1–T25 + matriz
- `docs/reports/PHASE_11C_PAYMENT_LIFECYCLE_RECONCILIATION.md`

**Alterados**

- `src/services/receivablesService.js` — reexporta lifecycle; remove corpo antigo de `registerReceivablePayment`
- `src/services/financingsService.js` — permission canônica; `operation_id`; replay early-return; reverse delega ao writer CR
- `src/permissions/catalog.js` — `financeiro_contas_receber` ganha action `reverse` (já existia em `ACTION_KEYS` / caixa)
- `src/permissions/roleDefaults.js` — role `financeiro` recebe `financeiro_contas_receber:reverse`
- `src/pages/FinanceReceivablesPage.jsx` — `operationId` na cerimônia RECEBER; botão Estornar no detalhe
- `src/services/dashboardMetricsService.js`
- `src/services/financeDreCashLiquidityService.js`
- `src/services/commissionCalculationService.js` — ignoram pagamentos não efetivos (`isEffectiveReceivablePayment`)

IndexedDB: **sem** bump de `DB_VERSION`. Campos novos em objetos de pagamento são opcionais; `TENANT_GUARDED_COLLECTIONS` já inclui `receivablePayments`.

---

## 6. Payment Identity

```
PAYMENT_IDENTITY = tenant_id + operation_id
```

A UI de RECEBER gera `operationId = createId('payop')` ao **abrir** o modal e envia o mesmo valor em retries/duplo clique enquanto o modal permanece.

O writer **não** deduplica por `receivableId + amount`. Dois pagamentos de R$ 100 com `operation_id` distintos são duas operações.

Se o caller não envia `operation_id` / `idempotencyKey`, o writer gera `createId('payop')` **por chamada**. Isso **não** é retroativo e **não** protege callers legado contra retry.

```
LEGACY_PAYMENT_IDEMPOTENCY = NOT_RETROACTIVE
```

Estorno: `payload.operation_id` ou identidade estável `revop:{originalPaymentId}`.

---

## 7. Idempotency

Lookup **dentro da mesma `withDb`**: `tenant_id + operation_id`.

- Primeira chamada: cria payment + reconcilia.
- Segunda chamada (retry / duplo clique / resposta incerta): `replayed: true`, devolve o payment já materializado, **zero** efeito adicional, **sem** domain event.

`registerFinancingPayment` retorna cedo se `result.replayed` para não criar segunda allocation PATH B.

Duplo clique na mesma aba é sequencial (`withDb` síncrono). Check + create ocorrem no mesmo mutator.

---

## 8. Tenant Binding

Antes de pagar/estornar:

1. `requireSessionTenantId`
2. se `receivable.tenant_id` existe → `assertSameTenant`
3. senão deriva `patient.tenant_id` e compara com a sessão
4. senão `LEGACY_RECEIVABLE_UNOWNED`
5. payload `tenant_id` (se enviado) passa por `resolveTenantIdForWrite`
6. payment persistido com `tenant_id` comprovado (nunca o da sessão “por default” sem prova)

Tenant A pagando receivable Tenant B **por ID**: DENY.

---

## 9. Legacy Tenant Policy

```
LEGACY_RECEIVABLE_WRITE_POLICY = DERIVE_FROM_PATIENT_OR_FAIL_CLOSED
```

Sem backfill. Sem associar automaticamente ao tenant da sessão.

O guard `validateTenantIntegrityOnWrite` **impede** criar CR sem `tenant_id` e **impede** remover `tenant_id` via `withDb`. T6 simula linha histórica mutando o cache (`peekDb`) — o único caminho de teste que não enfraquece o guard. Se o título legado não tem tenant e o paciente também não tem: FAIL CLOSED.

`listReceivables` continua tolerando linhas sem `tenant_id` na **leitura** (dívida 11.B, não improvisada aqui).

---

## 10. RBAC

Catálogo real: action `reverse` já existia em `ACTION_KEYS` (usada em caixa). Foi **adicionada** a `financeiro_contas_receber` de forma controlada.

| Ação | Permission |
| --- | --- |
| Receber | `financeiro_contas_receber:edit` |
| Estornar | `financeiro_contas_receber:reverse` |
| Criar título (11.B PATH A) | `financeiro_contas_receber:create` |

Defaults: role `financeiro` ganha `reverse`. `admin` continua all-access. `dentista` **não** recebe.

UI esconde Estornar sem permission; writer **nega** chamada direta (T8, T19, T20).

`updateReceivable` / `cancelReceivable` / charges ainda usam `finance:write` — **fora** do gate de pagamento; documentado em deferred.

---

## 11. Payment Transaction Boundary

`withDb` clona o DB inteiro, muta e `saveDb` só se o mutator completar. Throw aborta (T21).

Stores tocadas no mutator de pagamento:

- `receivablePayments`
- `accountsReceivable`
- `financingInstallments` / `financings` (via `refreshFinancingFromReceivable`, se houver `financing_id`)

Domain event e `reverseAllocationsByReceivablePayment` correm **depois** de `withDb`. Allocations PATH B no reverse **não** compartilham o mesmo mutator.

```
PAYMENT_ATOMICITY = PARTIAL
```

Pagamento + receivable reconciliado: atômico na `withDb`. Allocation PATH B de estorno: transação seguinte (idempotente se já `REVERSED`).

---

## 12. Reconciliation Model

Função canônica: `reconcileReceivableFromPayments`.

```
VALID_PAYMENTS = receivablePayments do título
                que NÃO são kind=reversal
                e NÃO estão status=reversed / reversed_at

TOTAL_PAID (cents) = SUM(amount_received dos VALID_PAYMENTS)
BALANCE            = max(net_amount - TOTAL_PAID, 0) em cents
STATUS             = computeReceivableStatus(remaining, net, due_date)
```

Pagamentos legado **sem** `kind`/`status`/`operation_id` contam como efetivos (compatibilidade). Não se inventa key retroativa.

Status canônicos existentes (`RECEIVABLE_STATUS`):

`pending | due_today | upcoming | overdue | partially_paid | paid | canceled | renegotiated`

`partially_paid` **já existia**. Reversão de paid volta a `upcoming` / `overdue` / `due_today` / `pending` conforme vencimento — **não** permanece `paid`.

Canceled / renegotiated são preservados pela reconciliação de status.

---

## 13. Partial Payment

1000 → 400: `received_amount=400`, `remaining_amount=600`, `status=partially_paid` (se não vencido). PASS (T9).

---

## 14. Full Payment

400 + 600 = 1000: `remaining_amount=0`, `status=paid`. PASS (T10).

---

## 15. Overpayment

Não há crédito/saldo de paciente no domínio CR. Writer bloqueia se `paidCents + amountCents > netCents`.

1000 → 1100: DENY. Sem saldo negativo silencioso.

```
OVERPAYMENT = BLOCKED
```

---

## 16. Reversal Model

Estorno **não** é hard-delete.

- Original: `status=reversed`, `reversed_at`, `reversed_by`, `reversal_payment_id`, valor/método/data preservados
- Novo fato: `kind=reversal`, `reverses_payment_id`, mesmo `amount_received`

Somente **full reversal do payment** (não estorno parcial de um payment). Produto não tinha partial reverse de um recebimento; **não** foi inventado.

```
REVERSAL_MODEL = FULL_PAYMENT_REVERSAL_AS_NEW_FACT
PAYMENT_ORIGINAL_PRESERVED_ON_REVERSAL = YES
```

---

## 17. Reversal Idempotency

Segunda chamada com a mesma identidade (`revop:{id}` ou `operation_id` explícito) devolve o reversal existente. Se o original já está `reversed`, replay sem novo efeito.

Saldo nunca sobe acima do original por reversal duplicado (T17).

---

## 18. Money/Rounding

```
MONEY_REPRESENTATION = FLOAT_BRL   (storage)
MONEY_CALCULATION_MODEL = INTEGER_CENTS_VIA_receivableMoney
```

PATH B `splitInCents` **não** alterado. 333.33 + 333.33 + 333.34 = 1000.00 exato em cents (T14). Matriz inclui 0.10 + 0.20 = 0.30.

---

## 19. Cash Interaction

```
CASH_PAYMENT_COUPLING = NONE
CASH_IDEMPOTENCY = NOT_APPLICABLE
```

T22: retry de pagamento não cria `cashTransactions`; 1 payment efetivo.

Não redesenhamos caixa.

---

## 20. Report Compatibility

| Superfície | Fonte | Impacto 11.C |
| --- | --- | --- |
| Dashboard / DRE / comissão | `receivablePayments` | passam a ignorar reversal / reversed via `isEffectiveReceivablePayment` |
| Faturamento KPI | `receivable.received_amount` / `remaining_amount` | compatível (campos reconciliados no write) |
| Modal faturamento lista payments | lista crua | pode **exibir** row de estorno (evidência); KPI usa o título |
| Financiamento UI | payments do título | idem — rows de reversal visíveis |

Nenhum KPI foi migrado para uma fórmula nova sem filtro de efetividade onde o somatório era por payment.

---

## 21. Audit Trail

Pagamento: `created_by`, `created_at`, `amount_received`, `payment_method`, `receivable_id`, `tenant_id`, `operation_id`.

Estorno: `created_by` da row reversal, `reversed_by` no original, `reversal_reason` se a UI envia (detalhe CR envia `"Estorno operacional"`; não era campo obrigatório de domínio).

---

## 22. Tests

Arquivo: `src/__tests__/phase11cPaymentLifecycleReconciliation.test.js`

| Test | Result |
| --- | --- |
| T1 first payment | PASS |
| T2 exact retry | PASS |
| T3 double-click | PASS |
| T4 same amount, two operations | PASS |
| T5 cross-tenant DENY | PASS |
| T6 legacy derive / fail-closed | PASS |
| T7 RBAC receive | PASS |
| T8 RBAC deny receive | PASS |
| T9 partial | PASS |
| T10 full paid | PASS |
| T11 overpayment | PASS |
| T12 zero | PASS |
| T13 negative / NaN / Infinity | PASS |
| T14 cents | PASS |
| T15 full reversal reopens | PASS |
| T16 original preserved | PASS |
| T17 reversal idempotency | PASS |
| T18 multi-payment reverse 600 | PASS |
| T19 reverse RBAC deny | PASS |
| T20 direct writer / null user | PASS |
| T21 mid-write fault | PASS |
| T22 cash decoupled + retry | PASS |
| T23 PATH A 11.B | PASS |
| T24 PATH B financing | PASS |
| T25 contracts no side-effects | PASS |
| reconciliation matrix | PASS |

Matriz: 1000/none; 400; 400+600; 1000+full reverse; 400+600 reverse 600; 333.33×2+333.34; 0.30 = 0.10+0.20.

Regressões executadas: 11.B (16), finance, financing, financeAuditServices, financialDomainEventsAdoption, dashboardMetrics, permissions, tenantIsolation, fullBudgetContractFlow, 10.23I, 10.23E, 10.23F, financialWritePrimary, financialReadCutover — **PASS**.

---

## 23. Regression

```
PATH_A_11B_REGRESSION = PASS
PATH_B_REGRESSION = PASS
AUTOMATIC_FINANCIAL_SIDE_EFFECTS_FROM_CONTRACTS = NONE
TYPECHECK_NEW_11C_FAILURES = NONE
```

`tsc -b` permanece com dívida histórica em `repositories` / CRM. Nenhum erro novo em arquivos 11.C.

PATH B: `registerFinancingPayment` ainda soma `paid` a partir do installment **stale** capturado antes do refresh (comportamento pré-existente). Replay early-return impede duplicar allocation. Não “corrigimos” a aritmética PATH B nesta fase.

---

## 24. Deferred Findings

- `listReceivables` ainda mostra linhas legado **sem** `tenant_id` (dívida 11.B de leitura).
- `FINANCING_TENANT_SCHEMA_GAP = YES` — `financings` continua sem `tenant_id`.
- `updateReceivable` / `cancelReceivable` / `createReceivableCharge` / vários writers PATH B ainda usam `finance:write`.
- Create-flow CR (`entryReceivedNow`) e `approveFinancing entry_received_now` **não** passam `operation_id` explícito (writer gera um por chamada).
- Estorno parcial de um único payment: não suportado / não implementado.
- `reverseAllocationsByReceivablePayment` fora da `withDb` do CR.
- Modal de faturamento lista payments crus (incluindo reversal rows).
- Money storage global continua FLOAT_BRL.
- Dual-write / flags `financial_*` continuam OFF.

---

## 25. Gate

```
PHASE_11C_GATE = PAYMENT_LIFECYCLE_RECONCILIABLE
PHASE_11C_STATUS = PASS_WITH_NOTES
```

Critérios 1–20 do prompt: PASS. Notes = dívidas 11.B de leitura/financing + writers não-pagamento ainda em `finance:write` + caixa desacoplado.

---

## Métricas

```
PHASE_11C_STATUS = PASS_WITH_NOTES

BASELINE_HEAD = 58d72ed
FINAL_HEAD = (commit 11.C)

PAYMENT_SSOT = receivablePayments
PAYMENT_IDENTITY = tenant_id + operation_id
PAYMENT_IDEMPOTENCY = PASS

DOUBLE_CLICK_PAYMENT = BLOCKED
EXACT_PAYMENT_RETRY_ADDITIONAL_PAYMENTS = 0

LEGITIMATE_SAME_AMOUNT_MULTIPLE_PAYMENTS = PASS

PAYMENT_TENANT_BOUND = PASS
CROSS_TENANT_PAYMENT = BLOCKED

LEGACY_RECEIVABLE_WRITE_POLICY = DERIVE_FROM_PATIENT_OR_FAIL_CLOSED
LEGACY_PAYMENT_IDEMPOTENCY = NOT_RETROACTIVE

PAYMENT_PERMISSION_BEFORE = finance:write
PAYMENT_PERMISSION_AFTER = financeiro_contas_receber:edit
REVERSAL_PERMISSION = financeiro_contas_receber:reverse

PAYMENT_RBAC_FAIL_CLOSED = PASS
REVERSAL_RBAC_FAIL_CLOSED = PASS

PAYMENT_ATOMICITY = PARTIAL

RECONCILIATION_SOURCE = reconcileReceivableFromPayments(VALID_PAYMENTS)
EFFECTIVE_PAID_CALCULATION = SUM(amount_received) em cents dos payments efetivos (não reversal, não reversed)

PARTIAL_PAYMENT = PASS
FULL_PAYMENT = PASS
OVERPAYMENT = BLOCKED
ZERO_PAYMENT = BLOCKED
NEGATIVE_PAYMENT = BLOCKED

MONEY_CALCULATION_MODEL = INTEGER_CENTS_VIA_receivableMoney
ROUNDING_RECONCILIATION = PASS

REVERSAL_MODEL = FULL_PAYMENT_REVERSAL_AS_NEW_FACT
PAYMENT_ORIGINAL_PRESERVED_ON_REVERSAL = YES
REVERSAL_IDEMPOTENCY = PASS

FULL_PAYMENT_REVERSAL_REOPENS_RECEIVABLE = PASS
MULTI_PAYMENT_REVERSAL_RECONCILIATION = PASS

PAYMENT_HARD_DELETE_PATHS = NONE

CASH_PAYMENT_COUPLING = NONE
CASH_IDEMPOTENCY = NOT_APPLICABLE

PATH_A_11B_REGRESSION = PASS
PATH_B_REGRESSION = PASS

AUTOMATIC_FINANCIAL_SIDE_EFFECTS_FROM_CONTRACTS = NONE

FINANCING_TENANT_SCHEMA_GAP = YES

SUPABASE_CUTOVER = NO
MIGRATION_APPLIED = NO
BACKFILL_APPLIED = NO
HISTORICAL_PAYMENTS_REWRITTEN = NO

TYPECHECK_NEW_11C_FAILURES = NONE

TESTS_ADDED = 26
TESTS_PASS = 26 (11.C) + regressões listadas
TESTS_FAIL = 0

P0_FIXED = duplicate payment via retry/double-click; reversal leaving receivable paid; silent overpayment clamp; payment writer finance:write
P0_DEFERRED = listReceivables legacy unowned visibility; financing tenant_id; remaining finance:write writers

PRODUCTION_CHANGED = NO
```
