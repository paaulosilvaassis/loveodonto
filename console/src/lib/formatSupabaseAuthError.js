/**
 * Mensagens amigáveis para erros do Auth/API do Supabase na tela de login (sem expor segredos).
 */
export function formatConsoleSupabaseAuthError(err) {
  const raw = String(err?.message || err || '').trim();
  const lower = raw.toLowerCase();

  if (lower.includes('invalid api key')) {
    return (
      'Chave da API inválida. No Vercel, use VITE_CONSOLE_SUPABASE_ANON_KEY (JWT anon) ou '
      + 'VITE_CONSOLE_SUPABASE_PUBLISHABLE_KEY (sb_publishable_…), sempre do mesmo projeto que a URL '
      + '(Supabase → Settings → API). Valor completo, sem aspas nas pontas. Novo deploy obrigatório após mudar env.'
    );
  }

  if (lower.includes('jwt') && (lower.includes('invalid') || lower.includes('malformed'))) {
    return 'Token ou chave em formato inválido. Verifique se a chave anon/public foi copiada por completo no Vercel.';
  }

  return raw || 'Falha no login.';
}
