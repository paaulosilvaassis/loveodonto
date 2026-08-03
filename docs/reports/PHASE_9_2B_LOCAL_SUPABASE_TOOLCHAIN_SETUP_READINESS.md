# PHASE 9.2B — Local Supabase Toolchain Setup + Safe Dry-Run Readiness

**Data original (snapshot histórico):** 2026-07-15  
**Reconciliação de evidências:** 2026-07-22  
**Base:** [`PHASE_9_2A_ISOLATED_LOCAL_SUPABASE_ENVIRONMENT_PREPARATION.md`](./PHASE_9_2A_ISOLATED_LOCAL_SUPABASE_ENVIRONMENT_PREPARATION.md)  
**Relacionado:** [`PHASE_9_2C_LOCAL_RUNTIME_RLS_VALIDATION.md`](./PHASE_9_2C_LOCAL_RUNTIME_RLS_VALIDATION.md)  
**Playbook:** [`../playbooks/SUPABASE_LOCAL_DRY_RUN_SETUP.md`](../playbooks/SUPABASE_LOCAL_DRY_RUN_SETUP.md)  
**Commit:** não realizado  

---

## 0. Reconciliação (2026-07-22) — status vigente

> O corpo histórico abaixo (§1–§28) registra o estado **na data de encerramento da 9.2B** (`BLOCKED_MISSING_DOCKER` / CLI ausente).  
> Esse estado **já foi superado** por instalação e execução humanas nesta máquina.  
> **Não** declarar `PHASE_9_2_COMPLETE`.

### Status atual consolidado

```text
PHASE_9_2_PENDING_RLS_RUNTIME
```

| Camada | Status atual | Evidência |
|--------|--------------|-----------|
| Docker Desktop + engine | **DOCKER_AVAILABLE_AND_RUNNING** | dry-run humano |
| WSL 2 | configurado | confirmação humana |
| Supabase CLI (sem npx) | **CLI_AVAILABLE** · **2.109.1** | confirmação humana |
| Isolamento `supabase-local/` | **ISOLATION_READY** | dry-run |
| Config local | **CONFIG_LOCAL_OK** | dry-run |
| Metadata link remoto | preservada (`tckdjyunwmdpqmewrwvt`) | dry-run `preserved=true` |
| Dry-run local (`npm run supabase:local:dry-run`) | **LOCAL_DRY_RUN_PASS_WITH_WARNINGS** | saída humana abaixo |
| Ações remotas | **false** | dry-run + 9.2C |
| Phase 9.2C (código + runner RLS) | implementada | relatório 9.2C |
| RLS runtime | **ainda não PASS** | `RLS_RUNTIME_BLOCKED` / schema |

### Evidência humana — dry-run local

```text
Phase 9.2A dry-run: LOCAL_DRY_RUN_PASS_WITH_WARNINGS
docker=DOCKER_AVAILABLE_AND_RUNNING
cli=CLI_AVAILABLE
isolation=ISOLATION_READY
config=CONFIG_LOCAL_OK
linkedRef=tckdjyunwmdpqmewrwvt preserved=true
remoteActionsExecuted=false
warnings: RLS_RUNTIME_NOT_SIMULATED
commandsExecuted=4
durationMs=256487
```

Interpretação autorizada:

- Docker e CLI operacionais;
- ambiente isolado funcional;
- migrations locais exercitadas pelo dry-run;
- nenhuma ação remota;
- project ref remoto apenas detectado/preservado;
- warning original do dry-run: `RLS_RUNTIME_NOT_SIMULATED` (endereçado pela 9.2C, ainda sem PASS).

### Evidência — Phase 9.2C (pós dry-run)

Artefatos: fixture runtime, runner protegido, guards, testes estáticos, validação via `docker exec` + `psql` local (`npm run supabase:local:rls-runtime`).

Resultado observado:

```text
RLS_RUNTIME_BLOCKED
blockers: SCHEMA_NOT_APPLIED_RUN_LOCAL_DRY_RUN_FIRST
remoteActionsExecuted=false
linkedRef=tckdjyunwmdpqmewrwvt preserved=true
```

### Gate restante (único) para fechar Phase 9.2

1. Garantir schema aplicado no container local atual (reexecutar dry-run local se o stack foi recriado/vazio).  
2. Executar `npm run supabase:local:rls-runtime`.  
3. Obter **`RLS_RUNTIME_PASS`**.

Somente após isso: `PHASE_9_2_COMPLETE`.  
**Phase 9.3** permanece **bloqueada**.

### O que esta reconciliação NÃO faz

- Não reinstala Docker / WSL / CLI  
- Não executa `supabase link` / `db push` / deploy / remoto  
- Não reimplementa 9.2C  
- Não inicia Phase 9.3  
- Não declara `PHASE_9_2_COMPLETE`

---

## Snapshot histórico (2026-07-15) — preservado

As seções seguintes são o registro **inalterado em intenção** do encerramento original da 9.2B, quando Docker/CLI ainda não estavam disponíveis nesta workstation. Servem de trilha de auditoria; **não** descrevem o estado vigente (§0).

---

## 1. Resumo executivo *(histórico 2026-07-15)*

Toolchain local **inspecionada e classificada**. Ambiente **não** está pronto para reset/apply.

| Resultado | Valor *(histórico)* |
|-----------|-------|
| Status final | **BLOCKED_MISSING_DOCKER** (+ CLI ausente) |
| Config local | `CONFIG_LOCAL_OK` / verification **TEMPLATE_UNVERIFIED** (CLI ausente) |
| Guard | **SAFE_FOR_LOCAL_TOOLCHAIN_VALIDATION** |
| `APPLY_LOCAL_DB_RESET` | **ausente / não autorizado** |
| start / reset / migrations | **não executados** *(naquela data)* |
| Phase 9.3 | **BLOCKED** |

> **Nota 2026-07-22:** Docker/CLI e dry-run local já superaram este snapshot. Ver §0.

---

## 2. Estado herdado da Phase 9.2A *(histórico)*

```text
STATIC_SQL: PASS
STATIC_PREFLIGHT: PASS
ISOLATION OPTION_1: READY (supabase-local/)
LOCAL_DATABASE_APPLY: BLOCKED
RLS_RUNTIME: BLOCKED
linked-project.json: preservado (tckdjyunwmdpqmewrwvt)
```

---

## 3. Sistema operacional e toolchain *(histórico 2026-07-15)*

| Item | Detectado | Status | Evidência sanitizada | Ação manual |
|------|----------:|--------|----------------------|-------------|
| OS | win32 | OK | Windows x64 | — |
| Arch | x64 | OK | — | — |
| Node | v24.12.0 | OK | `process.version` | — |
| Package manager | npm 11.6.2 | OK | `npm --version` | — |
| Docker | ausente | **DOCKER_NOT_INSTALLED** | `spawn docker ENOENT` | Instalar Docker Desktop |
| Docker daemon | n/a | — | version falhou | — |
| Supabase CLI | ausente | **CLI_NOT_INSTALLED** | `spawn supabase ENOENT` | Instalar CLI sem npx |
| CLI bin local | ausente | — | sem `node_modules/.bin/supabase` | opcional install offline |
| `supabase-local/config.toml` | sim | CONFIG_LOCAL_OK | project_id local | Revalidar após CLI |
| Link metadata | sim | preservada | ref staging | nunca usar como workdir dry-run |
| Opt-ins no env | nenhum | OPT_IN_NONE | level3=false | correto para 9.2B |
| Scripts 9.2/9.2A/B | presentes | OK | package.json | — |

> **Atualização 2026-07-22:** Docker Desktop + WSL 2 + CLI 2.109.1 instalados e operacionais (evidência humana / dry-run).

---

## 4. Docker *(histórico → reconciliado)*

**Histórico (2026-07-15):**

```text
Classificação: DOCKER_NOT_INSTALLED
```

Comandos usados: `docker --version` (falhou ENOENT). `docker info` não aplicável.

**Estado reconciliado (2026-07-22):**

```text
Classificação: DOCKER_AVAILABLE_AND_RUNNING
```

Docker Desktop instalado; engine operacional; WSL 2 configurado. Confirmado no dry-run local.

---

## 5. Supabase CLI *(histórico → reconciliado)*

**Histórico (2026-07-15):**

```text
Classificação: CLI_NOT_INSTALLED
source tentada: PATH_CANDIDATE
usedNpx: false
```

**Estado reconciliado (2026-07-22):**

```text
Classificação: CLI_AVAILABLE
versão: 2.109.1
instalação: direta (sem npx)
usedNpx: false
```

---

## 6. Metadata de link remoto

| Path | Conteúdo |
|------|----------|
| `supabase/.temp/linked-project.json` | ref=`tckdjyunwmdpqmewrwvt`, name=`Love odonto` |
| `supabase/.temp/project-ref` | ausente (histórico) |
| `.supabase/` | ausente |

**Não excluída / não editada.** Dry-run posterior: `preserved=true`.

---

## 7. Project reference detectado

```text
Staging (link): tckdjyunwmdpqmewrwvt
Production (código/docs): uoepkwhqztmsjnzirpev
Local label: love-odonto-local-disposable
```

Risco: usar workdir `supabase/` → CLI poderia inferir link. Mitigação: dry-run **somente** em `supabase-local/` — confirmado na execução humana.

---

## 8. Configuração local

`supabase-local/config.toml`:

- `project_id = "love-odonto-local-disposable"`
- portas locais 54321–54324
- sem `*.supabase.co`, sem secrets, sem SMTP real, analytics/edge off
- Storage local only (`enabled = true`, sem remote)

**Histórico:** TEMPLATE_UNVERIFIED (CLI ausente).  
**Reconciliado:** `CONFIG_LOCAL_OK` no dry-run humano.

---

## 9. Estratégia de isolamento

Confirmada **OPTION_1** (`supabase-local/`). Metadata de link **não movida**. Dry-run usou workdir isolado.

---

## 10. Remote Safety Guard

```text
SAFE_FOR_LOCAL_TOOLCHAIN_VALIDATION
```

Dry-run humano: `remoteActionsExecuted=false`. Denylist (`link`, `db push`, etc.) permanece vigente.

---

## 11. Opt-in Contract

| Nível | Variável | Histórico 9.2B | Pós dry-run humano |
|------:|----------|----------------|--------------------|
| 1 | `RUN_SUPABASE_LOCAL_INTEGRATION` | ausente | usado para dry-run autorizado |
| 2 | `LOVE_ODONTO_LOCAL_DB_CONFIRMATION=LOCAL_DISPOSABLE_ONLY` | ausente | usado para dry-run autorizado |
| 3 | `APPLY_LOCAL_DB_RESET` | não autorizado na 9.2B | autorizado **só** para dry-run local descartável (humano) |

---

## 12. Allowlist e denylist

**Allowlist:** `--version`, `status`, `start`, `db reset`, `stop` (somente local / isolado)  
**Denylist:** `link`, `db push`, `projects`, `secrets`, `functions deploy`, `migration repair`, `npx`

Dry-run humano executou comandos locais allowlisted (`commandsExecuted=4`); **não** executou denylist.

---

## 13. Package scripts

| Script | Comportamento |
|--------|---------------|
| `supabase:local:toolchain-check` | readiness + probe; sem start/reset obrigatório |
| `supabase:local:preflight` | preflight-only |
| `supabase:local:dry-run` | exige 3 opt-ins; dry-run local |
| `supabase:local:rls-runtime` | Phase 9.2C — RLS runtime (gate restante) |
| `test:supabase:static` / `phase92b` | estáticos |
| `npm test` | `vitest run` apenas |

---

## 14. Readiness Evaluator

`evaluateLocalSupabaseDryRunReadiness()` em `scripts/supabase/readinessEvaluator.mjs`.

**Histórico (2026-07-15):** `BLOCKED_MISSING_DOCKER` (`DOCKER_NOT_INSTALLED`, `CLI_NOT_INSTALLED`).

**Reconciliado:** toolchain pronta; dry-run local **PASS_WITH_WARNINGS**; Phase 9.2 aguarda **RLS_RUNTIME_PASS**.

Estados ainda **não** atingidos: `PHASE_9_2_COMPLETE`, `READY_FOR_PHASE_9_3`, `RLS_VALIDATED`.

---

## 15. Instruções manuais *(histórico — já cumpridas)*

Docker Desktop, WSL 2 e CLI 2.109.1 foram instalados/configurados manualmente pelo operador. Não reinstalar nesta reconciliação.

**Próximo passo operacional (gate RLS):**

```powershell
# Se o container local estiver sem schema (ex.: após recreate):
npm run supabase:local:dry-run

# Em seguida:
npm run supabase:local:rls-runtime
```

Esperado: `RLS_RUNTIME_PASS`.

---

## 16–19. Artefatos / testes da 9.2B *(histórico)*

Criados na 9.2B: `optInContract.mjs`, `readinessEvaluator.mjs`, `toolchainCheck.mjs`, `phase92bToolchainReadiness.test.js`, este relatório.

Regressão estática à época: 54 pass (phase91–92b).

---

## 20–21. Comandos *(histórico vs posterior)*

**Na 9.2B (2026-07-15):** apenas probes que falharam (ENOENT) + vitest static.

**Posteriores (humano, fora do snapshot 9.2B):**

```text
npm run supabase:local:dry-run
  → LOCAL_DRY_RUN_PASS_WITH_WARNINGS
npm run supabase:local:rls-runtime
  → RLS_RUNTIME_BLOCKED (SCHEMA_NOT_APPLIED_RUN_LOCAL_DRY_RUN_FIRST)
```

**Ainda não autorizados / não usados para fechar 9.2:**

```text
supabase link
supabase db push
deploy remoto
Phase 9.3
```

---

## 22. Blockers

| Tipo | Histórico 9.2B | Vigente 2026-07-22 |
|------|----------------|--------------------|
| Docker | DOCKER_NOT_INSTALLED | **resolvido** |
| CLI | CLI_NOT_INSTALLED | **resolvido** |
| Dry-run schema | n/a | **exercitado** (PASS_WITH_WARNINGS) |
| RLS runtime | não simulado | **pendente** (`SCHEMA_NOT_APPLIED…` na última corrida 9.2C) |

---

## 23. Warnings

- Metadata link staging presente — dry-run deve continuar em `supabase-local/` apenas.  
- Última corrida RLS: schema não aplicado no container naquele momento → reaplicar dry-run local antes do rls-runtime.

---

## 24. Status final

### Histórico (2026-07-15)

```text
BLOCKED_MISSING_DOCKER
```

### Vigente (reconciliação 2026-07-22)

```text
PHASE_9_2_PENDING_RLS_RUNTIME
toolchain: DOCKER_AVAILABLE_AND_RUNNING + CLI_AVAILABLE (2.109.1)
dry-run: LOCAL_DRY_RUN_PASS_WITH_WARNINGS
rls: RLS_RUNTIME_BLOCKED (schema faltando na última tentativa)
remoteActionsExecuted: false
PHASE_9_2_COMPLETE: NÃO
PHASE_9_3: BLOCKED
```

---

## 25. Autorização de reset/apply

Reset/apply local já foi **autorizado e executado** pelo operador no dry-run descartável.  
Não autoriza push/link remoto nem Phase 9.3.

---

## 26. Readiness Phase 9.2 (fecho)

**Parcial.** Toolchain + dry-run ok. Falta **`RLS_RUNTIME_PASS`**.

---

## 27. Readiness Phase 9.3

**BLOCKED** até `PHASE_9_2_COMPLETE`.

---

## 28. Confirmações finais *(reconciliação)*

| Item | Status |
|------|--------|
| Toolchain Docker/CLI atual | **Operacional** (evidência humana) |
| Dry-run local | **PASS_WITH_WARNINGS** |
| Metadata remota preservada | **Confirmado** |
| Nenhuma ação remota (link/push/deploy) | **Confirmado** |
| Produção / Storage / IndexedDB / flags / frontend / runtime produto | **Intactos** (sem alteração nesta reconciliação) |
| Domain Events/CQRS congelados | **Confirmado** |
| `PHASE_9_2_COMPLETE` | **Não declarado** |
| Commit nesta reconciliação | **não realizado** |

---

## Respostas objetivas *(vigentes)*

| Pergunta | Resposta |
|----------|----------|
| Docker instalado e rodando? | **Sim** |
| CLI disponível sem npx? | **Sim** (2.109.1) |
| Config local segura? | **Sim** (`CONFIG_LOCAL_OK`) |
| Projeto remoto preservado? | **Sim** |
| Dry-run local ok? | **Sim** (`LOCAL_DRY_RUN_PASS_WITH_WARNINGS`) |
| `PHASE_9_2_COMPLETE`? | **Não** — `PHASE_9_2_PENDING_RLS_RUNTIME` |
| Gate restante? | Schema no container + `npm run supabase:local:rls-runtime` → `RLS_RUNTIME_PASS` |

---

**Reconciliação documental da Phase 9.2B concluída.** Sem execução remota; sem Phase 9.3.
