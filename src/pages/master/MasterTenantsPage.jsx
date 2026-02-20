import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Section } from '../../components/Section.jsx';
import { listTenants } from '../../services/tenantService.js';
import { getPlan } from '../../services/planService.js';
import { listMembers } from '../../services/membershipService.js';

export default function MasterTenantsPage() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState({ status: '' });
  const tenants = useMemo(() => listTenants(filter), [filter.status]);

  const getPlanName = (planId) => (planId ? (getPlan(planId)?.name || planId) : '-');
  const getMemberCount = (id) => listMembers(id).length;

  return (
    <div className="stack">
      <Section title="Clínicas">
        <select value={filter.status} onChange={(e) => setFilter({ status: e.target.value })} style={{ marginBottom: '1rem' }}>
          <option value="">Todos</option>
          <option value="active">Ativas</option>
          <option value="suspended">Suspensas</option>
        </select>
        <div className="card">
          <table className="access-list-table">
            <thead><tr><th>Nome</th><th>Status</th><th>Plano</th><th>Usuários</th><th></th></tr></thead>
            <tbody>
              {tenants.map((t) => (
                <tr key={t.id}>
                  <td><strong>{t.name || '-'}</strong></td>
                  <td>{t.status || 'active'}</td>
                  <td>{getPlanName(t.plan_id)}</td>
                  <td>{getMemberCount(t.id)}</td>
                  <td><button type="button" className="button link small" onClick={() => navigate('/master/tenants/' + t.id)}>Ver</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}
