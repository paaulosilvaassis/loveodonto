# Phase 9.4A Wave 1 — Patients Foundation (+ Wave 1B runtime reconciliation)

**Status oficial:** Wave 1 **FOUNDATION VALIDATED (local)** — **não** é cutover / SSOT remoto  
**Reexecução runtime (Wave 1B):** 2026-08-02  
**Mac / Docker Engine:** 29.6.2 · **Supabase CLI:** 2.110.0  
**Commit:** não realizado  

---

## 1. Escopo Wave 1

| Artefato | Estado |
|----------|--------|
| `025_app_patients_core.sql` | aplicada no dry-run local |
| `public.patients` | presente + RLS |
| `public.patient_phones` | presente + RLS |
| `public.patient_documents` | presente + RLS |
| `public.patient_records` | presente + RLS |
| `src/repositories/patient/*` | scaffold; **não wired** em `patientService` |
| Flags `PATIENTS_*` | default **false** (prod locked) |
| IndexedDB | **permanece SSOT funcional** |

Fora de escopo Wave 1: dual-write, backfill, read/write cutover, Wave 2 satélites, Orçamentos/Jornada/Odontograma.

---

## 2. Gates Wave 1B (2026-08-02)

| Gate | Resultado |
|------|-----------|
| Checksum 025 canônica = espelho CLI | OK (`94510e79…`) |
| Dry-run | `LOCAL_DRY_RUN_PASS` · tables **32** · migrations **27** |
| RLS geral (9.2C) | `RLS_RUNTIME_PASS` · **45/45** |
| RLS Pacientes Wave 1 | `PATIENTS_WAVE1_RLS_PASS` · **31/31** |
| E2E 9.3A (após fix expectativa patients) | `FUNCTIONAL_E2E_PASS` · **29/29** |
| Static `phase94a-wave1` | **8/8** |
| Static `phase93a` | **5/5** |
| `linkedRef` | `tckdjyunwmdpqmewrwvt` |
| `remoteActionsExecuted` | `false` |

### Comandos

```bash
# dry-run (reset local)
RUN_SUPABASE_LOCAL_INTEGRATION=true \
LOVE_ODONTO_LOCAL_DB_CONFIRMATION=LOCAL_DISPOSABLE_ONLY \
APPLY_LOCAL_DB_RESET=true \
SUPABASE_LOCAL_CMD_TIMEOUT_MS=900000 \
npm run supabase:local:dry-run -- --json

# RLS patients Wave 1
RUN_SUPABASE_LOCAL_INTEGRATION=true \
LOVE_ODONTO_LOCAL_DB_CONFIRMATION=LOCAL_DISPOSABLE_ONLY \
SUPABASE_LOCAL_DB_CONTAINER=supabase_db_love-odonto-local-disposable \
npm run supabase:local:patients-wave1-rls -- --json
# → PATIENTS_WAVE1_RLS_PASS | 31 | 0 | 31

npm run test:supabase:phase94a-wave1
# → 8/8
```

---

## 3. Classificação

| Dimensão | Status |
|----------|--------|
| Implementação SQL + scaffold | SIM |
| Runtime local RLS patients | SIM (31/31) |
| Wiring app / dual-write | **NÃO** |
| SSOT app | **IndexedDB** |
| Pronto para Wave 2? | **SIM, sob autorização** — blockers de segurança CRITICAL da auditoria 1B devem ser tratados em fase própria (não Wave 2) |
| Pronto para produção? | **NÃO** |

---

## 4. Garantias desta fase

- Zero remoto / link / db push  
- Zero commit  
- Zero ativação de flags  
- Zero wiring `patientService` ↔ repository  
- Correções de segurança CRITICAL: **nenhuma aplicada** (somente auditadas)
