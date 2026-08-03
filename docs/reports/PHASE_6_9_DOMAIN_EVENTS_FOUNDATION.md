# Phase 6.9 — Domain Events Foundation

**Data:** 2026-07-09  
**Baseline anterior:** 1557 pass | 1 skip (Phase 6.8)  
**Regressão Phase 6.9:** **1583 pass | 1 skipped** (+26)

**Commit:** não realizado

---

## 1. Auditoria da infraestrutura

Camada nova em `src/domain-events/`, isolada dos domínios de negócio.

| Componente | Papel | Consumido por domínio? |
|------------|-------|------------------------|
| Types / DTO | Modelo canônico `DomainEvent` | Não |
| Registry | Catálogo de 16 eventos oficiais | Não |
| Contracts | Validação de shape | Não |
| Mapper | Factory `buildDomainEvent` | Não |
| Flags | `DOMAIN_EVENTS` / `DOMAIN_EVENT_AUDIT` | Não |
| Audit | Log in-memory | Não |
| Bus | Pub/sub local | Não (só testes) |
| Dispatcher | Gate por flags → bus | Não (só testes) |

**Zero** import de `domain-events` em CRM, Agenda, Financeiro, Collaborators ou Clinic Profile.

---

## 2. Domain Event Model

DTO único (`domainEventTypes.ts`):

```text
eventId | eventType | aggregateType | aggregateId
tenantId | userId | timestamp | payload | metadata
version | source | correlationId | causationId
```

`DOMAIN_EVENT_MODEL_VERSION = 1`.

---

## 3. Registry

`domainEventRegistry.ts` — 16 eventos:

| Evento | Aggregate | Origem prevista |
|--------|-----------|-----------------|
| LEAD_CREATED / UPDATED / MOVED | lead | crm |
| FOLLOW_UP_CREATED | follow_up | crm |
| TASK_CREATED / COMPLETED | task | crm |
| APPOINTMENT_CREATED / CONFIRMED | appointment | agenda |
| PATIENT_CREATED | patient | crm |
| BUDGET_CREATED | budget | crm |
| CONTRACT_SIGNED | contract | crm |
| RECEIVABLE_CREATED | receivable | financial |
| PAYMENT_RECEIVED / FAILED | payment | financial |
| USER_CREATED | user | collaborators |
| TENANT_CREATED | tenant | platform |

Cada entrada: `name`, `aggregate`, `version`, `description`, `expectedOrigin`, `expectedDestinations`.

---

## 4. Event Bus

`domainEventBus.ts` — infraestrutura **local** in-memory:

- `subscribeDomainEvent` / `subscribeAllDomainEvents`
- `publishDomainEvent`
- Buffer limitado (100) para inspeção em testes
- **Sem** fila, mensageria, websocket ou consumidores de domínio

---

## 5. Dispatcher

`domainEventDispatcher.ts`:

- `DOMAIN_EVENTS=false` → `{ skipped: true }` (no-op)
- `DOMAIN_EVENTS=true` → build/validate → publish no bus
- Audit opcional (`DOMAIN_EVENT_AUDIT`) registra `prepared` / `published` / `rejected`

Nenhum service chama o dispatcher nesta phase.

---

## 6. Auditoria

`domainEventAudit.ts` — in-memory, sem persistência:

- status: `prepared` | `published` | `skipped` | `rejected`
- snapshot canônico opcional
- ring buffer (200)

---

## 7. Feature Flags

```text
DOMAIN_EVENTS=false
DOMAIN_EVENT_AUDIT=false
```

Env: `VITE_DOMAIN_EVENTS`, `VITE_DOMAIN_EVENT_AUDIT`.

- `DOMAIN_EVENT_AUDIT=true` exige `DOMAIN_EVENTS=true`
- PROD runtime trava ambas
- Host Supabase production bloqueia ambas
- Contrato Vitest: `DOMAIN_EVENT_TEST_FLAG_CONTRACT`

---

## 8. Arquivos criados

| Arquivo | Papel |
|---------|-------|
| `src/domain-events/domainEventTypes.ts` | DTO / tipos |
| `src/domain-events/domainEventRegistry.ts` | Catálogo |
| `src/domain-events/domainEventContracts.ts` | Validação |
| `src/domain-events/domainEventMapper.ts` | Factory |
| `src/domain-events/domainEventFlags.ts` | Flags + guards |
| `src/domain-events/domainEventAudit.ts` | Audit in-memory |
| `src/domain-events/domainEventBus.ts` | Bus local |
| `src/domain-events/domainEventDispatcher.ts` | Dispatcher |
| `src/domain-events/index.ts` | Barrel |
| `src/__tests__/domainEventsFoundation.test.js` | Testes foundation |
| `docs/reports/PHASE_6_9_DOMAIN_EVENTS_FOUNDATION.md` | Este relatório |

---

## 9. Arquivos modificados

| Arquivo | Mudança |
|---------|---------|
| `src/__tests__/rhTestFlagContract.js` | `DOMAIN_EVENT_TEST_FLAG_CONTRACT` + `DOMAIN_EVENTS_FLAGS_RESOLVED` + isolation |
| `src/__tests__/repositoryV3ArchitectureContract.test.js` | Inventário `domain-events` + flags Domain Events |
| `docs/reports/README.md` | Índice Phase 6.9 |

---

## 10. Testes adicionados

`domainEventsFoundation.test.js`:

- Estrutura de arquivos
- Event DTO / clone / audit snapshot
- Registry (16 eventos, lookup, clone)
- Contracts (validação + registered type)
- Flags + Production Guards
- Event Bus (subscribe / publish / unsubscribe)
- Dispatcher (OFF skip, ON publish, audit)

---

## 11. Resultado da regressão

```text
Test Files  153 passed (153)
Tests       1583 passed | 1 skipped (1584)
```

Nenhuma regressão. Baseline 6.8: 1557 → 6.9: 1583 (+26).

---

## 12. Riscos residuais

1. **Sem adoção** — dispatcher existe mas nenhum domínio publica; risco de drift se registry não for atualizado na 7.0.
2. **Bus in-process** — não sobrevive a reload; adequado só para foundation.
3. **Tipos futuros** — foundation permissiva (`requireRegisteredType` default false); adoção deve endurecer.
4. **Audit sem persistência** — intencional; persistência fica para phases futuras.

---

## 13. Recomendações para Phase 7.0 — Domain Events Adoption (CRM + Financeiro)

1. Emitir eventos Wave A CRM (`LEAD_*`) e Financeiro (`RECEIVABLE_*`, `PAYMENT_*`) via dispatcher, atrás de `DOMAIN_EVENTS`.
2. Manter flags default OFF; ativar só em staging.
3. Não criar consumidores (WhatsApp / IA / Analytics / Journey) ainda — só publicação.
4. Correlacionar com Write Toolkit (`correlationId` / `causationId` a partir do write audit).
5. Soak metrics de publish (accepted / skipped / rejected) se necessário.

---

## 14. Confirmações finais

| Item | Status |
|------|--------|
| Produção não alterada | ✅ flags default OFF + production locks |
| Banco não alterado | ✅ |
| Migrations não executadas | ✅ |
| Supabase remoto não alterado | ✅ |
| Storage remoto não alterado | ✅ |
| IndexedDB preservado | ✅ |
| Frontend funcionalmente idêntico | ✅ zero wiring de domínio |
| Commit não realizado | ✅ |

---

**Phase 6.9 concluída. Aguardando aprovação formal para Phase 7.0.**
