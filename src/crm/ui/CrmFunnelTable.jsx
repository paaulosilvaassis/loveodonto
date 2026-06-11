/**
 * Tabela do funil comercial — etapa, quantidade, % acumulado e conversão entre etapas.
 */
export function CrmFunnelTable({ funnelSteps, gargalo, onStageClick }) {
  if (!funnelSteps?.length) {
    return <p className="crm-dash-empty">Sem dados de funil no período.</p>;
  }

  return (
    <>
      {gargalo && (
        <div className="crm-mgr-gargalo" role="status">
          <span className="crm-mgr-gargalo-icon" aria-hidden="true">⚠</span>
          <span>
            <strong>Maior gargalo:</strong>
            {' '}Perda de {gargalo.dropPercent}% entre {gargalo.fromLabel} → {gargalo.toLabel}
          </span>
        </div>
      )}
      <div className="crm-dash-table-wrap">
        <table className="crm-dash-table crm-mgr-funnel-table">
          <thead>
            <tr>
              <th>Etapa</th>
              <th>Quantidade</th>
              <th>%</th>
              <th>Conversão</th>
            </tr>
          </thead>
          <tbody>
            {funnelSteps.map((step) => (
              <tr key={step.stageKey}>
                <td className="crm-dash-table-name">
                  {onStageClick ? (
                    <button
                      type="button"
                      className="crm-mgr-funnel-link"
                      onClick={() => onStageClick(step.stageKey)}
                    >
                      {step.label}
                    </button>
                  ) : (
                    step.label
                  )}
                </td>
                <td><strong>{step.totalEtapa}</strong></td>
                <td>{step.conversaoAcumulada}%</td>
                <td>
                  {step.conversaoEtapa === 100 && step.stageKey === funnelSteps[0]?.stageKey
                    ? '—'
                    : `${step.conversaoEtapa}%`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
