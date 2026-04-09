import TenantAccessBlockedPage from '../pages/TenantAccessBlockedPage.jsx';
import { useTenant } from '../tenant/useTenant.js';

export default function RequireTenantAccess({ children }) {
  const { loading, error, isTenantBlocked } = useTenant();

  if (loading) return null;

  if (error) {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', color: '#94a3b8' }}>
        Falha ao validar acesso da clínica: {error}
      </div>
    );
  }

  if (isTenantBlocked) {
    return <TenantAccessBlockedPage />;
  }

  return children;
}

