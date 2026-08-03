# Love Odonto V3 — RC-01 Operational Validation

**Documento:** `docs/reports/RH_RC01_OPERATIONAL_VALIDATION.md`  
**Fase:** Release Candidate — RC-01  
**Data:** 2026-06-30  
**Tipo:** Validação operacional — **nenhum código, commit, flag ou produção alterados**  
**Ambiente:** Staging Supabase `tckdjyunwmdpqmewrwvt` · Tenant `7aba7127-409c-4ea4-8dbc-807efc5e189c`  
**Produção:** `uoepkwhqztmsjnzirpev` — **não tocada**

---

## Sumário executivo

| Fase | Descrição | Resultado |
|------|-----------|-----------|
| RC-01.1 | UUID Mirror no IndexedDB real (browser staging) | **NÃO EXECUTADO** |
| RC-01.2 | RH Shadow QA pós-mirror | **FALHA parcial** — `transitionalDiffCount=4` (esperado 0) |
| RC-01.3 | Smoke manual UI RH staging | **NÃO EXECUTADO** |
| RC-01.4 | Documento de evidências | **Este documento** |

### Decisão RC-01 — Read Primary

## **NOT READY**

---

## Contexto

Encerramento da Sprint 1 de arquitetura RH V3. Objetivo RC-01: validar operacionalmente a arquitetura consolidada **sem refatoração estrutural**.

```
Services RH → collaboratorServiceReadAdapter
           → collaboratorServiceRepositoryBridge
           → collaboratorRepository
           → collaboratorIndexedDbRepository (fonte primária)
           + shadow fire-and-forget → Supabase (RH_SHADOW_READ=true)
```

**Flags staging (inalteradas):**

| Flag | Valor |
|------|-------|
| `VITE_RH_SUPABASE_READ` | `true` |
| `VITE_RH_SHADOW_READ` | `true` |
| `VITE_RH_COMPARE_IDB_SUPABASE` | `true` |
| `VITE_RH_SUPABASE_READ_PRIMARY` | **`false`** |
| `VITE_RH_SUPABASE_WRITE` | **`false`** |

---

## RC-01.1 — UUID Mirror no IndexedDB real

### Objetivo

Executar o espelhamento de `collaborator_uuid` no IndexedDB live do navegador (staging) e validar:

- 4 colaboradores atualizados
- zero conflitos
- zero erros
- zero alterações no `id` legado
- `uuid` espelhado corretamente

### Procedimento esperado

1. Abrir app staging logado no tenant `7aba7127-409c-4ea4-8dbc-807efc5e189c`
2. DevTools → Console
3. Colar conteúdo de `scripts/snippets/rh-mirror-uuid-idb-browser-snippet.js`
4. Confirmar output `[RH_UUID_MIRROR]` com `updated: 4`, `conflicts: 0`, `errors: 0`
5. Verificar no IDB (`appgestaoodonto` → store `data` → key `collaborators`) que cada registro mantém `id` legado e ganhou campo `uuid` Supabase

### Resultado

| Critério | Esperado | Obtido | Status |
|----------|----------|--------|--------|
| Colaboradores atualizados | 4 | — | **NÃO EXECUTADO** |
| Conflitos | 0 | — | **NÃO EXECUTADO** |
| Erros | 0 | — | **NÃO EXECUTADO** |
| `id` legado preservado | sim | — | **NÃO EXECUTADO** |
| `uuid` espelhado | sim | — | **NÃO EXECUTADO** |

**Motivo:** O mirror no IDB real exige sessão browser com IndexedDB do tenant staging. Esta validação não pode ser executada pelo agente CLI — depende de operador humano no navegador.

### Evidência substituta (dry-run CLI read-only)

**Comando:** `node scripts/rh-mirror-uuid-idb-qa.mjs --json`  
**Timestamp:** `2026-06-30T19:13:26.962Z`  
**Report:** `scripts/reports/rh-mirror-uuid-idb-qa-2026-06-30T19-13-26-972Z.json`

| Métrica | Valor |
|---------|-------|
| `wouldUpdate` | **4** |
| `wouldSkip` | 0 |
| `notFound` | 0 |
| `conflicts` | **0** |
| `errors` | **[]** |
| `supabaseWritesExecuted` | false |
| `dryRun` | true |

**Mapeamento previsto (legacy_id → collaborator_uuid):**

| legacy_id | uuid (Supabase) |
|-----------|-----------------|
| `col-saas-362c17b7-0abd-4d3f-8669-69c8f409b341` | `9284488d-c0b1-4200-b728-82f757aaf1e0` |
| `col-f93e5dbf-bcc0-4c6d-8f94-f90f7f46bb70` | `6eeabd6b-0a8b-4d88-8715-400e092d3212` |
| `col-6b85c4cb-345a-4cff-9636-f07ac1aea9f2` | `e3f0f230-4dfa-44f3-9f4d-41c6babcef03` |
| `col-c52fd5ce-4bc9-4c7d-a4c0-298525d401a3` | `140c5833-7fe8-429a-ace2-ba79d774d85a` |

**Estado atual do export local (`collaborators-export.json`):** registros **sem** campo `uuid` espelhado — confirmam que o mirror operacional ainda não foi aplicado na fonte usada pelo CLI shadow.

### Evidência unitária (lógica do mirror)

**Comando:** `npx vitest run src/__tests__/collaboratorUuidMirror.test.js`  
**Resultado:** 12/12 PASS — inclui cenário staging completo pós-mirror (shadow `transitionalDiffCount=0` simulado).

### Screenshots RC-01.1

_Nenhum screenshot disponível nesta sessão — execução browser pendente._

---

## RC-01.2 — RH Shadow QA (reexecução)

### Critérios de aceite

| Métrica | Esperado | Obtido | Status |
|---------|----------|--------|--------|
| `blockingDiffCount` | 0 | **0** | **PASS** |
| `transitionalDiffCount` | 0 | **4** | **FAIL** |
| `informationalDiffCount` | apenas `updated_at` | **4** (somente `updated_at`) | **PASS** |
| `canPromoteReadPrimary` | true | **true** | **PASS** |

### Execução

**Comando:** `node scripts/rh-shadow-read-qa.mjs --json`  
**Timestamp:** `2026-06-30T19:13:27.431Z`  
**Report:** `scripts/reports/rh-shadow-read-qa-2026-06-30T19-13-27-436Z.json`  
**Duração:** 182 ms  
**Escritas:** `writesExecuted: false` · `productionTouched: false`

### Resumo do report

| Métrica | Valor |
|---------|-------|
| `localCount` | 4 |
| `remoteCount` | 4 |
| `matchPercent` | 0 |
| `diffCount` | 8 |
| `blockingDiffCount` | **0** |
| `transitionalDiffCount` | **4** |
| `informationalDiffCount` | **4** |
| `canPromoteReadPrimary` | **true** |
| `promotionBlockers` | `[]` |
| `missing_local` | 0 |
| `missing_remote` | 0 |
| `invalid_uuid` (local fallback) | 4 |

### Causa raiz da falha RC-01.2

Os 4 diffs transitórios são **UUID local ausente / legacy_id usado como fallback** — exatamente o gap que RC-01.1 deveria eliminar:

```
localValue:  col-saas-362c17b7-...  →  remoteValue: 9284488d-c0b1-...
tier: transitional_diff
reason: UUID local ausente ou legacy_id usado como fallback — IDB ainda não espelha collaborator_uuid.
```

Os 4 diffs informativos são **somente `updated_at`** (remoto mais recente após backfill Supabase) — comportamento esperado e não bloqueante.

**Conclusão RC-01.2:** Shadow QA **não atende** o critério RC de `transitionalDiffCount=0` porque RC-01.1 não foi aplicado operacionalmente.

### Evidência unitária shadow

**Comando:** `npx vitest run src/__tests__/rhShadowReadQa.test.js src/__tests__/collaboratorShadowDiffClassification.test.js`  
**Resultado:** 19/19 PASS

---

## RC-01.3 — Smoke manual UI (staging)

### Checklist operacional

| # | Área | Item | Status | Evidência |
|---|------|------|--------|-----------|
| 1 | Listagem | 4 colaboradores visíveis | **PEND-M** | — |
| 2 | Pesquisa | Busca por nome/e-mail | **PEND-M** | — |
| 3 | Filtros | Status, cargo, tenant | **PEND-M** | — |
| 4 | Ficha | Abrir/editar colaborador | **PEND-M** | — |
| 5 | Horários | Tab horários de trabalho | **PEND-M** | — |
| 6 | Agenda | Profissional com agenda habilitada | **PEND-M** | — |
| 7 | Permissões | Tab permissões / RBAC | **PEND-M** | — |
| 8 | Uploads | Foto colaborador | **PEND-M** | — |
| 9 | Usuários | Vínculo tenant user | **PEND-M** | — |
| 10 | Convites | Envio/reenvio convite | **PEND-M** | — |
| 11 | Especialidades | CRUD especialidades | **PEND-M** | — |
| 12 | Restauração | Reativar colaborador inativo | **PEND-M** | — |
| 13 | Inativação | Inativar colaborador | **PEND-M** | — |

**Legenda:** **PEND-M** = pendente execução manual no browser staging.

### Cobertura indireta (não substitui smoke manual)

| Evidência | Resultado |
|-----------|-----------|
| Suite Vitest RH (homologação 1.14) | 220/220 PASS |
| Shadow blocker `agenda_enabled` (Ticket 1.12) | `blockingDiffCount=0` |
| Arquitetura read via repository | Validada por testes de adoção |

### Screenshots RC-01.3

_Nenhum screenshot disponível nesta sessão — smoke manual pendente._

---

## RC-01.4 — Checklist consolidado RC-01

| ID | Fase | Critério | Resultado |
|----|------|----------|-----------|
| RC-01.1a | Mirror IDB | 4 updated | **FAIL** (não executado) |
| RC-01.1b | Mirror IDB | 0 conflicts | **FAIL** (não executado) |
| RC-01.1c | Mirror IDB | 0 errors | **FAIL** (não executado) |
| RC-01.1d | Mirror IDB | id legado intacto | **FAIL** (não executado) |
| RC-01.1e | Mirror IDB | uuid espelhado | **FAIL** (não executado) |
| RC-01.2a | Shadow QA | blockingDiffCount = 0 | **PASS** |
| RC-01.2b | Shadow QA | transitionalDiffCount = 0 | **FAIL** (4) |
| RC-01.2c | Shadow QA | informational = updated_at only | **PASS** |
| RC-01.2d | Shadow QA | canPromoteReadPrimary = true | **PASS** |
| RC-01.3 | Smoke UI | 13 áreas funcionais | **FAIL** (pendente) |
| RC-01.4 | Documentação | Este report | **PASS** |

**Score operacional RC-01:** 4 PASS · 8 FAIL/PEND · **NOT READY**

---

## Riscos

| # | Risco | Severidade | Mitigação |
|---|-------|------------|-----------|
| R1 | Promover read primary com UUID local em fallback | **Alta** | Executar RC-01.1 antes de qualquer cutover; manter `RH_SUPABASE_READ_PRIMARY=false` |
| R2 | Divergência silenciosa pós-cutover (writes ainda IDB) | **Alta** | `RH_SUPABASE_WRITE=false`; dual-write fora de escopo RC-01 |
| R3 | Smoke UI não executado — regressões visuais/UX | **Média** | Executar RC-01.3 com checklist completo antes de GO |
| R4 | `updated_at` divergente permanece informational | **Baixa** | Aceito durante backfill; não bloqueia promoção |
| R5 | Export local desatualizado vs IDB browser | **Média** | Shadow CLI usa export remapped; mirror browser é fonte de verdade para IDB live |
| R6 | Produção acidental | **Crítica** | Scripts com `assertStagingSupabaseUrl`; prod ref bloqueado nos snippets |

---

## Próximos passos (operacionais — fora deste ticket)

1. **Executar RC-01.1** — browser snippet em staging (`scripts/snippets/rh-mirror-uuid-idb-browser-snippet.js`)
2. **Reexecutar RC-01.2** — `node scripts/rh-shadow-read-qa.mjs` e confirmar `transitionalDiffCount=0`
3. **Executar RC-01.3** — smoke manual completo; registrar screenshots
4. **Atualizar este documento** com evidências browser
5. **Somente então** reavaliar `READY FOR READ PRIMARY`

---

## Artefatos de evidência

| Artefato | Caminho |
|----------|---------|
| Shadow QA report | `scripts/reports/rh-shadow-read-qa-2026-06-30T19-13-27-436Z.json` |
| Mirror dry-run report | `scripts/reports/rh-mirror-uuid-idb-qa-2026-06-30T19-13-26-972Z.json` |
| Browser snippet mirror | `scripts/snippets/rh-mirror-uuid-idb-browser-snippet.js` |
| Homologação funcional 1.14 | `docs/reports/RH_FUNCTIONAL_HOMOLOGATION_STAGE.md` |
| Testes mirror | `src/__tests__/collaboratorUuidMirror.test.js` |
| Testes shadow QA | `src/__tests__/rhShadowReadQa.test.js` |

---

## Conclusão

A arquitetura RH V3 está **tecnicamente consolidada** (repository, shadow read, classificação de diffs, mirror UUID implementado e testado). Porém, a **validação operacional RC-01 não está completa**:

- O mirror UUID **não foi aplicado** no IndexedDB real do browser staging.
- O Shadow QA **continua com 4 diffs transitórios** de UUID (dependência direta de RC-01.1).
- O smoke manual da interface RH **não foi executado**.

Nenhuma alteração de código, commit ou produção foi realizada nesta fase RC-01.

---

## Veredicto final RC-01

# NOT READY
