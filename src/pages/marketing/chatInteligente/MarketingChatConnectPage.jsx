import { useEffect, useMemo, useState } from 'react';
import { SectionCard } from '../../../components/SectionCard.jsx';
import {
  connectMarketingWhatsAppChannel,
  disconnectMarketingWhatsAppChannel,
  getMarketingWhatsAppConnectionOverview,
  refreshMarketingWhatsAppConnectionStatus,
} from '../../../services/marketingChatService.js';
import { useAuth } from '../../../auth/useAuth.js';

const STATUS_META = {
  nao_conectado: { label: 'Não conectado', tone: 'neutral' },
  conectando: { label: 'Conectando', tone: 'warning' },
  conectado: { label: 'Conectado', tone: 'success' },
  erro: { label: 'Erro de conexão', tone: 'danger' },
};

export default function MarketingChatConnectPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [busyAction, setBusyAction] = useState('');
  const [overview, setOverview] = useState(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    getMarketingWhatsAppConnectionOverview(user)
      .then((data) => {
        if (active) setOverview(data);
      })
      .catch((err) => {
        if (active) setError(err.message || 'Erro ao carregar conexão do WhatsApp.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [user, reloadKey]);

  const meta = useMemo(() => STATUS_META[overview?.status || 'nao_conectado'], [overview]);

  const handleConnect = async () => {
    try {
      setBusyAction('connect');
      setError('');
      await connectMarketingWhatsAppChannel(user, { name: 'WhatsApp Principal' });
      setReloadKey((k) => k + 1);
    } catch (err) {
      setError(err.message || 'Erro ao iniciar conexão.');
    } finally {
      setBusyAction('');
    }
  };

  const handleRefresh = async () => {
    try {
      setBusyAction('refresh');
      setError('');
      await refreshMarketingWhatsAppConnectionStatus(user);
      setReloadKey((k) => k + 1);
    } catch (err) {
      setError(err.message || 'Erro ao atualizar status.');
    } finally {
      setBusyAction('');
    }
  };

  const handleDisconnect = async () => {
    try {
      setBusyAction('disconnect');
      setError('');
      await disconnectMarketingWhatsAppChannel(user);
      setReloadKey((k) => k + 1);
    } catch (err) {
      setError(err.message || 'Erro ao desconectar canal.');
    } finally {
      setBusyAction('');
    }
  };

  return (
    <div className="stack">
      <SectionCard
        title="Conectar WhatsApp"
        description="Conecte seu número oficial ao Chat Inteligente do LoveOdonto para operar um inbox próprio omnichannel."
      >
        {loading ? <p className="muted">Carregando status de conexão...</p> : null}
        {!loading && error ? (
          <div className="marketing-chat-empty-state">
            <strong>Falha ao carregar conexão.</strong>
            <p className="muted">{error}</p>
            <button type="button" className="button secondary" onClick={() => setReloadKey((k) => k + 1)}>
              Tentar novamente
            </button>
          </div>
        ) : null}

        {!loading && !error && overview ? (
          <div className="marketing-chat-dashboard-split">
            <article className="marketing-chat-connect-card">
              <header className="marketing-chat-connect-card__header">
                <div>
                  <span className={`marketing-chat-connect-status marketing-chat-connect-status--${meta.tone}`} />
                  <strong>{meta.label}</strong>
                </div>
                <span className="marketing-chat-pill">{overview.channel?.name || 'Canal WhatsApp'}</span>
              </header>

              <div className="marketing-chat-connect-card__actions">
                <button type="button" className="button primary" onClick={handleConnect} disabled={busyAction !== ''}>
                  {busyAction === 'connect' ? 'Conectando...' : 'Conectar número'}
                </button>
                <button type="button" className="button secondary" onClick={handleRefresh} disabled={busyAction !== ''}>
                  {busyAction === 'refresh' ? 'Atualizando...' : 'Atualizar status'}
                </button>
                <button type="button" className="button secondary" onClick={handleDisconnect} disabled={busyAction !== '' || overview.status === 'nao_conectado'}>
                  {busyAction === 'disconnect' ? 'Desconectando...' : 'Desconectar'}
                </button>
              </div>

              <div className="marketing-chat-onboarding-placeholder">
                {overview.status === 'nao_conectado' ? (
                  <>
                    <strong>Inicie a conexão oficial do WhatsApp Business</strong>
                    <p className="muted">Ao conectar, o QR code e onboarding oficial aparecerão aqui.</p>
                  </>
                ) : null}
                {overview.status === 'conectando' ? (
                  <>
                    <strong>Onboarding em andamento</strong>
                    <div className="marketing-chat-qr-placeholder">{overview.onboarding?.qrCodeToken || 'QR CODE'}</div>
                    <p className="muted">Escaneie o QR code no aplicativo WhatsApp Business.</p>
                  </>
                ) : null}
                {overview.status === 'conectado' ? (
                  <>
                    <strong>Canal conectado com sucesso</strong>
                    <p className="muted">Seu inbox interno está pronto para receber e responder mensagens.</p>
                  </>
                ) : null}
                {overview.status === 'erro' ? (
                  <>
                    <strong>Erro de conexão</strong>
                    <p className="muted">Confira token/webhook e tente novamente.</p>
                    <button type="button" className="button secondary" onClick={handleRefresh}>
                      Repetir tentativa
                    </button>
                  </>
                ) : null}
              </div>

              <ul className="marketing-chat-list">
                {(overview.onboarding?.steps || []).map((step) => (
                  <li key={step} className="marketing-chat-list__item">
                    <span>{step}</span>
                  </li>
                ))}
              </ul>
            </article>

            <aside className="marketing-chat-connect-side">
              <h4>Por que conectar?</h4>
              <ul className="marketing-chat-list">
                <li className="marketing-chat-list__item"><span>Centraliza mensagens no inbox interno do LoveOdonto.</span></li>
                <li className="marketing-chat-list__item"><span>Sincroniza contato, conversa, tags e histórico.</span></li>
                <li className="marketing-chat-list__item"><span>Permite distribuição para atendentes e departamentos.</span></li>
                <li className="marketing-chat-list__item"><span>Ativa automações e integração futura com CRM/Agenda.</span></li>
              </ul>
            </aside>
          </div>
        ) : null}
      </SectionCard>

      {!loading && !error && overview ? (
        <SectionCard title="Bloco técnico do canal" description="Dados essenciais para operação e troubleshooting da conexão.">
          <div className="marketing-chat-grid-3">
            <div className="marketing-chat-now-card"><span>Token</span><strong>{overview.technical?.token ? `${overview.technical.token.slice(0, 14)}...` : '-'}</strong></div>
            <div className="marketing-chat-now-card"><span>Webhook</span><strong>{overview.technical?.webhookConfigured ? 'configurado' : 'não configurado'}</strong></div>
            <div className="marketing-chat-now-card"><span>Último sync</span><strong>{overview.technical?.lastSyncAt ? String(overview.technical.lastSyncAt).replace('T', ' ').slice(0, 16) : '-'}</strong></div>
            <div className="marketing-chat-now-card"><span>Número</span><strong>{overview.technical?.connectedNumber || '-'}</strong></div>
            <div className="marketing-chat-now-card"><span>Canal</span><strong>{overview.technical?.channelName || '-'}</strong></div>
            <div className="marketing-chat-now-card"><span>Conectado em</span><strong>{overview.technical?.connectedAt ? String(overview.technical.connectedAt).replace('T', ' ').slice(0, 16) : '-'}</strong></div>
          </div>

          <div className="marketing-chat-table-wrap">
            <table className="marketing-chat-table">
              <thead>
                <tr>
                  <th>Data/Hora</th>
                  <th>Evento</th>
                  <th>Status</th>
                  <th>Resumo</th>
                </tr>
              </thead>
              <tbody>
                {(overview.logs || []).map((log) => (
                  <tr key={log.id}>
                    <td>{String(log.createdAt || '').replace('T', ' ').slice(0, 19)}</td>
                    <td>{log.eventType}</td>
                    <td><span className="marketing-chat-pill">{log.status}</span></td>
                    <td>{log.payloadPreview}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      ) : null}
    </div>
  );
}
