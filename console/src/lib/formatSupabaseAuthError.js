/**
 * Mensagens amigáveis para erros do Auth/API do Supabase na tela de login (sem expor segredos).
 */
export function formatConsoleSupabaseAuthError(err) {
  const code = err?.code;
  if (code === 'PROFILE_NOT_FOUND') {
    return (
      'Sem perfil de administrador para este usuário. O backend (GET /internal/platform/console-profile) '
      + 'não encontrou linha ativa em platform_admin_users. No Supabase → Table Editor: crie/edite uma linha '
      + 'com id = UUID do usuário em Authentication, is_active = true e role_slug adequado (ex.: super_admin). '
      + 'O carregamento do perfil não usa RLS no navegador; usa a service role no servidor.'
    );
  }
  if (code === 'BACKEND_DOWN') {
    return (
      String(err?.message || '').trim()
      || 'Backend da plataforma (porta 3001) indisponível. Na raiz do projeto: npm run server:restart '
      + 'e mantenha o terminal do backend aberto.'
    );
  }
  if (code === 'API_ERROR') {
    const raw = String(err?.message || '').trim();
    if (raw) return raw;
    return (
      'O backend retornou erro ao ler platform_admin_users. Confira server/.env: SUPABASE_URL e '
      + 'SUPABASE_SERVICE_ROLE_KEY do mesmo projeto que console/.env (VITE_CONSOLE_SUPABASE_URL).'
    );
  }
  if (code === 'UNKNOWN') {
    const raw = String(err?.message || '').trim();
    return (
      raw
      || 'Falha inesperada ao validar o perfil. Abra o DevTools (Console), ative VITE_CONSOLE_AUTH_DEBUG=1 '
      + 'e confira se o backend em 3001 está no ar e aponta para o mesmo Supabase da Console.'
    );
  }
  if (code === 'TIMEOUT') {
    return (
      'A consulta do perfil demorou demais. Verifique rede, se o backend (3001) responde e se o projeto '
      + 'Supabase está acessível.'
    );
  }
  if (code === 'UNAUTHORIZED') {
    return (
      String(err?.message || '').trim()
      || 'Sessão não aceita pelo backend. Alinhe server/.env com console/.env (mesmo projeto Supabase).'
    );
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
    return (
      'Falha de JWT no login (Supabase Auth). (1) Em console/.env: chave publishable em '
      + 'VITE_CONSOLE_SUPABASE_PUBLISHABLE_KEY ou anon JWT (eyJ…) em VITE_CONSOLE_SUPABASE_ANON_KEY, '
      + 'mesmo projeto que VITE_CONSOLE_SUPABASE_URL, sem aspas; reinicie o Vite. '
      + '(2) Apague dados do site para localhost:5177 (DevTools → Application → Limpar dados). '
      + '(3) Se o erro citar "signature" ou "segments" após o login, o backend em server/.env '
      + '(SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY) precisa ser o mesmo projeto que a Console.'
    );
  }

  if (
    lower.includes('failed to fetch')
    || lower.includes('networkerror')
    || lower.includes('network request failed')
    || (err?.name === 'TypeError' && (lower.includes('fetch') || lower.includes('network')))
  ) {
    return (
      'Não foi possível conectar ao Supabase (rede). Em dev: reinicie com `npm run console:dev` (API + Console). '
      + 'Confira VITE_CONSOLE_SUPABASE_URL (https://…supabase.co); prefira anon JWT (eyJ…) em VITE_CONSOLE_SUPABASE_ANON_KEY; '
      + 'desative adblock; e no Supabase → Authentication → URL Configuration inclua http://localhost:5177.'
    );
  }

  return raw || 'Falha no login.';
}
