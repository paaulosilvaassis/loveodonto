# Phase 7.0 — Domain Event Toolkit + Publisher Foundation

**Data:** 2026-07-10  
**Baseline anterior:** 1583 pass | 1 skip (Phase 6.9)  
**Regressão Phase 7.0:** **1613 pass | 1 skipped** (+30)

**Commit:** não realizado

---

## 1. Auditoria da infraestrutura de eventos

| Camada | Path | Status |
|--------|------|--------|
| Foundation (6.9) | `src/domain-events/*` | Intacta |
| Toolkit (7.0) | `src/domain-events/shared/*` | Nova |
| Domínios (CRM/Agenda/Financeiro/…) | — | **Zero** imports do toolkit |

Publisher, validator, serializer, correlation, retry, dedup, subscriber base e audit hooks existem apenas como infraestrutura. Nenhum domínio publica ou consome.

---

## 2. Toolkit criado

```text
src/domain-events/shared/
  domainEventPublisher.ts
  domainEventValidator.ts
  domainEventSerializer.ts
  domainEventCorrelation.ts
  domainEventRetry.ts
  domainEventDeduplication.ts
  domainEventSubscriberBase.ts
  domainEventAuditHooks.ts
  index.ts
```

Reutiliza foundation 6.9 (contracts, bus, flags, audit, mapper, registry) — sem duplicar DTO/registry.

---

## 3. Publisher

`publishDomainEventViaToolkit` / `publishDomainEventPrepared`:

- `DOMAIN_EVENTS=false` → `{ skipped: true, reason: 'DOMAIN_EVENTS=false' }` (no-op)
- Flags ON (só testes): validate → (opt-in dedup) → audit hooks → bus local
- Exige `eventType` registrado por default
- Sem integração de domínio
- Sem fila / mensageria externa

---

## 4. Validator

`validateDomainEvent` / `assertDomainEventValid`:

- Schema obrigatório (via contracts 6.9)
- `aggregateType`, `aggregateId`, `tenantId`, `eventType` (registry), `version`, `correlationId`, `causationId` (tipo)
- Eventos inválidos rejeitados só na infraestrutura

---

## 5. Serializer

Envelope oficial:

```text
{ format: 'love-odonto-domain-event', formatVersion: 1, event }
```

- `serializeDomainEvent` / `deserializeDomainEvent`
- `domainEventToPlainObject` para integrações futuras

---

## 6. Correlation

- `createDomainEventCorrelationId` / `createDomainEventCausationId`
- `resolveDomainEventCorrelation` / `propagateDomainEventCorrelation`
- `withDomainEventCorrelation`
- Sem alterar consumidores atuais

---

## 7. Retry

- `DOMAIN_EVENT_RETRY_POLICY_DEFAULT`
- `computeDomainEventRetryDelay` / `evaluateDomainEventRetry`
- `runWithDomainEventRetryContract` — **executa uma vez**; não re-tenta de fato

---

## 8. Deduplication

- Chave in-memory: `eventType:tenantId:aggregateId:eventId`
- TTL 5 min (igual Write Toolkit)
- **Não ativada** no publisher (opt-in `enableDedup: true`)
- Sem persistência

---

## 9. Audit Hooks

- `registerDomainEventAuditHook` / `emitDomainEventAuditHook`
- Notifica extensões + grava audit in-memory existente
- Sem persistência / sem banco

`DomainEventSubscriberBase` + `registerDomainEventSubscriber` preparados; nenhum domínio registra.

---

## 10. Arquivos criados

| Arquivo | Papel |
|---------|-------|
| `src/domain-events/shared/domainEventPublisher.ts` | Publisher toolkit |
| `src/domain-events/shared/domainEventValidator.ts` | Validação estrita |
| `src/domain-events/shared/domainEventSerializer.ts` | Serialize/deserialize |
| `src/domain-events/shared/domainEventCorrelation.ts` | Correlation/causation |
| `src/domain-events/shared/domainEventRetry.ts` | Retry contracts |
| `src/domain-events/shared/domainEventDeduplication.ts` | Dedup in-memory |
| `src/domain-events/shared/domainEventSubscriberBase.ts` | Subscriber base |
| `src/domain-events/shared/domainEventAuditHooks.ts` | Audit hooks |
| `src/domain-events/shared/index.ts` | Barrel toolkit |
| `src/__tests__/domainEventToolkit.test.js` | Testes Phase 7.0 |
| `docs/reports/PHASE_7_0_DOMAIN_EVENT_TOOLKIT_PUBLISHER_FOUNDATION.md` | Este relatório |

---

## 11. Arquivos modificados

| Arquivo | Mudança |
|---------|---------|
| `src/domain-events/index.ts` | Re-export toolkit shared |
| `src/__tests__/repositoryV3ArchitectureContract.test.js` | Inventário `domain-events/shared` |
| `docs/reports/README.md` | Índice Phase 7.0 |

---

## 12. Testes adicionados

`domainEventToolkit.test.js`:

- Estrutura shared
- Flags / Production Guards
- Validator / Serializer / Correlation
- Retry / Deduplication
- Audit Hooks / Subscriber Base
- Publisher (OFF no-op, ON bus, reject registry, dedup opt-in, hooks)

---

## 13. Resultado da regressão

```text
Test Files  154 passed (154)
Tests       1613 passed | 1 skipped (1614)
```

Nenhuma regressão. Baseline 6.9: 1583 → 7.0: 1613 (+30).
---

## 14. Riscos residuais

1. Publisher ainda não usado por domínios — risco de API drift até 7.1.
2. Dedup/retry in-memory — adequados só para foundation; persistência futura.
3. Correlation seed usa `aggregateId` quando correlation omitido — 7.1 deve passar correlation do Write Toolkit.
4. Barrel `index.ts` exporta foundation + toolkit — imports de domínio devem preferir `shared/domainEventPublisher`.

---

## 15. Recomendações para Phase 7.1 — CRM Domain Event Adoption (Wave A)

1. Emitir `LEAD_CREATED` / `LEAD_UPDATED` / `LEAD_MOVED` via `publishDomainEventViaToolkit` nos write paths Wave A.
2. Manter `DOMAIN_EVENTS=false` default; staging only.
3. Propagar `correlationId` do Write Toolkit.
4. Sem consumidores (WhatsApp/IA/Analytics/Journey).
5. Não ativar dedup global até soak; opt-in por operação se necessário.

---

## 16. Confirmações finais

| Item | Status |
|------|--------|
| Produção não alterada | ✅ |
| Banco não alterado | ✅ |
| Migrations não executadas | ✅ |
| Supabase remoto não alterado | ✅ |
| Storage remoto não alterado | ✅ |
| IndexedDB preservado | ✅ |
| Frontend funcionalmente idêntico | ✅ |
| Commit não realizado | ✅ |

---

**Phase 7.0 concluída. Aguardando aprovação formal para Phase 7.1.**
