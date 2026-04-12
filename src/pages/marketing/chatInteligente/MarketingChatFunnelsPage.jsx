import { useEffect, useState } from 'react';
import { SectionCard } from '../../../components/SectionCard.jsx';
import { createMarketingFunnelStage, listMarketingFunnels, moveMarketingFunnelCard, updateMarketingFunnelStage } from '../../../services/marketingChatService.js';
import { useAuth } from '../../../auth/useAuth.js';

export default function MarketingChatFunnelsPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [funnels, setFunnels] = useState([]);
  const [reloadKey, setReloadKey] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [editingStage, setEditingStage] = useState(null);
  const [form, setForm] = useState({ name: '', color: '#6366F1' });

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    listMarketingFunnels(user)
      .then((data) => {
        if (active) setFunnels(data);
      })
      .catch((err) => {
        if (active) setError(err.message || 'Erro ao carregar funil.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [reloadKey, user]);

  const funnel = funnels[0] || null;
  const stages = funnel?.stages || [];
  const cards = funnel?.cards || [];

  const openCreateModal = () => {
    setEditingStage(null);
    setSaveError('');
    setForm({ name: '', color: '#6366F1' });
    setModalOpen(true);
  };

  const openEditModal = (stage) => {
    setEditingStage(stage);
    setSaveError('');
    setForm({ name: stage.name, color: stage.color || '#6366F1' });
    setModalOpen(true);
  };

  const handleSaveStage = async () => {
    if (!funnel) return;
    try {
      setSaving(true);
      setSaveError('');
      if (editingStage) {
        await updateMarketingFunnelStage(user, {
          funnelId: funnel.id,
          stageId: editingStage.id,
          name: form.name,
          color: form.color,
        });
      } else {
        await createMarketingFunnelStage(user, {
          funnelId: funnel.id,
          name: form.name,
          color: form.color,
        });
      }
      setModalOpen(false);
      setReloadKey((k) => k + 1);
    } catch (err) {
      setSaveError(err.message || 'Erro ao salvar coluna.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="stack">
      <SectionCard
        title="Funis e CRM de Marketing"
        description="Quadro kanban para acompanhamento de conversas e oportunidades."
        actions={<button type="button" className="button primary" onClick={openCreateModal}>Adicionar coluna</button>}
      >
        {loading ? <p className="muted">Carregando funil...</p> : null}
        {!loading && error ? (
          <div className="marketing-chat-empty-state">
            <strong>Falha ao carregar funil.</strong>
            <p className="muted">{error}</p>
            <button type="button" className="button secondary" onClick={() => setReloadKey((k) => k + 1)}>
              Tentar novamente
            </button>
          </div>
        ) : null}
        {!loading && !error && stages.length === 0 ? (
          <div className="marketing-chat-empty-state">
            <strong>Nenhuma coluna configurada.</strong>
            <p className="muted">Crie o primeiro quadro para iniciar o acompanhamento.</p>
          </div>
        ) : null}
        {!loading && !error && stages.length > 0 ? (
          <div className="marketing-chat-kanban">
            {stages.map((stage) => (
              <article key={stage.id} className="marketing-chat-kanban-stage">
                <header className="marketing-chat-kanban-stage__header" style={{ borderTopColor: stage.color }}>
                  <strong>{stage.name}</strong>
                  <div className="marketing-chat-table-actions">
                    <span className="marketing-chat-pill">{cards.filter((card) => card.stageId === stage.id).length}</span>
                    <button type="button" className="button secondary" onClick={() => openEditModal(stage)}>Editar</button>
                  </div>
                </header>
                <div className="marketing-chat-kanban-stage__cards">
                  {cards.filter((card) => card.stageId === stage.id).map((card) => (
                    <div key={card.id} className="marketing-chat-kanban-card">
                      <strong>{card.title}</strong>
                      <span className="muted">Ultimo toque: {String(card.updatedAt || '').slice(11, 16)}</span>
                      <select
                        value={stage.id}
                        onChange={async (e) => {
                          try {
                            await moveMarketingFunnelCard(user, {
                              funnelId: funnel.id,
                              cardId: card.id,
                              targetStageId: e.target.value,
                            });
                            setReloadKey((k) => k + 1);
                          } catch (err) {
                            setError(err.message || 'Erro ao mover card no funil.');
                          }
                        }}
                      >
                        {stages.map((option) => (
                          <option key={option.id} value={option.id}>{option.name}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        ) : null}
      </SectionCard>

      {modalOpen ? (
        <div className="marketing-chat-modal-backdrop" role="presentation">
          <div className="marketing-chat-modal">
            <header className="marketing-chat-modal__header">
              <h3>{editingStage ? 'Editar coluna' : 'Nova coluna'}</h3>
              <button type="button" className="button secondary" onClick={() => setModalOpen(false)}>Fechar</button>
            </header>
            <div className="marketing-chat-modal__body">
              <label className="field">
                <span className="field-label">Nome</span>
                <input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
              </label>
              <label className="field">
                <span className="field-label">Cor</span>
                <input value={form.color} onChange={(e) => setForm((p) => ({ ...p, color: e.target.value }))} />
              </label>
              {saveError ? <p className="alert error">{saveError}</p> : null}
            </div>
            <footer className="marketing-chat-modal__footer">
              <button type="button" className="button secondary" onClick={() => setModalOpen(false)}>Cancelar</button>
              <button type="button" className="button primary" onClick={handleSaveStage} disabled={saving}>
                {saving ? 'Salvando...' : 'Salvar coluna'}
              </button>
            </footer>
          </div>
        </div>
      ) : null}
    </div>
  );
}
