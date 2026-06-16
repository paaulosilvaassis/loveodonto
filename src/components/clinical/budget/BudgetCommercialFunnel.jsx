import { Check, Lock } from 'lucide-react';
import { resolveFunnelSteps } from './budgetCommercialUtils.js';

const STATUS_LABELS = {
  done: 'Concluído',
  current: 'Em andamento',
  pending: 'Pendente',
  blocked: 'Bloqueado',
};

export function BudgetCommercialFunnel({ budget, financials, lockCtx }) {
  const steps = resolveFunnelSteps(budget, financials, lockCtx);

  return (
    <nav className="budget-premium-funnel" aria-label="Progresso comercial do orçamento">
      <ol className="budget-premium-funnel-track">
        {steps.map((step, index) => {
          const status = step.status || (step.done ? 'done' : 'pending');
          const rowClass = [
            'budget-premium-funnel-step',
            `is-${status}`,
          ].join(' ');

          return (
            <li key={step.key} className={rowClass}>
              <span className="budget-premium-funnel-marker" aria-hidden>
                {status === 'done' ? <Check size={12} strokeWidth={3} /> : null}
                {status === 'blocked' ? <Lock size={10} /> : null}
                {!step.done && status !== 'blocked' ? index + 1 : null}
              </span>
              <div className="budget-premium-funnel-body">
                <span className="budget-premium-funnel-label">{step.label}</span>
                <span className={`budget-premium-funnel-badge is-${status}`}>
                  {STATUS_LABELS[status]}
                </span>
              </div>
              {index < steps.length - 1 ? (
                <span className="budget-premium-funnel-connector" aria-hidden />
              ) : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
