import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from './AuthContext.jsx';

/**
 * Protege rotas administrativas: exige usuário autenticado + role admin + cookie admin_gate (PIN).
 * adminGateService é carregado dinamicamente para não bloquear o bootstrap do App.
 */
export default function RequireAdminGate({ children }) {
  const { user } = useAuth();
  const [hasToken, setHasToken] = useState(null);

  useEffect(() => {
    import('../services/adminGateService.js').then((mod) => {
      setHasToken(mod.isGateTokenValid());
    }).catch(() => setHasToken(false));
  }, []);
  const role = (user?.role || '').toLowerCase();
  const isAdmin = ['admin', 'master', 'gerente'].includes(role) || user?.isMaster === true;

  if (import.meta.env?.DEV) {
    console.debug('[RequireAdminGate]', { hasUser: !!user, role, isAdmin, hasToken, path: typeof window !== 'undefined' ? window.location.pathname : '' });
  }

  if (!user) {
    return <Navigate to="/login" state={{ adminBlocked: true }} replace />;
  }

  if (!isAdmin) {
    return <Navigate to="/gestao/dashboard" replace />;
  }

  if (hasToken === null) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '40vh', color: 'var(--text-secondary, #64748b)' }}>
        Verificando acesso administrativo…
      </div>
    );
  }

  if (!hasToken) {
    return <Navigate to="/login" state={{ adminBlocked: true }} replace />;
  }

  return children;
}
