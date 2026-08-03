# Phase 6.7 — CRM Wave B Write Cutover (Activity Stream)

**Data:** 2026-07-09  
**Baseline anterior:** 1520 pass | 1 skip (Phase 6.6)  
**Regressão Phase 6.7:** **1538 pass | 1 skipped** (+18)

**Commit:** não realizado

---

## 1. Auditoria dos WRITEs Wave B

| Domínio | Método público | Service | Store | Dual-write scheduler |
|---------|----------------|---------|-------|----------------------|
| Timeline | `createLeadEvent` / `addLeadEvent` | `crmService` | `crmLeadEvents` | `scheduleActivityDualWriteCreateLeadEvent` |
| Timeline | `updateLeadEvent` *(novo)* | `crmService` | `crmLeadEvents` | `scheduleActivityDualWriteUpdateLeadEvent` |
| CRM Tasks | `createTask` | `crmTaskService` | `crmTasks` | `scheduleActivityDualWriteCreateTask` |
| CRM Tasks | `updateTask` | `crmTaskService` | `crmTasks` | `scheduleActivityDualWriteUpdateTask` |
| CRM Tasks | `completeTask` | `crmTaskService` | `crmTasks` | `scheduleActivityDualWriteCompleteTask` |
| CRM Tasks | `deleteTask` | `crmTaskService` | `crmTasks` | `scheduleActivityDualWriteDeleteTask` |
| CRM FollowUps | `createCrmFollowUp` / `createFollowUp` | `crmService` | `crmFollowUps` | `scheduleActivityDualWriteCreateCrmFollowUp` |
| CRM FollowUps | `updateCrmFollowUp` *(novo)* | `crmService` | `crmFollowUps` | `scheduleActivityDualWriteUpdateCrmFollowUp` |
| Strategic FollowUps | `createStrategicFollowUp` / `createFollowUp` | `followUpService` | `followUps` | `scheduleActivityDualWriteCreateStrategicFollowUp` |
| Strategic FollowUps | `updateStrategicFollowUp` *(novo)* | `followUpService` | `followUps` | `scheduleActivityDualWriteUpdateStrategicFollowUp` |

**Fluxo dual-write:** Legacy IDB (síncrono) → microtask → Activity Write Pipeline → remote shadow → resultado descartado → retorno = legado.

---

## 2. Activity Write Pipeline

Módulo: `crmActivityWritePipeline.ts`

```
Activity { type, id, leadId, ... }
        ↓
resolveActivitySourceStore(type/source)
        ↓
domain (lead-event | crm-task | crm-legacy-followup | strategic-followup)
        ↓
runRepositoryWritePipeline (Write Toolkit)
        ↓
executeRemote (shadow stub / override teste)
        ↓
audit syncResult: 'shadow' | compare opcional
```

**Tipos suportados:** CALL, EMAIL, FOLLOW_UP, TASK, MOVE_STAGE, NOTE, WHATSAPP, AUTOMATION, SYSTEM.

**Roteamento store:**
- `TASK` → `crmTasks`
- `FOLLOW_UP` + `source/followUps` → `followUps` ou `crmFollowUps`
- Demais (CALL/MOVE_STAGE/NOTE/WHATSAPP/…) → `crmLeadEvents`

---

## 3. Métodos migrados

Todos os WRITEs do escopo listados na §1 — dual-write shadow quando:

```
CRM_ACTIVITY_READ=true
CRM_ACTIVITY_WRITE=true
CRM_ACTIVITY_DUAL_WRITE=true
CRM_ACTIVITY_WRITE_PRIMARY=false
```

Com flags OFF: **zero** chamada ao pipeline (no-op).

---

## 4. Matriz Método → Pipeline

```
createLeadEvent     → Activity(type←event) → source=crmLeadEvents → pipeline create
updateLeadEvent     → Activity             → crmLeadEvents        → pipeline update
createTask          → Activity(TASK)       → crmTasks             → pipeline create
updateTask          → Activity(TASK)       → crmTasks             → pipeline update
completeTask        → Activity(TASK)       → crmTasks             → pipeline complete
deleteTask          → Activity(TASK)       → crmTasks             → pipeline delete
createCrmFollowUp   → Activity(FOLLOW_UP)  → crmFollowUps        → pipeline create
updateCrmFollowUp   → Activity(FOLLOW_UP)  → crmFollowUps        → pipeline update
createStrategicFollowUp → Activity(FOLLOW_UP) → followUps         → pipeline create
updateStrategicFollowUp → Activity(FOLLOW_UP) → followUps         → pipeline update
```

---

## 5. Componentes reutilizados

| Componente | Uso |
|------------|-----|
| `repositoryV3WritePipeline` | Orquestra remote + audit + compare |
| `repositoryV3Idempotency` | correlation_id, idempotency_key, skip duplicate |
| `repositoryV3WriteAudit` | Audit in-memory (200 entries) |
| `repositoryV3Fallback` | Preserva IDB em falha remota |
| `crmActivityMapper` | Legacy row → Activity |
| `crmActivityFlags` | Flags + production guards |

---

## 6. Dual Write

Implementado em `crmActivityWriteAdapter.js`:

1. Service grava IndexedDB e retorna imediatamente  
2. `queueMicrotask` agenda pipeline  
3. Remote shadow (stub ecoa Activity; substituível em testes)  
4. Resultado remoto **descartado**  
5. UI nunca bloqueada  

`isCrmActivityDualWriteOnlyEnabled` = dual ON **e** primary OFF (exclusividade).

---

## 7. Shadow Write

- Microtask assíncrona  
- Logs DEV: `[CRM_ACTIVITY_WRITE]`, `[CRM_ACTIVITY_WRITE_ADAPTER]`  
- `syncResult: 'shadow'`  
- Sem alteração de retorno ao usuário  

---

## 8. Compare

Flag: `CRM_ACTIVITY_WRITE_COMPARE` (default false)

Compara via `compareCrmActivities`: activityId/id, type, leadId, ownerId, timestamp, status, payload.

Apenas logs DEV — nunca altera resposta.

---

## 9. Idempotência

Write Toolkit compartilhado:

- `correlation_id` / `idempotency_key` / `tenant_id`  
- TTL skip duplicate  
- Retry seguro (`retryCount` no meta)  

---

## 10. Audit

In-memory via `createRepositoryWriteAuditEntry`:

- `writeSource`, `legacyId`, `remoteId`, `correlationId`, `tenantId`, `timestamp`, `retryCount`, `syncResult`, `domain`  
- Log DEV inclui `activityType` + `sourceStore` (`auditDomain`)  
- **Sem persistência** em banco  

---

## 11. Fallback

Em falha remota:

- `handleRepositoryWriteFallback` → IndexedDB preservado  
- Sucesso do usuário mantido (retorno já foi o legado)  
- Rollback imediato: desligar `CRM_ACTIVITY_DUAL_WRITE` / `CRM_ACTIVITY_WRITE`  

---

## 12. Arquivos criados

| Arquivo | Propósito |
|---------|-----------|
| `src/repositories/crm/crmActivityWritePipeline.ts` | Pipeline + roteamento |
| `src/services/crmActivityWriteAdapter.js` | Dual-write schedulers + test helpers |
| `src/__tests__/crmActivityWriteCutover.test.js` | 18 testes |
| `docs/reports/PHASE_6_7_CRM_WAVE_B_WRITE_CUTOVER_ACTIVITY_STREAM.md` | Este relatório |

---

## 13. Arquivos modificados

| Arquivo | Alteração |
|---------|-----------|
| `src/repositories/crm/crmActivityFlags.ts` | Flags WRITE / DUAL / PRIMARY / WRITE_COMPARE |
| `src/services/crmService.js` | Wiring create/update LeadEvent + CrmFollowUp |
| `src/services/crmTaskService.js` | Wiring create/update/complete/delete Task |
| `src/services/followUpService.js` | Wiring create/update Strategic FollowUp |
| `src/__tests__/rhTestFlagContract.js` | Contrato + `CRM_ACTIVITY_DUAL_WRITE_FLAGS_RESOLVED` |
| `src/__tests__/crmRepositoryFoundation.test.js` | Inventário `crmActivityWritePipeline.ts` |
| `src/__tests__/repositoryV3ArchitectureContract.test.js` | Arquivo pipeline no contrato CRM |

---

## 14. Testes adicionados

**`crmActivityWriteCutover.test.js` (18):**
- Feature flags + production guards + dual vs primary exclusivity  
- Pipeline routing + audit shadow  
- Legacy preservation flags OFF  
- Dual: lead event, task CRUD/complete/delete, CRM follow-up, strategic follow-up  
- Fallback remoto  
- Idempotência  

---

## 15. Resultado da regressão

```
Test Files  151 passed (151)
Tests       1538 passed | 1 skipped (1539)
```

Delta vs Phase 6.6: **+18 testes**. Zero regressões.

---

## 16. Riscos residuais

1. **Remote ainda é stub shadow** — sem Admin API HTTP Wave B; Phase 6.8 deve plugar endpoints reais antes de Primary Write.  
2. **`createTask` dispara também `addLeadEvent` (TASK_CREATED)** — dual-write pode gerar 2 shadows (task + event); esperado e preserva comportamento legado.  
3. **`updateLeadEvent` / `updateCrmFollowUp` / `updateStrategicFollowUp`** são exports novos — consumers antigos não quebram; APIs novas opt-in.  
4. **Primary Write flag existe mas path dual-only** — `WRITE_PRIMARY` desliga dual; implementação primary fica para 6.8.  
5. **Triple store** continua; Activity Write não unifica fisicamente as stores.

---

## 17. Recomendações para Phase 6.8 — CRM Activity Primary Write + Soak Validation

1. Admin API write real para lead-events / tasks / follow-ups.  
2. Primary Write: remote SSOT → hydrate IDB pontual (espelhar Phase 6.4).  
3. Soak: `totalWrites`, `primaryOk`, `fallbackLegacy`, `hydrateOk`, `lastError` + `buildCrmActivityWriteSoakReport()`.  
4. Fallback obrigatório em falha remota primary.  
5. Não ativar Primary em produção.  
6. Resolver ordem dual shadow quando task cria lead event (dedupe opcional).  

---

## 18. Confirmações finais

| Item | Status |
|------|--------|
| Produção não alterada | ✅ Flags default false + production guards |
| Banco não alterado | ✅ |
| Migrations não executadas | ✅ |
| Supabase remoto não alterado | ✅ Stub local apenas |
| Storage remoto não alterado | ✅ |
| IndexedDB preservado | ✅ Authority com flags OFF |
| Frontend funcionalmente idêntico | ✅ Retorno sempre legado |
| Commit não realizado | ✅ |

---

**Phase 6.7 concluída. Aguardando aprovação formal para Phase 6.8 — CRM Activity Primary Write + Soak Validation.**
