# Phase 7.5 — CRM Wave B Domain Event Adoption

**Data:** 2026-07-10  
**Baseline anterior:** 1691 pass | 1 skip (Phase 7.4)  
**Regressão Phase 7.5:** **1713 pass | 1 skipped** (+22)

**Commit:** não realizado

---

## 1. Auditoria completa da Wave B

| Área | Fluxos | Domain Event |
|------|--------|--------------|
| Timeline explícita | `addLeadEvent` / `createLeadEvent` | `CRM_TIMELINE_EVENT_CREATED` (tipos não-side-effect) |
| Timeline side-effect | `logLeadEvent` em createFollowUp/createTask/moveLead/etc. | **não** republica DE |
| Follow-up legado | `createFollowUp` / `updateCrmFollowUp` (`crmFollowUps`) | CREATED + mutation resolver |
| Follow-up estratégico | `createFollowUp` / `updateStrategicFollowUp` / `completeFollowUp` (`followUps`) | CREATED + mutation / COMPLETED |
| Tasks | `createTask` / `updateTask` / `completeTask` / `cancelTask` / `deleteTask` / `linkAppointmentAndComplete` | CREATED / UPDATED / COMPLETED / DELETED |
| WhatsApp / `logMessage` | `crmMessageLogs` + timeline | **não adotado** (integração WhatsApp fora de escopo) |
| Automações budget/stuck | `maybeCreateFollowUpOn*` | herdam CREATED via `createFollowUp` estratégico |
| Close clínico | task + strategic follow-up | dois agregados distintos (ver matriz §9) |

**Integrações auditadas sem consumers DE:** Agenda (`createAppointmentFromCrm` → timeline), Patient Journey, WhatsApp, IA, Marketing Chat, Dashboard.

---

## 2. Inventário de stores

| Store | Papel | Authority write |
|-------|-------|-----------------|
| `crmLeadEvents` | Timeline do lead | `crmService` |
| `crmFollowUps` | Follow-up legado (leadId) | `crmService` |
| `followUps` | Follow-up estratégico Gestão Comercial | `followUpService` |
| `crmTasks` | Tarefas comerciais | `crmTaskService` |

Nenhuma store consolidada, renomeada ou removida.

---

## 3. Inventário de services e consumidores

| Service | Operações Wave B | Consome DE? |
|---------|------------------|-------------|
| `crmService` | lead events, crmFollowUps | Não |
| `followUpService` | followUps | Não |
| `crmTaskService` | crmTasks | Não |
| `crmActivityWriteAdapter` | dual-write Activity Stream | Não (sem DE) |
| UI / modais / pages | callers dos services | Sem alteração |

---

## 4. Pontos canônicos de publicação

Todos **após IDB ok**, **fora** de Repository / Write Adapter / Activity Adapter:

| Operação | Service | Publisher |
|----------|---------|-----------|
| Timeline explícita | `crmService.addLeadEvent` | `crmActivityDomainEventPublisher` |
| Follow-up legado | `crmService.createFollowUp` / `updateCrmFollowUp` | `crmFollowUpDomainEventPublisher` |
| Follow-up estratégico | `followUpService.*` | idem |
| Tasks | `crmTaskService.*` | `crmTaskDomainEventPublisher` |

API exclusiva: `publishViaDomainEventFacade`.

---

## 5. Eventos adotados

Registry estendido (+7) — necessidade comprovada; nomes genéricos:

| Evento | Origem |
|--------|--------|
| `CRM_TIMELINE_EVENT_CREATED` | addLeadEvent (tipos seguros) |
| `FOLLOW_UP_CREATED` | crmFollowUps + followUps (`sourceStore` no payload) |
| `FOLLOW_UP_UPDATED` / `COMPLETED` / `CANCELLED` / `RESCHEDULED` | mutations |
| `TASK_CREATED` / `UPDATED` / `COMPLETED` / `DELETED` | crmTasks |

Registry total: **33**.

---

## 6. Eventos não adotados e justificativas

| Candidato | Motivo |
|-----------|--------|
| `LEAD_NOTE_ADDED` | Sem write canônico separado; notes via `updateLead` → `LEAD_UPDATED` |
| `CRM_ACTIVITY_CREATED` | Activity Stream é DTO unificado; store authority permanece nas 4 stores |
| `TASK_REOPENED` | Função inexistente |
| `FOLLOW_UP_*` em cancel/reschedule dedicados | Não há APIs dedicadas; coberto via update + precedência |
| Timeline types side-effect (`task_created`, `follow_up_created`, `status_change`, …) | Evita duplicidade com DE do service pai |
| `logMessage` / WhatsApp | Fora de escopo; não conectar WhatsApp |

---

## 7. Correção de correlation — CRM Wave A

`resolveLeadOperationCorrelation`:
1. preserva `correlationId` recebido;
2. se ausente, gera `de-corr-{uuid}` (padrão Agenda/Financial);
3. `lead.id` permanece **somente** em `aggregateId` / payload;
4. `causationId` só quando informado (não inventado).

`resolveLeadWriteCorrelationId` mantido como alias compatível (não retorna mais leadId).

Payloads públicos e retornos dos services **inalterados**.

---

## 8. Regra de precedência semântica

### Follow-up
```
complete > cancel > reschedule > update
```
(`create` é operação separada → só `FOLLOW_UP_CREATED`)

### Task
```
complete > delete > update
```
- `cancelTask` → `TASK_UPDATED` (status canceled) — sem `TASK_CANCELLED` no registry
- `completeTask` / `linkAppointmentAndComplete` → **somente** `TASK_COMPLETED` (não + UPDATED)
- `reopen` inexistente

### Timeline
Skip list impede `CRM_TIMELINE_EVENT_CREATED` quando o type já é side-effect de Lead/Task/Follow-up/Agenda/Budget/WhatsApp.

---

## 9. Matriz de duplicidade entre stores

| Store | Evento | Canônica? | Risco |
|-------|--------|-----------|-------|
| `crmFollowUps` | `FOLLOW_UP_*` + `sourceStore=crmFollowUps` | Sim (legado CRM) | Paralela a `followUps` |
| `followUps` | `FOLLOW_UP_*` + `sourceStore=followUps` | Sim (estratégico) | Paralela a `crmFollowUps` |
| `crmTasks` | `TASK_*` | Sim (comercial UI) | Close clínico também cria follow-up estratégico → **2 eventos** (agregados distintos) |
| `crmLeadEvents` | `CRM_TIMELINE_EVENT_CREATED` seletivo | Timeline explícita | Side-effects **não** geram DE |

**Não** publicar a mesma ação em task publisher + follow-up publisher para a mesma mutação. Close clínico cria duas entidades → dois DE com correlations distintas (aceitável; shared correlation fica para callers futuros).

---

## 10. Payloads e sanitização

- Timeline: ids, type, actor, occurredAt, metadata sem notes/description/objetos
- Follow-up: followUpId, leadId, tenantId, ownerId, status, scheduledAt, completedAt, previousScheduledAt, sourceStore
- Task: taskId, leadId, tenantId, ownerId, status, dueAt, completedAt, taskType, sourceStore

Sem conversas WhatsApp, clínico, prontuário, financeiro completo, tokens.

---

## 11. Correlation e causation

Padrão Wave B: `resolveCrmWaveBOperationCorrelation` → `de-corr-*`.  
Causation opcional (ex.: follow-up/task derivados de lead). Testes cobrem cadeia compartilhada.

---

## 12. Deduplicação

Facade default `enableDedup=true`. eventIds estáveis por operação (`de-task-created-{id}`, etc.).

---

## 13. Observability

Via Facade + flags ON: Metrics, Trace, Timeline, Diagnostics, Health, Inspector. Testes de cadeia, dedup e rejected.

---

## 14. Tratamento de falhas

`queueMicrotask` + catch DEV-only. Falha da Facade **não** desfaz IDB, não altera retorno, não recria activity/task/follow-up.

---

## 15. Garantia de ausência de consumers

Nenhum subscriber funcional. Sem WhatsApp/IA/Agenda/Journey/Financeiro/Analytics/webhooks/filas.

---

## 16. Arquivos criados

```
src/services/crmActivityDomainEventPublisher.js
src/services/crmFollowUpDomainEventPublisher.js
src/services/crmTaskDomainEventPublisher.js
src/__tests__/crmWaveBDomainEventsAdoption.test.js
docs/reports/PHASE_7_5_CRM_WAVE_B_DOMAIN_EVENT_ADOPTION.md
```

---

## 17. Arquivos modificados

| Arquivo | Mudança |
|---------|---------|
| `crmLeadDomainEventPublisher.js` | correlation `de-corr-*` |
| `crmService.js` | wiring timeline + follow-up legado |
| `followUpService.js` | wiring estratégico |
| `crmTaskService.js` | wiring tasks |
| `domainEventTypes.ts` / `domainEventRegistry.ts` | +7 eventos |
| `crmLeadDomainEventsAdoption.test.js` | asserts correlation corrigida |
| `domainEventsFoundation.test.js` | registry length 33 |
| `docs/reports/README.md` | índice |

---

## 18. Testes adicionados

`crmWaveBDomainEventsAdoption.test.js` (22): registry, guards, correlation Wave A, precedência, timeline/follow-up/task flows, flags OFF, falha Facade, adapters sem DE, sem consumers, side-effects legados, observability (correlation/causation/timeline/dedup/health).

---

## 19. Resultado da regressão

```
Test Files  159 passed (159)
Tests       1713 passed | 1 skipped (1714)
```

Delta vs 7.4: **+22**. Zero regressão.

---

## 20. Riscos residuais

1. Stores `crmFollowUps` / `followUps` paralelas — dois CREATED possíveis para conceitos similares (discriminados por `sourceStore`).
2. Close clínico → task + follow-up sem correlation compartilhada automática.
3. `addLeadEvent` aninhado em `createTask` (padrão legado) — timeline task_created pode ser frágil no IDB; DE de task não depende disso.
4. `cancelTask` sem dual-write Activity (pré-existente) — DE `TASK_UPDATED` mesmo assim.

---

## 21. Recomendações para Phase 7.6 — Domain Event Consumer Foundation

1. Criar foundation de consumers **estrutural** (base class / registry / flags), sem handlers de negócio.
2. Não conectar WhatsApp/IA/Agenda ainda.
3. Preparar contratos de idempotência e ordering por correlation.
4. Opcional: helper para shared correlation em operações multi-agregado (close clínico).
5. Manter flags default OFF + production locks.

---

## 22. Confirmações finais

- produção não alterada;
- banco não alterado;
- migrations não executadas;
- Supabase remoto não alterado;
- Storage remoto não alterado;
- IndexedDB preservado;
- frontend funcionalmente idêntico (flags OFF);
- stores legadas preservadas;
- nenhum consumer funcional criado;
- commit não realizado.

---

**Phase 7.5 concluída. Aguardando aprovação formal para Phase 7.6.**
