import { useMemo, useState } from 'react';
import { Check, Presentation } from 'lucide-react';
import { formatCurrencyBRL } from '../../utils/currency.js';
import { DEFAULT_PAYMENT_OPTIONS } from './clinicalAppointmentConfig.js';
import {
  calcOptionFinalValue,
  CASH_METHODS,
  CARD_BRANDS,
} from './budget/budgetUtils.js';
import { presentPaymentCondition } from './budget/budgetPaymentPresentationService.js';
import { getPaymentOptionTitle } from './budget/budgetEventLabels.js';
import {
  getFinancingSummaryForOption,
  INTEREST_TYPE_OPTIONS,
  validateFinancingPaymentOption,
  isPartnerManualMode,
  getPartnerMaxInstallments,
} from './budget/budgetFinancingUtils.js';
import { BudgetFinancingEntryPanel } from './budget/BudgetFinancingEntryPanel.jsx';
import {
  listActiveFinancialPartners,
  applyPartnerDefaultsToOption,
  canOverridePartnerTerms,
  FINANCIAL_PARTNER_SPECIAL_IDS,
} from '../../services/financialPartnersService.js';

function calcInstallment(total, down, installments) {
  const rest = Math.max(0, Number(total || 0) - Number(down || 0));
  const n = Math.max(1, Number(installments || 1));
  return rest / n;
}

function methodLabels(opt) {
  return (opt.methods || [opt.method])
    .filter(Boolean)
    .map((m) => CASH_METHODS.find((c) => c.value === m)?.label || m)
    .join(' / ');
}

export function BudgetPaymentOptionsPanel({
  budget,
  setBudget,
  originalValue,
  onPresent,
  onChoose,
  readOnly,
  user,
}) {
  const [financingErrors, setFinancingErrors] = useState({});

  const partners = useMemo(() => listActiveFinancialPartners(), []);
  const canEditTerms = canOverridePartnerTerms(user);

  const options = budget.paymentOptions?.length
    ? budget.paymentOptions
    : DEFAULT_PAYMENT_OPTIONS().map((o) => ({ ...o, total: originalValue }));

  const updateOption = (id, patch) => {
    const next = options.map((opt) => (opt.id === id ? { ...opt, ...patch } : opt));
    setBudget({ ...budget, paymentOptions: next });
    if (patch.downPayment !== undefined || patch.installments !== undefined) {
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
    const result = presentPaymentCondition(budget, opt.id, { originalValue, user });
    if (!result.ok) {
      if (result.errors?.length) {
        setFinancingErrors((prev) => ({ ...prev, [opt.id]: result.errors }));
      }
      return;
    }
    setFinancingErrors((prev) => ({ ...prev, [opt.id]: null }));
    setBudget(result.nextBudget);
    if (onPresent && result.action === 'presented') {
      onPresent(result.option, result.nextBudget);
    } else if (onPresent && result.action === 'unpresented') {
      onPresent(result.option, result.nextBudget, { action: 'unpresented' });
    }
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
    <div className="clinical-budget-payment-list">
      <p className="clinical-budget-payment-intro">
        Um único orçamento com propostas de pagamento. Apresente as condições ao paciente e marque a escolhida.
      </p>

      {options.map((opt) => {
        const title = getPaymentOptionTitle(opt);
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

        const rowClass = [
          'clinical-budget-payment-row-item',
          opt.presentToPatient ? 'is-presented' : '',
          opt.accepted ? 'is-chosen' : '',
        ].filter(Boolean).join(' ');

        return (
          <article key={opt.id} className={rowClass}>
            <div className="clinical-budget-payment-row-head">
              <span className="clinical-budget-payment-row-title">{title}</span>
              {opt.accepted ? (
                <span className="clinical-budget-payment-chosen-tag">
                  <Check size={14} />
                  Condição escolhida
                </span>
              ) : null}
              {opt.presentToPatient && !opt.accepted ? (
                <span className="clinical-budget-payment-present-tag">Apresentada</span>
              ) : null}
            </div>

            <div className="clinical-budget-payment-row-fields">
              {opt.type === 'a_vista' && (
                <>
                  <div className="clinical-budget-payment-field">
                    <span>Valor</span>
                    <strong>{formatCurrencyBRL(finalVal)}</strong>
                  </div>
                  <div className="clinical-budget-payment-field clinical-budget-payment-field--wide">
                    <span>Forma</span>
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
                  <div className="clinical-budget-payment-field">
                    <span>Desconto</span>
                    <div className="clinical-budget-payment-inline-input">
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
                      <span>%</span>
                    </div>
                  </div>
                </>
              )}

              {opt.type === 'parcelado_clinica' && (
                <>
                  <div className="clinical-budget-payment-field">
                    <span>Entrada</span>
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
                  </div>
                  <div className="clinical-budget-payment-field">
                    <span>Parcelas</span>
                    <div className="clinical-budget-payment-inline-input">
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
                      <span>x</span>
                    </div>
                  </div>
                  <div className="clinical-budget-payment-field">
                    <span>Valor parcela</span>
                    <strong>{formatCurrencyBRL(installmentValue)}</strong>
                  </div>
                </>
              )}

              {opt.type === 'cartao' && (
                <>
                  <div className="clinical-budget-payment-field">
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
                  </div>
                  <div className="clinical-budget-payment-field">
                    <span>Parcelas</span>
                    <div className="clinical-budget-payment-inline-input">
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
                      <span>x</span>
                    </div>
                  </div>
                  <div className="clinical-budget-payment-field">
                    <span>Valor parcela</span>
                    <strong>{formatCurrencyBRL(cardInstallment)}</strong>
                  </div>
                </>
              )}

              {opt.type === 'financiamento' && (
                <>
                  <div className="clinical-budget-payment-field clinical-budget-payment-field--wide">
                    <span>Parceiro financeiro</span>
                    <select
                      value={opt.partnerId || ''}
                      onChange={(e) => handlePartnerChange(opt, e.target.value)}
                      disabled={readOnly}
                    >
                      <option value="">Selecione o parceiro…</option>
                      {partners.map((partner) => (
                        <option key={partner.id} value={partner.id}>{partner.name}</option>
                      ))}
                    </select>
                  </div>
                  {manualPartner ? (
                    <div className="clinical-budget-payment-field clinical-budget-payment-field--wide">
                      <span>Nome do parceiro</span>
                      <input
                        type="text"
                        value={opt.customPartnerName || opt.partner || ''}
                        onChange={(e) => updateOption(opt.id, {
                          customPartnerName: e.target.value,
                          partner: e.target.value,
                        })}
                        placeholder="Informe o parceiro externo"
                        disabled={readOnly}
                      />
                    </div>
                  ) : null}
                  <BudgetFinancingEntryPanel
                    option={opt}
                    treatmentTotal={finalVal}
                    summary={financingSummary}
                    disabled={readOnly}
                    onChange={(patch) => updateOption(opt.id, patch)}
                  />
                  <div className="clinical-budget-payment-field">
                    <span>Tipo de juros</span>
                    <select
                      value={opt.interestType || 'none'}
                      onChange={(e) => updateOption(opt.id, { interestType: e.target.value })}
                      disabled={readOnly || termsLocked}
                    >
                      {INTEREST_TYPE_OPTIONS.map((item) => (
                        <option key={item.value} value={item.value}>{item.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="clinical-budget-payment-field">
                    <span>Taxa aplicada (%)</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={opt.interestRate || 0}
                      onChange={(e) =>
                        updateOption(opt.id, { interestRate: Number(e.target.value) })
                      }
                      disabled={readOnly || termsLocked || opt.interestType === 'none'}
                    />
                  </div>
                  <div className="clinical-budget-payment-field">
                    <span>Parcelas</span>
                    <div className="clinical-budget-payment-inline-input">
                      <input
                        type="number"
                        min="1"
                        max={maxInstallments}
                        value={opt.installments || 1}
                        onChange={(e) =>
                          updateOption(opt.id, { installments: Number(e.target.value) })
                        }
                        disabled={readOnly || termsLocked}
                      />
                      <span>x · máx. {maxInstallments}</span>
                    </div>
                  </div>
                  <div className="clinical-budget-payment-field">
                    <span>1º vencimento</span>
                    <input
                      type="date"
                      value={opt.firstDueDate || ''}
                      onChange={(e) => updateOption(opt.id, { firstDueDate: e.target.value })}
                      disabled={readOnly}
                    />
                  </div>
                  {financingSummary && financingSummary.adminFee > 0 ? (
                    <div className="clinical-budget-payment-field">
                      <span>Taxa administrativa</span>
                      <strong>{formatCurrencyBRL(financingSummary.adminFee)}</strong>
                    </div>
                  ) : null}
                  {rowErrors.length ? (
                    <div className="clinical-budget-payment-errors">
                      {rowErrors.map((msg) => (
                        <p key={msg}>{msg}</p>
                      ))}
                    </div>
                  ) : null}
                  {termsLocked ? (
                    <p className="clinical-budget-payment-hint">
                      Condições definidas pelo parceiro. Edição manual requer permissão de orçamento/financeiro.
                    </p>
                  ) : null}
                  {opt.partnerId === FINANCIAL_PARTNER_SPECIAL_IDS.OTHER ? (
                    <p className="clinical-budget-payment-hint">
                      Preencha manualmente juros, taxas e parcelas para parceiros não cadastrados.
                    </p>
                  ) : null}
                </>
              )}
            </div>

            {!readOnly ? (
              <footer className="clinical-budget-payment-row-actions">
                <button
                  type="button"
                  className={`button secondary${opt.presentToPatient ? ' is-active' : ''}`}
                  onClick={() => togglePresent(opt)}
                >
                  <Presentation size={14} />
                  {opt.presentToPatient ? 'Apresentada ao paciente' : 'Apresentar ao paciente'}
                </button>
                {!opt.accepted ? (
                  <button
                    type="button"
                    className="button primary"
                    onClick={() => markChosen(opt)}
                  >
                    <Check size={14} />
                    Marcar condição escolhida
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
