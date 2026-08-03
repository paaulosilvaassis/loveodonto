# Phase 6.5 — CRM Wave B Foundation

**Data:** 2026-07-09  
**Baseline anterior:** 1484 pass | 1 skip (Phase 6.4)  
**Regressão Phase 6.5:** **1497 pass | 1 skip** (+13)

**Commit:** não realizado

---

## 1. Auditoria completa da Wave B

Wave B cobre o **histórico comercial e ações de follow-up/tarefas** do CRM Clínico — fora do cutover Wave A (Leads + Pipeline).

| Conceito de produto | Implementação real |
|---------------------|-------------------|
| Timeline / histórico / movimentação | `crmLeadEvents` via `crmService` |
| Follow-up legado (Kanban / CRM) | `crmFollowUps` via `crmService` |
| Tarefas comerciais | `crmTasks` via `crmTaskService` |
| Follow-up estratégico (Gestão Comercial) | `followUps` via `followUpService` |
| Próximos contatos | União conceitual das 3 stores + `lead.lastContactAt` |
| Eventos automáticos | `crmAutomations` + `crmFollowUpSettings` (estrutura; execução limitada) |

**Não existem** stores `commercialHistory` / `movementHistory` / `nextContacts` — o histórico é a timeline.

**Fora do escopo Wave B foundation (mantidos legados):** WhatsApp logs, orçamentos CRM, tags, automações runtime, Marketing Chat.

---

## 2. Inventário de stores

| Store IDB | Schema | Tenant | Papel Wave B |
|-----------|--------|--------|--------------|
| `crmLeadEvents` | v16 | parcial (`tenant_id` opcional) | Timeline / auditoria |
| `crmFollowUps` | v16 | parcial | Follow-up legado (só `leadId`) |
| `crmTasks` | v22 | sim (`tenant_id`) | Tarefas CRM |
| `followUps` | v20 | via `clinicId` | Follow-up estratégico |
| `crmMessageLogs` | v17 | — | Adjacente (gera evento `message_sent`) |
| `crmFollowUpSettings` | v49+ | sim | Config (não migrado nesta phase) |
| `crmAutomations` | v16 | parcial | Automações (não migrado) |

---

## 3. Inventário de services

| Service | Store | Métodos-chave |
|---------|-------|---------------|
| `crmService` | `crmLeadEvents`, `crmFollowUps` | `listLeadEvents`, `addLeadEvent`, `createFollowUp`, `listFollowUps`, `CRM_EVENT_TYPE` |
| `crmTaskService` | `crmTasks` | `listTasks`, `createTask`, `updateTask`, `completeTask`, `cancelTask`, `deleteTask`, `getTaskSummary` |
| `followUpService` | `followUps` | `listFollowUps`, `createFollowUp`, `completeFollowUp`, `getFollowUpSummary` |
| `crmReportsService` | derivado | KPIs misturam `listTasks` + `listFollowUps(crmService)` |
| `clinicalAppointmentCloseService` | dual | Cria **task + followUp estratégico** |

**Colisão de nomes:** `createFollowUp` / `listFollowUps` existem em `crmService` e `followUpService` com assinaturas e stores diferentes.

---

## 4. Inventário de consumidores

### Timeline (`crmLeadEvents`)
- `CrmLeadProfilePage`, `LeadTimeline`, `LeadDetailsModal` (aba histórico)
- `CrmLeadsListPage`, `CrmPipelinePage` (`addLeadEvent`)
- `crmReportsService`, `timelineLabels.js`

### `crmFollowUps`
- `CrmFollowupPage`, `CrmPipelinePage`, `CrmLeadsListPage`
- `LeadCard`, `LeadDetailsModal` (próximas ações)
- `crmReportsService`

### `crmTasks`
- `ComercialFollowUpPage`, `LeadTasksTab`, `CrmLeadProfilePage`
- `CrmLeadsListPage`, `crmBudgetService`, `clinicalAppointmentCloseService`
- `gestaoAtendimentoLegacy.js`

### `followUps` (estratégico)
- `clinicalAppointmentCloseService` (principal writer de produção)
- Helpers `maybeCreateFollowUpOn*` **sem callers** no `src/`

### Hooks
- Nenhum hook dedicado a events/tasks/follow-ups (`useCrmTenantLabels` apenas).

---

## 5. Duplicidades encontradas

**Três modelos paralelos** com overlap conceitual (“lembrar de contatar”) — **não são a mesma data**:

| Dimensão | `crmFollowUps` | `crmTasks` | `followUps` |
|----------|----------------|------------|-------------|
| Escopo | Só `leadId` | Lead **ou** patient (+ budget/appointment) | Patient/lead/budget; `clinicId` |
| Due | `dueAt` (datetime) | `dueAt` | `dueDate` (date) |
| Conclusão | `doneAt` | `status` + `doneAt` | `status` + `completedAt` |
| Título | `notes` + `type` | `title` obrigatório | `description` |
| Timeline | Evento `follow_up_created` | `task_created` / `task_done` | **Não** gera `crmLeadEvents` |
| UI | `/crm/followup`, Kanban | `/comercial/follow-up`, `LeadTasksTab` | Quase só fechamento clínico |

**Overlap real:** `clinicalAppointmentCloseService` faz dual-write task + strategic follow-up.

**Decisão Phase 6.5:** documentar e tipar os **três** domínios separadamente (`CrmLegacyFollowUp*`, `CrmTask*`, `StrategicFollowUp*`). **Não unificar** nesta phase.

Documentado em `CRM_WAVE_B_DOMAIN_INVENTORY` (`crmWaveBAdapter.js`).

---

## 6. Tipos e mappers criados

### Tipos (`crmTypes.ts`)
- `CrmLegacyFollowUpCore` / `CrmLegacyFollowUpLegacyRow`
- `CrmTaskCore` / `CrmTaskLegacyRow`
- `StrategicFollowUpCore` / `StrategicFollowUpLegacyRow`
- `CrmWaveBListFilters`
- `CrmDomain` expandido: `lead-event` | `crm-legacy-followup` | `crm-task` | `strategic-followup`
- Interfaces IDB / Admin API / Repository / Cache estendidas para Wave B

### Mappers (`crmMapper.ts`)
| Domínio | Legacy→Core | Server→Core | Core→Legacy |
|---------|-------------|-------------|-------------|
| Lead Event | `mapLegacyRowToLeadEventCore` (tenant hint) | `mapServerRowToLeadEventCore` | `mapCoreToLeadEventLegacyRow` |
| Legacy FollowUp | `mapLegacyRowToCrmLegacyFollowUpCore` | `mapServerRowToCrmLegacyFollowUpCore` | `mapCoreToCrmLegacyFollowUpLegacyRow` |
| Task | `mapLegacyRowToCrmTaskCore` | `mapServerRowToCrmTaskCore` | `mapCoreToCrmTaskLegacyRow` |
| Strategic FollowUp | `mapLegacyRowToStrategicFollowUpCore` | `mapServerRowToStrategicFollowUpCore` | `mapCoreToStrategicFollowUpLegacyRow` |

---

## 7. Repository Foundation Wave B

| Camada | Status |
|--------|--------|
| `crmIndexedDbRepository` | Readers sync para as 4 stores |
| `crmCache` | Namespaces Wave B preparados (events/tasks/followups) |
| `crmRepository` | Sync legacy + `*Core` async **sempre IDB** (sem remote) |
| `crmAdminApiRepository` | Stubs `listLeadEvents` / `listCrmLegacyFollowUps` / `listCrmTasks` / `listStrategicFollowUps` + `registerCrmRemote*` |
| `crmWaveBAdapter` | Sempre `null` / no-op — **sem wiring em services** |
| `crmReadAdapter` | Exports Wave B stub (`return null`) |
| Flags | **Nenhuma flag Wave B nova** — evita ativação acidental |

**Comportamento:** 100% IndexedDB authority. Zero Read/Write Cutover. Zero shadow/compare Wave B.

---

## 8. Arquivos criados

| Arquivo | Propósito |
|---------|-----------|
| `src/services/crmWaveBAdapter.js` | Adapter no-op + inventário de duplicidade |
| `src/__tests__/crmWaveBFoundation.test.js` | 13 testes estruturais |
| `docs/reports/PHASE_6_5_CRM_WAVE_B_FOUNDATION.md` | Este relatório |

---

## 9. Arquivos modificados

| Arquivo | Alteração |
|---------|-----------|
| `src/repositories/crm/crmTypes.ts` | Tipos Wave B + interfaces |
| `src/repositories/crm/crmMapper.ts` | Mappers Wave B |
| `src/repositories/crm/crmIndexedDbRepository.ts` | Readers Wave B |
| `src/repositories/crm/crmCache.ts` | Cache multi-domínio Wave B |
| `src/repositories/crm/crmRepository.ts` | Facade sync + Core IDB-only |
| `src/repositories/crm/crmAdminApiRepository.ts` | Stubs + registers Wave B |
| `src/services/crmReadAdapter.js` | Stubs Wave B (`return null`) |

**Não modificados (propositalmente):** `crmService.js`, `crmTaskService.js`, `followUpService.js`, pages, UX, HTTP contracts, flags defaults.

---

## 10. Testes adicionados

**`crmWaveBFoundation.test.js` (13):**
- Estrutura / inventário de stores
- Mappers roundtrip + server mappers
- IDB reader + repository Core IDB-only
- Cache Wave B isolado de leads
- Adapters sempre `null`
- Services legados authority (flags OFF)
- Services **não** importam `crmWaveBAdapter`
- Duplicidade documentada (3 stores distintas)

---

## 11. Resultado da regressão

```
Test Files  149 passed (149)
Tests       1497 passed | 1 skipped (1498)
```

Delta vs Phase 6.4: **+13 testes**. Zero regressões funcionais.

---

## 12. Riscos residuais

1. **Triple follow-up** permanece — risco de UX confusa e dual-write em fechamento clínico; unificação é decisão de produto (não desta phase).
2. **`crmFollowUps` / `crmLeadEvents` sem `tenant_id` consistente** em registros antigos — mappers usam `tenantIdHint` (clinicProfile).
3. **Admin API Wave B** ainda stub — Phase 6.6 precisará de rotas GET reais antes de Read Primary.
4. **Colisão de nomes** `listFollowUps` / `createFollowUp` entre services — consumidores devem importar o service correto.
5. **`maybeCreateFollowUpOn*`** dead code — candidata a limpeza futura, não nesta phase.

---

## 13. Recomendações para Phase 6.6 — CRM Wave B Read Cutover

1. Introduzir flags dedicadas (ex.: `CRM_WAVE_B_READ` / `CRM_WAVE_B_READ_PRIMARY`) default `false`, production-locked.
2. Prioridade de cutover read: **Timeline (`crmLeadEvents`) → `crmTasks` → `crmFollowUps` → `followUps`**.
3. Criar Admin API GET para cada domínio (contrato espelhando Wave A).
4. Wiring mínimo em `crmService.listLeadEvents` / `crmTaskService.listTasks` via adapter (null quando flags OFF).
5. **Não** unificar as 3 stores no cutover — migrar em paralelo com compare por domínio.
6. Shadow/compare opcional por domínio após soak de leitura.
7. Adiar write cutover Wave B para Phase 6.7+.

---

## 14. Confirmações finais

| Item | Status |
|------|--------|
| Produção não alterada | ✅ Flags default false; adapters no-op |
| Banco não alterado | ✅ |
| Migrations não executadas | ✅ |
| Supabase remoto não alterado | ✅ |
| Storage remoto não alterado | ✅ |
| IndexedDB preservado | ✅ |
| Frontend funcionalmente idêntico | ✅ Services/pages sem wiring Wave B |
| Commit não realizado | ✅ |

---

**Phase 6.5 concluída. Aguardando aprovação formal para Phase 6.6 — CRM Wave B Read Cutover.**
