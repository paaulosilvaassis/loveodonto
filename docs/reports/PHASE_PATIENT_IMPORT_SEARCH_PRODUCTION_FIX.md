# PHASE_PATIENT_IMPORT_SEARCH_PRODUCTION_FIX

Data: 2026-08-13  
Ambiente auditado: produção `https://loveodonto.com.br/`  
Supabase production: `uoepkwhqztmsjnzirpev`  
Tenant piloto: `b721c2c9-d924-41ee-8911-dc00c8208326`  
Clínica: Implanprime / IP ODONTOLOGIA E ESTETICA  

Piloto Contracts V2: **permanece pausado**. PHASE_10.21AL **não** foi retomada.

Nenhum dado clínico real foi alterado. Nenhuma migration foi aplicada. RLS/tenant_id/rollout **não** foram alterados. Nenhuma reimportação foi executada.

---

## Resumo executivo

A mensagem de “importação concluída” é **UI_SUCCESS** no IndexedDB do browser. Não existe tabela `patients` (nem correlatas) no Postgres de produção. Os pacientes importados **não** estão no backend Supabase.

O texto **"Escopo: Todos os pacientes (sem filtro)"** não existe em nenhum componente React como label de resultado. Ele entra no cadastro como `full_name` porque o mapper de headers trata qualquer coluna cujo nome **contenha** a substring `"paciente"` como `nome_completo`. A busca da Agenda renderiza `patient.name` / `full_name` via `getPatientSuggestLabel`.

Correção de código implementada (mapper + SSOT de nome civil + busca).  
Registros já gravados no IndexedDB do browser da clínica **não** foram reparados.

---

## Import source

Fluxo oficial (único):

| Etapa | Arquivo / função |
|---|---|
| UI | `src/components/ImportExportModal.jsx`, `ImportExportCard.jsx`, `src/context/ImportJobContext.jsx` |
| Parser | `parseCsvText` / `parseXlsxFile` — `src/services/csvXlsxUtils.js` |
| Mapper | `getCanonicalHeaderMap`, `normalizeParsedRows` |
| Normalização / payload | `rowToPayload` — `src/services/importPatientService.js` |
| Persistência | `createPatientsFromImportBatch` / `createPatientFromImport` — `src/services/patientService.js` |
| Storage final | IndexedDB via `src/db/index.js` (`db.patients`) |
| Log | `logImportExport` → `db.importExportLogs` (também IndexedDB) |
| Endpoint / API | **não há** |
| Tabela Postgres | **não existe em produção** |
| Repository V3 | flags `PATIENTS_*` todas `false`; `patientService` não consome `patientRepository` |
| Identidade | CPF normalizado (`ensureCpfUnique`) |
| Nome civil persistido | `patients.full_name` |
| Deduplicação | CPF no DB; até esta fase, CPF repetido **no mesmo arquivo/batch** gerava segundo paciente com CPF placeholder |

`logImportExport` grava `success: true` com `count = created + updated + merged`, independentemente de `duplicateSkipped` / `ignored`. Isso reforça UI_SUCCESS ≠ persistência completa e ≠ backend.

---

## Contagens da importação do piloto

O arquivo original **não** está neste repositório. Os logs de importação estão no IndexedDB do browser da clínica, inacessível nesta auditoria.

| Métrica | Valor |
|---|---|
| Rows processed (arquivo) | **NOT FOUND** (planilha e `importExportLogs` só no browser) |
| Rows persisted | **NOT FOUND** no backend. Persistência efetiva = IndexedDB local |
| Rows rejected | **NOT FOUND** |
| Duplicates suspected | **NOT FOUND** no backend; no client, CPF repetido no mesmo batch era reescrito com placeholder (código confirmado) |
| Duplicates confirmed | **NOT FOUND** (sem tabela remota; IDB não inspecionado) |

Produção Postgres (READ-ONLY):

```
information_schema: 0 tabelas com nome patient/paciente
public.tenants: 1 linha = b721c2c9-d924-41ee-8911-dc00c8208326 (active)
```

---

## Production patient storage

**IndexedDB (browser) = SSOT operacional atual.**

Supabase production:

- Sem `public.patients`
- Sem `patient_phones`, `patient_documents`, etc.
- Flags Patients V3 locked OFF em produção (`patientRepositoryFlags.ts`)

IMPORT_SUCCESS (backend): **não aplicável** — não há destino remoto.  
UI_SUCCESS: toast/job `DONE` após escrita IndexedDB.

---

## Tenant isolation

Código de escrita: `resolveTenantIdForWrite(user)` — tenant da sessão, sem fallback para outra clínica (`tenantWriteGuard.js`).

Filtro de busca: `filterPatientsByTenant` em `searchPatients` / `suggestPatients`.

Produção Postgres: o tenant piloto existe e é o único em `public.tenants`.

Registros importados: se o usuário estava autenticado no tenant piloto, `tenant_id` gravado no IndexedDB deve ser `b721c2c9-d924-41ee-8911-dc00c8208326`. **Não confirmável remotamente** (dados só no browser).

- Sem tenant no backend: **NOT APPLICABLE** (não há linhas remotas)
- Tenant errado no backend: **NOT FOUND**
- Somente IndexedDB: **CONFIRMED**
- Somente backend: **NOT FOUND**
- Invisível por RLS: **NOT APPLICABLE** (tabela inexistente)

Nenhum `tenant_id` foi alterado.

---

## Name SSOT

Oficial: `resolvePatientFullName` em `src/utils/patientIdentity.js`.

Ordem: `full_name` / `nomeCompleto` → `name` → `social_name` → `nickname` (último).  
Nickname **não** substitui nome civil quando o civil existe.

Persistido na importação: `patients.full_name`.  
Hidratado: objeto flat IndexedDB (`getPatient` expõe `profile`).  
Busca (antes): `full_name`, `nickname`, `social_name` sem fold de acento; **incluía** o texto de escopo.  
Busca (depois): `patientSearchNameCandidates` + `foldPatientSearchText`; ignora metadado de escopo.  
Agenda renderiza: `getPatientSuggestLabel` → agora delega a `resolvePatientFullName`.

O resultado da busca **não** deve usar texto de escopo como nome. Prova: a string não existe como UI; o título do item é `getPatientSuggestLabel(item)` em:

- `AppointmentStep1PatientSearchModal.jsx` (Agenda → Novo Agendamento → Nome do Paciente)
- `CreateAppointmentPanel.jsx`
- `AppointmentDetailsModal.jsx`
- `PatientsPage.jsx` (`item.name` do DTO de `suggestPatients`)
- `PatientQuickCreateModal.jsx` (agora `resolvePatientFullName`)

Consumidores compartilhados do SSOT de busca: `suggestPatients` / `searchPatients` em `patientService.js`. CRM (`ConvertLeadToPatientModal`, `RegisterPatientFromLeadModal`) usa `searchPatients` por CPF/telefone, não o dropdown de nome. Central do Paciente não busca lista; resolve por `patientId`.

---

## Search SSOT

`suggestPatients(type, query, limit, tenantId)` — IndexedDB, debounce 300ms, mínimo 2 caracteres para nome.

DTO:

```
{ id, name, full_name, cpfMasked, phoneLabel, birthDate, status }
```

`name` era `full_name || nickname || social_name`. Se `full_name` = texto de escopo, o título do resultado era exatamente essa string, com CPF mascarado abaixo.

---

## Root causes

### IMPORT ROOT CAUSE: CONFIRMED

`getCanonicalHeaderMap` fazia match por substring:

```js
aliases.some((a) => a === n || n.includes(a) || a.includes(n))
```

Alias `paciente` de `nome_completo` casa com o header  
`Escopo: Todos os pacientes (sem filtro)`.

`normalizeParsedRows` usa first-non-empty: se essa coluna vem antes de “Nome Completo”, o valor de escopo **vence** e o nome civil é descartado.

Linha-título no XLSX/CSV (primeira row = escopo) virava header da planilha.

Prova: `src/services/csvXlsxUtils.js` (código anterior) + testes em `csvXlsxHeaderMap.test.js`.

### SEARCH ROOT CAUSE: CONFIRMED

Busca lê IndexedDB e compara `full_name.includes(query)`.

- Iniciais do nome real **não batem** se `full_name` for o texto de escopo.
- Iniciais que ocorrem em “Escopo/Todos/pacientes/filtro” (ex.: `pa`, `to`, `es`) devolvem os registros com o texto de escopo como título.

Não há API remota de busca. Não é RLS.

### DISPLAY ROOT CAUSE: CONFIRMED

`getPatientSuggestLabel` preferia `patient.name`.  
`suggestPatients` copiava `full_name` para `name`.  
O modal da Agenda só imprime esse label + CPF mascarado.

A string de escopo **não** é label de filtro da UI.

### TENANT ROOT CAUSE: NOT FOUND

O isolamento de escrita/leitura por `tenant_id` da sessão está no código. O tenant piloto existe em produção. Não há evidência de pacientes gravados em outro tenant no backend (não há tabela).

### SYNC ROOT CAUSE: CONFIRMED

Importação e busca são IndexedDB-only. Dual-write/read de pacientes está desligado e **não há tabela remota**. Reload no **mesmo** browser mantém os dados. Outro dispositivo / outro perfil de browser = lista vazia. Isso não é falha de sync: sync remoto **não existe**.

---

## Duplicidade (antes de qualquer correção de dados)

| Critério | Resultado |
|---|---|
| duplicates suspected | Código permitia 2º paciente no mesmo arquivo com o mesmo CPF, via `generatePlaceholderCpf()` no batch |
| duplicates confirmed | NOT FOUND (IDB da clínica não lido; backend sem tabela) |
| orphan records | NOT FOUND |
| invalid names | CONFIRMED no código: `full_name` pode ser texto de escopo |
| missing tenant | NOT FOUND no backend |
| missing patientId | NOT FOUND no fluxo de suggest (`filter((row) => row.id)`) |

Nenhuma deduplicação automática foi executada.

---

## Correção de código implementada

Menor correção estrutural, sem mutation de dados reais:

1. Mapper: aliases curtos `nome` / `paciente` só por match exato; headers de metadado não mapeiam para `nome_completo`; valores de escopo descartados; CSV/XLSX detectam linha-título.
2. Import: nome civil ignora metadado; CPF repetido no mesmo arquivo → `DUPLICATE_SKIPPED` (não cria placeholder).
3. SSOT: `isPatientMetadataName`, `foldPatientSearchText`, `patientSearchNameCandidates`; `resolvePatientFullName` ignora escopo.
4. `getPatientSuggestLabel` usa `resolvePatientFullName`.
5. `suggestPatients` / `searchPatients`: busca case-insensitive com fold de acento; DTO `name` = nome civil; tenant filter inalterado.
6. `PatientsPage` e `PatientQuickCreateModal` passam a usar o SSOT de nome.

Dados reais: **não mutados**.

### Plano de reparo (NÃO executado — exige autorização)

Idempotente, tenant-scoped, sem criar duplicata:

1. Deploy deste código.
2. Paulo confirma no mesmo browser da importação (IndexedDB intacto).
3. Reimportar a **mesma** planilha em modo `Atualizar por CPF` (`conflictMode = update_cpf`), **depois** do mapper corrigido.
4. Isso reescreve `full_name` pelo nome civil real nas linhas com CPF válido já existente.
5. **Não** usar modo “Criar novo”.
6. Pacientes sem CPF válido / com CPF placeholder **não** serão atualizados por esse caminho — exigir listagem e decisão linha a linha.

Parar aqui até o Paulo autorizar o passo 3.

---

## Relatório pedido

```
Import source: IndexedDB local (CSV/XLSX → importPatientService → patientService). Sem API/tabela Postgres.
Rows processed: NOT FOUND (arquivo e logs só no browser)
Rows persisted: NOT FOUND no backend; IndexedDB = destino real
Rows rejected: NOT FOUND
Duplicates suspected: sim, no código (CPF repetido no batch → placeholder) — corrigido daqui em diante
Duplicates confirmed: NOT FOUND

Production patient storage: IndexedDB only. 0 tabelas patient* no Postgres production.
Tenant isolation: código tenant-scoped; único tenant em public.tenants = piloto. Dados importados não estão no Postgres.

Name SSOT: resolvePatientFullName (full_name civil; nickname último; metadado de escopo rejeitado)
Search SSOT: suggestPatients / searchPatients (IndexedDB, tenantId da sessão)

Import root cause: CONFIRMED
Search root cause: CONFIRMED
Display root cause: CONFIRMED
Tenant root cause: NOT FOUND
Sync root cause: CONFIRMED (não há sync remoto de pacientes)

Files/functions involved:
- src/services/csvXlsxUtils.js (getCanonicalHeaderMap, normalizeParsedRows, parseCsvText, parseXlsxFile)
- src/services/importPatientService.js (rowToPayload, isRowValidForImport, queuedCpfs)
- src/services/patientService.js (suggestPatients, searchPatients, createPatientsFromImportBatch)
- src/utils/patientIdentity.js
- src/utils/patientSuggestHelpers.js
- src/components/agenda/AppointmentStep1PatientSearchModal.jsx (consumidor; sem patch local)
- src/pages/PatientsPage.jsx
- src/components/PatientQuickCreateModal.jsx

Data repair required: YES (IndexedDB da clínica — nomes civis possivelmente sobrescritos)
Migration required: NO (não aplicar patients core nesta fase)

Fix implemented: YES (código)
Data mutated: NO

Tests: PASS (39) — csvXlsxHeaderMap, patientImportSearchProductionFix, patientSuggestHelpers, importPatients, agendaPatientSearch, phase1021r identity
Build: PASS (vite build)
Deploy required: YES — autorizado na fase B
Deploy status: IN_PROGRESS
Secrets: check no diff da correção; nenhum secret adicionado

Production search retest: PENDENTE (Paulo, após deploy)
Agenda selector: PENDENTE
Patient search: PENDENTE
Reload: PENDENTE (mesmo browser)

Contracts V2 impact: nenhum (módulo pacientes IndexedDB; rollout não tocado)
Rollout changed: NO
External communication: NO
```

---

## Severidade

- **Critical:** nome civil substituído por metadado de planilha; busca da Agenda inutilizável para agendar; UI_SUCCESS sem persistência backend.
- **High:** pacientes só no browser; sem backup Postgres; CPF duplicado no arquivo gerava segundo cadastro (corrigido no código).
- **Medium:** busca sem fold de acento (corrigido); `logImportExport` marca sucesso mesmo com linhas ignoradas.
- **Low:** chunks grandes no build (pré-existente).

---

## Remaining blockers

1. Deploy do código para produção.
2. Autorização do Paulo para reparo `update_cpf` com a planilha original.
3. Teste manual: Agenda → Novo Agendamento → buscar paciente importado.
4. PHASE_10.21AL continua pausada até o Paulo confirmar a busca.

---

## Decision

Código corrigido e coberto por testes. Dados reais **não** tocados.

---

## Gate (auditoria)

**BLOCKED_WAITING_PATIENT_DATA_REPAIR_APPROVAL** — suspenso para a fase B: Paulo autorizou somente commit/push/deploy do código. Reparo de dados **não** autorizado.

---

## PHASE B — Controlled deploy (2026-08-13)

Autorização humana: commit + push + deploy da correção de código **somente**.  
Não autorizado: reparo, reimportação, `update_cpf`, mutation IndexedDB, SQL, RLS, tenant, rollout, PHASE_10.21AL.

### Pre-deploy scope

Diff revisado. Inclui apenas mapper, busca compartilhada, SSOT de nome civil, deduplicação de CPF no arquivo, consumidores de label e testes/relatório desta fase.  
Regressão evitada: `PatientsPage.jsx` mantém imports de `formatCep` / `formatCpf` / `formatPhone` / `onlyDigits`.

Teste explícito da planilha real: header `"Escopo: Todos os pacientes (sem filtro)"` + coluna `Nome Completo` → `full_name` persistido = nome civil, nunca o texto de escopo. Aliases legítimos (`Nome`, `Paciente`, `Nome do Paciente`, `Nome Completo do Paciente`, `Nome do Titular`, `full name`) continuam mapeando para `nome_completo`.

### PHASE B registro

```
Root cause: mapper substring "paciente" gravava metadado de escopo em full_name; busca/Agenda renderizavam esse campo.
Fix: header match seguro + rejeição de metadado; suggestPatients/searchPatients com nome civil + accent fold; CPF repetido no arquivo = DUPLICATE_SKIPPED.
Files changed:
- src/services/csvXlsxUtils.js
- src/services/importPatientService.js
- src/services/patientService.js
- src/utils/patientIdentity.js
- src/utils/patientSuggestHelpers.js
- src/pages/PatientsPage.jsx
- src/components/PatientQuickCreateModal.jsx
- src/__tests__/csvXlsxHeaderMap.test.js
- src/__tests__/patientImportSearchProductionFix.test.js
- src/__tests__/patientSuggestHelpers.test.js
- docs/reports/PHASE_PATIENT_IMPORT_SEARCH_PRODUCTION_FIX.md
Tests: PASS (39)
Build: PASS
Commit: (preenchido após git)
Push: (preenchido após git)
Deploy: (preenchido após Vercel)
Production health: (preenchido após HTTP)
Patient data mutated: NO
Reimport performed: NO
IndexedDB repair performed: NO
Contracts rollout changed: NO
Contracts pilot status: PAUSED
Manual validation: PENDING_PAULO
Gate: AWAITING_PATIENT_SEARCH_MANUAL_VALIDATION
```

HARD STOP após deploy: aguardar teste do Paulo no mesmo browser. Não retomar PHASE_10.21AL. Não reimportar. Não executar update_cpf.
