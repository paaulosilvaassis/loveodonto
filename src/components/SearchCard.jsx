/**
 * Card moderno para área de busca
 */
export default function SearchCard({ title, subtitle, children, actions }) {
  return (
    <div className="search-card">
      <div className="search-card-header">
        <div>
          <h2 className="search-card-title">{title}</h2>
          {subtitle && <p className="search-card-subtitle">{subtitle}</p>}
        </div>
        {actions && <div className="search-card-actions">{actions}</div>}
      </div>
      <div className="search-card-body">{children}</div>
    </div>
  );
}
