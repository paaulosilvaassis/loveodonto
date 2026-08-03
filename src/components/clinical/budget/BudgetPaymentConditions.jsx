import { useMemo, useState } from 'react';
import { Check, ChevronDown, ChevronUp, Presentation, Settings2 } from 'lucide-react';
import { formatCurrencyBRL } from '../../../utils/currency.js';
import { DEFAULT_PAYMENT_OPTIONS } from '../clinicalAppointmentConfig.js';
import {
  calcOptionFinalValue,
  CASH_METHODS,
  CARD_BRANDS,
} from './budgetUtils.js';
import {
  getFinancingSummaryForOption,
  isPartnerManualMode,
  getPartnerMaxInstallments,
} from './budgetFinancingUtils.js';
import { BudgetFinancingCalculatorCompact } from './BudgetFinancingCalculatorCompact.jsx';
import {
  listActiveFinancialPartners,
  applyPartnerDefaultsToOption,
  canOverridePartnerTerms,
} from '../../../services/financialPartnersService.js';
import { getPaymentOptionTitle } from './budgetEventLabels.js';
import {
  markPaymentConditionAsChosen,
  presentPaymentCondition,
} from './budgetPaymentPresentationService.js';
import { getPresentedPaymentOptions, isPaymentOptionChosen } from './budgetPaymentPdfUtils.js';
import { formatPresentedAt, getPaymentCardPreview } from './budgetCommercialUtils.js';
import { buildFinancingDisplayLines } from './financingDisplayUtils.js';

const CARD_TITLES = {
  a_vista: 'À vista',
  parcelado_clinica: 'Parcelado pela clínica',
  cartao: 'Cartão',
  financiamento: 'Financiamento',
};

function getPresentationStatusLabel(opt) {
  if (opt.accepted) return { text: 'Escolhida', className: 'is-chosen' };
  if (opt.presentToPatient || opt.presentedAt) return { text: 'Apresentada', className: 'is-presented' };
  return { text: 'Não apresentada', className: 'is-idle' };
}

function calcInstallment(total, down, installments) {
  const rest = Math.max(0, Number(total || 0) - Number(down || 0));
  const n = Math.max(1, Number(installments || 1));
  return rest / n;
}

function PresentedConditionsBlock({
  budget,
  originalValue,
  readOnly,
  onMarkChosen,
}) {
  const presented = getPresentedPaymentOptions(budget);
  if (!presented.length) return null;

  return (
    <section className="budget-tab-presented">
      <h3>Condições apresentadas ao paciente</h3>
      <ul className="budget-tab-presented-list">
        {presented.map((opt) => {
          const preview = getPaymentCardPreview(opt, originalValue);
          const isChosen = isPaymentOptionChosen(opt);
          const cardClass = [
            'budget-tab-presented-card',
            isChosen ? 'is-chosen' : '',
          ].filter(Boolean).join(' ');

          return (
            <li key={opt.id} className={cardClass}>
              <div className="budget-tab-presented-card-head">
                <div className="budget-tab-presented-card-title">
                  <strong>{getPaymentOptionTitle(opt)}</strong>
                  {isChosen ? (
                    <span className="budget-tab-badge budget-tab-badge--chosen">
                      <Check size={12} aria-hidden />
                      Escolhida pelo paciente
                    </span>
                  ) : null}
                </div>
                {opt.presentedAt ? (
                  <time>{formatPresentedAt(opt.presentedAt)}</time>
                ) : null}
              </div>
              {preview.lines.map((line) => (
                <span
                  key={line.label}
                  className={[
                    'budget-tab-presented-line',
                    line.emphasis === 'treatment' ? 'is-treatment' : '',
                    line.emphasis === 'totalFinal' ? 'is-total-final' : '',
                    line.emphasis === 'installment' ? 'is-installment' : '',
                    line.strong ? 'is-strong' : '',
                  ].filter(Boolean).join(' ')}
                >
                  {line.label}: <strong>{line.value}</strong>
                </span>
              ))}
              {!readOnly ? (
                <footer className="budget-tab-presented-card-actions">
                  {isChosen ? (
                    <button
                      type="button"
                      className="budget-tab-action budget-tab-action--primary is-active"
                      disabled
                      aria-pressed="true"
                    >
                      <Check size={14} aria-hidden />
                      Condição escolhida
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="budget-tab-action budget-tab-action--primary"
                      onClick={() => onMarkChosen(opt)}
                    >
                      <Check size={14} aria-hidden />
                      Marcar como escolhida
                    </button>
                  )}
                </footer>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function PaymentSummaryGrid({ opt, originalValue, finalVal }) {
  if (opt.type === 'a_vista') {
    const methods = (opt.methods || [opt.method])
      .filter(Boolean)
      .map((m) => CASH_METHODS.find((c) => c.value === m)?.label || m)
      .join(', ');
    return (
      <dl className="budget-tab-pay-grid">
        <div><dt>Valor original</dt><dd>{formatCurrencyBRL(originalValue)}</dd></div>
        <div><dt>Desconto</dt><dd>{Number(opt.discountPercent || 0)}%</dd></div>
        <div><dt>Valor final</dt><dd className="is-highlight">{formatCurrencyBRL(finalVal)}</dd></div>
        <div className="budget-tab-pay-grid--wide"><dt>Formas aceitas</dt><dd>{methods || '—'}</dd></div>
      </dl>
    );
  }

  if (opt.type === 'parcelado_clinica') {
    const inst = Math.max(1, Number(opt.installments || 1));
    const parcel = calcInstallment(finalVal, opt.downPayment, inst);
    return (
      <dl className="budget-tab-pay-grid">
        <div><dt>Entrada</dt><dd>{formatCurrencyBRL(opt.downPayment || 0)}</dd></div>
        <div><dt>Parcelas</dt><dd>{inst}x</dd></div>
        <div><dt>Valor da parcela</dt><dd className="is-highlight">{formatCurrencyBRL(parcel)}</dd></div>
        <div><dt>Total</dt><dd>{formatCurrencyBRL(finalVal)}</dd></div>
      </dl>
    );
  }

  if (opt.type === 'cartao') {
    const brand = CARD_BRANDS.find((b) => b.value === opt.cardBrand)?.label || '—';
    const inst = Math.max(1, Number(opt.installments || 1));
    const parcel = finalVal / inst;
    return (
      <dl className="budget-tab-pay-grid">
        <div><dt>Bandeira</dt><dd>{brand}</dd></div>
        <div><dt>Parcelas</dt><dd>{inst}x</dd></div>
        <div><dt>Valor da parcela</dt><dd className="is-highlight">{formatCurrencyBRL(parcel)}</dd></div>
        <div><dt>Total</dt><dd>{formatCurrencyBRL(finalVal)}</dd></div>
      </dl>
    );
  }

  if (opt.type === 'financiamento') {
    const display = buildFinancingDisplayLines(opt, originalValue);
    if (!display.summary) return null;
    return (
      <dl className="budget-tab-pay-grid budget-tab-pay-grid--financing">
        {display.lines.map((line) => (
          <div
            key={line.key}
            className={line.emphasis ? `is-${line.emphasis}` : ''}
          >
            <dt>{line.label}</dt>
            <dd className={line.emphasis === 'installment' || line.emphasis === 'totalFinal' ? 'is-highlight' : ''}>
              {line.value}
            </dd>
          </div>
        ))}
      </dl>
    );
  }

  return null;
}

export function BudgetPaymentConditions({
  budget,
  setBudget,
  originalValue,
  onPresent,
  onChoose,
  readOnly,
  user,
}) {
  const [expandedId, setExpandedId] = useState(null);
  const [financingErrors, setFinancingErrors] = useState({});

  const partners = useMemo(() => listActiveFinancialPartners(), []);
  const canEditTerms = canOverridePartnerTerms(user);

  const options = budget.paymentOptions?.length
    ? budget.paymentOptions
    : DEFAULT_PAYMENT_OPTIONS().map((o) => ({ ...o, total: originalValue }));

  const updateOption = (id, patch) => {
    const next = options.map((opt) => (opt.id === id ? { ...opt, ...patch } : opt));
    setBudget({ ...budget, paymentOptions: next });
    if (patch.downPayment !== undefined || patch.installments !== undefined || patch.partnerId) {
      setFinancingErrors((prev) => ({ ...prev, [id]: null }));
    }
  };

  const handlePartnerChange = (opt, partnerId) => {
    const partner = partners.find((p) => p.id === partnerId);
    const finalVal = calcOptionFinalValue(opt, originalValue);
    const defaults = applyPartnerDefaultsToOption(partner, finalVal);
    updateOption(opt.id, {
      ...defaults,
      partnerId: partner?.id || '',
      partner: partner?.is_manual ? (opt.customPartnerName || '') : (partner?.name || ''),
    });
  };

  const toggleMethod = (opt, method) => {
    const current = opt.methods || [opt.method].filter(Boolean);
    const next = current.includes(method)
      ? current.filter((m) => m !== method)
      : [...current, method];
    updateOption(opt.id, { methods: next, method: next[0] || 'pix' });
  };

  const togglePresent = (opt) => {
    const result = presentPaymentCondition(budget, opt.id, { originalValue, user });
    if (!result.ok) {
      if (result.errors?.length) {
        setFinancingErrors((prev) => ({ ...prev, [opt.id]: result.errors }));
      }
      return;
    }

    setFinancingErrors((prev) => ({ ...prev, [opt.id]: null }));
    setBudget(result.nextBudget);

    if (result.action === 'presented') {
      onPresent?.(result.option, result.nextBudget);
    } else {
      onPresent?.(result.option, result.nextBudget, { action: 'unpresented' });
    }
  };

  const markChosen = (opt) => {
    markPaymentConditionAsChosen(opt, {
      originalValue,
      onChoose,
      onFinancingErrors: (errors) => {
        setFinancingErrors((prev) => ({ ...prev, [opt.id]: errors }));
      },
    });
  };

  return (
    <div className="budget-tab-payments">
      <header className="budget-tab-section-head">
        <div>
          <h3>Condições de pagamento</h3>
          <p>Configure, apresente e registre a escolha do paciente.</p>
        </div>
      </header>

      <PresentedConditionsBlock
        budget={budget}
        originalValue={originalValue}
        readOnly={readOnly}
        onMarkChosen={markChosen}
      />

      <div className="budget-tab-pay-stack">
        {options.map((opt) => {
          const finalVal = calcOptionFinalValue(opt, originalValue);
          const isExpanded = expandedId === opt.id || opt.type === 'financiamento';
          const manualPartner = opt.type === 'financiamento' && isPartnerManualMode(opt);
          const termsLocked = opt.type === 'financiamento' && !manualPartner && !canEditTerms;
          const maxInstallments = opt.type === 'financiamento' ? getPartnerMaxInstallments(opt) : 60;
          const financingSummary = opt.type === 'financiamento'
            ? getFinancingSummaryForOption(opt, originalValue)
            : null;
          const rowErrors = financingErrors[opt.id] || [];
          const installmentValue = calcInstallment(finalVal, opt.downPayment, opt.installments);
          const cardInstallment = calcInstallment(finalVal, 0, opt.installments);
          const statusLabel = getPresentationStatusLabel(opt);

          const cardClass = [
            'budget-tab-pay-card',
            opt.accepted ? 'is-chosen' : '',
            opt.presentToPatient ? 'is-presented' : '',
          ].filter(Boolean).join(' ');

          return (
            <article key={opt.id} className={cardClass}>
              <header className="budget-tab-pay-card-head">
                <h4>{CARD_TITLES[opt.type] || getPaymentOptionTitle(opt)}</h4>
                <span className={`budget-tab-status-pill ${statusLabel.className}`}>
                  {statusLabel.text}
                </span>
                {opt.accepted ? (
                  <span className="budget-tab-badge budget-tab-badge--chosen">
                    <Check size={12} />
                    Escolhida pelo paciente
                  </span>
                ) : null}
              </header>

              <div className="budget-tab-pay-card-preview">
                <strong>{formatCurrencyBRL(finalVal)}</strong>
                {opt.type === 'parcelado_clinica' || opt.type === 'cartao' ? (
                  <span>
                    {Math.max(1, Number(opt.installments || 1))}x de{' '}
                    {formatCurrencyBRL(opt.type === 'cartao' ? cardInstallment : installmentValue)}
                  </span>
                ) : null}
                {opt.type === 'financiamento' && financingSummary ? (
                  <span>
                    {financingSummary.installmentsCount}x de{' '}
                    {formatCurrencyBRL(financingSummary.installmentAmount)}
                  </span>
                ) : null}
              </div>

              <PaymentSummaryGrid opt={opt} originalValue={originalValue} finalVal={finalVal} />

              {isExpanded ? (
                <div className="budget-tab-pay-config">
                  {opt.type === 'a_vista' ? (
                    <>
                      <div className="budget-tab-pay-methods">
                        <span>Formas aceitas</span>
                        <div className="budget-tab-checks">
                          {CASH_METHODS.map((m) => (
                            <label key={m.value}>
                              <input
                                type="checkbox"
                                checked={(opt.methods || [opt.method]).includes(m.value)}
                                onChange={() => toggleMethod(opt, m.value)}
                                disabled={readOnly}
                              />
                              {m.label}
                            </label>
                          ))}
                        </div>
                      </div>
                      <label className="budget-tab-field budget-tab-field--inline">
                        <span>Desconto (%)</span>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          step="0.1"
                          value={opt.discountPercent || 0}
                          onChange={(e) =>
                            updateOption(opt.id, { discountPercent: Number(e.target.value) })
                          }
                          disabled={readOnly}
                        />
                      </label>
                    </>
                  ) : null}

                  {opt.type === 'parcelado_clinica' ? (
                    <div className="budget-tab-config-row">
                      <label className="budget-tab-field">
                        <span>Entrada (R$)</span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={opt.downPayment || 0}
                          onChange={(e) =>
                            updateOption(opt.id, { downPayment: Number(e.target.value) })
                          }
                          disabled={readOnly}
                        />
                      </label>
                      <label className="budget-tab-field">
                        <span>Parcelas</span>
                        <input
                          type="number"
                          min="1"
                          max="48"
                          value={opt.installments || 1}
                          onChange={(e) =>
                            updateOption(opt.id, { installments: Number(e.target.value) })
                          }
                          disabled={readOnly}
                        />
                      </label>
                      <div className="budget-tab-field">
                        <span>Valor parcela</span>
                        <strong>{formatCurrencyBRL(installmentValue)}</strong>
                      </div>
                    </div>
                  ) : null}

                  {opt.type === 'cartao' ? (
                    <div className="budget-tab-config-row">
                      <label className="budget-tab-field">
                        <span>Bandeira</span>
                        <select
                          value={opt.cardBrand || 'visa'}
                          onChange={(e) => updateOption(opt.id, { cardBrand: e.target.value })}
                          disabled={readOnly}
                        >
                          {CARD_BRANDS.map((b) => (
                            <option key={b.value} value={b.value}>{b.label}</option>
                          ))}
                        </select>
                      </label>
                      <label className="budget-tab-field">
                        <span>Parcelas</span>
                        <input
                          type="number"
                          min="1"
                          max="24"
                          value={opt.installments || 1}
                          onChange={(e) =>
                            updateOption(opt.id, { installments: Number(e.target.value) })
                          }
                          disabled={readOnly}
                        />
                      </label>
                      <div className="budget-tab-field">
                        <span>Valor parcela</span>
                        <strong>{formatCurrencyBRL(cardInstallment)}</strong>
                      </div>
                    </div>
                  ) : null}

                  {opt.type === 'financiamento' ? (
                    <>
                      <BudgetFinancingCalculatorCompact
                        option={opt}
                        treatmentTotal={finalVal}
                        summary={financingSummary}
                        partners={partners}
                        manualPartner={manualPartner}
                        termsLocked={termsLocked}
                        maxInstallments={maxInstallments}
                        disabled={readOnly}
                        onChange={(patch) => updateOption(opt.id, patch)}
                        onPartnerChange={(partnerId) => handlePartnerChange(opt, partnerId)}
                      />
                      {rowErrors.length ? (
                        <div className="budget-tab-errors">
                          {rowErrors.map((msg) => <p key={msg}>{msg}</p>)}
                        </div>
                      ) : null}
                    </>
                  ) : null}
                </div>
              ) : null}

              {!readOnly ? (
                <footer className="budget-tab-pay-actions">
                  {opt.type !== 'financiamento' ? (
                    <button
                      type="button"
                      className="budget-tab-action budget-tab-action--ghost"
                      onClick={() => setExpandedId(expandedId === opt.id ? null : opt.id)}
                    >
                      {expandedId === opt.id ? <ChevronUp size={14} /> : <Settings2 size={14} />}
                      {expandedId === opt.id ? 'Recolher' : 'Configurar'}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className={`budget-tab-action budget-tab-action--secondary${opt.presentToPatient ? ' is-active' : ''}`}
                    onClick={() => togglePresent(opt)}
                  >
                    <Presentation size={14} />
                    Apresentar ao paciente
                  </button>
                  {!opt.accepted ? (
                    <button
                      type="button"
                      className="budget-tab-action budget-tab-action--primary"
                      onClick={() => markChosen(opt)}
                    >
                      <Check size={14} />
                      Marcar como escolhida
                    </button>
                  ) : null}
                </footer>
              ) : null}
            </article>
          );
        })}
      </div>
    </div>
  );
}
