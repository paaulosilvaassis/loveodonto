/**
 * Phase 4.10 Wave 3I — GET /internal/platform/console-profile
 */

function normalizeText(value) {
  return String(value ?? '').trim();
}

export function createConsoleProfileHandler(deps) {
  const { supabase, explainJwtVerifyFailure, normalizeDatabaseError } = deps;

  return async function handleConsoleProfile(req, res) {
    try {
      const authHeader = normalizeText(req.headers.authorization);
      const match = authHeader.match(/^Bearer\s+(.+)$/i);
      const accessToken = match?.[1] || '';
      if (!accessToken) {
        return res.status(401).json({ error: 'Token ausente.' });
      }
      const { data: userData, error: userError } = await supabase.auth.getUser(accessToken);
      if (userError || !userData?.user?.id) {
        return res.status(401).json({
          error:
            explainJwtVerifyFailure(userError, accessToken)
            || 'Token inválido. Console e backend devem usar o mesmo projeto Supabase.',
        });
      }
      const uid = userData.user.id;
      const { data: row, error: rowError } = await supabase
        .from('platform_admin_users')
        .select('id, email, full_name, role_slug, is_active')
        .eq('id', uid)
        .eq('is_active', true)
        .maybeSingle();
      if (rowError) {
        console.error('[console-profile]', rowError);
        return res.status(400).json({
          error: normalizeDatabaseError(rowError, 'Falha ao ler platform_admin_users.'),
        });
      }
      if (!row?.id) {
        return res.status(404).json({
          error:
            'Sem perfil ativo em platform_admin_users. Crie a linha com id = UUID do usuário em Authentication.',
        });
      }
      return res.json({
        id: row.id,
        email: row.email,
        full_name: row.full_name,
        role_slug: row.role_slug,
        is_active: row.is_active,
      });
    } catch (err) {
      console.error('[console-profile]', err);
      return res.status(400).json({
        error: normalizeDatabaseError(err, 'Erro ao carregar perfil da Console.'),
      });
    }
  };
}
