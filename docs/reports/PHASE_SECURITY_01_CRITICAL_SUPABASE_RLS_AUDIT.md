# PHASE_SECURITY_01 / 01B — CRITICAL SUPABASE RLS AUDIT (sem Advisors MCP)

**Project:** `amor-odonto-prod`  
**Ref:** `uoepkwhqztmsjnzirpev`  
**Host:** `uoepkwhqztmsjnzirpev.supabase.co`  
**Method:** READ-ONLY via PostgREST + Storage API (service_role / anon)  
**Advisors MCP:** indisponíveis  
**Management SQL (`pg_class` / `pg_policies` / `role_table_grants`):** **indisponível** — `SUPABASE_ACCESS_TOKEN` / `DATABASE_URL` / `psql` ausentes  
**Production mutations:** **NONE**  
**Gate:** `CRITICAL_EXPOSURE_REQUIRES_IMMEDIATE_APPROVAL`

---

## 0. Limite metodológico (honesto)

Não foi possível executar:

```sql
SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity, ...
FROM pg_class ...
```

nem listar `information_schema.role_table_grants` / `pg_policies` em produção.

Inventário abaixo cobre **todas as tabelas `public` expostas no schema cache PostgREST** (OpenAPI service_role) + probes comportamentais anon vs service_role.

`relrowsecurity` é **inferido** onde o comportamento diverge do esperado com RLS+policies do repositório.

Para fechar o inventário 100% de `public` (incluindo tabelas não expostas à API), é necessário um dos canais:

- `SUPABASE_ACCESS_TOKEN` → Management API `POST /v1/projects/{ref}/database/query`
- ou `DATABASE_URL` read-only + `psql`

---

## 1. Tables without RLS (inferidas / confirmadas comportamentalmente)

### CRITICAL — leitura anon com mesmas linhas que service_role

| table | anon SELECT | service count | Interpretação |
|-------|-------------|---------------|---------------|
| `platform_invoices` | **200/206**, range `*/1` | `*/1` | **RLS ausente ou ineficaz** — anon lê billing SaaS |
| `platform_subscriptions` | **200/206**, range `*/1` | `*/1` | idem |
| `platform_billing_events` | **200/206**, range `*/1` | `*/1` | idem (colunas: id, tenant_id, invoice_id, event_type, message, …) |
| `platform_billing_alerts` | 200, `*/0` | `*/0` | vazia; **mesma superfície** (provável sem RLS efetivo) |

**Evidência forte:** outras tabelas com policies que chamam `has_platform_permission(...)` retornam `42501 permission denied for function has_platform_permission` para anon.  
Billing **não** falha assim e devolve linhas → policies de `015_platform_billing_saas.sql` **não estão em vigor** (RLS off e/ou policies ausentes).

**Root cause provável (repo):**  
`console/supabase/migrations/016_platform_billing_tenant_columns_and_backfill.sql` faz `CREATE TABLE IF NOT EXISTS` das tabelas `platform_*` **sem** `ENABLE ROW LEVEL SECURITY` nem policies. Se 016 criou as tabelas sem a seção RLS de 015 ter sido aplicada/reaplicada, o alerta “Tabela de acesso público / RLS desativado” casa exatamente.

### Comportamento compatível com RLS ON (não CRITICAL por dado vazio ao anon)

| table | anon | service | Nota |
|-------|------|---------|------|
| `clinic_profiles` | 200 `*/0` | 206 `*/1` | anon não vê linha; isolamento aparente |
| `permission_catalog` | 200 `*/0` | 206 `*/184` | catalog existe; anon vazio |
| `role_permission_defaults` | 200 `*/0` | 206 `*/175` | idem |

### Anon DENIED (função/policy/grant) — não “aberto”

`audit_logs`, `collaborators`, `feature_flags`, `identities`, `identity_events`, `invitations`, `platform_admin_users`, `platform_*` roles/permissions, `support_*`, `system_health_checks`, `tenant_*` (exceto billing acima), `tenant_users`, `tenants` → **401** com `42501` (função ou table permission).

---

## 2. Anon exposed tables

**Leitura confirmada (anon key JWT role=anon, sem login):**

1. `platform_invoices` — **dados presentes** (amount_cents, tenant_id, status, due_date, …)  
2. `platform_subscriptions` — **dados presentes** (plan_code, status, trial/period dates, …)  
3. `platform_billing_events` — **dados presentes** (tenant_id, event_type, message, …)  
4. `platform_billing_alerts` — SELECT ok (0 rows)  
5. `clinic_profiles` — SELECT ok (0 rows para anon)  
6. `permission_catalog` — SELECT ok (0 rows para anon)  
7. `role_permission_defaults` — SELECT ok (0 rows para anon)

**Nenhuma PII de paciente** nestas tabelas; há **dados comerciais/SaaS sensíveis** (tenant_id, valores, status de cobrança).

---

## 3. Authenticated exposed tables

Não foi possível obter JWT de usuário autenticado nesta sessão (sem criar sessão/login).  
Classificação authenticated: **UNKNOWN (não testado ao vivo)**.  
Pelo código, browser usa anon key + user JWT após login (`src/lib/supabaseClients.js`).

---

## 4. Write exposed tables

Não executado INSERT/UPDATE/DELETE (HARD STOP).  
Inferência: PostgREST expõe paths; escrita anon **não validada**.  
Correção proposta inclui `REVOKE INSERT/UPDATE/DELETE` de `anon`/`PUBLIC` nas tabelas billing.

---

## 5. Sensitive tables affected

| Domínio | Tabelas | Afetado? |
|---------|---------|----------|
| Billing SaaS | `platform_invoices`, `platform_subscriptions`, `platform_billing_events`, `platform_billing_alerts` | **SIM — CRITICAL** |
| Tenants / membership | `tenants`, `tenant_users` | anon denied |
| Collaborators | `collaborators` | anon denied |
| Feature flags | `feature_flags` | anon denied |
| Clinic profiles | `clinic_profiles` | SELECT surface; rows filtradas ao anon |
| Patients / clinical / appointments / financial clinical | `patients`, `app_patients`, `appointments`, … | **ausentes do schema cache PostgREST** |
| Contracts V2 / signatures / evidence | `app_contracts`, `app_signature_*`, … | **ausentes** (não existem em prod API) |
| Storage | `clinic-logos` (public), `email-assets` (public) | ver § Storage |

---

## 6. Cross-tenant findings

- Billing anon: lê o **mesmo** conjunto que service_role (count idêntico) → **sem isolamento efetivo para anon**.  
- Policies pretendidas em 015 usam `app_current_tenant_id()` / `has_platform_permission` — **não observadas** no comportamento atual.  
- Não foi possível auditar texto `USING (true)` via `pg_policies` (sem SQL catalog).  
- Storage: anon consegue **listar** prefixo `clinic-logos/` e ver pasta = `tenant_id` UUID do piloto.

---

## 7. Contracts / signature findings

| table | Presente em prod (PostgREST)? | RLS? | anon? | Conclusão |
|-------|-------------------------------|------|-------|-----------|
| `app_signature_envelopes` | **NÃO** (404 schema cache) | n/a | n/a | Contracts V2 **não deployado** em prod |
| `app_signature_signers` | NÃO | n/a | n/a | |
| `app_signature_sessions` | NÃO | n/a | n/a | |
| `app_contract_packages` | NÃO | n/a | n/a | |
| `app_contracts` / versions / files / ledger | NÃO | n/a | n/a | |
| `app_package_manifests` (036) | NÃO | n/a | n/a | esperado |

**036 dependency:** migration `036_app_package_manifest_foundation.sql` referencia FKs para `app_contract_packages`, `app_contracts`, `app_contract_versions`, `app_signature_envelopes`, `app_signature_signers`.  
Em produção essas tabelas **não existem** no schema exposto → **036 não pode ser aplicada com segurança/sucesso** até foundation 028–034 (+ RLS 029) existir e estar auditada.

**Consumo atual de contratos:** operacional IndexedDB / Railway paths; não PostgREST Contracts V2 em prod.

---

## 8. Storage findings

| bucket | public | anon list | Nota |
|--------|--------|-----------|------|
| `clinic-logos` | **true** | **200**, 1 pasta (`tenant_id`) | Logo pública por design; **listar tenant UUID** é vazamento de metadado |
| `email-assets` | **true** | 200, 0 objects | |

Buckets privados de contracts/signatures/evidence: **não encontrados** (Contracts V2 storage não presente).

---

## 9. Secrets exposure

| Item | Resultado |
|------|-----------|
| `SUPABASE_SERVICE_ROLE_KEY` em `src/` / `public/` tracked | **NOT_EXPOSED** |
| `PLATFORM_API_KEY` hardcoded tracked | **NOT_EXPOSED** |
| `server/.env` / `.env.local` | gitignored |
| `dist/assets/supabaseClients-*.js` | contém JWT **role=anon** (esperado em bundle Vite) — **NOT_EXPOSED** (service_role) |
| Teste com assign literal de service role | apenas testes/placeholders |

---

## 10. Consumer classification (tabelas problemáticas)

| Table | Consumidor principal | Classe |
|-------|----------------------|--------|
| `platform_invoices` / `platform_subscriptions` / billing_* | `server/platformBillingService.js` (service_role) | **RAILWAY_SERVICE_ROLE** |
| Console billing UI | via Admin API / service_role | **PLATFORM_CONSOLE** (indireto) |
| Browser direto nessas tabelas | **não deveria** | hoje: **BROWSER_DIRECT possível via anon** (bug) |
| `clinic_profiles` | app + sync tenant | **BROWSER_DIRECT** (authed) + backend |
| `clinic-logos` | browser público | **BROWSER_DIRECT** (intencional public read) |

---

## 11. Severity

**CRITICAL** — anon consegue ler faturas/assinaturas/eventos de billing SaaS de produção sem autenticação.

**HIGH** — storage public lista `tenant_id` em `clinic-logos`.  
**MEDIUM** — inventário `pg_class` completo incompleto (falta canal SQL).  
**LOW** — OpenAPI restrito a service_role (hardening parcial).

---

## 12. Root cause

1. **Alerta Supabase “RLS desativado”** alinha-se às tabelas `platform_billing_*` / `platform_invoices` / `platform_subscriptions` com SELECT anon efetivo.  
2. Causa mais provável: tabelas criadas/recriadas por **016 sem reaplicar ENABLE RLS + policies de 015**.  
3. Grants a `anon`/`PUBLIC` para SELECT permanecem (inferidos pelo sucesso PostgREST).

---

## 13. Immediate remediation proposed (SQL — **NÃO EXECUTAR**)

```sql
-- PROPOSTA ONLY — NÃO APLICAR SEM APROVAÇÃO HUMANA
-- Alvo: billing SaaS platform_* em amor-odonto-prod

begin;

alter table public.platform_subscriptions enable row level security;
alter table public.platform_invoices enable row level security;
alter table public.platform_billing_events enable row level security;
alter table public.platform_billing_alerts enable row level security;

-- Opcional endurecimento:
-- alter table public.platform_subscriptions force row level security;
-- (idem demais)

revoke all on table public.platform_subscriptions from anon, authenticated;
revoke all on table public.platform_invoices from anon, authenticated;
revoke all on table public.platform_billing_events from anon, authenticated;
revoke all on table public.platform_billing_alerts from anon, authenticated;

-- Re-grant mínimo: authenticated SELECT sob policy; escrita só service_role/backend
grant select on table public.platform_subscriptions to authenticated;
grant select on table public.platform_invoices to authenticated;
grant select on table public.platform_billing_events to authenticated;
grant select on table public.platform_billing_alerts to authenticated;

drop policy if exists "platform billing subscriptions read" on public.platform_subscriptions;
create policy "platform billing subscriptions read" on public.platform_subscriptions
  for select to authenticated
  using (
    tenant_id = public.app_current_tenant_id()
    or public.has_platform_permission('billing.read')
  );

drop policy if exists "platform billing invoices read" on public.platform_invoices;
create policy "platform billing invoices read" on public.platform_invoices
  for select to authenticated
  using (
    tenant_id = public.app_current_tenant_id()
    or public.has_platform_permission('billing.read')
  );

drop policy if exists "platform billing events read" on public.platform_billing_events;
create policy "platform billing events read" on public.platform_billing_events
  for select to authenticated
  using (public.has_platform_permission('billing.read'));

drop policy if exists "platform billing alerts read" on public.platform_billing_alerts;
create policy "platform billing alerts read" on public.platform_billing_alerts
  for select to authenticated
  using (public.has_platform_permission('billing.read'));

commit;
```

**Backend-only recomendado para writes** (já é o padrão via `server/platformBillingService.js` + service_role).

**Storage (separado, menor prioridade):** revisar policy de list em `clinic-logos` para não permitir listagem anônima de prefixes de tenant (manter GET público do objeto logo se necessário).

---

## 14. Impacto funcional da correção

| Área | Risco se aplicar proposta |
|------|---------------------------|
| Login / tenant context | Baixo (não mexe em `tenants`/`tenant_users`) |
| Dashboard clínico | Baixo |
| Pacientes / agenda / orçamentos / financeiro clínico | N/A (tabelas ausentes na API) |
| Contratos / assinatura V2 | N/A (ausentes) |
| Clinic logo | Intocado se só billing for corrigido |
| Feature flags | Intocado |
| Console billing / Railway Admin API | **Deve continuar** via service_role — **validar** após fix |
| App browser lendo billing direto | Quebra se existir (não é o path correto; server deve ser SSOT) |

---

## 15. Relação com 10.21T / 036

| Campo | Valor |
|-------|-------|
| **036 dependency** | **BLOCKED** — foundation Contracts V2 ausente em prod + billing CRITICAL aberto |
| **PACKAGE_MANIFEST_SECURITY_CLEARANCE** | **BLOCKED** |
| Motivo | (1) exposição CRITICAL billing; (2) `app_signature_*` / `app_contract_*` inexistentes — 036 não tem base; (3) inventário `pg_class` completo incompleto sem SQL catalog |

**CLEARED** só após:

1. Fix billing RLS/REVOKEs aprovado e verificado (anon SELECT → deny/empty);  
2. Canal SQL catalog confirmar `relrowsecurity=true` nas tabelas sensíveis;  
3. Plano explícito para apply controlado de 028–034 **antes** de 036 (staging→prod), com RLS deny-by-default das novas tabelas.

---

## 16. Gate fields

| Campo | Valor |
|-------|-------|
| **Tables without RLS** | Inferidas: `platform_invoices`, `platform_subscriptions`, `platform_billing_events`, `platform_billing_alerts` (+ possíveis não-expostas não inventariadas) |
| **Anon exposed tables** | 7 listadas (§2); **3 com dados** |
| **Authenticated exposed tables** | UNKNOWN (não testado) |
| **Write exposed tables** | não testado (sem mutation) |
| **Sensitive tables affected** | billing SaaS (+ storage tenant folder list) |
| **Cross-tenant findings** | anon = full billing rowset |
| **Contracts/signature findings** | tabelas V2 **ausentes** em prod |
| **Storage findings** | `clinic-logos` / `email-assets` public; list anon em logos |
| **Secrets exposure** | **NOT_EXPOSED** (service_role); anon JWT no dist esperado |
| **Root cause** | billing tables sem RLS efetivo (016 create sem RLS / 015 policies não ativas) |
| **Severity** | **CRITICAL** |
| **Immediate remediation proposed** | ENABLE RLS + REVOKE anon + policies authenticated (§13) |
| **Migration required** | Sim (fix aditiva) — **não aplicada** |
| **Regression risk** | Médio no Console billing se algum path browser direto existir; baixo se só service_role |
| **036 dependency** | **BLOCKED** |
| **PACKAGE_MANIFEST_SECURITY_CLEARANCE** | **BLOCKED** |
| **Production mutations** | **NONE** |
| **Gate** | **CRITICAL_EXPOSURE_REQUIRES_IMMEDIATE_APPROVAL** |

---

## 17. Próximos passos (humano)

1. **Aprovar** execução do SQL de remediação billing (ou variante).  
2. Fornecer `SUPABASE_ACCESS_TOKEN` ou DB URL read-only para inventário `pg_class` completo.  
3. Re-testar: anon SELECT billing → deve falhar/vazio.  
4. Só então reavaliar clearance para Contracts V2 / 036.

**HARD STOP — correção não executada.**
