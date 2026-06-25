import { Inbox } from 'lucide-react';

export function RecordBreadcrumb({ onBack, name }) {
  return (
    <nav className="cr-breadcrumb" aria-label="Navegação">
      <button type="button" className="cr-breadcrumb__back" onClick={onBack}>
        ← Voltar para colaboradores
      </button>
      <span className="cr-breadcrumb__sep" aria-hidden>/</span>
      <span className="cr-breadcrumb__current">Equipe</span>
      {name ? (
        <>
          <span className="cr-breadcrumb__sep" aria-hidden>/</span>
          <span className="cr-breadcrumb__current cr-breadcrumb__current--active">{name}</span>
        </>
      ) : null}
    </nav>
  );
}

export function RecordSkeleton() {
  return (
    <div className="cr-skeleton" aria-hidden>
      <div className="cr-skeleton__hero" />
      <div className="cr-skeleton__kpis">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="cr-skeleton__kpi" />
        ))}
      </div>
      <div className="cr-skeleton__tabs" />
      <div className="cr-skeleton__body" />
    </div>
  );
}

export function RecordEmptyState({ title, description, icon: Icon = Inbox }) {
  return (
    <div className="cr-empty">
      <span className="cr-empty__icon" aria-hidden><Icon size={28} /></span>
      <h4 className="cr-empty__title">{title}</h4>
      {description ? <p className="cr-empty__desc">{description}</p> : null}
    </div>
  );
}

export function RecordCard({ title, description, children, className = '' }) {
  return (
    <section className={`cr-card ${className}`.trim()}>
      {(title || description) ? (
        <header className="cr-card__header">
          {title ? <h3 className="cr-card__title">{title}</h3> : null}
          {description ? <p className="cr-card__desc">{description}</p> : null}
        </header>
      ) : null}
      <div className="cr-card__body">{children}</div>
    </section>
  );
}

export function RecordFieldGrid({ children, columns = 3 }) {
  return (
    <div className={`cr-field-grid cr-field-grid--${columns}`}>{children}</div>
  );
}

export function RecordField({ label, value, children, editing, fullWidth }) {
  if (editing && children) {
    return (
      <label className={`cr-field ${fullWidth ? 'cr-field--full' : ''}`.trim()}>
        <span className="cr-field__label">{label}</span>
        <div className="cr-field__control">{children}</div>
      </label>
    );
  }
  return (
    <div className={`cr-field cr-field--readonly ${fullWidth ? 'cr-field--full' : ''}`.trim()}>
      <span className="cr-field__label">{label}</span>
      <span className="cr-field__value">{value || '—'}</span>
    </div>
  );
}

export function UnsavedBadge({ visible }) {
  if (!visible) return null;
  return (
    <span className="cr-unsaved-badge" role="status">
      Alterações não salvas
    </span>
  );
}

export function SaveToast({ message, type = 'success' }) {
  if (!message) return null;
  return (
    <div className={`cr-toast cr-toast--${type}`} role="status">
      {message}
    </div>
  );
}
