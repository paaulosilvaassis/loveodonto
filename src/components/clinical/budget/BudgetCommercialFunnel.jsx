import { Check } from 'lucide-react';
import { resolveFunnelSteps } from './budgetCommercialUtils.js';

export function BudgetCommercialFunnel({ budget, financials }) {
  const steps = resolveFunnelSteps(budget, financials);
  const currentIndex = steps.findIndex((s) => !s.done);
  const activeIndex = currentIndex === -1 ? steps.length - 1 : currentIndex;

  return (
    <nav className="clinical-budget-funnel" aria-label="Funil comercial do orçamento">
      {steps.map((step, index) => {
        const isDone = step.done;
        const isCurrent = index === activeIndex && !isDone;
        const rowClass = [
          'clinical-budget-funnel-step',
          isDone ? 'is-done' : '',
          isCurrent ? 'is-current' : '',
        ].filter(Boolean).join(' ');
        return (
          <div key={step.key} className={rowClass}>
            <span className="clinical-budget-funnel-icon">
              {isDone ? <Check size={12} strokeWidth={3} /> : index + 1}
            </span>
            <span className="clinical-budget-funnel-label">{step.label}</span>
          </div>
        );
      })}
    </nav>
  );
}
