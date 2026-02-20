import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, Plus, Search, X } from 'lucide-react';

export const CalendarHeader = ({
  view,
  onViewChange,
  selectedDate,
  onDateChange,
  onToday,
  onPrev,
  onNext,
  onCreate,
  onCreateDisabled,
  searchValue,
  onSearchChange,
  dateLabel,
  professionals,
  selectedProfessionalId,
  onProfessionalChange,
  rooms,
  statusOptions,
  filters,
  onFiltersChange,
}) => {
  const [isProfessionalOpen, setIsProfessionalOpen] = useState(false);
  const [isStatusOpen, setIsStatusOpen] = useState(false);
  const professionalRef = useRef(null);
  const statusRef = useRef(null);
  const selectedProfessional = useMemo(
    () => professionals?.find((item) => item.id === selectedProfessionalId) || null,
    [professionals, selectedProfessionalId]
  );

  useEffect(() => {
    if (!isProfessionalOpen) return undefined;
    const handleOutside = (event) => {
      if (!professionalRef.current?.contains(event.target)) {
        setIsProfessionalOpen(false);
      }
    };
    const handleEscape = (event) => {
      if (event.key === 'Escape') setIsProfessionalOpen(false);
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isProfessionalOpen]);

  useEffect(() => {
    if (!isStatusOpen) return undefined;
    const handleOutside = (event) => {
      if (!statusRef.current?.contains(event.target)) {
        setIsStatusOpen(false);
      }
    };
    const handleEscape = (event) => {
      if (event.key === 'Escape') setIsStatusOpen(false);
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isStatusOpen]);

  const toggleStatus = (status) => {
    const next = filters.status.includes(status)
      ? filters.status.filter((item) => item !== status)
      : [...filters.status, status];
    onFiltersChange({ ...filters, status: next });
  };

  const selectAllStatuses = () => {
    onFiltersChange({ ...filters, status: statusOptions.map((s) => s.value) });
  };

  const clearStatuses = () => {
    onFiltersChange({ ...filters, status: [] });
  };

  const clearAllFilters = () => {
    onFiltersChange({ roomId: '', status: [] });
  };

  const selectedRoom = rooms?.find((r) => r.id === filters.roomId);
  const statusCount = filters.status.length;
  const statusLabel =
    statusCount === 0
      ? 'Todos'
      : statusCount === 1
      ? statusOptions.find((s) => s.value === filters.status[0])?.label || '1 selecionado'
      : `${statusCount} selecionados`;

  const renderInitials = (name) => {
    if (!name) return '--';
    return name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toUpperCase();
  };

  return (
    <div className="agenda-header-premium">
      <div className="agenda-header-row agenda-header-row-nav">
        <div className="agenda-nav-group">
          <button type="button" className="agenda-nav-button" onClick={onToday}>
            Hoje
          </button>
          <button type="button" className="agenda-nav-icon" onClick={onPrev} aria-label="Voltar">
            <ChevronLeft size={18} />
          </button>
          <button type="button" className="agenda-nav-icon" onClick={onNext} aria-label="Avançar">
            <ChevronRight size={18} />
          </button>
          <input
            type="date"
            className="agenda-date-input-premium"
            value={selectedDate}
            onChange={(event) => onDateChange(event.target.value)}
          />
        </div>
        <div className="agenda-date-range">{dateLabel}</div>
      </div>

      <div className="agenda-header-row agenda-header-row-controls">
        <div className="agenda-professional-dropdown" ref={professionalRef}>
          <button
            type="button"
            className="agenda-control-button agenda-control-professional"
            onClick={() => setIsProfessionalOpen((prev) => !prev)}
            disabled={!professionals?.length}
            aria-haspopup="listbox"
            aria-expanded={isProfessionalOpen}
          >
            <span className="agenda-control-avatar-small">
              {selectedProfessional?.avatarUrl ? (
                <img src={selectedProfessional.avatarUrl} alt={selectedProfessional.name} />
              ) : (
                <span>{renderInitials(selectedProfessional?.name || '--')}</span>
              )}
            </span>
            <span className="agenda-control-text">
              {selectedProfessional?.name || 'Profissional'}
            </span>
            <ChevronDown size={14} />
          </button>
          {isProfessionalOpen && professionals?.length ? (
            <div className="agenda-professional-menu" role="listbox">
              {professionals.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`agenda-professional-option ${
                    item.id === selectedProfessionalId ? 'active' : ''
                  }`}
                  onClick={() => {
                    onProfessionalChange?.(item.id);
                    setIsProfessionalOpen(false);
                  }}
                  role="option"
                  aria-selected={item.id === selectedProfessionalId}
                >
                  <span className="agenda-professional-option-avatar">
                    {item.avatarUrl ? (
                      <img src={item.avatarUrl} alt={item.name} />
                    ) : (
                      <span>{renderInitials(item.name)}</span>
                    )}
                  </span>
                  <span className="agenda-professional-option-info">
                    <span className="agenda-professional-option-name">{item.name}</span>
                    {item.specialty ? (
                      <span className="agenda-professional-option-specialty">
                        {item.specialty}
                      </span>
                    ) : (
                      <span className="agenda-professional-option-specialty muted">
                        Sem especialidade
                      </span>
                    )}
                  </span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <div className="agenda-control-dropdown">
          <select
            className="agenda-control-select"
            value={filters.roomId || ''}
            onChange={(event) => onFiltersChange({ ...filters, roomId: event.target.value })}
          >
            <option value="">Sala: Todas</option>
            {rooms?.map((room) => (
              <option key={room.id} value={room.id}>
                {room.name}
              </option>
            ))}
          </select>
        </div>
        <div className="agenda-control-dropdown agenda-status-dropdown" ref={statusRef}>
          <button
            type="button"
            className="agenda-control-button"
            onClick={() => setIsStatusOpen((prev) => !prev)}
            aria-haspopup="listbox"
            aria-expanded={isStatusOpen}
          >
            <span className="agenda-control-text">Status: {statusLabel}</span>
            <ChevronDown size={14} />
          </button>
          {isStatusOpen && (
            <div className="agenda-filter-menu" role="listbox">
              <div className="agenda-filter-menu-actions">
                <button type="button" className="agenda-filter-menu-action" onClick={selectAllStatuses}>
                  Selecionar todos
                </button>
                <button type="button" className="agenda-filter-menu-action" onClick={clearStatuses}>
                  Limpar
                </button>
              </div>
              <div className="agenda-filter-menu-items">
                {statusOptions?.map((status) => (
                  <label key={status.value} className="agenda-filter-menu-item">
                    <input
                      type="checkbox"
                      checked={filters.status.includes(status.value)}
                      onChange={() => toggleStatus(status.value)}
                    />
                    <span>{status.label}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
        {(filters.roomId || filters.status.length > 0) && (
          <button
            type="button"
            className="agenda-control-clear"
            onClick={clearAllFilters}
            title="Limpar filtros"
          >
            <X size={14} />
          </button>
        )}
        <div className="agenda-search-premium">
          <Search size={16} />
          <input
            type="search"
            placeholder="Buscar paciente, telefone ou procedimento"
            value={searchValue}
            onChange={(event) => onSearchChange(event.target.value)}
          />
        </div>
        <div className="agenda-view-toggle-premium" role="group" aria-label="Alterar visão">
          {[
            { value: 'timeline', label: 'Linha do Tempo' },
            { value: 'dia', label: 'Dia' },
            { value: 'semana', label: 'Semana' },
            { value: 'mes', label: 'Mês' },
          ].map((item) => (
            <button
              key={item.value}
              type="button"
              className={`agenda-view-toggle-button ${view === item.value ? 'active' : ''}`}
              onClick={() => {
                // #region agent log
                fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'CalendarHeader.jsx:274',message:'View button clicked',data:{currentView:view,newView:item.value,willChangeToTimeline:item.value === 'timeline'},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H'})}).catch(()=>{});
                // #endregion
                onViewChange(item.value);
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="agenda-cta-button"
          onClick={onCreate}
          disabled={onCreateDisabled}
          title={onCreateDisabled ? 'Cadastre um profissional para criar agendamentos' : ''}
        >
          <Plus size={16} />
          Novo agendamento
        </button>
      </div>
    </div>
  );
};
