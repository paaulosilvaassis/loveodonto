# PHASE_10.21AI — PRODUCTION PRIVATE STORAGE RUNTIME BINDING

**Date:** 2026-08-13  
**Project:** `uoepkwhqztmsjnzirpev` (PRODUCTION)  
**Commit:** `d0becdb` — `fix(contracts): bind private storage runtime in production`  
**HARD STOP:** nenhum paciente real, contrato real, envio ou PUT de rollout.

---

Root cause: adapter `createSupabaseContractPrivateStorage` e `CONTRACTS_V2_STORAGE_MODE` só conheciam `local-test` / `private-local` / `private-staging-configured`; production não tinha modo nem allowlist. Sem fallback, o runtime nunca fazia bind em `contracts-v2-private-production`.
Runtime file/function: `src/domain/contracts/files/contracts-v2-private-storage-binding.ts` → `resolveContractsV2PrivateStorageBinding`; adapter `createSupabaseContractPrivateStorage`; server `server/lib/contractsV2PrivateStorageBinding.js`
Production binding: IMPLEMENTED (fail-closed) — LIVE ainda UNBOUND (Railway env ausente)
Production bucket: `contracts-v2-private-production`
Fail-closed: PASS (unitário; production+staging/local/projeto errado/bucket ausente → deny)
Railway env: NOT SET (`CONTRACTS_V2_STORAGE_MODE` / `CONTRACTS_V2_PRIVATE_BUCKET`)
Vercel env: N/A (storage runtime é backend; sem `VITE_*` de bucket/secret)
Secrets exposure: PASS (nenhum `VITE_` de service role / signing secret / bucket)

Tests: PASS
Build: PASS

Commit: `d0becdb`
Push: `origin/main` (`2331cab..d0becdb`)
Railway deploy: PASS (`kind-victory / production`, success)
Vercel deploy: PASS (`Production – loveodonto`, site HTTP 200)

Runtime smoke: FAIL (código publicado; bucket não bound)
Resolved bucket: `null` (mode=`unavailable`, bound=false, ok=true — V1 não quebra)
Upload/read: NOT RUN (runtime unbound; fixture não criada)
Signed access: PASS (arquitetura: `createSignedUrl` / token temporário; sem `getPublicUrl`; V2 público 403 `FEATURE_FLAG_DISABLED`)
Cleanup: PASS (nenhuma fixture)

Contract artifact: PASS (resolver → production bucket quando bound)
TCLE snapshot: PASS (mesmo bucket quando bound)
LGPD snapshot: PASS (mesmo bucket quando bound)
Evidence: PASS (mesmo bucket quando bound)
Signed package report: PASS (mesmo bucket quando bound)

Anon: DENIED
Own tenant: PASS
Cross-tenant: DENIED
Service role: PASS

V1: PASS
Rollout: UNCHANGED (global=true / tenant piloto=true / outros=0)

Clinical rows delta: 0
Signature rows delta: 0
Manifest rows delta: 0
Acceptance rows delta: 0
Storage objects delta: 0

Critical: 0
High: 0
Medium: 0
Low: 0

Remaining blockers: configurar no Railway (serviço `appgestaoodonto` / env production), **sem** `VITE_*` e **sem** mudar runtime mode:

```
CONTRACTS_V2_STORAGE_MODE=private-production
CONTRACTS_V2_PRIVATE_BUCKET=contracts-v2-private-production
```

Redeploy. Confirmar `/health`.`contractsV2Storage` = `{ mode: "private-production", bucket: "contracts-v2-private-production", bound: true, ok: true }`.
Decision: BLOCKED
Gate: `BLOCKED_WAITING_RAILWAY_PRODUCTION_STORAGE_ENV`

---

## Auditoria (modo → bucket)

| Modo | Bucket |
|------|--------|
| `private-production` | `contracts-v2-private-production` |
| `private-staging-configured` | `contracts-v2-private-staging` |
| `private-local` / adapter `local-test` | `contracts-v2-private-local` |
| `unavailable` / `memory` | nenhum (não bound; sem fallback) |

Project production obrigatório: `uoepkwhqztmsjnzirpev`.  
Staging `tckdjyunwmdpqmewrwvt` em modo production: HARD FAIL.

040 permanece aplicada. Nenhuma migration nesta fase.
