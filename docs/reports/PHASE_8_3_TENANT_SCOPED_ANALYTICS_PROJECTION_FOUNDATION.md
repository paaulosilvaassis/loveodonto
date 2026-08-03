# Phase 8.3 — Tenant-Scoped Analytics Projection Foundation

**Data:** 2026-07-13  
**Baseline anterior:** 1841 pass | 1 skip (Phase 8.2)  
**Regressão Phase 8.3:** **1853 pass | 1 skipped** (+12)

**Commit:** não realizado

---

## 1. Auditoria das Analytics Projections

### Matriz canônica

| eventType (exemplos) | projectionId | origem tenantId | reducer | store key | Read Model |
|----------------------|--------------|-----------------|---------|-----------|------------|
| LEAD_* / FOLLOW_UP_* / TASK_* / CRM_TIMELINE_* | `crm-counter` | `DomainEvent.tenantId` | `reduceCrmCounter` | `crm-counter::tenantId` | `lead-analytics` |
| APPOINTMENT_* | `appointment-counter` | `DomainEvent.tenantId` | `reduceAppointmentCounter` | `appointment-counter::tenantId` | `appointment-analytics` |
| RECEIVABLE_* / PAYABLE_* / FINANCING_* / PAYMENT_RECEIVED | `financial-counter` | `DomainEvent.tenantId` | `reduceFinancialCounter` | `financial-counter::tenantId` | `financial-analytics` |

### Cadeia

```text
Domain Event (tenantId obrigatório)
  → applyAnalyticsProjectionEvent
  → Reducer puro (somente aquele tenant)
  → Store key projectionId::tenantId
  → Read Model Builder / Refresh (mesmo tenant)
  → Snapshot / Cache / Inspector / Soak
```

---

## 2. Problema global → tenant-scoped

**Antes (8.2):** store `Map<projectionId>` last-writer-wins — risco de tenant A alimentar snapshot B.

**Depois (8.3):** store `Map<projectionId::tenantId>` — isolamento real na fonte.  
Projections globais **não** alimentam mais Read Models. Get sem tenant retorna `null` (sem agregação silenciosa).

---

## 3. Contrato de scope

Snapshot oficial:

- `projectionId`, `tenantId`, `scope: 'tenant'`, `version`, `counters`
- `createdAt`, `updatedAt`, `sourceEventCount`
- `lastEventId`, `lastEventType`, `lastCorrelationId`

Registry definition: `scope: 'tenant'`, `tenantRequired: true`, `supportedEventTypes`, `reducerId`, `version`.

`ANALYTICS_PROJECTION_SCOPE_BY_ID` atualizado para **`tenant`** nos três counters.

---

## 4. Chave `projectionId::tenantId`

Helpers oficiais:

- `buildAnalyticsProjectionScopeKey(projectionId, tenantId)`
- `parseAnalyticsProjectionScopeKey(scopeKey)`
- `requireAnalyticsProjectionTenantId` / `assertTenantScopeMatch`

Regras: tenant obrigatório; rejeita vazio/`null`/`undefined`; sem default; sem inferência por userId/aggregateId/correlationId.

---

## 5. Store tenant-aware

- Chave por scope; history ring **por scope**; cap por scope
- `get` exige tenant (sem tenant → `null`)
- `listAnalyticsProjectionsForTenant`
- `getAllAnalyticsProjections({ diagnostic: true })` — único dump multi-tenant explícito
- `resetAnalyticsProjectionsForTenant` / `rebuildAnalyticsProjectionForTenant` / `clearAnalyticsProjectionsById`
- `resetAnalyticsProjections` — clear total (testes/dev)
- Sem persistência; sem migração de dados globais antigos

---

## 6. Reducers tenant-aware

Puros: `(current, event) → next`.  
Não consultam store/Repository; não publicam; não mutam o evento.  
Mismatch de tenant entre current e event → retorna current inalterado.  
Apply rejeita mismatch **antes** do reducer.

---

## 7. Registry

Três definitions oficiais `scope: 'tenant'`, `tenantRequired: true`.  
Sem auto-bootstrap. Sem execução automática.

---

## 8. Eventos sem tenant

- Não atualizam projection
- `rejected: true` + códigos `MISSING_TENANT_SCOPE` / `INVALID_TENANT_SCOPE` / `TENANT_SCOPE_MISMATCH`
- Métricas + buffer `analyticsProjectionDiagnostics`
- Domínio operacional intacto (apply analytics é opt-in explícito)

---

## 9. Metrics

Segmentadas por `projectionId + tenantId`:

`totalEventsApplied|Skipped|Rejected`, `totalProjectionUpdates|Creates`, `totalResets|Rebuilds`, `totalTenantScopeErrors|Mismatches`, `lastEventAt`, `lastError`

Globais = somatório operacional apenas.

---

## 10. Health

Por tenant + consolidado.  
Degrada com: scope errors, mismatches, residual global, registry inconsistente, tenant degradado.  
Consolidado **não oculta** tenants degradados.

---

## 11. Inspector

Exige `tenantId` para dados de negócio.  
Com `diagnosticAllTenants: true` — dump explícito.  
Expõe registry, definitions, scope metrics, residuals, diagnostics. Sem HTTP/UI.

---

## 12. Compatibilidade com Read Models

Lead / Appointment / Financial:

- Refresh **exige** tenant explícito
- Consomem **somente** `getAnalyticsProjection(id, tenantId)` do mesmo tenant
- Cache / history / rebuild / Inspector mantêm isolamento
- Indicadores inalterados

---

## 13. Compatibilidade do Lead Analytics

Facade propaga tenant (`setLeadAnalyticsCompatTenant` no refresh).  
Store compartilhada preservada. APIs legadas + tenant explícito documentado.

---

## 14. Soak e Consistency

Scope declarado `tenant` → soak controlado retorna **`passing`**.  
Report: `promotionRecommendation: 'hold'` quando limpo (nunca auto-promote).  
`block` se isolation failure / drift / scope warning.

---

## 15. Feature Flags

**Nenhuma flag nova.**  
Todas permanecem default `false` + production locked.  
Decisão: fix estrutural in-memory sob `DOMAIN_EVENT_ANALYTICS` (OFF = no-op). Evita dual-run global+tenant.

---

## 16. Arquivos criados

```text
src/domain-events/projections/analyticsProjectionScope.ts
src/domain-events/projections/analyticsProjectionDiagnostics.ts
src/__tests__/tenantScopedAnalyticsProjection.test.js
docs/reports/PHASE_8_3_TENANT_SCOPED_ANALYTICS_PROJECTION_FOUNDATION.md
```

---

## 17. Arquivos modificados

```text
src/domain-events/projections/analyticsProjectionTypes.ts
src/domain-events/projections/analyticsProjectionStore.ts
src/domain-events/projections/analyticsProjectionReducer.ts
src/domain-events/projections/analyticsProjectionRegistry.ts
src/domain-events/projections/analyticsProjectionBuilder.ts
src/domain-events/projections/analyticsProjectionMetrics.ts
src/domain-events/projections/analyticsProjectionHealth.ts
src/domain-events/projections/analyticsProjectionInspector.ts
src/domain-events/projections/index.ts
src/domain-events/read-models/leadAnalyticsReadModel.ts
src/domain-events/read-models/analyticsReadModelRefresh.ts
src/domain-events/read-models/shared/readModelProjectionScope.ts
src/domain-events/read-models/shared/readModelSoakRunner.ts
src/domain-events/read-models/shared/readModelSoakReport.ts
src/domain-events/observability/domainEventInspector.ts
src/domain-events/observability/domainEventDiagnostics.ts
src/__tests__/analyticsProjectionFoundation.test.js
src/__tests__/readModelSoakValidation.test.js
src/__tests__/leadAnalyticsReadModelPilot.test.js
src/__tests__/multiReadModelAdoption.test.js
src/__tests__/repositoryV3ArchitectureContract.test.js
docs/reports/README.md
```

---

## 18. Testes adicionados

`tenantScopedAnalyticsProjection.test.js` (9) — store isolation, RM A≠B, soak passing, metrics, safety.  
Foundation / soak / lead pilot atualizados para tenant obrigatório.

---

## 19. Resultado da regressão

```text
Test Files  167 passed (167)
Tests       1853 passed | 1 skipped (1854)
```

Nenhuma regressão.

---

## 20. Drifts encontrados

Nenhum drift estrutural em soak controlado com scope=`tenant`.  
Comparações idênticas → `none` / `metadata-only` consistentes.

---

## 21. Resultado do tenant isolation

- Projection A ≠ B ✅  
- History / reset / rebuild / clear isolados ✅  
- Read Models A ≠ B (Lead, Appointment, Financial) ✅  
- Get sem tenant → `null` ✅  
- Residual global → 0 ✅  

---

## 22. Resultado do soak controlado

- Status `passing` para Lead / Appointment / Financial × tenants A e B ✅  
- Zero isolation failure / zero scope warning ✅  
- `promotionRecommendation: 'hold'` (sem auto-promote) ✅  

---

## 23. Bloqueios restantes para promoção

1. Flags CQRS / analytics / soak ainda default `false` + production locked  
2. Sem consumers em produção aplicando projections automaticamente  
3. Rebuild confiável ainda exige stream de eventos tenant-scoped (in-memory only)  
4. Phase 8.4 deve avaliar readiness formalmente antes de qualquer promoção  

---

## 24. Riscos residuais

- Facade Lead com `defaultTenantForCompat` — risco se Inspector legado for chamado sem refresh/tenant prévio  
- Clear total / rebuild sem tenant limpa memória; não recria tenants fictícios  
- Histórico in-memory volátil (intencional)  

---

## 25. Recomendações para Phase 8.4 — CQRS Read Model Promotion Readiness

1. Checklist formal de promoção (flags staging, soak gates, health gates)  
2. Attach controlado + auditoria de consumidores  
3. Remover ambiguidade do compat tenant default no Lead Inspector  
4. Evidências de soak `passing` + `hold` em staging local  
5. Ainda **sem** auto-promote; promoção humana explícita  

---

## 26. Confirmações finais

| Item | Status |
|------|--------|
| produção não alterada | ✅ |
| banco não alterado | ✅ |
| migrations não executadas | ✅ |
| Supabase remoto não alterado | ✅ |
| Storage remoto não alterado | ✅ |
| IndexedDB preservado | ✅ |
| frontend funcionalmente idêntico (flags OFF) | ✅ |
| nenhuma persistência criada | ✅ |
| nenhum side-effect de negócio | ✅ |
| nenhum auto-bootstrap | ✅ |
| nenhuma flag promovida | ✅ |
| commit não realizado | ✅ |

---

**Phase 8.3 concluída. Aguardando aprovação formal antes de qualquer Phase 8.4.**
