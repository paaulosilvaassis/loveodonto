# Phase 5.14 — Financial Write Primary + Soak Validation

**Status:** CONCLUÍDA (aguardando aprovação formal)  
**Baseline testes:** 1313 pass | 1 skip (pós 5.13)  
**Regressão final:** **1329 pass | 1 skip** (+16)  
**Commit:** não realizado

---

## 1. Auditoria dos writes

| Método | Legado (flags OFF) | Dual-write (5.13) | Primary write (5.14) | Pagamentos prep. |
|--------|-------------------|-------------------|----------------------|------------------|
| `createReceivable` | IDB authority | Shadow async | Remote + hydrate IDB | — |
| `updateReceivable` | IDB authority | Shadow async | Remote + hydrate IDB | — |
| `createPayable` | IDB authority | Shadow async | Remote + hydrate IDB | — |
| `updatePayable` | IDB authority | Shadow async | Remote + hydrate IDB | — |
| `deletePayable` | IDB authority | Shadow async | Remote delete + audit | — |
| `createFinancingProposal` | IDB authority | Shadow async | Remote + hydrate IDB | — |
| `updateFinancingTerms` | IDB authority | Shadow async | Remote + hydrate IDB | — |
| `registerReceivablePayment` | IDB | — | ⏸ stub DEV only | ✅ |
| `receiveInstallment` | IDB | — | ⏸ stub DEV only | ✅ |

**Estratégia conservadora:** services permanecem síncronos; IDB grava primeiro (fallback imediato); primary write assíncrono hidrata mirror quando `FINANCIAL_WRITE_PRIMARY=true`.

---

## 2. Métodos em Primary Write

Todos os 7 métodos core da 5.13 suportam primary path quando:

`FINANCIAL_READ && FINANCIAL_WRITE && FINANCIAL_WRITE_PRIMARY`

Repository `*Core` → Admin API → Supabase → `hydrateFinancialIdbCache` → audit `syncResult: 'ok'`.

---

## 3. Métodos ainda em dual-write / legado

| Modo | Condição | Comportamento |
|------|----------|---------------|
| **Legado puro** | todas flags OFF | 100% IndexedDB |
| **Dual-write shadow** | `DUAL_WRITE=true` e `WRITE_PRIMARY=false` | IDB + remote async, resultado descartado |
| **Primary hydrate** | `WRITE_PRIMARY=true` | IDB inicial + remote SSOT mirror (hydrate) |

`shouldUseFinancialRepositoryWrite()` = dual-only (`isFinancialDualWriteOnlyEnabled`).  
Primary e dual **não** executam em paralelo.

---

## 4. Hydrate pós-write

Em `FinancialRepository.completeRemoteWrite()` quando `WRITE_PRIMARY`:

- `hydrateFinancialIdbCache(domain, [remote], tenantId, cache)`
- Espelha core remoto em `accountsReceivable` / `payables` / `financings`
- Cache memória atualizado
- Sem alterar retorno síncrono do service legado

---

## 5. Idempotência

- `financialWriteIdempotency.ts` — TTL 5min in-memory (inalterado)
- `writeSource`: `primary-write-hydrate` vs `legacy-dual-write`
- `correlation_id` + `idempotency_key` por domain/tenant/legacyId/operation
- Retry seguro via skip duplicado + audit `skipped`

---

## 6. Audit

- `financialWriteAudit.ts` — in-memory (200 entradas)
- Primary success → `syncResult: 'ok'`
- Dual shadow → `syncResult: 'shadow'`
- Falha primary no adapter → `recordFinancialWriteSoakFallbackLegacy()`

---

## 7. Rollback

| Mecanismo | Efeito |
|-----------|--------|
| Flag OFF (`FINANCIAL_WRITE_PRIMARY=false`) | Authority imediata volta ao IndexedDB |
| `applyProductionSafeLocks` | Trava primary em PROD e host Supabase produção |
| Falha remota primary | IDB preservado (gravado antes do microtask) |
| Soak report | Documenta rollback via flag |

---

## 8. Soak Validation

Novo módulo `financialWriteSoak.ts`:

- Métricas: `primaryOk`, `primaryFailed`, `shadowOk`, `shadowFailed`, `skipped`, `fallbackLegacy`
- `buildFinancialWriteSoakReport(tenantId, compareReport)`
- `__runFinancialSoakConsistencyReportForTest` no adapter
- Contrato staging: `FINANCIAL_STAGING_SOAK_FLAGS_RESOLVED`

Soak manual staging: **PENDENTE OPERADOR** (infraestrutura pronta).

---

## 9. Feature Flags

Todas default `false`, produção bloqueada:

```text
FINANCIAL_WRITE=false
FINANCIAL_WRITE_PRIMARY=false
FINANCIAL_DUAL_WRITE=false
FINANCIAL_WRITE_COMPARE=false
```

Novos helpers:

- `isFinancialDualWriteOnlyEnabled()`
- `shouldUseFinancialRepositoryWritePrimary()` (bridge)

---

## 10. Arquivos criados

| Arquivo |
|---------|
| `src/repositories/financial/financialWriteSoak.ts` |
| `src/__tests__/financialWritePrimary.test.js` |
| `src/__tests__/financialWriteSoakValidation.test.js` |
| `docs/reports/PHASE_5_14_FINANCIAL_WRITE_PRIMARY_SOAK.md` |

---

## 11. Arquivos modificados

| Arquivo | Alteração |
|---------|-----------|
| `financialRepository.ts` | `completeRemoteWrite`, `completeRemoteDelete`, primary hydrate |
| `financialRepositoryFlags.ts` | `isFinancialDualWriteOnlyEnabled` |
| `financialRepositoryBridge.js` | `shouldUseFinancialRepositoryWritePrimary`, dual-only write |
| `financialWriteAdapter.js` | Primary path unificado, soak report, payment stubs |
| `rhTestFlagContract.js` | PRIMARY + STAGING_SOAK contratos |
| `financialRepositoryFoundation.test.js` | Inventário + WRITE_PRIMARY validation |

---

## 12. Testes adicionados

| Arquivo | Testes |
|---------|--------|
| `financialWritePrimary.test.js` | 10 (flags, hydrate, fallback, rollback, audit) |
| `financialWriteSoakValidation.test.js` | 5 (contrato staging, M1–M2) |
| `financialRepositoryFoundation.test.js` | +1 WRITE_PRIMARY validation |

---

## 13. Resultado da regressão

```
Test Files  139 passed (139)
Tests       1329 passed | 1 skipped (1330)
```

Zero regressões vs baseline 5.13.

---

## 14. Riscos residuais

1. **Primary assíncrono** — usuário vê IDB imediato; mirror remoto é eventual (janela curta).
2. **Delete primary** — IDB removido antes do remote; falha remota deixa divergência (soak detecta).
3. **Hydrate parcial** — campos legado fora do core podem não espelhar 1:1.
4. **Soak in-memory** — métricas não persistem entre reloads.
5. **Tabelas Supabase ausentes** — 503 remoto; fallback IDB preservado.

---

## 15. Recomendações — próxima fase

1. Soak manual staging 48–72h com `FINANCIAL_STAGING_SOAK_FLAGS_RESOLVED`.
2. Ativar `registerReceivablePayment` / `receiveInstallment` (Phase 5.15).
3. Persistir audit/soak em storage operacional.
4. Promover read-primary + write-primary em conjunto após soak verde.
5. KPIs/DRE/agregados — fase separada (fora de escopo).

---

## 16. Confirmações finais

| Item | Status |
|------|--------|
| Produção não alterada | ✅ |
| Banco não alterado | ✅ |
| Migrations não executadas | ✅ |
| Supabase remoto não alterado sem autorização | ✅ |
| Storage remoto não alterado | ✅ |
| IndexedDB preservado | ✅ |
| Frontend idêntico com flags OFF | ✅ |
| Commit não realizado | ✅ |

---

**FIM Phase 5.14 — aguardar aprovação formal.**
