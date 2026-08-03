# Love Odonto V2 — Master API (Contrato Oficial de Comunicação)

**Documento:** `docs/platform/LOVE_ODONTO_V2_MASTER_API.md`  
**Versão:** 1.0.0  
**Data:** 2026-06-29  
**Status:** Oficial — contrato de comunicação entre Frontend, Admin API, Supabase, Storage e integrações externas.  
**Complemento de:** [`LOVE_ODONTO_V2_MASTER_ARCHITECTURE.md`](../constitution/LOVE_ODONTO_V2_MASTER_ARCHITECTURE.md) · [`LOVE_ODONTO_V2_MASTER_DATABASE.md`](../constitution/LOVE_ODONTO_V2_MASTER_DATABASE.md) · [`LOVE_ODONTO_V2_MASTER_BUSINESS_RULES.md`](../constitution/LOVE_ODONTO_V2_MASTER_BUSINESS_RULES.md) · [`LOVE_ODONTO_V2_MASTER_QA.md`](../constitution/LOVE_ODONTO_V2_MASTER_QA.md)

**Regra de ouro:** nenhum módulo pode consumir ou expor comunicação fora deste contrato. Em conflito com implementação legada, **este documento prevalece** até revisão formal da arquitetura.

**Escopo:** contrato lógico e normativo. **Não** contém código, endpoints inventados nem alterações de implementação.

---

## Índice

1. [Filosofia da Plataforma](#1-filosofia-da-plataforma)
2. [Arquitetura geral de comunicação](#2-arquitetura-geral-de-comunicação)
3. [Camadas da plataforma](#3-camadas-da-plataforma)
4. [Contrato oficial Frontend](#4-contrato-oficial-frontend)
5. [Contrato oficial Admin API](#5-contrato-oficial-admin-api)
6. [Contrato oficial Supabase](#6-contrato-oficial-supabase)
7. [Contrato oficial Storage](#7-contrato-oficial-storage)
8. [Contrato oficial Auth](#8-contrato-oficial-auth)
9. [Contrato oficial Tenant](#9-contrato-oficial-tenant)
10. [Contrato oficial Cache](#10-contrato-oficial-cache)
11. [Contrato oficial Erros](#11-contrato-oficial-erros)
12. [Contrato oficial Respostas](#12-contrato-oficial-respostas)
13. [Contrato oficial Auditoria](#13-contrato-oficial-auditoria)
14. [Contrato oficial Segurança](#14-contrato-oficial-segurança)
15. [Contrato oficial Integrações](#15-contrato-oficial-integrações)
16. [Contrato oficial IA](#16-contrato-oficial-ia)
17. [Contrato oficial Webhooks](#17-contrato-oficial-webhooks)
18. [Estratégia de versionamento](#18-estratégia-de-versionamento)
19. [Estratégia Dev / Staging / Produção](#19-estratégia-dev--staging--produção)
20. [Regras proibidas](#20-regras-proibidas)
21. [Checklist obrigatório](#21-checklist-obrigatório)

---

## 1. Filosofia da Plataforma

### 1.1 Princípios de comunicação

| Princípio | Significado no contrato |
|-----------|-------------------------|
| **Separação de responsabilidades** | Cada camada expõe apenas o que lhe cabe; regras sensíveis não vivem só no browser |
| **SSOT** | Supabase + Admin API são autoridade; Frontend e IndexedDB são consumidores/cache |
| **Baixo acoplamento** | Módulos falam via contratos estáveis (envelope, auth, tenant), não via detalhes internos |
| **Escalabilidade** | Stateless API, RLS no Postgres, Storage para binários, cache explícito |
| **Idempotência** | Writes críticos repetíveis (provisionamento, webhooks, backfill) |
| **Fail-safe (fail closed)** | Sem tenant, token ou permissão → bloqueio; nunca fallback silencioso |
| **Observabilidade** | Toda operação crítica rastreável (logs, identity_events, stability) |

### 1.2 Superfícies oficiais

| Superfície | Porta dev | Autenticação | Público |
|------------|-----------|--------------|---------|
| **App React** | 5176 | JWT Supabase (Platform Auth) | Equipe clínica |
| **Console React** | 5177 | JWT + `X-Platform-Key` (rotas platform) | Operadores SaaS |
| **Admin API** | 3001 | `requireAppUser` / `requireConsoleAccess` | Backend privado |
| **Supabase** | — | Anon + RLS (client) · Service role (server only) | Postgres, Auth, Storage |

---

## 2. Arquitetura geral de comunicação

### 2.1 Diagrama principal

```mermaid
flowchart TB
  subgraph browser [Browser]
    UI[React App / Console]
    SVC[Application Services]
    IDB[(IndexedDB cache)]
    UI --> SVC
    SVC --> IDB
  end

  subgraph api [Admin API :3001]
    APP_R[/internal/app/*]
    PLAT_R[/internal/platform/*]
    PUB_R[/public/*]
    WH[/api/signature/webhook]
  end

  subgraph supabase [Supabase]
    AUTH[Auth JWT]
    PG[(Postgres + RLS)]
    STG[Storage]
  end

  subgraph external [Serviços externos]
    SIG[Assinatura digital]
    WA[WhatsApp / Meta]
    MAIL[Email / SMS]
    IA[Provedores IA]
    N8N[N8N / automações]
  end

  SVC -->|Bearer JWT| APP_R
  SVC -->|Bearer JWT + Platform Key| PLAT_R
  SVC -->|Anon + RLS SELECT| PG
  SVC -->|Upload autenticado| STG
  SVC -.->|Auth login/refresh| AUTH

  APP_R -->|service role| PG
  APP_R --> AUTH
  PLAT_R --> PG
  WH --> SIG

  SIG -->|webhook| WH
  WA --> N8N
  N8N --> APP_R
  IA --> SVC

  APP_R --> STG
  IDB -.->|hydrate / invalidate| SVC
```

### 2.2 Fluxos permitidos (resumo)

| Origem | Destino | Permitido quando |
|--------|---------|------------------|
| Frontend | Admin API `/internal/app/*` | JWT app válido; operações SaaS canônicas |
| Frontend | Supabase PostgREST | SELECT tenant-scoped com RLS; uploads Storage autorizados |
| Frontend | IndexedDB | Cache derivado; domínios não migrados (transição) |
| Frontend | Supabase service role | **Nunca** |
| Admin API | Supabase service role | Sempre (server-side) |
| Admin API | Auth Admin API | Provisionamento, RBAC, convites |
| Externo | `/api/signature/webhook` | Secret header validado |
| Console | `/internal/platform/*` | Platform key ou JWT console |
| Frontend | Postgres direto (mutations sensíveis) | **Nunca** — usar Admin API |

### 2.3 Fluxos proibidos

- Browser → service role  
- Browser → mutation RBAC / provisionamento direto no Supabase  
- Admin API → confiar `tenant_id` só do body sem validar membership  
- IndexedDB → fonte oficial pós-cutover de domínio  
- Qualquer camada → tenant inferido (`tenant-1`, primeira clínica)

---

## 3. Camadas da plataforma

```
Frontend (React)
    ↓  UX, guards, can(), formulários
Application Services (src/services/*)
    ↓  orquestração, cache, fetch
Admin API (server/index.js)
    ↓  regras sensíveis, service role, auditoria
Supabase (Postgres + Auth + Storage)
    ↓  persistência canônica, RLS
Integrações externas
    ↓  webhooks, gateways, mensageria
```

### 3.1 Responsabilidades por camada

| Camada | Responsável por | Não responsável por |
|--------|-----------------|-------------------|
| **Frontend** | Renderização, validação UX, guards RBAC UI | Regra de negócio canônica, service role |
| **Application Services** | Orquestrar reads/writes, cache, retry client | Bypass RLS, secrets |
| **Admin API** | Tenant validation, Auth writes, provisionamento, auditoria server | Estado UI, IndexedDB |
| **Supabase** | Persistência, RLS, Auth tokens, Storage objects | Lógica clínica complexa (preferir API) |
| **Storage** | Binários (logos, PDFs, imagens) | Metadados sem registro Postgres |
| **Integrações** | Canais externos (assinatura, WhatsApp) | SSOT de domínio clínico |

---

## 4. Contrato oficial Frontend

### 4.1 Quem pode chamar o quê

| Recurso | App clínica (5176) | Console (5177) |
|---------|-------------------|----------------|
| Admin API `/internal/app/*` | ✅ Bearer platform JWT | ❌ |
| Admin API `/internal/platform/*` | ❌ | ✅ Key + JWT |
| Supabase Auth (login) | ✅ `supabasePlatformClient` | ✅ Console client |
| Supabase SELECT (RLS) | ✅ `supabaseAppClient` / platform | ✅ Escopo console |
| Supabase INSERT/UPDATE sensível | ⚠️ Somente onde RLS + domínio permitir explicitamente | Console scope |
| Storage upload | ✅ Buckets com policy tenant | Conforme bucket |
| IndexedDB | ✅ Cache / domínios em transição | N/A |

### 4.2 Quando usar Admin API (obrigatório)

- `GET /internal/app/tenant-context` — snapshot sessão clínica  
- `PUT /internal/app/clinic-profile` — perfil + logo URL  
- Colaboradores: link, provision, access-bundle  
- Usuários: create, list, patch access, delete  
- Convites: resend, reconcile  
- Identities: provision, repair, deactivate, reset-password  
- Contratos espelho: `POST /internal/app/contracts/generated`  
- Qualquer operação que altere Auth `app_metadata` ou RBAC canônico  

### 4.3 Quando usar Supabase direto (permitido)

- Auth: login, logout, refresh, recovery (via `@supabase/supabase-js`)  
- SELECT em tabelas com RLS tenant-scoped (ex.: `permission_catalog`, `collaborators` roster)  
- Storage upload/download em buckets com policy (logo, guias clínicos)  
- Realtime subscriptions (quando habilitado) — somente dados já autorizados por RLS  

### 4.4 Quando usar IndexedDB

- Domínios **não migrados** (agenda, pacientes, financeiro, CRM…) — autoridade temporária  
- Cache derivado pós-fetch Supabase/API (clinic profile, permissions mirror)  
- Espelho RBAC para `can()` offline — invalidar após sync  

### 4.5 Quando nunca acessar diretamente

- Service role key  
- Mutations de `tenant_users`, convites, identities sem Admin API  
- Writes em domínio já cutover para Supabase sem dual-write  
- Tenant resolution por heurística local  

### 4.6 Configuração de URL Admin API

| Ambiente | Variável | Comportamento |
|----------|----------|---------------|
| Dev | vazio | Proxy Vite `/internal/app` → `:3001` |
| Dev | `VITE_PLATFORM_API_BASE_URL` | URL absoluta backend |
| Prod | `VITE_PLATFORM_API_BASE_URL` ou `VITE_APP_ADMIN_API_BASE_URL` | **Obrigatório** URL pública HTTPS |

Referência: `src/config/adminApiBase.js`

---

## 5. Contrato oficial Admin API

**Implementação:** `server/index.js` · `server/identity/routes.js`  
**Base URL dev:** `http://127.0.0.1:3001`  
**Prefixos:** `/internal/app`, `/internal/platform`, `/public`, `/api`

### 5.1 Catálogo de endpoints (estado 2026-06-29)

#### Health

| Método | Path | Auth | Responsabilidade |
|--------|------|------|------------------|
| GET | `/health` | Nenhuma | Liveness |

#### App — tenant e clínica

| Método | Path | Auth | Responsabilidade |
|--------|------|------|------------------|
| GET | `/internal/app/tenant-context` | App JWT | Snapshot tenant, user, modules, roster |
| GET | `/internal/app/debug-user-context` | App JWT | Debug membership (dev/staging) |
| PUT | `/internal/app/clinic-profile` | App JWT | Perfil clínica + logo URL |

#### App — colaboradores e acessos

| Método | Path | Auth | Responsabilidade |
|--------|------|------|------------------|
| POST | `/internal/app/collaborators/link` | App JWT | Vincular RH ↔ user |
| POST | `/internal/app/collaborators/provision` | App JWT | Provisionar acesso |
| POST | `/internal/app/collaborators/:id/provision-access` | App JWT | Provisionar por ID |
| POST | `/internal/app/collaborators/access-bundle` | App JWT | RBAC write (app_metadata) |
| PATCH | `/internal/app/collaborators/:id/access` | App JWT | Atualizar acesso colaborador |
| GET | `/internal/app/collaborators/access-audit` | App JWT | Auditoria acessos |

#### App — usuários e convites

| Método | Path | Auth | Responsabilidade |
|--------|------|------|------------------|
| POST | `/internal/app/users/create` | App JWT | Criar tenant_user + Auth |
| GET | `/internal/app/users/list` | App JWT | Listar usuários tenant |
| PATCH | `/internal/app/users/:id/access` | App JWT | Alterar role/status |
| DELETE | `/internal/app/users/:id` | App JWT | Revogar membership |
| POST | `/internal/app/invitations/resend` | App JWT | Reenviar convite |
| POST | `/internal/app/invitations/reconcile` | App JWT | Reconciliar convites |
| POST | `/internal/app/users/password-reset` | App JWT | Reset senha |

#### App — identities (router)

| Método | Path | Auth | Responsabilidade |
|--------|------|------|------------------|
| GET | `/internal/app/identities` | App JWT | Listar identities |
| GET | `/internal/app/identities/:id` | App JWT | Detalhe |
| GET | `/internal/app/identities/:id/events` | App JWT | Timeline |
| GET | `/internal/app/identity-health` | App JWT | Saúde identidades |
| POST | `/internal/app/identity-health/evaluate` | App JWT | Avaliar/reparar |
| POST | `/internal/app/identities/provision` | App JWT | Provisionar |
| POST | `/internal/app/identities/:id/repair` | App JWT | Reparar |
| POST | `/internal/app/identities/:id/deactivate` | App JWT | Desativar |
| POST | `/internal/app/identities/:id/reactivate` | App JWT | Reativar |
| POST | `/internal/app/identities/:id/resend-invite` | App JWT | Reenviar convite |
| POST | `/internal/app/identities/:id/reset-password` | App JWT | Reset |
| POST | `/internal/app/identities/:id/revoke-sessions` | App JWT | Revogar sessões |

#### App — contratos

| Método | Path | Auth | Responsabilidade |
|--------|------|------|------------------|
| POST | `/internal/app/contracts/generated` | App JWT | Espelho contrato → Supabase |

#### Platform — console (5177)

| Método | Path | Auth | Responsabilidade |
|--------|------|------|------------------|
| GET | `/internal/platform/console-profile` | Bearer | Perfil operador |
| POST | `/internal/platform/provision-user` | Console | Provision user |
| POST | `/internal/platform/tenants/provision` | Console | Nova clínica |
| POST | `/internal/platform/tenants/:id/resend-access` | Console | Reenviar acesso |
| GET/POST/PATCH | `/internal/platform/billing/*` | Console | Billing SaaS |
| POST | `/internal/platform/tenants/:id/block-for-billing` | Console | Bloqueio |

#### Público / Webhooks

| Método | Path | Auth | Responsabilidade |
|--------|------|------|------------------|
| GET | `/public/platform/onboarding/terms` | Nenhuma | Termos onboarding |
| POST | `/public/platform/onboarding/accept-terms` | Público | Aceite termos |
| POST | `/api/signature/webhook` | Secret header | Assinatura digital |

### 5.2 Responsabilidades normativas

| Responsabilidade | Regra |
|------------------|-------|
| **Validação tenant** | Toda rota mutável valida membership do JWT vs recurso |
| **Validação permissão** | Master/admin para operações de acesso; regra de negócio por endpoint |
| **Auditoria** | identity_events, access-audit, contract_audit_logs |
| **Idempotência** | Reconcile, provision com chaves naturais |
| **Erros** | JSON `{ error, code? }` — sem stack em prod |

### 5.3 Rate limit, timeout, retry

| Aspecto | Contrato V2 |
|---------|-------------|
| **Timeout client tenant-context** | ~15s (`TENANT_CONTEXT_FETCH_TIMEOUT_MS`) |
| **Retry client** | Apenas erros transitórios (5xx, network, abort) |
| **Retry server** | Idempotente em webhooks e provisionamento |
| **Rate limit** | Roadmap — documentar por endpoint público/webhook |

### 5.4 Logs

- Server: `console.error` guardado — sem PII/tokens em prod  
- Client: `stabilityLogService` — `AUTH_OK`, `TENANT_CONTEXT_OK`, `BACKEND_FAILED`  
- Identity: `[IDENTITY_AUDIT]` events  

---

## 6. Contrato oficial Supabase

### 6.1 Matriz de acesso Frontend

| Operação | Direto client | Via Admin API |
|----------|---------------|---------------|
| **SELECT** catálogo global (`permission_catalog`) | ✅ | — |
| **SELECT** tenant-scoped com RLS | ✅ | Preferível para snapshots complexos |
| **INSERT** collaborators | ⚠️ Admin RLS only | ✅ Preferido provisionamento |
| **UPDATE** tenant_users / RBAC | ❌ | ✅ Obrigatório |
| **DELETE** membership | ❌ | ✅ Obrigatório |
| **Auth** signup/login/refresh | ✅ Auth client | Convites via API |
| **Storage** upload | ✅ Policy bucket | Metadados via API quando aplicável |
| **RPC** custom | ⚠️ Somente funções documentadas + GRANT | Preferir API |

### 6.2 Matriz Admin API (service role)

| Operação | Uso |
|----------|-----|
| **SELECT/INSERT/UPDATE** | Provisionamento, identities, billing |
| **Auth Admin** | Criar usuário, update app_metadata, reset password |
| **Bypass RLS** | Apenas server — nunca expor ao browser |

### 6.3 Clientes Supabase (Frontend)

| Cliente | Env | Uso |
|---------|-----|-----|
| `supabasePlatformClient` | `VITE_SUPABASE_PLATFORM_*` | Auth SaaS, tenant-context fallback |
| `supabaseAppClient` | `VITE_SUPABASE_APP_*` | App data, Storage |

**Regra API-SB-001:** App, server e Console devem apontar para o **mesmo projeto** Auth onde aplicável (`envGuard.js`).

---

## 7. Contrato oficial Storage

### 7.1 Buckets oficiais

| Bucket | Público | Path | Escrita |
|--------|---------|------|---------|
| `clinic-logos` | Sim (leitura) | `{tenant_id}/{file}` | Admin tenant via RLS |
| `clinical-guides` | Não | `{tenant_id}/{guide_id}/{file}` | Profissional/admin |

### 7.2 Buckets roadmap

| Bucket | Conteúdo |
|--------|----------|
| `collaborator-photos` | Fotos RH |
| `patient-files` | Documentos paciente |
| `clinical-imaging` | Radiografias |
| `contract-pdfs` | Contratos assinados |
| `signature-evidence` | Evidências assinatura |

### 7.3 Contrato upload/download

| Regra | Descrição |
|-------|-----------|
| **API-STG-001** | Upload gera URL HTTPS — metadado em Postgres |
| **API-STG-002** | Proibido base64 persistente em coluna text |
| **API-STG-003** | Validar MIME e tamanho antes de persistir referência |
| **API-STG-004** | Download via URL assinada ou pública conforme bucket |
| **API-STG-005** | Versionamento por novo object key — não overwrite silencioso de contrato assinado |

### 7.4 Fluxo logo clínica

```
Frontend → Storage upload (clinic-logos)
         → PUT /internal/app/clinic-profile { logo_url }
         → Supabase clinic_profiles
         → invalidate IDB cache
```

---

## 8. Contrato oficial Auth

### 8.1 Fluxo login (SaaS)

```
1. User → supabasePlatformClient.auth.signInWithPassword
2. JWT access + refresh → localStorage (storageKey platform)
3. AuthContext hydrateSaasUser()
4. TenantContext → GET /internal/app/tenant-context
5. Hydrate IDB permissions / clinic cache
```

### 8.2 Refresh token

- Automático via `@supabase/supabase-js` (`autoRefreshToken: true`)  
- Falha refresh → tratar como `AUTH_FAILED` — não confundir com `TENANT_CONTEXT_FAILED`  

### 8.3 Logout

- `supabase.auth.signOut()`  
- Limpar `TenantContext`, sessão reduzida, caches sensíveis  
- Não manter JWT em memória para chamadas API  

### 8.4 JWT e claims

| Claim / metadata | Uso |
|------------------|-----|
| `sub` | `auth.users.id` |
| `app_metadata` | Snapshot RBAC (transição) |
| `tenant_id` / `app_tenant_id` | RLS helper `app_current_tenant_id()` quando presente |

**Validação server:** `supabase.auth.getUser(accessToken)` em `requireAppUser`.

### 8.5 Permissions

- **Escrita canônica:** Admin API → Auth `app_metadata`  
- **Leitura runtime:** `accessService.can()` + cache IDB  
- **UI:** guards + menu — nunca única camada de segurança  

---

## 9. Contrato oficial Tenant

### 9.1 Resolução de tenant

| Etapa | Responsável |
|-------|-------------|
| 1 | Auth membership em `tenant_users` (server) |
| 2 | `GET /internal/app/tenant-context` retorna tenant ativo |
| 3 | `TenantContext` React mantém snapshot (refresh ~5 min) |
| 4 | RLS usa JWT tenant claim + helpers SECURITY DEFINER |

### 9.2 Quem define tenant

| Actor | Pode definir |
|-------|--------------|
| **Platform provision** | Cria `tenants.id` UUID novo |
| **Admin API** | Valida tenant da membership — não inventa |
| **Frontend** | **Nunca** define tenant para writes — apenas consome context |
| **IndexedDB guard** | Bloqueia write sem `tenant_id` |

### 9.3 Proibições

- ❌ `tenant-1`, primeira clínica, seed automático  
- ❌ Fallback Supabase direto quando API falha **exceto** read-only documentado (`tenantContextService` fallback controlado)  
- ❌ Cross-tenant parameter em request sem validação server  

### 9.4 Códigos tenant-specific

| HTTP | code | Significado |
|------|------|-------------|
| 404 | — | Sem membership / clínica |
| 403 | `TENANT_PROFILE_MISMATCH` | Perfil inconsistente |
| 422 | `TENANT_PROFILE_MISSING` | Clínica não configurada |

---

## 10. Contrato oficial Cache

### 10.1 Camadas

| Camada | TTL / invalidação |
|--------|-------------------|
| React state / TenantContext | Sessão; refresh 5 min |
| localStorage auth | Logout |
| IndexedDB | Evento sync; `DB_VERSION` |
| CDN Storage | Cache-Control bucket |

### 10.2 IndexedDB

| Uso | Contrato |
|-----|----------|
| **Cache derivado** | Após sucesso Supabase/API |
| **Autoridade temporária** | Domínios não migrados apenas |
| **Hydration** | tenant-context, clinic profile, roster |
| **Invalidation** | Pós RBAC change, clinic profile, RH backfill |

### 10.3 Warm vs cold

| Estado | Comportamento |
|--------|---------------|
| **Cold** | Miss IDB → fetch API/Supabase → hydrate |
| **Warm** | Hit IDB → servir com banner stale se offline (futuro) |
| **Outbox futura** | Fila write offline → replay API — não implementado como SSOT |

---

## 11. Contrato oficial Erros

### 11.1 Envelope V2 (padrão alvo)

Toda **nova** API e refatorações devem convergir para:

```json
{
  "success": false,
  "data": null,
  "meta": {
    "requestId": "uuid",
    "apiVersion": "v1",
    "timestamp": "ISO-8601"
  },
  "error": {
    "code": "TENANT_REQUIRED",
    "message": "Descrição legível",
    "details": {}
  }
}
```

**Sucesso:**

```json
{
  "success": true,
  "data": { },
  "meta": { "apiVersion": "v1" },
  "error": null
}
```

### 11.2 Estado legado (transição)

Endpoints existentes podem retornar:

- `{ "error": "mensagem" }`  
- `{ "ok": true, ...payload }`  
- `{ "code": "TENANT_PROFILE_MISSING", "error": "..." }`  

**Regra:** novos endpoints **não** adicionam formatos legados.

### 11.3 Catálogo HTTP

| HTTP | code sugerido | Significado | Ação client |
|------|---------------|-------------|-------------|
| **401** | `AUTH_REQUIRED` / `AUTH_INVALID` | Token ausente/inválido | Redirect login |
| **403** | `FORBIDDEN` / `TENANT_FORBIDDEN` | Sem permissão | Mensagem + abort |
| **404** | `NOT_FOUND` | Recurso inexistente | UI empty state |
| **409** | `CONFLICT` | Duplicidade (email, legacy_id) | Mostrar conflito |
| **422** | `VALIDATION_ERROR` / `TENANT_PROFILE_MISSING` | Entrada inválida | Inline errors |
| **500** | `INTERNAL_ERROR` | Erro inesperado | Retry + suporte |
| **503** | `SERVICE_UNAVAILABLE` | Supabase/network | Retry backoff |
| Timeout | `TIMEOUT` | Client abort | Retry tenant-context |
| — | `TENANT_REQUIRED` | Write sem tenant | Fail closed |
| — | `BUSINESS_RULE_VIOLATION` | Regra RN-* | Mensagem negócio |

### 11.4 Regras de mensagem

- Produção: sem stack trace, sem PII  
- Português (BR) para mensagens user-facing  
- `code` estável para i18n e logs  

---

## 12. Contrato oficial Respostas

### 12.1 Paginação (padrão V2)

Query: `limit`, `offset` ou `cursor`

```json
{
  "success": true,
  "data": { "items": [], "nextCursor": null },
  "meta": { "total": 0, "limit": 50, "offset": 0 },
  "error": null
}
```

### 12.2 Filtros e ordenação

- Filtros explícitos documentados por endpoint  
- Ordenação: `sort=field:asc|desc` — whitelist de campos  
- Nunca SQL sort direto do client  

### 12.3 Versionamento resposta

- Header `X-Api-Version: v1` ou `meta.apiVersion`  
- Breaking change → nova versão path (§18)  

### 12.4 tenant-context (exemplo shape)

Resposta canônica inclui: `tenant`, `clinicProfile`, `currentUser`, `modules`, `limits`, `flags`, `subscription`, `teamRoster`, `access`, `warnings`.

---

## 13. Contrato oficial Auditoria

### 13.1 Operações auditáveis (obrigatório)

- Provisionamento user / identity  
- RBAC change (access-bundle)  
- Link RH ↔ user  
- Convite / reset password  
- Contrato generated / signature webhook  
- Billing platform actions  

### 13.2 Campos padrão evento

| Campo | Descrição |
|-------|-----------|
| `actor_user_id` | Quem executou |
| `actor_email` | E-mail actor |
| `tenant_id` | Tenant afetado |
| `action` | Verb normalizado |
| `entity_type` / `entity_id` | Alvo |
| `before` / `after` | Snapshot JSON |
| `ip` | Quando server-side |
| `origin` | `ui` · `api` · `webhook` · `script` |
| `duration_ms` | Latência (opcional) |
| `result` | `success` · `failure` |
| `created_at` | UTC |

### 13.3 Destinos

| Sistema | Uso |
|---------|-----|
| `identity_events` | Acesso / identidade |
| `contract_audit_logs` | Contratos |
| `audit_logs` | Platform console |
| `stabilityLogService` | Frontend dev/staging |
| `scripts/reports/*.json` | Backfill/migrations |

---

## 14. Contrato oficial Segurança

| Controle | Contrato |
|----------|----------|
| **JWT** | Bearer only; validado server-side |
| **RLS** | Toda tabela `public` exposta |
| **Security Definer** | Helpers tenant admin — evitar recursão |
| **HTTPS** | Obrigatório prod (API + Supabase + Storage) |
| **Service role** | `server/.env` only — nunca VITE_* |
| **Platform key** | `X-Platform-Key` rotas `/internal/platform/*` |
| **Webhook secret** | `SIGNATURE_WEBHOOK_SECRET` + header |
| **LGPD** | Minimização dados em logs; consentimento documentado |
| **CORS** | Dev proxy; prod whitelist explícita |

---

## 15. Contrato oficial Integrações

| Integração | Direção | Contrato |
|------------|---------|----------|
| **WhatsApp / Meta** | Outbound + inbound | Log obrigatório; opt-out LGPD |
| **Email** | Outbound | Templates tenant-scoped; via API/provider |
| **SMS** | Outbound | Token assinatura quando exigido |
| **Google** | Ads / OAuth | Origem CRM rastreada |
| **N8N** | Orquestração | Webhooks autenticados → Admin API |
| **Assinatura digital** | Webhook inbound | §17 |
| **IA externa** | API outbound | §16 — sem PII cross-tenant |

**Regra:** credenciais integração por tenant (`tenant_integrations`) — nunca global hardcoded no frontend.

---

## 16. Contrato oficial IA

| Aspecto | Contrato |
|---------|----------|
| **Knowledge base** | Por tenant; sem dados de outras clínicas |
| **Prompts** | Versionados; sem secrets em prompt |
| **Embeddings** | pgvector futuro — index tenant-scoped |
| **Contexto** | Máximo necessário; redaction PII |
| **Memória** | Sessão/contato — não substitui prontuário |
| **Logs** | `marketingChat*` → Supabase futuro |
| **Ferramentas** | IA não executa estorno/delete/financeiro autônomo |
| **Handoff** | Transbordo humano obrigatório quando solicitado |

Estado atual: coleções IDB `marketingChat*` — migrar conforme [`LOVE_ODONTO_V2_MASTER_DATABASE.md`](../constitution/LOVE_ODONTO_V2_MASTER_DATABASE.md) §17.

---

## 17. Contrato oficial Webhooks

### 17.1 Assinatura digital (`POST /api/signature/webhook`)

| Aspecto | Regra |
|---------|-------|
| **Auth** | Header `x-signature-secret` ou `x-webhook-secret` |
| **Payload** | JSON `{ event, externalId, contractId, ... }` |
| **Resposta** | `200 { ok: true, received: true, event, externalId }` |
| **Retry provider** | Idempotente por `externalId` + `event` |
| **Timeout** | Responder < 5s — processamento async futuro |

### 17.2 Eventos normalizados

`document_sent`, `document_viewed`, `document_signed`, `document_completed`, `document_expired`, `document_refused`, `document_cancelled`

### 17.3 Webhooks futuros (N8N, billing, WhatsApp)

- Assinatura HMAC header  
- Retry exponential backoff  
- Dead letter log tenant-scoped  
- Version field no payload  

---

## 18. Estratégia de versionamento

### 18.1 Estado atual

- Paths **sem** prefixo `/v1` — `/internal/app/*` estável por convenção  
- Breaking changes documentadas via ADR + bump `meta.apiVersion`  

### 18.2 Alvo

| Versão | Path | Status |
|--------|------|--------|
| **v1** | `/internal/app/*` (implícito) | Atual |
| **v2** | `/api/v2/*` | Futuro — envelope unificado |

### 18.3 Depreciação e sunset

1. Anunciar em ADR + header `Deprecation: true`  
2. Período mínimo 90 dias staging/prod  
3. Remover após métricas zero uso  
4. QA regressão API obrigatória  

---

## 19. Estratégia Dev / Staging / Produção

| Aspecto | Dev local | Staging | Produção |
|---------|-----------|---------|------------|
| **Supabase ref** | Staging credentials | `tckdjyunwmdpqmewrwvt` | `uoepkwhqztmsjnzirpev` |
| **Admin API** | `:3001` + proxy | Deploy staging URL | URL pública HTTPS |
| **Frontend env** | `.env.local` | staging env | prod env |
| **Service role** | `server/.env` | staging secret | prod secret — isolado |
| **Webhook secret** | dev optional | staging | prod rotacionado |
| **Debug endpoints** | `debug-user-context` permitido | restrito | **desabilitado** prod |
| **CORS** | Permissivo dev | whitelist staging | whitelist prod |

**Regra:** nunca apontar dev local para Supabase **produção** para writes.

---

## 20. Regras proibidas

| # | Proibição |
|---|-----------|
| ❌ 1 | Chamar endpoint mutável sem tenant validado |
| ❌ 2 | Resposta fora do envelope V2 em **novos** endpoints |
| ❌ 3 | Bypass Admin API quando §4.2/§6.1 exige API |
| ❌ 4 | IndexedDB como origem oficial pós-cutover |
| ❌ 5 | Fallback tenant padrão / inferido |
| ❌ 6 | Endpoint sensível sem auditoria |
| ❌ 7 | Endpoint sensível sem autenticação |
| ❌ 8 | Service role exposta ao frontend (`VITE_*`) |
| ❌ 9 | Upload base64 persistente em DB |
| ❌ 10 | Endpoint sem tratamento de erro JSON |
| ❌ 11 | Comunicação síncrona bloqueante desnecessária (UI thread) |
| ❌ 12 | Logar tokens, service role ou PII |
| ❌ 13 | Webhook sem validação secret |
| ❌ 14 | Cross-tenant data em integração IA |

---

## 21. Checklist obrigatório

Toda **nova rota ou integração** deve responder:

| # | Pergunta | Bloqueante |
|---|----------|------------|
| 1 | Existe autenticação? | ✅ |
| 2 | Existe validação tenant? | ✅ |
| 3 | Existe RLS (se persistência Supabase client)? | ✅ |
| 4 | Existe auditoria (se sensível)? | ✅ |
| 5 | Existe timeout client/server? | ✅ |
| 6 | Existe retry idempotente (se aplicável)? | Se webhook/async |
| 7 | Existe documentação neste Master API? | ✅ |
| 8 | Existe teste (`LO-QA-API-*` ou integração)? | ✅ |
| 9 | Existe monitoramento/log estável? | ✅ |
| 10 | Existe plano rollback? | Se migration/backfill |

**API-CHK-001:** Rota sem autenticação + tenant (quando aplicável) → **não deployável**.

---

## Controle de revisão

| Versão | Data | Alteração |
|--------|------|-----------|
| 1.0.0 | 2026-06-29 | Versão inicial — Contrato Master API V2 |

---

## Apêndice — Métricas de catalogação

| Métrica | Quantidade |
|---------|------------|
| **Camadas documentadas** | 6 (Frontend, Services, API, Supabase, Storage, Integrações) |
| **Fluxos diagramados** | 1 principal + 3 tabelas fluxo |
| **Contratos definidos** | 14 (§4–§17) |
| **Endpoints Admin API catalogados** | ~45 |
| **Regras proibidas** | 14 |
| **Códigos erro padronizados** | 12+ |

### Pendências (P-API)

| ID | Pendência |
|----|-----------|
| P-API-01 | Migrar respostas legadas `{ error }` → envelope V2 |
| P-API-02 | Rate limiting documentado e implementado |
| P-API-03 | OpenAPI / schema gerado a partir deste contrato |
| P-API-04 | Casos teste `LO-QA-API-*` no Master QA |
| P-API-05 | Webhook async processor (fora request cycle) |

### Próximos documentos recomendados

| Documento | Propósito |
|-----------|-----------|
| `LOVE_ODONTO_V2_MASTER_INTEGRATION.md` | Detalhamento webhooks e payloads |
| OpenAPI spec (`docs/platform/openapi-v1.yaml`) | Schema machine-readable |
| Addendum envelope V2 migration | Plano convergência respostas legadas |

### Referências

- [`../constitution/LOVE_ODONTO_V2_MASTER_ARCHITECTURE.md`](../constitution/LOVE_ODONTO_V2_MASTER_ARCHITECTURE.md) §9–10  
- [`../reports/architecture-audit-love-odonto-v2.md`](../reports/architecture-audit-love-odonto-v2.md)  
- [`../playbooks/STABILITY_CHECKLIST.md`](../playbooks/STABILITY_CHECKLIST.md)  
- [`../README.md`](../README.md)
