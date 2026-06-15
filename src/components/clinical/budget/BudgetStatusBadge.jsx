import { BUDGET_STATUS_BADGES } from '../clinicalAppointmentConfig.js';

export function BudgetStatusBadge({ status }) {
  const badge = BUDGET_STATUS_BADGES.find((b) => b.value === status) || BUDGET_STATUS_BADGES[0];
  return (
    <span className={`clinical-budget-status-badge tone-${badge.tone}`}>
      <span className="clinical-budget-status-dot" aria-hidden />
      {badge.label}
    </span>
  );
}
