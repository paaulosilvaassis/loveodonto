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
