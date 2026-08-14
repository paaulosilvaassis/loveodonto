# PHASE_PATIENT_IMPORT_REPAIR_01

Data: 2026-08-13  
Produção: https://loveodonto.com.br/  
Tenant: `b721c2c9-d924-41ee-8911-dc00c8208326` (Implanprime)  
Planilha original (não modificada): `~/Downloads/ControleODONTO - Pacientes.xlsx`  
IndexedDB lido (read-only): Chrome Default, origin `https://loveodonto.com.br`, store `patients` (blob `179`)

**Apply: NÃO EXECUTADO.**  
**Reimportação: NÃO.**  
**Supabase / RLS / rollout / PHASE_10.21AL: inalterados.**

Auditoria sanitizada (CPF mascarado, fora do Git):

`~/Desktop/loveodonto-snapshots/PHASE_PATIENT_IMPORT_REPAIR_01_idb_audit.json`

---

## FASE A — IndexedDB (provado, read-only)

Os 7.474 pacientes estão no blob externo do Chrome (não inline no LevelDB). Nenhuma escrita foi feita.

| Métrica | Valor |
|---|---|
| Total de pacientes | **7474** |
| Tenant Implanprime | **7474** (0 de outro tenant) |
| Nome =/contém `Escopo: Todos os pacientes (sem filtro)` | **2** |
| CPF válido (checksum) | **7474** |
| CPF duplicado no IDB | **0 chaves** |
| CPF placeholder (padrão do gerador, inicia em `1`) | **7405** |
| Sem CPF | **0** |
| Nome civil verdadeiro | **0** |
| Nomes corrompidos | **7474** |

Histogram de `full_name`:

| Nome persistido | Qtd |
|---|---|
| `9766 - IP Odontologia e Estética` | 7466 |
| linha de geração do export (3733 registros) | 2 |
| `Filtros aplicados` | 2 |
| `Escopo: Todos os pacientes (sem filtro)` | 2 |
| `Unidade de Origem` | 2 |

7466 + 2 + 2 + 2 + 2 = 7474.

`created_at` (UTC) prova duas execuções **create**, não update:

| Minuto UTC | Qtd | Equivale (BRT) |
|---|---|---|
| 2026-08-13T15:16 | 3737 | 12:16 — 1ª importação |
| 2026-08-13T15:20 | 800 | |
| 2026-08-13T15:21 | 2400 | 12:21–12:22 — 2ª importação |
| 2026-08-13T15:22 | 537 | |

800 + 2400 + 537 = **3737**. Duas levas idênticas. A segunda **não** atualizou a primeira: cada linha ganhou ID novo e CPF placeholder novo.

Os 3737 de cada log UI estão presentes **duas vezes** (3737 × 2 = 7474).

Exemplos corrompidos (CPF mascarado):

1. `Escopo: Todos os pacientes (sem filtro)` — `196.***.***-23`
2. `9766 - IP Odontologia e Estética` — `187.***.***-41`
3. `Filtros aplicados` — `199.***.***-51`
4. `Unidade de Origem` — `104.***.***-30`
5. `IP Odontologia e Estética · 3733 registro(s) · gerado em 11/08/2026 11:31` — `127.***.***-08`

Interseção CPF IDB ∩ coluna `CPF` da planilha: **0**.  
Interseção CPF IDB ∩ `CPF Responsável`: **0**.

---

## FASE B — Planilha original (não modificada)

Header real: linha 7 (0-based).  
Nome civil: coluna `Nome Completo`.  
Identidade do reparo: coluna `CPF` (não usar `CPF Responsável`).

| | |
|---|---|
| Linhas de dados | 3733 |
| CPF válido | 3387 |
| CPF válido único | 3385 |
| CPF duplicado na planilha | 2 chaves (4 linhas) |
| CPF ausente | 346 |
| CPF inválido | 0 |
| Encontráveis no IDB por CPF | **0** |
| WOULD_UPDATE (fail-closed) | **0** |
| WOULD_SKIP | **3733** |
| WOULD_CREATE (fail-closed) | **0** |
| Stock `update_cpf` criaria | **3383** |

---

## Dry-run obrigatório

```
TOTAL_PLANILHA=3733
MATCH_EXACT_BY_CPF=0
WOULD_UPDATE=0
WOULD_CREATE=0
WOULD_SKIP=3733
CPF_CONFLICTS=4
CORRUPTED_NAMES_FOUND=7474
DUPLICATES_FOUND=5 (nomes metadado; 7466 nomes de unidade duplicados entre as duas levas)
```

Stock `importFromCsvOrXlsx(..., 'update_cpf')`:

```
WOULD_CREATE=3383  → HARD STOP
```

---

## FASE C — Plano (desenhado, não aplicado)

Fail-closed, tenant-scoped, CPF-based, idempotente:

- 0 match → SKIP
- 1 match → UPDATE preservando `patient.id`
- >1 match → CONFLICT

Esse plano **não consegue reparar este IndexedDB**, porque a identidade CPF da planilha **não foi persistida**. Os 7474 CPFs são placeholders únicos.

Parear por ordem de `created_at` / posição no array **não** é CPF-based, é ambíguo com duas levas, e **não foi autorizado nesta fase**.

Apagar a segunda leva é **proibido**.

---

## APPLY

**NÃO EXECUTADO.**

Backup: não gerado (não houve mutation).  
Rollback: N/A.

---

## Relatório pedido

```
IndexedDB patient count before: 7474
Implanprime patient count before: 7474
Import rows: 3733 civis na planilha; logs UI 3737+3737
Corrupted names before: 7474
Exact CPF matches: 0
CPF conflicts: 4 linhas na planilha (2 chaves duplicadas)
Missing CPF: 346 na planilha; 0 no IDB
Would create: 0 no reparo fail-closed; 3383 no update_cpf oficial → bloqueado
Updated: 0
Skipped: 3733
Created: 0
Duplicates before: SIM — 2 creates (3737+3737). CPF único; nomes duplicados
Duplicates after: N/A
Corrupted names after: N/A
Search PAULO: FAIL (confirmado; nenhum nome civil persistido)
Agenda suggest: N/A pós-reparo
Patient search: N/A pós-reparo
Persistence after reload: N/A
Tenant isolation: 7474/7474 no tenant Implanprime
Backup: NÃO (sem mutation)
Rollback available: N/A
Tests: PASS (32)
Build: PASS
Production Supabase writes: NO
Migrations: NO
Rollout changes: NO
Contracts pilot: PAUSED
Errors: nenhum na auditoria read-only
Remaining blockers: identidade CPF ausente nos registros já gravados; duas levas create; update_cpf oficial criaria 3383 pacientes
Decision: HARD STOP — não aplicar update_cpf; não reimportar create; não apagar duplicatas
Gate: BLOCKED_STOCK_UPDATE_CPF_WOULD_CREATE
```

PHASE_10.21AL permanece **pausada**.

Próximo reparo exige autorização explícita do Paulo para uma estratégia **que não seja CPF match** (porque MATCH=0). Candidata, ainda fail-closed e sem CREATE/DELETE: UPDATE apenas da 1ª leva por ordem estável do array, deixando a 2ª leva intacta até decisão de duplicatas. **Não executar sem autorização.**
