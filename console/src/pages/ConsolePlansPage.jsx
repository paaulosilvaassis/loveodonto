import { useMemo } from 'react';
import { listSubscriptions } from '../services/platformConsoleService.js';
import { PageHeader, Panel, StatusBadge } from '../components/ConsoleUi.jsx';

export default function ConsolePlansPage() {
  const rows = useMemo(() => listSubscriptions(), []);
  return (
    <div className="pc-stack">
      <PageHeader title="Assinaturas" description="Gestão de planos ativos, ciclo e próximas renovações." />
      <Panel>
        <div className="pc-table-wrap">
          <table className="pc-table">
            <thead>
              <tr>
                <th>Clínica</th>
                <th>Plano</th>
                <th>Status</th>
                <th>Ciclo</th>
                <th>Valor</th>
                <th>Próxima cobrança</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((item) => (
                <tr key={item.id}>
                  <td>{item.clinicName}</td>
                  <td>{item.plan}</td>
                  <td><StatusBadge status={item.status} /></td>
                  <td>{item.cycle}</td>
                  <td>{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.amountCents / 100)}</td>
                  <td>{String(item.nextBillingAt).slice(0, 10)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
