-- =============================================================================
-- 037: Platform billing RLS security fix — PHASE_SECURITY_01C
-- =============================================================================
-- STATUS: PROPOSTA NO REPOSITÓRIO — NÃO APLICAR sem autorização humana (01D).
-- DO NOT APPLY automatically to production.
--
-- Alvo (produção amor-odonto-prod / uoepkwhqztmsjnzirpev):
--   public.platform_subscriptions
--   public.platform_invoices
--   public.platform_billing_events
--   public.platform_billing_alerts
--
-- Root cause confirmada no repo:
--   015_platform_billing_saas.sql → CREATE + ENABLE RLS + policies
--   016_platform_billing_tenant_columns_and_backfill.sql → CREATE IF NOT EXISTS
--     SEM ENABLE RLS / SEM policies / SEM REVOKE anon
--   Se 016 materializou as tabelas sem a proteção efetiva de 015, anon com
--   GRANT SELECT herda leitura total (exposição CRITICAL confirmada em 01B).
--
-- Esta migration é ADITIVA e IDEMPOTENTE:
--   - não edita 015/016
--   - não toca contracts / 036 / feature_flags / pacientes
--
-- FORCE ROW LEVEL SECURITY:
--   Aplicado. No Supabase, o role `service_role` possui BYPASSRLS e continua
--   servindo a Admin API (server/platformBillingService.js). authenticated/anon
--   ficam sujeitos às policies abaixo.
--
-- ROLLBACK (manual, se necessário):
--   Não reabrir SELECT a anon. Preferir corrigir policies authenticated.
--   disable force / disable rls NÃO é rollback seguro em produção.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- A) ENABLE + FORCE RLS
-- ---------------------------------------------------------------------------

alter table if exists public.platform_subscriptions enable row level security;
alter table if exists public.platform_invoices enable row level security;
alter table if exists public.platform_billing_events enable row level security;
alter table if exists public.platform_billing_alerts enable row level security;

alter table if exists public.platform_subscriptions force row level security;
alter table if exists public.platform_invoices force row level security;
alter table if exists public.platform_billing_events force row level security;
alter table if exists public.platform_billing_alerts force row level security;

-- ---------------------------------------------------------------------------
-- B) REVOKE acesso desnecessário (anon / PUBLIC)
--    Writes de billing permanecem no backend (service_role).
-- ---------------------------------------------------------------------------

revoke all on table public.platform_subscriptions from anon;
revoke all on table public.platform_invoices from anon;
revoke all on table public.platform_billing_events from anon;
revoke all on table public.platform_billing_alerts from anon;

revoke all on table public.platform_subscriptions from public;
revoke all on table public.platform_invoices from public;
revoke all on table public.platform_billing_events from public;
revoke all on table public.platform_billing_alerts from public;

-- authenticated: somente SELECT sob policy (sem escrita direta no browser)
revoke insert, update, delete, truncate, references, trigger
  on table public.platform_subscriptions from authenticated;
revoke insert, update, delete, truncate, references, trigger
  on table public.platform_invoices from authenticated;
revoke insert, update, delete, truncate, references, trigger
  on table public.platform_billing_events from authenticated;
revoke insert, update, delete, truncate, references, trigger
  on table public.platform_billing_alerts from authenticated;

grant select on table public.platform_subscriptions to authenticated;
grant select on table public.platform_invoices to authenticated;
grant select on table public.platform_billing_events to authenticated;
grant select on table public.platform_billing_alerts to authenticated;

-- ---------------------------------------------------------------------------
-- C) Policies — modelo 015, endurecido com TO authenticated
--    (015 criava policies sem TO → aplicavam-se a PUBLIC/anon)
--    Sem policies permissivas (USING true / WITH CHECK true literais).
-- ---------------------------------------------------------------------------

drop policy if exists "platform billing subscriptions read" on public.platform_subscriptions;
create policy "platform billing subscriptions read" on public.platform_subscriptions
  for select
  to authenticated
  using (
    tenant_id = public.app_current_tenant_id()
    or public.has_platform_permission('billing.read')
  );

drop policy if exists "platform billing invoices read" on public.platform_invoices;
create policy "platform billing invoices read" on public.platform_invoices
  for select
  to authenticated
  using (
    tenant_id = public.app_current_tenant_id()
    or public.has_platform_permission('billing.read')
  );

drop policy if exists "platform billing events read" on public.platform_billing_events;
create policy "platform billing events read" on public.platform_billing_events
  for select
  to authenticated
  using (public.has_platform_permission('billing.read'));

drop policy if exists "platform billing alerts read" on public.platform_billing_alerts;
create policy "platform billing alerts read" on public.platform_billing_alerts
  for select
  to authenticated
  using (public.has_platform_permission('billing.read'));

-- Remover eventuais policies legadas permissivas com outros nomes (idempotente)
drop policy if exists platform_billing_subscriptions_anon_all on public.platform_subscriptions;
drop policy if exists platform_billing_invoices_anon_all on public.platform_invoices;
drop policy if exists platform_billing_events_anon_all on public.platform_billing_events;
drop policy if exists platform_billing_alerts_anon_all on public.platform_billing_alerts;

comment on table public.platform_subscriptions is
  'SaaS billing subscriptions — RLS forced; anon revoked; Admin API via service_role (PHASE_SECURITY_01C).';
comment on table public.platform_invoices is
  'SaaS billing invoices — RLS forced; anon revoked; Admin API via service_role (PHASE_SECURITY_01C).';
comment on table public.platform_billing_events is
  'SaaS billing events — RLS forced; anon revoked; Admin API via service_role (PHASE_SECURITY_01C).';
comment on table public.platform_billing_alerts is
  'SaaS billing alerts — RLS forced; anon revoked; Admin API via service_role (PHASE_SECURITY_01C).';
