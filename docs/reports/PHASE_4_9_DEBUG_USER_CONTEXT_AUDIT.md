# PHASE 4.9 — Auditoria: `GET /internal/app/debug-user-context`

**Documento:** `docs/reports/PHASE_4_9_DEBUG_USER_CONTEXT_AUDIT.md`  
**Data:** 2026-07-08  
**Escopo:** auditoria somente — **zero** alteração de código, banco, migrations, Supabase, frontend ou commit.  
**Base normativa:**  
- `docs/platform/LOVE_ODONTO_V3_MASTER_API_ARCHITECTURE.md`  
- `docs/reports/PHASE_4_OFFICIAL_API_AUDIT.md`  
- `docs/platform/LOVE_ODONTO_V2_MASTER_API.md` (§19 Dev/Staging/Prod)  
- `docs/platform/LOVE_ODONTO_V2_MASTER_SECURITY.md` (§C.8)  
- Implementação: `server/index.js` (~L2137–2205) + helpers `requireAppUser`, `getTenantAdminActorOrThrow`, `getAuthUserMeta`, `extractPermissionFieldsFromAppMetadata`

**Contexto Phase 4:** identificado em `PHASE_4_OFFICIAL_API_AUDIT.md` como o **único match exato** entre plano e implementação; matriz V3 marca **EXISTS — formalizar contrato** (`§31`).

---

## 1. Sumário executivo

| Item | Veredicto |
|------|-----------|
| Endpoint existe e autentica | Sim (`requireAppUser` + admin) |
| Alinhado à Constituição V3 (Phase 4+) | **Não** — legado V2 parcial |
| Envelope V3 | **Não** |
| `tenant_id` livre do frontend (P6) | **Violado** (`?tenant_id=`) |
| `collaborator_uuid` | **Ausente** |
| `collaborator_id` legado | Retornado (campo text de `tenant_users`) |
| Mapa completo de permissões / `app_metadata` bruto | **Não** exposto no response (bom) |
| service_role / tokens na response | **Não** |
| Gate DEV/STAGING vs produção | **Ausente** — rota ativa se Admin API estiver em prod |
| Testes Vitest dedicados | **Nenhum** |
| Uso no frontend (`src/`) | **Nenhum** match encontrado |
| **Decisão** | **NOT READY** como endpoint oficial V3 |

**Recomendação (alta nível):** **restringir / não promover** o endpoint atual como contrato oficial; separá-lo em superfícies distintas (`debug` vs `tenant-context` vs `access-context`) em fase posterior. Manter apenas como **diagnóstico admin em DEV/STAGING** até reforço.

---

## 2. Implementação atual

### 2.1 Localização

| Aspecto | Valor |
|---------|-------|
| **Rota** | `GET /internal/app/debug-user-context` |
| **Arquivo** | `server/index.js` linhas ~2137–2205 |
| **Módulo dedicado** | **Não** — handler inline (não há `server/lib/*debug*Api*.js`) |
| **Query params** | `tenant_id` (opcional), `target_user_id` (opcional) |

### 2.2 Middleware / auth

```text
requireAppUser
  → Authorization: Bearer <JWT>
  → supabase.auth.getUser(accessToken)
  → req.appAuthUser = data.user
```

- Sem JWT → **401** `{ error: 'Token do app ausente.' }` (formato legado, sem `ok`/`code` estáveis de Phase 4).
- Em falha de rede Supabase no middleware → **503** (outros handlers).

### 2.3 Resolução de tenant e membership

```text
explicitTenantId = query.tenant_id
authUserId = query.target_user_id || req.appAuthUser.id

actorTenantUser = getTenantAdminActorOrThrow(req.appAuthUser.id, explicitTenantId)
tenantId = actorTenantUser.tenant_id
```

`getTenantAdminActorOrThrow` (`index.js` ~588–600):

1. `resolveActiveTenantUser(authUserId, explicitTenantId)` — membership ativa.
2. Exige `tenant_id` no vínculo.
3. Se `explicitTenantId` ≠ `actor.tenant_id` → erro.
4. Exige role admin: `owner` | `admin` | `master` (`isTenantAdminRole`).

**Membership do alvo (`target_user_id`):**

- Lê `tenant_users` no `tenantId` do **actor** com `user_id = authUserId` (alvo).
- Se alvo não existir naquele tenant → campos vindos de `tuRow` ficam vazios/`unknown`, mas response ainda **200** (não 404).
- **Não** valida membership do alvo além do `maybeSingle`; não falha closed se target ausente.

### 2.4 Fontes de dados

| Fonte | Uso |
|-------|-----|
| `tenants` | `select('*')` — nome da clínica |
| `clinic_profiles` (via `resolveClinicProfileForTenant`) | `logo_url` |
| `tenant_users` | vínculo do **alvo** (campos limitados, **sem** `collaborator_uuid`) |
| Auth Admin `getUserById` | `app_metadata` (extração de counts), `user_metadata.avatar_url` |
| Tabela `collaborators` | **Não consultada** (`collaborator` declarado e permanece `null`) |
| IndexedDB | **Não** — zero uso server-side neste handler |

### 2.5 Logs

| Evento | Comportamento |
|--------|---------------|
| Sucesso | **Sem** log estruturado tipo `[DEBUG_USER_CONTEXT]` |
| Erro | `console.error('[debug-user-context]', err)` + **400** `{ error }` |

Contraste: `GET /tenant-context` emite `[TENANT_AUDIT]` (inclui email — também sensível, fora do escopo desta fase).

Não há audit event formal (endpoint é read-only; ok sob §16 se meramente diagnóstico).

### 2.6 Ambiente / gate produção

- **Não** há `if (NODE_ENV === 'production') return 404/403`.
- Contradição com:
  - Master API V2 §19: debug endpoints **desabilitados** em produção.
  - Master Security §C.8: `debug-user-context` **desabilitados prod**.

Se o Admin API produção montar esta rota, ela fica **alcancável** por qualquer JWT admin do tenant.

---

## 3. Payload atual (sucesso HTTP 200)

Formato **legado flat** (não envelope V3):

```json
{
  "user_id": "<auth uuid do alvo>",
  "email": "<tenant_users.email | JWT email>",
  "tenant_id": "<uuid do actor>",
  "tenant_name": "<tenants.trade_name|name>",
  "role_slug": "<normalizado do alvo ou 'atendimento'>",
  "tenant_user_status": "<status|active|inactive|unknown>",
  "collaborator_id": "<tenant_users.collaborator_id text legado | null>",
  "collaborator_name": "<tenant_users.full_name>",
  "collaborator_status": "ativo|inativo",
  "access_id": "<tenant_users.id>",
  "access_status": "active|inactive",
  "has_custom_permissions": true,
  "permissions_count": 0,
  "agenda_enabled": true,
  "logo_url": "<clinic logo url | null>",
  "avatar_url": "<Auth user_metadata.avatar_url | null>",
  "source": "debug-user-context",
  "permission_overrides_keys": 0,
  "custom_permissions_keys": 0
}
```

### 3.1 Erro atual

```json
{ "error": "<mensagem>" }
```

- HTTP tipicamente **400** para falhas capturadas (incluindo “apenas administradores…”, que sob V3 deveria ser **403** `ADMIN_REQUIRED`).
- Sem `ok: false`, sem `code` estável Phase 4.

---

## 4. Checklist de investigação (perguntas 1–19)

| # | Pergunta | Achado |
|---|----------|--------|
| 1 | Onde implementado? | `server/index.js` ~2137–2205, inline |
| 2 | Qual middleware? | `requireAppUser` |
| 3 | Como resolve auth? | Bearer JWT → `supabase.auth.getUser` |
| 4 | Como resolve tenant? | `getTenantAdminActorOrThrow(actor, ?tenant_id)` — **aceita** `tenant_id` query |
| 5 | Valida membership? | Actor: sim (ativo + admin). Alvo: lookup opcional; **200 mesmo se `tuRow` null** |
| 6 | Expõe dados sensíveis? | Email + nome + IDs + contagens RBAC + logo/avatar URL; **não** mapa 184 nem tokens |
| 7 | `tenant_id` correto? | Do **actor** admin (OK se membership correta); cross-tenant bloqueado se actor sem vínculo no tenant explícito |
| 8 | Role correto? | Do **alvo** (`tuRow.role`/`role_slug`); default heurístico `'atendimento'` se ausente |
| 9 | `user_id` correto? | Alvo = `target_user_id` ou self; é Auth UUID |
| 10 | `collaborator_uuid`? | **Não retorna**; SELECT nem inclui a coluna |
| 11 | `collaborator_id` legado? | **Sim** — `tenant_users.collaborator_id` (text) |
| 12 | Permissões? | Apenas **counts**/flags (`has_custom_permissions`, `permissions_count`, keys length) — não o mapa |
| 13 | `app_metadata`? | Lido server-side; **não** serializado bruto no JSON |
| 14 | Vazamento service_role / tokens / claims / PII? | Sem service_role/tokens na response. PII moderada (email, nome). `SELECT *` em `tenants` no server (risco interno A10; resposta filtra nome). Avatar de `user_metadata` (user-editable — não SSOT foto RH) |
| 15 | Envelope oficial? | **Não** |
| 16 | Logs? | Erro only; sem log de sucesso estruturado |
| 17 | Pode ser usado em produção? | Tecnicamente sim se API up — **norma diz não** |
| 18 | Restringir DEV/STAGING? | **Sim** — obrigatório sob V2 Security/API |
| 19 | Debug vs tenant vs access? | **Separar** — ver §8 |

---

## 5. Riscos

| ID | Risco | Severidade | Nota |
|----|-------|------------|------|
| R1 | `?tenant_id=` permitido (P6 / A8) | **Alta** (conformidade) | Phase 4+ rejeita; aqui é legado multi-clínica |
| R2 | Sem disable em produção | **Alta** | Viola Master Security / Master API V2 §19 |
| R3 | Erros admin → HTTP 400 flat | **Média** | Clientes não distinguem 403; leak de mensagem |
| R4 | `target_user_id` sem 404 se membership ausente | **Média** | Enumeração parcial de UUIDs + payload “oco” |
| R5 | Identity split: `collaborator_id` legado sem `collaborator_uuid` | **Alta** (produto RH) | Incompatível com modelo pós-RC01 |
| R6 | `agenda_enabled` heurístico (role/keys), não `collaborators.agenda_enabled` | **Média** | Já apontado no audit Phase 4 |
| R7 | `avatar_url` de Auth `user_metadata`, não Storage/`foto_url` | **Média** | Diverge da API avatar 4.8E |
| R8 | `tenants.select('*')` (A10) | **Baixa–Média** | Não ecoa colunas extras no JSON, mas padrão frágil |
| R9 | Sem testes (A14) | **Alta** (quality gate) | Regressão silenciosa |
| R10 | Sem envelope V3 | **Alta** (contrato) | Não formalizável como oficial sem refactor |
| R11 | Variável `collaborator` morta / sem join RH | **Baixa** | Código incompleto / dead path |
| R12 | Contagem de permissões ≠ catálogo efetivo template | **Média** | `permissions_count` pode confundir diagnóstico |

**Não encontrado neste response:** service_role key, access_token, refresh_token, `custom_permissions` completo, `permission_overrides` completo, password hashes, `access_audit_log`.

---

## 6. Alinhamento com Master API V3

| Princípio / norma | Status |
|-------------------|--------|
| P2 API única porta oficial | Cumpre (rota Admin API) |
| P3 React sem service_role | Cumpre |
| P4 IDB não SSOT neste path | Cumpre |
| P5 tenant_id presente | Cumpre (no payload) |
| **P6 tenant_id livre do frontend proibido** | **Falha** |
| P7 service_role só backend | Cumpre (uso interno) |
| P8 cross-tenant | Parcial — actor isolado; alvo “oco” não 404 |
| P12 fail closed | Parcial — admin fail closed; alvo ausente não |
| §6 Envelope V3 | **Falha** |
| §7 códigos HTTP | **Falha** (400 genérico) |
| §8 Auth Bearer | Cumpre |
| §9 membership Phase 4 (sem query tenant) | **Falha** |
| §10 admin-only sensível | Cumpre (admin) |
| §15 logs estruturados | **Falha** (sucesso) |
| §27 testes | **Falha** |
| §29 A8/A10/A14 | **Falha** parcial |
| Matriz §31 “formalizar contrato” | Ainda **não** formalizado |
| V2 Security: disable prod | **Falha** |

### Comparação rápida com sibling endpoints

| Endpoint | Papel | Auth | Tenant query | Envelope |
|----------|-------|------|--------------|----------|
| `GET /tenant-context` | Bootstrap clínica + roster | membership | aceita `?tenant_id` | legado |
| `GET /debug-user-context` | Diagnóstico sync admin | **admin** | aceita `?tenant_id` + `target_user_id` | legado |
| Phase 4+ (`collaborators`, permissions, assets) | Oficial V3 | admin/member | **rejeita** `tenant_id` | `{ ok, data, meta }` |

---

## 7. Campos permitidos vs proibidos (contrato alvo sugerido)

### 7.1 Permitidos em endpoint **diagnóstico** (DEV/STAGING, admin)

| Campo | Motivo |
|-------|--------|
| `user_id` | Auth UUID do alvo |
| `tenant_id` | Isolamento (meta) |
| `tenant_name` | Diagnóstico UX (opcional) |
| `role_slug` | Membership |
| `tenant_user_status` / `access_status` | Estado vínculo |
| `access_id` | `tenant_users.id` |
| `collaborator_id` (legado, nullable) | Compat RH transição — rotular como legacy |
| `collaborator_uuid` (nullable) | SSOT pós-backfill — **hoje ausente, deve entrar** |
| `has_custom_permissions` | Flag RBAC |
| `permissions_count` / keys counts | Diagnóstico sem expor mapa |
| `source` | Telemetria do contrato |
| `requested_by` / `resolved_tenant_by` | Meta auditável |
| Caps de ambiente: `environment: staging|development` | Explicitar non-prod |

### 7.2 Proibidos

| Campo / comportamento | Motivo |
|------------------------|--------|
| `custom_permissions` / `permission_overrides` **completos** | A11 / volume / PII operacional |
| `app_metadata` bruto | Claims sensíveis, audit log embutido |
| `user_metadata` bruto | User-editable; risco claim spoofing |
| Tokens, service_role, refresh, session | Comprometimento |
| `SELECT *` ecoado | A10 |
| Password / hashes / recovery links | Segurança |
| Email completo em **logs** | PII (response admin pode manter email com rate-limit futuro) |
| Assumir `avatar_url` Auth como foto RH oficial | Conflito 4.8D/4.8E |
| `tenant_id` query em superfície **oficial Phase 4+** | P6 |
| Habilitação em **produção** sem feature flag | V2 Security |

### 7.3 Ambíguos (decidir na formalização)

| Campo | Recomendação |
|-------|--------------|
| `email`, `collaborator_name` | OK em debug admin; strip/hash se endpoint virar “público membro” |
| `agenda_enabled` | Remover até SSOT de agenda; ou marcar `derived: true` |
| `logo_url` | Pertence mais a tenant-context / clinic profile |
| `avatar_url` | Preferir path/`signed_url` via assets; não Auth metadata |

---

## 8. Recomendação de produto / arquitetura

### 8.1 Não tratar o endpoint atual como “oficial V3 pronto”

Ele é um **legado diagnóstico útil**, não um contrato Phase 4 convergido.

### 8.2 Separação sugerida (evolução — fora do escopo desta auditoria)

| Superfície | Audiência | Conteúdo | Gate |
|------------|-----------|----------|------|
| **`GET /internal/app/debug-user-context`** | Admin + **DEV/STAGING only** | Diagnóstico sync RH↔Auth↔tenant; counts; legacy+uuid; `source=debug` | Feature flag / `NODE_ENV` / allowlist host |
| **`GET /internal/app/tenant-context`** | Membro autenticado | Bootstrap clínica, módulos, flags, roster (já existe) | Manter; migrar envelope depois |
| **`GET /internal/app/access-context`** (novo, opcional) | Self ou admin | Context de acesso efetivo do usuário (role, flags, counts) **sem** debug fields | Envelope V3; **sem** `tenant_id` query |

**Não** misturar debug, bootstrap e access num único contrato “oficial” sem tags de ambiente.

### 8.3 Ações futuras sugeridas (quando autorizado a codar)

1. Gate produção: **404/403** ou middleware `assertNonProductionDebug`.
2. Migrar handler para `server/lib/debugUserContextApi.js` + envelope V3.
3. Rejeitar `tenant_id` query **ou** documentar exceção legado multi-tenant com `TENANT_AMBIGUOUS` path explícito — decisão formal.
4. Incluir `collaborator_uuid` no SELECT/`data`.
5. `target_user_id` ausente no tenant → **404** `TARGET_USER_NOT_FOUND`.
6. Mapear erros admin → **403** `ADMIN_REQUIRED`.
7. Log sucesso `[DEBUG_USER_CONTEXT]` sem email plaintext (usar mask já existente `maskEmail` no server se aplicável).
8. Vitest: matriz §9 abaixo.
9. Atualizar matriz Master API §31 após reforço.

---

## 9. Testes necessários (ainda não existem)

| Caso | Esperado |
|------|----------|
| Sem Bearer | 401 |
| Membro não-admin | 403 `ADMIN_REQUIRED` (hoje: 400 string) |
| Admin sem membership | 403 membership |
| Multi-tenant sem disambiguation | 403/`TENANT_AMBIGUOUS` |
| `?tenant_id=` outro tenant sem vínculo | erro isolamento |
| Self context happy path | 200 + campos allowlist |
| `target_user_id` no tenant | 200 dados do alvo |
| `target_user_id` fora do tenant | 404 (hoje: 200 oco) |
| Response **não** contém `custom_permissions` object / `app_metadata` / tokens | assert |
| Response **não** contém `service_role` | assert |
| Produção / flag: rota desabilitada | 404/403 |
| Static: zero IndexedDB no path | grep |
| Static: produção project ref não hardwired em calls | grep |
| Envelope (pós-refactor) | `{ ok, data, meta }` |

Suite sugerida: `src/__tests__/debugUserContextApi.test.js` (após extração do handler — **não** nesta fase).

---

## 10. Decisão READY / NOT READY

### 10.1 Como diagnóstico operacional legado (DEV/STAGING mental model)

| Critério | Status |
|----------|--------|
| Útil para admin diagnosticar sync | Parcialmente útil |
| Seguro o bastante se API **não** estiver em prod | Relativo (ainda aceita `tenant_id` query + email) |
| Documentado e gated | **Não** |

→ **NOT READY** mesmo como debug “seguro”, por falta de gate prod + testes.

### 10.2 Como endpoint oficial Phase 4 / V3

| Critério V3 | Status |
|-------------|--------|
| Envelope §6 | ❌ |
| Tenant P6 | ❌ |
| Identity `collaborator_uuid` | ❌ |
| HTTP codes §7 | ❌ |
| Logs §15 | ❌ |
| Testes §27 | ❌ |
| Disable prod (Security) | ❌ |
| Contrato formal | ❌ |

→ **NOT READY**

### 10.3 Decisão operacional

| Opção | Escolha |
|-------|---------|
| Manter sem mudança | ⚠️ Aceitável **apenas** como legado temporário até próxima fase de reforço |
| Restringir | ✅ **Recomendado** (DEV/STAGING only) na próxima implementação |
| Refatorar / separar | ✅ **Recomendado** antes de promover a “oficial” |
| Promover produção agora | ❌ **Proibido** sob constituição e Security |

**Veredicto final Phase 4.9:**

# ❌ NOT READY (oficial V3)

**Ação preferida:** **restringir + refatorar (separar debug / tenant-context / access-context)** — **não** manter como está para promoção.

**Esta fase:** relatório somente; **zero** código, **zero** migration, **zero** produção, **zero** commit.

---

## 11. Evidências de código (âncoras)

| Tema | Âncora |
|------|--------|
| Handler | `server/index.js` `app.get('/internal/app/debug-user-context', …)` |
| Admin guard | `getTenantAdminActorOrThrow` + `isTenantAdminRole` |
| Auth meta | `getAuthUserMeta` → `auth.admin.getUserById` |
| Permissões | `extractPermissionFieldsFromAppMetadata` — só counts no JSON |
| Normativa disable prod | `LOVE_ODONTO_V2_MASTER_SECURITY.md` §C.8; `LOVE_ODONTO_V2_MASTER_API.md` §19 |
| Matriz | `LOVE_ODONTO_V3_MASTER_API_ARCHITECTURE.md` §31 linha debug-user-context |
| Audit prévio | `PHASE_4_OFFICIAL_API_AUDIT.md` §3.1 / §5.2 agenda_enabled |

---

## 12. Confirmações desta entrega

| Item | Confirmado |
|------|------------|
| Zero alteração de código runtime | Sim (somente este relatório) |
| Zero endpoint novo | Sim |
| Zero banco / Supabase / migrations | Sim |
| Zero produção | Sim |
| Zero commit | Sim |
| Relatório criado | `docs/reports/PHASE_4_9_DEBUG_USER_CONTEXT_AUDIT.md` |

---

*Love Odonto V2/V3 — Phase 4.9 Debug User Context Audit. Somente auditoria.*
