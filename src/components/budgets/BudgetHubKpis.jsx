import { formatCurrencyBRL } from '../../utils/currency.js';

function KpiCard({ label, value, tone = 'default' }) {
  return (
    <article className={`bhub-kpi tone-${tone}`}>
      <strong>{value}</strong>
      <span>{label}</span>
    </article>
  );
}

export function BudgetHubKpis({ kpis }) {
  if (!kpis) return null;

  return (
    <section className="bhub-kpis" aria-label="Indicadores de orçamentos">
      <KpiCard label="Total de orçamentos" value={kpis.total} />
      <KpiCard label="Em elaboração" value={kpis.draftCount} tone="gray" />
      <KpiCard label="Apresentados" value={kpis.presentedCount} tone="blue" />
      <KpiCard label="Aprovados" value={kpis.approvedCount} tone="green" />
      <KpiCard label="Reprovados" value={kpis.rejectedCount} tone="red" />
      <KpiCard label="Convertidos" value={kpis.convertedCount} tone="purple" />
      <KpiCard label="Em negociação" value={formatCurrencyBRL(kpis.negotiationValue)} tone="amber" />
      <KpiCard label="Valor aprovado" value={formatCurrencyBRL(kpis.approvedValue)} tone="green-dark" />
    </section>
  );
}
