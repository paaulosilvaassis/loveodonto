# Phase 5.10 — Agenda Write Soak & Validation

**Data:** 2026-07-09  
**Pré-requisito:** Phase 5.9 READY  
**Produção:** `uoepkwhqztmsjnzirpev` — **todas as flags Agenda permanecem false**  
**Staging:** `tckdjyunwmdpqmewrwvt`  
**Tenant referência:** `7aba7127-409c-4ea4-8dbc-807efc5e189c`

---

## 1. Flags staging (somente dev/staging local)

```env
VITE_AGENDA_READ=true
VITE_AGENDA_READ_PRIMARY=true
VITE_AGENDA_WRITE=true
VITE_AGENDA_SHADOW=true
VITE_AGENDA_COMPARE=true
```

**Produção:** nenhuma flag acima. Locks `applyProductionSafeLocks` forçam false em build PROD e quando host Supabase = produção.

---

## 2. Dados de teste

| Item | Valor |
|------|-------|
| Tenant | `7aba7127-409c-4ea4-8dbc-807efc5e189c` |
| Usuário soak | admin com `agenda:write` |
| Paciente | `pat-001` (seed local) |
| Profissional | `col-001` |
| Sala | `room-001` |
| Lead CRM | `lead-001` |
| Data soak | `2026-07-15` ou posterior (não passado) |

---

## 3. Cenários manuais (browser staging)

| # | Cenário | Passos | Critério |
|---|---------|--------|----------|
| M1 | Create dual-write | Criar agendamento na Agenda | IDB imediato + row Supabase + `[AGENDA_WRITE] create ok` + hydrate |
| M2 | Update dual-write | Editar horário/status | UI atualiza + Supabase `updated_at` + mirror IDB |
| M3 | Cancel dual-write | Cancelar com motivo | status `cancelado` local + remoto + hydrate |
| M4 | CRM create | Pipeline → agendar lead | `createAppointmentFromCrm` + timeline CRM local + write remoto |
| M5 | Offline | DevTools offline → create | IDB ok; write remoto falha silenciosa; `[AGENDA_WRITE] rollback` |
| M6 | Shadow compare | DevTools `[AGENDA_SHADOW]` / `[AGENDA_COMPARE]` | divergências logadas; UI não trava |
| M7 | READ_PRIMARY reload | Recarregar página / lista | dados via Repository; hydrate IDB correto |
| M8 | Produção guard | build PROD ou host prod | WRITE=false, READ_PRIMARY=false, SHADOW=false |

---

## 4. Validações workflow (não migrado)

| Área | Método | Esperado |
|------|--------|----------|
| Check-in | `checkInAppointment` | 100% local IDB |
| Chamada | `callPatient` | 100% local |
| Finalização | `finishAppointment` | 100% local |
| Kanban | `moveToFlowColumn` | 100% local |
| Blocks | `createBlock` / `listBlocks` | 100% local IDB |
| Patient Journey | `journeyEntryService` | inalterado |

---

## 5. Logs esperados (DEV/STAGING apenas)

| Tag | Quando |
|-----|--------|
| `[AGENDA_WRITE]` | create / update / cancel dual-write ok ou rollback |
| `[AGENDA_READ]` | listCore / getCore via Admin API |
| `[AGENDA_SHADOW]` | compareIdbVsRemote |
| `[AGENDA_COMPARE]` | divergências estruturadas (via shadow) |

---

## 6. Cenários automatizados

Suite: `src/__tests__/agendaWriteSoakValidation.test.js`

Simula soak completo M1–M8 com mocks — sem rede/Supabase real.

---

## 7. Critérios de rollback

| Gatilho | Ação |
|---------|------|
| Perda de dado local | `AGENDA_WRITE=false` imediato |
| Divergência blocking sustained | pausar WRITE; investigar shadow |
| Erro remoto > 5% writes | `AGENDA_WRITE=false`; IDB authority |
| Staging Auth/522 down | BLOCKED_EXTERNAL (não promover) |
| Workflow regressão | reverter flags; workflow cutover **não** iniciar |

---

## 8. Execução soak remoto

**Status operacional (2026-07-09):** soak manual browser **depende** de staging Supabase saudável e tabela `appointments` disponível. Enquanto tabela ausente, Admin API retorna `503 APPOINTMENTS_TABLE_MISSING` — IDB permanece authority operacional.

Automated soak (Vitest) valida contratos sem Supabase remoto.

---

## 9. Veredicto Phase 5.10

| Dimensão | Resultado |
|----------|-----------|
| Contratos dual-write + READ_PRIMARY (automated) | **PASS** (Vitest) |
| Locks produção | **PASS** |
| Workflow preservado (automated) | **PASS** |
| Soak manual staging browser | **PENDENTE OPERADOR** (pré-req: staging healthy + tabela appointments) |
| Promover flags Agenda em produção | **PROIBIDO** |
