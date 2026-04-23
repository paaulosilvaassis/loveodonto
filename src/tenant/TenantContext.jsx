import { useEffect, useMemo, useRef, useState } from 'react';
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
  const hasLoadedOnce = useRef(false);

  const refreshTenantContext = async (isBackground = false) => {
    if (!user?.tenantId) {
      setTenantContext(EMPTY_CONTEXT);
      setError('');
      setLoading(false);
      return;
    }
    const silent = isBackground && hasLoadedOnce.current;
    try {
      if (!silent) {
        setError('');
        setLoading(true);
      }
      const context = await raceWithTimeout(
        readTenantAccessSnapshot(user.tenantId),
        TENANT_SNAPSHOT_TIMEOUT_MS,
        'Tempo esgotado ao carregar dados da clínica (rede ou API). Verifique o backend em :3001 e tente novamente.',
      );
      setTenantContext(context);
      hasLoadedOnce.current = true;
      if (!silent) setError('');
    } catch (err) {
      if (!silent) {
        setError(err?.message || 'Falha ao carregar contexto do tenant.');
      }
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    hasLoadedOnce.current = false;
    refreshTenantContext(false);
  }, [user?.id, user?.tenantId]);

  useEffect(() => {
    if (!user?.tenantId) return undefined;
    const timer = setInterval(() => {
      refreshTenantContext(true);
    }, REFRESH_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [user?.tenantId]);

  useEffect(() => {
    if (!user?.tenantId) return undefined;
    const unsubscribe = subscribeTenantRealtimeChanges(user.tenantId, () => {
      refreshTenantContext(true);
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
