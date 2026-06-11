import { formatCurrencyBRL } from '../../utils/currency.js';
import { CONTRACT_STATUS_LABELS, CONTRACT_STATUS_VARIANT } from '../contractConstants.js';

export function ContractKpiGrid({ items }) {
  return (
    <div className="ctr-kpi-grid">
      {items.map((item) => (
        <div key={item.key} className={`ctr-kpi ctr-kpi--${item.variant || 'primary'}`}>
          <span className="ctr-kpi-label">{item.label}</span>
          <strong className="ctr-kpi-value">{item.value}</strong>
        </div>
      ))}
    </div>
  );
}

export function ContractStatusBadge({ status }) {
  const label = CONTRACT_STATUS_LABELS[status] || status;
  const variant = CONTRACT_STATUS_VARIANT[status] || 'muted';
  return <span className={`ctr-badge ctr-badge--${variant}`}>{label}</span>;
}

export function ContractTable({ columns, rows, emptyMessage = 'Nenhum registro.' }) {
  if (!rows?.length) {
    return <p className="ctr-empty">{emptyMessage}</p>;
  }
  return (
    <div className="ctr-table-wrap">
      <table className="ctr-table">
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col.key}>{col.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id || row._key}>
              {columns.map((col) => (
                <td key={col.key}>
                  {col.render ? col.render(row) : row[col.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function formatCtrCurrency(value) {
  return formatCurrencyBRL(value ?? 0);
}

export function ContractDocumentPreview({ html, className = '' }) {
  return (
    <div
      className={`ctr-doc-preview ${className}`}
      dangerouslySetInnerHTML={{ __html: html || '<p><em>Sem conteúdo</em></p>' }}
    />
  );
}
