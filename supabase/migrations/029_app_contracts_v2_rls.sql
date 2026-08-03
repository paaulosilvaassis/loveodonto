-- 029: Contracts V2 RLS — Phase 10.3
-- NÃO EXECUTAR automaticamente em remoto/produção.
--
-- Modelo alinhado a 023_app_appointments_financial_crm_rls / 019_collaborators_rls:
--   SELECT  → membros do tenant (app_user_can_access_tenant)
--   INSERT/UPDATE/DELETE → admins do tenant (app_user_is_tenant_admin)
--
-- Exceções:
--   app_contract_audit_events → SELECT tenant + INSERT admin; SEM UPDATE/DELETE policy
--     (append-only reforçado por trigger em 028)
--   Soft delete preferido em app_contract_files via deleted_at
--
-- Nota: Admin API / service_role bypassa RLS. Policies protegem PostgREST authenticated.
-- Master SaaS NÃO recebe acesso clínico irrestrito por estas policies.
-- RLS não substitui autorização de domínio (permissões contracts:*).
--
-- Pré-requisitos: 028 tables, 009 helpers (app_user_can_access_tenant, app_user_is_tenant_admin).
--
-- ROLLBACK: drop policies + alter table disable row level security (manual, por tabela).

-- ---------------------------------------------------------------------------
-- Macro pattern helper comments
-- using:  auth.uid() is not null AND app_user_can_access_tenant(tenant_id::text)
-- modify: + app_user_is_tenant_admin(tenant_id)
-- with check: impede insert com tenant_id não autorizado
-- ---------------------------------------------------------------------------

-- app_signature_policies
alter table public.app_signature_policies enable row level security;
drop policy if exists app_signature_policies_select_tenant on public.app_signature_policies;
drop policy if exists app_signature_policies_modify_admin on public.app_signature_policies;
create policy app_signature_policies_select_tenant on public.app_signature_policies
  for select using (
    auth.uid() is not null
    and public.app_user_can_access_tenant(tenant_id::text)
  );
create policy app_signature_policies_modify_admin on public.app_signature_policies
  for all
  using (
    auth.uid() is not null
    and public.app_user_can_access_tenant(tenant_id::text)
    and public.app_user_is_tenant_admin(tenant_id)
  )
  with check (
    auth.uid() is not null
    and tenant_id is not null
    and public.app_user_can_access_tenant(tenant_id::text)
    and public.app_user_is_tenant_admin(tenant_id)
  );

-- app_contract_templates
alter table public.app_contract_templates enable row level security;
drop policy if exists app_contract_templates_select_tenant on public.app_contract_templates;
drop policy if exists app_contract_templates_modify_admin on public.app_contract_templates;
create policy app_contract_templates_select_tenant on public.app_contract_templates
  for select using (
    auth.uid() is not null
    and public.app_user_can_access_tenant(tenant_id::text)
  );
create policy app_contract_templates_modify_admin on public.app_contract_templates
  for all
  using (
    auth.uid() is not null
    and public.app_user_can_access_tenant(tenant_id::text)
    and public.app_user_is_tenant_admin(tenant_id)
  )
  with check (
    auth.uid() is not null
    and tenant_id is not null
    and public.app_user_can_access_tenant(tenant_id::text)
    and public.app_user_is_tenant_admin(tenant_id)
  );

-- app_contract_template_versions
alter table public.app_contract_template_versions enable row level security;
drop policy if exists app_contract_template_versions_select_tenant on public.app_contract_template_versions;
drop policy if exists app_contract_template_versions_modify_admin on public.app_contract_template_versions;
create policy app_contract_template_versions_select_tenant on public.app_contract_template_versions
  for select using (
    auth.uid() is not null
    and public.app_user_can_access_tenant(tenant_id::text)
  );
create policy app_contract_template_versions_modify_admin on public.app_contract_template_versions
  for all
  using (
    auth.uid() is not null
    and public.app_user_can_access_tenant(tenant_id::text)
    and public.app_user_is_tenant_admin(tenant_id)
  )
  with check (
    auth.uid() is not null
    and tenant_id is not null
    and public.app_user_can_access_tenant(tenant_id::text)
    and public.app_user_is_tenant_admin(tenant_id)
  );

-- app_contracts
alter table public.app_contracts enable row level security;
drop policy if exists app_contracts_select_tenant on public.app_contracts;
drop policy if exists app_contracts_modify_admin on public.app_contracts;
create policy app_contracts_select_tenant on public.app_contracts
  for select using (
    auth.uid() is not null
    and public.app_user_can_access_tenant(tenant_id::text)
  );
create policy app_contracts_modify_admin on public.app_contracts
  for all
  using (
    auth.uid() is not null
    and public.app_user_can_access_tenant(tenant_id::text)
    and public.app_user_is_tenant_admin(tenant_id)
  )
  with check (
    auth.uid() is not null
    and tenant_id is not null
    and public.app_user_can_access_tenant(tenant_id::text)
    and public.app_user_is_tenant_admin(tenant_id)
  );

-- app_contract_versions
alter table public.app_contract_versions enable row level security;
drop policy if exists app_contract_versions_select_tenant on public.app_contract_versions;
drop policy if exists app_contract_versions_modify_admin on public.app_contract_versions;
create policy app_contract_versions_select_tenant on public.app_contract_versions
  for select using (
    auth.uid() is not null
    and public.app_user_can_access_tenant(tenant_id::text)
  );
create policy app_contract_versions_modify_admin on public.app_contract_versions
  for all
  using (
    auth.uid() is not null
    and public.app_user_can_access_tenant(tenant_id::text)
    and public.app_user_is_tenant_admin(tenant_id)
  )
  with check (
    auth.uid() is not null
    and tenant_id is not null
    and public.app_user_can_access_tenant(tenant_id::text)
    and public.app_user_is_tenant_admin(tenant_id)
  );

-- app_contract_parties
alter table public.app_contract_parties enable row level security;
drop policy if exists app_contract_parties_select_tenant on public.app_contract_parties;
drop policy if exists app_contract_parties_modify_admin on public.app_contract_parties;
create policy app_contract_parties_select_tenant on public.app_contract_parties
  for select using (
    auth.uid() is not null
    and public.app_user_can_access_tenant(tenant_id::text)
  );
create policy app_contract_parties_modify_admin on public.app_contract_parties
  for all
  using (
    auth.uid() is not null
    and public.app_user_can_access_tenant(tenant_id::text)
    and public.app_user_is_tenant_admin(tenant_id)
  )
  with check (
    auth.uid() is not null
    and tenant_id is not null
    and public.app_user_can_access_tenant(tenant_id::text)
    and public.app_user_is_tenant_admin(tenant_id)
  );

-- app_contract_treatments
alter table public.app_contract_treatments enable row level security;
drop policy if exists app_contract_treatments_select_tenant on public.app_contract_treatments;
drop policy if exists app_contract_treatments_modify_admin on public.app_contract_treatments;
create policy app_contract_treatments_select_tenant on public.app_contract_treatments
  for select using (
    auth.uid() is not null
    and public.app_user_can_access_tenant(tenant_id::text)
  );
create policy app_contract_treatments_modify_admin on public.app_contract_treatments
  for all
  using (
    auth.uid() is not null
    and public.app_user_can_access_tenant(tenant_id::text)
    and public.app_user_is_tenant_admin(tenant_id)
  )
  with check (
    auth.uid() is not null
    and tenant_id is not null
    and public.app_user_can_access_tenant(tenant_id::text)
    and public.app_user_is_tenant_admin(tenant_id)
  );

-- app_contract_odontogram_snapshots
alter table public.app_contract_odontogram_snapshots enable row level security;
drop policy if exists app_contract_odontogram_snapshots_select_tenant on public.app_contract_odontogram_snapshots;
drop policy if exists app_contract_odontogram_snapshots_modify_admin on public.app_contract_odontogram_snapshots;
create policy app_contract_odontogram_snapshots_select_tenant on public.app_contract_odontogram_snapshots
  for select using (
    auth.uid() is not null
    and public.app_user_can_access_tenant(tenant_id::text)
  );
create policy app_contract_odontogram_snapshots_modify_admin on public.app_contract_odontogram_snapshots
  for all
  using (
    auth.uid() is not null
    and public.app_user_can_access_tenant(tenant_id::text)
    and public.app_user_is_tenant_admin(tenant_id)
  )
  with check (
    auth.uid() is not null
    and tenant_id is not null
    and public.app_user_can_access_tenant(tenant_id::text)
    and public.app_user_is_tenant_admin(tenant_id)
  );

-- app_contract_financial_snapshots
alter table public.app_contract_financial_snapshots enable row level security;
drop policy if exists app_contract_financial_snapshots_select_tenant on public.app_contract_financial_snapshots;
drop policy if exists app_contract_financial_snapshots_modify_admin on public.app_contract_financial_snapshots;
create policy app_contract_financial_snapshots_select_tenant on public.app_contract_financial_snapshots
  for select using (
    auth.uid() is not null
    and public.app_user_can_access_tenant(tenant_id::text)
  );
create policy app_contract_financial_snapshots_modify_admin on public.app_contract_financial_snapshots
  for all
  using (
    auth.uid() is not null
    and public.app_user_can_access_tenant(tenant_id::text)
    and public.app_user_is_tenant_admin(tenant_id)
  )
  with check (
    auth.uid() is not null
    and tenant_id is not null
    and public.app_user_can_access_tenant(tenant_id::text)
    and public.app_user_is_tenant_admin(tenant_id)
  );

-- app_contract_consents
alter table public.app_contract_consents enable row level security;
drop policy if exists app_contract_consents_select_tenant on public.app_contract_consents;
drop policy if exists app_contract_consents_modify_admin on public.app_contract_consents;
create policy app_contract_consents_select_tenant on public.app_contract_consents
  for select using (
    auth.uid() is not null
    and public.app_user_can_access_tenant(tenant_id::text)
  );
create policy app_contract_consents_modify_admin on public.app_contract_consents
  for all
  using (
    auth.uid() is not null
    and public.app_user_can_access_tenant(tenant_id::text)
    and public.app_user_is_tenant_admin(tenant_id)
  )
  with check (
    auth.uid() is not null
    and tenant_id is not null
    and public.app_user_can_access_tenant(tenant_id::text)
    and public.app_user_is_tenant_admin(tenant_id)
  );

-- app_contract_packages
alter table public.app_contract_packages enable row level security;
drop policy if exists app_contract_packages_select_tenant on public.app_contract_packages;
drop policy if exists app_contract_packages_modify_admin on public.app_contract_packages;
create policy app_contract_packages_select_tenant on public.app_contract_packages
  for select using (
    auth.uid() is not null
    and public.app_user_can_access_tenant(tenant_id::text)
  );
create policy app_contract_packages_modify_admin on public.app_contract_packages
  for all
  using (
    auth.uid() is not null
    and public.app_user_can_access_tenant(tenant_id::text)
    and public.app_user_is_tenant_admin(tenant_id)
  )
  with check (
    auth.uid() is not null
    and tenant_id is not null
    and public.app_user_can_access_tenant(tenant_id::text)
    and public.app_user_is_tenant_admin(tenant_id)
  );

-- app_contract_package_items
alter table public.app_contract_package_items enable row level security;
drop policy if exists app_contract_package_items_select_tenant on public.app_contract_package_items;
drop policy if exists app_contract_package_items_modify_admin on public.app_contract_package_items;
create policy app_contract_package_items_select_tenant on public.app_contract_package_items
  for select using (
    auth.uid() is not null
    and public.app_user_can_access_tenant(tenant_id::text)
  );
create policy app_contract_package_items_modify_admin on public.app_contract_package_items
  for all
  using (
    auth.uid() is not null
    and public.app_user_can_access_tenant(tenant_id::text)
    and public.app_user_is_tenant_admin(tenant_id)
  )
  with check (
    auth.uid() is not null
    and tenant_id is not null
    and public.app_user_can_access_tenant(tenant_id::text)
    and public.app_user_is_tenant_admin(tenant_id)
  );

-- app_signature_envelopes
alter table public.app_signature_envelopes enable row level security;
drop policy if exists app_signature_envelopes_select_tenant on public.app_signature_envelopes;
drop policy if exists app_signature_envelopes_modify_admin on public.app_signature_envelopes;
create policy app_signature_envelopes_select_tenant on public.app_signature_envelopes
  for select using (
    auth.uid() is not null
    and public.app_user_can_access_tenant(tenant_id::text)
  );
create policy app_signature_envelopes_modify_admin on public.app_signature_envelopes
  for all
  using (
    auth.uid() is not null
    and public.app_user_can_access_tenant(tenant_id::text)
    and public.app_user_is_tenant_admin(tenant_id)
  )
  with check (
    auth.uid() is not null
    and tenant_id is not null
    and public.app_user_can_access_tenant(tenant_id::text)
    and public.app_user_is_tenant_admin(tenant_id)
  );

-- app_signature_signers
alter table public.app_signature_signers enable row level security;
drop policy if exists app_signature_signers_select_tenant on public.app_signature_signers;
drop policy if exists app_signature_signers_modify_admin on public.app_signature_signers;
create policy app_signature_signers_select_tenant on public.app_signature_signers
  for select using (
    auth.uid() is not null
    and public.app_user_can_access_tenant(tenant_id::text)
  );
create policy app_signature_signers_modify_admin on public.app_signature_signers
  for all
  using (
    auth.uid() is not null
    and public.app_user_can_access_tenant(tenant_id::text)
    and public.app_user_is_tenant_admin(tenant_id)
  )
  with check (
    auth.uid() is not null
    and tenant_id is not null
    and public.app_user_can_access_tenant(tenant_id::text)
    and public.app_user_is_tenant_admin(tenant_id)
  );

-- app_contract_files (soft delete: select filtra deleted_at)
alter table public.app_contract_files enable row level security;
drop policy if exists app_contract_files_select_tenant on public.app_contract_files;
drop policy if exists app_contract_files_modify_admin on public.app_contract_files;
create policy app_contract_files_select_tenant on public.app_contract_files
  for select using (
    auth.uid() is not null
    and deleted_at is null
    and public.app_user_can_access_tenant(tenant_id::text)
  );
create policy app_contract_files_modify_admin on public.app_contract_files
  for all
  using (
    auth.uid() is not null
    and public.app_user_can_access_tenant(tenant_id::text)
    and public.app_user_is_tenant_admin(tenant_id)
  )
  with check (
    auth.uid() is not null
    and tenant_id is not null
    and public.app_user_can_access_tenant(tenant_id::text)
    and public.app_user_is_tenant_admin(tenant_id)
  );

-- app_contract_audit_events — append-only via policies (sem UPDATE/DELETE)
alter table public.app_contract_audit_events enable row level security;
drop policy if exists app_contract_audit_events_select_tenant on public.app_contract_audit_events;
drop policy if exists app_contract_audit_events_insert_admin on public.app_contract_audit_events;
create policy app_contract_audit_events_select_tenant on public.app_contract_audit_events
  for select using (
    auth.uid() is not null
    and public.app_user_can_access_tenant(tenant_id::text)
  );
create policy app_contract_audit_events_insert_admin on public.app_contract_audit_events
  for insert
  with check (
    auth.uid() is not null
    and tenant_id is not null
    and public.app_user_can_access_tenant(tenant_id::text)
    and public.app_user_is_tenant_admin(tenant_id)
  );
-- Intencionalmente SEM policy de UPDATE/DELETE.

-- app_contract_idempotency_keys
alter table public.app_contract_idempotency_keys enable row level security;
drop policy if exists app_contract_idempotency_keys_select_tenant on public.app_contract_idempotency_keys;
drop policy if exists app_contract_idempotency_keys_modify_admin on public.app_contract_idempotency_keys;
create policy app_contract_idempotency_keys_select_tenant on public.app_contract_idempotency_keys
  for select using (
    auth.uid() is not null
    and public.app_user_can_access_tenant(tenant_id::text)
  );
create policy app_contract_idempotency_keys_modify_admin on public.app_contract_idempotency_keys
  for all
  using (
    auth.uid() is not null
    and public.app_user_can_access_tenant(tenant_id::text)
    and public.app_user_is_tenant_admin(tenant_id)
  )
  with check (
    auth.uid() is not null
    and tenant_id is not null
    and public.app_user_can_access_tenant(tenant_id::text)
    and public.app_user_is_tenant_admin(tenant_id)
  );

-- Grants: authenticated usa policies; service_role bypassa (backend).
-- Não conceder ALL amplo além do padrão Supabase.
grant select, insert, update, delete on public.app_signature_policies to authenticated;
grant select, insert, update, delete on public.app_contract_templates to authenticated;
grant select, insert, update, delete on public.app_contract_template_versions to authenticated;
grant select, insert, update, delete on public.app_contracts to authenticated;
grant select, insert, update, delete on public.app_contract_versions to authenticated;
grant select, insert, update, delete on public.app_contract_parties to authenticated;
grant select, insert, update, delete on public.app_contract_treatments to authenticated;
grant select, insert, update, delete on public.app_contract_odontogram_snapshots to authenticated;
grant select, insert, update, delete on public.app_contract_financial_snapshots to authenticated;
grant select, insert, update, delete on public.app_contract_consents to authenticated;
grant select, insert, update, delete on public.app_contract_packages to authenticated;
grant select, insert, update, delete on public.app_contract_package_items to authenticated;
grant select, insert, update, delete on public.app_signature_envelopes to authenticated;
grant select, insert, update, delete on public.app_signature_signers to authenticated;
grant select, insert, update, delete on public.app_contract_files to authenticated;
grant select, insert on public.app_contract_audit_events to authenticated;
grant select, insert, update, delete on public.app_contract_idempotency_keys to authenticated;
