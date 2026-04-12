/** Chave compartilhada com logoutWithReason em AuthContext (sessionStorage). */
export const LOGOUT_REASON_KEY = 'appgestaoodonto.logout_reason';

/** Lê e remove o motivo do logout (ex.: redirect da tela de login). Módulo separado para não quebrar Fast Refresh do AuthContext. */
export function consumeLogoutReason() {
  const raw = sessionStorage.getItem(LOGOUT_REASON_KEY);
  if (raw) sessionStorage.removeItem(LOGOUT_REASON_KEY);
  return raw || '';
}
