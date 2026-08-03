# Phase 7.6 — Domain Event Consumer Foundation

**Data:** 2026-07-13  
**Baseline anterior:** 1713 pass | 1 skip (Phase 7.5)  
**Regressão Phase 7.6:** **1743 pass | 1 skipped** (+30)

**Commit:** não realizado

---

## 1. Auditoria da infraestrutura atual

| Camada | Estado pré-7.6 | Ação 7.6 |
|--------|----------------|----------|
| Domain Event Registry | 33 tipos | Intocado |
| Toolkit Publisher / Facade | Publicação canônica | **Não** dispara consumers |
| Event Bus / SubscriberBase | Infra de subscribe | **Não** auto-wire consumers |
| Observability | Metrics/Trace/Timeline | Mantida; consumers têm métricas próprias |
| Domínios CRM/Agenda/Financial | Publishers via Facade | **Não** alterados |

Risco 7.5 (fechamento clínico sem correlation compartilhada): **somente auditado**; helper estrutural preparado, sem mudança em workflow clínico.

---

## 2. Consumer Model

`DomainEventConsumerDefinition`: consumerId, consumerName, eventTypes, version, enabled, priority, executionMode, idempotencyScope, maxAttempts, timeoutMs, source, description, handle estrutural.

Handler recebe: event, consumerContext, attempt, correlationId, causationId, tenantId, abortSignal.

Nenhum consumer real registrado.

---

## 3. Consumer Registry

`registerDomainEventConsumer` / list / get — **vazio por padrão**.  
Rejeita consumerId duplicado e eventTypes fora do Domain Event Registry.  
Sem execução no boot.

---

## 4. Consumer Context

`buildDomainEventConsumerContext` preserva correlation/causation do evento (não regenera correlation).

---

## 5. Runner

`runDomainEventConsumer` — valida contrato, monta contexto, timeout, captura erro, audit/metrics, resultado estruturado.

Status: skipped | prepared | running | succeeded | failed | retry_scheduled | dead_lettered | rejected.

---

## 6. Dispatcher

`dispatchDomainEventToConsumers` — despacho **explícito** (testes).  
`DOMAIN_EVENT_CONSUMER_AUTO_WIRING = false`.  
Não importa Event Bus. Isolamento por consumer.

---

## 7. Idempotência

In-memory: `eventId::consumerId::v{version}`. Duplicatas → skipped + metrics.

---

## 8. Retry

`evaluateDomainEventConsumerRetry` — contrato (backoff, retryable/non-retryable).  
Com `DOMAIN_EVENT_CONSUMER_RETRY=false`: sem reexecução; failed/dead_lettered.  
Sem timers/background.

---

## 9. Dead Letter

In-memory (cap 200): event snapshot mínimo, consumerId, attempts, lastError, correlation/causation, reason. Sem HTTP/fila/reprocessamento.

---

## 10. Audit

In-memory (cap 300): consumerId, eventId, status, attempt, timings, error sanitizado, correlation/causation, tenantId. Exige `DOMAIN_EVENT_CONSUMER_AUDIT`.

---

## 11. Observability

Métricas consumer: dispatches, skipped, succeeded, failed, retries, duplicates, deadLettered, activeConsumers.  
Health: registry, dispatcher, runner, retry, dead_letter, audit — flags OFF → `overall: idle`.

---

## 12. Timeout e isolamento

Timeout por consumer via AbortSignal. Falha de um não impede outro. Publisher/Facade intocados.

---

## 13. Helper para operações compostas

`createDomainEventOperationContext()` + `deriveDomainEventConsumerContext()`.

Uso futuro (ex. close clínico): uma correlation para task + follow-up; causation = eventId do lead/pai.  
**Não** altera `patientFlowService` / CRM nesta phase.

---

## 14. Garantia de ausência de auto-wiring

Constante `DOMAIN_EVENT_CONSUMER_AUTO_WIRING = false`. Testes assertam ausência de `subscribe*` no dispatcher e ausência de dispatch na Facade/Publisher.

---

## 15. Garantia de ausência de consumers funcionais

Registry default vazio. Sem handlers WhatsApp/IA/Agenda/Financeiro/CRM/Journey/Analytics. Services de domínio sem imports de `consumers/`.

---

## 16. Arquivos criados

```
src/domain-events/consumers/domainEventConsumerTypes.ts
src/domain-events/consumers/domainEventConsumerContracts.ts
src/domain-events/consumers/domainEventConsumerRegistry.ts
src/domain-events/consumers/domainEventConsumerContext.ts
src/domain-events/consumers/domainEventConsumerRunner.ts
src/domain-events/consumers/domainEventConsumerDispatcher.ts
src/domain-events/consumers/domainEventConsumerRetry.ts
src/domain-events/consumers/domainEventConsumerDeadLetter.ts
src/domain-events/consumers/domainEventConsumerAudit.ts
src/domain-events/consumers/domainEventConsumerMetrics.ts
src/domain-events/consumers/domainEventConsumerHealth.ts
src/domain-events/consumers/index.ts
src/__tests__/domainEventConsumerFoundation.test.js
docs/reports/PHASE_7_6_DOMAIN_EVENT_CONSUMER_FOUNDATION.md
```

---

## 17. Arquivos modificados

| Arquivo | Mudança |
|---------|---------|
| `domainEventFlags.ts` | +CONSUMERS / CONSUMER_AUDIT / CONSUMER_RETRY |
| `domain-events/index.ts` | export consumers |
| `domainEventDiagnostics.ts` | flags conflitantes de consumers |
| `rhTestFlagContract.js` | contrato Vitest + FLAGS_RESOLVED |
| `domainEventsFoundation.test.js` | guards novas flags |
| `domainEventObservability.test.js` | snapshot flags |
| `repositoryV3ArchitectureContract.test.js` | inventário consumers |
| `docs/reports/README.md` | índice |

**Não modificados:** publishers de domínio, CRM/Agenda/Financeiro services, Event Bus wiring, workflow clínico.

---

## 18. Testes adicionados

`domainEventConsumerFoundation.test.js` (28): contratos, registry, flags/guards, context, operation helper, runner success/failure/timeout/idempotency, retry, dead-letter, audit, health idle, dispatcher isolamento, auto-wiring false, ausência de imports em domínios.

---

## 19. Resultado da regressão

```
Test Files  160 passed (160)
Tests       1743 passed | 1 skipped (1744)
```

Delta vs 7.5: **+30**. Zero regressão.

---

## 20. Riscos residuais

1. Retry “scheduled” não reexecuta automaticamente (intencional — sem timers).
2. Dead-letter volátil (in-memory) — adequado só para DEV/testes.
3. Helper de operação composta ainda não adotado no close clínico.
4. SubscriberBase legado permanece separado da Consumer Foundation (não misturar até Phase 7.7+).

---

## 21. Recomendações para Phase 7.7 — First Consumer Pilot Foundation

1. Escolher **um** consumer piloto estrutural (ex.: audit mirror / no-op analytics stub) — ainda sem side-effects de negócio.
2. Opt-in de wiring explícito atrás de flag (nunca auto no boot de produção).
3. Avaliar adoção de `createDomainEventOperationContext` no close clínico.
4. Manter WhatsApp/IA/Agenda fora do piloto.
5. Flags default OFF + production locks.

---

## 22. Confirmações finais

- produção não alterada;
- banco não alterado;
- migrations não executadas;
- Supabase remoto não alterado;
- Storage remoto não alterado;
- IndexedDB preservado;
- frontend funcionalmente idêntico;
- nenhum consumer funcional registrado;
- nenhum auto-wiring no Event Bus;
- domínios existentes não alterados;
- commit não realizado.

---

**Phase 7.6 concluída. Aguardando aprovação formal para Phase 7.7.**
