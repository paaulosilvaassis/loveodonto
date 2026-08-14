# PHASE_PATIENT_IMPORT_REPAIR_02

Data: 2026-08-13  
Produção: https://loveodonto.com.br/  
Tenant: `b721c2c9-d924-41ee-8911-dc00c8208326`  
Código que executou as importações: `a1a7584` (anterior a `3352f8f`, commitado só às 12:36 BRT)  
Importações: 12:16:34 e 12:22:17 BRT  

**ZERO MUTATIONS. APPLY NÃO EXECUTADO.**  
PHASE_10.21AL permanece **pausada**.

---

## FASE A — Pipeline original (provado)

Arquivo XLSX: `sheet_to_json({ defval: '', raw: false })` — primeira linha vira header.

Planilha AoA: 3741 linhas. Linha 0 = `Pacientes Exportados`. Linhas vazias 1, 3 e 6 omitidas. Restam **3737** objetos.

`getCanonicalHeaderMap` (versão antiga, substring):

- `Pacientes Exportados` contém alias `paciente` → `nome_completo`
- colunas reais (`Nome Completo`, `CPF`, `Telefones`, …) viraram `__EMPTY_*` e **não** entram em `rowToPayload`

`isRowValidForImport`: qualquer `nome_completo` não vazio passa. As 3737 passaram. `ignored = 0`.

`createPatientsFromImportBatch` (BATCH=200): `db.patients.push` na ordem do loop. IDs `createId('patient')`. CPF inválido/ausente → `generatePlaceholderCpf()`. `created_at = new Date().toISOString()`. Log: `count = created`.

Prova:

```
3733 CIVIS (nome de unidade na col 0)
+ 4 METADATA
= 3737 por execução
```

As 4 linhas extras, na ordem persistida (ambas as levas):

1. `IP Odontologia e Estética · 3733 registro(s) · gerado em 11/08/2026 11:31`
2. `Filtros aplicados`
3. `Escopo: Todos os pacientes (sem filtro)`
4. `Unidade de Origem`

Classificação: **NON_PATIENT_METADATA**. Não deletar nesta fase.

---

## FASE B — Duas levas

Separação determinística (todas concordam):

| | BATCH_1 | BATCH_2 |
|---|---|---|
| Índice no array `patients` | 0–3736 | 3737–7473 |
| `created_at` UTC | 15:16 (flushes de 200) | 15:20–15:22 (flushes de 200) |
| `record_number` | 00000001–00003737 | 00003738–00007474 |
| Log IMPORT xlsx | 15:16:34.739Z count=3737 | 15:22:17.160Z count=3737 |

`patients` = concatenação `[BATCH_1][BATCH_2]`. Sem intercalação.

Equivalência posicional BATCH_1[N] vs BATCH_2[N]:

```
BATCH_POSITION_EQUIVALENCE_PERCENT=100
```

Isso é tautológico: sexo=`N`, nascimento=`1990-01-01`, email/telefone/endereço **vazios** nos dois lados. Não distingue pessoas.

Stores relacionados:

- `patientPhones` = 0
- `patientAddresses` = 0
- `patientInsurances` = 0
- documents/birth/education: 7474 linhas default (Brasil, sem cidade, sem e-mail, sem RG)

Agenda / prontuário / CRM / documentos clínicos referenciando esses IDs: **0**.

---

## FASE C — Fingerprint

Campos simultâneos planilha ∩ IndexedDB com valor **não corrompido e não default**: **nenhum**.

Planilha tem Telefones, Celulares, Email, Cidade, Data Nascimento — o mapper antigo descartou todos (`__EMPTY_*` fora de `rowToPayload`).

No IDB, fingerprint (dob+phone+email+city) é vazio/default para os 7474.

```
UNIQUE_MATCH=0
AMBIGUOUS_MATCH=0
NO_MATCH=3733
```

Referência (só planilha, não usável contra o IDB): 3642 linhas com algum campo fingerprint; 3601 chaves únicas; 41 linhas ambíguas; 91 sem fingerprint.

---

## FASE D — Ordem

O pipeline é order-preserving (sem sort; flush sequencial; push). Os 4 metadados do IDB batem **exatamente** com os 4 primeiros objetos do `sheet_to_json` antigo. As 3733 civis seguintes têm o **mesmo** `full_name` de unidade, então nome não valida posição.

```
ROW_ORDER_MATCH (nomes civis vs IDB)=impossível (0 nomes civis persistidos)
FINGERPRINT_UNIQUE_MATCH=0/3733
PIPELINE_ORDER_CONSISTENT_WITH_METADATA_PREFIX=YES
```

Ordem isolada **não** é identidade. Risco residual de A↔B se houver qualquer reordenação indetectável (todos os campos persistidos são idênticos).

Nº Prontuário da planilha tem 12 gaps e 3732 valores únicos — não coincide com `record_number` auto (metadado ocupou 00000001–00000004).

---

## FASE F — Reparo desenhado (NÃO EXECUTAR)

Se Paulo autorizar depois, apesar da confiança baixa:

- **CANONICAL_BATCH** = BATCH_1 (índices 0–3736)
- **DUPLICATE_BATCH** = BATCH_2 (3737–7473) — identificar, **não deletar**
- Civis: BATCH_1[4:3737] zip planilha linhas 8+ (3733), preservar `patient.id`, restaurar nome/CPF/telefone/nascimento/email/endereço via mapper oficial **novo**
- CPF ausente: não inventar; manter placeholder e pending
- 4 metadados × 2 levas: candidatos a remoção futura, não agora
- `WOULD_CREATE=0` `WOULD_DELETE=0`
- `WOULD_UPDATE=3733` na canonical (fail-closed: 4 linhas de CPF duplicado na planilha → CONFLICT/SKIP)

Esta fase **não recomenda** esse APPLY.

---

## Backup (próxima fase, fora do Git)

Antes de qualquer mutation:

1. Dump read-only das chaves `patients`, `patientDocuments`, `patientBirth`, `patientEducation`, `patientRecords`, `patientRelationships`, `patientActivitySummary`, `patientPhones`, `patientAddresses`, `importExportLogs`
2. Arquivo em `~/Desktop/loveodonto-snapshots/` (não versionar)
3. Integridade: SHA-256 da lista ordenada de `patient.id` + contagem 7474
4. Rollback: restaurar essas chaves no mesmo origin/profile; não limpar o IndexedDB inteiro

---

## Relatório pedido

```
Spreadsheet civil rows: 3733
Metadata rows per import: 4
Expected rows per batch: 3737
Batch 1 rows: 3737 (idx 0–3736)
Batch 2 rows: 3737 (idx 3737–7473)

Batch separation: DETERMINISTIC (created_at + array concat + record_number + logs)
Batch positional equivalence: 100% (tautológico — defaults idênticos)
Available fingerprint fields: nenhum persistido no IDB
Unique fingerprint matches: 0
Ambiguous fingerprint matches: 0
No fingerprint matches: 3733

Spreadsheet/order match: prefixo de 4 metadados SIM; civis NÃO verificáveis por fingerprint
Civil rows deterministically mapped: NÃO
Metadata records identified: 8 (4 por leva), NON_PATIENT_METADATA

Canonical batch candidate: BATCH_1 (não aplicar)
Duplicate batch candidate: BATCH_2 (não deletar)
Patients with real CPF recoverable: 3387 válidos na planilha (3383 únicos sem conflito)
Patients without CPF: 346
Spreadsheet CPF conflicts: 2 chaves / 4 linhas

Repair would UPDATE: 3733 (se autorizado; 4 conflitos SKIP)
Repair would CREATE: 0
Repair would DELETE: 0

Patient IDs preserved: sim (desenho)
Relationships preservation risk: baixo agora (0 agenda/prontuário/CRM ligados); IDs devem ser preservados

Backup strategy: dump completo das chaves patient_* fora do Git antes do APPLY
Rollback strategy: restaurar o dump no mesmo origin

Confidence: CONFIDENCE_LOW
Reason: sem fingerprint planilha↔IDB; ordem do pipeline não prova identidade civil; risco de gravar CPF/nome de A no id de B

Production mutations: NO
Supabase writes: NO
Migrations: NO
Rollout: NO
Contracts pilot: PAUSED

Tests: PASS (32)
Build: PASS

Decision: HARD STOP — não aplicar
Gate: BLOCKED_PATIENT_IDENTITY_MAPPING_NOT_SAFE
```
