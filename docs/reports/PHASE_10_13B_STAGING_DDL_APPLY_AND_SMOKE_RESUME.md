# PHASE_10.13B — STAGING DDL APPLY AND CONTROLLED SMOKE RESUME

## Status

**BLOCKED_WAITING_STAGING_DDL_CREDENTIALS** (preflight)

O processo do agente não herdou as variáveis do Terminal do usuário.

## Preflight (sem valores)

| Check | Resultado |
|-------|-----------|
| `SUPABASE_ACCESS_TOKEN` | **MISSING** |
| `CONTRACTS_V2_STAGING_APPLY=true` | **DISABLED** |
| `LOVE_ODONTO_STAGING_CONFIRMATION=STAGING_APPLY_ONLY` | **INVALID** |
| `STAGING_SUPABASE_URL` | não definida no processo do agente |
| CLI `~/.supabase/access-token` | ausente |
| Supabase MCP | indisponível |

## Baseline

| Item | Valor |
|------|-------|
| Branch | `main` |
| Remote HEAD (início) | `712cca3` |
| Staging ref | `tckdjyunwmdpqmewrwvt` |
| Production ref | `uoepkwhqztmsjnzirpev` (**bloqueado**) |
| Bucket | `contracts-v2-private-staging` (já criado, `public=false`) |
| Flags | 15/15 false |
| Delivery | disabled |

## Runner preparado

`scripts/supabase/runStagingContractsV2Apply.mjs` atualizado para Phase 10.13B:

- ordem: `028 → 029 → 030 → 031 → 032 → 034 → 035`
- `033` nunca aplicada
- consulta `schema_migrations` antes do apply
- skip de versões já aplicadas
- registro de versão após apply
- sanitização de token/Authorization nos logs

## Como desbloquear (no Terminal da sessão — NÃO colar token no chat)

```bash
cd /Users/pauloassis/Desktop/appgestaoodonto-main/appgestaoodonto

export SUPABASE_ACCESS_TOKEN='…'   # só neste terminal
export CONTRACTS_V2_STAGING_APPLY=true
export LOVE_ODONTO_STAGING_CONFIRMATION=STAGING_APPLY_ONLY
export STAGING_SUPABASE_URL=https://tckdjyunwmdpqmewrwvt.supabase.co

# verificação sem valores
test -n "$SUPABASE_ACCESS_TOKEN" && echo SUPABASE_ACCESS_TOKEN_PRESENT
test "$CONTRACTS_V2_STAGING_APPLY" = "true" && echo STAGING_APPLY_ENABLED
test "$LOVE_ODONTO_STAGING_CONFIRMATION" = "STAGING_APPLY_ONLY" && echo STAGING_CONFIRMATION_OK

npm run contracts-v2:staging-apply:execute
```

Em seguida, pedir ao agente para retomar validações/smoke **na mesma sessão de terminal** (ou reexportar as variáveis no ambiente do agente).

## Apply / Schema / RLS / Smoke

Não executados nesta rodada — canal DDL não disponível ao agente.

## Produção

Intocada.

## Gate

```text
BLOCKED_WAITING_STAGING_DDL_CREDENTIALS
```

## Next

Retomar apply + smoke assim que o preflight retornar `PRESENT` / `ENABLED` / `OK`.
