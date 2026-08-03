/**
 * Phase 4.10 Wave 1 — middleware Express: valida JWT app e popula req.appAuthUser.
 */

import { parseBearerToken, resolveAuthUser } from './resolveAuthUser.js';

function normalizeText(value) {
  return String(value ?? '').trim();
}

export function createRequireAppUser(deps) {
  const {
    supabase,
    explainJwtVerifyFailure,
    normalizeDatabaseError,
    isSupabaseNetworkError,
  } = deps;

  return async function requireAppUser(req, res, next) {
    try {
      const accessToken = parseBearerToken(req.headers?.authorization);
      const result = await resolveAuthUser(supabase, accessToken, {
        explainJwtVerifyFailure,
        normalizeDatabaseError,
      });

      if (!result.ok) {
        return res.status(result.status).json(result.body);
      }

      req.appAuthUser = result.user;
      next();
    } catch (err) {
      if (typeof isSupabaseNetworkError === 'function' && isSupabaseNetworkError(err)) {
        return res.status(503).json({
          error: 'Não foi possível contactar o Supabase. Verifique a ligação à internet e tente novamente.',
        });
      }
      return res.status(401).json({
        error: err?.message || 'Falha ao validar sessão do app.',
      });
    }
  };
}

export { normalizeText, parseBearerToken };
