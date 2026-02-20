/**
 * Card de ação rápida estilo Canvas Premium
 */
export default function ActionCard({ icon: Icon, title, subtitle, onClick, gradient, disabled, className = '' }) {
  return (
    <button
      className={`action-card ${className}`.trim()}
      onClick={onClick}
      disabled={disabled}
      style={{ '--action-gradient': gradient }}
      aria-label={title}
    >
      <div className="action-card-content">
        <div className="action-card-icon">
          <Icon size={32} />
        </div>
        <div className="action-card-text">
          <h3 className="action-card-title">{title}</h3>
          {subtitle && <p className="action-card-subtitle">{subtitle}</p>}
        </div>
      </div>
    </button>
  );
}
