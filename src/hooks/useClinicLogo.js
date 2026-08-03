import { useTenant } from '../tenant/useTenant.js';
import { getClinicLogo, hasClinicLogo } from '../utils/clinicLogo.js';

/**
 * Fonte única da logomarca nas telas internas (TenantContext → clinicProfile).
 */
export function useClinicLogo() {
  const { clinicProfile, loading } = useTenant();
  return {
    clinicLogo: getClinicLogo(clinicProfile),
    hasLogo: hasClinicLogo(clinicProfile),
    clinicProfile,
    loading,
  };
}
