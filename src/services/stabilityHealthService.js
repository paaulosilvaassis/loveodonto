import { supabasePlatformClient } from '../lib/supabaseClients.js';
import { collectEnvSnapshot, validateCriticalEnv } from '../config/envGuard.js';
import { getTenantContext } from './tenantContextService.js';
import { emitStabilityLog } from './stabilityLogService.js';
import {
  assertAdminApiFetchAllowed,
  buildAdminApiUrl,
  getAdminApiBaseConfigError,
} from '../config/adminApiBase.js';

function checkResult(id, ok, details, remediation = '') {
  return { id, ok, details, remediation };
}

function looksLikeMissingMigration(message) {
  const lower = String(message || '').toLowerCase();
  return lower.includes('does not exist') || lower.includes('relation');
}

export async function runStabilityHealthCheck({ user, tenantId }) {
  const results = [];
  const envValidation = validateCriticalEnv();
  const env = collectEnvSnapshot();

  results.push(
    checkResult(
      'supabase-config',
      envValidation.ok,
      envValidation.ok ? 'Env crítica carregada e consistente.' : envValidation.issues.join(' '),
      envValidation.ok ? '' : 'Revise VITE_SUPABASE_APP_*, VITE_SUPABASE_PLATFORM_* e VITE_CONSOLE_*.',
    ),
  );

  const sameHost = Boolean(env.hosts.app && env.hosts.platform && env.hosts.app === env.hosts.platform);
  results.push(
    checkResult(
      'supabase-host-alignment',
      sameHost,
      sameHost ? `Host alinhado: ${env.hosts.app}` : `Hosts divergentes: app=${env.hosts.app || '-'} platform=${env.hosts.platform || '-'}`,
      sameHost ? '' : 'Evite misturar Supabase de app/console/plataforma.',
    ),
  );

  let session = null;
  try {
    if (!supabasePlatformClient) {
      throw new Error('Cliente Supabase da plataforma não inicializado.');
    }
    const { data, error } = await supabasePlatformClient.auth.getSession();
    if (error) throw error;
    session = data?.session || null;
    results.push(
      checkResult(
        'supabase-auth',
        Boolean(session),
        session ? 'Sessão Supabase ativa.' : 'Sem sessão ativa.',
        session ? '' : 'Faça login para validar tenant-context.',
      ),
    );
  } catch (error) {
    results.push(
      checkResult('supabase-auth', false, String(error?.message || error), 'Validar URL/chave Supabase e conectividade.'),
    );
  }

  const userLogged = Boolean(user?.id);
  results.push(
    checkResult(
      'user-logged',
      userLogged,
      userLogged ? `Usuário: ${user.email || user.id}` : 'Usuário não carregado no AuthContext.',
      userLogged ? '' : 'Reautenticar e recarregar.',
    ),
  );

  const hasTenantId = Boolean(tenantId || user?.tenantId);
  results.push(
    checkResult(
      'tenant-id',
      hasTenantId,
      hasTenantId ? `tenant_id: ${tenantId || user?.tenantId}` : 'tenant_id ausente no contexto.',
      hasTenantId ? '' : 'Validar vínculo tenant_users do usuário.',
    ),
  );

  const backendConfigError = getAdminApiBaseConfigError();
  if (backendConfigError) {
    results.push(
      checkResult(
        'backend-config',
        false,
        backendConfigError,
        'Defina VITE_PLATFORM_API_BASE_URL na Vercel com a URL pública da Admin API.',
      ),
    );
  }

  try {
    if (backendConfigError) {
      throw new Error(backendConfigError);
    }
    if (import.meta.env.PROD) {
      assertAdminApiFetchAllowed();
    }
    const healthResponse = await fetch(buildAdminApiUrl('/health'));
    results.push(
      checkResult(
        'backend-health',
        healthResponse.ok,
        healthResponse.ok ? 'Backend respondeu /health.' : `Backend respondeu HTTP ${healthResponse.status}.`,
        healthResponse.ok
          ? ''
          : (import.meta.env.PROD
            ? 'Verifique deploy da Admin API e CORS.'
            : 'Inicie a Admin API local (porta 3001) ou configure a URL base.'),
      ),
    );
  } catch (error) {
    results.push(
      checkResult(
        'backend-health',
        false,
        String(error?.message || error),
        import.meta.env.PROD
          ? 'Configure VITE_PLATFORM_API_BASE_URL e publique o server/.'
          : 'Backend indisponível. Inicie a Admin API local.',
      ),
    );
  }

  if (session?.access_token) {
    try {
      if (backendConfigError) {
        throw new Error(backendConfigError);
      }
      const response = await fetch(buildAdminApiUrl('/internal/app/tenant-context'), {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message = String(json?.error || `HTTP ${response.status}`);
        results.push(
          checkResult(
            'tenant-context-endpoint',
            false,
            message,
            looksLikeMissingMigration(message)
              ? 'Aplique migrations SaaS mínimas (tenant_users/invitations).'
              : 'Validar token, tenant_users e permissões.',
          ),
        );
      } else {
        results.push(checkResult('tenant-context-endpoint', true, 'Endpoint tenant-context respondeu.', ''));
      }
    } catch (error) {
      results.push(
        checkResult('tenant-context-endpoint', false, String(error?.message || error), 'Falha de rede/proxy para backend.'),
      );
    }
  } else {
    results.push(checkResult('tenant-context-endpoint', false, 'Sem sessão para consultar tenant-context.', 'Faça login antes.'));
  }

  if (hasTenantId) {
    try {
      const context = await getTenantContext(tenantId || user?.tenantId);
      const hasTenant = Boolean(context?.tenant?.id);
      results.push(
        checkResult('tenant-exists', hasTenant, hasTenant ? `Tenant carregado: ${context.tenant.id}` : 'Tenant não encontrado.', 'Reprovisionar tenant.'),
      );
      const hasPermissions = Boolean(context?.modules && Object.keys(context.modules).length > 0);
      results.push(
        checkResult(
          'permissions-loaded',
          hasPermissions,
          hasPermissions ? 'Módulos/permissões carregados.' : 'Sem módulos/permissões carregados.',
          hasPermissions ? '' : 'Verificar tenant_modules e feature_flags.',
        ),
      );
      emitStabilityLog('TENANT_CONTEXT_OK', { tenantId: context?.tenant?.id || null });
    } catch (error) {
      const message = String(error?.message || error);
      results.push(
        checkResult(
          'tenant-exists',
          false,
          message,
          looksLikeMissingMigration(message)
            ? 'Schema incompleto: aplique migrations SaaS.'
            : 'Validar tenant_users, tenants e backend.',
        ),
      );
      results.push(checkResult('permissions-loaded', false, 'Contexto não carregado devido a erro anterior.', 'Corrigir erro de tenant-context.'));
      emitStabilityLog('TENANT_CONTEXT_FAILED', { reason: message });
    }
  } else {
    results.push(checkResult('tenant-exists', false, 'Sem tenant_id para validação.', 'Login e vínculo tenant_users obrigatórios.'));
    results.push(checkResult('permissions-loaded', false, 'Sem tenant_id para validação.', 'Login e vínculo tenant_users obrigatórios.'));
  }

  return {
    generatedAt: new Date().toISOString(),
    overallOk: results.every((item) => item.ok),
    results,
  };
}

