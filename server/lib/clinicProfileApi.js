/**
 * Phase 4.10 Wave 3B — PUT /internal/app/clinic-profile.
 * Admin via body.tenant_id (legado); envelope V2 preservado.
 */

function normalizeText(value) {
  return String(value ?? '').trim();
}

export function createClinicProfileHandler(deps) {
  const {
    supabase,
    upsertClinicProfileForTenant,
    resolveClinicProfileForTenant,
    normalizeDatabaseError,
  } = deps;

  return async function handleClinicProfile(req, res) {
    try {
      const tenantId = req.tenantContext?.tenantId
        || req.tenantContext?.tenantUser?.tenant_id;
      if (!tenantId) {
        return res.status(400).json({ error: 'Contexto de tenant ausente.' });
      }

      const rawLogo = req.body?.logo_url || req.body?.logoUrl;
      if (rawLogo && String(rawLogo).trim().toLowerCase().startsWith('data:')) {
        return res.status(400).json({
          error: 'logo_url deve ser URL pública do Supabase Storage. Envie a imagem ao bucket clinic-logos antes de salvar.',
          code: 'LOGO_MUST_BE_STORAGE_URL',
        });
      }

      const row = await upsertClinicProfileForTenant(supabase, tenantId, {
        name: req.body?.name || req.body?.nomeClinica,
        fantasy_name: req.body?.fantasy_name || req.body?.nomeFantasia,
        legal_name: req.body?.legal_name || req.body?.razaoSocial,
        logo_url: req.body?.logo_url || req.body?.logoUrl,
        email: req.body?.email || req.body?.emailPrincipal,
        phone: req.body?.phone,
        cnpj: req.body?.cnpj,
        status: req.body?.status,
      });

      const { data: tenantRow } = await supabase.from('tenants').select('*').eq('id', tenantId).maybeSingle();
      const clinicProfile = await resolveClinicProfileForTenant(supabase, tenantId, tenantRow || { id: tenantId });

      return res.status(200).json({ success: true, clinicProfile: clinicProfile || row });
    } catch (err) {
      console.error('[app-clinic-profile]', err);
      return res.status(400).json({
        error: normalizeDatabaseError(err, 'Falha ao salvar perfil da clínica.'),
      });
    }
  };
}
