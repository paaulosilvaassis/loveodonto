# LOVE ODONTO — Architectural Consolidation Reality Audit

**Data:** 2026-07-14  
**Tipo:** Auditoria somente leitura (sem alterações funcionais)  
**Escopo:** Repositório local `appgestaoodonto` — `src/`, `server/`, `supabase/`, `docs/`, `tests`  
**Método:** Inspeção direta de código, flags defaults, migrations SQL, rotas Admin API, consumers de UI — não apenas relatórios de phase.

**Commit:** não realizado  
**Único artefato novo:** este relatório (+ link em `docs/reports/README.md`)

---

## 1. Resumo executivo

O plano original permanece correto e vigente:

```text
Supabase é a verdade → API entrega → React exibe → IndexedDB apenas acelera
```

**A realidade do runtime padrão (defaults OFF + production locks) é o inverso operacional:**

```text
IndexedDB é a autoridade imediata da UI
→ Services gravam com withDb / saveDb
→ Toast de sucesso
→ Dual-write remoto (se flag ON) em microtask, opcional e não bloqueante
→ Falha remota preserva IDB (rollback: indexeddb-preserved)
```

**Achados centrais:**

| Pergunta | Resposta honesta |
|----------|------------------|
| Supabase é SSOT hoje? | **Não** no runtime padrão. É SSOT **projetado** e parcialmente implementado atrás de flags. |
| IndexedDB é só cache? | **Não.** Continua banco principal user-facing na maioria dos domínios. |
| Telas usam API oficial? | **Parcialmente.** Membership/usuários SaaS mais avançados; Agenda/CRM/Finance/Pacientes ainda IDB-dominant. |
| Migrations completas? | **Não.** Faltam `appointments`, `financial_*`, `crm_*` e satélites RH. |
| Domain Events / CQRS / Staging 8.x? | **Foundation + contratos + testes** — defaults `false`, zero UI consumer. |
| Pronto para produção (SSOT)? | **Não.** |
| Estamos nos perdendo? | **Parcialmente.** Infrastructure avançou mais rápido que schema + cutover real. |

**Percentual aproximado da arquitetura V3 ativa no runtime padrão:** **~0–2%** (bridges wired, comportamento remoto inerte; IDB + algumas Admin APIs de membership).

---

## 2. Escopo e metodologia

- Leitura de `src/repositories/**`, `src/services/**`, `src/db/**`, `src/domain-events/**`, `server/index.js`, `server/lib/**`, `supabase/migrations/**`, `docs/platform/**`, `src/__tests__/**`.
- Defaults de flags inspecionados no código-fonte (`*Flags.ts`, `domainEventFlags.ts`).
- Consumers UI verificados (imports em `src/pages` / `src/components`).
- Relatórios em `docs/reports/PHASE_*` usados só como índice de fases — **não como prova de ativação**.

### Limitações desta auditoria

- Não houve conexão a staging/produção Supabase real.
- Não foi validado quais migrations já foram aplicadas em projetos remotos.
- Contagens de testes são por arquivos `*.test.js`, não por cases individuais (~2005 cases conhecidos em regressões recentes).

---

## 3. Inventário arquitetural (Fase A)

| Bloco | Arquivos principais | Objetivo | Ativo no runtime? | Flags | Consumidores reais | Status |
|-------|---------------------|----------|-------------------|-------|--------------------|--------|
| Core Auth | `server/core/auth/*`, `AuthContext.jsx` | Sessão / JWT app | Sim (auth) | — | App inteiro | ACTIVE_RUNTIME |
| Core Tenant | `server/core/tenant/*`, `TenantContext.jsx` | Membership / tenant | Sim | — | App + API | ACTIVE_RUNTIME |
| Core RBAC | `server/core/rbac/*`, permission catalog | Papéis/perms | Parcial | — | API admin + UI híbrida | ACTIVE_RUNTIME / MIXED |
| Admin API | `server/index.js`, `server/lib/*` | Orquestração server | Sim (rotas) | — | Services + testes | ACTIVE_RUNTIME (gaps schema) |
| Collaborators Repository | `src/repositories/collaborator/*` | RH remote | Wired, remoto OFF | `RH_*` default false | Bridges RH | WIRED_BUT_FLAGS_OFF |
| Clinic Profile Repository | `src/repositories/clinicProfile/*` | Perfil clínica | Wired, remoto OFF | `CLINIC_PROFILE_*` false | Bridges clinic | WIRED_BUT_FLAGS_OFF |
| Agenda Repository | `src/repositories/agenda/*` | Appointments | Wired, remoto OFF | `AGENDA_*` false | appointmentService | WIRED_BUT_FLAGS_OFF |
| Financial Repository | `src/repositories/financial/*` | AR/AP/financings | Wired, remoto OFF | `FINANCIAL_*` false | receivables/payables/financings | WIRED_BUT_FLAGS_OFF |
| CRM Repository | `src/repositories/crm/*` | Kanban + activity | Wired, remoto OFF | `CRM_*` / `CRM_ACTIVITY_*` false | crmService* | WIRED_BUT_FLAGS_OFF |
| Repository Toolkit | `src/repositories/shared/*` | Pipeline write/cache/guards | Sim como utilitário | — | Adapters | FOUNDATION_ONLY (infra) |
| Write Toolkit | `repositoryV3WritePipeline.ts` | Dual-write IDB→remote | Ativo só com flags | domain write flags | Adapters | ACTIVE_ONLY_WITH_FLAGS |
| Domain Events | `src/domain-events/*` | Event bus/publish | No-op default | 14 flags false | Publishers services (no-op) | FOUNDATION_ONLY / TEST_ONLY |
| Event Facade / Publishers | `*DomainEventPublisher.js` | Emit eventos | No-op | `DOMAIN_EVENTS` | Services | ACTIVE_ONLY_WITH_FLAGS |
| Observability | `domain-events/observability/*` | Metrics/trace | In-memory se ON | flags | Tests / inspect | FOUNDATION_ONLY |
| Consumer Foundation | `domain-events/consumers/*` | Consume events | OFF | CONSUMERS false | Tests | FOUNDATION_ONLY |
| Audit Projection | event audit store | Projection | OFF | PROJECTION false | Tests | FOUNDATION_ONLY |
| Analytics Projections | `projections/*` | Analytics | OFF | ANALYTICS false | Tests | FOUNDATION_ONLY |
| CQRS Read Models | `read-models/*` | Read models | OFF | CQRS_* false | **Nenhuma tela** | FOUNDATION_ONLY / TEST_ONLY |
| Certification 8.5 | `certification/*` | Cert architecture | Local reports | — | Tests / inspect | DOCUMENTATION_ONLY + TEST_ONLY |
| Staging Activation 8.6–8.10 | `staging-activation/*` | Plan/preflight/auth/RO | Local structural | — | Tests | FOUNDATION_ONLY |
| Authorization/Handoff 8.8–8.12 | `authorization*`, `handoff/*` | Pacotes humanos | Local | — | Tests / templates | FOUNDATION_ONLY |
| IDB core | `src/db/index.js`, `idbStorage.js` | Persistência local | **Sim — primary** | — | Quase todo app | ACTIVE_RUNTIME |

Classificação sintética:

```text
ACTIVE_RUNTIME          → Auth, Tenant, IDB, parte Admin API membership/clinic/assets
ACTIVE_ONLY_WITH_FLAGS  → Repositories remote, dual-write, domain events publishers
FOUNDATION_ONLY         → CQRS, consumers, projections, staging packages 8.x
TEST_ONLY / DOCS_ONLY   → Grande volume docs/reports PHASE_6–8 + testes estruturais
ORPHAN / UNKNOWN        → Webhook signature ack-only; alguns endpoints permissions sem UI service
```

---

## 4. Matriz de autoridade por domínio (Fase B)

| Domínio | Tables Supabase (mig) | Admin API | Repository | Read ativo (default) | Write ativo (default) | IDB | Autoridade real atual |
|---------|----------------------|-----------|------------|----------------------|-----------------------|-----|------------------------|
| Clínica / tenant | `tenants`, `tenant_users`, `clinic_profiles` | Sim | clinicProfile | IDB / SaaS hydrate | IDB-first | Sim | **MIXED** (SaaS membership SUPABASE; profile UI IDB) |
| Usuários acesso | `tenant_users`, invitations | Sim | — | API list | API + local ensure | Parcial | **SUPABASE** (membership) + IDB mirror |
| Colaboradores / RH | `collaborators` (+ link uuid) | Parcial | collaborator | IDB | IDB-first | Sim | **INDEXEDDB** (flags OFF) |
| Permissões | catalog global + Auth metadata | Parcial | — | Híbrido | Híbrido | Sim | **MIXED** |
| Agenda | **sem CREATE** | Sim (503 table_missing) | agenda | IDB | IDB-first | Sim | **INDEXEDDB** |
| Pacientes | — | — | — | IDB | IDB | Sim | **INDEXEDDB** |
| Prontuário / clínico | guides mig parcial | — | — | IDB | IDB | Sim | **INDEXEDDB** |
| Contratos | `contract_*` | generated API | — | IDB seed + API | IDB + API | Sim | **MIXED** |
| Financeiro | **sem CREATE financial_*** | Sim (503) | financial | IDB | IDB-first | Sim | **INDEXEDDB** |
| CRM / Kanban | **sem CREATE crm_*** | Sim (503) | crm | IDB | IDB-first | Sim | **INDEXEDDB** |
| Assets | Storage buckets | logo/avatar API | — | Storage/URL | Admin API | URLs | **SUPABASE Storage** (quando usado) |
| Configurações | clinic_profiles | PUT clinic-profile | clinic | Mistura | IDB-first | Sim | **MIXED** |
| Patient Journey / Blocks | — | — | — | IDB | IDB | Sim | **INDEXEDDB** / UNKNOWN |

---

## 5. Auditoria IndexedDB (Fase C)

### Evidência canônica

```1:2:src/db/index.js
 * Persistência principal em IndexedDB (não localStorage) para evitar quota.
```

```4:7:src/repositories/shared/repositoryV3WritePipeline.ts
 * Fluxo dual-write:
 *   legacy IDB (já gravado) → remote write → audit shadow → descarta resposta ao caller
```

### Padrão confirmado (ex.: RH)

- `collaboratorService` → `withDb` push → return → `scheduleCollaboratorDualWrite*`  
- Cabeçalho `collaboratorServiceWriteAdapter.js`: *IDB legado permanece autoridade imediata*

### Domínios onde IDB é autoridade (flags OFF)

RH, Agenda, Financeiro, CRM, Clinic profile UI, Patients, Clinical, Contracts (seed), Inventory, Price base, Team rooms, Dashboard metrics.

### Confirmado ao usuário antes do remoto?

**Sim.** Toast/sucesso após `withDb`; remoto em `queueMicrotask` / pipeline assíncrono.

### Fallback que restaura autoridade IDB?

**Sim.** `repositoryV3Fallback.ts` — preserva IndexedDB; não propaga falha ao caller legado.

### Dados críticos só locais?

**Sim, potencialmente:** pacientes, agenda completa, CRM leads, financeiro, satélites RH (work hours, etc.) quando remoto/schema ausente.

**Veredito:** IndexedDB **ainda é banco principal** no produto padrão.

---

## 6. Auditoria Supabase / migrations (Fase D)

### Migrations app (`supabase/migrations/` — 21 SQL)

Presentes: platform overlap, RLS helpers, tenant_limits, invitations, contracts, clinical guides, identities, clinic_profiles + logos, permission catalog, **collaborators** + RLS, tenant_users collaborator uuid/fk, collaborator-photos.

**Ausentes (API já espera):**

- `appointments`
- `financial_accounts_receivable` / `financial_payables` / `financial_financings`
- `crm_leads` / `crm_pipeline_stages`

**Ausentes (roadmap RH):**

- `collaborator_contacts|addresses|documents|work_hours|financial`
- tabela `clinic_assets` (assets via Storage)

**Gap numeração:** `019` → `024` (sem 020–023 no repo).

**Console migrations:** origem de `tenants` / `tenant_users`.

### Evidência de uso API com tabela ausente

Agenda write → `503 APPOINTMENTS_TABLE_MISSING`; Financial → `FINANCIAL_TABLE_MISSING`; CRM → `CRM_TABLE_MISSING` (handlers em `server/lib/appointmentsApiWrite.js`, `financialApiWrite.js`, `crmApiWrite.js`).

---

## 7. Auditoria Admin API (Fase E)

### Padrões

- `requireAppUser` + `requireTenantMembership*` / admin contexts — padrão maduro em Core.
- Service role no server + filtro `tenant_id` nos handlers.

### Consumo real vs preparado

| Área | Endpoint (exemplos) | Consumidor UI/service | Nota |
|------|---------------------|----------------------|------|
| Tenant context | GET `/internal/app/tenant-context` | TenantContext | Ativo |
| Users/invites | users/*, invitations/* | ConfiguracoesUsuariosPage | Ativo |
| Collaborators access/link | access, link, provision | CollaboratorsPage / recovery | Ativo |
| Clinic profile | PUT clinic-profile | clinicService path | Ativo parcial |
| Appointments | CRUD | appointment adapters | Schema gap |
| Financial | CRUD | financial adapters | Schema gap |
| CRM | CRUD | crm adapters | Schema gap |
| Permissions PUT/GET | collaborators/:id/permissions | **pouco/nenhum service UI** | Preparado |
| Assets logo/avatar | assets/* | parcial | Storage ready |
| Debug context | debug-user-context | non-prod | OK |
| Signature webhook | `/api/signature/webhook` | ack only | STUB |

---

## 8. Auditoria Repository (Fase F)

Fluxo típico flags OFF:

```text
Service → withDb(IDB) → return UI
       ↘ Bridge/Adapter → no-op (flags false)
```

Fluxo flags ON (dual):

```text
Service → withDb(IDB) → schedule dual-write → Admin API → Supabase
         (falha remota → IDB preserved)
```

| Domínio | Wired | Flags OFF authority | Cutover concluído? |
|---------|-------|---------------------|--------------------|
| RH | Sim | IDB | **Preparada** (RC soak docs; default OFF) |
| Clinic | Sim | IDB | **Preparada** |
| Agenda | Sim | IDB | **Preparada** (+ schema missing) |
| Financial | Sim | IDB | **Preparada** (+ schema missing) |
| CRM / Activity | Sim | IDB | **Preparada** (+ schema missing) |

**Evidência staging real Primary Read/Write contra Supabase:** só documentada em reports/scripts QA — **não comprovada como estado default do app**.

---

## 9. Auditoria Feature Flags (Fase G)

### Defaults

- Virtually **todas** as flags Repository V3 / CRM / Domain Events / CQRS: **`false`**.
- Exceção: `RH_ALLOW_SYNTHETIC_STUBS` default **`true`** (compat stubs, não cutover).
- Production locks + project ref prod bloqueiam ativação acidental.

### Estimate

| Camada | Ativa default |
|--------|---------------|
| Wiring (bridges no call path) | Alta |
| Comportamento remoto | ~0% |
| Domain Events / CQRS | 0% |
| Infra docs/tests staging 8.x | 0% runtime produto |

**~98–100% da “nova arquitetura” está desligada no runtime padrão.**

Docs: `docs/platform/REPOSITORY_V3_FLAG_MATRIX.md`, `REPOSITORY_V3_PRODUCTION_GUARDS.md` — alinhados aos defaults false, mas omitem CRM/DE na matriz original completa.

---

## 10. Auditoria das telas (Fase H)

| Tela | Service / padrão | API oficial | Repo | IDB direto | Fonte real (default) |
|------|------------------|-------------|------|------------|----------------------|
| Dados da Equipe | CollaboratorsPage híbrido | Parcial | Yes (off) | Sim | MIXED → IDB RH |
| Usuários SaaS | ConfiguracoesUsuariosPage | Sim | — | ensure local | SUPABASE membership |
| Usuários admin legado | AdminUsuariosPage | Parcial | — | Sim | MIXED |
| Agenda | appointmentService + loadDb UI | Via adapter | Yes off | Sim | INDEXEDDB |
| Dashboard | dashboardMetrics + loadDb | Não | — | Sim | INDEXEDDB |
| Clinic settings | clinicService | Parcial | Yes off | Sim | MIXED/IDB |
| Financeiro | receivables/payables + loadDb | Via adapter | Yes off | Sim | INDEXEDDB |
| CRM | crmService + loadDb | Via adapter | Yes off | Sim | INDEXEDDB |
| Contratos | contractModule + seed | Parcial | — | seed IDB | MIXED |
| Pacientes | patientService | Não | — | Sim | INDEXEDDB |
| Team legado `/equipe` | teamService | Não | — | Sim | INDEXEDDB |

Riscos: `LEGACY_LOCAL_TENANT_ID = 'tenant-1'` em `patientService.js`; seeds/`tenants[0]` em `db/`; `marketingChatService` fallback `tenant-1`.

---

## 11. Auditoria de reconciles (Fase I)

| Função | Auto runtime? | Escreve | Risco | Deveria ser |
|--------|---------------|---------|-------|-------------|
| `reconcileSaasTeamRoster` | Sim — TenantContext | IDB | Merge silencioso Auth↔RH local | Manter até cutover; depois migration/job |
| `syncTeamRosterPermissionStates` | Sim — TenantContext | IDB | Drift perms | Explicit sync |
| `backfillCollaboratorTenantIds` | Sim — TenantContext | IDB | Silent repair | One-shot tool |
| `reconcileCollaboratorAccessState` | CollaboratorsPage background | IDB + link API | Complexidade | Controlled |
| `reconcileCollaboratorTenantLinks` | listTenantCollaborators | API link | Side-effect em list | Explicit action |
| `backfillCollaboratorsPendingAccess` | CollaboratorsPage once/session | API | Semi-auto provision | Manual/admin |
| `ensureSaasUserInLocalDb` | Auth/Tenant/Users | IDB | Necessário p/ UI local | Mirror até cache puro |
| `ensureContractsModuleSeeded` | Contracts pages | IDB seed | Demo data | Remover pós-SSOT |
| Scripts `scripts/*backfill*` | Não (CLI) | Remoto | OK se gated | Migration ops |

**Reconciles ainda participam do fluxo normal** — especialmente no bootstrap de tenant.

---

## 12. Auditoria RLS / multi-tenant (Fase J)

### Positivos

- `collaborators` / `clinic_profiles`: SELECT membro, mutate admin (`019`, `014`).
- `tenant_users`: policies endurecidas + anti-recursion fixes.
- `collaborator-photos` privado.

### Riscos

1. Migration `002` — `FOR ALL` genérico em tabelas com `tenant_id` sem policies posteriores → write amplo a membro.
2. Bucket `clinic-logos` **público** SELECT (`013`).
3. `permission_catalog` SELECT `using (true)` para authenticated (`015`) — intencional, mas amplo.
4. Tabelas futuras agenda/finance/CRM **sem policies dedicadas no repo**.
5. Drift helpers JWT text vs uuid entre app/console migrations.
6. Admin API usa service_role — isolamento depende de filtros corretos nos handlers (padrão presente, mas é linha única crítica).

---

## 13. Auditoria dos testes (Fase K)

| Categoria | Aprox. | Nota |
|-----------|--------|------|
| Arquivos `src/__tests__/*.test.js` | **176** | |
| Cases em regressões recentes | ~2000+ | Passam localmente |
| Contratos/flags/architecture/staging/CQRS | ~metade dos nomes | Estrutural |
| Operacionais de serviço/UI helpers | ~metade | Poucos contra Supabase real |
| E2E Playwright/Cypress | **0** no `package.json` | Ausente |
| Multi-device / staging vivo | Não comprovado por suite CI app | Ausente |

**Os ~2000 testes NÃO comprovam SSOT operacional em produção.** Comprovam sobretudo:

- contratos;
- flags OFF / locks;
- dual-write wiring;
- packages staging/auth imutáveis;
- regressão de services legados.

### Testes do plano original ainda ausentes/não comprovados

- Clínica A ≠ Clínica B (E2E tenant isolation real)
- Refresh/logout multi-device com colaborador SSOT
- Agenda em outro dispositivo via Supabase
- Logos/avatars multi-user sem base64 (parcial via Storage; UI cutover incompleto)
- “Nenhum dado crítico depende de IDB” — **falha hoje**

---

## 14. Domain Events / CQRS (Fase L)

| Componente | Ativo default | Consumer UI | Persistência | Classificação |
|------------|---------------|-------------|--------------|---------------|
| Flags / bus / publishers | Não | Nenhum | In-memory | KEEP_FROZEN |
| Observability | Não | Nenhum | In-memory | KEEP_FROZEN |
| Consumers / Audit projection | Não | Nenhum | In-memory | KEEP_FROZEN / REVISIT_LATER |
| Analytics projections | Não | Nenhum | In-memory | KEEP_FROZEN |
| CQRS read models | Não | Nenhum | In-memory | KEEP_FROZEN |
| Certification / Staging / Auth / Handoff 8.5–8.12 | Não remoto | Templates humanos | In-memory reports | KEEP_FROZEN (processo) |

**Prematuro agora?** **Sim**, relativamente ao gap de schema + cutover SSOT.  
**Remover agora?** **Não** — custo de remoção alto; **congelar** até após P1–P4 do plano corretivo.

Valor atual: documentação de restrições (Stage 1 flags only, no auto-promote) + regressão de segurança de flags.

---

## 15. Comparação com fases originais 0–11 (Fase M)

| Fase | Objetivo (síntese) | Evidência | Status |
|------|--------------------|-----------|--------|
| 0 Fundamentos | Auth/tenant base | Core auth/tenant presente | PARCIAL / CONCLUÍDA (core) |
| 1 Multi-tenant | Isolation | RLS + helpers; gaps | PARCIAL |
| 2 Schema SSOT | Tables oficiais | Collaborators/clinic yes; agenda/CRM/finance **não** | PARCIAL |
| 3 Admin API | API canônica | Extensa; stubs 503 schema | PARCIAL |
| 4 RH repository | Read cutover | Flags OFF; IDB authority | PREPARADA_MAS_NÃO_ATIVA |
| 5 Multi-domain repos | Agenda/finance/clinic | Wired flags OFF | PREPARADA_MAS_NÃO_ATIVA |
| 6 CRM | Kanban/activity | Wired + schema missing | PREPARADA_MAS_NÃO_ATIVA |
| 7 Domain events | Adoption | Publishers no-op | PREPARADA_MAS_NÃO_ATIVA |
| 8 CQRS/staging | Read models + staging gates | Local only; handoff blocked | PREPARADA_MAS_NÃO_ATIVA / DESVIADA (prioridade) |
| 9+ Deploy SSOT | Produção API-only | Não | NÃO_INICIADA / NÃO_COMPROVADA |

---

## 16. Desvios encontrados (Fase N)

### Prioridade

- CQRS/consumers/certificação/handoff **antes** de fechar migrations agenda/CRM/finance e cutover Primary real.
- Staging authorization packages sem dados reais / staging host — structural only.

### Arquitetura

- IDB ainda authority com documentação SSOT contradizendo o runtime (`src/db/index.js` vs `LOVE_ODONTO_V2_MASTER_API.md`).
- Write local antes do remoto mesmo com Toolkit V3.
- Fallbacks silenciosos.
- Telas `loadDb` diretas.

### Escopo

- Volume alto de phases 7–8 e templates enquanto schema P0 falta.
- Múltiplas abstrações sem consumer UI.

### Dívida

- Flags proliferadas; stubs 503; mappers/bridges/reconciles;
- numeração migration gap 020–023;
- endpoints permissions/assets pouco ligados à UI;
- `tenant-1` legado.

---

## 17. Dívida técnica (síntese)

1. SSOT invertido no default path.  
2. Schema remoto incompleto para APIs já escritas.  
3. Reconciles no bootstrap.  
4. Domain Events/CQRS maintenance cost sem ROI de produto.  
5. Testes estruturais ≠ validação multi-device.  
6. RLS genérico 002 + logo público.  
7. Handoff 8.12 bloqueado sem owners reais (processo correto; não desbloqueia SSOT).

---

## 18. Riscos críticos (P0)

| # | Risco | Evidência |
|---|-------|-----------|
| 1 | Perda / divergência de dados clínicos locais vs cloud | IDB-first + remote optional |
| 2 | Tenant leakage se service_role mishandle ou policies fracas em tabelas novas | service_role + 002 FOR ALL |
| 3 | Falso “vazio” agenda (GET 200 + table_missing) | appointmentsApiList |
| 4 | Logos publicamente legíveis | `013_clinic_logos_storage.sql` |
| 5 | Hardcoded `tenant-1` em patients/seeds | patientService / db seed |
| 6 | Operador acredita SSOT já ativo por existência de Repository/CQRS | Flags false + docs phases |

---

## 19. Veredito executivo (Fase O)

1. **Segue o plano original?** Em intenção e docs — **sim**. Em runtime — **desviado**.  
2. **Supabase é fonte oficial hoje?** **Não** (default).  
3. **IndexedDB é só cache?** **Não**.  
4. **Telas consomem API oficial?** **Parcial**.  
5. **Migrations/RLS completas?** **Não**.  
6. **Dados migrados?** **Não comprovado** como cutover padrão.  
7. **Pronto produção SSOT?** **Não**.  
8. **DE/CQRS prematuros?** **Sim**, em relação ao gap de schema/cutover.  
9. **Estamos nos perdendo?** **Parcialmente** — excesso de foundation vs consolidação SSOT.  
10. **Congelar:** Domain Events, CQRS, Staging Stage 1 activation, novas abstrações event-driven.  
11. **Retomar imediatamente:** schema gaps + RLS + authority cutover RH/clinic + remoção gradual IDB authority.  
12. **Próxima fase real:** **Reality → Schema Gap Closure** (não Stage 1 flags).

### Distinção obrigatória

| Estado | Exemplo |
|--------|---------|
| IMPLEMENTADO | Bridges, Admin API handlers, collaborators table, flags machinery |
| PREPARADO | Dual-write pipelines, CRM/finance/agenda API, CQRS packages |
| ATIVO (default) | IDB + Auth/Tenant + membership APIs |
| VALIDADO EM STAGING | Não comprovado neste audit como ambiente real com Primary ON |
| ATIVO EM PRODUÇÃO | Production locks forçam flags OFF — legacy IDB |

---

## 20. Plano corretivo (Fase P)

### P0 — Crítico

| Ação | Domínios/arquivos | Risco | Pré-req | Evidência de conclusão |
|------|-------------------|-------|---------|------------------------|
| Inventariar dados só-IDB e política de backup | `src/db`, patients/agenda/CRM | Alto | — | Export dry-run report |
| Revisar Storage logo público | `013_clinic_logos_storage.sql` | Médio | — | Policy private + audit |
| Eliminar/`quarantine` `tenant-1` paths | `patientService`, `db` seed | Alto | — | Grep zero em paths runtime |
| Documentar GET appointments table_missing → não tratar como lista ok | appointmentsApiList consumers | Médio | — | Client trata meta |

### P1 — Consolidação SSOT

| Ação | Domínio | Evidência |
|------|---------|-----------|
| CREATE + RLS admin-aware `appointments` | Agenda | Migration + policy tests |
| CREATE + RLS `financial_*` | Finance | Migration + 503 some |
| CREATE + RLS `crm_leads` / stages | CRM | Migration |
| Satélites RH mínimos se no cutover | RH | Migrations contacts/hours ou escopo explícito |
| Hardening policies pós-002 | Multi | Audit matrix |

### P2 — Migração de dados

| Ação | Evidência |
|------|-----------|
| Export IDB dry-run por tenant | scripts reports |
| Compare shadow ≥ limiar | QA shadow scripts |
| Apply controlado staging | Logs + rollback |

### P3 — Frontend API-only

| Ação | Evidência |
|------|-----------|
| Remover `loadDb` das pages Agenda/CRM/Finance/Patients | Grep pages limpo |
| Toast só após remote ACK (ou outbox explícito) | UX contract |
| Desligar reconciles auto indesejados | TenantContext slim |

### P4 — Deploy / validação

| Ação | Evidência |
|------|-----------|
| Staging flags ON com schema | Soak report real |
| E2E multi-tenant + multi-device | Novo harness |
| Produção cutover domínio a domínio | Flag matrix applied |

### P5 — Futuro (após SSOT)

| Ação | Evidência |
|------|-----------|
| Descongelar Domain Events Stage 1 | Só pós execution approval + RO verify |
| CQRS/Read Models para leitura real de tela | UI consumer obrigatório |

---

## 21. Novo roadmap recomendado (Fase Q)

```text
Phase 9.0 — Reality Audit (ESTE RELATÓRIO)
Phase 9.1 — Supabase Schema Gap Closure (appointments, financial_*, crm_*)
Phase 9.2 — RLS Hardening + Storage Logo
Phase 9.3 — IndexedDB Export Dry-Run + Critical Data Inventory
Phase 9.4 — Collaborators + Permissions Real Cutover (flags ON staging)
Phase 9.5 — Clinic Profile + Assets Real Cutover
Phase 9.6 — Agenda Real Cutover (schema first)
Phase 9.7 — CRM + Finance Real Cutovers
Phase 9.8 — Patients/Clinical Path Decision (API or explicit local quarantine)
Phase 9.9 — Frontend API-only Enforcement + Reconcile Removal
Phase 9.10 — Staging Soak + Multi-device Validation
Phase 9.11 — Production Domain Rollout
Phase 10.x — Domain Events / CQRS (somente com UI consumer e SSOT estável)
```

**Não** continuar Phase 8.x Stage 1 activation enquanto schema SSOT e authority IDB não forem resolvidos.

---

## 22. Arquivos órfãos / candidatos a freeze (não remover agora)

- `src/domain-events/**` (exceto se usado por publishers no-op — freeze)
- Templates/playbooks CQRS staging 8.6–8.12 (úteis como processo; não runtime)
- Endpoints permissions Admin sem service UI dedicado
- `POST /api/signature/webhook` ack-only
- Relatórios PHASE_7–8 volume alto (manter como histórico)

---

## 23. Migrations ausentes (lista)

1. `appointments` (+ indices tenant/time + RLS)  
2. `financial_accounts_receivable`  
3. `financial_payables`  
4. `financial_financings`  
5. `crm_leads`  
6. `crm_pipeline_stages` (+ activities se modelo exigir)  
7. RH satélites: contacts, addresses, documents, work_hours, collaborator_finance (se cutover)  
8. Policies dedicadas para (1–6) se não cobertas com segurança pelo 002  

---

## 24. Telas não API-only (lista)

- `AgendaPage.jsx`  
- `DashboardPage.jsx`  
- `PatientsPage.jsx`  
- `TeamPage.jsx`  
- Finance pages (`Finance*`)  
- CRM pages (loadDb users + local services)  
- Parts of `CollaboratorsPage.jsx` / `AdminUsuariosPage.jsx`  
- Contracts pages com seed IDB  

---

## 25. Domains ainda IDB-authority (default)

- Collaborators RH (flags OFF)  
- Agenda  
- Financial  
- CRM (+ activity)  
- Clinic profile (UI path)  
- Patients / Clinical  
- Inventory / Price base / Team rooms  
- Dashboard aggregates  

---

## 26. Confirmações finais

- [x] Nenhuma alteração funcional no app/backend  
- [x] Nenhum arquivo de produção alterado **exceto** este relatório e o índice `docs/reports/README.md`  
- [x] Nenhuma migration criada ou executada  
- [x] Banco / Supabase remoto / Storage / env vars / feature flags / IndexedDB **não** alterados  
- [x] Frontend e backend de produto **não** alterados  
- [x] Nenhum commit realizado  
- [x] Nenhuma fase seguinte iniciada automaticamente  

---

## Encerramento

Esta auditoria estabelece a diferença entre **IMPLEMENTADO / PREPARADO / ATIVO**.  
O próximo passo permitido é **aprovação humana do plano corretivo Phase 9.x** — não ativação de Stage 1 nem novas abstrações CQRS.

**Aguardando aprovação formal.**
