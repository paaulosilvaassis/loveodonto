# PHASE_10.13C — FIX STAGING STORAGE POLICY FUNCTION

## Status

**READY_FOR_STAGING_035_REAPPLY** (correção versionada; apply remoto pendente no Terminal do usuário)

## Causa raiz

A migration `035` referenciava:

```text
public.app_user_has_active_tenant_membership(uuid)
```

Essa função é criada pela migration **026** (`app_security_hardening_membership_jwt_rls`), que **não** faz parte do pipeline Contracts V2 de staging (`028–032`, `034`, `035`).

O apply remoto retornou:

```text
ERROR 42883: function public.app_user_has_active_tenant_membership(uuid) does not exist
```

A `035` **não** foi registrada em `schema_migrations` (falha antes do record).

## Função correta

| Fonte | Função | Assinatura |
|-------|--------|------------|
| Repo 026 (não no pipeline staging V2) | `app_user_has_active_tenant_membership` | `(uuid) → boolean` |
| Repo 002 / usada em 029 (já no staging) | `app_user_can_access_tenant` | `(text) → boolean` |
| Repo 024 / usada em 033 local | `app_user_is_tenant_member` | `(uuid) → boolean` |

**Correção:** policy SELECT da `035` passou a usar o mesmo helper consolidado da `029`:

```text
public.app_user_can_access_tenant(
  public.contracts_v2_private_storage_tenant_id(name)::text
)
```

com `auth.uid() is not null`, path canônico válido e `tenant_id` extraído não-nulo.

## Estado remoto (pré-correção / pós-falha)

| Item | Estado |
|------|--------|
| Staging ref | `tckdjyunwmdpqmewrwvt` |
| Produção | intocada (`uoepkwhqztmsjnzirpev` bloqueado) |
| Versions aplicadas | `028`, `029`, `030`, `031`, `032`, `034` |
| `033` | local-only — não aplicar |
| `035` em `schema_migrations` | **ausente** |
| Bucket | `contracts-v2-private-staging`, `public=false` |
| Policies `contracts_v2_private_staging_*` | ausentes/incompletas (CREATE POLICY falhou) |
| Objetos parciais da 035 | possíveis (DDL até o CREATE POLICY); migration é idempotente |
| Flags | 15/15 false |
| Delivery | disabled |

## Alterações versionadas

- `supabase/migrations/035_app_contract_private_storage_staging.sql`
- teste estático em `phase1012ProductionHardeningCorsAndStagingPrep.test.js`
- este relatório

Checksum prefix (sha256) da 035 corrigida: `92e158800a59`

## Retomada (Terminal do usuário — não pelo agente)

```bash
cd /Users/pauloassis/Desktop/appgestaoodonto-main/appgestaoodonto
npm run contracts-v2:staging-apply:execute
```

Esperado:

```text
028 SKIP
029 SKIP
030 SKIP
031 SKIP
032 SKIP
034 SKIP
035 APPLY OK
status APPLY_COMPLETED / STAGING_APPLY_PASS
```

## Gate

```text
READY_FOR_STAGING_035_REAPPLY
```

Não iniciar piloto. Não ativar flags.
