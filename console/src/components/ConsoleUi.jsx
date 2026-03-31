export function PageHeader({ title, description, actions }) {
  return (
    <header className="pc-page-header">
      <div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {actions ? <div className="pc-actions">{actions}</div> : null}
    </header>
  );
}

const STATUS_LABELS = {
  active: 'Ativo',
  blocked: 'Bloqueado',
  suspended: 'Suspenso',
  overdue: 'Em atraso',
  past_due: 'Em atraso',
  enabled: 'Ativo',
  disabled: 'Inativo',
  healthy: 'Saudável',
  connected: 'Conectado',
  paid: 'Pago',
  open: 'Aberto',
  pending: 'Pendente',
  warning: 'Atenção',
  error: 'Erro',
  failed: 'Falha',
};

export function toFriendlyStatusLabel(status) {
  const raw = String(status || '').trim();
  if (!raw) return '—';
  const normalized = raw.toLowerCase();
  return STATUS_LABELS[normalized] || raw;
}

export function KpiGrid({ items }) {
  return (
    <div className="pc-kpi-grid">
      {items.map((item) => (
        <article key={item.id} className="pc-kpi-card">
          <span>{item.label}</span>
          <strong>{item.value}</strong>
        </article>
      ))}
    </div>
  );
}

export function Panel({ title, description, children, actions }) {
  return (
    <section className="pc-panel">
      {(title || description || actions) ? (
        <header className="pc-panel__header">
          <div>
            {title ? <h2>{title}</h2> : null}
            {description ? <p>{description}</p> : null}
          </div>
          {actions ? <div className="pc-actions">{actions}</div> : null}
        </header>
      ) : null}
      {children}
    </section>
  );
}

export function StatusBadge({ status }) {
  const normalized = String(status || '').toLowerCase();
  const tone = ['active', 'connected', 'healthy', 'paid', 'enabled', 'open'].includes(normalized)
    ? 'success'
    : ['suspended', 'overdue', 'error', 'failed'].includes(normalized)
      ? 'danger'
      : ['warning', 'pending', 'attention', 'past_due'].includes(normalized)
        ? 'warning'
        : 'neutral';
  return <span className={`pc-badge pc-badge--${tone}`}>{toFriendlyStatusLabel(status)}</span>;
}
