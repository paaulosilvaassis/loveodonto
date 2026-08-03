import { useAuth } from '../auth/useAuth.js';
import { NO_TENANT_MESSAGE } from '../services/tenantIsolation.js';

export default function TenantNoMembershipPage() {
  const { logoutWithReason } = useAuth();

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        padding: '1.5rem',
        textAlign: 'center',
        color: '#94a3b8',
      }}
    >
      <div style={{ maxWidth: '28rem' }}>
        <h1 style={{ margin: '0 0 0.75rem', fontSize: '1.125rem', color: '#e2e8f0' }}>
          Acesso não autorizado
        </h1>
        <p style={{ margin: '0 0 1rem', lineHeight: 1.5 }}>{NO_TENANT_MESSAGE}</p>
        <button
          type="button"
          className="button primary"
          onClick={() => {
            logoutWithReason(NO_TENANT_MESSAGE);
            window.location.assign('/login');
          }}
        >
          Voltar ao login
        </button>
      </div>
    </div>
  );
}
