# CQRS Controlled Staging Activation Playbook

**Normativo / operacional futuro.** Phase 8.6  
Architecture version: `3.8.5-cqrs-local`

**Controlled Staging Plan ≠ Remote Activation**

Este playbook descreve o procedimento para uma futura ativação controlada em staging.  
A Phase 8.6 **cria o plano**; **não executa** ativação remota.

---

## 1. Pré-requisitos

- Phase 8.5 Architecture Certification local (`certified` ou melhor)
- Production locks ativos; defaults de flags `false`
- Sem auto-bootstrap / auto-wiring
- Rollback plan presente
- Evidence requirements definidos
- Human approval obrigatório
- `autoPromotionAllowed: false`

---

## 2. Responsáveis

| Papel | Responsabilidade |
|-------|------------------|
| Architecture Owner | Aprovar plano e ordem de flags |
| Staging Operator | Executar stages em staging autorizado |
| Security / Platform | Autorizar environment + host |
| Human Approver | Aprovar explicitamente (nunca auto) |

---

## 3. Ambiente

1. Identificar staging explicitamente (`environmentType=staging`)
2. Rejeitar produção e projectRef de produção
3. **Não** inferir staging só por `NODE_ENV`
4. Autorização de environment: `authorized=true` + `authorizedBy` + validade
5. Sem credenciais no contrato

---

## 4. Autorização humana

Estados: `pending | approved | rejected | expired | revoked`

- Default Phase 8.6: **pending**
- Autoaprovação **proibida**
- Aprovação exige `approvedBy` + `approvedAt` reais
- Expiração invalida o uso

---

## 5. Tenants

- `pilotTenantIds` (mín. 1)
- `controlTenantIds` (opcional, isolado)
- `excludedTenantIds`
- Sem all-tenants
- Sem IDs inventados automaticamente
- Isolamento A/B obrigatório na fase de soak

---

## 6. Sequência de flags

### Etapa 1 — Observabilidade
`DOMAIN_EVENTS` → `DOMAIN_EVENT_AUDIT` → `DOMAIN_EVENT_OBSERVABILITY`

### Etapa 2 — Audit Projection Pilot
`DOMAIN_EVENT_CONSUMERS` → `DOMAIN_EVENT_CONSUMER_AUDIT` → `DOMAIN_EVENT_PROJECTION`

### Etapa 3 — Analytics
`DOMAIN_EVENT_ANALYTICS` (validar tenant scope)

### Etapa 4 — CQRS Foundation
`CQRS_READ_MODEL` → `CQRS_READ_MODEL_CONSISTENCY` → `CQRS_READ_MODEL_SOAK`

### Etapa 5 — Read Models (sequencial)
1. `LEAD_ANALYTICS_READ_MODEL`
2. `APPOINTMENT_ANALYTICS_READ_MODEL`
3. `FINANCIAL_ANALYTICS_READ_MODEL`

**Proibido** na primeira execução: ativar os três RMs no mesmo batch.

---

## 7. Métricas obrigatórias (resumo)

- Domain Events: published, rejected, traces, health
- Consumers: consumed, deadLetter, duplicates
- Analytics: tenantIsolationFailures, counters, health
- Read Models: soakStatus, drifts, isolationFailures, snapshots

---

## 8. Soak

- Duração recomendada: **48–72 horas**
- Janelas sequenciais (preflight → … → review)
- Sem cron / worker / scheduler / background job
- Multi-tenant: pilot-a, pilot-b, control (slots lógicos; IDs reais só na execução autorizada)

---

## 9. Failure criteria → rollback imediato

Inclui: tenant leakage, scope mismatch, counter drift, RM inconsistente, health degraded, DLQ inesperado, produção detectada, host não autorizado, aprovação ausente/expirada.

---

## 10. Rollback (ordem)

Individual RMs OFF → soak OFF → consistency OFF → CQRS OFF → analytics OFF → projection OFF → consumers OFF → observability OFF → audit OFF → DOMAIN_EVENTS OFF.

- Sem migration / rebuild
- Não apaga dados operacionais / IndexedDB / Supabase
- Preserva evidências coletadas

---

## 11. Evidências

Tipos: preflight, flag-resolution, event-observability, consumer, projection, read-model, soak, consistency, drift, tenant-isolation, rollback, manual-review.

---

## 12. Human review e encerramento

1. Coletar relatório `buildControlledStagingActivationPlanReport`
2. Revisar blockers/warnings
3. Aprovar explicitamente
4. Só então avançar para execução controlada (Phase 8.7+)

## 13. Proibições

- Ativação automática a partir da certificação
- Promoção de flags nesta phase
- Staging remoto sem autorização
- UI / HTTP / workers / notificações

API: `src/domain-events/staging-activation/`

---

## Continuação Phase 8.7

Ver [CQRS_STAGING_PREFLIGHT_EXECUTION_PLAYBOOK.md](./CQRS_STAGING_PREFLIGHT_EXECUTION_PLAYBOOK.md) para execução de preflight (sem ativação de flags).
