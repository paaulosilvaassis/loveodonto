# PHASE_10.13E — STAGING VALIDATOR FIXTURES (`created_by` NOT NULL)

## Status

**READY_FOR_STAGING_VALIDATE_RERUN**

## Causa exata

A migration `028` define:

```text
public.app_contracts.created_by uuid not null
```

Sem FK para `auth.users` — é um UUID de ator opaco.

O insert de fixtures em `runStagingContractsV2Validate.mjs` omitia `created_by`, gerando:

```text
ERROR 23502: null value in column "created_by" of relation "app_contracts"
violates not-null constraint
```

Migrations/schema/RLS/bucket/produção **não** foram alterados.

## Correção

Arquivo:

```text
scripts/supabase/runStagingContractsV2Validate.mjs
```

- `INSERT` em `app_contracts` passa a incluir `created_by = ID.actor` (mesmo ator fictício já usado em `app_contract_versions` e `app_signature_envelopes`).
- Não cria usuário em `auth.users`.
- Não remove o NOT NULL.
- `cleanupFixtures` passa a rodar em `finally`, inclusive após falha parcial do seed.

## Testes / build

- `npm run test:supabase:phase1013d` — OK
- `vite build` — OK

## Retomada (Terminal do usuário)

```bash
cd /Users/pauloassis/Desktop/appgestaoodonto-main/appgestaoodonto
git pull origin main

export CONTRACTS_V2_STAGING_VALIDATE=true
export LOVE_ODONTO_STAGING_CONFIRMATION=STAGING_VALIDATE_ONLY
export STAGING_SUPABASE_URL='https://tckdjyunwmdpqmewrwvt.supabase.co'
# SUPABASE_ACCESS_TOKEN já no Terminal

npm run contracts-v2:staging-validate
```

Esperado: `"status": "STAGING_VALIDATE_PASS"`.

## Gate

```text
READY_FOR_STAGING_VALIDATE_RERUN
```

Não ativar feature flags. Não iniciar piloto.
