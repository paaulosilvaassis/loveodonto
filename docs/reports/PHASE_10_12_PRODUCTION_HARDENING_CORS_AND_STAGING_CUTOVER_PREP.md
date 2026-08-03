# PHASE_10.12 — PRODUCTION HARDENING, CORS ALLOWLIST AND CONTROLLED STAGING CUTOVER PREPARATION

## 1. Baseline

| Item | Valor |
|------|-------|
| Branch | `main` |
| HEAD | `b95eff1b5f151326b218d0f97482bb387c12f993` |
| Working tree | Phases 10.2–10.12 não commitadas |
| Cutover | **não realizado** |
| Feature flags | todas `false` |
| Remote apply / bucket / deploy / commit | **não** |

## 2. Working tree audit

Inventário factual (sem limpeza automática):

- Branch `main`, HEAD `b95eff1`
- Tracked diff ~11 arquivos (+415/−66 aprox.) — hotspots: `server/index.js`, `catalog.js`, shell/UI, `package.json`
- Untracked: `src/domain/contracts/**`, `src/repositories/contracts/**`, APIs V2, pages v2, migrations `028–034`, fixtures, scripts, reports
- Não relacionados / temporários: `.cursor/debug-*.log`, `debug-68fcb4.log`, `.DS_Store`, `collaborators-export.json` (possível PII), `erro_supabase.txt`, `tsconfig.tsbuildinfo`
- Migration `006` **intacta**; mirrors `028–034` SHA-256 OK
- Nenhum secret real no changeset; `.env` real não alterado
- Mentions de refs remotos apenas em blocklists/guards

Ver também: `docs/reports/PHASE_10_CHANGESET_MANIFEST.md` + `.json`

## 3. Changeset manifest

Criado:

- `docs/reports/PHASE_10_CHANGESET_MANIFEST.md`
- `docs/reports/PHASE_10_CHANGESET_MANIFEST.json`

## 4. Checkpoint status (sem commit)

Comandos recomendados (somente leitura):

```bash
git status --short
git rev-parse HEAD
git branch --show-current
git diff --stat
git diff --name-status
```

**Não executado:** `git add`, `git commit`, `git push`, `git reset --hard`, `git clean -fd`.

Patch local opcional fora do repo: não gerado nesta sessão (evitar exposição).

## 5. CORS

Política tipada: `src/domain/contracts/runtime/contracts-v2-public-cors.ts`  
Mirror Express: `server/lib/contractsV2PublicSecurity.js`

Rotas cobertas:

- `/public/signatures-v2/*`
- UI pública `/assinar/v2/*` (mesmos headers via página + API)

Regras: allowlist explícita; sem wildcard; sem reflexão automática; `null` origin negado; sem Origin = non-browser OK sem `Access-Control-Allow-Origin`; credentials `false`; methods `GET,POST,OPTIONS`.

## 6. Allowed origins

```ts
local/test → 127.0.0.1/localhost :5173/:4173/:3000
staging → [] (exige CONTRACTS_V2_PUBLIC_ALLOWED_ORIGINS)
production → [] (indisponível nesta fase)
```

Erro: `CONTRACTS_V2_PUBLIC_ORIGIN_CONFIGURATION_REQUIRED`

## 7. Security headers

Centralizados (`contracts-v2-security-headers.ts` + JS):

- Cache-Control: `no-store, private`
- Pragma: `no-cache`
- Referrer-Policy: `no-referrer`
- X-Content-Type-Options: `nosniff`
- X-Frame-Options: `DENY`
- CSP (sem scripts externos / frames / object)
- X-Robots-Tag: `noindex, nofollow, noarchive`
- Permissions-Policy restritiva

## 8. Trust proxy

`TrustedClientAddressResolver` + `CONTRACTS_V2_TRUST_PROXY` (hops numéricos).

- hops=`0` (default): ignora `X-Forwarded-For`
- hops≥1: extrai IP do hop confiável; valida formato; expõe `ipHash`
- Spoofing sem trust configurado é ignorado

## 9. Rate limiting

Matriz: `PublicSigningRateLimitConfig` (OPEN/VIEW/CHALLENGE/VERIFY/ACCEPT/SIGN/DECLINE/STATUS/DOCUMENT).

Adapters:

- memory-test → unit tests
- persisted → `SignatureRateLimitService` (Phase 10.10), restart-safe
- staging default exige persisted; sem serviço → **fail closed**

HTTP wired em `publicSignaturesV2Api.js` (sem token bruto na chave; hint = comprimento).

## 10. Environment configuration

Schema: `loadContractsV2EnvironmentConfig` / `assertContractsV2ConfigOrThrow`

Variáveis: `CONTRACTS_V2_RUNTIME_MODE`, `DATABASE_MODE`, `STORAGE_MODE`, `PUBLIC_BASE_URL`, `PUBLIC_ALLOWED_ORIGINS`, `PRIVATE_BUCKET`, `TRUST_PROXY`, `SIGNING_TOKEN_SECRET`, `STORAGE_SIGNED_URL_TTL`, `RATE_LIMIT_MODE`, `DELIVERY_MODE`

Defaults seguros; log mascarado; placeholders em `.env.example`.

## 11. Runtime modes

Permitidos: `disabled` | `memory-test` | `local-integration` | `staging-disabled`  
**Não criado:** `production-enabled`

`staging-disabled`: infra pode existir; flags OFF; endpoints públicos fechados; harness proibido; delivery disabled.

## 12. Bootstrap

`createContractsV2Runtime({ config, database, storage, delivery, clock, logger })`

- modo explícito obrigatório
- staging nunca memory / never harness
- config inválida aborta
- rotas públicas só mountable em local/memory-test

## 13. Readiness

`ContractsV2RuntimeReadinessService` — estados até `READY_FOR_STAGING_VALIDATION`  
**Nunca** `READY_FOR_PRODUCTION`

## 14. Health check

`GET /internal/app/contracts-v2/runtime-readiness`  
Auth + permissão elevada (`contracts:runtime_readiness` / equivalentes de catálogo). Payload sem secrets.

## 15. Migration reset 028–034

Script: `npm run supabase:local:contracts-v2-phase1012`  
Fixture: `supabase-local/fixtures/contracts_v2_phase1012_validation.sql`  
Fluxo: reset → 028…034 → fixtures → asserts → **duas vezes**  
Requer markers locais; **nunca remoto**.

**Resultado local (esta fase):** `CONTRACTS_V2_PHASE1012_PASS`  
- firstPass=true, secondPass=true, reproducibility=true  
- versions: 028…034  
- remote=false, stagingBucketCreated=false  
- container: `supabase_db_love-odonto-local-disposable`

## 16. Staging migration plan

```text
Preflight → Backup → Apply (aprovação futura) → Verify → Smoke → Rollback decision
```

Auditoria prévia (documental):

| Tema | Nota |
|------|------|
| Lock duration | baixo em DB vazio; revisar em populado |
| Tabelas | 12 tabelas app_* v2 + storage ops |
| RLS/policies | 029 + policies de sessions/delivery |
| Extensions | padrão Supabase local |
| Colisão nomes | prefixo `app_` / `contracts-v2` |
| Legado | `006` / IndexedDB intocados |
| Backup | obrigatório antes de apply remoto futuro |

## 17. Staging storage plan

Bucket planejado: `contracts-v2-private-staging` — **não criado**.

- private; MIME/PDF limitados; path tenant/contract/version
- signed URL TTL curto (≤300s); upload backend-only
- lifecycle/retention a definir na aprovação de apply
- recovery/monitoring documentados como alertas futuros

## 18. Delivery staging plan

Modos: `disabled` | `simulation` (nesta fase)  
Futuro sandbox (só doc): SPF/DKIM/DMARC, templates, mask, rate limit, suppression, bounce, webhook validation — **sem chamadas externas**.

## 19. Public base URL

Validação: HTTPS fora de local; sem query/fragment/path; sem localhost em staging; sem inferência de header.

## 20. Secrets

- nenhum no Git / relatórios / client
- `CONTRACTS_V2_SIGNING_TOKEN_SECRET` ≥32 chars, não trivial
- rotação: trocar secret + reemitir sessões (doc)
- startup falha com secret fraco em local-integration/staging-disabled

## 21. Logging

`createContractsV2SecureLogger` — redige token/OTP/CPF/e-mail/telefone/signed URL/Authorization/cookies/HTML/snapshots.

## 22. Correlation IDs

`resolveContractsV2RequestIds` — requestId sempre server-side; correlation client só se válido; inválidos ignorados.

## 23. Observability

Métricas `contracts_v2_*` (runtime/public/db/storage/signature) sem labels de alta cardinalidade/PII.

## 24. Alerts (propostos, não configurados remotamente)

readiness false; migration mismatch; bucket público; storage integrity; ledger chain; challenge spike; rate limit spike; token failure; delivery failure; rollback; reconciliation backlog; missing signed artifact.

## 25. Flags

Todas as 15 flags default `false` — teste dedicado falha se mudar.

## 26. Harness isolation

Somente `local-integration` / `memory-test` + opt-in explícito; bloqueado em staging; não por header/query/browser.

## 27. Permissions (catalog only, sem roleDefaults)

- `runtime_readiness`
- `staging_preflight`
- `view_security_diagnostics`

## 28. Security test matrix

Coberta em `phase1012ProductionHardeningCorsAndStagingPrep.test.js` (CORS, headers, proxy, rate limit, config, bootstrap, readiness, logging, harness, preflight, mirrors).

## 29. Staging preflight

```bash
npm run contracts-v2:staging-preflight
```

Dry-run fail-closed; não aplica migrations; não cria bucket.

## 30. Tests

| Suite | Resultado |
|-------|-----------|
| phase1012 | 30 passed |
| phase1011 | 14 passed |
| phase1010 | 17 passed |
| phase109 | 16 passed / 1 skipped |
| phase102–108 | all passed |
| staging-preflight | PASS dry-run |

## 31. Commands

```bash
npm run test:supabase:phase1012
npm run contracts-v2:staging-preflight
npm run supabase:local:contracts-v2-phase1012   # local only + markers
```

## 32. Results

Hardening implementado com defaults OFF; Go/No-Go abaixo.

## 33. Regressions

Phase 10.2–10.11 verdes após ajuste de gate `staging-disabled` (sem quebrar fluxo 10.11 com flags injetadas).

## 34. Risks

- Working tree grande (10.2–10.12) — merge hotspot em `server/index.js` / catalog / shell
- Dual reset local depende de Docker + markers
- Persistência HTTP rate-limit em staging exige wiring real do repo Postgres na aprovação futura
- `collaborators-export.json` e logs de debug não devem entrar em commit

## 35. Blockers

Nenhum blocker técnico para **preparação**. Apply em staging permanece **bloqueado por política** até aprovação explícita.

## 36. Go/No-Go

| Decisão | Status |
|----------|--------|
| GO staging apply agora | **NO-GO** (não autorizado nesta fase) |
| READY_FOR_STAGING_APPLY_APPROVAL | **SIM** (condicional à aprovação humana) |
| READY_FOR_PRODUCTION | **NÃO** |

**CONDITIONAL GO** para futura validação em staging após: origins explícitas, secret forte, trust proxy numérico, backup, aprovação de apply.

## 37. Recommended commit strategy (aguardar autorização)

1. `chore(contracts-v2): migrations 028-034 + mirrors + fixtures`
2. `feat(contracts-v2): domain foundation 10.2–10.8`
3. `feat(contracts-v2): persistence repositories 10.9–10.10`
4. `feat(contracts-v2): public signing + delivery simulation 10.11`
5. `feat(contracts-v2): production hardening CORS/runtime 10.12`
6. `docs(contracts-v2): phase 10 reports + changeset manifest`
7. **Excluir:** logs, `.DS_Store`, `collaborators-export.json`, `tsconfig.tsbuildinfo`

## 38. Gate

```text
READY_FOR_STAGING_APPLY_APPROVAL
```

## 39. Next recommended phase

**Phase 10.13** (sugerida): Staging Apply Approval & Controlled Smoke (somente após autorização explícita) — apply migrations em staging, criar bucket privado staging, smoke sem ativar flags de produção, sem cutover legado.
