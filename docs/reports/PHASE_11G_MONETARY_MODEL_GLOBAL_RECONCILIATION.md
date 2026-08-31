# PHASE 11.G — MONETARY MODEL & GLOBAL FINANCIAL RECONCILIATION

**Modo:** MATHEMATICAL CLOSURE (IndexedDB SSOT, storage FLOAT_BRL)  
**Data:** 2026-08-31  
**PHASE_11.B:** PASS (`58d72ed`) — regressão PASS  
**PHASE_11.C:** PASS_WITH_NOTES (`d0eb1ed`) — payment/reversal continua PASS  
**PHASE_11.D:** PASS_WITH_NOTES (`5a0f60d`) — receivable lifecycle continua PASS  
**PHASE_11.E:** PASS_WITH_NOTES (`d24eb3e`) — financing lifecycle continua PASS  
**PHASE_11.F:** PASS_WITH_NOTES (`8aa452c`) — write surface continua PASS  
**PRODUCTION_CHANGED = NO** · **MIGRATION_APPLIED = NO** · **BACKFILL_APPLIED = NO** · **SUPABASE_CUTOVER = NO**

Nenhum PII. Nenhum secret. Sem deploy. Sem Phase 11.H.

---

## 1. Executive Summary

O Core Financeiro passou a ter **um contrato matemático canônico em centavos inteiros**, sem migrar o armazenamento. Storage continua `FLOAT_BRL`. Toda operação crítica (orçamento, PATH A, PATH B, pagamento, estorno, saldo, desconto percentual, KPIs do core) converte para cents, calcula em inteiros e devolve FLOAT_BRL só na fronteira de persistência/display.

PATH A deixou de ratear com `toFixed`/divisão float. PATH A e PATH B agora usam o mesmo `splitInCents`: resto de 1 centavo nas primeiras parcelas (`1000/3 → 333.34 + 333.33 + 333.33`). Budget → receivables, financing → receivables, receivable = paid + balance e payment/reversal fecham centavo a centavo. Overpayment continua DENY **antes** da mutação. Histórico não foi reescrito.

Dashboard e DRE **não** viraram um ledger único: receita do core é reconciliada em cents; caixa/payables/comissões permanecem fontes legadas. Essa fronteira está documentada, não redesenhada.

---

## 2. Baseline

```
BRANCH = main
CURRENT_HEAD (antes) = 8aa452c9a5757bae60f2028e390c39e3061db81e
EXPECTED_BASELINE = 8aa452c
DELTA_FROM_BASELINE_BEFORE_11G = leftovers SMTP/patient-email (não staged)
INDEXEDDB_SCHEMA_CHANGE_REQUIRED = NO
DB_VERSION = 57 (não bumpado)
FINANCIAL_SSOT = INDEXEDDB_LEGACY_SERVICES
MONEY_STORAGE_MODEL = FLOAT_BRL
```

Nenhum `git reset` / `clean` / `restore`. Leftovers SMTP/patient-email **não** foram staged.

Invariantes preservados:

```
RECEIVABLE_CREATION_IDEMPOTENCY = PASS
PAYMENT_IDEMPOTENCY = PASS
REVERSAL_IDEMPOTENCY = PASS
RECEIVABLE_LIFECYCLE_INTEGRITY = PASS
FINANCING_LIFECYCLE_TENANT_SAFE = PASS
FINANCIAL_WRITE_SURFACE_TENANT_CLOSED = PASS_WITH_NOTES
FINANCIAL_ACTIVE_WRITERS_USING_LEGACY_FINANCE_WRITE = 0
DIRECT_PAYMENT_BYPASS = NONE
DIRECT_RECEIVABLE_LIFECYCLE_BYPASS = NONE
DIRECT_FINANCING_LIFECYCLE_BYPASS = NONE
AUTOMATIC_FINANCIAL_SIDE_EFFECTS_FROM_CONTRACTS = NONE
```

---

## 3. Money Operation Inventory

`PHASE11G_MONEY_OPERATION_INVENTORY` (operações críticas; não é dump de `toFixed` de UI):

| FILE | FUNCTION | DOMAIN | INPUT | OUTPUT | CURRENT_ROUNDING (antes) | STORAGE_OR_CALCULATION | CANONICAL_HELPER_USED | RISK |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| receivableMoney.js | toCents / fromCents / splitInCents | core money | FLOAT_BRL | cents / FLOAT_BRL | MIXED (11.C parcial) | CALC + boundary | YES (SSOT) | LOW |
| clinicalBudgetFinance.js | buildPathAReceivableSpecs | PATH A | budget total, down, N | receivable specs | `remainder/n` + `toFixed(2)` | CALC | splitInCents | era P0 residual |
| financingCalculator.js | calculateFinancingSummary | PATH B | total, entry, rate, fee | summary + parts | splitInCents local | CALC | splitInCents canônico | LOW |
| budgetUtils.js | calcOptionFinalValue / calcPlannedValue | budget net | procedures + discount | FLOAT_BRL net | Number / percent float | CALC | applyPercentDiscountCents | era P0 0,01 |
| receivablesService.js | createReceivable / normalizeAmounts | CR create | components | net/remaining | Number mix | CALC + storage boundary | netFromComponentsCents | LOW |
| receivablesService.js | getReceivablesKPIs | CORE KPI | receivables + payments | totals | Number(net/received) | CALC | reconcileReceivableFromPayments + cents | era float KPI |
| receivableReconciliation.js | reconcileReceivableFromPayments | CR recon | payments | paid/remaining/status | cents 11.C | CALC | toCents / clampNonNegativeCents | LOW |
| receivablePaymentLifecycle.js | registerReceivablePayment | payment | amount vs balance | DENY or write | cents 11.C | CALC | toCents compare | OVERPAY BLOCKED |
| financingReconciliation.js | reconcileFinancingFromReceivables | PATH B paid | linked CRs | paid/open | Number 11.E | CALC | toCents / clampNonNegativeCents | LOW |
| financingsService.js | getFinancingsKPIs | CORE KPI | financings | totals | Number() sum | CALC | toCents/fromCents | era float KPI |
| faturamentoService.js | getFaturamentoReport | CORE KPI | CR + financing | faturamento | Number sum | CALC | normalizeMoney + cents sum | LOW |
| dashboardMetricsService.js | sumReceivedPayments | KPI híbrido | payments + cash txn | core / legacy / total | Number mix | CALC | core em cents; cash legado | HYBRID |
| financeDreService.js | getDreReport | DRE misto | faturamento + payables | séries | Number mix | CALC | pushCoreMoney no core; float no legado | MIXED |
| financeDreCashLiquidityService.js | liquidity / cash-in | DRE/caixa | payments + payables | cobertura | Number mix | CALC | core em cents | MIXED |
| patientFinancialSummaryService.js | getPatientFinancialSummary | CORE KPI | remaining/net | totais | Number() | CALC | toCents | LOW |
| financingInstallmentsService.js | create/update installment | PATH B store | amounts | store FLOAT | Number() | STORAGE boundary | não (compat FLOAT) | NOTE |
| financeService.js / payables / cash | transactions | LEGACY CASH | amount | store FLOAT | Number() | STORAGE | NÃO (fora do core) | DOCUMENTED |
| contractVariableResolver.js | #totalContrato | jurídico | snapshot | display | toFixed | DISPLAY | NÃO (não SSOT financeiro) | NONE |
| Finance\*Page.jsx | tickFormatter / % | UI | valores | string | toFixed display | DISPLAY | N/A | NONE |

Não houve substituição cega de todo `toFixed`/`Number` do repositório. Display, caixa legado e payables ficaram fora do contrato canônico.

---

## 4. Canonical Money Model

```
MONEY_STORAGE_MODEL = FLOAT_BRL
MONEY_CALCULATION_MODEL = INTEGER_CENTS
MONEY_CANONICAL_UNIT = CENT
ROUNDING_UNIT = 1 CENT
LEGACY_FLOAT_READ_POLICY = NORMALIZE_TO_CENTS_FOR_CALCULATION
```

Fluxo:

```
BRL persisted value
  → toCents()          Math.round(n * 100)
  → integer calculations
  → fromCents()        cents / 100
  → storage/display boundary
```

Não há epsilon. Não há soma financeira crítica em float. Artefato `0.1 + 0.2` vira `30` cents. `10.1000000000001` vira `1010` cents na leitura matemática, **sem rewrite** do registro.

`MONEY_STORAGE_MODEL_CHANGE = NONE`. Campos `amount` / `net_amount` / `received_amount` **não** foram convertidos para `*_cents`.

---

## 5. Money Helpers

Contrato único: `src/services/receivableMoney.js`.

Não foram criados helpers concorrentes. `financingCalculator.js` removeu o `splitInCents` local e reexporta o canônico (compat 11.E T10).

| Função | Papel |
| --- | --- |
| `toCents` / `fromCents` | fronteira BRL ↔ cents |
| `normalizeMoney` | round-trip de 1 centavo sem mutar storage |
| `assertFiniteMoney` | fail-closed em valor não finito |
| `addCents` / `subtractCents` / `sumCents` | álgebra |
| `compareCents` / `isZeroCents` | igualdade sem float |
| `clampNonNegativeCents` | saldo nunca negativo por arredondamento |
| `splitInCents` | rateio determinístico |
| `applyPercentDiscountCents` | `% × total` → cents (`Math.round`) |
| `netFromComponentsCents` | original − discount + interest + fine |

---

## 6. PATH A Reconciliation

Writer: `clinicalBudgetFinance.buildPathAReceivableSpecs`.

Antes: `remainder / n` + `Number(x.toFixed(2))` — soma podia perder/ganhar 1 centavo.

Agora:

```
BUDGET_NET_TOTAL_CENTS = toCents(calcOptionFinalValue(accepted, planned))
DOWN_CENTS             = toCents(downPayment)
REMAINDER_CENTS        = BUDGET_NET_TOTAL_CENTS - DOWN_CENTS
INSTALLMENT_PARTS      = splitInCents(remainder, N)
```

Equação:

```
ENTRY (installment_number = 0, se down > 0)
+ SUM(INSTALLMENTS 1..N)
= BUDGET_NET_TOTAL_CENTS
= SUM(PATH A receivable.net_amount)
```

Identidade PATH A **não** mudou: `tenant + treatment_plan + budget.id + installment_number`. Entrada continua `installment_number = 0`.

Label de display `Parcelado clínica · Nx de …` passou a usar a primeira parte de `splitInCents` (não `val / inst`).

---

## 7. PATH B Reconciliation

`calculateFinancingSummary` calcula interest/fee/discount em cents e rateia `netFinancedAmount` com o mesmo `splitInCents`.

```
ENTRY_CENTS + SUM(FINANCED_INSTALLMENT_CENTS) = FINANCING_TOTAL_PAYABLE_CENTS
SUM(PATH B receivables.net_amount)            = FINANCING_TOTAL_PAYABLE_CENTS
```

Juros/taxa administrativa **entram na obrigação** (`netFinancedAmount`). Charge/boleto **não** recalcula o total do título.

Identidade PATH B preservada (entrada `installment_number = 0` quando há entry).

---

## 8. Receivable Reconciliation

```
NET_CENTS        = toCents(original) - toCents(discount) + toCents(interest) + toCents(fine)
EFFECTIVE_PAID   = SUM(payments efetivos) em cents
BALANCE_CENTS    = max(NET_CENTS - EFFECTIVE_PAID, 0)
```

- Full payment: `EFFECTIVE_PAID == NET` → `BALANCE = 0`, status `paid` (sem igualdade float).
- Partial: `0 < paid < total` → `partially_paid` (ou `overdue`/`due_today` se vencido — regra de domínio 11.D, não float).
- Canceled unpaid: paid efetivo = 0; nenhum paid inventado.
- Paid histórico: `received_amount` preservado; inspector é report-only.

---

## 9. Payment/Reversal Reconciliation

Modelo 11.C preservado:

```
EFFECTIVE_PAID = valid payments − effective reversals   (cents)
```

Overpayment: `paidCents + amountCents > netCents` → throw **antes** do push. Sem clamp posterior.

Estorno: novo fato `kind: reversal`; saldo recompute via payments, nunca `received_amount - float` como truth source.

---

## 10. Financing Reconciliation

`reconcileFinancingFromReceivables`:

```
FINANCING_PAID_CENTS    = SUM(toCents(receivable.received_amount))  // denormalizado pós-11.C
FINANCING_BALANCE_CENTS = max(NET - PAID, 0) por título collectible
```

`received_amount` do CR é escrito pela reconciliação de payments. Inspector compara esse denormalizado com `SUM(EFFECTIVE_PAID)` dos payments e aponta `financing_paid_mismatch` se divergir — **sem corrigir**.

---

## 11. Discounts / Fees / Interest

| Componente | Onde | Classificação | Rounding |
| --- | --- | --- | --- |
| `discountPercent` do orçamento | `applyPercentDiscountCents` | obrigação PATH A | `Math.round(totalCents * pct / 100)` |
| `discount` absoluto do orçamento | `toCents(base) - toCents(fixed)` | obrigação PATH A | cents |
| `discount_amount` do financiamento | `calculateFinancingSummary` | reduz net financed | cents |
| interest simple/compound/fixed | PATH B summary | **dentro** da obrigação | `Math.round` após fórmula → cents |
| admin fee amount/rate | PATH B summary | **dentro** da obrigação | cents |
| `interest_amount` / `fine_amount` do CR | `netFromComponentsCents` | componentes da obrigação | cents |
| taxa/juros de payables DRE | `classifyExpenseLine` | **não** obrigação CR | float legado |
| charge/boleto `amount` | provider/cobrança | **não** SSOT da obrigação | comparação em cents se necessário |

Exemplo T13: 10% de 99.99 → discount `10.00` (`1000` cents), net `89.99` (`8999` cents). PATH A materializa exatamente `8999`.

Compound interest ainda usa potência em float e **então** `Math.round` para cents. Determinístico o suficiente para o gate; não é um motor de juros bancário novo.

---

## 12. Installment Rounding

Regra única PATH A e PATH B:

```
ROUNDING_UNIT = 1 CENT
splitInCents: base = floor(totalCents / N)
remainder R primeiras parcelas recebem +1 centavo
```

`1000.00 / 3` → `333.34, 333.33, 333.33` (soma `1000.00`).  
`999.99 / 7` soma exatamente `999.99`.

Não há correção de residual depois do split.

---

## 13. Global Financial Equations

```
PATH A:
  BUDGET_NET_TOTAL = SUM(PATH A receivable.net_amount)

PATH B:
  FINANCING_TOTAL_PAYABLE = ENTRY + SUM(installments)
  FINANCING_TOTAL_PAYABLE = SUM(PATH B receivable.net_amount)

RECEIVABLE collectible:
  NET = EFFECTIVE_PAID + BALANCE

PAID:
  BALANCE = 0
  EFFECTIVE_PAID = NET

CANCELED UNPAID:
  EFFECTIVE_PAID = 0

REVERSAL:
  EFFECTIVE_PAID retorna ao prior (pagamentos efetivos restantes)

OVERPAYMENT:
  DENY before write
```

Contrato **não** entra na equação. Snapshot jurídico ≠ SSOT financeiro.

---

## 14. Reconciliation Inspector

`src/services/financialReconciliationInspector.js`

```
inspectFinancialReconciliation(db)  // read-only, sem mutação
```

Códigos:

| code | Significado |
| --- | --- |
| `receivable_total_mismatch` | storage `received + remaining ≠ net` **ou** storage diverge da reconciliação |
| `negative_balance` | remaining cents < 0 |
| `overpaid_state` | paid efetivo > net |
| `budget_obligation_mismatch` | soma PATH A ≠ net do orçamento |
| `financing_obligation_mismatch` | entry + parcelas ≠ total pagável |
| `financing_paid_mismatch` | `total_paid_amount` ≠ soma paid reconciliado |
| `financing_summary_invalid` | summary não recalculável |

Achados históricos = **REPORT ONLY**. Sem backfill, re-round, rewrite, delete, cancel ou recreate.

Não é scanner de produção destrutivo. Não foi executado contra clínica live.

---

## 15. Legacy Float Policy

```
LEGACY_FLOAT_READ_POLICY = NORMALIZE_TO_CENTS_FOR_CALCULATION
```

Registros antigos (`10.1`, `10.10`, `10.1000000000001`) são normalizados **só na leitura matemática**. Storage permanece como está. T18 prova: `toCents(10.1000000000001) === 1010` e o campo persistido não é reescrito pelo helper.

Novas escritas podem persistir `fromCents(toCents(x))` na fronteira do writer. Isso **não** é migration global nem backfill.

---

## 16. KPI Compatibility

| KPI | Fonte | Modelo |
| --- | --- | --- |
| CR aberto / overdue / received | `getReceivablesKPIs` | `reconcileReceivableFromPayments` + cents |
| Faturamento | `getFaturamentoReport` | `normalizeMoney` + soma cents |
| Financing paid/open/month | `getFinancingsKPIs` | soma cents dos campos reconciliados |
| Patient open/overdue/paid | `getPatientFinancialSummary` | soma cents de remaining/net |
| Dashboard `dailyRevenue` | **híbrido** | core payments cents **+** cash/transactions float |
| Dashboard `coreFinancialRevenue*` | core only | cents |
| Dashboard `legacyCashRevenue*` | caixa legado | FLOAT (documentado) |

KPIs do core **não** usam status isolado quando existe valor reconciliado. `paid` soma `net_cents` do título pago; overdue/upcoming somam `remaining_cents`.

---

## 17. DRE / Dashboard Boundaries

```
CORE_FINANCIAL_KPI          = receivables + payments + financing + faturamento (cents)
LEGACY_CASH_TRANSACTION_KPI = transactions + cashTransactions + payables + commissions (float)
```

**Dashboard:** `faturamentoHoje` / `dailyRevenue` continuam a soma híbrida para não quebrar a UI operacional. Campos extras separam as verdades. Caixa **não** foi redesenhado. Tenant gap de `transactions`/`cashTransactions` (11.F) permanece dívida de módulo fora do core.

**DRE:** `pushCoreMoney` em receita bruta / descontos / estornos de CR e financing. Comissões, payables e cash avulso continuam `pushSeries` float. `receitaLiquida` do core (bruta − desconto − estorno) é cents; margem depois mistura custos legados. **Não** é ledger único. `DRE_FINANCIAL_SOURCE_BOUNDARY = DOCUMENTED`.

**Delinquency:** `executeDelinquencyFlow` ainda lista `listFinancingInstallments({ status: OVERDUE })` **sem tenant**. É automação operacional (reminders/CRM), não entra na equação monetária global. Não expandido para régua/CRM nesta fase.

**Charges:** `createReceivableCharge` não altera obrigação (11.F). 11.G não recalcula receivable a partir do charge.

---

## 18. Files Changed

- `src/services/receivableMoney.js` — contrato canônico único
- `src/services/clinicalBudgetFinance.js` — PATH A split em cents
- `src/services/financingCalculator.js` — PATH B usa helper canônico
- `src/components/clinical/budget/budgetUtils.js` — net/discount/display split
- `src/services/receivablesService.js` — create/KPI em cents
- `src/services/receivableReconciliation.js` — clamp/remaining em cents
- `src/services/financingReconciliation.js` — paid/open em cents
- `src/services/financingsService.js` — KPIs PATH B em cents
- `src/services/faturamentoService.js` — KPI/chart em cents
- `src/services/dashboardMetricsService.js` — core vs legacy cash
- `src/services/financeDreService.js` — core cents / legado float
- `src/services/financeDreCashLiquidityService.js` — recebimentos core em cents
- `src/services/patientFinancialSummaryService.js` — totais CR em cents
- `src/services/financialReconciliationInspector.js` — **novo**, read-only
- `src/__tests__/phase11gMonetaryModelGlobalReconciliation.test.js` — **novo** T1–T26
- `docs/reports/PHASE_11G_MONETARY_MODEL_GLOBAL_RECONCILIATION.md` — este relatório

Não tocados: leftovers SMTP/patient-email, contratos, odontograma, migrations, `.env`, payables/cash writers, schema IndexedDB.

---

## 19. Tests

Suite `phase11gMonetaryModelGlobalReconciliation.test.js` — T1–T26: **26 passed**.

| ID | Caso |
| --- | --- |
| T1 | BRL → cents → BRL |
| T2 | `0.1+0.2 = 0.30` |
| T3 | PATH A `1000/3` soma exata |
| T4 | PATH A entrada + parcelas = total |
| T5 | PATH B `splitInCents` `333.34/333.33/333.33` |
| T6 | financing entry + parcelas = total = SUM CR |
| T7 | partial 400/1000 balance 600 |
| T8 | full payment balance 0 |
| T9 | pay 400+600, reverse 600 → paid 400 |
| T10 | multi-payment exato |
| T11 | overpayment DENY |
| T12 | R$ 0,01 sem residual negativo |
| T13 | 10% de 99.99 → 89.99 |
| T14 | checker detecta soma de parcelas |
| T15 | checker detecta TOTAL ≠ PAID+BALANCE (storage) |
| T16 | checker detecta financing paid mismatch |
| T17 | checker detecta budget vs obrigação |
| T18 | legacy float normaliza sem rewrite |
| T19 | canceled unpaid não inventa paid |
| T20 | budget pago preserva received |
| T21 | 11.B creation idempotent |
| T22 | 11.C payment idempotent |
| T23 | 11.D unpaid cancel |
| T24 | 11.E financing tenant |
| T25 | 11.F charge não cria obrigação |
| T26 | contratos sem side-effect financeiro |

Matriz A–L coberta: A=T2, B=T3/T5, C via split helper, D=T3, E/F=T7, G=T9, H=T4/T6, I=T13, J implícito em 1000, K=T12, L=zero via `isZeroCents`/`toCents(0)`.

---

## 20. Regression

```
phase11b … phase11f + phase11g
+ finance + financeAudit + financing + financingOperationalFlows
+ permissions + tenantIsolation + dashboardMetrics
+ financialRead/WriteCutover + fullBudgetContractFlow
+ budgetApproval + phase1023e/f/i

Test Files  20 passed
Tests       248 passed
```

`TYPECHECK_NEW_11G_FAILURES = NONE`  
`tsc -b` ainda falha em dívida histórica (domain-events, CRM repositories, contracts-v2 harness) — **não corrigida**.

---

## 21. Deferred Risks

- Storage continua FLOAT_BRL; persistência `amount_cents` é fase futura (migration/backfill).
- DRE/dashboard híbridos: caixa, payables e comissões fora do core.
- `transactions` / `cashTransactions` sem tenant (11.F) — módulo legado.
- `executeDelinquencyFlow` lista parcelas overdue sem tenant — fase tenant-operational.
- `listReceivables` sem `user` permanece unscoped (compat 11.F).
- `PARTIALLY_PAID_RECEIVABLE_CANCEL_POLICY = FAIL_CLOSED_REQUIRES_PRODUCT_DECISION`.
- Compound interest: float exponent + round-to-cents (não motor bancário).
- `financingInstallmentsService` ainda persiste via `Number()` na borda de storage (valores já vêm do calculator em cents).
- Inspector não varreu IndexedDB de clínica live.

Nenhum desses itens é P0 em **novas escritas** do core.

---

## 22. Gate

```
PHASE_11G_GATE = FINANCIAL_MONETARY_RECONCILIATION_EXACT
PHASE_11G_STATUS = PASS_WITH_NOTES
```

| # | Critério | Resultado |
| --- | --- | --- |
| 1 | matemática crítica em cents | PASS |
| 2 | PATH A fecha centavo a centavo | PASS |
| 3 | PATH B fecha centavo a centavo | PASS |
| 4 | budget → receivables | PASS |
| 5 | financing → receivables | PASS |
| 6 | receivable = paid + balance | PASS |
| 7 | payment/reversal exato | PASS |
| 8 | residual float não gera saldo incorreto | PASS |
| 9 | overpayment bloqueado | PASS |
| 10 | discount/fee relevante determinístico | PASS |
| 11 | histórico não reescrito | PASS |
| 12 | KPIs do core reconciliados | PASS |
| 13 | fronteira cash/DRE documentada | PASS (NOTES) |
| 14 | 11.B–11.F PASS | PASS |
| 15 | contratos sem side-effects | PASS |
| 16 | sem migration/backfill/cutover | PASS |

NOTES = DRE/dashboard híbridos + delinquency unscoped + storage FLOAT (intencional). Sem P0 em novas escritas.

---

## 38. Métricas obrigatórias

```
PHASE_11G_STATUS = PASS_WITH_NOTES
BASELINE_HEAD = 8aa452c
FINAL_HEAD = (após commit)

MONEY_STORAGE_MODEL = FLOAT_BRL
MONEY_CALCULATION_MODEL = INTEGER_CENTS
MONEY_CANONICAL_UNIT = CENT

LEGACY_FLOAT_READ_POLICY = NORMALIZE_TO_CENTS_FOR_CALCULATION

CANONICAL_MONEY_HELPER = src/services/receivableMoney.js

PATH_A_ROUNDING_MODEL = SPLIT_IN_CENTS_REMAINDER_ON_FIRST
PATH_A_INSTALLMENT_SUM = PASS

PATH_B_ROUNDING_MODEL = SPLIT_IN_CENTS_REMAINDER_ON_FIRST
PATH_B_INSTALLMENT_SUM = PASS

BUDGET_TO_RECEIVABLE_RECONCILIATION = PASS
FINANCING_TO_RECEIVABLE_RECONCILIATION = PASS

RECEIVABLE_TOTAL_EQUATION = PASS
PAYMENT_RECONCILIATION = PASS
REVERSAL_RECONCILIATION = PASS
FINANCING_RECONCILIATION = PASS

ZERO_RESIDUAL_CENT_ERRORS = PASS
NEGATIVE_BALANCE_FROM_ROUNDING = BLOCKED
OVERPAYMENT_FROM_ROUNDING = BLOCKED

DISCOUNT_ROUNDING = PASS
INTEREST_FEE_ROUNDING = PASS

FINANCIAL_RECONCILIATION_INSPECTOR = inspectFinancialReconciliation (read-only)
HISTORICAL_RECONCILIATION_FINDINGS = NONE_PRODUCTION_SCAN

HISTORICAL_DATA_CHANGED = NO

CORE_FINANCIAL_KPI_RECONCILIATION = PASS
LEGACY_CASH_KPI_BOUNDARY = DOCUMENTED

DRE_FINANCIAL_SOURCE_BOUNDARY = DOCUMENTED

RECEIVABLE_CREATION_REGRESSION = PASS
PAYMENT_IDEMPOTENCY_REGRESSION = PASS
REVERSAL_REGRESSION = PASS
RECEIVABLE_LIFECYCLE_REGRESSION = PASS
FINANCING_LIFECYCLE_REGRESSION = PASS
FINANCIAL_WRITE_SURFACE_REGRESSION = PASS

AUTOMATIC_FINANCIAL_SIDE_EFFECTS_FROM_CONTRACTS = NONE

MONEY_STORAGE_MODEL_CHANGE = NONE
SUPABASE_CUTOVER = NO
MIGRATION_APPLIED = NO
BACKFILL_APPLIED = NO

TYPECHECK_NEW_11G_FAILURES = NONE

TESTS_ADDED = src/__tests__/phase11gMonetaryModelGlobalReconciliation.test.js (T1–T26)
TESTS_PASS = 248 (regressão 11.G + 11.B–F + finance/contracts/cutover)
TESTS_FAIL = 0

P0_FIXED = PATH A toFixed split; budget percent discount; core KPI float sums
P0_DEFERRED = NONE (NOTES = cash/DRE legado + delinquency tenant + FLOAT storage)

PRODUCTION_CHANGED = NO
```

---

## 39. Gate final

`PHASE_11G_GATE = FINANCIAL_MONETARY_RECONCILIATION_EXACT` → **PASS_WITH_NOTES**.

Commit sugerido e aplicado:

`fix(finance): unify monetary reconciliation in cents`
