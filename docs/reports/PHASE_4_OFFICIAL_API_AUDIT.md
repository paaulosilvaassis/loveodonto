# Fase 4 — Auditoria da API Oficial de Colaboradores e Permissões

**Documento:** `docs/reports/PHASE_4_OFFICIAL_API_AUDIT.md`  
**Data:** 2026-07-07  
**Escopo:** Auditoria **somente leitura** — backend Admin API (`server/`) + consumo frontend  
**Plano original:** Consolidação arquitetural Love Odonto V2/V3 — API oficial RH  
**Alterações:** **nenhuma** em código, banco, Supabase, produção  
**Commit:** **não**

---

## 1. Resumo executivo

| Dimensão | Resultado |
|----------|-----------|
| Endpoints Phase 4 alvo | **14 rotas** (5 grupos) |
| Implementadas (match exato) | **1/14** — `GET /debug-user-context` |
| Parcialmente cobertas (path diferente) | **~8 rotas** (acesso, identidade, logo via clinic-profile) |
| Ausentes (CRUD RH + permissions read + schedule + assets) | **13 rotas** |
| Backend lê IndexedDB | **Não** — dados RH vêm do frontend ou Supabase via service_role |
| Frontend autoridade RH hoje | **IndexedDB** (`collaboratorService.js`) + Supabase read (RC-02) |
| Permissões canônicas (escrita) | **Auth `app_metadata`** via `POST /collaborators/access-bundle` |
| Tabela `collaborators` Supabase | ✅ Existe (migration 016) + RLS (019) |
| Tabela `tenant_user_permissions` | ❌ **Não existe** (mencionada como Fase 2, não migrada) |
| Agenda profissional Supabase | ❌ **Não existe** — `collaboratorWorkHours` só IndexedDB |
| Testes HTTP server `/internal/app` | ❌ **Ausentes** (Vitest identity flow parcial) |
| Staging Supabase | ⚠️ **`BLOCKED_EXTERNAL`** (RC-03.9) — bloqueia validação live |
| **Auditoria Phase 4** | ✅ **READY** (completa) |
| **Implementação API oficial** | ❌ **NOT READY** (pré-requisitos abaixo) |

> A Fase 4 **não pode iniciar implementação** enquanto o staging estiver indisponível (522) e sem estratégia de dual-write / migrations satélite. A **auditoria** está concluída e desbloqueia o **design** da implementação.

---

## 2. Escopo Phase 4 — rotas alvo

### 2.1 Colaboradores (CRUD)

| Método | Path | Status |
|--------|------|--------|
| GET | `/internal/app/collaborators` | ❌ Ausente |
| GET | `/internal/app/collaborators/:id` | ❌ Ausente |
| POST | `/internal/app/collaborators` | ❌ Ausente |
| PUT | `/internal/app/collaborators/:id` | ❌ Ausente |
| DELETE | `/internal/app/collaborators/:id` | ❌ Ausente |

### 2.2 Permissões

| Método | Path | Status |
|--------|------|--------|
| GET | `/internal/app/collaborators/:id/permissions` | ❌ Ausente |
| PUT | `/internal/app/collaborators/:id/permissions` | ❌ Ausente |
| POST | `/internal/app/collaborators/:id/apply-role-template` | ❌ Ausente |

### 2.3 Agenda profissional

| Método | Path | Status |
|--------|------|--------|
| GET | `/internal/app/collaborators/:id/schedule` | ❌ Ausente |
| PUT | `/internal/app/collaborators/:id/schedule` | ❌ Ausente |

### 2.4 Assets

| Método | Path | Status |
|--------|------|--------|
| POST | `/internal/app/assets/avatar` | ❌ Ausente |
| POST | `/internal/app/assets/logo` | ❌ Ausente |

### 2.5 Diagnóstico

| Método | Path | Status |
|--------|------|--------|
| GET | `/internal/app/debug-user-context` | ✅ **Existe** |

---

## 3. Tabela — endpoints existentes (relacionados + ecossistema `/internal/app`)

**Total inventariado:** 30 rotas em `server/index.js` + `server/identity/routes.js`  
**Cliente Supabase:** `service_role` global (`server/index.js:274`)  
**Auth middleware:** `requireAppUser` (`server/index.js:1867`) — JWT app via `supabase.auth.getUser`

### 3.1 Rotas Phase 4 — match ou parcial

| Método | Path | Arquivo | tenant_id | RBAC | Audit | service_role | Fonte dados | Notas |
|--------|------|---------|-----------|------|-------|--------------|-------------|-------|
| GET | `/internal/app/debug-user-context` | `index.js:2131` | ✅ admin + `?tenant_id` | ✅ admin | ❌ | ✅ | `tenant_users`, Auth metadata, `clinic_profiles` | **Único match Phase 4** |
| POST | `/internal/app/collaborators/access-bundle` | `index.js:2339` | ✅ body | ✅ admin | ❌ persistido | ✅ | Auth `app_metadata` + `tenant_users` | **Parcial** → PUT permissions |
| GET | `/internal/app/tenant-context` | `index.js:1950` | ✅ query | JWT membro | ✅ console | ✅ | tenants, modules, roster | **Parcial** → permissions read |
| GET | `/internal/app/users/list` | `index.js:2784` | ✅ query obrig. | ✅ admin | ❌ | ✅ | `tenant_users`, Auth metadata | Lista **acesso**, não ficha RH |
| PUT | `/internal/app/clinic-profile` | `index.js:2198` | ✅ body | ✅ admin | ❌ | ✅ | `clinic_profiles` + Storage | **Parcial** logo (rejeita `data:` no handler) |
| POST | `/internal/app/collaborators/link` | `index.js:2235` | ✅ body | ✅ admin | ❌ | ✅ | `tenant_users`, `identities` | Vínculo RH↔user |
| POST | `/internal/app/collaborators/provision` | `index.js:2332` | ✅ body | ✅ admin | ✅ invite | ✅ | IdentityService | Provisionamento acesso |
| POST | `/internal/app/collaborators/:id/provision-access` | `index.js:2333` | ✅ | ✅ admin | ✅ | ✅ | Idem | |
| PATCH | `/internal/app/collaborators/:id/access` | `index.js:3009` | ✅ | ✅ admin | ✅ access | ✅ | `tenant_users`, Auth | Toggle sistema, não RBAC granular |
| GET | `/internal/app/collaborators/access-audit` | `index.js:2701` | ✅ query | ✅ admin | N/A | ✅ | Auth `access_audit_log` | Leitura audit acesso |

### 3.2 Rotas existentes — usuários, identidade, convites (suporte Phase 4)

| Método | Path | Arquivo | tenant_id | RBAC | Audit | Fonte |
|--------|------|---------|-----------|------|-------|-------|
| POST | `/internal/app/users/create` | `index.js:2540` | ✅ | admin | parcial email | Auth + `tenant_users` |
| PATCH | `/internal/app/users/:tenantUserId/access` | `index.js:2893` | ✅ | admin | ❌ | `tenant_users` |
| DELETE | `/internal/app/users/:tenantUserId` | `index.js:2943` | ✅ | admin | ❌ | `tenant_users` |
| POST | `/internal/app/invitations/resend` | `index.js:2580` | ✅ | admin | IdentityService | invitations |
| POST | `/internal/app/invitations/reconcile` | `index.js:2736` | implícito | JWT self | ❌ | invitations |
| POST | `/internal/app/users/password-reset` | `index.js:2638` | ✅ | admin | ✅ | Auth |
| GET | `/internal/app/identities` | `identity/routes.js:24` | ✅ | admin | ❌ | `identities` |
| GET | `/internal/app/identities/:id` | `routes.js:72` | ✅ | admin | ❌ | `identities` |
| GET | `/internal/app/identities/:id/events` | `routes.js:88` | ✅ | admin | read events | `identity_events` |
| POST | `/internal/app/identities/provision` | `routes.js:103` | ✅ | admin | ✅ | IdentityService |
| POST | `/internal/app/identities/:id/repair` | `routes.js:124` | ✅ | admin | ✅ | IdentityService |
| POST | `/internal/app/identities/:id/deactivate` | `routes.js:186` | ✅ | admin | ✅ | IdentityService |
| POST | `/internal/app/identities/:id/reactivate` | `routes.js:206` | ✅ | admin | ✅ | IdentityService |
| POST | `/internal/app/identities/:id/resend-invite` | `routes.js:145` | ✅ | admin | ✅ | IdentityService |
| POST | `/internal/app/identities/:id/reset-password` | `routes.js:166` | ✅ | admin | ✅ | IdentityService |
| POST | `/internal/app/identities/:id/revoke-sessions` | `routes.js:223` | ✅ | admin | ✅ | Auth sessions |
| GET | `/internal/app/identity-health` | `routes.js:47` | ✅ | admin | ❌ | health aggregate |
| POST | `/internal/app/identity-health/evaluate` | `routes.js:58` | ✅ | admin | ✅ | IdentityService |
| GET | `/internal/app/identity/reasons` | `routes.js:239` | ❌ | JWT only | ❌ | estático |

### 3.3 Helpers sem rota HTTP (relevantes Phase 4)

| Helper | Arquivo | Uso atual |
|--------|---------|-----------|
| `persistClinicLogoUrl` | `server/clinicLogoStorage.js:18` | Upload bucket `clinic-logos` — chamado indiretamente; **handler clinic-profile bloqueia `data:`** |
| `collaboratorLinkPolicy` | `server/collaboratorLinkPolicy.js` | Política e-mail único tenant |
| `rhBackfillToSupabase` | `server/lib/rhBackfillToSupabase.js` | CLI ops — não exposto HTTP |

---

## 4. Tabela — endpoints faltantes (Phase 4)

| # | Método | Path | Impacto | Dependência schema | Prioridade sugerida |
|---|--------|------|---------|-------------------|---------------------|
| F1 | GET | `/collaborators` | Lista RH oficial | `collaborators` ✅ | P0 — read first |
| F2 | GET | `/collaborators/:id` | Detalhe RH | `collaborators` ✅ | P0 |
| F3 | POST | `/collaborators` | Criação RH | `collaborators` ✅ | P1 — dual-write |
| F4 | PUT | `/collaborators/:id` | Atualização RH | `collaborators` ✅ | P1 |
| F5 | DELETE | `/collaborators/:id` | Soft delete | `deleted_at` ✅ | P2 |
| F6 | GET | `/collaborators/:id/permissions` | Leitura RBAC | Auth metadata + catálogo 015 | P0 |
| F7 | PUT | `/collaborators/:id/permissions` | Escrita RBAC | Refatorar `access-bundle` | P1 |
| F8 | POST | `/collaborators/:id/apply-role-template` | Defaults por role | `role_permission_defaults` ✅ | P1 |
| F9 | GET | `/collaborators/:id/schedule` | Agenda profissional | **Tabela nova** | P3 — defer |
| F10 | PUT | `/collaborators/:id/schedule` | Escrita agenda | **Tabela nova** | P3 — defer |
| F11 | POST | `/assets/avatar` | Foto colaborador | **Bucket novo** | P2 |
| F12 | POST | `/assets/logo` | Logo clínica | bucket `clinic-logos` ✅ | P2 |
| — | GET | `/debug-user-context` | — | — | ✅ Existe |

**Contagem:** 12 rotas a criar + 1 existente = 13 alvo Phase 4 (exceto contratos/outros).

---

## 5. Dados inconsistentes e dependência IndexedDB

### 5.1 Onde o RH vive hoje

| Camada | Autoridade | Arquivo(s) |
|--------|------------|------------|
| **Ficha RH core** | ❌ IndexedDB | `src/services/collaboratorService.js` |
| **Satélites RH** (docs, education, workHours…) | ❌ IndexedDB | `src/db/schema.js` — 12 coleções |
| **Lista equipe SaaS** | 🔄 API + cache | `tenantCollaboratorService.js` → `users/list` |
| **Permissões runtime** | 🔄 Auth JWT + IDB mirror | `accessService.js` (catálogo local fallback) |
| **Supabase `collaborators`** | Read (RC-02) / backfill ops | `collaboratorRepository.ts` |
| **Agenda work hours** | ❌ IndexedDB | `db.collaboratorWorkHours` |
| **Fotos RH** | ❌ base64 `fotoUrl` IDB | `uploadCollaboratorPhoto` → `data:` URL |

### 5.2 Backend — acesso indireto a IndexedDB

O **server não lê IndexedDB**. Porém:

| Rota / fluxo | Inconsistência |
|--------------|----------------|
| `debug-user-context` | Deriva `agenda_enabled` de **role/permissões**, não de `collaborators.agenda_enabled` nem IDB workHours |
| `access-bundle` | Escreve RBAC em Auth; **não** persiste em `tenant_user_permissions` (tabela inexistente) |
| `users/list` | Retorna `collaborator_id` string — pode divergir de UUID Supabase (`legacy_id` vs `id`) |
| `tenant-context` | `teamRoster` mistura API users + stubs IDB via frontend |
| Ausência CRUD `/collaborators` | Frontend grava IDB **sem** passar pelo backend → **dual SSOT** |

### 5.3 Referências documentadas (IndexedDB-only)

`server/lib/collaboratorIdBackfill.js:25-31`:

- `collaboratorAccess`, `collaboratorWorkHours`, `collaboratorDocuments`, `userPermissions`, `professional_settings / schedule_settings`

---

## 6. Uso correto de Supabase (avaliação)

| Área | Supabase OK? | Detalhe |
|------|--------------|---------|
| Auth / membership | ✅ | `tenant_users`, GoTrue admin API |
| Identities | ✅ | `identities`, `identity_events` |
| Permissões catálogo | ✅ read | `permission_catalog`, `role_permission_defaults` (015) |
| Colaboradores CRUD API | ❌ N/A | Rotas não existem; RLS 019 pronta para client JWT ou service_role + guards app |
| Colaboradores frontend | ⚠️ Parcial | Repository read-primary; write ainda IDB |
| Storage logos | ⚠️ Parcial | Helper existe; rota dedicada ausente; clinic-profile rejeita upload inline |
| Storage avatars | ❌ | Sem bucket/rota |
| Schedule | ❌ | Sem tabela Supabase |
| Audit relacional | ❌ `/internal/app` | `audit_logs` só billing platform |

**service_role:** usado corretamente **apenas no backend**; validação tenant/RBAC é **aplicação** (bypass RLS intencional).

---

## 7. Validações transversais (checklist 1–10)

| # | Critério | Estado atual |
|---|----------|--------------|
| 1 | Endpoints existentes | 30 `/internal/app/*`; Phase 4: 1/14 match |
| 2 | Endpoints faltantes | 12 rotas + refatorações |
| 3 | Dados inconsistentes | Dual SSOT IDB vs Supabase; legacy_id; agenda/permissões derivadas |
| 4 | Dependência IndexedDB indireta | Frontend sim; backend não |
| 5 | Supabase correto | Acesso/identity sim; RH CRUD não |
| 6 | Validação `tenant_id` | ✅ Padrão forte em rotas existentes (`getTenantAdminActorOrThrow`) |
| 7 | RBAC/permissão | ✅ Admin clínica (`owner/admin/master`); ❌ granular por módulo no server RH |
| 8 | Auditoria/log | ⚠️ Parcial — console + Auth metadata; Identity events; **sem** `audit_logs` app |
| 9 | service_role backend only | ✅ Global client; anon só e-mail público |
| 10 | Precisam ser criados | Ver §4 |

---

## 8. Riscos

| ID | Risco | Sev. | Mitigação Phase 4 |
|----|-------|------|-------------------|
| R-P4-01 | Quebra agenda/financeiro ao mudar `collaborator.id` | **Crítica** | Manter `legacy_id`; adapter; **não** migrar agenda nesta fase |
| R-P4-02 | Dual-write IDB ↔ Supabase conflito `updated_at` | Alta | Regras RC-03.1; API como única escrita; read-primary |
| R-P4-03 | RBAC desync Auth vs catálogo Supabase | Alta | `apply-role-template` lê `role_permission_defaults` |
| R-P4-04 | Implementar com staging 522 | **Crítica** | Aguardar recovery (RC-03.9) |
| R-P4-05 | `tenant_user_permissions` inexistente | Alta | Migration Fase 2 antes de cutover relacional |
| R-P4-06 | Fotos base64 vs Storage constraint | Média | `collaborators.foto_url` proíbe `data:` (016) |
| R-P4-07 | `index.js` monolítico (~4200 linhas) | Média | Extrair router `collaborators` sem criar módulo novo desnecessário — **router file** ok |
| R-P4-08 | Zero testes HTTP server | Alta | Suite Vitest/supertest antes de cutover |
| R-P4-09 | FK 018 staging gate | Alta | Manter gate; não promover prod |
| R-P4-10 | Escopo creep (agenda/contrato/financeiro) | Média | Defer F9–F10; out of scope explícito |

---

## 9. Ordem segura de implementação

> **Princípio:** read-first → assets → permissions refactor → write CRUD → schedule last (defer agenda module).

| Fase | Entrega | Quebra RH? |
|------|---------|------------|
| **4.0** | Pré-requisitos: staging OK; migrations satélite; test harness | Não |
| **4.1** | `GET /collaborators`, `GET /collaborators/:id` (read-only, service_role + guards) | **Não** — paralelo ao IDB |
| **4.2** | `GET /collaborators/:id/permissions` + enriquecer `debug-user-context` | **Não** |
| **4.3** | `POST /assets/logo`, `POST /assets/avatar` (Storage) | **Não** — opt-in frontend |
| **4.4** | `POST /collaborators/:id/apply-role-template` | Baixo — admin only |
| **4.5** | `PUT /collaborators/:id/permissions` (evoluir `access-bundle`) | Médio — invalidar JWT cache |
| **4.6** | `POST/PUT/DELETE /collaborators` com **dual-write** IDB mirror (flag) | **Alto** — feature flag |
| **4.7** | Cutover frontend: API oficial write; deprecar IDB write | Planejado RC-05+ |
| **4.8** | `GET/PUT .../schedule` | **Defer** — requer schema + fora escopo agenda |

**Não tocar nesta fase:** prontuário, contrato, financeiro, agenda UI, produção.

---

## 10. Migrations / tabelas necessárias

| Item | Status | Necessário para |
|------|--------|-----------------|
| `public.collaborators` | ✅ 016 + RLS 019 | CRUD F1–F5 |
| `public.permission_catalog` | ✅ 015 | Permissions read |
| `public.role_permission_defaults` | ✅ 015 | `apply-role-template` |
| `public.tenant_user_permissions` | ❌ **Não migrada** (Fase 2 doc) | RBAC relacional; snapshot vs Auth |
| `public.tenant_users.collaborator_uuid` | ✅ 017–018 | Link user↔RH |
| Bucket `clinic-logos` | ✅ 013 | `POST /assets/logo` |
| Bucket `collaborator-photos` (ou similar) | ❌ | `POST /assets/avatar` |
| Tabela schedule / work_hours | ❌ | F9–F10 — **defer** |
| Tabelas satélite RH (documents, education…) | ❌ Fase 2+ | Fora escopo Phase 4 mínimo |

**Recomendação:** Phase 4 **MVP** usa `collaborators` core + Auth metadata + Storage; **não** exige satélites IDB na v1 da API.

---

## 11. Testes que precisam existir

| Suite | Escopo | Estado |
|-------|--------|--------|
| `server/__tests__/collaboratorsApi.test.js` *(novo)* | CRUD + tenant isolation + 401/403 | ❌ Ausente |
| `server/__tests__/permissionsApi.test.js` *(novo)* | GET/PUT permissions, apply-template | ❌ Ausente |
| `server/__tests__/assetsApi.test.js` *(novo)* | avatar/logo upload, anti-data-URI | ❌ Ausente |
| `src/__tests__/identityProvisionFlow.test.js` | Identity routes | ✅ Existe |
| `src/__tests__/collaboratorLinkPolicy.test.js` | Link policy | ✅ Existe |
| `src/__tests__/collaboratorRepository*.test.js` | Repository RH | ✅ 83+ tests |
| `scripts/manual-collaborator-access-guided.mjs` | Smoke manual access | ✅ Existe |
| Contract test OpenAPI | Alinhar `LOVE_ODONTO_V2_MASTER_API.md` | ❌ Pendente |

**Mínimo gate implementação:** supertest contra `:3001` com JWT mock + tenant fixture staging.

---

## 12. Plano — implementar sem quebrar RH

### 12.1 Estratégia de convivência

```
Fase atual (RC-03 encerrado BLOCKED_EXTERNAL)
├── Frontend: IDB write + Supabase read (READ_PRIMARY)
├── API: acesso/identity only
└── Shadow QA: valida paridade IDB ↔ Supabase

Phase 4 implementação
├── API read (4.1–4.2) — frontend opt-in via feature flag
├── API write (4.6) — dual-write: API → Supabase + mirror IDB (transição)
└── Cutover (futuro) — IDB vira cache only (RC-02 já preparado)
```

### 12.2 Regras de ouro

1. **Nunca** remover IDB write até Shadow QA 100% pós-recovery staging  
2. **Sempre** retornar `legacy_id` + UUID `id` nas respostas API  
3. **Reutilizar** `getTenantAdminActorOrThrow` — não inventar auth parallel  
4. **Estender** `access-bundle` → `PUT .../permissions` (não duplicar lógica)  
5. **Soft delete** via `deleted_at` — alinhado migration 016  
6. **Agenda API** — documentar como stub 501 até schema dedicado  
7. **Produção** — guards existentes (`PRODUCTION_SUPABASE_PROJECT_REF`) permanecem  

### 12.3 Consumidores a migrar (ordem)

| Consumer | Hoje | Alvo Phase 4 |
|----------|------|--------------|
| `tenantCollaboratorService.js` | API users/list | GET `/collaborators` |
| `collaboratorService.js` | IDB CRUD | API write (flag) |
| `collaboratorAccessProvisionService.js` | access-bundle | PUT `/permissions` |
| `useCollaboratorAccessForm.js` | access-bundle | + apply-role-template |
| `CollaboratorsPage.jsx` | IDB + photo local | assets/avatar |
| `clinicProfileApi.js` | PUT clinic-profile | POST assets/logo |

---

## 13. Conclusão

### Auditoria Phase 4

## ✅ **READY**

Mapeamento completo: endpoints, gaps, riscos, ordem, schema, testes e plano de convivência documentados.

### Implementação da API oficial Phase 4

## ❌ **NOT READY**

| Bloqueador | Ação |
|------------|------|
| Staging Supabase HTTP 522 | Recovery + retomar RC-04 soak |
| 12 rotas ausentes | Implementar conforme §9 |
| `tenant_user_permissions` ausente | Decidir: Auth-only v1 vs migration Fase 2 |
| Zero testes HTTP server | Criar harness antes de write paths |
| Dual SSOT IDB/Supabase | Flag dual-write + Shadow QA 100% |

### Próximo passo documental

Após recovery staging: **Phase 4.1 — design detalhado** dos handlers `GET /collaborators` (OpenAPI + fixtures), sem alterar frontend até read paths validados.

---

## Apêndice A — Referências cruzadas

| Documento | Relação |
|-----------|---------|
| `docs/reports/RH_CONSOLIDATION_AUDIT.md` | Inventário RH completo |
| `docs/reports/RC-03_FINAL_STATUS.md` | Bloqueio staging |
| `docs/platform/LOVE_ODONTO_V2_MASTER_API.md` | Catálogo API v2 (parcial) |
| `docs/reports/RH_V3_BLUEPRINT.md` | `PATCH .../core` proposto — **não implementado** |
| `supabase/migrations/016_collaborators_core.sql` | Schema RH |
| `supabase/migrations/019_collaborators_rls.sql` | RLS admin/member |

---

*Phase 4 — auditoria only. Zero alterações em código, banco, Supabase, produção. Zero commit.*
