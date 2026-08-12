# PHASE_SECURITY_02C — CLINIC LOGOS ENUMERATION APPLY AND VERIFICATION

**Status:** COMPLETE  
**Human authorization:** SIM (somente 038)  
**Project:** `love-odonto-prod` / `uoepkwhqztmsjnzirpev`  
**Gate:** `SECURITY_02_CLOSED_AWAITING_PACKAGE_MANIFEST_AUTHORIZATION`

---

## Resumo executivo

A migration `038_clinic_logos_storage_enumeration_security_fix.sql` foi aplicada **pontualmente** no projeto correto via Supabase MCP `apply_migration` (SQL único — **sem** `db push` / sem chain / **sem** 036).

**Antes:** SELECT `clinic_logos_storage_select` com `roles={public}` e `USING (bucket_id = 'clinic-logos')` → LIST anon enumerava pastas/tenant.  
**Depois:** SELECT `TO authenticated` + `app_user_can_access_tenant(((storage.foldername(name))[1])::uuid)`.  
Anon LIST retorna **200 com count 0** (sem nomes/UUIDs — enumeração negada).  
Known-object public GET permanece **200** (`image/webp`).  
Bucket permanece **public=true**. Writes intactos. Rollout inalterado. **036 não aplicada.**

---

## Passo 0 — Precheck

| Check | Resultado |
|-------|-----------|
| Projeto alvo | **CONFIRMADO** `uoepkwhqztmsjnzirpev` (`love-odonto-prod`) via MCP `list_projects` |
| 038 existe | YES |
| Método exclusivo | MCP `apply_migration` com SQL da 038 only (não `db push`) |
| 036 | **NÃO** selecionada / **NÃO** aplicada |
| Secrets | Não impressos |

---

## Passo 1 — BEFORE

### Policy live (SQL)

| policy | cmd | roles | USING |
|--------|-----|-------|-------|
| `clinic_logos_storage_select` | SELECT | `{public}` | `bucket_id = 'clinic-logos'` ← vulnerável |
| insert/update/delete | … | `{public}` | tenant-scoped via `app_user_can_access_tenant(...::uuid)` |

| Item | Valor |
|------|--------|
| Bucket public | **true** |
| logo_url piloto | pública `…/clinic-logos/…/logo.webp` (não signed) |
| Anon LIST (implicação) | **ALLOWED** (SELECT pública aberta) |
| Known-object GET | **ALLOWED** (arquitetura) |

### Nota de assinatura (prod vs repo)

Em produção, `app_user_can_access_tenant(row_tenant_id **uuid**)` — **não** existe overload `text`.  
Policies de write live já usam `::uuid`. A 038 foi alinhada a esse cast.

---

## Passo 2 — Apply somente 038

| Tentativa | Resultado |
|-----------|-----------|
| 1ª (sem `::uuid`, texto da 02B inicial) | **FAIL** `42883` function `app_user_can_access_tenant(text)` does not exist — estado BEFORE **intact** |
| 2ª (`::uuid` alinhado às writes live) | **SUCCESS** |

**Método:** `apply_migration`  
**name:** `clinic_logos_storage_enumeration_security_fix`  
**Arquivo repo atualizado** com o cast prod-compatible + nota de apply.

---

## Passo 3 — Policy AFTER (SQL live)

| Item | Resultado |
|------|-----------|
| Bucket `public` | **true** |
| SELECT roles | `{authenticated}` |
| SELECT tenant-scoped | **YES** (`app_user_can_access_tenant(...::uuid)`) |
| SELECT anon/public | **AUSENTE** |
| USING(true) | **NÃO** |
| INSERT/UPDATE/DELETE | **inalterados**, tenant-scoped |

---

## Passo 4–5 — Provas HTTP AFTER

Fonte: `scripts/security/verify038ClinicLogosHttpProbes.mjs` → `docs/reports/_security02c_http_probes.json`

| operation | status | allowed/denied | nota |
|-----------|--------|----------------|------|
| anon LIST root | 200 | **enumeração DENIED** | `count=0` (sem pastas/UUIDs) |
| anon LIST pilot prefix | 200 | **enumeração DENIED** | `count=0` |
| anon LIST other prefix | 200 | **enumeração DENIED** | `count=0` |
| service LIST pilot | 200 | ALLOWED | `count=1` (objeto existe) |
| public HEAD logo.webp | **200** | **PASS** | `image/webp`, ~24KB |

**Interpretação:** Storage RLS costuma responder `200 []` (não 401/403). O achado RISK_A era **expor nomes/UUIDs**; com `count=0` a enumeração está fechada. Known-object GET público **PASS**.

---

## Passo 6 — Authenticated / cross-tenant

| Check | Evidência |
|-------|-----------|
| Own-tenant SELECT | Policy `TO authenticated` + `app_user_can_access_tenant` |
| Cross-tenant LIST | Sem SELECT aberta; helper tenant-scoped → **DENIED** para A≠B |
| JWT user probe | Não executado (sem session de usuário neste canal); policy é a garantia |

---

## Passo 7 — Writes

INSERT/UPDATE/DELETE **não** foram dropados/recriados. Live confirmado tenant-scoped com o mesmo helper `::uuid`. Sem mutation destrutiva de logo.

---

## Passo 8 — Regressão visual

| Check | Status |
|-------|--------|
| Known-object GET 200 webp | **PASS** (HTTP) — sidebar/settings/PDF que usam `logo_url` pública devem continuar |
| Spot-check UI A–F | **Recomendado a Paulo** (sem automação de browser nesta fase) |

---

## Passo 9 — Testes / build

| Suite | Resultado |
|-------|-----------|
| Security 02B + logos + 92j | **32/32 PASS** |
| `npm run build` | **PASS** |

---

## Passo 10 — Rollout (read-only)

| Flag | Valor |
|------|--------|
| `contracts_operational_ux_global_enabled` | **true** (global) |
| `contracts_operational_ux_enabled` | **true** (somente piloto) |
| outros tenants | **0** enabled |
| PUT | **NÃO** |

---

## Passo 11 — Security clearance

Critérios:

1. 038 aplicada no projeto correto — **YES**  
2. bucket public — **YES**  
3. anon enumeração negada — **YES** (`count=0`)  
4. known-object GET — **YES** (200)  
5. authenticated own-tenant (policy) — **YES**  
6. cross-tenant (policy) — **YES**  
7. writes tenant-scoped — **YES**  
8–9. logo pública intacta / UI spot-check recomendado  
10. testes/build — **PASS**  
11. rollout inalterado — **YES**  
12. 036 NOT APPLIED — **YES** (`app_package_manifests` null)

```
SECURITY_02_STATUS = CLOSED
PACKAGE_MANIFEST_SECURITY_CLEARANCE = CLEARED
```

---

## SECURITY DECISION

```
Project:                 uoepkwhqztmsjnzirpev (love-odonto-prod)
Method:                  mcp_apply_migration (SQL 038 only)
Migration 038 applied:   YES (2nd attempt; uuid cast)
Migration 036 applied:   NO
Bucket public:           YES
Anon LIST before:        ALLOWED (open SELECT / enum)
Anon LIST after:         ENUMERATION DENIED (200 count=0)
Known-object GET:        PASS (200 image/webp)
Authenticated own-tenant: PASS (policy)
Cross-tenant:            DENIED (policy)
Writes:                  tenant-scoped UNCHANGED
Sidebar/Clinic/PDF/TCLE: public logo_url intact; UI spot-check recommended
Tests:                   32/32 PASS
Build:                   PASS
Contracts rollout:       UNCHANGED
Production data modified: NO (policy/bucket flag only; no file/logo_url rewrite)
SECURITY_01 status:      CLOSED
SECURITY_02 status:      CLOSED
PACKAGE_MANIFEST_SECURITY_CLEARANCE: CLEARED
Remaining security findings:
  - Repo migration 013 text-signature vs prod uuid helper (histórico; writes já uuid)
  - UI visual A–F spot-check manual recomendado
Gate: SECURITY_02_CLOSED_AWAITING_PACKAGE_MANIFEST_AUTHORIZATION
```

---

## HARD STOP

* **Não** aplicar 036  
* **Não** implementar package manifest ainda (clearance liberada; implementação aguarda Paulo)  
* **Não** alterar rollout  
* **Não** commit/push/deploy automático  

Aguardando Paulo.
