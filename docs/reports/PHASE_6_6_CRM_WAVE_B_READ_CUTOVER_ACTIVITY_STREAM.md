# Phase 6.6 — CRM Wave B Read Cutover (Activity Stream)

**Data:** 2026-07-09  
**Baseline anterior:** 1497 pass | 1 skip (Phase 6.5)  
**Regressão Phase 6.6:** **1520 pass | 1 skipped** (+23)

**Commit:** não realizado

---

## 1. Auditoria dos READs Wave B

| Domínio | Método público | Service | Store IDB | Shape legado |
|---------|----------------|---------|-----------|--------------|
| Timeline | `listLeadEvents` / `getLeadEvents` | `crmService` | `crmLeadEvents` | `{ id, leadId, type, userId, data, createdAt }` |
| Timeline | `getLeadEvent` *(novo)* | `crmService` | `crmLeadEvents` | idem |
| CRM FollowUps | `listFollowUps` | `crmService` | `crmFollowUps` | `{ id, leadId, dueAt, type, notes, doneAt, ... }` |
| CRM FollowUps | `getCrmFollowUp` *(novo)* | `crmService` | `crmFollowUps` | idem |
| CRM Tasks | `listTasks` | `crmTaskService` | `crmTasks` | `{ id, clinicId, title, dueAt, status, ... }` |
| CRM Tasks | `getTask` *(novo)* | `crmTaskService` | `crmTasks` | idem |
| Strategic FollowUps | `listFollowUps` | `followUpService` | `followUps` | `{ id, clinicId, dueDate, status, ... }` |
| Strategic FollowUps | `getStrategicFollowUp` *(novo)* | `followUpService` | `followUps` | idem |

**Consumidores:** inalterados (pages/components). Wiring exclusivo nos services via `crmWaveBAdapter` — flags OFF = path legado IDB.

---

## 2. Activity Stream criado

DTO interno `CrmActivity` (`crmActivityTypes.ts`):

| Campo | Tipo |
|-------|------|
| `type` | `CALL \| EMAIL \| FOLLOW_UP \| TASK \| MOVE_STAGE \| NOTE \| WHATSAPP \| AUTOMATION \| SYSTEM` |
| `id` | string |
| `leadId` | string \| null |
| `patientId` | string \| null |
| `ownerId` | string \| null |
| `timestamp` | string |
| `status` | string |
| `payload` | Record |
| `source` | `crmLeadEvents \| crmFollowUps \| crmTasks \| followUps` |
| `tenantId` | string |

**Unificação apenas na Repository Layer.** Stores IDB permanecem intactas e distintas.

Mapeamento de eventos → Activity type (exemplos):
- `status_change` → `MOVE_STAGE`
- `message_sent` → `WHATSAPP`
- `contact` → `CALL`
- `follow_up_created` / follow-ups → `FOLLOW_UP`
- tasks → `TASK`

---

## 3. Métodos migrados

| # | Método | Adapter | Repository Activity |
|---|--------|---------|---------------------|
| 1 | `listLeadEvents` / `getLeadEvents` | `readListLeadEventsWaveB` | `listLeadEventActivities` |
| 2 | `getLeadEvent` | `readGetLeadEventWaveB` | `getLeadEventActivity` |
| 3 | `listFollowUps` (crmService) | `readListCrmLegacyFollowUpsWaveB` | `listCrmLegacyFollowUpActivities` |
| 4 | `getCrmFollowUp` | `readGetCrmLegacyFollowUpWaveB` | `getCrmLegacyFollowUpActivity` |
| 5 | `listTasks` | `readListCrmTasksWaveB` | `listCrmTaskActivities` |
| 6 | `getTask` | `readGetCrmTaskWaveB` | `getCrmTaskActivity` |
| 7 | `listFollowUps` (followUpService) | `readListStrategicFollowUpsWaveB` | `listStrategicFollowUpActivities` |
| 8 | `getStrategicFollowUp` | `readGetStrategicFollowUpWaveB` | `getStrategicFollowUpActivity` |
| 9 | *(interno)* Activity Stream | `readListActivitiesWaveB` | `listActivities` |

Primary Read reconstrói **shape legado** a partir de Activity (consumidores não veem o DTO unificado).

---

## 4. Matriz Método → Repository

```
listLeadEvents          → readListLeadEventsWaveB
                        → CrmActivityRepository.listLeadEventActivities
                        → mapActivityToLeadEventLegacy

listFollowUps (CRM)     → readListCrmLegacyFollowUpsWaveB
                        → listCrmLegacyFollowUpActivities
                        → mapActivityToCrmLegacyFollowUpLegacy

listTasks               → readListCrmTasksWaveB
                        → listCrmTaskActivities
                        → mapActivityToCrmTaskLegacy

listFollowUps (estratégico) → readListStrategicFollowUpsWaveB
                            → listStrategicFollowUpActivities
                            → mapActivityToStrategicFollowUpLegacy

listActivities (interno) → listActivities (4 sources unificadas)
```

**Fonte de dados Primary Read nesta phase:** IndexedDB via Activity mappers (sem novos endpoints HTTP Admin API). Preparado para remote na Phase 6.7+.

---

## 5. Métodos ainda legados (WRITE + fora de escopo)

- Todos os **writes**: `addLeadEvent`, `createFollowUp`, `createTask`, `completeTask`, `completeFollowUp`, etc.
- WhatsApp logs (`listMessageLogs`)
- Dashboard / Reports / Analytics
- Automações / Settings
- IA

---

## 6. Adapter

`crmWaveBAdapter.js` evoluiu de no-op (6.5) para Read Cutover:

| Flag OFF | Comportamento |
|----------|---------------|
| qualquer | `return null` → service usa `loadDb()` legado |

| Flag ON (`CRM_ACTIVITY_READ` + `CRM_ACTIVITY_READ_PRIMARY`) | Comportamento |
|------------------------------------------------------------|---------------|
| Primary | Activity Stream → shape legado |

Shadow/Compare agendados via `queueMicrotask` sem alterar resposta síncrona.

---

## 7. Shadow

Flag: `CRM_ACTIVITY_SHADOW` (default `false`)

- Executa `shadowReadDiscard` em paralelo
- Descarta resposta
- Logs apenas em DEV (`[CRM_ACTIVITY_SHADOW]`)

---

## 8. Compare

Flag: `CRM_ACTIVITY_COMPARE` (default `false`)

Compara campos: `id`, `type`, `leadId`, `ownerId`, `timestamp`, `status`, `payload`

- Nunca altera resposta ao caller
- Logs DEV em mismatch

---

## 9. Primary Read

Flag: `CRM_ACTIVITY_READ_PRIMARY` (exige `CRM_ACTIVITY_READ`)

- Default `false`
- Bloqueada em `import.meta.env.PROD`
- Bloqueada em host Supabase produção
- Sem hydrate automático / sem TTL ativo no path Activity

---

## 10. Arquivos criados

| Arquivo | Propósito |
|---------|-----------|
| `src/repositories/crm/crmActivityTypes.ts` | DTO Activity Stream |
| `src/repositories/crm/crmActivityMapper.ts` | Mappers store↔Activity↔legado |
| `src/repositories/crm/crmActivityFlags.ts` | Flags + production guards |
| `src/repositories/crm/crmActivityRepository.ts` | Facade read Activity Stream |
| `src/__tests__/crmActivityReadCutover.test.js` | 21 testes |
| `docs/reports/PHASE_6_6_CRM_WAVE_B_READ_CUTOVER_ACTIVITY_STREAM.md` | Este relatório |

---

## 11. Arquivos modificados

| Arquivo | Alteração |
|---------|-----------|
| `src/services/crmWaveBAdapter.js` | Read Cutover + shadow/compare/primary |
| `src/services/crmService.js` | Wiring READ timeline + followUps + get* |
| `src/services/crmTaskService.js` | Wiring READ listTasks + getTask |
| `src/services/followUpService.js` | Wiring READ listFollowUps + getStrategicFollowUp |
| `src/__tests__/rhTestFlagContract.js` | Contrato Activity flags |
| `src/__tests__/crmWaveBFoundation.test.js` | Ajustes pós-wiring |
| `src/__tests__/crmRepositoryFoundation.test.js` | Inventário arquivos Activity |
| `src/__tests__/repositoryV3ArchitectureContract.test.js` | Flags Activity no contrato |

**Não alterados:** pages, UX, payloads HTTP públicos, banco, migrations, Supabase/Storage remoto.

---

## 12. Testes adicionados

**`crmActivityReadCutover.test.js` (21):**
- Feature flags + production guards
- Activity DTO / mapper / compare
- Repository stream unificado
- Adapter null (flags OFF)
- Primary Read: events, tasks, followUps, strategic
- Legacy preservation
- Shadow / Compare
- Inventário

---

## 13. Resultado da regressão

```
Test Files  150 passed (150)
Tests       1520 passed | 1 skipped (1521)
```

Delta vs Phase 6.5: **+23 testes**. Zero regressões funcionais.

---

## 14. Riscos residuais

1. **Primary Read ainda é IDB-backed** via Activity mappers — não há Admin API HTTP Wave B; remote cutover real fica para fase futura.
2. **Triple store** permanece; Activity Stream unifica só na leitura repository — writes ainda geram dados em stores paralelas.
3. **Roundtrip Activity→legado** pode perder campos opcionais raros se payload incompleto (mitigado: payload carrega campos originais).
4. **Colisão de nomes** `listFollowUps` entre `crmService` e `followUpService` permanece (imports distintos).
5. **Shadow/Compare** com mesma fonte IDB validam mapper, não divergência remota — útil até existir remote.

---

## 15. Recomendações para Phase 6.7 — CRM Wave B Write Cutover

1. Dual-write shadow para: `addLeadEvent`, `createFollowUp` (CRM), `createTask` / `completeTask`, `createFollowUp` (estratégico).
2. Reutilizar Write Toolkit (`idempotency`, `audit`, `fallback`, `pipeline`).
3. Admin API POST/PUT/PATCH Wave B antes de Primary Write.
4. Activity Stream **não** deve ser write target — writes continuam nas stores canônicas; Activity é projeção de leitura.
5. Flags: `CRM_ACTIVITY_WRITE` / `CRM_ACTIVITY_DUAL_WRITE` (ou por domínio) default false + production lock.
6. Soak metrics espelhando `crmWriteSoak` para Activity writes.
7. Não unificar fisicamente as 3 stores de follow-up nesta phase.

---

## 16. Confirmações finais

| Item | Status |
|------|--------|
| Produção não alterada | ✅ Flags default false + production guards |
| Banco não alterado | ✅ |
| Migrations não executadas | ✅ |
| Supabase remoto não alterado | ✅ |
| Storage remoto não alterado | ✅ |
| IndexedDB preservado | ✅ Stores intactas |
| Frontend funcionalmente idêntico | ✅ Flags OFF = legado; Primary reconstrói shape legado |
| Commit não realizado | ✅ |

---

**Phase 6.6 concluída. Aguardando aprovação formal para Phase 6.7 — CRM Wave B Write Cutover.**
