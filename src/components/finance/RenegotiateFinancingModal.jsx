import { applyCurrencyMaskBRL, parseCurrencyBRL } from '../../utils/currency.js';
import { useState } from 'react';

const todayIso = () => new Date().toISOString().slice(0, 10);

export default function RenegotiateFinancingModal({
  isOpen,
  installments,
  onClose,
  onSubmit,
}) {
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  if (!isOpen) return null;
  const selectable = installments.filter((item) => Number(item.remaining_amount || 0) > 0);
  const requestClose = () => {
    if (isSubmitting) return;
    onClose();
  };
  return (
    <div className="modal-backdrop" onClick={requestClose}>
      <div className="modal-content finance-financing-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header finance-financing-modal-header">
          <h3>Renegociar Financiamento</h3>
        </div>
        <form
          className="modal-form finance-financing-form"
          onSubmit={(event) => {
            event.preventDefault();
            setError('');
            const form = event.target;
            const selectedIds = Array.from(form.querySelectorAll('input[name="installment_ids"]:checked'))
              .map((item) => item.value);
            if (selectedIds.length === 0) {
              setError('Selecione ao menos uma parcela para renegociação.');
              return;
            }
            const payload = {
              installment_ids: selectedIds,
              discount_amount: parseCurrencyBRL(form.discount_amount.value || '0'),
              interest_amount: parseCurrencyBRL(form.interest_amount.value || '0'),
              new_installments_count: Number(form.new_installments_count.value || 1),
              first_due_date: form.first_due_date.value || todayIso(),
              issue_date: form.issue_date.value || todayIso(),
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
              <h4>Parcelas para renegociar</h4>
              <div className="finance-financing-checkbox-list">
                {selectable.length === 0 ? (
                  <span>Não há parcelas abertas para renegociação.</span>
                ) : (
                  selectable.map((item) => (
                    <label key={item.id} className="finance-financing-checkbox-item">
                      <input type="checkbox" name="installment_ids" value={item.id} />
                      <span>
                        Parcela {item.installment_number}/{item.total_installments} - Vencimento {item.due_date} - Aberto {Number(item.remaining_amount || 0).toFixed(2)}
                      </span>
                    </label>
                  ))
                )}
              </div>
              <label>
                Desconto na renegociação
                <input name="discount_amount" type="text" onInput={applyCurrencyMaskBRL} />
              </label>
              <label>
                Juros adicionais na renegociação
                <input name="interest_amount" type="text" onInput={applyCurrencyMaskBRL} />
              </label>
              <label>
                Novo número de parcelas
                <input name="new_installments_count" type="number" min="1" defaultValue="6" />
              </label>
              <label>
                Data de emissão do novo plano
                <input name="issue_date" type="date" defaultValue={todayIso()} />
              </label>
              <label>
                Primeiro vencimento do novo plano
                <input name="first_due_date" type="date" defaultValue={todayIso()} />
              </label>
            </section>
          </div>
          <div className="modal-footer finance-financing-modal-footer">
            <button type="button" className="button secondary" onClick={requestClose} disabled={isSubmitting}>Cancelar</button>
            <button type="submit" className="button primary" disabled={isSubmitting}>
              {isSubmitting ? 'Processando...' : 'Gerar nova negociação'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
