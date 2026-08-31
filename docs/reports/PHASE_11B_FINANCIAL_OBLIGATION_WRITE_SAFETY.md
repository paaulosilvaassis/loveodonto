# PHASE 11.B — FINANCIAL OBLIGATION IDENTITY & WRITE SAFETY REPORT

**Modo:** HARDENING PATH A (IndexedDB SSOT)  
**Data:** 2026-08-31  
**PHASE_10.23:** CLOSED (`be054ba`) — não reaberta  
**PHASE_11.A:** PASS_WITH_FINDINGS — não reexecutada como auditoria  
**PRODUCTION_CHANGED = NO** · **MIGRATION_APPLIED = NO** · **BACKFILL_APPLIED = NO** · **SUPABASE_CUTOVER = NO**

Nenhum PII. Nenhum secret. Sem deploy. Sem Phase 11.C.

---

## 1. Executive Summary

O PATH A (orçamento APROVADO → `createReceivablesFromApprovedBudget` → `accountsReceivable`) passou a ter **identidade lógica de obrigação**, **idempotência no writer**, **fail-closed na aprovação** e **RBAC canônico**.

Retry do mesmo orçamento no mesmo tenant **não cria título novo**. Orçamentos diferentes e tenants diferentes continuam independentes. Erro em `createReceivable` **propaga**. Aprovação **não consolida APROVADO** se a materialização financeira obrigatória falhar.

`FINANCIAL_SSOT` permanece IndexedDB. Flags Supabase não foram ligadas.

---

## 2. Baseline / Git Safety

```
BRANCH = main
CURRENT_HEAD (antes) = be054bad5bd57dc44f6b85473659363305a775a4
EXPECTED_BASELINE = be054ba
DELTA_FROM_BASELINE_BEFORE_11B = NONE
```

Nenhum `git reset` / `clean` / `restore`. Leftovers SMTP/patient-email **não** foram staged.

---

## 3. Files Audited

```
PHASE11B_TARGET_FILES =
  src/services/clinicalBudgetFinance.js
  src/services/receivablesService.js
  src/services/clinicalService.js                    (saveBudget / updateBudgetStatus — ordem)
  src/components/clinical/ClinicalBudgetSection.jsx
  src/services/clinicalBudgetFinancingIntegration.js (PATH B, regressão)
  src/services/financingsService.js                  (PATH B, regressão)
  src/permissions/permissions.js
  src/permissions/catalog.js
  src/permissions/roleDefaults.js
  src/services/accessService.js
  src/services/tenantWriteGuard.js
  src/services/tenantIsolation.js
  src/pages/FinanceReceivablesPage.jsx
  src/db/index.js                                    (TENANT_GUARDED accountsReceivable)
```

**Fluxo real encontrado (antes):**

1. UI `handleConfirmApprove` gravava `saveBudget` → `updateBudgetStatus(APROVADO)` **antes** do financeiro.
2. `processApprovedBudgetFinance` → se `accepted.type === 'financiamento'` ia ao PATH B; senão PATH A.
3. `createReceivablesFromApprovedBudget` envolvia `createReceivable` em `try/catch` que só fazia `console.debug` e devolvia o array **parcial**.
4. `createReceivable` sempre gerava `createId('recv')`, permission `finance:write` (módulo **inexistente** no catálogo).
5. `listReceivables` não filtrava tenant (havia `filters.tenantId` em testes de cutover, ignorado).

**Exceções reais de orçamento APROVADO sem CR PATH A (domínio existente, não inventadas):**

| Caso | Financeiro obrigatório PATH A? |
| --- | --- |
| `accepted.type === 'financiamento'` | Não — PATH B cria `financings` (proposta) |
| Sem opção aceita | Não — UI já bloqueia; service retorna vazio |
| `finalValue <= 0` | Não chega a aprovar (`validateBudgetForApproval`) |
| Cortesia / convênio como categoria | **Não existe** no domínio PATH A |

Fail-closed vale quando PATH A é obrigatório: opção aceita e `type !== 'financiamento'`.

---

## 4. Files Changed

- `src/services/clinicalBudgetFinance.js` — identidade, idempotência, tenant binding, `approveClinicalBudgetWithFinance`
- `src/services/receivablesService.js` — permission canônica, identidade PATH A, `installment_number` 0 preservado, `listReceivables` tenant filter
- `src/permissions/permissions.js` — `requirePermission` fail-closed para user/permission ausentes
- `src/components/clinical/ClinicalBudgetSection.jsx` — aprovação via orquestrador finance-first
- `src/pages/FinanceReceivablesPage.jsx` — passa `tenantId`/`user` para `listReceivables`
- `src/__tests__/phase11bFinancialObligationWriteSafety.test.js`
- `docs/reports/PHASE_11B_FINANCIAL_OBLIGATION_WRITE_SAFETY.md`

---

## 5. Previous Obligation Creation Flow

```
UI saveBudget
  → updateBudgetStatus(APROVADO)          // já consolidado
  → processApprovedBudgetFinance
      → createReceivablesFromApprovedBudget
          try { createReceivable × N } catch { console.debug }  // SWALLOW
      → return created (possivelmente [])
  → saveBudget(skipLock)
```

Estado proibido observado na 11.A: `BUDGET_STATUS = APROVADO` + obrigação ausente.

---

## 6. New Obligation Identity

```
PATH_A_FINANCIAL_IDENTITY =
  tenant_id
  + origin_type = treatment_plan
  + origin_id   = budget.id
  + installment_number   (0 = entrada; 1..N = parcela)
```

Não usa `patientId + amount`. Não usa botão disabled como proteção. Retry do mesmo componente devolve o título existente.

`installment_number: 0` deixou de ser coagido para `1` (`Number(x || 1)`), o que colidia entrada com parcela 1.

---

## 7. Idempotency

Proteção no writer (`createReceivablesFromApprovedBudget` + lookup em `createReceivable` para PATH A).

- Primeira chamada: cria exatamente os specs derivados (entrada se `down > 0` + parcelas com valor > 0).
- Segunda/terceira idênticas: `CREATE_NEW_RECEIVABLES = 0`. Não transforma retry em erro.
- Batch PATH A corre dentro de um `withDb` (atomicidade IndexedDB do lote). Nested `withDb` de `createReceivable` muta o mesmo clone; throw aborta o save.

---

## 8. Approval Fail-Closed

Novo orquestrador `approveClinicalBudgetWithFinance`:

1. `saveBudget` do conteúdo (status ainda não APROVADO)
2. `processApprovedBudgetFinance` com budget **em memória** `status = APROVADO`
3. Só então `updateBudgetStatus(APROVADO)` + `saveBudget(skipLockCheck)`

UI `ClinicalBudgetSection.handleConfirmApprove` usa este orquestrador.

Se o passo 2 lança, o status persistido **não** fica APROVADO.

---

## 9. Error Propagation

Removido o `try/catch` que engolia `createReceivable`.  
Caller recebe o erro. UI mostra toast; não há `catch {}` vazio no writer.

`CREATE_RECEIVABLE_ERRORS_SWALLOWED = NO`

---

## 10. RBAC Before / After

```
FINANCIAL_PERMISSION_BEFORE = finance:write
FINANCIAL_PERMISSION_AFTER  = financeiro_contas_receber:create
CANONICAL_FINANCIAL_PERMISSION = financeiro_contas_receber:create
```

`finance:write` mapeava para módulo `finance` + action `edit` (via `write→edit`). Esse módulo **não existe** no catálogo. Admin/master bypassavam; role `financeiro` (que tem `financeiro_contas_receber:*`) **falhava** no writer.

Não foi criado alias permissivo para preservar `finance:write`.

`requirePermission` agora DENY se `user` ou `permission` forem ausentes, além de `can() === false`.

Dentista sem CR create **não** conclui PATH A — isso é o fail-closed correto (antes o erro era engolido e o orçamento ficava APROVADO).

`registerReceivablePayment` / outros writers fora do PATH A **continuam** com `finance:write` (escopo 11.C / ondas seguintes).

```
FINANCIAL_RBAC_UI_WRITER_MISMATCHES_IN_SCOPE = NONE
```

---

## 11. Tenant Binding

`assertBudgetFinanceTenantBinding`:

- session tenant (authority local) via `requireSessionTenantId`
- budget/appointment/patient tenant
- mismatch → `TENANT_MISMATCH` (fail)

`createReceivable` continua usando `resolveTenantIdForWrite` (não confia cegamente em tenant da UI).

Identidade inclui tenant: Tenant A `budget=ABC` ≠ Tenant B `budget=ABC`.

---

## 12. listReceivables

```
LIST_RECEIVABLES_TENANT_FILTER = PASS
```

Filtro local: se `filters.tenantId` / `tenant_id` / `filters.user` resolver tenant, exclui linhas de **outro** tenant. Linhas **sem** `tenant_id` (legado) continuam visíveis para não quebrar cutover/read tests — não é backfill.

`FinanceReceivablesPage` passa `tenantId` da sessão.

`getReceivablesKPIs` permanece sem filtro (fora do escopo desta fase).

---

## 13. PATH B Regression

`approveFinancing` + entrada/parcelas continua gerando 1 entrada + N installments.  
`FINANCING_TENANT_SCHEMA_GAP = YES` — campo `tenant_id` em `financings` **não** foi improvisado.

---

## 14. Contracts Regression

`cancelUnsignedContract` e `voidSignedContract` não alteram `accountsReceivable` / `receivablePayments` / `financings`.

```
AUTOMATIC_FINANCIAL_SIDE_EFFECTS_FROM_CONTRACTS = NONE
```

---

## 15. Tests

Arquivo: `src/__tests__/phase11bFinancialObligationWriteSafety.test.js`

| Test | Result |
| --- | --- |
| T1 first materialization | PASS (3 títulos: entrada + 2 parcelas) |
| T2 exact retry | PASS (0 novos) |
| T3 processApprovedBudgetFinance retry | PASS |
| T4 dois budgets mesmo paciente/valor | PASS |
| T5 cross-tenant | PASS |
| T6 createReceivable failure propagated | PASS |
| T7 approval not silently APROVADO | PASS |
| T8 canonical permission | PASS |
| T9 missing permission | PASS |
| T10 unknown permission | PASS |
| T11 missing user | PASS |
| T12 tenant mismatch | PASS |
| T13 listReceivables tenant | PASS |
| T14 PATH B financing | PASS |
| T15 contract no financial side-effects | PASS |
| payment register regression | PASS |

Regressões: finance, financing, permissions, tenantIsolation, fullBudgetContractFlow, budgetContractStabilityGuards, stabilizationSmoke, 10.23I, financial write/read/cutover/audit/domain-events, 10.23E/F — PASS nas suites executadas.

---

## 16. Typecheck

`tsc -b` permanece com dívida histórica em `repositories` (CRM/collaborator/financialRepository import type). **Nenhum erro novo** em arquivos 11.B.

```
TYPECHECK_NEW_FINANCIAL_FAILURES = NONE
```

---

## 17. Deferred P0 Findings

- `PAYMENT_IDEMPOTENCY = DEFERRED_TO_11C`
- `REVERSAL_MODEL_FIX = DEFERRED_TO_11C`
- `FINANCING_TENANT_SCHEMA_GAP = YES` (fase própria; sem schema improvisado)
- Money FLOAT / rounding misto PATH A vs PATH B — não alterado
- Histórico duplicado **não** foi deduplicado
- Writers financeiros fora do PATH A ainda usam `finance:write`
- `getReceivablesKPIs` sem filtro tenant

---

## 18. Remaining Risks

- Atomicidade é **lógica** (IndexedDB `withDb` do lote + finance-before-status). Não há transação distribuída.
- Dual-write/domain events de `createReceivable` ainda disparam por título; flags OFF em produção.
- `saveBudget` clínico ainda não revalida tenant do appointment (T12 bloqueia no finance writer).
- Role dentista/comercial sem `financeiro_contas_receber:create` não completa PATH A (comportamento fail-closed explícito).
- Títulos históricos sem `tenant_id` ainda aparecem em `listReceivables` quando o filtro está ativo.

---

## 19. Git Diff

Ver `git diff --stat` / `git diff --cached --stat` no fechamento. Somente arquivos 11.B.

---

## 20. Gate

```
PHASE_11B_GATE = FINANCIAL_OBLIGATION_WRITE_SAFE
PHASE_11B_STATUS = PASS
```

Critérios 1–12 do prompt: PASS.
