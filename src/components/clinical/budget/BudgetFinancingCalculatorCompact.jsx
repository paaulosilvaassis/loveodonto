import { formatCurrencyBRL } from '../../../utils/currency.js';
import {
  ENTRY_QUICK_PERCENTS,
  calcEntryAmountFromPercent,
  calcEntryPercentFromAmount,
  getPartnerMinEntryPercent,
  isQuickPercentAllowed,
  validateEntryPercent,
  INTEREST_TYPE_OPTIONS,
} from './budgetFinancingUtils.js';
import {
  getFinancialPartnerById,
  FINANCIAL_PARTNER_SPECIAL_IDS,
} from '../../../services/financialPartnersService.js';
import { BudgetFinancingMetrics } from './BudgetFinancingMetrics.jsx';

function resolveActiveMode(option, treatmentTotal) {
  if (option.entryPercentMode) return option.entryPercentMode;
  const pct = Number(option.downPaymentPercent);
  if (Number.isFinite(pct) && ENTRY_QUICK_PERCENTS.includes(Math.round(pct))) {
    return String(Math.round(pct));
  }
  if (option.downPayment > 0 && treatmentTotal > 0) return 'custom';
  return null;
}

export function BudgetFinancingCalculatorCompact({
  option,
  treatmentTotal,
  summary,
  partners,
  manualPartner,
  termsLocked,
  maxInstallments,
  disabled,
  onChange,
  onPartnerChange,
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

  return (
    <div className="budget-tab-financing">
      <div className="budget-tab-fin-row budget-tab-fin-row--3">
        <label className="budget-tab-field">
          <span>Parceiro financeiro</span>
          <select
            value={option.partnerId || ''}
            onChange={(e) => onPartnerChange(e.target.value)}
            disabled={disabled}
          >
            <option value="">Selecione…</option>
            {partners.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </label>
        <div className="budget-tab-field">
          <span>Valor do tratamento</span>
          <strong>{formatCurrencyBRL(treatmentTotal)}</strong>
        </div>
        <div className="budget-tab-field budget-tab-field--wide">
          <span>Entrada %</span>
          <div className="budget-tab-entry-badges" role="group" aria-label="Percentual de entrada">
            {ENTRY_QUICK_PERCENTS.map((pct) => {
              const allowed = isQuickPercentAllowed(pct, partner, treatmentTotal);
              const isActive = activeMode === String(pct);
              return (
                <button
                  key={pct}
                  type="button"
                  className={`budget-tab-entry-badge${isActive ? ' is-active' : ''}${!allowed ? ' is-disabled' : ''}`}
                  onClick={() => applyPercent(pct, String(pct))}
                  disabled={disabled || !allowed}
                >
                  {pct}%
                </button>
              );
            })}
            <button
              type="button"
              className={`budget-tab-entry-badge budget-tab-entry-badge--custom${activeMode === 'custom' ? ' is-active' : ''}`}
              onClick={() => applyPercent(Math.max(minPercent, currentPercent || 10), 'custom')}
              disabled={disabled}
            >
              Personalizado
            </button>
          </div>
        </div>
      </div>

      {activeMode === 'custom' ? (
        <div className="budget-tab-fin-row budget-tab-fin-row--sub">
          <label className="budget-tab-field">
            <span>Entrada personalizada (%)</span>
            <input
              type="number"
              min={minPercent}
              max="100"
              step="0.1"
              value={option.downPaymentPercent ?? ''}
              onChange={(e) => handleCustomPercentChange(e.target.value)}
              disabled={disabled}
            />
          </label>
        </div>
      ) : null}

      {manualPartner ? (
        <div className="budget-tab-fin-row budget-tab-fin-row--sub">
          <label className="budget-tab-field budget-tab-field--wide">
            <span>Nome do parceiro</span>
            <input
              type="text"
              value={option.customPartnerName || option.partner || ''}
              onChange={(e) => onChange({
                customPartnerName: e.target.value,
                partner: e.target.value,
              })}
              placeholder="Parceiro externo"
              disabled={disabled}
            />
          </label>
        </div>
      ) : null}

      <div className="budget-tab-fin-row budget-tab-fin-row--3">
        <label className="budget-tab-field">
          <span>Entrada R$</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={option.downPayment ?? 0}
            onChange={(e) => handleAmountChange(e.target.value)}
            disabled={disabled}
          />
        </label>
        <label className="budget-tab-field">
          <span>Parcelas</span>
          <input
            type="number"
            min="1"
            max={maxInstallments}
            value={option.installments || 1}
            onChange={(e) => onChange({ installments: Number(e.target.value) })}
            disabled={disabled || termsLocked}
          />
        </label>
        <label className="budget-tab-field">
          <span>1º vencimento</span>
          <input
            type="date"
            value={option.firstDueDate || ''}
            onChange={(e) => onChange({ firstDueDate: e.target.value })}
            disabled={disabled}
          />
        </label>
      </div>

      <div className="budget-tab-fin-row budget-tab-fin-row--2">
        <label className="budget-tab-field">
          <span>Tipo de juros</span>
          <select
            value={option.interestType || 'none'}
            onChange={(e) => onChange({ interestType: e.target.value })}
            disabled={disabled || termsLocked}
          >
            {INTEREST_TYPE_OPTIONS.map((item) => (
              <option key={item.value} value={item.value}>{item.label}</option>
            ))}
          </select>
        </label>
        <label className="budget-tab-field">
          <span>Taxa aplicada</span>
          <div className="budget-tab-suffix-input">
            <input
              type="number"
              min="0"
              step="0.01"
              value={option.interestRate || 0}
              onChange={(e) => onChange({ interestRate: Number(e.target.value) })}
              disabled={disabled || termsLocked || option.interestType === 'none'}
              aria-label="Taxa aplicada em percentual"
            />
            <span className="budget-tab-suffix" aria-hidden="true">%</span>
          </div>
        </label>
      </div>

      <BudgetFinancingMetrics
        summary={summary}
        interestRate={option.interestRate}
        option={option}
        treatmentTotal={treatmentTotal}
      />

      {percentError ? <p className="budget-tab-errors">{percentError}</p> : null}

      {termsLocked ? (
        <p className="budget-tab-hint">
          Condições definidas pelo parceiro. Edição manual requer permissão de orçamento/financeiro.
        </p>
      ) : null}

      {option.partnerId === FINANCIAL_PARTNER_SPECIAL_IDS.OTHER ? (
        <p className="budget-tab-hint">
          Preencha manualmente juros, taxas e parcelas para parceiros não cadastrados.
        </p>
      ) : null}
    </div>
  );
}
