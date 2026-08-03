# Love Odonto V3 — Master API Architecture (Constituição Oficial)

**Documento:** `docs/platform/LOVE_ODONTO_V3_MASTER_API_ARCHITECTURE.md`  
**Versão:** `1.0.0`  
**Data:** 2026-07-07  
**Status:** **Constituição normativa** — todo endpoint atual e futuro **deve** conformar-se a este documento.  
**Substitui / evolui:** [`LOVE_ODONTO_V2_MASTER_API.md`](./LOVE_ODONTO_V2_MASTER_API.md) para decisões V3.  
**Complemento de:** [`LOVE_ODONTO_V2_MASTER_ARCHITECTURE.md`](../constitution/LOVE_ODONTO_V2_MASTER_ARCHITECTURE.md) · [`LOVE_ODONTO_V2_MASTER_DATABASE.md`](../constitution/LOVE_ODONTO_V2_MASTER_DATABASE.md) · [`LOVE_ODONTO_V2_MASTER_SECURITY.md`](../platform/LOVE_ODONTO_V2_MASTER_SECURITY.md) · [`LOVE_ODONTO_V2_MASTER_QA.md`](../constitution/LOVE_ODONTO_V2_MASTER_QA.md)

**Regra de ouro:** em conflito entre implementação legada e este documento, **este documento prevalece** até revisão formal. Nenhum PR de API entra sem checklist §30.

**Escopo:** normativo e arquitetural. **Não** contém código executável.

---

## Índice

1. [Objetivos da API oficial](#1-objetivos-da-api-oficial)  
2. [Princípios obrigatórios](#2-princípios-obrigatórios)  
3. [Arquitetura oficial](#3-arquitetura-oficial)  
4. [Camadas da API](#4-camadas-da-api)  
5. [Padrão REST](#5-padrão-rest)  
6. [Envelope oficial de resposta](#6-envelope-oficial-de-resposta)  
7. [Padrão de erros](#7-padrão-de-erros)  
8. [Autenticação](#8-autenticação)  
9. [Tenant e membership](#9-tenant-e-membership)  
10. [RBAC](#10-rbac)  
11. [Segurança](#11-segurança)  
12. [Paginação](#12-paginação)  
13. [Filtros](#13-filtros)  
14. [Ordenação](#14-ordenação)  
15. [Logs estruturados](#15-logs-estruturados)  
16. [Auditoria](#16-auditoria)  
17. [Rate limiting](#17-rate-limiting)  
18. [Timeout](#18-timeout)  
19. [Cache](#19-cache)  
20. [Offline](#20-offline)  
21. [Hydrate IndexedDB](#21-hydrate-indexeddb)  
22. [Storage](#22-storage)  
23. [Uploads](#23-uploads)  
24. [OpenAPI](#24-openapi)  
25. [Versionamento](#25-versionamento)  
26. [Estrutura de pastas backend](#26-estrutura-de-pastas-backend)  
27. [Padrão de testes](#27-padrão-de-testes)  
28. [Padrão de implementação de endpoint](#28-padrão-de-implementação-de-endpoint)  
29. [Anti-patterns proibidos](#29-anti-patterns-proibidos)  
30. [Checklist obrigatório — novo endpoint](#30-checklist-obrigatório--novo-endpoint)  
31. [Matriz oficial Phase 4](#31-matriz-oficial-phase-4)  
32. [Roadmap de API](#32-roadmap-de-api)  
33. [Convenções de evolução da API](#33-convenções-de-evolução-da-api)  
34. [Observabilidade](#34-observabilidade)  
35. [Performance](#35-performance)  
36. [Qualidade mínima](#36-qualidade-mínima)

---

## 1. Objetivos da API oficial

A **Admin API** (`server/`, porta `:3001`) é a **única porta oficial** para operações sensíveis, multi-tenant e de integração do Love Odonto.

| Objetivo | Descrição |
|----------|-----------|
| **SSOT enforcement** | Garantir que Supabase Postgres + Auth + Storage sejam a autoridade; API orquestra writes canônicos |
| **Isolamento tenant** | Impedir vazamento cross-tenant; tenant derivado do JWT/membership |
| **RBAC centralizado** | Escrita de permissões, provisionamento e auditoria somente server-side |
| **Contrato estável** | Envelope, erros, paginação e logs uniformes para frontend e integrações |
| **Transição V2→V3** | Conviver com legado (`ok`, `{ error }`) enquanto novos endpoints convergem para envelope V3 |
| **Observabilidade** | Toda mutação crítica rastreável sem expor PII |
| **Cutover incremental** | Phase 4 RH read-first; writes sensíveis depois; IndexedDB vira cache |

**Fora de escopo da API clínica (`/internal/app/*`):** billing platform, provision global de tenants, console SaaS — superfície `/internal/platform/*`.

---

## 2. Princípios obrigatórios

Estes princípios são **não negociáveis** em V3:

| # | Princípio | Norma |
|---|-----------|-------|
| P1 | **Supabase é SSOT** | Postgres + Auth `app_metadata` + Storage = autoridade para domínios migrados |
| P2 | **API é única porta oficial** | Mutations sensíveis, RBAC, provisionamento, assets → Admin API |
| P3 | **React nunca acessa banco diretamente** | Browser **não** usa service_role; mutations RBAC **nunca** via PostgREST anon |
| P4 | **IndexedDB é apenas cache** | Cópia derivada; invalidar após sync; **nunca** SSOT pós-cutover |
| P5 | **`tenant_id` obrigatório** | Todo dado crítico pertence a tenant UUID válido |
| P6 | **`tenant_id` livre do frontend proibido** | Query/body `tenant_id` **rejeitado** em endpoints Phase 4+; tenant resolvido no backend |
| P7 | **`service_role` somente backend** | `SUPABASE_SERVICE_ROLE_KEY` exclusiva do Admin API |
| P8 | **Cross-tenant proibido** | Row de outro tenant → erro; nunca retornar dado alienígena |
| P9 | **Fallback `tenant-1` proibido** | `tenant-1`, `tenant_1`, primeira clínica, seed implícito → **fail closed** |
| P10 | **Seed/mock em runtime proibido** | Handler **não** inventa dados; catálogo vem de Supabase seedado |
| P11 | **`platform_users` proibido no app clínica** | App `:5176` opera via `tenant_users`; console `:5177` usa platform scope |
| P12 | **Fail closed** | Sem auth, tenant ou permissão → bloqueio explícito |
| P13 | **Idempotência** | Writes críticos repetíveis quando semanticamente seguro |
| P14 | **Observabilidade** | Log estruturado + audit trail em mutações |

---

## 3. Arquitetura oficial

### 3.1 Fluxo canônico

```text
React (UI + guards)
    ↓
Repository (src/repositories/* ou services bridge)
    ↓
Service HTTP (src/services/* — fetch Admin API / Supabase read)
    ↓
Admin API (server/lib/* + server/index.js)
    ↓
Supabase (Postgres + Auth Admin + Storage)
    ↓
Storage (buckets — binários)
```

**IndexedDB** situa-se **paralelo** ao Service HTTP como **cache derivado** — hydrate após sucesso API/Supabase; **nunca** no caminho de write canônico pós-cutover.

### 3.2 Diagrama

```mermaid
flowchart TB
  subgraph browser [Browser :5176]
    UI[React Components]
    REPO[Repository Layer]
    SVC[HTTP Services]
    IDB[(IndexedDB cache)]
    UI --> REPO
    REPO --> SVC
    REPO -.->|read cache| IDB
    SVC -.->|hydrate / invalidate| IDB
  end

  subgraph api [Admin API :3001]
    APP[/internal/app/*]
    PLAT[/internal/platform/*]
    PUB[/public/*]
  end

  subgraph sb [Supabase]
    PG[(Postgres + RLS)]
    AUTH[Auth JWT]
    STG[Storage]
  end

  SVC -->|Bearer JWT| APP
  SVC -->|SELECT RLS only| PG
  APP -->|service_role| PG
  APP --> AUTH
  APP --> STG
  SVC -->|upload policy| STG
```

### 3.3 Fluxos permitidos vs proibidos

| Origem → Destino | Permitido |
|------------------|-----------|
| React → Repository → Service → Admin API | ✅ Padrão oficial writes |
| React → Service → Supabase SELECT (RLS) | ✅ Reads tenant-scoped documentados |
| React → IndexedDB | ✅ Cache / domínios em transição |
| React → Supabase service_role | ❌ **Proibido** |
| React → mutation RBAC direta | ❌ **Proibido** |
| Admin API → Supabase service_role | ✅ |
| IndexedDB → SSOT write | ❌ **Proibido** pós-cutover |

---

## 4. Camadas da API

| Camada | Path / artefato | Responsabilidade | Não faz |
|--------|-----------------|------------------|---------|
| **Frontend** | `src/pages`, `src/components` | UX, guards UI, formulários | Regra canônica, secrets |
| **Repository** | `src/repositories/*`, bridges | Abstração dados, paridade IDB↔API | Bypass tenant/RBAC |
| **Service HTTP** | `src/services/*` | Fetch, retry client, cache orchestration | service_role |
| **Admin API handler** | `server/lib/*Api*.js` | Parser, guards, Supabase fetch, envelope | Estado UI |
| **Admin API router** | `server/index.js` | Registro rotas, middleware, DI | Lógica de domínio pesada inline |
| **Supabase** | Postgres, Auth, Storage | Persistência, RLS, tokens | Lógica clínica complexa sem API |
| **IndexedDB cache** | `src/db/*` | Snapshot local derivado | Autoridade pós-cutover |
| **Storage** | Buckets Supabase | Binários (logo, avatar, PDFs) | Metadados sem registro Postgres |

---

## 5. Padrão REST

### 5.1 Verbos e semântica

| Verbo | Uso | Idempotente | Body |
|-------|-----|-------------|------|
| **GET** | Leitura, listagem | Sim | ❌ |
| **POST** | Criação, ações (`apply-role-template`, `provision`) | Depende | ✅ JSON |
| **PUT** | Replace completo de recurso | Sim | ✅ JSON |
| **PATCH** | Update parcial (`access`, status) | Sim | ✅ JSON |
| **DELETE** | Remoção / unlink | Sim | Opcional |

### 5.2 Convenções de path

| Padrão | Exemplo |
|--------|---------|
| Coleção | `GET /internal/app/collaborators` |
| Recurso | `GET /internal/app/collaborators/:id/permissions` |
| Sub-recurso | `PUT /internal/app/collaborators/:id/schedule` |
| Ação | `POST /internal/app/collaborators/:id/apply-role-template` |
| Assets | `POST /internal/app/assets/avatar` |

### 5.3 `:id` opaco (colaboradores)

Resolver por ordem (Phase 4.3/4.4):

1. `collaborators.id` (UUID)  
2. `collaborators.legacy_id`  
3. `tenant_users.collaborator_uuid`  
4. `tenant_users.collaborator_id` (text)

---

## 6. Envelope oficial de resposta

### 6.1 Envelope V3 (obrigatório — endpoints novos Phase 4+)

**Sucesso:**

```json
{
  "ok": true,
  "data": {},
  "meta": {
    "tenant_id": "uuid",
    "request_id": "uuid-opcional-v1.1",
    "api_version": "v3-phase4"
  }
}
```

**Erro:**

```json
{
  "ok": false,
  "error": "Mensagem legível PT-BR",
  "code": "TENANT_MEMBERSHIP_REQUIRED",
  "details": {}
}
```

### 6.2 Variantes por tipo

| Tipo | Campos extras |
|------|---------------|
| **success** | `data` preenchido; `meta` com contexto tenant/paginação |
| **error** | `ok: false`; `code` estável; sem stack em produção |
| **validation** | HTTP 400/422; `code: VALIDATION_ERROR`; `details.fields[]` |
| **pagination** | `data[]` ou `data.items[]`; `meta.page`, `meta.pageSize`, `meta.total` |

### 6.3 Legado (transição)

Endpoints pré-Phase 4 podem retornar `{ success: true }`, `{ error: "..." }`. **Proibido** adicionar novos formatos legados.

**Convergência:** refatorações migram para envelope §6.1.

---

## 7. Padrão de erros

### 7.1 Catálogo HTTP obrigatório

| HTTP | Uso | `code` exemplos |
|------|-----|-----------------|
| **400** | Query/body inválido, campo proibido | `INVALID_QUERY`, `TENANT_QUERY_FORBIDDEN`, `TENANT_BODY_FORBIDDEN` |
| **401** | JWT ausente/inválido | — |
| **403** | Sem membership, não-admin, tenant proibido | `ADMIN_REQUIRED`, `TENANT_MEMBERSHIP_REQUIRED`, `TENANT_AMBIGUOUS` |
| **404** | Recurso inexistente **no tenant** | `COLLABORATOR_NOT_FOUND`, `ROLE_TEMPLATE_NOT_FOUND` |
| **409** | Conflito de estado / confirmação | `ACCESS_NOT_LINKED`, `CUSTOM_PERMISSIONS_OVERWRITE_REQUIRED`, `CONFLICT` |
| **422** | Regra de negócio / perfil incompleto | `TENANT_PROFILE_MISSING`, `VALIDATION_ERROR` |
| **500** | Erro inesperado, isolamento tenant | `TENANT_ISOLATION`, `INTERNAL_ERROR` |
| **503** | Supabase/Auth indisponível | `SERVICE_UNAVAILABLE` |

### 7.2 Regras de mensagem

- Português (BR) user-facing  
- `code` estável para i18n e logs  
- **Nunca** logar PII, tokens, mapas completos de permissões  
- 404 cross-tenant: preferir **404** genérico (não 403 leak)

---

## 8. Autenticação

| Item | Norma |
|------|-------|
| **Protocolo** | JWT Supabase Auth |
| **Header** | `Authorization: Bearer <access_token>` |
| **Middleware app** | `requireAppUser` → `supabase.auth.getUser(token)` |
| **Actor** | `req.appAuthUser.id`, `req.appAuthUser.email` |
| **Refresh** | Client `@supabase/supabase-js` `autoRefreshToken` |
| **Logout** | `signOut()` + limpar TenantContext + caches sensíveis |
| **Claims** | `sub` = auth user; `app_metadata` = snapshot RBAC (transição) |

**401** sem token válido — **sem** fallback anônimo em `/internal/app/*`.

---

## 9. Tenant e membership

### 9.1 Resolução (Phase 4+ — norma V3)

```text
1. requireAppUser → authUserId
2. getTenantAdminActorOrThrow(authUserId, '')  // explicitTenant VAZIO
   OU resolveActiveTenantUser(authUserId, '', email)  // endpoints membro
3. Validar membership ativa (status, is_active, has_system_access)
4. tenantId = actor.tenant_id
5. Rejeitar FORBIDDEN_TENANT_IDS (tenant-1, tenant_1)
```

### 9.2 Proibições explícitas

| Proibido | Erro |
|----------|------|
| `?tenant_id=` em endpoints Phase 4+ | `TENANT_QUERY_FORBIDDEN` |
| `tenant_id` no body (salvo rotas legadas documentadas) | `TENANT_BODY_FORBIDDEN` |
| `tenant-1`, primeira clínica, IDB fallback | `TENANT_FORBIDDEN` / `TENANT_IMPLICIT_FORBIDDEN` |
| Multi-clínica sem disambiguation | `TENANT_AMBIGUOUS` |
| Row com `tenant_id` divergente pós-query | **500** `TENANT_ISOLATION` |

### 9.3 Membership obrigatória

Todo endpoint `/internal/app/*` exige `tenant_users` ativo do actor, salvo rotas públicas documentadas.

---

## 10. RBAC

### 10.1 Modelo

| Camada | Fonte |
|--------|-------|
| **Catálogo** | `permission_catalog` (184) |
| **Templates** | `role_permission_defaults` |
| **Runtime write** | Auth `app_metadata` (`custom_permissions`, `permission_overrides`, `has_custom_permissions`) |
| **Membership role** | `tenant_users.role` / `role_slug` |
| **Futuro** | `tenant_user_permissions` (Fase 2 — relacional) |

### 10.2 Papéis

| Papel | Escopo |
|-------|--------|
| **master / owner / admin** | Admin clínica — endpoints administrativos Phase 4 |
| **Demais roles** | Operação clínica — sem leitura RBAC de terceiros (v1) |
| **Colaborador comum** | `can()` UI + guards; **não** chama endpoints admin |

### 10.3 Admin-only (Phase 4 RH/permissões)

- `GET /collaborators/:id/permissions`  
- `POST /collaborators/:id/apply-role-template`  
- `PUT /collaborators/:id/permissions`  

Guard: `getTenantAdminActorOrThrow` + `isTenantAdminRole`.

### 10.4 Custom vs template

- **Custom 184/184:** `has_custom_permissions=true` + mapa completo  
- **Apply template:** limpa custom; exige `confirmOverwrite=true` se custom existir  
- **Admin bypass:** avaliação runtime (`master`/`owner`/`admin`) — **não** persistir bypass como SSOT

---

## 11. Segurança

| Controle | Implementação |
|----------|---------------|
| **service_role** | Apenas `server/`; validada no boot |
| **Cross-tenant** | Filtro `.eq('tenant_id', resolved)` + validação pós-map |
| **RLS** | Postgres — client anon; API bypass via service_role + guards app |
| **Allowlists** | `orderBy`, `status`, campos SELECT explícitos por handler |
| **Payload validation** | Parser dedicado; rejeitar campos desconhecidos sensíveis |
| **Storage** | MIME + tamanho; proibir `data:` URI persistente em colunas text |
| **Audit** | Mutações RBAC/acesso → log + `access_audit_log` |
| **Produção** | Ref `uoepkwhqztmsjnzirpev` — **nunca** alvo de testes automatizados |

Referência: [`LOVE_ODONTO_V2_MASTER_SECURITY.md`](../platform/LOVE_ODONTO_V2_MASTER_SECURITY.md)

---

## 12. Paginação

### 12.1 Parâmetros oficiais (Phase 4.2)

| Param | Default | Max |
|-------|---------|-----|
| `page` | 1 | — |
| `pageSize` / `page_size` | 50 | 500 |

### 12.2 Resposta

```json
{
  "ok": true,
  "data": [],
  "meta": {
    "tenant_id": "...",
    "page": 1,
    "pageSize": 50,
    "total": 123
  }
}
```

### 12.3 Cursor (v1.1 — defer)

`cursor` + `limit` para listas grandes — documentar por endpoint quando adotado.

---

## 13. Filtros

- Declarados **por endpoint** no contrato Phase 4.x  
- Allowlist de campos — **nunca** pass-through SQL  
- Sanitização de `search` (trim, max length, strip `%()` )  
- Exemplo `GET /collaborators`: `status`, `search`, `cargo`, `rh_categoria`, `agenda_enabled`

---

## 14. Ordenação

| Param | Formato |
|-------|---------|
| `orderBy` / `order_by` | Campo allowlist |
| `orderDir` / `order_dir` | `asc` \| `desc` |

**Allowlist exemplo:** `nome_completo`, `email`, `cargo`, `updated_at`  
Desempate: `nome_completo ASC`, `id ASC`.

---

## 15. Logs estruturados

### 15.1 Formato

```js
console.log('[TAG_API_VERBO]', {
  tenant_id,
  user_id,
  durationMs,
  // campos específicos — sem PII
});
```

### 15.2 Tags Phase 4

| Tag | Endpoint |
|-----|----------|
| `[COLLABORATORS_API_LIST]` | GET /collaborators |
| `[COLLABORATOR_PERMISSIONS_API_GET]` | GET /:id/permissions |
| `[COLLABORATOR_ROLE_TEMPLATE_APPLY]` | POST /:id/apply-role-template *(planejado)* |

### 15.3 Regras

- DEV-only debug com guard `process.env.NODE_ENV !== 'production'`  
- Erro 500: `console.error` com stack **server-side only**

---

## 16. Auditoria

| Evento | Persistência |
|--------|--------------|
| Provision / invite | `[COLLAB_ACCESS_AUDIT]`, logs provision |
| RBAC change | `appendAccessAuditToAuthUser` → `app_metadata.access_audit_log` |
| Apply template | `audit_event: COLLABORATOR_ROLE_TEMPLATE_APPLIED` *(contrato 4.5)* |
| Identity | `identity_events` *(IdentityService)* |

**Retenção:** últimas 20 entradas em `access_audit_log` (v1).  
**Futuro:** tabela `audit_logs` tenant-scoped.

---

## 17. Rate limiting

| Escopo | v1 | v1.1 |
|--------|-----|------|
| Admin API global | Não implementado | Middleware express-rate-limit |
| Auth login | Supabase Auth built-in | — |
| Webhooks | Validar secret + idempotency key | — |
| Provision/invite | Best-effort cooldown UI | Rate limit por tenant+email |

**Norma:** endpoints de write sensível **devem** ser idempotentes ou retornar 409 claro.

---

## 18. Timeout

| Camada | Timeout sugerido |
|--------|------------------|
| Client fetch tenant-context | 15s |
| Client fetch list/read | 30s |
| Server Supabase query | 10s por operação |
| Server Auth admin | 15s |
| Upload Storage | 60s (por tamanho) |

**503** + retry backoff quando Supabase indisponível (522 staging documentado RC-03.9).

---

## 19. Cache

| Camada | Política |
|--------|----------|
| **TenantContext** | Refresh ~5 min; invalidar em login/logout |
| **React state** | Sessão |
| **IndexedDB** | Derivado; ver §21 |
| **HTTP** | Sem cache CDN em `/internal/app/*` autenticado |
| **Storage CDN** | `Cache-Control` por bucket |

**Invalidação obrigatória após:** RBAC change, clinic profile, RH write, apply-template.

---

## 20. Offline

| Estado | v1 | Futuro |
|--------|-----|--------|
| Read | IDB cache se warm | Banner stale |
| Write | **Bloqueado** para domínios migrados | Outbox + replay API |
| RBAC | Fail closed offline para admin writes | — |

**Norma:** offline **não** autoriza bypass de API para writes canônicos.

---

## 21. Hydrate IndexedDB

```text
API/Supabase success
  → Service normaliza payload
  → Repository persiste snapshot IDB (se domínio ainda espelha)
  → UI lê via Repository (READ_PRIMARY / dual-read QA)
```

| Evento | Ação |
|--------|------|
| Login / tenant-context | Hydrate permissions mirror, clinic, roster |
| GET collaborators API | Opt-in shadow QA; não SSOT |
| RBAC POST | Invalidate permissions cache; re-fetch GET permissions |
| Cutover RC-05+ | IDB write desligado por feature flag |

---

## 22. Storage

| Bucket | Uso | Migration |
|--------|-----|-----------|
| `clinic-logos` | Logo clínica | 013 |
| `collaborator-photos` *(ou similar)* | Avatar RH | ❌ Pendente Phase 4.3 assets |
| `clinical-guides`, contratos | Domínios clínicos | existentes |

**Fluxo logo:** Upload Storage → URL HTTPS → `PUT clinic-profile` → Postgres → invalidate IDB.

---

## 23. Uploads

| Regra | Detalhe |
|-------|---------|
| **Endpoint dedicado** | `POST /assets/avatar`, `POST /assets/logo` |
| **Validação** | MIME allowlist, max size (ex.: 2MB avatar, 5MB logo) |
| **Proibido** | Base64 persistente em `collaborators.foto_url` / `clinic_profiles.logo_url` |
| **Retorno** | URL pública ou signed URL + metadado para PATCH/PUT recurso |
| **Tenant** | Object path inclui `tenant_id` |

---

## 24. OpenAPI

| Item | Status |
|------|--------|
| Spec OpenAPI 3.1 | ❌ Pendente |
| Fonte | Gerar de contratos Phase 4.x + catálogo `LOVE_ODONTO_V2_MASTER_API.md` |
| Gate | PR Phase 4+ atualiza spec ou issue vinculada |

**Norma:** contrato Markdown Phase 4.x **precede** OpenAPI até tooling CI.

---

## 25. Versionamento

| Prefixo | Uso | Status |
|---------|-----|--------|
| `/internal/app/*` | App clínica — **canônico V3 Phase 4** | ✅ Ativo |
| `/internal/platform/*` | Console SaaS | ✅ Ativo |
| `/public/*` | Onboarding, termos | ✅ Ativo |
| `/api/v1/*` | API pública futura / integradores | 📋 Roadmap |
| `/api/signature/webhook` | Webhook assinatura | ✅ Existente |

**Breaking change:** novo path ou header `X-Api-Version`; nunca alterar semântica silenciosa.

---

## 26. Estrutura de pastas backend

```text
server/
├── index.js                 # Router, middleware, DI, rotas finas
├── lib/
│   ├── collaboratorsApiList.js          # Phase 4.2 GET list
│   ├── collaboratorsPermissionsApi.js     # Phase 4.4 GET permissions
│   ├── collaboratorsApplyRoleTemplateApi.js  # Phase 4.5 (planejado)
│   └── *Helpers.js
├── identity/
│   └── routes.js            # Identity subdomain
└── __tests__/               # (meta) testes importam de src/__tests__

src/__tests__/
├── collaboratorsListApi.test.js
├── collaboratorsPermissionsApi.test.js
└── collaboratorsApplyRoleTemplateApi.test.js  # planejado
```

**Regra:** handler > 300 linhas → extrair `server/lib/<domain>Api*.js`.  
**Proibido:** lógica de domínio Phase 4 inline monolítica sem lib testável.

---

## 27. Padrão de testes

| Camada | Ferramenta | Escopo |
|--------|------------|--------|
| Handler unit | Vitest | Parser, resolver, envelope, guards |
| HTTP integration | Vitest + supertest *(gate futuro)* | 401/403/404 E2E `:3001` |
| Static grep | Vitest | Zero IDB, zero prod URL, zero write proibido |
| QA manual | scripts/manual-* | Smoke staging pós-recovery |

**Mínimo por endpoint Phase 4:**

- 401 sem auth  
- 403 sem tenant / não-admin  
- 400 tenant_id query/body  
- 404 cross-tenant  
- Happy path + edge cases do contrato  
- Static: no IndexedDB import  

**Gate merge:** suite verde + contrato Phase 4.x **READY**.

---

## 28. Padrão de implementação de endpoint

| Step | Ação |
|------|------|
| 1 | Contrato Markdown `docs/reports/PHASE_4_x_*.md` **READY** |
| 2 | `server/lib/<feature>Api.js` — parser, resolvers, handler factory |
| 3 | Reutilizar resolvers compartilhados (`collaboratorsPermissionsApi.js`) |
| 4 | Registrar rota fina em `server/index.js` |
| 5 | `src/__tests__/<feature>Api.test.js` |
| 6 | Log tag estruturado |
| 7 | Checklist §30 |
| 8 | Homolog staging (quando disponível) |

**Read-first:** implementar GET antes de POST/PUT do mesmo recurso.

---

## 29. Anti-patterns proibidos

| # | Anti-pattern | Consequência |
|---|--------------|--------------|
| A1 | `tenant-1` / tenant inferido | Bug multi-tenant crítico |
| A2 | Primeira clínica / primeiro `tenant_users` row | Vazamento dados |
| A3 | IndexedDB como SSOT pós-cutover | Split-brain |
| A4 | `service_role` no frontend | Comprometimento total |
| A5 | Fallback silencioso API→IDB write | Divergência permanente |
| A6 | Seed/mock runtime no handler | Dados fantasma |
| A7 | `platform_users` no app `:5176` | Violação security model |
| A8 | `tenant_id` query/body livre Phase 4+ | Cross-tenant |
| A9 | Merge silencioso IDB + Supabase write | Perda SSOT |
| A10 | SELECT `*` sem allowlist | Exfiltração colunas |
| A11 | Logar `custom_permissions` completo | PII/volume |
| A12 | Hardcoded array 184 permissions | Desync catálogo |
| A13 | PUT sem audit RBAC | Não conformidade |
| A14 | Endpoint sem testes 401/403 | Regressão auth |

---

## 30. Checklist obrigatório — novo endpoint

```markdown
- [ ] Contrato Phase 4.x ou amendment V3 publicado
- [ ] Rota sob `/internal/app/*` (ou prefixo aprovado)
- [ ] requireAppUser (+ admin guard se sensível)
- [ ] Tenant resolvido backend — sem tenant_id frontend
- [ ] FORBIDDEN_TENANT_IDS checado
- [ ] Cross-tenant validation pós-query
- [ ] Envelope `{ ok, data, meta }` ou `{ ok, false, error, code }`
- [ ] Códigos HTTP §7
- [ ] Log estruturado `[TAG_*]`
- [ ] Audit se mutação sensível
- [ ] Zero IndexedDB no módulo server
- [ ] Zero service_role fora server
- [ ] Testes Vitest (401, 403, 400 tenant, happy path)
- [ ] Static grep produção / IDB
- [ ] Documentado em matriz §31
- [ ] Homolog staging (quando RC-03 desbloqueado)
- [ ] Produção intocada até gate release
```

---

## 31. Matriz oficial Phase 4

**Legenda status:** ✅ Done · 📋 Contract READY · ⏳ Partial · ❌ Not started · 🚫 BLOCKED (staging 522) · ➖ Defer

| Endpoint | Contrato | Implementação | Testes | Homologação | Produção | Status geral |
|----------|----------|---------------|--------|-------------|----------|--------------|
| `GET /internal/app/collaborators` | ✅ Phase 4.1 | ✅ `collaboratorsApiList.js` | ✅ 24/24 Vitest | 🚫 staging 522 | ❌ não promovido | **READY code** / **NOT READY live** |
| `GET /internal/app/collaborators/:id/permissions` | ✅ Phase 4.3 | ✅ `collaboratorsPermissionsApi.js` | ✅ 29/29 Vitest | 🚫 staging 522 | ❌ não promovido | **READY code** / **NOT READY live** |
| `POST /internal/app/collaborators/:id/apply-role-template` | ✅ Phase 4.5 | ❌ | ❌ | 🚫 | ❌ | **READY contract** / **NOT READY impl** |
| `PUT /internal/app/collaborators/:id/permissions` | ⏳ evolui `access-bundle` | ❌ | ❌ | 🚫 | ❌ | **NOT READY** |
| `POST /internal/app/assets/avatar` | ❌ | ❌ | ❌ | 🚫 | ❌ | **NOT READY** |
| `POST /internal/app/assets/logo` | ⏳ parcial via `PUT clinic-profile` | ⏳ upload indireto | ❌ | 🚫 | ❌ | **NOT READY** endpoint dedicado |
| `GET /internal/app/collaborators/:id/schedule` | ➖ defer | ❌ | ❌ | — | ❌ | **DEFER** — schema inexistente |
| `PUT /internal/app/collaborators/:id/schedule` | ➖ defer | ❌ | ❌ | — | ❌ | **DEFER** |
| `GET /internal/app/debug-user-context` | ⏳ audit Phase 4 | ✅ `index.js:2133` | ⏳ parcial | 🚫 | ❌ | **EXISTS** — formalizar contrato |

### 31.1 Endpoints Phase 4 satélite (audit completo)

| Endpoint | Contrato | Impl | Testes | Status |
|----------|----------|------|--------|--------|
| `GET /collaborators/:id` | 📋 implícito 4.1 | ❌ | ❌ | NOT READY |
| `POST/PUT/DELETE /collaborators` | ❌ | ❌ | ❌ | NOT READY (dual-write flag) |
| `GET /internal/app/tenant-context` | V2 API | ✅ | ⏳ | EXISTS — baseline |

### 31.2 Bloqueadores transversais

| ID | Bloqueador | Impacto |
|----|------------|---------|
| B1 | Staging Supabase **HTTP 522** (RC-03.9) | Homologação live impossível |
| B2 | `tenant_user_permissions` inexistente | PUT permissions relacional defer |
| B3 | Bucket avatar dedicado | POST /assets/avatar |
| B4 | OpenAPI / supertest CI | Gate release formal |

---

## 32. Roadmap de API

| Phase | Escopo | Entregáveis API |
|-------|--------|-----------------|
| **4 RH** | Colaboradores + permissões + assets | GET list, GET permissions ✅ · apply-template · PUT permissions · assets |
| **5 IndexedDB cache** | Cutover read paths | Repository READ_PRIMARY; invalidate hooks; shadow QA |
| **6 Telas** | Frontend consome API oficial | `useCollaboratorAccessForm` → POST apply-template; lista RH via GET |
| **7 Reconciles** | Paridade IDB↔Supabase | Jobs diff; backfill; zero split-brain |
| **8 RLS/testes** | Hardening | RLS advisors; supertest CI; OpenAPI |
| **10 Deploy** | Produção | Gate QA LO-QA-*; staging soak; promote |

**Sequência normativa Phase 4:** read (list, permissions) → apply-template → PUT permissions → assets → CRUD dual-write → schedule defer.

---

## 33. Convenções de evolução da API

| Mudança | Processo |
|---------|----------|
| Novo endpoint | Contrato Phase 4.x → checklist §30 → matriz §31 |
| Campo response aditivo | Minor — documentar |
| Campo response removido | Breaking — version bump |
| Erro/code novo | Documentar catálogo §7 |
| Relaxar proibição tenant | **Requer** amendment desta constituição |
| Endpoints legados | Marcar `@deprecated`; prazo convergência |

**Amendment V3:** PR em `docs/platform/` + referência em CHANGELOG arquitetura.

---

## 34. Observabilidade

| Sinal | Onde |
|-------|------|
| Request logs | `[TAG_*]` console structured |
| Access audit | `app_metadata.access_audit_log` |
| Identity | `identity_events` |
| Stability | `stabilityLogService` (frontend) |
| CI | Vitest results JSON |
| Futuro | Datadog/Sentry — ver MASTER_OBSERVABILITY |

**Correlação:** incluir `tenant_id`, `user_id`, `durationMs`; v1.1 `request_id` UUID.

---

## 35. Performance

| Regra | Detalhe |
|-------|---------|
| Listas | Paginação obrigatória; max `pageSize=500` |
| Permissions GET | 184-key map aceitável admin-only v1 |
| N+1 Auth | Batch `getAuthUserMeta` quando list enriquecida |
| Select columns | Lista explícita — não `*` |
| Indexes | Usar indexes migration 016/015 |
| Payload | Gzip HTTP padrão Express |

---

## 36. Qualidade mínima

| Critério | Gate |
|----------|------|
| Contrato READY | Markdown Phase 4.x aprovado |
| Testes unitários | ≥ casos do contrato; 0 fail |
| Cobertura auth | 401 + 403 em todo endpoint `/internal/app/*` |
| Static security | grep IDB / prod / service_role client |
| Homolog staging | Soak tenant fixture Implanprime |
| QA constitution | LO-QA-USR-002/003 Melissa/permissões |
| Produção | Release management gate Phase 10 |

---

## Veredicto final

### Constituição V3 Master API Architecture

## ✅ **READY**

Documento normativo completo (36 seções + matriz + checklist). Base para **todos** os endpoints atuais e futuros.

### Implementação oficial Phase 4 (continuar)

## ❌ **NOT READY** (global)

| Dimensão | Veredicto |
|----------|-----------|
| **Código read Phase 4** | ✅ 2/9 endpoints core — testes verdes |
| **Código write Phase 4** | ❌ apply-template, PUT permissions pendentes |
| **Homologação staging** | 🚫 BLOCKED_EXTERNAL (522) |
| **Produção** | ❌ intocada — correto |
| **OpenAPI / supertest CI** | ❌ pendente |

**Pode continuar implementação em paralelo:** `POST apply-role-template` (contrato 4.5 READY) + testes mock, sem depender de staging.

**Não promover produção** até: recovery staging + homolog LO-QA + gate Phase 10.

---

## Apêndice A — Referências

| Documento | Path |
|-----------|------|
| Phase 4 audit | `docs/reports/PHASE_4_OFFICIAL_API_AUDIT.md` |
| GET collaborators contract | `docs/reports/PHASE_4_1_GET_COLLABORATORS_API_CONTRACT.md` |
| GET permissions contract | `docs/reports/PHASE_4_3_GET_COLLABORATOR_PERMISSIONS_API_CONTRACT.md` |
| Apply template contract | `docs/reports/PHASE_4_5_APPLY_ROLE_TEMPLATE_API_CONTRACT.md` |
| V2 Master API | `docs/platform/LOVE_ODONTO_V2_MASTER_API.md` |
| Architecture constitution | `docs/constitution/LOVE_ODONTO_V2_MASTER_ARCHITECTURE.md` |
| Database constitution | `docs/constitution/LOVE_ODONTO_V2_MASTER_DATABASE.md` |
| Security | `docs/platform/LOVE_ODONTO_V2_MASTER_SECURITY.md` |
| QA | `docs/constitution/LOVE_ODONTO_V2_MASTER_QA.md` |
| Impl list | `server/lib/collaboratorsApiList.js` |
| Impl permissions | `server/lib/collaboratorsPermissionsApi.js` |

---

*Love Odonto V3 — Master API Architecture. Constituição normativa. Zero código. Zero commit. Zero produção.*
