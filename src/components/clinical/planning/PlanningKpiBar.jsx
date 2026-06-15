import { formatPlanningMoney } from './planningUtils.js';

export function PlanningKpiBar({ count, total, discounts }) {
  return (
    <div className="clinical-planning-kpi-bar">
      <div className="clinical-planning-kpi">
        <span className="clinical-planning-kpi-label">Procedimentos</span>
        <strong className="clinical-planning-kpi-value">{count}</strong>
      </div>
      <div className="clinical-planning-kpi clinical-planning-kpi--primary">
        <span className="clinical-planning-kpi-label">Valor total</span>
        <strong className="clinical-planning-kpi-value">{formatPlanningMoney(total)}</strong>
      </div>
      <div className="clinical-planning-kpi">
        <span className="clinical-planning-kpi-label">Desconto aplicado</span>
        <strong className="clinical-planning-kpi-value clinical-planning-kpi-value--discount">
          {formatPlanningMoney(discounts)}
        </strong>
      </div>
    </div>
  );
}
