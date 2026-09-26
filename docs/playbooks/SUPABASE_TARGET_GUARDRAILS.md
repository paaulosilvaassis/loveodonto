# Supabase target guardrails (SPF.1A.1)

Fonte única de refs: `server/lib/supabaseTarget/projectRefs.js`
(staging `tckdjyunwmdpqmewrwvt`, production `uoepkwhqztmsjnzirpev`).

## Regras operacionais

1. **Nenhum agente (Claude, MCP, Cursor ou outro) pode executar `execute_sql` mutável, `apply_migration`
   ou chamada equivalente contra PRODUCTION sem autorização explícita da fase.**
   Aprovar o acesso a um projeto **não** autoriza mutação. Leitura de dados clínicos de production
   também exige autorização explícita da fase.
2. Os guards de Git e de código **não protegem** o canal MCP / Management API chamado direto por um agente.
   Essa superfície só é controlada por esta regra e pela configuração de permissões do agente.
   Precedente: o backfill CLOUD.9C foi aplicado em production via MCP `execute_sql`, apesar do
   gate commitado dizer "NOT executed" (ver auditoria SPF.1A).
3. Toda ferramenta que toca um Supabase remoto passa por `assertSupabaseTarget` + `evaluateOperationGate`
   (`server/lib/supabaseTarget/supabaseTargetGuard.js`). Ferramentas novas não declaram refs próprios.

## Variáveis (lidas só do shell, nunca de arquivos `.env`)

| Variável | Uso |
|---|---|
| `LOVE_ODONTO_TARGET_ENV` | `local` \| `staging` \| `production`. Ausente ou inválida → DENY |
| `SUPABASE_PROJECT_REF` | ref explícito; obrigatório quando a chave é opaca (`sb_secret_…`) |
| `LOVE_ODONTO_PRODUCTION_AUTHORIZATION` | id de uma entrada em `productionAuthorizations.js` (hoje vazia) |
| `LOVE_ODONTO_DESTRUCTIVE_CONFIRMATION` | `DESTROY:<ref>:<operationId>`; só fora de production |

## Decisões do gate

- `read`: permitido quando o alvo confere.
- `write`: sem `apply` → dry-run. Com `apply`: staging/local permitido; production exige autorização versionada válida.
- `destructive`: production **sempre** negado (`DESTRUCTIVE_PRODUCTION_ENABLED = false`, inclusive dry-run);
  fora de production, apply exige a confirmação textual.
- Scripts sem dry-run real (`security/apply*`) são bloqueados sem `--apply` (`DRY_RUN_UNSUPPORTED`).
- Negação: JSON sanitizado em stderr e `exit 2` antes de qualquer client ou fetch. Nunca imprime chave, JWT ou URL completa.

Protegidos nesta fase: `reset-platform-tenants`, `security/applyAeProductionMigrationOne`, `apply037`, `apply038`,
`apply039`, `apply040`, `manual-collaborator-access-guided`, `rh-backfill-to-supabase`, `collaborator-id-backfill`.

## Connection strings Postgres (SPF.1A.2)

`assertSupabaseTarget` também aceita `postgres://` e `postgresql://`:

| Formato | Fonte do ref | `connection` |
|---|---|---|
| `…@db.<ref>.supabase.co:5432` | host | `direct` |
| `…@db.<ref>.supabase.co:6543` | host | `dedicated_pooler` |
| `<role>.<ref>@<região>.pooler.supabase.com:5432` | usuário | `session_pooler` |
| `<role>.<ref>@<região>.pooler.supabase.com:6543` | usuário | `transaction_pooler` |

- Host e usuário com refs diferentes → `HOST_USERNAME_REF_CONFLICT`. Pooler sem `<role>.<ref>` → `REF_UNDETERMINED`.
  Sufixo de usuário que não é um ref válido → `USERNAME_REF_INVALID`.
- Só as portas 5432 e 6543 são aceitas.
- Parâmetros de query: só `sslmode`, `sslrootcert`, `connect_timeout` e `application_name`. O libpq deixa
  `?host=`, `?hostaddr=`, `?user=`, `?options=`, `?service=` etc. sobrescreverem o alvo, então qualquer outro → DENY.
- Antes de rodar `psql`, chamar `assertPostgresClientEnvClean`. `PGHOST`, `PGHOSTADDR`, `PGPORT`, `PGUSER`, `PGDATABASE`,
  `PGSERVICE`, `PGSERVICEFILE` e `PGOPTIONS` também podem redirecionar a conexão.
- **Não** passar a senha como `credential`: o ref é provado pelo host ou pelo usuário. Senha, usuário e URL nunca aparecem
  em resultado, erro ou log.
- O cliente é `libpq` (keg-only): `/opt/homebrew/opt/libpq/bin/psql`. Nenhum servidor Postgres local é instalado.

## Runner READ ONLY de prova (SPF.1B.0)

É a única porta para executar consultas de prova com `psql`:
`scripts/safety/run-readonly-db-proof.mjs`, com o núcleo em `scripts/safety/readOnlyDbProof.mjs`.

```
LOVE_ODONTO_TARGET_ENV=staging STAGING_DATABASE_URL=<no shell, nunca em arquivo> \
  node scripts/safety/run-readonly-db-proof.mjs
```

- **Alvo:** só `staging` ou `production`. A connection string vem **apenas** de `STAGING_DATABASE_URL` ou `PRODUCTION_DATABASE_URL`,
  sem fallback para `DATABASE_URL` ou `SUPABASE_URL`. Se a variável do outro ambiente estiver presente → DENY.
  Connection string como argumento → DENY.
- **Validação:** reutiliza o guard central (`operation=read`, ref do host ou do usuário), `assertPostgresClientEnvClean`,
  exige URL `postgres(ql)://` e recusa `sslmode=disable` ou `allow`.
- **PRODUCTION:** recusado por padrão (`PRODUCTION_READ_EXECUTION_ENABLED = false`). A autorização de WRITE
  (`productionAuthorizations.js`) **não** libera READ; só um PR autorizado pode mudar a constante.
- **Query set:** só os aprovados em `APPROVED_QUERY_SETS`. O runner valida o SHA-256 fixado e a estrutura exata
  (`BEGIN READ ONLY` → `SET LOCAL statement_timeout` → N consultas `SELECT`/`WITH` → `ROLLBACK`), procura comandos proibidos
  (inclusive dentro de blocos `$tag$`), bloqueia meta-comandos `\` do psql e recusa indícios de credencial ou URL.
  Qualquer mudança no SQL exige nova revisão e um hash novo.
  `spf1b-patient-state-proof` → `scripts/safety/sql/spf1b-patient-state-proof.sql`,
  SHA-256 `225ef0e70c4499a2c43c9df38815be8ba0cb7fdad3ac66e1ca260e1d5e37cd16`.
- **psql:** executado com `-X -w -v ON_ERROR_STOP=1 -P pager=off -f <arquivo> -d <alvo SEM senha>`. O processo filho recebe só
  `PATH`, `HOME`, locale e o `PGPASSFILE` criado pelo runner. Nenhuma `PG*` é herdada; `PGPASSWORD` e `PGPASSFILE` presentes no
  processo pai → DENY. Não há retry; o exit code do psql é propagado (sinal SIGINT → 130).
- **Credencial (SPF.1B.0A):** a senha **nunca** vai no argv. Depois da validação, a URL é separada em alvo sem senha
  (argv) e uma linha `host:porta:banco:usuário:senha` no formato `.pgpass`, com `\` e `:` escapados. Essa linha é gravada num
  PGPASSFILE efêmero: diretório `mkdtemp` 0700 no tmp do sistema (DENY se estiver dentro do repositório), arquivo com nome
  aleatório criado com modo 0600 e `flag: 'wx'`. O arquivo é exposto só ao filho e removido em `finally` (sucesso, exit≠0,
  falha de spawn, sinal tratável). Falha na remoção → erro sanitizado `PGPASSFILE_CLEANUP_FAILED` (exit 3).
  `~/.pgpass` nunca é usado. Senhas com caracteres de controle (`\n`, `\r`, `\0`) → DENY.
- **Risco residual:** um encerramento não tratável (`SIGKILL`, queda de energia) durante a execução pode deixar o arquivo
  0600 no diretório 0700 do tmp do usuário até a limpeza do sistema.

## Admin API (Railway): guard de startup

`server/lib/supabaseTarget/serverStartupGuard.js`, chamado em `server/index.js` antes do `createClient`.

- **Hoje (sem `EXPECTED_SUPABASE_PROJECT_REF`): modo report-only.** Registra `urlRef=PRODUCTION|STAGING|UNKNOWN` e sobe
  normalmente, para não derrubar o serviço publicado.
- **Ativação (fase futura, com autorização):**
  1. Confirmar, lendo o log report-only do deploy, qual classe de ref o Railway usa.
  2. Definir no Railway `EXPECTED_SUPABASE_PROJECT_REF=<ref esperado>` e, opcionalmente, `LOVE_ODONTO_TARGET_ENV`.
  3. Redeploy. Divergência de URL ou de ref da chave JWT → `HARD STOP` com `exit 2`.
     Rollback: remover a variável.

## Pendências conhecidas

Ainda sem guard: `resend-clinic-access.mjs`, `seed-permission-catalog.mjs` e os demais scripts MEDIUM/LOW.
