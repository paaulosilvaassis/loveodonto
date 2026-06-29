import { useEffect, useMemo, useState } from 'react';
import { getClinicSummaryAsync } from '../services/clinicService.js';
import { useAuth } from '../auth/useAuth.js';
import { useTenant } from '../tenant/useTenant.js';
import { buildClinicSummaryFromServerProfile } from '../services/tenantClinicProfileSync.js';
import { normalizeTenantId } from '../services/tenantIsolation.js';
import { isSaasModeEnabled } from '../services/saasAuthService.js';

const CACHE_KEY = 'clinic.summary.cache';
const CACHE_TTL = 5 * 60 * 1000;

const readCache = (sessionTenantId) => {
  const raw = sessionStorage.getItem(CACHE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (Date.now() - parsed.timestamp > CACHE_TTL) return null;
    const data = parsed.data;
    const cachedTenant = normalizeTenantId(data?.tenant_id);
    if (sessionTenantId && cachedTenant && cachedTenant !== sessionTenantId) return null;
    return data;
  } catch {
    return null;
  }
};

export const useClinicSummary = () => {
  const { user } = useAuth();
  const { clinicProfile, loading: tenantLoading } = useTenant();
  const sessionTenantId = normalizeTenantId(user?.tenantId);

  const serverSummary = useMemo(() => {
    if (!clinicProfile || !sessionTenantId) return null;
    if (normalizeTenantId(clinicProfile.tenant_id) !== sessionTenantId) return null;
    return buildClinicSummaryFromServerProfile(clinicProfile);
  }, [clinicProfile, sessionTenantId]);

  const [summary, setSummary] = useState(() => serverSummary || readCache(sessionTenantId));

  useEffect(() => {
    if (serverSummary) {
      setSummary(serverSummary);
      sessionStorage.setItem(CACHE_KEY, JSON.stringify({ data: serverSummary, timestamp: Date.now() }));
      return undefined;
    }

    if (isSaasModeEnabled() && tenantLoading) {
      return undefined;
    }

    let cancelled = false;
    const load = () => {
      getClinicSummaryAsync(sessionTenantId).then((next) => {
        if (cancelled || !next) return;
        setSummary(next);
        sessionStorage.setItem(CACHE_KEY, JSON.stringify({ data: next, timestamp: Date.now() }));
      });
    };
    load();

    const onBootstrap = () => {
      try { sessionStorage.removeItem(CACHE_KEY); } catch { /* ignore */ }
      load();
    };
    window.addEventListener('saas:tenant-bootstrapped', onBootstrap);
    window.addEventListener('saas:clinic-profile-synced', onBootstrap);
    return () => {
      cancelled = true;
      window.removeEventListener('saas:tenant-bootstrapped', onBootstrap);
      window.removeEventListener('saas:clinic-profile-synced', onBootstrap);
    };
  }, [serverSummary, sessionTenantId, tenantLoading]);

  return summary;
};
