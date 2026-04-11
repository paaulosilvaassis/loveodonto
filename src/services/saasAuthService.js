import { supabasePlatformClient } from '../lib/supabaseClients.js';

function mapSaasAuthError(error) {
  const message = String(error?.message || error || '').trim();
  const lower = message.toLowerCase();
  const code = String(error?.code || '').toLowerCase();
  if (
    code === 'invalid_credentials'
    || lower.includes('invalid login credentials')
    || lower.includes('email not confirmed')
  ) {
    return 'E-mail ou senha inválidos.';
  }
  if (
    lower.includes('failed to fetch')
    || lower.includes('networkerror')
    || lower.includes('network request failed')
    || lower.includes('fetch failed')
  ) {
    return (
      'Não foi possível conectar ao Supabase para autenticar. '
      + 'Verifique VITE_SUPABASE_PLATFORM_URL, chave pública e sua conexão de rede.'
    );
  }
  return message || 'Falha no login SaaS.';
}

function normalizeRole(value) {
  const role = String(value || '').trim().toLowerCase();
  if (!role) return 'recepcao';
  if (['owner', 'admin'].includes(role)) return 'admin';
  if (['manager', 'gerente'].includes(role)) return 'gerente';
  if (['finance', 'financial', 'financeiro'].includes(role)) return 'financeiro';
  if (['sales', 'commercial', 'comercial'].includes(role)) return 'comercial';
  if (['doctor', 'dentist', 'dentista', 'professional', 'profissional'].includes(role)) return 'profissional';
  if (['reception', 'recepcao', 'atendimento', 'support'].includes(role)) return 'recepcao';
  return role;
}

export function isSaasModeEnabled() {
  return (
    import.meta.env.VITE_ACCESS_SAAS_ENABLED === '1'
    || (
      import.meta.env.DEV
      && Boolean(import.meta.env.VITE_SUPABASE_PLATFORM_URL)
      && Boolean(import.meta.env.VITE_SUPABASE_PLATFORM_ANON_KEY)
    )
  );
}

export async function fetchSaasAccessBootstrap(client = supabasePlatformClient) {
  if (!client) {
    throw new Error('Supabase da plataforma não configurado para o modo SaaS.');
  }
  const { data, error } = await client.rpc('get_app_user_tenant_access');
  if (error) {
    throw new Error(error.message || 'Falha ao carregar acesso SaaS da clínica.');
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.tenant_id) {
    throw new Error('Seu usuário não está vinculado a nenhuma clínica ativa.');
  }
  return {
    tenantId: row.tenant_id,
    role: normalizeRole(row.role),
    isActive: row.is_active !== false,
  };
}

export async function signInSaasWithPassword(email, password) {
  const client = supabasePlatformClient;
  // #region agent log
  fetch('http://127.0.0.1:7670/ingest/eace1904-3925-4199-865e-1f5223af263b',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'35f1e2'},body:JSON.stringify({sessionId:'35f1e2',runId:'run1',hypothesisId:'H1',location:'src/services/saasAuthService.js:signInSaasWithPassword:start',message:'SaaS login started',data:{hasClient:Boolean(client),hasEmail:Boolean(String(email||'').trim())},timestamp:Date.now()})}).catch(()=>{});
  // #endregion
  if (!client) {
    throw new Error('Supabase da plataforma não configurado para login SaaS.');
  }
  const { data: signData, error: signError } = await client.auth.signInWithPassword({
    email: String(email || '').trim().toLowerCase(),
    password,
  });
  if (signError) {
    // #region agent log
    fetch('http://127.0.0.1:7670/ingest/eace1904-3925-4199-865e-1f5223af263b',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'35f1e2'},body:JSON.stringify({sessionId:'35f1e2',runId:'run1',hypothesisId:'H2',location:'src/services/saasAuthService.js:signInSaasWithPassword:error',message:'SaaS login signIn error',data:{code:String(signError?.code||''),message:String(signError?.message||'')},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    throw new Error(mapSaasAuthError(signError));
  }
  const bootstrap = await fetchSaasAccessBootstrap(client);
  // #region agent log
  fetch('http://127.0.0.1:7670/ingest/eace1904-3925-4199-865e-1f5223af263b',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'35f1e2'},body:JSON.stringify({sessionId:'35f1e2',runId:'run1',hypothesisId:'H3',location:'src/services/saasAuthService.js:signInSaasWithPassword:bootstrap',message:'SaaS bootstrap resolved',data:{hasTenantId:Boolean(bootstrap?.tenantId),isActive:Boolean(bootstrap?.isActive),role:String(bootstrap?.role||'')},timestamp:Date.now()})}).catch(()=>{});
  // #endregion
  if (!bootstrap.isActive) {
    await client.auth.signOut();
    throw new Error('Seu acesso a esta clínica está desativado.');
  }
  return {
    authUserId: signData?.user?.id || signData?.session?.user?.id || '',
    email: signData?.user?.email || signData?.session?.user?.email || '',
    userMetadata: signData?.user?.user_metadata || signData?.session?.user?.user_metadata || {},
    tenantId: bootstrap.tenantId,
    role: bootstrap.role,
    isActive: bootstrap.isActive,
  };
}
