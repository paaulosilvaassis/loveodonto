import { Search, SlidersHorizontal } from 'lucide-react';
import {
  BUDGET_HUB_STATUS_FILTERS,
  BUDGET_HUB_SORT_OPTIONS,
} from '../../services/clinicalBudgetHubService.js';

export function BudgetHubFilters({
  filters,
  onChange,
  professionals = [],
  viewMode,
  onViewModeChange,
  resultCount = 0,
}) {
  const set = (key, value) => onChange({ ...filters, [key]: value });

  return (
    <section className="bhub-filters">
      <div className="bhub-filters-head">
        <h2>
          <SlidersHorizontal size={16} />
          Filtros
        </h2>
        <div className="bhub-view-toggle">
          <button
            type="button"
            className={viewMode === 'cards' ? 'is-active' : ''}
            onClick={() => onViewModeChange('cards')}
          >
            Cards
          </button>
          <button
            type="button"
            className={viewMode === 'list' ? 'is-active' : ''}
            onClick={() => onViewModeChange('list')}
          >
            Lista
          </button>
        </div>
      </div>

      <div className="bhub-filters-grid">
        <label className="bhub-filter-field bhub-filter-field--search">
          <Search size={16} aria-hidden />
          <span className="sr-only">Buscar paciente</span>
          <input
            type="search"
            placeholder="Buscar paciente"
            value={filters.query || ''}
            onChange={(e) => set('query', e.target.value)}
          />
        </label>

        <label className="bhub-filter-field">
          <span>Orçamento</span>
          <input
            type="search"
            placeholder="Ex.: ORC-002"
            value={filters.budgetQuery || ''}
            onChange={(e) => set('budgetQuery', e.target.value)}
          />
        </label>

        <label className="bhub-filter-field">
          <span>Status</span>
          <select value={filters.status || ''} onChange={(e) => set('status', e.target.value)}>
            {BUDGET_HUB_STATUS_FILTERS.map((opt) => (
              <option key={opt.value || 'all'} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </label>

        <label className="bhub-filter-field">
          <span>Profissional</span>
          <select
            value={filters.professionalId || ''}
            onChange={(e) => set('professionalId', e.target.value)}
          >
            <option value="">Todos</option>
            {professionals.map((pro) => (
              <option key={pro.id} value={pro.id}>{pro.name}</option>
            ))}
          </select>
        </label>

        <label className="bhub-filter-field">
          <span>De</span>
          <input
            type="date"
            value={filters.dateFrom || ''}
            onChange={(e) => set('dateFrom', e.target.value)}
          />
        </label>

        <label className="bhub-filter-field">
          <span>Até</span>
          <input
            type="date"
            value={filters.dateTo || ''}
            onChange={(e) => set('dateTo', e.target.value)}
          />
        </label>

        <label className="bhub-filter-field">
          <span>Valor mín.</span>
          <input
            type="number"
            min="0"
            step="0.01"
            placeholder="R$ 0"
            value={filters.minValue ?? ''}
            onChange={(e) => set('minValue', e.target.value)}
          />
        </label>

        <label className="bhub-filter-field">
          <span>Valor máx.</span>
          <input
            type="number"
            min="0"
            step="0.01"
            placeholder="R$ 0"
            value={filters.maxValue ?? ''}
            onChange={(e) => set('maxValue', e.target.value)}
          />
        </label>

        <label className="bhub-filter-field">
          <span>Ordenação</span>
          <select value={filters.sortBy || 'recent'} onChange={(e) => set('sortBy', e.target.value)}>
            {BUDGET_HUB_SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </label>
      </div>

      <p className="bhub-filters-meta">{resultCount} orçamento(s) encontrado(s)</p>
    </section>
  );
}
