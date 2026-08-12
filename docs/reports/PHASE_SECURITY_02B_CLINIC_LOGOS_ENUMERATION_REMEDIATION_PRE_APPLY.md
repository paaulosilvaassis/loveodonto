# PHASE_SECURITY_02B — CLINIC LOGOS ENUMERATION REMEDIATION PRE-APPLY

**Status:** PRE-APPLY READY (não aplicada)  
**Project:** `amor-odonto-prod` / `uoepkwhqztmsjnzirpev`  
**Architecture:** **OPTION_B** (aprovada)  
**Production mutations:** **NONE**  
**Gate:** `READY_FOR_SECURITY_02_APPLY_APPROVAL`  
**PACKAGE_MANIFEST_SECURITY_CLEARANCE:** **BLOCKED** (aguarda SECURITY_02 fechar)

---

## Decisão humana

OPTION_B aprovada:

* manter `clinic-logos` **público** para GET de objeto conhecido;
* bloquear LIST/enumeração anônima;
* bloquear enumeração cross-tenant desnecessária;
* preservar URLs / PDFs / upload tenant-scoped;
* **não** private bucket; **não** migrar arquivos.

Esta fase **preparou** a correção. **Não aplicou** em produção.

---

## 1. BEFORE (reprodução)

### 1.1 Fonte de evidência

| Fonte | Status |
|-------|--------|
| `scripts/security/auditClinicLogosStorageReadonly.mjs` | pronto; tentativa nesta sessão: **rede do agent bloqueada** (`fetch failed`) |
| Live probes SECURITY_01B (mesmo ref) | **confirmados** — anon LIST root **200** com pasta tenant |
| Policy canônica `013` | SELECT aberta = causa raiz |

### 1.2 Matriz BEFORE (sem UUIDs extras / sem nomes de outras clínicas)

| operation | status (evidência) | allowed/denied |
|-----------|--------------------|----------------|
| A. anon LIST raiz | **200** (01B) | **ALLOWED** |
| B. anon LIST tenant conhecido | **ALLOWED** (SELECT aberta; esperado 200) | **ALLOWED** |
| C. anon GET objeto conhecido (public URL) | público `public=true` | **ALLOWED** |
| D. anon WRITE (INSERT/UPDATE/DELETE) | policy tenant check | **DENIED** (análise) |
| E. authenticated tenant A LIST tenant B | SELECT sem tenant scope | **ALLOWED** (hoje — risco) |

### 1.3 Policy atual (013 — causa real)

| policy | cmd | roles | USING / WITH CHECK |
|--------|-----|-------|--------------------|
| `clinic_logos_storage_select` | SELECT | *(all, incl. anon)* | `bucket_id = 'clinic-logos'` ← **vulnerável** |
| `clinic_logos_storage_insert` | INSERT | all | tenant-scoped `app_user_can_access_tenant(foldername[1])` |
| `clinic_logos_storage_update` | UPDATE | all | tenant-scoped |
| `clinic_logos_storage_delete` | DELETE | all | tenant-scoped |

**Root cause:** SELECT sem tenant + sem `TO authenticated` em bucket público → LIST enumera prefixes/UUIDs.  
**Não** é necessário para servir GET público (docs Supabase: public bucket bypassa RLS no retrieve/serve por URL pública).

---

## 2. Diferença public GET vs SELECT/LIST

Confirmado (docs oficiais + SECURITY_02A):

| Mecanismo | Depende de SELECT RLS? |
|-----------|------------------------|
| `GET /storage/v1/object/public/clinic-logos/...` | **NÃO** (`bucket.public = true`) |
| Storage LIST / authenticated download | **SIM** (policy SELECT) |
| Upsert (`upload` com upsert) | precisa **INSERT + SELECT + UPDATE** |

Logo: remover SELECT irrestrita **não** quebra known-object GET; SELECT autenticada tenant-scoped **é necessária** para upsert da própria clínica.

---

## 3. Migration proposta

| Campo | Valor |
|-------|--------|
| Arquivo | `supabase/migrations/038_clinic_logos_storage_enumeration_security_fix.sql` |
| Número | **038** (próximo livre após 037; 036 reservada/bloqueada) |
| 013 histórica | **intacta** (não editada) |
| Status | **DO NOT APPLY** até auth humana 02C |

### O que faz

1. Reafirma `storage.buckets.public = true` para `clinic-logos`.
2. `DROP POLICY clinic_logos_storage_select`.
3. Recria SELECT:
   - `TO authenticated`
   - `USING (bucket_id = 'clinic-logos' AND app_user_can_access_tenant((storage.foldername(name))[1]))`
4. **Não** altera INSERT / UPDATE / DELETE da 013.
5. Sem `USING(true)`, sem wildcard, sem move de arquivos, sem `clinic_profiles`.

### Pós-fix esperado

| operation | esperado |
|-----------|----------|
| anon LIST | **DENIED** |
| auth A LIST pasta A | **ALLOWED** (membership) |
| auth A LIST pasta B | **DENIED** / vazio |
| anon GET public known object | **ALLOWED** (200) |
| auth A upsert própria logo | **ALLOWED** (SELECT+INSERT+UPDATE) |
| auth A write path B | **DENIED** |

---

## 4. Authenticated list strategy

**Somente** pasta do tenant atual via `app_user_can_access_tenant((storage.foldername(name))[1])` + `TO authenticated`.  
Tenant A **nunca** lista Tenant B.

---

## 5. Writes

Inalterados (013). Continuam tenant-scoped. 038 **não** dropa policies de write.

---

## 6. Testes e build

| Suite | Resultado |
|-------|-----------|
| `phaseSecurity02bClinicLogosEnumerationRemediation.test.js` | **15/15 PASS** |
| `clinicLogo.test.js` | PASS |
| `clinicLogoDisplayFix.test.js` | PASS |
| `phase92jClinicLogosStorageContract.test.js` | PASS |
| **Total** | **32/32 PASS** |
| `npm run build` | **PASS** |

Cobertura dos 13 itens pedidos: bucket public; SELECT vulnerável removida; anon sem SELECT irrestrita; auth tenant-scoped; writes intactos; public GET arquitetura; logo_url; sidebar sem signed; PDF/TCLE URL pública; 036 intacta; rollout intacto.

---

## 7. Regression plan (manual pós-apply — 02C)

| # | Check | Esperado |
|---|-------|----------|
| A | Sidebar Implanprime | logo aparece |
| B | Dados da Clínica | logo aparece |
| C | Troca de logo (admin próprio tenant) | upload OK |
| D | Reload | nova logo permanece |
| E | Contrato preview/PDF | logo aparece |
| F | TCLE/documento | logo aparece |
| G | Anon known-object GET | **200** |
| H | Anon LIST | **DENIED** |
| I | Tenant A list Tenant B | **DENIED** |

Pré-apply sugerido no Terminal: `node scripts/security/auditClinicLogosStorageReadonly.mjs` (BEFORE) → apply 038 → AFTER probes.

---

## 8. SECURITY DECISION

```
Root cause:                 SELECT policy 013 sem tenant scope → LIST enumera tenant UUIDs
Current bucket public:      YES
Current anon LIST:          ALLOWED (BEFORE)
Current known-object GET:   ALLOWED (necessário / aceitável)
Current writes:             tenant-scoped (intactos)
Migration proposed:         038_clinic_logos_storage_enumeration_security_fix.sql
Policy removed/replaced:    clinic_logos_storage_select only
Authenticated list strategy: TO authenticated + app_user_can_access_tenant(foldername[1])
Known-object public GET after fix: PRESERVED (public=true)
Existing logo URLs:         UNCHANGED
Upload behavior:            UNCHANGED (upsert ainda coberto por SELECT tenant-scoped)
Cross-tenant:               LIST A→B denied after fix; writes already denied
Tests:                      32/32 PASS
Build:                      PASS
Regression plan:            A–I defined
Migration 036:              NOT APPLIED / intact
Production mutations:       NONE
Contracts rollout:          UNCHANGED (do not touch)
Risk:                       LOW (policy-only; no URL rewrite)
SECURITY_01:                CLOSED
SECURITY_02:                OPEN (awaiting apply approval)
PACKAGE_MANIFEST_SECURITY_CLEARANCE: BLOCKED
```

### Gate

**`READY_FOR_SECURITY_02_APPLY_APPROVAL`**

---

## HARD STOP

* Migration **não** aplicada  
* Supabase produção **não** alterado  
* Sem commit/push/deploy automático  
* Package manifest **não** iniciado  

Aguardando autorização humana para PHASE_SECURITY_02C (apply pontual somente 038).
