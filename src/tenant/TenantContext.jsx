import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../auth/useAuth.js';
import { TenantContext } from './tenantContext.js';
import { subscribeTenantRealtimeChanges } from '../services/tenantContextService.js';
import { readTenantAccessSnapshot } from '../services/platformAccessService.js';
import { isFeatureFlagEnabled, isModuleEnabled } from './tenantAccess.js';
import { raceWithTimeout } from '../utils/async.js';
import { auditTenantAccess } from '../services/tenantIsolation.js';
import { isTransientAuthError } from '../auth/saasSessionResolver.js';
import { emitStabilityLog } from '../services/stabilityLogService.js';
import { getTenantSnapshotTimeoutMessage } from '../config/adminApiBase.js';
import { backfillCollaboratorTenantIds, reconcileSaasTeamRoster } from '../services/tenantTeamRosterSync.js';
import { ensureSaasUserInLocalDb } from '../services/saasUserSeedService.js';
import { syncTeamRosterPermissionStates, syncCurrentUserPermissionsFromContext } from '../services/collaboratorPermissionPersistence.js';
import { getPermissionsCatalog } from '../services/accessService.js';
import { isSaasModeEnabled } from '../services/saasAuthService.js';
import { syncTenantClinicProfileToLocalDb } from '../services/tenantClinicProfileSync.js';
import { tenantAudit, startTenantAuditTimer } from '../services/tenantAuditLog.js';
import { normalizeClinicProfileForClient } from '../utils/clinicLogo.js';

/** Curto o suficiente para não travar a tela; o erro oferece retry e volta ao login. */
const TENANT_SNAPSHOT_TIMEOUT_MS = 20000;
const TENANT_SNAPSHOT_TIMEOUT_MSG = getTenantSnapshotTimeoutMessage();

const REFRESH_INTERVAL_MS = 5 * 60 * 1000;
const EMPTY_CONTEXT = {
  tenant: null,
  clinicProfile: null,
  modules: {},
  flags: {},
  limits: {},
  subscription: null,
  warnings: [],
  currentUser: null,
  teamRoster: [],
  access: null,
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
    const elapsed = startTenantAuditTimer();
    try {
      if (!silent) {
        setError('');
        setLoading(true);
      }
      tenantAudit('TENANT_CONTEXT', {
        user_id: user?.id,
        email: user?.email,
        tenant_id: user?.tenantId,
        role: user?.role,
        source: 'tenant_users',
        status: 'start',
      });
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
      setTenantContext({
        ...context,
        clinicProfile: normalizeClinicProfileForClient(context?.clinicProfile),
      });
      hasLoadedOnce.current = true;
      if (!silent) setError('');
      emitStabilityLog('TENANT_CONTEXT_OK', { tenantId: user.tenantId, source: silent ? 'background' : 'foreground' });
      tenantAudit('TENANT_CONTEXT', {
        user_id: user?.id,
        email: user?.email,
        tenant_id: user?.tenantId,
        role: context?.currentUser?.role || user?.role,
        source: 'tenant_users',
        duration_ms: elapsed(),
        status: 'ok',
        extra: { clinic_profile: Boolean(context?.clinicProfile?.tenant_id) },
      });
      if (isSaasModeEnabled() && user?.tenantId) {
        if (!context?.clinicProfile?.tenant_id) {
          emitStabilityLog('TENANT_PROFILE_MISSING', { tenantId: user.tenantId, userId: user.id });
        } else {
          syncTenantClinicProfileToLocalDb(context.clinicProfile, user.tenantId);
        }
        try {
          reconcileSaasTeamRoster(context?.teamRoster, user.tenantId);
          const catalogIds = getPermissionsCatalog().map((p) => p.id);
          syncTeamRosterPermissionStates(context?.teamRoster, user.tenantId, catalogIds);
          syncCurrentUserPermissionsFromContext(context?.currentUser, user, catalogIds);
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
      const message = String(err?.message || err || 'Falha ao carregar contexto do tenant.');
      emitStabilityLog('TENANT_CONTEXT_FAILED', {
        tenantId: user?.tenantId || null,
        source: silent ? 'background' : 'foreground',
        reason: message,
      });
      tenantAudit('TENANT_CONTEXT', {
        user_id: user?.id,
        email: user?.email,
        tenant_id: user?.tenantId,
        role: user?.role,
        source: 'tenant_users',
        duration_ms: elapsed(),
        status: 'error',
        error: message,
      });
      if (!silent) {
        setError(message);
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
