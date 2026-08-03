import { Link } from 'react-router-dom';
import { getPlanLabel } from '../../services/platformConsoleConstants.js';
import { formatCurrency, formatDate } from './billingUtils.js';
import FinancialStatusBadge from './FinancialStatusBadge.jsx';

function formatDaysRemaining(days) {
  if (days == null) return '—';
  if (days < 0) return `${Math.abs(days)}d atraso`;
  if (days === 0) return 'Hoje';
  return `${days}d`;
}

export default function RevenueClinicsTable({ clinics, search = '' }) {
  const query = String(search || '').trim().toLowerCase();
  const rows = (clinics || []).filter((row) => {
    if (!query) return true;
    return (
      String(row.clinicName || '').toLowerCase().includes(query)
      || String(row.responsibleName || '').toLowerCase().includes(query)
      || String(row.planCode || '').toLowerCase().includes(query)
    );
  });

  if (rows.length === 0) {
    return (
      <div className="rc-empty">
        <strong>Nenhuma clínica encontrada</strong>
        <p>Ajuste os filtros ou provisione uma nova clínica.</p>
      </div>
    );
  }

  return (
    <div className="rc-table-wrap">
      <table className="rc-table">
        <thead>
          <tr>
            <th>Clínica</th>
            <th>Responsável</th>
            <th>Plano</th>
            <th>Valor mensal</th>
            <th>Próx. vencimento</th>
            <th>Dias</th>
            <th>Último pagamento</th>
            <th>Status</th>
            <th>Ações</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.tenantId}>
              <td>
                <strong>{row.clinicName}</strong>
              </td>
              <td>
                <span>{row.responsibleName}</span>
                {row.responsibleEmail ? <small>{row.responsibleEmail}</small> : null}
              </td>
              <td>{getPlanLabel(row.planCode)}</td>
              <td>{formatCurrency(row.monthlyAmountCents)}</td>
              <td>{formatDate(row.dueDate)}</td>
              <td>
                <span className={row.daysRemaining != null && row.daysRemaining < 0 ? 'rc-text-warn' : ''}>
                  {formatDaysRemaining(row.daysRemaining)}
                </span>
              </td>
              <td>{row.lastPaymentAt ? formatDate(row.lastPaymentAt) : '—'}</td>
              <td>
                <FinancialStatusBadge status={row.financialStatus} />
              </td>
              <td>
                <Link to={`/billing/${row.tenantId}`} className="rc-btn rc-btn--ghost">
                  Gerenciar
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
