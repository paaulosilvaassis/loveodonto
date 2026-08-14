# PHASE_10.21AG — PRODUCTION TECHNICAL SMOKE

**Status:** COMPLETE  
**Gate:** `BLOCKED_WAITING_PRODUCTION_PRIVATE_STORAGE`  
**Date:** 2026-08-12  
**Project:** `uoepkwhqztmsjnzirpev` (`love-odonto-prod`)  
**Environment:** PRODUCTION

Nenhum PUT de rollout. Nenhum paciente real. Nenhuma fixture persistida. 040 **não aplicada**.

---

## Project / runtime

| Field | Result |
|-------|--------|
| Project | `uoepkwhqztmsjnzirpev` |
| Railway | **PASS** `/health` HTTP 200 `saas-admin-api` |
| Vercel / site | **PASS** `https://loveodonto.com.br/` HTTP 200 |

---

## Schema runtime

`PRODUCTION_SCHEMA_RUNTIME = PASS`

Objetos presentes: contracts, versions, envelopes, ledger, numbering, sessions/challenges, delivery attempts, package manifests, manifest documents, document acceptances.

API unauth (sem JWT):

| Endpoint | HTTP | Nota |
|----------|------|------|
| `/internal/app/contracts-v2` | 401 | Token ausente — rota viva, sem 42P01 |
| `/internal/app/contracts-v2/runtime-readiness` | 401 | idem |
| `/internal/app/contracts/operational-rollout` | 401 | idem |
| `/public/signatures-v2/:token/status` | 403 | `FEATURE_FLAG_DISABLED` — rota viva, sem schema missing |

---

## Package manifest runtime

`PACKAGE_MANIFEST_RUNTIME = PASS`

Prova in-memory (suites 10.21U/V): canonicalização → hashes → freeze → sign gate → acceptance.  
`canonicalizationVersion = pkg_manifest_v1`. Sem persistência em production.

---

## Private storage

| Field | Result |
|-------|--------|
| Private storage required | **YES** (classificação **B**) |
| Private storage current | **ABSENT** |
| Private storage decision | `PRIVATE_STORAGE_PRODUCTION = BLOCKED_MISSING` |
| Migration required | `040_app_contract_private_storage_production.sql` (**prepared, NOT applied**) |

### Auditoria

1. PDFs/artefatos assinados (caminho V2): `app_contract_files` + bucket privado; path `tenants/{tenant}/contracts/{id}/versions/{ver}/…`
2. Evidence: `SIGNATURE_EVIDENCE` / evidence report → mesmo bucket + `app_contract_files`
3. Contrato final / TCLE / LGPD congelados: package manifest (DB) + snapshots de arquivo no bucket
4. UX operacional atual (IndexedDB `patientFiles`) **não** substitui storage V2 — fallback inseguro recusado
5. Runtime espera `CONTRACTS_V2_PRIVATE_BUCKET`; modos atuais só `private-local` / `private-staging-configured` — **não há modo production**
6. Buckets live: somente `clinic-logos` (public) e `email-assets` (public)
7. Ausente: bucket, `app_contract_files.status/purpose/envelope_id`, `app_contract_storage_ops`, path helpers
8. Policies necessárias (na 040, não aplicadas): SELECT authenticated tenant-scoped; INSERT/UPDATE/DELETE só `service_role`; `public=false`

033/035 **não** aplicadas (correto). 040 **não** aplicada nesta fase.

---

## RLS

`PRODUCTION_RLS_RUNTIME = PASS`

| Role | Result |
|------|--------|
| Anon | DENIED (036 revoke; 029 policies exigem `auth.uid()`) |
| Own tenant | PASS (helper text/uuid) |
| Cross-tenant | DENIED |
| Service role | PASS |

---

## Rollout

`ROLLOUT_ISOLATION = PASS` (READ ONLY, sem PUT)

| Flag | Value |
|------|-------|
| global `contracts_operational_ux_global_enabled` | **true** |
| tenant piloto `b721c2c9-…` | **true** |
| other tenants | **0** |

---

## V1 / delivery / public signature

| Check | Result |
|-------|--------|
| V1 smoke | **PASS** — site 200; bundle App contém `/login`, pacientes, agenda, orçamento, Contratos, `/assinatura/`, `/assinar/v2/` (sem login clínico) |
| Delivery safety | **`DELIVERY_SAFETY = GUARDED`** |
| Public signature runtime | **PASS** — V1 `/assinatura/:token` publicado; V2 API publicada porém `FEATURE_FLAG_DISABLED` (403, não 404) |

Ação humana que dispararia comunicação no primeiro piloto:

- CTA **Enviar para assinatura** (provider INTERNAL) → `sendSignatureEmail` retorna `{ simulated: true }` (IndexedDB audit). **Não** envia WhatsApp/e-mail/SMS.
- Provedor externo → `SIGNATURE_PROVIDER_NOT_CONFIGURED` (não envia).
- V2 delivery (`CONTRACTS_V2_DELIVERY_MODE`) default `disabled`; simulation só local.

Paciente acessaria o link `/assinatura/:token` (cópia manual), não um canal externo.

---

## Cleanup / deltas

| Item | Result |
|------|--------|
| Fixtures created | **NONE** |
| Cleanup | `TECHNICAL_SMOKE_CLEANUP = PASS` (nada a remover) |
| Clinical rows delta | **0** |
| Signature rows delta | **0** |
| Manifest rows delta | **0** |
| Acceptance rows delta | **0** |

BEFORE = AFTER = zero em contracts / envelopes / sessions / files / manifests / acceptances.

---

## Tests / Build

| Item | Result |
|------|--------|
| Tests | **PASS** (AG + AF + AD + U + V + TCLE + security + logos + 10.12; 94a/AF retest PASS) |
| Build | **PASS** |

---

## Bugs

| Severity | Count |
|----------|-------|
| Critical | **0** |
| High | **0** |
| Medium | **0** |
| Low | **0** |

---

## Remaining blockers

1. Bucket privado production ausente + colunas/helpers de storage (033/035 skipped).
2. Runtime ainda sem `CONTRACTS_V2_STORAGE_MODE=private-production` / `RUNTIME_MODE` production.
3. Public signatures V2 API `FEATURE_FLAG_DISABLED` no Railway (esperado até piloto V2 explícito).

---

## Decision / Gate

**BLOCKED_WAITING_PRODUCTION_PRIVATE_STORAGE**

HARD STOP: sem paciente real, sem contrato real, sem envio de assinatura, sem PUT de rollout.

Próximo (somente com autorização): aplicar **040** de forma controlada + alinhar env Railway (`CONTRACTS_V2_PRIVATE_BUCKET=contracts-v2-private-production`) — **não** 033/035.
