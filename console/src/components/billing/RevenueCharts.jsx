import { formatCurrency, formatMonthLabel } from './billingUtils.js';
import { getPlanLabel } from '../../services/platformConsoleConstants.js';

function BarChart({ title, subtitle, items, valueKey, labelKey, tone = 'violet' }) {
  const max = Math.max(1, ...items.map((item) => item[valueKey] || 0));
  return (
    <article className="rc-chart-card">
      <header>
        <h3>{title}</h3>
        {subtitle ? <p>{subtitle}</p> : null}
      </header>
      <div className="rc-chart-bars">
        {items.map((item) => {
          const value = item[valueKey] || 0;
          const heightPct = Math.max(4, Math.round((value / max) * 100));
          const label = labelKey === 'month' ? formatMonthLabel(item.month) : (item[labelKey] || '—');
          const displayValue = valueKey.includes('Cents') || valueKey === 'amountCents'
            ? formatCurrency(value)
            : value;
          return (
            <div key={`${label}-${value}`} className="rc-chart-bar-col">
              <div className="rc-chart-bar-col__value">{displayValue}</div>
              <div className={`rc-chart-bar rc-chart-bar--${tone}`} style={{ height: `${heightPct}%` }} />
              <span className="rc-chart-bar-col__label">{labelKey === 'plan' ? getPlanLabel(label) : label}</span>
            </div>
          );
        })}
      </div>
    </article>
  );
}

export default function RevenueCharts({ charts }) {
  const monthlyRevenue = charts?.monthlyRevenue || [];
  const clientGrowth = charts?.clientGrowth || [];
  const revenueByPlan = charts?.revenueByPlan || [];

  return (
    <div className="rc-charts-grid">
      <BarChart
        title="Receita mensal"
        subtitle="Pagamentos confirmados (6 meses)"
        items={monthlyRevenue}
        valueKey="amountCents"
        labelKey="month"
        tone="green"
      />
      <BarChart
        title="Evolução de clientes"
        subtitle="Total acumulado na plataforma"
        items={clientGrowth}
        valueKey="totalClients"
        labelKey="month"
        tone="blue"
      />
      <BarChart
        title="Receita por plano"
        subtitle="MRR por tier"
        items={revenueByPlan}
        valueKey="amountCents"
        labelKey="plan"
        tone="violet"
      />
    </div>
  );
}
