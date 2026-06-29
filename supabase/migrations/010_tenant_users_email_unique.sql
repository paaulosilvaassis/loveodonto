-- 010: constraint UNIQUE em tenant_users (tenant_id, email) para integridade e upserts futuros.
-- O índice tenant_users_tenant_email_idx (005) era apenas INDEX, não UNIQUE —
-- causava erro "no unique or exclusion constraint matching the ON CONFLICT specification".

update public.tenant_users
set email = lower(trim(email))
where email is not null
  and email <> lower(trim(email));

drop index if exists public.tenant_users_tenant_email_idx;

create unique index if not exists tenant_users_tenant_email_uq
  on public.tenant_users (tenant_id, email);
