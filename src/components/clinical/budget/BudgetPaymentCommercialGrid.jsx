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
  validateFinancingPaymentOption,
  isPartnerManualMode,
  getPartnerMaxInstallments,
} from './budgetFinancingUtils.js';
import { BudgetFinancingCalculatorCompact } from './BudgetFinancingCalculatorCompact.jsx';
import {
  listActiveFinancialPartners,
  applyPartnerDefaultsToOption,
  canOverridePartnerTerms,
} from '../../../services/financialPartnersService.js';
import {
  getPaymentCardPreview,
  getPaymentTypeLabel,
} from './budgetCommercialUtils.js';

function calcInstallment(total, down, installments) {
  const rest = Math.max(0, Number(total || 0) - Number(down || 0));
  const n = Math.max(1, Number(installments || 1));
  return rest / n;
}

export function BudgetPaymentCommercialGrid({
  budget,
  setBudget,
  originalValue,
  onPresent,
  onChoose,
  readOnly,
  user,
}) {
  const [financingErrors, setFinancingErrors] = useState({});
  const [expandedId, setExpandedId] = useState(null);

  const partners = useMemo(() => listActiveFinancialPartners(), []);
  const canEditTerms = canOverridePartnerTerms(user);

  const options = budget.paymentOptions?.length
    ? budget.paymentOptions
    : DEFAULT_PAYMENT_OPTIONS().map((o) => ({ ...o, total: originalValue }));

  const updateOption = (id, patch) => {
    const next = options.map((opt) => (opt.id === id ? { ...opt, ...patch } : opt));
    setBudget({ ...budget, paymentOptions: next });
    if (
      patch.downPayment !== undefined
      || patch.installments !== undefined
      || patch.partnerId !== undefined
    ) {
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
    setFinancingErrors((prev) => ({ ...prev, [opt.id]: null }));
  };

  const toggleMethod = (opt, method) => {
    const current = opt.methods || [opt.method].filter(Boolean);
    const next = current.includes(method)
      ? current.filter((m) => m !== method)
      : [...current, method];
    updateOption(opt.id, { methods: next, method: next[0] || 'pix' });
  };

  const togglePresent = (opt) => {
    if (opt.type === 'financiamento') {
      const errors = validateFinancingPaymentOption(opt, originalValue);
      if (errors.length) {
        setFinancingErrors((prev) => ({ ...prev, [opt.id]: errors }));
        return;
      }
    }
    const nextPresent = !opt.presentToPatient;
    const patch = { presentToPatient: nextPresent };
    if (nextPresent && !opt.presentedAt) {
      patch.presentedAt = new Date().toISOString();
    }
    updateOption(opt.id, patch);
    if (onPresent && nextPresent) onPresent({ ...opt, ...patch });
  };

  const markChosen = (opt) => {
    if (opt.type === 'financiamento') {
      const errors = validateFinancingPaymentOption(opt, originalValue);
      if (errors.length) {
        setFinancingErrors((prev) => ({ ...prev, [opt.id]: errors }));
        return;
      }
    }
    if (onChoose) {
      onChoose(opt);
      return;
    }
    const next = options.map((item) => ({
      ...item,
      accepted: item.id === opt.id,
    }));
    setBudget({ ...budget, paymentOptions: next });
  };

  return (
    <div className="clinical-budget-payment-grid">
      {options.map((opt) => {
        const preview = getPaymentCardPreview(opt, originalValue);
        const finalVal = calcOptionFinalValue(opt, originalValue);
        const installmentValue = calcInstallment(finalVal, opt.downPayment, opt.installments);
        const cardInstallment = calcInstallment(finalVal, 0, opt.installments);
        const manualPartner = opt.type === 'financiamento' && isPartnerManualMode(opt);
        const termsLocked = opt.type === 'financiamento' && !manualPartner && !canEditTerms;
        const maxInstallments = opt.type === 'financiamento' ? getPartnerMaxInstallments(opt) : 60;
        const financingSummary = opt.type === 'financiamento'
          ? getFinancingSummaryForOption(opt, originalValue)
          : null;
        const rowErrors = financingErrors[opt.id] || [];
        const isExpanded = expandedId === opt.id;

        const cardClass = [
          'clinical-budget-payment-card',
          opt.type === 'financiamento' ? 'is-financing' : '',
          opt.presentToPatient ? 'is-present' : '',
          opt.accepted ? 'is-chosen' : '',
        ].filter(Boolean).join(' ');

        return (
          <article key={opt.id} className={cardClass}>
            <header className="clinical-budget-payment-card-head">
              <div>
                <p className="clinical-budget-payment-card-kicker">{getPaymentTypeLabel(opt.type)}</p>
                <h4>{preview.headline}</h4>
              </div>
              <div className="clinical-budget-payment-card-tags">
                {opt.accepted ? (
                  <span className="clinical-budget-payment-chosen-tag">
                    <Check size={12} />
                    Escolhida
                  </span>
                ) : null}
                {opt.presentToPatient && !opt.accepted ? (
                  <span className="clinical-budget-payment-present-tag">Apresentada</span>
                ) : null}
              </div>
            </header>

            <div className="clinical-budget-payment-card-body">
              <p className="clinical-budget-payment-card-highlight">{preview.highlight}</p>
              {preview.lines.map((line) => (
                <div key={line.label} className="clinical-budget-payment-row">
                  <span>{line.label}</span>
                  <strong className={line.strong ? 'is-emphasis' : ''}>{line.value}</strong>
                </div>
              ))}
            </div>

            {isExpanded || opt.type === 'financiamento' ? (
              <div className="clinical-budget-payment-card-config">
                {opt.type === 'a_vista' ? (
                  <>
                    <div className="clinical-budget-payment-methods">
                      <span>Formas de pagamento</span>
                      <div className="clinical-budget-payment-checks">
                        {CASH_METHODS.map((m) => (
                          <label key={m.value} className="clinical-budget-payment-check">
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
                    <label className="clinical-budget-payment-inline">
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
                  <>
                    <label className="clinical-budget-payment-inline">
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
                    <label className="clinical-budget-payment-inline">
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
                    <div className="clinical-budget-payment-row">
                      <span>Valor parcela</span>
                      <strong>{formatCurrencyBRL(installmentValue)}</strong>
                    </div>
                  </>
                ) : null}

                {opt.type === 'cartao' ? (
                  <>
                    <label className="clinical-budget-payment-inline">
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
                    <label className="clinical-budget-payment-inline">
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
                    <label className="clinical-budget-payment-inline">
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
                    <div className="clinical-budget-payment-row">
                      <span>Valor parcela</span>
                      <strong>{formatCurrencyBRL(cardInstallment)}</strong>
                    </div>
                  </>
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
                      <div className="clinical-budget-payment-errors">
                        {rowErrors.map((msg) => (
                          <p key={msg}>{msg}</p>
                        ))}
                      </div>
                    ) : null}
                  </>
                ) : null}
              </div>
            ) : null}

            {!readOnly ? (
              <footer className="clinical-budget-payment-card-foot">
                {opt.type !== 'financiamento' ? (
                  <button
                    type="button"
                    className="button ghost clinical-budget-card-btn"
                    onClick={() => setExpandedId(isExpanded ? null : opt.id)}
                  >
                    {isExpanded ? <ChevronUp size={14} /> : <Settings2 size={14} />}
                    {isExpanded ? 'Recolher' : 'Configurar'}
                  </button>
                ) : null}
                <button
                  type="button"
                  className={`button secondary clinical-budget-card-btn${opt.presentToPatient ? ' is-active' : ''}`}
                  onClick={() => togglePresent(opt)}
                >
                  <Presentation size={14} />
                  Apresentar
                </button>
                {!opt.accepted ? (
                  <button
                    type="button"
                    className="button primary clinical-budget-card-btn"
                    onClick={() => markChosen(opt)}
                  >
                    <Check size={14} />
                    Escolher
                  </button>
                ) : null}
              </footer>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}
