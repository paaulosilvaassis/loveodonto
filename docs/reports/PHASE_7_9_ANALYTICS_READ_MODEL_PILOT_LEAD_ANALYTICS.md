# Phase 7.9 — Analytics Read Model Pilot (Lead Analytics)

**Data:** 2026-07-13  
**Baseline anterior:** 1773 pass | 1 skip (Phase 7.8)  
**Regressão Phase 7.9:** **1787 pass | 1 skipped** (+14)

**Commit:** não realizado

---

## 1. Auditoria do Read Model

| Item | Resultado |
|------|-----------|
| Read Model | `LeadAnalyticsReadModel` (`readModelId: lead-analytics`) |
| Fonte | Analytics Projection `crm-counter` **apenas** |
| Repository / IndexedDB / Supabase | **Não consulta** |
| Domain Events diretos | **Não consome** |
| Persistência | **Nenhuma** |
| Domínios CRM/Agenda/Financeiro | **Intocados** |
| Consumers / Projection Foundation | **Não alterados** (somente leitura da API pública) |

Indicadores estruturais:

| Indicador | Derivação piloto |
|-----------|------------------|
| `totalLeads` | `leadsCreated` |
| `totalConverted` | `leadsMoved` (proxy estrutural) |
| `totalLost` | `0` (ainda ausente na projection) |
| `totalInProgress` | `max(0, leads − converted − lost)` |
| `totalCreatedToday` / `totalUpdatedToday` | deltas UTC do dia vs build anterior |

---

## 2. Builder

`leadAnalyticsBuilder.ts` — `buildLeadAnalyticsSnapshot` produz snapshots `Object.freeze`.  
Clock injectável (`now`) para testes de “today”. Não muta a projection de origem.

---

## 3. Store

`leadAnalyticsStore.ts` — memória apenas; histórico com cap default **100**; `commit` / `reset` / `__clear*ForTest`.

---

## 4. Metrics

`totalSnapshots`, `snapshotUpdates`, `snapshotResets`, `snapshotBuilds` (+ `snapshotSkips` operacional).

---

## 5. Health

`idle` | `ready` | `healthy` | `degraded`  
Flag OFF → `idle`; ON sem builds → `ready`; após refresh → `healthy`.

---

## 6. Inspector

- `inspectLeadAnalyticsReadModel`
- `inspectDomainEvents().leadAnalyticsReadModel`
- Sem HTTP / UI

---

## 7. Arquivos criados

```
src/domain-events/read-models/leadAnalyticsTypes.ts
src/domain-events/read-models/leadAnalyticsBuilder.ts
src/domain-events/read-models/leadAnalyticsStore.ts
src/domain-events/read-models/leadAnalyticsMetrics.ts
src/domain-events/read-models/leadAnalyticsHealth.ts
src/domain-events/read-models/leadAnalyticsReadModel.ts
src/domain-events/read-models/leadAnalyticsInspector.ts
src/domain-events/read-models/index.ts
src/__tests__/leadAnalyticsReadModelPilot.test.js
docs/reports/PHASE_7_9_ANALYTICS_READ_MODEL_PILOT_LEAD_ANALYTICS.md
```

---

## 8. Arquivos modificados

| Arquivo | Mudança |
|---------|---------|
| `domainEventFlags.ts` | +`LEAD_ANALYTICS_READ_MODEL` (default false, production lock; exige EVENTS+ANALYTICS) |
| `domain-events/index.ts` | export read-models |
| `domainEventDiagnostics.ts` | conflitos da nova flag |
| `domainEventInspector.ts` | snapshot + helper lead analytics |
| `rhTestFlagContract.js` | contrato Vitest + FLAGS_RESOLVED |
| `domainEventsFoundation.test.js` | defaults / locked keys |
| `domainEventObservability.test.js` | snapshot flags |
| `domainEventConsumerFoundation.test.js` | snapshot flags |
| `repositoryV3ArchitectureContract.test.js` | inventário read-models |
| `docs/reports/README.md` | índice |

**Não modificados:** Projection Foundation sources, CRM/Agenda/Financeiro, consumers, audit projection.

---

## 9. Testes adicionados

`leadAnalyticsReadModelPilot.test.js` (13): flags/guards, builder/counters, refresh via projection, imutabilidade/cap, metrics, health, inspector, ausência de Repository/IDB/Supabase/side-effects, projection foundation sem acoplamento reverso.

---

## 10. Resultado da regressão

```
Test Files  163 passed (163)
Tests       1787 passed | 1 skipped (1788)
```

Delta vs 7.8: **+14**. Zero regressão.

---

## 11. Riscos residuais

1. `totalConverted` usa `leadsMoved` como proxy — não é conversão de negócio real.
2. `totalLost` permanece 0 até a projection expor estágio perdido.
3. Refresh ainda é **explícito** (sem wiring automático no Event Bus).
4. Day buckets são UTC e voláteis (in-memory).

---

## 12. Recomendações para Phase 8.0 — CQRS Read Model Foundation

1. Generalizar contratos de Read Model (registry, lifecycle, isolation por tenant).
2. Definir interface canônica `refreshFromProjection(projectionId)` reutilizável.
3. Opt-in wiring consumer→projection→read-model atrás de flags, sem boot em produção.
4. Separar read models de audit projection e de analytics counters brutos.
5. Não introduzir persistência/UI/HTTP nesta wave.
6. Manter Production Guards + Migration Checklist.

---

## 13. Confirmações finais

- produção não alterada;
- banco não alterado;
- migrations não executadas;
- Supabase remoto não alterado;
- Storage remoto não alterado;
- IndexedDB preservado;
- frontend funcionalmente idêntico;
- nenhuma persistência criada;
- nenhum side-effect de negócio;
- commit não realizado.

---

**Phase 7.9 concluída. Aguardando aprovação formal para Phase 8.0.**
