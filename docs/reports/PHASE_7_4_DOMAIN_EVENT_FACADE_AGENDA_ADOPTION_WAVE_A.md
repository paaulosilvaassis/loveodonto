# Phase 7.4 — Domain Event Facade + Agenda Domain Event Adoption (Wave A)

**Data:** 2026-07-10  
**Baseline anterior:** 1668 pass | 1 skip (Phase 7.3)  
**Regressão Phase 7.4:** **1691 pass | 1 skipped** (+23)

**Commit:** não realizado

---

## 1. Auditoria completa da Agenda

| Fluxo | Service | Dual-write | Domain Event Wave A |
|-------|---------|------------|---------------------|
| `createAppointment` | `appointmentService` | `scheduleAgendaDualWriteCreate` | `APPOINTMENT_CREATED` |
| `createAppointmentFromCrm` | `appointmentService` | dual-write create + CRM side-effects | `APPOINTMENT_CREATED` |
| `updateAppointment` | `appointmentService` | `scheduleAgendaDualWriteUpdate` | mutation resolver (ver §4) |
| `cancelAppointment` | wrapper → `updateAppointment` | herda update | `APPOINTMENT_CANCELLED` |
| Reschedule | UI → `updateAppointment` (date/time) | herda update | `APPOINTMENT_RESCHEDULED` |
| Confirm | UI → `updateAppointment` (status confirmado) | herda update | `APPOINTMENT_CONFIRMED` |
| `checkInAppointment` / call / finish / return | workflow clínico | **sem** dual-write | **não integrado** (intocado) |
| `patientFlowService.updateAppointmentStatus` | fluxo paciente | sem dual-write | **legado paralelo** |
| `journeyEntryService.cancelAppointment` | journey soft-cancel | sem dual-write | **legado paralelo** |
| Hard delete | — | — | **inexistente** → sem `APPOINTMENT_DELETED` |

**Integrações observadas (sem consumers de Domain Events):**
- CRM: `createAppointmentFromCrm` → `addLeadEvent` / `moveLeadToStage` (legado)
- Patient Journey: `upsertJourneyEntryForAppointment` no update
- Financeiro: comissões no check-in (workflow — fora da Wave A)
- WhatsApp: confirmação via `queueMessage` / logs (legado)
- Dual-write / hydrate / retry: `agendaWriteAdapter` + repository `*Core` — **sem** Domain Events

**Ponto canônico único:** `appointmentService` **após IDB ok**, **fora** de `agendaWriteAdapter`.

---

## 2. Domain Event Facade

Arquivo: `src/domain-events/shared/domainEventFacade.ts`

API canônica: `publishViaDomainEventFacade(input, options)`.

Responsabilidades:
- Encapsula `publishDomainEventViaToolkit` (validator, serializer, correlation, dedup, audit hooks, bus)
- Lazy-attach de Observability quando `DOMAIN_EVENT_OBSERVABILITY=true`
- Feed direto de metrics/trace/timeline se observability ON e audit OFF (evita double-count com audit ON)
- Defaults: `enableDedup=true`, `requireRegisteredType=true`

**Regra pós-7.4:** CRM, Financial e Agenda publicam **somente** via Facade. Publisher permanece interno ao Toolkit.

---

## 3. Pontos canônicos

| Domínio | Publisher de domínio | Wiring |
|---------|----------------------|--------|
| Agenda | `agendaAppointmentDomainEventPublisher.js` | `appointmentService` após IDB |
| CRM (migrado) | `crmLeadDomainEventPublisher.js` | `crmService` (já existia) → agora Facade |
| Financial (migrado) | `financialDomainEventPublisher.js` | services financeiros → agora Facade |

---

## 4. Eventos adotados

Registry estendido (+4) por necessidade comprovada da Wave A:

| Evento | Operação |
|--------|----------|
| `APPOINTMENT_CREATED` | create / createFromCrm |
| `APPOINTMENT_CANCELLED` | cancel (via update) |
| `APPOINTMENT_RESCHEDULED` | mudança date/startTime/endTime |
| `APPOINTMENT_CONFIRMED` | status → confirmado |
| `APPOINTMENT_STATUS_CHANGED` | outras mudanças de status via `updateAppointment` |
| `APPOINTMENT_UPDATED` | demais campos |

Prioridade do resolver: **cancel > reschedule > confirm > status > update**.

`APPOINTMENT_DELETED` **não** criado (sem hard delete).

Registry total: **26** tipos.

---

## 5. Payloads

Mínimos: `appointmentId`, `tenantId`, `patientId`, `leadId`, `professionalId`, `roomId`, `date`, `startTime`, `endTime`, `status`, `isReturn`, `procedureName`, `channel`, `changeSet`, previous* para mutations, `cancelReason` no cancel.

**Excluídos:** notes/workflowNotes, anamnese, prontuário, objetos completos de paciente, dados financeiros.

---

## 6. Correlation / Causation

Padrão 7.2: `resolveAgendaOperationCorrelation` — preserva correlation recebida; gera `de-corr-{uuid}` se ausente. **Não** usa `aggregateId` como correlation permanente. Causation opcional propagável.

---

## 7. Observability integrada

Facade chama `attachDomainEventObservability` quando a flag está ON. Publicações alimentam Metrics / Trace / Timeline (via audit hooks ou feed direto). Diagnostics/Health permanecem consultáveis via Inspector. Com flags OFF → zero efeito funcional.

---

## 8. Arquivos criados

```
src/domain-events/shared/domainEventFacade.ts
src/services/agendaAppointmentDomainEventPublisher.js
src/__tests__/agendaDomainEventsAdoption.test.js
docs/reports/PHASE_7_4_DOMAIN_EVENT_FACADE_AGENDA_ADOPTION_WAVE_A.md
```

---

## 9. Arquivos modificados

| Arquivo | Mudança |
|---------|---------|
| `src/domain-events/shared/index.ts` | export Facade |
| `src/domain-events/domainEventTypes.ts` | +4 appointment event types |
| `src/domain-events/domainEventRegistry.ts` | +4 registry entries |
| `src/services/appointmentService.js` | wiring create/update (pós-IDB) |
| `src/services/crmLeadDomainEventPublisher.js` | Toolkit → Facade |
| `src/services/financialDomainEventPublisher.js` | Toolkit → Facade |
| `src/__tests__/domainEventsFoundation.test.js` | registry length 26 |
| `src/__tests__/crmLeadDomainEventsAdoption.test.js` | asserts Facade |
| `src/__tests__/financialDomainEventsAdoption.test.js` | asserts Facade |
| `src/__tests__/repositoryV3ArchitectureContract.test.js` | inventário Facade |
| `docs/reports/README.md` | índice |

**Não modificados:** `patientFlowService`, journey workflow clínico, WhatsApp, IA, dashboard, adapters de write (sem DE), Supabase, migrations.

---

## 10. Testes adicionados

`agendaDomainEventsAdoption.test.js`: Facade, publicação Agenda (create/cancel/reschedule/confirm/update), payloads, correlation/causation, observability, flags/guards, ausência de consumers, preservação do workflow clínico (check-in sem evento), adapter sem DE.

---

## 11. Resultado da regressão

```
Test Files  158 passed (158)
Tests       1691 passed | 1 skipped (1692)
```

Delta vs Phase 7.3: **+23**. Nenhuma regressão.

---

## 12. Riscos residuais

1. Caminhos paralelos (`patientFlowService`, `journeyEntryService.cancelAppointment`) ainda alteram status **sem** Domain Events — intencional nesta wave.
2. Workflow clínico (check-in/call/finish) permanece sem eventos — correto para não acoplar jornada clínica.
3. CRM `correlationId = lead.id` (7.1) ainda diverge do padrão `de-corr-*` da Agenda/Financial — follow-up em 7.5.
4. Confirm + reschedule no mesmo update prioriza RESCHEDULED (documentado).

---

## 13. Recomendações para Phase 7.5 — CRM Wave B Domain Events

1. Adotar Activity Stream / follow-ups / tasks via **Facade apenas**.
2. Eventos candidatos: `FOLLOW_UP_CREATED`, `TASK_CREATED`, `TASK_COMPLETED` (já no registry).
3. Alinhar correlation CRM ao padrão `de-corr-{uuid}` (corrigir legado 7.1).
4. Não publicar a partir de `crmWriteAdapter` / activity adapter.
5. Manter workflow clínico e Patient Journey sem consumers nesta wave.
6. Flags default OFF + production locks.

---

## 14. Confirmações finais

- produção não alterada;
- banco não alterado;
- migrations não executadas;
- Supabase remoto não alterado;
- Storage remoto não alterado;
- IndexedDB preservado;
- frontend funcionalmente idêntico (flags OFF);
- nenhum consumer funcional criado;
- workflow clínico intocado;
- commit não realizado.

---

**Phase 7.4 concluída. Aguardando aprovação formal para Phase 7.5.**
