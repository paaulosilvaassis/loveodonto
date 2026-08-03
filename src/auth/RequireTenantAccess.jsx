import TenantAccessBlockedPage from '../pages/TenantAccessBlockedPage.jsx';
import TenantNoMembershipPage from '../pages/TenantNoMembershipPage.jsx';
import { useTenant } from '../tenant/useTenant.js';
import { useAuth } from './useAuth.js';
import { emitStabilityLog } from '../services/stabilityLogService.js';
import { DEV_BACKEND_NOT_RUNNING_MSG } from '../config/adminApiBase.js';
import { isSaasModeEnabled } from '../services/saasAuthService.js';

function classifyTenantError(message) {
  const lower = String(message || '').toLowerCase();
  if (lower.includes('token') || lower.includes('jwt') || lower.includes('sessão') || lower.includes('401')) {
    return {
      code: 'AUTH_FAILED',
      title: 'Sua sessão precisa ser renovada',
      help: 'Faça login novamente somente se o problema persistir após tentar recarregar.',
    };
  }
  if (lower.includes('tenant') || lower.includes('clínica') || lower.includes('vínculo')) {
    return {
      code: 'TENANT_CONTEXT_FAILED',
      title: 'Falha ao carregar dados da clínica',
      help: 'O sistema manteve sua sessão. Tente recarregar o contexto.',
    };
  }
  if (
    lower.includes('3001')
    || lower.includes('backend local')
    || lower.includes('backend saas')
    || lower.includes('backend')
    || lower.includes('network')
    || lower.includes('fetch')
    || lower.includes('tempo esgotado')
  ) {
    return {
      code: 'BACKEND_FAILED',
      title: 'Backend indisponível',
      help: import.meta.env.DEV ? DEV_BACKEND_NOT_RUNNING_MSG : 'Verifique se a API está ativa e tente novamente.',
    };
  }
  if (
    lower.includes('abort')
    || lower.includes('signal is aborted')
  ) {
    return {
      code: 'TENANT_CONTEXT_FAILED',
      title: 'Validação da clínica interrompida',
      help: 'Aguarde um instante e clique em Tentar novamente.',
    };
  }
  if (lower.includes('supabase') || lower.includes('vite_supabase') || lower.includes('configura')) {
    return {
      code: 'SUPABASE_CONFIG_FAILED',
      title: 'Configuração de Supabase inválida',
      help: 'Revise variáveis de ambiente do app e da plataforma.',
    };
  }
  return {
    code: 'TENANT_CONTEXT_FAILED',
    title: 'Erro ao validar acesso da clínica',
    help: 'Tente novamente. Se persistir, use a página de diagnóstico.',
  };
}

export default function RequireTenantAccess({ children }) {
  const { loading, error, isTenantBlocked, refreshTenantContext, tenant } = useTenant();
  const { logoutWithReason, user } = useAuth();

  const sessionTenantId = String(user?.tenantId || user?.tenant_id || '').trim();
  const contextTenantId = String(tenant?.id || '').trim();

  if (user && isSaasModeEnabled() && !sessionTenantId) {
    emitStabilityLog('TENANT_GUARD_BLOCKED', { reason: 'missing_session_tenant_id', userId: user.id });
    return <TenantNoMembershipPage />;
  }

  if (
    user
    && sessionTenantId
    && contextTenantId
    && sessionTenantId !== contextTenantId
  ) {
    emitStabilityLog('TENANT_GUARD_MISMATCH', {
      userId: user.id,
      sessionTenantId,
      contextTenantId,
    });
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', color: '#94a3b8', textAlign: 'center', padding: '1.5rem' }}>
        <div style={{ maxWidth: '28rem' }}>
          <p style={{ margin: '0 0 0.75rem' }}>Inconsistência de clínica detectada</p>
          <p className="muted" style={{ margin: '0 0 1rem', fontSize: '0.85rem' }}>
            Sua sessão não corresponde à clínica carregada. Faça login novamente.
          </p>
          <button
            type="button"
            className="button primary"
            onClick={() => {
              logoutWithReason('Sessão inconsistente com a clínica. Faça login novamente.');
              window.location.assign('/login');
            }}
          >
            Voltar ao login
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', color: '#94a3b8' }}>
        Carregando dados da clínica…
      </div>
    );
  }

  if (error) {
    const classified = classifyTenantError(error);
    emitStabilityLog(classified.code, { reason: String(error || '') });
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', color: '#94a3b8', textAlign: 'center', padding: '1.5rem' }}>
        <div style={{ maxWidth: '28rem' }}>
          <p style={{ margin: '0 0 0.75rem' }}>{classified.title}</p>
          <p style={{ margin: '0 0 1rem', fontSize: '0.85rem', color: '#ef4444' }}>{error}</p>
          <p className="muted" style={{ margin: '0 0 1rem', fontSize: '0.85rem' }}>{classified.help}</p>
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
            <button
              type="button"
              className="button primary"
              onClick={() => refreshTenantContext(false)}
            >
              Tentar novamente
            </button>
            <button
              type="button"
              className="button"
              style={{ opacity: 0.7 }}
              onClick={() => window.location.assign('/stability/health')}
            >
              Abrir diagnóstico
            </button>
            <button
              type="button"
              className="button"
              style={{ opacity: 0.7 }}
              onClick={() => {
                logoutWithReason('Não foi possível carregar os dados da clínica. Faça login novamente.');
                window.location.assign('/login');
              }}
            >
              Voltar ao login
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (isTenantBlocked) {
    return <TenantAccessBlockedPage />;
  }

  return children;
}

