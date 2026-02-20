export const AgendaSidebar = ({ professionals, selectedId, onChange }) => {
  if (!professionals.length) {
    return (
      <aside className="agenda-sidebar">
        <div className="agenda-sidebar-header">
          <strong>Por Profissional</strong>
          <span className="muted">Nenhum profissional cadastrado</span>
        </div>
        <div className="agenda-sidebar-empty">
          <p className="muted">Cadastre um colaborador com cargo "Dentista" ou "Ortodontista" para usar a agenda.</p>
        </div>
      </aside>
    );
  }

  return (
    <aside className="agenda-sidebar">
      <div className="agenda-sidebar-header">
        <strong>Por Profissional</strong>
        <span className="muted">Selecione um dentista</span>
      </div>
      <div className="agenda-sidebar-list">
        {professionals.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`chip agenda-professional-chip ${selectedId === item.id ? 'active' : ''}`}
            onClick={() => onChange(item.id)}
          >
            <span className="agenda-professional-avatar">
              {item.avatarUrl ? (
                <img src={item.avatarUrl} alt={item.name} />
              ) : (
                <span>{item.name?.slice(0, 2)?.toUpperCase()}</span>
              )}
            </span>
            <span className="agenda-professional-info">
              <span className="agenda-professional-name">{item.name}</span>
              {item.specialty ? <span className="agenda-professional-specialty">{item.specialty}</span> : null}
            </span>
          </button>
        ))}
      </div>
    </aside>
  );
};
