# Supabase Local Dry-Run Setup — Love Odonto

Playbook operacional da **Phase 9.2A**. Ambiente descartável e isolado de staging/produção.

## Princípio

```text
Supabase CLI disponível ≠ Ambiente local seguro
```

Só executar dry-run quando **todos** os itens abaixo forem verdadeiros:

1. Docker instalado **e** engine em execução
2. Supabase CLI disponível **sem `npx`** (`SUPABASE_CLI_PATH` ou PATH ou `node_modules/.bin`)
3. Workdir `supabase-local/` com `config.toml` local
4. Nenhum `DATABASE_URL` / `SUPABASE_*` remoto no environment
5. Opt-in duplo configurado
6. Runner aprovado pelo remote guard

## Project refs (referência — não usar no dry-run)

| Ambiente | Ref |
|----------|-----|
| Staging (link legado em `supabase/.temp`) | `tckdjyunwmdpqmewrwvt` |
| Produção | `uoepkwhqztmsjnzirpev` |
| Local disposable (`project_id` no config) | `love-odonto-local-disposable` |

A metadata em `supabase/.temp/linked-project.json` **deve ser preservada**. O dry-run **não** usa o diretório `supabase/` como workdir.

## Isolamento (Opção 1)

```text
supabase-local/
  config.toml          # somente local
  migrations/
    000_local_bootstrap_tenants.sql
    + links/cópias das migrations do app (geradas pelo runner)
  fixtures/
    synthetic_tenants.sql
```

O runner cria symlinks/cópias das migrations de `supabase/migrations/` para `supabase-local/migrations/` sem alterar o link remoto.

## Instalar Docker (manual)

1. Instalar Docker Desktop (Windows) ou engine equivalente.
2. Iniciar o Docker.
3. Validar:

```powershell
docker --version
docker info
```

Não usar installers automatizados por scripts deste repositório.

## Instalar Supabase CLI (sem npx)

Preferências:

1. Binary global (installer oficial / scoop) → `supabase` no PATH
2. Variável `SUPABASE_CLI_PATH` apontando para o executável
3. Pacote já presente em `node_modules/.bin` (se o time instalar offline)

**Não** usar `npx supabase` no fluxo de dry-run.

Validar:

```powershell
supabase --version
```

## Variáveis de opt-in

```powershell
$env:RUN_SUPABASE_LOCAL_INTEGRATION = "true"
$env:LOVE_ODONTO_LOCAL_DB_CONFIRMATION = "LOCAL_DISPOSABLE_ONLY"
# Somente quando for realmente aplicar reset local:
$env:APPLY_LOCAL_DB_RESET = "true"
# Opcional: parar stack ao fim
$env:SUPABASE_LOCAL_STOP_AFTER = "true"
```

Sem as duas primeiras variáveis o runner retorna `LOCAL_INTEGRATION_SKIPPED`.

## Comandos do repositório

```powershell
# Só filesystem / guards (seguro, sem Docker)
npm run preflight:supabase:static
npm run test:supabase:static
npm run test:supabase:phase92a
npm run test:supabase:phase92b

# Phase 9.2B — probe Docker/CLI only (sem start/reset)
npm run supabase:local:toolchain-check

# Preflight (sem reset)
npm run supabase:local:preflight

# Dry-run apply — SOMENTE após autorização humana explícita do nível 3
# Requer: RUN_SUPABASE_LOCAL_INTEGRATION + LOVE_ODONTO_LOCAL_DB_CONFIRMATION
#         + APPLY_LOCAL_DB_RESET=true
npm run supabase:local:dry-run

# Phase 9.2C — RLS runtime (Postgres local real; NÃO reseta o DB)
# Requer níveis 1+2; stack local já up após dry-run
npm run test:supabase:phase92c
$env:RUN_SUPABASE_LOCAL_INTEGRATION="true"
$env:LOVE_ODONTO_LOCAL_DB_CONFIRMATION="LOCAL_DISPOSABLE_ONLY"
npm run supabase:local:rls-runtime
```

## Comandos CLI permitidos (via runner)

- `supabase --version`
- `supabase start`
- `supabase status`
- `supabase db reset --yes`
- `supabase db query --local --file <sql>`
- `supabase stop`

## Comandos proibidos

- `supabase link`
- `supabase db push`
- `supabase secrets`
- `supabase projects`
- `supabase functions deploy`
- `supabase db query --linked`
- `supabase db query --db-url`
- qualquer uso de `npx`
- qualquer comando com project ref staging/produção

## Interpretar blockers

| Status | Significado |
|--------|-------------|
| `LOCAL_INTEGRATION_SKIPPED` | Opt-in ausente |
| `LOCAL_DRY_RUN_BLOCKED` | Ambiente incompleto (Docker/CLI/config/env) |
| `LOCAL_DRY_RUN_FAILED` | Comando local falhou |
| `LOCAL_DRY_RUN_PASS` | Apply local ok; RLS via comando separado |
| `RLS_RUNTIME_PASS` / `RLS_RUNTIME_FAILED` | Gate Phase 9.2C |
| `RLS_RUNTIME_SKIPPED_OPT_IN` / `RLS_RUNTIME_BLOCKED` | Opt-in/stack incompleto |
| `BLOCKED_REMOTE_*` | Guard impediu execução |

## Garantir que nenhum remoto foi acessado

- Workdir = `supabase-local`
- `remoteActionsExecuted: false` no JSON do runner
- `linked-project.json` intacto (mesmo conteúdo)
- Nenhuma env `SUPABASE_URL` / `DATABASE_URL` remota durante a sessão

## Parar o ambiente

```powershell
Set-Location supabase-local
supabase stop
```

Ou `$env:SUPABASE_LOCAL_STOP_AFTER="true"` no dry-run.

## O que não fazer

- Não apontar dry-run para staging/prod
- Não apagar `supabase/.temp/linked-project.json`
- Não rodar `db push`
- Não usar dados reais / seeds de clínica
- Não iniciar Phase 9.3 (export IDB) até dry-run local comprovado
