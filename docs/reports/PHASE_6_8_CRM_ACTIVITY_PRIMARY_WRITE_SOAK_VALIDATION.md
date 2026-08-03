# Phase 6.8 — CRM Activity Primary Write + Soak Validation

**Data:** 2026-07-09  
**Baseline anterior:** 1538 pass | 1 skip (Phase 6.7)  
**Regressão Phase 6.8:** **1557 pass | 1 skipped** (+19)

**Commit:** não realizado

---

## 1. Auditoria dos writes Wave B

| Domínio | Método público | Service | Store | Primary Write path |
|---------|----------------|---------|-------|--------------------|
| Timeline | `createLeadEvent` / `addLeadEvent` | `crmService` | `crmLeadEvents` | Pipeline → hydrate IDB |
| Timeline | `updateLeadEvent` | `crmService` | `crmLeadEvents` | Pipeline → hydrate IDB |
| CRM Tasks | `createTask` | `crmTaskService` | `crmTasks` | Pipeline → hydrate IDB |
| CRM Tasks | `updateTask` | `crmTaskService` | `crmTasks` | Pipeline → hydrate IDB |
| CRM Tasks | `completeTask` | `crmTaskService` | `crmTasks` | Pipeline → hydrate IDB |
| CRM Tasks | `deleteTask` | `crmTaskService` | `crmTasks` | Pipeline → remove IDB |
| CRM FollowUps | `createCrmFollowUp` | `crmService` | `crmFollowUps` | Pipeline → hydrate IDB |
| CRM FollowUps | `updateCrmFollowUp` | `crmService` | `crmFollowUps` | Pipeline → hydrate IDB |
| Strategic FollowUps | `createStrategicFollowUp` | `followUpService` | `followUps` | Pipeline → hydrate IDB |
| Strategic FollowUps | `updateStrategicFollowUp` | `followUpService` | `followUps` | Pipeline → hydrate IDB |

**Fluxo com flags OFF:** 100% IndexedDB via `withDb` — zero chamada ao pipeline.

**Fluxo dual-write (`CRM_ACTIVITY_DUAL_WRITE=true`, `WRITE_PRIMARY=false`):** IDB imediato → remote shadow → descarta → audit `shadow`.

**Fluxo primary (`CRM_ACTIVITY_WRITE_PRIMARY=true`):** IDB imediato (UX) → remote stub/SSOT → hydrate pontual → audit `ok` · falha remota → `fallbackLegacy` (IDB preservado).

---

## 2. Métodos em Primary Write

Quando `CRM_ACTIVITY_READ=true` + `CRM_ACTIVITY_WRITE=true` + `CRM_ACTIVITY_WRITE_PRIMARY=true`:

Todos os 10 métodos da §1 passam pelo Activity Write Pipeline com:

1. `writeSource: 'primary-write-hydrate'`
2. `onPrimarySuccess` → `hydrateCrmActivityIdbFromRemote`
3. Soak: `totalWrites` / `primaryOk|primaryFailed` / `hydrateOk|hydrateFailed`
4. Dual-only path desabilitado (`isCrmActivityDualWriteOnlyEnabled` = false)

Remote ainda é **stub** (ecoa Activity) — Admin API Wave B HTTP real permanece para Phase 6.9+.

---

## 3. Métodos ainda legados

Fora do escopo Activity Write Primary (e Wave B write):

- WhatsApp / IA / Dashboard / Analytics
- Event Sourcing / Patient Journey
- Wave A leads/pipeline (já em Primary Write 6.4, domínio separado)

Com flags OFF: **todos** os writes Wave B permanecem 100% legado IndexedDB.

---

## 4. Hydrate pós-write

Módulo: `crmActivityHydrate.ts`

| Store | Função | Operações |
|-------|--------|-----------|
| `crmLeadEvents` | `mapActivityToLeadEventLegacy` + mergeById | create/update |
| `crmTasks` | `mapActivityToCrmTaskLegacy` + mergeById | create/update/complete |
| `crmFollowUps` | `mapActivityToCrmLegacyFollowUpLegacy` + mergeById | create/update |
| `followUps` | `mapActivityToStrategicFollowUpLegacy` + mergeById | create/update |
| qualquer | `removeCrmActivityFromIdb` | delete (idempotente) |

- **Sem** hydrate global
- **Sem** sync permanente
- Upsert por `id` — não cria duplicidade

---

## 5. Activity Stream projection

`projectCrmActivityStreamAfterHydrate(activity, sourceStore)` valida in-memory que a Activity remota reconstrói o shape legado (id, leadId/title/status/dueDate). Não cria store extra.

---

## 6. Soak Validation

Módulo: `crmActivityWriteSoak.ts`

Métricas in-memory:

```text
totalWrites | primaryOk | primaryFailed | shadowOk | shadowFailed
fallbackLegacy | hydrateOk | hydrateFailed | compareDiffs | skipped
lastError | startedAt | lastEventAt
```

Função pública: `buildCrmActivityWriteSoakReport(tenantId, compareReport?)`

Inclui `auditSummary`, `activityStreamProjection` e nota de rollback.

---

## 7. Rollback

`CRM_ACTIVITY_WRITE_PRIMARY=false` → authority IndexedDB imediata.

- Sem rebuild
- Sem migration
- Sem alteração de UX
- Adapter não agenda pipeline (`assertWriteEnabledForTest` / `scheduleActivityWrite` no-op)

---

## 8. Idempotência

Write Toolkit compartilhado (`repositoryV3Idempotency`):

- `correlation_id`
- `idempotency_key` (`domain|tenant|legacyId|operation`)
- `tenant_id`
- skip de duplicate write (`syncResult: 'skipped'`)

---

## 9. Audit

`repositoryV3WriteAudit` in-memory:

- `writeSource`: `primary-write-hydrate` | `legacy-dual-write`
- `syncResult`: `ok` | `failed` | `shadow` | `skipped`
- **Não** persistido

---

## 10. Feature Flags

Defaults (todos `false`):

```text
CRM_ACTIVITY_WRITE=false
CRM_ACTIVITY_DUAL_WRITE=false
CRM_ACTIVITY_WRITE_PRIMARY=false
CRM_ACTIVITY_WRITE_COMPARE=false
```

Production guards:

- `PROD` trava todas as write flags
- host Supabase production bloqueia write/primary/dual/compare
- `WRITE_PRIMARY` exige `WRITE`
- Primary ON **exclui** dual-only (`isCrmActivityDualWriteOnlyEnabled`)

Contrato teste: `CRM_ACTIVITY_WRITE_PRIMARY_FLAGS_RESOLVED` em `rhTestFlagContract.js`.

---

## 11. Arquivos criados

| Arquivo | Papel |
|---------|-------|
| `src/repositories/crm/crmActivityWriteSoak.ts` | Soak metrics + `buildCrmActivityWriteSoakReport` |
| `src/repositories/crm/crmActivityHydrate.ts` | Hydrate pontual + projection |
| `src/__tests__/crmActivityWritePrimary.test.js` | Primary / hydrate / fallback / soak / guards |
| `docs/reports/PHASE_6_8_CRM_ACTIVITY_PRIMARY_WRITE_SOAK_VALIDATION.md` | Este relatório |

---

## 12. Arquivos modificados

| Arquivo | Mudança |
|---------|---------|
| `src/repositories/crm/crmActivityWritePipeline.ts` | Primary + hydrate + soak + compareDiff |
| `src/services/crmActivityWriteAdapter.js` | Fallback soak, modo primary/dual, helpers Primary, export report |
| `src/__tests__/rhTestFlagContract.js` | `CRM_ACTIVITY_WRITE_PRIMARY_FLAGS_RESOLVED` |
| `src/__tests__/crmRepositoryFoundation.test.js` | Inventário hydrate + soak |
| `src/__tests__/repositoryV3ArchitectureContract.test.js` | Inventário CRM Activity 6.8 |
| `docs/reports/README.md` | Índice Phase 6.8 |

---

## 13. Testes adicionados

`crmActivityWritePrimary.test.js`:

- Flags / dual vs primary exclusivity / PROD / host production
- Primary hydrate (lead event, task, complete/delete, follow-ups)
- Hydrate upsert sem duplicar
- Fallback remoto + IDB preservado
- Rollback por flag
- Legacy OFF
- Idempotência + audit
- Soak report metrics

---

## 14. Resultado da regressão

```text
Test Files  152 passed (152)
Tests       1557 passed | 1 skipped (1558)
```

Nenhuma regressão. Baseline 6.7: 1538 → 6.8: 1557 (+19).

---

## 15. Riscos residuais

1. **Remote stub** — Admin API Activity Write real ainda não existe; primary prova o path com eco de Activity.
2. **createTask → addLeadEvent** — dois writes (task + timeline event); com primary ON ambos podem agendar pipeline (comportamento já presente no dual 6.7).
3. **Microtask race** — write síncrono IDB + hydrate assíncrono; falha remota não reverte IDB (fallback explícito, by design).
4. **Triple follow-up** — `crmFollowUps` vs `followUps` ainda separados; unificação fora de escopo.

---

## 16. Recomendações para Phase 6.9 — CRM Wave C Foundation

1. Definir Wave C (WhatsApp / IA / Dashboard / Analytics — ou subconjunto mínimo).
2. Types/mappers/IDB readers/Admin API stubs Wave C (foundation-only).
3. Substituir stub remoto Activity por Admin API real em staging (quando schema existir).
4. Soak prolongado Activity Primary em staging com `WRITE_COMPARE`.
5. Não unificar follow-ups / não Event Sourcing nesta wave.

---

## 17. Confirmações finais

| Item | Status |
|------|--------|
| Produção não alterada | ✅ flags default OFF + production locks |
| Banco não alterado | ✅ |
| Migrations não executadas | ✅ |
| Supabase remoto não alterado | ✅ |
| Storage remoto não alterado | ✅ |
| IndexedDB preservado | ✅ |
| Frontend funcionalmente idêntico (flags OFF) | ✅ |
| Commit não realizado | ✅ |

---

**Phase 6.8 concluída. Aguardando aprovação formal para Phase 6.9.**
