# Phase 7.8 — Analytics Projection Foundation

**Data:** 2026-07-13  
**Baseline anterior:** 1758 pass | 1 skip (Phase 7.7)  
**Regressão Phase 7.8:** **1773 pass | 1 skipped** (+15)

**Commit:** não realizado

---

## 1. Auditoria da Projection Foundation

| Item | Resultado |
|------|-----------|
| Camada | `src/domain-events/projections/` |
| Natureza | Estrutural in-memory |
| Persistência | **Nenhuma** |
| Integrações | **Nenhuma** |
| Auto-execução | **Não** — apply explícito via builder |
| Domínios alterados | **Não** (CRM / Agenda / Financeiro intocados) |
| Consumers / Audit Projection | **Não alterados** |

Projeções preparadas: `crm-counter`, `appointment-counter`, `financial-counter`.

---

## 2. Projection Store

`analyticsProjectionStore.ts`:

- Map in-memory de snapshots por `projectionId`
- Histórico ring buffer com cap default **1000**
- Snapshots commitados com `Object.freeze`
- `rebuild` / `reset` / `__clear*ForTest`
- Sem DB / Storage / IndexedDB

---

## 3. Reducers

Reducers puros em `analyticsProjectionReducer.ts`:

| Reducer | Projection | Eventos |
|---------|------------|---------|
| `reduceCrmCounter` | `crm-counter` | LEAD_*, FOLLOW_UP_*, TASK_*, CRM_TIMELINE_* |
| `reduceAppointmentCounter` | `appointment-counter` | APPOINTMENT_* |
| `reduceFinancialCounter` | `financial-counter` | RECEIVABLE_*, PAYABLE_*, FINANCING_*, PAYMENT_RECEIVED |

Não mutam o evento. Só produzem próximo snapshot.

---

## 4. Registry

`ANALYTICS_PROJECTION_REGISTRY`: mapa estático `evento → projectionId → reducerId`.  
Lookup via `getAnalyticsProjectionRegistryEntriesForEvent`.  
**Sem execução automática.**

---

## 5. Metrics

`analyticsProjectionMetrics.ts`:

- `totalProjections`
- `projectionUpdates`
- `projectionRebuilds`
- `projectionResets`
- `projectionSkips`

---

## 6. Health

Estados: `idle` | `ready` | `healthy` | `degraded`.

- Flag OFF → `idle`
- Flag ON + registry + zero updates → `ready`
- Após updates → `healthy`
- Registry vazio com flag ON → `degraded`

---

## 7. Inspector

- `inspectAnalyticsProjections` / `ById` / `Counters` (API interna)
- `inspectDomainEvents()` inclui `analyticsProjections`
- Sem HTTP. Sem UI.

---

## 8. Arquivos criados

```
src/domain-events/projections/analyticsProjectionTypes.ts
src/domain-events/projections/analyticsProjectionStore.ts
src/domain-events/projections/analyticsProjectionBuilder.ts
src/domain-events/projections/analyticsProjectionReducer.ts
src/domain-events/projections/analyticsProjectionRegistry.ts
src/domain-events/projections/analyticsProjectionInspector.ts
src/domain-events/projections/analyticsProjectionMetrics.ts
src/domain-events/projections/analyticsProjectionHealth.ts
src/domain-events/projections/index.ts
src/__tests__/analyticsProjectionFoundation.test.js
docs/reports/PHASE_7_8_ANALYTICS_PROJECTION_FOUNDATION.md
```

---

## 9. Arquivos modificados

| Arquivo | Mudança |
|---------|---------|
| `domainEventFlags.ts` | +`DOMAIN_EVENT_ANALYTICS` (default false, production lock) |
| `domain-events/index.ts` | export projections |
| `domainEventDiagnostics.ts` | conflitos ANALYTICS |
| `domainEventInspector.ts` | snapshot + helpers analytics |
| `rhTestFlagContract.js` | env contract + FLAGS_RESOLVED |
| `domainEventsFoundation.test.js` | guards nova flag |
| `domainEventObservability.test.js` | snapshot flags |
| `domainEventConsumerFoundation.test.js` | snapshot flags |
| `repositoryV3ArchitectureContract.test.js` | inventário projections |
| `docs/reports/README.md` | índice |

**Não modificados:** CRM/Agenda/Financeiro, Event Audit Projection consumer/attach, banco, migrations, remotes.

---

## 10. Testes adicionados

`analyticsProjectionFoundation.test.js` (~14): flags/guards, registry, reducers, store/cap, imutabilidade, metrics, health, inspector, flags OFF no-op, ausência de side-effects.

---

## 11. Resultado da regressão

```
Test Files  162 passed (162)
Tests       1773 passed | 1 skipped (1774)
```

Delta vs 7.7: **+15**. Zero regressão.

---

## 12. Riscos residuais

1. Analytics ainda não é alimentada automaticamente pelo Event Bus / consumers — apenas apply explícito (intencional nesta foundation).
2. Histórico volátil (cap FIFO) — adequado só DEV/testes.
3. Contadores agregados globais (não multi-tenant isolados na store) — suficiente para foundation; refinar no read model piloto.
4. Health/inspector dependem de `flagsInput` em testes (env default OFF).

---

## 13. Recomendações para Phase 7.9 — Analytics Read Model Pilot

1. Criar read model piloto in-memory (ex.: `CrmAnalyticsReadModel`) derivado das projections.
2. Opt-in wiring (consumer ou attach) atrás de `DOMAIN_EVENT_ANALYTICS`, sem auto no boot de produção.
3. Não persistir; não criar dashboard/UI/HTTP.
4. Isolar por `tenantId` se o piloto exigir leituras multi-tenant.
5. Manter Event Audit Projection separado (audit ≠ analytics).
6. Production locks + Migration Checklist intactos.

---

## 14. Confirmações finais

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

**Phase 7.8 concluída. Aguardando aprovação formal para Phase 7.9.**
