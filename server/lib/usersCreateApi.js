/**
 * Phase 4.10 Wave 3C — POST /internal/app/users/create.
 * Envelope: 201 { success, tenant_user, invitation, auth_user_id }; 409/400 { error }.
 */

function normalizeText(value) {
  return String(value ?? '').trim();
}

export function createUsersCreateHandler(deps) {
  const { createTenantUserFromApp, normalizeEmail, normalizeDatabaseError } = deps;

  return async function handleUsersCreate(req, res) {
    try {
      const explicitTenantId = normalizeText(req.body?.tenant_id);
      const collaboratorId = normalizeText(req.body?.collaborator_id);
      const fullName = normalizeText(req.body?.full_name);
      const email = normalizeEmail(req.body?.email);
      const password = normalizeText(req.body?.password);
      const profileRoleRaw = normalizeText(req.body?.profile_role);
      const status = normalizeText(req.body?.status || 'active');
      const sendInvite = req.body?.send_invite === true;

      const created = await createTenantUserFromApp({
        actorAuthUserId: req.appAuthUser.id,
        tenantId: explicitTenantId,
        collaboratorId,
        fullName,
        email,
        password,
        profileRole: profileRoleRaw,
        status,
        sendInvite,
      });

      return res.status(201).json({
        success: true,
        tenant_user: created.tenantUser,
        invitation: created.invitation,
        auth_user_id: created.authUserId,
      });
    } catch (err) {
      const normalizedError = normalizeDatabaseError(err, 'Falha ao criar usuário.');
      const msg = String(normalizedError || '');
      const lower = msg.toLowerCase();
      if (lower.includes('já possui acesso')) {
        return res.status(409).json({ error: 'Este e-mail já possui acesso.' });
      }
      return res.status(400).json({ error: normalizedError });
    }
  };
}
