/**
 * Shell padronizado para cada etapa do Atendimento Clínico.
 * Toolbar: secundários à esquerda, primário único à direita.
 */
export function ClinicalStageShell({
  title,
  description,
  primaryAction = null,
  secondaryActions = null,
  footer = null,
  children,
}) {
  return (
    <div className="clinical-stage">
      <header className="clinical-stage-header">
        <div className="clinical-stage-heading">
          {title ? <h2 className="clinical-stage-title">{title}</h2> : null}
          {description ? <p className="clinical-stage-desc">{description}</p> : null}
        </div>
        {(primaryAction || secondaryActions) && (
          <div className="clinical-stage-toolbar">
            {secondaryActions ? (
              <div className="clinical-stage-toolbar-secondary">{secondaryActions}</div>
            ) : null}
            {primaryAction ? (
              <div className="clinical-stage-toolbar-primary">{primaryAction}</div>
            ) : null}
          </div>
        )}
      </header>

      <div className="clinical-stage-body">{children}</div>

      {footer ? <footer className="clinical-stage-footer">{footer}</footer> : null}
    </div>
  );
}

export function ClinicalBlock({ title, description, actions, children, className = '' }) {
  return (
    <section className={`clinical-block ${className}`.trim()}>
      {(title || actions) && (
        <header className="clinical-block-header">
          <div>
            {title ? <h3 className="clinical-block-title">{title}</h3> : null}
            {description ? <p className="clinical-block-desc">{description}</p> : null}
          </div>
          {actions ? <div className="clinical-block-actions">{actions}</div> : null}
        </header>
      )}
      <div className="clinical-block-body">{children}</div>
    </section>
  );
}

export function ClinicalBtn({
  variant = 'secondary',
  size = 'sm',
  icon: Icon,
  children,
  className = '',
  ...props
}) {
  return (
    <button
      type="button"
      className={`clinical-btn clinical-btn--${variant} clinical-btn--${size} ${className}`.trim()}
      {...props}
    >
      {Icon ? <Icon size={size === 'sm' ? 15 : 16} aria-hidden="true" /> : null}
      {children ? <span>{children}</span> : null}
    </button>
  );
}
