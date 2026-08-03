# Phase 7.3 — Domain Event Observability Foundation

**Data:** 2026-07-10  
**Baseline anterior:** 1647 pass | 1 skip (Phase 7.2)  
**Regressão Phase 7.3:** **1668 pass | 1 skipped** (+21)

**Commit:** não realizado

---

## 1. Auditoria da infraestrutura de observabilidade

Camada isolada em `src/domain-events/observability/`, sem alteração de CRM, Financeiro ou Agenda.

| Componente | Papel | Persistência | HTTP / UI |
|------------|-------|--------------|-----------|
| Metrics | Contadores in-memory | Não | Não |
| Trace | Rastreio por ids de correlação/agregado | Não | Não |
| Timeline | Cadeia in-memory (flat + árvore) | Não | Não |
| Diagnostics | Issues estruturais | Não | Não |
| Health | Status dos componentes DE | Não | Não |
| Inspector | API interna de snapshot | Não | Não |
| Attach | Opt-in via audit hooks | Não | Não |

**Integração:** `attachDomainEventObservability` registra hook em `domainEventAuditHooks` somente com `DOMAIN_EVENTS` + `DOMAIN_EVENT_OBSERVABILITY`. Default OFF → zero efeito em runtime de produção/staging com locks.

**Não criado:** consumers, dashboards, telas, endpoints HTTP, publicações novas, wiring em services de domínio.

---

## 2. Metrics

Arquivo: `domainEventMetrics.ts`

Contadores: `totalPrepared`, `totalPublished`, `totalSkipped`, `totalRejected`, `totalFailures`, `totalDuplicates`, `totalRetries`, `totalNoOps` (+ `startedAt` / `lastEventAt`).

Mapeamento a partir de audit status via `recordDomainEventMetricFromAuditStatus` (dedup → duplicates; `DOMAIN_EVENTS=false` → noOps).

---

## 3. Trace

Arquivo: `domainEventTrace.ts`

Campos: `correlationId`, `causationId`, `aggregateId`, `aggregateType`, `eventType`, `tenantId` (+ `eventId`, `status`, `timestamp`).

Lookups: por correlation, aggregate, eventType, tenant. Cap in-memory: 500.

---

## 4. Timeline

Arquivo: `domainEventTimeline.ts`

- Flat ordenado por timestamp
- Árvore por `causationId` → `eventId` (scoped por `correlationId` opcional)
- Sem renderização / sem consumers

---

## 5. Diagnostics

Arquivo: `domainEventDiagnostics.ts`

Códigos: `INVALID_EVENT`, `REGISTRY_INCONSISTENT`, `INVALID_PAYLOAD`, `DUPLICATE_PUBLISH`, `BROKEN_CORRELATION`, `MISSING_CAUSATION`, `CONFLICTING_FLAGS`.

---

## 6. Health

Arquivo: `domainEventHealth.ts`

Componentes: `publisher`, `registry`, `validator`, `serializer`, `bus`, `audit`, `retry`, `deduplication`.

Com `DOMAIN_EVENTS=false` → `overall: idle` (produção intacta).

---

## 7. Inspector

Arquivo: `domainEventInspector.ts`

API interna: `inspectDomainEvents`, lookups por correlation/aggregate/type/tenant, health e diagnostics. **Sem endpoints HTTP.**

---

## 8. Arquivos criados

```
src/domain-events/observability/domainEventMetrics.ts
src/domain-events/observability/domainEventTrace.ts
src/domain-events/observability/domainEventTimeline.ts
src/domain-events/observability/domainEventDiagnostics.ts
src/domain-events/observability/domainEventHealth.ts
src/domain-events/observability/domainEventInspector.ts
src/domain-events/observability/attachDomainEventObservability.ts
src/domain-events/observability/index.ts
src/__tests__/domainEventObservability.test.js
docs/reports/PHASE_7_3_DOMAIN_EVENT_OBSERVABILITY_FOUNDATION.md
```

---

## 9. Arquivos modificados

| Arquivo | Mudança |
|---------|---------|
| `src/domain-events/domainEventFlags.ts` | Flag `DOMAIN_EVENT_OBSERVABILITY` (default false, production locked, exige `DOMAIN_EVENTS`) |
| `src/domain-events/domainEventAudit.ts` | Campo `causationId` no audit record (infra) |
| `src/domain-events/index.ts` | Re-export observability |
| `src/__tests__/rhTestFlagContract.js` | Contrato Vitest + `DOMAIN_EVENTS_FLAGS_RESOLVED` |
| `src/__tests__/domainEventsFoundation.test.js` | Guards da nova flag |
| `src/__tests__/domainEventToolkit.test.js` | Contrato OBSERVABILITY OFF |
| `src/__tests__/repositoryV3ArchitectureContract.test.js` | Inventário `domain-events/observability` |
| `docs/reports/README.md` | Índice do relatório |

**Não modificados:** services CRM/Financeiro/Agenda, adapters, publishers de domínio, Supabase, migrations, IndexedDB schemas.

---

## 10. Testes adicionados

`src/__tests__/domainEventObservability.test.js` — Metrics, Trace, Timeline, Diagnostics, Health, Inspector, Production Guards, Feature Flags, attach via audit hooks, estrutura de pasta.

Contratos atualizados: foundation, toolkit, architecture, flag contract.

---

## 11. Resultado da regressão

```
Test Files  157 passed (157)
Tests       1668 passed | 1 skipped (1669)
```

Delta vs Phase 7.2: **+21** testes. Nenhuma regressão.

---

## 12. Riscos residuais

1. Observabilidade **não** está auto-anexada no boot — exige `attachDomainEventObservability` (opt-in). Domínios 7.1/7.2 não alimentam metrics até attach + flags ON.
2. Cap in-memory (500) — traces antigos descartados; adequado para DEV/testes, não para analytics de produção.
3. `totalRetries` ainda não é incrementado automaticamente pelo retry toolkit (API pronta; wiring futuro).
4. Audit record ganhou `causationId` — compatível; snapshots antigos sem o campo continuam válidos via fallback no attach.

---

## 13. Recomendações para Phase 7.4 — Agenda Domain Event Adoption (Wave A)

1. Seguir o padrão 7.1/7.2: publisher dedicado + wiring **após IDB**, fora do write adapter.
2. Eventos candidatos no registry: `APPOINTMENT_CREATED`, `APPOINTMENT_CONFIRMED` (já catalogados) — auditar se update/cancel/reschedule exigem novos tipos antes de inventar.
3. Correlation: preferir `de-corr-{uuid}` (padrão 7.2), **não** reutilizar `aggregateId` como correlation permanente.
4. Antes/durante soak: `attachDomainEventObservability` em ambiente de teste para validar prepared/published/skipped sem UI.
5. Não criar consumers Agenda→CRM nesta wave; apenas publicação canônica.
6. Manter flags default OFF + production locks.

---

## 14. Confirmações finais

- produção não alterada;
- banco não alterado;
- migrations não executadas;
- Supabase remoto não alterado;
- Storage remoto não alterado;
- IndexedDB preservado;
- frontend funcionalmente idêntico (flags OFF / sem attach);
- nenhum consumer funcional criado;
- commit não realizado.

---

**Phase 7.3 concluída. Aguardando aprovação formal para Phase 7.4.**
