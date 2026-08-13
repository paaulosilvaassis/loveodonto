# PHASE_PATIENT_IMPORT_RECOVERY_05A — PLACEHOLDER SAFETY + DEPLOY + PRE-RESET CHECKPOINT

Data: 2026-08-13  
Origin: https://loveodonto.com.br/  
Tenant piloto: Implanprime (`b721c2c9-d924-41ee-8911-dc00c8208326`)  
Planilha: `~/Downloads/ControleODONTO - Pacientes.xlsx` (não modificada)  
Backup 03: **inalterado**

**ZERO DELETE. ZERO REIMPORT. ZERO mutation IndexedDB. ZERO mutation Supabase patients.**  
PHASE_10.21AL permanece **pausada**.

---

## FASE 1 — Audit `generatePlaceholderCpf`

Antes: gerava 11 dígitos com checksum válido (prefixo `1`). Passava em `isCpfValid`, podia ser formatado como `000.000.000-00`, exibido em cadastro/documentos/contratos, usado em deduplicação e em Contracts V2 como CPF civil.

Consumidores: `createPatientFromImport`, `buildPatientFromImportPayload`, `createPatientsFromImportBatch` (unicidade no lote), `createPatientFromLead`.

Depois: retorna string vazia (`allocateMissingPatientCpf()`). Identidade técnica = `patient.id`. CPF ausente = MISSING.

---

## Estratégia

- `cpf = ''` quando a planilha não informa CPF civil.
- Helpers: `isPlaceholderCpf`, `isRealPatientCpf`, `hasRealPatientCpf`, `formatCivilCpf`.
- Unicidade (`ensureCpfUnique`) ignora vazio; dois pacientes sem CPF não colidem.
- Deduplicação de import só usa CPF real; CPF Responsável não entra.
- Documentos/contratos/assinatura/exportação de identidade usam `formatCivilCpf` (vazio se não for CPF civil).

---

## Dry-run da planilha original

```
CIVIL_ROWS=3733
METADATA_ROWS=4
METADATA_SKIPPED=4

PATIENT_CPF_VALID=3387
PATIENT_CPF_MISSING=346

RESPONSIBLE_CPF_PRESENT=61
RESPONSIBLE_CPF_AS_PATIENT=0

CPF_DUPLICATE_KEYS=2
CPF_DUPLICATE_ROWS=4

PLACEHOLDER_PATIENTS=346
PLACEHOLDER_TREATED_AS_REAL_CPF=0

VALID_ROWS=3733
INVALID_ROWS=0

WOULD_CREATE=3731
WOULD_SKIP=2
WOULD_UPDATE=0
WOULD_DELETE=0
```

---

## Tests / Build / Secrets

Tests: PASS (suites de import, mapper, CPF placeholder 10 casos, search/suggest, Agenda lead, tenant isolation, documents/contracts identity, TCLE identity).  
Build: PASS (`vite build`).  
Secrets: PASS (nenhum secret no diff desta fase).

---

## Proibições respeitadas

- Production patient mutations: ZERO
- Supabase writes: ZERO
- Migrations / RLS / rollout: ZERO
- Contracts V2 / PHASE_10.21AL: PAUSED
- Backup 03: não alterado, não movido para Git
