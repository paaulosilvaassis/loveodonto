-- Phase 10.11 — delivery attempts table validation (LOCAL DISPOSABLE ONLY)
-- Saída: CONTRACTS_V2_PHASE1011_PASS

begin;

do $$
begin
  if to_regclass('public.app_signature_delivery_attempts') is null then
    raise exception 'CONTRACTS_V2_PHASE1011_FAILED: missing app_signature_delivery_attempts';
  end if;

  if not exists (
    select 1 from pg_tables
    where schemaname = 'public' and tablename = 'app_signature_delivery_attempts'
  ) then
    raise exception 'CONTRACTS_V2_PHASE1011_FAILED: table missing';
  end if;

  -- RLS enabled
  if not exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'app_signature_delivery_attempts'
      and c.relrowsecurity = true
  ) then
    raise exception 'CONTRACTS_V2_PHASE1011_FAILED: RLS not enabled';
  end if;

  raise notice 'CONTRACTS_V2_PHASE1011_PASS';
end;
$$;

commit;
