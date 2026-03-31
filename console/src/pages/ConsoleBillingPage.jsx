import { useMemo } from 'react';
import { listBillingEvents } from '../services/platformConsoleService.js';
import { PageHeader, Panel, StatusBadge } from '../components/ConsoleUi.jsx';

export default function ConsoleBillingPage() {
  const rows = useMemo(() => listBillingEvents(), []);
  return (
    <div className="pc-stack">
      <PageHeader title="Cobranças" description="Faturas, eventos financeiros e inadimplência por clínica." />
      <Panel>
        <div className="pc-table-wrap">
          <table className="pc-table">
            <thead>
              <tr>
                <th>Clínica</th>
                <th>Evento</th>
                <th>Status</th>
                <th>Valor</th>
                <th>Vencimento</th>
                <th>Criado em</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((item) => (
                <tr key={item.id}>
                  <td>{item.clinicName}</td>
                  <td>{item.type}</td>
                  <td><StatusBadge status={item.status} /></td>
                  <td>{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.amountCents / 100)}</td>
                  <td>{String(item.dueAt).slice(0, 10)}</td>
                  <td>{String(item.createdAt).replace('T', ' ').slice(0, 19)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
