# Phase 4.8D — Contrato Oficial: Avatar de Colaborador

**Documento:** `docs/reports/PHASE_4_8D_AVATAR_API_CONTRACT.md`  
**Data:** 2026-07-07  
**Base:** Phase 4.8 Assets v1.1 · migration 024 · Phase 4.8C `assetsLogoApi.js` · V3 Master API  
**Escopo:** Contrato **somente documental** — sem código, endpoint, migration apply, commit ou produção  
**Versão:** `v1.0.0-draft`

**Endpoints alvo:**

| Método | Path |
|--------|------|
| **POST** | `/internal/app/assets/avatar` |
| **GET** | `/internal/app/assets/avatar/:collaboratorId` |

**Relacionado:** [`PHASE_4_8_ASSETS_API_CONTRACT.md`](./PHASE_4_8_ASSETS_API_CONTRACT.md) · [`PHASE_4_8B_LOGO_UPLOAD_API_CONTRACT.md`](./PHASE_4_8B_LOGO_UPLOAD_API_CONTRACT.md) · [`PHASE_4_8C` impl logo](../server/lib/assetsLogoApi.js)

---

## 1. Objetivo dos endpoints

Centralizar upload e leitura de **foto RH** (avatar) via Admin API, com bucket **privado**, **signed URL** temporária e persistência canônica em `collaborators.foto_url`.

| Endpoint | Objetivo |
|----------|----------|
| **POST `/assets/avatar`** | Receber imagem, validar, upload Storage, UPDATE `foto_url` (storage path), retornar **signed_url** |
| **GET `/assets/avatar/:collaboratorId`** | Resolver colaborador no tenant, gerar **signed_url** on-demand para exibição (sem expor bucket permanentemente) |

| Finalidade | Detalhe |
|------------|---------|
| **Primária** | Substituir `uploadCollaboratorPhoto` → base64 IndexedDB (`collaboratorService.js`) |
| **Secundária** | LGPD — minimizar exposição; leitura tenant-scoped; escrita admin-only |
| **Fora de escopo v1** | Self-update colaborador, delete dedicado, crop UI, proxy stream binário, Auth `user_metadata.avatar_url` |
| **Tipo POST** | **Write sensível** — Storage + Postgres |
| **Tipo GET** | **Read** — signed URL efêmera; sem write |

**Princípio:** binário no Storage privado; Postgres guarda **storage path**; UI usa **signed_url** renovável; IndexedDB cache derivado.

---

## 2. Bucket oficial `collaborator-photos`

| Item | Valor |
|------|-------|
| **ID** | `collaborator-photos` |
| **Migration** | `024_collaborator_photos_storage.sql` |
| **Status repo** | ✅ Criada · ❌ **Não aplicada** (pré-requisito live) |
| **Visibilidade** | **Privada** (`public = false`) |
| **Limite bucket** | 2 MB · MIME `image/jpeg`, `image/png`, `image/webp` |
| **Upload runtime** | Admin API `service_role` (bypass RLS) |

**Helpers SQL (024):**

- `collaborator_photos_storage_path_valid(object_name)`
- `collaborator_photos_storage_tenant_id(object_name)`
- `collaborator_photos_storage_collaborator_valid(object_name)`
- `app_user_is_tenant_member(p_tenant_id)`

---

## 3. Visibilidade privada

| Aspecto | Norma |
|---------|-------|
| **Leitura anônima CDN** | ❌ **Proibida** |
| **Leitura autenticada** | ✅ Membro ativo do tenant (RLS SELECT 024) |
| **Escrita** | ✅ Admin clínica (RLS INSERT/UPDATE/DELETE 024) + Admin API POST |
| **Resposta API** | **Somente `signed_url`** — nunca URL pública permanente |
| **Persistência DB** | **Storage path** — nunca signed URL |
| **LGPD** | Foto identifica colaborador — dado pessoal; minimização de exposição |

**Regra absoluta:** **Nunca** retornar `getPublicUrl` para avatar v1.

---

## 4. Path oficial

| Item | Valor normativo v1 |
|------|-------------------|
| **Object key** | `{tenant_id}/collaborators/{collaborator_uuid}/avatar.webp` |
| **`collaborator_uuid`** | `collaborators.id` (UUID canônico após resolução) |
| **Upsert POST** | `true` — substitui avatar anterior do colaborador |
| **Cache-Control upload** | `3600` |

**Proibições:**

- Path flat, sem `tenant_id`, segmento ≠ `collaborators`, filename ≠ `avatar.webp` → **400** `UNSAFE_OBJECT_PATH`
- Path de colaborador de **outro tenant** → **404** `COLLABORATOR_NOT_FOUND` (antes de gerar signed URL)

**Fallback sem conversão WEBP server-side:** mesmo path `avatar.webp`; `contentType` = MIME detectado (paridade logo 4.8C).

---

## 5. Resolução de `collaboratorId` / `collaborator_id`

### 5.1 POST — campo form `collaborator_id` (obrigatório)

### 5.2 GET — path param `:collaboratorId`

**Reutilizar integralmente** `resolveCollaboratorInTenant(supabase, tenantId, ref)` (`collaboratorsPermissionsApi.js`):

| # | Estratégia | `resolved_by` |
|---|------------|---------------|
| R1 | `collaborators.id` (UUID) | `uuid` |
| R2 | `collaborators.legacy_id` | `legacy_id` |
| R3 | `tenant_users.collaborator_uuid` | `tenant_user_uuid` |
| R4 | `tenant_users.collaborator_id` (text) | `tenant_user_text` |

| Resultado | HTTP | Code |
|-----------|------|------|
| 0 rows / cross-tenant / soft-deleted | 404 | `COLLABORATOR_NOT_FOUND` |
| `:collaboratorId` vazio | 400 | `INVALID_COLLABORATOR_ID` |
| 1 row | Prosseguir | — |

**Não exige** `tenant_user` vinculado (foto = atributo RH, não acesso sistema).

**Proibido:** aceitar `collaborator_id` de outro tenant mesmo com UUID válido.

---

## 6. Quem pode alterar avatar (POST)

| Actor | v1 |
|-------|-----|
| `owner` | ✅ |
| `admin` | ✅ |
| `master` | ✅ |
| Colaborador (self-update) | ❌ — **Phase 4.9+** |
| Demais roles | ❌ **403** `ADMIN_REQUIRED` |
| Não autenticado | ❌ **401** |

**v1:** admin pode alterar avatar de **qualquer** colaborador do tenant, inclusive **inativo** (paridade Melissa / RH admin).

---

## 7. Quem pode ler avatar (GET)

| Actor | v1 |
|-------|-----|
| Membro **autenticado** ativo do tenant | ✅ |
| `owner` / `admin` / `master` | ✅ |
| Demais roles com membership (`gerente`, `atendimento`, …) | ✅ |
| Usuário sem membership no tenant | ❌ **403** `TENANT_MEMBERSHIP_REQUIRED` |
| Não autenticado | ❌ **401** |
| Cross-tenant | ❌ **404** `COLLABORATOR_NOT_FOUND` |

**Diferença POST vs GET:** POST exige **admin**; GET exige **membership** (qualquer role ativa).

**Resolver membership GET:** reutilizar padrão `app_user_is_tenant_member` / `resolveActiveTenantUser` — **não** exigir admin.

---

## 8. Como gerar signed URL

| Step | Ação |
|------|------|
| 1 | Resolver `tenantId` do actor (GET/POST) |
| 2 | Resolver colaborador no tenant |
| 3 | Montar `objectPath = {tenantId}/collaborators/{collaborator.id}/avatar.webp` |
| 4 | Validar path contra helper 024 (opcional sanity check) |
| 5 | Se POST: upload concluído; se GET: verificar object existe (`storage.from(...).exists` ou HEAD) |
| 6 | `supabase.storage.from('collaborator-photos').createSignedUrl(objectPath, expiresIn)` via **service_role** |
| 7 | Retornar `signed_url` + `signed_url_expires_in` na resposta — **não persistir** |

**Object inexistente (GET):** **404** `AVATAR_NOT_FOUND` (colaborador existe mas sem foto uploadada).

**Formato resposta:** HTTPS Supabase `.../object/sign/collaborator-photos/...?token=...`

---

## 9. TTL da signed URL

| Parâmetro | Valor v1 |
|-----------|----------|
| **Default `expiresIn`** | **3600** segundos (1 hora) |
| **Mínimo** | 60 |
| **Máximo** | 86400 (24 h) — não expor via query v1 |
| **Query override** | ❌ Fora de escopo v1 |
| **Renovação** | Frontend chama GET quando expirada |

**Proibido:** persistir `signed_url` ou token em Postgres, IndexedDB SSOT, ou logs completos.

---

## 10. Como atualizar `collaborators.foto_url` (POST)

Fluxo atômico:

```text
1. Guards auth + admin + tenantId
2. Parse multipart (file + collaborator_id)
3. resolveCollaboratorInTenant → collaborator.id (UUID)
4. validateLogoFileInput-equivalent (MIME, size, ext, magic bytes)
5. objectPath = {tenantId}/collaborators/{collaborator.id}/avatar.webp
6. Upload Storage (service_role, upsert)
7. storageRef = canonical path string (§11)
8. Snapshot foto_url anterior
9. UPDATE collaborators SET foto_url = storageRef, updated_at = now()
   WHERE id = collaborator.id AND tenant_id = tenantId AND deleted_at IS NULL
10. Se passo 9 falhar → DELETE object (best effort)
11. createSignedUrl(objectPath, 3600)
12. Resposta envelope V3
```

| Campo | Regra |
|-------|-------|
| `foto_url` | Storage path canônico (§11) |
| `id`, `tenant_id`, `legacy_id`, `collaborator_uuid` | **Não alterar** |
| `tenant_users` | **Não alterar** |
| Auth `user_metadata` | **Não alterar** v1 |

---

## 11. O que persistir em `foto_url`

| Formato | Permitido | Exemplo |
|---------|-----------|---------|
| **Storage path relativo** (preferencial) | ✅ | `{tenant_id}/collaborators/{uuid}/avatar.webp` |
| **Storage ref prefixado** | ✅ | `collaborator-photos:{tenant_id}/collaborators/{uuid}/avatar.webp` |
| **Signed URL Supabase** | ❌ | Expira |
| **URL pública permanente** | ❌ | Bucket privado |
| **Base64 / data URI** | ❌ | CHECK + trigger 016 |

**Norma de escrita v1:** usar **path relativo** (sem prefixo bucket) para paridade com RLS `foldername(name)[1]`.

**Leitura:** handler deriva bucket `collaborator-photos` + path de `foto_url`; se legado HTTPS externa, GET pode retornar **404** `AVATAR_NOT_FOUND` até re-upload via POST.

---

## 12. Como invalidar cache IndexedDB

Responsabilidade **frontend**; API **não** escreve IndexedDB.

| Cache | Ação pós-POST 200 |
|-------|-------------------|
| `db.collaborators[id].fotoUrl` | Gravar **storage path** (não signed URL) |
| UI imediata | Usar `signed_url` da resposta POST/GET em `<img src>` |
| Expiração signed URL | Chamar **GET** `/assets/avatar/:id` para renovar |
| Roster / `CollaboratorsPage` | Patch local + evento refresh store |

**Proibido:** gravar base64 ou signed URL expirada como SSOT em IDB pós-cutover.

---

## 13. Como validar arquivo (POST)

Reutilizar padrão `assetsLogoApi.js` (paridade logo):

| Validação | Norma |
|-----------|-------|
| **Presença** | Campo `file` obrigatório |
| **Tamanho max** | 2 097 152 bytes (2 MB) |
| **MIME allowlist** | `image/jpeg`, `image/png`, `image/webp` |
| **Magic bytes** | JPEG / PNG / WEBP — não confiar só no header |
| **Extensão** | `.jpg`, `.jpeg`, `.png`, `.webp` |
| **MIME vs magic** | Divergência → **400** `MIME_MISMATCH` |
| **Content-Type request** | `multipart/form-data` obrigatório |

Ordem: reject early → magic bytes → extensão → tamanho.

---

## 14. Como bloquear base64

| Vetor | Bloqueio |
|-------|----------|
| JSON body com base64 | ❌ Endpoint aceita **somente** multipart |
| Campo form `base64` / `data` | **400** `UNSUPPORTED_FIELD` |
| Campo form com `data:image/...` | **400** `PAYLOAD_INVALID` |
| Buffer file iniciando com `data:image/` | **400** `PAYLOAD_INVALID` |
| Persistência `foto_url` | Trigger + CHECK 016 rejeitam `data:` |
| IndexedDB | Proibido pós-cutover |

---

## 15. Como auditar

| Evento | Quando |
|--------|--------|
| `ASSET_AVATAR_UPLOADED` | POST 200 após UPDATE `foto_url` |
| `ASSET_AVATAR_SIGNED_URL_ISSUED` | GET 200 (opcional v1 — recomendado) |

**Payload audit (sem binário / sem signed URL completa):**

```json
{
  "audit_event": "ASSET_AVATAR_UPLOADED",
  "tenant_id": "uuid",
  "actor_user_id": "auth-uuid",
  "collaborator_id": "uuid",
  "object_path": "{tenant_id}/collaborators/{uuid}/avatar.webp",
  "mime_type": "image/webp",
  "size_bytes": 12345,
  "resolved_by": "uuid",
  "reason": null
}
```

---

## 16. Como logar

### POST — `[ASSET_AVATAR_UPLOAD]`

| Campo | Obrigatório |
|-------|-------------|
| `tenant_id` | ✅ |
| `actor_user_id` | ✅ |
| `collaborator_ref` | ✅ (input) |
| `collaborator_id` | ✅ (resolvido) |
| `path` | ✅ |
| `mime_type` | ✅ |
| `size_bytes` | ✅ |
| `durationMs` | ✅ |

### GET — `[ASSET_AVATAR_SIGNED_URL]`

| Campo | Obrigatório |
|-------|-------------|
| `tenant_id` | ✅ |
| `actor_user_id` | ✅ |
| `collaborator_ref` | ✅ |
| `collaborator_id` | ✅ |
| `signed_url_expires_in` | ✅ |
| `durationMs` | ✅ |

**Proibido logar:** bytes, JWT completo, **signed URL completa** (somente TTL + path).

---

## 17. Como fazer rollback (POST)

| Ordem falha | Ação |
|-------------|------|
| Validação / 404 collaborator | Nenhum efeito Storage |
| Storage upload fail | **500** `STORAGE_UPLOAD_FAILED` |
| Postgres UPDATE fail | **DELETE** object recém-criado (best effort) |
| Delete fail | **503** `ROLLBACK_FAILED` |
| Signed URL fail pós-DB OK | **500** — DB já consistente; log warn (object + path OK) |

**Snapshot:** `previous_foto_url` antes do UPDATE — restauração automática **fora de escopo v1**.

**GET:** read-only — sem rollback.

---

## 18. Erros possíveis

| HTTP | Code | Endpoint | Condição |
|------|------|----------|----------|
| 401 | — | ambos | Sem Bearer |
| 403 | `ADMIN_REQUIRED` | POST | Não admin |
| 403 | `TENANT_MEMBERSHIP_REQUIRED` | GET | Sem membership |
| 403 | `TENANT_AMBIGUOUS` | ambos | Multi-tenant |
| 404 | `COLLABORATOR_NOT_FOUND` | ambos | Colaborador inválido / outro tenant / deleted |
| 404 | `AVATAR_NOT_FOUND` | GET | Sem object Storage / `foto_url` vazio |
| 400 | `TENANT_QUERY_FORBIDDEN` | ambos | `?tenant_id=` |
| 400 | `TENANT_BODY_FORBIDDEN` | POST | `tenant_id` no form |
| 400 | `PAYLOAD_INVALID` | POST | Sem `file` ou `collaborator_id` |
| 400 | `INVALID_COLLABORATOR_ID` | ambos | Ref vazio |
| 400 | `INVALID_FILE_TYPE` | POST | MIME inválido |
| 400 | `MIME_MISMATCH` | POST | Magic ≠ header |
| 400 | `INVALID_FILE_EXTENSION` | POST | Ext proibida |
| 400 | `UNSUPPORTED_FIELD` | POST | Campos proibidos |
| 400 | `UNSAFE_OBJECT_PATH` | POST | Path interno inválido |
| 413 | `FILE_TOO_LARGE` | POST | > 2 MB |
| 415 | `UNSUPPORTED_MEDIA_TYPE` | POST | Não multipart |
| 500 | `STORAGE_UPLOAD_FAILED` | POST | Upload error |
| 500 | `SIGNED_URL_FAILED` | ambos | createSignedUrl error |
| 500 | `DB_WRITE_FAILED` | POST | UPDATE falhou |
| 503 | `ROLLBACK_FAILED` | POST | UPDATE fail + delete fail |
| 500 | `INTERNAL_ERROR` | ambos | Não classificado |

---

## 19. Testes obrigatórios

**Suites sugeridas:**

- `src/__tests__/assetsAvatarApi.test.js` (POST)
- `src/__tests__/assetsAvatarReadApi.test.js` (GET)

### POST — T1–T22

| ID | Caso | Esperado |
|----|------|----------|
| T1 | Sem auth | 401 |
| T2 | Sem admin | 403 `ADMIN_REQUIRED` |
| T3 | `tenant_id` query | 400 `TENANT_QUERY_FORBIDDEN` |
| T4 | `tenant_id` form | 400 `TENANT_BODY_FORBIDDEN` |
| T5 | Sem multipart | 400/415 |
| T6 | Sem `file` | 400 `PAYLOAD_INVALID` |
| T7 | Sem `collaborator_id` | 400 `PAYLOAD_INVALID` |
| T8 | MIME inválido | 400 `INVALID_FILE_TYPE` |
| T9 | Extensão inválida | 400 `INVALID_FILE_EXTENSION` |
| T10 | Base64 rejeitado | 400 |
| T11 | > 2 MB | 413 `FILE_TOO_LARGE` |
| T12 | Aceita png/jpeg/webp | 200 |
| T13 | Path `{tenant}/collaborators/{uuid}/avatar.webp` | mock Storage |
| T14 | Bucket `collaborator-photos` | mock |
| T15 | UPDATE `foto_url` = storage path | spy — não signed URL |
| T16 | Rollback se DB fail | delete object |
| T17 | 503 rollback fail | 503 |
| T18 | Não altera outras colunas | mock |
| T19 | Melissa inativa permitido | 200 |
| T20 | Cross-tenant collaborator | 404 |
| T21 | Envelope + `ASSET_AVATAR_UPLOADED` | 200 |
| T22 | Zero IndexedDB server | grep |

### GET — G1–G14

| ID | Caso | Esperado |
|----|------|----------|
| G1 | Sem auth | 401 |
| G2 | Membro tenant (não admin) | 200 ✅ |
| G3 | Sem membership | 403 |
| G4 | Cross-tenant collaborator | 404 |
| G5 | Colaborador inexistente | 404 |
| G6 | Sem avatar uploadado | 404 `AVATAR_NOT_FOUND` |
| G7 | `signed_url` presente | 200 |
| G8 | `signed_url_expires_in` = 3600 | 200 |
| G9 | Nunca URL pública permanente | assert sem `/object/public/` |
| G10 | Resolve legacy_id | 200 `resolved_by=legacy_id` |
| G11 | Resolve tenant_user ref | 200 |
| G12 | `tenant_id` query proibido | 400 |
| G13 | Log `[ASSET_AVATAR_SIGNED_URL]` | spy |
| G14 | Produção intocada | grep guard |

---

## 20. Pré-requisito migration 024

| Item | Status |
|------|--------|
| Arquivo `024_collaborator_photos_storage.sql` | ✅ No repositório |
| Aplicada em **staging** | ❌ **Obrigatória antes de deploy live POST/GET** |
| Aplicada em **produção** | ❌ **Proibida** nesta fase (gate RC explícito) |
| Validação pós-apply | Queries comentadas § V1–V6 na migration |

**Sequência obrigatória live:**

```text
1. Aplicar 024 em staging
2. Validar bucket privado + policies
3. Implementar POST + GET (Phase 4.8E)
4. QA LO-QA-STG cross-tenant avatar
5. Wire frontend (flag) — Phase posterior
```

**Implementação local/testes:** mocks Vitest **não** exigem migration aplicada.

---

## 21. Payload e resposta (normativo)

### POST Request

```http
POST /internal/app/assets/avatar HTTP/1.1
Authorization: Bearer <app_jwt>
Content-Type: multipart/form-data; boundary=----...

------...
Content-Disposition: form-data; name="collaborator_id"

a1000002-0002-4002-8002-000000000002
------...
Content-Disposition: form-data; name="file"; filename="photo.png"
Content-Type: image/png

<binary>
------...
```

### POST Sucesso — 200

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

### GET Request

```http
GET /internal/app/assets/avatar/a1000002-0002-4002-8002-000000000002 HTTP/1.1
Authorization: Bearer <app_jwt>
```

### GET Sucesso — 200

```json
{
  "ok": true,
  "data": {
    "asset_type": "avatar",
    "path": "7aba7127-409c-4ea4-8dbc-807efc5e189c/collaborators/a1000002-0002-4002-8002-000000000002/avatar.webp",
    "signed_url": "https://tckdjyunwmdpqmewrwvt.supabase.co/storage/v1/object/sign/collaborator-photos/...?token=...",
    "signed_url_expires_in": 3600,
    "url_type": "signed",
    "collaborator_id": "a1000002-0002-4002-8002-000000000002"
  },
  "meta": {
    "tenant_id": "7aba7127-409c-4ea4-8dbc-807efc5e189c",
    "collaborator_ref": "a1000002-0002-4002-8002-000000000002",
    "resolved_by": "uuid",
    "requested_by": "auth-user-uuid"
  }
}
```

---

## 22. Plano de implementação (referência — Phase 4.8E)

| Step | Ação | Arquivo |
|------|------|---------|
| 0 | Aplicar migration 024 staging | `supabase/migrations/024_*.sql` |
| 1 | Extrair validação imagem compartilhada | `server/lib/assetsImageValidation.js` (opcional) |
| 2 | `uploadAvatarAsset`, `createSignedUrlForAvatar` | `server/lib/assetsAvatarApi.js` |
| 3 | `createAssetsAvatarPostHandler` | idem |
| 4 | `createAssetsAvatarGetHandler` | idem |
| 5 | Rotas POST + GET | `server/index.js` |
| 6 | Testes T1–T22 + G1–G14 | `src/__tests__/assetsAvatar*.test.js` |

**Reutilizar de `assetsLogoApi.js`:** multipart parser pattern, magic bytes, error classes, rollback, logging.

**Reutilizar de `collaboratorsPermissionsApi.js`:** `resolveCollaboratorInTenant`, `resolveAdminTenantForPermissions` (POST admin).

**GET membership:** novo helper `resolveTenantMemberForRead(authUserId)` — qualquer membro ativo, não admin.

---

## 23. Compatibilidade frontend (referência)

| Legado | Cutover |
|--------|---------|
| `uploadCollaboratorPhoto` → base64 IDB | POST `/assets/avatar` |
| `CollaboratorsPage` FileReader | FormData + POST; display via `signed_url` |
| `avatarUtils.js` data URL fallback | GET renew quando expirar |
| `collaboratorMapper.ts` anti-base64 | Alinhado — path em `foto_url` |

**Feature flag:** `VITE_ASSETS_AVATAR_API_ENABLED=false|true`

---

## 24. Anti-patterns proibidos

| # | Proibido |
|---|----------|
| A1 | URL pública permanente para avatar |
| A2 | Persistir signed URL em `foto_url` |
| A3 | Base64 em Postgres / IDB SSOT |
| A4 | `tenant_id` do frontend |
| A5 | Cross-tenant signed URL |
| A6 | Self-update v1 |
| A7 | Upload direto browser bucket privado pós-cutover |
| A8 | Alterar `tenant_users` / Auth metadata neste fluxo |

---

## 25. Checklist §30 V3 (pré-merge futuro)

- [ ] Envelope `{ ok, data, meta }`
- [ ] Tenant backend-only
- [ ] POST admin RBAC · GET membership RBAC
- [ ] Bucket privado + signed URL only
- [ ] Storage path em `foto_url`
- [ ] Zero IndexedDB server-side
- [ ] Logs + audit
- [ ] Testes T1–T22 + G1–G14
- [ ] Migration 024 staging ✅
- [ ] Produção intocada
- [ ] Contrato Phase 4.8D ✅ (este documento)

---

## 26. Veredito

| Critério | Status |
|----------|--------|
| Contrato completo (20 itens + payloads) | ✅ |
| Alinhado Phase 4.8 v1.1 + migration 024 | ✅ |
| Alinhado `assetsLogoApi.js` patterns | ✅ |
| POST + GET definidos | ✅ |
| Migration 024 aplicada staging | ❌ pendente |
| Endpoint implementado | ❌ Phase 4.8E |
| Staging live (522) | ⚠️ pode bloquear QA manual |

### READY PARA IMPLEMENTAÇÃO

O contrato Phase 4.8D está **completo e normativo** para iniciar **Phase 4.8E** (código POST + GET + testes).

**Bloqueio deploy live:** migration **024 aplicada em staging** + recovery Supabase se indisponível.

**Nesta entrega:** apenas documento — **zero** código, **zero** Supabase apply, **zero** commit, **zero** produção.
