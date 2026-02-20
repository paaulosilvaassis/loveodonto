import { Navigate } from 'react-router-dom';
import { useAuth } from './AuthContext.jsx';

/**
 * Protege rotas administrativas: exige usuário autenticado + role admin.
 * Sem PIN ou etapa extra.
 */
export default function RequireAdminGate({ children }) {
  const { user } = useAuth();
  const role = (user?.role || '').toLowerCase();
  const isAdmin = ['admin', 'master', 'gerente'].includes(role) || user?.isMaster === true;

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (!isAdmin) {
    return <Navigate to="/gestao/dashboard" replace />;
  }

  return children;
}
