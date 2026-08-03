/**
 * Phase 4.10 Wave 3I — autenticação e middleware da Console.
 */

function normalizeText(value) {
  return String(value ?? '').trim();
}

export function createConsoleAccess(deps) {
  const {
    supabase,
    explainJwtVerifyFailure,
    platformApiKey = '',
  } = deps;

  async function getConsoleActorFromBearerToken(accessToken) {
    const { data: userData, error: userError } = await supabase.auth.getUser(accessToken);
    if (userError || !userData?.user?.id) {
      throw new Error(
        explainJwtVerifyFailure(userError, accessToken)
        || 'Token da Console inválido. Verifique se a Console usa o mesmo projeto Supabase configurado no backend.',
      );
    }
    const authUser = userData.user;
    const { data: actorRow, error: actorError } = await supabase
      .from('platform_admin_users')
      .select('id, email, full_name, role_slug, is_active')
      .eq('id', authUser.id)
      .eq('is_active', true)
      .maybeSingle();
    if (actorError) throw actorError;
    if (!actorRow?.id) {
      throw new Error(
        'Usuário autenticado não possui perfil ativo em platform_admin_users. '
        + 'Crie ou corrija esse vínculo no mesmo projeto Supabase da Console.',
      );
    }
    return {
      id: actorRow.id,
      email: actorRow.email || authUser.email || '',
      name: actorRow.full_name || actorRow.email || authUser.email || 'Operador',
      role: actorRow.role_slug || 'leitura',
    };
  }

  async function requireConsoleAccess(req, res, next) {
    try {
      const authHeader = normalizeText(req.headers.authorization);
      const match = authHeader.match(/^Bearer\s+(.+)$/i);
      const accessToken = match?.[1] || '';

      /**
       * Bearer SEMPRE prevalece sobre x-platform-key.
       * A Console envia os dois headers; se a API key ganhasse, o actor virava
       * role=system e rotas como resend-access negavam super_admin legítimo.
       */
      if (accessToken) {
        req.platformActor = await getConsoleActorFromBearerToken(accessToken);
        return next();
      }

      const platformKey = normalizeText(req.headers['x-platform-key']);
      if (platformApiKey && platformKey && platformKey === platformApiKey) {
        req.platformActor = { id: null, email: '', name: 'system', role: 'system' };
        return next();
      }

      return res.status(401).json({ error: 'Sessão da Console ausente.' });
    } catch (err) {
      res.status(401).json({ error: err?.message || 'Falha ao validar sessão da Console.' });
    }
  }

  return {
    getConsoleActorFromBearerToken,
    requireConsoleAccess,
  };
}
