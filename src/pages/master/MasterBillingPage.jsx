import { useMemo } from 'react';
import { Section } from '../../components/Section.jsx';
import { listInvoices, getOverdueInvoices } from '../../services/invoiceService.js';
import { getTenant } from '../../services/tenantService.js';

export default function MasterBillingPage() {
  const invoices = useMemo(() => listInvoices(), []);
  const overdue = useMemo(() => getOverdueInvoices(), []);

  return (
    <div className="stack">
      <Section title="Cobrança">
        {overdue.length > 0 && <div className="error" style={{ marginBottom: '1rem' }}>Faturas em atraso: {overdue.length}</div>}
        <div className="card">
          <table className="access-list-table">
            <thead><tr><th>Clínica</th><th>Valor</th><th>Vencimento</th><th>Status</th></tr></thead>
            <tbody>
              {invoices.map((i) => (
                <tr key={i.id}><td>{getTenant(i.tenant_id)?.name || i.tenant_id}</td><td>R$ {((i.amount || 0) / 100).toFixed(2)}</td><td>{i.due_date || '-'}</td><td>{i.status}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}
