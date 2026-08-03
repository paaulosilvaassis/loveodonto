# Phase 6.1 — CRM / Kanban Repository Foundation

**Status:** CONCLUÍDA  
**Baseline testes (Phase 5.15):** 1354 pass | 1 skip  
**Regressão final:** 1405 pass | 1 skip (+51)  
**Commit:** não realizado

---

## 1. Auditoria completa do CRM/Kanban

### 1.1 Escopo do domínio

O CRM/Kanban no Love Odonto abrange **dois universos distintos**:

| Universo | Rotas | Authority | Observação |
|----------|-------|-----------|------------|
| **CRM Clínico** | `/crm/*` | IndexedDB | Pipeline comercial, leads, orçamentos CRM |
| **Marketing Chat Inteligente** | `/marketing/chat-inteligente/*` | IndexedDB (+ schema Supabase preparado) | Funis, inbox, WhatsApp simulado |
| **Fluxo Operacional** | `/gestao-comercial/*` | IndexedDB | Kanban de appointments (não leads) |

**Phase 6.1 foca o CRM Clínico** (`crmLeads`, pipeline, tasks, settings). Marketing Chat permanece escopo futuro (Phase 6.x separada).

### 1.2 Entidades mapeadas

| Entidade | Store IDB | Service principal |
|----------|-----------|-------------------|
| **Pipeline / Kanban** | `crmPipelineStages` | `crmPipelineStageService` |
| **Leads** | `crmLeads` | `crmService` |
| **Oportunidades** | (via `stageKey` + lead) | `crmService`, `crmPipelineStageService` |
| **Funil** | `crmPipelineStages` + KPIs | `crmReportsService`, `crmService.getFunnelMetrics` |
| **Follow-up (legado)** | `crmFollowUps` | `crmService.createFollowUp/listFollowUps` |
| **Follow-up (estratégico)** | `followUps` | `followUpService` |
| **Tarefas** | `crmTasks` | `crmTaskService` |
| **Histórico / Timeline** | `crmLeadEvents` | `crmService.addLeadEvent/listLeadEvents` |
| **Eventos** | `crmLeadEvents` | `crmService.CRM_EVENT_TYPE` |
| **Etiquetas** | `crmTags`, `leadTags` | `crmTagService` |
| **Responsáveis** | campo `assignedToUserId` | `crmService`, `crmSettingsService` (equipe) |
| **Motivos de perda** | `crmLossReasons` | `crmSettingsService` |
| **Motivos de ganho** | (via stage `conversion`) | `crmPipelineStageService.findConversionStage` |
| **Conversões** | lead→patient | `crmService.convertLeadToPatient`, `crmBudgetService` |
| **Orçamentos CRM** | `crmBudgets`, `crmBudgetLinks` | `crmBudgetService` |
| **Agendamentos CRM** | `appointments` (leadId) | `appointmentService.createAppointmentFromCrm` |
| **Automações** | `crmAutomations` | `crmService`, `crmSettingsService` |
| **WhatsApp logs** | `crmMessageLogs` | `crmService.logWhatsAppSent` |
| **Config WhatsApp** | `crmWhatsAppSettings` | `crmSettingsService` |
| **Metas comerciais** | `crmCommercialGoals` | `crmReportsService`, `crmSettingsService` |
| **Origens / Interesses** | `crmLeadSources`, `crmLeadInterests` | `crmSettingsService` |

### 1.3 Services (11 core + adjacentes)

| Service | Path | Métodos-chave |
|---------|------|---------------|
| `crmService` | `src/services/crmService.js` | CRUD leads, pipeline, timeline, WhatsApp, KPIs, automações |
| `crmPipelineStageService` | `src/services/crmPipelineStageService.js` | Estágios, contagem, conversion/lost stage |
| `crmSettingsService` | `src/services/crmSettingsService.js` | Origens, interesses, perdas, equipe, metas, WhatsApp, conversão |
| `crmTaskService` | `src/services/crmTaskService.js` | CRUD tasks, link appointment |
| `crmTagService` | `src/services/crmTagService.js` | Tags categorizadas, junction lead↔tag |
| `crmBudgetService` | `src/services/crmBudgetService.js` | Orçamentos CRM, conversão paciente |
| `crmReportsService` | `src/services/crmReportsService.js` | Dashboard, funil, KPIs, velocidade, perdas |
| `followUpService` | `src/services/followUpService.js` | Follow-up estratégico (store `followUps`) |
| `marketingChatService` | `src/services/marketingChatService.js` | Marketing Chat (40+ exports) — **fora escopo 6.1** |
| `patientFlowService` | `src/services/patientFlowService.js` | Fluxo operacional (appointments) |
| `journeyEntryService` | `src/services/journeyEntryService.js` | Jornada do paciente |

**Repository legado órfão:** `src/crm/repositories/crmRepository.js` — adapter IDB **não adotado** por nenhum consumer.

### 1.4 Pages e rotas CRM Clínico

| Rota | Page |
|------|------|
| `/crm/captacao` | `CrmCaptacaoPage` |
| `/crm/pipeline` | `CrmPipelinePage` (Kanban) |
| `/crm/leads`, `/crm/leads/:id` | `CrmLeadsListPage`, `CrmLeadProfilePage` |
| `/crm/comunicacao` | `CrmComunicacaoPage` |
| `/crm/followup` | `CrmFollowupPage` |
| `/crm/orcamentos` | `CrmOrcamentosPage` |
| `/crm/relatorios` | `CrmRelatoriosPage` |
| `/crm/automacoes` | `CrmAutomacoesPage` |
| `/crm/configuracoes` | `CrmConfiguracoesPage` |

**Placeholder legado:** `/gestao/crm` → `PlaceholderPage` (CRM real em `/crm/*`).

### 1.5 Components

- `src/crm/ui/` — 29 arquivos (PipelineColumn, LeadCard, modais, settings)
- `src/components/flow/` — Kanban operacional (appointments)
- Hook: `src/crm/hooks/useCrmTenantLabels.js`

### 1.6 IndexedDB — 20+ collections CRM

Principais: `crmLeads`, `crmPipelineStages`, `crmLeadEvents`, `crmTasks`, `crmFollowUps`, `followUps`, `crmTags`, `leadTags`, `crmBudgets`, `crmBudgetLinks`, `crmAutomations`, `crmMessageLogs`, `crmLeadSources`, `crmLeadInterests`, `crmCommercialTeam`, `crmCommercialGoals`, `crmFollowUpSettings`, `crmLossReasons`, `crmWhatsAppSettings`, `crmConversionSettings`.

### 1.7 Admin API

**Nenhuma rota REST dedicada a CRM** no `server/` nesta fase. Zero alteração HTTP.

### 1.8 Integrações

| Integração | Mecanismo |
|------------|-----------|
| **Agenda** | `createAppointmentFromCrm`, `ScheduleFromLeadModal`, `leadId` em appointments |
| **Pacientes** | `convertLeadToPatient`, `createPatientFromLead` |
| **Financeiro** | `crmBudgetService`, `dashboardMetricsService` (KPIs cruzados) |
| **WhatsApp** | `buildWhatsAppLink`, templates, Marketing Chat (separado) |
| **IA** | Placeholders `/comercial/whatsapp/ia` — sem LLM real |

### 1.9 Achados arquiteturais

1. **Triple follow-up:** `crmFollowUps`, `crmTasks`, `followUps` — stores distintas
2. **Dois Kanbans:** Pipeline comercial vs Fluxo operacional
3. **crmRepository legado órfão** — substituído por `src/repositories/crm/` V3
4. **100% client-side IDB** — migração Supabase exige Admin API nova (Phase 6.2+)

---

## 2. Inventário de consumidores

### 2.1 Pages → Services

| Page | Services consumidos |
|------|---------------------|
| CrmCaptacaoPage | `crmService`, `crmSettingsService` |
| CrmPipelinePage | `crmService`, `crmPipelineStageService`, `crmTagService` |
| CrmLeadsListPage | `crmService`, `crmTaskService`, `crmPipelineStageService` |
| CrmLeadProfilePage | `crmService`, `crmTaskService`, `crmTagService`, `crmBudgetService` |
| CrmComunicacaoPage | `crmService`, `crmSettingsService` |
| CrmFollowupPage | `crmService` |
| CrmOrcamentosPage | `crmBudgetService` |
| CrmRelatoriosPage | `crmReportsService`, `crmPipelineStageService` |
| CrmAutomacoesPage | `crmService`, `crmSettingsService` |
| CrmConfiguracoesPage | `crmSettingsService`, `crmPipelineStageService` |

### 2.2 Services adjacentes → CRM

| Consumer | CRM dependency |
|----------|----------------|
| `appointmentService` | `createAppointmentFromCrm`, `addLeadEvent`, `moveLeadToStage` |
| `clinicalAppointmentCloseService` | `crmTaskService.createTask`, `followUpService` |
| `patientFlowDashboardService` | `crmBudgetService` |
| `dashboardMetricsService` | conta `crmBudgets` |
| `contractVariableResolver` | resolve de `crmBudget` |

---

## 3. Inventário de serviços — matriz método → consumidor

### crmService (principais)

| Método | Consumidores |
|--------|--------------|
| `createLead` | CaptacaoPage, PipelineLeadModal, ImportLeadsModal |
| `listLeads` | PipelinePage, LeadsListPage, RelatoriosPage |
| `getLeadById` | LeadProfilePage, LeadDetailsModal, ComercialFollowUpPage |
| `updateLead` | PipelineLeadModal, LeadProfilePage, MarkLeadLostModal |
| `moveLeadToStage` | PipelinePage, appointmentService |
| `convertLeadToPatient` | ConvertLeadToPatientModal, crmBudgetService |
| `addLeadEvent` / `listLeadEvents` | LeadTimeline, appointmentService |
| `getKPIs` / `getFunnelMetrics` | RelatoriosPage, CrmFunnelChart |
| `buildWhatsAppLink` / `logWhatsAppSent` | ComunicacaoPage, flow components |

### crmPipelineStageService

| Método | Consumidores |
|--------|--------------|
| `listPipelineStagesForTenant` | PipelinePage, LeadsTable, PipelineStagesEditor |
| `savePipelineStagesForTenant` | CrmConfiguracoesPage, PipelineStagesConfigModal |
| `findConversionStage` / `findLostStage` | crmService, MarkLeadLostModal |

### crmTaskService

| Método | Consumidores |
|--------|--------------|
| `listTasks` / `createTask` | LeadTasksTab, ComercialFollowUpPage, clinicalAppointmentCloseService |
| `linkAppointmentAndComplete` | ScheduleFromLeadModal |

### crmSettingsService

| Método | Consumidores |
|--------|--------------|
| `listLeadSourcesForTenant` | ConfiguracoesPage, useCrmTenantLabels |
| `listLossReasonsForTenant` | MarkLeadLostModal |
| `getWhatsAppSettings` | ComunicacaoPage |

---

## 4. Repository Toolkit criado

**Estratégia:** nova camada `src/repositories/shared/` consumida **apenas pelo CRM**. Domínios legados (RH, Clinic, Agenda, Financial) **não foram alterados** — zero regressão.

| Módulo | Função |
|--------|--------|
| `repositoryV3FlagHelpers.ts` | `parseBooleanLike`, env/tenant flags, Supabase prod ref |
| `repositoryV3ProductionGuards.ts` | `lockDangerousFlags`, `applyProductionSafeLocksGeneric` |
| `repositoryV3SyncHelpers.ts` | offline, shadow scheduler, compare, dev logs |
| `repositoryV3CacheBase.ts` | `createMemoryCache` com TTL + invalidate |
| `repositoryV3MapperHelpers.ts` | `normalizeTenantId`, `resolveLegacyId`, `isUuid`, `pickServerField` |

**Testes:** `repositoryV3ToolkitContract.test.js` (17 testes)

---

## 5. Repository Foundation

### 5.1 Arquivos criados (`src/repositories/crm/`)

| Arquivo | Responsabilidade |
|---------|------------------|
| `crmTypes.ts` | LeadCore, PipelineStageCore, interfaces, erros |
| `crmRepositoryFlags.ts` | CRM_READ, CRM_READ_PRIMARY, CRM_SHADOW, CRM_COMPARE |
| `crmMapper.ts` | legado ↔ core ↔ server (leads, stages, events) |
| `crmCache.ts` | Memory cache TTL 5min, invalidate |
| `crmIndexedDbRepository.ts` | Leitura sync IDB (leads, stages, events) |
| `crmAdminApiRepository.ts` | Stubs remotos (Phase 6.2) |
| `crmRepositorySync.ts` | Hydrate, compare, dev logs |
| `crmRepository.ts` | Facade — IDB authority com flags OFF |

### 5.2 Bridge e Read Adapter

| Arquivo | Status |
|---------|--------|
| `src/services/crmRepositoryBridge.js` | Criado — **não wired** em crmService |
| `src/services/crmReadAdapter.js` | Criado — retorna `null` com flags OFF |

---

## 6. Read Adapter Foundation

Funções preparadas (retornam `null` quando flags OFF):

- `readListLeads(filters)`
- `readGetLead(leadId, tenantId)`
- `readListPipelineStages(tenantId)`
- `readListLeadEvents(leadId)`
- `readHydrateCrmCache(tenantId)` — awaitable para testes

**Nenhum service legado importa o adapter nesta fase.**

---

## 7. Cache Foundation

| Capacidade | Implementação | Ativo |
|------------|---------------|-------|
| Memory Cache | `CrmCache` via `createMemoryCache` | Preparado |
| TTL | `CRM_CACHE_TTL_MS = 5min` | Preparado |
| IndexedDB Mirror | `hydrateCrmIdbCache()` | Preparado (Phase 6.2+) |
| Hydrate | pós-read primary | Não ativado |
| Invalidate | `invalidateTenant()` | Preparado |

---

## 8. Feature Flags

| Flag | Default | Env | Production lock |
|------|---------|-----|-----------------|
| `CRM_READ` | false | `VITE_CRM_READ` | ✅ |
| `CRM_READ_PRIMARY` | false | `VITE_CRM_READ_PRIMARY` | ✅ |
| `CRM_SHADOW` | false | `VITE_CRM_SHADOW` | ✅ |
| `CRM_COMPARE` | false | `VITE_CRM_COMPARE` | ✅ |

**Contrato Vitest:** `CRM_TEST_FLAG_CONTRACT` em `rhTestFlagContract.js`

**Flags resolvidas para Phase 6.2:** `CRM_READ_PRIMARY_FLAGS_RESOLVED`

---

## 9. Arquivos criados

```
src/repositories/shared/
  repositoryV3FlagHelpers.ts
  repositoryV3ProductionGuards.ts
  repositoryV3SyncHelpers.ts
  repositoryV3CacheBase.ts
  repositoryV3MapperHelpers.ts

src/repositories/crm/
  crmTypes.ts
  crmRepositoryFlags.ts
  crmMapper.ts
  crmCache.ts
  crmIndexedDbRepository.ts
  crmAdminApiRepository.ts
  crmRepositorySync.ts
  crmRepository.ts

src/services/
  crmRepositoryBridge.js
  crmReadAdapter.js

src/__tests__/
  crmRepositoryFoundation.test.js
  repositoryV3ToolkitContract.test.js

docs/reports/
  PHASE_6_1_CRM_KANBAN_REPOSITORY_FOUNDATION.md
```

---

## 10. Arquivos modificados

| Arquivo | Alteração |
|---------|-----------|
| `src/__tests__/rhTestFlagContract.js` | `CRM_TEST_FLAG_CONTRACT`, `CRM_READ_PRIMARY_FLAGS_RESOLVED`, isolation |
| `src/__tests__/repositoryV3ArchitectureContract.test.js` | Domínio CRM + toolkit refs |

**Nenhuma page, service legado, server route ou schema IDB alterado.**

---

## 11. Testes adicionados

| Arquivo | Testes |
|---------|--------|
| `crmRepositoryFoundation.test.js` | 29 |
| `repositoryV3ToolkitContract.test.js` | 17 |
| `repositoryV3ArchitectureContract.test.js` | +3 (CRM domain) |

**Categorias cobertas:** estrutura, flags, production guards, mapper, cache, IDB reader, facade, bridge wiring, read adapter, interfaces, toolkit contracts.

---

## 12. Resultado da regressão

```
Test Files  142 passed (142)
Tests       1405 passed | 1 skipped (1406)
Duration    35.09s
```

**Delta vs Phase 5.15:** +51 testes.

---

## 13. Riscos residuais

1. **Triple follow-up** — confusão entre `crmFollowUps`, `crmTasks`, `followUps` na migração write
2. **crmRepository legado órfão** — coexistência com V3 até remoção explícita
3. **Marketing Chat separado** — schema Supabase existe mas runtime IDB; escopo distinto
4. **Entidades secundárias** — tasks, budgets, settings ainda sem types V3 dedicados (Wave 2+)
5. **Placeholder `/gestao/crm`** — rota legada pode confundir operadores

---

## 14. Recomendações — Phase 6.2 CRM Read Cutover

1. Criar `server/lib/crmApiList.js` + rotas `GET /internal/app/crm/leads`, `/pipeline-stages`
2. Criar `src/services/crmAdminApi.js` (cliente HTTP)
3. Wire `crmReadAdapter` em `crmService.listLeads` / `getLeadById` (padrão Agenda)
4. Implementar shadow read + compare com flags `CRM_SHADOW` / `CRM_COMPARE`
5. Expandir types para `CrmTaskCore`, `CrmBudgetCore` (Wave 2)
6. Testes: `crmReadCutover.test.js`, `crmApiList.test.js`
7. Manter Marketing Chat fora do escopo até CRM Clínico estabilizado

---

## 15. Confirmações finais

| Item | Status |
|------|--------|
| Produção não alterada | ✅ |
| Banco não alterado | ✅ |
| Migrations não executadas | ✅ |
| Supabase remoto não alterado | ✅ |
| Storage remoto não alterado | ✅ |
| IndexedDB preservado | ✅ |
| Frontend funcionalmente idêntico (flags OFF) | ✅ |
| Read/Write/Shadow/Compare não iniciados | ✅ |
| Commit não realizado | ✅ |

---

**FIM Phase 6.1 — aguardar aprovação formal.**
