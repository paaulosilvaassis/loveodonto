# PHASE_10.13 — CONTROLLED STAGING APPLY AND SMOKE VALIDATION

## 1. Autorização

Autorizado: push dos 7 commits, apply staging-only, bucket staging, smoke, docs.  
**Não autorizado:** produção, flags ON, delivery real, cutover, dados reais.

## 2. Baseline

| Item | Valor |
|------|-------|
| Branch | `main` |
| Baseline local pré-fase | `4740f55` |
| origin/main anterior | `b95eff1` |
| Commits iniciais pushed | 7 (`7edea24`…`4740f55`) |
| Commit adicional 10.13 | `5e0e5f9` (migration 035 + runner) |

## 3. Commits enviados

```text
7edea24 chore(contracts-v2): add migrations 028-034, fixtures and local runners
860c292 feat(contracts-v2): add domain foundation through runtime hardening
0785bde feat(contracts-v2): add persistence repositories and environment guards
4cf9899 feat(contracts-v2): wire APIs, UI routes, services and public signing
fe151b2 test(contracts-v2): add Phase 10.2-10.12 regression suites
ce57961 docs(contracts-v2): add Phase 10 reports and changeset manifest
4740f55 docs(contracts-v2): add Phase 10 local checkpoint validation report
5e0e5f9 chore(contracts-v2): add staging private storage migration
```

Force push: **não**.

## 4. Remote HEAD

`origin/main` = `5e0e5f9` (após push do commit 035).  
Os sete commits autorizados estão contidos no histórico.

## 5. Environment guard

| Ambiente | Project ref (mascarável) | Uso |
|----------|--------------------------|-----|
| Staging | `tckd…wvt` (`tckdjyunwmdpqmewrwvt`) | allowlisted |
| Production | `uoep…pev` (`uoepkwhqztmsjnzirpev`) | **bloqueado** |
| Local | `love-odonto-local-disposable` | não usado para remoto |

Erro: `CONTRACTS_V2_STAGING_ENVIRONMENT_REQUIRED`

## 6. Backup

Backup lógico pré-apply **não executável** sem canal DDL (`STAGING_DATABASE_URL` / `SUPABASE_ACCESS_TOKEN`).  
Snapshot parcial via API: tenant staging `implanprime-staging` presente; bucket list capturada antes/depois.

## 7. Migrations aplicadas em staging

| Migration | Status |
|-----------|--------|
| 028–032 | **NÃO aplicadas** (tabelas `app_contract_*` / `app_signature_*` ausentes no schema cache) |
| 033 | **NÃO aplicada** (LOCAL-ONLY por design) |
| 035 | Versionada + pushed; **SQL não aplicado** (sem canal DDL) |
| 034 | **NÃO aplicada** |

Observação: probe inicial com `head:true` gerou falso positivo de existência; `select` confirmou ausência (`Could not find the table … in the schema cache`).

## 8. Migrations em produção

**Nenhuma.** Produção não foi alvo de apply/bucket/DDL.

## 9. Storage migration

`035_app_contract_private_storage_staging.sql` — bucket `contracts-v2-private-staging`, schema storage ops idempotente, policies SELECT tenant-scoped; sem INSERT authenticated.

## 10. Staging bucket

Criado via Storage API (service role staging):

| Campo | Valor |
|-------|-------|
| id | `contracts-v2-private-staging` |
| public | **false** |
| file_size_limit | 20971520 |
| MIME allowlist | pdf/json/png/webp/jpeg/text |
| local bucket | ausente |

## 11–18. Schema / RLS / FKs / imutabilidade / ledger / sessions / rate limit / runtime

**Não validados em staging** — dependem das migrations DDL ainda não aplicadas.

Runtime config staging (`staging-disabled`, flags OFF, delivery disabled) **não foi escrita** em secret manager remoto nesta sessão (sem acesso ao painel/Vercel/Railway staging confirmado).

## 19. CORS / Trust proxy

Código já presente no repositório (Phase 10.12). Configuração de origem oficial de staging **não definida** no ambiente remoto (origins staging exigem allowlist explícita).

## 20. Smoke tests

Bloqueados pela ausência de schema v2. Storage smoke limitado: bucket privado criado; objeto público HTTP negado não exercitado após upload fixture (sem schema de metadados).

## 21. Legado

Staging Auth health 200; tenant legado de staging responde. Fluxo completo de UI legado **não** exercido nesta sessão (sem deploy staging app apontando).

## 22. Blockers

1. **Canal DDL ausente:** falta `STAGING_DATABASE_URL` (+ `psql`) **ou** `SUPABASE_ACCESS_TOKEN` (Management API).
2. **`psql` não instalado** no ambiente do agente.
3. **Supabase MCP** indisponível nesta sessão.
4. Migrations 028–032/034/035 ainda não estão no banco staging.

## 23. Como desbloquear (operador)

```bash
# Opção A — Database URL staging (Settings → Database)
export CONTRACTS_V2_STAGING_APPLY=true
export LOVE_ODONTO_STAGING_CONFIRMATION=STAGING_APPLY_ONLY
export STAGING_SUPABASE_URL=https://tckdjyunwmdpqmewrwvt.supabase.co
export STAGING_DATABASE_URL='postgresql://postgres.***:***@aws-0-sa-east-1.pooler.supabase.com:5432/postgres'
# garantir host staging / ou CONTRACTS_V2_STAGING_DB_HOST_CONFIRMED=true após revisão
npm run contracts-v2:staging-apply:execute

# Opção B — Access token CLI
export SUPABASE_ACCESS_TOKEN=...   # supabase login / account token
# + mesmos markers CONTRACTS_V2_STAGING_APPLY / CONFIRMATION / STAGING_SUPABASE_URL
npm run contracts-v2:staging-apply:execute
```

Depois: smoke RLS/ledger/sessions, readiness, limpeza de fixtures, atualizar este relatório.

## 24. Testes locais (pré-push)

| Check | Resultado |
|-------|-----------|
| Phase 10 tests | 255 passed / 1 skipped |
| Build | OK |
| Staging preflight dry-run | PASS |
| Force push | não |

## 25. Go/No-Go

| Decisão | Status |
|----------|--------|
| Push dos commits Phase 10 | **GO** (concluído) |
| Bucket staging privado | **GO** (criado) |
| Apply migrations staging | **NO-GO** (blocker DDL) |
| READY_FOR_STAGING_FEATURE_FLAG_PILOT_APPROVAL | **NÃO** |
| READY_FOR_PRODUCTION | **NÃO** |

**Veredicto Phase 10.13:** `CONDITIONAL / BLOCKED_DDL_CHANNEL`

## 26. Gate

```text
BLOCKED_WAITING_STAGING_DDL_CREDENTIALS
```

(próximo gate desejado após desbloqueio: `READY_FOR_STAGING_FEATURE_FLAG_PILOT_APPROVAL`)

## 27. Próxima fase recomendada

Retomar **Phase 10.13b** (continuaçao): fornecer canal DDL → apply 028–032/035/034 → RLS/smoke → readiness → limpeza → reavaliar gate.
