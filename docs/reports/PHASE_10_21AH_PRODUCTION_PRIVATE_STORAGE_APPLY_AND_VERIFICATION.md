# PHASE_10.21AH — PRODUCTION PRIVATE STORAGE APPLY AND VERIFICATION

**Date:** 2026-08-13  
**Project:** `uoepkwhqztmsjnzirpev` (`love-odonto-prod`)  
**Environment:** PRODUCTION  
**Authorization:** aplicar exclusivamente `040_app_contract_private_storage_production.sql`  
**Canal:** MCP `execute_sql` / history `app_contract_private_storage_production` (`20260813141505`) — **não** `supabase db push`  
**033 / 035:** não aplicadas (local-only / staging-only)  
**Fixture storage:** nenhuma (`TECH_SMOKE_1021AH_` não criada — isolamento provado por helpers + policies)  
**HARD STOP:** nenhum paciente real, contrato real, envio, ou PUT de rollout.

---

Project: `uoepkwhqztmsjnzirpev` (PRODUCTION, `ACTIVE_HEALTHY`)
Migration 040: APPLIED
Bucket: `contracts-v2-private-production`
Public: false
Mime: application/pdf, application/json, image/png, image/webp, image/jpeg, text/plain
Size limit: 20971520

Anon: DENIED
Own tenant: PASS (SELECT autenticado + path canônico `tenants/{tenantId}/contracts/{id}/versions/{ver}/…` + `app_user_can_access_tenant(text)`; JWT simulado own=true)
Cross-tenant: DENIED (JWT simulado cross=false; sem policies INSERT/UPDATE/DELETE authenticated)
Service role: PASS

Runtime: FAIL
Package storage: PASS
Public signature safety: PASS

Fixture: NONE
Cleanup: PASS

037 regression: PASS
038 regression: PASS
039 regression: PASS

V1: PASS
Rollout: global=true / tenant piloto=true / outros=0 (READ ONLY, sem PUT)

Clinical rows delta: 0
Signature rows delta: 0
Manifest rows delta: 0
Acceptance rows delta: 0
Storage objects delta: 0

Tests: PASS
Build: PASS

Critical: 0
High: 0
Medium: 0
Low: 0

Remaining blockers: published V2 storage adapter ainda allowlist `contracts-v2-private-local` / mode `local-test`; `CONTRACTS_V2_RUNTIME_MODES` sem modo production-enabled; runtime não faz bind em `contracts-v2-private-production` (env/deploy wiring ausente). Bucket live não é suficiente para o primeiro caso real V2.
Decision: BLOCKED
Gate: BLOCKED_WAITING_PRODUCTION_PRIVATE_STORAGE_RUNTIME

---

## Notas de auditoria (não alteram a decisão)

- Path oficial: `tenants/{tenantUuid}/contracts/{contractId}/versions/{versionId}/[envelopes/{envelopeId}/]{fileType}/{fileId}.{ext}`
- Policies live: somente `contracts_v2_private_production_select` FOR SELECT TO authenticated. Nenhuma `USING(true)` / `WITH CHECK(true)`. Writes authenticated: deny-by-default.
- Buckets V2: somente `contracts-v2-private-production` (não criou local/staging).
- Download previsto: signed URL (`createSignedUrl`); adapter não usa `getPublicUrl`. Página pública V2: `FEATURE_FLAG_DISABLED` (403). Bucket permanece privado.
- Site `https://loveodonto.com.br/` HTTP 200; Railway `/health` 200 `saas-admin-api`; rollout/contracts-v2 unauth 401.
- 040 history presente; 033/035 ausentes no history.
- Nenhum secret impresso.

---

## Line-ending checksum reconciliation — OD-0E/OD-0F

| Cópia | SHA-256 |
|-------|---------|
| Histórica CRLF | `7e48c1699d0c4a6f7644d37ade598beee2a456448ce0a26809423c3d51751760` |
| Canônica LF (`supabase/migrations/040_…`) | `70667817ce3207ebc7d76852e25cc26014b80bb3d4f43925bcc0e77953814410` |

- A diferença corresponde exclusivamente aos 245 caracteres `CR`.
- O SQL normalizado é idêntico.
- Não existe diferença semântica.
- Não é necessária migration 041.
- Não é necessário reaplicar 040.
- O header histórico “DO NOT APPLY” pertence ao estágio AG anterior ao apply AH e **não** deve provocar reexecução.
