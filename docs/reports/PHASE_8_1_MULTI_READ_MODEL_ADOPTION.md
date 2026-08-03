# Phase 8.1 — Multi Read Model Adoption

**Data:** 2026-07-13  
**Baseline anterior:** 1803 pass | 1 skip (Phase 8.0)  
**Regressão Phase 8.1:** **1812 pass | 1 skipped** (+9)

**Commit:** não realizado

---

## 1. Auditoria da adoção dos Read Models

| Read Model | Status |
|------------|--------|
| Lead Analytics | Migrado para contrato CQRS compartilhado |
| Appointment Analytics | Criado (estrutural) |
| Financial Analytics | Criado (estrutural) |
| Registry | Opt-in via attach; vazio no boot |
| Domínios / Repositories / Consumers | **Intocados** |
| Persistência / HTTP / UI | **Nenhuma** |

---

## 2. Migração do Lead Analytics

- Definição `createLeadAnalyticsReadModelDefinition()` no contrato 8.0
- Store virou facade sobre snapshots compartilhados (sem store duplicada)
- `refreshLeadAnalyticsReadModel` faz attach + `buildReadModelSnapshotExplicit`
- Indicadores preservados (`totalConverted≈leadsMoved`, `totalLost=0`, day buckets UTC)
- API de compatibilidade mantida (`getLeadAnalytics*`, Inspector, metrics locais)

---

## 3. Appointment Analytics Read Model

`appointment-analytics` ← projection `appointment-counter`  
Indicadores: created/cancelled/rescheduled/confirmed/statusChanges/updated.

---

## 4. Financial Analytics Read Model

`financial-analytics` ← projection `financial-counter`  
Contadores estruturais apenas — **sem** totais monetários inventados.

---

## 5. Contratos compartilhados

Os três modelos implementam `ReadModelDefinition` (sources, builder, lifecycle `autoRebuild:false`, cache/snapshot policies, flagKey).

---

## 6. Registry e attach opt-in

`attachLeadAnalyticsReadModel` / `attachAppointmentAnalyticsReadModel` / `attachFinancialAnalyticsReadModel` / `attachAnalyticsReadModels`  
Idempotente; sem rebuild automático; sem boot.

---

## 7. Tenant isolation

- Scope key `readModelId::tenantId` (lifecycle, snapshots, cache)
- `requireReadModelTenantId` — ausência rejeitada (exceto fallback explícito de teste)
- Snapshots de tenants distintos não se misturam

---

## 8. Builders

Builders puros; entrada projection snapshot + tenantId + clock; saída envelope imutável.

---

## 9. Lifecycle

Estados compartilhados isolados por `readModelId + tenantId`. Falha de um modelo não altera o lifecycle dos demais.

---

## 10. Snapshots

Envelope compartilhado: version, tenantId, builtAt, sourceVersions, payload estrutural.

---

## 11. Cache

In-memory, tenant-aware (`readModelId::tenantId`), TTL configurável, invalidate/clear. Sem Redis/DB.

---

## 12. Metrics

Globais + `byReadModel` (builds, rebuilds, snapshots, cache hits/misses, invalidations, skips, failures, stale).

---

## 13. Health

`getReadModelHealthById` individual + consolidado. Degradação de Financial **não** força Lead como degraded.

---

## 14. Inspector unificado

`inspectReadModelFoundation` inclui registry, lifecycle, snapshots, cache, metrics, health, `byReadModel`.  
`inspectDomainEvents().cqrsReadModelFoundation` mantido. Lead Inspector de compatibilidade preservado.

---

## 15. Feature Flags

| Flag | Default | Depende de |
|------|---------|------------|
| `CQRS_READ_MODEL` | false | EVENTS + ANALYTICS |
| `LEAD_ANALYTICS_READ_MODEL` | false | + CQRS |
| `APPOINTMENT_ANALYTICS_READ_MODEL` | false | + CQRS |
| `FINANCIAL_ANALYTICS_READ_MODEL` | false | + CQRS |

Production locked. Diagnostics para conflitos.

---

## 16. Arquivos criados

```
src/domain-events/read-models/leadAnalyticsDefinition.ts
src/domain-events/read-models/appointmentAnalytics.ts
src/domain-events/read-models/financialAnalytics.ts
src/domain-events/read-models/attachAnalyticsReadModels.ts
src/domain-events/read-models/analyticsReadModelRefresh.ts
src/domain-events/read-models/shared/readModelTenant.ts
src/__tests__/multiReadModelAdoption.test.js
docs/reports/PHASE_8_1_MULTI_READ_MODEL_ADOPTION.md
```

---

## 17. Arquivos modificados

Shared (lifecycle/builder/metrics/health/inspector/cache/index), Lead (readModel/store/index), flags, diagnostics, contratos de teste, architecture inventory, README reports.  
**Não:** CRM/Agenda/Financeiro services, Projection Foundation sources, consumers, publishers.

---

## 18. Testes adicionados

`multiReadModelAdoption.test.js` (9): lead contrato/compat, tenant isolation, appointment/financial counters, attach idempotente, lifecycle isolado, metrics/inspector, flags OFF, ausência de HTTP/UI/Repository.

---

## 19. Resultado da regressão

```
Test Files  165 passed (165)
Tests       1812 passed | 1 skipped (1813)
```

Delta vs 8.0: **+9**. Zero regressão.

---

## 20. Riscos residuais

1. Analytics Projection store ainda é global (não multi-tenant); isolamento do Read Model depende dos counters passados no build.
2. Lead ainda mantém metrics/health facades legadas além das shared.
3. Attach não é chamado no boot — refresh faz attach implícito quando flags ON (opt-in por uso).
4. Proxies de conversão/lost do Lead permanecem documentados, não resolvidos semanticamente.

---

## 21. Recomendações para Phase 8.2 — Read Model Soak + Consistency Validation

1. Soak de builds multi-tenant com projections alimentadas de forma consistente.
2. Comparar snapshots Lead/Appointment/Financial vs counters de projection (drift detection).
3. Validar cache TTL / invalidate sob carga de testes.
4. Unificar metrics Lead legado → shared only.
5. Não ativar flags em produção; manter Production Guards.

---

## 22. Confirmações finais

- produção não alterada;
- banco não alterado;
- migrations não executadas;
- Supabase remoto não alterado;
- Storage remoto não alterado;
- IndexedDB preservado;
- frontend funcionalmente idêntico;
- nenhuma persistência criada;
- nenhum side-effect de negócio;
- nenhum auto-bootstrap;
- commit não realizado.

---

**Phase 8.1 concluída. Aguardando aprovação formal para Phase 8.2.**
