import TenantAccessBlockedPage from '../pages/TenantAccessBlockedPage.jsx';
import { useTenant } from '../tenant/useTenant.js';
import { useAuth } from './useAuth.js';

export default function RequireTenantAccess({ children }) {
  const { loading, error, isTenantBlocked, refreshTenantContext } = useTenant();
  const { logout } = useAuth();

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', color: '#94a3b8' }}>
        Carregando dados da clínica…
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', color: '#94a3b8', textAlign: 'center', padding: '1.5rem' }}>
        <div style={{ maxWidth: '28rem' }}>
          <p style={{ margin: '0 0 0.75rem' }}>Falha ao validar acesso da clínica:</p>
          <p style={{ margin: '0 0 1rem', fontSize: '0.85rem', color: '#ef4444' }}>{error}</p>
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
            <button
              type="button"
              className="button primary"
              onClick={() => refreshTenantContext(false)}
            >
              Tentar novamente
            </button>
            <button
              type="button"
              className="button"
              style={{ opacity: 0.7 }}
              onClick={() => { logout(); window.location.assign('/login'); }}
            >
              Ir para Login
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (isTenantBlocked) {
    return <TenantAccessBlockedPage />;
  }

  return children;
}

