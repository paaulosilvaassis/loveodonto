# Phase 5.13 — Financial Write Cutover (Wave 1)

**Status:** CONCLUÍDA (aguardando aprovação formal)  
**Baseline testes:** 1294 pass | 1 skip (pós 5.12)  
**Regressão final:** **1313 pass | 1 skip** (+19)  
**Commit:** não realizado

---

## 1. Auditoria dos métodos WRITE

| Service legado | Método | Authority atual | Dual-write wired | Primary write |
|----------------|--------|-----------------|------------------|-----------------|
| `receivablesService.js` | `createReceivable` | IndexedDB | ✅ microtask | ❌ |
| `receivablesService.js` | `updateReceivable` | IndexedDB | ✅ microtask | ❌ |
| `payablesService.js` | `createPayable` | IndexedDB | ✅ microtask | ❌ |
| `payablesService.js` | `updatePayable` | IndexedDB | ✅ microtask | ❌ |
| `payablesService.js` | `deletePayable` | IndexedDB | ✅ microtask | ❌ |
| `financingsService.js` | `createFinancingProposal` | IndexedDB | ✅ microtask | ❌ |
| `financingsService.js` | `updateFinancingTerms` | IndexedDB | ✅ microtask | ❌ |
| `receivablesService.js` | `registerReceivablePayment` | IndexedDB | ⏸ preparado | ❌ |
| financings (installments) | `receiveInstallment` | IndexedDB | ⏸ preparado | ❌ |

**Não wired nesta fase:** KPIs, DRE, cashflow, boletos, pagamentos (`payPayable`), charges, agregados.

---

## 2. Inventário dos métodos migrados

7 métodos core com infraestrutura dual-write:

1. `createReceivable`
2. `updateReceivable`
3. `createPayable`
4. `updatePayable`
5. `deletePayable`
6. `createFinancingProposal`
7. `updateFinancingTerms` (escopo: `updateFinancing`)

---

## 3. Matriz Método → Repository Write

| Método legado | Adapter | Repository | Admin API | Supabase table |
|---------------|---------|------------|-----------|----------------|
| `createReceivable` | `scheduleFinancialDualWriteCreateReceivable` | `createReceivableCore` | `POST /financial/receivables` | `financial_accounts_receivable` |
| `updateReceivable` | `scheduleFinancialDualWriteUpdateReceivable` | `updateReceivableCore` | `PUT /financial/receivables/:id` | `financial_accounts_receivable` |
| `createPayable` | `scheduleFinancialDualWriteCreatePayable` | `createPayableCore` | `POST /financial/payables` | `financial_payables` |
| `updatePayable` | `scheduleFinancialDualWriteUpdatePayable` | `updatePayableCore` | `PUT /financial/payables/:id` | `financial_payables` |
| `deletePayable` | `scheduleFinancialDualWriteDeletePayable` | `deletePayableCore` | `DELETE /financial/payables/:id` | `financial_payables` |
| `createFinancingProposal` | `scheduleFinancialDualWriteCreateFinancing` | `createFinancingCore` | `POST /financial/financings` | `financial_financings` |
| `updateFinancingTerms` | `scheduleFinancialDualWriteUpdateFinancing` | `updateFinancingCore` | `PUT /financial/financings/:id` | `financial_financings` |

---

## 4. Dual Write

Fluxo implementado (espelho Agenda 5.9):

```
Legacy Write (IDB) → retorno imediato ao usuário
        ↓ (queueMicrotask, se flags ON)
financialWriteAdapter
        ↓
financialRepository.*Core
        ↓
financialAdminApi (POST/PUT/DELETE)
        ↓
server/financialApiWrite → Supabase
        ↓
Resultado descartado (sem hydrate IDB)
```

Ativação: `FINANCIAL_READ && FINANCIAL_WRITE && FINANCIAL_DUAL_WRITE` via `isFinancialDualWriteEnabled()`.

---

## 5. Shadow Write

- Execução assíncrona via `queueMicrotask` no adapter.
- Falha remota: log DEV `[FINANCIAL_WRITE_ADAPTER]`, IDB preservado.
- `createFinancialWriteAuditEntry` com `syncResult: 'shadow'`.
- Opcionalmente dispara `scheduleFinancialShadowRead` pós-write quando `FINANCIAL_SHADOW`/`FINANCIAL_COMPARE` read ativos.

---

## 6. Write Compare

- `compareFinancialWriteLegacyVsRemote` em `financialRepositorySync.ts`.
- Ativo quando `FINANCIAL_WRITE_COMPARE=true`.
- Compara: IDs, tenant, patient, valores, datas, status, parcelas/refs financeiras (via shape compare receivable/payable/financing).
- Divergências: apenas `console.debug` em DEV — nunca altera comportamento.

---

## 7. Idempotência

Módulo `financialWriteIdempotency.ts`:

- `correlation_id` — `buildFinancialCorrelationId`
- `idempotency_key` — `buildFinancialIdempotencyKey(domain, tenant, legacyId, operation)`
- TTL in-memory 5 min — `shouldSkipDuplicateFinancialWrite` / `markFinancialWriteIdempotent`
- `retry_count` via `FinancialWriteMeta`
- `tenant_id` obrigatório em todos os `*Core` writes

---

## 8. Write Audit

Módulo `financialWriteAudit.ts` (in-memory, max 200 entradas):

| Campo | Presente |
|-------|----------|
| `write_source` | ✅ |
| `legacy_id` | ✅ |
| `remote_id` | ✅ |
| `correlation_id` | ✅ |
| `tenant_id` | ✅ |
| `timestamp` | ✅ |
| `retry_count` | ✅ |
| `syncResult` | ✅ (`ok`/`failed`/`skipped`/`shadow`) |

Sem persistência definitiva nesta fase.

---

## 9. Feature Flags

| Flag | Default | Produção lock |
|------|---------|---------------|
| `FINANCIAL_WRITE` | `false` | ✅ |
| `FINANCIAL_WRITE_PRIMARY` | `false` | ✅ |
| `FINANCIAL_DUAL_WRITE` | `false` | ✅ |
| `FINANCIAL_WRITE_COMPARE` | `false` | ✅ |

Validações:
- `WRITE` exige `READ`
- `DUAL_WRITE` exige `WRITE`
- `WRITE_PRIMARY` exige `WRITE` (não ativado)
- `WRITE_COMPARE` exige path write

Env: `VITE_FINANCIAL_WRITE`, `VITE_FINANCIAL_WRITE_PRIMARY`, `VITE_FINANCIAL_DUAL_WRITE`, `VITE_FINANCIAL_WRITE_COMPARE`

---

## 10. Arquivos criados

| Arquivo |
|---------|
| `src/repositories/financial/financialWriteIdempotency.ts` |
| `src/repositories/financial/financialWriteAudit.ts` |
| `src/services/financialWriteAdapter.js` |
| `server/lib/financialApiWrite.js` |
| `src/__tests__/financialWriteCutover.test.js` |
| `src/__tests__/financialApiWrite.test.js` |
| `docs/reports/PHASE_5_13_FINANCIAL_WRITE_CUTOVER.md` |

---

## 11. Arquivos modificados

| Arquivo | Alteração |
|---------|-----------|
| `src/repositories/financial/financialTypes.ts` | DTOs write, `IFinancialAdminApiWriter`, audit types |
| `src/repositories/financial/financialMapper.ts` | Mappers legacy→DTO, DTO→server body |
| `src/repositories/financial/financialRepositoryFlags.ts` | 4 flags write (já iniciado) |
| `src/repositories/financial/financialRepository.ts` | 7 métodos `*Core` write |
| `src/repositories/financial/financialRepositorySync.ts` | `logFinancialWriteDev`, write compare |
| `src/repositories/financial/financialAdminApiRepository.ts` | Writer + registrars |
| `src/services/financialAdminApi.js` | POST/PUT/DELETE client |
| `src/services/financialRepositoryBridge.js` | Write registrars, `shouldUseFinancialRepositoryWrite` |
| `src/services/receivablesService.js` | Dual-write wiring |
| `src/services/payablesService.js` | Dual-write wiring |
| `src/services/financingsService.js` | Dual-write wiring |
| `server/index.js` | 7 rotas write financeiras |
| `src/__tests__/rhTestFlagContract.js` | Contrato write flags |
| `src/__tests__/financialRepositoryFoundation.test.js` | Inventário + flags write |

---

## 12. Testes adicionados

| Arquivo | Testes |
|---------|--------|
| `financialWriteCutover.test.js` | 12 (flags, dual-write, idempotência, fallback, legacy) |
| `financialApiWrite.test.js` | 5 (validation, 503 table missing, auth, upsert) |
| `financialRepositoryFoundation.test.js` | +2 (write flags, write adapter wiring) |

**Contrato:** `FINANCIAL_DUAL_WRITE_FLAGS_RESOLVED` em `rhTestFlagContract.js`

---

## 13. Resultado da regressão

```
Test Files  137 passed (137)
Tests       1313 passed | 1 skipped (1314)
```

Zero regressões vs baseline 5.12 (1294 pass).

---

## 14. Riscos residuais

1. **Tabelas Supabase ausentes** — write retorna 503 `FINANCIAL_TABLE_MISSING`; dual-write falha silenciosamente (fallback OK).
2. **Status mapping financing** — legado usa statuses clínicos (`pending_analysis`); core normaliza para subset V3 — possível divergência em compare.
3. **Payables camelCase vs snake_case** — mapper cobre ambos; compare pode divergir em campos não mapeados.
4. **Financing sem `tenant_id` no record IDB** — tenant resolvido via `user.tenantId` no adapter.
5. **Idempotência in-memory** — não sobrevive reload; adequado para wave 1.
6. **Parcelas recorrentes payables** — dual-write apenas do título pai criado pelo service call direto.

---

## 15. Recomendações — Phase 5.14 (Write Primary + Soak)

1. Ativar `FINANCIAL_WRITE_PRIMARY` com soak staging (padrão Agenda 5.10).
2. Wire `registerReceivablePayment` / `receiveInstallment`.
3. Hydrate IDB pós-write primary (inverso do dual-write discard).
4. Persistir write audit em tabela operacional.
5. Idempotency store durável (Supabase ou IndexedDB meta store).
6. Soak manual: create/update/delete receivable, payable, financing em staging com flags ON.
7. Shadow compare contínuo pós-write primary por 48–72h.

---

## 16. Confirmações finais

| Item | Status |
|------|--------|
| Produção não alterada | ✅ flags default false + production locks |
| Banco não alterado | ✅ |
| Migrations não executadas | ✅ |
| Supabase remoto não alterado | ✅ |
| Storage remoto não alterado | ✅ |
| IndexedDB preservado como authority | ✅ |
| Frontend funcionalmente idêntico (flags OFF) | ✅ |
| Commit não realizado | ✅ |

---

**FIM Phase 5.13 — aguardar aprovação formal antes de Phase 5.14.**
