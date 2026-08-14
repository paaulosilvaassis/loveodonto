# PHASE_10.21AF — PRODUCTION HELPER PARITY FIX

**Status:** COMPLETE  
**Gate:** `READY_TO_RESUME_PHASE_10_21AE`  
**Date:** 2026-08-12  
**Decision:** OPTION A (text overload → delegates to existing uuid helper)

---

## Project

| Field | Value |
|-------|-------|
| Project | `uoepkwhqztmsjnzirpev` (`love-odonto-prod`) |
| Environment | production |
| Method | MCP `apply_migration` (SQL único 039 — sem `db push`) |

---

## Existing uuid helper (production)

| Attribute | Value |
|-----------|-------|
| Signature | `public.app_user_can_access_tenant(row_tenant_id uuid) → boolean` |
| Security | `SECURITY DEFINER` |
| Volatility | `STABLE` |
| search_path | `public` |
| Owner | `postgres` |
| Body | `exists` em `tenant_users` (`tenant_id` + `auth.uid()` + `is_active`) |
| Altered by AF? | **NO** (definição inalterada) |

---

## Staging text helper

| Attribute | Value |
|-----------|-------|
| Overloads | `text` + `uuid` |
| Staging model | `text` é implementação primária; `uuid` delega para `text` |
| Production AF model | **invertido de propósito (Option A):** `text` delega para `uuid` existente |

Paridade exigida nesta fase: **assinaturas presentes** (`text` + `uuid`) para compatibilidade com 029 — não clone bit-a-bit do body de staging.

---

## Production text helper

| Moment | Result |
|--------|--------|
| Before | **ABSENT** → `42883` em `app_user_can_access_tenant(...::text)` |
| After | **PRESENT** — `row_tenant_id text` + `uuid` |

---

## Migration

| Field | Value |
|-------|-------|
| Created | `supabase/migrations/039_app_user_can_access_tenant_text_overload.sql` |
| Mirrors | `supabase-local/migrations/` + `supabase-local/supabase/migrations/` |
| Number free check | **039 livre** (037 billing, 038 logos) |
| sha256 | `772682012097c12adec50fe2c1782715db8078b0cefa58aca7794fb2b4695a82` |
| Applied | **YES** — `schema_migrations` name `app_user_can_access_tenant_text_overload` (`20260812224439`) |
| Apply script (alt) | `scripts/security/apply039HelperTextOverloadOnly.mjs` |
| Artifact | `docs/reports/_phase1021af_apply_result.json` |

Conteúdo: parse seguro null/empty/invalid → `false`; delega `public.app_user_can_access_tenant(uuid)`; `REVOKE` de `PUBLIC`; `GRANT` `authenticated` + `service_role`.

---

## Validation probes

| Check | Result |
|-------|--------|
| Delegation | **PASS** — text chama uuid; sem SQL de membership no overload text |
| Invalid text | **false** (sem exception) |
| Null / empty / blank | **false** |
| Own tenant (simulated JWT) | uuid **true** / text **true** / iguais |
| Cross-tenant | uuid **false** / text **false** / iguais |
| Unaauthenticated valid UUID | text=false, uuid=false, iguais |
| Anon EXECUTE on text | **DENIED** (sem grant a `PUBLIC`/`anon`) |
| Migration 029 compatibility | **`MIGRATION_029_HELPER_COMPATIBILITY = PASS`** (`::text` resolve) |

---

## Rollout / V1 (read-only)

| Check | Result |
|-------|--------|
| `contracts_operational_ux_global_enabled` | enabled **true** (inalterado; sem PUT) |
| `contracts_operational_ux_enabled` tenant piloto `b721c2c9-…` | enabled **true** (inalterado) |
| Other contract tenant rows | **0** |
| Contracts V2 tables | **ABSENT** (`app_contract*` = 0) |
| Package manifest | **ABSENT** |
| Site | HTTP **200** |
| Railway `/health` | HTTP **200** `saas-admin-api` |
| Rollout GET unauth | HTTP **401** |

---

## Tests / Build

| Suite | Result |
|-------|--------|
| `phase1021afHelperTextOverloadParity.test.js` | **PASS** (5) |
| `phase94aSecurityHardening.test.js` | **PASS** (10) |
| `phase92jClinicLogosStorageContract.test.js` | **PASS** (8) |
| `npm run build` | **PASS** |

---

## Safety

| Item | Result |
|------|--------|
| Production clinical data changed | **ZERO** |
| 028–036 applied | **ZERO** |
| Rollout mutated | **NO** |
| External communication | **ZERO** |

---

## Decision / Gate

**READY_TO_RESUME_PHASE_10_21AE**

HARD STOP:

- NÃO continuar automaticamente para 028
- NÃO aplicar 029–036 nesta fase
- NÃO paciente real
- NÃO alterar rollout

Aguardar Paulo autorizar retomada explícita da **PHASE_10.21AE**.

---

## Post-apply checksum reconciliation — OD-0E/OD-0F

| Campo | Valor |
|-------|-------|
| SHA histórico do apply (2026-08-12) | `772682012097c12adec50fe2c1782715db8078b0cefa58aca7794fb2b4695a82` |
| SHA atual do arquivo canônico | `aae9c13a656811effb117e2024322be0b713c08669a65c6800318f4333672f2b` |

- A sessão OD-0E não conseguiu executar SELECT live porque o MCP não estava disponível.
- Evidências históricas e probes indicam correspondência semântica com o arquivo canônico atual.
- Os bytes exatos aplicados não foram confirmados ao vivo.
- A migration **não** deve ser reexecutada para igualar checksum.
- Se uma inspeção futura mostrar divergência funcional, a correção deverá ser uma **nova** migration — nunca reescrita ou reapply silencioso da 039.
