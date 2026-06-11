import { Search, X } from 'lucide-react';
import Button from '../../components/Button.jsx';
import { LEAD_SOURCE_LABELS, LEAD_INTEREST_LABELS } from '../../services/crmService.js';

export const EMPTY_PIPELINE_FILTERS = {
  search: '',
  interest: '',
  source: '',
  assignedToUserId: '',
  stageKey: '',
  tagId: '',
  createdFrom: '',
  createdTo: '',
  overdueOnly: false,
};

export const hasActivePipelineFilters = (filters) =>
  Object.entries(filters).some(([key, value]) =>
    key === 'overdueOnly' ? value === true : String(value || '').trim() !== ''
  );

/**
 * Barra de filtros do pipeline: busca, interesse, origem, responsável, fase,
 * tags (opcional), período de criação e leads atrasados.
 * @param {Array} [tags] - Quando informado, exibe o filtro por tag
 */
export function PipelineFilters({
  filters,
  onChange,
  onClear,
  users = [],
  stages = [],
  tags = null,
  sourceLabels = LEAD_SOURCE_LABELS,
  interestLabels = LEAD_INTEREST_LABELS,
}) {
  const set = (field, value) => onChange({ ...filters, [field]: value });

  return (
    <div className="crm-pipeline-filters" role="search" aria-label="Filtros do pipeline">
      <div className="crm-pipeline-filters-grid">
        <div className="form-field crm-pipeline-filters-search">
          <label htmlFor="pf-search">Buscar</label>
          <div className="crm-pipeline-filters-search-input">
            <Search size={15} aria-hidden="true" />
            <input
              id="pf-search"
              type="search"
              value={filters.search}
              onChange={(e) => set('search', e.target.value)}
              placeholder="Nome ou telefone"
            />
          </div>
        </div>
        <div className="form-field">
          <label htmlFor="pf-interest">Interesse</label>
          <select id="pf-interest" value={filters.interest} onChange={(e) => set('interest', e.target.value)}>
            <option value="">Todos</option>
            {Object.entries(interestLabels).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
        </div>
        <div className="form-field">
          <label htmlFor="pf-source">Origem</label>
          <select id="pf-source" value={filters.source} onChange={(e) => set('source', e.target.value)}>
            <option value="">Todas</option>
            {Object.entries(sourceLabels).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
        </div>
        <div className="form-field">
          <label htmlFor="pf-responsible">Responsável</label>
          <select
            id="pf-responsible"
            value={filters.assignedToUserId}
            onChange={(e) => set('assignedToUserId', e.target.value)}
          >
            <option value="">Todos</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.name || u.id}</option>
            ))}
          </select>
        </div>
        <div className="form-field">
          <label htmlFor="pf-stage">Fase</label>
          <select id="pf-stage" value={filters.stageKey} onChange={(e) => set('stageKey', e.target.value)}>
            <option value="">Todas</option>
            {stages.map((s) => (
              <option key={s.key} value={s.key}>{s.label}</option>
            ))}
          </select>
        </div>
        {Array.isArray(tags) && tags.length > 0 && (
          <div className="form-field">
            <label htmlFor="pf-tag">Tag</label>
            <select id="pf-tag" value={filters.tagId || ''} onChange={(e) => set('tagId', e.target.value)}>
              <option value="">Todas</option>
              {tags.map((t) => (
                <option key={t.id} value={t.id}>{t.category ? `${t.category}: ${t.name}` : t.name}</option>
              ))}
            </select>
          </div>
        )}
        <div className="form-field">
          <label htmlFor="pf-from">Criado de</label>
          <input
            id="pf-from"
            type="date"
            value={filters.createdFrom}
            onChange={(e) => set('createdFrom', e.target.value)}
          />
        </div>
        <div className="form-field">
          <label htmlFor="pf-to">Criado até</label>
          <input
            id="pf-to"
            type="date"
            value={filters.createdTo}
            onChange={(e) => set('createdTo', e.target.value)}
          />
        </div>
        <label className="crm-pipeline-filters-overdue">
          <input
            type="checkbox"
            checked={filters.overdueOnly}
            onChange={(e) => set('overdueOnly', e.target.checked)}
          />
          Somente leads atrasados
        </label>
      </div>
      <div className="crm-pipeline-filters-actions">
        <Button type="button" variant="ghost" size="sm" icon={X} onClick={onClear}>
          Limpar filtros
        </Button>
      </div>
    </div>
  );
}
