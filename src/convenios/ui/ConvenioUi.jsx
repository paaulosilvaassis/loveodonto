import { formatCurrencyBRL } from '../../utils/currency.js';

const KPI_VARIANTS = {
  primary: 'primary',
  info: 'info',
  success: 'success',
  warning: 'warning',
  danger: 'danger',
  revenue: 'revenue',
};

export function ConvenioKpiGrid({ items }) {
  return (
    <div className="conv-kpi-grid">
      {items.map((item) => (
        <div key={item.key} className={`conv-kpi conv-kpi--${KPI_VARIANTS[item.variant] || 'primary'}`}>
          <span className="conv-kpi-label">{item.label}</span>
          <strong className="conv-kpi-value">{item.value}</strong>
        </div>
      ))}
    </div>
  );
}

export function ConvenioEmpty({ message }) {
  return <p className="conv-empty">{message}</p>;
}

export function ConvenioTable({ columns, rows, emptyMessage = 'Nenhum registro.' }) {
  if (!rows?.length) return <ConvenioEmpty message={emptyMessage} />;
  return (
    <div className="conv-table-wrap">
      <table className="conv-table">
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

export function formatConvCurrency(value) {
  return formatCurrencyBRL(value ?? 0);
}

export function ConvenioStatusBadge({ label, tone = 'neutral' }) {
  return <span className={`conv-badge conv-badge--${tone}`}>{label}</span>;
}
