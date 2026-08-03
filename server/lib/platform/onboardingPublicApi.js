/**
 * Phase 4.10 Wave 3I — rotas públicas de onboarding (termos).
 */

function normalizeText(value) {
  return String(value ?? '').trim();
}

export function createOnboardingPublicHandlers(deps) {
  const {
    supabase,
    findLegalProfileByToken,
    buildTermsPreview,
    acceptTermsByToken,
  } = deps;

  async function handleOnboardingTerms(req, res) {
    try {
      const token = normalizeText(req.query?.token);
      if (!token) return res.status(400).json({ error: 'Token é obrigatório.' });
      const profile = await findLegalProfileByToken(supabase, token);
      const preview = buildTermsPreview(profile);
      if (!preview) return res.status(404).json({ error: 'Link de aceite inválido ou expirado.' });
      return res.status(200).json(preview);
    } catch (err) {
      return res.status(400).json({ error: err?.message || 'Falha ao carregar contrato.' });
    }
  }

  async function handleAcceptTerms(req, res) {
    try {
      const token = normalizeText(req.body?.token);
      if (!token) return res.status(400).json({ error: 'Token é obrigatório.' });
      const result = await acceptTermsByToken(supabase, token);
      return res.status(200).json({
        success: true,
        ...result,
      });
    } catch (err) {
      return res.status(400).json({ error: err?.message || 'Falha ao registrar aceite.' });
    }
  }

  return {
    handleOnboardingTerms,
    handleAcceptTerms,
  };
}
