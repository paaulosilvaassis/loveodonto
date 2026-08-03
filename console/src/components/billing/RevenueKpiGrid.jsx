import { formatCurrency, formatCurrencyCompact } from './billingUtils.js';

const KPI_CONFIG = [
  { key: 'mrrCents', label: 'MRR', format: 'currency', accent: 'violet' },
  { key: 'arrCents', label: 'ARR', format: 'currency', accent: 'indigo' },
  { key: 'receivedThisMonthCents', label: 'Recebido no mês', format: 'currency', accent: 'green' },
  { key: 'forecastCents', label: 'Receita prevista', format: 'currency', accent: 'cyan' },
  { key: 'delinquencyPct', label: 'Inadimplência', format: 'percent', accent: 'orange' },
  { key: 'activeClinics', label: 'Clínicas ativas', format: 'number', accent: 'green' },
  { key: 'trialClinics', label: 'Em trial', format: 'number', accent: 'blue' },
  { key: 'blockedClinics', label: 'Bloqueadas', format: 'number', accent: 'gray' },
];

function formatValue(key, value, format) {
  if (format === 'percent') return `${Number(value || 0).toFixed(1)}%`;
  if (format === 'currency') return formatCurrencyCompact(value);
  return String(value ?? 0);
}

export default function RevenueKpiGrid({ metrics }) {
  const data = metrics || {};
  return (
    <div className="rc-kpi-grid">
      {KPI_CONFIG.map((item) => (
        <article key={item.key} className={`rc-kpi-card rc-kpi-card--${item.accent}`}>
          <span className="rc-kpi-card__label">{item.label}</span>
          <strong className="rc-kpi-card__value">{formatValue(item.key, data[item.key], item.format)}</strong>
          {item.format === 'currency' && data[item.key] > 99999 ? (
            <small>{formatCurrency(data[item.key])}</small>
          ) : null}
        </article>
      ))}
    </div>
  );
}
