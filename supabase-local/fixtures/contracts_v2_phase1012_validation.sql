-- Phase 10.12 — full stack validation 028–034 (LOCAL DISPOSABLE ONLY)
-- Saída: CONTRACTS_V2_PHASE1012_PASS

begin;

do $$
declare
  missing text;
begin
  foreach missing in array array[
    'app_signature_policies',
    'app_contract_templates',
    'app_contracts',
    'app_signature_envelopes',
    'app_signature_signers',
    'app_contract_files',
    'app_contract_ledger',
    'app_signature_sessions',
    'app_signature_challenges',
    'app_signature_rate_limits',
    'app_contract_storage_ops',
    'app_signature_delivery_attempts'
  ]
  loop
    if to_regclass('public.' || missing) is null then
      raise exception 'CONTRACTS_V2_PHASE1012_FAILED: missing %', missing;
    end if;
  end loop;

  if not exists (
    select 1 from storage.buckets
    where id = 'contracts-v2-private-local' and public = false
  ) then
    raise exception 'CONTRACTS_V2_PHASE1012_FAILED: private local bucket missing or public';
  end if;

  if exists (
    select 1 from storage.buckets where id = 'contracts-v2-private-staging'
  ) then
    raise exception 'CONTRACTS_V2_PHASE1012_FAILED: staging bucket must not exist locally';
  end if;

  raise notice 'CONTRACTS_V2_PHASE1012_PASS';
end;
$$;

commit;
