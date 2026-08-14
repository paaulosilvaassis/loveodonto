# PHASE_10.21AE — CONTROLLED PRODUCTION CONTRACTS V2 FOUNDATION MIGRATION

**Status:** COMPLETE (resumed after 10.21AF)  
**Gate:** `READY_FOR_PRODUCTION_TECHNICAL_SMOKE`  
**Date:** 2026-08-12  
**Project:** `uoepkwhqztmsjnzirpev` (`love-odonto-prod`)  
**Environment:** PRODUCTION

---

## Dependency resolved by PHASE_10.21AF

| Item | Result |
|------|--------|
| Migration 039 | APPLIED (`app_user_can_access_tenant_text_overload`) |
| `app_user_can_access_tenant(text)` | PRESENT → delegates to uuid |
| `MIGRATION_029_HELPER_COMPATIBILITY` | PASS (pre-AF blocker cleared) |

Without AF/039, 029 would fail with `42883` and leave 028 tables without RLS — apply da sequência **somente após** AF PASS.

---

## Project / Precheck (resume)

| Check | Result |
|-------|--------|
| Project ref | `uoepkwhqztmsjnzirpev` PASS |
| Environment | PRODUCTION / `ACTIVE_HEALTHY` PASS |
| 039 helper parity | PASS (text + uuid) |
| 028–036 absent before apply | PASS |
| 037 billing RLS effective | PASS (`platform_invoices` RLS ON) |
| 038 logos storage fix | PASS (in `schema_migrations`) |
| 033 | SKIP_LOCAL_ONLY (not applied) |
| 035 | SKIP_STAGING_ONLY (not applied) |
| Rollout RO (no PUT) | global UX flag **true**; tenant piloto `b721c2c9-…` **true**; other contract tenants **0** |

---

## Migration results

| ID | Result | Notes |
|----|--------|-------|
| 039 (AF) | PASS (prerequisite) | helper text overload |
| **028** | **PASS** | `app_contracts_v2_foundation` — 17 foundation tables |
| **029** | **PASS** | `app_contracts_v2_rls` — RLS + policies; no `42883` |
| RLS checkpoint | **PASS** | all 028 tables RLS ON + policies ≥2; rows ≈ 0 |
| **030** | **PASS** | `app_contract_ledger` |
| **031** | **PASS** | `app_contract_number_sequences` |
| **032** | **PASS** | sessions/challenges/rate_limits; FORCE RLS; revoke anon/auth |
| **033** | **SKIPPED_LOCAL_ONLY** | not applied |
| **034** | **PASS** | delivery_attempts; FORCE RLS; service_role only; **no real delivery** |
| **035** | **SKIPPED_STAGING_ONLY** | not applied; no staging bucket |
| **036** | **PASS** | package manifests + envelope cols; deny-by-default (revoke anon/auth) |

Apply channel: MCP `apply_migration` one-file-at-a-time (no `db push`).

---

## Contracts V2 / Package manifest

| Item | Result |
|------|--------|
| `CONTRACTS_V2_FOUNDATION` | **PRESENT** |
| `PACKAGE_MANIFEST_FOUNDATION` | **PRESENT** |
| Envelope `package_manifest_id` / `package_manifest_hash` | **PRESENT** |
| Legacy V1 tables | **INTACT** (not dropped/altered by this sequence) |

---

## Security matrix (final)

### 029 tenant tables (example `app_contracts`)

| Role | Result |
|------|--------|
| Anon | **DENIED** by policy (`auth.uid()` + tenant helper) |
| Authenticated own tenant | **PASS** (helper text/uuid own=true) |
| Cross-tenant | **DENIED** (helper cross=false) |
| Service role | **PASS** |

### Service-only tables (032/034/036 design)

| Tables | Design | Anon/Auth select privilege | Service |
|--------|--------|---------------------------|---------|
| sessions / challenges / rate_limits | RLS+FORCE; revoke anon/auth | false | true |
| delivery_attempts | RLS+FORCE; revoke anon/auth | false | true |
| package_manifests / documents / acceptances | RLS; revoke anon/auth; **0 policies = deny-by-default** | false | true |

### Regression

| Fix | Result |
|-----|--------|
| 037 billing RLS | PASS |
| 038 logos enumeration | PASS (migration present) |
| 039 text overload | PASS |

---

## Data / communication

| Item | Result |
|------|--------|
| Production clinical rows created (V2) | **ZERO** (`v2_approx_rows ≈ 0`) |
| Production signature rows created | **ZERO** |
| External communication | **ZERO** |

---

## V1 / Runtime / Rollout

| Item | Result |
|------|--------|
| V1 regression (site + API health smoke) | **PASS** — site HTTP 200; Railway `/health` 200 `saas-admin-api` |
| Railway | PASS |
| Vercel | PASS (production deployments present; no redeploy required for DDL) |
| Rollout | **UNCHANGED** — global enabled true; piloto enabled true; others 0; GET unauth 401; **no PUT** |

---

## Tests / Build

| Suite | Result |
|-------|--------|
| AF helper + AD CTA + package + TCLE + security + logos | **PASS** (63 tests / 7 files) |
| `npm run build` | **PASS** |

---

## Errors / Risks / Blockers

| Item | Detail |
|------|--------|
| Errors during apply | none |
| Risks | Foundation present while operational UX flags remain **true** — exposure still gated by app/API; technical smoke must stay non-production-patient |
| Remaining blockers for real pilot | human auth for technical smoke → then pilot; no real patient/signature/delivery yet |
| Storage prod private bucket | still absent (033/035 skipped by design) — future prod storage migration |

---

## Decision / Gate

**READY_FOR_PRODUCTION_TECHNICAL_SMOKE**

HARD STOP:

- NÃO iniciar piloto real
- NÃO alterar rollout
- NÃO criar paciente real
- NÃO enviar assinatura

Aguardar Paulo.
