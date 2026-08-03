import { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { usePlatformAuth } from '../auth/usePlatformAuth.js';
import {
  changeClinicPlan,
  getClinicDetail,
  listCatalogs,
  toggleClinicModule,
  toggleClinicStatus,
} from '../services/platformConsoleService.js';
import { PageHeader, Panel, StatusBadge, EmptyState } from '../components/ConsoleUi.jsx';
import ConsoleMasterAccessPanel from '../components/ConsoleMasterAccessPanel.jsx';
import { formatCep, formatCnpj, formatCpf, formatPhone } from '../utils/validators.js';
import { formatPlanPrice, getPlanLabel } from '../services/platformConsoleConstants.js';

function toFriendlyBillingEvent(type) {
  const normalized = String(type || '').trim().toLowerCase();
  if (normalized === 'invoice.paid') return 'Fatura paga';
  if (normalized === 'invoice.overdue') return 'Fatura em atraso';
  return type || '—';
}

function formatLatency(ms) {
  if (ms == null || Number.isNaN(Number(ms))) return '—';
  return `${ms} ms`;
}

export default function ConsoleTenantDetailPage() {
  const { id } = useParams();
  const { platformUser, hasPermission } = usePlatformAuth();
  const [reloadKey, setReloadKey] = useState(0);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState('');
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const catalogs = useMemo(() => listCatalogs(), []);
  const normalizedRole = String(platformUser?.role || platformUser?.role_slug || '')
    .trim()
    .toLowerCase()
    .replace(/-/g, '_');
  const canManageMasterAccess = ['owner', 'super_admin'].includes(normalizedRole)
    || hasPermission('clinics:write');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setLoadError('');
        const data = await getClinicDetail(id);
        if (!cancelled) {
          setDetail(data);
          if (!data) setLoadError('');
        }
      } catch (e) {
        if (!cancelled) setLoadError(e?.message || 'Erro ao carregar clínica.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, reloadKey]);

  useLayoutEffect(() => {
    if (loading || !detail) return;
    if (window.location.hash !== '#acesso-master') return;
    window.requestAnimationFrame(() => {
      document.getElementById('acesso-master')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }, [loading, detail, id]);

  if (loading) {
    return (
      <div className="pc-stack">
        <Link to="/tenants" className="pc-link-button">Voltar para clínicas</Link>
        <p className="pc-loading-inline">Carregando detalhes…</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="pc-stack">
        <Link to="/tenants" className="pc-link-button">Voltar para clínicas</Link>
        <EmptyState title="Erro ao carregar" description={loadError} />
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="pc-stack">
        <Link to="/tenants" className="pc-link-button">Voltar para clínicas</Link>
        <Panel title="Clínica não encontrada">
          <p>Não existe registro com este id em tenants.</p>
        </Panel>
      </div>
    );
  }

  const { clinic, subscription, billingHistory, supportHistory, recentErrors, legalProfile, masterAccess } = detail;

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
        description={`${clinic.tradeName} • ${clinic.city}/${clinic.state} • ${clinic.cnpj || '—'}`}
        actions={(
          <button
            type="button"
            className="pc-button pc-button--danger"
            disabled={!hasPermission('clinics:write') || saving === 'status'}
            onClick={() => safeAction('status', () => toggleClinicStatus(platformUser, clinic.id))}
          >
            {saving === 'status' ? 'Processando...' : clinic.status === 'active' ? 'Bloquear clínica' : 'Liberar clínica'}
          </button>
        )}
      />

      {error ? <p className="pc-error">{error}</p> : null}

      <ConsoleMasterAccessPanel
        clinic={clinic}
        legalProfile={legalProfile}
        masterAccess={masterAccess}
        platformUser={platformUser}
        canManage={canManageMasterAccess}
        onResent={() => setReloadKey((k) => k + 1)}
      />

      <div className="pc-grid-3">
        <Panel title="Conta">
          <ul className="pc-info-list">
            <li><span>Status</span><StatusBadge status={clinic.status} /></li>
            <li><span>Plano atual</span><strong>{getPlanLabel(clinic.plan)}</strong></li>
            <li><span>Situação da cobrança</span><StatusBadge status={clinic.billingStatus} /></li>
          </ul>
        </Panel>

        <Panel title="Responsável">
          <ul className="pc-info-list">
            <li><span>Nome</span><strong>{clinic.ownerName || '—'}</strong></li>
            <li><span>Email</span><strong>{clinic.ownerEmail || '—'}</strong></li>
            <li><span>CNPJ</span><strong>{clinic.cnpj ? formatCnpj(clinic.cnpj) : '—'}</strong></li>
            <li><span>Telefone</span><strong>{clinic.phone ? formatPhone(clinic.phone) : '—'}</strong></li>
          </ul>
          <div className="pc-inline-actions" style={{ marginTop: '0.75rem' }}>
            <a className="pc-link-button" href="#acesso-master">Acesso master / reenviar e-mail</a>
          </div>
        </Panel>

        <Panel title="Assinatura">
          {!subscription ? (
            <EmptyState
              title="Sem assinatura no banco"
              description="Não há linha em tenant_subscriptions para esta clínica. Crie uma assinatura no Supabase ou pelo fluxo de billing."
            />
          ) : (
            <>
              <ul className="pc-info-list">
                <li><span>Status</span><StatusBadge status={subscription.status} /></li>
                <li><span>Valor</span><strong>{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(subscription.amountCents || 0) / 100)}</strong></li>
                <li><span>Próxima cobrança</span><strong>{subscription.nextBillingAt ? String(subscription.nextBillingAt).slice(0, 10) : '—'}</strong></li>
              </ul>
              <div className="pc-inline-actions">
                {catalogs.plans.map((planCode) => (
                  <button
                    key={planCode}
                    type="button"
                    className={`pc-button ${planCode === clinic.plan ? 'pc-button--active' : ''}`}
                    disabled={!hasPermission('billing:write') || saving === `plan-${planCode}`}
                    onClick={() => safeAction(`plan-${planCode}`, () => changeClinicPlan(platformUser, clinic.id, planCode))}
                    title={formatPlanPrice(planCode)}
                  >
                    {saving === `plan-${planCode}` ? '...' : getPlanLabel(planCode)}
                  </button>
                ))}
              </div>
            </>
          )}
        </Panel>
      </div>

      <div className="pc-grid-2">
        <Panel title="Endereço fiscal" description="Base para cobrança, contrato e comunicações formais">
          <ul className="pc-info-list">
            <li><span>CEP</span><strong>{clinic.zipCode ? formatCep(clinic.zipCode) : '—'}</strong></li>
            <li><span>Logradouro</span><strong>{clinic.street ? `${clinic.street}, ${clinic.streetNumber || 'S/N'}` : '—'}</strong></li>
            <li><span>Complemento</span><strong>{clinic.addressComplement || '—'}</strong></li>
            <li><span>Bairro</span><strong>{clinic.neighborhood || '—'}</strong></li>
            <li><span>Cidade/UF</span><strong>{clinic.city || '—'}/{clinic.state || '—'}</strong></li>
          </ul>
        </Panel>

        <Panel title="Responsabilidade legal" description="Vínculo registrado para inadimplência e compliance">
          {!legalProfile ? (
            <EmptyState
              title="Perfil legal não cadastrado"
              description="Clínicas provisionadas antes da nova política não possuem tenant_legal_profiles."
            />
          ) : (
            <ul className="pc-info-list">
              <li><span>Representante</span><strong>{legalProfile.legalRepresentativeName}</strong></li>
              <li><span>CPF</span><strong>{formatCpf(legalProfile.legalRepresentativeCpf)}</strong></li>
              <li><span>E-mail</span><strong>{legalProfile.legalRepresentativeEmail}</strong></li>
              <li><span>Telefone</span><strong>{legalProfile.legalRepresentativePhone ? formatPhone(legalProfile.legalRepresentativePhone) : '—'}</strong></li>
              <li><span>Cobrança</span><strong>{legalProfile.billingContactName} · {legalProfile.billingContactEmail}</strong></li>
              <li><span>Termos aceitos</span><strong>{legalProfile.liabilityStatus === 'accepted' ? `${legalProfile.liabilityTermsVersion} · ${legalProfile.liabilityAcceptedAt ? String(legalProfile.liabilityAcceptedAt).replace('T', ' ').slice(0, 19) : '—'}` : 'Pendente — aguardando aceite por e-mail'}</strong></li>
              {legalProfile.onboardingEmailSentAt ? (
                <li><span>E-mail enviado</span><strong>{String(legalProfile.onboardingEmailSentAt).replace('T', ' ').slice(0, 19)}</strong></li>
              ) : (
                <li><span>E-mail enviado</span><strong>Pendente</strong></li>
              )}
            </ul>
          )}
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
          {clinic.integrations.length === 0 ? (
            <EmptyState
              title="Nenhuma integração cadastrada"
              description="Registros em tenant_integrations aparecerão aqui quando existirem."
            />
          ) : (
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
                      <td>{integration.lastSyncAt ? String(integration.lastSyncAt).replace('T', ' ').slice(0, 19) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>

      <div className="pc-grid-2">
        <Panel title="Histórico de cobrança">
          {billingHistory.length === 0 ? (
            <EmptyState title="Nenhuma cobrança encontrada" description="Sem eventos em tenant_billing_events para esta clínica." />
          ) : (
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
                      <td>{item.createdAt ? String(item.createdAt).replace('T', ' ').slice(0, 19) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <Panel title="Histórico de suporte">
          {supportHistory.length === 0 ? (
            <EmptyState title="Nenhum ticket de suporte" description="Não há registros em support_tickets para esta clínica." />
          ) : (
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
                      <td>{item.updatedAt ? String(item.updatedAt).replace('T', ' ').slice(0, 19) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>

      <Panel title="Alertas de infraestrutura (plataforma)" description="Últimos checks com status diferente de healthy em system_health_checks (não filtrados por clínica).">
        {recentErrors.length === 0 ? (
          <EmptyState title="Nenhum alerta ativo" description="Todos os checks recentes estão healthy ou ainda não há registros." />
        ) : (
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
                    <td>{formatLatency(item.latencyMs)}</td>
                    <td>{item.checkedAt ? String(item.checkedAt).replace('T', ' ').slice(0, 19) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
