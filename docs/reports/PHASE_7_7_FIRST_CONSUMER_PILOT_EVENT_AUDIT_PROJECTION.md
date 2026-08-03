# Phase 7.7 — First Consumer Pilot (Event Audit Projection)

**Data:** 2026-07-13  
**Baseline anterior:** 1743 pass | 1 skip (Phase 7.6)  
**Regressão Phase 7.7:** **1758 pass | 1 skipped** (+15)

**Commit:** não realizado

---

## 1. Auditoria do Consumer piloto

| Item | Resultado |
|------|-----------|
| Consumer | `EventAuditProjectionConsumer` (`consumerId: event-audit-projection`) |
| Responsabilidade | Receber Domain Events → projeção imutável in-memory → inspeção |
| Side-effects de negócio | **Nenhum** (apenas `appendEventAuditProjection`) |
| Auto no boot | **Não** — `attachEventAuditProjection` é opt-in explícito |
| Auto-wiring foundation | Mantém `DOMAIN_EVENT_CONSUMER_AUTO_WIRING = false` no dispatcher |
| Domínios alterados | **Não** — CRM / Agenda / Financeiro / publishers intocados |

**Eventos suportados (já no registry — nenhum tipo novo):**

- CRM: `LEAD_*`, `FOLLOW_UP_*`, `TASK_*`, `CRM_TIMELINE_EVENT_CREATED`
- Financeiro: `RECEIVABLE_*`, `PAYABLE_*`, `FINANCING_*`, `PAYMENT_RECEIVED`
- Agenda: `APPOINTMENT_*`

Wiring do piloto: `attachEventAuditProjection(flags)` registra o consumer e faz `subscribeAllDomainEvents` → `dispatchDomainEventToConsumers` (await). Flags OFF → no-op.

---

## 2. Projection

`eventAuditProjectionStore.ts` — buffer in-memory imutável (`Object.freeze`).

Campos: `eventId`, `eventType`, `aggregateType`, `aggregateId`, `correlationId`, `causationId`, `tenantId`, `timestamp`, `publisher`, `consumer`, `status: 'projected'`, `projectedAt`.

- Cap default: **1000** (`EVENT_AUDIT_PROJECTION_DEFAULT_CAP`)
- Cap configurável via `setEventAuditProjectionCap`
- Sem persistência / sem DB / sem Storage

---

## 3. Inspector

`domainEventInspector.ts` evoluído (API interna apenas):

- Snapshot: `auditProjection`, `auditProjectionCount`, `consumerHealth`, `consumerMetrics`
- Helpers: `inspectEventAuditProjection`, `ByType`, `ByCorrelation`, `ByAggregate`

Sem endpoint HTTP. Sem UI.

---

## 4. Observability

Integração sem alterar infra existente de Metrics/Trace/Timeline:

| Superfície | Integração |
|------------|------------|
| Consumer Metrics | Sucesso/falha do piloto via runner existente |
| Consumer Health | Componente `audit_projection` (`healthy` se attached) |
| Inspector | Snapshot inclui projection + consumer health/metrics |
| Diagnostics | Flags conflitantes `DOMAIN_EVENT_PROJECTION` |
| Trace / Timeline | Continuam via Facade/Observability (flags ON em testes) |

---

## 5. Feature Flags

| Flag | Default | Produção | Dependências |
|------|---------|----------|--------------|
| `DOMAIN_EVENT_PROJECTION` | `false` | locked | `DOMAIN_EVENTS` + `DOMAIN_EVENT_CONSUMERS` |

Env: `VITE_DOMAIN_EVENT_PROJECTION=false` (contrato Vitest).  
Helper: `isDomainEventProjectionEnabled()`.

---

## 6. Arquivos criados

```
src/domain-events/consumers/eventAuditProjectionStore.ts
src/domain-events/consumers/eventAuditProjectionConsumer.ts
src/domain-events/consumers/attachEventAuditProjection.ts
src/__tests__/eventAuditProjectionPilot.test.js
docs/reports/PHASE_7_7_FIRST_CONSUMER_PILOT_EVENT_AUDIT_PROJECTION.md
```

---

## 7. Arquivos modificados

| Arquivo | Mudança |
|---------|---------|
| `domainEventFlags.ts` | +`DOMAIN_EVENT_PROJECTION` (default false, production lock, validação) |
| `consumers/index.ts` | exports store / consumer / attach |
| `domainEventConsumerHealth.ts` | componente `audit_projection` |
| `domainEventInspector.ts` | projection no snapshot + helpers |
| `domainEventDiagnostics.ts` | conflitos PROJECTION |
| `rhTestFlagContract.js` | `VITE_DOMAIN_EVENT_PROJECTION` + FLAGS_RESOLVED |
| `domainEventsFoundation.test.js` | guards da nova flag |
| `domainEventObservability.test.js` | snapshot flags |
| `domainEventConsumerFoundation.test.js` | diagnostics / health inventory |
| `repositoryV3ArchitectureContract.test.js` | inventário attach piloto |
| `docs/reports/README.md` | índice Phase 7.7 |

**Não modificados:** CRM/Agenda/Financeiro services, publishers de domínio, banco, migrations, Supabase/Storage remoto, IndexedDB, UI, HTTP.

---

## 8. Testes adicionados

`eventAuditProjectionPilot.test.js` (15):

- flags OFF no-op + contrato + production lock
- consumo `LEAD_CREATED` / `APPOINTMENT_CREATED` / `RECEIVABLE_CREATED`
- projeção correta + cap
- inspector / health / audit
- isolamento (falha de vizinho não impede projection)
- ausência de side-effects / domínio intocado
- attach não é auto no boot

---

## 9. Resultado da regressão

```
Test Files  161 passed (161)
Tests       1758 passed | 1 skipped (1759)
```

Delta vs 7.6: **+15**. Zero regressão.

---

## 10. Riscos residuais

1. Projeção volátil (in-memory) — apenas DEV/testes; perde no reload.
2. Attach do piloto usa Event Bus opt-in; foundation dispatcher permanece sem auto-wiring — dois caminhos de despacho coexistentes (explícito vs attach piloto).
3. Cap FIFO pode descartar eventos antigos sob carga de testes.
4. Health `audit_projection` usa `isEventAuditProjectionAttached()` (estado runtime), não env isolado — correto para piloto opt-in.

---

## 11. Recomendações para Phase 7.8 — Analytics Projection Foundation

1. Criar projeção analítica **estrutural** (contadores/agregados in-memory) atrás de flag dedicada, default OFF.
2. Reutilizar Consumer Foundation + Isolation; **não** acoplar a WhatsApp/IA/Notificações.
3. Manter attach opt-in (espelhar `attachEventAuditProjection`).
4. Não persistir analytics em DB nesta wave.
5. Não alterar publishers de domínio; consumir eventos já publicados.
6. Expandir Inspector com snapshot analytics sem HTTP/UI.
7. Manter production locks + Migration Checklist / Production Guards.

---

## 12. Confirmações finais

- produção não alterada;
- banco não alterado;
- migrations não executadas;
- Supabase remoto não alterado;
- Storage remoto não alterado;
- IndexedDB preservado;
- frontend funcionalmente idêntico;
- nenhum side-effect de negócio;
- commit não realizado.

---

**Phase 7.7 concluída. Aguardando aprovação formal para Phase 7.8.**
