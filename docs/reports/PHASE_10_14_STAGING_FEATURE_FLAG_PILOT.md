# PHASE_10.14 — STAGING FEATURE FLAG PILOT

## Status

**READY_FOR_STAGING_PILOT_EXECUTION** (código entregue; execução remota no Terminal)

Pré-requisito: `PHASE_10.13D` = `STAGING_VALIDATE_PASS`.

## Objetivo

Primeiro piloto funcional Contracts V2 em staging (`tckdjyunwmdpqmewrwvt`), isolado em tenant técnico fictício, sem flags globais e sem impacto em produção.

## Tenant técnico

| Campo | Valor |
|-------|-------|
| Código | `STAGING_CONTRACTS_PILOT` |
| UUID | `c0140000-1111-4111-8111-111111111014` |
| Dados | 100% fictícios |
| Isolamento | flags só neste tenant (+ allowlist staging-only) |

## Feature flags

### Aliases de produto (10.14)

```text
contracts.v2.templates
contracts.v2.instances
contracts.v2.signatures
contracts.v2.pdf
contracts.v2.storage
```

Mapeiam para as flags canônicas existentes (15 flags oficiais **não removidas**; defaults permanecem `false`).

### Precedência

```text
overrides > piloto staging (tenant técnico + host staging) > tenantFlags (canônicas/aliases) > env VITE_* > false
```

### Rotas liberadas (somente se flags do tenant permitirem)

```text
/gestao/contratos/modelos-v2
/gestao/contratos/instancias-v2
/gestao/contratos/assinaturas-v2
/gestao/contratos/documentos-v2
```

Wiring: `ProtectedApp` + `ContractsShellLayout` passam `tenantId`/`tenantFlags` via `buildContractFeatureFlagContext`.

## Artefatos

| Artefato | Path |
|----------|------|
| Pilot module | `src/domain/contracts/staging/contracts-v2-staging-pilot.ts` |
| Flag resolution | `src/domain/contracts/contract-feature-flags.ts` |
| Remote pilot script | `scripts/supabase/runStagingContractsV2Pilot.mjs` |
| npm | `contracts-v2:staging-pilot` |
| Tests | `src/__tests__/phase1014StagingFeatureFlagPilot.test.js` |

## Smoke

### Domínio (in-memory, sempre)

`phase1014` cobre:

- isolamento de flags (piloto vs outro tenant)
- bloqueio de produção
- aliases `contracts.v2.*`
- PDF/storage → assinatura → `SIGNED` → ledger sequencial

### Remoto (Terminal)

`npm run contracts-v2:staging-pilot`:

1. upsert tenant piloto
2. seed `feature_flags` tenant-scoped (se a tabela existir)
3. roda `phase1014`
4. storage smoke no bucket `contracts-v2-private-staging`
5. cleanup (flags/objetos/tenant)

## Como executar

No **mesmo Terminal** com `SUPABASE_ACCESS_TOKEN`:

```bash
cd /Users/pauloassis/Desktop/appgestaoodonto-main/appgestaoodonto
git pull origin main

export CONTRACTS_V2_STAGING_PILOT=true
export LOVE_ODONTO_STAGING_CONFIRMATION=STAGING_PILOT_ONLY
export STAGING_SUPABASE_URL='https://tckdjyunwmdpqmewrwvt.supabase.co'
# SUPABASE_ACCESS_TOKEN já presente
# opcional: STAGING_SUPABASE_SERVICE_ROLE_KEY via .env.local

npm run contracts-v2:staging-pilot
```

Para manter o tenant após o run (flags/objetos ainda são limpos por padrão no finally — use com cuidado):

```bash
npm run contracts-v2:staging-pilot -- --keep-tenant
```

Esperado: `"status": "STAGING_PILOT_PASS"` → gate `READY_FOR_INTERNAL_BETA_APPROVAL`.

## Rollback

1. Remover rows `feature_flags` do tenant piloto
2. Remover tenant `STAGING_CONTRACTS_PILOT`
3. Remover objetos `*contracts-v2-staging-pilot-10-14*` do bucket
4. Manter todas as `VITE_*` Contracts V2 em `false`
5. Allowlist de código só ativa com host staging + tenant UUID piloto

## Riscos

| Risco | Mitigação |
|-------|-----------|
| Flag global VITE ligada | Guard do pilot falha se VITE_* true |
| Produção | `PRODUCTION_REF` bloqueado; allowlist exige staging |
| Clínicas reais | Tenant técnico fictício apenas |
| UI sem deploy staging | Rotas wired; smoke domínio in-memory + storage remoto |

## Gate

```text
READY_FOR_STAGING_PILOT_EXECUTION
```

Após `STAGING_PILOT_PASS`:

```text
READY_FOR_INTERNAL_BETA_APPROVAL
```

Não iniciar beta interno automaticamente. Não ativar produção.
