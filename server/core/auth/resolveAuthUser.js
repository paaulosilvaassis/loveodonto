/**
 * Phase 4.10 Wave 1 — resolução de usuário autenticado via Bearer JWT.
 */

function normalizeText(value) {
  return String(value ?? '').trim();
}

export function parseBearerToken(authHeader) {
  const match = normalizeText(authHeader).match(/^Bearer\s+(.+)$/i);
  return match?.[1] || '';
}

export async function resolveAuthUser(supabase, accessToken, {
  explainJwtVerifyFailure = () => '',
  normalizeDatabaseError = (_err, fallback) => fallback,
  invalidTokenMessage = 'Token do app inválido. O login SaaS (app 5176) e server/.env (SUPABASE_URL) devem ser o mesmo projeto Supabase.',
} = {}) {
  const token = normalizeText(accessToken);
  if (!token) {
    return {
      ok: false,
      status: 401,
      body: { error: 'Token do app ausente.' },
    };
  }

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user?.id) {
    return {
      ok: false,
      status: 401,
      body: {
        error:
          explainJwtVerifyFailure(error, token)
          || normalizeDatabaseError(error, '')
          || invalidTokenMessage,
      },
    };
  }

  return {
    ok: true,
    user: data.user,
    accessToken: token,
  };
}

export async function resolveAuthUserMeta(supabase, userId) {
  const id = normalizeText(userId);
  if (!id) return null;
  const { data, error } = await supabase.auth.admin.getUserById(id);
  if (error || !data?.user) return null;
  return {
    last_sign_in_at: data.user.last_sign_in_at || null,
    created_at: data.user.created_at || null,
    user_metadata: data.user.user_metadata || {},
    app_metadata: data.user.app_metadata || {},
  };
}
