import { formatCurrencyBRL } from '../../../utils/currency.js';
import { BudgetStatusBadge } from './BudgetStatusBadge.jsx';
import { formatPaymentOptionLabel } from './budgetUtils.js';

export function BudgetSummarySidebar({ originalValue, discount, finalValue, acceptedOption, status }) {
  return (
    <aside className="clinical-budget-sidebar">
      <div className="clinical-summary-card clinical-summary-card--budget">
        <h3>Resumo financeiro</h3>
        <dl className="clinical-summary-list clinical-summary-list--planning">
          <div>
            <dt>Valor original</dt>
            <dd>{formatCurrencyBRL(originalValue)}</dd>
          </div>
          <div>
            <dt>Desconto</dt>
            <dd className="clinical-summary-discount">- {formatCurrencyBRL(discount)}</dd>
          </div>
        </dl>
        <div className="clinical-summary-total clinical-summary-total--planning">
          <span>Valor final</span>
          <strong>{formatCurrencyBRL(finalValue)}</strong>
        </div>
        <dl className="clinical-budget-sidebar-extra">
          <div>
            <dt>Forma escolhida</dt>
            <dd>{formatPaymentOptionLabel(acceptedOption)}</dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd><BudgetStatusBadge status={status} /></dd>
          </div>
        </dl>
      </div>
    </aside>
  );
}
