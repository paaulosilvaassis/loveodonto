/**
 * Mensagens amigáveis para erros do Auth/API do Supabase na tela de login (sem expor segredos).
 */
export function formatConsoleSupabaseAuthError(err) {
  const code = err?.code;
  if (code === 'PROFILE_NOT_FOUND') {
    return (
      'Sem perfil de administrador da plataforma para este usuário. No Supabase, confira a tabela '
      + 'platform_admin_users: precisa existir uma linha com id igual ao UUID do usuário em Authentication '
      + 'e is_active = true. Se você acabou de rodar o SQL do schema, rode também a migration 003 '
      + '(política "console admin read self") para o login conseguir ler o próprio registro.'
    );
  }
  if (code === 'TIMEOUT') {
    return 'A consulta do perfil demorou demais. Verifique rede, projeto Supabase e políticas RLS.';
  }

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

  if (
    lower.includes('failed to fetch')
    || lower.includes('networkerror')
    || lower.includes('network request failed')
    || (err?.name === 'TypeError' && (lower.includes('fetch') || lower.includes('network')))
  ) {
    return (
      'Não foi possível conectar ao Supabase (rede). Confira: VITE_CONSOLE_SUPABASE_URL aponta para o projeto '
      + 'correto (https://…supabase.co); variáveis na Vercel sem aspas e com redeploy; firewall/adblock; '
      + 'e no Supabase → Authentication → URL Configuration se o Site URL inclui o domínio da Console.'
    );
  }

  return raw || 'Falha no login.';
}
