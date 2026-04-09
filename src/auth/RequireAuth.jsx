import { Navigate } from 'react-router-dom';
import { useAuth } from './AuthContext.jsx';

export const RequireAuth = ({ children }) => {
  const { user } = useAuth();
  if (user === undefined) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', color: 'var(--text-secondary, #94a3b8)' }}>
        Carregando…
      </div>
    );
  }
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  return children;
};
