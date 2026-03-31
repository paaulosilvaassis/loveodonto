import { Navigate } from 'react-router-dom';
import { useTenant } from '../tenant/useTenant.js';

export default function RequireModule({ moduleName, children }) {
  const { hasModule, loading } = useTenant();

  if (!moduleName) return children;
  if (loading) return null;
  if (!hasModule(moduleName)) {
    return <Navigate to="/gestao/dashboard" replace />;
  }
  return children;
}
