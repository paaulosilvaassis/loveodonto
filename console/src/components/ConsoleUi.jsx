export function EmptyState({ title, description }) {
  return (
    <div className="pc-empty-state">
      <strong>{title}</strong>
      {description ? <p>{description}</p> : null}
    </div>
  );
}

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
  ok: 'Em dia',
  enabled: 'Ativo',
  disabled: 'Inativo',
  healthy: 'Saudável',
  connected: 'Conectado',
  disconnected: 'Desconectado',
  paid: 'Pago',
  open: 'Aberto',
  pending: 'Pendente',
  resolved: 'Resolvido',
  warning: 'Atenção',
  attention: 'Atenção',
  error: 'Erro',
  failed: 'Falha',
  paused: 'Pausada',
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
  const tone = ['active', 'connected', 'healthy', 'paid', 'enabled', 'open', 'ok', 'resolved', 'active_trial'].includes(normalized)
    ? 'success'
    : ['suspended', 'overdue', 'error', 'failed', 'disconnected', 'inadimplente', 'bloqueio_recomendado', 'critical', 'danger'].includes(normalized)
      ? 'danger'
      : ['warning', 'pending', 'attention', 'past_due', 'paused', 'vencido', 'due_today', 'vencendo_em_5_dias'].includes(normalized)
        ? 'warning'
        : ['billing_blocked', 'blocked', 'canceled', 'cancelled'].includes(normalized)
          ? 'neutral'
          : 'neutral';
  return <span className={`pc-badge pc-badge--${tone}`}>{toFriendlyStatusLabel(status)}</span>;
}

const BILLING_STATUS_LABELS = {
  active_trial: 'Trial ativo',
  trial: 'Trial',
  active: 'Ativo',
  vencido: 'Vencido',
  inadimplente: 'Inadimplente',
  bloqueio_recomendado: 'Bloqueio recomendado',
  due_today: 'Vence hoje',
  open: 'Em aberto',
  paid: 'Pago',
  billing_blocked: 'Bloqueado',
  block_recommended: 'Bloqueio recomendado',
  vencendo_em_5_dias: 'Vence em 5 dias',
};

export function BillingStatusBadge({ status }) {
  const normalized = String(status || '').toLowerCase();
  const label = BILLING_STATUS_LABELS[normalized] || toFriendlyStatusLabel(status);
  let tone = 'neutral';
  if (['active', 'paid', 'active_trial', 'trial', 'ok'].includes(normalized)) tone = 'success';
  else if (['vencendo_em_5_dias', 'due_today', 'vencido', 'warning'].includes(normalized)) tone = 'warning';
  else if (['inadimplente', 'overdue', 'past_due'].includes(normalized)) tone = 'orange';
  else if (['bloqueio_recomendado', 'block_recommended', 'critical'].includes(normalized)) tone = 'danger';
  else if (['billing_blocked', 'blocked', 'canceled'].includes(normalized)) tone = 'neutral';
  return <span className={`pc-badge pc-badge--${tone}`}>{label}</span>;
}
