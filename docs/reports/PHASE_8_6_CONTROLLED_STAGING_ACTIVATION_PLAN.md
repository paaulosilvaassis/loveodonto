# Phase 8.6 — Controlled Staging Activation Plan

**Data:** 2026-07-13  
**Baseline anterior:** 1885 pass | 1 skip (Phase 8.5)  
**Regressão Phase 8.6:** **1919 pass | 1 skipped** (+34)

**Commit:** não realizado

---

## 1. Auditoria da ativação controlada

Auditoria estrutural (sem execução remota):

| Área | Estado |
|------|--------|
| Flags Domain Events / CQRS | Todas default `false`; production locks ativos |
| Dependências | Validadas em `validateDomainEventFlags` + matriz 8.6 |
| Host / production locks | `applyProductionSafeLocksGeneric` + projectRef produção rejeitado |
| Certification 8.5 | Consumida no preflight (`architecture_certified`) |
| Promotion / Soak / Consistency | Referenciados como critérios; não reexecutados remotamente |
| Auto-bootstrap / auto-wiring | Ausentes nesta camada |
| Attach opt-in | Intocado |
| Rollback | Contrato ordenado + drill `planned_not_executed` |

**Princípio:** Certification → Automatic Activation **proibido**. Fluxo: Preflight → Authorization → Tenants → Flags → Validation → Soak → Evidence → Rollback → Human Review → Explicit Approval.

---

## 2. Staging Environment Contract

`buildStagingEnvironmentContract` / `StagingEnvironmentContract`:

- Campos: environmentId, name, type, host, projectRef, isProduction, isStaging, authorized*, allowedTenantIds, expiresAt, notes, status
- Produção / projectRef produção → `blocked`
- `NODE_ENV` insuficiente
- Sem credenciais
- Default Phase 8.6: `blocked`

---

## 3. Human Authorization Contract

`buildStagingHumanAuthorization`:

- Estados: pending | approved | rejected | expired | revoked
- **Default Phase 8.6: pending**
- `autoApprove` nunca concede approved
- Approved exige `approvedBy` + `approvedAt` reais

---

## 4. Tenant Selection

`buildStagingTenantSelection`:

- `pilotTenantIds` / `controlTenantIds` / `excludedTenantIds`
- Mín. 1 piloto para execução futura; vazio = `valid:false`
- Sem all-tenants; sem IDs inventados; marcadores `prod` rejeitados

---

## 5. Activation Plan Model

`buildControlledStagingActivationPlan` → `ControlledStagingActivationPlan`

- `humanApprovalRequired: true`, `autoPromotionAllowed: false`
- Default status: **`pending_authorization`**
- Cap: não avança para `running`/`completed` via builder
- Testes estruturais: `ready` apenas com `local-simulated` + auth explícita + `allowReadyForStructuralTest`

---

## 6. Matriz de flags

`STAGING_FLAG_MATRIX` — Flag → dependências → ambientes permitidos → pré-condições → efeito → métricas → rollback → stage.

Cobre: DOMAIN_EVENTS, AUDIT, OBSERVABILITY, CONSUMERS, CONSUMER_AUDIT, PROJECTION, ANALYTICS, CQRS_*, LEAD/APPOINTMENT/FINANCIAL_ANALYTICS_READ_MODEL.

---

## 7. Ordem de ativação

Stages: preflight → observability → audit_projection → analytics_projection → cqrs_foundation → lead → appointment → financial → rollback_drill → final_review.

RMs recomendaos: Lead → Appointment → Financial. Simultâneos proibidos na 1ª execução.

---

## 8. Preflight Checks

`runStagingPreflightChecks`: architecture certified, version, staging identified, production rejected, human approval, tenants, flags false, production/host guards, registry, tenant-scoped projections, promotion blockers, regression baseline (manual-required), inspector/metrics/health, rollback, evidence, no auto-bootstrap/wiring.

Resultados: pass | warning | fail | manual-required.

---

## 9. Success Criteria

`STAGING_SUCCESS_CRITERIA` — Domain Events, Consumers, Analytics, Read Models (conforme spec Phase 8.6).

---

## 10. Failure Criteria

`STAGING_FAILURE_CRITERIA` — todos com `requiresRollback: true` (leakage, drift, DLQ, produção, auth ausente, etc.).

---

## 11. Soak Plan

`buildStagingSoakPlan`: 48–72h; janelas sequenciais; `schedulerAllowed: false`; `backgroundWorkerAllowed: false`.

---

## 12. Multi-Tenant Soak

Slots lógicos: pilot-a, pilot-b, control; `requireIsolation: true`; `inventRealTenantIds: false`.

---

## 13. Evidence Collection

`STAGING_EVIDENCE_REQUIREMENTS` + `createStagingEvidenceRecord` (pending estrutural). Sem persistência / coleta remota.

---

## 14. Rollback Plan

`STAGING_ROLLBACK_FLAG_ORDER` (RMs → soak → consistency → CQRS → analytics → projection → consumers → obs → audit → DOMAIN_EVENTS).

Drill: `planned_not_executed`, `remoteExecutionAllowed: false`. Sem migration/rebuild; preserva IndexedDB/Supabase/evidências.

---

## 15. Activation Guards

`evaluateStagingActivationGuards` — bloqueia produção, env não autorizado, auth pending/expired/revoked, tenants inválidos, ordem inválida, RMs simultâneos, plano sem rollback/evidence, autoPromotion.

---

## 16. Staging Plan Report

`buildControlledStagingActivationPlanReport()`

Recommendation Phase 8.6: **`staging_plan_ready_awaiting_explicit_authorization`**  
(produção → `blocked_production_or_unauthorized_host`)

Nunca: activate / promote / enable.

---

## 17. Inspector

`inspectControlledStagingActivationPlan` + histórico in-memory. Snapshot leve em `inspectDomainEvents().controlledStagingActivation`. Sem HTTP/UI.

---

## 18. Playbook

[`docs/playbooks/CQRS_CONTROLLED_STAGING_ACTIVATION_PLAYBOOK.md`](../playbooks/CQRS_CONTROLLED_STAGING_ACTIVATION_PLAYBOOK.md)

---

## 19. Arquivos criados

```text
src/domain-events/staging-activation/*.ts (16 módulos)
src/__tests__/controlledStagingActivationPlan.test.js
docs/playbooks/CQRS_CONTROLLED_STAGING_ACTIVATION_PLAYBOOK.md
docs/reports/PHASE_8_6_CONTROLLED_STAGING_ACTIVATION_PLAN.md
```

---

## 20. Arquivos modificados

```text
src/domain-events/index.ts
src/domain-events/observability/domainEventInspector.ts
src/__tests__/repositoryV3ArchitectureContract.test.js
docs/playbooks/README.md
docs/reports/README.md
```

---

## 21. Testes adicionados

33 testes: environment, authorization, tenants, flag order, preflight/criteria/soak/rollback, plan/report/inspector/guards, safety.

---

## 22. Resultado da regressão

```text
Test Files  170 passed (170)
Tests       1919 passed | 1 skipped (1920)
```

Zero regressão.

---

## 23. Blockers (para ativação real)

- Environment `blocked` / não autorizado
- Human authorization `pending`
- Tenants piloto não selecionados (estrutural vazio)
- Staging remoto não executado
- Guards `ok: false` no plano default

---

## 24. Warnings

Preflight `manual-required` (human approval, staging identified, tenants, regression baseline); authorization pending; environment blocked.

---

## 25. Status final do plano

**`pending_authorization`**

Recommendation: `staging_plan_ready_awaiting_explicit_authorization`  
`autoPromotionAllowed: false` · remote activation **não** ocorrida.

---

## 26. Bloqueios restantes para ativação real

1. Autorizar environment staging real (não produção)
2. Human approval `approved` com aprovador real
3. Selecionar tenants piloto/controle
4. Phase 8.7 — Preflight Execution controlado
5. Evidências reais + rollback drill autorizado
6. Flags continuam OFF até execução explícita futura

---

## 27. Riscos residuais

- Matriz não inclui `DOMAIN_EVENT_CONSUMER_RETRY` como stage obrigatório (flag existe; ativação opcional futura)
- Preflight de certificação sem soak local pode ficar `conditional`/`warning` — esperado fora do path certified
- Sem validação remota de host além de projectRef conhecido

---

## 28. Recomendações — Phase 8.7 Controlled Staging Preflight Execution

1. Executar preflight **local + staging autorizado** sem flip de flags de produto
2. Registrar evidências `preflight` / `flag-resolution` (ainda OFF)
3. Validar host/projectRef e tenants reais com aprovação humana
4. Confirmar regression baseline no mesmo run
5. Não avançar stages de flag sem autorização etapa-a-etapa
6. Manter rollback drill apenas planejado até OK explícito

---

## 29. Confirmações finais

| Confirmação | Status |
|-------------|--------|
| produção não alterada | ✅ |
| banco não alterado | ✅ |
| migrations não executadas | ✅ |
| Supabase remoto não alterado | ✅ |
| Storage remoto não alterado | ✅ |
| IndexedDB preservado | ✅ |
| frontend funcionalmente idêntico | ✅ |
| nenhuma persistência criada | ✅ |
| nenhum side-effect de negócio | ✅ |
| nenhum auto-bootstrap | ✅ |
| nenhuma flag promovida | ✅ |
| staging remoto não executado | ✅ |
| human approval permaneceu pending | ✅ |
| commit não realizado | ✅ |

---

**Phase 8.6 concluída. Aguardando aprovação formal.**
