import { useEffect, useState } from 'react';
import { SectionCard } from '../../../components/SectionCard.jsx';
import { createMarketingCampaign, listMarketingCampaigns, updateMarketingCampaign } from '../../../services/marketingChatService.js';
import { useAuth } from '../../../auth/useAuth.js';

const STATUS_OPTIONS = [
  { id: 'todos', label: 'Todos' },
  { id: 'rascunho', label: 'Rascunho' },
  { id: 'processando', label: 'Processando' },
  { id: 'pausado', label: 'Pausado' },
  { id: 'enviado', label: 'Enviado' },
  { id: 'enviado_com_erros', label: 'Enviado com erros' },
];

export default function MarketingChatCampaignsPage() {
  const { user } = useAuth();
  const [status, setStatus] = useState('todos');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [rows, setRows] = useState([]);
  const [reloadKey, setReloadKey] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [form, setForm] = useState({
    name: '',
    channel: 'WhatsApp',
    status: 'rascunho',
    scheduledAt: '',
    totalCount: 0,
    messageTemplate: '',
  });

  const openCreateModal = () => {
    setEditingId('');
    setSaveError('');
    setForm({
      name: '',
      channel: 'WhatsApp',
      status: 'rascunho',
      scheduledAt: new Date().toISOString().slice(0, 16),
      totalCount: 0,
      messageTemplate: '',
    });
    setModalOpen(true);
  };

  const openEditModal = (item) => {
    setEditingId(item.id);
    setSaveError('');
    setForm({
      name: item.name || '',
      channel: item.channel || 'WhatsApp',
      status: item.status || 'rascunho',
      scheduledAt: String(item.scheduledAt || '').slice(0, 16),
      totalCount: Number(item.totalCount || 0),
      messageTemplate: item.messageTemplate || '',
    });
    setModalOpen(true);
  };

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    listMarketingCampaigns({ user, status, search })
      .then((data) => {
        if (active) setRows(data);
      })
      .catch((err) => {
        if (active) setError(err.message || 'Erro ao listar campanhas.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [status, search, reloadKey, user]);

  const handleSaveCampaign = async () => {
    try {
      setSaving(true);
      setSaveError('');
      if (editingId) {
        await updateMarketingCampaign(user, editingId, form);
      } else {
        await createMarketingCampaign(user, form);
      }
      setModalOpen(false);
      setReloadKey((k) => k + 1);
    } catch (err) {
      setSaveError(err.message || 'Erro ao salvar campanha.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="stack">
      <SectionCard
        title="Campanhas, Disparos e Automacoes"
        description="Operacao de envios com progresso, status e rastreabilidade."
      >
        <div className="marketing-chat-table-filters">
          <label className="marketing-chat-inline-filters__item">
            <span>Status</span>
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              {STATUS_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>{option.label}</option>
              ))}
            </select>
          </label>
          <label className="marketing-chat-inline-filters__item marketing-chat-inline-filters__item--search">
            <span>Busca</span>
            <input type="text" value={search} placeholder="Nome ou ID da campanha..." onChange={(e) => setSearch(e.target.value)} />
          </label>
          <button type="button" className="button primary" onClick={openCreateModal}>Criar campanha</button>
        </div>

        {loading ? <p className="muted">Carregando campanhas...</p> : null}
        {!loading && error ? (
          <div className="marketing-chat-empty-state">
            <strong>Falha ao carregar campanhas.</strong>
            <p className="muted">{error}</p>
            <button type="button" className="button secondary" onClick={() => setReloadKey((k) => k + 1)}>
              Tentar novamente
            </button>
          </div>
        ) : null}
        {!loading && !error && rows.length === 0 ? (
          <div className="marketing-chat-empty-state">
            <strong>Nenhuma campanha encontrada.</strong>
            <p className="muted">Crie o primeiro disparo ou ajuste os filtros.</p>
          </div>
        ) : null}

        {!loading && !error && rows.length > 0 ? (
          <div className="marketing-chat-table-wrap">
            <table className="marketing-chat-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Campanha</th>
                  <th>Canal</th>
                  <th>Agendada para</th>
                  <th>Status</th>
                  <th>Progresso</th>
                  <th>Acoes</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((item) => {
                  const pct = Number(item.totalCount || 0) > 0
                    ? Math.round((Number(item.sentCount || 0) / Number(item.totalCount || 0)) * 100)
                    : 0;
                  return (
                    <tr key={item.id}>
                      <td>{item.id}</td>
                      <td><strong>{item.name}</strong></td>
                      <td>{item.channel}</td>
                      <td>{String(item.scheduledAt || '').replace('T', ' ').slice(0, 16)}</td>
                      <td><span className="marketing-chat-pill">{item.status.replace('_', ' ')}</span></td>
                      <td>
                        <div className="marketing-chat-progress">
                          <div className="marketing-chat-progress__bar" style={{ width: `${pct}%` }} />
                        </div>
                        <small className="muted">{item.sentCount}/{item.totalCount} • erros {item.failedCount}</small>
                      </td>
                      <td>
                        <div className="marketing-chat-table-actions">
                          <button type="button" className="button secondary" onClick={() => openEditModal(item)}>Editar</button>
                          <button
                            type="button"
                            className="button secondary"
                            onClick={async () => {
                              try {
                                const nextStatus = item.status === 'pausado' ? 'processando' : 'pausado';
                                await updateMarketingCampaign(user, item.id, { status: nextStatus });
                                setReloadKey((k) => k + 1);
                              } catch (err) {
                                setError(err.message || 'Erro ao atualizar status da campanha.');
                              }
                            }}
                          >
                            {item.status === 'pausado' ? 'Retomar' : 'Pausar'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </SectionCard>

      {modalOpen ? (
        <div className="marketing-chat-modal-backdrop" role="presentation">
          <div className="marketing-chat-modal">
            <header className="marketing-chat-modal__header">
              <h3>{editingId ? 'Editar campanha' : 'Nova campanha'}</h3>
              <button type="button" className="button secondary" onClick={() => setModalOpen(false)}>Fechar</button>
            </header>
            <div className="marketing-chat-modal__body">
              <label className="field">
                <span className="field-label">Nome da campanha</span>
                <input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
              </label>
              <label className="field">
                <span className="field-label">Canal</span>
                <select value={form.channel} onChange={(e) => setForm((p) => ({ ...p, channel: e.target.value }))}>
                  <option value="WhatsApp">WhatsApp</option>
                  <option value="Instagram">Instagram</option>
                  <option value="Facebook">Facebook</option>
                </select>
              </label>
              <label className="field">
                <span className="field-label">Status</span>
                <select value={form.status} onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))}>
                  <option value="rascunho">rascunho</option>
                  <option value="processando">processando</option>
                  <option value="pausado">pausado</option>
                  <option value="enviado">enviado</option>
                </select>
              </label>
              <label className="field">
                <span className="field-label">Agendada para</span>
                <input type="datetime-local" value={form.scheduledAt} onChange={(e) => setForm((p) => ({ ...p, scheduledAt: e.target.value }))} />
              </label>
              <label className="field">
                <span className="field-label">Total previsto</span>
                <input type="number" value={form.totalCount} onChange={(e) => setForm((p) => ({ ...p, totalCount: Number(e.target.value || 0) }))} />
              </label>
              <label className="field">
                <span className="field-label">Mensagem/Template</span>
                <textarea rows={3} value={form.messageTemplate} onChange={(e) => setForm((p) => ({ ...p, messageTemplate: e.target.value }))} />
              </label>
              {saveError ? <p className="alert error">{saveError}</p> : null}
            </div>
            <footer className="marketing-chat-modal__footer">
              <button type="button" className="button secondary" onClick={() => setModalOpen(false)}>Cancelar</button>
              <button type="button" className="button primary" onClick={handleSaveCampaign} disabled={saving}>
                {saving ? 'Salvando...' : 'Salvar campanha'}
              </button>
            </footer>
          </div>
        </div>
      ) : null}
    </div>
  );
}
