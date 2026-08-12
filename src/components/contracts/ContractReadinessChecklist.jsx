import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { buildContractPrerequisiteResolutionCards } from '../../contracts/contractPrerequisitesResolution.js';

/**
 * Painel "Dados obrigatórios pendentes" com CTAs de resolução contextual.
 * A habilitação de gerar contrato continua vindo de checklist.canGenerate (validações reais).
 */
export function ContractReadinessChecklist({
  checklist,
  className = '',
  resolutionContext = null,
  onResolve = null,
}) {
  if (!checklist) return null;

  const resolution = resolutionContext
    ? buildContractPrerequisiteResolutionCards({
      checklist,
      patientId: resolutionContext.patientId,
      appointmentId: resolutionContext.appointmentId,
      budgetId: resolutionContext.budgetId,
      contractId: resolutionContext.contractId,
    })
    : null;

  const { groups = {}, partyLabel, warnings = [], canGenerate } = checklist;
  const hasPending = resolution
    ? resolution.cards.some((card) => card.status === 'pending')
    : Object.values(groups).some((items) => items?.length);

  if (!hasPending && canGenerate) {
    return (
      <div
        className={`contract-readiness contract-readiness--ok ${className}`.trim()}
        role="status"
        data-testid="contract-readiness-ok"
      >
        <p><strong>Pronto para gerar contrato</strong></p>
        <p className="contract-readiness-meta">Modelo: {partyLabel}</p>
      </div>
    );
  }

  if (!hasPending) return null;

  return (
    <div
      className={`contract-readiness contract-readiness--pending ${className}`.trim()}
      role="status"
      data-testid="contract-readiness-pending"
    >
      <p><strong>{canGenerate ? 'Atenção antes do envio' : 'Dados obrigatórios pendentes'}</strong></p>
      <p className="contract-readiness-meta">Qualificação: {partyLabel}</p>

      {resolution ? (
        <div className="contract-readiness-cards">
          {resolution.cards.map((card) => (
            <article
              key={card.group}
              className={`contract-readiness-card contract-readiness-card--${card.status}`}
              data-testid={`contract-prereq-card-${card.group}`}
              data-status={card.status}
            >
              <header className="contract-readiness-card__head">
                {card.status === 'complete' ? (
                  <CheckCircle2 size={16} aria-hidden className="contract-readiness-card__icon is-ok" />
                ) : (
                  <AlertTriangle size={16} aria-hidden className="contract-readiness-card__icon is-warn" />
                )}
                <h4>{card.title}</h4>
              </header>

              {card.status === 'complete' ? (
                <p className="contract-readiness-card__complete">{card.completeLabel}</p>
              ) : (
                <>
                  <ul className="contract-readiness-card__list">
                    {card.items.map((item) => (
                      <li key={item.tag || item.label} className={item.critical ? 'is-critical' : ''}>
                        <span aria-hidden>⚠</span>
                        <span>{item.label}</span>
                      </li>
                    ))}
                  </ul>
                  {card.destination?.href && card.destination.mode !== 'blocked' ? (
                    <button
                      type="button"
                      className="button secondary contract-readiness-card__cta"
                      data-testid={`contract-prereq-cta-${card.group}`}
                      data-action={card.destination.action}
                      data-patient-id={card.destination.patientId || ''}
                      data-appointment-id={card.destination.appointmentId || ''}
                      data-budget-id={card.destination.budgetId || ''}
                      onClick={() => onResolve?.(card)}
                    >
                      {card.destination.ctaLabel}
                    </button>
                  ) : null}
                </>
              )}
            </article>
          ))}
        </div>
      ) : (
        Object.entries(groups)
          .filter(([, items]) => items?.length)
          .map(([group, items]) => (
            <div key={group} className="contract-readiness-group">
              <h4>{group}</h4>
              <ul>
                {items.map((item) => (
                  <li key={item.tag} className={item.critical ? 'is-critical' : ''}>
                    {item.label}
                    {item.hint ? <span className="contract-readiness-hint"> — {item.hint}</span> : null}
                  </li>
                ))}
              </ul>
            </div>
          ))
      )}

      {warnings.length ? (
        <div className="contract-readiness-warnings">
          {warnings.map((w) => <p key={w}>{w}</p>)}
        </div>
      ) : null}
    </div>
  );
}
