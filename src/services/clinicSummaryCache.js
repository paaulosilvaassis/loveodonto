/**
 * Invalida cache sessionStorage do resumo da clínica (branding sidebar).
 */
export function invalidateClinicSummaryCache() {
  const CLINIC_SUMMARY_CACHE_KEY = 'clinic.summary.cache';
  try {
    sessionStorage.removeItem(CLINIC_SUMMARY_CACHE_KEY);
  } catch {
    /* ignore */
  }
}
