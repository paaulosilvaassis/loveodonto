/**
 * Phase 4.10 Wave 3I — POST /internal/platform/provision-user
 */

function normalizeText(value) {
  return String(value ?? '').trim();
}

export function createProvisionUserHandler(deps) {
  const {
    createAuthUserAndTenantLink,
    normalizeEmail,
    normalizeDatabaseError,
  } = deps;

  return async function handleProvisionUser(req, res) {
    try {
      const email = normalizeEmail(req.body?.email);
      const password = normalizeText(req.body?.password);
      const fullName = normalizeText(req.body?.full_name);
      const tenantId = normalizeText(req.body?.tenant_id);

      if (!email) return res.status(400).json({ error: 'email é obrigatório.' });
      if (!password || password.length < 8) {
        return res.status(400).json({ error: 'password deve ter pelo menos 8 caracteres.' });
      }
      if (!fullName) return res.status(400).json({ error: 'full_name é obrigatório.' });
      if (!tenantId) return res.status(400).json({ error: 'tenant_id é obrigatório.' });

      const { authUserId, tenantUser } = await createAuthUserAndTenantLink({
        email,
        password,
        fullName,
        tenantId,
        roleSlug: 'master',
      });

      return res.status(201).json({
        success: true,
        email,
        password,
        user: {
          id: authUserId,
          email,
          full_name: fullName,
        },
        tenantUser,
      });
    } catch (err) {
      console.error('[ProvisionUser] erro detalhado', {
        message: normalizeDatabaseError(err, String(err || '')),
        email: normalizeEmail(req.body?.email),
        tenantId: normalizeText(req.body?.tenant_id),
      });
      res.status(400).json({
        error: normalizeDatabaseError(err, 'Falha ao provisionar usuário da clínica.'),
      });
    }
  };
}
