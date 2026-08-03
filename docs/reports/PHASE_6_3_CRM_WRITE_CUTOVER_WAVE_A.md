# Phase 6.3 — CRM Write Cutover (Wave A)

**Status:** CONCLUÍDA  
**Baseline testes (Phase 6.2):** 1437 pass | 1 skip  
**Regressão final:** 1466 pass | 1 skip (+29)  
**Commit:** não realizado

---

## 1. Auditoria completa dos WRITEs

### 1.1 Leads

| Método | Service | Store IDB | Side-effects legados | Admin API |
|--------|---------|-----------|---------------------|-----------|
| `createLead` | `crmService.js` | `crmLeads` | `crmLeadEvents` (status_change), `logAction` | `POST /internal/app/crm/leads` |
| `updateLead` | `crmService.js` | `crmLeads` | evento se `stageKey` muda | `PUT /internal/app/crm/leads/:id` |
| `moveLeadToStage` | `crmService.js` | `crmLeads` | `crmLeadEvents`, `lossReason` IDB-only | `PATCH /internal/app/crm/leads/:id/stage` |

### 1.2 Pipeline

| Método | Service | Store IDB | Admin API |
|--------|---------|-----------|-----------|
| `createPipelineStage` | `crmPipelineStageService.js` *(novo export)* | `crmPipelineStages` | `POST /internal/app/crm/pipeline-stages` |
| `updatePipelineStage` | `crmPipelineStageService.js` *(novo export)* | `crmPipelineStages` | `PUT /internal/app/crm/pipeline-stages/:id` |
| `deletePipelineStage` | `crmPipelineStageService.js` | `crmPipelineStages` | `DELETE /internal/app/crm/pipeline-stages/:id` |

**Nota:** `savePipelineStagesForTenant` (bulk UI) também agenda dual-write individual por stage criado/atualizado/removido — sem alterar contrato público.

### 1.3 Fora do escopo (permanecem legados)

Timeline, CRM Events, FollowUps, Tasks, WhatsApp, Marketing Chat, IA, Dashboard, Conversões, Ganhos/Perdas, Agenda CRM, Financeiro CRM, Métricas, KPIs, Primary Write ativo.

---

## 2. Inventário dos métodos migrados

| # | Método | Dual-write | Shadow | Compare |
|---|--------|-----------|--------|---------|
| 1 | `createLead` | ✅ | ✅ async | ✅ prep |
| 2 | `updateLead` | ✅ | ✅ async | ✅ prep |
| 3 | `moveLeadToStage` | ✅ | ✅ async | ✅ prep |
| 4 | `createPipelineStage` | ✅ | ✅ async | ✅ prep |
| 5 | `updatePipelineStage` | ✅ | ✅ async | ✅ prep |
| 6 | `deletePipelineStage` | ✅ | ✅ async | ✅ prep |

---

## 3. Matriz Método → Write Pipeline

```
Service (withDb → retorno síncrono)
  ↓ scheduleCrmDualWrite* (queueMicrotask, flags OFF = no-op)
crmWriteAdapter.js
  ↓ map legacy → Core DTO
crmRepository.*Core()
  ↓ runRepositoryWritePipeline (shared toolkit)
  ↓ idempotency → remote Admin API → audit shadow → descarta remote
crmAdminApi.js → server/crmApiWrite.js → Supabase (quando tabela existe)
```

**Flags OFF (default):** 100% IndexedDB legado, zero microtask de write.

---

## 4. Componentes compartilhados criados

| Arquivo | Responsabilidade |
|---------|-----------------|
| `repositoryV3Idempotency.ts` | `correlation_id`, `idempotency_key`, TTL 5min, retry-safe |
| `repositoryV3WriteAudit.ts` | Audit in-memory (200 entries), logs DEV |
| `repositoryV3Fallback.ts` | Preserva IDB, registra falha, rollback por flag |
| `repositoryV3WritePipeline.ts` | Orquestra write remoto, shadow/primary/compare |

**Módulos legados intocados:** Financeiro, Agenda, Clinic Profile, Collaborators.

---

## 5. Dual Write

| Flag | Default | Comportamento |
|------|---------|--------------|
| `CRM_WRITE` | `false` | Habilita caminho write |
| `CRM_DUAL_WRITE` | `false` | IDB authority; remote async shadow |

Exige `CRM_READ=true`. Produção e host Supabase produção bloqueiam todas write flags.

---

## 6. Shadow Write

Assíncrono via `queueMicrotask` — nunca bloqueia UI, nunca altera resposta.

Audit `syncResult: 'shadow'` — remote executado e descartado.

Logs DEV: `[CRM_WRITE_ADAPTER]`, `[REPOSITORY_WRITE_AUDIT]`, `[CRM_WRITE]`.

---

## 7. Write Compare

| Flag | Default | Campos |
|------|---------|--------|
| `CRM_WRITE_COMPARE` | `false` | leadId, stageKey, patientId, assignedToUserId, timestamps, pipeline key/label/order |

Via `compareCrmWriteLegacyVsRemote` — diffs apenas em logs DEV, nunca altera comportamento.

---

## 8. Idempotência

Shared `repositoryV3Idempotency.ts`:

- `buildRepositoryIdempotencyKey(domain, tenantId, legacyId, operation)`
- `resolveRepositoryWriteMeta` → correlation_id + idempotency_key
- `shouldSkipDuplicateRepositoryWrite` / `markRepositoryWriteIdempotent`
- TTL 5 minutos, sem persistência definitiva

---

## 9. Audit

Shared `repositoryV3WriteAudit.ts`:

- `write_source`, `legacy_id`, `remote_id`, `correlation_id`, `tenant_id`
- `timestamp`, `retry_count`, `sync_result` (ok|failed|skipped|shadow)
- In-memory only — sem persistência definitiva nesta fase

---

## 10. Fallback

Shared `repositoryV3Fallback.ts`:

- Falha remota → IDB preservado
- Usuário mantém sucesso (write já gravou IDB antes do microtask)
- Audit `syncResult: 'failed'`
- Rollback imediato: desligar flags (`CRM_DUAL_WRITE=false`)

Adapter `runWriteSafe` captura erros sem propagar ao caller legado.

---

## 11. Arquivos criados

| Arquivo |
|---------|
| `src/repositories/shared/repositoryV3Idempotency.ts` |
| `src/repositories/shared/repositoryV3WriteAudit.ts` |
| `src/repositories/shared/repositoryV3Fallback.ts` |
| `src/repositories/shared/repositoryV3WritePipeline.ts` |
| `server/lib/crmApiWrite.js` |
| `src/services/crmWriteAdapter.js` |
| `src/__tests__/repositoryV3WriteToolkitContract.test.js` (8 testes) |
| `src/__tests__/crmWriteCutover.test.js` (14 testes) |
| `src/__tests__/crmApiWrite.test.js` (5 testes) |
| `docs/reports/PHASE_6_3_CRM_WRITE_CUTOVER_WAVE_A.md` |

---

## 12. Arquivos modificados

| Arquivo | Alteração |
|---------|-----------|
| `src/repositories/crm/crmRepositoryFlags.ts` | +4 write flags, validação, production guards |
| `src/repositories/crm/crmTypes.ts` | Write DTOs, ICrmAdminApiWriter, *Core methods |
| `src/repositories/crm/crmMapper.ts` | Mappers write legacy↔server |
| `src/repositories/crm/crmRepository.ts` | *Core write methods + Write Pipeline |
| `src/repositories/crm/crmRepositorySync.ts` | compareCrmWriteLegacyVsRemote |
| `src/repositories/crm/crmAdminApiRepository.ts` | Write client registrations |
| `src/services/crmAdminApi.js` | POST/PUT/PATCH/DELETE clients |
| `src/services/crmRepositoryBridge.js` | Write gates + remote write clients |
| `src/services/crmService.js` | Dual-write wiring leads |
| `src/services/crmPipelineStageService.js` | create/update exports + dual-write |
| `server/index.js` | 6 rotas write CRM |
| `src/__tests__/rhTestFlagContract.js` | CRM write flag contracts |
| `src/__tests__/crmRepositoryFoundation.test.js` | Write flag validation tests |

---

## 13. Testes adicionados

| Suite | Testes |
|-------|--------|
| `repositoryV3WriteToolkitContract.test.js` | 8 |
| `crmWriteCutover.test.js` | 14 |
| `crmApiWrite.test.js` | 5 |
| **Total novos** | **27** |

Cobertura: Write Pipeline, Dual Write, Shadow, Compare prep, Idempotência, Audit, Fallback, Flags, Production Guards, Legacy Preservation, wiring inventário.

---

## 14. Resultado da regressão

```
Test Files  147 passed (147)
     Tests  1466 passed | 1 skipped (1467)
  Duration  ~50s
```

**Delta vs Phase 6.2:** +29 testes, 0 regressões.

---

## 15. Riscos residuais

| Risco | Severidade | Mitigação |
|-------|-----------|-----------|
| Tabelas CRM ausentes no Supabase | Média | 503 `CRM_TABLE_MISSING`; fallback IDB |
| `crmLeadEvents` não replicados | Baixa | Fora Wave A; timeline IDB-only |
| `lossReason` não no schema remoto | Baixa | Campo IDB-only; compare pode reportar |
| Bulk `savePipelineStagesForTenant` gera N microtasks | Baixa | Aceito Wave A; soak na 6.4 |
| Primary Write não ativado | Baixa | Phase 6.4 |

---

## 16. Recomendações — Phase 6.4 CRM Primary Write + Soak Validation

1. Ativar `CRM_WRITE_PRIMARY` em staging com soak 48–72h
2. Hydrate IDB pós-write remoto (mirror read-primary pattern Financeiro 5.14)
3. Métricas soak: shadowOk, primaryOk, fallbackLegacy, mismatchCount
4. Promover READ_PRIMARY + WRITE_PRIMARY em sequência após soak verde
5. Timeline/events write — wave dedicada (6.5+)
6. Consolidar Financial write toolkit migration para shared V3 (opcional refactor)

---

## 17. Confirmações finais

| Item | Status |
|------|--------|
| Produção não alterada | ✅ Flags default OFF; guards PROD + host produção |
| Banco não alterado | ✅ Zero migrations |
| Migrations não executadas | ✅ |
| Supabase remoto não alterado | ✅ Handlers preparados; tabelas não criadas |
| Storage remoto não alterado | ✅ |
| IndexedDB preservado | ✅ Authority imediata em dual-write |
| Frontend funcionalmente idêntico | ✅ Zero alteração pages/components |
| Commit não realizado | ✅ |

---

**Phase 6.3 encerrada. Aguardando aprovação formal para Phase 6.4 — CRM Primary Write + Soak Validation.**
