# Phase 9.4A Wave 2 — Patient Details & Repository

**Status oficial:** `PHASE_9_4A_WAVE2_COMPLETE`  
**Reexecução:** 2026-08-02 (Mac, Docker / Supabase CLI local disposable)  
**Commit:** não realizado  
**linkedRef:** `tckdjyunwmdpqmewrwvt`  
**remoteActionsExecuted:** `false`

---

## 1. Auditoria dos satélites (IndexedDB)

| Collection | Cardinalidade | Observação |
|------------|---------------|------------|
| patientBirth | 1:1 | nationality/city/state; birth_date no profile |
| patientEducation | 1:1 | education_level/profession/other |
| patientAddresses | 1:N | `addr-*`, um `is_primary` |
| patientRelationships | 1:1 agregado | emergência + responsável + dependents[] + LGPD |
| patientInsurances | 1:N | `ins-*`, convênio/plano/carteirinha |
| patientAccess | 1:1 | portal/access_status (não duplica blocked do core) |
| patientActivitySummary | 1:1 | totais canônicos persistidos |

Fora de escopo: charts, anamnese, odontograma, files, journey, budgets.

---

## 2. Migration

**Arquivo:** `supabase/migrations/027_app_patient_details.sql`

**Tabelas:** `patient_birth_details`, `patient_education`, `patient_addresses`, `patient_relationships`, `patient_insurances`, `patient_access`, `patient_activity_summary`

**RLS:** helpers 026; ENABLE+FORCE; SELECT membership fail-closed; INSERT/UPDATE admin (sem FOR ALL); DELETE físico não concedido; soft-delete SELECT permite admin ver deletados (Postgres exige NEW row visível ao UPDATE).

---

## 3. Repository

`patientSupabaseRepository.ts` — implementação real (cliente injetável / `supabaseAppClient`):

- Core: list/get/search/create/update/softDelete
- Wave 1 satélites: phones/documents/records
- Wave 2 satélites: birth/education/addresses/relationships/insurances/access/activity
- `getPatientBundle` monta bundle completo

**Facade:** flags off → `RemoteRead/WriteDisabled`; `getReadiness()`; **sem** import em `patientService`.

**Mappers:** round-trip IDB ↔ Core ↔ SQL para satélites Wave 2.

---

## 4. Evidência

| Gate | Resultado |
|------|-----------|
| Static wave2 | **9/9** |
| Static security / wave1 / 93a / 92l | PASS |
| Dry-run | `LOCAL_DRY_RUN_PASS` · `SCHEMA_APPLIED_VERIFIED` |
| publicTables | **39** |
| schemaMigrations | **29** |
| RLS geral | **58/58** |
| RLS Pacientes Wave 1 | **31/31** |
| RLS Pacientes Wave 2 | **38/38** |
| Repo E2E estrutural | **10/10** |
| Functional E2E | **29/29** |

---

## 5. Estado

| Item | Estado |
|------|--------|
| IndexedDB SSOT | sim |
| patientService | não alterado / não wired |
| Flags | todas false |
| Dual-write / backfill / cutover | não |
| Agenda/CRM/Contratos/Financeiro | não alterados |
| Pronto para Wave 3? | sob autorização humana |
