# Phase 8.2 — Read Model Soak + Consistency Validation

**Data:** 2026-07-13  
**Baseline anterior:** 1812 pass | 1 skip (Phase 8.1)  
**Regressão Phase 8.2:** **1841 pass | 1 skipped** (+29)

**Commit:** não realizado

---

## 1. Auditoria dos Read Models e projections

### Cadeia canônica

```text
Domain Event
  → Analytics Projection (crm-counter | appointment-counter | financial-counter)
  → Read Model Builder (lead | appointment | financial analytics)
  → Snapshot (tenant-aware: readModelId::tenantId)
  → Cache (in-memory, mesma chave)
  → Inspector / Soak / Health
```

### Origem e escopo das projections

| Projection | Store Phase 7.8 | Escopo declarado (8.2) | Isolamento real por tenant |
|------------|-----------------|------------------------|----------------------------|
| `crm-counter` | Map por `projectionId` only | **global** | **Não** (last-writer-wins) |
| `appointment-counter` | idem | **global** | **Não** |
| `financial-counter` | idem | **global** | **Não** |

### Read Models em escopo (nenhum novo)

| Read Model | Source projection | Snapshot / Cache / Lifecycle |
|------------|-------------------|------------------------------|
| `lead-analytics` | `crm-counter` | Tenant-aware (shared store) |
| `appointment-analytics` | `appointment-counter` | Tenant-aware |
| `financial-analytics` | `financial-counter` | Tenant-aware |

### Pontos de risco global → tenant

1. Projection store global alimenta builders tenant-aware.
2. Sem `allowGlobalTestScope`, soak/build de validação **bloqueia** conversão silenciosa.
3. Com `allowGlobalTestScope`, modo explícito `global-test-scope` + warning — **nunca** promoção.
4. Health/Inspector **nunca** reportam `healthy` silencioso para analytics com projection global.

Builders, snapshots, caches, lifecycle, metrics, health, Inspector, attach/refresh/rebuild/reset e APIs de compatibilidade do Lead foram auditados; store do Lead permanece facade sobre o builder compartilhado.

---

## 2. Infraestrutura de soak

Criada em `src/domain-events/read-models/shared/`:

| Arquivo | Papel |
|---------|--------|
| `readModelSoakTypes.ts` | Status, drift kinds, run/report types |
| `readModelSoakMetrics.ts` | Métricas in-memory por scope |
| `readModelConsistency.ts` | Compare expected vs stored |
| `readModelDriftDetector.ts` | Classificação + log |
| `readModelSoakRunner.ts` | Runner explícito |
| `readModelSoakReport.ts` | Relatório consolidado |
| `readModelProjectionScope.ts` | Escopo `tenant\|global\|unknown` |

Sem duplicar Metrics/Health/Inspector de domínio — soak estende e alimenta os existentes.

---

## 3. Métricas de soak

Por `readModelId + tenantId` (in-memory, sem persistência):

- `totalBuildAttempts`, `totalBuildSucceeded`, `totalBuildFailed`
- `totalRebuilds`, `totalSnapshotsCompared`, `totalConsistent`, `totalDrifts`
- `totalCacheHits`, `totalCacheMisses`, `totalInvalidations`
- `totalStaleSnapshots`, `totalTenantIsolationFailures`, `totalProjectionScopeWarnings`
- `lastBuildAt`, `lastComparisonAt`, `lastError`

---

## 4. Consistency Validation

`compareReadModelSnapshots` valida:

- `readModelId`, `tenantId`, `version`, source projection/versions
- indicadores (payload)
- ausência de campos inesperados relevantes
- envelope estrutural (`validateReadModelEnvelopeStructure`)

Timestamps / `lifecycleState` distintos com dados analíticos iguais → `metadata-only` (ainda **consistent**).

Arrays (`sourceProjectionIds`) comparados por conteúdo, não por referência.

---

## 5. Drift Detection

Kinds: `none` | `metadata-only` | `counter-drift` | `tenant-scope-drift` | `version-drift` | `missing-snapshot` | `stale-snapshot` | `invalid-snapshot`

Cada record: readModelId, tenantId, severity, fields, expected/actual sanitizados, detectedAt, sourceProjection, message ≤ 240 chars. Log in-memory (cap 200).

---

## 6. Projection Scope

Contrato explícito — **sem** inferência só por `tenantId`:

- `tenant` → snapshot tenant-aware permitido
- `global` → bloqueia conversão silenciosa; soak só com `allowGlobalTestScope`
- `unknown` → warning + bloqueio de promoção

Os três counters atuais estão declarados como **`global`**.

---

## 7. Tenant Isolation

Validado por testes:

- snapshot / history / cache / rebuild / invalidate isolados A vs B (Lead, Appointment, Financial)
- Inspector com `requireTenant` (default) não devolve dados de negócio sem `tenantId`
- projection global gera warning; não é tratada como tenant-specific silenciosamente
- soak **não** duplica snapshot global como “dado isolado” para promoção

---

## 8. Build e Rebuild

- Build/rebuild apenas explícitos (sem auto-build, timer, polling)
- Falha com flags OFF preserva último snapshot válido
- Rebuild de um Read Model / tenant não altera outro
- Soak iterações ≤ 20 (`READ_MODEL_SOAK_MAX_ITERATIONS`)

---

## 9. Cache Validation

- Chave `readModelId::tenantId`
- Hit / miss / TTL / invalidate / clear / stale
- Sem Redis; sem auto-cache em produção além da policy já existente (opt-in via build `useCache`)

---

## 10. Lead Analytics Compatibility

`validateLeadAnalyticsCompatibility`:

- Source of truth única (facade → shared store)
- Sem store duplicada de snapshots
- Inspector legado alinhável ao shared por tenant
- Métricas legadas adaptadas (locais) + foundation (shared) — sem divergência de indicadores
- Documentado: `leadsMoved` = proxy de conversão; `totalLost = 0`; day buckets UTC

---

## 11. Soak Runner

`runReadModelSoakValidation({ readModelId, tenantId, projectionSnapshots, iterations, allowGlobalTestScope, flagsInput })`

- Explícito; sem background/cron/bootstrap
- Flags OFF → `idle` no-op
- `promotionBlocked: true` sempre nesta phase

---

## 12. Soak Report

`buildReadModelSoakReport()` → overall / byReadModel / byTenant / builds / rebuilds / consistência / drifts / cache / projection scope warnings / `promotionRecommendation: 'block'`

Estados: `idle` | `ready` | `passing` | `warning` | `blocked` | `failed`

---

## 13. Health

Evoluído para considerar soak (drifts, isolation failures, stale, build failures, projection scope).

Read Models com projection primária **global/unknown** → status no máximo `warning` (nunca `healthy` silencioso).

Status `warning` adicionado a `ReadModelHealthStatus`.

---

## 14. Inspector

`inspectReadModelFoundation` agora inclui: soakMetrics, drifts, soakReport, projectionScopes, tenantIsolationWarnings.

`inspectReadModelById` exige tenant explícito para dados de negócio (`requireTenant` default true).

Sem HTTP. Sem UI.

---

## 15. Feature Flags

| Flag | Default | Production locked | Dependências |
|------|---------|-------------------|--------------|
| `CQRS_READ_MODEL_SOAK` | `false` | sim | `DOMAIN_EVENTS` + `DOMAIN_EVENT_ANALYTICS` + `CQRS_READ_MODEL` |
| `CQRS_READ_MODEL_CONSISTENCY` | `false` | sim | idem |

- Não habilitam Read Models automaticamente
- Conflitos alimentam Diagnostics
- OFF = no-op
- **Nenhuma flag promovida**

---

## 16. Arquivos criados

```text
src/domain-events/read-models/shared/readModelProjectionScope.ts
src/domain-events/read-models/shared/readModelSoakTypes.ts
src/domain-events/read-models/shared/readModelSoakMetrics.ts
src/domain-events/read-models/shared/readModelDriftDetector.ts
src/domain-events/read-models/shared/readModelConsistency.ts
src/domain-events/read-models/shared/readModelSoakRunner.ts
src/domain-events/read-models/shared/readModelSoakReport.ts
src/domain-events/read-models/leadAnalyticsCompatibility.ts
src/__tests__/readModelSoakValidation.test.js
docs/reports/PHASE_8_2_READ_MODEL_SOAK_CONSISTENCY_VALIDATION.md
```

---

## 17. Arquivos modificados

```text
src/domain-events/domainEventFlags.ts
src/domain-events/observability/domainEventDiagnostics.ts
src/domain-events/read-models/shared/readModelTypes.ts
src/domain-events/read-models/shared/readModelHealth.ts
src/domain-events/read-models/shared/readModelInspector.ts
src/domain-events/read-models/shared/index.ts
src/domain-events/read-models/leadAnalyticsInspector.ts
src/domain-events/read-models/index.ts
src/__tests__/rhTestFlagContract.js
src/__tests__/domainEventsFoundation.test.js
src/__tests__/repositoryV3ArchitectureContract.test.js
src/__tests__/multiReadModelAdoption.test.js
docs/reports/README.md
```

---

## 18. Testes adicionados

`src/__tests__/readModelSoakValidation.test.js` — 29 testes:

- Flags / production locks / limites
- Projection scope
- Soak runner + report
- Consistency + drift kinds
- Tenant isolation (3 RMs + cache + rebuild + Inspector)
- Lifecycle + cache
- Lead compatibility + Health + Inspector
- Safety (sem persistência / side-effects / auto-bootstrap)

---

## 19. Resultado da regressão

```text
Test Files  166 passed (166)
Tests       1841 passed | 1 skipped (1842)
```

Nenhuma regressão.

---

## 20. Drifts encontrados

Nenhum drift operacional de produção (flags OFF).

Em soak controlado de teste:

- Projection scope **global** gera warning estrutural em todos os 3 Read Models
- Comparações idênticas → `none` / `metadata-only`
- Drift kinds (`counter`, `version`, `missing`, `stale`, `invalid`) exercitados sinteticamente

---

## 21. Bloqueios para promoção

1. Analytics Projection store permanece **global** (Phase 7.8).
2. Soak report recomenda sempre **`block`**.
3. Multi-tenant consistency **não afirmada** enquanto scope ≠ `tenant`.
4. Flags SOAK/CONSISTENCY e Read Models permanecem default `false` + production locked.

---

## 22. Riscos residuais

- Dados de projection global podem ser semanticamente “de outro tenant” se eventos misturados forem applied no store global.
- Métricas legadas do Lead (contadores locais) coexistem com métricas shared — documentadas, sem store duplicada de snapshot.
- Health `warning` para analytics é esperado até Phase 8.3.

---

## 23. Recomendações para Phase 8.3 — Tenant-Scoped Analytics Projection Foundation

1. Evoluir Analytics Projection store para chave `projectionId::tenantId`.
2. Declarar scope `tenant` após cutover seguro.
3. Migrar apply/get projection com isolation real.
4. Remover necessidade de `allowGlobalTestScope` para soak de promoção.
5. Só então reavaliar `promotionRecommendation` (ainda sem auto-promote).
6. Manter Event Audit Projection e domínios operacionais intactos nesta wave.

---

## 24. Confirmações finais

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

**Phase 8.2 concluída. Aguardando aprovação formal antes de qualquer Phase 8.3.**
