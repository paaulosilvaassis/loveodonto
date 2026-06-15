import { CheckCircle2 } from 'lucide-react';
import { formatCurrencyBRL } from '../../../utils/currency.js';
import {
  calcOptionFinalValue,
  CARD_BRANDS,
  CASH_METHODS,
} from './budgetUtils.js';
import { getFinancingSummaryForOption, INTEREST_TYPE_OPTIONS } from './budgetFinancingUtils.js';

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
        <p>Valor: <strong>{formatCurrencyBRL(finalVal)}</strong></p>
        <p>Forma: {methods.join(' / ') || '—'}</p>
        {opt.discountPercent ? <p>Desconto: {opt.discountPercent}%</p> : null}
      </>
    );
  }
  if (opt.type === 'parcelado_clinica') {
    const parcel = calcInstallment(finalVal, opt.downPayment, opt.installments);
    return (
      <>
        {Number(opt.downPayment) > 0 ? (
          <p>Entrada: <strong>{formatCurrencyBRL(opt.downPayment)}</strong></p>
        ) : null}
        <p>
          <strong>{opt.installments}x</strong> de <strong>{formatCurrencyBRL(parcel)}</strong>
        </p>
      </>
    );
  }
  if (opt.type === 'cartao') {
    const brand = CARD_BRANDS.find((b) => b.value === opt.cardBrand)?.label || opt.cardBrand;
    const parcel = calcInstallment(finalVal, 0, opt.installments);
    return (
      <>
        <p>Bandeira: {brand}</p>
        <p>
          <strong>{opt.installments}x</strong> de <strong>{formatCurrencyBRL(parcel)}</strong>
        </p>
      </>
    );
  }
  if (opt.type === 'financiamento') {
    const summary = getFinancingSummaryForOption(opt, originalValue);
    const interestLabel = INTEREST_TYPE_OPTIONS.find((i) => i.value === opt.interestType)?.label || '—';
    const entryPct = opt.downPaymentPercent;
    return (
      <>
        <p>Parceiro: {opt.partner || '—'}</p>
        {Number(opt.downPayment) > 0 ? (
          <p>
            Entrada: <strong>{formatCurrencyBRL(opt.downPayment)}</strong>
            {entryPct ? ` (${entryPct % 1 === 0 ? entryPct : Number(entryPct).toFixed(1)}%)` : ''}
          </p>
        ) : null}
        <p>Juros: {interestLabel}{opt.interestRate ? ` (${opt.interestRate}% a.m.)` : ''}</p>
        {summary ? (
          <>
            <p>
              <strong>{summary.installmentsCount}x</strong> de{' '}
              <strong>{formatCurrencyBRL(summary.installmentAmount)}</strong>
            </p>
            <p>Total: <strong>{formatCurrencyBRL(summary.totalPayableAmount)}</strong></p>
          </>
        ) : null}
      </>
    );
  }
  return null;
}

export function BudgetChosenPaymentBlock({ chosenOption, originalValue }) {
  if (!chosenOption) return null;

  return (
    <section className="clinical-budget-chosen">
      <header>
        <CheckCircle2 size={20} />
        <div>
          <span className="clinical-budget-chosen-kicker">Forma escolhida</span>
          <h4>Condição escolhida pelo paciente</h4>
        </div>
      </header>
      <div className="clinical-budget-chosen-body">
        <strong>{getPaymentOptionTitle(chosenOption)}</strong>
        <div className="clinical-budget-chosen-details">
          {formatChosenDetails(chosenOption, originalValue)}
        </div>
      </div>
    </section>
  );
}
