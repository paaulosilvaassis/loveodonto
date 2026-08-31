# PHASE 11.F — FINANCIAL WRITE SURFACE, CHARGES, BOLETO & TENANT READ INTEGRITY

**Modo:** SURFACE CLOSURE (IndexedDB SSOT)  
**Data:** 2026-08-31  
**PHASE_11.B:** PASS (`58d72ed`) — regressão PATH A continua PASS  
**PHASE_11.C:** PASS_WITH_NOTES (`d0eb1ed`) — payment/reversal continua PASS  
**PHASE_11.D:** PASS_WITH_NOTES (`5a0f60d`) — receivable lifecycle continua PASS  
**PHASE_11.E:** PASS_WITH_NOTES (`d24eb3e`) — financing lifecycle continua PASS  
**PRODUCTION_CHANGED = NO** · **MIGRATION_APPLIED = NO** · **BACKFILL_APPLIED = NO** · **SUPABASE_CUTOVER = NO**

Nenhum PII. Nenhum secret. Sem deploy. Sem Phase 11.G.

---

## 1. Executive Summary

As superfícies financeiras LIVE que ainda usavam `finance:write` (cobrança de CR, boleto e régua) foram fechadas com capabilities canônicas `financeiro_boletos:*`. `createReceivableCharge` não cria obrigação financeira; retry da mesma `operation_id` não duplica charge nem título. Reminder é tenant-scoped, idempotente e canal `INTERNAL_NOTIFICATION` (provider fake, sem API de produção). Leitura operacional tenant-scoped de CR legado passou a `DERIVE_FROM_PATIENT_OR_OMIT`: ownership desconhecido é omitido da listagem e dos KPIs tenant. Payables/caixa/comissões/suppliers permanecem fora do core e ainda usam `finance:write` (documentado, não redesenhado).

---

## 2. Baseline

```
BRANCH = main
CURRENT_HEAD (antes) = d24eb3e5344fe5aadfdf83439b6d12faf6a1e783
EXPECTED_BASELINE = d24eb3e
DELTA_FROM_BASELINE_BEFORE_11F = leftovers SMTP/patient-email (não staged)
INDEXEDDB_SCHEMA_CHANGE_REQUIRED = NO
DB_VERSION = 57 (não bumpado)
FINANCIAL_SSOT = INDEXEDDB_LEGACY_SERVICES
```

Nenhum `git reset` / `clean` / `restore`. Leftovers SMTP/patient-email **não** foram staged.

---

## 3. finance:write Inventory

`FINANCE_WRITE_REMAINING_INVENTORY` (baseline `d24eb3e`, `requirePermission(..., 'finance:write')` em `src/services`):

| FILE | FUNCTION | LIVE_OR_DEAD | DOMAIN | READ_OR_WRITE | CURRENT_PERMISSION (antes) | TENANT_VALIDATION | SIDE_EFFECT | IN_SCOPE_11F | REASON |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| receivablesService.js | createReceivableCharge | LIVE | CR charge | WRITE | finance:write | nenhuma | push receivableCharges | YES | writer LIVE do core |
| boletoChargesService.js | createBoletoCharge | LIVE | boleto | WRITE | finance:write | nenhuma | push boletoCharges + provider fake | YES | writer LIVE |
| boletoChargesService.js | updateBoletoChargeStatus | LIVE | boleto | WRITE | finance:write | nenhuma | muta status | YES | writer LIVE |
| boletoChargesService.js | generateSecondCopy | LIVE | boleto | WRITE | finance:write | nenhuma | 2ª via + history | YES | writer LIVE |
| boletoChargesService.js | cancelBoletoCharge | LIVE | boleto | WRITE | finance:write | nenhuma | status CANCELED | YES | writer LIVE |
| boletoChargesService.js | syncOpenBoletoChargesFromProvider | LIVE | boleto | WRITE | finance:write | nenhuma | sync in-process | YES | writer LIVE |
| boletoChargesService.js | processBoletoProviderWebhook | LIVE | boleto | WRITE | finance:write | nenhuma | webhook fake | YES | writer LIVE |
| boletoChargesService.js | syncBoletoChargeStatusFromProvider | LIVE | boleto | WRITE | finance:write | nenhuma | sync in-process | YES | writer LIVE |
| financingsService.js | runBoletoReminderRule | LIVE | boleto reminder | WRITE | finance:write | listagem global | push boletoReminderEvents | YES | writer LIVE |
| payablesService.js | (6 writers) | LIVE | contas a pagar | WRITE | finance:write | n/a 11.F | payables store | NO | §27 — não redesign |
| cashRegisterService.js | (1 writer) | LIVE | caixa | WRITE | finance:write | n/a 11.F | cash store | NO | §27 |
| commissionCalculationService.js | (3 writers) | LIVE | comissão | WRITE | finance:write | n/a 11.F | commissions | NO | §27 |
| commissionRulesService.js | (5 writers) | LIVE | comissão regras | WRITE | finance:write | n/a 11.F | rules | NO | §27 |
| suppliersService.js | (1 writer) | LIVE | fornecedores | WRITE | finance:write | n/a 11.F | suppliers | NO | §27 |
| financeService.js | (2 writers) | LIVE-LEGACY | transactions / installmentPlans | WRITE | finance:write | n/a 11.F | store legado | NO | não é CR/PATH B |

```
LEGACY_FINANCE_WRITE_OCCURRENCES_BEFORE = 27  (src/services requirePermission)
LEGACY_FINANCE_WRITE_OCCURRENCES_AFTER  = 18  (somente fora do core CR/boleto/financing)
FINANCIAL_ACTIVE_WRITERS_USING_LEGACY_FINANCE_WRITE = 0
```

Não foi criado alias `finance:write → all financeiro_*`. Missing/unknown permission continua DENY.

---

## 4. Financial Writer Surface

```
FINANCIAL_WRITE_SURFACE_MAPPED = YES
```

| PATH | WRITER | STORE | PERMISSION | TENANT_CHECK | IDEMPOTENCY | RECONCILIATION | ACTIVE | STATUS |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| UI CR → Gerar cobrança | createReceivableCharge | receivableCharges | financeiro_boletos:create | assertReceivableWriteOwnership | tenant_id + operation_id | N/A (não mexe saldo) | YES | CLOSED |
| UI boletos / approve PATH B | createBoletoCharge | boletoCharges | financeiro_boletos:create | resolveBoletoWriteTenant | tenant_id + operation_id | N/A | YES | CLOSED |
| UI boletos status | updateBoletoChargeStatus | boletoCharges | issue \| cancel | assertBoletoChargeWriteOwnership | N/A (mutação de status) | não baixa CR | YES | CLOSED |
| UI 2ª via | generateSecondCopy | boletoCharges | financeiro_boletos:resend | ownership | nova via intencional | N/A | YES | CLOSED |
| UI cancel boleto | cancelBoletoCharge | boletoCharges | financeiro_boletos:cancel | ownership | N/A | N/A | YES | CLOSED |
| sync/webhook fake | sync*/processWebhook | boletoCharges | financeiro_boletos:issue | list/ownership | N/A | baixa só via 11.C se fluxo aplicar | YES | CLOSED |
| régua boleto | runBoletoReminderRule | boletoReminderEvents | financeiro_boletos:resend | listBoletoCharges({ user }) | charge_id + event_key | N/A | YES | CLOSED |
| PATH A create | createReceivable | accountsReceivable | financeiro_contas_receber:create | 11.B | origin identity | N/A | YES | PRESERVED |
| receive/reverse | register/reverse payment | receivablePayments | receber/reverse | 11.C | operation_id | reconcileReceivableFromPayments | YES | PRESERVED |
| cancel CR | cancelReceivable | accountsReceivable | cancel | 11.D | retry same cancel | FAIL_CLOSED partial | YES | PRESERVED |
| financing C/A/X | create/approve/cancel | financings | financiamentos:* | 11.E | 11.E | reconcileFinancingFromReceivables | YES | PRESERVED |

---

## 5. createReceivableCharge Before

```
CREATE_RECEIVABLE_CHARGE_FLOW_BEFORE =

UI FinanceReceivablesPage / executeReminderFlow
  → requirePermission(finance:write)
  → lookup receivable por id (sem tenant)
  → sempre createId('rvchg')   ← sem idempotency
  → push receivableCharges
  → NÃO cria receivable
  → NÃO registra payment
  → NÃO chama API externa
```

Charge ≠ obrigação. Gerar cobrança não materializa título novo.

---

## 6. Charge Identity / Idempotency

Identidade: `tenant_id + operation_id`.

- Retry da mesma operação → retorna o mesmo registro.
- Operações distintas (sem `operation_id` compartilhado) = tentativas de cobrança distintas, **sem** duplicar receivable.
- Não há dedup por valor.
- `executeReminderFlow` usa `operation_id = rmdchg:{reminder.id}`.

`CREATE_RECEIVABLE_CHARGE_IDEMPOTENCY = PASS`

Provider de boleto é in-process (`boletoProviderService`). Replay de `createBoletoCharge` com a mesma `operation_id` **não** chama o provider de novo.

---

## 7. Charge RBAC

Catálogo existente `financeiro_boletos`: `view, create, issue, cancel, resend`.

Nenhuma permission inventada.

| Operação | Permission |
| --- | --- |
| createReceivableCharge / createBoletoCharge | financeiro_boletos:create |
| update status (não cancel) / sync / webhook | financeiro_boletos:issue |
| cancelBoletoCharge / update→CANCELED | financeiro_boletos:cancel |
| generateSecondCopy / runBoletoReminderRule | financeiro_boletos:resend |

Role `financeiro` passou a receber o bloco `financeiro_boletos` em `roleDefaults.js`. UI escondida não é autoridade: T3/T10 chamam o writer direto e recebem DENY.

Unknown permission = DENY (T4).

---

## 8. Charge Tenant Binding

`resolveBoletoWriteTenant`: receivable → financing → patient → `CHARGE_UNOWNED` (FAIL CLOSED).

Legacy CR: `DERIVE_FROM_PATIENT_OR_FAIL_CLOSED` (write, 11.C/11.D preservado).

Tenant A não gera charge para título B (T5). Legado derivável só no dono (T6). Ownership desconhecido FAIL CLOSED (T7).

`CREATE_RECEIVABLE_CHARGE_TENANT_BOUND = PASS`

---

## 9. Boleto Reminder

Classificação: **B + F(evento)** — agenda notificação interna; persiste `boletoReminderEvents`; **não** altera título; **não** cria obrigação; **não** dispara WhatsApp/e-mail/SMS reais.

```
Canal = INTERNAL_NOTIFICATION
Provider = boletoProviderService (fake in-process)
BOLETO_EXTERNAL_SIDE_EFFECT_EXECUTED = NO
```

Antes: `listBoletoCharges()` global + novo evento a cada run.  
Depois: `listBoletoCharges({ user })` + skip `boleto_charge_id + event_key` (DB e in-run).  
`executeReminderFlow` processa a janela da data (eventos novos **ou** já persistidos) para gerar charge operacional sem duplicar reminder.

`listBoletoReminderEvents` filtra tenant quando `user`/`tenantId` é passado.

---

## 10. Legacy Receivable Read Policy

```
LEGACY_RECEIVABLE_READ_POLICY = DERIVE_FROM_PATIENT_OR_OMIT
```

- Sem `tenant_id` no título: deriva do patient autoritativo local.
- Derived tenant == active tenant → inclui.
- Ownership não comprovável → **omite** da listagem operacional tenant-scoped.
- Sem `user`/`tenantId` no filtro → listagem permanece unscoped (compat 11.D T16/T17 e relatórios internos sem sessão).
- Não delete. Não backfill. Não reescreve linha.

`LEGACY_UNOWNED_RECEIVABLE_VISIBLE_IN_TENANT_LIST = NO`

---

## 11. Tenant KPIs

Agregadores tenant-scoped quando `user` é passado:

- `getReceivablesKPIs(..., { user })`
- `getDreReport` / `getDreCashBasisReport` / `getDreLiquidityReport`
- `getFaturamentoReport`
- `getDashboardMetrics` / `getDashboardChartData` (somente `receivablePayments`; transactions/caixa legado continuam unscoped — fora do core CR)

UI: FinanceReceivablesPage, FinanceDREPage, FinanceFaturamentoPage, DashboardPage passam `user`.

`LEGACY_UNOWNED_RECEIVABLE_INCLUDED_IN_TENANT_KPI = NO` (T15)

---

## 12. Direct Store Read/Write Audit

```
DIRECT_FINANCIAL_STORE_WRITES = NONE_ACTIVE_OUTSIDE_CANONICAL_SERVICES
```

Writes LIVE:

- `accountsReceivable.push` → `receivablesService.createReceivable`
- `receivablePayments.push` → `receivablePaymentLifecycle`
- `financings.push` → `financingsService.createFinancingProposal`

`clinicalBudgetFinance.createReceivablesFromApprovedBudget` chama `createReceivable` (canônico).  
`financialRepositorySync.ts` é cutover Supabase **inativo** (`SUPABASE_CUTOVER = NO`).  
Tests/seeds podem push direto — não são writers de produção.

Leituras diretas de store em páginas foram reduzidas na aba Cobranças (`listReceivableCharges` + `listReceivables({ user })`).

---

## 13. Payment Bypass Audit

```
DIRECT_PAYMENT_BYPASS = NONE
```

`createReceivableCharge` / boleto / reminder **não** inserem `receivablePayments` e **não** alteram `received_amount`. Pagamento continua 11.C (`operation_id` + tenant + RBAC + reconciliação). T16/T20/T21.

---

## 14. Receivable Lifecycle Bypass Audit

```
DIRECT_RECEIVABLE_LIFECYCLE_BYPASS = NONE
```

Nenhum path LIVE faz `status = paid/canceled` fora de `cancelReceivable` / reconciliação 11.C. Partial cancel permanece FAIL CLOSED (T17/T22). Charge não muda status do título.

---

## 15. Financing Bypass Audit

```
DIRECT_FINANCING_LIFECYCLE_BYPASS = NONE
```

Boleto sobre proposta pendente **não** promove status. Approve continua 11.E (T18/T23). Sem `paid_amount +=` paralelo.

---

## 16. Files Changed

Novo:

- `src/services/financialChargeOwnership.js`
- `src/__tests__/phase11fFinancialWriteSurfaceTenantIntegrity.test.js`
- `docs/reports/PHASE_11F_FINANCIAL_WRITE_SURFACE_TENANT_INTEGRITY.md`

Alterados:

- `src/services/receivablesService.js`
- `src/services/receivablePaymentLifecycle.js`
- `src/services/boletoChargesService.js`
- `src/services/financingsService.js`
- `src/services/financingOperationalFlowsService.js`
- `src/services/financeDreService.js`
- `src/services/financeDreCashLiquidityService.js`
- `src/services/faturamentoService.js`
- `src/services/dashboardMetricsService.js`
- `src/permissions/roleDefaults.js`
- `src/pages/FinanceReceivablesPage.jsx`
- `src/pages/FinanceBoletosPage.jsx`
- `src/pages/FinanceDREPage.jsx`
- `src/pages/FinanceFaturamentoPage.jsx`
- `src/pages/DashboardPage.jsx`

Não tocados: leftovers SMTP/patient-email, contratos, odontograma, migrations, `.env`.

---

## 17. Tests

Suite `phase11fFinancialWriteSurfaceTenantIntegrity.test.js` — T1–T24: **24 passed**.

T1 inventory + financeiro sem `finance:write` mas com boletos canônicos.  
T2–T8 charge RBAC/tenant/idempotency.  
T9–T11 reminder tenant/RBAC/no fetch.  
T12–T15 read policy + KPI.  
T16–T18 bypass audits.  
T19–T23 regressão 11.B–E.  
T24 contratos sem side-effect financeiro.

---

## 18. Regression

```
phase11b … phase11e + phase11f + finance + financeAudit + financing
+ financingOperationalFlows + permissions + tenantIsolation
+ dashboardMetrics + financialWritePrimary + financialRead/WriteCutover
+ fullBudgetContractFlow + phase1023e/f/i

Test Files  19 passed
Tests       228 passed
```

`TYPECHECK_NEW_11F_FAILURES = NONE`  
`tsc -b` ainda falha em dívida histórica (domain-events, CRM repositories, contracts-v2 harness) — **não corrigida**.

---

## 19. Deferred Product Decisions

- `PARTIALLY_PAID_RECEIVABLE_CANCEL_POLICY = FAIL_CLOSED_REQUIRES_PRODUCT_DECISION` (fora de 11.F)
- Payables / caixa / comissões / suppliers / `financeService` ainda em `finance:write`
- `listReceivables` / KPIs / DRE sem `user` permanecem unscoped (compat)
- `dashboardMetrics` ainda soma `transactions` / `cashTransactions` sem tenant
- `executeDelinquencyFlow` ainda lista parcelas overdue sem filtro de tenant (read auxiliar; reminder já scoped)
- MONEY_STORAGE_MODEL_CHANGE = NONE

---

## 20. Remaining Risks

- Listagens financeiras chamadas **sem** `user` em scripts/testes ainda veem legado unowned (by design).
- Charge UI sem `operation_id` permite tentativas distintas (não duplica obrigação).
- Provider Asaas no catálogo é stub in-process; cutover real exigiria idempotency de provedor (FAIL CLOSED até existir).
- Código morto/cutover `financialRepositorySync` não é writer LIVE.

---

## 21. Gate

```
PHASE_11F_GATE = FINANCIAL_WRITE_SURFACE_TENANT_CLOSED
PHASE_11F_STATUS = PASS_WITH_NOTES
```

Critérios 1–20 do prompt: atendidos para o **core financeiro LIVE**. Notes = leftovers `finance:write` fora do core (§27) + unscoped-without-session + dashboard caixa legado + partial cancel de produto.

Commit sugerido:

`fix(finance): close remaining financial write surfaces`

---

## Métricas obrigatórias

```
PHASE_11F_STATUS = PASS_WITH_NOTES
BASELINE_HEAD = d24eb3e
FINAL_HEAD = (após commit)

FINANCIAL_WRITE_SURFACE_MAPPED = YES

LEGACY_FINANCE_WRITE_OCCURRENCES_BEFORE = 27
LEGACY_FINANCE_WRITE_OCCURRENCES_AFTER = 18
FINANCIAL_ACTIVE_WRITERS_USING_LEGACY_FINANCE_WRITE = 0

CREATE_RECEIVABLE_CHARGE_ACTIVE = YES
CREATE_RECEIVABLE_CHARGE_PERMISSION_BEFORE = finance:write
CREATE_RECEIVABLE_CHARGE_PERMISSION_AFTER = financeiro_boletos:create
CREATE_RECEIVABLE_CHARGE_TENANT_BOUND = PASS
CREATE_RECEIVABLE_CHARGE_IDEMPOTENCY = PASS

BOLETO_REMINDER_ACTIVE = YES
BOLETO_REMINDER_PERMISSION_BEFORE = finance:write
BOLETO_REMINDER_PERMISSION_AFTER = financeiro_boletos:resend
BOLETO_REMINDER_TENANT_BOUND = PASS
BOLETO_EXTERNAL_SIDE_EFFECT_EXECUTED = NO

LEGACY_RECEIVABLE_READ_POLICY = DERIVE_FROM_PATIENT_OR_OMIT
LEGACY_UNOWNED_RECEIVABLE_VISIBLE_IN_TENANT_LIST = NO
LEGACY_UNOWNED_RECEIVABLE_INCLUDED_IN_TENANT_KPI = NO

DIRECT_FINANCIAL_STORE_WRITES = NONE_ACTIVE_OUTSIDE_CANONICAL_SERVICES
DIRECT_PAYMENT_BYPASS = NONE
DIRECT_RECEIVABLE_LIFECYCLE_BYPASS = NONE
DIRECT_FINANCING_LIFECYCLE_BYPASS = NONE

FINANCIAL_RBAC_FAIL_CLOSED = PASS
FINANCIAL_TENANT_READ_BOUNDARY = PASS
FINANCIAL_TENANT_WRITE_BOUNDARY = PASS

PARTIAL_CANCEL_POLICY = FAIL_CLOSED_REQUIRES_PRODUCT_DECISION

RECEIVABLE_CREATION_REGRESSION = PASS
PAYMENT_IDEMPOTENCY_REGRESSION = PASS
REVERSAL_REGRESSION = PASS
RECEIVABLE_LIFECYCLE_REGRESSION = PASS
FINANCING_LIFECYCLE_REGRESSION = PASS

AUTOMATIC_FINANCIAL_SIDE_EFFECTS_FROM_CONTRACTS = NONE

MONEY_STORAGE_MODEL_CHANGE = NONE
SUPABASE_CUTOVER = NO
MIGRATION_APPLIED = NO
BACKFILL_APPLIED = NO

HISTORICAL_RECEIVABLES_CHANGED = NO
HISTORICAL_PAYMENTS_CHANGED = NO
HISTORICAL_FINANCINGS_CHANGED = NO

TYPECHECK_NEW_11F_FAILURES = NONE

TESTS_ADDED = src/__tests__/phase11fFinancialWriteSurfaceTenantIntegrity.test.js (T1–T24)
TESTS_PASS = 228 (regressão 11.F + 11.B–E + finance/contracts/cutover)
TESTS_FAIL = 0

P0_FIXED =
  - finance:write removido dos writers LIVE de charge/boleto/reminder
  - createReceivableCharge tenant-bound + idempotente
  - reminder tenant-bound + sem side-effect externo
  - listReceivables/KPIs omitem legado unowned

P0_DEFERRED =
  - finance:write em payables/cash/commissions/suppliers/financeService (fora do core)
  - partial cancel CR continua decisão de produto
  - dashboard transactions/cashTransactions unscoped
  - listagens sem user permanecem unscoped (compat)

PRODUCTION_CHANGED = NO
```
