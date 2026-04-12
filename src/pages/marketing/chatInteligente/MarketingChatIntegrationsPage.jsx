import { useEffect, useState } from 'react';
import { SectionCard } from '../../../components/SectionCard.jsx';
import {
  createMarketingChannel,
  deleteMarketingChannel,
  getMarketingApiConfig,
  listMarketingChannels,
  listMarketingWebhookLogs,
  regenerateMarketingApiToken,
  saveMarketingWebhookConfig,
  testMarketingWebhookConnection,
  updateMarketingChannel,
} from '../../../services/marketingChatService.js';
import { useAuth } from '../../../auth/useAuth.js';

const EMPTY_CHANNEL = { name: '', type: 'WhatsApp', provider: 'cloud-api', status: 'desconectado' };

export default function MarketingChatIntegrationsPage() {
  const { user } = useAuth();
  const [status, setStatus] = useState('todos');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [channels, setChannels] = useState([]);
  const [logs, setLogs] = useState([]);
  const [apiConfig, setApiConfig] = useState({ apiToken: '', webhookUrl: '' });
  const [reloadKey, setReloadKey] = useState(0);
  const [channelModalOpen, setChannelModalOpen] = useState(false);
  const [editingChannelId, setEditingChannelId] = useState('');
  const [channelForm, setChannelForm] = useState(EMPTY_CHANNEL);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [webhookBusy, setWebhookBusy] = useState(false);
  const [logSearch, setLogSearch] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    Promise.all([
      listMarketingChannels({ user, status, search }),
      getMarketingApiConfig(user),
      listMarketingWebhookLogs(user),
    ])
      .then(([channelsData, apiConfigData, logsData]) => {
        if (!active) return;
        setChannels(channelsData);
        setApiConfig(apiConfigData);
        setLogs(logsData);
      })
      .catch((err) => {
        if (active) setError(err.message || 'Erro ao carregar integracoes.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [user, status, search, reloadKey]);

  const openCreateChannel = () => {
    setEditingChannelId('');
    setChannelForm(EMPTY_CHANNEL);
    setSaveError('');
    setChannelModalOpen(true);
  };

  const openEditChannel = (channel) => {
    setEditingChannelId(channel.id);
    setChannelForm({
      name: channel.name || '',
      type: channel.type || 'WhatsApp',
      provider: channel.provider || 'cloud-api',
      status: channel.status || 'desconectado',
    });
    setSaveError('');
    setChannelModalOpen(true);
  };

  const handleSaveChannel = async () => {
    try {
      setSaving(true);
      setSaveError('');
      if (editingChannelId) {
        await updateMarketingChannel(user, editingChannelId, channelForm);
      } else {
        await createMarketingChannel(user, channelForm);
      }
      setChannelModalOpen(false);
      setReloadKey((k) => k + 1);
    } catch (err) {
      setSaveError(err.message || 'Erro ao salvar canal.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteChannel = async (channel) => {
    const ok = window.confirm(`Excluir o canal "${channel.name}"?`);
    if (!ok) return;
    try {
      setError('');
      await deleteMarketingChannel(user, channel.id);
      setReloadKey((k) => k + 1);
    } catch (err) {
      setError(err.message || 'Erro ao excluir canal.');
    }
  };

  const handleRegenerateToken = async () => {
    const ok = window.confirm('Gerar novo token de API? O token anterior deixara de funcionar.');
    if (!ok) return;
    try {
      setWebhookBusy(true);
      setError('');
      await regenerateMarketingApiToken(user);
      setReloadKey((k) => k + 1);
    } catch (err) {
      setError(err.message || 'Erro ao gerar token.');
    } finally {
      setWebhookBusy(false);
    }
  };

  const handleSaveWebhook = async () => {
    try {
      setWebhookBusy(true);
      setError('');
      await saveMarketingWebhookConfig(user, apiConfig.webhookUrl);
      setReloadKey((k) => k + 1);
    } catch (err) {
      setError(err.message || 'Erro ao salvar webhook.');
    } finally {
      setWebhookBusy(false);
    }
  };

  const handleTestWebhook = async () => {
    try {
      setWebhookBusy(true);
      setError('');
      const result = await testMarketingWebhookConnection(user);
      if (!result.ok) {
        setError(result.message || 'Falha no teste de webhook.');
      }
      setReloadKey((k) => k + 1);
    } catch (err) {
      setError(err.message || 'Erro ao testar webhook.');
    } finally {
      setWebhookBusy(false);
    }
  };

  const visibleLogs = logs.filter((item) => {
    const normalized = String(logSearch || '').toLowerCase();
    if (!normalized) return true;
    return `${item.provider} ${item.eventType} ${item.status} ${item.payloadPreview}`.toLowerCase().includes(normalized);
  });

  return (
    <div className="stack">
      <SectionCard
        title="Integracoes"
        description="Conecte canais, gerencie token/API e acompanhe logs de eventos do webhook."
      >
        <div className="marketing-chat-table-filters">
          <label className="marketing-chat-inline-filters__item">
            <span>Status</span>
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="todos">Todos</option>
              <option value="conectado">Conectado</option>
              <option value="desconectado">Desconectado</option>
            </select>
          </label>
          <label className="marketing-chat-inline-filters__item marketing-chat-inline-filters__item--search">
            <span>Busca</span>
            <input value={search} placeholder="Canal, tipo ou provider..." onChange={(e) => setSearch(e.target.value)} />
          </label>
          <button type="button" className="button primary" onClick={openCreateChannel}>Novo canal</button>
        </div>

        {loading ? <p className="muted">Carregando integracoes...</p> : null}
        {!loading && error ? (
          <div className="marketing-chat-empty-state">
            <strong>Falha ao carregar integracoes.</strong>
            <p className="muted">{error}</p>
            <button type="button" className="button secondary" onClick={() => setReloadKey((k) => k + 1)}>Tentar novamente</button>
          </div>
        ) : null}
        {!loading && !error && channels.length === 0 ? (
          <div className="marketing-chat-empty-state">
            <strong>Nenhum canal configurado.</strong>
            <p className="muted">Adicione um canal para habilitar conexoes externas no modulo.</p>
          </div>
        ) : null}

        {!loading && !error && channels.length > 0 ? (
          <div className="marketing-chat-table-wrap">
            <table className="marketing-chat-table">
              <thead>
                <tr>
                  <th>Canal</th>
                  <th>Tipo</th>
                  <th>Provider</th>
                  <th>Status</th>
                  <th>Conectado em</th>
                  <th>Acoes</th>
                </tr>
              </thead>
              <tbody>
                {channels.map((item) => (
                  <tr key={item.id}>
                    <td><strong>{item.name}</strong></td>
                    <td>{item.type}</td>
                    <td>{item.provider}</td>
                    <td><span className="marketing-chat-pill">{item.status}</span></td>
                    <td>{item.connectedAt ? String(item.connectedAt).replace('T', ' ').slice(0, 16) : '-'}</td>
                    <td>
                      <div className="marketing-chat-table-actions">
                        <button type="button" className="button secondary" onClick={() => openEditChannel(item)}>Editar</button>
                        <button
                          type="button"
                          className="button secondary"
                          onClick={async () => {
                            try {
                              await updateMarketingChannel(user, item.id, { status: item.status === 'conectado' ? 'desconectado' : 'conectado' });
                              setReloadKey((k) => k + 1);
                            } catch (err) {
                              setError(err.message || 'Erro ao alternar conexao do canal.');
                            }
                          }}
                        >
                          {item.status === 'conectado' ? 'Desconectar' : 'Conectar'}
                        </button>
                        <button type="button" className="button secondary" onClick={() => handleDeleteChannel(item)}>Excluir</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </SectionCard>

      <SectionCard title="Webhook e API" description="Configura token de autenticacao e URL para recebimento de eventos.">
        <div className="marketing-chat-grid-2">
          <label className="field">
            <span className="field-label">API token</span>
            <input value={apiConfig.apiToken || ''} readOnly />
          </label>
          <div className="marketing-chat-api-actions">
            <button type="button" className="button secondary" onClick={handleRegenerateToken} disabled={webhookBusy}>
              {webhookBusy ? 'Gerando...' : 'Gerar novo token'}
            </button>
          </div>
        </div>
        <label className="field">
          <span className="field-label">Webhook URL</span>
          <input value={apiConfig.webhookUrl || ''} placeholder="https://seu-endpoint/webhook" onChange={(e) => setApiConfig((prev) => ({ ...prev, webhookUrl: e.target.value }))} />
        </label>
        <div className="marketing-chat-table-actions">
          <button type="button" className="button primary" onClick={handleSaveWebhook} disabled={webhookBusy}>
            {webhookBusy ? 'Salvando...' : 'Salvar webhook'}
          </button>
          <button type="button" className="button secondary" onClick={handleTestWebhook} disabled={webhookBusy}>
            {webhookBusy ? 'Testando...' : 'Testar webhook'}
          </button>
        </div>
      </SectionCard>

      <SectionCard title="Logs basicos de integracao" description="Eventos recentes para troubleshooting e monitoramento inicial.">
        <div className="marketing-chat-table-filters">
          <label className="marketing-chat-inline-filters__item marketing-chat-inline-filters__item--search">
            <span>Busca em logs</span>
            <input value={logSearch} placeholder="Provider, evento, status..." onChange={(e) => setLogSearch(e.target.value)} />
          </label>
        </div>
        {visibleLogs.length === 0 ? (
          <div className="marketing-chat-empty-state">
            <strong>Sem logs ainda.</strong>
            <p className="muted">Os eventos serao exibidos assim que os webhooks forem recebidos.</p>
          </div>
        ) : (
          <div className="marketing-chat-table-wrap">
            <table className="marketing-chat-table">
              <thead>
                <tr>
                  <th>Data/Hora</th>
                  <th>Provider</th>
                  <th>Evento</th>
                  <th>Status</th>
                  <th>Resumo</th>
                </tr>
              </thead>
              <tbody>
                {visibleLogs.map((log) => (
                  <tr key={log.id}>
                    <td>{String(log.createdAt || '').replace('T', ' ').slice(0, 19)}</td>
                    <td>{log.provider}</td>
                    <td>{log.eventType}</td>
                    <td><span className="marketing-chat-pill">{log.status}</span></td>
                    <td>{log.payloadPreview}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {channelModalOpen ? (
        <div className="marketing-chat-modal-backdrop" role="presentation">
          <div className="marketing-chat-modal">
            <header className="marketing-chat-modal__header">
              <h3>{editingChannelId ? 'Editar canal' : 'Novo canal'}</h3>
              <button type="button" className="button secondary" onClick={() => setChannelModalOpen(false)}>Fechar</button>
            </header>
            <div className="marketing-chat-modal__body">
              <label className="field">
                <span className="field-label">Nome do canal</span>
                <input value={channelForm.name} onChange={(e) => setChannelForm((prev) => ({ ...prev, name: e.target.value }))} />
              </label>
              <label className="field">
                <span className="field-label">Tipo</span>
                <select value={channelForm.type} onChange={(e) => setChannelForm((prev) => ({ ...prev, type: e.target.value }))}>
                  <option value="WhatsApp">WhatsApp</option>
                  <option value="Instagram">Instagram</option>
                  <option value="Facebook">Facebook</option>
                  <option value="Webchat">Webchat</option>
                </select>
              </label>
              <label className="field">
                <span className="field-label">Provider</span>
                <input value={channelForm.provider} onChange={(e) => setChannelForm((prev) => ({ ...prev, provider: e.target.value }))} />
              </label>
              <label className="field">
                <span className="field-label">Status</span>
                <select value={channelForm.status} onChange={(e) => setChannelForm((prev) => ({ ...prev, status: e.target.value }))}>
                  <option value="conectado">Conectado</option>
                  <option value="desconectado">Desconectado</option>
                </select>
              </label>
              {saveError ? <p className="alert error">{saveError}</p> : null}
            </div>
            <footer className="marketing-chat-modal__footer">
              <button type="button" className="button secondary" onClick={() => setChannelModalOpen(false)}>Cancelar</button>
              <button type="button" className="button primary" onClick={handleSaveChannel} disabled={saving}>
                {saving ? 'Salvando...' : 'Salvar canal'}
              </button>
            </footer>
          </div>
        </div>
      ) : null}
    </div>
  );
}
