-- =============================================================================
-- 039: app_user_can_access_tenant(text) overload — Phase 10.21AF (OPTION A)
-- =============================================================================
-- PURPOSE:
--   Production currently has only app_user_can_access_tenant(uuid).
--   Staging-validated migration 029 calls app_user_can_access_tenant(tenant_id::text).
--   This migration adds a TEXT overload that DELEGATES to the existing UUID helper.
--
-- RULES:
--   - Do NOT reimplement membership / authorization logic.
--   - Do NOT alter the existing UUID overload.
--   - Invalid / null / empty text → false (no EXCEPTION to callers / RLS).
--   - No table mutation. No data mutation.
--
-- AUTHORIZED for PRODUCTION apply (PHASE_10.21AF) before resuming 028→036.
-- =============================================================================

create or replace function public.app_user_can_access_tenant(row_tenant_id text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  parsed uuid;
begin
  if row_tenant_id is null or length(btrim(row_tenant_id)) = 0 then
    return false;
  end if;

  begin
    parsed := btrim(row_tenant_id)::uuid;
  exception
    when invalid_text_representation then
      return false;
  end;

  -- Delegate to existing UUID helper (single source of authorization truth).
  return public.app_user_can_access_tenant(parsed);
end;
$$;

comment on function public.app_user_can_access_tenant(text) is
  'PHASE_10.21AF — text overload for 029 compatibility; delegates to app_user_can_access_tenant(uuid); invalid/null/empty → false.';

revoke all on function public.app_user_can_access_tenant(text) from public;
grant execute on function public.app_user_can_access_tenant(text) to authenticated;
grant execute on function public.app_user_can_access_tenant(text) to service_role;
