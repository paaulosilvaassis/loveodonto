import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { RefreshCw, Shield, Wrench, Mail, KeyRound, LogOut } from 'lucide-react';
import { useAuth } from '../../auth/useAuth.js';
import { Section } from '../../components/Section.jsx';
import Button from '../../components/Button.jsx';
import {
  listIdentities,
  fetchIdentityHealthSummary,
  evaluateIdentityHealth,
  repairIdentity,
  resendIdentityInvite,
  resetIdentityPassword,
  revokeIdentitySessions,
  deactivateIdentity,
  IDENTITY_STATUS_LABELS,
  IDENTITY_HEALTH_LABELS,
} from '../../services/identityService.js';
import { formatAccessDate } from '../../utils/collaboratorAccessManagement.js';
import { isSaasModeEnabled } from '../../services/saasAuthService.js';

function SummaryCard({ label, value, tone = 'default' }) {
  return (
    <div className={`identity-dash__card identity-dash__card--${tone}`}>
      <span className="identity-dash__card-label">{label}</span>
      <strong className="identity-dash__card-value">{value}</strong>
    </div>
  );
}

export default function IdentitiesDashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const tenantId = user?.tenantId || '';
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [identities, setIdentities] = useState([]);
  const [summary, setSummary] = useState({});
  const [actionId, setActionId] = useState('');

  const loadData = useCallback(async () => {
    if (!tenantId || !isSaasModeEnabled()) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const [listResult, healthResult] = await Promise.all([
        listIdentities(tenantId, { limit: 200 }),
        fetchIdentityHealthSummary(tenantId),
      ]);
      setIdentities(listResult?.identities || []);
      setSummary(healthResult?.summary || listResult?.summary || {});
    } catch (err) {
      setError(err?.message || 'Não foi possível carregar identidades.');
      setIdentities([]);
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const cards = useMemo(() => ([
    { label: 'Usuários ativos', value: summary.active || 0, tone: 'success' },
    { label: 'Convites pendentes', value: summary.invitation_pending || 0, tone: 'warning' },
    { label: 'Bloqueados', value: summary.disabled || 0, tone: 'muted' },
    { label: 'Precisam de reparo', value: summary.needs_repair || 0, tone: 'danger' },
    { label: 'Links quebrados', value: summary.broken_link || 0, tone: 'danger' },
    { label: 'Nunca acessaram', value: summary.never_logged_in || 0, tone: 'muted' },
  ]), [summary]);

  const runAction = async (id, action) => {
    setActionId(id);
    setError('');
    try {
      const payload = { tenant_id: tenantId };
      if (action === 'repair') await repairIdentity(id, payload);
      if (action === 'resend') await resendIdentityInvite(id, payload);
      if (action === 'reset') await resetIdentityPassword(id, payload);
      if (action === 'revoke') await revokeIdentitySessions(id, payload);
      if (action === 'deactivate') {
        await deactivateIdentity(id, { ...payload, reason: 'admin_request' });
      }
      await loadData();
    } catch (err) {
      setError(err?.message || 'Falha na operação.');
    } finally {
      setActionId('');
    }
  };

  if (!isSaasModeEnabled()) {
    return (
      <div className="stack">
        <Section title="Identidades" description="Disponível apenas no modo SaaS.">
          <p className="muted">Ative o modo SaaS para gerenciar identidades centralizadas.</p>
        </Section>
      </div>
    );
  }

  return (
    <div className="stack identity-dash">
      <Section
        title="Identidades"
        description="Painel central de credenciais e saúde de acesso dos colaboradores."
      >
        <div className="identity-dash__toolbar">
          <Button variant="secondary" size="sm" icon={RefreshCw} onClick={loadData} loading={loading}>
            Atualizar
          </Button>
          <Button
            variant="secondary"
            size="sm"
            icon={Shield}
            disabled={loading}
            onClick={async () => {
              try {
                await evaluateIdentityHealth(tenantId);
                await loadData();
              } catch (err) {
                setError(err?.message || 'Falha ao avaliar saúde.');
              }
            }}
          >
            Avaliar saúde
          </Button>
        </div>

        {error ? <p className="form-error" role="alert">{error}</p> : null}

        <div className="identity-dash__cards">
          {cards.map((card) => (
            <SummaryCard key={card.label} {...card} />
          ))}
        </div>

        <div className="card">
          <div className="table-wrapper">
            <table className="access-list-table">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>E-mail</th>
                  <th>Colaborador</th>
                  <th>Perfil</th>
                  <th>Status</th>
                  <th>Saúde</th>
                  <th>Último acesso</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={8} className="muted">Carregando...</td></tr>
                ) : identities.length === 0 ? (
                  <tr><td colSpan={8} className="muted">Nenhuma identidade encontrada. Aplique a migration 008_app_identities.sql.</td></tr>
                ) : identities.map((row) => (
                  <tr key={row.id}>
                    <td><strong>{row.full_name || '—'}</strong></td>
                    <td>{row.email}</td>
                    <td>
                      {row.collaborator_id ? (
                        <button
                          type="button"
                          className="cr-access__link"
                          onClick={() => navigate('/admin/colaboradores', {
                            state: { openCollaboratorId: row.collaborator_id, tab: 'acesso' },
                          })}
                        >
                          Abrir ficha
                        </button>
                      ) : '—'}
                    </td>
                    <td>{row.role_slug}</td>
                    <td>{IDENTITY_STATUS_LABELS[row.status] || row.status}</td>
                    <td>{IDENTITY_HEALTH_LABELS[row.identity_health] || row.identity_health}</td>
                    <td className="muted">{formatAccessDate(row.last_login_at)}</td>
                    <td>
                      <div className="identity-dash__row-actions">
                        <button type="button" className="button secondary small" disabled={actionId === row.id} onClick={() => runAction(row.id, 'repair')}>
                          <Wrench size={14} aria-hidden /> Reparar
                        </button>
                        <button type="button" className="button secondary small" disabled={actionId === row.id} onClick={() => runAction(row.id, 'resend')}>
                          <Mail size={14} aria-hidden /> Convite
                        </button>
                        <button type="button" className="button secondary small" disabled={actionId === row.id} onClick={() => runAction(row.id, 'reset')}>
                          <KeyRound size={14} aria-hidden /> Reset
                        </button>
                        <button type="button" className="button secondary small" disabled={actionId === row.id} onClick={() => runAction(row.id, 'revoke')}>
                          <LogOut size={14} aria-hidden /> Sessões
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Section>
    </div>
  );
}
