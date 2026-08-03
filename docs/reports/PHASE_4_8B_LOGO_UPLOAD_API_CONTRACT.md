# Phase 4.8B — Contrato Oficial: `POST /internal/app/assets/logo`

**Documento:** `docs/reports/PHASE_4_8B_LOGO_UPLOAD_API_CONTRACT.md`  
**Data:** 2026-07-07  
**Base:** Phase 4.8 Assets Contract v1.1 · V3 Master API Architecture · migrations 013/014  
**Escopo:** Contrato **somente documental** — sem código, endpoint, banco, Storage, commit ou produção  
**Versão:** `v1.0.0-draft`  
**Endpoint:** `POST /internal/app/assets/logo`

**Relacionado:** [`PHASE_4_8_ASSETS_API_CONTRACT.md`](./PHASE_4_8_ASSETS_API_CONTRACT.md) (umbrella) · Avatar em contrato separado (Phase 4.8C planejado)

---

## 1. Objetivo do endpoint

Receber a logomarca da clínica via **multipart upload**, persistir o binário no **Supabase Storage** (`clinic-logos`) e atualizar **`clinic_profiles.logo_url`** com URL HTTPS pública — operação atômica server-side.

| Finalidade | Detalhe |
|------------|---------|
| **Primária** | Substituir fluxo legado: compressão frontend + upload direto Storage (`clinicLogoUploadService.js`) + segundo `PUT /clinic-profile` |
| **Secundária** | Centralizar validação MIME/tamanho, path tenant-scoped, auditoria e rollback |
| **Fora de escopo v1** | Crop UI avançado, SVG, múltiplas variantes (favicon derivado), delete dedicado, CDN custom |
| **Tipo** | **Write sensível** — muta Storage + Postgres |

**Princípio:** logo é **asset público** de marca; binário no Storage; Postgres guarda **URL pública permanente**; IndexedDB é cache derivado.

---

## 2. Fonte oficial do logo

| Camada | Papel | POST logo v1 |
|--------|-------|--------------|
| **Supabase Storage** `clinic-logos` | SSOT binário | ✅ Upload via Admin API `service_role` |
| **`clinic_profiles.logo_url`** | SSOT referência (Postgres) | ✅ UPSERT com URL pública HTTPS |
| **IndexedDB** `clinicProfile.logoUrl` | Cache UI | ❌ **Proibido** como destino de upload / SSOT |
| **Base64 / data URI** | Legado | ❌ **Proibido** — CHECK migration 014 + guard `PUT /clinic-profile` |
| **Frontend direct Storage** | Legado transição | 📋 Deprecar após cutover — Admin API passa a ser porta oficial |

**Fluxo canônico:**

```text
multipart/file → Admin API (valida + normaliza WEBP) → Storage upsert → UPSERT logo_url → envelope V3 → frontend invalida cache IDB
```

---

## 3. Bucket oficial `clinic-logos`

| Item | Valor |
|------|-------|
| **ID** | `clinic-logos` |
| **Migration** | `013_clinic_logos_storage.sql` |
| **Status** | ✅ Existe e aplicável |
| **Visibilidade** | **Pública** (`public = true`) |
| **RLS INSERT/UPDATE/DELETE** | `app_user_can_access_tenant((storage.foldername(name))[1]::uuid)` |
| **RLS SELECT** | Anônima (bucket público) |

**Norma:** upload **oficial** via Admin API com `service_role` — não depende de RLS Storage no runtime do handler, mas policies 013 permanecem para uploads diretos autenticados legados até deprecação.

---

## 4. Visibilidade pública (migration 013)

| Aspecto | Norma |
|---------|-------|
| **Leitura** | Qualquer cliente (CDN/anônimo) via URL pública |
| **Escrita** | Admin API backend (`service_role`) ou membro tenant via RLS 013 |
| **Resposta API** | `getPublicUrl(objectPath)` — URL **permanente** |
| **Persistência DB** | Mesma URL pública em `logo_url` |
| **Cache-Control upload** | `3600` (paridade `server/clinicLogoStorage.js:42`) |

Logo institucional **não** é dado pessoal sensível — exposição pública é requisito funcional (header, login, PDFs).

---

## 5. Path oficial

| Item | Valor normativo v1 |
|------|-------------------|
| **Object key** | `{tenant_id}/logo.webp` |
| **Upsert** | `true` — substitui logo anterior do tenant |
| **`tenant_id`** | UUID canônico — **somente** do backend (actor admin) |

**Proibições:**

- Path sem prefixo `tenant_id` → **400** `UNSAFE_OBJECT_PATH`
- Path com `../`, `\`, segmentos vazios → **400** `UNSAFE_OBJECT_PATH`
- Filename original do cliente **não** compõe object key

> **Compat legado:** objetos antigos `{tenant_id}/logo.jpg|png` permanecem válidos até próximo upload; v1 **normaliza** para `logo.webp`.

---

## 6. Quem pode alterar

| Actor | v1 |
|-------|-----|
| `owner` | ✅ |
| `admin` | ✅ |
| `master` | ✅ |
| Demais roles (`gerente`, `atendimento`, …) | ❌ **403** `ADMIN_REQUIRED` |
| Não autenticado | ❌ **401** |
| Console platform | ❌ Fora escopo v1 |

---

## 7. Como resolver tenant

Reutilizar padrão Phase 4.4–4.7 (V3 §9, P6):

| Step | Ação |
|------|------|
| 1 | Middleware `requireAppUser` — Bearer JWT app |
| 2 | `assertNoTenantIdQueryParam(req.query)` |
| 3 | Rejeitar campo `tenant_id` no multipart (body fields) |
| 4 | `getTenantAdminActorOrThrow(req.appAuthUser.id, '')` |
| 5 | `tenantId = actorTenantUser.tenant_id` |

**Proibido:** `tenant_id` livre do frontend (query, form field, header custom).

---

## 8. Como validar RBAC

| Gate | Implementação |
|------|---------------|
| Auth | `requireAppUser` |
| Admin clínica | `getTenantAdminActorOrThrow` + role ∈ `{ owner, admin, master }` |
| Permissão módulo `perm-*` | **Não exigir** v1 — operação admin-only |

| Erro | HTTP | Code |
|------|------|------|
| Sem JWT | 401 | — |
| Não admin | 403 | `ADMIN_REQUIRED` |
| Sem membership | 403 | `TENANT_MEMBERSHIP_REQUIRED` |
| Tenant ambíguo | 403 | `TENANT_AMBIGUOUS` |

---

## 9. Formato `multipart/form-data`

| Requisito | Norma |
|-----------|-------|
| **Content-Type** | `multipart/form-data` |
| **Campo binário** | `file` (nome fixo) |
| **JSON body** | ❌ Rejeitar `application/json` com base64 |
| **Parser** | Middleware server-side (ex.: `multer`, `busboy`) — avaliar na impl |

**Campos opcionais v1:**

| Campo | Tipo | Max |
|-------|------|-----|
| `reason` | string | 500 chars — audit |

**Campos proibidos:** `tenant_id`, `logo_url`, `logoUrl`, `name`, `cnpj`, `data`, `base64`, …

---

## 10. Campo `file` obrigatório

| Regra | Detalhe |
|-------|---------|
| Presença | Ausente ou vazio → **400** `PAYLOAD_INVALID` |
| Tipo | Deve ser file part com conteúdo binário |
| Nome original | Ignorado para path; usado só para inferir extensão (validação) |

---

## 11. Tipos permitidos

| MIME allowlist | Extensões entrada |
|----------------|-------------------|
| `image/jpeg` | `.jpg`, `.jpeg` |
| `image/png` | `.png` |
| `image/webp` | `.webp` |

**Proibidos v1:**

| Tipo | Motivo |
|------|--------|
| `image/svg+xml` | XSS sem sanitize |
| `image/gif` | Fora allowlist frontend |
| `application/*`, `text/*` | Não-imagem |

**Validação:** Content-Type do part **+** magic bytes (§ impl) — divergência → **400** `MIME_MISMATCH`.

---

## 12. Limite de tamanho

| Limite | Valor |
|--------|-------|
| **Max bytes** | **2 097 152** (2 MB) |
| **Base** | `CLINIC_LOGO_MAX_BYTES` (`src/utils/clinicLogoImage.js`) · Security §35 |

Excedeu → **400** `FILE_TOO_LARGE` com `details.max_bytes` e `received_bytes`.

Validar **antes** de processar/comprimir.

---

## 13. Normalização para WEBP

| Step | Norma v1 |
|------|----------|
| 1 | Decodificar JPEG/PNG/WEBP de entrada |
| 2 | Redimensionar se dimensão > **1200px** (paridade `CLINIC_LOGO_MAX_DIMENSION`) |
| 3 | Comprimir para WEBP quality adaptativo até ≤ 2 MB |
| 4 | Persistir como `{tenant_id}/logo.webp` com `contentType: image/webp` |
| 5 | Falha compressão → **400** `IMAGE_PROCESSING_FAILED` |

**Preservação segura:** se entrada já é WEBP válido ≤ 2 MB e dimensões OK, pode persistir sem recompressão agressiva.

**Proibido:** persistir SVG, GIF, ou extensão divergente do MIME.

**Evolução legado:** `server/clinicLogoStorage.js` aceita base64 e extensões variadas — **não reutilizar** parser base64 no novo endpoint; extrair apenas lógica bucket/path/upsert.

---

## 14. Como atualizar `clinic_profiles.logo_url`

Fluxo atômico:

```text
1. Guards auth + admin + tenantId
2. Validar file (MIME, size, magic bytes)
3. Normalizar buffer WEBP
4. objectPath = `${tenantId}/logo.webp`
5. supabase.storage.from('clinic-logos').upload(objectPath, buffer, { upsert: true, contentType: 'image/webp', cacheControl: '3600' })
6. publicUrl = getPublicUrl(objectPath).publicUrl
7. snapshot = SELECT logo_url FROM clinic_profiles WHERE tenant_id = tenantId
8. upsertClinicProfileForTenant(supabase, tenantId, { logo_url: publicUrl })
9. Se passo 8 falhar → DELETE object (best effort) → 500 DB_WRITE_FAILED
10. Audit + log + resposta 200
```

| Campo | Regra |
|-------|-------|
| `logo_url` | URL HTTPS pública Supabase Storage |
| `tenant_id` | Imutável — vem do actor |
| Demais colunas `clinic_profiles` | **Não alterar** |

**Constraint:** `clinic_profiles_logo_url_no_data_uri_chk` (014) — URL **nunca** `data:`.

**Reutilizar:** `upsertClinicProfileForTenant` (`server/index.js`) — extrair para `server/lib/assetsLogoApi.js`.

---

## 15. Como invalidar cache local

Responsabilidade **frontend** pós-200; API **não** escreve IndexedDB.

| Cache | Ação pós-sucesso |
|-------|------------------|
| `db.clinicProfile.logoUrl` | Atualizar com `data.url` da resposta |
| `TenantContext.clinicProfile` | Refresh tenant-context ou patch local |
| `useClinicLogo` | Re-render automático se context atualizado |
| `tenantClinicProfileSync.js` | Continua válido para hydrate server → IDB |

**Norma V3 §21:** invalidate/hydrate **após** sucesso API — nunca gravar binário em IDB.

**Cache-bust UI (opcional):** append `?v={timestamp}` na URL exibida — não persistir query string em Postgres.

---

## 16. Como retornar URL final

| Campo resposta | Origem |
|----------------|--------|
| `url` | `getPublicUrl('{tenant_id}/logo.webp')` — HTTPS permanente |
| `path` | `{tenant_id}/logo.webp` |
| `mime_type` | `image/webp` |
| `size_bytes` | Tamanho buffer persistido |
| `url_type` | `"public"` |

**Persistir em DB:** `url` (= `logo_url`).

**Não retornar:** base64, signed URL (desnecessário — bucket público).

---

## 17. Como auditar

| Evento | `ASSET_LOGO_UPLOADED` |
|--------|----------------------|
| **Quando** | HTTP 200 após UPSERT `logo_url` |
| **Persistência v1** | Log estruturado + opcional append audit trail |

**Payload audit (sem binário):**

```json
{
  "audit_event": "ASSET_LOGO_UPLOADED",
  "tenant_id": "uuid",
  "actor_user_id": "auth-uuid",
  "object_path": "{tenant_id}/logo.webp",
  "mime_type": "image/webp",
  "size_bytes": 45678,
  "previous_logo_url_hash": "sha256:…",
  "reason": null
}
```

**Log tag:** `[ASSET_LOGO_UPLOAD]`

| Campo log | Obrigatório |
|-----------|-------------|
| `tenant_id` | ✅ |
| `actor_user_id` | ✅ |
| `object_path` | ✅ |
| `size_bytes` | ✅ |
| `mime_type` | ✅ |
| `durationMs` | ✅ |

**Não logar:** bytes do arquivo, JWT completo.

---

## 18. Rollback se DB falhar após upload

| Ordem falha | Ação |
|-------------|------|
| Validação file | Nenhum efeito |
| Storage upload fail | **500** `STORAGE_UPLOAD_FAILED` — Postgres inalterado |
| Postgres UPSERT fail | **DELETE** object `{tenant_id}/logo.webp` (best effort) |
| Delete object também fail | **503** `ROLLBACK_FAILED` + alerta ops |
| Sucesso parcial proibido | `logo_url` **não** aponta para object órfão sem row |

**Snapshot:** guardar `previous_logo_url` antes do UPSERT — restauração automática **fora de escopo v1** (ops manual).

---

## 19. Erros possíveis

| HTTP | Code | Condição |
|------|------|----------|
| 401 | — | Sem Bearer token |
| 403 | `ADMIN_REQUIRED` | Actor não admin |
| 403 | `TENANT_MEMBERSHIP_REQUIRED` | Sem membership |
| 403 | `TENANT_AMBIGUOUS` | Multi-tenant sem contexto |
| 400 | `TENANT_QUERY_FORBIDDEN` | `tenant_id` na query |
| 400 | `TENANT_BODY_FORBIDDEN` | `tenant_id` no form |
| 400 | `PAYLOAD_INVALID` | Sem campo `file` |
| 400 | `INVALID_FILE_TYPE` | MIME ∉ allowlist |
| 400 | `MIME_MISMATCH` | Magic bytes ≠ Content-Type |
| 400 | `INVALID_FILE_EXTENSION` | Extensão proibida |
| 400 | `FILE_TOO_LARGE` | > 2 MB |
| 400 | `IMAGE_PROCESSING_FAILED` | Falha compressão/normalização |
| 400 | `UNSAFE_OBJECT_PATH` | Path sanitization (interno) |
| 400 | `UNSUPPORTED_FIELD` | Campos proibidos no form |
| 415 | `UNSUPPORTED_MEDIA_TYPE` | Não multipart |
| 500 | `STORAGE_UPLOAD_FAILED` | Erro Supabase Storage |
| 500 | `DB_WRITE_FAILED` | UPSERT falhou; object removido |
| 503 | `ROLLBACK_FAILED` | UPSERT fail + delete fail |
| 500 | `INTERNAL_ERROR` | Erro não classificado |

### Envelope erro (V3)

```json
{
  "ok": false,
  "error": "Arquivo excede o tamanho máximo permitido (2 MB).",
  "code": "FILE_TOO_LARGE",
  "details": {
    "max_bytes": 2097152,
    "received_bytes": 3145728
  }
}
```

---

## 20. Testes obrigatórios

**Suite sugerida:** `src/__tests__/assetsLogoApi.test.js`

| ID | Caso | Esperado |
|----|------|----------|
| T1 | Sem auth | 401 |
| T2 | Sem admin (role atendimento) | 403 `ADMIN_REQUIRED` |
| T3 | `tenant_id` na query | 400 `TENANT_QUERY_FORBIDDEN` |
| T4 | `tenant_id` no form field | 400 `TENANT_BODY_FORBIDDEN` |
| T5 | Sem campo `file` | 400 `PAYLOAD_INVALID` |
| T6 | MIME `application/pdf` | 400 `INVALID_FILE_TYPE` |
| T7 | Magic bytes mismatch | 400 `MIME_MISMATCH` |
| T8 | Arquivo > 2 MB | 400 `FILE_TOO_LARGE` |
| T9 | Extensão `.svg` | 400 `INVALID_FILE_EXTENSION` |
| T10 | Upload sucesso | 200, envelope `{ ok, data, meta }` |
| T11 | `data.asset_type` = `logo` | 200 |
| T12 | `data.url` HTTPS pública | 200 |
| T13 | `data.path` = `{tenant_id}/logo.webp` | mock Storage |
| T14 | `data.mime_type` = `image/webp` | 200 |
| T15 | UPSERT `clinic_profiles.logo_url` | mock spy — valor = `data.url` |
| T16 | Não altera outros campos clinic_profiles | mock |
| T17 | Storage upsert com cacheControl 3600 | mock |
| T18 | Storage fail | 500 `STORAGE_UPLOAD_FAILED` |
| T19 | DB fail pós-upload | 500 + delete object tentado |
| T20 | Rollback delete fail | 503 `ROLLBACK_FAILED` |
| T21 | Base64 no form rejeitado | 400 |
| T22 | Zero IndexedDB no server | grep estático |
| T23 | Audit `ASSET_LOGO_UPLOADED` + log `[ASSET_LOGO_UPLOAD]` | spy |
| T24 | Produção intocada | grep `PRODUCTION_PROJECT_REF` |
| T25 | Rota registrada em `server/index.js` | grep |
| T26 | `logo_url` nunca `data:` | assert UPDATE payload |

**QA manual:** LO-QA-STG-001 (constitution) — upload logo clínica staging.

---

## 21. Compatibilidade com frontend atual

### Estado legado

| Artefato | Comportamento hoje | Pós-cutover |
|----------|-------------------|-------------|
| `clinicLogoUploadService.js` | Upload direto Storage JWT browser → `{tenantId}/logo.{ext}` | **Deprecar** |
| `compressClinicLogoFile` | Compressão client-side WEBP | Opcional preview; upload via API |
| `resolveClinicLogoUrlForSave` | Upload + bloqueia base64 na API | Substituir por `POST /assets/logo` |
| `assertLogoUrlSafeForApi` | Guard antes PUT clinic-profile | Mantém util durante transição |
| `PUT /internal/app/clinic-profile` | Aceita `logo_url` http(s); rejeita `data:` | Soft-deprecate logo field |
| `useClinicLogo` | Lê TenantContext | Sem mudança estrutural |
| `server/clinicLogoStorage.js` | Base64 + ext variável (legado) | **Não** expandir; substituir por lib API |

### Bridge v1

```text
VITE_ASSETS_API_ENABLED=false  → fluxo legado (upload client + PUT profile)
VITE_ASSETS_API_ENABLED=true   → FormData POST /internal/app/assets/logo (único passo)
```

**Ganho:** elimina segundo request `PUT /clinic-profile` só para logo.

### Service HTTP sugerido (impl futura)

```text
POST /internal/app/assets/logo
Authorization: Bearer <app_jwt>
Content-Type: multipart/form-data
Body: file=<File>
```

---

## 22. Payload e resposta (normativo)

### Request

```http
POST /internal/app/assets/logo HTTP/1.1
Authorization: Bearer <app_jwt>
Content-Type: multipart/form-data; boundary=----...

------...
Content-Disposition: form-data; name="file"; filename="logo.png"
Content-Type: image/png

<binary>
------...
```

### Sucesso — HTTP 200

```json
{
  "ok": true,
  "data": {
    "asset_type": "logo",
    "url": "https://tckdjyunwmdpqmewrwvt.supabase.co/storage/v1/object/public/clinic-logos/7aba7127-409c-4ea4-8dbc-807efc5e189c/logo.webp",
    "path": "7aba7127-409c-4ea4-8dbc-807efc5e189c/logo.webp",
    "mime_type": "image/webp",
    "size_bytes": 45678,
    "url_type": "public"
  },
  "meta": {
    "tenant_id": "7aba7127-409c-4ea4-8dbc-807efc5e189c",
    "updated_by": "auth-admin-uuid",
    "audit_event": "ASSET_LOGO_UPLOADED"
  }
}
```

---

## 23. Plano de implementação (referência — não executar nesta fase)

| Step | Ação | Arquivo |
|------|------|---------|
| 1 | Parser multipart + validação | `server/lib/assetsLogoApi.js` |
| 2 | `normalizeLogoToWebp(buffer)` | idem ou reutilizar sharp/wasm |
| 3 | `uploadLogoAsset({ supabase, tenantId, buffer })` | idem |
| 4 | `createAssetsLogoHandler(deps)` | idem |
| 5 | Rota POST | `server/index.js` |
| 6 | Testes T1–T26 | `src/__tests__/assetsLogoApi.test.js` |
| 7 | Wire frontend (flag) | `clinicLogoUploadService.js` |

**Dependências satisfeitas:**

- Bucket `clinic-logos` ✅ (013)
- RLS + CHECK `logo_url` ✅ (014)
- Guards tenant/admin ✅ (Phase 4 pattern)
- Contrato umbrella 4.8 ✅

**Independe de:** migration 024 (avatar) — logo pode implementar **antes** do avatar.

---

## 24. Anti-patterns proibidos

| # | Proibido |
|---|----------|
| A1 | Base64 em `logo_url` ou resposta |
| A2 | `tenant_id` do frontend |
| A3 | Upload binário para IndexedDB como SSOT |
| A4 | `service_role` no browser |
| A5 | SVG upload |
| A6 | Path sem `{tenant_id}/` |
| A7 | Alterar `collaborators` neste endpoint |
| A8 | Mock/seed logo em runtime handler |

---

## 25. Checklist §30 V3 (pré-merge futuro)

- [ ] Envelope `{ ok, data, meta }`
- [ ] Tenant backend-only
- [ ] Admin RBAC
- [ ] Zero IndexedDB server-side
- [ ] Zero base64 Postgres
- [ ] Log `[ASSET_LOGO_UPLOAD]`
- [ ] Audit `ASSET_LOGO_UPLOADED`
- [ ] Testes T1–T26
- [ ] Produção intocada
- [ ] Contrato Phase 4.8B ✅ (este documento)

---

## 26. Veredito

| Critério | Status |
|----------|--------|
| Contrato completo (21 itens) | ✅ |
| Alinhado Phase 4.8 v1.1 | ✅ |
| Bucket 013 existe | ✅ |
| Migration 024 necessária | ❌ **Não** — logo independente |
| Staging live (522) | ⚠️ Bloqueia QA manual only |
| Endpoint implementado | ❌ pendente |

### READY PARA IMPLEMENTAÇÃO

O contrato Phase 4.8B está **completo e normativo**. O endpoint logo **pode ser implementado imediatamente** — bucket `clinic-logos` (013) já existe; **não depende** da migration 024 (avatar).

**Pré-requisitos deploy staging:**

1. Multipart middleware no Admin API
2. Recovery staging Supabase para LO-QA-STG-001 (opcional para dev local com mocks)
3. **Nunca** aplicar/testar writes em produção (`uoepkwhqztmsjnzirpev`) nesta fase

**Nesta entrega:** apenas documento — **zero** código, **zero** Supabase, **zero** commit, **zero** produção.
