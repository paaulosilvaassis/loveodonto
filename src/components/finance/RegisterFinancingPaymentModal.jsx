import { applyCurrencyMaskBRL, parseCurrencyBRL, formatCurrencyBRL } from '../../utils/currency.js';
import { useState } from 'react';

const todayIso = () => new Date().toISOString().slice(0, 10);

export default function RegisterFinancingPaymentModal({
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
          <h3>Registrar Pagamento</h3>
          <p className="finance-financing-modal-desc">
            Parcela {installment.installment_number}/{installment.total_installments} - Aberto: {formatCurrencyBRL(installment.remaining_amount)}
          </p>
        </div>
        <form
          className="modal-form finance-financing-form"
          onSubmit={(event) => {
            event.preventDefault();
            setError('');
            const form = event.target;
            const amount = parseCurrencyBRL(form.amount_received.value || '0');
            if (amount <= 0) {
              setError('Informe um valor recebido maior que zero.');
              return;
            }
            const payload = {
              installment_id: installment.id,
              payment_date: form.payment_date.value || todayIso(),
              amount_received: amount,
              discount_amount: parseCurrencyBRL(form.discount_amount.value || '0'),
              interest_amount: parseCurrencyBRL(form.interest_amount.value || '0'),
              fine_amount: parseCurrencyBRL(form.fine_amount.value || '0'),
              payment_method: form.payment_method.value || 'boleto',
              notes: form.notes.value || '',
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
              <label>
                Data do pagamento
                <input name="payment_date" type="date" defaultValue={todayIso()} />
              </label>
              <label>
                Valor recebido
                <input name="amount_received" type="text" required onInput={applyCurrencyMaskBRL} />
              </label>
              <label>
                Desconto
                <input name="discount_amount" type="text" onInput={applyCurrencyMaskBRL} />
              </label>
              <label>
                Juros
                <input name="interest_amount" type="text" onInput={applyCurrencyMaskBRL} />
              </label>
              <label>
                Multa
                <input name="fine_amount" type="text" onInput={applyCurrencyMaskBRL} />
              </label>
              <label>
                Forma de pagamento
                <select name="payment_method" defaultValue="boleto">
                  <option value="boleto">Boleto</option>
                  <option value="pix">PIX</option>
                  <option value="dinheiro">Dinheiro</option>
                  <option value="transferencia">Transferência</option>
                  <option value="cartao_credito">Cartão de crédito</option>
                </select>
              </label>
              <label>
                Observações
                <textarea name="notes" rows={3} />
              </label>
            </section>
          </div>
          <div className="modal-footer finance-financing-modal-footer">
            <button type="button" className="button secondary" onClick={requestClose} disabled={isSubmitting}>Cancelar</button>
            <button type="submit" className="button primary" disabled={isSubmitting}>
              {isSubmitting ? 'Registrando...' : 'Registrar baixa'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
