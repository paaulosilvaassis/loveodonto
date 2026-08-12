# PHASE_SECURITY_01D — CRITICAL BILLING RLS APPLY AND VERIFICATION

**Status:** COMPLETE  
**Human authorization:** SIM (somente 037)  
**Gate:** `SECURITY_01_CLOSED_AWAITING_SECURITY_02`  
**SECURITY_01_STATUS:** **CLOSED**  
**SECURITY_02_CLINIC_LOGOS:** **OPEN**  
**PACKAGE_MANIFEST_SECURITY_CLEARANCE:** **BLOCKED** (aguarda SECURITY_02 + foundation Contracts V2)

---

## Resumo executivo

A migration `037_platform_billing_rls_security_fix.sql` foi aplicada **pontualmente** no projeto `uoepkwhqztmsjnzirpev` via Management API `database/query` (SQL único — **sem** `db push` / sem chain).

**Antes:** anon lia billing (counts = service).  
**Depois:** anon recebe `401 / 42501 permission denied` em SELECT/INSERT/UPDATE/DELETE.  
Service_role continua lendo (counts estáveis). Rollout inalterado. **036 não aplicada.**

---

## Método de apply (somente 037)

| Campo | Valor |
|-------|-------|
| **Project** | `uoepkwhqztmsjnzirpev` (`amor-odonto-prod`) |
| **Método** | `POST /v1/projects/{ref}/database/query` com o arquivo 037 inteiro |
| **Script** | `scripts/security/apply037BillingRlsOnly.mjs` (executado na sessão Terminal onde o token já existia; token **não** impresso/gravado) |
| **Por que não `db push`** | Evitaria aplicar pendências (incl. **036**) |
| **Apply HTTP** | **201** OK |
| **036 applied** | **NO** (`app_package_manifests` / docs / acceptances = `null`) |

Artifact técnico (sem secrets): `docs/reports/_security01d_apply_result.json`

---

## BEFORE → AFTER (anon)

| table | BEFORE anon | AFTER anon |
|-------|-------------|------------|
| `platform_subscriptions` | 206 readable count=1 | **401 42501** denied |
| `platform_invoices` | 206 readable count=1 | **401 42501** denied |
| `platform_billing_events` | 206 readable count=1 | **401 42501** denied |
| `platform_billing_alerts` | 200 readable count=0 | **401 42501** denied |

Service AFTER counts: subscriptions=1, invoices=1, events=1, alerts=0 (**inalterados**).

Classificação empty: **DENIED_BY_REVOKE/RLS** (não “tabela vazia”) — status 401 + `permission denied for table …`.

---

## RLS / policies / grants

| table | relrowsecurity | relforcerowsecurity |
|-------|----------------|---------------------|
| `platform_subscriptions` | **true** | **true** |
| `platform_invoices` | **true** | **true** |
| `platform_billing_events` | **true** | **true** |
| `platform_billing_alerts` | **true** | **true** |

Policies (todas `TO authenticated`, cmd SELECT, sem USING true):

| table | policy | qual |
|-------|--------|------|
| subscriptions | platform billing subscriptions read | `tenant_id = app_current_tenant_id() OR has_platform_permission('billing.read')` |
| invoices | platform billing invoices read | idem |
| events | platform billing events read | `has_platform_permission('billing.read')` |
| alerts | platform billing alerts read | `has_platform_permission('billing.read')` |

Grants: **nenhum** para `anon`/`public`.  
`authenticated`: **SELECT** only.  
`service_role`: SELECT/INSERT/UPDATE/DELETE (Admin API).

---

## Anon mutations

POST / PATCH / DELETE nas 4 tabelas → **401 42501 permission denied** (sem alteração de dados).

**Anon SELECT = DENIED**  
**Anon mutations = DENIED**

---

## Authenticated / cross-tenant

- **Authenticated:** controlado por policy `TO authenticated` + helpers seguros (`app_current_tenant_id`, `has_platform_permission`). Sem policy irrestrita.  
- **Cross-tenant:** negado por construção (`tenant_id = app_current_tenant_id()`); platform admin só via `billing.read`.  
- Probe JWT de usuário clínico ao vivo: não disponível nesta sessão do agent — prova arquitetural + grants + RLS catalog = **PASS**.

---

## Service role / Platform Console

| Check | Resultado |
|-------|-----------|
| Service SELECT counts | **PASS** (iguais ao before) |
| Path Console | Admin API / `server/platformBillingService.js` (service_role) — **PASS** arquitetural + read smoke |
| Dados de billing modificados | **NO** |

---

## Contracts rollout (somente leitura)

| Flag | Estado |
|------|--------|
| `contracts_operational_ux_global_enabled` | **true** (global) |
| `contracts_operational_ux_enabled` | **true** (tenant piloto `b721c2c9-…`) |
| Other tenants | **0** |
| PUT | **NÃO** |

**UNCHANGED.**

---

## Tests / Build

| Suite | Resultado |
|-------|-----------|
| `phaseSecurity01cBillingRlsRemediation.test.js` | **13/13 PASS** |
| `npm run build` | **PASS** |

---

## Critérios SECURITY_01 CLOSED

| # | Critério | Status |
|---|----------|--------|
| 1 | 037 no projeto correto | **PASS** |
| 2 | RLS ON nas 4 | **PASS** (+ FORCE) |
| 3 | anon não lê privados | **PASS** |
| 4 | anon sem mutations | **PASS** |
| 5 | authenticated controlado | **PASS** (policy/grants) |
| 6 | cross-tenant negado | **PASS** (policy) |
| 7 | service_role funciona | **PASS** |
| 8 | Platform Console path | **PASS** |
| 9 | rollout inalterado | **PASS** |
| 10 | 036 não aplicada | **PASS** |
| 11 | sem exposição residual nas 4 | **PASS** |

→ **SECURITY_01_STATUS = CLOSED**

---

## Remaining

| Item | Status |
|------|--------|
| SECURITY_02 clinic-logos list/public | **OPEN** |
| 036 package manifest | **NOT APPLIED** |
| PACKAGE_MANIFEST_SECURITY_CLEARANCE | **BLOCKED** |

---

## Campos finais

```
PHASE_SECURITY_01D

Project: uoepkwhqztmsjnzirpev (amor-odonto-prod)
Método: Management API database/query — SQL único da 037
Migration 037 applied: YES
Migration 036 applied: NO
RLS: ON + FORCE nas 4 tabelas
Anon SELECT: DENIED (401/42501)
Anon mutations: DENIED (401/42501)
Authenticated: PASS (policies TO authenticated; sem USING true)
Cross-tenant: PASS (tenant_id = app_current_tenant_id() / billing.read)
Service role/backend: PASS
Platform Console: PASS (via service_role Admin API path)
Tests: 13/13 PASS
Build: PASS
Contracts rollout: UNCHANGED (global ON, piloto ON, others 0)
Production data modified: NO (somente DDL segurança)
SECURITY_01 status: CLOSED
SECURITY_02 status: OPEN
PACKAGE_MANIFEST_SECURITY_CLEARANCE: BLOCKED
Gate: SECURITY_01_CLOSED_AWAITING_SECURITY_02
```

---

## HARD STOP

- Sem SECURITY_02  
- Sem apply 036  
- Sem package manifest / TCLE / contratos / flags  
- Sem commit / push / deploy  

Aguardando Paulo.
