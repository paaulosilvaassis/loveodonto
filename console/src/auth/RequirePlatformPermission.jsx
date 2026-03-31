import { Navigate } from 'react-router-dom';
import { usePlatformAuth } from './PlatformAuthContext.jsx';

export default function RequirePlatformPermission({ permission, children }) {
  const { hasPermission } = usePlatformAuth();
  if (!hasPermission(permission)) {
    return <Navigate to="/dashboard" replace />;
  }
  return children;
}
