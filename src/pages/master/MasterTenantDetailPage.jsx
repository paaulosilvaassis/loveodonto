import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Section } from '../../components/Section.jsx';
import { Tabs } from '../../components/Tabs.jsx';
import { getTenant } from '../../services/tenantService.js';
import { listMembers } from '../../services/membershipService.js';
import { getSubscriptionByTenant } from '../../services/subscriptionService.js';
import { listInvoices } from '../../services/invoiceService.js';
import { getUsageByTenant } from '../../services/usageService.js';
import { updateTenantFromMaster } from '../../services/tenantService.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { MEMBERSHIP_ROLE_LABELS } from '../../constants/tenantRoles.js';

const tabItems = [
  { value: 'overview', label: 'Visão geral' },
  { value: 'users', label: 'Usuários' },
  { value: 'billing', label: 'Plano e cobrança' },
  { value: 'usage', label: 'Uso' },
];

export default function MasterTenantDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [tenant, setTenant] = useState(null);
  const [tab, setTab] = useState('overview');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    const t = getTenant(id);
    setTenant(t || null);
  }, [id]);

  const members = tenant ? listMembers(tenant.id) : [];
  const subscription = tenant ? getSubscriptionByTenant(tenant.id) : null;
  const invoices = tenant ? listInvoices({ tenant_id: tenant.id }) : [];
  const usage = tenant ? getUsageByTenant(tenant.id) : {};

  const handleSuspend = () => {
    if (!tenant || !window.confirm(`Suspender a clínica "${tenant.name}"?`)) return;
    setError('');
    try {
      updateTenantFromMaster(user, tenant.id, { status: 'suspended' });
      setTenant((prev) => (prev ? { ...prev, status: 'suspended' } : null));
      setSuccess('Clínica suspensa.');
    } catch (err) {
      setError(err?.message || 'Erro.');
    }
  };

  const handleActivate = () => {
    if (!tenant || !window.confirm(`Ativar a clínica "${tenant.name}"?`)) return;
    setError('');
    try {
      updateTenantFromMaster(user, tenant.id, { status: 'active' });
      setTenant((prev) => (prev ? { ...prev, status: 'active' } : null));
      setSuccess('Clínica ativada.');
    } catch (err) {
      setError(err?.message || 'Erro.');
    }
  };

  if (!tenant) {
    return (
      <div className="stack" style={{ padding: '2rem' }}>
        <p className="muted">Clínica não encontrada.</p>
        <button type="button" className="button secondary" onClick={() => navigate('/master/tenants')}>Voltar</button>
      </div>
    );
  }

  return (
    <div className="stack">
      <Section title={tenant.name || 'Clínica'} description={`ID: ${tenant.id}`}>
        {error && <div className="error">{error}</div>}
        {success && <div className="success">{success}</div>}
        <div className="flex gap-sm" style={{ marginBottom: '1rem' }}>
          <span className={`access-badge ${tenant.status === 'active' ? 'on' : tenant.status === 'suspended' ? 'off' : ''}`}>{tenant.status || 'active'}</span>
          {tenant.status === 'suspended' ? (
            <button type="button" className="button primary small" onClick={handleActivate}>Ativar</button>
          ) : (
            <button type="button" className="button secondary small" onClick={handleSuspend}>Suspender</button>
          )}
        </div>
        <Tabs tabs={tabItems} active={tab} onChange={setTab} />
        {tab === 'overview' && (
          <div className="stack">
            <p><strong>Status:</strong> {tenant.status || 'active'}</p>
            <p><strong>Plano:</strong> {subscription?.plan_id || '—'}</p>
            <p><strong>Usuários:</strong> {members.length}</p>
          </div>
        )}
        {tab === 'users' && (
          <div className="card">
            <table className="access-list-table">
              <thead><tr><th>Nome</th><th>E-mail</th><th>Perfil</th></tr></thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.id}><td>{m.name}</td><td>{m.email}</td><td>{MEMBERSHIP_ROLE_LABELS[m.role] || m.role}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {tab === 'billing' && (
          <div className="stack">
            <p><strong>Assinatura:</strong> {subscription ? `${subscription.status} até ${subscription.current_period_end?.slice(0, 10)}` : '—'}</p>
            <h4>Faturas</h4>
            <ul>
              {invoices.length === 0 ? <li className="muted">Nenhuma fatura.</li> : invoices.map((i) => (
                <li key={i.id}>{i.due_date} — R$ {((i.amount || 0) / 100).toFixed(2)} — {i.status}</li>
              ))}
            </ul>
          </div>
        )}
        {tab === 'usage' && (
          <div className="stack">
            <p className="muted">Uso nos últimos 30 dias</p>
            <ul>
              {Object.keys(usage).length === 0 ? <li className="muted">Nenhum evento.</li> : Object.entries(usage).map(([k, v]) => (
                <li key={k}>{k}: {v}</li>
              ))}
            </ul>
          </div>
        )}
      </Section>
    </div>
  );
}
