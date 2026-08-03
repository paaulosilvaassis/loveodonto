# PHASE 9.2A — Isolated Local Supabase Environment Preparation

**Data:** 2026-07-15  
**Base:** [`PHASE_9_2_SUPABASE_LOCAL_MIGRATION_DRY_RUN_RLS_VALIDATION.md`](./PHASE_9_2_SUPABASE_LOCAL_MIGRATION_DRY_RUN_RLS_VALIDATION.md)  
**Playbook:** [`../playbooks/SUPABASE_LOCAL_DRY_RUN_SETUP.md`](../playbooks/SUPABASE_LOCAL_DRY_RUN_SETUP.md)  
**Commit:** não realizado  

---

## 1. Resumo executivo

Foi preparado um **workdir isolado** (`supabase-local/`) com `config.toml` local, bootstrap de `tenants`, guards contra remoto, opt-in duplo e runner seguro.

Nesta workstation o dry-run **não aplicou** migrations (Docker/CLI ausentes; opt-in OFF na regressão).

| Capacidade | Status |
|------------|--------|
| Isolamento OPTION_1 | **Pronto** |
| Link remoto preservado | **Sim** (`tckdjyunwmdpqmewrwvt`) |
| Guards + opt-in | **Implementados** |
| Apply 020–023 local | **LOCAL_DRY_RUN_BLOCKED** |
| RLS runtime | **RLS_RUNTIME_BLOCKED** |
| Phase 9.3 readiness | **BLOCKED** |

---

## 2. Auditoria do link remoto

| Artefato | Path | Project ref | Remoto? | Usado por | Risco |
|----------|------|-------------|---------|-----------|-------|
| linked-project.json | `supabase/.temp/linked-project.json` | `tckdjyunwmdpqmewrwvt` | Sim (staging) | Metadata CLI link | **ALTO** se workdir=`supabase/` |
| project-ref | `supabase/.temp/project-ref` | ausente | — | — | nenhum |
| config.toml app | `supabase/config.toml` | — | — | ausente | baixo |
| config isolado | `supabase-local/config.toml` | `love-odonto-local-disposable` | **Não** | dry-run 9.2A | baixo |

Nome no link: `Love odonto` · org metadata presente · **não removido**.

---

## 3. Project ref detectado

```text
Staging (link): tckdjyunwmdpqmewrwvt
Production (docs/código): uoepkwhqztmsjnzirpev
Local disposable label: love-odonto-local-disposable
```

Ocorrências de `tckdjyunwmdpqmewrwvt` no repo: docs/reports, scripts/reports JSON, constituições, testes — **não** no `supabase-local/config.toml`.

---

## 4. Estratégia de isolamento

**Opção 1 — Diretório isolado** (`supabase-local/`).

- Dry-run sempre com `cwd = supabase-local`
- Metadata `supabase/.temp/linked-project.json` **intocada**
- Migrations do app espelhadas via symlink/cópia pelo runner (não commitadas; `.gitignore`)
- Bootstrap `000_local_bootstrap_tenants.sql` (CREATE `public.tenants` mínimo — gap conhecido: CREATE oficial está no console)

Opção 2 (backup temporário de link) **não usada**.

---

## 5. Configuração local

Arquivo: `supabase-local/config.toml`

- `project_id = "love-odonto-local-disposable"`
- Portas locais API/DB/Studio/Inbucket
- Sem URL `*.supabase.co`, sem secrets, sem SMTP real, sem analytics/edge remotas
- Status: **CONFIG_LOCAL_OK** (não `CONFIG_TEMPLATE_ONLY` — alinhado à forma CLI v2 comum; validação formal de versão CLI ainda depende de CLI disponível)

---

## 6. Docker preflight

Regressão padrão: **DOCKER_CHECK_SKIPPED** (sem opt-in).

Ambiente conhecido (Phase 9.2): Docker **não** disponível → dry-run permanecerá `DOCKER_NOT_AVAILABLE` / blocked até instalação manual.

---

## 7. Supabase CLI preflight

Sem `npx`. Ordem: `SUPABASE_CLI_PATH` → `node_modules/.bin` → PATH.

Regressão: **CLI_CHECK_SKIPPED**.  
Workstation: CLI não está em `node_modules/.bin` nem PATH global (histórico 9.2).

---

## 8. Guards contra remoto

Módulo: `scripts/supabase/remoteGuard.mjs`

Bloqueia: `link`, `db push`, `npx`, env remotas, refs staging/prod em args, secrets env.

Status possíveis: `SAFE_LOCAL_ENVIRONMENT`, `BLOCKED_REMOTE_*`, `LOCAL_INTEGRATION_SKIPPED`.

---

## 9. Opt-in

Obrigatório **ambos**:

```text
RUN_SUPABASE_LOCAL_INTEGRATION=true
LOVE_ODONTO_LOCAL_DB_CONFIRMATION=LOCAL_DISPOSABLE_ONLY
```

Apply real adicional:

```text
APPLY_LOCAL_DB_RESET=true
```

---

## 10. Scripts criados

| Script | Função |
|--------|--------|
| `scripts/supabase/constants.mjs` | refs + audit link |
| `scripts/supabase/remoteGuard.mjs` | guard + opt-in |
| `scripts/supabase/isolation.mjs` | workdir + migration links |
| `scripts/supabase/toolchainPreflight.mjs` | Docker/CLI |
| `scripts/supabase/runLocalMigrationDryRun.mjs` | runner |
| `scripts/phase92-local-integration.mjs` | delega ao runner 9.2A |

package.json:

- `supabase:local:preflight`
- `supabase:local:dry-run`
- `test:supabase:local` → runner
- `test:supabase:phase92a` → testes static 9.2A

---

## 11. Comandos permitidos e proibidos

**Permitidos:** `--version`, `start`, `status`, `db reset`, `stop` (via guard + workdir isolado).

**Proibidos:** `link`, `db push`, `secrets`, `projects`, `functions deploy`, `npx`, refs remotos.

---

## 12. Dry-run executado ou bloqueado

**LOCAL_DRY_RUN_BLOCKED** / **LOCAL_INTEGRATION_SKIPPED** na regressão (opt-in off; sem Docker/CLI).

Nenhum `supabase start`/`db reset` executado nesta conclusão.

---

## 13–16. Migrations 020–023

| Migration | Resultado |
|-----------|-----------|
| 020 | **LOCAL_DRY_RUN_BLOCKED** (static ainda PASS da 9.1/9.2) |
| 021 | **LOCAL_DRY_RUN_BLOCKED** |
| 022 | **LOCAL_DRY_RUN_BLOCKED** |
| 023 | **LOCAL_DRY_RUN_BLOCKED** |

---

## 17. RLS runtime

**RLS_RUNTIME_BLOCKED** — sem banco local; JWT multi-tenant não simulado.

---

## 18. Fixtures sintéticas

- `supabase-local/fixtures/synthetic_tenants.sql` — tenants A/B + e-mails `*.invalid`
- Constantes UUID estáveis documentadas
- Não aplicadas (apply bloqueado)

---

## 19. Restauração da metadata

Nenhuma metadata movida. `linked-project.json` permanece com ref staging.  
`linkedMetadataPreserved: true` por design (leitura only).

---

## 20. Arquivos criados

- `supabase-local/config.toml`, `.gitignore`, `migrations/000_local_bootstrap_tenants.sql`, `fixtures/synthetic_tenants.sql`
- `scripts/supabase/*`
- `docs/playbooks/SUPABASE_LOCAL_DRY_RUN_SETUP.md`
- `src/__tests__/phase92aIsolatedLocalSupabase.test.js`
- este relatório

---

## 21. Arquivos modificados

- `package.json` (scripts)
- `scripts/phase92-local-integration.mjs` (delegate)
- `docs/reports/README.md` (link)

---

## 22. Testes adicionados

`src/__tests__/phase92aIsolatedLocalSupabase.test.js` — link audit, config, guard, opt-in, safety.

---

## 23. Resultado da regressão

```text
node node_modules/vitest/vitest.mjs run \
  src/__tests__/phase92aIsolatedLocalSupabase.test.js \
  src/__tests__/phase92LocalDryRunPreflight.test.js \
  src/__tests__/phase91SchemaGapMigrations.test.js

→ Test Files  3 passed
→ Tests       41 passed (41)
→ Duration    ~1.6s
```

Sem Docker/CLI/npx na regressão.

---

## 24. Comandos realmente executados

Nesta fase de preparação/documentação: **nenhum** comando Supabase de start/reset/push/link.

Possível: vitest local + leitura FS.

---

## 25. Ações remotas executadas

```text
remoteActionsExecuted: false
```

---

## 26. Blockers

1. Docker ausente  
2. Supabase CLI ausente no PATH / node_modules  
3. Opt-in duplo OFF na regressão (correto)  
4. Apply depende de `APPLY_LOCAL_DB_RESET`  
5. Cadeia de migrations do app assume `public.tenants` (mitigado por bootstrap `000_`; migrations `001` platform podem exigir Attention em apply futuro)

---

## 27. Warnings

- Baseline app migration `001` é schema platform — apply completo pode precisar ajustes adicionais além do bootstrap tenants  
- RLS runtime não automatizado  
- config.toml não validado contra `--help` da CLI instalada (CLI ausente)

---

## 28. Status final

```text
ENVIRONMENT_PREPARATION: COMPLETE
LOCAL_DRY_RUN: BLOCKED
ISOLATION: READY
REMOTE_LINK: PRESERVED
REMOTE_ACTIONS: false
```

---

## 29. Readiness para concluir a Phase 9.2

Phase 9.2 (static) **já estava concluída**. Phase 9.2A **habilita** o caminho seguro; a conclusão “apply local PASS” da 9.2 permanece **pendente** até Docker+CLI+opt-in+`APPLY_LOCAL_DB_RESET` em máquina preparada.

---

## 30. Readiness para Phase 9.3

**BLOCKED.** Exportação IndexedDB não autorizada sem dry-run local comprovado das migrations gap.

---

## 31. Confirmações finais

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
| Metadata do projeto remoto preservada | **Confirmado** |
| Domain Events/CQRS congelados | **Confirmado** |
| Commit não realizado | **Confirmado** |

---

## Respostas objetivas

| Pergunta | Resposta |
|----------|----------|
| O ambiente local está realmente isolado? | **Estrutura sim** (`supabase-local`); **runtime não iniciado** |
| O link remoto foi preservado? | **Sim** |
| Docker e CLI estão disponíveis? | **Não** (nesta workstation) |
| As migrations 020–023 aplicaram localmente? | **Não** |
| A RLS foi validada em runtime? | **Não** |
| Pronto para dry-run de exportação IndexedDB? | **Não** |

---

**Phase 9.2A encerrada.** Aguardando aprovação humana.
