-- Phase 9.2A — fixtures sintéticas LOCAIS only.
-- IDs fictícios estáveis. Aplicar somente após db reset local.

insert into public.tenants (id, legal_name, trade_name, status, owner_email)
select
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'::uuid,
  'Tenant Local A Synthetic',
  'tenant-local-a',
  'active',
  'user-local-a@example.invalid'
where not exists (
  select 1 from public.tenants where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'::uuid
);

insert into public.tenants (id, legal_name, trade_name, status, owner_email)
select
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2'::uuid,
  'Tenant Local B Synthetic',
  'tenant-local-b',
  'active',
  'user-local-b@example.invalid'
where not exists (
  select 1 from public.tenants where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2'::uuid
);
