import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { usePlatformAuth } from '../auth/PlatformAuthContext.jsx';
import {
  changeClinicPlan,
  getClinicDetail,
  listCatalogs,
  toggleAssistedAccess,
  toggleClinicModule,
  toggleClinicStatus,
} from '../services/platformConsoleService.js';
import { PageHeader, Panel, StatusBadge } from '../components/ConsoleUi.jsx';

function toFriendlyBillingEvent(type) {
  const normalized = String(type || '').trim().toLowerCase();
  if (normalized === 'invoice.paid') return 'Fatura paga';
  if (normalized === 'invoice.overdue') return 'Fatura em atraso';
  return type || '—';
}

export default function ConsoleTenantDetailPage() {
  const { id } = useParams();
  const { platformUser, hasPermission } = usePlatformAuth();
  const [reloadKey, setReloadKey] = useState(0);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState('');
  const detail = useMemo(() => getClinicDetail(id), [id, reloadKey]);
  const catalogs = useMemo(() => listCatalogs(), []);

  if (!detail) {
    return (
      <div className="pc-stack">
        <Link to="/tenants" className="pc-link-button">Voltar para clínicas</Link>
        <Panel title="Clínica não encontrada">
          <p>A clínica informada não existe na base da Platform Console.</p>
        </Panel>
      </div>
    );
  }

  const { clinic, subscription, billingHistory, supportHistory, recentErrors } = detail;

  const safeAction = async (actionId, callback) => {
    try {
      setSaving(actionId);
      setError('');
      await callback();
      setReloadKey((k) => k + 1);
    } catch (err) {
      setError(err.message || 'Falha na operação.');
    } finally {
      setSaving('');
    }
  };

  return (
    <div className="pc-stack">
      <Link to="/tenants" className="pc-link-button">Voltar para clínicas</Link>

      <PageHeader
        title={clinic.name}
        description={`${clinic.tradeName} • ${clinic.city}/${clinic.state} • ${clinic.cnpj}`}
        actions={(
          <>
            <button
              type="button"
              className="pc-button pc-button--danger"
              disabled={!hasPermission('clinics:write') || saving === 'status'}
              onClick={() => safeAction('status', () => toggleClinicStatus(platformUser, clinic.id))}
            >
              {saving === 'status' ? 'Processando...' : clinic.status === 'active' ? 'Bloquear clínica' : 'Liberar clínica'}
            </button>
            <button
              type="button"
              className="pc-button"
              disabled={!hasPermission('support:write') || saving === 'assist'}
              onClick={() => safeAction('assist', () => toggleAssistedAccess(platformUser, clinic.id))}
            >
              {saving === 'assist'
                ? 'Processando...'
                : clinic.assistedAccessEnabled
                  ? 'Desativar acesso assistido'
                  : 'Ativar acesso assistido'}
            </button>
          </>
        )}
      />

      {error ? <p className="pc-error">{error}</p> : null}

      <div className="pc-grid-3">
        <Panel title="Conta">
          <ul className="pc-info-list">
            <li><span>Status</span><StatusBadge status={clinic.status} /></li>
            <li><span>Plano atual</span><strong>{clinic.plan}</strong></li>
            <li><span>Saúde</span><StatusBadge status={clinic.health} /></li>
            <li><span>Acesso assistido</span><strong>{clinic.assistedAccessEnabled ? 'Ativo' : 'Inativo'}</strong></li>
          </ul>
        </Panel>

        <Panel title="Responsável">
          <ul className="pc-info-list">
            <li><span>Nome</span><strong>{clinic.ownerName}</strong></li>
            <li><span>Email</span><strong>{clinic.ownerEmail}</strong></li>
            <li><span>Cidade</span><strong>{clinic.city}/{clinic.state}</strong></li>
          </ul>
        </Panel>

        <Panel title="Assinatura">
          <ul className="pc-info-list">
            <li><span>Status</span><StatusBadge status={subscription?.status || '-'} /></li>
            <li><span>Valor</span><strong>{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(subscription?.amountCents || 0) / 100)}</strong></li>
            <li><span>Próxima cobrança</span><strong>{String(subscription?.nextBillingAt || '').slice(0, 10) || '-'}</strong></li>
          </ul>
          <div className="pc-inline-actions">
            {catalogs.plans.map((plan) => (
              <button
                key={plan}
                type="button"
                className={`pc-button ${plan === clinic.plan ? 'pc-button--active' : ''}`}
                disabled={!hasPermission('billing:write') || saving === `plan-${plan}`}
                onClick={() => safeAction(`plan-${plan}`, () => changeClinicPlan(platformUser, clinic.id, plan))}
              >
                {saving === `plan-${plan}` ? '...' : plan}
              </button>
            ))}
          </div>
        </Panel>
      </div>

      <div className="pc-grid-2">
        <Panel title="Módulos liberados" description="Controle por clínica para habilitar ou desabilitar funcionalidades">
          <div className="pc-chip-wrap">
            {catalogs.modules.map((moduleName) => {
              const enabled = clinic.modules.includes(moduleName);
              return (
                <button
                  key={moduleName}
                  type="button"
                  className={`pc-chip ${enabled ? 'pc-chip--on' : ''}`}
                  disabled={!hasPermission('clinics:write') || saving === `module-${moduleName}`}
                  onClick={() => safeAction(`module-${moduleName}`, () => toggleClinicModule(platformUser, clinic.id, moduleName))}
                >
                  {moduleName}
                </button>
              );
            })}
          </div>
        </Panel>

        <Panel title="Integrações conectadas">
          <div className="pc-table-wrap">
            <table className="pc-table">
              <thead>
                <tr>
                  <th>Integração</th>
                  <th>Status</th>
                  <th>Último sync</th>
                </tr>
              </thead>
              <tbody>
                {clinic.integrations.map((integration) => (
                  <tr key={integration.name}>
                    <td>{integration.name}</td>
                    <td><StatusBadge status={integration.status} /></td>
                    <td>{String(integration.lastSyncAt).replace('T', ' ').slice(0, 19)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>

      <div className="pc-grid-2">
        <Panel title="Histórico de cobrança">
          <div className="pc-table-wrap">
            <table className="pc-table">
              <thead>
                <tr>
                  <th>Evento</th>
                  <th>Status</th>
                  <th>Valor</th>
                  <th>Data</th>
                </tr>
              </thead>
              <tbody>
                {billingHistory.map((item) => (
                  <tr key={item.id}>
                    <td>{toFriendlyBillingEvent(item.type)}</td>
                    <td><StatusBadge status={item.status} /></td>
                    <td>{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.amountCents / 100)}</td>
                    <td>{String(item.createdAt).replace('T', ' ').slice(0, 19)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel title="Histórico de suporte">
          <div className="pc-table-wrap">
            <table className="pc-table">
              <thead>
                <tr>
                  <th>Ticket</th>
                  <th>Status</th>
                  <th>Prioridade</th>
                  <th>Atualizado em</th>
                </tr>
              </thead>
              <tbody>
                {supportHistory.map((item) => (
                  <tr key={item.id}>
                    <td>{item.subject}</td>
                    <td><StatusBadge status={item.status} /></td>
                    <td>{item.priority}</td>
                    <td>{String(item.updatedAt).replace('T', ' ').slice(0, 19)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>

      <Panel title="Últimos erros relacionados">
        <div className="pc-table-wrap">
          <table className="pc-table">
            <thead>
              <tr>
                <th>Componente</th>
                <th>Status</th>
                <th>Latência</th>
                <th>Data</th>
              </tr>
            </thead>
            <tbody>
              {recentErrors.map((item) => (
                <tr key={item.id}>
                  <td>{item.component}</td>
                  <td><StatusBadge status={item.status} /></td>
                  <td>{item.latencyMs} ms</td>
                  <td>{String(item.checkedAt).replace('T', ' ').slice(0, 19)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
