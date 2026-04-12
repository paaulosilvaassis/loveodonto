import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth/useAuth.js';
import { TenantContext } from './tenantContext.js';
import { subscribeTenantRealtimeChanges } from '../services/tenantContextService.js';
import { readTenantAccessSnapshot } from '../services/platformAccessService.js';
import { isFeatureFlagEnabled, isModuleEnabled } from './tenantAccess.js';
import { raceWithTimeout } from '../utils/promiseTimeout.js';

const TENANT_SNAPSHOT_TIMEOUT_MS = 40000;

const REFRESH_INTERVAL_MS = 5 * 60 * 1000;
const EMPTY_CONTEXT = {
  tenant: null,
  modules: {},
  flags: {},
  limits: {},
  subscription: null,
  warnings: [],
};

export function TenantProvider({ children }) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [tenantContext, setTenantContext] = useState(EMPTY_CONTEXT);

  const refreshTenantContext = async () => {
    if (!user?.tenantId) {
      setTenantContext(EMPTY_CONTEXT);
      setError('');
      setLoading(false);
      return;
    }
    try {
      setError('');
      setLoading(true);
      const context = await raceWithTimeout(
        readTenantAccessSnapshot(user.tenantId),
        TENANT_SNAPSHOT_TIMEOUT_MS,
        'Tempo esgotado ao carregar dados da clínica (rede ou API). Verifique o backend em :3001 e tente novamente.',
      );
      setTenantContext(context);
    } catch (err) {
      setError(err?.message || 'Falha ao carregar contexto do tenant.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshTenantContext();
  }, [user?.id, user?.tenantId]);

  useEffect(() => {
    if (!user?.tenantId) return undefined;
    const timer = setInterval(() => {
      refreshTenantContext();
    }, REFRESH_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [user?.tenantId]);

  useEffect(() => {
    if (!user?.tenantId) return undefined;
    const unsubscribe = subscribeTenantRealtimeChanges(user.tenantId, () => {
      refreshTenantContext();
    });
    return () => unsubscribe();
  }, [user?.tenantId]);

  const value = useMemo(
    () => ({
      ...tenantContext,
      loading,
      error,
      refreshTenantContext,
      hasModule: (moduleName) => isModuleEnabled(tenantContext.modules, moduleName),
      hasFeature: (flagKey) => isFeatureFlagEnabled(tenantContext.flags, flagKey),
    }),
    [tenantContext, loading, error]
  );

  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>;
}
