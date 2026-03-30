import { formatCurrencyBRL } from '../../utils/currency.js';
import { useState } from 'react';

export default function GenerateBoletoModal({
  isOpen,
  installment,
  onClose,
  onSubmit,
}) {
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  if (!isOpen || !installment) return null;
  const requestClose = () => {
    if (isSubmitting) return;
    onClose();
  };
  return (
    <div className="modal-backdrop" onClick={requestClose}>
      <div className="modal-content finance-financing-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header finance-financing-modal-header">
          <h3>Gerar Boleto</h3>
        </div>
        <form
          className="modal-form finance-financing-form"
          onSubmit={(event) => {
            event.preventDefault();
            setError('');
            const form = event.target;
            const amount = Number(form.amount.value || installment.net_amount || 0);
            if (amount <= 0) {
              setError('Informe um valor maior que zero para gerar a cobrança.');
              return;
            }
            const payload = {
              installment_id: installment.id,
              due_date: form.due_date.value || installment.due_date,
              amount,
              recipient_name: form.recipient_name.value || '',
              recipient_document: form.recipient_document.value || '',
              recipient_email: form.recipient_email.value || '',
              recipient_phone: form.recipient_phone.value || '',
              instructions: form.instructions.value || '',
              message_template: form.message_template.value || '',
            };
            setIsSubmitting(true);
            try {
              onSubmit(payload);
            } finally {
              setIsSubmitting(false);
            }
          }}
        >
          <div className="modal-body finance-financing-modal-body">
            <section className="finance-financing-form-block">
              {error ? <p className="finance-financing-inline-error">{error}</p> : null}
              <p>Parcela {installment.installment_number}/{installment.total_installments}</p>
              <p>Valor atual: <strong>{formatCurrencyBRL(installment.net_amount)}</strong></p>
              <label>
                Vencimento
                <input name="due_date" type="date" defaultValue={installment.due_date || ''} />
              </label>
              <label>
                Valor
                <input name="amount" type="number" min="0" step="0.01" defaultValue={Number(installment.net_amount || 0)} />
              </label>
              <label>
                Nome destinatário
                <input name="recipient_name" type="text" />
              </label>
              <label>
                CPF/CNPJ destinatário
                <input name="recipient_document" type="text" />
              </label>
              <label>
                E-mail destinatário
                <input name="recipient_email" type="email" />
              </label>
              <label>
                Telefone destinatário
                <input name="recipient_phone" type="text" />
              </label>
              <label>
                Instruções
                <textarea name="instructions" rows={3} />
              </label>
              <label>
                Mensagem da cobrança
                <textarea name="message_template" rows={3} />
              </label>
            </section>
          </div>
          <div className="modal-footer finance-financing-modal-footer">
            <button type="button" className="button secondary" onClick={requestClose} disabled={isSubmitting}>Cancelar</button>
            <button type="submit" className="button primary" disabled={isSubmitting}>
              {isSubmitting ? 'Gerando...' : 'Gerar boleto'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
