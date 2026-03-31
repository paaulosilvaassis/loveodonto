import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';
import { getTenantContext as fetchTenantContext, subscribeTenantRealtimeChanges } from '../services/tenantContextService.js';
import { isFeatureFlagEnabled, isModuleEnabled } from './tenantAccess.js';

const TenantContext = createContext(null);
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
  const { user, logoutWithReason } = useAuth();
  const [loading, setLoading] = useState(true);
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
      const context = await fetchTenantContext(user.tenantId);
      setTenantContext(context);
      const status = String(context?.tenant?.status || '').toLowerCase();
      if (status === 'blocked') {
        logoutWithReason('Sua clínica foi bloqueada pela plataforma. Acesso encerrado.');
        return;
      }
      if (status === 'suspended') {
        logoutWithReason('Sua clínica está suspensa no momento. Acesso encerrado.');
      }
    } catch (err) {
      setError(err?.message || 'Falha ao carregar contexto do tenant.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
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

export function useTenant() {
  const ctx = useContext(TenantContext);
  if (!ctx) throw new Error('useTenant deve ser usado dentro de TenantProvider.');
  return ctx;
}
