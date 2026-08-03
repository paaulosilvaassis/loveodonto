# LOVE ODONTO V3 — CQRS Architecture Certification

**Normativo.** Versão da arquitetura: `3.8.5-cqrs-local`  
**Versão do contrato de certificação:** `1.0.0`  
**Phase:** 8.5

---

## 1. Escopo

Este manifesto define a **certificação arquitetural** da camada CQRS do Love Odonto V3.

Certifica:

- Domain Events (model, registry, toolkit, facade, correlation, causation, deduplication, audit, observability)
- Consumers (registry, context, runner, dispatcher, idempotência, retry, dead letter, audit, health)
- Analytics Projections (registry, reducers, store, tenant scope, metrics, health, inspector)
- CQRS Read Models avaliados: `lead-analytics`, `appointment-analytics`, `financial-analytics`

Não certifica promoção operacional, nem ativação de flags, nem readiness de staging remoto.

---

## 2. Princípios

1. **Architecture Certified ≠ Production Promoted**
2. Certificação é **imutável** após emissão do contrato (resultado congelado in-memory)
3. `humanApprovalRequired: true` sempre
4. `autoPromotionAllowed: false` sempre
5. Certificação **não** altera runtime, flags, repositories, serviços ou UI
6. Invocação **explícita** (testes / DEV) — sem auto-bootstrap
7. Sem HTTP, sem UI, sem persistência, sem workers

---

## 3. Architecture Version

Constante: `LOVE_ODONTO_V3_CQRS_ARCHITECTURE_VERSION = '3.8.5-cqrs-local'`

Componentes incluídos (resumo):

- Domain Events Foundation + Toolkit + Facade + Observability
- Consumer Foundation + Event Audit Projection
- Analytics Projection Foundation + Tenant-Scoped Projections
- CQRS Read Model Foundation + Multi Adoption
- Soak + Consistency + Promotion Readiness
- Production Guards

Mudança nesta versão exige **recertificação**.

---

## 4. Certification Status

Estados oficiais:

| Status | Significado |
|--------|-------------|
| `not_evaluated` | Ainda não avaliado |
| `failed` | Gate crítico falhou (não bloqueante estrutural) |
| `blocked` | Blocker presente |
| `conditional` | Gates locais OK com warnings não bloqueantes |
| `certified` | Todos os gates arquiteturais locais verdes |

**Proibido** como status de certificação: `promoted`, `enabled`, `production`, `live`.

---

## 5. Certification Gates

| Gate | Valida |
|------|--------|
| 1 Domain Event Integrity | registry, schemas, facade, correlation/dedup |
| 2 Tenant Isolation | projection/read-model scope tenant; zero isolation failures |
| 3 Read Model Consistency | builder/snapshot; zero hard drift |
| 4 Soak Validation | soak explícito passing; zero isolation/scope blockers |
| 5 Promotion Readiness | 14 checks Phase 8.4; `autoPromote=false` |
| 6 Production Safety | defaults OFF, locks, ausência de persistência/HTTP indevidos |
| 7 Regression | contratos de arquitetura/testes presentes |

---

## 6. Evidence Model

Cada evidência: `evidenceId`, `gateId`, `source`, `type`, `description`, `result`, `timestamp`, `detailsSanitized`.

Tipos: `test` | `contract` | `inspection` | `soak` | `consistency` | `health` | `metrics` | `static-analysis` | `manual-required`.

Sem PII, tokens ou credenciais. Sem persistência.

### Staging Evidence

Contrato preparado (`environment`, `tenantId`, iterações, drifts, etc.).  
Quando staging não estiver configurado/autorizado: estado `manual-required`.  
**Não simular.** Não bloqueia certificação arquitetural local, mas **impede** promoção operacional.

---

## 7. Human Approval Gate

Estados: `pending` | `approved` | `rejected`.  
Infraestrutura **nunca** auto-aprova. Após Phase 8.5 permanece `pending`.

---

## 8. Processo de certificação

1. Invocar explicitamente `buildCqrsArchitectureCertificationReport()`
2. Opcional: soak dos três Read Models + attach de registry
3. Avaliar gates e evidências
4. Status local pode ser `certified`
5. Staging permanece `manual-required` até evidência real
6. Human approval permanece `pending` até decisão humana
7. Recommendation esperada quando local certified:  
   `architecture_certified_awaiting_staging_and_human_approval`

---

## 9. Recertificação

Recertificar (manual) quando ocorrer:

- mudança no Event Model, Registry, Tenant Scope
- mudança em reducers, builders, snapshots, cache
- mudança em Production Guards
- criação de novo Read Model
- alteração de `LOVE_ODONTO_V3_CQRS_ARCHITECTURE_VERSION`

**Não** executar recertificação automática.

---

## 10. Políticas

### Flags

Não criar flag de runtime para certificação. Não promover flags existentes. Defaults permanecem `false`; production locks preservados.

### Multi-tenant

Projections e Read Models certificados são **tenant-scoped**. Store key `projectionId::tenantId`. Zero leakage entre tenants.

### Regressão

Suite completa deve permanecer verde. Skips documentados. Contratos arquiteturais (`repositoryV3ArchitectureContract`) incluem pasta `domain-events/certification`.

### Persistência

Analytics Projections e Read Models de certificação são in-memory. Sem IndexedDB, Redis, HTTP Admin API ou Supabase como side-effect da certificação.

---

## 11. Diferença: certificação vs promoção

| | Certificação (8.5) | Promoção operacional (futuro) |
|--|--------------------|-------------------------------|
| Objetivo | Conformidade arquitetural | Ativar comportamento em ambiente |
| Flags | Intactas | Requer plano controlado + aprovação |
| Staging | Contrato only | Evidência real obrigatória |
| Humano | `pending` | `approved` obrigatório |
| Runtime | Sem mudança | Mudança controlada |

API: `src/domain-events/certification/`  
Inspector: `inspectCqrsArchitectureCertification()`  
Health: `getCqrsArchitectureCertificationHealth()`
