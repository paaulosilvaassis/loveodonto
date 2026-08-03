# PHASE_9_4A_WAVE3A — Patient Data Readiness Audit

**Data:** 2026-08-02  
**Escopo:** Auditoria somente-leitura dos dados IndexedDB de Pacientes antes de backfill / dual-write / cutover.  
**linkedRef:** `tckdjyunwmdpqmewrwvt`  
**remoteActionsExecuted:** `false`  
**commit realizado:** não  

---

## Status oficial

## PHASE_9_4A_WAVE3A_BLOCKED

| Campo | Valor |
|-------|--------|
| etapa | acesso aos dados locais reais (IndexedDB do browser) |
| motivo | Node não acessa IndexedDB; nenhum snapshot local real foi fornecido nesta execução |
| dados locais acessíveis | **não** (clínica / IDB real) |
| limitação | Auditor opera sobre snapshot JSON exportado; exige confirmação `LOVE_ODONTO_PATIENT_AUDIT_CONFIRMATION=LOCAL_READ_ONLY` |
| evidência | CLI sem `--snapshot` → `BLOCKED_BY_UNAVAILABLE_LOCAL_DATA`; fixture sintética usada só para validar tooling/testes |
| impacto | Gate Wave 3B **não liberado** para backfill real |
| alternativa segura | Exportar snapshot via `scripts/patients/exportIndexedDbSnapshot.browser.js` no DevTools da app local e reexecutar o CLI com `--snapshot` |
| alterações funcionais | nenhuma (services/UI/repositories/migrations intactos) |
| linkedRef preservado | `tckdjyunwmdpqmewrwvt` |
| remoteActionsExecuted | `false` |
| commit realizado | não |

**Gate Wave 3B:** `BLOCKED_BY_UNAVAILABLE_LOCAL_DATA`

---

## O que foi entregue (tooling)

| Artefato | Papel |
|----------|--------|
| `scripts/patients/patientDataAudit.mjs` | Barrel público |
| `scripts/patients/patientDataAuditMask.mjs` | Mascaramento PII + hash de IDs |
| `scripts/patients/patientDataAuditEngine.mjs` | Motor de métricas, classificação, simulação, estratégia |
| `scripts/patients/auditIndexedDbPatientData.mjs` | CLI read-only |
| `scripts/patients/exportIndexedDbSnapshot.browser.js` | Export DevTools (readonly) |
| `scripts/patients/fixtures/wave3a_synthetic_snapshot.json` | Fixture de testes (não é dado clínico) |
| `src/__tests__/phase94aWave3aPatientDataReadiness.test.js` | Cobertura Wave 3A |
| `npm run test:supabase:phase94a-wave3a` | Entrypoint de testes |

### Guards do auditor

- Exige `LOVE_ODONTO_PATIENT_AUDIT_CONFIRMATION=LOCAL_READ_ONLY`
- Lê somente snapshot / fixture
- Nunca escreve no IndexedDB / Supabase
- Nunca chama rede (`fetch` / `supabase.co` / `createClient` ausentes)
- Nunca normaliza dados automaticamente
- PII mascarada nos relatórios (CPF / telefone / e-mail / nome)
- `remoteActionsExecuted=false` sempre
- Simulação de backfill com `persisted=false`

### Como auditar dados reais (ação humana inevitável)

1. Abrir a app local no browser (onde o IndexedDB `appgestaoodonto` existe).
2. Colar `scripts/patients/exportIndexedDbSnapshot.browser.js` no DevTools Console.
3. Digitar `LOCAL_READ_ONLY` no prompt.
4. Salvar o JSON baixado.
5. Executar:

```bash
LOVE_ODONTO_PATIENT_AUDIT_CONFIRMATION=LOCAL_READ_ONLY \
  node scripts/patients/auditIndexedDbPatientData.mjs --snapshot ./love-odonto-idb-snapshot-….json
```

Até esse snapshot existir, **não inventar** totais de pacientes clínicos.

---

## BLOCO 1 — Fontes IndexedDB (mapa)

Persistência: `src/db/idbStorage.js` — DB `appgestaoodonto`, store `data`, registros `{ k, v }` (uma chave top-level por collection). SSOT atual: objeto `loadDb()`.

| Collection | Chave | patientId | tenant | Cardinalidade | Consumidores (principais) |
|------------|-------|-----------|--------|---------------|---------------------------|
| `patients` | `id` (`patient-*`) | self | `tenant_id` | 1 | `patientService`, repository IDB |
| `patientDocuments` | `patient_id` | `patient_id` | via patient | 1:1 | `patientService` |
| `patientBirth` | `patient_id` | `patient_id` | via patient | 1:1 | `patientService` |
| `patientEducation` | `patient_id` | `patient_id` | via patient | 1:1 | `patientService` |
| `patientPhones` | `id` (`phone-*`) | `patient_id` | opcional | 1:N + `is_primary` | `patientService` |
| `patientAddresses` | `id` (`addr-*`) | `patient_id` | opcional | 1:N + `is_primary` | `patientService` |
| `patientRelationships` | `patient_id` | `patient_id` | via patient | 1:1 agregado | `patientService` |
| `patientInsurances` | `id` (`ins-*`) | `patient_id` | opcional | 1:N | `patientService` |
| `patientAccess` | `patient_id` | `patient_id` | via patient | 1:1 | `patientService` |
| `patientActivitySummary` | `patient_id` | `patient_id` | via patient | 1:1 | `patientService` |
| `patientRecords` | `id` (`record-*`) | `patient_id` | opcional | 1:1 + `record_number` | `patientService` |

**Timestamps:** tipicamente ISO string `created_at` / `updated_at` no profile.  
**Legacy IDs:** `patient-*` opacos; SQL usa UUID + `legacy_id`.  
**Risco conhecido (código):** muitos ambientes locais usam `tenant_id = tenant-1` (não UUID) — incompatível com `patients.tenant_id uuid` sem mapping.

---

## BLOCO 4 — Vínculos externos auditados

Collections referenciadas pelo motor:

`appointments`, `crmLeads`, `generatedContracts`, `accountsReceivable`, `financings`, `budgets`, `patientJourneyEntries`, `patientCharts`, `patientOdontograms`, `patientOdontogramsV2`, `patientFiles`, `patientConfidentialFiles`.

Para cada uma: contagem com `patientId` válido legado, órfãos, tenant divergente, UUID inesperado, missing `patientId`.  
**Política Wave 3B:** não migrar esses vínculos ainda — preservar `patient-*` opaco.

---

## BLOCO 5 — Classificações

| Código | Significado |
|--------|-------------|
| `MIGRATION_READY` | Identidade + tenant UUID ok, sem bloqueios |
| `MIGRATION_READY_WITH_WARNINGS` | Pronto com gaps (sem telefone/endereço/prontuário, placeholder CPF, etc.) |
| `BLOCKED_INVALID_IDENTITY` | legacy id / nome / CPF inválido / legacy duplicado |
| `BLOCKED_DUPLICATE_CPF` | CPF duplicado no mesmo tenant |
| `BLOCKED_MISSING_TENANT` | `tenant_id` ausente |
| `BLOCKED_ORPHAN_LINKS` | (reservado) links órfãos críticos no profile |
| `BLOCKED_CROSS_TENANT` | satélite/link com tenant divergente |
| `BLOCKED_INVALID_CARDINALITY` | multi-primary / 1:1 duplicado |
| `MANUAL_REVIEW_REQUIRED` | tenant não-UUID (ex. `tenant-1`) e casos ambíguos |

Relatório de amostra usa **apenas** `idHash` + motivos + CPF mascarado.

---

## BLOCO 6 — Simulação de backfill (sem persistir)

Motor produz:

- `wouldInsertPatients` / `wouldSkipPatients` / `conflictPatients` / `manualReviewPatients`
- `orphanSatellites`
- ordem de inserção: patients → documents → birth → education → phones → addresses → relationships → insurances → access → activity → records
- `preserveLegacyId=true`, `generateUuid=true`
- `persisted=false` sempre

---

## BLOCO 7 — Estratégia idempotente (proposta)

| Item | Definição |
|------|-----------|
| dry-run | obrigatório antes de qualquer escrita |
| batch size | 100 |
| resume token | último `legacy_id` lexicográfico processado |
| checkpoints | `pre_validate` → `batch_N` → `post_validate` |
| mapping | arquivo/tabela local `legacy_id → uuid` (não criado nesta wave) |
| isolamento | por `tenant_id` |
| conflitos CPF | fail-closed → revisão humana |
| placeholders | aceitar com warning / `has_pending_data` |
| inválidos | skip + relatório |
| cross-tenant | bloquear batch até decisão humana |
| rollback | soft-delete (`deleted_at`) do batch + restore checkpoint do mapping |
| reexecução | upsert lógico por `(tenant_id, legacy_id)` onde `deleted_at is null` |
| vínculos externos | **não** reescrever na Wave 3B |

Ordem: pacientes por tenant → satélites após UUID resolvido → vínculos externos depois (fase futura).

---

## Evidência sintética (tooling only — NÃO clínica)

Execução:

```bash
LOVE_ODONTO_PATIENT_AUDIT_CONFIRMATION=LOCAL_READ_ONLY \
  node scripts/patients/auditIndexedDbPatientData.mjs --synthetic
```

Resultado observado (fixture):

| Métrica | Valor |
|---------|------:|
| total pacientes | 10 |
| ativos | 9 |
| inativos | 1 |
| sem tenant | 1 |
| tenant não-UUID | 1 |
| CPF válido | 8 |
| CPF inválido | 1 |
| CPF ausente | 1 |
| CPF duplicado same-tenant | 1 |
| cross-tenant (phones/addresses) | >0 |
| órfãos (phones/docs/addrs/records) | >0 |
| cardinalidades inválidas | >0 |
| vínculos externos quebrados | >0 |
| gate (fixture) | `BLOCKED_BY_CROSS_TENANT_DATA` |
| wouldInsert | 5 |
| wouldSkip | 2 |
| conflicts | 2 |
| manualReview | 2 |
| persisted | false |

---

## Invariantes preservados

| Item | Estado |
|------|--------|
| flags Pacientes | todas `false` |
| IndexedDB SSOT | sim |
| `patientService` ligado ao repository | não |
| migrations 025 / 027 | não alteradas |
| dual-write / backfill / cutover | não iniciados |
| Supabase remoto | não tocado |
| linkedRef | `tckdjyunwmdpqmewrwvt` |
| remoteActionsExecuted | `false` |

---

## Critérios para liberar Wave 3B

Wave 3B (backfill dry-run real) só com:

1. Snapshot IDB real acessível e auditado  
2. Zero cross-tenant não resolvido  
3. Mapping de `tenant_id` legado → UUID  
4. Conflitos CPF / `record_number` inventariados  
5. Plano idempotente + rollback aceitos  
6. `remoteActionsExecuted=false` mantido até autorização explícita de escrita  

**Estado atual:** critérios 1–2 **não** satisfeitos para dados reais → **não pronto para Wave 3B**.

---

## Testes

```bash
npm run test:supabase:phase94a-wave3a
```

Cobertura: write-guard, network-guard, PII mask, conflitos, órfãos, cross-tenant, cardinalidade, simulação sem persistir, flags off, patientService intacto, migrations intactas, linkedRef.
