-- =============================================================================
-- 038: clinic-logos Storage enumeration security fix — PHASE_SECURITY_02B
-- =============================================================================
-- STATUS: PROPOSTA NO REPOSITÓRIO — NÃO APLICAR sem autorização humana (02C).
-- DO NOT APPLY automatically to production.
--
-- Alvo (produção amor-odonto-prod / uoepkwhqztmsjnzirpev):
--   storage.buckets id = 'clinic-logos'  (permanece PUBLIC)
--   storage.objects policy clinic_logos_storage_select
--
-- Root cause (SECURITY_02A):
--   013_clinic_logos_storage.sql criou:
--     clinic_logos_storage_select
--       FOR SELECT USING (bucket_id = 'clinic-logos')
--   sem filtro de tenant e sem TO authenticated.
--   Em bucket público, GET /object/public/... NÃO depende dessa SELECT.
--   A SELECT aberta habilita LIST/enumeração de pastas = tenant UUID (RISK_A).
--
-- OPTION_B (aprovada):
--   - Manter bucket public = true (known-object GET público preservado)
--   - Remover SELECT irrestrita
--   - SELECT apenas TO authenticated + app_user_can_access_tenant(foldername[1])
--     (necessário também para upsert: INSERT+SELECT+UPDATE — docs Supabase)
--   - NÃO alterar INSERT / UPDATE / DELETE (já tenant-scoped na 013)
--   - NÃO mover arquivos / NÃO alterar clinic_profiles.logo_url
--   - NÃO tocar 036 / contracts rollout / billing
--
-- PROD signature note (SECURITY_02C apply):
--   Em uoepkwhqztmsjnzirpev a função live é
--     public.app_user_can_access_tenant(row_tenant_id uuid)
--   (não existe overload text). As policies INSERT/UPDATE/DELETE live já usam
--   ((storage.foldername(name))[1])::uuid — SELECT nova alinhada a esse cast.
--   Tentativa sem ::uuid falhou com 42883; estado BEFORE permaneceu intacto.
--
-- Docs Supabase (fundamentals + access-control):
--   Public buckets bypass RLS for retrieving/serving files by public URL.
--   Access control still enforces upload/delete/list-related operations.
--   Upsert requires SELECT + UPDATE besides INSERT.
--
-- ROLLBACK (manual, se necessário):
--   NÃO restaurar SELECT irrestrita. Preferir corrigir SELECT tenant-scoped.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- A) Garantir bucket permanece público (não private)
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('clinic-logos', 'clinic-logos', true)
on conflict (id) do update set public = true;

-- ---------------------------------------------------------------------------
-- B) Substituir SOMENTE a policy SELECT vulnerável
--    INSERT / UPDATE / DELETE da 013 permanecem intactas.
-- ---------------------------------------------------------------------------

drop policy if exists clinic_logos_storage_select on storage.objects;

-- Authenticated: list/select apenas do próprio tenant (anti-enumeraçao cross-tenant).
-- Anon: sem policy SELECT neste bucket → LIST negado.
-- Public GET de objeto conhecido: independente desta policy (bucket.public = true).
create policy clinic_logos_storage_select on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'clinic-logos'
    and public.app_user_can_access_tenant(((storage.foldername(name))[1])::uuid)
  );

-- APPLIED on production uoepkwhqztmsjnzirpev during PHASE_SECURITY_02C
-- (MCP apply_migration; first attempt without ::uuid failed 42883; corrected cast; success).
-- Re-apply elsewhere only with explicit authorization.
