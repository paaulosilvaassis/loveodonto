/**
 * Re-exporta API legada + dashboard operacional completo.
 */
export {
  getAppointmentTypeLabel,
  getAppointmentStatusLabel,
  getDayKpis,
  getDayFlow,
  getPacientesAcompanhamento,
  getAlertasOperacionais,
  PRIORITY,
} from './gestaoAtendimentoLegacy.js';

export {
  getOperationalDashboard,
  getFilterOptions,
  getDisplayStatus,
  DISPLAY_STATUS,
} from './gestaoAtendimentoDashboard.js';
