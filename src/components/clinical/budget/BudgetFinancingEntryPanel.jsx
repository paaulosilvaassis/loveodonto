import { Check } from 'lucide-react';
import { formatCurrencyBRL } from '../../../utils/currency.js';
import {
  ENTRY_QUICK_PERCENTS,
  calcEntryAmountFromPercent,
  calcEntryPercentFromAmount,
  getPartnerMinEntryPercent,
  isQuickPercentAllowed,
  validateEntryPercent,
} from './budgetFinancingUtils.js';
import { getFinancialPartnerById } from '../../../services/financialPartnersService.js';

function resolveActiveMode(option, treatmentTotal) {
  if (option.entryPercentMode) return option.entryPercentMode;
  const pct = Number(option.downPaymentPercent);
  if (Number.isFinite(pct) && ENTRY_QUICK_PERCENTS.includes(Math.round(pct))) {
    return String(Math.round(pct));
  }
  if (option.downPayment > 0 && treatmentTotal > 0) return 'custom';
  return null;
}

export function BudgetFinancingEntryPanel({
  option,
  treatmentTotal,
  summary,
  disabled,
  onChange,
}) {
  const partner = option.partnerId ? getFinancialPartnerById(option.partnerId) : null;
  const minPercent = getPartnerMinEntryPercent(partner, treatmentTotal);
  const activeMode = resolveActiveMode(option, treatmentTotal);
  const currentPercent = Number(
    option.downPaymentPercent ?? calcEntryPercentFromAmount(treatmentTotal, option.downPayment),
  );
  const percentError = validateEntryPercent(currentPercent, partner, treatmentTotal);

  const applyPercent = (percent, mode) => {
    if (!isQuickPercentAllowed(percent, partner, treatmentTotal)) return;
    onChange({
      entryPercentMode: mode,
      downPaymentPercent: percent,
      downPayment: calcEntryAmountFromPercent(treatmentTotal, percent),
    });
  };

  const handleQuickClick = (percent) => {
    applyPercent(percent, String(percent));
  };

  const handleCustomMode = () => {
    const start = Math.max(minPercent, currentPercent || minPercent || 10);
    onChange({
      entryPercentMode: 'custom',
      downPaymentPercent: start,
      downPayment: calcEntryAmountFromPercent(treatmentTotal, start),
    });
  };

  const handleAmountChange = (raw) => {
    const amount = Math.max(0, Number(raw || 0));
    const percent = calcEntryPercentFromAmount(treatmentTotal, amount);
    const rounded = Math.round(percent);
    const mode = ENTRY_QUICK_PERCENTS.includes(rounded) && Math.abs(percent - rounded) < 0.05
      ? String(rounded)
      : 'custom';
    onChange({
      downPayment: amount,
      downPaymentPercent: percent,
      entryPercentMode: mode,
    });
  };

  const handleCustomPercentChange = (raw) => {
    const percent = Math.max(0, Math.min(100, Number(raw || 0)));
    onChange({
      entryPercentMode: 'custom',
      downPaymentPercent: percent,
      downPayment: calcEntryAmountFromPercent(treatmentTotal, percent),
    });
  };

  const displayPercent = Number.isFinite(currentPercent)
    ? (currentPercent % 1 === 0 ? currentPercent : currentPercent.toFixed(1))
    : 0;

  return (
    <div className="clinical-budget-financing-entry">
      <div className="clinical-budget-payment-field clinical-budget-payment-field--wide">
        <span>Valor do tratamento</span>
        <strong className="clinical-budget-financing-treatment-value">
          {formatCurrencyBRL(treatmentTotal)}
        </strong>
      </div>

      <div className="clinical-budget-payment-field clinical-budget-payment-field--wide">
        <span>Entrada (%)</span>
        <div className="clinical-budget-entry-badges" role="group" aria-label="Percentual de entrada">
          {ENTRY_QUICK_PERCENTS.map((pct) => {
            const allowed = isQuickPercentAllowed(pct, partner, treatmentTotal);
            const isActive = activeMode === String(pct);
            return (
              <button
                key={pct}
                type="button"
                className={`clinical-budget-entry-badge${isActive ? ' is-active' : ''}${!allowed ? ' is-disabled' : ''}`}
                onClick={() => handleQuickClick(pct)}
                disabled={disabled || !allowed}
                title={!allowed && minPercent > 0
                  ? `Entrada mínima do parceiro: ${minPercent % 1 === 0 ? minPercent : minPercent.toFixed(1)}%`
                  : undefined}
              >
                {pct}%
              </button>
            );
          })}
          <button
            type="button"
            className={`clinical-budget-entry-badge clinical-budget-entry-badge--custom${activeMode === 'custom' ? ' is-active' : ''}`}
            onClick={handleCustomMode}
            disabled={disabled}
          >
            Personalizado
          </button>
        </div>
        {minPercent > 0 ? (
          <p className="clinical-budget-entry-min-hint">
            Entrada mínima do parceiro: {minPercent % 1 === 0 ? minPercent : minPercent.toFixed(1)}%
          </p>
        ) : null}
      </div>

      {activeMode === 'custom' ? (
        <div className="clinical-budget-payment-field">
          <span>Entrada personalizada (%)</span>
          <div className="clinical-budget-payment-inline-input">
            <input
              type="number"
              min={minPercent}
              max="100"
              step="0.1"
              value={option.downPaymentPercent ?? ''}
              onChange={(e) => handleCustomPercentChange(e.target.value)}
              disabled={disabled}
            />
            <span>%</span>
          </div>
        </div>
      ) : null}

      <div className="clinical-budget-payment-field">
        <span>Entrada (R$)</span>
        <input
          type="number"
          min="0"
          step="0.01"
          value={option.downPayment ?? 0}
          onChange={(e) => handleAmountChange(e.target.value)}
          disabled={disabled}
        />
      </div>

      {summary ? (
        <div className="clinical-budget-payment-field">
          <span>Valor financiado</span>
          <strong>{formatCurrencyBRL(summary.financedAmount)}</strong>
        </div>
      ) : null}

      {percentError ? (
        <div className="clinical-budget-payment-errors">
          <p>{percentError}</p>
        </div>
      ) : null}

      {summary ? (
        <div className="clinical-budget-financing-summary">
          <p>
            <Check size={14} />
            Entrada: {formatCurrencyBRL(summary.entryAmount)} ({displayPercent}%)
          </p>
          <p>
            <Check size={14} />
            Valor financiado: {formatCurrencyBRL(summary.financedAmount)}
          </p>
          <p>
            <Check size={14} />
            {summary.installmentsCount} parcelas de {formatCurrencyBRL(summary.installmentAmount)}
          </p>
          <p>
            <Check size={14} />
            Total financiado: {formatCurrencyBRL(summary.netFinancedAmount)}
          </p>
          {summary.totalPayableAmount !== summary.netFinancedAmount + summary.entryAmount ? (
            <p>
              <Check size={14} />
              Total geral do contrato: {formatCurrencyBRL(summary.totalPayableAmount)}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
