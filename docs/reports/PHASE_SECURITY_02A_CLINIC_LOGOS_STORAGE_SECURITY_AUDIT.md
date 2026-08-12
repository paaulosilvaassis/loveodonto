# PHASE_SECURITY_02A — CLINIC LOGOS STORAGE SECURITY AUDIT AND REMEDIATION DESIGN

**Status:** AUDIT + DESIGN ONLY (sem remediação aplicada)  
**Project:** `amor-odonto-prod`  
**Ref:** `uoepkwhqztmsjnzirpev`  
**Production mutations:** **NONE**  
**Gate:** `READY_FOR_SECURITY_02_REMEDIATION_APPROVAL`  
**PACKAGE_MANIFEST_SECURITY_CLEARANCE:** **BLOCKED** (inalterado)

---

## 0. Baseline (somente leitura)

| Item | Valor |
|------|--------|
| `git status --short` | Working tree sujo (contratos/TCLE/SECURITY_01 docs + local changes) — **não resetado** |
| `git log --oneline -5` | `30bb9d7` … `90630c7` (docs/contracts) |
| Projeto Supabase | `uoepkwhqztmsjnzirpev` (`amor-odonto-prod`) |
| SECURITY_01 | **CLOSED** (037 billing RLS applied + verified) |
| Migration **036** | **NOT APPLIED** |
| Migration **037** | applied = YES (billing only) |
| Contracts rollout | **NÃO ALTERADO nesta fase** — esperado: global ON, piloto ON, outros = 0 (confirmado em 01D) |
| Esta fase alterou Storage/policies/SQL/URLs? | **NÃO** |

**Artefato:** `docs/reports/_security02a_audit_result.json`  
**Script read-only (não destrutivo):** `scripts/security/auditClinicLogosStorageReadonly.mjs`  
*(Re-probe live nesta sessão do agent: rede bloqueada — `fetch failed` / curl `000`. Evidência live de listagem anon permanece a da SECURITY_01B no mesmo projeto. Re-executar o script no Terminal Mac antes do apply da remediação.)*

---

## 1. Auditoria do bucket `clinic-logos`

### 1.1 Configuração (fonte: migration `013` + probe live SECURITY_01B)

| Campo | Valor |
|-------|--------|
| `id` / `name` | `clinic-logos` |
| `public` | **`true`** (insert `on conflict do update set public = true`) |
| `file_size_limit` | não definido na 013 (null / default projeto) |
| `allowed_mime_types` | não definido na 013 |
| Path canônico (código) | `{tenantId}/logo.{ext}` (browser) ou `{tenantId}/logo.webp` (server assets API) |

```sql
-- supabase/migrations/013_clinic_logos_storage.sql
insert into storage.buckets (id, name, public)
values ('clinic-logos', 'clinic-logos', true)
on conflict (id) do update set public = true;
```

### 1.2 Policies em `storage.objects` (013 — estado pretendido / prod alinhado ao comportamento observado)

| policyname | command | role (explícito) | USING | WITH CHECK |
|------------|---------|------------------|-------|------------|
| `clinic_logos_storage_select` | SELECT | *(default = all roles, incl. anon)* | `bucket_id = 'clinic-logos'` | — |
| `clinic_logos_storage_insert` | INSERT | all | — | `bucket_id = 'clinic-logos' AND app_user_can_access_tenant((storage.foldername(name))[1])` |
| `clinic_logos_storage_update` | UPDATE | all | mesmo tenant check | mesmo tenant check |
| `clinic_logos_storage_delete` | DELETE | all | tenant check | — |

**Achados de policy:**

- SELECT: **sem** `TO authenticated`, **sem** filtro de tenant, **sem** restrição de path → equivale a “qualquer um com papel que passe RLS Storage pode SELECT no bucket inteiro”.
- Em bucket **público**, GET via `/storage/v1/object/public/clinic-logos/...` entrega o objeto sem JWT.
- LIST via Storage API usa a policy SELECT → **anon consegue enumerar**.
- Writes: tenant-scoped via `foldername(name)[1]` + `app_user_can_access_tenant` — **bom**, desde que a função esteja correta.
- Não há `USING(true)` literal; o SELECT do bucket é efetivamente “aberto para o bucket”.

---

## 2. Probes anônimos (não destrutivos)

### 2.1 Evidência live (SECURITY_01B, mesmo ref)

| operation | HTTP | allowed/denied | metadata exposure |
|-----------|------|----------------|-------------------|
| A. list bucket/prefix `clinic-logos` (root) | **200** | **ALLOWED** | pastas = **UUID `tenant_id`** |
| B. list pasta raiz | **200** | **ALLOWED** | enumeração de tenants |
| C. list pasta tenant conhecido | esperado **200** (SELECT aberto) | **ALLOWED** | nomes de objetos (`logo.webp` etc.) |
| D. GET público objeto conhecido | público `public=true` | **ALLOWED** | `Content-Type` / bytes da imagem institucional |
| E. descobrir outro tenant | via list root | **ALLOWED** (enumeração) | UUIDs de outros tenants se existirem objetos |
| F. metadata list | nomes, ids de pasta | **exposto** | **RISK_A** |

### 2.2 Mutations (análise de grants/policies — **sem** criar/apagar arquivo)

| operation | Esperado para anon | Base |
|-----------|--------------------|------|
| INSERT | **DENIED** | WITH CHECK exige `app_user_can_access_tenant` (sem JWT de membership → falha) |
| UPDATE | **DENIED** | idem |
| DELETE | **DENIED** | idem |

**Não** foram criados/apagados objetos reais nesta fase.

### 2.3 Re-probe 02A (esta sessão)

| Item | Resultado |
|------|-----------|
| Script | `scripts/security/auditClinicLogosStorageReadonly.mjs` |
| Rede do agent | **bloqueada** |
| Catálogo SQL `pg_policies` / `storage.buckets` via Management API | **não reexecutado** (sem token neste runtime) |
| Conclusão operacional | Comportamento **não** contradito; remediação ainda exige **re-probe Terminal** pré-apply |

---

## 3. Mapa de consumidores

| Classe | Onde | URL pública persistente? | SDK Storage? | Sem login? | Após logout? | PDF/print? | PDF browser/server? | Persiste `clinic_profiles.logo_url`? | Cache | Fallback Love Odonto |
|--------|------|--------------------------|--------------|------------|--------------|------------|---------------------|-------------------------------------|-------|----------------------|
| **SIDEBAR** | `Layout.jsx` + `useClinicLogo` | Sim (`img src`) | Não (só URL) | Não (app authed) | N/A UI | Não | — | Lê | `?v=` cache-bust | Sim |
| **CLINIC_SETTINGS** | `ClinicSettingsPage` + `clinicService` | Preview + save | **Upload** `clinicLogoUploadService` | Não | N/A | Não | — | **Sim** (grava) | local draft | Sim |
| **CONTRACT_PDF** | `professionalContractTemplate.js` | Sim (`<img src>`) | Não | Print pode carregar URL sem JWT | URL no HTML | **Sim** | **Browser** HTML print | Lê | — | opcional vazio |
| **DOCUMENTS** | `DocumentsSection.jsx` (`getClinicLogo`) | Sim | Não | Print | URL no HTML | **Sim** | **Browser** | Lê | — | `includeDefault: false` |
| **TCLE** | mesmo fluxo documentos / pacote (logo no header do doc) | Sim | Não | Print | URL | **Sim** | Browser | Lê | — | sem default se `includeDefault: false` |
| **OTHER print** | `budgetPrintTemplate`, `atestadoPrintTemplate` | Sim | Não | Print | URL | **Sim** | Browser | Lê | sanitize localhost | — |
| **SERVER** | `clinicLogoStorage.js`, `assetsLogoApi.js`, `clinicProfileResolver` | Gera `getPublicUrl` | **Sim** (service/admin client) | N/A | N/A | Indireto | — | **Sim** | `cacheControl: 3600` | — |
| **EMAIL** | sem uso direto de `clinic-logos` encontrado | — | — | — | — | — | — | — | — | — |
| **PUBLIC_PAGE** | sem landing pública da logo tenant encontrada | — | — | — | — | — | — | — | — | — |
| **PLATFORM_CONSOLE** | sem referência a clinic-logos | — | — | — | — | — | — | — | — | — |

**Padrão dominante:** `clinic_profiles.logo_url` = **URL http(s) pública completa** → `<img src>` / print HTML.  
**Não** usa `createSignedUrl` para logos (signed URLs existem em contracts private storage, domínio separado).

---

## 4. Modelo multi-tenant / path

| Pergunta | Resposta |
|----------|----------|
| Formato real do path | **`clinic-logos/{tenantId}/logo.{ext}`** (confirmado no código client + server) |
| Histórico | Alinhado ao esperado; server assets força `logo.webp` |
| Auth tenant A **lista** logos B? | **SIM** (SELECT sem tenant scope) — mesmo RISK_A para authenticated |
| Auth A **lê** logo B (URL pública / SELECT)? | **SIM** (bucket public + SELECT aberto) |
| Auth A **escreve** path B? | **NÃO** (esperado) — `app_user_can_access_tenant` no WITH CHECK |
| Auth A **apaga** path B? | **NÃO** (esperado) — policy DELETE tenant-scoped |

Upload browser: path montado no cliente com `tenantId` da sessão (`requireSessionTenantId`).  
Upload server `/internal/app/assets/logo`: `tenant_id` **não** aceito no form; vem do actor admin (`resolveAdminTenantForPermissions`).

---

## 5. Dois riscos (não equivalentes)

### RISK_A — LIST / ENUMERAÇÃO (primário)

Anon (e qualquer authenticated) pode **listar** o bucket e obter **UUIDs de tenant** + nomes de objetos.

- Não é necessário ao produto.
- Facilita inventário de tenants e guessing de `…/logo.webp`.
- **Severidade: HIGH** (metadado / superfície de descoberta).

### RISK_B — READ de objeto com URL conhecida

Anon com URL completa (ou path adivinhado) faz GET público da imagem.

- Logos são ativos **institucionais** (marca da clínica), não PHI clínico.
- Produto **precisa** de GET estável para print/PDF/`<img>` sem JWT.
- `logo_url` em DB tipicamente só chega a quem já tem contexto de clínica (app authed).
- **Severidade: LOW–MEDIUM** se LIST estiver fechado; aceitável como trade-off de marca pública.

**Necessário ao produto:** RISK_B controlado (leitura pública do objeto conhecido).  
**Desnecessário:** RISK_A.

---

## 6. Arquitetura — comparação e escolha

| Opção | Segurança | Isolamento | Frontend | PDFs/TCLE | Cache | Complexidade | Regressão | Manutenção SaaS |
|-------|-----------|------------|----------|-----------|-------|--------------|-----------|-----------------|
| **A** Privado + signed URLs | Alta | Forte | Alto impacto (refresh URL) | **Alto risco** (URL expira no HTML) | Ruim p/ print | Alta | Alta | Alta |
| **B** Público p/ GET; **bloquear LIST**; writes tenant-scoped | Alta p/ enum | LIST isolado; GET público | **Mínimo** | **Preserva** URLs atuais | Mantém | **Baixa** | **Baixa** | Baixa |
| **C** Privado + proxy backend | Alta | Forte | Médio (trocar src) | Precisa proxy estável / embed | Médio | Alta | Médio–Alta | Alta |
| **D** (variante) | — | — | — | — | — | — | — | — |

### Recomendação: **OPTION_B**

**Por quê:**

1. Corrige o achado real (**RISK_A**) sem invalidar `logo_url` já persistidas.
2. Mantém PDFs/documentos/sidebar/settings funcionando (URL pública estável).
3. Writes já são tenant-scoped — reforçar SELECT list, não redesenhar upload.
4. Evita signed URL expiry em HTML de print gerado no browser.
5. Menor risco de regressão SaaS multi-tenant.

### Remediação mínima (DESIGN ONLY — **não aplicar agora**)

1. **Manter** `storage.buckets.public = true` para `clinic-logos`.
2. **Substituir** policy SELECT aberta por SELECT **tenant-scoped** para roles autenticadas (list/download autenticado só do próprio tenant).
3. Garantir que **anon não lista** (sem policy SELECT permissiva para anon).
4. **Não** mover/apagar arquivos; **não** reescrever `logo_url`.
5. Opcional hardening: `TO authenticated` explícito em INSERT/UPDATE/DELETE (já protegidos por `app_user_can_access_tenant`).
6. Pré-apply: re-rodar probes anon LIST → **denied**; public HEAD objeto conhecido → **200**; upload tenant A em path B → **denied**.

Esboço SQL (ilustrativo — **NÃO EXECUTAR nesta fase**):

```sql
-- DESIGN ONLY — futura SECURITY_02 remediation (ex.: 038)
-- NÃO aplicar sem autorização humana explícita.

drop policy if exists clinic_logos_storage_select on storage.objects;

create policy clinic_logos_storage_select on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'clinic-logos'
    and public.app_user_can_access_tenant((storage.foldername(name))[1])
  );

-- public = true permanece → GET /object/public/... continua para URL conhecida
-- anon LIST deixa de ter policy SELECT → enumeração negada
```

*(Validar em staging/piloto que nenhum consumidor usa `.list()` / `.download()` autenticado cross-path; grep atual: consumidores usam `getPublicUrl` + HTTP público.)*

---

## 7. Upload / write audit

| Canal | Quem | Path | Tenant source |
|-------|------|------|---------------|
| Browser `clinicLogoUploadService.uploadClinicLogoBlob` | Usuário com sessão Supabase (settings/clinic save) | `{tenantId}/logo.{ext}` | `requireSessionTenantId(user)` |
| Server `POST …/assets/logo` | Actor **admin** do tenant | `{tenantId}/logo.webp` | Auth context (**não** body) |
| Server `persistClinicLogoUrl` | service path clinic profile update | `{tenantId}/logo.{ext}` | tenant do resolver |

**Requisito:** nenhum user do tenant A escreve no path B — coberto pela policy INSERT/UPDATE/DELETE + path server-side admin.  
**Nota:** browser calcula path no cliente; a **policy** é a garantia real contra path spoofing.

---

## 8. `clinic_profiles.logo_url`

| Pergunta | Resposta |
|----------|----------|
| Formato | **URL pública completa** `https://…/storage/v1/object/public/clinic-logos/{tenantId}/logo…` |
| Object path only? | Não (hoje) |
| Signed URL? | Não |
| Expira? | Não (URL pública estável) |
| Legado | data URI **bloqueado** (constraint + `assertLogoUrlSafeForApi`) |
| Estratégia OPTION_B | **Manter formato**; zero migration de dados; zero rewrite de URLs |

Compatibilidade backward-safe: **total** sob OPTION_B.

---

## 9. O que esta fase **não** fez

- Não tornou bucket privado  
- Não alterou policies  
- Não alterou frontend/backend  
- Não criou migration aplicada  
- Não aplicou **036**  
- Não alterou rollout / feature_flags  
- Não moveu/apagou logos  
- Não commit / push / deploy  

---

## 10. SECURITY DECISION

```
Current bucket mode:              PUBLIC (public=true)
Current anon LIST:                ALLOWED (200) — enumera tenant UUID  [RISK_A]
Current anon READ known object:   ALLOWED (public GET)                 [RISK_B — aceitável p/ marca]
Current anon WRITE:               DENIED (policy tenant check)
Current authenticated isolation:  WRITE = tenant-scoped; LIST/READ = NÃO isolado (SELECT aberto)
Current upload path:              {tenantId}/logo.{ext|webp} (client session / server admin)
Consumers:                        SIDEBAR, CLINIC_SETTINGS, CONTRACT_PDF, DOCUMENTS, TCLE/print, SERVER upload
Public access actually required:  YES for GET known object; NO for LIST
Primary risk:                     RISK_A (enumeration of tenant folders/UUIDs)
Recommended architecture:         OPTION_B (keep public GET; deny LIST/enum; keep tenant-scoped writes)
Why:                              Minimal change; preserves logo_url + PDF/print; fixes real finding
Migration required:               YES (policy-only; proposed future 038 — NOT created as applied migration)
Frontend changes required:        NO (se OPTION_B)
Backend changes required:         NO (se OPTION_B; opcional harden paths)
Existing logo compatibility:      FULL (keep public URLs)
Regression risk:                  LOW (OPTION_B)
SECURITY_01:                      CLOSED
SECURITY_02:                      OPEN (awaiting remediation approval)
036:                              NOT APPLIED
Contracts rollout:                UNCHANGED (do not touch)
Production mutations:             NONE
PACKAGE_MANIFEST_SECURITY_CLEARANCE: BLOCKED
```

### Gate

**`READY_FOR_SECURITY_02_REMEDIATION_APPROVAL`**

Pré-condição sugerida no apply seguinte: re-probe live no Terminal (`auditClinicLogosStorageReadonly.mjs`) + autorização humana explícita só para a migration de policy do `clinic-logos`.

---

## HARD STOP

Aguardando autorização humana.  
**Não implementar** a correção até aprovação da SECURITY_02 remediation.
