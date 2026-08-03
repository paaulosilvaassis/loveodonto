import { formatCurrencyBRL } from '../../../utils/currency.js';
import {
  calcOptionFinalValue,
  CARD_BRANDS,
  CASH_METHODS,
} from './budgetUtils.js';
import { buildFinancingDisplayLines } from './financingDisplayUtils.js';
import { getPaymentOptionTitle } from './budgetEventLabels.js';

function calcInstallment(total, down, installments) {
  const rest = Math.max(0, Number(total || 0) - Number(down || 0));
  const n = Math.max(1, Number(installments || 1));
  return rest / n;
}

function formatChosenDetails(opt, originalValue) {
  const finalVal = calcOptionFinalValue(opt, originalValue);
  if (opt.type === 'a_vista') {
    const methods = (opt.methods || [opt.method])
      .filter(Boolean)
      .map((m) => CASH_METHODS.find((c) => c.value === m)?.label || m);
    return (
      <>
        <p><span>Valor do tratamento</span><strong>{formatCurrencyBRL(finalVal)}</strong></p>
        <p><span>Forma</span><strong>{methods.join(' / ') || '—'}</strong></p>
        {opt.discountPercent ? <p><span>Desconto</span><strong>{opt.discountPercent}%</strong></p> : null}
      </>
    );
  }
  if (opt.type === 'parcelado_clinica') {
    const parcel = calcInstallment(finalVal, opt.downPayment, opt.installments);
    return (
      <>
        <p><span>Valor do tratamento</span><strong>{formatCurrencyBRL(finalVal)}</strong></p>
        {Number(opt.downPayment) > 0 ? (
          <p><span>Entrada</span><strong>{formatCurrencyBRL(opt.downPayment)}</strong></p>
        ) : null}
        <p>
          <span>Parcelamento</span>
          <strong>{opt.installments}x de {formatCurrencyBRL(parcel)}</strong>
        </p>
      </>
    );
  }
  if (opt.type === 'cartao') {
    const brand = CARD_BRANDS.find((b) => b.value === opt.cardBrand)?.label || opt.cardBrand;
    const parcel = calcInstallment(finalVal, 0, opt.installments);
    return (
      <>
        <p><span>Valor do tratamento</span><strong>{formatCurrencyBRL(finalVal)}</strong></p>
        <p><span>Bandeira</span><strong>{brand}</strong></p>
        <p>
          <span>Parcelamento</span>
          <strong>{opt.installments}x de {formatCurrencyBRL(parcel)}</strong>
        </p>
      </>
    );
  }
  return null;
}

export function BudgetChosenPaymentBlock({ chosenOption, originalValue }) {
  if (!chosenOption) return null;

  const isFinancing = chosenOption.type === 'financiamento';
  const display = isFinancing
    ? buildFinancingDisplayLines(chosenOption, originalValue)
    : null;

  return (
    <section className="clinical-budget-chosen">
      <header>
        <div>
          <span className="clinical-budget-chosen-kicker">Forma escolhida</span>
          <h4>Condição escolhida pelo paciente</h4>
        </div>
      </header>
      <div className="clinical-budget-chosen-body">
        <strong>{getPaymentOptionTitle(chosenOption)}</strong>
        <div className={`clinical-budget-chosen-details${isFinancing ? ' clinical-budget-chosen-details--financing' : ''}`}>
          {isFinancing ? (
            display.lines.map((line) => (
              <p key={line.key} className={line.emphasis ? `is-${line.emphasis}` : ''}>
                <span>{line.label}</span>
                <strong>{line.value}</strong>
              </p>
            ))
          ) : (
            formatChosenDetails(chosenOption, originalValue)
          )}
        </div>
      </div>
    </section>
  );
}
