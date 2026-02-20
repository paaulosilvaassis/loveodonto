import { useState, useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { CrmLayout } from '../../crm/ui/CrmLayout.jsx';
import { listLeads } from '../../services/crmService.js';
import { LEAD_SOURCE_LABELS } from '../../services/crmService.js';
import { listTags } from '../../services/crmTagService.js';
import { getStatusLabel } from '../../utils/timelineLabels.js';
import { Search } from 'lucide-react';

/**
 * Lista de leads. Link para perfil /crm/leads/:id.
 */
export default function CrmLeadsListPage() {
  const location = useLocation();
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState(location.state?.filterStageKey || '');
  const [tagFilter, setTagFilter] = useState('');
  const allLeads = useMemo(() => listLeads(), []);
  const tags = useMemo(() => listTags(), []);
  const stages = useMemo(() => {
    const keys = [...new Set(allLeads.map((l) => l.stageKey))];
    return keys.sort();
  }, [allLeads]);

  const filtered = useMemo(() => {
    let list = allLeads;
    if (tagFilter) list = list.filter((l) => (l.tagList || []).some((t) => t.id === tagFilter));
    if (stageFilter) list = list.filter((l) => l.stageKey === stageFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (l) =>
          (l.name || '').toLowerCase().includes(q) ||
          (l.phone || '').includes(q) ||
          (l.interest || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [allLeads, search, stageFilter, tagFilter]);

  return (
    <CrmLayout
      title="Leads (lista)"
      description="Lista de leads. Clique para abrir o perfil completo."
    >
      <div className="crm-leads-list-toolbar">
        <div className="crm-leads-search">
          <Search size={18} />
          <input
            type="text"
            placeholder="Buscar por nome, telefone ou interesse..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          value={stageFilter}
          onChange={(e) => setStageFilter(e.target.value)}
          aria-label="Filtrar por estágio"
        >
          <option value="">Todos os estágios</option>
          {stages.map((k) => (
            <option key={k} value={k}>{getStatusLabel(k)}</option>
          ))}
        </select>
        <select
          value={tagFilter}
          onChange={(e) => setTagFilter(e.target.value)}
          aria-label="Filtrar por tag"
        >
          <option value="">Todas as tags</option>
          {tags.map((t) => (
            <option key={t.id} value={t.id}>{t.category}: {t.name}</option>
          ))}
        </select>
      </div>
      <div className="crm-leads-table-wrap">
        <table className="crm-leads-table">
          <thead>
            <tr>
              <th>Nome</th>
              <th>Telefone</th>
              <th>Origem</th>
              <th>Interesse</th>
              <th>Estágio</th>
              <th>Tags</th>
              <th>Últ. contato</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="crm-leads-empty">Nenhum lead encontrado.</td>
              </tr>
            ) : (
              filtered.map((lead) => (
                <tr key={lead.id}>
                  <td>
                    <Link to={`/crm/leads/${lead.id}`} className="crm-leads-link">
                      {lead.name || '—'}
                    </Link>
                  </td>
                  <td>{lead.phone || '—'}</td>
                  <td>{LEAD_SOURCE_LABELS[lead.source] || lead.source || '—'}</td>
                  <td>{lead.interest || '—'}</td>
                  <td><span className="crm-leads-stage">{getStatusLabel(lead.stageKey)}</span></td>
                  <td>
                    <div className="crm-leads-list-tags">
                      {(lead.tagList || []).map((t) => (
                        <span
                          key={t.id}
                          className="crm-leads-list-tag-pill"
                          style={{ '--tag-color': t.color || '#6366f1' }}
                        >
                          {t.name}
                        </span>
                      ))}
                      {!(lead.tagList || []).length && '—'}
                    </div>
                  </td>
                  <td>
                    {lead.lastContactAt
                      ? new Date(lead.lastContactAt).toLocaleDateString('pt-BR')
                      : '—'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </CrmLayout>
  );
}
