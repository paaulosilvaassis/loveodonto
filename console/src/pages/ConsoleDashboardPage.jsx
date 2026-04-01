import { useEffect, useState } from 'react';
import { getPlatformDashboardSnapshot } from '../services/platformConsoleService.js';
import { KpiGrid, PageHeader, Panel, StatusBadge, EmptyState } from '../components/ConsoleUi.jsx';

function toFriendlyTargetType(targetType) {
  const normalized = String(targetType || '').trim().toLowerCase();
  if (normalized === 'tenant') return 'Clínica';
  if (normalized === 'tenant_module') return 'Módulo da clínica';
  if (normalized === 'tenant_subscription') return 'Assinatura da clínica';
  if (normalized === 'feature_flag') return 'Funcionalidade';
  return targetType || '—';
}

function formatLatency(ms) {
  if (ms == null || Number.isNaN(Number(ms))) return '—';
  return `${ms} ms`;
}

export default function ConsoleDashboardPage() {
  const [snapshot, setSnapshot] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const data = await getPlatformDashboardSnapshot();
        if (!cancelled) setSnapshot(data);
      } catch (e) {
        if (!cancelled) setError(e?.message || 'Não foi possível carregar o dashboard.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="pc-stack">
        <PageHeader title="Dashboard da Plataforma" description="Visão executiva de clínicas, receita, suporte e saúde operacional do SaaS." />
        <p className="pc-loading-inline">Carregando dados…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="pc-stack">
        <PageHeader title="Dashboard da Plataforma" description="Visão executiva de clínicas, receita, suporte e saúde operacional do SaaS." />
        <EmptyState title="Erro ao carregar" description={error} />
      </div>
    );
  }

  const openTickets = snapshot.openTicketsCount ?? 0;

  return (
    <div className="pc-stack">
      <PageHeader
        title="Dashboard da Plataforma"
        description="Visão executiva de clínicas, receita, suporte e saúde operacional do SaaS."
      />

      {!snapshot.hasTenants ? (
        <EmptyState
          title="Nenhuma clínica cadastrada ainda"
          description="Cadastre a primeira clínica em Clínicas ou aguarde a sincronização do banco. Os indicadores abaixo refletem apenas dados reais do Supabase."
        />
      ) : null}

      {snapshot.hasTenants && openTickets === 0 ? (
        <p className="pc-loading-inline" style={{ marginTop: 0 }}>Nenhum ticket em aberto no momento.</p>
      ) : null}

      <KpiGrid items={snapshot.cards} />

      <div className="pc-grid-2">
        <Panel title="Saúde do sistema" description="Status de componentes críticos e conectividade">
          {snapshot.healthChecks.length === 0 ? (
            <EmptyState
              title="Sem checagens registradas"
              description="Quando o worker gravar linhas em system_health_checks, elas aparecerão aqui."
            />
          ) : (
            <div className="pc-table-wrap">
              <table className="pc-table">
                <thead>
                  <tr>
                    <th>Componente</th>
                    <th>Status</th>
                    <th>Latência</th>
                    <th>Última checagem</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshot.healthChecks.map((item) => (
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

        <Panel title="Inadimplência" description="Faturas vencidas e risco financeiro por clínica">
          {snapshot.overdueEvents.length === 0 ? (
            <EmptyState title="Nenhuma cobrança em atraso" description="Não há eventos com status overdue em tenant_billing_events." />
          ) : (
            <div className="pc-table-wrap">
              <table className="pc-table">
                <thead>
                  <tr>
                    <th>Clínica</th>
                    <th>Status</th>
                    <th>Valor</th>
                    <th>Vencimento</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshot.overdueEvents.map((item) => (
                    <tr key={item.id}>
                      <td>{item.clinicName}</td>
                      <td><StatusBadge status={item.status} /></td>
                      <td>{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.amountCents / 100)}</td>
                      <td>{item.dueAt ? String(item.dueAt).slice(0, 10) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>

      <Panel title="Auditoria recente" description="Ações administrativas sensíveis registradas">
        {snapshot.recentAudits.length === 0 ? (
          <EmptyState title="Nenhum evento de auditoria" description="Ainda não há registros em audit_logs ou você não tem permissão para visualizá-los." />
        ) : (
          <div className="pc-table-wrap">
            <table className="pc-table">
              <thead>
                <tr>
                  <th>Data/Hora</th>
                  <th>Ator</th>
                  <th>Ação</th>
                  <th>Alvo</th>
                  <th>Detalhes</th>
                </tr>
              </thead>
              <tbody>
                {snapshot.recentAudits.map((log) => (
                  <tr key={log.id}>
                    <td>{log.createdAt ? String(log.createdAt).replace('T', ' ').slice(0, 19) : '—'}</td>
                    <td>{log.actor}</td>
                    <td>{log.action}</td>
                    <td>{toFriendlyTargetType(log.targetType)}: {log.targetId}</td>
                    <td>{log.metadata}</td>
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
