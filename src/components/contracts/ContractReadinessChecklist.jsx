import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { buildContractPrerequisiteResolutionCards } from '../../contracts/contractPrerequisitesResolution.js';

/**
 * Central de resolução de pendências do contrato.
 * canGenerate continua vindo do validator real (checklist.canGenerate).
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
      professionalId: resolutionContext.professionalId,
    })
    : null;

  const { groups = {}, partyLabel, warnings = [], canGenerate } = checklist;
  const hasPending = resolution
    ? resolution.cards.some((card) => card.status === 'pending')
    : Object.values(groups).some((items) => items?.length);
  const hasBlocking = resolution
    ? resolution.cards.some((card) => card.status === 'pending' && card.isBlocking)
    : !canGenerate;

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

  const panelTone = hasBlocking ? 'pending' : 'warn';
  const title = canGenerate
    ? 'Pendências corrigíveis'
    : 'Requisitos pendentes';
  const subtitle = canGenerate
    ? `Qualificação: ${partyLabel}`
    : 'Resolva os itens abaixo para liberar o contrato.';

  return (
    <div
      className={`contract-readiness contract-readiness--${panelTone} ${className}`.trim()}
      role="status"
      data-testid="contract-readiness-pending"
    >
      <p><strong>{title}</strong></p>
      <p className="contract-readiness-meta">{subtitle}</p>

      {resolution ? (
        <div className="contract-readiness-cards">
          {resolution.cards.map((card) => (
            <article
              key={card.group}
              className={[
                'contract-readiness-card',
                `contract-readiness-card--${card.status}`,
                card.status === 'pending' && card.isBlocking ? 'is-blocking' : '',
              ].filter(Boolean).join(' ')}
              data-testid={`contract-prereq-card-${card.group}`}
              data-status={card.status}
              data-blocking={card.isBlocking ? 'true' : 'false'}
            >
              <header className="contract-readiness-card__head">
                {card.status === 'complete' ? (
                  <CheckCircle2 size={16} aria-hidden className="contract-readiness-card__icon is-ok" />
                ) : (
                  <AlertTriangle
                    size={16}
                    aria-hidden
                    className={`contract-readiness-card__icon ${card.isBlocking ? 'is-critical' : 'is-warn'}`}
                  />
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
                      data-professional-id={card.destination.professionalId || ''}
                      onClick={() => onResolve?.(card)}
                    >
                      {card.destination.ctaLabel}
                    </button>
                  ) : card.explicitlyNonActionable || card.destination?.mode === 'blocked' ? (
                    <p
                      className="contract-readiness-card__nonactionable"
                      data-testid={`contract-prereq-nonactionable-${card.group}`}
                    >
                      {card.nonActionableReason || card.destination?.reason}
                    </p>
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
