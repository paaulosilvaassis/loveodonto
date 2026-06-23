import { useMemo, useState } from 'react';
import {
  BRAZIL_STATES,
  EMPTY_ONBOARDING_FORM,
  WIZARD_STEPS,
  buildOnboardingPayload,
  formatAddressSummary,
  maskOnboardingField,
  resolveAdminFromForm,
  validateOnboardingStep,
} from '../utils/clinicOnboarding.js';
import {
  PLAN_DEFINITIONS,
  PLAN_MODULES,
  formatPlanPrice,
  getPlanLabel,
} from '../services/platformConsoleConstants.js';
import { formatCpf, formatPhone, isCepValid, onlyDigits } from '../utils/validators.js';

async function lookupCep(cep, updateForm) {
  const digits = onlyDigits(cep);
  if (!isCepValid(digits)) return;
  try {
    const response = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
    if (!response.ok) return;
    const data = await response.json();
    if (data?.erro) return;
    updateForm({
      street: data.logradouro || '',
      neighborhood: data.bairro || '',
      city: data.localidade || '',
      state: data.uf || '',
    });
  } catch {
    /* autofill opcional */
  }
}

export default function ConsoleClinicOnboardingWizard({
  open,
  creating,
  catalogs,
  onClose,
  onSubmit,
}) {
  const [step, setStep] = useState(1);
  const [formError, setFormError] = useState('');
  const [form, setForm] = useState(EMPTY_ONBOARDING_FORM);

  const planModules = useMemo(
    () => PLAN_MODULES[form.planCode] || [],
    [form.planCode],
  );

  if (!open) return null;

  const updateForm = (patch) => {
    setForm((prev) => ({ ...prev, ...patch }));
  };

  const updateMaskedField = (field, value) => {
    updateForm({ [field]: maskOnboardingField(field, value) });
  };

  const resetWizard = () => {
    setStep(1);
    setFormError('');
    setForm({ ...EMPTY_ONBOARDING_FORM });
  };

  const handleClose = () => {
    if (creating) return;
    resetWizard();
    onClose();
  };

  const handleNext = () => {
    const err = validateOnboardingStep(step, form);
    if (err) {
      setFormError(err);
      return;
    }
    setFormError('');
    setStep((prev) => Math.min(WIZARD_STEPS.length, prev + 1));
  };

  const handleBack = () => {
    setFormError('');
    setStep((prev) => Math.max(1, prev - 1));
  };

  const handleConfirmCreate = async () => {
    const err = validateOnboardingStep(5, form);
    if (err) {
      setFormError(err);
      return;
    }
    setFormError('');
    try {
      await onSubmit(buildOnboardingPayload(form));
      resetWizard();
    } catch (error) {
      setFormError(error?.message || 'Erro ao criar clínica.');
    }
  };

  const billingContactName = form.billingSameAsLegal ? form.legalRepresentativeName : form.billingContactName;
  const billingContactEmail = form.billingSameAsLegal ? form.legalRepresentativeEmail : form.billingContactEmail;
  const adminAccess = resolveAdminFromForm(form);

  return (
    <div className="pc-onboarding-backdrop" role="dialog" aria-modal="true" aria-label="Nova clínica">
      <div className="pc-onboarding-panel">
        <div className="pc-onboarding-header">
          <h3>Nova Clínica</h3>
          <p>Cadastro completo para cobrança, endereço fiscal e responsabilidade legal.</p>
          <p>Etapa {step} de {WIZARD_STEPS.length}</p>
        </div>

        <div className="pc-onboarding-steps pc-onboarding-steps--5" aria-label="Progresso do cadastro">
          {WIZARD_STEPS.map((item) => {
            const isActive = step === item.id;
            const isDone = step > item.id;
            return (
              <div
                key={item.id}
                className={`pc-onboarding-step ${isActive ? 'is-active' : ''} ${isDone ? 'is-done' : ''}`}
              >
                <span className="pc-onboarding-step-dot">{isDone ? '●' : isActive ? '●' : '○'}</span>
                <span>{item.label}</span>
              </div>
            );
          })}
        </div>

        <div className="pc-onboarding-body">
          {step === 1 ? (
            <div className="pc-step-content">
              <h4>Dados da empresa</h4>
              <p className="pc-login__hint">Informações usadas em contrato, nota fiscal e identificação da clínica na plataforma.</p>
              <label className="pc-form-field">
                <span>Nome fantasia</span>
                <input value={form.tradeName} onChange={(e) => updateForm({ tradeName: e.target.value })} placeholder="Ex.: Clínica Exemplo" />
              </label>
              <label className="pc-form-field">
                <span>Razão social</span>
                <input value={form.legalName} onChange={(e) => updateForm({ legalName: e.target.value })} placeholder="Ex.: Clínica Exemplo LTDA" />
              </label>
              <div className="pc-form-grid-2">
                <label className="pc-form-field">
                  <span>CNPJ</span>
                  <input value={form.cnpj} onChange={(e) => updateMaskedField('cnpj', e.target.value)} placeholder="00.000.000/0000-00" />
                </label>
                <label className="pc-form-field">
                  <span>Telefone comercial</span>
                  <input value={form.clinicPhone} onChange={(e) => updateMaskedField('clinicPhone', e.target.value)} placeholder="(31) 99999-9999" />
                </label>
              </div>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="pc-step-content">
              <h4>Endereço fiscal e cobrança</h4>
              <label className="pc-form-field">
                <span>CEP</span>
                <input
                  value={form.zipCode}
                  onChange={(e) => updateMaskedField('zipCode', e.target.value)}
                  onBlur={() => lookupCep(form.zipCode, updateForm)}
                  placeholder="00000-000"
                />
              </label>
              <label className="pc-form-field">
                <span>Logradouro</span>
                <input value={form.street} onChange={(e) => updateForm({ street: e.target.value })} placeholder="Rua, avenida..." />
              </label>
              <div className="pc-form-grid-2">
                <label className="pc-form-field">
                  <span>Número</span>
                  <input value={form.streetNumber} onChange={(e) => updateForm({ streetNumber: e.target.value })} placeholder="123" />
                </label>
                <label className="pc-form-field">
                  <span>Complemento</span>
                  <input value={form.addressComplement} onChange={(e) => updateForm({ addressComplement: e.target.value })} placeholder="Sala, bloco..." />
                </label>
              </div>
              <label className="pc-form-field">
                <span>Bairro</span>
                <input value={form.neighborhood} onChange={(e) => updateForm({ neighborhood: e.target.value })} placeholder="Centro" />
              </label>
              <div className="pc-form-grid-2">
                <label className="pc-form-field">
                  <span>Cidade</span>
                  <input value={form.city} onChange={(e) => updateForm({ city: e.target.value })} placeholder="Belo Horizonte" />
                </label>
                <label className="pc-form-field">
                  <span>UF</span>
                  <select value={form.state} onChange={(e) => updateForm({ state: e.target.value })}>
                    <option value="">Selecione</option>
                    {BRAZIL_STATES.map((uf) => (
                      <option key={uf} value={uf}>{uf}</option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
          ) : null}

          {step === 3 ? (
            <div className="pc-step-content">
              <h4>Responsável legal e cobrança</h4>
              <p className="pc-login__hint">Esses dados vinculam a pessoa responsável pela clínica em caso de inadimplência ou suspensão do serviço.</p>
              <label className="pc-form-field">
                <span>Nome completo</span>
                <input value={form.legalRepresentativeName} onChange={(e) => updateForm({ legalRepresentativeName: e.target.value })} />
              </label>
              <div className="pc-form-grid-2">
                <label className="pc-form-field">
                  <span>CPF</span>
                  <input value={form.legalRepresentativeCpf} onChange={(e) => updateMaskedField('legalRepresentativeCpf', e.target.value)} />
                </label>
                <label className="pc-form-field">
                  <span>Cargo/função</span>
                  <input value={form.legalRepresentativeRole} onChange={(e) => updateForm({ legalRepresentativeRole: e.target.value })} />
                </label>
              </div>
              <div className="pc-form-grid-2">
                <label className="pc-form-field">
                  <span>E-mail</span>
                  <input type="email" value={form.legalRepresentativeEmail} onChange={(e) => updateForm({ legalRepresentativeEmail: e.target.value })} />
                </label>
                <label className="pc-form-field">
                  <span>Telefone</span>
                  <input value={form.legalRepresentativePhone} onChange={(e) => updateMaskedField('legalRepresentativePhone', e.target.value)} />
                </label>
              </div>
              <label className="pc-checkbox-field">
                <input
                  type="checkbox"
                  checked={form.billingSameAsLegal}
                  onChange={(e) => updateForm({ billingSameAsLegal: e.target.checked })}
                />
                <span>Usar o responsável legal também como contato de cobrança</span>
              </label>
              {!form.billingSameAsLegal ? (
                <>
                  <label className="pc-form-field">
                    <span>Contato de cobrança</span>
                    <input value={form.billingContactName} onChange={(e) => updateForm({ billingContactName: e.target.value })} />
                  </label>
                  <div className="pc-form-grid-2">
                    <label className="pc-form-field">
                      <span>E-mail de cobrança</span>
                      <input type="email" value={form.billingContactEmail} onChange={(e) => updateForm({ billingContactEmail: e.target.value })} />
                    </label>
                    <label className="pc-form-field">
                      <span>Telefone de cobrança</span>
                      <input value={form.billingContactPhone} onChange={(e) => updateMaskedField('billingContactPhone', e.target.value)} />
                    </label>
                  </div>
                </>
              ) : null}
            </div>
          ) : null}

          {step === 4 ? (
            <div className="pc-step-content">
              <h4>Plano de assinatura</h4>
              <p className="pc-login__hint">
                O login do Love Odonto usará o e-mail do responsável legal (
                <strong>{adminAccess.adminEmail || '—'}</strong>
                ). Enviaremos um convite por e-mail para definir a senha no primeiro acesso.
              </p>
              <div className="pc-review-grid pc-admin-summary">
                <p><strong>Administrador:</strong> {adminAccess.adminName || '—'}</p>
                <p><strong>E-mail de acesso:</strong> {adminAccess.adminEmail || '—'}</p>
                <p><strong>CPF:</strong> {form.legalRepresentativeCpf ? formatCpf(form.legalRepresentativeCpf) : '—'}</p>
                <p><strong>Telefone:</strong> {form.legalRepresentativePhone ? formatPhone(form.legalRepresentativePhone) : '—'}</p>
              </div>
              <div className="pc-plan-grid">
                {catalogs.plans.map((planCode) => {
                  const plan = PLAN_DEFINITIONS[planCode];
                  const selected = form.planCode === planCode;
                  return (
                    <button
                      key={planCode}
                      type="button"
                      className={`pc-plan-card ${selected ? 'is-selected' : ''}`}
                      onClick={() => updateForm({ planCode })}
                    >
                      <strong>{plan?.label || planCode}</strong>
                      <span className="pc-plan-card__price">{formatPlanPrice(planCode)}/mês</span>
                      {plan?.tagline ? <p className="pc-plan-card__tagline">{plan.tagline}</p> : null}
                      <ul>
                        {(plan?.benefits || []).map((benefit) => (
                          <li key={benefit}>{benefit}</li>
                        ))}
                      </ul>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          {step === 5 ? (
            <div className="pc-step-content">
              <h4>Revisão do cadastro</h4>
              <div className="pc-review-grid">
                <p><strong>Empresa:</strong> {form.tradeName} · {form.legalName}</p>
                <p><strong>CNPJ:</strong> {form.cnpj || '—'}</p>
                <p><strong>Endereço:</strong> {formatAddressSummary(form)}</p>
                <p><strong>Responsável legal:</strong> {form.legalRepresentativeName} · {form.legalRepresentativeEmail}</p>
                <p><strong>Cobrança:</strong> {billingContactName || '—'} · {billingContactEmail || '—'}</p>
                <p><strong>Administrador:</strong> {adminAccess.adminName} · {adminAccess.adminEmail}</p>
                <p><strong>Plano:</strong> {getPlanLabel(form.planCode)} ({formatPlanPrice(form.planCode)}/mês) · {planModules.join(', ')}</p>
              </div>
              <div className="pc-terms-box">
                <p>
                  Ao confirmar, a clínica será provisionada e enviaremos um e-mail para <strong>{adminAccess.adminEmail}</strong> com
                  o link de primeiro acesso e o contrato de usabilidade do sistema. O aceite oficial será registrado quando o responsável
                  confirmar pelo link recebido no e-mail.
                </p>
              </div>
            </div>
          ) : null}
        </div>

        {formError ? <p className="pc-error">{formError}</p> : null}

        <div className="pc-onboarding-actions">
          <button type="button" className="pc-button" onClick={handleClose} disabled={creating}>
            Cancelar
          </button>
          {step > 1 ? (
            <button type="button" className="pc-button" onClick={handleBack} disabled={creating}>
              Voltar
            </button>
          ) : null}
          {step < WIZARD_STEPS.length ? (
            <button type="button" className="pc-button pc-button--active" onClick={handleNext} disabled={creating}>
              Próxima etapa
            </button>
          ) : (
            <button type="button" className="pc-button pc-button--active" onClick={handleConfirmCreate} disabled={creating}>
              {creating ? 'Criando clínica...' : 'Criar clínica'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
