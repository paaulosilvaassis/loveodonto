import { applyCurrencyMaskBRL, parseCurrencyBRL } from '../../utils/currency.js';
import { useState } from 'react';

const todayIso = () => new Date().toISOString().slice(0, 10);

const toBool = (value) => value === 'sim';

export default function FinancingFormModal({
  isOpen,
  patients,
  onClose,
  onSubmit,
}) {
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  if (!isOpen) return null;
  const requestClose = () => {
    if (isSubmitting) return;
    onClose();
  };
  return (
    <div className="modal-backdrop" onClick={requestClose}>
      <div className="modal-content finance-financing-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header finance-financing-modal-header">
          <h3>Novo Financiamento</h3>
        </div>
        <form
          className="modal-form finance-financing-form"
          onSubmit={(event) => {
            event.preventDefault();
            setError('');
            const form = event.target;
            const payload = {
              patient_id: form.patient_id.value,
              financial_responsible_id: form.financial_responsible_id.value || null,
              description: form.description.value?.trim(),
              contract_id: form.contract_id.value || null,
              treatment_plan_id: form.treatment_plan_id.value || null,
              total_amount: parseCurrencyBRL(form.total_amount.value || '0'),
              entry_amount: parseCurrencyBRL(form.entry_amount.value || '0'),
              installments_count: Number(form.installments_count.value || 1),
              installment_frequency: form.installment_frequency.value || 'monthly',
              first_due_date: form.first_due_date.value || todayIso(),
              issue_date: form.issue_date.value || todayIso(),
              interest_type: form.interest_type.value || 'none',
              interest_rate: Number(form.interest_rate.value || 0),
              fine_rate: Number(form.fine_rate.value || 0),
              late_interest_rate: Number(form.late_interest_rate.value || 0),
              discount_amount: parseCurrencyBRL(form.discount_amount.value || '0'),
              requires_credit_analysis: toBool(form.requires_credit_analysis.value),
              internal_notes: form.internal_notes.value || '',
              external_notes: form.external_notes.value || '',
              boleto_auto_generate: toBool(form.boleto_auto_generate.value),
              generate_carne: toBool(form.generate_carne.value),
              send_reminders: toBool(form.send_reminders.value),
              instructions: form.instructions.value || '',
              payer_data: {
                payer_name: form.payer_name.value || '',
                payer_document: form.payer_document.value || '',
                payer_email: form.payer_email.value || '',
                payer_phone: form.payer_phone.value || '',
                payer_zip_code: form.payer_zip_code.value || '',
                payer_street: form.payer_street.value || '',
                payer_number: form.payer_number.value || '',
                payer_complement: form.payer_complement.value || '',
                payer_district: form.payer_district.value || '',
                payer_city: form.payer_city.value || '',
                payer_state: form.payer_state.value || '',
                recipient_name: form.payer_name.value || '',
                recipient_document: form.payer_document.value || '',
                recipient_email: form.payer_email.value || '',
                recipient_phone: form.payer_phone.value || '',
              },
            };
            if (!payload.patient_id || !payload.description || payload.total_amount <= 0) {
              setError('Preencha paciente, descrição e valor total maior que zero.');
              return;
            }
            const submitData = {
              payload,
              options: {
                approve_immediately: toBool(form.approve_immediately.value),
                entry_received_now: toBool(form.entry_received_now.value),
              },
            };
            setIsSubmitting(true);
            try {
              onSubmit(submitData);
            } finally {
              setIsSubmitting(false);
            }
          }}
        >
          <div className="modal-body finance-financing-modal-body">
            <section className="finance-financing-form-block">
              {error ? <p className="finance-financing-inline-error">{error}</p> : null}
              <h4>Dados do Paciente</h4>
              <label>
                Paciente *
                <select name="patient_id" required>
                  <option value="">Selecione</option>
                  {patients.map((patient) => (
                    <option key={patient.id} value={patient.id}>{patient.full_name || patient.name || '—'}</option>
                  ))}
                </select>
              </label>
              <label>
                Responsável financeiro
                <input name="financial_responsible_id" type="text" placeholder="ID/Referência interna" />
              </label>
              <label>
                Nome pagador
                <input name="payer_name" type="text" placeholder="Nome completo do pagador" />
              </label>
              <label>
                CPF/CNPJ pagador
                <input name="payer_document" type="text" placeholder="Somente números" />
              </label>
              <label>
                E-mail pagador
                <input name="payer_email" type="email" placeholder="email@exemplo.com" />
              </label>
              <label>
                Telefone pagador
                <input name="payer_phone" type="text" placeholder="(00) 00000-0000" />
              </label>
              <label>
                CEP
                <input name="payer_zip_code" type="text" />
              </label>
              <label>
                Rua
                <input name="payer_street" type="text" />
              </label>
              <label>
                Número
                <input name="payer_number" type="text" />
              </label>
              <label>
                Complemento
                <input name="payer_complement" type="text" />
              </label>
              <label>
                Bairro
                <input name="payer_district" type="text" />
              </label>
              <label>
                Cidade
                <input name="payer_city" type="text" />
              </label>
              <label>
                Estado
                <input name="payer_state" type="text" maxLength={2} placeholder="UF" />
              </label>
            </section>

            <section className="finance-financing-form-block">
              <h4>Origem</h4>
              <label>
                Contrato
                <input name="contract_id" type="text" placeholder="ID do contrato (opcional)" />
              </label>
              <label>
                Plano de tratamento
                <input name="treatment_plan_id" type="text" placeholder="ID do plano (opcional)" />
              </label>
              <label>
                Descrição *
                <input name="description" type="text" required placeholder="Ex: Implante total superior" />
              </label>
            </section>

            <section className="finance-financing-form-block">
              <h4>Condição Financeira</h4>
              <label>
                Valor total *
                <input name="total_amount" type="text" required onInput={applyCurrencyMaskBRL} />
              </label>
              <label>
                Entrada
                <input name="entry_amount" type="text" onInput={applyCurrencyMaskBRL} />
              </label>
              <label>
                Quantidade de parcelas *
                <input name="installments_count" type="number" min="1" defaultValue="12" required />
              </label>
              <label>
                Frequência
                <select name="installment_frequency" defaultValue="monthly">
                  <option value="weekly">Semanal</option>
                  <option value="biweekly">Quinzenal</option>
                  <option value="monthly">Mensal</option>
                  <option value="bimonthly">Bimestral</option>
                </select>
              </label>
              <label>
                Primeiro vencimento
                <input name="first_due_date" type="date" defaultValue={todayIso()} />
              </label>
              <label>
                Emissão
                <input name="issue_date" type="date" defaultValue={todayIso()} />
              </label>
            </section>

            <section className="finance-financing-form-block">
              <h4>Encargos</h4>
              <label>
                Tipo de juros
                <select name="interest_type" defaultValue="none">
                  <option value="none">Sem juros</option>
                  <option value="simple">Juros simples</option>
                  <option value="compound">Juros compostos</option>
                </select>
              </label>
              <label>
                Taxa de juros (%)
                <input name="interest_rate" type="number" step="0.01" min="0" defaultValue="0" />
              </label>
              <label>
                Multa por atraso (%)
                <input name="fine_rate" type="number" step="0.01" min="0" defaultValue="0" />
              </label>
              <label>
                Juros por atraso (%)
                <input name="late_interest_rate" type="number" step="0.01" min="0" defaultValue="0" />
              </label>
              <label>
                Desconto total
                <input name="discount_amount" type="text" onInput={applyCurrencyMaskBRL} />
              </label>
            </section>

            <section className="finance-financing-form-block">
              <h4>Análise / Cobrança</h4>
              <label>
                Exigir análise?
                <select name="requires_credit_analysis" defaultValue="sim">
                  <option value="sim">Sim</option>
                  <option value="nao">Não</option>
                </select>
              </label>
              <label>
                Gerar boletos automaticamente?
                <select name="boleto_auto_generate" defaultValue="sim">
                  <option value="sim">Sim</option>
                  <option value="nao">Não</option>
                </select>
              </label>
              <label>
                Gerar carnê?
                <select name="generate_carne" defaultValue="nao">
                  <option value="sim">Sim</option>
                  <option value="nao">Não</option>
                </select>
              </label>
              <label>
                Enviar régua de cobrança?
                <select name="send_reminders" defaultValue="sim">
                  <option value="sim">Sim</option>
                  <option value="nao">Não</option>
                </select>
              </label>
              <label>
                Aprovar proposta ao salvar?
                <select name="approve_immediately" defaultValue="sim">
                  <option value="sim">Sim</option>
                  <option value="nao">Não</option>
                </select>
              </label>
              <label>
                Receber entrada no ato?
                <select name="entry_received_now" defaultValue="nao">
                  <option value="nao">Não</option>
                  <option value="sim">Sim</option>
                </select>
              </label>
              <label>
                Observações internas
                <textarea name="internal_notes" rows={3} />
              </label>
              <label>
                Observações externas
                <textarea name="external_notes" rows={3} />
              </label>
              <label>
                Instruções no boleto
                <textarea name="instructions" rows={3} />
              </label>
            </section>
          </div>
          <div className="modal-footer finance-financing-modal-footer">
            <button type="button" className="button secondary" onClick={requestClose} disabled={isSubmitting}>
              Cancelar
            </button>
            <button type="submit" className="button primary" disabled={isSubmitting}>
              {isSubmitting ? 'Salvando...' : 'Criar proposta'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
