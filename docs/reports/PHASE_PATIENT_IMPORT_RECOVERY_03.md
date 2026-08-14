# PHASE_PATIENT_IMPORT_RECOVERY_03

Data: 2026-08-13  
Origin: https://loveodonto.com.br/  
Tenant: `b721c2c9-d924-41ee-8911-dc00c8208326`  
Código publicado: `3352f8f`  
Planilha: `~/Downloads/ControleODONTO - Pacientes.xlsx` (não modificada)

**ZERO DELETE. ZERO REIMPORT.**  
PHASE_10.21AL permanece **pausada**.

---

## FASE A — Provenance PASS

Todos os 7474 registros pertencem exclusivamente às duas importações de 13/08/2026.

| Evidência | Resultado |
|---|---|
| Total | 7474 |
| BATCH_1 | 3737 (idx 0–3736, `created_at` 15:16 UTC) |
| BATCH_2 | 3737 (idx 3737–7473, `created_at` 15:20–15:22 UTC) |
| Fora da janela | 0 |
| Nomes civis | 0 |
| Nomes corrompidos | 7474 |
| `sex=N` / `birth_date=1990-01-01` | 7474 / 7474 |
| `record_number` 00000001–00007474 | sim, único, na ordem |
| Tenant Implanprime | 7474 |
| Logs IMPORT xlsx 3737+3737 | coincidem |

```
PREEXISTING_MANUAL_PATIENTS = 0
PATIENTS_OUTSIDE_BATCH_1_2 = 0
```

---

## FASE B — Relationship gate PASS (independentes)

Varredura de **176** stores do IndexedDB por `patient-<uuid>` intersectando os 7474 IDs.

Referências **independentes** (agenda, financeiro, contratos, CRM, odontograma, documentos clínicos, comunicações, tasks, assinaturas): **0**.

Satélites **1:1 criados pelo próprio import** (não são vínculo clínico):

| Store | n | refs |
|---|---|---|
| patientDocuments | 7474 | 7474 |
| patientBirth | 7474 | 7474 |
| patientEducation | 7474 | 7474 |
| patientRelationships | 7474 | 7474 |
| patientActivitySummary | 7474 | 7474 |
| patientRecords | 7474 | 7474 |
| patientPhones / Addresses / Insurances | 0 | 0 |

```
REFERENCED_PATIENT_IDS_COUNT (independentes) = 0
```

Um reset futuro deve apagar os 7474 `patients` **e** as linhas satélite desses IDs. Não usar `clear()` da database inteira.

---

## FASE C — Backup PASS

Arquivo (fora do Git, contém dados do IDB):

`~/Desktop/loveodonto-snapshots/PHASE_PATIENT_IMPORT_RECOVERY_03_backup_7474.pkl.gz`

| | |
|---|---|
| Timestamp | 2026-08-13 13:29 BRT |
| Bytes | 1 733 931 |
| file SHA-256 | `bab9624d427daba6b50ab4a1ac9988022ca915d4d6d4b97899c80419af092791` |
| id SHA-256 (7474 ids) | `6cd5437e2478d24fd350727c5aa0c8e662b4437f7535cc41a7b597297e35a0eb` |
| BACKUP_RECORDS | **7474** |
| BACKUP_VERIFIED | **YES** |

Stores no backup: patients + 6 satélites 7474 + phones/addresses/insurances vazios.

---

## FASE D — Restore test PASS

Descompressão + `pickle.loads` em memória.  
IDs e contagens idênticos ao snapshot.  
**Não** gravado de volta no Chrome/produção.

```
RESTORE_TEST = PASS
```

---

## FASE E — Mapper corrigido (metadata) PASS

`parseXlsxFile` atual detecta o header real (linha 7). Linhas 0–6 não viram pacientes.

| | |
|---|---|
| Linhas após header | 3733 |
| Metadata importada como paciente | **0** |
| Escopo / Filtros / Unidade de Origem / linha de geração | **0** |
| Nomes civis | 3733 (ex.: João Victor da Costa Pereira) |
| Linhas com “Paulo” no nome | 53 |
| Telefone/celular | 226 / 3453 |
| Email | 2392 |
| Nascimento | 3461 |
| Endereço/cidade | 2923 / 2923 |

---

## FASE F — CPF: bloqueio do reimport

Comportamento **atual** em modo `create`:

- CPF duplicado **no arquivo** → `DUPLICATE_SKIPPED` (não sobrescreve).
- CPF já no DB → `ensureCpfUnique` / skip (após reset o DB estaria vazio).
- CPF ausente → `generatePlaceholderCpf()` (CPF com checksum válido, prefixo `1`). Não é identidade civil; parece CPF real.

**Defeito no mapper atual:** alias substring `cpf` mapeia também `CPF Responsável` → `cpf`.

| | Coluna `CPF` | Após mapper |
|---|---|---|
| CPF válido | 3387 | 3438 |
| Sem CPF | 346 | 295 |
| Preenchido com CPF do responsável | — | **51** |
| Skips por duplicata no arquivo | 2 chaves / 4 linhas (coluna CPF) | **37** (14 da coluna CPF + 23 induzidos pelo responsável) |

Gravar CPF de responsável como identidade do paciente é inaceitável.

---

## FASE G — Dry-run

```
CURRENT_CORRUPTED_PATIENTS=7474
CURRENT_REFERENCED_PATIENTS=0

SPREADSHEET_CIVIL_ROWS=3733
VALID_ROWS=3733
INVALID_ROWS=0
METADATA_ROWS_SKIPPED=4
CPF_VALID=3438   (inflado pelo CPF Responsável; coluna CPF pura=3387)
CPF_MISSING=295  (coluna CPF pura=346)
CPF_CONFLICT_ROWS=37
WOULD_CREATE=3696
WOULD_SKIP=37
WOULD_DUPLICATE=37
```

WOULD_CREATE **não** é 3733. 51 identidades usariam CPF de responsável.

---

## FASE H — Checkpoint humano

Não apagar. Não reimportar.

O reset dos 7474 seria **provenientemente seguro**.  
O reimport com o mapper **publicado hoje não é seguro**.

---

## Relatório pedido

```
Provenance: PASS — 7474 = BATCH_1 + BATCH_2
Preexisting manual patients: 0
Outside corrupted batches: 0
Referenced patient IDs: 0 independentes (7474 só em satélites 1:1 do import)

Backup: ~/Desktop/loveodonto-snapshots/PHASE_PATIENT_IMPORT_RECOVERY_03_backup_7474.pkl.gz
Backup records: 7474
Backup verified: YES
Restore test: PASS

Spreadsheet dry-run:
Civil rows: 3733
Metadata skipped: 4
Valid: 3733
Invalid: 0
CPF valid: 3438 mapped / 3387 coluna CPF
CPF missing: 295 mapped / 346 coluna CPF
CPF conflicts: 37 mapped
Would create: 3696
Would skip: 37

Mapper current: header real OK; metadata não vira paciente
Metadata protection: PASS
CPF Responsável alias: FAIL (51 fills + 23 skips extras)

Delete candidate count: 7474 patients + satélites 1:1 dos mesmos IDs

Decision: HARD STOP — sem DELETE, sem reimport
Gate: BLOCKED
```

**Motivo do BLOCKED:** o mapper ainda promove `CPF Responsável` a `cpf`. Autorizar DELETE+reimport agora criaria identidades erradas.

Caminho depois da correção (exact-match da coluna `CPF`, como já foi feito para `nome`/`paciente`): novo dry-run → `WOULD_CREATE` alinhado à coluna CPF → aí sim pedir `READY_FOR_CORRUPTED_BATCH_RESET_APPROVAL`.
