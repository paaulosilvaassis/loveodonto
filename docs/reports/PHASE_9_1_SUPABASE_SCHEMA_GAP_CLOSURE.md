# PHASE 9.1 — Supabase Schema Gap Closure Audit + Migration Plan

**Data:** 2026-07-14  
**Tipo:** Auditoria de schema + migrations versionadas **não executadas**  
**Base obrigatória:** [`LOVE_ODONTO_ARCHITECTURAL_CONSOLIDATION_REALITY_AUDIT.md`](./LOVE_ODONTO_ARCHITECTURAL_CONSOLIDATION_REALITY_AUDIT.md) (Phase 9.0)  
**Commit:** não realizado  

---

## 1. Resumo executivo

A Reality Audit (9.0) confirmou gaps críticos: Admin API de Agenda / Financeiro / CRM retorna `*_TABLE_MISSING` porque **não existia `CREATE TABLE`** versionado para essas relações.

Esta fase:

1. Inventariou tabelas esperadas pelo código vs migrations existentes.  
2. Definiu schemas oficiais mínimos alinhados aos contratos Admin API (`*ApiList.js` / `*ApiWrite.js`).  
3. Criou migrations **020–023** (schema + RLS) **sem aplicar**.  
4. Validou contratos via testes estáticos/SQL textuais.  
5. Classificou Prioridade A (clinic/RH) e complementar (patients/contracts) sem inventar satélites não consumidos.

**Respostas de fechamento:**

| Pergunta | Resposta |
|----------|----------|
| Quais schemas existem? | Platform/tenants/membership, `clinic_profiles`, `collaborators` (+ RLS), contracts/guides/invites/identities, Storage assets, catalog de permissões |
| Quais schemas faltavam (críticos)? | `appointments`, `financial_*`, `crm_*` → **agora versionados em 020–022 + RLS 023** |
| Quais migrations prontas para dry-run local? | **020, 021, 022, 023** (após pré-requisitos 001–019/helpers) |
| Quais domínios ainda bloqueados? | Patients/rooms/budgets como FK rígida; satélites RH; payments/parcelas; CRM Wave B (activity); cutover/flags |

**Não foi feito:** execução de migration, alteração remota, cutover, flags, UI, services runtime, Domain Events/CQRS.

---

## 2. Auditoria das migrations existentes

### 2.1 App — `supabase/migrations/` (antes de 9.1)

| Migration | Tabela(s) / objeto | Objetivo | Tenant | RLS | FK | Índices | Triggers | Consumidor real |
|-----------|-------------------|----------|:------:|:---:|:--:|:-------:|:--------:|-----------------|
| 001 | platform_* (console-ish no app root) | Bootstrap platform | parcial | sim | sim | parcial | — | Console/platform |
| 002 | RLS multi-tenant helpers | Isolation base | — | sim | — | — | — | Auth/membership |
| 003 | enforce constraints | Hardening tenant | sim | — | — | — | — | Tenants |
| 004 | `tenant_limits` | Limits SaaS | sim | — | tenants | sim | — | tenantContextApi |
| 005 | invites + `touch_updated_at` | Convites + util | sim | parcial | sim | sim | touch | invitations APIs |
| 006 | `contract_*`, `generated_contracts` | Contratos | sim | sim | tenants | sim | touch | contracts API / IDB mix |
| 007 | `clinical_guides*` | Guias clínicos | sim | sim | tenants | sim | — | Clínico parcial |
| 008 | `identities`, `identity_events` | Identity | sim | sim | — | sim | — | IdentityService |
| 009 | app tenant isolation RLS | Helpers admin/membership | — | sim | — | — | — | Policies 014/019/023 |
| 010 | tenant_users email unique | Unicidade | sim | — | — | uq | — | Membership |
| 011 | `clinic_profiles` | Perfil clínica | sim | (014) | tenants | sim | — | clinicProfileResolver |
| 012 / 012_fix | tenant_users RLS recursion | Fix policies | — | sim | — | — | — | Login/membership |
| 013 | Storage clinic logos | Bucket público | — | storage | — | — | — | Logo upload (**risco público** documentado 9.0) |
| 014 | clinic_profiles RLS | Policies | sim | sim | — | — | — | Client/API |
| 015 | `permission_catalog`, `role_permission_defaults` | Catalog RBAC | global | parcial | — | sim | — | Permissions APIs |
| 016 | `collaborators` | RH core consolidado | sim | (019) | tenants | sim | touch + validate | RH API / backfill |
| 017 / 018 | tenant_users ↔ collaborator uuid | Link Auth/RH | sim | — | collaborators | sim | — | Provisioning |
| 019 | collaborators RLS | Policies RH | sim | sim | — | — | — | Client/API |
| **024** | collaborator photos storage | Bucket privado | — | storage | — | — | — | Avatar API |

**Gap de numeração histórico:** `019` → `024` (slots **020–023** estavam vazios — usados nesta phase).

### 2.2 Console — `console/supabase/migrations/`

Schema platform billing/onboarding/RLS console. **Fora do gap operacional Agenda/Finance/CRM do app.** Não alterado.

### 2.3 Achados

| Achado | Detalhe |
|--------|---------|
| Duplicatas / fixes | `012` + `012_fix_*` (compat recursion) |
| Políticas separadas | Padrão: schema N → RLS N+3 (ex.: 011/014, 016/019, **020–022/023**) |
| Rollback | Manual em comentários; sem down migrations automatizadas |
| Tabelas só em docs | Satélites `collaborator_contacts` etc. — **sem CREATE e sem `.from()` no runtime** |
| `clinic_assets` | **UNUSED** — assets = Storage (`013`/`024`), não tabela metadata |
| Testes de migration SQL | Quase ausentes até 9.1 (agora `phase91SchemaGapMigrations.test.js`) |

---

## 3. Inventário de tabelas esperadas

| Domínio | Tabela esperada | Arquivo consumidor | Operações | Migration existente | Status |
|---------|-----------------|--------------------|-----------|--------------------|--------|
| Agenda | `appointments` | `appointmentsApiList/Write.js`, agenda repository | CRUD + cancel | **020** (novo) | **EXISTS_COMPLETE** (arquivo; não aplicado) |
| Financeiro | `financial_accounts_receivable` | `financialApiList/Write.js` | CRUD (delete hard) | **021** | **EXISTS_COMPLETE** (arquivo) |
| Financeiro | `financial_payables` | idem | CRUD | **021** | **EXISTS_COMPLETE** (arquivo) |
| Financeiro | `financial_financings` | idem | CRUD | **021** | **EXISTS_COMPLETE** (arquivo) |
| CRM | `crm_leads` | `crmApiList/Write.js` | CRUD soft | **022** | **EXISTS_COMPLETE** (arquivo) |
| CRM | `crm_pipeline_stages` | idem | CRUD soft | **022** | **EXISTS_COMPLETE** (arquivo) |
| Clínica | `clinic_profiles` | `clinicProfileResolver.js` | R/W | 011 + 014 | **EXISTS_INCOMPLETE** (sem `deleted_at` / audit by) |
| RH | `collaborators` | collaborators APIs, backfill | R/W | 016 + 019 | **EXISTS_COMPLETE** (core) |
| RH satélites | `collaborator_contacts` etc. | — | — | nenhuma | **UNUSED** / não criar |
| Permissões | `collaborator_permissions` | — | — | nenhuma | **NAME_MISMATCH** — runtime usa `permission_catalog` + Auth/tenant_users |
| Permissões | `permission_catalog` | permissions APIs | R | 015 | **EXISTS_COMPLETE** |
| Acesso | `tenant_users` | membership / provision | R/W | 001/008/010/017/018 | **EXISTS_COMPLETE** |
| Assets | `clinic_assets` | — | — | nenhuma | **UNUSED** — Storage |
| Patients | `patients` | services IDB | local | nenhuma | **LEGACY_ONLY** / **MISSING** |
| Contracts | `contract_templates` etc. | 006 + API generated | R/W | 006 | **EXISTS_INCOMPLETE** (parcial vs UI IDB) |
| Rooms | `rooms` | agenda refs text | — | nenhuma | **LEGACY_ONLY** |
| CRM Wave B | activity/timeline tables | flags OFF | — | nenhuma | **OUT_OF_SCOPE** 9.1 |

Status pós-9.1 (repositório): gaps A/B críticos **VERSIONADOS**. Remoto continua sem tabelas até dry-run/autorização.

---

## 4. Clinic / Collaborators / Permissions

### Plano original vs implementação vs recomendado

| Conceito | Plano original (docs satélites) | Implementação atual | Modelo recomendado (9.1) |
|----------|----------------------------------|---------------------|---------------------------|
| RH | Várias tabelas (`contacts`, `addresses`, …) | **Uma** `collaborators` wide row (016) | Manter consolidado; satélites só se UI/API provar consumo |
| Permissões colaborador | Tabela `collaborator_permissions` | Catalog global + `tenant_users` / metadata Auth | Sem nova tabela nesta phase |
| Clinic assets | Tabela `clinic_assets` | Storage buckets + `foto_url` / `logo_url` | Sem tabela metadata até contrato Admin exigir |
| Clinic profile | `clinic_profiles` 1:1 tenant | 011 (sem soft delete) | Aceitar exceção; soft delete opcional fase futura |

**Prioridade A readiness:** schema suficiente para cutover futuro **após** dry-run + flags — **não** bloqueado por satélites.

---

## 5. Agenda

Schema oficial em `020_app_appointments.sql`, colunas alinhadas a `APPOINTMENT_WRITE_SELECT` (+ `deleted_at` / audit by).

| Item | Decisão |
|------|---------|
| Nomenclatura | snake_case |
| `legacy_id` | NOT NULL + unique parcial `(tenant_id, legacy_id) WHERE deleted_at IS NULL` |
| patient / professional / room / lead | `text` nullable — **sem FK** (patients/rooms ainda IDB) |
| status | CHECK alinhado a `AppointmentStatus` (`agendaTypes.ts`) |
| slot_capacity | CHECK `1|2` |
| Conflito horário | **Sem** exclusion constraint nesta phase (requer modelo de intervalo + regra de negócio) — índice `(tenant_id, professional_id, date)` justifica queries |
| Soft delete | `deleted_at`; list/write filtram `.is('deleted_at', null)` |
| Patient Journey / Blocks | **Não migrados** |

**LIST vs WRITE:** `APPOINTMENTS_LIST_SELECT` omite `insurance`, `is_return`, `cancel_reason`; colunas existem no schema para escrita.

---

## 6. Financeiro

Schema oficial em `021_app_financial_core.sql`.

| Tabela | Conteúdo mínimo |
|--------|-----------------|
| Receivables | identifiers, tenant, patient/budget/contract text refs, amounts, due, status, timestamps, soft delete column |
| Payables | supplier/category text, amounts, due, status, recurrence |
| Financings | patient/budget/contract text, totals, installments_count, approval_status |

**Exceções justificadas:**

- Admin API usa **hard `.delete()`** (não soft) — coluna `deleted_at` preparada para futuro; list atual **não** filtra soft delete.  
- Sem tabelas de payments / parcelas / DRE / analytics (não exigidas pelo write core).  
- Sem CHECK rígido de status (legado IDB pode variar strings).

---

## 7. CRM

Schema oficial em `022_app_crm_kanban_core.sql`.

| Tabela | Notas |
|--------|-------|
| `crm_pipeline_stages` | Coluna **`"order"`** (reserved) — contrato API; unique `(tenant_id, key)` |
| `crm_leads` | `stage_key` text **sem FK** para stages (staged constraint futura pós-backfill) |
| Soft delete | Usado pelo write CRM |
| Fora de escopo | follow-ups, tasks, timeline, WhatsApp, Marketing Chat, IA |

---

## 8. Patients / Contracts gap audit

| Domínio | Classificação | Blocker futuro |
|---------|---------------|----------------|
| patients | **MISSING** / **LEGACY_IDB** | Sem tabela; FKs appointments/finance/CRM ficam text |
| patient contacts/documents | **OUT_OF_SCOPE_FOR_9_1** | Sem consumo Admin SSOT |
| budgets | **LEGACY_IDB** | Refs text em receivables/financings |
| contracts templates/blocks/generated | **PARTIAL** (006) | Runtime ainda misturado IDB |
| contract signatures / consent | **PARTIAL** / **OUT_OF_SCOPE_FOR_9_1** | Auditar fase específica |
| clinical records / guides | **PARTIAL** (007) | Não é blocker Agenda/Finance/CRM schema file |

---

## 9. Foreign keys

| Tabela | Campo | Referência | On delete | Tenant safety | Índice |
|--------|-------|------------|-----------|---------------|--------|
| appointments | tenant_id | tenants(id) | cascade | FK + chk anti tenant-1 | yes |
| appointments | patient_id | — (staged) | — | text opaco | partial |
| appointments | professional_id | — (staged → collaborators) | — | text | partial |
| appointments | room_id | — | — | text | — |
| financial_* | tenant_id | tenants(id) | cascade | FK | yes |
| financial_* | patient/budget/contract/supplier | — (staged) | — | text | parcial |
| crm_* | tenant_id | tenants(id) | cascade | FK | yes |
| crm_leads | stage_key | stages.key (**NOT VALID** futuro) | — | logical only | yes |
| collaborators | tenant_id | tenants(id) | cascade | FK | yes |
| clinic_profiles | tenant_id | tenants(id) | cascade | unique 1:1 | yes |

**Regra:** FKs rígidas a patients/rooms/budgets **propositadamente adiadas** para não inviabilizar backfill do legado.

---

## 10. RLS contracts

Padrão (023), espelhando 019:

| Tabela | SELECT | INSERT/UPDATE/DELETE | Membership | RBAC |
|--------|--------|---------------------------|------------|------|
| appointments | membership + `deleted_at is null` | tenant admin (`app_user_is_tenant_admin`) | `app_user_can_access_tenant` | admin rewrite |
| financial_* | idem | admin | idem | admin |
| crm_* | idem | admin | idem | admin |
| collaborators | já 019 | 019 | 019 | 019 |
| clinic_profiles | já 014 | 014 | 014 | 014 |

**Service role:** Admin API usa service role (**bypassa RLS**). Guards obrigatórios no backend: Core Tenant + forbidden `tenant-1` + membership. RLS **não** é substituída pelo middleware — protege acesso PostgREST/client.

Policies **não foram executadas** no banco.

---

## 11. Índices

| Tabela | Índice | Query que justifica | Risco sem índice |
|--------|--------|--------------------|------------------|
| appointments | `(tenant_id, date)` | list por período Agenda | seq scan multi-dia |
| appointments | `(tenant_id, professional_id, date)` | grade profissional | conflito/latência |
| appointments | `(tenant_id, status)` | filtros status | scans |
| appointments | `(tenant_id, legacy_id)` unique partial | upsert dual-write | duplicatas |
| far | `(tenant_id, due_date)` / status / patient | list receivables | latência caixa |
| fpay | due_date / status | list payables | idem |
| ffin | status / patient | list financings | idem |
| crm_leads | `(tenant_id, stage_key)` | Kanban por coluna | full scan |
| crm_leads | assigned_to / updated_at | filtros donos | latência |
| cps | `(tenant_id, "order")` | ordenar board | sort custo |

Sem índices “futuros” de analytics.

---

## 12. Migrations criadas

| Arquivo | Conteúdo |
|---------|----------|
| `supabase/migrations/020_app_appointments.sql` | Tabela appointments + índices + trigger |
| `supabase/migrations/021_app_financial_core.sql` | receivables / payables / financings |
| `supabase/migrations/022_app_crm_kanban_core.sql` | crm_leads + crm_pipeline_stages |
| `supabase/migrations/023_app_appointments_financial_crm_rls.sql` | enable RLS + policies |

Nenhuma migration anterior foi reescrita destrutivamente.

---

## 13. Migrations modificadas

**Nenhuma.** (024 Storage permanece intacta; ordem lexical 020→024 preservada.)

---

## 14. Testes criados

`src/__tests__/phase91SchemaGapMigrations.test.js` — 11 casos:

- existência 020–023  
- CREATE das 6 tabelas gap  
- colunas vs SELECT Admin API  
- RLS + helpers  
- sem truncate / seed produção / project ref  
- snake_case DDL  
- rollback documentado  
- numeração única 020–023  

**Resultado:** `11 passed` (vitest file isolado).

---

## 15. Resultado da regressão

| Suite | Resultado |
|-------|-----------|
| `src/__tests__/phase91SchemaGapMigrations.test.js` | **11 pass** |
| Suite completa do repositório | **não reexecutada integralmente nesta fase** (escopo documental + contractual migrations) |

> Teste textual **não** prova apply bem-sucedido em Postgres real.

---

## 16. Matriz de readiness

| Domínio | Schema | Migration | RLS | Índices | API compatível | Pronto para dry-run |
|---------|-------:|----------:|----:|--------:|---------------:|---------------------|
| clinic | EXISTS_INCOMPLETE | 011/014 | sim | sim | sim | **PARTIAL** (exceções audit) |
| collaborators | EXISTS_COMPLETE core | 016/019 | sim | sim | parcial flags | **READY_FOR_LOCAL_DRY_RUN** (já existia) |
| permissions | catalog OK | 015 | parcial | sim | sim | **PARTIAL** (sem tabela collaborator_permissions) |
| agenda | novo COMPLETE file | 020+023 | file | sim | selects OK | **READY_FOR_LOCAL_DRY_RUN** |
| finance | novo COMPLETE file | 021+023 | file | sim | selects OK | **READY_FOR_LOCAL_DRY_RUN** |
| CRM | novo COMPLETE file | 022+023 | file | sim | selects OK | **READY_FOR_LOCAL_DRY_RUN** |
| patients | MISSING | — | — | — | — | **BLOCKED** / **OUT_OF_SCOPE** |
| contracts | PARTIAL | 006 | sim | sim | mix | **PARTIAL** |

---

## 17. Gaps ainda abertos

1. Apply real (local → staging) **não autorizado** nesta phase.  
2. FK patients/collaborators/rooms/budgets.  
3. Exclusion / anti-overlap appointments.  
4. Soft delete financeiro vs hard delete API.  
5. Satélites RH / clinic_assets / collaborator_permissions (se produto exigir).  
6. CRM Wave B activity tables.  
7. Payments / installments tables.  
8. Data migration / backfill IDB → Supabase.  
9. LIST appointments sem insurance/is_return (gap API menor).  
10. Domain Events/CQRS — **congelados** (não desbloquear via schema).

---

## 18. Riscos

| Risco | Severidade | Mitigação |
|-------|------------|-----------|
| Status CHECK appointments rejeita status legado sujo | Média | Sanitizar no export IDB antes do apply; ou relaxar CHECK em validation mig |
| Hard delete financeiro vs `deleted_at` | Baixa | Documentado; alinhar API na fase write hygiene |
| RLS admin-only write vs perms granulares Agenda | Média | Revisar policies com RBAC funcional antes de client directo |
| Ordem apply: 023 depende de 020–022 + helpers 009 | Alta se dry-run invertido | Plano M sequencial |
| Confundir “arquivo existe” com “SSOT ativo” | Alta | Flags OFF; IDB ainda authority (9.0) |

---

## 19. Plano de dry-run local (documentação only — **não executar**)

```text
1. Local database (Docker / supabase start) — sob autorização
2. schema apply: supabase db reset OU migration up até 023
3. migration tests: vitest phase91 + smoke SQL \d+ tables
4. seed sintético: tenants de teste (nunca prod ref / tenant-1)
5. constraints: insert inválido status / legacy_id vazio deve falhar
6. RLS tests: role authenticated membership vs admin vs anon
7. rollback review: drop tables 022→020 na ordem documentada
8. staging authorization: pacote humano separado (não Stage 1 CQRS)
```

Comandos **somente como referência documental** (não correr nesta phase):

```bash
# DOCUMENTAÇÃO — NÃO EXECUTAR SEM APROVAÇÃO
# npx supabase db reset
# npx supabase migration list
# npx vitest run src/__tests__/phase91SchemaGapMigrations.test.js
```

---

## 20. Recomendação para Phase 9.2

**Phase 9.2 — Local Schema Dry-Run + Constraint Validation** (autorização explícita):

1. Subir DB local isolado.  
2. Aplicar 020–023.  
3. Testes SQL reais (constraints, RLS com JWTs de fixture).  
4. Não tocar staging/prod.  
5. Não ligar flags de read/write cutover.  
6. Em paralelo documental: plano de **export IDB sintético** (sem PII prod) para Phase 9.3.  

**Não** retomar Domain Events / CQRS Staging 8.x até schema + cutover SSOT mínimos existirem.

---

## 21. Confirmações finais

| Item | Status |
|------|--------|
| Nenhuma migration executada | **Confirmado** |
| Banco local/remoto não alterado por esta phase | **Confirmado** |
| Supabase remoto não alterado | **Confirmado** |
| Storage não alterado | **Confirmado** (024 intacto; sem apply) |
| Produção não alterada | **Confirmado** |
| IndexedDB preservado | **Confirmado** |
| Flags não alteradas | **Confirmado** |
| Frontend não alterado | **Confirmado** |
| Runtime backend não alterado | **Confirmado** (só migrations/docs/tests) |
| Domain Events/CQRS congelados | **Confirmado** |
| Commit não realizado | **Confirmado** |

---

**Phase 9.1 encerrada.** Aguardando aprovação humana antes de dry-run (9.2) ou qualquer apply.
