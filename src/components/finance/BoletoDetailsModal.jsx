import { formatCurrencyBRL } from '../../utils/currency.js';

const formatDateTime = (value) => {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString('pt-BR');
  } catch {
    return value;
  }
};

export default function BoletoDetailsModal({
  isOpen,
  boleto,
  onClose,
}) {
  if (!isOpen || !boleto) return null;
  return (
    <div className="modal-backdrop">
      <div className="modal-content finance-financing-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header finance-financing-modal-header">
          <h3>Detalhes do Boleto</h3>
        </div>
        <div className="modal-body finance-financing-modal-body">
          <section className="finance-financing-form-block">
            <span><strong>Status:</strong> {boleto.status}</span>
            <span><strong>Tipo:</strong> {boleto.charge_type}</span>
            <span><strong>Valor:</strong> {formatCurrencyBRL(boleto.amount)}</span>
            <span><strong>Vencimento:</strong> {boleto.due_date || '—'}</span>
            <span><strong>Linha digitável:</strong> {boleto.linha_digitavel || '—'}</span>
            <span><strong>Código de barras:</strong> {boleto.barcode || '—'}</span>
            <span><strong>Nosso número:</strong> {boleto.nosso_numero || '—'}</span>
            <span><strong>Boleto URL:</strong> {boleto.boleto_url || '—'}</span>
            <span><strong>Invoice URL:</strong> {boleto.invoice_url || '—'}</span>
            <span><strong>Enviado em:</strong> {formatDateTime(boleto.sent_at)}</span>
            <span><strong>Visualizado em:</strong> {formatDateTime(boleto.viewed_at)}</span>
            <span><strong>Pago em:</strong> {formatDateTime(boleto.paid_at)}</span>
            <span><strong>Cancelado em:</strong> {formatDateTime(boleto.canceled_at)}</span>
          </section>
        </div>
        <div className="modal-footer finance-financing-modal-footer">
          <button type="button" className="button secondary" onClick={onClose}>Fechar</button>
        </div>
      </div>
    </div>
  );
}
