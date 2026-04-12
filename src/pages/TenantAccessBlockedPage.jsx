import { useMemo } from 'react';
import { useTenant } from '../tenant/useTenant.js';
import { useAuth } from '../auth/useAuth.js';

function resolveMessage(status) {
  if (status === 'blocked') {
    return 'A clínica está bloqueada na Platform Console. Entre em contato com o suporte para regularização.';
  }
  if (status === 'suspended') {
    return 'A clínica está suspensa temporariamente na Platform Console.';
  }
  if (status === 'inactive' || status === 'canceled') {
    return 'A clínica está inativa e não pode acessar o app principal no momento.';
  }
  return 'A clínica não está habilitada para uso neste momento.';
}

export default function TenantAccessBlockedPage() {
  const { tenant, tenantStatus, billingStatus } = useTenant();
  const { logout } = useAuth();

  const title = useMemo(() => {
    if (tenantStatus === 'blocked') return 'Clínica bloqueada';
    if (tenantStatus === 'suspended') return 'Clínica suspensa';
    return 'Acesso indisponível';
  }, [tenantStatus]);

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#0f172a', padding: '1.5rem' }}>
      <section style={{ width: '100%', maxWidth: 560, borderRadius: 16, border: '1px solid #334155', background: '#111827', padding: '1.5rem', color: '#e2e8f0' }}>
        <h1 style={{ margin: 0, fontSize: '1.5rem' }}>{title}</h1>
        <p style={{ marginTop: '0.75rem', color: '#94a3b8' }}>{resolveMessage(tenantStatus)}</p>
        <div style={{ marginTop: '1rem', padding: '0.75rem', borderRadius: 10, background: '#0b1220', border: '1px solid #1e293b' }}>
          <p style={{ margin: 0 }}><strong>Clínica:</strong> {tenant?.trade_name || tenant?.legal_name || '—'}</p>
          <p style={{ margin: '0.4rem 0 0' }}><strong>Status:</strong> {tenantStatus || 'desconhecido'}</p>
          <p style={{ margin: '0.4rem 0 0' }}><strong>Cobrança:</strong> {billingStatus || '—'}</p>
        </div>
        <div style={{ marginTop: '1rem', display: 'flex', gap: '0.75rem' }}>
          <button type="button" className="button secondary" onClick={() => window.location.reload()}>
            Tentar novamente
          </button>
          <button type="button" className="button" onClick={logout}>
            Sair
          </button>
        </div>
      </section>
    </div>
  );
}

