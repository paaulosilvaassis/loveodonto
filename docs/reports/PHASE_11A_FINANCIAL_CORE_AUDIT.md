# PHASE 11.A — FINANCIAL CORE AUDIT REPORT

**Modo:** AUDITORIA READ-ONLY  
**Data:** 2026-08-31  
**PHASE_10.23:** CLOSED (`be054ba`) — não reaberta  
**Contratos:** não modificados  
**PRODUCTION_CHANGED = NO** · **DATABASE_CHANGED = NO** · **FINANCIAL_CODE_CHANGED = NO**

Nenhum PII. Nenhum secret. Sem migration/backfill/deploy.

---

## 1. Executive Summary

O Love Odonto **possui uma cadeia financeira real**, mas ela **não é um ledger único reconciliável**.

Cadeia LIVE observada no código:

```
orçamento clínico (embedded em clinicalAppointments[].budget)
  → aprovação (APROVADO)
    → PATH A: accountsReceivable imediatos (à vista / parcelado clínica)
    → PATH B: financings (proposta) → approveFinancing → receivables + financingInstallments + boletos
      → registerReceivablePayment / registerFinancingPayment
        → receivablePayments (+ alocação de financiamento)
          → caixa NÃO recebe a baixa de CR (só payables/avulso)
            → DRE competência + DRE caixa + dashboard (fontes distintas)
```

**SSOT operacional hoje = IndexedDB** via services `*Service.js`.  
Tabelas Supabase `financial_*` existem (migration 021 + RLS 023) mas **flags V3 estão OFF em produção** (`applyProductionSafeLocks`). Dual-write de payment/installment/cash **não está ligado**.

A pergunta central:

> O Love Odonto possui hoje uma cadeia financeira consistente, rastreável, tenant-safe e reconciliável desde o orçamento aprovado até a liquidação?

**Resposta:** **parcialmente**. Origem orçamento→obrigação existe e é rastreável por `budget.id` no PATH A. Reconciliação, idempotência, tenant em financiamento, caixa, estorno e RBAC writer **não fecham o ciclo**.

**AUTOMATIC_FINANCIAL_SIDE_EFFECTS (contratos) = PASS** — confirmado: cancel/abort/void/reissue/sign **não** mutam financeiro.

---

## 2. Git / Baseline

```
BRANCH = main
CURRENT_HEAD = be054bad5bd57dc44f6b85473659363305a775a4
EXPECTED_BASELINE = be054ba
DELTA_FROM_BASELINE = NONE (HEAD idêntico)
ORIGIN_MAIN_SYNC = YES (no fechamento 10.23; inspeção 11.A no mesmo commit)
```

**PREEXISTING_UNRELATED_CHANGES** (não tocados): SMTP / patient-email leftovers, `tsconfig.tsbuildinfo`, `.DS_Store`, shots `_phase1021*`, docs 10.21AL / 10.23A.

Nenhum `git reset` / `clean` / `restore` / commit.

---

## 3. Financial Architecture

Há **três mundos** no mesmo produto:

| Mundo | Onde | Papel LIVE |
| --- | --- | --- |
| **A — Clínico moderno** | `clinicalAppointments[].budget` → `clinicalBudgetFinance.js` → `accountsReceivable` / `financings` | **Cadeia principal de tratamento** |
| **B — Financeiro de tela** | `FinanceReceivablesPage` cria títulos manuais (`origin_type=manual_entry`) | Paralelo, sem orçamento |
| **C — Legado** | `transactions` + `installmentPlans` + `FinancePage.jsx` | Ainda ativo; entra no dashboard e no caixa |

Repository V3 (`src/repositories/financial/*`) + Admin API (`server/lib/financialApi*.js`) = **cutover preparado, não authority**.

---

## 4. Current SSOT

| ENTITY | INDEXEDDB | SUPABASE | OTHER | CURRENT_SSOT | DUAL_WRITE | SYNC_MECHANISM | CONFLICT_STRATEGY | AUTHORITATIVE_WRITER |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Budget clínico | `clinicalAppointments[].budget` | não (refs opacas) | — | **IDB nested** | NO | — | — | `saveBudget` / `updateBudgetStatus` |
| Budget CRM | `crmBudgets` | — | — | IDB | NO | — | — | `crmBudgetService` |
| Contract | `generatedContracts` | ledger V2 parkado | — | IDB LIVE | N/A 10.23 | — | — | lifecycle 10.23 |
| Receivable | `accountsReceivable` | `financial_accounts_receivable` | — | **IDB** | preparado, **OFF** | flags | mapper status `open`≠`pending` | `createReceivable` |
| Financing | `financings` | `financial_financings` | — | **IDB** | preparado, **OFF** | flags | status enums divergentes | `createFinancingProposal` / `approveFinancing` |
| Installment | `financingInstallments` | **sem tabela no 021** | — | **IDB only** | NO | — | — | `createFinancingInstallment` |
| Payment | `receivablePayments` | **sem writer** | — | **IDB only** | stub NO-OP | — | — | `registerReceivablePayment` |
| Transaction legado | `transactions` | — | — | IDB | NO | — | — | `financeService.createTransaction` |
| Cash | `cashRegisters` + `cashTransactions` | docs futuras | — | IDB | NO | — | — | `openCashRegister` / `payPayable` |
| Platform invoice | `invoices` | platform billing | SaaS master | fora do CR clínico | — | — | — | `invoiceService` (MASTER) |

---

## 5. IndexedDB vs Supabase

**IndexedDB:** ACTIVE_SSOT para todo o CR/CP/financing/payment/cash clínico.

**Supabase `financial_*`:** schema + RLS existem; client **não** chama `supabase.from` financeiro. Só Admin API quando flags ON.

**DUAL_WRITE produção:** locked false (`financialRepositoryFlags.ts` `applyProductionSafeLocks`).

**INDEXEDDB_FINANCIAL_DEPENDENCY = ACTIVE_SSOT**  
**SUPABASE_FINANCIAL_DEPENDENCY = PREPARED_NOT_AUTHORITATIVE** (receivable/payable/financing headers only; sem payments/parcelas)

---

## 6. Budget Lifecycle

Writer: `saveBudget` (`clinicalService.js`). Status: `RASCUNHO | ENVIADO | NEGOCIACAO | APROVADO | CONTRATO_GERADO | HISTORICO | REPROVADO | CANCELADO`.

Aprovação UI: `ClinicalBudgetSection.handleConfirmApprove` → `updateBudgetStatus(APROVADO)` → `processApprovedBudgetFinance` → `saveBudget({ skipLockCheck: true })`.

`createBudget` em `budgetsService.js` está **quarentenado**.

`saveBudget` persiste `totalValue = Σ(qty × unitValue)` **sem** desconto de item — o valor comercial da obrigação usa `calcOptionFinalValue` na geração financeira (duas fórmulas).

---

## 7. Budget → Receivable Flow

**RECEIVABLE_ORIGIN_IS_REAL_BUDGET_ID = YES** no PATH A (`origin_id = budget.id`, `budget_id`, `treatment_plan_id`). Não é ID de display.

**PATH A** (`accepted.type !== 'financiamento'`): `createReceivablesFromApprovedBudget` cria entrada (`installment_number=0`) + N títulos. **Sem checagem de duplicata.** `createReceivable` sempre `createId('recv')`.

**PATH B:** `createFinancingFromApprovedBudget` — idempotente se `budget.financingId` já existe. Receivables nascem só em `approveFinancing`. Nesses títulos: `origin_id = financing.id`, `treatment_plan_id = budget.id`, **`budget_id` não setado**.

**Gatilho:** automático na aprovação (não na assinatura).

**Idempotência PATH A:** UI impede re-aprovar (`validateBudgetForApproval`). Writer **não**. Chamada direta duplica títulos. Catch em `createReceivablesFromApprovedBudget` **engole erro** (produção silenciosa).

**BUDGET_TO_RECEIVABLE_FLOW = FAIL** (fluxo existe, mas não é idempotente nem fail-closed no writer).

---

## 8. Financing / Installments

`calculateFinancingSummary` (`financingCalculator.js`): centavos internos (`splitInCents`) — soma das parcelas = `netFinancedAmount`.

`approveFinancing` gera 1 receivable + 1 installment por parcela + entrada opcional + boletos.

**BUDGET_MUTATION_AFTER_FINANCIAL_CREATION = ALLOWED (comercial frozen se APROVADO; lock duro é contrato, não financeiro).** `createNewBudgetForAppointment` arquiva orçamento → `HISTORICO` **sem cancelar receivables**.

`createFinancingProposal` **não grava `tenant_id`** no row IDB. Coleção `financings` **fora** de `TENANT_GUARDED_COLLECTIONS`.

**RECEIVABLE_TO_INSTALLMENTS = PASS** no PATH B (1:1 `receivable_id`). PATH A **não usa** `financingInstallments` — cada parcela **é** um receivable.

---

## 9. Payment Lifecycle

`registerReceivablePayment`: soma `amount_received` no título; `remaining = max(net - received, 0)`. Overpay: remaining 0, received pode exceder net. **Não** distribui entre irmãos.

`registerFinancingPayment` → payment no receivable da parcela + `financingPaymentAllocations` + `refreshFinancingTotals`.

**PAYMENT_IDEMPOTENCY = NONE** (sempre novo `rvpay`; UI sem lock de submit). `financialWriteIdempotency.ts` só repository V3 (OFF).

Caixa: comentário “estrutura futura” em `receivablesService.js` — **baixa de CR não cria `cashTransactions`**.

**INSTALLMENTS_TO_PAYMENTS = PASS** (PATH B aloca na parcela alvo). PATH A: pagamento é no título-parcela, sem entidade installment.

**PAYMENT_RECONCILIATION = FAIL** (overpay; estorno não desfaz received; sem matching SUM(payments) enforced).

---

## 10. Reversal / Cancellation

**REVERSAL_MODEL = ALLOCATION_SOFT_ONLY** para financiamento (`reverseFinancingPaymentAudit`). **Não** reduz `received_amount`, **não** remove `receivablePayments`, **não** cria movimento de caixa inverso.

`cancelReceivable`: soft `canceled`; **bloqueia se já paid** (“Utilize estorno/renegociação”) — mas estorno de payment **não existe**.

Cancel orçamento: status `CANCELADO` / novo ciclo `HISTORICO` — **não cancela receivables**.

**CANCEL_BUDGET_WITH_RECEIVABLE = orçamento some do ciclo; financeiro permanece.**  
**EDIT_BUDGET_WITH_RECEIVABLE = comercial frozen se APROVADO; writer `saveBudget` ainda existe.**  
**DELETE_BUDGET_WITH_RECEIVABLE = sem deleteBudget; nested no appointment.**

---

## 11. Money / Rounding Model

**MONEY_REPRESENTATION = FLOAT_BRL** persistido (`Number` / `parseFloat`). Supabase core: `numeric(14,2)`. Platform billing: `amount_cents` (domínio separado).

**ROUNDING_STRATEGY = MISTA**

- PATH A: `installmentValue.toFixed(2)` em todas as parcelas — **sem** resto na última. Soma pode divergir ± N×R$0,01 do saldo.
- PATH B / UI split manual: `splitInCents` (resto nas primeiras).
- Financing calculator: `Math.round(x*100)/100`.

**ROUNDING_RISK = HIGH** no PATH A (orçamento parcelado clínica). Scenario J: PATH B PASS; PATH A FAIL/UNKNOWN drift.

Desconto: `Math.max(0)` nas opções; aprovação bloqueia `finalValue <= 0`; `createReceivable` exige `original_amount > 0`. **TOTAL < 0 na obrigação: bloqueado no fluxo normal.**

---

## 12. Financial Status Matrix

Não normalizado. LIVE IDB:

| ENTITY | STATUS (exatos) | WRITER principal | SIDE_EFFECTS |
| --- | --- | --- | --- |
| receivable | pending, due_today, upcoming, overdue, partially_paid, paid, canceled, renegotiated | create/update/payment/cancel; status **recomputado** na listagem por due_date | commission sync best-effort |
| installment | pending, due_today, upcoming, overdue, partially_paid, paid, canceled, renegotiated | patch + `computeReceivableStatus` (enum de receivable) | mistura de enum |
| payment row | (sem status; linha append-only) | registerReceivablePayment | — |
| allocation | applied, reversed | financingPaymentAllocations | não reabre título |
| financing | draft, pending_analysis, approved, active, partially_paid, paid_off, overdue, renegotiated, canceled, defaulted | proposal/approve/pay/cancel | cria receivables na approve |
| payable | pending, scheduled, paid, overdue | payablesService | cash se caixa aberto |
| cash register | open, closed | openCashRegister | UI sem close |
| transaction legado | aberto, pago, vencido | financeService | dashboard |
| budget clínico | RASCUNHO…CANCELADO | clinicalService | dispara finance só em APROVADO |
| V3 mapper | open, partial, paid, overdue, cancelled | repository (OFF) | conflito semântico com LIVE |

Transições: **não há state machine**. Status de CR é função de saldo + due_date + canceled/renegotiated persistidos.

---

## 13. Referential Integrity

| Relação | Classificação |
| --- | --- |
| PATIENT → BUDGET | LOGICAL (budget vive no appointment do paciente) |
| BUDGET → RECEIVABLE | APPLICATION (`origin_id`/`budget_id` = `budget.id`) — **sem FK** |
| BUDGET → FINANCING | APPLICATION (`budget_id`, `financingId` no budget) |
| FINANCING → RECEIVABLE | APPLICATION (`origin_id`, `financing_id`) |
| FINANCING → INSTALLMENT | APPLICATION (`financing_id`) |
| INSTALLMENT → RECEIVABLE | APPLICATION (`receivable_id`) |
| RECEIVABLE → PAYMENT | APPLICATION (`receivable_id`) |
| BUDGET → CONTRACT | APPLICATION (`budgetId` no contrato; `quoteId` = **appointmentId**) |
| CONTRACT → RECEIVABLE | LOGICAL opcional (`contract_id` no título; PATH A **não preenche**) |
| Supabase financial_* → patient/budget | TEXT opaco; **sem FK** (migration 021) |

**DATABASE_FK = NONE** no LIVE IDB. Postgres FKs só `tenant_id → tenants` nas `financial_*`.

---

## 14. Tenant Isolation

`resolveTenantIdForWrite(user, payload.tenant_id)`: sessão obrigatória; payload reconfirmado com `assertSameTenant`.

`createReceivable.tenant_id`: AUTH_CONTEXT (+ payload check).

`registerReceivablePayment`: lookup **só por id**; tenant herdado do título. **Sem** `assertSameTenant` no título vs sessão.

`listReceivables`: **sem filtro tenant**.

`financings` row: **sem tenant_id**. Guard IDB **não inclui** financings/installments/cashRegisters.

Supabase RLS (023): select se `app_user_can_access_tenant`; modify se tenant admin. **Não exerce** enquanto flags OFF.

**FINANCIAL_TENANT_BOUNDARY_MATRIX (resumo):**

| WRITER | TENANT_SOURCE | MEMBERSHIP_CHECK | RISK |
| --- | --- | --- | --- |
| createReceivable | AUTH_CONTEXT | assertSameTenant se payload | MEDIUM |
| registerReceivablePayment | LOCAL_CONTEXT (título) | não revalida sessão vs título | HIGH |
| listReceivables | NONE | — | HIGH se IDB multi-tenant |
| createFinancingProposal | UNKNOWN no row | evento usa AUTH | HIGH |
| openCashRegister | NONE | — | HIGH |
| financialApiWrite | SERVER (Admin API) | tenant path | OK se usado |
| Finance UI | CLIENT_PROVIDED ids | role de rota | UI ≠ isolation |

**FINANCIAL_TENANT_ISOLATION = FAIL** na camada LIVE (list/financing/payment-by-id). Mitigação de facto: um IDB por browser/clínica — **não é garantia de produto**.

**FINANCIAL_CROSS_TENANT_PATHS = FAIL** (estático: ID lookup sem tenant). Não executado contra produção.

Scenario H: **FAIL** no writer LIVE; **PASS** no RLS remoto se API fosse a authority.

---

## 15. RBAC

UI rotas: `admin | gerente | financeiro` (`menuConfig`). Pages **não** chamam `can('financeiro_contas_receber:edit')` antes de receber.

Writers: `requirePermission(user, 'finance:write')` → `canByPermission` → módulo **`finance`** ação **`edit`**.

Catálogo oficial: `financeiro_contas_receber`, **não existe módulo `finance`**.

Bypass: `admin` / `master`. Role `financeiro` tem `financeiro_contas_receber:edit` mas **não** `finance:edit`. Role `gerente` herda `administrativo` — **sem** financeiro_*. Role `dentista` aprova orçamento mas **não** tem finance:write.

**FINANCIAL_RBAC_UI_WRITER_MISMATCHES = YES**

- UI mostra Financeiro para `financeiro`/`gerente`; writer nega (exceto admin/master).
- Dentista aprova orçamento; `createReceivable` pode lançar; erro **engolido** → APROVADO sem títulos.

UI is not authority — evidenciado.

---

## 16. Contract × Financial Boundary

Leitura: `buildSnapshots` / `matchesBudgetFinanceRow` copia receivables/financings para evidência contratual.

Writers 10.23: `financialAction` é **metadata de auditoria** (`keep` default). Sem mutação de `accountsReceivable`.

**AUTOMATIC_FINANCIAL_SIDE_EFFECTS_FROM_CONTRACTS = NONE**  
**AUTOMATIC_FINANCIAL_SIDE_EFFECTS = PASS**

Nenhuma ocorrência de VOID/REISSUE/SIGNED criando ou apagando cobrança. Não CRITICAL neste eixo.

`linkFinancingToClinicalContract` é vínculo **manual** de ID, não lifecycle.

---

## 17. Clinical × Financial Boundary

Planejar procedimento / executar / concluir atendimento: **não** cria cobrança.

Somente **aprovar orçamento** (e depois **aprovar financiamento** no PATH B).

Cobrança avulsa: `FinanceReceivablesPage` / `createReceivableCharge` (régua sobre título existente).

---

## 18. Cash / Cashflow

Caixa **existe**: `cashRegisters` (open/closed), `cashTransactions`, página `/financeiro/caixa`.

Pagamento de **CR não entra no caixa**. `payPayable` / `createAvulsoPayment` sim, se caixa aberto.

`getCashSummaryForDate` mistura `transactions` legado + `cashTransactions`.

UI: abrir + resumo; **sem fechar** na page.

Taxa de cartão: **não** há `VALOR_LIQUIDO_CLINICA` vs `VALOR_PAGO_PACIENTE` no CR. Formas: dinheiro, PIX, boleto, débito, crédito, link, transferência, convênio, cheque, carteira digital, outros.

---

## 19. Reports / Dashboard

| Relatório | SOURCE | DATE_BASIS | Regime |
| --- | --- | --- | --- |
| DRE competência | `financeDreService` | saleDate/created/issue | competência (títulos) |
| DRE caixa / liquidez | `financeDreCashLiquidityService` | data de pagamento | caixa |
| Dashboard mês | `dashboardMetricsService` | payments + transactions + cash income | **caixa misturado com legado** |
| KPIs recebíveis | `getReceivablesKPIs` | due_date mês | saldo de títulos |
| Faturamento page | getFinancing / getReceivable / payments | — | leitura |

**Dashboard e DRE não compartilham a mesma fórmula.** Inadimplência: `due_date < todayIso` (ISO date, timezone local do `toISOString().slice(0,10)` — risco UTC).

Status vencido: **calculado na leitura**, não só persistido.

---

## 20. Audit Trail

Pagamento: row `receivablePayments` (who=`created_by`, when, amounts, method) + domain event `PAYMENT_RECEIVED` (dedup por eventId **novo a cada click**).

Financiamento: `financingEvents` timeline.

Desconto: campo no payment/receivable; **sem evento dedicado**.

Estorno: timeline `PAYMENT_REVERSED` nas alocações; título **não** volta.

**FINANCIAL_AUDIT_TRAIL = PARTIAL** — WHO/WHEN/WHAT no payment create; WHAT_BEFORE/WHY incompletos; estorno não reconstrói saldo.

Não é possível reconstruir contabilmente uma liquidação após “estorno” de financiamento.

---

## 21. Hard Delete Paths

| Função | HARD_DELETE | Notas |
| --- | --- | --- |
| deletePayment | NÃO EXISTE | — |
| deleteReceivable | NÃO (só cache TS) | cancel soft |
| deleteInstallment | NÃO | — |
| deleteFinancing | NÃO (cache TS) | cancel |
| deleteBudget | NÃO | nested |
| deleteTransaction | NÃO | — |
| deletePayable | **SIM** splice se não pago | payablesService |

**PAYMENT_HARD_DELETE_PATHS = NONE** (serviço LIVE)  
**FINANCIAL_HARD_DELETE_PATHS = deletePayable (não pago)**

Risco crítico de evidência: **não** há hard delete de payment liquidado; o risco é o **oposto** — estorno fantasma (histórico pago permanece).

---

## 22. Critical Scenarios A–J

| ID | Classificação | Evidência |
| --- | --- | --- |
| A soma parcelas = saldo+juros | PATH B **PASS** (`splitInCents`); PATH A **FAIL** (`toFixed` igual em todas) | clinicalBudgetFinance vs financingCalculator |
| B pagamento parcial | **PASS** remaining/status | registerReceivablePayment |
| C duplo clique Receber | **FAIL** | sem idempotency |
| D estorno rastreável | **FAIL** | alocação reversed; payment/saldo intactos |
| E orçamento alterado pós-financeiro | **FAIL** / P1 | novo ciclo não cancela títulos; APROVADO freeze só UI comercial |
| F contrato VOID | **PASS** | 10.23I + código void sem AR |
| G contrato REISSUE | **PASS** | não duplica receivable |
| H tenant A paga ID de B | **FAIL** LIVE (lookup id); RLS remoto OK se fosse SSOT | |
| I SUM(payments) vs devido | **FAIL** | overpay; sem assert SUM; estorno |
| J centavos última parcela | PATH B **PASS**; PATH A **FAIL** | |

---

## 23. Existing Tests

Cobertura **de cutover/flags/API** (`financialWriteCutover`, `financialApiWrite`, `financialRepositoryFoundation`) e **financing calculator** (`financing.test.js`).

**Não há** teste dedicado de: idempotência de `processApprovedBudgetFinance`, double-click payment, tenant em `listReceivables`, RBAC `finance:write` vs `financeiro_*`, VOID×AR (além snapshot 10.23).

`tenantIsolation.test.js` **não** cobre writers financeiros.

Budget tests focam contrato/CTA, não obrigação financeira.

---

## 24. Findings by Severity

### P0 — CRITICAL

1. **Cobrança duplicável** — `createReceivablesFromApprovedBudget` sem idempotência; `createReceivable` sempre novo ID.
2. **Pagamento duplicável** — `registerReceivablePayment` sem chave de idempotência; UI sem debounce.
3. **RBAC writer órfão** — `finance:write` ≠ catálogo `financeiro_*`; dentista/financeiro/gerente: UI e writer divergem; catch silencioso após APROVADO.
4. **Estorno incompleto** — marca alocação reversed e deixa título pago.
5. **Tenant gap em financing + list/pay-by-id** — operação cross-tenant possível no modelo de dados LIVE.

### P1 — HIGH

1. PATH A arredondamento `toFixed` sem remainder.
2. Orçamento HISTORICO/CANCELADO não encerra financeiro.
3. Caixa desconectado de CR.
4. Dois ledgers (`transactions` + `accountsReceivable`) no dashboard.
5. Overpay sem crédito/redistribuição.
6. Status installment usa `computeReceivableStatus`.

### P2 — MEDIUM

1. Supabase financial_* sem payments/installments; dual-write OFF.
2. Mapper V3 status ≠ LIVE.
3. `financeGenerated` morto.
4. DRE vs dashboard fórmulas diferentes.
5. `contract_id` vazio no PATH A.

### P3 — LOW

1. `FinancePage` legado ainda mutável.
2. Import morto `createReceivablesFromApprovedBudget` em `ClinicalAppointmentPage`.
3. `invoiceService` é billing de plataforma, não CR clínico.

---

## 25. Technical Debt

- Nested budget vs coleção `clinicalBudgets` (testes vs schema).
- Quarentena `budgetsService` / `public.budgets`.
- Flags V3 locked; payments fora do remote SSOT.
- Enum soup (PT UI, EN LIVE, V3 cancelled vs canceled).
- `TENANT_GUARDED_COLLECTIONS` incompleto para o módulo financeiro moderno.

---

## 26. Production Risks

- Clínica aprova orçamento e **não gera títulos** (RBAC + swallow) → tratamento “aprovado” sem CR.
- Operador clica Receber 2× → caixa mental duplicado (sem caixa real).
- Relatórios mostram números que **não batem** (DRE competência vs dashboard caixa+legado).
- Troca de orçamento deixa títulos do ciclo anterior **vivos**.
- Cutover READ_PRIMARY prematuro quebraria status (`pending` vs `open`).

---

## 27. Recommended Architecture (não implementar agora)

Um **FinancialObligation** por ciclo de orçamento (`budget.id` + `obligationId` estável).

Parcelas e pagamentos append-only; estorno = movimento reverso.

SSOT único (hoje IDB até cutover honesto). Payments e installments no mesmo SSOT que o título.

Tenant obrigatório em **toda** coleção financeira; list/get **sempre** scoped.

Writer auth = catálogo `financeiro_*`.

Caixa: todo payment CR gera `cashTransactions` se sessão aberta, ou fila explícita.

Contrato continua **desacoplado** (manter invariante 10.23).

---

## 28. Recommended Phase 11 Waves

- **11.B** — identidade da obrigação + idempotência budget→AR + não engolir erro + alinhar `requirePermission` ao catálogo.
- **11.C** — payment idempotency + estorno append-only que reconcilia saldo.
- **11.D** — tenant em financings/lists + guardar coleções + testes cross-tenant.
- **11.E** — rounding PATH A = splitInCents; freeze comercial no writer pós-financeiro.
- **11.F** — caixa ligado a CR; aposentar ou isolar `transactions` legado nos relatórios.
- **11.G** — cutover Supabase só depois de payments/installments no schema e status unificado.

---

## 29. Required Migrations (RECOMENDAR ONLY)

YES para um SSOT remoto completo: `financial_receivable_payments`, `financial_financing_installments`, `financial_cash_*`, `tenant_id` consistente, FKs lógicas quando IDs deixarem de ser text opaco.

**NÃO executar nesta fase.**

Schema 021 atual **não** cobre liquidação. Cutover WRITE_PRIMARY hoje **perderia pagamentos**.

---

## 30. Required Backfills (RECOMENDAR ONLY)

UNKNOWN até 11.B medir produção IDB:

- Títulos duplicados do mesmo `budget.id`.
- `financings` sem `tenant_id`.
- Orçamentos APROVADO sem receivable/financing (RBAC swallow).

**NÃO executar.** Sem reconstrução cega de histórico.

---

## 31. First Implementation Candidate (11.B — NÃO IMPLEMENTAR AQUI)

**Fechar a identidade da obrigação financeira na aprovação do orçamento:**

1. Recusar `processApprovedBudgetFinance` / `createReceivablesFromApprovedBudget` se já existirem títulos com `origin_id === budget.id`.
2. Não engolir `createReceivable` (fail-closed; orçamento não pode ficar APROVADO “achando” que gerou CR).
3. Trocar `requirePermission(user, 'finance:write')` nos writers CR/financing/payment para o módulo real `financeiro_contas_receber:edit` (e equivalentes CP/caixa), alinhado à UI.

Isso ataca P0 de duplicação + P0 de RBAC/silent fail **sem** migration e **sem** tocar contratos.

---

## FINANCIAL_FILE_INVENTORY (classificado)

DOMAIN: `clinicalBudgetConstants.js`, `auditEventCatalog.js` (enums), `financingCalculator.js`, `budgetUtils.js`  
SERVICE: `clinicalService.js`, `clinicalBudgetFinance.js`, `clinicalBudgetFinancingIntegration.js`, `receivablesService.js`, `financingsService.js`, `financingInstallmentsService.js`, `financingPaymentAllocationsService.js`, `payablesService.js`, `cashRegisterService.js`, `financeService.js`, `financeDreService.js`, `financeDreCashLiquidityService.js`, `dashboardMetricsService.js`, `financialWriteAdapter.js`, `financialReadAdapter.js`  
REPOSITORY: `src/repositories/financial/*`  
API: `financialAdminApi.js`, `server/lib/financialApiWrite.js`, `server/lib/financialApiList.js`  
DATABASE: `src/db/schema.js` (coleções IDB)  
MIGRATION: `supabase/migrations/021_app_financial_core.sql`, `023_app_appointments_financial_crm_rls.sql`  
UI: `FinanceReceivablesPage.jsx`, `FinanceFinanciamentoPage.jsx`, `FinancePayablesPage.jsx`, `FinanceCashRegisterPage.jsx`, `FinanceDREPage.jsx`, `FinancePage.jsx`, `FinanceFaturamentoPage.jsx`, `ClinicalBudgetSection.jsx`, `BudgetPaymentConditions.jsx`  
STORE: IndexedDB via `withDb` (não Redux financeiro)  
TEST: `financing.test.js`, `finance*.test.js`, `financial*.test.js`, `budget*.test.js`  
LEGACY: `financeService.js` / `FinancePage.jsx` / `transactions`  
INTEGRATION: `clinicalBudgetFinancingIntegration.js`, `commissionCalculationService.js`  
QUARANTINE: `budgetsService.js`, `quarantine/budgetsService.deprecated.js`

---

## Gate 11.A — respostas com evidência

1. Obrigação nasce na **aprovação do orçamento** (PATH A imediato / PATH B após approveFinancing) ou **manual** na tela de CR.  
2. PATH A: `origin_id`/`budget_id` = `budget.id`. PATH B: `treatment_plan_id` = budget.id; `origin_id` = financing.id.  
3. Comercial: `calcOptionFinalValue`; persistência budget: Σ qty×unit; CR: `net = original - discount + interest + fine`.  
4. PATH B: splitInCents. PATH A: toFixed uniforme — **pode não reconciliar**.  
5. Payment incrementa `received_amount`; sem SUM enforced; overpay ok.  
6. Estorno = reverse allocation only.  
7. UI role-gated; writer `finance:write` (admin/master de fato).  
8. Tenant no createReceivable via sessão; **não** em list/financing/pay-by-id.  
9. SSOT = IndexedDB services.  
10. Sim, IDB é SSOT.  
11. Supabase **não** é autoridade LIVE.  
12. Dual-write **preparado e locked OFF**; payments nunca dual-write.  
13. Hard delete: payable não pago; payments não.  
14. Sim: re-call PATH A e double-click payment.  
15. Contratos **desacoplados** do lifecycle financeiro.  
16. Relatórios **não** usam a mesma fórmula.  
17. História de cobrança: **parcial** (payments append-only; estorno não fecha o livro).

**PHASE_11A_GATE = FINANCIAL_ARCHITECTURE_MAPPED**
