import { History } from 'lucide-react';
import { formatBudgetEventLabel } from './budgetEventLabels.js';

export function BudgetHistoryPanel({ events = [], compact = false }) {
  const visible = events
    .map((event) => ({ event, label: formatBudgetEventLabel(event) }))
    .filter((item) => item.label);

  return (
    <section className={`clinical-budget-history-panel${compact ? ' is-compact' : ''}`}>
      {!compact ? (
        <h4>
          <History size={16} />
          Histórico
        </h4>
      ) : null}
      {visible.length === 0 ? (
        <p className="clinical-budget-footer-hint">Nenhum registro ainda.</p>
      ) : (
        <ul className="clinical-budget-history-timeline">
          {visible.map(({ event, label }) => (
            <li key={event.id}>
              <time dateTime={event.timestamp}>
                {new Date(event.timestamp).toLocaleString('pt-BR', {
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </time>
              <span>{label}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
