import { useEffect, useState } from 'react';
import { SectionCard } from '../../../components/SectionCard.jsx';
import { getMarketingSettings } from '../../../services/marketingChatService.js';
import { useAuth } from '../../../auth/useAuth.js';

export default function MarketingChatSettingsPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [settings, setSettings] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    getMarketingSettings(user)
      .then((data) => {
        if (active) setSettings(data);
      })
      .catch((err) => {
        if (active) setError(err.message || 'Erro ao carregar configuracoes.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [reloadKey, user]);

  return (
    <div className="stack">
      <SectionCard
        title="Configuracoes do Chat Inteligente"
        description="Base de conhecimento, canais e parametros de operacao."
        actions={<button type="button" className="button primary">Salvar configuracoes</button>}
      >
        {loading ? <p className="muted">Carregando configuracoes...</p> : null}
        {!loading && error ? (
          <div className="marketing-chat-empty-state">
            <strong>Falha ao carregar configuracoes.</strong>
            <p className="muted">{error}</p>
            <button type="button" className="button secondary" onClick={() => setReloadKey((k) => k + 1)}>
              Tentar novamente
            </button>
          </div>
        ) : null}
        {!loading && !error && settings ? (
          <div className="marketing-chat-settings-grid">
            <label className="field">
              <span className="field-label">Conta de marketing</span>
              <input value={settings.accountName} readOnly />
            </label>
            <label className="field">
              <span className="field-label">Canal padrao</span>
              <input value={settings.defaultChannel} readOnly />
            </label>
            <label className="field">
              <span className="field-label">Modelo de IA</span>
              <input value={settings.aiModel} readOnly />
            </label>
            <label className="field">
              <span className="field-label">Atribuicao automatica</span>
              <input value={settings.autoAssign ? 'Ativada' : 'Desativada'} readOnly />
            </label>
            <label className="field">
              <span className="field-label">Horario comercial</span>
              <input value={settings.businessHoursOnly ? 'Respeitar horario comercial' : 'Execucao continua'} readOnly />
            </label>
            <label className="field">
              <span className="field-label">Webhook/API</span>
              <input value={settings.webhookConfigured ? 'Configurado' : 'Pendente'} readOnly />
            </label>
          </div>
        ) : null}
      </SectionCard>
    </div>
  );
}
