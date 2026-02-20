import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext.jsx';
import { usePlatformAuth } from './PlatformAuthContext.jsx';

export default function RequirePlatformAuth({ children }) {
  const { user: appUser } = useAuth();
  const { platformUser, loading } = usePlatformAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <p className="text-muted-foreground">Carregando...</p>
      </div>
    );
  }

  if (!platformUser) {
    if (appUser) {
      return <Navigate to="/" replace />;
    }
    return <Navigate to="/platform/login" state={{ from: location }} replace />;
  }

  return children;
}
