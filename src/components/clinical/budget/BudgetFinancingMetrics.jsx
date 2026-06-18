import { formatCurrencyBRL } from '../../../utils/currency.js';
import {
  FINANCING_LABELS,
  formatAppliedRateLabel,
  formatEntryLabel,
} from './financingDisplayUtils.js';

function formatRateDisplay(rate, option) {
  return formatAppliedRateLabel(option || {}, { interestRate: rate });
}

/**
 * Painel de métricas financeiras — layout bancário, labels acima dos valores.
 */
export function BudgetFinancingMetrics({ summary, interestRate, option = {}, treatmentTotal = 0 }) {
  if (!summary) {
    return (
      <div className="budget-tab-fin-metrics budget-tab-fin-metrics--empty" role="status">
        <p>Preencha parceiro, entrada e parcelas para visualizar o resumo financeiro.</p>
      </div>
    );
  }

  const metrics = [
    {
      key: 'treatment',
      label: FINANCING_LABELS.treatment,
      value: formatCurrencyBRL(summary.totalAmount ?? treatmentTotal),
      emphasis: 'treatment',
    },
    {
      key: 'entry',
      label: FINANCING_LABELS.entry,
      value: formatEntryLabel(option, treatmentTotal, summary),
    },
    {
      key: 'financedPrincipal',
      label: FINANCING_LABELS.financedPrincipal,
      value: formatCurrencyBRL(summary.financedAmount),
    },
    {
      key: 'appliedRate',
      label: FINANCING_LABELS.appliedRate,
      value: formatRateDisplay(interestRate, option),
    },
    {
      key: 'installmentPlan',
      label: FINANCING_LABELS.installmentPlan,
      value: `${summary.installmentsCount}x de ${formatCurrencyBRL(summary.installmentAmount)}`,
      emphasis: 'installment',
    },
    {
      key: 'financedWithInterest',
      label: FINANCING_LABELS.financedWithInterest,
      value: formatCurrencyBRL(summary.netFinancedAmount),
    },
    {
      key: 'contractTotal',
      label: FINANCING_LABELS.contractTotal,
      value: formatCurrencyBRL(summary.totalPayableAmount),
      emphasis: 'totalFinal',
    },
  ];

  return (
    <div className="budget-tab-fin-metrics" role="group" aria-label="Resumo financeiro do financiamento">
      {metrics.map((item) => (
        <div
          key={item.key}
          className={[
            'budget-tab-fin-metric',
            item.emphasis === 'treatment' ? 'budget-tab-fin-metric--treatment' : '',
            item.emphasis === 'totalFinal' ? 'budget-tab-fin-metric--total-final' : '',
            item.emphasis === 'installment' ? 'budget-tab-fin-metric--highlight' : '',
          ].filter(Boolean).join(' ')}
        >
          <span className="budget-tab-fin-metric-label">{item.label}</span>
          <strong className={`budget-tab-fin-metric-value${item.emphasis ? ` is-${item.emphasis}` : ''}`}>
            {item.value}
          </strong>
        </div>
      ))}
    </div>
  );
}
