/**
 * Mensagens amigáveis para erros do Auth/API do Supabase na tela de login (sem expor segredos).
 */
export function formatConsoleSupabaseAuthError(err) {
  const raw = String(err?.message || err || '').trim();
  const lower = raw.toLowerCase();

  if (lower.includes('invalid api key')) {
    return (
      'Chave da API inválida. Confira no Vercel as variáveis VITE_CONSOLE_SUPABASE_URL e '
      + 'VITE_CONSOLE_SUPABASE_ANON_KEY: devem ser do mesmo projeto (Supabase → Settings → API). '
      + 'Use a chave anon (JWT eyJ…) ou publishable (sb_publishable_…), valor completo, sem aspas extras no início/fim. '
      + 'Depois faça um novo deploy.'
    );
  }

  if (lower.includes('jwt') && (lower.includes('invalid') || lower.includes('malformed'))) {
    return 'Token ou chave em formato inválido. Verifique se a chave anon/public foi copiada por completo no Vercel.';
  }

  return raw || 'Falha no login.';
}
