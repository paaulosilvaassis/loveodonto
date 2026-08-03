import { DollarSign } from 'lucide-react';
import { ClinicalBtn } from '../ClinicalStageShell.jsx';
import { formatPlanningMoney } from './planningUtils.js';

export function PlanningSummaryPanel({ summary, onGenerateBudget, showCta }) {
  return (
    <div className="clinical-summary-card clinical-summary-card--planning">
      <h3>Resumo financeiro</h3>
      <dl className="clinical-summary-list clinical-summary-list--planning">
        <div>
          <dt>Procedimentos</dt>
          <dd>{summary.count}</dd>
        </div>
        <div>
          <dt>Subtotal</dt>
          <dd>{formatPlanningMoney(summary.subtotal)}</dd>
        </div>
        <div>
          <dt>Descontos</dt>
          <dd className="clinical-summary-discount">- {formatPlanningMoney(summary.discounts)}</dd>
        </div>
        <div>
          <dt>Valor médio / proc.</dt>
          <dd>{formatPlanningMoney(summary.average)}</dd>
        </div>
      </dl>
      <div className="clinical-summary-total clinical-summary-total--planning">
        <span>Total planejado</span>
        <strong>{formatPlanningMoney(summary.total)}</strong>
      </div>
      {showCta ? (
        <ClinicalBtn
          variant="primary"
          icon={DollarSign}
          onClick={onGenerateBudget}
          className="clinical-summary-cta"
        >
          Gerar orçamento
        </ClinicalBtn>
      ) : null}
    </div>
  );
}
