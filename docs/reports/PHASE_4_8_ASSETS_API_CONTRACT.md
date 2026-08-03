# Phase 4.8 — Contrato Oficial: Assets Avatar / Logo

**Documento:** `docs/reports/PHASE_4_8_ASSETS_API_CONTRACT.md`  
**Data:** 2026-07-07  
**Base:** V3 Master API Architecture · Phase 4 Official Audit · Database/Security/QA constitutions  
**Escopo:** Contrato **somente documental** — sem código, endpoint, banco, Storage, commit ou produção  
**Versão:** `v1.1.0-draft` (Phase 4.8A.1 — bucket `collaborator-photos` privado, migration 024)

**Changelog v1.1.0:** Alinha contrato à migration `024_collaborator_photos_storage.sql` — avatar em bucket **privado**, signed URL na resposta, `foto_url` persiste storage path (não signed URL expirada).

---

## 1. Objetivo dos endpoints

Centralizar upload de imagens de marca e RH na **Admin API**, eliminando uploads diretos do browser com JWT anon e base64 persistente em IndexedDB/Postgres.

| Endpoint | Objetivo primário |
|----------|-------------------|
| `POST /internal/app/assets/logo` | Receber logomarca da clínica, persistir no **Supabase Storage** e atualizar **`clinic_profiles.logo_url`** |
| `POST /internal/app/assets/avatar` | Receber foto de colaborador RH, persistir no **Supabase Storage** e atualizar **`collaborators.foto_url`** |

| Finalidade | Detalhe |
|------------|---------|
| **Primária** | Substituir fluxos legados (base64 IDB + upload Storage pelo frontend) por operação REST server-side com `service_role` |
| **Secundária** | Garantir path tenant-scoped, validação MIME/tamanho, auditoria e rollback |
| **Fora de escopo v1** | Crop UI, CDN custom, resize avançado, SVG, self-update avatar, delete asset dedicado |
| **Tipo** | **Write sensível** — muta Storage + Postgres (nunca IndexedDB como SSOT) |

**Princípio:** binário vai para Storage; Postgres guarda metadado canônico (`logo_url` HTTPS pública · `foto_url` storage path interno); IndexedDB é cache derivado invalidado após sucesso. Avatares exigem **signed URL** ou proxy API para exibição (bucket privado / LGPD).

---

## 2. Diferença entre avatar de colaborador e logo da clínica

| Dimensão | Logo (`/assets/logo`) | Avatar (`/assets/avatar`) |
|----------|----------------------|---------------------------|
| **Entidade** | Clínica (tenant) | Colaborador RH |
| **Coluna Postgres** | `clinic_profiles.logo_url` | `collaborators.foto_url` |
| **Bucket** | `clinic-logos` (existente, migration 013) | `collaborator-photos` (migration **024** — criada, **não aplicada**) |
| **Cardinalidade** | 1 logo ativa por tenant | 1 avatar ativo por colaborador |
| **Path object** | `{tenant_id}/logo.webp` | `{tenant_id}/collaborators/{collaborator_id}/avatar.webp` |
| **Identificador extra** | Nenhum | `collaborator_id` obrigatório (form field) |
| **RBAC v1** | `owner` \| `admin` \| `master` | `owner` \| `admin` \| `master` |
| **Self-update** | N/A | **Fora de escopo v1** (roadmap) |
| **Visibilidade** | **Pública** — URL permanente (`getPublicUrl`, migration 013) | **Privada** — signed URL curta ou proxy Admin API (migration 024) |
| **Dado pessoal / LGPD** | Marca institucional (baixo risco) | **Sim** — foto identifica colaborador; minimização de exposição |
| **Audit event** | `ASSET_LOGO_UPLOADED` | `ASSET_AVATAR_UPLOADED` |
| **Compat legado** | Substitui `persistClinicLogoUrl` + upload frontend | Substitui `uploadCollaboratorPhoto` → base64 IDB |

**Regra:** logo **nunca** altera `collaborators`; avatar **nunca** altera `clinic_profiles`.

---

## 3. Fonte oficial dos assets

| Camada | Papel | Assets v1 |
|--------|-------|-----------|
| **Supabase Storage** | SSOT binário (bytes) | ✅ Upload via Admin API `service_role` |
| **Postgres** | SSOT metadado | ✅ `logo_url` (HTTPS pública) · `foto_url` (**storage path** canônico) |
| **Auth `user_metadata.avatar_url`** | Avatar login usuário | ❌ **Não alterar** em v1 (domínio distinto) |
| **IndexedDB** | Cache UI (`clinicProfile.logoUrl`, `collaborators[].fotoUrl`) | ❌ **Proibido** como destino de upload |
| **Base64 / data URI** | Legado transição | ❌ **Proibido** persistir em Postgres ou IDB pós-cutover |

**Fluxo canônico:**

```text
Logo:  multipart → Admin API → Storage (público) → UPDATE logo_url HTTPS → resposta url pública
Avatar: multipart → Admin API → Storage (privado) → UPDATE foto_url path → resposta signed_url → frontend invalida IDB
```

---

## 4. Buckets oficiais no Supabase Storage

| Bucket | Status | Migration | Visibilidade | Uso |
|--------|--------|-----------|--------------|-----|
| `clinic-logos` | ✅ Existe | 013 | **Público** (`public = true`) | Logo clínica — URL permanente |
| `collaborator-photos` | 📄 **Criada, não aplicada** | **024** | **Privado** (`public = false`) | Avatar RH — signed URL / proxy |

### 4.1 Políticas RLS Storage (norma — divergência intencional logo vs avatar)

#### `clinic-logos` (migration 013 — inalterado)

- **SELECT:** leitura anônima permitida (bucket público).
- **INSERT/UPDATE/DELETE:** `app_user_can_access_tenant((storage.foldername(name))[1]::uuid)`.
- **Path:** `{tenant_id}/{filename}` — ex.: `{tenant_id}/logo.webp`.

#### `collaborator-photos` (migration 024 — privado / LGPD)

- **SELECT:** somente `authenticated` + `app_user_is_tenant_member(tenant_id)` + path canônico + colaborador existente no tenant.
- **INSERT/UPDATE/DELETE:** somente `app_user_is_tenant_admin(tenant_id)` + path canônico validado.
- **Path obrigatório:** `{tenant_id}/collaborators/{collaborator_uuid}/avatar.webp` — função `collaborator_photos_storage_path_valid`.
- **Proibido:** path flat, sem `tenant_id`, segmento `collaborators` ausente, filename ≠ `avatar.webp`.
- **Admin API:** upload via `service_role` (bypass RLS) — **nunca** expor `service_role` no frontend.

**Pré-requisito path (ambos):** primeiro segmento = `tenant_id` UUID (`SEC-STG-001`, `DB-STG-002`).

### 4.2 Pré-requisito implementação avatar

Migration **`024_collaborator_photos_storage.sql`** já **criada** no repositório; **deve ser aplicada em staging** antes de expor `POST /assets/avatar`. **Não aplicada** nesta fase. **Não** usar bucket inexistente em runtime.

### 4.3 LGPD — fotos de colaboradores

| Aspecto | Norma |
|---------|-------|
| **Natureza** | Dado pessoal (imagem identificável) |
| **Base legal** | Execução contrato / legítimo interesse operacional clínica (política privacy tenant) |
| **Minimização** | Bucket privado; sem URL pública permanente; signed URL TTL curto |
| **Acesso** | Membros autenticados do tenant (RLS SELECT); escrita admin-only |
| **Retenção** | Vinculada ao ciclo de vida do registro RH (`collaborators.deleted_at`) |
| **Migração legado** | Base64 IndexedDB **não** migrada nesta fase |

---

## 5. Caminho / naming dos arquivos

### 5.1 Logo

| Item | Valor normativo v1 |
|------|-------------------|
| **Bucket** | `clinic-logos` |
| **Object key** | `{tenant_id}/logo.webp` |
| **Upsert** | `true` (substitui logo anterior do tenant) |
| **Cache-Control** | `3600` (compatível com `server/clinicLogoStorage.js` e frontend) |

> **Compat legado:** implementação atual usa `{tenant_id}/logo.{ext}` (`server/clinicLogoStorage.js:34`, `clinicLogoUploadService.js:42`). v1 da API **normaliza para `.webp`** no upload server-side; URLs antigas `{tenant_id}/logo.jpg` permanecem válidas até próximo upload.

### 5.2 Avatar

| Item | Valor normativo v1 |
|------|-------------------|
| **Bucket** | `collaborator-photos` |
| **Object key** | `{tenant_id}/collaborators/{collaborator_id}/avatar.webp` |
| **`collaborator_id` no path** | UUID canônico `collaborators.id` (resolvido a partir do form field) |
| **Upsert** | `true` |
| **Cache-Control** | `3600` |

**Proibições de path:**

- Path sem prefixo `tenant_id` → rejeitar antes do upload.
- Path com `../`, caracteres de controle ou segmentos vazios → **400** `UNSAFE_OBJECT_PATH`.
- Nome de arquivo original do cliente **não** entra no object key (somente metadado de log).

---

## 6. Limites de tamanho

| Asset | Max bytes | Base normativa |
|-------|-----------|----------------|
| **Logo** | **2 097 152** (2 MB) | `CLINIC_LOGO_MAX_BYTES` (`src/utils/clinicLogoImage.js`) · Security §35 |
| **Avatar** | **2 097 152** (2 MB) | Paridade logo · QA STG |

**Comportamento:**

- Validar `Content-Length` / tamanho do buffer **antes** de processar.
- Excedeu → **400** `FILE_TOO_LARGE` com `details.max_bytes`.
- Opcional v1: recompressão server-side para WEBP (não obrigatório no contrato; se falhar compressão, rejeitar).

---

## 7. Tipos permitidos

| Asset | MIME allowlist | Extensões derivadas |
|-------|----------------|---------------------|
| **Logo** | `image/jpeg`, `image/png`, `image/webp` | `.jpg`, `.jpeg`, `.png`, `.webp` |
| **Avatar** | `image/jpeg`, `image/png`, `image/webp` | `.jpg`, `.jpeg`, `.png`, `.webp` |

**Proibidos v1:**

| Tipo | Motivo |
|------|--------|
| `image/svg+xml` | XSS vector sem sanitize (`SEC §35`) |
| `image/gif` | Fora allowlist frontend logo |
| `application/*`, `text/*` | Não-imagem |
| `image/heic`, `image/heif` | Fora escopo v1 |

**Saída normalizada:** object persistido como **`image/webp`** com extensão `.webp`.

---

## 8. Validação de MIME

Ordem obrigatória (fail closed):

1. **Reject early** se `Content-Type` do part `file` ∉ allowlist.
2. **Magic bytes** (file signature) no buffer — não confiar só no header HTTP.
3. **Cross-check** extensão inferida vs magic bytes; divergência → **400** `MIME_MISMATCH`.
4. **Reject** polyglot / content-type spoofing (ex.: `.jpg` com header `application/pdf`).

| Assinatura | MIME |
|------------|------|
| `FF D8 FF` | JPEG |
| `89 50 4E 47` | PNG |
| `RIFF....WEBP` | WEBP |

---

## 9. Validação de extensão

| Regra | Detalhe |
|-------|---------|
| **Entrada** | Extrair extensão de `file.originalname` (se presente); lowercase |
| **Allowlist** | `.jpg`, `.jpeg`, `.png`, `.webp` |
| **Sem extensão** | Permitido se MIME + magic bytes válidos |
| **Extensão proibida** | `.svg`, `.html`, `.js`, `.exe`, `.php`, etc. → **400** `INVALID_FILE_EXTENSION` |
| **Object key** | Sempre `.webp` — extensão de entrada não compõe path final |

---

## 10. Proibição de base64 persistente

| Local | Regra |
|-------|-------|
| `clinic_profiles.logo_url` | CHECK `logo_url !~* '^data:'` (migration 014) |
| `collaborators.foto_url` | CHECK + trigger (016) · **proibido** signed URL expirada e base64 |
| Payload API | **Rejeitar** `application/json` com `data:` / base64 — endpoints aceitam **somente** `multipart/form-data` |
| IndexedDB | **Proibido** gravar `data:image/*` em `clinicProfile.logoUrl` ou `collaborators[].fotoUrl` pós-cutover |
| Handler legado | `PUT /clinic-profile` mantém guard `LOGO_MUST_BE_STORAGE_URL` (`server/index.js:2208-2213`) |

**Norma Phase 4.8+:** frontend deixa de chamar `uploadCollaboratorPhoto` com `file.dataUrl` (`collaboratorService.js:599-603`).

---

## 11. Como resolver tenant

Reutilizar padrão Phase 4.4–4.7 (V3 §9, P6):

| Step | Ação |
|------|------|
| 1 | `requireAppUser` — JWT Bearer app |
| 2 | `assertNoTenantIdQueryParam(req.query)` — rejeitar `?tenant_id=` |
| 3 | `assertNoTenantIdInBody` — rejeitar campos `tenant_id` no multipart fields |
| 4 | `getTenantAdminActorOrThrow(req.appAuthUser.id, '')` — tenant implícito do membership admin |
| 5 | `tenantId = actorTenantUser.tenant_id` |

**Erros:**

| Condição | HTTP | Code |
|----------|------|------|
| Sem JWT | 401 | — |
| Sem membership | 403 | `TENANT_MEMBERSHIP_REQUIRED` |
| Tenant ambíguo | 403 | `TENANT_AMBIGUOUS` |
| `tenant_id` na query | 400 | `TENANT_QUERY_FORBIDDEN` |
| `tenant_id` no form | 400 | `TENANT_BODY_FORBIDDEN` |

**Proibido:** aceitar `tenant_id` livre do frontend (P6, SEC-IDOR-001).

---

## 12. Como validar RBAC

| Gate | Implementação |
|------|---------------|
| Middleware | `requireAppUser` |
| Admin clínica | `getTenantAdminActorOrThrow` + `isTenantAdminRole(role)` |
| Papéis permitidos v1 | `owner`, `admin`, `master` |
| Permissão módulo | **Não exigir** `perm-*` granular em v1 — operação admin-only |

**403** `ADMIN_REQUIRED` se actor não for admin clínica.

---

## 13. Quem pode alterar logo

| Actor | v1 | Futuro |
|-------|-----|--------|
| `owner` | ✅ | ✅ |
| `admin` | ✅ | ✅ |
| `master` | ✅ | ✅ |
| Demais roles (`gerente`, `atendimento`, …) | ❌ 403 | ❌ |
| Usuário não autenticado | ❌ 401 | ❌ |
| Console platform (`/internal/platform/*`) | ❌ Fora escopo | Opcional via impersonation auditado |

---

## 14. Quem pode alterar avatar

| Actor | v1 | Futuro |
|-------|-----|--------|
| `owner` | ✅ | ✅ |
| `admin` | ✅ | ✅ |
| `master` | ✅ | ✅ |
| Colaborador sobre **própria** foto (self) | ❌ | 📋 Phase 4.9+ com guard `collaborator_uuid === actor` |
| Demais roles | ❌ 403 | ❌ |

**v1:** somente admin altera avatar de qualquer colaborador do tenant, inclusive colaborador **inativo** (paridade Melissa / RH admin).

---

## 15. Como atualizar `clinic_profiles.logo_url`

Fluxo atômico no handler `POST /assets/logo`:

```text
1. Validar file + resolver tenantId (admin)
2. Upload Storage → publicUrl
3. Snapshot logo_url anterior (rollback)
4. UPSERT clinic_profiles SET logo_url = publicUrl, updated_at = now()
   WHERE tenant_id = tenantId
5. Se passo 4 falhar → DELETE object Storage (best effort) → 500 DB_WRITE_FAILED
6. Retornar envelope sucesso
```

| Campo | Regra |
|-------|-------|
| `logo_url` | URL HTTPS pública do Supabase Storage |
| `tenant_id` | Imutável — vem do actor, nunca do form |
| Outros campos `clinic_profiles` | **Não alterar** neste endpoint |

**Reutilizar:** `upsertClinicProfileForTenant` (`server/index.js` clinic-profile) — extrair para lib testável.

**Compat:** `PUT /internal/app/clinic-profile` continua aceitando `logo_url` http(s) externa; **deprecação soft** após cutover frontend para `POST /assets/logo`.

---

## 16. Como atualizar `collaborators.foto_url`

Fluxo atômico no handler `POST /assets/avatar`:

```text
1. Validar file + resolver tenantId (admin)
2. Resolver collaborator_id no tenant (§17)
3. Upload Storage (bucket privado, service_role) → objectPath
4. Snapshot foto_url anterior
5. UPDATE collaborators SET foto_url = storagePathCanonico, updated_at = now()
   WHERE id = collaborator.id AND tenant_id = tenantId AND deleted_at IS NULL
6. Se passo 5 falhar → DELETE object Storage (best effort) → 500 DB_WRITE_FAILED
7. Gerar signed_url (TTL curto) para resposta imediata
8. Retornar envelope sucesso (path + signed_url — não persistir signed_url)
```

### 16.1 Formato persistido em `foto_url`

| Formato | Permitido persistir | Uso |
|---------|---------------------|-----|
| **Storage path canônico** (preferencial) | ✅ | `collaborator-photos:{tenant_id}/collaborators/{uuid}/avatar.webp` ou path relativo `{tenant_id}/collaborators/{uuid}/avatar.webp` |
| **URL proxy Admin API** | ✅ | `https://api.../internal/app/assets/avatar/{collaborator_id}` (roadmap GET proxy) |
| **HTTPS externa estável** | ⚠️ Legado | Aceito se já existir; novos uploads usam path |
| **Signed URL Supabase** | ❌ **Proibido** | Expira — não é SSOT |
| **Base64 / data URI** | ❌ **Proibido** | CHECK + trigger 016 |

**Regra:** `foto_url` é **referência estável** ao object Storage; exibição usa **signed URL** gerada on-demand (upload response, GET colaborador, ou endpoint refresh dedicado futuro).

| Campo | Regra |
|-------|-------|
| `foto_url` | Path canônico ou URL controlada — **nunca** signed URL expirada, **nunca** `data:` |
| `collaborator_id`, `collaborator_uuid`, `tenant_id` | **Não alterar** |
| `tenant_users` | **Não alterar** |
| Auth `user_metadata` | **Não alterar** v1 |

**404** `COLLABORATOR_NOT_FOUND` se colaborador inexistente ou soft-deleted no tenant.

---

## 17. Resolução de colaborador (avatar)

Campo form **`collaborator_id`** obrigatório.

**Reutilizar** `resolveCollaboratorInTenant(supabase, tenantId, collaborator_id)` (`collaboratorsPermissionsApi.js`):

| Estratégia | `resolved_by` |
|------------|---------------|
| UUID `collaborators.id` | `uuid` |
| `collaborators.legacy_id` | `legacy_id` |
| `tenant_users.collaborator_uuid` | `tenant_user_uuid` |
| `tenant_users.collaborator_id` (text) | `tenant_user_text` |

**Não exige** `tenant_user` vinculado (diferente de permissions write) — foto é atributo RH.

---

## 18. Como invalidar cache IndexedDB

Responsabilidade **frontend** pós-resposta 200; API **não** escreve IndexedDB.

| Asset | Cache | Invalidação |
|-------|-------|-------------|
| **Logo** | `db.clinicProfile.logoUrl` | Atualizar com `data.url` (pública permanente) |
| **Avatar** | `db.collaborators[]` | Persistir `fotoUrl` = **storage path**; cache UI usa `signed_url` da resposta até refresh |
| **Avatar display** | Componentes (`AppAvatar`, roster) | Usar `signed_url` ativa; renovar via API quando expirar (roadmap `GET .../avatar-url`) |
| **TenantContext** | `clinicProfile` in-memory | Hook `useClinicLogo` re-render automático se context atualizado |

**Norma V3 §21:** hydrate/invalidate **após** sucesso API — nunca upload binário para IDB.

**Header opcional futuro:** `X-Invalidate-Cache: clinicProfile,collaborators` (informativo; não normativo v1).

---

## 19. Como retornar URL pública / assinada

| Bucket | v1 | Mecanismo |
|--------|-----|-----------|
| `clinic-logos` | **URL pública permanente** | `supabase.storage.from('clinic-logos').getPublicUrl(objectPath)` — migration 013 |
| `collaborator-photos` | **Signed URL curta** | `createSignedUrl(objectPath, expiresIn)` via Admin API `service_role` |

### 19.1 Logo — resposta (pública)

```json
{
  "url": "https://{project}.supabase.co/storage/v1/object/public/clinic-logos/{tenant_id}/logo.webp",
  "path": "{tenant_id}/logo.webp",
  "url_type": "public"
}
```

Persistir em `clinic_profiles.logo_url`: a mesma URL pública HTTPS.

### 19.2 Avatar — resposta (privado / signed)

```json
{
  "asset_type": "avatar",
  "path": "{tenant_id}/collaborators/{collaborator_uuid}/avatar.webp",
  "storage_ref": "collaborator-photos:{tenant_id}/collaborators/{collaborator_uuid}/avatar.webp",
  "signed_url": "https://{project}.supabase.co/storage/v1/object/sign/collaborator-photos/...?token=...",
  "signed_url_expires_in": 3600,
  "mime_type": "image/webp",
  "size_bytes": 12345,
  "url_type": "signed"
}
```

| Campo | Regra |
|-------|-------|
| `path` | Object key canônico — **persistir** em `foto_url` (formato §16.1) |
| `signed_url` | **Somente resposta** — TTL default **3600s** (1h); configurável max 86400 |
| `signed_url_expires_in` | Segundos até expiração |
| `url` | **Não usar** para avatar v1 (omitir ou deprecated) |

### 19.3 Alternativa: proxy Admin API (roadmap)

`GET /internal/app/assets/avatar/:collaborator_id/content` — stream binário após validar membership tenant. Útil se signed URL for insuficiente (CSP, cache). **Fora de escopo v1**; documentado para evolução.

**Regras gerais:**

- URL **HTTPS** only em produção (`SEC-STG-003`).
- **Não** retornar base64 na resposta.
- **Não** retornar avatar cross-tenant — signed URL gerada **após** resolver colaborador no tenant do actor.
- **Não** expor object path de outro tenant na resposta de erro.

---

## 20. Segurança de upload

| Controle | Norma |
|----------|-------|
| **Auth** | JWT obrigatório |
| **RBAC** | Admin-only v1 |
| **Tenant isolation** | Path prefix + resolver backend |
| **MIME + magic bytes** | §8 |
| **Tamanho max** | §6 |
| **Filename** | Sanitizar; não usar nome original no path |
| **Rate limit** | V3 §17 — ex.: 10 uploads/min/tenant (implementação) |
| **Timeout** | 60s (V3 §18) |
| **service_role** | Upload Storage somente backend — browser **não** envia binário direto pós-cutover |
| **SVG / HTML** | Proibido |
| **Overwrite** | Upsert explícito — logo/avatar substituem anterior |
| **IDOR** | Colaborador deve pertencer ao tenant resolvido |
| **Cross-tenant avatar** | **403/404** — nunca gerar signed URL para path de outro tenant |
| **Signed URL TTL** | Default 3600s; max 86400; **não persistir** signed URL em Postgres/IDB |
| **Path disclosure** | Respostas de erro **não** revelam paths de objetos de outros tenants |
| **Bucket privado avatar** | Leitura anônima **impossível** — migration 024 `public = false` |
| **Usuário sem tenant** | Sem membership → **403** antes de qualquer operação Storage |
| **LGPD** | Foto colaborador = dado pessoal; acesso mínimo necessário |
| **Malware scan** | Roadmap (Security §36) — não blocker v1 |
| **CSP / XSS** | URLs Storage em `<img src>` — sem inline base64 |

**Produção:** project ref `uoepkwhqztmsjnzirpev` — **intocável**; testes/staging apenas.

---

## 21. Auditoria

| Evento | Quando | Persistência v1 |
|--------|--------|-----------------|
| `ASSET_LOGO_UPLOADED` | Sucesso logo | Log estruturado + opcional `identity_events` / Auth audit append |
| `ASSET_AVATAR_UPLOADED` | Sucesso avatar | Idem |

**Payload audit mínimo (sem PII binária):**

```json
{
  "audit_event": "ASSET_AVATAR_UPLOADED",
  "tenant_id": "uuid",
  "actor_user_id": "auth-uuid",
  "collaborator_id": "uuid",
  "object_path": "{tenant_id}/collaborators/{id}/avatar.webp",
  "mime_type": "image/webp",
  "size_bytes": 12345,
  "previous_url_hash": "sha256:…",
  "reason": null
}
```

**Não registrar:** bytes do arquivo, base64, e-mail, CPF.

**Tabela relacional:** `audit_logs` app clínica ainda ausente (Phase 4 audit) — v1 usa log + append Auth metadata audit trail onde existir padrão (`appendAccessAuditToAuthUser`).

---

## 22. Logs

### 22.1 Logo — `[ASSET_LOGO_UPLOAD]`

| Campo | Tipo | Obrigatório |
|-------|------|-------------|
| `tenant_id` | UUID | ✅ |
| `actor_user_id` | UUID | ✅ |
| `object_path` | string | ✅ |
| `size_bytes` | number | ✅ |
| `mime_type` | string | ✅ |
| `durationMs` | number | ✅ |
| `error` | string | Se falha |

### 22.2 Avatar — `[ASSET_AVATAR_UPLOAD]`

Campos logo **+**:

| Campo | Tipo |
|-------|------|
| `collaborator_ref` | string (input form) |
| `collaborator_id` | UUID resolvido |
| `resolved_by` | enum |
| `signed_url_expires_in` | number |

**Proibições log:** conteúdo binário, tokens JWT completos, **signed URL completa** (logar apenas TTL e path).

---

## 23. Erros possíveis

| HTTP | Code | Condição |
|------|------|----------|
| 401 | — | Sem Bearer token |
| 403 | `ADMIN_REQUIRED` | Actor não admin |
| 403 | `TENANT_MEMBERSHIP_REQUIRED` | Sem membership |
| 403 | `TENANT_AMBIGUOUS` | Multi-tenant sem contexto |
| 404 | `COLLABORATOR_NOT_FOUND` | Avatar — colaborador inválido / outro tenant / deleted |
| 400 | `TENANT_QUERY_FORBIDDEN` | `tenant_id` na query |
| 400 | `TENANT_BODY_FORBIDDEN` | `tenant_id` no form |
| 400 | `PAYLOAD_INVALID` | Sem campo `file` |
| 400 | `INVALID_FILE_TYPE` | MIME não allowlist |
| 400 | `MIME_MISMATCH` | Magic bytes ≠ Content-Type |
| 400 | `INVALID_FILE_EXTENSION` | Extensão proibida |
| 400 | `FILE_TOO_LARGE` | > 2 MB |
| 400 | `UNSUPPORTED_FIELD` | Campos extras proibidos (`role_slug`, `logo_url`, …) |
| 400 | `INVALID_COLLABORATOR_ID` | Avatar — `collaborator_id` vazio |
| 400 | `UNSAFE_OBJECT_PATH` | Path sanitization falhou |
| 413 | `FILE_TOO_LARGE` | Alternativa semântica HTTP |
| 415 | `UNSUPPORTED_MEDIA_TYPE` | Content-Type multipart ausente |
| 500 | `STORAGE_UPLOAD_FAILED` | Supabase Storage error |
| 500 | `DB_WRITE_FAILED` | Postgres update falhou pós-upload |
| 503 | `ROLLBACK_FAILED` | Upload OK, DB fail, delete object também fail |
| 500 | `INTERNAL_ERROR` | Erro não classificado |

### 23.1 Envelope erro (V3)

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

## 24. Plano de rollback

### 24.1 Rollback request-level (transação lógica)

| Ordem falha | Ação |
|-------------|------|
| Validação | Nenhum efeito |
| Storage upload fail | Nenhum efeito Postgres |
| Postgres update fail | **DELETE** object recém-criado (best effort) → **500** `DB_WRITE_FAILED` |
| Delete object fail | **503** `ROLLBACK_FAILED` + alerta ops |

**Snapshot:** guardar `previous_logo_url` / `previous_foto_url` antes do update; **não** restaurar automaticamente em v1 (ops manual). Rollback automático foca em **não deixar URL nova no DB sem consistência**.

### 24.2 Rollback operacional (deploy)

| Nível | Ação |
|-------|------|
| R0 | Remover rotas `POST /assets/*` |
| R1 | Frontend volta upload direto Storage (`clinicLogoUploadService.js`) + PUT clinic-profile |
| R2 | Avatar volta base64 IDB (somente ambiente dev legado) |
| RTO | Imediato (feature flag `ASSETS_API_ENABLED=false`) |

### 24.3 Rollback dados

- Objetos Storage órfãos: job cleanup `{tenant_id}/collaborators/*/avatar.webp` sem row matching (ops).
- URLs antigas em Postgres permanecem válidas até próximo upload.

---

## 25. Testes obrigatórios

**Suites sugeridas:**

- `src/__tests__/assetsLogoApi.test.js`
- `src/__tests__/assetsAvatarApi.test.js`

| ID | Caso | Endpoint | Esperado |
|----|------|----------|----------|
| T1 | Sem auth | ambos | 401 |
| T2 | Sem admin | ambos | 403 `ADMIN_REQUIRED` |
| T3 | `tenant_id` query | ambos | 400 `TENANT_QUERY_FORBIDDEN` |
| T4 | `tenant_id` form field | ambos | 400 `TENANT_BODY_FORBIDDEN` |
| T5 | Sem arquivo `file` | ambos | 400 `PAYLOAD_INVALID` |
| T6 | MIME inválido (`application/pdf`) | ambos | 400 `INVALID_FILE_TYPE` |
| T7 | Magic bytes mismatch | ambos | 400 `MIME_MISMATCH` |
| T8 | Arquivo > 2 MB | ambos | 400 `FILE_TOO_LARGE` |
| T9 | Extensão `.svg` | ambos | 400 `INVALID_FILE_EXTENSION` |
| T10 | Logo sucesso | logo | 200, `asset_type=logo`, URL pública |
| T11 | Logo atualiza `clinic_profiles.logo_url` | logo | mock spy UPDATE |
| T12 | Logo path `{tenant_id}/logo.webp` | logo | mock Storage path |
| T13 | Avatar sucesso | avatar | 200, `signed_url` + `path`, `url_type=signed` |
| T14 | Avatar collaborator inexistente | avatar | 404 |
| T15 | Avatar collaborator outro tenant | avatar | 404 — **sem** signed URL cross-tenant |
| T16 | Avatar atualiza `collaborators.foto_url` | avatar | mock spy — valor = **storage path**, não signed URL |
| T17 | Avatar path correto | avatar | `{tenant_id}/collaborators/{uuid}/avatar.webp` |
| T18 | Avatar Melissa inativa | avatar | 200 permitido |
| T19 | Storage fail | ambos | 500 `STORAGE_UPLOAD_FAILED` |
| T20 | DB fail pós-upload | ambos | 500 + tentativa delete object |
| T21 | Rollback delete fail | ambos | 503 `ROLLBACK_FAILED` |
| T22 | Zero IndexedDB no server | ambos | grep estático |
| T23 | Zero base64 em resposta/DB | ambos | assert sem `data:`; foto_url ≠ signed URL |
| T24 | Audit event + log tag | ambos | spy `[ASSET_*_UPLOAD]` |
| T25 | Produção intocada | ambos | grep `PRODUCTION_PROJECT_REF` guard |
| T26 | Não altera campos proibidos | avatar | sem write `tenant_id`, `legacy_id` |
| T27 | Registro rota em index.js | ambos | grep rota |
| T28 | Signed URL gerada | avatar | mock `createSignedUrl`; TTL = 3600 |
| T29 | Signed URL expira | avatar | token inválido após TTL (integração staging) |
| T30 | Usuário sem tenant | avatar | 403 `TENANT_MEMBERSHIP_REQUIRED` |
| T31 | Cross-tenant bloqueado | avatar | tenant A não obtém signed URL de colaborador tenant B |
| T32 | Base64 rejeitado | avatar | 400 — payload multipart com data URI inline |

**QA manual (constitution):** LO-QA-STG-001 (logo), LO-QA-STG-002 cross-tenant logo (§ QA doc).

---

## 26. Compatibilidade com frontend atual

### 26.1 Logo — estado atual

| Componente | Comportamento hoje | Pós-cutover |
|------------|-------------------|-------------|
| `clinicLogoUploadService.js` | Upload direto Storage com JWT browser → `{tenantId}/logo.{ext}` | **Deprecar** — chamar Admin API |
| `resolveClinicLogoUrlForSave` | Comprime + upload; bloqueia base64 na API | Substituir por `POST /assets/logo` |
| `PUT /clinic-profile` | Aceita `logo_url` http(s); rejeita `data:` | Mantém; logo URL pode vir do novo endpoint |
| `useClinicLogo` | Lê `TenantContext.clinicProfile` | Sem mudança se context invalidado |
| `tenantClinicProfileSync.js` | Hydrate IDB | Continua após resposta API |

**Bridge v1:** frontend pode chamar `POST /assets/logo` **sem** segundo PUT — endpoint já persiste `logo_url`.

### 26.2 Avatar — estado atual

| Componente | Comportamento hoje | Pós-cutover |
|------------|-------------------|-------------|
| `uploadCollaboratorPhoto` | Grava `dataUrl` base64 no IDB | **Substituir** por `POST /assets/avatar` |
| `CollaboratorsPage.jsx` | FileReader → base64 local | FormData → Admin API |
| `collaboratorMapper.ts` | Rejeita base64 em Supabase row | Alinhado — API grava storage path |
| `avatarUtils.js` | Resolve `fotoUrl` / fallback data URL | Priorizar `signed_url`; resolver path → refresh URL via API |
| `AppAvatar.jsx` | Exibe URL ou iniciais | Consumir `signed_url`; fallback iniciais se expirada |

### 26.3 Feature flag sugerida

```text
VITE_ASSETS_API_ENABLED=false  → legado
VITE_ASSETS_API_ENABLED=true   → POST /internal/app/assets/*
```

---

## 27. Payload e resposta (normativo)

### 27.1 `POST /internal/app/assets/logo`

**Content-Type:** `multipart/form-data`

| Campo | Tipo | Obrigatório |
|-------|------|-------------|
| `file` | binary | ✅ |
| `reason` | string | ❌ max 500 chars |

**Campos proibidos:** `tenant_id`, `logo_url`, `name`, `cnpj`, …

### 27.2 `POST /internal/app/assets/avatar`

| Campo | Tipo | Obrigatório |
|-------|------|-------------|
| `file` | binary | ✅ |
| `collaborator_id` | string | ✅ |
| `reason` | string | ❌ |

### 27.3 Sucesso — avatar (200)

```json
{
  "ok": true,
  "data": {
    "asset_type": "avatar",
    "path": "7aba7127-409c-4ea4-8dbc-807efc5e189c/collaborators/a1000002-0002-4002-8002-000000000002/avatar.webp",
    "storage_ref": "collaborator-photos:7aba7127-409c-4ea4-8dbc-807efc5e189c/collaborators/a1000002-0002-4002-8002-000000000002/avatar.webp",
    "signed_url": "https://tckdjyunwmdpqmewrwvt.supabase.co/storage/v1/object/sign/collaborator-photos/7aba7127-409c-4ea4-8dbc-807efc5e189c/collaborators/a1000002-0002-4002-8002-000000000002/avatar.webp?token=...",
    "signed_url_expires_in": 3600,
    "mime_type": "image/webp",
    "size_bytes": 12345,
    "url_type": "signed",
    "collaborator_id": "a1000002-0002-4002-8002-000000000002"
  },
  "meta": {
    "tenant_id": "7aba7127-409c-4ea4-8dbc-807efc5e189c",
    "updated_by": "auth-admin-uuid",
    "resolved_by": "uuid",
    "audit_event": "ASSET_AVATAR_UPLOADED"
  }
}
```

> **Persistência:** `collaborators.foto_url` recebe `storage_ref` ou `path` — **não** `signed_url`.

### 27.4 Sucesso — logo (200)

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

## 28. Plano de implementação (referência — não executar nesta fase)

| Step | Ação | Arquivo |
|------|------|---------|
| 0 | Aplicar migration bucket `collaborator-photos` em **staging** | `supabase/migrations/024_collaborator_photos_storage.sql` ✅ criada |
| 1 | Parser multipart + validação file | `server/lib/assetsUploadApi.js` |
| 2 | `uploadLogoAsset({ ... })` — URL pública | idem |
| 3 | `uploadAvatarAsset({ ... })` — signed URL + path persist | idem |
| 4 | Reutilizar `resolveCollaboratorInTenant` | import permissions API |
| 5 | Rotas POST | `server/index.js` |
| 6 | Testes T1–T32 | `src/__tests__/assets*Api.test.js` |
| 7 | Wire frontend (flag) | `clinicLogoUploadService.js`, `collaboratorService.js` |

**Dependências satisfeitas:**

- Bucket logo ✅ (013, aplicada)
- Migration avatar **024** ✅ criada no repo
- Guards tenant/admin ✅ (padrão Phase 4)
- Constraints Postgres anti-base64 ✅ (014, 016)

**Dependências pendentes:**

- Migration **024 aplicada em staging** ❌ (arquivo existe; **não aplicada**)
- Staging live validation ❌ (522 RC-03.9)
- Multipart middleware no server — avaliar na impl
- Endpoint `POST /assets/avatar` ❌ — **depende** da migration 024 em staging

---

## 29. Checklist §30 V3 (pré-merge futuro)

- [ ] Envelope `{ ok, data, meta }`
- [ ] Tenant backend-only
- [ ] Admin RBAC
- [ ] Zero IndexedDB server-side
- [ ] Zero base64 Postgres
- [ ] Log estruturado
- [ ] Audit event
- [ ] Testes T1–T32
- [ ] Produção intocada
- [ ] Contrato Phase 4.8 ✅ (este documento)

---

## 30. Veredito

| Critério | Status |
|----------|--------|
| Contrato completo (25+ itens) | ✅ |
| Alinhado migration 024 (bucket privado) | ✅ v1.1.0 |
| Alinhado V3 Architecture §22–23 | ✅ |
| Alinhado Security §8, §35, LGPD | ✅ |
| Alinhado Database §15 | ✅ |
| Compat frontend documentada | ✅ |
| Bucket logo (`clinic-logos` público) | ✅ migration 013 aplicada |
| Migration avatar 024 | ✅ **criada** · ❌ **não aplicada** |
| Endpoint assets | ❌ pendente impl + migration staging |
| Staging live | ❌ BLOCKED_EXTERNAL |

### READY PARA IMPLEMENTAÇÃO

O contrato v1.1.0 está **completo e normativo** para iniciar Phase 4.8 (código + testes).

**Sequência obrigatória antes de `POST /assets/avatar` em staging:**

1. Aplicar **`024_collaborator_photos_storage.sql`** em staging ( **não** produção sem gate RC).
2. Validar bucket privado + policies (queries comentadas na migration § V1–V6).
3. Implementar endpoint com `createSignedUrl` + persistência `foto_url` = storage path.
4. Recovery staging Supabase (522) para QA live.

**Logo (`POST /assets/logo`):** pode avançar independentemente — bucket 013 já existe.

**Nesta entrega (4.8A.1):** apenas atualização documental — **zero** código, **zero** Supabase apply, **zero** commit, **zero** produção.
