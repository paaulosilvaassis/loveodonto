# Phase 7.1 — CRM Domain Event Adoption (Wave A)

**Data:** 2026-07-10  
**Baseline anterior:** 1613 pass | 1 skip (Phase 7.0)  
**Regressão Phase 7.1:** **1629 pass | 1 skipped** (+16)

**Commit:** não realizado

---

## 1. Auditoria dos fluxos de Lead

| Fluxo | Entry point | Side-effects locais | Dual/Primary | Domain Event |
|-------|-------------|---------------------|--------------|--------------|
| `createLead` | `crmService.createLead` | IDB `crmLeads` + `logLeadEvent` (STATUS_CHANGE) + `logAction` | `scheduleCrmDualWriteCreateLead` (microtask) | `scheduleLeadCreatedDomainEvent` |
| `updateLead` | `crmService.updateLead` | IDB merge + opcional `logLeadEvent` se stage mudar + `logAction` | `scheduleCrmDualWriteUpdateLead` | `scheduleLeadUpdatedDomainEvent` |
| `moveLeadToStage` | `crmService.moveLeadToStage` | IDB stage + `logLeadEvent` + `logAction` | `scheduleCrmDualWriteMoveLeadToStage` | `scheduleLeadMovedDomainEvent` |

**Outros caminhos (fora do escopo 7.1):**
- Meta lead upsert (`createOrUpdateMetaLead` / similar) — não emite Domain Event Wave A
- `convertLeadToPatient` — muda stage sem `LEAD_MOVED`
- Callers indiretos (`crmBudgetService`, `appointmentService`) usam `moveLeadToStage` → herdam o ponto canônico

**Integrações:** Agenda/Pacientes não publicam Domain Events nesta phase. `crmLeadEvents` legado preservado.

---

## 2. Pontos canônicos de publicação

Único ponto por operação: **`crmService.js` imediatamente após gravação IndexedDB bem-sucedida** e após o schedule do dual/primary write.

**Não** publicar em:
- `crmWriteAdapter` / `createLeadCore` / `updateLeadCore` / `moveLeadStageCore`
- Activity Write Pipeline
- Read adapters

Motivo: dual e primary compartilham o adapter assíncrono; publicar no service garante **1 evento por operação lógica**.

---

## 3. Eventos adotados

| Operação | Evento registry | Observação |
|----------|-----------------|------------|
| `createLead` | `LEAD_CREATED` | — |
| `updateLead` | `LEAD_UPDATED` | Mesmo se `stageKey` mudar via update — **não** emite `LEAD_MOVED` |
| `moveLeadToStage` | `LEAD_MOVED` | Nome oficial do registry (não `LEAD_STAGE_CHANGED`) |

---

## 4. Payloads definidos

**LEAD_CREATED:** `leadId`, `tenantId`, `stageKey`, `patientId`, `ownerId`, `source`, `createdAt`

**LEAD_UPDATED:** `leadId`, `tenantId`, `changeSet` (parcial sanitizado), `updatedAt`

**LEAD_MOVED:** `leadId`, `tenantId`, `fromStageKey`, `toStageKey`, `changedAt`, `reason` (lossReason quando existir)

---

## 5. Correlation e causation

- `correlationId` = `lead.id` (mesmo seed do Write Toolkit `buildRepositoryCorrelationId(legacyId)`)
- `causationId` = `null` por default; propagável via meta nos helpers de teste / API interna
- Sem correlationId distinto por camada da mesma operação

---

## 6. Deduplicação

- Opt-in `enableDedup: true` no publisher toolkit
- `eventId` estável por operação lógica (`de-lead-created-{id}`, etc.)
- Sem persistência

---

## 7. Audit

Com `DOMAIN_EVENT_AUDIT=true` (+ `DOMAIN_EVENTS=true`): estados `prepared` / `published` / `skipped` / `rejected` via Audit Hooks + log in-memory. Sem banco / Supabase.

---

## 8. Tratamento de falhas

- Publish em `queueMicrotask` + try/catch
- Falha → log DEV apenas; **não** altera retorno do service; **não** rollback IDB; **não** reexecuta write

---

## 9. Garantia de ausência de consumers

- Nenhum `registerDomainEventSubscriber` / `DomainEventSubscriberBase` em services CRM
- `crmWriteAdapter` não importa Domain Event publisher
- Sem WhatsApp / IA / Analytics / Journey / webhooks / filas

---

## 10. Arquivos criados

| Arquivo | Papel |
|---------|-------|
| `src/services/crmLeadDomainEventPublisher.js` | Schedulers + payloads Wave A |
| `src/__tests__/crmLeadDomainEventsAdoption.test.js` | Testes adoção |
| `docs/reports/PHASE_7_1_CRM_DOMAIN_EVENT_ADOPTION_WAVE_A.md` | Este relatório |

---

## 11. Arquivos modificados

| Arquivo | Mudança |
|---------|---------|
| `src/services/crmService.js` | Wiring canônico pós-IDB |
| `docs/reports/README.md` | Índice Phase 7.1 |

---

## 12. Testes adicionados

- LEAD_CREATED / UPDATED / MOVED
- Flags OFF no-op + legacy preservation
- Falha de publish não quebra escrita
- correlationId / causationId
- Dedup mesma operação
- Sem duplicidade dual/primary (ponto canônico)
- Audit states
- Production guards
- Ausência de consumers

---

## 13. Resultado da regressão

```text
Test Files  155 passed (155)
Tests       1629 passed | 1 skipped (1630)
```

Nenhuma regressão. Baseline 7.0: 1613 → 7.1: 1629 (+16).

---

## 14. Riscos residuais

1. Meta lead create e `convertLeadToPatient` ainda sem Domain Events.
2. `updateLead` com mudança de stage emite só `LEAD_UPDATED` (by design).
3. Correlation alinhada por convenção (`lead.id`); write adapter ainda não recebe correlation explícito do service (mesmo seed).
4. Flags OFF em produção — eventos só observáveis em staging com flags ON.

---

## 15. Recomendações para Phase 7.2 — Financial Domain Event Adoption (Wave A)

1. Auditar `createReceivable` / `receivePayment` / falha de pagamento.
2. Publicar `RECEIVABLE_CREATED`, `PAYMENT_RECEIVED`, `PAYMENT_FAILED` no ponto canônico do financial service (não no dual/primary adapter).
3. Reutilizar `publishDomainEventViaToolkit` + correlation do Write Toolkit financeiro.
4. Sem consumers; flags OFF default.

---

## 16. Confirmações finais

| Item | Status |
|------|--------|
| Produção não alterada | ✅ flags default OFF |
| Banco não alterado | ✅ |
| Migrations não executadas | ✅ |
| Supabase remoto não alterado | ✅ |
| Storage remoto não alterado | ✅ |
| IndexedDB preservado | ✅ |
| Frontend funcionalmente idêntico (flags OFF) | ✅ |
| Nenhum consumer funcional criado | ✅ |
| Commit não realizado | ✅ |

---

**Phase 7.1 concluída. Aguardando aprovação formal para Phase 7.2.**
