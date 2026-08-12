# PHASE_SECURITY_01C — CRITICAL BILLING RLS REMEDIATION (PRE-APPLY)

**Status:** PRE-APPLY COMPLETE — awaiting human apply authorization (01D)  
**Production mutated:** **NO**  
**Commit / push / deploy:** **NO**  
**036 applied:** **NO**  
**Contracts rollout changed:** **NO**  
**Gate:** `READY_FOR_CRITICAL_RLS_FIX_APPLY_APPROVAL`

---

## Passo 0 — Estado preservado (read-only)

### Git (não descartado / não resetado)

- Branch com **muitas alterações locais não commitadas** (10.21R–T, prerequisites UX, logo, security 01 report, etc.)
- `git log -5`: `30bb9d7` … `90630c7` (docs/contracts phases)
- Esta fase **apenas adicionou** migration 037/017 + teste + este relatório

### Production contracts rollout (somente leitura — inalterado)

| Campo | Estado documentado (10.21O Step B) |
|-------|-------------------------------------|
| Global | `contracts_operational_ux_global_enabled` = **true** |
| Tenant piloto | `b721c2c9-d924-41ee-8911-dc00c8208326` = **true** |
| UX efetiva | **true** (global ∧ tenant) |
| Outros tenants | **0** |
| V1 | intacto |

Nenhum arquivo de rollout/feature_flags foi modificado nesta fase.

---

## Passo 1 — Root cause confirmada (015 vs 016)

| Migration | CREATE | ENABLE RLS | Policies | REVOKE anon |
|-----------|--------|------------|----------|-------------|
| `console/.../015_platform_billing_saas.sql` | SIM | **SIM** | **SIM** (`billing.read` / `app_current_tenant_id`) | NÃO |
| `console/.../016_platform_billing_tenant_columns_and_backfill.sql` | `IF NOT EXISTS` | **NÃO** | **NÃO** | **NÃO** |

**Confirmado:** 016 pode materializar as quatro tabelas **sem** a proteção de 015.  
Comportamento 01B (anon SELECT = service count) é consistente com RLS ausente/ineficaz + GRANT implícito a anon/PUBLIC.

**Bug adicional em 015:** policies criadas **sem** `TO authenticated` → aplicavam-se a `PUBLIC` (incluindo anon) se RLS estivesse ON.

`has_platform_permission` (011): `SECURITY DEFINER`, `REVOKE FROM public`, `GRANT EXECUTE TO authenticated` — seguro para reutilizar em policies `TO authenticated`.

---

## Passo 2 — Consumidores

| Acesso | Classificação |
|--------|----------------|
| `server/platformBillingService.js` | **RAILWAY_SERVICE_ROLE** / **SERVER** |
| `console/src/...` via `/internal/platform/billing*` | **PLATFORM_CONSOLE** → Admin API (não BROWSER_DIRECT nas tabelas) |
| `src/` app clínico | **sem** `.from('platform_invoices'|…)` |
| Tests / docs / migrations | TEST / MIGRATION_ONLY |

**REVOKE anon não quebra path legítimo** — Console e billing usam service_role.

---

## Passo 3 — Migration proposta (NÃO APLICADA)

| Arquivo | Papel |
|---------|-------|
| `supabase/migrations/037_platform_billing_rls_security_fix.sql` | **Primário (nome pedido)** |
| `console/supabase/migrations/017_platform_billing_rls_security_fix.sql` | Espelho na cadeia console 015/016 |

**Não usa 036.** Conteúdo idêntico; apply futuro deve ser **uma vez** no projeto prod.

### Estratégia

| Item | Decisão |
|------|----------|
| ENABLE RLS | SIM (4 tabelas) |
| FORCE RLS | **SIM** — service_role Supabase tem BYPASSRLS; Admin API preservada |
| REVOKE anon | `REVOKE ALL … FROM anon` (+ `FROM public`) |
| authenticated | `GRANT SELECT` only; policies `TO authenticated` |
| Policies | Modelo 015 + `TO authenticated`; **sem** USING/WITH CHECK true |
| service_role | Intocado; continua Admin API |

---

## Passo 5 — Testes / Build

| Suite | Resultado |
|-------|-----------|
| `phaseSecurity01cBillingRlsRemediation.test.js` | **13/13 PASS** |
| `npm run build` | **PASS** |

---

## Pre-apply summary (campos pedidos)

| Campo | Valor |
|-------|-------|
| **Tables affected** | `platform_subscriptions`, `platform_invoices`, `platform_billing_events`, `platform_billing_alerts` |
| **Current exposure** | anon SELECT efetivo (01B) — CRITICAL |
| **Root cause confirmed** | 016 CREATE IF NOT EXISTS sem RLS; 015 policies sem `TO authenticated` |
| **New migration** | `037_platform_billing_rls_security_fix.sql` (+ espelho `console/017`) |
| **RLS strategy** | ENABLE + FORCE + policies authenticated + REVOKE anon/public |
| **Anon privileges after proposed fix** | **nenhum** (REVOKE ALL) |
| **Authenticated strategy** | SELECT sob `app_current_tenant_id()` OU `has_platform_permission('billing.read')` |
| **Service-role impact** | Nenhum esperado (BYPASSRLS / Admin API) |
| **Platform Console impact** | Nenhum esperado (já usa `/internal/platform/billing`) |
| **Regression tests** | 13/13 |
| **Build** | PASS |
| **Migration 036 touched** | **NO** |
| **Contracts rollout touched** | **NO** |
| **Production mutations so far** | **NONE** |
| **Gate** | **READY_FOR_CRITICAL_RLS_FIX_APPLY_APPROVAL** |

---

## Remaining security findings (fora desta fase)

| ID | Finding | Status |
|----|---------|--------|
| **SECURITY_02** | `clinic-logos` public — anon lista pasta/`tenant_id` | **diferido** (não corrigir com billing) |
| **SECURITY_01 catalog** | inventário `pg_class` completo ainda incompleto sem SQL Management token | aberto |
| **PACKAGE_MANIFEST / 036** | **CLEARANCE = BLOCKED** até SECURITY_01 CLOSED + foundation Contracts V2 | **BLOCKED** |

---

## HARD STOP

- Migration **criada**, **não aplicada**  
- Sem commit / push / deploy  
- Sem alteração de rollout / 036 / contratos / pacientes  

**Próximo:** autorização humana explícita → **PHASE_SECURITY_01D** (apply + validação anon real).
