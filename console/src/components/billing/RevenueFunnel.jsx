import { formatCurrency } from './billingUtils.js';

const STEPS = [
  { key: 'active', label: 'Ativas', tone: 'active' },
  { key: 'trial', label: 'Trial', tone: 'trial' },
  { key: 'dueSoon', label: 'Vencendo', tone: 'due_soon' },
  { key: 'overdue', label: 'Inadimplentes', tone: 'overdue' },
  { key: 'blockRecommended', label: 'Bloqueio recomendado', tone: 'block_recommended' },
  { key: 'blocked', label: 'Bloqueadas', tone: 'blocked' },
];

export default function RevenueFunnel({ funnel }) {
  const data = funnel || {};
  const maxCount = Math.max(1, ...STEPS.map((s) => data[s.key]?.count || 0));

  return (
    <section className="rc-panel rc-funnel">
      <header className="rc-panel__header">
        <div>
          <h2>Funil financeiro</h2>
          <p>Jornada de cobrança das clínicas na plataforma</p>
        </div>
      </header>
      <div className="rc-funnel__track">
        {STEPS.map((step, index) => {
          const bucket = data[step.key] || { count: 0, amountCents: 0 };
          const widthPct = Math.max(18, Math.round((bucket.count / maxCount) * 100));
          return (
            <div key={step.key} className="rc-funnel__step">
              <div className="rc-funnel__meta">
                <span className={`rc-badge rc-badge--${step.tone}`}>{step.label}</span>
                <strong>{bucket.count}</strong>
                <small>{formatCurrency(bucket.amountCents)}</small>
              </div>
              <div className="rc-funnel__bar-wrap">
                <div
                  className={`rc-funnel__bar rc-funnel__bar--${step.tone}`}
                  style={{ width: `${widthPct}%` }}
                />
              </div>
              {index < STEPS.length - 1 ? <span className="rc-funnel__arrow" aria-hidden>→</span> : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}
