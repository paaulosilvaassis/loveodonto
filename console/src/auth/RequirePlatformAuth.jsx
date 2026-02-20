import { Navigate, useLocation } from 'react-router-dom';
import { usePlatformAuth } from './PlatformAuthContext.jsx';

export default function RequirePlatformAuth({ children }) {
  const { platformUser, loading } = usePlatformAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <p className="text-slate-400">Carregando...</p>
      </div>
    );
  }

  if (!platformUser) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
}
