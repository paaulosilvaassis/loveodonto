/**
 * Banner visível somente quando LOCAL TEST MODE está ativo (DEV + localhost + env).
 * Nunca deve renderizar em produção (a regra de hostname/DEV impede).
 */

import { isContractsOperationalUxLocalTestEnabled } from '../../../domain/contracts/rollout/contracts-operational-ux-local-test.ts';

export default function LocalOperationalUxTestBanner({
  serverGlobalEnabled = false,
  serverTenantEnabled = false,
  serverUxEnabled = false,
}) {
  if (!isContractsOperationalUxLocalTestEnabled()) return null;

  return (
    <div
      className="local-opux-test-banner"
      data-testid="local-operational-ux-test-banner"
      role="status"
    >
      <strong>AMBIENTE DE TESTE LOCAL — CONTRATOS</strong>
      <span>Nenhuma ativação de produção foi realizada.</span>
      <span className="local-opux-test-banner__meta">
        Servidor: {serverGlobalEnabled || serverTenantEnabled || serverUxEnabled ? 'parcial/ON' : 'OFF'}
        {' · '}
        Teste local: ON
        {' · '}
        global={serverGlobalEnabled ? 'ON' : 'OFF'}
        {' · '}
        tenant={serverTenantEnabled ? 'ON' : 'OFF'}
      </span>
    </div>
  );
}
