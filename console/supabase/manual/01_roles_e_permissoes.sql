-- PASSO 2 (depois do schema 001): popula papéis e permissões da Console.
-- Não cria clínicas fictícias. Pode rodar várias vezes (idempotente).

do $$
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
end $$;
