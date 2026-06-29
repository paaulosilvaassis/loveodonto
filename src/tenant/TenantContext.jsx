import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../auth/useAuth.js';
import { TenantContext } from './tenantContext.js';
import { subscribeTenantRealtimeChanges } from '../services/tenantContextService.js';
import { readTenantAccessSnapshot } from '../services/platformAccessService.js';
import { isFeatureFlagEnabled, isModuleEnabled } from './tenantAccess.js';
import { raceWithTimeout } from '../utils/promiseTimeout.js';
import { auditTenantAccess } from '../services/tenantIsolation.js';
import { isTransientAuthError } from '../auth/saasSessionResolver.js';
import { emitStabilityLog } from '../services/stabilityLogService.js';
import { getTenantSnapshotTimeoutMessage } from '../config/adminApiBase.js';
import { backfillCollaboratorTenantIds, reconcileSaasTeamRoster } from '../services/tenantTeamRosterSync.js';
import { ensureSaasUserInLocalDb } from '../services/saasUserSeedService.js';
import { isSaasModeEnabled } from '../services/saasAuthService.js';

/** Curto o suficiente para não travar a tela; o erro oferece retry e volta ao login. */
const TENANT_SNAPSHOT_TIMEOUT_MS = 20000;
const TENANT_SNAPSHOT_TIMEOUT_MSG = getTenantSnapshotTimeoutMessage();

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
  const realtimeCleanupRef = useRef(null);

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
        (async () => {
          let lastErr;
          for (let attempt = 0; attempt < 3; attempt += 1) {
            if (attempt > 0) {
              await new Promise((r) => { setTimeout(r, 500 * attempt); });
            }
            try {
              return await readTenantAccessSnapshot(user.tenantId);
            } catch (err) {
              lastErr = err;
              if (!isTransientAuthError(err) || attempt === 2) throw err;
            }
          }
          throw lastErr;
        })(),
        TENANT_SNAPSHOT_TIMEOUT_MS,
        TENANT_SNAPSHOT_TIMEOUT_MSG,
      );
      setTenantContext(context);
      hasLoadedOnce.current = true;
      if (!silent) setError('');
      emitStabilityLog('TENANT_CONTEXT_OK', { tenantId: user.tenantId, source: silent ? 'background' : 'foreground' });
      if (isSaasModeEnabled() && user?.tenantId) {
        try {
          reconcileSaasTeamRoster(context?.teamRoster, user.tenantId);
          backfillCollaboratorTenantIds(user.tenantId);
          ensureSaasUserInLocalDb({
            ...user,
            collaboratorId: context?.currentUser?.collaboratorId || user.collaboratorId,
          });
        } catch (syncErr) {
          if (import.meta.env?.DEV) {
            console.debug('[TenantContext] roster sync skipped', syncErr?.message);
          }
        }
      }
      try {
        auditTenantAccess(user, {
          source: silent ? 'tenant_context_background' : 'tenant_context',
          linkStatus: context?.tenant?.status || 'active',
          extra: { tenant_name: context?.tenant?.trade_name || context?.tenant?.name || null },
        });
      } catch {
        /* sessão sem tenant — RequireTenantAccess bloqueia */
      }
    } catch (err) {
      emitStabilityLog('TENANT_CONTEXT_FAILED', {
        tenantId: user?.tenantId || null,
        source: silent ? 'background' : 'foreground',
        reason: String(err?.message || err || ''),
      });
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
    const timer = setTimeout(() => {
      const unsubscribe = subscribeTenantRealtimeChanges(user.tenantId, () => {
        refreshTenantContext(true);
      });
      realtimeCleanupRef.current = unsubscribe;
    }, 3000);
    return () => {
      clearTimeout(timer);
      if (realtimeCleanupRef.current) {
        realtimeCleanupRef.current();
        realtimeCleanupRef.current = null;
      }
    };
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
