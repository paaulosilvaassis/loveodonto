# Phase 6.4 — CRM Primary Write + Soak Validation

**Data:** 2026-07-09  
**Baseline anterior:** 1466 pass | 1 skip (Phase 6.3)  
**Regressão Phase 6.4:** **1484 pass | 1 skip** (+18)

---

## 1. Auditoria dos writes Wave A

| Domínio | Método service | Scheduler adapter | Core repository | Admin API |
|---------|----------------|-------------------|-----------------|-----------|
| Leads | `createLead` | `scheduleCrmDualWriteCreateLead` | `createLeadCore` | `POST /internal/app/crm/leads` |
| Leads | `updateLead` | `scheduleCrmDualWriteUpdateLead` | `updateLeadCore` | `PUT /internal/app/crm/leads/:id` |
| Leads | `moveLeadToStage` | `scheduleCrmDualWriteMoveLeadToStage` | `moveLeadStageCore` | `PATCH /internal/app/crm/leads/:id/stage` |
| Pipeline | `createPipelineStage` | `scheduleCrmDualWriteCreatePipelineStage` | `createPipelineStageCore` | `POST /internal/app/crm/pipeline-stages` |
| Pipeline | `updatePipelineStage` | `scheduleCrmDualWriteUpdatePipelineStage` | `updatePipelineStageCore` | `PUT /internal/app/crm/pipeline-stages/:id` |
| Pipeline | `deletePipelineStage` | `scheduleCrmDualWriteDeletePipelineStage` | `deletePipelineStageCore` | `DELETE /internal/app/crm/pipeline-stages/:id` |

**Fluxo com flags OFF:** 100% IndexedDB via `withDb` nos services — zero alteração funcional.

**Fluxo dual-write (`CRM_DUAL_WRITE=true`, `CRM_WRITE_PRIMARY=false`):** IDB imediato → remote assíncrono shadow → audit `syncResult: 'shadow'`.

**Fluxo primary write (`CRM_WRITE_PRIMARY=true`):** IDB imediato (preserva UX) → remote SSOT → hydrate mirror IDB → audit `syncResult: 'ok'`.

---

## 2. Métodos em Primary Write

Quando `CRM_READ=true` + `CRM_WRITE=true` + `CRM_WRITE_PRIMARY=true`:

- `createLeadCore` — remote create → `hydrateCrmIdbCache` (leads + cache)
- `updateLeadCore` — remote update → hydrate lead
- `moveLeadStageCore` — remote move → hydrate lead (stageKey atualizado → projeção kanban)
- `createPipelineStageCore` — remote create → `hydrateCrmPipelineStageIdbCache`
- `updatePipelineStageCore` — remote update → hydrate pipeline stage
- `deletePipelineStageCore` — remote delete → `removeCrmPipelineStageFromIdb`

---

## 3. Métodos ainda legados (fora Wave A)

- Timeline / Lead Events
- FollowUps
- Tasks
- WhatsApp
- IA
- Dashboard / Métricas
- Eventos CRM customizados

---

## 4. Hydrate pós-write

| Entidade | Função | Escopo |
|----------|--------|--------|
| Leads | `hydrateCrmIdbCache` | Merge pontual em `db.crmLeads` + cache memória |
| Pipeline Stages | `hydrateCrmPipelineStageIdbCache` | Merge pontual em `db.crmPipelineStages` |
| Pipeline Delete | `removeCrmPipelineStageFromIdb` | Remoção pontual pós-delete remoto |
| Kanban | Derivado de lead hydrate | `stageKey` espelhado via lead core — sem sync global |

**Não ativado:** hydrate global, sync permanente, read-primary automático pós-write.

---

## 5. Soak Validation

Novo módulo `src/repositories/crm/crmWriteSoak.ts`:

| Métrica | Descrição |
|---------|-----------|
| `totalWrites` | Total de operações de escrita registradas |
| `primaryOk` | Primary write remoto OK |
| `primaryFailed` | Primary write remoto falhou |
| `fallbackLegacy` | Fallback para legado IDB (adapter) |
| `hydrateOk` | Hydrate pós-write bem-sucedido |
| `hydrateFailed` | Hydrate pós-write falhou |
| `compareDiffs` | Diffs detectados em write compare |
| `lastError` | Último erro registrado |
| `shadowOk` / `shadowFailed` / `skipped` | Métricas auxiliares dual-write |

**Relatório:** `buildCrmWriteSoakReport(tenantId, compareReport?)`  
**Helper teste:** `__runCrmSoakConsistencyReportForTest(tenantId)`

---

## 6. Rollback

Desligar `CRM_WRITE_PRIMARY` (ou qualquer flag write) → **100% IndexedDB authority** imediata.

- Sem rebuild
- Sem migration
- Sem alteração de schema
- `isCrmDualWriteOnlyEnabled` retorna `false` quando primary ON — dual e primary mutuamente exclusivos

---

## 7. Idempotência

Reutiliza Write Toolkit compartilhado (`repositoryV3Idempotency.ts`):

- `correlation_id` — prefixo `{domain}-corr`
- `idempotency_key` — TTL 5 min
- `tenant_id` — validado em cada operação
- Retry seguro via `shouldSkipDuplicateRepositoryWrite`
- Duplicatas → audit `syncResult: 'skipped'`

---

## 8. Audit

Reutiliza `repositoryV3WriteAudit.ts` (in-memory, 200 entries):

- Primary: `syncResult: 'ok' | 'failed'`
- Dual: `syncResult: 'shadow'`
- `writeSource: 'primary-write-hydrate' | 'legacy-dual-write'`
- **Não persistido** em banco remoto

---

## 9. Feature Flags

| Flag | Default | Produção |
|------|---------|----------|
| `CRM_WRITE` | `false` | Bloqueada |
| `CRM_DUAL_WRITE` | `false` | Bloqueada |
| `CRM_WRITE_PRIMARY` | `false` | Bloqueada |
| `CRM_WRITE_COMPARE` | `false` | Bloqueada |

**Validações:**
- `CRM_WRITE_PRIMARY` exige `CRM_WRITE`
- `CRM_DUAL_WRITE` exige `CRM_WRITE`
- `CRM_WRITE` exige `CRM_READ`
- Host Supabase produção bloqueia write flags
- `import.meta.env.PROD` trava todas flags perigosas

**Exclusividade dual vs primary:**
- `isCrmDualWriteOnlyEnabled` = dual ON **e** primary OFF
- Adapter: `scheduleRepositoryWrite` usa primary OR dual, nunca ambos

---

## 10. Arquivos criados

| Arquivo | Propósito |
|---------|-----------|
| `src/repositories/crm/crmWriteSoak.ts` | Métricas soak + `buildCrmWriteSoakReport()` |
| `src/__tests__/crmWritePrimary.test.js` | 18 testes primary/hydrate/fallback/soak |
| `docs/reports/PHASE_6_4_CRM_PRIMARY_WRITE_SOAK_VALIDATION.md` | Este relatório |

---

## 11. Arquivos modificados

| Arquivo | Alteração |
|---------|-----------|
| `src/repositories/crm/crmRepositorySync.ts` | `hydrateCrmPipelineStageIdbCache`, `removeCrmPipelineStageFromIdb` |
| `src/repositories/crm/crmRepository.ts` | Soak recorders, hydrate primary pipeline/delete, compare wrap |
| `src/services/crmWriteAdapter.js` | Primary path, exclusividade dual/primary, soak fallback |
| `src/__tests__/rhTestFlagContract.js` | `CRM_WRITE_PRIMARY_FLAGS_RESOLVED` |
| `src/__tests__/crmRepositoryFoundation.test.js` | Inventário inclui `crmWriteSoak.ts` |

---

## 12. Testes adicionados

**`crmWritePrimary.test.js` (18 testes):**

- Flags: validação, exclusividade dual/primary, production guards
- Primary create/update/move hydrate IDB
- Pipeline create/update/delete hydrate
- Fallback remoto preserva legado
- Rollback por flag
- Legacy preservation flags OFF
- Idempotência
- Audit in-memory (correlation_id, tenant_id, writeSource)
- Soak report métricas

**Regressão completa:** 1484 pass | 1 skip — **zero regressões**.

---

## 13. Resultado da regressão

```
Test Files  148 passed (148)
Tests       1484 passed | 1 skipped (1485)
```

Delta vs Phase 6.3: **+18 testes**.

---

## 14. Riscos residuais

1. **Ordem IDB-first + primary hydrate:** Services ainda gravam IDB antes do remote; em primary, hydrate sobrescreve com SSOT remoto — possível janela breve de divergência local/remoto até microtask completar.
2. **Delete pipeline:** Service remove IDB localmente antes do remote; hydrate delete é redundante mas garante consistência se IDB ainda contiver o registro.
3. **Soak in-memory:** Métricas resetam ao recarregar página — adequado para staging/dev, não para observabilidade produção.
4. **Kanban projection:** Depende de hydrate lead; cards derivados não têm coleção IDB separada — compare kanban requer read path ativo.

---

## 15. Recomendações para Phase 6.5 — CRM Wave B Foundation

1. Estender repository foundation para **Timeline / FollowUps / Tasks** (read-first).
2. Definir flags Wave B: `CRM_WAVE_B_READ`, shadow/compare dedicados.
3. Mapear DTOs e Admin API GET antes de qualquer write Wave B.
4. Reutilizar `crmWriteSoak.ts` como template para Wave B soak quando writes forem introduzidos.
5. Considerar **IDB-first inversion** gradual: primary write blocking até remote OK (opt-in flag) para eliminar janela de divergência.
6. Integrar soak report em QaToolsPage (dev-only) para validação operacional staging.

---

## 16. Confirmações finais

| Item | Status |
|------|--------|
| Produção não alterada | ✅ Flags default false + production guards |
| Banco não alterado | ✅ Sem migrations |
| Migrations não executadas | ✅ |
| Supabase remoto não alterado | ✅ Apenas client HTTP existente |
| Storage remoto não alterado | ✅ |
| IndexedDB preservado | ✅ Authority com flags OFF; mirror em primary |
| Frontend funcionalmente idêntico | ✅ Zero alteração UX/telas/payloads HTTP |
| Commit não realizado | ✅ |

---

**Phase 6.4 concluída. Aguardando aprovação formal para Phase 6.5.**
