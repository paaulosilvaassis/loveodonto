do $$
declare
  v_owner_role_id uuid;
  v_super_admin_role_id uuid;
  v_suporte_role_id uuid;
  v_financeiro_role_id uuid;
  v_operacoes_role_id uuid;
  v_leitura_role_id uuid;
  v_tenant_1 uuid := gen_random_uuid();
  v_tenant_2 uuid := gen_random_uuid();
begin
  insert into public.platform_roles (role_slug, role_name, is_system)
  values
    ('owner', 'Owner', true),
    ('super_admin', 'Super Admin', true),
    ('suporte', 'Suporte', true),
    ('financeiro', 'Financeiro', true),
    ('operacoes', 'Operações', true),
    ('leitura', 'Leitura', true)
  on conflict (role_slug) do nothing;

  insert into public.platform_permissions (permission_key, description)
  values
    ('dashboard.read', 'Visualizar dashboard da plataforma'),
    ('tenants.read', 'Visualizar clínicas'),
    ('tenants.write', 'Gerenciar clínicas e módulos'),
    ('billing.read', 'Visualizar cobrança e assinaturas'),
    ('billing.write', 'Gerenciar cobrança e assinaturas'),
    ('integrations.read', 'Visualizar conectividades'),
    ('integrations.write', 'Gerenciar conectividades'),
    ('support.read', 'Visualizar tickets'),
    ('support.write', 'Responder e gerir tickets'),
    ('logs.read', 'Visualizar logs/erros'),
    ('logs.write', 'Gerenciar checks operacionais'),
    ('flags.read', 'Visualizar feature flags'),
    ('flags.write', 'Gerenciar feature flags'),
    ('audit.read', 'Visualizar auditoria'),
    ('audit.write', 'Registrar auditoria'),
    ('settings.read', 'Visualizar configurações'),
    ('settings.write', 'Gerenciar configuração e acessos')
  on conflict (permission_key) do nothing;

  select id into v_owner_role_id from public.platform_roles where role_slug = 'owner';
  select id into v_super_admin_role_id from public.platform_roles where role_slug = 'super_admin';
  select id into v_suporte_role_id from public.platform_roles where role_slug = 'suporte';
  select id into v_financeiro_role_id from public.platform_roles where role_slug = 'financeiro';
  select id into v_operacoes_role_id from public.platform_roles where role_slug = 'operacoes';
  select id into v_leitura_role_id from public.platform_roles where role_slug = 'leitura';

  insert into public.platform_role_permissions (role_id, permission_id)
  select r.id, p.id
  from public.platform_roles r
  join public.platform_permissions p on (
    r.role_slug in ('owner', 'super_admin')
    or (r.role_slug = 'suporte' and p.permission_key in ('dashboard.read', 'support.read', 'support.write', 'audit.write'))
    or (r.role_slug = 'financeiro' and p.permission_key in ('dashboard.read', 'billing.read', 'billing.write', 'audit.write'))
    or (r.role_slug = 'operacoes' and p.permission_key in ('dashboard.read', 'tenants.read', 'tenants.write', 'integrations.read', 'integrations.write', 'flags.read', 'flags.write', 'audit.write'))
    or (r.role_slug = 'leitura' and p.permission_key in ('dashboard.read', 'tenants.read', 'billing.read', 'integrations.read', 'support.read', 'logs.read', 'flags.read', 'audit.read'))
  )
  on conflict (role_id, permission_id) do nothing;

  insert into public.tenants (id, clinic_code, legal_name, trade_name, cnpj, status, billing_status, plan_code, owner_name, owner_email, city, state)
  values
    (v_tenant_1, 'SPRIME', 'Clinica Sorriso Prime LTDA', 'Sorriso Prime', '12.345.678/0001-10', 'active', 'ok', 'Scale', 'Dra. Camila Nunes', 'camila@sorrisoprime.com.br', 'São Paulo', 'SP'),
    (v_tenant_2, 'OVIDA', 'Odonto Vida Centro LTDA', 'Odonto Vida', '45.901.222/0001-90', 'suspended', 'overdue', 'Growth', 'Dr. Rafael Braga', 'rafael@odontovida.com.br', 'Belo Horizonte', 'MG')
  on conflict (id) do nothing;

  insert into public.tenant_modules (tenant_id, module_key, enabled)
  values
    (v_tenant_1, 'Agenda', true),
    (v_tenant_1, 'CRM', true),
    (v_tenant_1, 'Financeiro', true),
    (v_tenant_1, 'Marketing', true),
    (v_tenant_2, 'Agenda', true),
    (v_tenant_2, 'CRM', true),
    (v_tenant_2, 'Marketing', false)
  on conflict (tenant_id, module_key) do nothing;

  insert into public.tenant_integrations (tenant_id, integration_key, status, config, last_sync_at)
  values
    (v_tenant_1, 'whatsapp_cloud_api', 'connected', '{"phone_number":"+5511999990000"}'::jsonb, now()),
    (v_tenant_1, 'webhook_api', 'connected', '{"endpoint":"https://example.com/webhook"}'::jsonb, now()),
    (v_tenant_2, 'whatsapp_cloud_api', 'error', '{"phone_number":"+5531999990000"}'::jsonb, now() - interval '2 day')
  on conflict (tenant_id, integration_key) do nothing;

  insert into public.tenant_subscriptions (tenant_id, plan_code, status, amount_cents, cycle, starts_at, next_billing_at)
  values
    (v_tenant_1, 'Scale', 'active', 149900, 'monthly', now() - interval '60 day', now() + interval '7 day'),
    (v_tenant_2, 'Growth', 'past_due', 99900, 'monthly', now() - interval '35 day', now() - interval '5 day')
  on conflict do nothing;

  insert into public.tenant_limits (tenant_id, limits_json)
  values
    (v_tenant_1, '{"patients":5000,"users":100,"storage_gb":50}'::jsonb),
    (v_tenant_2, '{"patients":1500,"users":30,"storage_gb":20}'::jsonb)
  on conflict (tenant_id) do update
    set limits_json = excluded.limits_json;

  insert into public.tenant_billing_events (tenant_id, event_type, status, amount_cents, due_at, created_at)
  values
    (v_tenant_1, 'invoice.paid', 'paid', 149900, now() - interval '20 day', now() - interval '20 day'),
    (v_tenant_2, 'invoice.overdue', 'overdue', 99900, now() - interval '5 day', now() - interval '5 day')
  on conflict do nothing;

  insert into public.support_tickets (tenant_id, subject, priority, status, source, created_at, updated_at)
  values
    (v_tenant_1, 'Instabilidade no webhook de campanhas', 'high', 'open', 'console', now() - interval '2 hour', now() - interval '35 minute'),
    (v_tenant_2, 'Dúvida sobre renegociação de assinatura', 'medium', 'pending', 'console', now() - interval '1 day', now() - interval '4 hour')
  on conflict do nothing;

  insert into public.system_health_checks (component, status, latency_ms, details, checked_at)
  values
    ('api-core', 'healthy', 65, '{}'::jsonb, now()),
    ('jobs-worker', 'healthy', 88, '{}'::jsonb, now()),
    ('billing-webhooks', 'warning', 292, '{"detail":"timeouts esporádicos"}'::jsonb, now())
  on conflict do nothing;

  insert into public.feature_flags (flag_key, scope_type, scope_ref, enabled, payload)
  values
    ('chat_inteligente_v2', 'global', '*', true, '{}'::jsonb),
    ('ai_assistant_beta', 'tenant', v_tenant_2::text, false, '{}'::jsonb)
  on conflict (flag_key, scope_type, scope_ref) do nothing;
end $$;
