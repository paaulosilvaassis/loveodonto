export default function FlowSidebar({
  counts,
  activeFilter,
  onFilterChange,
}) {
  return (
    <aside className="flow-sidebar">
      <div className="flow-sidebar-section">
        <button
          type="button"
          className={`flow-sidebar-item ${activeFilter === 'all' ? 'active' : ''}`}
          onClick={() => onFilterChange('all')}
        >
          <span>Todos</span>
          <span className="flow-sidebar-badge">{counts.total}</span>
        </button>
      </div>

      <div className="flow-sidebar-divider" />

      <div className="flow-sidebar-section">
        {counts.categories.map((item) => (
          <button
            key={item.label}
            type="button"
            className={`flow-sidebar-item ${activeFilter === `category:${item.label}` ? 'active' : ''}`}
            onClick={() => onFilterChange(`category:${item.label}`)}
          >
            <span>{item.label}</span>
            <span className="flow-sidebar-badge">{item.count}</span>
          </button>
        ))}
      </div>

      <div className="flow-sidebar-divider" />

      <div className="flow-sidebar-section">
        {counts.exceptions.map((item) => (
          <button
            key={item.key}
            type="button"
            className={`flow-sidebar-item ${activeFilter === item.key ? 'active' : ''}`}
            onClick={() => onFilterChange(item.key)}
          >
            <span>{item.label}</span>
            <span className={`flow-sidebar-badge ${item.key === 'pendencias' ? 'danger' : ''}`}>{item.count}</span>
          </button>
        ))}
      </div>
    </aside>
  );
}
