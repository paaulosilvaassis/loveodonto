# PHASE_PATIENT_IMPORT_RECOVERY_04 — CPF HEADER IDENTITY FIX

Data: 2026-08-13  
Planilha: `~/Downloads/ControleODONTO - Pacientes.xlsx` (não modificada)  
Backup 03: **inalterado** (`bab9624d427daba6b50ab4a1ac9988022ca915d4d6d4b97899c80419af092791`)

**Nenhum DELETE, reimport, commit, push ou deploy.**  
IndexedDB de produção **não** foi tocado.  
PHASE_10.21AL permanece **pausada**.

---

## Root cause

`getCanonicalHeaderMap` usava `includes()` em aliases curtos. O alias `cpf` casava com **CPF Responsável**. Na planilha, 51 linhas sem CPF do paciente recebiam o CPF do responsável. O mesmo padrão valia para telefone/e-mail/`nascimento` vs colunas de terceiro.

## Mapper fix

- Campos de identidade (`cpf`, `rg`, `email`, `telefone`, `celular`, `data_nascimento`, `endereco`, `cep`, `nome_completo`): **igualdade** após `normalizeHeader`.
- Cabeçalhos com token de terceiro (`responsavel`, `pai`, `mae`, `conjuge`) não preenchem identidade do paciente.
- `CPF Titular` não mapeia para `cpf`.
- `CPF Responsável` / `CPF do Responsável` → `cpf_responsavel` → `documents.responsible_cpf`.
- `Nome Responsável` e `Telefone Responsável` vão para os campos de responsável.
- Alias `cpf do titular` removido da identidade do paciente.
- Aliases aceitos de CPF do paciente: `cpf`, `documento cpf`, `doc cpf`, `cpf paciente`, `cpf do paciente`.
- `rowToPayload` não inventa mais 11 dígitos via `Date.now()`.

Código no working tree (sem commit):

- `src/services/csvXlsxUtils.js`
- `src/services/importPatientService.js`
- `src/services/patientService.js` (`responsible_phone` no persist do import)
- `src/__tests__/csvXlsxHeaderMap.test.js`

## Pacientes sem CPF

As 346 linhas **são importáveis** (têm nome civil).

Persistência atual do domínio: se `cpf` está vazio/inválido, `generatePlaceholderCpf()` gera um CPF com checksum válido e prefixo `1` **somente para unicidade local**. O `patient.id` continua sendo a identidade. `pendingFields` inclui `cpf`. Não usa CPF do responsável. Não descarta a linha.

Isso **não** é identidade fiscal. É o mecanismo já existente de unicidade no IndexedDB.

## CPF duplicado

`CPF_DUPLICATE_KEYS=2`  
`CPF_DUPLICATE_ROWS=4`  

Modo `create`: segunda ocorrência no arquivo → `DUPLICATE_SKIPPED` (não sobrescreve).

---

## Relatório pedido

```
Root cause: alias substring "cpf" mapeava "CPF Responsável" → patient.cpf
Mapper fix: match exato em identidade + campo cpf_responsavel + bloqueio de headers de terceiro
Critical identity fields audited: cpf, rg, email, telefone, celular, data_nascimento, endereco, cep, nome_completo (+ nome/telefone/email responsável)

Civil rows: 3733
Metadata skipped: 4

Patient CPF valid: 3387
Patient CPF missing: 346
Responsible CPF present: 61
Responsible CPF incorrectly mapped to patient: 0

CPF duplicate keys: 2
CPF duplicate rows: 4

Valid rows: 3733
Invalid rows: 0
Would create: 3731
Would skip: 2
Would update: 0
Would delete: 0

Patients without CPF strategy: importar com nome civil; placeholder interno só para unicidade; pending cpf; NÃO usar CPF do responsável

Current corrupted patients: 7474
Independent references: 0
Backup verified: YES (sha256 inalterado)
Restore test: PASS (fase 03)

Tests: PASS (43)
Build: PASS

Production patient mutations: ZERO
Supabase writes: ZERO
Migrations: ZERO
Rollout changes: ZERO
Contracts pilot: PAUSED

Remaining blockers: generatePlaceholderCpf ainda parece CPF real (unicidade local; marcado pending). Código ainda não commitado/publicado.

Decision: HARD STOP operacional — sem DELETE/reimport/commit
Gate: READY_FOR_CORRUPTED_BATCH_RESET_APPROVAL
```
