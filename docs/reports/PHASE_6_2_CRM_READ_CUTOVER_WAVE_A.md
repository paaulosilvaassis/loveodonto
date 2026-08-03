# Phase 6.2 — CRM Read Cutover (Wave A)

**Status:** CONCLUÍDA  
**Baseline testes (Phase 6.1):** 1405 pass | 1 skip  
**Regressão final:** 1437 pass | 1 skip (+32)  
**Commit:** não realizado

---

## 1. Auditoria completa dos READs (Wave A)

### 1.1 Pipeline

| Atributo | `listPipelineStages` | `getPipelineStage` |
|----------|---------------------|-------------------|
| **Método legado** | `listPipelineStagesForTenant(tenantId, { includeInactive })` | `getPipelineStageForTenant(tenantId, ref)` *(novo export Wave A)* |
| **Service** | `crmPipelineStageService.js` | `crmPipelineStageService.js` |
| **DTO legado** | `{ id, tenant_id, key, label, order, color, isActive, stageType, ... }` | idem |
| **DTO core** | `PipelineStageCore` | `PipelineStageCore` |
| **Mapper** | `mapLegacyRowToPipelineStageCore`, `mapCoreToPipelineStageLegacyRow`, `mapServerRowToPipelineStageCore` | idem |
| **IndexedDB** | `crmPipelineStages` via `listPipelineStagesLegacySync`, `getPipelineStageLegacySync` | idem |
| **Repository** | `listPipelineStagesCore`, `listPipelineStagesLegacySync` | `getPipelineStageCore`, `getPipelineStageLegacySync` |
| **Admin API** | `GET /internal/app/crm/pipeline-stages` | `GET /internal/app/crm/pipeline-stages/:id` |
| **Cache** | `BaseCache` (`createCrmCache`) — **sem TTL ativo em produção** | idem |
| **Riscos** | Ordenação `order` deve ser preservada; stages inativos filtrados por default | Lookup por `id`, `legacy_id` ou `key` |
| **Dependências** | `crmService.getPipelineStages()` (wrapper tenant hint) | `countLeadsByStageKey`, settings UI |

### 1.2 Leads

| Atributo | `listLeads` | `getLeadById` |
|----------|------------|---------------|
| **Método legado** | `listLeads(filters)` | `getLeadById(leadId)` |
| **Service** | `crmService.js` | `crmService.js` |
| **DTO legado** | `LeadLegacyRow` (camelCase IDB) | idem |
| **DTO core** | `LeadCore` | `LeadCore` |
| **Mapper** | `mapLegacyRowToLeadCore`, `mapServerRowToLeadCore`, `mapCoreToLeadLegacyRow` | idem |
| **IndexedDB** | `crmLeads` via `listLeadsLegacySync`, `getLeadLegacySync` | idem |
| **Repository** | `listLeadsCore`, `listLeadsLegacySync` | `getLeadCore`, `getLeadLegacySync` |
| **Admin API** | `GET /internal/app/crm/leads` | `GET /internal/app/crm/leads/:id` |
| **Cache** | `BaseCache` — hydrate em READ_PRIMARY | idem |
| **Riscos** | Post-process `enrichLeadWithTags` + sort por `updatedAt` permanecem no service | Tags junction (`leadTags`) ainda IDB-only |
| **Dependências** | 12+ pages/components (ver §2) | Lead profile, modals, agenda, follow-up |

### 1.3 Kanban

| Atributo | `listKanbanCards` | `getKanbanCard` |
|----------|------------------|----------------|
| **Método legado** | `listKanbanCards(filters)` *(novo export Wave A)* | `getKanbanCard(cardId)` *(novo export Wave A)* |
| **Service** | `crmService.js` | `crmService.js` |
| **Projeção** | Lead → Kanban card (`cardId` = lead id, `status` = `stageKey`, `ownerId` = `assignedToUserId`) | idem |
| **Mapper** | `mapLeadCoreToKanbanCard`, `mapKanbanCardCoreToLegacyRow` | idem |
| **IndexedDB** | `listKanbanCardsLegacySync`, `getKanbanCardLegacySync` (projeção de `crmLeads`) | idem |
| **Repository** | `listKanbanCardsCore`, `listKanbanCardsLegacySync` | `getKanbanCardCore`, `getKanbanCardLegacySync` |
| **Admin API** | `GET /internal/app/crm/kanban/cards` (alias leads) | `GET /internal/app/crm/kanban/cards/:id` |
| **Cache** | Herda cache de leads | idem |
| **Riscos** | Kanban comercial = leads; não confundir com fluxo operacional (`GestaoAtendimentoPage`) | |
| **Dependências** | `CrmPipelinePage` usa `listLeads` diretamente (cards = leads por stage) | |

---

## 2. Inventário dos consumidores

### 2.1 `listLeads`

| Consumer | Path | Impacto Wave A |
|----------|------|----------------|
| `CrmCaptacaoPage` | `src/pages/crm/CrmCaptacaoPage.jsx` | Indireto via adapter (flags OFF = legado) |
| `CrmPipelinePage` | `src/pages/crm/CrmPipelinePage.jsx` | Kanban board |
| `CrmOrcamentosPage` | `src/pages/crm/CrmOrcamentosPage.jsx` | Select de leads |
| `crmReportsService` | `src/services/crmReportsService.js` | KPIs/dashboard — **fora Wave A funcional** |
| Testes | `crmReadCutover`, `crmPipelineStages`, etc. | Cobertura |

### 2.2 `getLeadById`

| Consumer | Path |
|----------|------|
| `CrmLeadProfilePage` | `src/pages/crm/CrmLeadProfilePage.jsx` |
| `LeadDetailsModal` | `src/crm/ui/LeadDetailsModal.jsx` |
| `CrmFollowupPage` | `src/pages/crm/CrmFollowupPage.jsx` |
| `ComercialFollowUpPage` | `src/pages/comercial/ComercialFollowUpPage.jsx` |
| `AppointmentDetailsModal` | `src/components/agenda/AppointmentDetailsModal.jsx` |
| `ClinicalAppointmentPage` | `src/pages/ClinicalAppointmentPage.jsx` |

### 2.3 `getPipelineStages` / `listPipelineStagesForTenant`

| Consumer | Path |
|----------|------|
| `CrmCaptacaoPage`, `CaptacaoLeadForm` | captacao |
| `CrmPipelinePage` | kanban |
| `CrmLeadsListPage` | listagem |
| `CrmRelatoriosPage` | relatórios |
| `CrmSettingsModules` | configurações pipeline |
| `crmReportsService` | métricas |

### 2.4 `listKanbanCards` / `getKanbanCard`

Exports novos — **sem consumers diretos ainda**; `CrmPipelinePage` continua usando `listLeads`. Exports preparados para Phase 6.3+ e testes.

**Nenhum consumer foi alterado** — wiring exclusivamente nos services.

---

## 3. Inventário dos métodos migrados

| # | Domínio | Método público | Repository | Admin API | Status |
|---|---------|---------------|------------|-----------|--------|
| 1 | Pipeline | `listPipelineStagesForTenant` | `listPipelineStagesLegacySync` | GET pipeline-stages | ✅ Wired |
| 2 | Pipeline | `getPipelineStageForTenant` | `getPipelineStageLegacySync` | GET pipeline-stages/:id | ✅ Novo + wired |
| 3 | Pipeline | `getPipelineStages` | via `readListPipelineStages` | idem | ✅ Wired |
| 4 | Leads | `listLeads` | `listLeadsLegacySync` | GET leads | ✅ Wired |
| 5 | Leads | `getLeadById` | `getLeadLegacySync` | GET leads/:id | ✅ Wired |
| 6 | Kanban | `listKanbanCards` | `listKanbanCardsLegacySync` | GET kanban/cards | ✅ Novo + wired |
| 7 | Kanban | `getKanbanCard` | `getKanbanCardLegacySync` | GET kanban/cards/:id | ✅ Novo + wired |

---

## 4. Matriz Método → Repository

```
listPipelineStagesForTenant  → readListPipelineStages  → crmRepository.listPipelineStagesLegacySync
getPipelineStageForTenant    → readGetPipelineStage    → crmRepository.getPipelineStageLegacySync
getPipelineStages            → readListPipelineStages  → crmRepository.listPipelineStagesLegacySync
listLeads                    → readListLeads           → crmRepository.listLeadsLegacySync
getLeadById                  → readGetLead             → crmRepository.getLeadLegacySync
listKanbanCards              → readListKanbanCards     → crmRepository.listKanbanCardsLegacySync
getKanbanCard                → readGetKanbanCard       → crmRepository.getKanbanCardLegacySync
```

**Fluxo com flags OFF (default):** adapter retorna `null` → service executa path IndexedDB legado inalterado.

**Fluxo com READ_PRIMARY ON (dev/staging only):** adapter → repository → Admin API → hydrate IDB → cache memória → resposta legada.

---

## 5. Métodos ainda legados (fora Wave A)

| Categoria | Métodos / stores |
|-----------|-----------------|
| **Timeline** | `listLeadEvents`, `addLeadEvent`, store `crmLeadEvents` |
| **CRM Events** | `CRM_EVENT_TYPE`, eventos automáticos |
| **FollowUps** | `listFollowUps`, `createFollowUp` (`crmFollowUps` + `followUps`) |
| **CRM Tasks** | `crmTaskService.*` |
| **WhatsApp** | `buildWhatsAppLink`, `logWhatsAppSent`, `crmMessageLogs` |
| **Marketing Chat** | `marketingChatService` (40+ exports) |
| **IA CRM** | — |
| **Dashboard Comercial** | `crmReportsService.*`, KPIs, funil |
| **Conversões** | `convertLeadToPatient` |
| **Ganhos/Perdas** | stages conversion/lost, `crmLossReasons` |
| **Agenda CRM** | `createAppointmentFromCrm` |
| **Integração Financeira** | orçamentos CRM |
| **Métricas** | `getFunnelMetrics`, `getCommercialKpis` |
| **Escrita** | `createLead`, `updateLead`, `moveLeadToStage`, pipeline CRUD write |

---

## 6. Repository Toolkit reutilizado

| Módulo | Uso Wave A |
|--------|-----------|
| `repositoryV3FlagHelpers.ts` | Resolução flags tenant + env |
| `repositoryV3ProductionGuards.ts` | Bloqueio PROD + host Supabase produção |
| `repositoryV3SyncHelpers.ts` | `scheduleRepositoryMicrotask` (shadow/compare) |
| `repositoryV3CacheBase.ts` | `createCrmCache` extends BaseCache |
| `repositoryV3MapperHelpers.ts` | Helpers snake_case ↔ camelCase |

---

## 7. Read Adapter

**Arquivo:** `src/services/crmReadAdapter.js`

| Função | Comportamento |
|--------|--------------|
| `readListLeads` | null se flags OFF; legacy sync se READ_PRIMARY |
| `readGetLead` | idem |
| `readListPipelineStages` | idem |
| `readGetPipelineStage` | idem |
| `readListKanbanCards` | idem |
| `readGetKanbanCard` | idem |
| `readHydrateCrmCache` | awaitable hydrate (testes/bootstrap) |
| `__compareCrmIdbVsRemoteForTest` | compare exposto para testes |
| `__shadowReadCrmForTest` | shadow exposto para testes |

Side effects: `scheduleCrmCacheRehydrate` + `scheduleCrmShadowCompare` em microtask (nunca bloqueia UI).

---

## 8. Shadow Read

| Flag | Default | Comportamento |
|------|---------|--------------|
| `CRM_SHADOW` (`VITE_CRM_SHADOW`) | `false` | Executa `listLeads` + `listPipelineStages` remotos em paralelo; descarta resposta |

- Nunca altera estado, UI ou resposta
- Logs apenas em DEV: `[CRM_SHADOW] shadow-read { label, count, discarded: true }`
- Implementação: `crmRepository.shadowReadDiscard` → `shadowReadDiscardRemote`

---

## 9. Compare Mode

| Flag | Default | Campos comparados |
|------|---------|------------------|
| `CRM_COMPARE` (`VITE_CRM_COMPARE`) | `false` | `legacyId`, `stageKey`, `patientId`, `assignedToUserId`, `createdAt`, `updatedAt` |

- Leads + pipeline stages comparados IDB vs remote
- Diferenças logadas em DEV: `[CRM_SHADOW] compare { mismatchCount, diffs }`
- Nunca altera resposta retornada ao caller

---

## 10. Primary Read

| Flag | Default | Comportamento |
|------|---------|--------------|
| `CRM_READ` | `false` | Habilita caminho repository |
| `CRM_READ_PRIMARY` | `false` | Admin API → hydrate IDB → cache → resposta |

**Guards:**
- `import.meta.env.PROD` → força OFF
- Host `uoepkwhqztmsjnzirpev` (Supabase produção) → READ_PRIMARY bloqueado
- READ_PRIMARY exige CRM_READ=true

---

## 11. Arquivos criados

| Arquivo | Descrição |
|---------|-----------|
| `server/lib/crmApiList.js` | Handlers GET CRM (leads, pipeline, kanban) |
| `src/services/crmAdminApi.js` | Cliente HTTP Admin API CRM |
| `src/__tests__/crmApiList.test.js` | 15 testes server-side |
| `src/__tests__/crmReadCutover.test.js` | 17 testes cutover + wiring |
| `docs/reports/PHASE_6_2_CRM_READ_CUTOVER_WAVE_A.md` | Este relatório |

---

## 12. Arquivos modificados

| Arquivo | Alteração |
|---------|-----------|
| `server/index.js` | 6 rotas GET CRM registradas |
| `src/services/crmService.js` | Wiring adapter: listLeads, getLeadById, getPipelineStages, listKanbanCards, getKanbanCard |
| `src/services/crmPipelineStageService.js` | Wiring adapter: listPipelineStagesForTenant, getPipelineStageForTenant |
| `src/repositories/crm/crmTypes.ts` | KanbanCardCore, interfaces expandidas |
| `src/repositories/crm/crmMapper.ts` | Mappers Kanban + pipeline legacy row |
| `src/repositories/crm/crmIndexedDbRepository.ts` | get/list pipeline + kanban sync readers |
| `src/repositories/crm/crmAdminApiRepository.ts` | Registradores remote get/list kanban + stage |
| `src/repositories/crm/crmRepositorySync.ts` | Compare expandido, shadowReadDiscardRemote |
| `src/repositories/crm/crmRepository.ts` | Métodos Wave A completos |
| `src/services/crmRepositoryBridge.js` | Remote clients + scheduleCrmShadowCompare |
| `src/services/crmReadAdapter.js` | Funções Wave A completas |

---

## 13. Testes adicionados

| Suite | Testes | Cobertura |
|-------|--------|-----------|
| `crmApiList.test.js` | 15 | Query parsing, mappers, fetch pages, HTTP 503/404/400 |
| `crmReadCutover.test.js` | 17 | Flags, adapter, wiring, READ_PRIMARY, SHADOW, COMPARE, inventário |
| **Total novos** | **32** | |

Cobertura existente preservada: `crmRepositoryFoundation.test.js` (29), `repositoryV3ToolkitContract.test.js` (17).

---

## 14. Resultado da regressão

```
Test Files  144 passed (144)
     Tests  1437 passed | 1 skipped (1438)
  Duration  ~35s
```

**Delta vs Phase 6.1:** +32 testes, 0 regressões.

---

## 15. Riscos residuais

| Risco | Severidade | Mitigação |
|-------|-----------|-----------|
| Tabelas `crm_leads` / `crm_pipeline_stages` ausentes no Supabase remoto | Média | Admin API retorna 503 `CRM_TABLE_MISSING`; READ_PRIMARY faz fallback IDB |
| Tags (`enrichLeadWithTags`) permanecem IDB-only | Baixa | Aceito Wave A; compare pode reportar diffs em tags |
| Triple follow-up stores (`crmFollowUps`, `crmTasks`, `followUps`) | Baixa | Fora escopo; Phase futura |
| `getPipelineStages()` sem tenant explícito usa hint IDB | Baixa | Padrão Agenda; funciona com clinicProfile |
| Kanban operacional vs comercial | Baixa | Documentado; exports separados |
| READ_PRIMARY em staging requer tabelas + seed | Média | Shadow/compare validam antes de promover |

---

## 16. Recomendações — Phase 6.3 CRM Write Cutover (Wave A)

1. **Escrita leads:** `createLead`, `updateLead`, `moveLeadToStage` → dual-write IDB + Admin API POST/PUT
2. **Escrita pipeline:** `createPipelineStage`, `updatePipelineStage`, `deletePipelineStage` → Admin API write handlers
3. **Flags:** `CRM_WRITE`, `CRM_WRITE_PRIMARY`, `CRM_IDB_WRITE_DISABLED` (seguir matriz Financeiro)
4. **Ordem sugerida:** moveLeadToStage (alto impacto Kanban) → createLead → updateLead → pipeline CRUD
5. **Manter:** timeline, tasks, follow-ups, WhatsApp, marketing chat em IDB-only até waves dedicadas
6. **Validar:** staging soak com READ_PRIMARY ON por 48h antes de write cutover
7. **Migrar consumers Kanban:** `CrmPipelinePage` pode adotar `listKanbanCards` quando shape Kanban estiver estável

---

## 17. Confirmações finais

| Item | Status |
|------|--------|
| Produção não alterada | ✅ Flags default OFF; guards PROD ativos |
| Banco não alterado | ✅ Zero migrations |
| Migrations não executadas | ✅ |
| Supabase remoto não alterado | ✅ Apenas GET handlers preparados |
| Storage remoto não alterado | ✅ |
| IndexedDB preservado | ✅ Authority com flags OFF; hydrate não ativo em prod |
| Frontend funcionalmente idêntico | ✅ Zero alteração em pages/components |
| Commit não realizado | ✅ |

---

**Phase 6.2 encerrada. Aguardando aprovação formal para Phase 6.3 — CRM Write Cutover (Wave A).**
