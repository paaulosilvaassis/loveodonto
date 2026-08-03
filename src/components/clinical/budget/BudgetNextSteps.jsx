import { ArrowRight, CheckCircle2, AlertCircle, Clock } from 'lucide-react';

const ICONS = {
  success: CheckCircle2,
  warning: AlertCircle,
  info: Clock,
  primary: ArrowRight,
};

export function BudgetNextSteps({ steps = [] }) {
  if (!steps.length) return null;

  return (
    <section className="budget-tab-next-steps">
      <h4>Próximos passos</h4>
      <ul>
        {steps.map((step) => {
          const Icon = ICONS[step.tone] || ArrowRight;
          return (
            <li key={step.id} className={`budget-tab-next-step tone-${step.tone || 'info'}`}>
              <Icon size={14} aria-hidden />
              <span>{step.label}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
