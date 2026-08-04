# PHASE_10.13D — REAL STAGING VALIDATION

## Status

**READY_FOR_REMOTE_VALIDATE_EXECUTION** (tooling entregue; execução remota no Terminal do usuário)

O dry-run `contracts-v2:staging-preflight` **não** conclui a Phase 10.13. A validação remota real é:

```bash
npm run contracts-v2:staging-validate
```

## Baseline

| Item | Valor |
|------|-------|
| Branch | `main` |
| Staging ref | `tckdjyunwmdpqmewrwvt` |
| Production ref | `uoepkwhqztmsjnzirpev` (bloqueado) |
| DDL apply | `STAGING_APPLY_PASS` (028–032, 034, 035) |
| 033 | SKIP_LOCAL_ONLY |
| Bucket | `contracts-v2-private-staging` (`public=false`) |
| Flags | 15/15 false |
| Delivery | disabled |

## Entregas desta fase

### 1. Preflight dry-run atualizado

`scripts/contracts-v2-staging-preflight.mjs`

- Staging expected: `028, 029, 030, 031, 032, 034, 035`
- `033` → `SKIP_LOCAL_ONLY`
- Bucket: aponta para validação remota (não mais “NOT created”)
- `nextGate`: `READY_FOR_STAGING_REMOTE_VALIDATION`
- Continua dry-run local (sem mutação remota)

SSOT: `scripts/supabase/contractsV2StagingMigrations.mjs`

### 2. Validador remoto

`scripts/supabase/runStagingContractsV2Validate.mjs`  
npm: `contracts-v2:staging-validate`

Exige:

```text
CONTRACTS_V2_STAGING_VALIDATE=true
LOVE_ODONTO_STAGING_CONFIRMATION=STAGING_VALIDATE_ONLY
STAGING_SUPABASE_URL=https://tckdjyunwmdpqmewrwvt.supabase.co
SUPABASE_ACCESS_TOKEN
```

Opcional para storage smoke: `STAGING_SUPABASE_SERVICE_ROLE_KEY` (via `.env.local` / env — nunca impressa).

O script:

- NÃO aplica migrations
- consulta `schema_migrations`
- valida schema/RLS/helpers/policies via catálogos Postgres
- cria fixtures fictícias de dois tenants
- testa cross-tenant, imutabilidade, ledger append-only, hash-only
- valida bucket/policies e smoke de storage (service role)
- limpa fixtures (admin `session_replication_role` para tenants descartáveis)
- registra `RUNTIME_NOT_EXERCISED_NO_STAGING_DEPLOY` sem deploy da app

## Como executar (mesmo Terminal do token)

```bash
cd /Users/pauloassis/Desktop/appgestaoodonto-main/appgestaoodonto
git pull origin main

export CONTRACTS_V2_STAGING_VALIDATE=true
export LOVE_ODONTO_STAGING_CONFIRMATION=STAGING_VALIDATE_ONLY
export STAGING_SUPABASE_URL='https://tckdjyunwmdpqmewrwvt.supabase.co'
# SUPABASE_ACCESS_TOKEN já deve estar no Terminal

npm run contracts-v2:staging-validate
```

Esperado: `"status": "STAGING_VALIDATE_PASS"`.

## Resultados remotos

Preencher após a execução no Terminal (sanitizado):

| Área | Resultado |
|------|-----------|
| Migrations remote | _pending execution_ |
| Migration 033 | deve permanecer ausente |
| Schema | _pending_ |
| RLS / cross-tenant | _pending_ |
| Immutability | _pending_ |
| Ledger | _pending_ |
| Sessions/challenges | _pending_ |
| Rate limiting | _pending_ |
| Bucket / policies | _pending_ |
| Storage smoke | _pending_ |
| Runtime | `RUNTIME_NOT_EXERCISED_NO_STAGING_DEPLOY` |
| Feature flags | 15/15 false (env + defaults) |
| Delivery | disabled |
| Legacy | static OK; UI não smokeada sem deploy |
| Fixtures / cleanup | _pending_ |
| Production touched | no |

## Testes locais (tooling)

- `phase1013d` — preflight alignment + guard fail-closed
- `phase1012` — atualizado para 035 / SKIP 033
- `vite build` — OK

## Gate

```text
READY_FOR_REMOTE_VALIDATE_EXECUTION
```

Após `STAGING_VALIDATE_PASS` no Terminal →  
`READY_FOR_STAGING_FEATURE_FLAG_PILOT_APPROVAL`

Não iniciar piloto automaticamente. Não ativar flags.

## Segurança

- Token nunca impresso / gravado em relatório
- Produção bloqueada no guard
- Fixtures fictícias apenas
- Sem dual-write / cutover / IndexedDB / generatedContracts
