import { useMemo } from 'react';
import {
  getLeadSourceLabelsMap,
  getInterestLabelsMap,
  ensureCrmSettingsForTenant,
} from '../../services/crmSettingsService.js';
import { LEAD_SOURCE_LABELS, LEAD_INTEREST_LABELS } from '../../services/crmService.js';

/**
 * Labels de origem e interesse configuráveis por tenant (fallback para enums legados).
 */
export function useCrmTenantLabels(user, tenantId) {
  return useMemo(() => {
    if (user && tenantId) {
      try {
        ensureCrmSettingsForTenant(user);
      } catch {
        // tenant opcional em dev
      }
    }
    const sourceLabels = tenantId ? getLeadSourceLabelsMap(tenantId) : LEAD_SOURCE_LABELS;
    const interestLabels = tenantId ? getInterestLabelsMap(tenantId) : LEAD_INTEREST_LABELS;
    const sourceOptions = Object.entries(sourceLabels).map(([value, label]) => ({ value, label }));
    const interestOptions = Object.entries(interestLabels).map(([value, label]) => ({ value, label }));
    return { sourceLabels, interestLabels, sourceOptions, interestOptions };
  }, [user, tenantId]);
}
