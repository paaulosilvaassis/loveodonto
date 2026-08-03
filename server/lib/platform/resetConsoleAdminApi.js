/**
 * Phase 4.10 Wave 3I — POST /internal/platform/dev/reset-console-admin
 */

function normalizeText(value) {
  return String(value ?? '').trim();
}

export function createResetConsoleAdminHandler(deps) {
  const {
    ensureConsoleAdminCredentials,
    normalizeEmail,
    normalizeDatabaseError,
    platformApiKey = '',
    nodeEnv = process.env.NODE_ENV,
  } = deps;

  return async function handleResetConsoleAdmin(req, res) {
    try {
      if (nodeEnv === 'production') {
        return res.status(403).json({ error: 'Endpoint disponível apenas em ambiente local.' });
      }
      const platformKey = normalizeText(req.headers['x-platform-key']);
      if (!platformApiKey || platformKey !== platformApiKey) {
        return res.status(401).json({ error: 'Chave de plataforma inválida.' });
      }

      const email = normalizeEmail(req.body?.email || 'admin@loveodonto.com');
      const password = normalizeText(req.body?.password || 'admin123');
      const fullName = normalizeText(req.body?.full_name || 'Admin Love Odonto');

      if (!email) return res.status(400).json({ error: 'email é obrigatório.' });
      if (!password || password.length < 8) {
        return res.status(400).json({ error: 'password deve ter pelo menos 8 caracteres.' });
      }

      const user = await ensureConsoleAdminCredentials({ email, password, fullName });
      return res.json({
        success: true,
        user,
        password,
      });
    } catch (err) {
      console.error('[reset-console-admin]', err?.message || err);
      return res.status(400).json({
        error: normalizeDatabaseError(err, 'Falha ao resetar admin da Console.'),
      });
    }
  };
}
