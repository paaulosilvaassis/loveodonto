# Phase 5.7 — Agenda Repository Foundation

**Data:** 2026-07-09  
**Pré-requisito:** Phase 5.6 READY  
**Escopo:** Foundation only — sem read/write cutover

---

## Matriz método → consumidor → origem → destino → risco

| Método | Consumidores principais | IndexedDB | Supabase/API | Repository futuro | Risco |
|--------|---------------------------|-----------|--------------|-------------------|-------|
| `listAppointments` | AgendaPage, TeamPage, CommunicationPage | `appointments[]` | ❌ | `listLegacySync` / `listCore` | Baixo |
| `getAppointmentDetails` | AppointmentDetailsModal, ClinicalAppointmentPage | `appointments[]` + joins locais | ❌ | `getLegacySync` / `getCore` | Baixo |
| `listBlocks` | AgendaPage | `appointmentBlocks[]` | ❌ | `listBlocksLegacySync` | Baixo |
| `getAvailableSlots` | CRM modals, ScheduleFromPatientModal | `appointments` + `collaboratorWorkHours` | ❌ | satélite (fase posterior) | Médio |
| `hasConflict` | AgendaPage drag-drop, create/update | `appointments` + blocks | ❌ | validação local | Médio |
| `createAppointment` | AgendaPage, modals | write IDB | ❌ | write adapter (fase posterior) | Alto |
| `updateAppointment` | AgendaPage, GestaoAtendimento, PatientFlow | write IDB | ❌ | write adapter (fase posterior) | Alto |
| `cancelAppointment` | AgendaPage, journeyEntryService | soft status IDB | ❌ | write adapter (fase posterior) | Médio |
| `createBlock` | AgendaPage | write IDB | ❌ | write adapter (fase posterior) | Baixo |
| `checkInAppointment` | PatientJourneyPage, AppointmentDetailsModal | workflow IDB | ❌ | workflow adapter (fase posterior) | Alto |
| `callPatient` | PatientJourneyPage | workflow IDB | ❌ | workflow adapter | Alto |
| `finishAppointment` | ClinicalAppointmentPage, journeyEntryService | workflow IDB | ❌ | workflow adapter | Alto |
| `fetchAppointmentsByDate` | PatientFlowPage, dashboards | IDB filter by date | ❌ | `listLegacySync({date})` | Baixo |
| `listJourneyEntriesByDate` | GestaoAtendimento, PatientJourney | `patientJourneyEntries` | ❌ | domínio jornada (separado) | Médio |

---

## Flags (foundation — todas default false)

```env
VITE_AGENDA_READ=false
VITE_AGENDA_READ_PRIMARY=false
VITE_AGENDA_SHADOW=false
VITE_AGENDA_COMPARE=false
```

---

## Próxima fase (5.8)

- Wire `agendaReadAdapter` em `appointmentService` (leituras)
- Registrar Admin API remote fetch
- Hydrate IDB mirror
- Soak staging READ_PRIMARY
