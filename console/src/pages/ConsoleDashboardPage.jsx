import { useMemo } from 'react';
import { getPlatformDashboardSnapshot } from '../services/platformConsoleService.js';
import { KpiGrid, PageHeader, Panel, StatusBadge } from '../components/ConsoleUi.jsx';

function toFriendlyTargetType(targetType) {
  const normalized = String(targetType || '').trim().toLowerCase();
  if (normalized === 'tenant') return 'Clínica';
  if (normalized === 'tenant_module') return 'Módulo da clínica';
  if (normalized === 'tenant_subscription') return 'Assinatura da clínica';
  if (normalized === 'feature_flag') return 'Funcionalidade';
  return targetType || '—';
}

export default function ConsoleDashboardPage() {
  const snapshot = useMemo(() => getPlatformDashboardSnapshot(), []);
  return (
    <div className="pc-stack">
      <PageHeader
        title="Dashboard da Plataforma"
        description="Visão executiva de clínicas, receita, suporte e saúde operacional do SaaS."
      />
      <KpiGrid items={snapshot.cards} />

      <div className="pc-grid-2">
        <Panel title="Saúde do sistema" description="Status de componentes críticos e conectividade">
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
                    <td>{item.latencyMs} ms</td>
                    <td>{String(item.checkedAt).replace('T', ' ').slice(0, 19)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel title="Inadimplência" description="Faturas vencidas e risco financeiro por clínica">
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
                    <td>{String(item.dueAt).slice(0, 10)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>

      <Panel title="Auditoria recente" description="Ações administrativas sensíveis registradas">
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
                  <td>{String(log.createdAt).replace('T', ' ').slice(0, 19)}</td>
                  <td>{log.actor}</td>
                  <td>{log.action}</td>
                  <td>{toFriendlyTargetType(log.targetType)}: {log.targetId}</td>
                  <td>{log.metadata}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
