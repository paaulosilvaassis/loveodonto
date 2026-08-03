export function ContractReadinessChecklist({ checklist, className = '' }) {
  if (!checklist) return null;

  const { groups = {}, partyLabel, warnings = [], canGenerate } = checklist;
  const groupLabels = {
    clinica: 'Clínica',
    paciente: 'Paciente',
    dependente: 'Dependente',
    responsavel: 'Responsável',
    contrato: 'Orçamento e contrato',
    tcle: 'Termos de consentimento (TCLE)',
    template: 'Modelo do contrato',
  };

  const entries = Object.entries(groups).filter(([, items]) => items?.length);

  if (!entries.length && canGenerate) {
    return (
      <div className={`contract-readiness contract-readiness--ok ${className}`.trim()} role="status">
        <p><strong>Pronto para gerar contrato</strong></p>
        <p className="contract-readiness-meta">Modelo: {partyLabel}</p>
      </div>
    );
  }

  return (
    <div className={`contract-readiness contract-readiness--pending ${className}`.trim()} role="status">
      <p><strong>{canGenerate ? 'Atenção antes do envio' : 'Dados obrigatórios pendentes'}</strong></p>
      <p className="contract-readiness-meta">Qualificação: {partyLabel}</p>
      {entries.map(([group, items]) => (
        <div key={group} className="contract-readiness-group">
          <h4>{groupLabels[group] || group}</h4>
          <ul>
            {items.map((item) => (
              <li key={item.tag} className={item.critical ? 'is-critical' : ''}>
                {item.label}
                {item.hint ? <span className="contract-readiness-hint"> — {item.hint}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ))}
      {warnings.length ? (
        <div className="contract-readiness-warnings">
          {warnings.map((w) => <p key={w}>{w}</p>)}
        </div>
      ) : null}
    </div>
  );
}
