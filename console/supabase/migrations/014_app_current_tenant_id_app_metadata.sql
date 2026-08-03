-- Lê tenant_id do JWT em app_metadata (padrão Supabase Auth após provisionamento SaaS).

create or replace function public.app_current_tenant_id()
returns uuid
language sql
stable
as $$
  select coalesce(
    nullif(auth.jwt() ->> 'tenant_id', '')::uuid,
    nullif(auth.jwt() -> 'app_metadata' ->> 'tenant_id', '')::uuid,
    nullif(auth.jwt() ->> 'app_tenant_id', '')::uuid
  )
$$;
