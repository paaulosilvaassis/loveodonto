import { X } from 'lucide-react';

export const FiltersBar = ({ rooms, statusOptions, filters, onFiltersChange }) => {
  const toggleStatus = (status) => {
    const next = filters.status.includes(status)
      ? filters.status.filter((item) => item !== status)
      : [...filters.status, status];
    onFiltersChange({ ...filters, status: next });
  };

  return (
    <div className="agenda-filters">
      <div className="agenda-filter-group">
        <label>Sala</label>
        <select
          value={filters.roomId}
          onChange={(event) => onFiltersChange({ ...filters, roomId: event.target.value })}
        >
          <option value="">Todas</option>
          {rooms.map((room) => (
            <option key={room.id} value={room.id}>
              {room.name}
            </option>
          ))}
        </select>
      </div>
      <div className="agenda-filter-group status-group">
        <label>Status</label>
        <div className="status-chips">
          {statusOptions.map((status) => (
            <button
              key={status.value}
              type="button"
              className={`chip ${filters.status.includes(status.value) ? 'active' : ''}`}
              onClick={() => toggleStatus(status.value)}
            >
              {status.label}
            </button>
          ))}
        </div>
      </div>
      <div className="agenda-filter-group">
        <button
          type="button"
          className="button secondary"
          onClick={() =>
            onFiltersChange({
              ...filters,
              roomId: '',
              status: [],
            })
          }
        >
          <X size={14} />
          Limpar filtros
        </button>
      </div>
    </div>
  );
};
