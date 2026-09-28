-- =============================================================================
-- Security hardening: restrict direct execution of internal SECURITY DEFINER
-- functions that live in the exposed public schema.
--
-- This records the controlled STAGING correction applied to project
-- tckdjyunwmdpqmewrwvt. It is not authorization to apply or promote this
-- migration to Production.
--
-- The functions remain usable by their owner and by existing privileged server
-- flows. Direct execution is explicitly removed from PUBLIC, anon and
-- authenticated roles. Existing triggers continue to invoke their trigger
-- functions as part of table writes; this migration does not alter tables,
-- triggers, data or RLS policies.
-- =============================================================================

revoke execute on function public.app_validate_critical_tenant_tables_rls()
  from public, anon, authenticated;

revoke execute on function public.log_odontogram_change()
  from public, anon, authenticated;

revoke execute on function public.update_updated_at_column()
  from public, anon, authenticated;
