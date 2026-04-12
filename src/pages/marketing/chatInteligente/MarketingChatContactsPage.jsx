import { useEffect, useState } from 'react';
import { SectionCard } from '../../../components/SectionCard.jsx';
import { listMarketingContacts } from '../../../services/marketingChatService.js';
import { useAuth } from '../../../auth/useAuth.js';

const STAGE_OPTIONS = [
  { id: 'todos', label: 'Todos' },
  { id: 'lead_quente', label: 'Lead quente' },
  { id: 'lead_morno', label: 'Lead morno' },
  { id: 'lead_frio', label: 'Lead frio' },
  { id: 'paciente_ativo', label: 'Paciente ativo' },
];

export default function MarketingChatContactsPage() {
  const { user } = useAuth();
  const [stage, setStage] = useState('todos');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [result, setResult] = useState({ data: [], totalPages: 1 });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    listMarketingContacts({ user, stage, search, page, pageSize: 6 })
      .then((data) => {
        if (active) setResult(data);
      })
      .catch((err) => {
        if (active) setError(err.message || 'Erro ao carregar contatos.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [stage, search, page, reloadKey, user]);

  return (
    <div className="stack">
      <SectionCard title="Contatos, Leads e Pacientes" description="Base unificada para relacionamento comercial e atendimento.">
        <div className="marketing-chat-table-filters">
          <label className="marketing-chat-inline-filters__item">
            <span>Estagio</span>
            <select
              value={stage}
              onChange={(e) => {
                setStage(e.target.value);
                setPage(1);
              }}
            >
              {STAGE_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>{option.label}</option>
              ))}
            </select>
          </label>
          <label className="marketing-chat-inline-filters__item marketing-chat-inline-filters__item--search">
            <span>Busca</span>
            <input
              type="text"
              value={search}
              placeholder="Nome, telefone ou tag..."
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </label>
        </div>

        {loading ? <p className="muted">Carregando contatos...</p> : null}
        {!loading && error ? (
          <div className="marketing-chat-empty-state">
            <strong>Falha ao carregar contatos.</strong>
            <p className="muted">{error}</p>
            <button type="button" className="button secondary" onClick={() => setReloadKey((k) => k + 1)}>
              Tentar novamente
            </button>
          </div>
        ) : null}
        {!loading && !error && result.data.length === 0 ? (
          <div className="marketing-chat-empty-state">
            <strong>Nenhum contato no recorte.</strong>
            <p className="muted">Ajuste estagio ou busca para exibir resultados.</p>
          </div>
        ) : null}

        {!loading && !error && result.data.length > 0 ? (
          <>
            <div className="marketing-chat-table-wrap">
              <table className="marketing-chat-table">
                <thead>
                  <tr>
                    <th>Nome</th>
                    <th>Telefone</th>
                    <th>Origem</th>
                    <th>Estagio</th>
                    <th>Tags</th>
                  </tr>
                </thead>
                <tbody>
                  {result.data.map((item) => (
                    <tr key={item.id}>
                      <td><strong>{item.name}</strong></td>
                      <td>{item.phone}</td>
                      <td>{item.origin}</td>
                      <td>{item.stage.replace('_', ' ')}</td>
                      <td>
                        <div className="marketing-chat-tags">
                          {(item.tags || []).map((tag) => (
                            <span key={tag} className="marketing-chat-tag">{tag}</span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="marketing-chat-pagination">
              <button type="button" className="button secondary" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                Anterior
              </button>
              <span>Pagina {page} de {result.totalPages}</span>
              <button type="button" className="button secondary" disabled={page >= result.totalPages} onClick={() => setPage((p) => Math.min(result.totalPages, p + 1))}>
                Proxima
              </button>
            </div>
          </>
        ) : null}
      </SectionCard>
    </div>
  );
}
