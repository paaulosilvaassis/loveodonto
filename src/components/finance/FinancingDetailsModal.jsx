import { formatCurrencyBRL } from '../../utils/currency.js';
import { FINANCING_STATUS } from '../../services/financingsService.js';
import { FINANCING_INSTALLMENT_STATUS } from '../../services/financingInstallmentsService.js';

const formatDate = (iso) => {
  if (!iso) return '—';
  try {
    return new Date(`${iso}T12:00:00`).toLocaleDateString('pt-BR');
  } catch {
    return iso;
  }
};

const financingStatusLabel = {
  [FINANCING_STATUS.DRAFT]: 'Rascunho',
  [FINANCING_STATUS.PENDING_ANALYSIS]: 'Em análise',
  [FINANCING_STATUS.APPROVED]: 'Aprovado',
  [FINANCING_STATUS.ACTIVE]: 'Ativo',
  [FINANCING_STATUS.PARTIALLY_PAID]: 'Parcialmente pago',
  [FINANCING_STATUS.PAID_OFF]: 'Quitado',
  [FINANCING_STATUS.OVERDUE]: 'Em atraso',
  [FINANCING_STATUS.RENEGOTIATED]: 'Renegociado',
  [FINANCING_STATUS.CANCELED]: 'Cancelado',
  [FINANCING_STATUS.DEFAULTED]: 'Inadimplente',
};

const installmentStatusLabel = {
  [FINANCING_INSTALLMENT_STATUS.PENDING]: 'Pendente',
  [FINANCING_INSTALLMENT_STATUS.DUE_TODAY]: 'Vence hoje',
  [FINANCING_INSTALLMENT_STATUS.UPCOMING]: 'A vencer',
  [FINANCING_INSTALLMENT_STATUS.OVERDUE]: 'Atrasada',
  [FINANCING_INSTALLMENT_STATUS.PARTIALLY_PAID]: 'Parcial',
  [FINANCING_INSTALLMENT_STATUS.PAID]: 'Paga',
  [FINANCING_INSTALLMENT_STATUS.CANCELED]: 'Cancelada',
  [FINANCING_INSTALLMENT_STATUS.RENEGOTIATED]: 'Renegociada',
};

export default function FinancingDetailsModal({
  isOpen,
  financing,
  installments,
  boletos,
  payments,
  timeline,
  onClose,
}) {
  if (!isOpen || !financing) return null;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content modal-content-large finance-financing-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header finance-financing-modal-header">
          <h3>Detalhes do Financiamento</h3>
          <p className="finance-financing-modal-desc">{financing.description}</p>
        </div>
        <div className="modal-body finance-financing-modal-body">
          <section className="finance-financing-details-grid">
            <div>
              <span className="finance-financing-details-label">Status</span>
              <strong>{financingStatusLabel[financing.status] || financing.status}</strong>
            </div>
            <div>
              <span className="finance-financing-details-label">Valor total</span>
              <strong>{formatCurrencyBRL(financing.total_amount)}</strong>
            </div>
            <div>
              <span className="finance-financing-details-label">Entrada</span>
              <strong>{formatCurrencyBRL(financing.entry_amount)}</strong>
            </div>
            <div>
              <span className="finance-financing-details-label">Financiado</span>
              <strong>{formatCurrencyBRL(financing.net_financed_amount)}</strong>
            </div>
            <div>
              <span className="finance-financing-details-label">Em aberto</span>
              <strong>{formatCurrencyBRL(financing.total_open_amount)}</strong>
            </div>
            <div>
              <span className="finance-financing-details-label">Recebido</span>
              <strong>{formatCurrencyBRL(financing.total_paid_amount)}</strong>
            </div>
          </section>

          <section className="finance-financing-details-section">
            <h4>Parcelas</h4>
            <div className="finance-receivables-table-wrap">
              <table className="finance-receivables-table">
                <thead>
                  <tr>
                    <th>Parcela</th>
                    <th>Vencimento</th>
                    <th>Valor</th>
                    <th>Pago</th>
                    <th>Aberto</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {installments.length === 0 ? (
                    <tr><td colSpan={6}>Sem parcelas.</td></tr>
                  ) : (
                    installments.map((item) => (
                      <tr key={item.id}>
                        <td>{item.installment_number}/{item.total_installments}</td>
                        <td>{formatDate(item.due_date)}</td>
                        <td>{formatCurrencyBRL(item.net_amount)}</td>
                        <td>{formatCurrencyBRL(item.paid_amount)}</td>
                        <td>{formatCurrencyBRL(item.remaining_amount)}</td>
                        <td>{installmentStatusLabel[item.status] || item.status}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="finance-financing-details-section">
            <h4>Boletos / Cobranças</h4>
            <div className="finance-receivables-table-wrap">
              <table className="finance-receivables-table">
                <thead>
                  <tr>
                    <th>Tipo</th>
                    <th>Vencimento</th>
                    <th>Valor</th>
                    <th>Status</th>
                    <th>Emissão</th>
                  </tr>
                </thead>
                <tbody>
                  {(boletos || []).length === 0 ? (
                    <tr><td colSpan={5}>Sem cobranças emitidas.</td></tr>
                  ) : (
                    (boletos || []).map((item) => (
                      <tr key={item.id}>
                        <td>{item.charge_type || 'boleto'}</td>
                        <td>{formatDate(item.due_date)}</td>
                        <td>{formatCurrencyBRL(item.amount)}</td>
                        <td>{item.status || '—'}</td>
                        <td>{formatDate(item.issue_date)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="finance-financing-details-section">
            <h4>Pagamentos</h4>
            <div className="finance-receivables-table-wrap">
              <table className="finance-receivables-table">
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Valor</th>
                    <th>Método</th>
                    <th>Recebível</th>
                  </tr>
                </thead>
                <tbody>
                  {(payments || []).length === 0 ? (
                    <tr><td colSpan={4}>Sem pagamentos registrados.</td></tr>
                  ) : (
                    (payments || []).map((item) => (
                      <tr key={item.id}>
                        <td>{formatDate(item.payment_date)}</td>
                        <td>{formatCurrencyBRL(item.amount_received)}</td>
                        <td>{item.payment_method || '—'}</td>
                        <td>{item.receivable_id || '—'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="finance-financing-details-section">
            <h4>Histórico</h4>
            <ul className="finance-financing-timeline">
              {timeline.length === 0 ? (
                <li>Nenhum evento registrado.</li>
              ) : (
                timeline.map((event) => (
                  <li key={event.id}>
                    <strong>{event.title || event.event_type}</strong>
                    <span>{event.description || '—'}</span>
                    <small>{new Date(event.created_at).toLocaleString('pt-BR')}</small>
                  </li>
                ))
              )}
            </ul>
          </section>
        </div>
        <div className="modal-footer finance-financing-modal-footer">
          <button type="button" className="button secondary" onClick={onClose}>Fechar</button>
        </div>
      </div>
    </div>
  );
}
