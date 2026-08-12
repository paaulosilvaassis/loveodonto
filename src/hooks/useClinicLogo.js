import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth/useAuth.js';
import { useTenant } from '../tenant/useTenant.js';
import { loadDb } from '../db/index.js';
import { normalizeTenantId } from '../services/tenantIsolation.js';
import {
  getClinicLogo,
  hasClinicLogo,
  withClinicLogoCacheBust,
} from '../utils/clinicLogo.js';

/**
 * Fonte única da logomarca nas telas internas.
 * Prioridade: TenantContext.clinicProfile (API) → clinicProfile local do tenant atual.
 * Fallback Love Odonto apenas quando a clínica não tem logo.
 */
function readLocalClinicProfile(tenantId) {
  const tid = normalizeTenantId(tenantId);
  if (!tid) return null;
  try {
    const profile = loadDb()?.clinicProfile || null;
    const profileTid = normalizeTenantId(profile?.tenant_id || profile?.tenantId);
    if (!profileTid || profileTid !== tid) return null;
    return profile;
  } catch {
    return null;
  }
}

export function useClinicLogo() {
  const { user } = useAuth();
  const { clinicProfile: tenantClinicProfile, loading } = useTenant();
  const tenantId = user?.tenantId || '';
  const [localProfile, setLocalProfile] = useState(() => readLocalClinicProfile(tenantId));
  const [tick, setTick] = useState(0);

  useEffect(() => {
    setLocalProfile(readLocalClinicProfile(tenantId));
  }, [tenantId, tenantClinicProfile, tick]);

  useEffect(() => {
    const refresh = () => setTick((n) => n + 1);
    window.addEventListener('saas:clinic-profile-synced', refresh);
    window.addEventListener('saas:tenant-bootstrapped', refresh);
    return () => {
      window.removeEventListener('saas:clinic-profile-synced', refresh);
      window.removeEventListener('saas:tenant-bootstrapped', refresh);
    };
  }, []);

  const resolvedProfile = useMemo(() => {
    const fromTenant = tenantClinicProfile && normalizeTenantId(
      tenantClinicProfile.tenant_id || tenantClinicProfile.tenantId,
    ) === normalizeTenantId(tenantId)
      ? tenantClinicProfile
      : null;
    return fromTenant || localProfile || null;
  }, [tenantClinicProfile, localProfile, tenantId]);

  const rawLogo = getClinicLogo(resolvedProfile);
  const clinicLogo = withClinicLogoCacheBust(
    rawLogo,
    resolvedProfile?.updatedAt || resolvedProfile?.updated_at || tick,
  );

  return {
    clinicLogo,
    hasLogo: hasClinicLogo(resolvedProfile),
    clinicProfile: resolvedProfile,
    loading,
  };
}
