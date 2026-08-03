# PHASE 9.2 — Supabase Local Migration Dry-Run + RLS Validation

**Data:** 2026-07-15  
**Tipo:** Validação estática concluída + dry-run de banco **bloqueado** por ambiente  
**Base:** [`PHASE_9_1_SUPABASE_SCHEMA_GAP_CLOSURE.md`](./PHASE_9_1_SUPABASE_SCHEMA_GAP_CLOSURE.md)  
**Commit:** não realizado  

---

## 1. Ajuste do preflight

O preflight monolítico (que chamava processos / `npx`) foi substituído por **três camadas**:

| Camada | Módulo | Spawn? | Na regressão `npm test`? |
|--------|--------|--------|---------------------------|
| 1 Static | `scripts/phase92/staticPreflight.mjs` | Não | Sim |
| 2 CLI | `scripts/phase92/cliAvailability.mjs` | Só com opt-in **e** `probe:true` | Só status SKIPPED |
| 3 Local DB | `scripts/phase92/localIntegration.mjs` + `scripts/phase92-local-integration.mjs` | Opt-in estrito | Não (`npm run test:supabase:local`) |

Helper de processo: `scripts/phase92/processRunner.mjs` (`spawn` sem `shell:true`, timeout, kill, stdout/stderr sanitizados).

Entrypoint estático: `scripts/phase92-local-dry-run-preflight.mjs` → `STATIC_PREFLIGHT_PASS` nesta máquina.

---

## 2. Causa do timeout

A suíte anterior invocava `npx supabase --version` (e probes Docker) **dentro do hot path dos testes unitários**. Isso:

* podia baixar pacote via rede;
* tinha latência imprevisível;
* estourava o timeout padrão do Vitest (5s).

**Correção:** zero `npx` nos módulos Phase 9.2; CLI só sob `ENABLE_SUPABASE_CLI_CHECK` / `RUN_SUPABASE_LOCAL_INTEGRATION` **com** `probe:true`; regressão padrão é 100% filesystem/DDL.

---

## 3. Separação static / CLI / integration

```text
STATIC VALIDATION          → npm test / test:supabase:static
CLI AVAILABILITY           → opt-in + probe explícito
LOCAL DATABASE INTEGRATION → npm run test:supabase:local
```

Não se afirma `LOCAL_DRY_RUN_PASS` com base apenas em testes estáticos.

---

## 4. Política de opt-in

| Variável | Efeito |
|----------|--------|
| *(ausente)* | Static only; CLI skipped; integration gate blocked |
| `ENABLE_SUPABASE_CLI_CHECK=true` | Permite probe CLI se `probe:true` |
| `RUN_SUPABASE_LOCAL_INTEGRATION=true` | Abre gate de integration **se** não houver link remoto / URL remota / prod ref |
| `APPLY_LOCAL_DB_RESET=true` | Único caminho que executa `supabase db reset --local --yes` |
| `SUPABASE_CLI_PATH` | Binário explícito (preferido sobre PATH) |

Resolução CLI (sem download): `SUPABASE_CLI_PATH` → `node_modules/.bin/supabase` → candidato `supabase` no PATH. **Sem fallback npx.**

---

## 5. Scripts criados ou modificados

**Criados**

* `scripts/phase92/staticPreflight.mjs`
* `scripts/phase92/cliAvailability.mjs`
* `scripts/phase92/localIntegration.mjs`
* `scripts/phase92/processRunner.mjs`
* `scripts/phase92-local-integration.mjs`
* `src/__tests__/phase92LocalIntegration.optin.test.js` (skip sem opt-in)

**Modificados**

* `scripts/phase92-local-dry-run-preflight.mjs` (thin static entry)
* `src/__tests__/phase92LocalDryRunPreflight.test.js` (somente static/gates)
* `package.json`:
  * `test:supabase:static`
  * `test:supabase:local`
  * `preflight:supabase:static`

**Migrations 020–023:** não alteradas nesta conclusão.

---

## 6. Ambiente local utilizado

| Item | Valor |
|------|-------|
| CLI no PATH | Não detectada na regressão (check skipped) |
| Docker | Não disponível (preflight histórico) |
| Banco local iniciado | Não |
| Opt-in integração | **false** |
| `supabase/config.toml` | **Ausente** (WARN) |
| Project link | `supabase/.temp/linked-project.json` → ref `tckdjyunwmdpqmewrwvt` |
| Production ref em argv/env | Ausente |
| DATABASE_URL / SUPABASE_* remotas no process.env | Ausentes |
| Remoto usado nesta phase | **Não** |

---

## 7. Migrations avaliadas

`020`, `021`, `022`, `023` — avaliação **estática** completa; apply local **não executado**.

---

## 8–11. Resultado por migration

| Migration | Apply | Schema (static) | Índices (static) | RLS (static) | API compat (static) | Resultado |
|-----------|------:|----------------:|-----------------:|-------------:|--------------------:|-----------|
| 020 appointments | — | OK | OK | n/a (023) | OK | **STATIC_VALIDATION_PASS** / **LOCAL_DATABASE_DRY_RUN_BLOCKED** |
| 021 financial | — | OK | OK | n/a | OK | **STATIC_VALIDATION_PASS** / **LOCAL_DATABASE_DRY_RUN_BLOCKED** |
| 022 CRM | — | OK | OK | n/a | OK | **STATIC_VALIDATION_PASS** / **LOCAL_DATABASE_DRY_RUN_BLOCKED** |
| 023 RLS | — | policies OK | n/a | enable+helpers; sem `USING(true)` | n/a | **STATIC_VALIDATION_PASS** / **LOCAL_DATABASE_DRY_RUN_BLOCKED** |

**Não** classificado como `LOCAL_DRY_RUN_PASS`.

---

## 12. Schema

DDL versionado mantém contratos Admin API (colunas snake_case de list/write). Tabelas esperadas presentes nos arquivos. Schema **não** inspecionado via `\d` em Postgres real.

---

## 13. Constraints

Declaradas no SQL (status appointments, amounts ≥ 0, legacy_id, unique parciais). **Não** exercitadas com INSERT real.

---

## 14. Índices

Declarados (tenant/date/profissional/status/legacy; finance due/status; CRM stage_key/order). **Não** confirmados via `pg_indexes`.

---

## 15. RLS

| Tabela | RLS no SQL | SELECT | ALL (admin) |
|--------|-----------:|-------:|------------:|
| appointments | enable | membership | admin |
| financial_* (3) | enable | membership | admin |
| crm_* (2) | enable | membership | admin |

Sem `USING (true)` / sem `tenant-1`. Service role (Admin API) continua bypass — documentado.

**RLS runtime simulation:** `RLS_RUNTIME_SIMULATION_BLOCKED`.

---

## 16. Multi-tenant

Gate bloqueia apply com project link remoto. Testes unitários do gate cobrem opt-in off, URL remota e linked-project. Isolamento JWT A/B **não** executado em banco.

---

## 17. Compatibilidade Admin API

Estática **PASS** (phase91 + phase92): colunas de Agenda/Finance/CRM ⊆ DDL 020–022.

---

## 18. Reaplicação/reset

**Não executado.** `APPLY_LOCAL_DB_RESET` não autorizado; Docker/CLI/local stack ausentes; link remoto bloquearia mesmo com opt-in.

---

## 19. Testes adicionados

* `src/__tests__/phase92LocalDryRunPreflight.test.js` — static/gates  
* `src/__tests__/phase92LocalIntegration.optin.test.js` — skip sem opt-in  
* Mantidos: `phase91SchemaGapMigrations.test.js`

---

## 20. Resultado da regressão (suíte static 9.1+9.2)

```text
node node_modules/vitest/vitest.mjs run \
  src/__tests__/phase91SchemaGapMigrations.test.js \
  src/__tests__/phase92LocalDryRunPreflight.test.js

→ Test Files  2 passed
→ Tests       28 passed (28)
→ Duration    ~1.8s
```

Equivale a `npm run test:supabase:static`. Suite completa do monólito não reexecutada; Phase 9.2 **não** inicia Docker/CLI/rede.

---

## 21. Testes realmente executados

| Classe | Executado? |
|--------|------------|
| STATIC_SQL_TEST | Sim |
| STATIC_PREFLIGHT_TEST | Sim → **STATIC_PREFLIGHT_PASS** |
| API_SCHEMA_COMPATIBILITY_TEST | Sim |
| CLI_AVAILABILITY_TEST (unit skipped path) | Sim → **CLI_CHECK_SKIPPED** |
| LOCAL_DATABASE gate unitário | Sim → blocked |
| LOCAL_DATABASE_TEST (apply) | **Não** |
| RLS_SIMULATION_TEST (runtime) | **Não** |

---

## 22. Testes bloqueados ou skipped

| Item | Status |
|------|--------|
| CLI probe real | SKIPPED (opt-in off) |
| `supabase db reset --local` | BLOCKED |
| Schema/index inspection runtime | BLOCKED |
| RLS JWT Tenant A/B | `RLS_RUNTIME_SIMULATION_BLOCKED` |
| Reset/reapply | BLOCKED |
| `phase92LocalIntegration.optin.test.js` | skip sem `RUN_SUPABASE_LOCAL_INTEGRATION` |

---

## 23. Blockers

1. **LOCAL_DB_AVAILABLE** — Docker/Postgres local não disponíveis.  
2. **REMOTE_PROJECT_LINKED** — `linked-project.json` → `tckdjyunwmdpqmewrwvt`.  
3. **CONFIG_TOML_PRESENT** — WARN (`supabase/config.toml` ausente).  
4. **OPT_IN** — integração não ativada (correto para regressão).  
5. CLI global/node_modules.bin não validada neste ambiente na regressão.

Para desbloquear dry-run real (fase posterior autorizada):

```text
1. Remover/unlink projeto remoto local (ou trabalhar sem linked-project.json)
2. Instalar Docker + supabase CLI (PATH ou SUPABASE_CLI_PATH) — sem npx
3. supabase init / config.toml se necessário
4. supabase start (local)
5. RUN_SUPABASE_LOCAL_INTEGRATION=true APPLY_LOCAL_DB_RESET=true npm run test:supabase:local
```

---

## 24. Warnings

* `config.toml` ausente.  
* Prefix duplicate histórico `012` / `012_fix_*` (fora de 020–023; não blocker static).  
* Admin API hard-delete financeiro vs coluna `deleted_at` (já 9.1).  
* Policies dependem de helpers membership/JWT — runtime não provado.

---

## Matriz de validações

| Validação | Status |
|-----------|--------|
| Static SQL | **PASS** |
| Static preflight | **STATIC_PREFLIGHT_PASS** |
| CLI availability | **CLI_CHECK_SKIPPED** |
| Local database apply | **LOCAL_DATABASE_DRY_RUN_BLOCKED** |
| Schema inspection (runtime) | BLOCKED |
| Index validation (runtime) | BLOCKED |
| RLS static inspection | **PASS** |
| RLS runtime simulation | **BLOCKED** |
| Admin API compatibility | **PASS** (static) |
| Reset/reapply | **BLOCKED** |

---

## 25. Readiness para Phase 9.3

**Não recomendada automaticamente.**

Phase 9.3 (export IndexedDB / data migration dry-run) exige evidência de schema **aplicável** em banco local descartável. Enquanto `LOCAL_DATABASE_DRY_RUN_BLOCKED` e project link remoto existirem, a readiness permanece **BLOCKED**.

Static schema gap (9.1) + static 9.2 estão verdes o suficiente para **retry da 9.2 integration** assim que o ambiente local estiver limpo — não para pular direto à exportação IDB.

---

## 26. Confirmações finais

| Item | Status |
|------|--------|
| Nenhuma migration remota executada | **Confirmado** |
| Supabase remoto não alterado | **Confirmado** |
| Produção não alterada | **Confirmado** |
| Storage não alterado | **Confirmado** |
| IndexedDB não alterado | **Confirmado** |
| Flags não alteradas | **Confirmado** |
| Frontend não alterado | **Confirmado** |
| Runtime backend não alterado | **Confirmado** |
| Domain Events/CQRS congelados | **Confirmado** |
| Commit não realizado | **Confirmado** |
| `npx supabase` na regressão padrão | **Ausente** |

---

## Respostas de fechamento

| Pergunta | Resposta |
|----------|----------|
| As migrations aplicam em banco local? | **Não verificado** — dry-run bloqueado |
| Schema corresponde à Admin API? | **Sim (estático)** |
| RLS bloqueia cross-tenant? | **Declarada no SQL; runtime não simulado** |
| Correções ainda necessárias? | Ambiente local (Docker+CLI+unlink+config.toml); depois reexecutar `test:supabase:local` |
| Pronto para dry-run de exportação IDB? | **Não** |

---

**Phase 9.2 encerrada formalmente** com static pass + local blocked. Aguardando aprovação humana.
