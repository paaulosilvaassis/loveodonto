import { Navigate } from 'react-router-dom';
import { useAuth } from './AuthContext.jsx';

const isAllowed = (role, allowedRoles) => {
  if (!allowedRoles || allowedRoles.length === 0) return true;
  if (allowedRoles.includes('*')) return true;
  if (role === 'admin' || role === 'master' || role === 'gerente') return true;
  return allowedRoles.includes(role);
};

export default function RequireRole({ allowedRoles, children }) {
  const { user } = useAuth();
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  const allowed = isAllowed(user.role, allowedRoles);
  if (!allowed) {
    return <Navigate to="/gestao/dashboard" replace />;
  }
  return children;
}
